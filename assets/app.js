(() => {
  "use strict";

  const DATA_URL = "assets/data/releases.json";
  const IMG_BASE = "https://image.tmdb.org/t/p/w300";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    dateRange: $("#dateRange"),
    refreshBtn: $("#refreshBtn"),
    updatedAt: $("#updatedAt"),
    updatedAtBase: $("#updatedAt").textContent,
    tabs: document.querySelectorAll(".tab-btn"),
    panels: {
      movie: $("#panel-movie"),
      tv: $("#panel-tv"),
    },
    grids: {
      "movie-netflix": $("#movie-netflix"),
      "movie-prime": $("#movie-prime"),
      "tv-netflix": $("#tv-netflix"),
      "tv-prime": $("#tv-prime"),
    },
  };

  function formatMonthLabel(isoDate) {
    const d = new Date(isoDate + "T00:00:00Z");
    const label = d.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function formatBadgeDate(isoDate) {
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  }

  function formatUpdatedAt(isoDateTime) {
    const d = new Date(isoDateTime);
    return d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderSkeleton(container, count = 6) {
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "card skeleton";
      el.innerHTML = `<div class="poster-wrap"></div><div class="card-body"></div>`;
      container.appendChild(el);
    }
  }

  function renderState(container, message, isError = false) {
    container.innerHTML = `<p class="state-msg${isError ? " error" : ""}">${message}</p>`;
  }

  function renderItems(container, items, mediaType) {
    if (!items.length) {
      renderState(container, "Geen releases gevonden deze maand.");
      return;
    }
    container.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const a = document.createElement("a");
      a.className = "card";
      a.href = `https://www.themoviedb.org/${mediaType}/${item.id}?language=nl-NL`;
      a.target = "_blank";
      a.rel = "noopener";

      const posterWrap = document.createElement("div");
      posterWrap.className = "poster-wrap";

      if (item.posterPath) {
        const img = document.createElement("img");
        img.src = `${IMG_BASE}${item.posterPath}`;
        img.alt = item.title || "";
        img.loading = "lazy";
        posterWrap.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "poster-placeholder";
        ph.textContent = mediaType === "movie" ? "🎬" : "📺";
        posterWrap.appendChild(ph);
      }

      if (item.date) {
        const badge = document.createElement("span");
        badge.className = "badge-date";
        badge.textContent = formatBadgeDate(item.date);
        posterWrap.appendChild(badge);
      }

      if (item.rating) {
        const rb = document.createElement("span");
        rb.className = "badge-rating";
        rb.textContent = `★ ${item.rating}`;
        posterWrap.appendChild(rb);
      }

      const body = document.createElement("div");
      body.className = "card-body";
      const h3 = document.createElement("p");
      h3.className = "card-title";
      h3.textContent = item.title || "Onbekende titel";
      body.appendChild(h3);

      a.appendChild(posterWrap);
      a.appendChild(body);
      frag.appendChild(a);
    }
    container.appendChild(frag);
  }

  async function loadAll() {
    Object.values(els.grids).forEach((container) => renderSkeleton(container));

    let data;
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      data = await res.json();
    } catch (err) {
      const message = "Kon releasegegevens niet laden. Probeer het later opnieuw.";
      Object.values(els.grids).forEach((container) => renderState(container, message, true));
      return;
    }

    els.dateRange.textContent = formatMonthLabel(data.range.from);

    renderItems(els.grids["movie-netflix"], data.movie.netflix, "movie");
    renderItems(els.grids["movie-prime"], data.movie.prime, "movie");
    renderItems(els.grids["tv-netflix"], data.tv.netflix, "tv");
    renderItems(els.grids["tv-prime"], data.tv.prime, "tv");

    if (data.generatedAt) {
      els.updatedAt.textContent = `Laatst bijgewerkt: ${formatUpdatedAt(data.generatedAt)} · ${els.updatedAtBase}`;
    }
  }

  function setupTabs() {
    els.tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        els.tabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        Object.values(els.panels).forEach((p) => p.classList.remove("active"));
        els.panels[btn.dataset.tab].classList.add("active");
      });
    });
  }

  function setupRefresh() {
    els.refreshBtn.addEventListener("click", () => loadAll());
  }

  setupTabs();
  setupRefresh();
  loadAll();
})();
