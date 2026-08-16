import { mkdir, writeFile } from "node:fs/promises";

const REGION = "NL";
const LANGUAGE = "nl-NL";
const MAX_PAGES = 2;
const PROVIDERS = { netflix: 8, prime: 9 };
const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
  console.error("TMDB_API_KEY environment variable is not set");
  process.exit(1);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchCategory(mediaType, providerId, today) {
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
      [`${queryDateField}.lte`]: today,
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
      overview: item.overview || null,
    }));
}

async function logProviderDiagnostics() {
  const res = await fetch(
    `https://api.themoviedb.org/3/watch/providers/movie?api_key=${API_KEY}&language=${LANGUAGE}&watch_region=${REGION}`
  );
  if (!res.ok) {
    console.log(`DIAGNOSTIC: provider list request failed: ${res.status}`);
    return;
  }
  const data = await res.json();
  const matches = (data.results || []).filter((p) =>
    /prime|amazon|netflix/i.test(p.provider_name)
  );
  console.log(`DIAGNOSTIC: watch providers for ${REGION} matching prime/amazon/netflix:`);
  for (const p of matches) {
    console.log(`  id=${p.provider_id} name="${p.provider_name}"`);
  }
}

async function main() {
  const today = todayISO();

  await logProviderDiagnostics();

  const [movieNetflix, moviePrime, tvNetflix, tvPrime] = await Promise.all([
    fetchCategory("movie", PROVIDERS.netflix, today),
    fetchCategory("movie", PROVIDERS.prime, today),
    fetchCategory("tv", PROVIDERS.netflix, today),
    fetchCategory("tv", PROVIDERS.prime, today),
  ]);

  const output = {
    generatedAt: new Date().toISOString(),
    region: REGION,
    movie: { netflix: movieNetflix, prime: moviePrime },
    tv: { netflix: tvNetflix, prime: tvPrime },
  };

  await mkdir("assets/data", { recursive: true });
  await writeFile("assets/data/releases.json", JSON.stringify(output, null, 2));
  console.log(`Wrote assets/data/releases.json (as of ${today}):`);
  console.log(`  movie/netflix: ${movieNetflix.length}, movie/prime: ${moviePrime.length}`);
  console.log(`  tv/netflix: ${tvNetflix.length}, tv/prime: ${tvPrime.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
