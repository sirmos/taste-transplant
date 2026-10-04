// Run: npx tsx --env-file=.env.local scripts/probe2.ts
// Goal: find which location setting makes results land in the NEW city.
import { qloo, findEntity } from "../lib/qloo";

const HOME_LATLON = "43.6532,-79.3832"; // Toronto
const NEW_CITY = "Chicago";
const SEEDS = [
  { name: "St. Lawrence Market", type: "urn:entity:place" },
  { name: "Kensington Market", type: "urn:entity:place" },
  { name: "Bellwoods Brewery", type: "urn:entity:place" },
];

const where = (p: any) => {
  const g = p.properties?.geocode;
  return g ? [g.city, g.region ?? g.state, g.country].filter(Boolean).join(", ") : p.properties?.address ?? "no address";
};

async function main() {
  const ids: string[] = [];
  for (const s of SEEDS) {
    const e = await findEntity(s.name, s.type, HOME_LATLON);
    console.log(s.name, "->", e ? `${e.name}` : "NOT FOUND");
    if (e) ids.push(e.entity_id);
  }

  const base = {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": ids.join(","),
    "feature.explainability": true,
    take: 8,
  };

  async function run(label: string, extra: Record<string, string>, base2 = base) {
    console.log(`\n=== ${label}`);
    try {
      const data = await qloo("/v2/insights", { ...base2, ...extra });
      const list = data.results?.entities ?? [];
      console.log("results:", list.length);
      list.slice(0, 6).forEach((p: any) => console.log("-", p.name, "|", where(p)));
      return list;
    } catch (e) {
      console.log("FAILED:", (e as Error).message.slice(0, 200));
      return [];
    }
  }

  await run("A) signal.location.query", { "signal.location.query": NEW_CITY });
  const b = await run("B) filter.location.query", { "filter.location.query": NEW_CITY });
  await run("C) both", { "filter.location.query": NEW_CITY, "signal.location.query": NEW_CITY });
  await run("D) filter.location as a point", { "filter.location": "POINT(-87.6298 41.8781)" });

  if (b[0]) {
    console.log("\nExplainability of first result in B:");
    console.log(JSON.stringify(b[0].query?.explainability ?? "none", null, 2).slice(0, 700));
  }

  console.log("\n=== Coverage check with B on other cities");
  for (const city of ["London", "Lagos", "Berlin", "Tokyo", "Chicago"]) {
    try {
      const data = await qloo("/v2/insights", { ...base, take: 5, "filter.location.query": city });
      const list = data.results?.entities ?? [];
      console.log(city.padEnd(10), list.length, "results | first:", list[0]?.name ?? "-", "|", list[0] ? where(list[0]) : "");
    } catch (e) {
      console.log(city.padEnd(10), "FAILED:", (e as Error).message.slice(0, 120));
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});