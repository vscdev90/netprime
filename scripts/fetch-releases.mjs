import { mkdir, readFile, writeFile } from "node:fs/promises";

// v2: bumped after adding oEmbed verification (see fetchTrailerKey) so
// entries cached under v1 — never checked for actually being embeddable —
// don't get trusted forever. Using a new filename here is a cheap way to
// invalidate the old cache without needing to touch the GitHub Actions
// cache storage directly: the actions/cache restore step still succeeds
// (it restores the whole .cache/ dir), but this file just won't exist in
// it yet, so loadTrailerCache() starts fresh and every trailer gets
// re-verified once.
const CACHE_PATH = ".cache/tmdb-details-v2.json";

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

// All TMDB calls go through this: a global concurrency cap plus retry-on-429
// with backoff. Between the per-platform discover calls and the per-item
// season/trailer lookups, this script can fan out to hundreds of requests —
// firing them all at once reliably triggers TMDB's rate limit.
const MAX_CONCURRENT = 6;
let activeRequests = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeRequests < MAX_CONCURRENT) {
      activeRequests++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });
}

function releaseSlot() {
  activeRequests--;
  const next = waitQueue.shift();
  if (next) {
    activeRequests++;
    next();
  }
}

async function throttledFetch(url, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await acquireSlot();
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 1;
        await new Promise((r) => setTimeout(r, (retryAfter + attempt) * 1000));
        continue;
      }
      return res;
    } finally {
      releaseSlot();
    }
  }
  throw new Error(`Request rate-limited after ${retries} retries: ${url}`);
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

// Persisted across workflow runs via actions/cache (see pages.yml), keyed by
// "movieType:id". Trailer keys are safe to cache indefinitely — a trailer,
// once published, doesn't change. Season air-dates are deliberately NOT
// cached here even though they're fetched just as often: caching them risks
// serving a stale date once a show gets an actual new season, which would
// silently reintroduce the exact "new season sorts as if it's years old"
// bug this app was built to avoid.
let trailerCache = {};

async function loadTrailerCache() {
  try {
    trailerCache = JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch {
    trailerCache = {};
  }
}

async function saveTrailerCache() {
  await mkdir(".cache", { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(trailerCache));
}

// TMDB's video listing includes entries that don't actually play — removed,
// private, or plain mismatched videos (a real-world example: TMDB's only
// "trailer" for a stand-up special turned out not to correspond to a real
// published trailer at all). YouTube's oEmbed endpoint reports whether a
// video genuinely exists and can be embedded without needing an API key;
// it 404s/401s for deleted, private, or embedding-disabled videos. Checking
// this at build time means a broken match just gets skipped (falls through
// to the next candidate, or no trailer at all) instead of showing a button
// that fails for every visitor who clicks it.
async function isEmbeddable(key) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${key}`)}&format=json`;
    const res = await throttledFetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

// Trailers are almost always only tagged as English on TMDB even for
// non-English titles, so this deliberately doesn't pass a language
// filter — doing so would silently return zero results most of the time.
async function fetchTrailerKey(mediaType, id) {
  const cacheKey = `${mediaType}:${id}`;
  if (cacheKey in trailerCache) return trailerCache[cacheKey];

  const res = await throttledFetch(`https://api.themoviedb.org/3/${mediaType}/${id}/videos?api_key=${API_KEY}`);
  if (!res.ok) return null;
  const data = await res.json();
  const videos = (data.results || []).filter((v) => v.site === "YouTube");

  const officialTrailers = videos.filter((v) => v.type === "Trailer" && v.official);
  const otherTrailers = videos.filter((v) => v.type === "Trailer" && !v.official);
  const teasers = videos.filter((v) => v.type === "Teaser");
  const picked = new Set([...officialTrailers, ...otherTrailers, ...teasers]);
  const rest = videos.filter((v) => !picked.has(v));
  const candidates = [...officialTrailers, ...otherTrailers, ...teasers, ...rest];

  for (const candidate of candidates) {
    if (await isEmbeddable(candidate.key)) {
      // Only cache a confirmed-working hit — a title without one yet might
      // get a real trailer added later (e.g. an upcoming release), or a
      // currently-broken match might get corrected on TMDB's side, so keep
      // retrying those instead of caching a permanent "no trailer".
      trailerCache[cacheKey] = candidate.key;
      return candidate.key;
    }
  }
  return null;
}

async function enrichWithTrailers(items, mediaType) {
  return Promise.all(
    items.map(async (item) => ({ ...item, trailerKey: await fetchTrailerKey(mediaType, item.id) }))
  );
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
    const res = await throttledFetch(`https://api.themoviedb.org/3/discover/movie?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`TMDB request failed (movie, provider ${providerId}, page ${page}): ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    results = results.concat(data.results || []);
    if (page >= (data.total_pages || 1)) break;
  }

  const items = results
    .filter((item) => Boolean(item.release_date))
    .sort((a, b) => b.release_date.localeCompare(a.release_date))
    .map((item) => toItem(item, "movie", item.release_date))
    .slice(0, RESULT_CAP);

  return enrichWithTrailers(items, "movie");
}

// TMDB's discover/tv only exposes a show's first-ever season premiere
// date, so a returning show (e.g. a new season of an existing series)
// always sorts as if it were as old as its very first season. To rank
// by the actual newest content, fetch each candidate's season list and
// use the most recent already-aired season date instead.
async function fetchLatestSeasonDate(tvId, today) {
  const res = await throttledFetch(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=${LANGUAGE}`);
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
    const res = await throttledFetch(`https://api.themoviedb.org/3/discover/tv?${params.toString()}`);
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

  const items = withDates
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RESULT_CAP);

  return enrichWithTrailers(items, "tv");
}

async function main() {
  const today = todayISO();
  const platformKeys = Object.keys(PROVIDERS);

  await loadTrailerCache();
  const cachedCountBefore = Object.keys(trailerCache).length;

  const movieResults = await Promise.all(
    platformKeys.map((key) => fetchMovies(PROVIDERS[key].id, today))
  );
  const tvResults = await Promise.all(
    platformKeys.map((key) => fetchTv(PROVIDERS[key].id, today))
  );

  await saveTrailerCache();
  console.log(`Trailer cache: ${cachedCountBefore} entries loaded, ${Object.keys(trailerCache).length} entries saved.`);

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
