// Run: npx tsx --env-file=.env.local scripts/probe4.ts
// Shows what Qloo returns for each place, so we can see why something is "not found".
import { qloo } from "../lib/qloo";

const HOME = "Uyo";
const NEW = "Lagos";
const PLACES = ["Godswill Obot Akpabio International Stadium", "DeChoice Mall", "Chicken Republic", "Five Star Hotels & Suits", "Christmas Village"];

const list = (d: any): any[] => (Array.isArray(d?.results) ? d.results : d?.results?.entities ?? []);
const show = (e: any) => `${e.name} | ${e.properties?.geocode?.city ?? "?"}, ${e.properties?.geocode?.country ?? "?"}`;

async function tryQ(label: string, params: Record<string, string | number>) {
  try {
    const l = list(await qloo("/search", { types: "urn:entity:place", take: 5, ...params }));
    console.log(`  ${label}: ${l.length} results`);
    l.slice(0, 3).forEach((e) => console.log("     -", show(e)));
    return l;
  } catch (e) {
    console.log(`  ${label}: FAILED`, (e as Error).message.slice(0, 100));
    return [];
  }
}

async function main() {
  const c = list(await qloo("/search", { query: HOME, types: "urn:entity:locality", take: 3 }).catch(() => ({})));
  console.log("Home city results:");
  c.forEach((e) => console.log(" -", e.name, "|", e.entity_id));
  const cityId = c[0]?.entity_id;

  let stadium: any;
  for (const name of PLACES) {
    console.log("\n" + name);
    const a = await tryQ("name only", { query: name });
    await tryQ("name + city", { query: `${name} ${HOME}` });
    if (cityId) await tryQ("near the city (50 mi)", { query: name, "filter.location": cityId, "filter.radius": 50 });
    if (!stadium && /stadium/i.test(name)) stadium = a[0];
  }
  if (!stadium) return console.log("\nNo stadium found, stopping.");

  console.log("\n=== Stadium seed:", stadium.name);
  const full = list(await qloo("/entities", { entity_ids: stadium.entity_id }).catch(() => ({})))[0] ?? stadium;
  const tags: any[] = full.tags ?? stadium.tags ?? [];
  console.log("tags on search result:", stadium.tags?.length ?? 0, "| tags from /entities:", full.tags?.length ?? 0);
  tags.slice(0, 25).forEach((t) => console.log("  ", t.id));

  const test = async (label: string, extra: Record<string, string | number>) => {
    try {
      const d = await qloo("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": stadium.entity_id, "filter.location.query": NEW, take: 6, ...extra });
      console.log(`\n${label}`);
      list(d).forEach((e) => console.log("  -", e.name));
    } catch (e) {
      console.log(`\n${label} FAILED`, (e as Error).message.slice(0, 120));
    }
  };
  await test(`${NEW}, no tags`, {});
  await test(`${NEW}, no tags, content_based=1`, { "bias.content_based": 1 });
  await test(`${NEW}, category stadium tag`, { "filter.tags": "urn:tag:category:place:stadium" });
  await test(`${NEW}, genre stadium tag`, { "filter.tags": "urn:tag:genre:place:stadium" });

  console.log("\n=== Tag search for stadium");
  try {
    const d = await qloo("/v2/tags", { "filter.query": "stadium", "filter.parents.types": "urn:entity:place", take: 8 });
    (d.results?.tags ?? []).forEach((t: any) => console.log("  ", t.tag_id ?? t.id, "|", t.name));
  } catch (e) {
    console.log("tags FAILED", (e as Error).message.slice(0, 120));
  }
}

main().catch((e) => console.error("FAILED:", e.message));