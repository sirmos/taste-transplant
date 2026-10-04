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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uniq = (list: any[]) => list.filter((e, i) => list.findIndex((x) => x.entity_id === e.entity_id) === i);
const UA = { "User-Agent": "TasteTransplant/1.0 (hackathon demo)" };

// Does a name found in Qloo look like what the person typed?
function similar(typed: string, found: string) {
  const a = words(typed);
  if (a.length === 0) return true;
  if (compact(found).includes(a.join(""))) return true; // "DeChoice" matches "De Choice"
  const b = words(found).join(" ");
  return a.filter((w) => b.includes(w)).length >= Math.ceil(a.length / 2);
}

// "First Bank - Uyo CBD Branch" becomes "First Bank". Branch and home city names are removed.
function brandOf(name: string, homeCity: string) {
  const city = homeCity.replace(/[^\w ]/g, "").trim();
  return name
    .split(/\s[-–|]\s|,|\(/)[0]
    .replace(city ? new RegExp(`\\b${city}\\b`, "ig") : /$^/, "")
    .replace(/\b(branch|head office)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
const sameBrand = (brand: string, name: string) => {
  const a = words(brand);
  return a.length > 0 && compact(name).includes(a.join(""));
};

// One call to Qloo. If it fails, say why in the terminal and try once more.
async function q(path: string, params: Record<string, string | number | boolean | undefined>) {
  for (let i = 0; i < 2; i++) {
    try {
      return await qloo(path, params);
    } catch (e) {
      console.log("QLOO FAILED", path, "|", (e as Error).message.slice(0, 120));
      await sleep(400);
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

// ---------- city photo ----------
async function cityPhoto(city: string) {
  const title = encodeURIComponent(city.trim());
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&redirects=1&titles=${title}&prop=pageimages&piprop=thumbnail&pithumbsize=1000&format=json`, { headers: UA, signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const page: any = Object.values(j?.query?.pages ?? {})[0];
    if (page?.thumbnail?.source) return page.thumbnail.source as string;
  } catch {}
  return "";
}

// ---------- what kind of place is it, and what do two places have in common ----------
const GENERIC = new Set(["tourist_attraction", "point_of_interest", "establishment", "food", "store", "place"]);
function categoryOf(e: any): { id: string; name: string } | undefined {
  const specific = (e?.tags ?? []).filter((t: any) => /^urn:tag:(category|genre):place/.test(tagId(t)) && !GENERIC.has(tagId(t).split(":").pop()!));
  const best = specific.find((t: any) => /category:place/.test(tagId(t))) ?? specific[0];
  return best ? { id: tagId(best), name: best.name } : undefined;
}
const MEANINGFUL = /^urn:tag:(category|genre|setting|ambience|decor|customer_identity|visit_intent|menu_highlight|specialty_dish|interests|activity_type|neighborhood_characteristic|good_for)/;

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
    shared: tags.filter((t) => seedTags.has(tagId(t)) && MEANINGFUL.test(tagId(t)) && !GENERIC.has(tagId(t).split(":").pop()!)).slice(0, 3).map((t) => t.name as string),
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

    const found = await findSeeds(names, homeCity);
    const seeds: any[] = found.filter((f) => f.strict).map((f) => f.strict);
    if (seeds.length === 0) {
      const tips = [...new Set(found.flatMap((f) => f.suggestions))].slice(0, 3);
      return NextResponse.json({ error: `We could not find those places in ${homeCity}. ` + (tips.length ? `Did you mean: ${tips.join(", ")}?` : "Try the exact names, like they appear on a map.") }, { status: 422 });
    }
    const detail = await q("/entities", { entity_ids: seeds.map((s) => s.entity_id).join(",") }).then(listOf);

    // Matches for one place: ask Qloo for places with similar taste in the new city.
    const matchesFor = (id: string, tags: string[]) =>
      q("/v2/insights", {
        "filter.type": "urn:entity:place",
        "signal.interests.entities": id,
        "filter.location.query": newCity,
        "filter.tags": tags.length ? tags.join(",") : undefined,
        "bias.content_based": 0.9,
        take: 8,
      }).then(listOf);

    const popularFor = async () => {
      for (const extra of [{ "bias.quality": "high" }, {}]) {
        const l = await q("/v2/insights", { "filter.type": "urn:entity:place", "filter.location.query": newCity, take: 8, ...extra }).then(listOf);
        if (l.length) return l;
      }
      return [];
    };

    // One section per place. Same-brand places in the new city come first (at most 2), then similar places.
    const laneFor = async (s: any) => {
      const full = detail.find((d) => d.entity_id?.toUpperCase() === s.entity_id.toUpperCase());
      const cat = categoryOf(s.tags?.length ? s : full);
      const seedTags = new Set<string>((full?.tags ?? s.tags ?? []).map(tagId));
      const brand = brandOf(s.name, homeCity);
      console.log("SEED", s.name, "| brand:", brand, "| category:", cat?.id ?? "none");

      const [sameSearch, tagged] = await Promise.all([brand ? lookup(`${brand} ${newCity}`, 10) : Promise.resolve([]), cat ? matchesFor(s.entity_id, [cat.id]) : Promise.resolve([])]);
      const taste = tagged.length ? tagged : await matchesFor(s.entity_id, []);
      const isSame = (e: any) => sameBrand(brand, e.name);
      const exact = uniq([...sameSearch.filter((e) => isSame(e) && inCity(e, newCity)), ...taste.filter(isSame)]).slice(0, 2);
      const others = taste.filter((e) => !isSame(e)).slice(0, 4 - exact.length);
      return {
        id: s.entity_id,
        title: `Because you loved ${s.name}`,
        kind: cat?.name ?? "Closest matches",
        items: [...exact.map((e) => shape(e, seedTags, true)), ...others.map((e) => shape(e, seedTags, false))],
      };
    };

    const [photo, popular, lanes] = await Promise.all([cityPhoto(newCity), popularFor(), pool(seeds, 3, laneFor)]);
    const keep = lanes.filter((l) => l.items.length > 0);
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
      cityImage: photo,
      guessed: false,
      skipped,
      understood: found.map((f) => ({ typed: f.typed, matched: f.strict?.name ?? null, suggestions: f.suggestions })),
      lanes: keep,
      popular: popularItems,
    };
    cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}