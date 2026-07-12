// Cloudflare Worker: receives an anonymous submission from submit.html, verifies a
// Cloudflare Turnstile CAPTCHA, validates it, and opens a GitHub pull request that adds
// the entry to the marketplace. It NEVER executes uploaded content — it only commits files.
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

// Returns { ok:true } or { ok:false, error }.
export function validateSubmission(body, categoryIds) {
  if (!body || typeof body !== "object") return err("Malformed request.");
  if (body.website) return err("Rejected."); // honeypot filled → bot
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

  if (!body.file || !body.file.contentBase64) return err("Missing the add-on file.");
  var wantExt = EXT_FOR_TYPE[body.type];
  if (imageExtOk(body.file.name, wantExt) === false) {
    return err("The add-on file must be a ." + wantExt + " file.");
  }
  if (base64Bytes(body.file.contentBase64) > CODE_MAX) return err("The add-on file is too large (max 256 KB).");

  var needsShots = body.type === "tool" || body.type === "microtool";
  var shots = body.screenshots || [];
  if (needsShots) {
    if (shots.length !== 2) return err("Please attach exactly two screenshots.");
    for (var j = 0; j < 2; j++) {
      if (!shots[j] || !shots[j].contentBase64) return err("Screenshot " + (j + 1) + " is missing.");
      if (!imageExt(shots[j].name)) return err("Screenshots must be PNG, JPG, or WebP.");
      if (base64Bytes(shots[j].contentBase64) > IMG_MAX) return err("Screenshot " + (j + 1) + " is too large (max 1.5 MB).");
    }
  } else if (shots.length) {
    return err("Templates don't take screenshots.");
  }
  return { ok: true };
}

function err(error) { return { ok: false, error: error }; }
function imageExtOk(filename, wantExt) {
  var m = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return false;
  return m[1] === wantExt;
}

// Builds the entry.json object the site reads. Screenshot filenames are decided here.
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
  entry.addedAt = new Date().toISOString().slice(0, 10);
  return entry;
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

async function uniqueId(repo, token, type, baseId) {
  var id = baseId, n = 1;
  while (n < 50) {
    var r = await gh(repo, "/contents/entries/" + type + "s/" + id, token);
    if (r.status === 404) return id;
    n++;
    id = baseId + "-" + n;
  }
  return baseId + "-" + Date.now();
}

async function createPR(repo, token, files, entry) {
  // files: [{ path, content, encoding }]  encoding: "utf-8" | "base64"
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
    message: "Add " + entry.type + ": " + entry.name, tree: newTree.sha, parents: [baseSha],
  })).json();

  var branch = "submit/" + entry.id + "-" + Math.random().toString(36).slice(2, 8);
  var refCreate = await gh(repo, "/git/refs", token, "POST", { ref: "refs/heads/" + branch, sha: commit.sha });
  if (!refCreate.ok) throw new Error("Could not create a branch for the submission.");

  var body = [
    "Automated submission from the marketplace form.",
    "",
    "- **Type:** " + entry.type,
    "- **Name:** " + entry.name,
    "- **Author:** " + entry.author,
    "- **Category:** " + entry.category,
    "",
    "> " + entry.why,
    "",
    "_Please review before merging._",
  ].join("\n");
  var pr = await (await gh(repo, "/pulls", token, "POST", {
    title: "Add " + entry.type + ": " + entry.name, head: branch, base: "main", body: body,
  })).json();

  // best-effort label; ignore failures
  if (pr.number) {
    await gh(repo, "/issues/" + pr.number + "/labels", token, "POST", { labels: ["automated-submission"] }).catch(function () {});
  }
  return pr.html_url;
}

// ---------- rate limit (optional KV) ----------

async function rateLimited(env, ip) {
  if (!env.RATELIMIT || !ip) return false;
  try {
    var key = "rl:" + ip + ":" + new Date().toISOString().slice(0, 10);
    var count = parseInt((await env.RATELIMIT.get(key)) || "0", 10);
    if (count >= RATE_LIMIT_PER_DAY) return true;
    await env.RATELIMIT.put(key, String(count + 1), { expirationTtl: 86400 });
    return false;
  } catch (e) {
    return false; // never block on KV errors
  }
}

// ---------- Turnstile ----------

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

    // categories allowlist (fetched from the deployed site; cached by CF edge)
    var categoryIds = null;
    try {
      var repoPagesBase = "https://raw.githubusercontent.com/" + env.REPO + "/main/categories.json";
      var cats = await (await fetch(repoPagesBase, { cf: { cacheTtl: 300 } })).json();
      categoryIds = cats.map(function (c) { return c.id; });
    } catch (e) { categoryIds = null; } // if unreachable, skip category check rather than block

    var v = validateSubmission(body, categoryIds);
    if (!v.ok) return json({ error: v.error }, 400, origin);

    try {
      var baseId = slugify(body.name);
      var id = await uniqueId(env.REPO, env.GITHUB_TOKEN, body.type, baseId);
      var dir = "entries/" + body.type + "s/" + id;

      var shotExts = [];
      var files = [];
      // add-on file (text — decode base64 to utf-8 so blobs stay readable diffs)
      files.push({ path: dir + "/" + FILE_FOR_TYPE[body.type], content: atob(body.file.contentBase64), encoding: "utf-8" });

      var shots = body.screenshots || [];
      for (var i = 0; i < shots.length; i++) {
        var ext = imageExt(shots[i].name) || "png";
        shotExts.push(ext);
        files.push({ path: dir + "/screenshot-" + (i + 1) + "." + ext, content: shots[i].contentBase64, encoding: "base64" });
      }

      var entry = assembleEntry(body, id, shotExts);
      files.push({ path: dir + "/entry.json", content: JSON.stringify(entry, null, 2) + "\n", encoding: "utf-8" });

      var prUrl = await createPR(env.REPO, env.GITHUB_TOKEN, files, entry);
      return json({ ok: true, prUrl: prUrl }, 200, origin);
    } catch (e) {
      return json({ error: "Something went wrong creating your submission. Please try again later." }, 500, origin);
    }
  },
};
