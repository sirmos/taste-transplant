import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 60;

const listOf = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cache = new Map<string, { t: number; v: any }>();
const tagCache = new Map<string, { id: string; name: string }[]>();
// Words that fit too many dishes to find one by themselves.
const GENERIC = new Set(["rice", "with", "and", "the", "soup", "stew", "fried", "sauce", "meat", "chicken", "beef", "fish", "bread", "food"]);

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
  const words = key.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const queries = [...new Set([key, ...words.filter((w) => !GENERIC.has(w))])].slice(0, 3);
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
      const hits = words.filter((w) => name.toLowerCase().includes(w)).length;
      if (hits === 0) continue;
      found.push({ id, name, score: (dishTag ? 10 : 0) + hits * 2 + (name.toLowerCase() === key ? 5 : 0) });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const out = found.filter((t, i) => found.findIndex((x) => x.id === t.id) === i).slice(0, 3).map(({ id, name }) => ({ id, name }));
  if (out.length > 0) tagCache.set(key, out);
  return out;
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
export async function POST(req: NextRequest) {
  try {
    const { city, dishes, ids, lat, lon } = await req.json();
    const wanted: string[] = (Array.isArray(dishes) ? dishes : []).map((x: string) => String(x).trim()).filter(Boolean).slice(0, 3);
    if (!city || wanted.length === 0) return NextResponse.json({ groups: [] });
    const joined = (Array.isArray(ids) ? ids : []).slice(0, 8).join(",");
    const key = `${String(city).toLowerCase()}|${wanted.join("|").toLowerCase()}|${joined}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    const groups: { dish: string; items: any[] }[] = [];
    for (const dish of wanted) {
      let items: any[] = [];
      for (const tag of await dishTags(dish)) {
        const list = listOf(await call("/v2/insights", { "filter.type": "urn:entity:place", "filter.location.query": String(city), "filter.tags": tag.id, "signal.interests.entities": joined || undefined, take: 6 }));
        if (list.length > 0) {
          items = list.map((p) => shape(p, `Known for ${tag.name.toLowerCase()}`));
          break;
        }
      }
      // No tag matched? Look for places with the dish in their name, near the city's map point.
      if (items.length === 0 && typeof lat === "number" && typeof lon === "number") {
        const distinctive = dish.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC.has(w));
        const byName = listOf(await call("/search", { query: dish, types: "urn:entity:place", take: 10, "filter.location": `${lat},${lon}`, "filter.radius": 25 }));
        items = byName
          .filter((e) => (distinctive.length ? distinctive.some((w) => String(e.name).toLowerCase().includes(w)) : String(e.name).toLowerCase().includes(dish.toLowerCase())))
          .slice(0, 6)
          .map((p) => shape(p, "Has it in the name"));
      }
      groups.push({ dish, items });
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
    console.log("DISHES", city, "|", groups.map((g) => `${g.dish}:${g.items.length}`).join(" "));
    const body = { groups };
    if (groups.some((g) => g.items.length > 0)) cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    console.log("DISHES FAILED", (e as Error).message.slice(0, 140));
    return NextResponse.json({ groups: [] });
  }
}