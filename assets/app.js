(() => {
  "use strict";

  const DATA_URL = "assets/data/releases.json";
  const IMG_BASE = "https://image.tmdb.org/t/p/w300";
  const PLATFORMS = ["netflix", "prime", "hbomax", "skyshowtime"];
  const MEDIA_TYPES = ["movie", "tv"];

  const $ = (sel) => document.querySelector(sel);

  const grids = {};
  MEDIA_TYPES.forEach((mediaType) => {
    PLATFORMS.forEach((platform) => {
      grids[`${mediaType}-${platform}`] = $(`#${mediaType}-${platform}`);
    });
  });

  const els = {
    refreshBtn: $("#refreshBtn"),
    updatedAt: $("#updatedAt"),
    updatedAtBase: $("#updatedAt").textContent,
    tabs: document.querySelectorAll(".tab-btn"),
    platformBtns: document.querySelectorAll(".platform-btn"),
    columns: document.querySelectorAll(".columns"),
    panels: {
      movie: $("#panel-movie"),
      tv: $("#panel-tv"),
    },
    grids,
    detailModal: $("#detailModal"),
    detailClose: $("#detailClose"),
    detailPosterWrap: $("#detailPosterWrap"),
    detailPoster: $("#detailPoster"),
    detailPosterPlaceholder: $("#detailPosterPlaceholder"),
    detailTrailerWrap: $("#detailTrailerWrap"),
    detailTrailerFrame: $("#detailTrailerFrame"),
    detailTrailerBtn: $("#detailTrailerBtn"),
    detailTitle: $("#detailTitle"),
    detailMeta: $("#detailMeta"),
    detailOverview: $("#detailOverview"),
    detailLink: $("#detailLink"),
  };

  function formatBadgeDate(isoDate) {
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  }

  function formatUpdatedAt(isoDateTime) {
    const d = new Date(isoDateTime);
    return d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function formatFullDate(isoDate) {
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  function showTrailer(trailerKey) {
    els.detailTrailerFrame.src = `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`;
    els.detailTrailerWrap.hidden = false;
    els.detailPosterWrap.hidden = true;
    els.detailTrailerBtn.hidden = true;
  }

  function openDetailModal(item, mediaType) {
    els.detailTitle.textContent = item.title || "Onbekende titel";

    const metaParts = [];
    if (item.date) metaParts.push(formatFullDate(item.date));
    if (item.rating) metaParts.push(`★ ${item.rating}`);
    els.detailMeta.textContent = metaParts.join(" · ");

    els.detailOverview.textContent = item.overview || "Geen beschrijving beschikbaar.";

    els.detailTrailerFrame.src = "about:blank";
    els.detailTrailerWrap.hidden = true;
    els.detailPosterWrap.hidden = false;

    if (item.posterPath) {
      els.detailPoster.src = `${IMG_BASE}${item.posterPath}`;
      els.detailPoster.alt = item.title || "";
      els.detailPoster.hidden = false;
      els.detailPosterPlaceholder.hidden = true;
    } else {
      els.detailPoster.hidden = true;
      els.detailPosterPlaceholder.hidden = false;
      els.detailPosterPlaceholder.textContent = mediaType === "movie" ? "🎬" : "📺";
    }

    if (item.trailerKey) {
      els.detailTrailerBtn.hidden = false;
      els.detailTrailerBtn.onclick = () => showTrailer(item.trailerKey);
    } else {
      els.detailTrailerBtn.hidden = true;
      els.detailTrailerBtn.onclick = null;
    }

    els.detailLink.href = `https://www.themoviedb.org/${mediaType}/${item.id}?language=nl-NL`;
    els.detailModal.hidden = false;
  }

  function closeDetailModal() {
    els.detailModal.hidden = true;
    els.detailTrailerFrame.src = "about:blank";
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
      renderState(container, "Geen titels gevonden voor dit platform.");
      return;
    }
    container.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const a = document.createElement("button");
      a.type = "button";
      a.className = "card";
      a.addEventListener("click", () => openDetailModal(item, mediaType));

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

    MEDIA_TYPES.forEach((mediaType) => {
      PLATFORMS.forEach((platform) => {
        renderItems(els.grids[`${mediaType}-${platform}`], data[mediaType][platform] || [], mediaType);
      });
    });

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
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function setupRefresh() {
    els.refreshBtn.addEventListener("click", () => loadAll());
  }

  function applyPlatformFilter(platform) {
    els.columns.forEach((columns) => {
      columns.classList.toggle("single-col", platform !== "all");
      columns.querySelectorAll(".col").forEach((col) => {
        col.classList.toggle("platform-hidden", platform !== "all" && col.dataset.platform !== platform);
      });
    });
  }

  function setupPlatformFilter() {
    els.platformBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        els.platformBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyPlatformFilter(btn.dataset.platform);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function setupDetailModal() {
    els.detailClose.addEventListener("click", () => closeDetailModal());
    els.detailModal.addEventListener("click", (e) => {
      if (e.target === els.detailModal) closeDetailModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.detailModal.hidden) closeDetailModal();
    });
  }

  setupTabs();
  setupRefresh();
  setupDetailModal();
  setupPlatformFilter();
  loadAll();
})();
