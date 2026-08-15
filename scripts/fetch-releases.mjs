import { mkdir, writeFile } from "node:fs/promises";

const REGION = "NL";
const LANGUAGE = "nl-NL";
const MAX_PAGES = 3;
const PROVIDERS = { netflix: 8, prime: 9 };
const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
  console.error("TMDB_API_KEY environment variable is not set");
  process.exit(1);
}

function monthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function fetchCategory(mediaType, providerId, from, to) {
  const queryDateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";
  const itemDateField = mediaType === "movie" ? "release_date" : "first_air_date";

  let results = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      api_key: API_KEY,
      language: LANGUAGE,
      region: REGION,
      watch_region: REGION,
      with_watch_providers: String(providerId),
      with_watch_monetization_types: "flatrate|ads",
      sort_by: `${queryDateField}.desc`,
      include_adult: "false",
      page: String(page),
      [`${queryDateField}.gte`]: from,
      [`${queryDateField}.lte`]: to,
    });
    const res = await fetch(`https://api.themoviedb.org/3/discover/${mediaType}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`TMDB request failed (${mediaType}, provider ${providerId}, page ${page}): ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    results = results.concat(data.results || []);
    if (page >= (data.total_pages || 1)) break;
  }

  return results
    .filter((item) => Boolean(item[itemDateField]))
    .sort((a, b) => (b[itemDateField] || "").localeCompare(a[itemDateField] || ""))
    .map((item) => ({
      id: item.id,
      title: mediaType === "movie" ? item.title : item.name,
      date: item[itemDateField],
      posterPath: item.poster_path || null,
      rating: item.vote_count > 0 ? Number(item.vote_average.toFixed(1)) : null,
    }));
}

async function main() {
  const { from, to } = monthRange();

  const [movieNetflix, moviePrime, tvNetflix, tvPrime] = await Promise.all([
    fetchCategory("movie", PROVIDERS.netflix, from, to),
    fetchCategory("movie", PROVIDERS.prime, from, to),
    fetchCategory("tv", PROVIDERS.netflix, from, to),
    fetchCategory("tv", PROVIDERS.prime, from, to),
  ]);

  const output = {
    generatedAt: new Date().toISOString(),
    region: REGION,
    range: { from, to },
    movie: { netflix: movieNetflix, prime: moviePrime },
    tv: { netflix: tvNetflix, prime: tvPrime },
  };

  await mkdir("assets/data", { recursive: true });
  await writeFile("assets/data/releases.json", JSON.stringify(output, null, 2));
  console.log(`Wrote assets/data/releases.json (${movieNetflix.length + moviePrime.length + tvNetflix.length + tvPrime.length} items, range ${from} to ${to})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
