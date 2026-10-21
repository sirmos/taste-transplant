import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 60;

// The things almost everyone needs when they arrive somewhere new, in the order they usually need them.
// "stage" is the part of the first month: 0 = days 1 to 3, 1 = week 1, 2 = weeks 2 and 3, 3 = week 4.
const SLOTS = [
  { id: "bank", by: "quality", label: "A bank or ATM", stage: 0, term: "bank", why: "For cash and transfers" },
  { id: "pharmacy", by: "quality", label: "A pharmacy", stage: 0, term: "pharmacy", why: "Basic medicine close by" },
  { id: "grocery", by: "quality", label: "Somewhere to stock up", stage: 0, term: "supermarket", why: "Food for your first days" },
  { id: "clinic", by: "quality", label: "A hospital or clinic", stage: 1, term: "hospital", why: "Know where to go if you feel unwell" },
  { id: "salon", by: "quality", label: "A barber or salon", stage: 1, term: "hair salon", why: "Look sharp for your first week" },
  { id: "eat", by: "taste", label: "A good meal out", stage: 1, term: "restaurant", why: "Your first proper meal out" },
  { id: "gym", by: "taste", label: "Somewhere to move", stage: 2, term: "gym", why: "A good way to meet people" },
  { id: "bar", by: "taste", label: "A night out", stage: 2, term: "bar", why: "Where people go to relax" },
  { id: "mall", by: "taste", label: "A mall to browse", stage: 3, term: "shopping mall", why: "For the things your room needs" },
  { id: "sight", by: "taste", label: "Something to see", stage: 3, term: "tourist attraction", why: "See your new city" },
];

const listOf = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cache = new Map<string, { t: number; v: any }>();
const tagCache = new Map<string, string | null>();

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
      console.log("KIT FAILED", path, "|", m.slice(0, 110));
      return undefined;
    }
  }
  return undefined;
}

// "pharmacy" becomes Qloo's tag id for pharmacies. We look it up once and remember it.
async function tagFor(term: string) {
  if (tagCache.has(term)) return tagCache.get(term)!;
  const d = await call("/v2/tags", { "filter.query": term, "filter.parents.types": "urn:entity:place", take: 8 });
  const ids: string[] = (d?.results?.tags ?? []).map((t: any) => String(t.tag_id ?? t.id ?? "")).filter(Boolean);
  const id = ids.find((x) => /^urn:tag:category:place:/.test(x)) ?? ids.find((x) => /^urn:tag:genre:place:/.test(x)) ?? null;
  tagCache.set(term, id);
  return id;
}

export async function POST(req: NextRequest) {
  try {
    const { city, ids } = await req.json();
    if (!city || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ slots: [] });
    const joined = ids.slice(0, 8).join(",");
    const key = `${String(city).toLowerCase()}|${joined}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    const slots: any[] = [];
    for (const slot of SLOTS) {
      const tag = await tagFor(slot.term);
      if (!tag) continue;
      // The tag keeps results to this kind of place, and your places rank them by taste.
      const base = { "filter.type": "urn:entity:place", "filter.location.query": String(city), "filter.tags": tag, take: 4 };
      let list: any[] = [];
      // The basics: well-rated places first. Everything else, and anything still empty: ranked by your taste.
      if (slot.by === "quality") list = listOf(await call("/v2/insights", { ...base, "bias.quality": "high" }));
      if (list.length === 0) list = listOf(await call("/v2/insights", { ...base, "signal.interests.entities": joined }));
      if (list.length === 0) continue;
      slots.push({
        ...slot,
        items: list.map((p) => {
          const g = p.properties?.geocode;
          return {
            id: p.entity_id as string,
            name: p.name as string,
            image: (p.properties?.image?.url as string) ?? "",
            where: ([g?.neighborhood, g?.city].filter(Boolean).join(", ") || p.properties?.address || "") as string,
            description: (p.properties?.description as string) ?? "",
            tags: [] as string[],
          };
        }),
      });
    }

    // Qloo's matching calls often leave out photos, so fetch them for the places that have none.
    const missing = [...new Set(slots.flatMap((s) => s.items).filter((i: any) => !i.image).map((i: any) => String(i.id)))];
    for (let k = 0; k < missing.length; k += 20) {
      const ents = listOf(await call("/entities", { entity_ids: missing.slice(k, k + 20).join(",") }));
      for (const e of ents) {
        const url = e.properties?.image?.url;
        if (url) slots.flatMap((s) => s.items).filter((i: any) => String(i.id).toUpperCase() === String(e.entity_id).toUpperCase()).forEach((i: any) => (i.image = url));
      }
    }
    console.log("KIT", city, "|", slots.map((s) => `${s.id}:${s.items.length}`).join(" ") || "none");
    const body = { slots };
    if (slots.length > 0) cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    console.log("KIT FAILED", (e as Error).message.slice(0, 140));
    return NextResponse.json({ slots: [] });
  }
}