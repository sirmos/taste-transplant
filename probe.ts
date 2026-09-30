// Day 1 test. Run: npx tsx --env-file=.env.local scripts/probe.ts
// It checks the key, the cross-city idea, the heatmap, and which entity types your key allows.
import { qloo, findEntity, transplant } from "../lib/qloo";

// Edit these to try different cities and tastes.
const HOME_LATLON = "43.6532,-79.3832"; // home city coordinates (Toronto here)
const NEW_CITY = "Chicago";
const SEEDS = [
  { name: "St. Lawrence Market", type: "urn:entity:place" },
  { name: "Kensington Market", type: "urn:entity:place" },
];

async function main() {
  console.log("\n1) Finding seed entities in the home city");
  const ids: string[] = [];
  for (const s of SEEDS) {
    const e = await findEntity(s.name, s.type, HOME_LATLON);
    console.log(s.name, "->", e ? `${e.name} (${e.entity_id})` : "NOT FOUND");
    if (e) ids.push(e.entity_id);
  }
  if (!ids.length) throw new Error("No seeds found. Try other names or check the key.");

  console.log(`\n2) Transplant to ${NEW_CITY}`);
  const places = await transplant({ type: "urn:entity:place", entityIds: ids, newCity: NEW_CITY });
  console.log("results:", places.length);
  places.slice(0, 5).forEach((p) => console.log("-", p.name, "| explainability:", p.query?.explainability ? "yes" : "no"));
  if (places[0]) console.log("\nFirst result, raw:\n", JSON.stringify(places[0], null, 2).slice(0, 1500));

  console.log("\n3) Heatmap");
  try {
    const h = await qloo("/v2/insights", {
      "filter.type": "urn:heatmap",
      "filter.location.query": NEW_CITY,
      "signal.interests.entities": ids.join(","),
    });
    console.log("heatmap points:", h.results?.heatmap?.length ?? 0);
  } catch (e) {
    console.log("heatmap failed:", (e as Error).message);
  }

  console.log("\n4) Which entity types does this key accept?");
  const types = ["artist", "book", "brand", "destination", "locality", "movie", "person", "place", "podcast", "tv_show", "video_game", "videogame"];
  for (const t of types) {
    try {
      const r = await qloo("/v2/insights", {
        "filter.type": `urn:entity:${t}`,
        "signal.interests.entities": ids[0],
        take: 3,
      });
      const n = (r.results?.entities ?? []).length;
      console.log(t.padEnd(12), "OK,", n, "results");
    } catch (e) {
      console.log(t.padEnd(12), (e as Error).message.slice(0, 90));
    }
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
