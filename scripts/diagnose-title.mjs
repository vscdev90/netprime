// Ad-hoc diagnostic, round 2: the user says TMDB's own site
// (themoviedb.org/movie/1386315-the-runner) shows the film, and wants to
// know why our app still excludes it despite our last diagnostic finding
// no NL watch-provider data for it. TMDB's site defaults its "Where to
// Watch" widget to a region guessed from the visitor's IP (often US),
// not necessarily NL — so this dumps the FULL watch/providers response
// (every region TMDB has data for, not just NL) to see whether Prime
// Video shows up anywhere, and specifically whether NL has appeared
// since the last check ~10 minutes ago.
import process from "node:process";

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) {
  console.error("TMDB_API_KEY environment variable is not set");
  process.exit(1);
}

const id = process.argv[2] || "1386315";

async function get(path, params = {}) {
  const search = new URLSearchParams({ api_key: API_KEY, ...params });
  const res = await fetch(`https://api.themoviedb.org/3${path}?${search}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

console.log(`=== Full watch/providers dump for movie id=${id} ===\n`);

const detail = await get(`/movie/${id}`, { language: "nl-NL" });
console.log(`Title: "${detail.title}" (original: "${detail.original_title}")`);
console.log(`release_date: ${detail.release_date || "(none)"}`);
console.log(`status: ${detail.status}`);
console.log(`homepage: ${detail.homepage || "(none)"}`);

const providers = await get(`/movie/${id}/watch/providers`);
const regions = Object.keys(providers.results || {});
console.log(`\nRegions with ANY watch-provider data: ${regions.length ? regions.join(", ") : "(none at all)"}`);

for (const region of regions) {
  const r = providers.results[region];
  const parts = [];
  for (const kind of ["flatrate", "ads", "free", "rent", "buy"]) {
    if (r[kind]?.length) parts.push(`${kind}: ${r[kind].map((p) => p.provider_name).join(", ")}`);
  }
  console.log(`  ${region}: ${parts.join(" | ") || "(link only, no provider lists)"}`);
}

if (!regions.includes("NL")) {
  console.log("\n!! Still no NL entry at all in TMDB's watch/providers response.");
}
