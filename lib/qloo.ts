// Small Qloo client. Runs on the server only, so the key never reaches the browser.
const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

type Params = Record<string, string | number | boolean | undefined>;

export async function qloo(path: string, params: Params = {}) {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_API_KEY is missing. Check your .env.local file.");

  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  // Qloo ignores bad parameters without an error, so we log every URL to check them by eye.
  console.log("QLOO ->", url.toString());

  const res = await fetch(url, { headers: { "X-Api-Key": key } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Qloo ${res.status} on ${path}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// Turn a name (like a cafe or an artist) into a Qloo entity. Pass the home city
// coordinates as "lat,lon" so places are found in the right city.
export async function findEntity(name: string, type: string, homeLatLon?: string) {
  const data = await qloo("/search", {
    query: name,
    types: type,
    take: 3,
    "filter.location": homeLatLon,
    "filter.radius": homeLatLon ? 25 : undefined,
  });
  const list = Array.isArray(data.results) ? data.results : data.results?.entities ?? [];
  return list[0] as { entity_id: string; name: string } | undefined;
}

// The main move: take taste from one city and ask for matches in another.
// filter.location.query is what keeps results inside the new city.
// (signal.location.query only nudges, and still returned the old city.)
export async function transplant(opts: {
  type: string; // for example "urn:entity:place"
  entityIds: string[];
  newCity: string;
  tags?: string[]; // optional tag IDs, for example a bar or cafe tag
  take?: number;
}) {
  const data = await qloo("/v2/insights", {
    "filter.type": opts.type,
    "signal.interests.entities": opts.entityIds.join(","),
    "filter.location.query": opts.newCity,
    "filter.tags": opts.tags?.length ? opts.tags.join(",") : undefined,
    "feature.explainability": true,
    take: opts.take ?? 10,
  });
  return (data.results?.entities ?? []) as any[];
}