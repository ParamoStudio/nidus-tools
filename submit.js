(function () {
  "use strict";

  var CFG = window.NIDUS_CONFIG || {};
  var WORKER_URL = CFG.WORKER_URL || "";
  var HAS_REAL_KEY = !!CFG.TURNSTILE_SITE_KEY;
  // Cloudflare's always-passes test key, so the widget renders during local dev.
  var TURNSTILE_KEY = CFG.TURNSTILE_SITE_KEY || "1x00000000000000000000AA";

  var CODE_MAX = 256 * 1024;
  var IMG_MAX = 1.5 * 1024 * 1024;

  var TYPE_HINT = {
    tool: "A whole new tool with its own tile, cards, and open view.",
    microtool: "A small form that turns input into a clean block you paste anywhere.",
    template: "A ready-made layout for a project's Current Blueprint.",
  };
  var FILE_HINT = { tool: "(a single .js file)", microtool: "(a single .js file)", template: "(a single .md file)" };
  var FILE_ACCEPT = { tool: ".js", microtool: ".js", template: ".md" };
  var SHOTS_HINT = { tool: "(the collapsed tile, then the open view)", microtool: "(the form, then an example of its output)" };

  // mode: "create" | "fork" | "update"
  var params = new URLSearchParams(location.search);
  var ref = params.get("update") || params.get("fork") || "";
  var mode = params.get("update") ? "update" : params.get("fork") ? "fork" : "create";
  var refType = "", refId = "";
  if (ref.indexOf("/") !== -1) { refType = ref.split("/")[0]; refId = ref.split("/").slice(1).join("/"); }

  var state = {
    type: "tool", file: null, shots: [null, null], widgetId: null,
    filesRequired: mode !== "update", forkedFrom: null, source: null,
  };

  var el = function (id) { return document.getElementById(id); };
  var status = el("form-status");

  // ---------- categories, then prefill ----------
  fetch("categories.json").then(function (r) { return r.json(); }).then(function (cats) {
    var sel = el("f-category");
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id; o.textContent = c.label; sel.appendChild(o);
    });
    if (mode !== "create") prefillFromSource();
  }).catch(function () {});

  function prefillFromSource() {
    fetch("tools/index.json").then(function (r) { return r.json(); }).then(function (entries) {
      var e = entries.filter(function (x) { return x.type === refType && x.id === refId; })[0];
      if (!e) { setStatus("Couldn't find that add-on.", true); return; }
      state.source = e;
      setType(e.type);
      lockType();
      el("f-name").value = mode === "fork" ? e.name + " (fork)" : e.name;
      el("f-summary").value = e.summary || "";
      el("f-why").value = e.why || "";
      el("f-category").value = e.category || "";
      el("f-author").value = mode === "fork" ? "" : (e.author || "");
      el("f-authorurl").value = mode === "fork" ? "" : (e.authorUrl || "");
      el("f-version").value = e.version || "1.0.0";

      if (mode === "update") applyUpdateMode(e);
      else applyForkMode(e);
    }).catch(function () { setStatus("Couldn't load that add-on.", true); });
  }

  function applyUpdateMode(e) {
    el("page-title").textContent = "Update an add-on";
    el("page-intro").innerHTML = "Change whatever you like below, paste your edit code, and we'll open an update for review.";
    showBanner("You're updating <strong>" + escapeHTML(e.name) + "</strong>. Leave the file or screenshots empty to keep the current ones.");
    el("token-field").hidden = false;
    el("tofork").setAttribute("href", "submit.html?fork=" + e.type + "/" + e.id);
    el("file-hint").textContent = "(optional — leave empty to keep the current file)";
    el("shots-hint").textContent = "(optional — leave empty to keep the current screenshots)";
    el("submit-go").textContent = "Submit update";
    document.title = "Update — Nidus Tools";
  }

  function applyForkMode(e) {
    state.forkedFrom = { id: e.id, name: e.name, type: e.type };
    el("page-title").textContent = "Fork an add-on";
    el("page-intro").innerHTML = "You're making your own version of an existing add-on. Upload your improved file — it'll be credited as a fork.";
    showBanner("Forking <strong>" + escapeHTML(e.name) + "</strong> by " + escapeHTML(e.author) + ". Upload your version below." +
      ' <a href="' + fileRawUrl(e) + '" target="_blank" rel="noopener">Get the original to start from →</a>');
    el("submit-go").textContent = "Submit fork";
    document.title = "Fork — Nidus Tools";
  }

  function fileRawUrl(e) {
    return "https://github.com/ParamoStudio/nidus-tools/releases/download/entry-" + e.id + "/" + e.file;
  }

  function lockType() {
    document.querySelectorAll(".seg").forEach(function (b) { b.disabled = true; b.style.cursor = "default"; });
    el("type-field").querySelector("label").textContent = "Type";
  }
  function showBanner(html) { var b = el("mode-banner"); b.innerHTML = html; b.hidden = false; }
  function escapeHTML(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- type control ----------
  function setType(type) {
    state.type = type;
    document.querySelectorAll(".seg").forEach(function (b) {
      var on = b.dataset.type === type;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    el("type-hint").textContent = TYPE_HINT[type];
    el("file-hint").textContent = mode === "update" ? "(optional — leave empty to keep the current file)" : FILE_HINT[type];
    el("f-file").setAttribute("accept", FILE_ACCEPT[type]);
    state.file = null; el("f-file").value = ""; el("file-dztext").textContent = "Choose your file or drop it here";
    var needsShots = type !== "template";
    el("shots-field").hidden = !needsShots;
    if (needsShots) el("shots-hint").textContent = mode === "update" ? "(optional — leave empty to keep the current screenshots)" : SHOTS_HINT[type];
  }
  document.querySelectorAll(".seg").forEach(function (b) {
    b.addEventListener("click", function () { if (!b.disabled) setType(b.dataset.type); });
  });

  // ---------- file inputs ----------
  function readableSize(bytes) {
    return bytes < 1024 ? bytes + " B" : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
  }
  el("f-file").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var wantExt = FILE_ACCEPT[state.type].slice(1);
    if (!new RegExp("\\." + wantExt + "$", "i").test(f.name)) { setStatus("That file must be a ." + wantExt + " file.", true); el("f-file").value = ""; return; }
    if (f.size > CODE_MAX) { setStatus("That file is too large (max 256 KB).", true); el("f-file").value = ""; return; }
    state.file = f; el("file-dztext").textContent = f.name + "  ·  " + readableSize(f.size); clearStatus();
  });
  [1, 2].forEach(function (n) {
    el("f-shot" + n).addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!/\.(png|jpe?g|webp)$/i.test(f.name)) { setStatus("Screenshots must be PNG, JPG, or WebP.", true); return; }
      if (f.size > IMG_MAX) { setStatus("Screenshot " + n + " is too large (max 1.5 MB).", true); return; }
      state.shots[n - 1] = f;
      var img = el("shot" + n + "-preview");
      img.src = URL.createObjectURL(f); img.hidden = false;
      el("shot" + n + "-text").textContent = "Replace"; clearStatus();
    });
  });

  // ---------- turnstile ----------
  function renderTurnstile() {
    if (!window.turnstile) { setTimeout(renderTurnstile, 200); return; }
    state.widgetId = window.turnstile.render("#turnstile-widget", { sitekey: TURNSTILE_KEY });
  }
  renderTurnstile();

  // ---------- helpers ----------
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1]); };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }
  function setStatus(msg, isError) { status.textContent = msg; status.className = "form-status" + (isError ? " error" : " ok"); }
  function clearStatus() { status.textContent = ""; status.className = "form-status"; }

  // ---------- submit ----------
  el("submit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clearStatus();
    if (el("f-website").value) return; // honeypot

    var name = el("f-name").value.trim();
    var summary = el("f-summary").value.trim();
    var why = el("f-why").value.trim();
    var category = el("f-category").value;
    var author = el("f-author").value.trim();
    if (!name || !summary || !why || !category || !author) return setStatus("Please fill in every required field.", true);

    if (mode === "update" && !el("f-token").value.trim()) return setStatus("Please paste your edit code.", true);

    if (state.filesRequired && !state.file) return setStatus("Please choose your add-on file.", true);
    if (state.filesRequired && state.type !== "template" && (!state.shots[0] || !state.shots[1])) return setStatus("Please add both screenshots.", true);
    // update mode: if you replace one screenshot you must replace both
    if (mode === "update" && state.type !== "template" && (!!state.shots[0] !== !!state.shots[1])) return setStatus("To change screenshots, replace both.", true);

    var token = window.turnstile && state.widgetId != null ? window.turnstile.getResponse(state.widgetId) : "";
    if (!token) return setStatus("Please complete the “I'm human” check.", true);

    if (WORKER_URL && !HAS_REAL_KEY) return setStatus("Uploads are locked: the site owner hasn't set a real CAPTCHA key yet.", true);
    if (!WORKER_URL) return setStatus("Uploads aren't switched on yet. Please check back soon, or submit via GitHub.", true);

    var btn = el("submit-go"); btn.disabled = true; setStatus("Submitting…", false);

    var payload = {
      action: mode === "update" ? "update" : "create",
      type: state.type, name: name, summary: summary, why: why, category: category,
      author: author, authorUrl: el("f-authorurl").value.trim(), version: el("f-version").value.trim() || "1.0.0",
      turnstileToken: token, website: "",
    };
    if (mode === "update") { payload.id = refId; payload.editToken = el("f-token").value.trim(); }
    if (mode === "fork" && state.forkedFrom) payload.forkedFrom = state.forkedFrom;

    var reads = [];
    if (state.file) reads.push(fileToBase64(state.file).then(function (b64) { payload.file = { name: state.file.name, contentBase64: b64 }; }));
    if (state.type !== "template" && state.shots[0] && state.shots[1]) {
      payload.screenshots = [];
      state.shots.forEach(function (f, i) { reads.push(fileToBase64(f).then(function (b64) { payload.screenshots[i] = { name: f.name, contentBase64: b64 }; })); });
    }

    Promise.all(reads)
      .then(function () { return fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.prUrl) { showDone(res.d, mode); }
        else {
          setStatus(res.d.error || "Something went wrong. Please try again.", true);
          btn.disabled = false;
          if (window.turnstile && state.widgetId != null) window.turnstile.reset(state.widgetId);
        }
      })
      .catch(function () { setStatus("Couldn't reach the server. Please try again later.", true); btn.disabled = false; });
  });

  function showDone(d, mode) {
    var tokenBlock = "";
    if (d.editToken) {
      tokenBlock =
        '<div class="token-box"><h3>Save your edit code</h3>' +
        '<p>This is the <strong>only</strong> way to update your add-on later. It can\'t be recovered — copy it somewhere safe now.</p>' +
        '<div class="token-row"><code id="edit-token">' + escapeHTML(d.editToken) + '</code>' +
        '<button type="button" class="btn btn-secondary" id="copy-token">Copy</button></div></div>';
    }
    var heading = mode === "update" ? "Update submitted!" : mode === "fork" ? "Fork submitted!" : "Submitted!";
    el("submit-form").innerHTML =
      '<div class="submit-done"><div class="done-check">✓</div>' +
      '<h2>' + heading + '</h2>' +
      '<p>Your add-on is in the review queue. Follow its progress here:</p>' +
      '<a class="btn btn-primary" href="' + d.prUrl + '" target="_blank" rel="noopener">View your submission</a>' +
      tokenBlock +
      '<p class="done-sub"><a href="index.html">Back to the marketplace</a></p></div>';
    var copy = el("copy-token");
    if (copy) copy.addEventListener("click", function () {
      navigator.clipboard.writeText(d.editToken).then(function () { copy.textContent = "Copied!"; });
    });
  }
})();
