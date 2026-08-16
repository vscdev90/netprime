# NetPrime

Statische web-app die laat zien wat er momenteel op Netflix, Prime Video, HBO Max en SkyShowtime staat, gesorteerd op releasedatum (nieuwste eerst). Films en series staan gescheiden, elk platform heeft een eigen kolom, en met de filterknoppen kun je naar één platform inzoomen. Klik op een titel voor een popup met poster, releasedatum, rating en synopsis.

Live op GitHub Pages: `https://<gebruikersnaam>.github.io/<repo>/`

## Hoe het werkt

- De browser laadt alleen statische bestanden (HTML/CSS/JS + een gegenereerd JSON-bestand) — geen API-key of andere geheimen komen ooit in de browser terecht.
- Databron: de gratis [TMDB API](https://www.themoviedb.org/documentation/api) (`discover/movie` en `discover/tv`, gefilterd op actuele beschikbaarheid per platform in regio NL, gesorteerd op releasedatum aflopend). Platform-IDs staan in `scripts/fetch-releases.mjs` en zijn per regio geverifieerd via `GET /3/watch/providers/movie?watch_region=NL` — TMDB's ID voor dezelfde dienst kan namelijk per regio verschillen (Prime Video is bijvoorbeeld 119 in NL, niet het vaker genoemde 9).
- Bij elke deploy haalt een GitHub Actions workflow (`scripts/fetch-releases.mjs`) deze data server-side op met een TMDB API key uit een **repository secret**, en schrijft het resultaat naar `assets/data/releases.json`. Dat bestand wordt vervolgens gepubliceerd naar GitHub Pages — de key zelf verlaat de Actions-runner nooit.
- De workflow draait automatisch bij elke push naar `main`, dagelijks om 05:00 UTC (cron), en is ook handmatig te starten via **Actions → Deploy GitHub Pages → Run workflow**.

### Eenmalige setup: TMDB API key als secret toevoegen

1. Maak een gratis account op [themoviedb.org](https://www.themoviedb.org/signup)
2. Ga naar **Instellingen → API** en vraag een "API Key (v3 auth)" aan
3. Ga in deze GitHub-repo naar **Settings → Secrets and variables → Actions → New repository secret**
4. Naam: `TMDB_API_KEY`, waarde: je TMDB key
5. De eerstvolgende workflow-run (push, cron, of handmatig gestart) gebruikt automatisch deze key

## Beperkingen

TMDB registreert geen exacte "toegevoegd aan Netflix/Prime"-datum, en de app kan er dus niet op filteren. In plaats daarvan toont de app alle titels die momenteel op het platform staan (in regio NL), gesorteerd op hun officiële release-/premièredatum. Twee gevolgen daarvan:

- **"Nieuwste" betekent hier "nieuwste releasedatum onder wat er nu op staat"**, niet per se "deze week toegevoegd". Een film uit 2024 die deze maand pas aan Prime is toegevoegd, kan dus tussen recentere titels staan als er niets recenters beschikbaar is.
- **Nieuwe seizoenen van bestaande series verschijnen mogelijk niet** bovenaan (of helemaal niet), omdat TMDB voor series alleen de premièredatum van het allereerste seizoen bijhoudt, niet per seizoen.

Eerdere pogingen (venster van 7 dagen vooruit, of gefilterd op de huidige kalendermaand) bleken in de praktijk vaak leeg — vooral voor Prime Video, waarvan de meeste content al langer bestaat en pas recent is toegevoegd. Sorteren zonder datumfilter levert betrouwbaar bruikbare resultaten op.

### Nieuw platform toevoegen

1. Zoek het juiste `provider_id` op voor de gewenste regio — **niet** een ID van een ander land aannemen. Voeg tijdelijk een `console.log` toe die `GET /3/watch/providers/movie?watch_region=NL` opvraagt en filtert op de naam van de dienst, draai de workflow, en lees het echte ID uit de Actions-logs.
2. Voeg een entry toe aan de `PROVIDERS`-object in `scripts/fetch-releases.mjs`.
3. Voeg een knop toe aan `.platform-filter` en een kolom (met bijpassend `data-platform`-attribuut) per tab in `index.html`, plus een kleur in `assets/style.css`.

## Lokaal draaien

```bash
TMDB_API_KEY=jouw_key node scripts/fetch-releases.mjs   # genereert assets/data/releases.json
python3 -m http.server 8000
```

en ga naar `http://localhost:8000`. Vereist Node.js 18+ (gebruikt de ingebouwde `fetch`).
