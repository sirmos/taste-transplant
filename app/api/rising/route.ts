import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 30;

const listOf = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const cache = new Map<string, { t: number; v: any }>();

// Places in the new city that fit your taste and are gaining attention, using Qloo's trend bias.
export async function POST(req: NextRequest) {
  try {
    const { city, ids } = await req.json();
    if (!city || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ items: [] });
    const joined = ids.slice(0, 8).join(",");
    const key = `${String(city).toLowerCase()}|${joined}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    const data = await qloo("/v2/insights", {
      "filter.type": "urn:entity:place",
      "filter.location.query": String(city),
      "signal.interests.entities": joined,
      "bias.trends": "very_high",
      take: 8,
    });
    const items = listOf(data).map((p) => {
      const g = p.properties?.geocode;
      return {
        id: p.entity_id as string,
        name: p.name as string,
        image: (p.properties?.image?.url as string) ?? "",
        where: ([g?.neighborhood, g?.city].filter(Boolean).join(", ") || p.properties?.address || "") as string,
        description: (p.properties?.description as string) ?? "",
        tags: (p.tags ?? []).filter((t: any) => /ambience|setting|decor|genre|neighborhood/.test(t.type)).slice(0, 3).map((t: any) => t.name as string),
      };
    });
    console.log("RISING", city, "|", items.slice(0, 4).map((i) => i.name).join(" ; "));
    const body = { items };
    cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    console.log("RISING FAILED", (e as Error).message.slice(0, 140));
    return NextResponse.json({ items: [] });
  }
}