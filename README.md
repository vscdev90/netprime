# NetPrime

Statische web-app die de nieuwste film- en serie-releases op Netflix en Prime Video toont voor de huidige kalendermaand. Films en series staan gescheiden, en per categorie zijn Netflix en Prime Video apart weergegeven.

Live op GitHub Pages: `https://<gebruikersnaam>.github.io/<repo>/`

## Hoe het werkt

- Puur client-side (HTML/CSS/JS), geen backend nodig — geschikt voor GitHub Pages.
- Databron: de gratis [TMDB API](https://www.themoviedb.org/documentation/api) (`discover/movie` en `discover/tv`, gefilterd op releasedatum + Netflix/Prime Video beschikbaarheid in regio NL).
- Bij het eerste bezoek vraagt de app om een gratis TMDB API key (v3). Die wordt alleen lokaal opgeslagen in `localStorage` van de browser van de bezoeker — nooit in de code of op een server.

### Een TMDB API key aanmaken

1. Maak een gratis account op [themoviedb.org](https://www.themoviedb.org/signup)
2. Ga naar **Instellingen → API** en vraag een "API Key (v3 auth)" aan
3. Plak de key in de app wanneer daarom gevraagd wordt

## Beperking

TMDB registreert geen exacte "toegevoegd aan Netflix/Prime"-datum. De app filtert daarom op de officiële release-/premièredatum van de titel binnen de huidige kalendermaand, gecombineerd met actuele Netflix/Prime-beschikbaarheid in Nederland. Voor vervolgseizoenen van bestaande series gebruikt TMDB de datum van het allereerste seizoen, dus nieuwe seizoenen van lopende series kunnen ontbreken. Een venster van 7 dagen vooruit bleek in de praktijk vrijwel altijd leeg, omdat toekomstige releases doorgaans nog niet als "nu beschikbaar" op een platform staan; een volledige maand levert wél bruikbare resultaten op.

## Lokaal draaien

Geen build-stap nodig. Open `index.html` via een lokale server, bijvoorbeeld:

```bash
python3 -m http.server 8000
```

en ga naar `http://localhost:8000`.
