import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 60;

const listOf = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cache = new Map<string, { t: number; v: any }>();
const tagCache = new Map<string, { id: string; name: string }[]>();
// Words that fit too many dishes to find one by themselves.
const GENERIC = new Set(["rice", "with", "and", "the", "soup", "stew", "fried", "sauce", "meat", "chicken", "beef", "fish", "bread", "food"]);

// Edit distance, so a different spelling of a dish still matches.
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
const tokensOf = (x: string) => x.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// Does this tag name talk about this word? Same word, a small spelling difference, or the same first four letters.
const touches = (word: string, tagName: string) =>
  tokensOf(tagName).some((t) => t === word || (word.length >= 5 && t.length >= 5 && (lev(word, t) <= (word.length >= 8 ? 2 : 1) || t.startsWith(word.slice(0, 4)))));

// "ekpang nkukwu (Nigerian)" gives the dish and the cuisine the person says it belongs to.
function parseDish(raw: string) {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { dish: m[1].trim(), cuisine: m[2].trim() } : { dish: raw.trim(), cuisine: "" };
}

// The word for a country's food, for the countries people move between most. Others use the country name.
const DEMONYM: Record<string, string> = {
  nigeria: "nigerian", ghana: "ghanaian", kenya: "kenyan", "south africa": "south african", ethiopia: "ethiopian", cameroon: "cameroonian", senegal: "senegalese",
  "united states": "american", "united kingdom": "british", canada: "canadian", india: "indian", china: "chinese", japan: "japanese", mexico: "mexican",
  italy: "italian", france: "french", germany: "german", spain: "spanish", turkey: "turkish", lebanon: "lebanese", "south korea": "korean", korea: "korean",
  thailand: "thai", vietnam: "vietnamese", philippines: "filipino", brazil: "brazilian", poland: "polish", greece: "greek", jamaica: "jamaican", pakistan: "pakistani",
};
const cuisineWord = (country: string) => DEMONYM[country.trim().toLowerCase()] ?? country.trim();

// One polite call to Qloo: a short pause before each, and a wait and retry if Qloo says it is busy.
async function call(path: string, params: Record<string, string | number | undefined>) {
  for (let i = 0; i < 3; i++) {
    await sleep(200);
    try {
      return await qloo(path, params);
    } catch (e) {
      const m = (e as Error).message;
      if (/Qloo 429/.test(m)) {
        await sleep(1200 * (i + 1));
        continue;
      }
      console.log("DISH FAILED", path, "|", m.slice(0, 110));
      return undefined;
    }
  }
  return undefined;
}

// Qloo tags places by the dishes they are known for ("jollof rice") and by cuisine.
// We look for tags that match the dish, dish tags first.
async function dishTags(dish: string) {
  const key = dish.toLowerCase();
  const hit = tagCache.get(key);
  if (hit) return hit;
  const words = tokensOf(key).filter((w) => w.length > 2);
  const distinctive = words.filter((w) => !GENERIC.has(w));
  const queries = [...new Set([key, ...distinctive, ...distinctive.filter((w) => w.length >= 6).map((w) => w.slice(0, 4))])].slice(0, 4);
  const found: { id: string; name: string; score: number }[] = [];
  for (const query of queries) {
    const d = await call("/v2/tags", { "filter.query": query, "filter.parents.types": "urn:entity:place", take: 10 });
    for (const t of d?.results?.tags ?? []) {
      const id = String(t.tag_id ?? t.id ?? "");
      const name = String(t.name ?? "");
      if (!id) continue;
      const dishTag = /^urn:tag:(menu_highlight|specialty_dish)/.test(id);
      const cuisineTag = /^urn:tag:genre:place:restaurant:/.test(id);
      if (!dishTag && !cuisineTag) continue;
      const hits = words.filter((w) => touches(w, name)).length;
      if (hits === 0) continue;
      found.push({ id, name, score: (dishTag ? 10 : 0) + hits * 2 + (name.toLowerCase() === key ? 5 : 0) });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const out = found.filter((t, i) => found.findIndex((x) => x.id === t.id) === i).slice(0, 3).map(({ id, name }) => ({ id, name }));
  if (out.length > 0) tagCache.set(key, out);
  return out;
}

// The tag for a whole cuisine ("Nigerian"), used when no place lists the dish itself.
async function cuisineTag(term: string) {
  const key = `cuisine:${term.toLowerCase()}`;
  const hit = tagCache.get(key);
  if (hit) return hit[0];
  const d = await call("/v2/tags", { "filter.query": term, "filter.parents.types": "urn:entity:place", take: 10 });
  const tags = (d?.results?.tags ?? []).map((t: any) => ({ id: String(t.tag_id ?? t.id ?? ""), name: String(t.name ?? "") })).filter((t: any) => t.id);
  const stem = term.toLowerCase().slice(0, 4);
  const pick =
    tags.find((t: any) => /^urn:tag:genre:place:restaurant:/.test(t.id) && t.name.toLowerCase().includes(stem)) ??
    tags.find((t: any) => /^urn:tag:category:place:/.test(t.id) && t.name.toLowerCase().includes(stem) && /restaurant|food|cuisine/.test(t.name.toLowerCase()));
  if (pick) tagCache.set(key, [pick]);
  return pick as { id: string; name: string } | undefined;
}

const shape = (p: any, serves: string) => {
  const g = p.properties?.geocode;
  return {
    id: p.entity_id as string,
    name: p.name as string,
    image: (p.properties?.image?.url as string) ?? "",
    where: ([g?.neighborhood, g?.city].filter(Boolean).join(", ") || p.properties?.address || "") as string,
    description: (p.properties?.description as string) ?? "",
    tags: [] as string[],
    serves,
  };
};

// "Miss a dish?": restaurants in the new city that serve the foods you miss, ranked by your taste.
// Order: places known for the dish, then places with the dish in their name, then the closest cuisine.
export async function POST(req: NextRequest) {
  try {
    const { city, dishes, ids, lat, lon, homeCountry } = await req.json();
    const wanted = (Array.isArray(dishes) ? dishes : []).map((x: string) => parseDish(String(x))).filter((x) => x.dish).slice(0, 3);
    if (!city || wanted.length === 0) return NextResponse.json({ groups: [] });
    const joined = (Array.isArray(ids) ? ids : []).slice(0, 8).join(",");
    const key = `${String(city).toLowerCase()}|${wanted.map((w) => `${w.dish}(${w.cuisine})`).join("|").toLowerCase()}|${joined}|${homeCountry ?? ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    const groups: { dish: string; items: any[]; note?: string }[] = [];
    for (const { dish, cuisine } of wanted) {
      let items: any[] = [];
      let note = "";
      for (const tag of await dishTags(dish)) {
        const list = listOf(await call("/v2/insights", { "filter.type": "urn:entity:place", "filter.location.query": String(city), "filter.tags": tag.id, "signal.interests.entities": joined || undefined, take: 6 }));
        if (list.length > 0) {
          items = list.map((p) => shape(p, `Known for ${tag.name.toLowerCase()}`));
          break;
        }
      }
      // No tag matched? Look for places with the dish in their name, near the city's map point.
      if (items.length === 0 && typeof lat === "number" && typeof lon === "number") {
        const distinctive = tokensOf(dish).filter((w) => w.length > 2 && !GENERIC.has(w));
        const byName = listOf(await call("/search", { query: dish, types: "urn:entity:place", take: 10, "filter.location": `${lat},${lon}`, "filter.radius": 25 }));
        items = byName
          .filter((e) => (distinctive.length ? distinctive.some((w) => String(e.name).toLowerCase().includes(w)) : String(e.name).toLowerCase().includes(dish.toLowerCase())))
          .slice(0, 6)
          .map((p) => shape(p, "Has it in the name"));
      }
      // Still nothing? Show the closest cuisine, and say plainly that it is only a guess.
      if (items.length === 0) {
        const term = cuisine || (homeCountry ? cuisineWord(String(homeCountry)) : "");
        const tag = term ? await cuisineTag(term) : undefined;
        if (tag) {
          const list = listOf(await call("/v2/insights", { "filter.type": "urn:entity:place", "filter.location.query": String(city), "filter.tags": tag.id, "signal.interests.entities": joined || undefined, take: 6 }));
          if (list.length > 0) {
            items = list.map((p) => shape(p, tag.name));
            note = `No place lists ${dish} in Qloo's data. These ${tag.name.toLowerCase()} places are the closest we found, so ask if they serve it.`;
          }
        }
      }
      groups.push({ dish, items, note: note || undefined });
    }

    // Qloo's matching calls often leave out photos, so fetch them for the places that have none.
    const missing = [...new Set(groups.flatMap((g) => g.items).filter((i) => !i.image).map((i) => String(i.id)))];
    for (let k = 0; k < missing.length; k += 20) {
      const ents = listOf(await call("/entities", { entity_ids: missing.slice(k, k + 20).join(",") }));
      for (const e of ents) {
        const url = e.properties?.image?.url;
        if (url) groups.flatMap((g) => g.items).filter((i) => String(i.id).toUpperCase() === String(e.entity_id).toUpperCase()).forEach((i) => (i.image = url));
      }
    }
    console.log("DISHES", city, "|", groups.map((g) => `${g.dish}:${g.items.length}${g.note ? "(cuisine)" : ""}`).join(" "));
    const body = { groups };
    if (groups.some((g) => g.items.length > 0)) cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    console.log("DISHES FAILED", (e as Error).message.slice(0, 140));
    return NextResponse.json({ groups: [] });
  }
}