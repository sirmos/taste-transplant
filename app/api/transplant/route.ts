import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 60;
const MAX_PLACES = 8; // most places we use from one list

// ---------- small helpers (nothing here is specific to one city or one kind of place) ----------
const COMMON = new Set(["the", "and", "bar", "cafe", "coffee", "restaurant", "hotel", "hotels", "resort", "beach", "park", "market", "club", "lounge", "grill", "house", "shop", "store", "pub", "suite", "suites", "suits", "office", "offices", "global", "ltd", "limited", "plc", "company", "co", "services", "service", "group", "international", "nigeria", "enterprise", "enterprises"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !COMMON.has(w));
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const listOf = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const tagId = (t: any) => String(t?.id ?? t?.tag_id ?? t?.tag_value ?? "");
const countryOf = (e: any) => String(e?.properties?.geocode?.country ?? "").toLowerCase();
const inCity = (e: any, city: string) => `${e?.properties?.geocode?.city ?? ""} ${e?.properties?.address ?? ""}`.toLowerCase().includes(city.toLowerCase());
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uniq = (list: any[]) => list.filter((e, i) => list.findIndex((x) => x.entity_id === e.entity_id) === i);
const UA = { "User-Agent": "TasteTransplant/1.0 (hackathon demo)" };
type Params = Record<string, string | number | boolean | undefined>;

// Edit distance, so a small typo ("Evaangelical") still matches.
function lev(a: string, b: string) {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}
const close = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= (a.length >= 9 ? 2 : 1));

// Does a name found in Qloo look like what the person typed? Every distinctive word must be there
// (for long names, three quarters of them). One shared word like "Global" or "Office" is not enough.
function similar(typed: string, found: string) {
  const a = words(typed);
  if (a.length === 0) return true;
  if (compact(found).includes(a.join(""))) return true; // "DeChoice" matches "De Choice"
  const t = words(found);
  const need = a.length <= 3 ? a.length : Math.ceil(a.length * 0.75);
  return a.filter((w) => t.some((x) => close(w, x))).length >= need;
}

// "First Bank - Uyo CBD Branch" becomes "First Bank". Branch words and the place's own location names
// (its city, state and so on) are removed, so "NYSC Orientation Camp Akwa Ibom State" becomes "NYSC Orientation Camp".
function brandOf(name: string, places: string[]) {
  let out = name.split(/\s[-–|]\s|,|\(/)[0];
  for (const w of places) {
    const clean = w.replace(/[^\w ]/g, "").trim();
    if (clean.length >= 3) out = out.replace(new RegExp(`\\b${clean}\\b`, "ig"), "");
  }
  return out.replace(/\b(branch|head office)\b/gi, "").replace(/\bstate\s*$/i, "").replace(/\s+/g, " ").trim();
}
const sameBrand = (brand: string, name: string) => {
  const a = words(brand);
  if (a.length === 0) return false;
  const first = name.split(/\s[-–|]\s|,|\(/)[0]; // the part before the branch or street
  const t = first.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !COMMON.has(w) && !["of", "de", "la", "le", "el", "at", "in", "on"].includes(w));
  const hasAll = a.every((w) => t.some((x) => close(w, x))) || compact(first).includes(a.join(""));
  const extra = t.filter((x) => !a.some((w) => close(w, x))).length;
  return hasAll && extra <= 1;
};

// ---------- calling Qloo politely ----------
// Qloo blocks bursts (error 429), so calls start at least 180 ms apart, and a busy answer is retried after a wait.
let chain: Promise<void> = Promise.resolve();
const spaced = () => {
  const p = chain.then(() => sleep(180));
  chain = p;
  return p;
};
async function q(path: string, params: Params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await spaced();
    try {
      return await qloo(path, params);
    } catch (e) {
      const msg = (e as Error).message;
      console.log("QLOO FAILED", path, "|", msg.slice(0, 140));
      if (/QLOO_API_KEY is missing|Qloo 40[13]/.test(msg)) throw e; // key problem: stop and tell the user
      if (/Qloo 429/.test(msg)) {
        await sleep(1000 * (attempt + 1)); // busy: wait longer, then try again
        continue;
      }
      return undefined; // bad request or no data: retrying will not help
    }
  }
  return undefined;
}
const lookup = async (query: string, take = 6, extra: Params = {}) => listOf(await q("/search", { query, types: "urn:entity:place", take, ...extra }));
// Only search within some miles of a point. This works for a city, a town, or a whole state.
const around = (lat: number, lon: number, miles: number): Params => ({ "filter.location": `${lat},${lon}`, "filter.radius": miles });

// Run a few things at a time, not all at once.
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

// ---------- the new city: a photo, its coordinates, and a way to filter places to it ----------
async function wikiPage(extra: string) {
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&redirects=1&prop=pageimages|coordinates&piprop=thumbnail&pithumbsize=1000&colimit=1&format=json&${extra}`, { headers: UA, signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return Object.values(j?.query?.pages ?? {})[0] as any;
  } catch {
    return undefined;
  }
}
async function cityInfo(city: string) {
  const t = encodeURIComponent(city.trim());
  let page = await wikiPage(`titles=${t}`);
  if (!page || page.missing !== undefined || (!page.thumbnail && !page.coordinates)) page = (await wikiPage(`generator=search&gsrsearch=${t}&gsrlimit=1`)) ?? page;
  const c = page?.coordinates?.[0];
  return { photo: (page?.thumbnail?.source as string) ?? "", lat: c?.lat as number | undefined, lon: c?.lon as number | undefined };
}

// Qloo cannot always find a city by name (small cities, spelling). We try the name first,
// then the city's coordinates, and keep whichever way gives places that are really local.
const whereCache = new Map<string, Params>();
async function whereParams(city: string, lat?: number, lon?: number) {
  const key = city.trim().toLowerCase();
  const hit = whereCache.get(key);
  if (hit) return hit;
  const tries: Params[] = [{ "filter.location.query": city }];
  if (lat !== undefined && lon !== undefined) {
    const pt = `POINT(${lon} ${lat})`;
    tries.push({ "filter.location": pt, "filter.location.radius": 20000 }, { "filter.location": pt, "filter.distance.max": 20 }, { "signal.location": pt, "filter.distance.max": 20 });
  }
  for (const t of tries) {
    const r = await q("/v2/insights", { "filter.type": "urn:entity:place", take: 5, ...t }).then(listOf);
    const local = r.length > 0 && new Set(r.map(countryOf)).size === 1; // if the setting was ignored, results come from all over the world
    if (local) {
      console.log("LOCATION works with:", Object.keys(t).join(" + "));
      whereCache.set(key, t);
      return t;
    }
  }
  return undefined;
}

// ---------- step 1: find the places the person typed ----------
// A place counts as found if it is in the home city, or in the same country as the places that are.
async function findSeeds(names: string[], homeCity: string, home: { lat?: number; lon?: number }) {
  const hasHome = home.lat !== undefined && home.lon !== undefined;
  const rows = await pool(names, 3, async (typed) => {
    // Best way: search by name within reach of the home point. That works whether home is a city or a state.
    const localList = hasHome ? (await lookup(typed, 8, around(home.lat!, home.lon!, 60))).filter((e) => similar(typed, e.name)) : [];
    const withCity = localList.length ? [] : await lookup(`${typed} ${homeCity}`);
    let list = localList.length ? localList : withCity.filter((e) => similar(typed, e.name));
    if (!localList.length && !list.some((e) => inCity(e, homeCity))) {
      const alone = await lookup(typed);
      list = [...list, ...alone.filter((e) => similar(typed, e.name) && !list.some((x) => x.entity_id === e.entity_id))];
    }
    return { typed, list, here: localList[0] ?? list.find((e) => inCity(e, homeCity)), near: localList.length ? localList : withCity.filter((e) => inCity(e, homeCity)) };
  });
  const countries = rows.map((r) => countryOf(r.here)).filter(Boolean);
  const homeCountry = [...countries].sort((a, b) => countries.filter((c) => c === b).length - countries.filter((c) => c === a).length)[0];
  const out: { typed: string; strict: any; suggestions: string[] }[] = [];
  for (const r of rows) {
    const strict = r.here ?? (homeCountry ? r.list.find((e) => countryOf(e) === homeCountry) : r.list[0]);
    let suggestions: string[] = [];
    if (!strict) {
      const key = words(r.typed).slice(0, 2).join(" ");
      const short = key ? (hasHome ? await lookup(key, 6, around(home.lat!, home.lon!, 60)) : await lookup(`${key} ${homeCity}`)) : [];
      suggestions = [...new Set([...r.near, ...(hasHome ? short : short.filter((e) => inCity(e, homeCity)))].map((e) => e.name as string))].slice(0, 3);
    }
    out.push({ typed: r.typed, strict, suggestions });
  }
  return out;
}

// ---------- what kind of place is it, and what do two places have in common ----------
const GENERIC = new Set(["tourist_attraction", "point_of_interest", "establishment", "food", "store", "place"]);
// The kinds of place this is (a bank, a bus company...), best guess first. Qloo's tags can be odd, so we keep a few.
function categoriesOf(e: any, max = 4): { id: string; name: string }[] {
  const specific: any[] = (e?.tags ?? []).filter((t: any) => /^urn:tag:(category|genre):place/.test(tagId(t)) && !GENERIC.has(tagId(t).split(":").pop()!));
  const nm = String(e?.name ?? "").toLowerCase();
  const rank = (t: any) => (nm.includes(String(t.name).toLowerCase()) ? 0 : /category:place/.test(tagId(t)) ? 1 : 2);
  const seen = new Set<string>();
  return [...specific]
    .sort((a, b) => rank(a) - rank(b))
    .filter((t) => {
      const k = String(t.name).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max)
    .map((t) => ({ id: tagId(t), name: t.name as string }));
}
const MEANINGFUL = /^urn:tag:(category|genre|setting|ambience|decor|customer_identity|visit_intent|menu_highlight|specialty_dish|interests|activity_type|neighborhood_characteristic|good_for)/;

// Tags a place shares with the place you loved.
const sharedOf = (p: any, seedTags: Set<string>): string[] =>
  (p.tags ?? []).filter((t: any) => seedTags.has(tagId(t)) && MEANINGFUL.test(tagId(t)) && !GENERIC.has(tagId(t).split(":").pop()!)).map((t: any) => t.name as string);

function shape(p: any, seedTags: Set<string>, exact: boolean) {
  const g = p.properties?.geocode;
  const tags: any[] = p.tags ?? [];
  return {
    id: p.entity_id,
    name: p.name,
    image: p.properties?.image?.url ?? "",
    where: [g?.neighborhood, g?.city].filter(Boolean).join(", ") || p.properties?.address || "",
    description: p.properties?.description ?? "",
    exact,
    // Tags this place shares with the place you loved: the plain reason it matches.
    shared: sharedOf(p, seedTags).slice(0, 3),
    tags: tags.filter((t) => /ambience|setting|decor|genre|neighborhood/.test(t.type)).slice(0, 3).map((t) => t.name as string),
  };
}

const cache = new Map<string, { t: number; v: any }>();

export async function POST(req: NextRequest) {
  try {
    const { homeCity, newCity, loves } = await req.json();
    const all: string[] = (loves ?? []).map((s: string) => s.trim()).filter(Boolean);
    const names = all.slice(0, MAX_PLACES);
    const skipped = all.slice(MAX_PLACES);
    if (!homeCity?.trim() || !newCity?.trim() || names.length < 2) {
      return NextResponse.json({ error: "Add your home city, your new city, and at least 2 places you loved." }, { status: 400 });
    }
    const key = [homeCity, newCity, ...names].join("|").toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    // 1) Can we filter places to the new city? Check first, so a typo gives a clear message and not an empty page.
    const info = await cityInfo(newCity);
    const where = await whereParams(newCity, info.lat, info.lon);
    if (!where) {
      const near = await q("/search", { query: newCity, types: "urn:entity:locality", take: 5 }).then(listOf);
      const tips = [...new Set(near.map((e) => [e.name, e.disambiguation ?? e.properties?.disambiguation].filter(Boolean).join(", ") as string))].slice(0, 3);
      return NextResponse.json({ error: `We could not find "${newCity}" on the map. Check the spelling` + (tips.length ? `. Did you mean: ${tips.join("; ")}?` : ", or try a bigger city nearby.") }, { status: 422 });
    }

    // 2) Find the places the person typed.
    const homeInfo = await cityInfo(homeCity);
    const found = await findSeeds(names, homeCity, homeInfo);
    const seeds: any[] = found.filter((f) => f.strict).map((f) => f.strict);
    if (seeds.length === 0) {
      const tips = [...new Set(found.flatMap((f) => f.suggestions))].slice(0, 3);
      return NextResponse.json({ error: `We could not find those places in ${homeCity}. ` + (tips.length ? `Did you mean: ${tips.join(", ")}?` : "Try the exact names, like they appear on a map.") }, { status: 422 });
    }
    const detail = await q("/entities", { entity_ids: seeds.map((s) => s.entity_id).join(",") }).then(listOf);

    // Matches for one place: ask Qloo for places with similar taste in the new city.
    const matchesFor = (id: string, tags: string[]) =>
      q("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": id, ...where, "filter.tags": tags.length ? tags.join(",") : undefined, "bias.content_based": 0.9, take: 8 }).then(listOf);

    const popularFor = async () => {
      for (const extra of [{ "bias.quality": "high" }, {}]) {
        const l = await q("/v2/insights", { "filter.type": "urn:entity:place", ...where, take: 8, ...extra }).then(listOf);
        if (l.length) return l;
      }
      return [];
    };

    // One section per place. Same-brand places in the new city come first (up to 4, best known first),
    // then similar places of the same kind. Unrelated places are never used to fill a section.
    const laneFor = async (s: any) => {
      const full = detail.find((d) => d.entity_id?.toUpperCase() === s.entity_id.toUpperCase());
      const seedTags = new Set<string>((full?.tags ?? s.tags ?? []).map(tagId));
      const geo = s.properties?.geocode ?? {};
      const country = String(geo.country ?? "").toLowerCase();
      const brand = brandOf(s.name, [homeCity, ...Object.values(geo).filter((v): v is string => typeof v === "string" && v.toLowerCase() !== country)]);
      const cats = categoriesOf(s.tags?.length ? s : full);

      // Which kind of place is it? Qloo's tags can be odd, so try up to 4 readings and keep the one whose
      // matches look most like your place (they share the most tags with it).
      const kinds = async () => {
        let best: { cat?: { id: string; name: string }; list: any[] } = { list: [] };
        let bestScore = -1;
        for (const c of cats) {
          const list = await matchesFor(s.entity_id, [c.id]);
          if (!list.length) continue;
          const top = list.slice(0, 4);
          const score = top.reduce((n, e) => n + sharedOf(e, seedTags).length, 0) / top.length + top.length * 0.1;
          if (score > bestScore) {
            best = { cat: c, list };
            bestScore = score;
          }
          if (top.length >= 4 && score >= 3) break; // clearly a good reading, stop early
        }
        if (cats.length === 0) best = { list: (await matchesFor(s.entity_id, [])).filter((e) => sharedOf(e, seedTags).length >= 2) };
        return best;
      };
      const isSame = (e: any) => sameBrand(brand, e.name);
      // Same brand in the new place: search by name within 30 miles of its map point, then 100,
      // so it works for a city or a whole state. Without coordinates, use the name plus the city.
      const sameSearch = async () => {
        if (!brand) return [];
        if (info.lat !== undefined && info.lon !== undefined) {
          for (const miles of [30, 100]) {
            const r = (await lookup(brand, 25, around(info.lat, info.lon, miles))).filter(isSame);
            if (r.length) return r;
          }
          return [];
        }
        return (await lookup(`${brand} ${newCity}`, 25)).filter((e) => isSame(e) && inCity(e, newCity));
      };
      const [sameAll, best] = await Promise.all([sameSearch(), kinds()]);
      const exact = uniq([...sameAll, ...best.list.filter(isSame)])
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, 4);
      const others = best.list.filter((e) => !isSame(e)).slice(0, exact.length >= 3 ? 2 : 4);
      console.log("SEED", s.name, "| brand:", brand, "| kinds:", cats.map((c) => c.name).join(", ") || "none", "| used:", best.cat?.name ?? "none", "| same brand:", exact.length, "| similar:", others.length);
      return {
        id: s.entity_id,
        seed: s.name as string,
        title: `Because you loved ${s.name}`,
        kind: best.cat?.name ?? (exact.length ? "Same place" : "Closest matches"),
        items: [...exact.map((e) => shape(e, seedTags, true)), ...others.map((e) => shape(e, seedTags, false))],
      };
    };

    const [popular, lanes] = await Promise.all([popularFor(), pool(seeds, 3, laneFor)]);
    const keep = lanes.filter((l) => l.items.length > 0);
    if (keep.length === 0) {
      return NextResponse.json({ error: `Qloo found no matches in ${newCity} for those places. Try a bigger city nearby, or different places.` }, { status: 422 });
    }
    const popularItems = popular.map((p) => shape(p, new Set(), false));

    // Qloo's matching calls often leave out photos. The entity lookup has them, so fetch photos for the cards without one.
    const everyItem = [...keep.flatMap((l) => l.items), ...popularItems];
    const missing = [...new Set(everyItem.filter((i) => !i.image).map((i) => String(i.id)))];
    const chunks: string[][] = [];
    for (let k = 0; k < missing.length; k += 20) chunks.push(missing.slice(k, k + 20));
    await pool(chunks, 2, async (chunk) => {
      const ents = await q("/entities", { entity_ids: chunk.join(",") }).then(listOf);
      for (const e of ents) {
        const url = e.properties?.image?.url;
        if (url) everyItem.filter((i) => String(i.id).toUpperCase() === String(e.entity_id).toUpperCase()).forEach((i) => (i.image = url));
      }
    });
    console.log("PHOTOS", everyItem.filter((i) => i.image).length, "of", everyItem.length);

    const body = {
      cityImage: info.photo,
      guessed: false,
      skipped,
      understood: found.map((f) => ({ typed: f.typed, matched: f.strict?.name ?? null, suggestions: f.suggestions })),
      lanes: keep,
      empty: lanes.filter((l) => l.items.length === 0).map((l) => l.seed),
      popular: popularItems,
    };
    cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    const msg = (e as Error).message;
    const friendly = /QLOO_API_KEY/.test(msg)
      ? "The server has no Qloo key. Add QLOO_API_KEY in the hosting settings."
      : /Qloo 40[13]/.test(msg)
        ? "Qloo did not accept the key. Check that QLOO_API_KEY is the hackathon key."
        : msg;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}