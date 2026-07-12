# Submission Worker

A small Cloudflare Worker that powers the website's **Upload** form. It verifies a Cloudflare Turnstile
CAPTCHA, validates the submission, and opens a GitHub pull request that adds the entry to the
marketplace. It never runs uploaded code — it only commits files, and you still review every PR.

## One-time setup

You'll need a (free) Cloudflare account and permission to open PRs on this repo.

### 1. GitHub token

Create a **fine-grained personal access token** (GitHub → Settings → Developer settings → Fine-grained
tokens) scoped to **only** the `ParamoStudio/nidus-tools` repository, with:
- **Contents:** Read and write
- **Pull requests:** Read and write

Copy the token.

### 2. Turnstile (the CAPTCHA)

In the Cloudflare dashboard → **Turnstile** → add a widget for your Pages domain
(`paramostudio.github.io`). You get a **site key** (public) and a **secret key** (private).

### 3. Deploy the Worker

```sh
npm install -g wrangler
wrangler login
cd worker
wrangler secret put GITHUB_TOKEN       # paste the fine-grained PAT
wrangler secret put TURNSTILE_SECRET   # paste the Turnstile secret key
wrangler deploy                        # prints your Worker URL
```

### 4. Point the site at it

Edit [`../config.js`](../config.js) and fill in:
- `WORKER_URL` — the URL `wrangler deploy` printed.
- `TURNSTILE_SITE_KEY` — the Turnstile **site** key (public).

Commit and push — the Upload form goes live on the next Pages deploy.

### 5. (Optional) Rate limiting

To cap submissions per IP per day:

```sh
wrangler kv namespace create RATELIMIT
```

Uncomment the `[[kv_namespaces]]` block in `wrangler.toml`, paste the printed `id`, and
`wrangler deploy` again.

## Local development

```sh
cd worker
wrangler dev
```

`wrangler dev` runs the Worker locally, but a real submission still needs the secrets above (Turnstile
verification and the GitHub write are live calls). The pure helpers are unit-tested in
[`test/worker.test.mjs`](test/worker.test.mjs) — run `node test/worker.test.mjs`.

## Updates & forks

- On a successful **create**, the Worker generates a random **edit token**, stores only its SHA-256 hash
  in the entry's `entry.json`, and returns the plaintext token to the submitter once. There's no
  database — the hash lives in git.
- An **update** (`action: "update"`) requires that token: the Worker hashes what's presented and compares
  it to the stored hash before opening an update PR. Wrong token → rejected. The file/screenshots are
  optional on update (omit to keep the current ones).
- A **fork** is just a create carrying `forkedFrom`; it becomes its own entry with its own edit token,
  credited to the original.

## How it fails safe

- No CAPTCHA solved → rejected. Honeypot field filled → rejected.
- File too big / wrong type / missing field / unknown category → rejected with a clear message.
- Everything that passes becomes a PR labelled `automated-submission` for you to review. Nothing is
  published until you merge.
