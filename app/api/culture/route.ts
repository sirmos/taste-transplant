import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 30;

const GROUPS = [
  { id: "artist", title: "Music" },
  { id: "tv_show", title: "Shows" },
  { id: "podcast", title: "Podcasts" },
];
const listOf = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cache = new Map<string, { t: number; v: any }>();

// Music, shows and podcasts that fit the places you picked, tuned to the new city.
async function ask(type: string, ids: string, city: string | undefined) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return listOf(await qloo("/v2/insights", { "filter.type": `urn:entity:${type}`, "signal.interests.entities": ids, "signal.location.query": city, take: 6 }));
    } catch (e) {
      const msg = (e as Error).message;
      console.log("CULTURE FAILED", type, "|", msg.slice(0, 120));
      if (!/Qloo 429/.test(msg)) return [];
      await sleep(1200);
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const { city, ids } = await req.json();
    if (!city || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ groups: [] });
    const joined = ids.slice(0, 8).join(",");
    const key = `${String(city).toLowerCase()}|${joined}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    const groups = [];
    for (const g of GROUPS) {
      await sleep(200);
      let list = await ask(g.id, joined, String(city));
      if (list.length === 0) list = await ask(g.id, joined, undefined); // city not known to Qloo: use taste only
      groups.push({
        id: g.id,
        title: g.title,
        items: list.map((e) => ({
          id: e.entity_id as string,
          name: e.name as string,
          image: (e.properties?.image?.url as string) ?? "",
        })),
      });
    }
    const body = { groups: groups.filter((g) => g.items.length > 0) };
    console.log("CULTURE", city, "|", body.groups.map((g) => `${g.title}:${g.items.length}`).join(" "));
    cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ groups: [] });
  }
}