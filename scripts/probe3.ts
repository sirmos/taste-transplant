// Run: npx tsx --env-file=.env.local scripts/probe3.ts
import { qloo, findEntity } from "../lib/qloo";

const HOME_LATLON = "43.6532,-79.3832";
const NEW_CITY = "Chicago";
const SEEDS = ["St. Lawrence Market", "Kensington Market", "Bellwoods Brewery"];

async function main() {
  const ids: string[] = [];
  for (const name of SEEDS) {
    const e = await findEntity(name, "urn:entity:place", HOME_LATLON);
    if (e) ids.push(e.entity_id);
  }

  console.log("\n=== Other types, with and without the city");
  for (const t of ["artist", "brand", "movie", "tv_show", "podcast", "book", "videogame"]) {
    const get = async (extra: Record<string, string>) => {
      try {
        const d = await qloo("/v2/insights", {
          "filter.type": `urn:entity:${t}`,
          "signal.interests.entities": ids.join(","),
          take: 5,
          ...extra,
        });
        return (d.results?.entities ?? []).map((x: any) => x.name);
      } catch (e) {
        return ["FAILED " + (e as Error).message.slice(0, 80)];
      }
    };
    const without = await get({});
    const withCity = await get({ "signal.location.query": NEW_CITY });
    console.log(`\n${t}\n  no city  :`, without.join(" | "));
    console.log("  with city:", withCity.join(" | "));
  }

  console.log("\n=== Tag search for place types");
  for (const q of ["bar", "coffee", "nightclub", "live music", "bookstore", "barbershop", "vintage"]) {
    try {
      const d = await qloo("/v2/tags", { "filter.query": q, "filter.parents.types": "urn:entity:place", take: 5 });
      const tags = d.results?.tags ?? [];
      console.log(`\n"${q}":`);
      tags.forEach((t: any) => console.log("  ", t.tag_id ?? t.id, "|", t.name));
    } catch (e) {
      console.log(`"${q}" FAILED:`, (e as Error).message.slice(0, 150));
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});