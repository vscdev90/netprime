# NetPrime

Statische web-app die de nieuwste film- en serie-releases op Netflix en Prime Video toont voor de huidige kalendermaand. Films en series staan gescheiden, en per categorie zijn Netflix en Prime Video apart weergegeven.

Live op GitHub Pages: `https://<gebruikersnaam>.github.io/<repo>/`

## Hoe het werkt

- De browser laadt alleen statische bestanden (HTML/CSS/JS + een gegenereerd JSON-bestand) — geen API-key of andere geheimen komen ooit in de browser terecht.
- Databron: de gratis [TMDB API](https://www.themoviedb.org/documentation/api) (`discover/movie` en `discover/tv`, gefilterd op releasedatum binnen de huidige kalendermaand + Netflix/Prime Video beschikbaarheid in regio NL).
- Bij elke deploy haalt een GitHub Actions workflow (`scripts/fetch-releases.mjs`) deze data server-side op met een TMDB API key uit een **repository secret**, en schrijft het resultaat naar `assets/data/releases.json`. Dat bestand wordt vervolgens gepubliceerd naar GitHub Pages — de key zelf verlaat de Actions-runner nooit.
- De workflow draait automatisch bij elke push naar `main`, dagelijks om 05:00 UTC (cron), en is ook handmatig te starten via **Actions → Deploy GitHub Pages → Run workflow**.

### Eenmalige setup: TMDB API key als secret toevoegen

1. Maak een gratis account op [themoviedb.org](https://www.themoviedb.org/signup)
2. Ga naar **Instellingen → API** en vraag een "API Key (v3 auth)" aan
3. Ga in deze GitHub-repo naar **Settings → Secrets and variables → Actions → New repository secret**
4. Naam: `TMDB_API_KEY`, waarde: je TMDB key
5. De eerstvolgende workflow-run (push, cron, of handmatig gestart) gebruikt automatisch deze key

## Beperking

TMDB registreert geen exacte "toegevoegd aan Netflix/Prime"-datum. De app filtert daarom op de officiële release-/premièredatum van de titel binnen de huidige kalendermaand, gecombineerd met actuele Netflix/Prime-beschikbaarheid in Nederland. Voor vervolgseizoenen van bestaande series gebruikt TMDB de datum van het allereerste seizoen, dus nieuwe seizoenen van lopende series kunnen ontbreken. Een venster van 7 dagen vooruit bleek in de praktijk vrijwel altijd leeg, omdat toekomstige releases doorgaans nog niet als "nu beschikbaar" op een platform staan; een volledige maand levert wél bruikbare resultaten op.

## Lokaal draaien

```bash
TMDB_API_KEY=jouw_key node scripts/fetch-releases.mjs   # genereert assets/data/releases.json
python3 -m http.server 8000
```

en ga naar `http://localhost:8000`. Vereist Node.js 18+ (gebruikt de ingebouwde `fetch`).
