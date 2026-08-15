(() => {
  "use strict";

  const REGION = "NL";
  const LANGUAGE = "nl-NL";
  const PROVIDERS = { netflix: 8, prime: 9 };
  const STORAGE_KEY = "netprime_tmdb_api_key";
  const IMG_BASE = "https://image.tmdb.org/t/p/w300";
  const MAX_PAGES = 3;

  const $ = (sel) => document.querySelector(sel);

  const els = {
    dateRange: $("#dateRange"),
    refreshBtn: $("#refreshBtn"),
    settingsBtn: $("#settingsBtn"),
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
    modal: $("#apiKeyModal"),
    apiKeyInput: $("#apiKeyInput"),
    apiKeyError: $("#apiKeyError"),
    apiKeySave: $("#apiKeySave"),
    apiKeyCancel: $("#apiKeyCancel"),
  };

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function formatDisplayDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  }

  function formatBadgeDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" });
  }

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || "";
  }

  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key);
  }

  function clearApiKey() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function openModal({ allowCancel }) {
    els.apiKeyError.hidden = true;
    els.apiKeyInput.value = getApiKey();
    els.apiKeyCancel.hidden = !allowCancel;
    els.modal.hidden = false;
    els.apiKeyInput.focus();
  }

  function closeModal() {
    els.modal.hidden = true;
  }

  async function validateKey(key) {
    const url = `https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  }

  function setDateRangeLabel() {
    const from = todayISO(0);
    const to = todayISO(7);
    els.dateRange.textContent = `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
  }

  async function fetchDiscover(mediaType, providerId) {
    const key = getApiKey();
    const from = todayISO(0);
    const to = todayISO(7);
    const queryDateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";
    const itemDateField = mediaType === "movie" ? "release_date" : "first_air_date";
    const sortBy = `${queryDateField}.asc`;

    let results = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        api_key: key,
        language: LANGUAGE,
        region: REGION,
        watch_region: REGION,
        with_watch_providers: String(providerId),
        with_watch_monetization_types: "flatrate|ads",
        sort_by: sortBy,
        include_adult: "false",
        page: String(page),
        [`${queryDateField}.gte`]: from,
        [`${queryDateField}.lte`]: to,
      });
      const url = `https://api.themoviedb.org/3/discover/${mediaType}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) throw new Error("UNAUTHORIZED");
        throw new Error(`HTTP_${res.status}`);
      }
      const data = await res.json();
      results = results.concat(data.results || []);
      if (page >= (data.total_pages || 1)) break;
    }

    return results
      .filter((item) => Boolean(item[itemDateField]))
      .sort((a, b) => {
        const da = a[itemDateField] || "";
        const db = b[itemDateField] || "";
        return da.localeCompare(db);
      });
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
      renderState(container, "Geen nieuwe releases in deze periode.");
      return;
    }
    container.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const title = mediaType === "movie" ? item.title : item.name;
      const dateISO = mediaType === "movie" ? item.release_date : item.first_air_date;
      const rating = item.vote_count > 0 ? item.vote_average.toFixed(1) : null;

      const a = document.createElement("a");
      a.className = "card";
      a.href = `https://www.themoviedb.org/${mediaType}/${item.id}?language=${LANGUAGE}`;
      a.target = "_blank";
      a.rel = "noopener";

      const posterWrap = document.createElement("div");
      posterWrap.className = "poster-wrap";

      if (item.poster_path) {
        const img = document.createElement("img");
        img.src = `${IMG_BASE}${item.poster_path}`;
        img.alt = title || "";
        img.loading = "lazy";
        posterWrap.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "poster-placeholder";
        ph.textContent = mediaType === "movie" ? "🎬" : "📺";
        posterWrap.appendChild(ph);
      }

      if (dateISO) {
        const badge = document.createElement("span");
        badge.className = "badge-date";
        badge.textContent = formatBadgeDate(dateISO);
        posterWrap.appendChild(badge);
      }

      if (rating) {
        const rb = document.createElement("span");
        rb.className = "badge-rating";
        rb.textContent = `★ ${rating}`;
        posterWrap.appendChild(rb);
      }

      const body = document.createElement("div");
      body.className = "card-body";
      const h3 = document.createElement("p");
      h3.className = "card-title";
      h3.textContent = title || "Onbekende titel";
      body.appendChild(h3);

      a.appendChild(posterWrap);
      a.appendChild(body);
      frag.appendChild(a);
    }
    container.appendChild(frag);
  }

  async function loadAll() {
    if (!getApiKey()) {
      openModal({ allowCancel: false });
      return;
    }

    setDateRangeLabel();

    const jobs = [
      { mediaType: "movie", provider: "netflix", container: els.grids["movie-netflix"] },
      { mediaType: "movie", provider: "prime", container: els.grids["movie-prime"] },
      { mediaType: "tv", provider: "netflix", container: els.grids["tv-netflix"] },
      { mediaType: "tv", provider: "prime", container: els.grids["tv-prime"] },
    ];

    jobs.forEach((j) => renderSkeleton(j.container));

    await Promise.all(
      jobs.map(async (j) => {
        try {
          const items = await fetchDiscover(j.mediaType, PROVIDERS[j.provider]);
          renderItems(j.container, items, j.mediaType);
        } catch (err) {
          if (err.message === "UNAUTHORIZED") {
            clearApiKey();
            renderState(j.container, "Ongeldige API key.", true);
            openModal({ allowCancel: false });
          } else {
            renderState(j.container, "Kon gegevens niet laden. Probeer het later opnieuw.", true);
          }
        }
      })
    );
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

  function setupModal() {
    els.settingsBtn.addEventListener("click", () => openModal({ allowCancel: !!getApiKey() }));
    els.apiKeyCancel.addEventListener("click", () => closeModal());

    els.apiKeySave.addEventListener("click", async () => {
      const key = els.apiKeyInput.value.trim();
      if (!key) {
        els.apiKeyError.textContent = "Voer een API key in.";
        els.apiKeyError.hidden = false;
        return;
      }
      els.apiKeySave.disabled = true;
      els.apiKeySave.textContent = "Controleren…";
      els.apiKeyError.hidden = true;
      try {
        const ok = await validateKey(key);
        if (!ok) throw new Error("invalid");
        setApiKey(key);
        closeModal();
        loadAll();
      } catch {
        els.apiKeyError.textContent = "Deze API key lijkt niet geldig te zijn. Controleer en probeer opnieuw.";
        els.apiKeyError.hidden = false;
      } finally {
        els.apiKeySave.disabled = false;
        els.apiKeySave.textContent = "Opslaan & laden";
      }
    });

    els.apiKeyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") els.apiKeySave.click();
    });
  }

  function setupRefresh() {
    els.refreshBtn.addEventListener("click", () => loadAll());
  }

  setupTabs();
  setupModal();
  setupRefresh();
  setDateRangeLabel();
  loadAll();
})();
