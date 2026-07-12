// Cloudflare Worker: powers the website's Upload form. It verifies a Cloudflare Turnstile
// CAPTCHA, validates the submission, and opens a GitHub pull request. It NEVER executes
// uploaded content — it only commits files.
//
// Two actions (both POST JSON to this Worker):
//   create (default) — a new entry (optionally a fork of another). Returns a one-time editToken.
//   update           — edits an existing entry; requires the editToken from when it was created.
//
// Secrets (wrangler secret put): GITHUB_TOKEN, TURNSTILE_SECRET
// Vars (wrangler.toml [vars]): REPO ("owner/name"), ALLOWED_ORIGIN
// Optional KV binding: RATELIMIT (per-IP daily cap)

const TYPES = ["tool", "microtool", "template"];
const FILE_FOR_TYPE = { tool: "tool.js", microtool: "tool.js", template: "template.md" };
const EXT_FOR_TYPE = { tool: "js", microtool: "js", template: "md" };
const CODE_MAX = 256 * 1024; // 256 KB
const IMG_MAX = 1.5 * 1024 * 1024; // 1.5 MB
const IMG_EXTS = ["png", "jpg", "jpeg", "webp"];
const RATE_LIMIT_PER_DAY = 5;

// ---------- pure helpers (unit-tested from node) ----------

export function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "untitled";
}

export function base64Bytes(b64) {
  if (!b64) return 0;
  var s = String(b64).replace(/=+$/, "");
  return Math.floor((s.length * 3) / 4);
}

function imageExt(filename) {
  var m = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  var ext = m ? m[1] : "png";
  return IMG_EXTS.indexOf(ext) !== -1 ? (ext === "jpeg" ? "jpg" : ext) : null;
}
function fileExtOk(filename, wantExt) {
  var m = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] === wantExt : false;
}
function err(error) { return { ok: false, error: error }; }

// Metadata rules shared by create and update.
function validateMeta(body, categoryIds) {
  if (!body || typeof body !== "object") return err("Malformed request.");
  if (body.website) return err("Rejected."); // honeypot
  if (TYPES.indexOf(body.type) === -1) return err("Invalid type.");
  var required = ["name", "summary", "why", "category", "author", "version"];
  for (var i = 0; i < required.length; i++) {
    if (!body[required[i]] || !String(body[required[i]]).trim()) {
      return err("Missing required field: " + required[i] + ".");
    }
  }
  if (categoryIds && categoryIds.indexOf(body.category) === -1) return err("Unknown category.");
  if (String(body.summary).length > 160) return err("Summary is too long (max 160 chars).");
  if (String(body.why).length > 600) return err("“Why” is too long (max 600 chars).");
  return { ok: true };
}

function validateFile(body) {
  var wantExt = EXT_FOR_TYPE[body.type];
  if (!fileExtOk(body.file.name, wantExt)) return err("The add-on file must be a ." + wantExt + " file.");
  if (base64Bytes(body.file.contentBase64) > CODE_MAX) return err("The add-on file is too large (max 256 KB).");
  return { ok: true };
}

function validateShots(body, required) {
  var needsShots = body.type === "tool" || body.type === "microtool";
  var shots = body.screenshots || [];
  if (!needsShots) return shots.length ? err("Templates don't take screenshots.") : { ok: true };
  if (!shots.length && !required) return { ok: true }; // update: keep existing
  if (shots.length !== 2) return err("Please attach exactly two screenshots.");
  for (var j = 0; j < 2; j++) {
    if (!shots[j] || !shots[j].contentBase64) return err("Screenshot " + (j + 1) + " is missing.");
    if (!imageExt(shots[j].name)) return err("Screenshots must be PNG, JPG, or WebP.");
    if (base64Bytes(shots[j].contentBase64) > IMG_MAX) return err("Screenshot " + (j + 1) + " is too large (max 1.5 MB).");
  }
  return { ok: true };
}

// Create: file + screenshots required.
export function validateSubmission(body, categoryIds) {
  var m = validateMeta(body, categoryIds); if (!m.ok) return m;
  if (!body.file || !body.file.contentBase64) return err("Missing the add-on file.");
  var f = validateFile(body); if (!f.ok) return f;
  return validateShots(body, true);
}

// Update: file + screenshots optional (only if replacing); editToken required.
export function validateUpdate(body, categoryIds) {
  if (!body.editToken || !String(body.editToken).trim()) return err("Missing your edit code.");
  var m = validateMeta(body, categoryIds); if (!m.ok) return m;
  if (body.file && body.file.contentBase64) { var f = validateFile(body); if (!f.ok) return f; }
  return validateShots(body, false);
}

// Builds a fresh entry.json (create).
export function assembleEntry(body, id, shotExts) {
  var entry = {
    id: id,
    type: body.type,
    name: String(body.name).trim(),
    summary: String(body.summary).trim(),
    why: String(body.why).trim(),
    author: String(body.author).trim(),
    authorUrl: body.authorUrl ? String(body.authorUrl).trim() : "",
    version: String(body.version).trim() || "1.0.0",
    category: body.category,
    file: FILE_FOR_TYPE[body.type],
  };
  if (body.type === "tool" || body.type === "microtool") {
    entry.screenshots = {
      primary: "screenshot-1." + (shotExts[0] || "png"),
      secondary: "screenshot-2." + (shotExts[1] || "png"),
    };
  }
  if (body.forkedFrom && body.forkedFrom.id) {
    entry.forkedFrom = { id: String(body.forkedFrom.id), name: String(body.forkedFrom.name || ""), type: String(body.forkedFrom.type || "") };
  }
  entry.addedAt = new Date().toISOString().slice(0, 10);
  return entry;
}

// Merges edited metadata onto an existing entry (update). Keeps identity, provenance,
// screenshots filenames, editTokenHash and addedAt.
export function mergeEntry(existing, body) {
  var e = Object.assign({}, existing);
  e.name = String(body.name).trim();
  e.summary = String(body.summary).trim();
  e.why = String(body.why).trim();
  e.author = String(body.author).trim();
  e.authorUrl = body.authorUrl ? String(body.authorUrl).trim() : "";
  e.version = String(body.version).trim() || existing.version;
  e.category = body.category;
  e.updatedAt = new Date().toISOString().slice(0, 10);
  return e;
}

// ---------- crypto (token) ----------

function base64url(bytes) {
  var s = btoa(String.fromCharCode.apply(null, bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function makeToken() {
  var a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return base64url(a);
}
export async function sha256hex(str) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  var arr = Array.prototype.slice.call(new Uint8Array(buf));
  return arr.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

// ---------- GitHub Git Data API ----------

function gh(repo, path, token, method, payload) {
  return fetch("https://api.github.com/repos/" + repo + path, {
    method: method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nidus-tools-worker",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

async function entryExists(repo, token, type, id) {
  var r = await gh(repo, "/contents/entries/" + type + "s/" + id, token);
  return r.status !== 404;
}

async function getEntry(repo, token, type, id) {
  var r = await gh(repo, "/contents/entries/" + type + "s/" + id + "/entry.json", token);
  if (!r.ok) return null;
  var data = await r.json();
  try { return JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))))); }
  catch (e) { try { return JSON.parse(atob(data.content.replace(/\n/g, ""))); } catch (e2) { return null; } }
}

async function uniqueId(repo, token, type, baseId) {
  var id = baseId, n = 1;
  while (n < 50) {
    if (!(await entryExists(repo, token, type, id))) return id;
    n++;
    id = baseId + "-" + n;
  }
  return baseId + "-" + Date.now();
}

async function createPR(repo, token, files, title, bodyText, headPrefix, id) {
  var refRes = await gh(repo, "/git/ref/heads/main", token);
  if (!refRes.ok) throw new Error("Could not read the repository.");
  var baseSha = (await refRes.json()).object.sha;
  var baseCommit = await (await gh(repo, "/git/commits/" + baseSha, token)).json();
  var baseTree = baseCommit.tree.sha;

  var tree = [];
  for (var i = 0; i < files.length; i++) {
    var blob = await (await gh(repo, "/git/blobs", token, "POST", {
      content: files[i].content, encoding: files[i].encoding,
    })).json();
    tree.push({ path: files[i].path, mode: "100644", type: "blob", sha: blob.sha });
  }

  var newTree = await (await gh(repo, "/git/trees", token, "POST", { base_tree: baseTree, tree: tree })).json();
  var commit = await (await gh(repo, "/git/commits", token, "POST", {
    message: title, tree: newTree.sha, parents: [baseSha],
  })).json();

  var branch = headPrefix + "/" + id + "-" + Math.random().toString(36).slice(2, 8);
  var refCreate = await gh(repo, "/git/refs", token, "POST", { ref: "refs/heads/" + branch, sha: commit.sha });
  if (!refCreate.ok) throw new Error("Could not create a branch for the submission.");

  var pr = await (await gh(repo, "/pulls", token, "POST", {
    title: title, head: branch, base: "main", body: bodyText,
  })).json();

  if (pr.number) {
    await gh(repo, "/issues/" + pr.number + "/labels", token, "POST", { labels: ["automated-submission"] }).catch(function () {});
  }
  return pr.html_url;
}

// ---------- rate limit / turnstile ----------

async function rateLimited(env, ip) {
  if (!env.RATELIMIT || !ip) return false;
  try {
    var key = "rl:" + ip + ":" + new Date().toISOString().slice(0, 10);
    var count = parseInt((await env.RATELIMIT.get(key)) || "0", 10);
    if (count >= RATE_LIMIT_PER_DAY) return true;
    await env.RATELIMIT.put(key, String(count + 1), { expirationTtl: 86400 });
    return false;
  } catch (e) { return false; }
}

async function verifyTurnstile(secret, token, ip) {
  var form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token || "");
  if (ip) form.append("remoteip", ip);
  var res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  var data = await res.json();
  return !!data.success;
}

// ---------- fetch handler ----------

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin)),
  });
}

async function fetchCategoryIds(repo) {
  try {
    var cats = await (await fetch("https://raw.githubusercontent.com/" + repo + "/main/categories.json", { cf: { cacheTtl: 300 } })).json();
    return cats.map(function (c) { return c.id; });
  } catch (e) { return null; }
}

function shotFiles(dir, shots, names) {
  // names: [primaryFilename, secondaryFilename] to keep on update, or null to derive on create
  var out = [], exts = [];
  for (var i = 0; i < shots.length; i++) {
    var ext = imageExt(shots[i].name) || "png";
    exts.push(ext);
    var fname = names ? names[i] : "screenshot-" + (i + 1) + "." + ext;
    out.push({ path: dir + "/" + fname, content: shots[i].contentBase64, encoding: "base64" });
  }
  return { files: out, exts: exts };
}

async function handleCreate(env, body, origin) {
  var categoryIds = await fetchCategoryIds(env.REPO);
  var v = validateSubmission(body, categoryIds);
  if (!v.ok) return json({ error: v.error }, 400, origin);

  var baseId = slugify(body.name);
  var id = await uniqueId(env.REPO, env.GITHUB_TOKEN, body.type, baseId);
  var dir = "entries/" + body.type + "s/" + id;

  var files = [];
  files.push({ path: dir + "/" + FILE_FOR_TYPE[body.type], content: atob(body.file.contentBase64), encoding: "utf-8" });

  var shotExts = [];
  if (body.screenshots && body.screenshots.length) {
    var s = shotFiles(dir, body.screenshots, null);
    files = files.concat(s.files); shotExts = s.exts;
  }

  var entry = assembleEntry(body, id, shotExts);
  var token = makeToken();
  entry.editTokenHash = await sha256hex(token);
  files.push({ path: dir + "/entry.json", content: JSON.stringify(entry, null, 2) + "\n", encoding: "utf-8" });

  var title = "Add " + entry.type + ": " + entry.name;
  var prBody = [
    "Automated submission from the marketplace form.", "",
    "- **Type:** " + entry.type, "- **Name:** " + entry.name,
    "- **Author:** " + entry.author, "- **Category:** " + entry.category,
    entry.forkedFrom ? "- **Forked from:** " + entry.forkedFrom.id : "",
    "", "> " + entry.why, "", "_Please review before merging._",
  ].join("\n");

  var prUrl = await createPR(env.REPO, env.GITHUB_TOKEN, files, title, prBody, "submit", id);
  return json({ ok: true, prUrl: prUrl, editToken: token }, 200, origin);
}

async function handleUpdate(env, body, origin) {
  var categoryIds = await fetchCategoryIds(env.REPO);
  var v = validateUpdate(body, categoryIds);
  if (!v.ok) return json({ error: v.error }, 400, origin);

  var existing = await getEntry(env.REPO, env.GITHUB_TOKEN, body.type, body.id);
  if (!existing) return json({ error: "That add-on could not be found." }, 404, origin);
  if (!existing.editTokenHash) return json({ error: "This entry can't be updated (it predates edit codes)." }, 400, origin);

  var presentedHash = await sha256hex(String(body.editToken).trim());
  if (presentedHash !== existing.editTokenHash) return json({ error: "That edit code doesn't match this add-on." }, 403, origin);

  var dir = "entries/" + body.type + "s/" + body.id;
  var files = [];
  if (body.file && body.file.contentBase64) {
    files.push({ path: dir + "/" + existing.file, content: atob(body.file.contentBase64), encoding: "utf-8" });
  }
  if (body.screenshots && body.screenshots.length && existing.screenshots) {
    // reuse existing filenames so we replace in place (no orphans)
    var names = [existing.screenshots.primary, existing.screenshots.secondary];
    files = files.concat(shotFiles(dir, body.screenshots, names).files);
  }
  var entry = mergeEntry(existing, body);
  files.push({ path: dir + "/entry.json", content: JSON.stringify(entry, null, 2) + "\n", encoding: "utf-8" });

  var title = "Update " + entry.type + ": " + entry.name + " (v" + entry.version + ")";
  var prBody = [
    "Automated **update** from the marketplace form (verified with the owner's edit code).", "",
    "- **Type:** " + entry.type, "- **Name:** " + entry.name, "- **New version:** " + entry.version,
    "", "_Please review before merging._",
  ].join("\n");

  var prUrl = await createPR(env.REPO, env.GITHUB_TOKEN, files, title, prBody, "update", body.id);
  return json({ ok: true, prUrl: prUrl }, 200, origin);
}

export default {
  async fetch(request, env) {
    var origin = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

    var ip = request.headers.get("cf-connecting-ip") || "";
    var body;
    try { body = await request.json(); } catch (e) { return json({ error: "Malformed request." }, 400, origin); }

    if (body && body.website) return json({ error: "Rejected." }, 400, origin); // honeypot

    if (!(await verifyTurnstile(env.TURNSTILE_SECRET, body && body.turnstileToken, ip))) {
      return json({ error: "CAPTCHA check failed. Please try again." }, 400, origin);
    }
    if (await rateLimited(env, ip)) {
      return json({ error: "You've reached today's submission limit. Try again tomorrow." }, 429, origin);
    }

    try {
      if (body.action === "update") return await handleUpdate(env, body, origin);
      return await handleCreate(env, body, origin);
    } catch (e) {
      return json({ error: "Something went wrong. Please try again later." }, 500, origin);
    }
  },
};
