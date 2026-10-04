import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 60;
const MAX_PLACES = 8; // most places we use from one list

// ---------- small helpers (nothing here is specific to one city or one kind of place) ----------
const COMMON = new Set(["the", "and", "bar", "cafe", "coffee", "restaurant", "hotel", "resort", "beach", "park", "market", "club", "lounge", "grill", "house", "shop", "store", "pub"]);
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

// Does a name found in Qloo look like what the person typed?
function similar(typed: string, found: string) {
  const a = words(typed);
  if (a.length === 0) return true;
  if (compact(found).includes(a.join(""))) return true; // "DeChoice" matches "De Choice"
  const b = words(found).join(" ");
  return a.filter((w) => b.includes(w)).length >= Math.ceil(a.length / 2);
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
  const c = compact(name);
  return a.length > 0 && (c.includes(a.join("")) || a.every((w) => c.includes(w)));
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
const lookup = async (query: string, take = 6) => listOf(await q("/search", { query, types: "urn:entity:place", take }));

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
async function findSeeds(names: string[], homeCity: string) {
  const rows = await pool(names, 3, async (typed) => {
    const withCity = await lookup(`${typed} ${homeCity}`);
    let list = withCity.filter((e) => similar(typed, e.name));
    if (!list.some((e) => inCity(e, homeCity))) {
      const alone = await lookup(typed);
      list = [...list, ...alone.filter((e) => similar(typed, e.name) && !list.some((x) => x.entity_id === e.entity_id))];
    }
    return { typed, list, here: list.find((e) => inCity(e, homeCity)), near: withCity.filter((e) => inCity(e, homeCity)) };
  });
  const countries = rows.map((r) => countryOf(r.here)).filter(Boolean);
  const homeCountry = [...countries].sort((a, b) => countries.filter((c) => c === b).length - countries.filter((c) => c === a).length)[0];
  const out: { typed: string; strict: any; suggestions: string[] }[] = [];
  for (const r of rows) {
    const strict = r.here ?? (homeCountry ? r.list.find((e) => countryOf(e) === homeCountry) : r.list[0]);
    let suggestions: string[] = [];
    if (!strict) {
      const key = words(r.typed).slice(0, 2).join(" ");
      const short = key ? await lookup(`${key} ${homeCity}`) : [];
      suggestions = [...new Set([...r.near, ...short.filter((e) => inCity(e, homeCity))].map((e) => e.name as string))].slice(0, 3);
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
    const found = await findSeeds(names, homeCity);
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

      // Which kind of place is it? Try up to 4 kinds and keep the one with the most matches in the new city.
      const kinds = async () => {
        let best: { cat?: { id: string; name: string }; list: any[] } = { list: [] };
        for (const c of cats) {
          const list = await matchesFor(s.entity_id, [c.id]);
          if (list.length > best.list.length) best = { cat: c, list };
          if (list.length >= 4) break;
        }
        if (cats.length === 0) best = { list: (await matchesFor(s.entity_id, [])).filter((e) => sharedOf(e, seedTags).length >= 2) };
        return best;
      };
      const [sameAll, best] = await Promise.all([brand ? lookup(`${brand} ${newCity}`, 25) : Promise.resolve([]), kinds()]);
      const isSame = (e: any) => sameBrand(brand, e.name);
      const exact = uniq([...sameAll.filter((e) => isSame(e) && inCity(e, newCity)), ...best.list.filter(isSame)])
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