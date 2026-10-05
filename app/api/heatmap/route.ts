import { NextRequest, NextResponse } from "next/server";
import { qloo } from "@/lib/qloo";

export const maxDuration = 30;

const cache = new Map<string, { t: number; v: any }>();

// Taste map: how well each part of the new city matches the places you picked, from Qloo's heatmap.
export async function POST(req: NextRequest) {
  try {
    const { city, ids } = await req.json();
    if (!city || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ points: [] });
    const key = `${String(city).toLowerCase()}|${ids.join(",")}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return NextResponse.json(hit.v);

    const data = await qloo("/v2/insights", {
      "filter.type": "urn:heatmap",
      "filter.location.query": String(city),
      "signal.interests.entities": ids.slice(0, 8).join(","),
    });
    const raw: any[] = data?.results?.heatmap ?? [];
    const points = raw
      .map((p) => ({ lat: p.location?.latitude, lon: p.location?.longitude, rank: Number(p.query?.affinity_rank ?? 0) }))
      .filter((p) => typeof p.lat === "number" && typeof p.lon === "number");
    console.log("HEATMAP", city, "| points:", points.length);
    const body = { points };
    cache.set(key, { t: Date.now(), v: body });
    return NextResponse.json(body);
  } catch (e) {
    console.log("HEATMAP FAILED", (e as Error).message.slice(0, 140));
    return NextResponse.json({ points: [] }); // no map for this city, the page says so
  }
}