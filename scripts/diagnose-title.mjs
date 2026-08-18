// Ad-hoc diagnostic: answers why a specific title does or doesn't end up in
// the generated data. Run it as:  node scripts/diagnose-title.mjs "Lanterns"
//
// It reports, in order:
//   1. whether TMDB knows the title at all, and what first_air_date it has
//      (a missing or future date silently excludes it from our discover
//      queries, which bound on first_air_date.lte=today)
//   2. which providers TMDB lists for it in our region — the app can only
//      show a title that TMDB actually links to one of our four platforms
//   3. its season air dates, which is what the app sorts on
//   4. whether it actually comes back from the exact discover queries the
//      app runs, so we can tell a data gap from a query bug
import process from "node:process";

const REGION = "NL";
const LANGUAGE = "nl-NL";
const API_KEY = process.env.TMDB_API_KEY;
const PROVIDERS = { netflix: 8, prime: 119, hbomax: 1899, skyshowtime: 1773 };

if (!API_KEY) {
  console.error("TMDB_API_KEY environment variable is not set");
  process.exit(1);
}

const query = process.argv[2];
if (!query) {
  console.error('Usage: node scripts/diagnose-title.mjs "Title"');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

async function get(path, params = {}) {
  const search = new URLSearchParams({ api_key: API_KEY, ...params });
  const res = await fetch(`https://api.themoviedb.org/3${path}?${search}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

console.log(`=== Diagnosing "${query}" (region ${REGION}, today ${today}) ===\n`);

// 1. Does TMDB know it?
const search = await get("/search/tv", { query, language: LANGUAGE });
const hits = (search.results || []).slice(0, 5);
if (!hits.length) {
  console.log("TMDB search returned NO tv results for this title.");
  process.exit(0);
}
console.log("Top TMDB search hits:");
for (const h of hits) {
  console.log(`  id=${h.id} name="${h.name}" first_air_date=${h.first_air_date || "(none)"}`);
}

const show = hits[0];
console.log(`\nInspecting top hit: id=${show.id} "${show.name}"`);
console.log(`  first_air_date: ${show.first_air_date || "(none)"}`);
if (!show.first_air_date) {
  console.log("  !! No first_air_date -> excluded by our first_air_date.lte filter");
} else if (show.first_air_date > today) {
  console.log(`  !! first_air_date is in the future -> excluded by first_air_date.lte=${today}`);
}

// 2. Which providers does TMDB link in our region?
const providers = await get(`/tv/${show.id}/watch/providers`);
const regionData = (providers.results || {})[REGION];
console.log(`\nWatch providers for ${REGION}:`);
if (!regionData) {
  console.log(`  !! TMDB lists NO ${REGION} providers at all for this title.`);
} else {
  for (const kind of ["flatrate", "ads", "free", "rent", "buy"]) {
    const list = regionData[kind];
    if (list && list.length) {
      console.log(`  ${kind}: ${list.map((p) => `${p.provider_name} (id=${p.provider_id})`).join(", ")}`);
    }
  }
  const streaming = [...(regionData.flatrate || []), ...(regionData.ads || [])];
  const known = Object.entries(PROVIDERS).filter(([, id]) => streaming.some((p) => p.provider_id === id));
  console.log(known.length
    ? `  -> matches our platforms: ${known.map(([k]) => k).join(", ")}`
    : "  !! none of our four platforms match under flatrate/ads");
}

// 3. Season dates (what the app sorts on)
const detail = await get(`/tv/${show.id}`, { language: LANGUAGE });
console.log("\nSeasons:");
for (const s of detail.seasons || []) {
  console.log(`  season ${s.season_number}: air_date=${s.air_date || "(none)"}`);
}

// 4. Does it come back from the queries the app actually runs?
console.log("\nAppears in the app's discover queries?");
for (const [name, providerId] of Object.entries(PROVIDERS)) {
  for (const sortBy of ["popularity.desc", "first_air_date.desc"]) {
    let found = false;
    let scanned = 0;
    for (let page = 1; page <= 3; page++) {
      const data = await get("/discover/tv", {
        language: LANGUAGE,
        watch_region: REGION,
        with_watch_providers: String(providerId),
        with_watch_monetization_types: "flatrate|ads",
        sort_by: sortBy,
        include_adult: "false",
        page: String(page),
        "first_air_date.lte": today,
      });
      scanned += (data.results || []).length;
      if ((data.results || []).some((r) => r.id === show.id)) { found = true; break; }
      if (page >= (data.total_pages || 1)) break;
    }
    console.log(`  ${name} / ${sortBy}: ${found ? "FOUND" : "not found"} (scanned ${scanned})`);
  }
}
