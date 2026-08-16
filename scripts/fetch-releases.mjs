import { mkdir, writeFile } from "node:fs/promises";

const REGION = "NL";
const LANGUAGE = "nl-NL";
const MAX_PAGES = 2;
const TV_CANDIDATE_PAGES = 3;
const RESULT_CAP = 40;
// Provider IDs confirmed per-region via GET /3/watch/providers/movie?watch_region=NL
// rather than guessed — TMDB's IDs for the same service can differ by region
// (Amazon Prime Video is id 9 elsewhere, but 119 in NL; id 9 isn't linked to NL
// at all, which silently returned zero results before this was caught).
const PROVIDERS = {
  netflix: { id: 8, label: "Netflix" },
  prime: { id: 119, label: "Prime Video" },
  hbomax: { id: 1899, label: "HBO Max" },
  skyshowtime: { id: 1773, label: "SkyShowtime" },
};
const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
  console.error("TMDB_API_KEY environment variable is not set");
  process.exit(1);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toItem(item, mediaType, date) {
  return {
    id: item.id,
    title: mediaType === "movie" ? item.title : item.name,
    date,
    posterPath: item.poster_path || null,
    rating: item.vote_count > 0 ? Number(item.vote_average.toFixed(1)) : null,
    overview: item.overview || null,
  };
}

async function fetchMovies(providerId, today) {
  let results = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      api_key: API_KEY,
      language: LANGUAGE,
      region: REGION,
      watch_region: REGION,
      with_watch_providers: String(providerId),
      with_watch_monetization_types: "flatrate|ads",
      sort_by: "primary_release_date.desc",
      include_adult: "false",
      page: String(page),
      "primary_release_date.lte": today,
    });
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`TMDB request failed (movie, provider ${providerId}, page ${page}): ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    results = results.concat(data.results || []);
    if (page >= (data.total_pages || 1)) break;
  }

  return results
    .filter((item) => Boolean(item.release_date))
    .sort((a, b) => b.release_date.localeCompare(a.release_date))
    .map((item) => toItem(item, "movie", item.release_date))
    .slice(0, RESULT_CAP);
}

// TMDB's discover/tv only exposes a show's first-ever season premiere
// date, so a returning show (e.g. a new season of an existing series)
// always sorts as if it were as old as its very first season. To rank
// by the actual newest content, fetch each candidate's season list and
// use the most recent already-aired season date instead.
async function fetchLatestSeasonDate(tvId, today) {
  const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=${LANGUAGE}`);
  if (!res.ok) return null;
  const data = await res.json();
  const dates = (data.seasons || [])
    .map((s) => s.air_date)
    .filter((d) => d && d <= today);
  if (!dates.length) return null;
  return dates.sort().at(-1);
}

async function fetchTv(providerId, today) {
  let candidates = [];
  for (let page = 1; page <= TV_CANDIDATE_PAGES; page++) {
    const params = new URLSearchParams({
      api_key: API_KEY,
      language: LANGUAGE,
      watch_region: REGION,
      with_watch_providers: String(providerId),
      with_watch_monetization_types: "flatrate|ads",
      sort_by: "popularity.desc",
      include_adult: "false",
      page: String(page),
      "first_air_date.lte": today,
    });
    const res = await fetch(`https://api.themoviedb.org/3/discover/tv?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`TMDB request failed (tv, provider ${providerId}, page ${page}): ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    candidates = candidates.concat(data.results || []);
    if (page >= (data.total_pages || 1)) break;
  }

  const withDates = await Promise.all(
    candidates.map(async (item) => {
      const seasonDate = await fetchLatestSeasonDate(item.id, today);
      const date = seasonDate || item.first_air_date || null;
      return date ? toItem(item, "tv", date) : null;
    })
  );

  return withDates
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RESULT_CAP);
}

async function main() {
  const today = todayISO();
  const platformKeys = Object.keys(PROVIDERS);

  const movieResults = await Promise.all(
    platformKeys.map((key) => fetchMovies(PROVIDERS[key].id, today))
  );
  const tvResults = await Promise.all(
    platformKeys.map((key) => fetchTv(PROVIDERS[key].id, today))
  );

  const movie = {};
  const tv = {};
  platformKeys.forEach((key, i) => {
    movie[key] = movieResults[i];
    tv[key] = tvResults[i];
  });

  const output = {
    generatedAt: new Date().toISOString(),
    region: REGION,
    movie,
    tv,
  };

  await mkdir("assets/data", { recursive: true });
  await writeFile("assets/data/releases.json", JSON.stringify(output, null, 2));
  console.log(`Wrote assets/data/releases.json (as of ${today}):`);
  platformKeys.forEach((key) => {
    console.log(`  ${key}: movie=${movie[key].length}, tv=${tv[key].length}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
