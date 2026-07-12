(function () {
  "use strict";

  // Update once the marketplace repo exists on GitHub.
  var REPO = "ParamoStudio/nidus-tools";
  var BRANCH = "main";

  var TYPE_LABEL = { tool: "Tool", microtool: "Micro Tool", template: "Template" };

  var state = {
    entries: [],
    categories: [],
    downloadCounts: {}, // id -> count, from the GitHub Releases API
    type: "all",
    category: null,
    query: "",
  };

  // ---------- theme ----------
  function initTheme() {
    var saved = localStorage.getItem("nidus-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    document.getElementById("theme-toggle").addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("nidus-theme", next);
    });
  }

  // ---------- data ----------
  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("fetch failed: " + url);
      return r.json();
    });
  }

  function loadDownloadCounts() {
    return fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=100")
      .then(function (r) {
        if (!r.ok) throw new Error("releases fetch failed");
        return r.json();
      })
      .then(function (releases) {
        var counts = {};
        releases.forEach(function (rel) {
          (rel.assets || []).forEach(function (asset) {
            var tag = rel.tag_name || "";
            var id = tag.indexOf("entry-") === 0 ? tag.slice(6) : null;
            if (id) counts[id] = (counts[id] || 0) + (asset.download_count || 0);
          });
        });
        return counts;
      })
      .catch(function () {
        return {}; // offline / repo not live yet / rate-limited — degrade gracefully
      });
  }

  // ---------- URLs ----------
  function fileUrl(entry) {
    return entry.downloadUrl || "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + entry.dir + "/" + entry.file;
  }
  function sourceUrl(entry) {
    return "https://github.com/" + REPO + "/blob/" + BRANCH + "/" + entry.dir + "/" + entry.file;
  }
  function assetUrl(entry, filename) {
    return entry.dir + "/" + filename;
  }

  // ---------- search ----------
  function fuzzyScore(query, text) {
    query = query.toLowerCase();
    text = text.toLowerCase();
    if (!query) return 1;
    if (text.indexOf(query) !== -1) return 100 - text.indexOf(query); // substring: best
    // subsequence fallback (typo/loose match)
    var qi = 0;
    for (var i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    return qi === query.length ? 10 : -1;
  }

  function matchesFilters(entry) {
    if (state.type !== "all" && entry.type !== state.type) return false;
    if (state.category && entry.category !== state.category) return false;
    if (state.query && fuzzyScore(state.query, entry.name) < 0 && fuzzyScore(state.query, entry.summary) < 0) return false;
    return true;
  }

  // ---------- icons (neutral placeholders per type; SF Symbols can't render on web) ----------
  var TYPE_ICON = {
    tool: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    microtool: '<svg viewBox="0 0 24 24"><path d="M15 4l1.5 3L20 8.5 16.5 10 15 13l-1.5-3L10 8.5 13.5 7 15 4z"/><path d="M6 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/></svg>',
    template: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  };
  var AUTHOR_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>';

  // ---------- rendering ----------
  function cardEl(entry) {
    var el = document.createElement("article");
    el.className = "card";
    el.tabIndex = 0;
    el.innerHTML =
      '<div class="card-type">' + TYPE_LABEL[entry.type] + '</div>' +
      '<div class="card-icon">' + TYPE_ICON[entry.type] + '</div>' +
      '<h3 class="card-name">' + escapeHTML(entry.name) + '</h3>' +
      '<p class="card-summary">' + escapeHTML(entry.summary) + '</p>' +
      '<div class="card-meta">' +
        '<span class="card-author">' + AUTHOR_ICON + escapeHTML(entry.author) + '</span>' +
        '<span>' + escapeHTML(entry.version) + '</span>' +
      '</div>';
    el.addEventListener("click", function () { openModal(entry); });
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") openModal(entry); });
    return el;
  }

  function escapeHTML(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderGrid(container, entries, emptyEl) {
    container.innerHTML = "";
    entries.forEach(function (e) { container.appendChild(cardEl(e)); });
    if (emptyEl) emptyEl.hidden = entries.length > 0;
  }

  function computeFeatured() {
    var withCounts = state.entries.map(function (e) {
      return Object.assign({}, e, { _downloads: state.downloadCounts[e.id] || 0 });
    });
    withCounts.sort(function (a, b) { return b._downloads - a._downloads; });
    var top20 = withCounts.slice(0, 20);
    top20.sort(function (a, b) { return (a.addedAt < b.addedAt) ? 1 : (a.addedAt > b.addedAt ? -1 : 0); });
    return top20;
  }

  function renderFeatured() {
    renderGrid(document.getElementById("featured-grid"), computeFeatured().slice(0, 4));
  }

  function renderAll() {
    var filtered = state.entries.filter(matchesFilters).slice().sort(function (a, b) {
      return a.addedAt < b.addedAt ? 1 : (a.addedAt > b.addedAt ? -1 : 0);
    });
    var heading = document.getElementById("all-heading");
    heading.textContent = state.type === "all" ? "All" : TYPE_LABEL[state.type] + "s";
    document.getElementById("result-count").textContent = filtered.length + (filtered.length === 1 ? " result" : " results");
    renderGrid(document.getElementById("all-grid"), filtered, document.getElementById("empty-state"));
  }

  function categoryCounts() {
    var counts = {};
    state.entries.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    return counts;
  }

  function renderTags() {
    var counts = categoryCounts();
    var present = state.categories.filter(function (c) { return counts[c.id]; });
    var row = document.getElementById("tags-row");
    row.innerHTML = "";
    present.forEach(function (c) {
      var chip = document.createElement("button");
      chip.className = "tag-chip" + (state.category === c.id ? " active" : "");
      chip.textContent = c.label;
      chip.addEventListener("click", function () {
        state.category = state.category === c.id ? null : c.id;
        refreshFilteredViews();
      });
      row.appendChild(chip);
    });
  }

  function refreshFilteredViews() {
    document.querySelectorAll(".tab").forEach(function (t) {
      var active = t.dataset.type === state.type;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderTags();
    renderAll();
  }

  // ---------- modal ----------
  function openModal(entry) {
    var body = document.getElementById("modal-body");
    var isTemplate = entry.type === "template";

    var mediaHTML = "";
    if (isTemplate) {
      mediaHTML = renderBlueprintPreview(entry);
    } else if (entry.screenshots) {
      mediaHTML =
        '<div class="modal-shots">' +
          '<img src="' + assetUrl(entry, entry.screenshots.primary) + '" alt="' + escapeHTML(entry.name) + ' — primary view" loading="lazy" />' +
          '<img src="' + assetUrl(entry, entry.screenshots.secondary) + '" alt="' + escapeHTML(entry.name) + ' — secondary view" loading="lazy" />' +
        '</div>';
    }

    body.innerHTML =
      mediaHTML +
      '<div class="modal-type">' + TYPE_LABEL[entry.type] + '</div>' +
      '<h3>' + escapeHTML(entry.name) + '</h3>' +
      '<p class="modal-summary">' + escapeHTML(entry.summary) + '</p>' +
      '<div class="modal-meta-row">' +
        '<span>' + AUTHOR_ICON + " " + escapeHTML(entry.author) + '</span>' +
        '<span>v' + escapeHTML(entry.version) + '</span>' +
        '<span>' + escapeHTML(categoryLabel(entry.category)) + '</span>' +
      '</div>' +
      '<div class="why-box"><h4>What it\'s for</h4><p>' + escapeHTML(entry.why) + '</p></div>' +
      '<div class="readme-box" id="readme-box"></div>' +
      '<div class="modal-actions">' +
        '<a class="btn btn-primary" href="' + fileUrl(entry) + '" download>Download</a>' +
        '<a class="btn btn-secondary" href="' + sourceUrl(entry) + '" target="_blank" rel="noopener">View source</a>' +
      '</div>';

    fetch(entry.dir + "/README.md")
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (md) {
        if (md) document.getElementById("readme-box").innerHTML = renderMarkdownLite(md);
      })
      .catch(function () {});

    document.getElementById("modal-overlay").hidden = false;
  }

  function categoryLabel(id) {
    var found = state.categories.find(function (c) { return c.id === id; });
    return found ? found.label : id;
  }

  function renderBlueprintPreview(entry) {
    // A blueprint's whole content is its title + field list — no screenshot needed,
    // fetch the .md and parse `## Field` lines straight from source.
    var placeholderFields = '<div class="blueprint-fields"><span class="blueprint-field-chip">Loading fields…</span></div>';
    var html =
      '<div class="blueprint-preview" id="blueprint-preview">' +
        placeholderFields +
      '</div>';
    fetch(entry.dir + "/" + entry.file)
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var fields = text.split("\n").filter(function (l) { return l.trim().indexOf("## ") === 0; })
          .map(function (l) { return l.trim().slice(3).trim(); });
        var chips = fields.map(function (f) { return '<span class="blueprint-field-chip">' + escapeHTML(f) + '</span>'; }).join("");
        var el = document.getElementById("blueprint-preview");
        if (el) el.innerHTML = '<div class="blueprint-fields">' + chips + '</div>';
      })
      .catch(function () {});
    return html;
  }

  function renderMarkdownLite(md) {
    // Minimal, safe-ish Markdown → HTML for README preview (headings, bold, lists, paragraphs).
    var escaped = escapeHTML(md);
    var lines = escaped.split("\n");
    var html = "";
    var inList = false;
    lines.forEach(function (line) {
      var h = line.match(/^(#{1,3})\s+(.*)/);
      if (h) {
        if (inList) { html += "</ul>"; inList = false; }
        var level = h[1].length;
        html += "<h" + level + ">" + h[2] + "</h" + level + ">";
        return;
      }
      var li = line.match(/^[-*]\s+(.*)/);
      if (li) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + li[1] + "</li>";
        return;
      }
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim()) html += "<p>" + line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") + "</p>";
    });
    if (inList) html += "</ul>";
    return html;
  }

  function closeModal() { document.getElementById("modal-overlay").hidden = true; }

  // ---------- wiring ----------
  function initEvents() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.type = tab.dataset.type;
        refreshFilteredViews();
      });
    });
    document.querySelectorAll('.topnav a').forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        var t = link.dataset.nav;
        state.type = t;
        refreshFilteredViews();
        document.getElementById("all-section").scrollIntoView({ behavior: "smooth" });
      });
    });
    document.getElementById("search-input").addEventListener("input", function (e) {
      state.query = e.target.value.trim();
      renderAll();
    });
    document.getElementById("browse-btn").addEventListener("click", function () {
      document.getElementById("all-section").scrollIntoView({ behavior: "smooth" });
    });
    document.querySelector('[data-scroll="all-section"]').addEventListener("click", function (e) {
      e.preventDefault();
      document.getElementById("all-section").scrollIntoView({ behavior: "smooth" });
    });
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", function (e) {
      if (e.target.id === "modal-overlay") closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal(); closeHowTo(); }
    });

    var howtoOverlay = document.getElementById("howto-overlay");
    function openHowTo() { howtoOverlay.hidden = false; }
    function closeHowTo() { howtoOverlay.hidden = true; }
    document.getElementById("help-btn").addEventListener("click", openHowTo);
    document.getElementById("how-it-works-link").addEventListener("click", function (e) { e.preventDefault(); openHowTo(); });
    document.getElementById("howto-close").addEventListener("click", closeHowTo);
    howtoOverlay.addEventListener("click", function (e) { if (e.target.id === "howto-overlay") closeHowTo(); });
  }

  function init() {
    initTheme();
    initEvents();
    Promise.all([fetchJSON("categories.json"), fetchJSON("tools/index.json"), loadDownloadCounts()])
      .then(function (results) {
        state.categories = results[0];
        state.entries = results[1];
        state.downloadCounts = results[2];
        renderFeatured();
        renderTags();
        renderAll();
      })
      .catch(function (err) {
        console.error("Failed to load marketplace data", err);
        document.getElementById("all-grid").innerHTML = '<p class="empty-state">Could not load the catalog.</p>';
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
