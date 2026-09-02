// Ad-hoc diagnostic: answers why a specific title does or doesn't end up in
// the generated data. Run it as:  node scripts/diagnose-title.mjs "The Runner"
//
// Unlike the earlier one-off version of this script, it doesn't assume the
// title is a TV show or a movie — it searches both, since a query like "The
// Runner" matches titles of either kind on TMDB.
//
// For each media type where TMDB has a hit, it reports:
//   1. whether TMDB knows the title, and what release/first_air date it has
//      (a missing or future date silently excludes it from our discover
//      queries, which bound on primary_release_date.lte / first_air_date.lte)
//   2. which providers TMDB lists for it in our region — the app can only
//      show a title that TMDB actually links to one of our four platforms
//   3. (tv only) its season air dates, which is what the app sorts on
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

function name(mediaType, item) {
  return mediaType === "movie" ? item.title : item.name;
}

function dateField(mediaType) {
  return mediaType === "movie" ? "release_date" : "first_air_date";
}

async function diagnoseMediaType(mediaType) {
  const dateKey = dateField(mediaType);
  const search = await get(`/search/${mediaType}`, { query, language: LANGUAGE });
  const hits = (search.results || []).slice(0, 5);
  if (!hits.length) {
    console.log(`TMDB search returned NO ${mediaType} results for this title.`);
    return;
  }
  console.log(`Top TMDB ${mediaType} search hits:`);
  for (const h of hits) {
    console.log(`  id=${h.id} name="${name(mediaType, h)}" ${dateKey}=${h[dateKey] || "(none)"}`);
  }

  // TMDB's search ranks by relevance/popularity, not exact-title match, so
  // the top hit for "The Runner" was "The Maze Runner" (an unrelated,
  // more popular title) rather than either film actually named "The
  // Runner". Inspect every exact (case-insensitive) title match, since more
  // than one can exist (a 2015 film and one releasing 2026-09-17, here) and
  // any of them could be the one the user actually means.
  const exact = hits.filter((h) => name(mediaType, h).toLowerCase() === query.toLowerCase());
  const candidates = exact.length ? exact : [hits[0]];
  for (const show of candidates) {
    await inspect(mediaType, dateKey, show);
  }
}

async function inspect(mediaType, dateKey, show) {
  console.log(`\nInspecting hit: id=${show.id} "${name(mediaType, show)}"`);
  console.log(`  ${dateKey}: ${show[dateKey] || "(none)"}`);
  if (!show[dateKey]) {
    console.log(`  !! No ${dateKey} -> excluded by our ${dateKey}.lte filter`);
  } else if (show[dateKey] > today) {
    console.log(`  !! ${dateKey} is in the future -> excluded by ${dateKey}.lte=${today}`);
  }

  // Which providers does TMDB link in our region?
  const providers = await get(`/${mediaType}/${show.id}/watch/providers`);
  const regionData = (providers.results || {})[REGION];
  console.log(`\nWatch providers for ${REGION}:`);
  let known = [];
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
    known = Object.entries(PROVIDERS).filter(([, id]) => streaming.some((p) => p.provider_id === id));
    console.log(known.length
      ? `  -> matches our platforms: ${known.map(([k]) => k).join(", ")}`
      : "  !! none of our four platforms match under flatrate/ads");
  }

  if (mediaType === "tv") {
    const detail = await get(`/tv/${show.id}`, { language: LANGUAGE });
    console.log("\nSeasons:");
    for (const s of detail.seasons || []) {
      console.log(`  season ${s.season_number}: air_date=${s.air_date || "(none)"}`);
    }
  }

  // Does it come back from the queries the app actually runs?
  console.log("\nAppears in the app's discover queries?");
  const sortOptions = mediaType === "movie" ? ["primary_release_date.desc"] : ["popularity.desc", "first_air_date.desc"];
  for (const [platformName, providerId] of Object.entries(PROVIDERS)) {
    for (const sortBy of sortOptions) {
      let found = false;
      let scanned = 0;
      for (let page = 1; page <= 3; page++) {
        const data = await get(`/discover/${mediaType}`, {
          language: LANGUAGE,
          watch_region: REGION,
          with_watch_providers: String(providerId),
          with_watch_monetization_types: "flatrate|ads",
          sort_by: sortBy,
          include_adult: "false",
          page: String(page),
          [`${dateKey}.lte`]: today,
        });
        scanned += (data.results || []).length;
        if ((data.results || []).some((r) => r.id === show.id)) { found = true; break; }
        if (page >= (data.total_pages || 1)) break;
      }
      console.log(`  ${platformName} / ${sortBy}: ${found ? "FOUND" : "not found"} (scanned ${scanned})`);
    }
  }
}

console.log(`=== Diagnosing "${query}" (region ${REGION}, today ${today}) ===\n`);
await diagnoseMediaType("movie");
console.log("\n---\n");
await diagnoseMediaType("tv");
