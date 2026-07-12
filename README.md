# Nidus Tools

A static, no-backend marketplace for [Nidus](https://github.com/ParamoStudio/Nidus) installable
content: **Tools**, **Micro Tools**, and **Templates**. Browse, search, download the file, then import
it into Nidus by hand (Tool Library → Import). Hosted on GitHub Pages.

## How it's built

- `index.html` / `styles.css` / `app.js` — the whole site, vanilla, no framework, no build step for the
  frontend itself.
- `entries/<type>/<id>/` — one folder per submission: the installable file, an `entry.json` with all
  display metadata (nothing else carries it — see [`CONTRIBUTING.md`](CONTRIBUTING.md)), and screenshots
  where the type requires them.
- `categories.json` — the fixed, shared category taxonomy across all three types.
- `scripts/build-index.js` — validates every `entry.json` and concatenates them into `tools/index.json`,
  the catalog the site fetches at runtime.
- `.github/workflows/build-index.yml` — on every push to `main`: runs the build script, publishes each
  entry's file as a GitHub Release asset (so the public Releases API gives us a free, backend-free
  `download_count` per entry, used for the Featured section), and deploys to GitHub Pages.

No database, no accounts, no upload form. Contribution happens by opening a pull request — see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Local development

```sh
node scripts/build-index.js   # regenerate tools/index.json from entries/
npx serve .                   # or: python3 -m http.server
```

Open the served URL — the site works entirely off static files, no server-side code.

## Enabling GitHub Pages (one-time setup)

1. Push this repo to GitHub (update the `REPO` constant near the top of `app.js`, and the GitHub link in
   `index.html`'s footer, to match the real `owner/repo`).
2. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` — `build-index.yml` builds the catalog, publishes Release assets, and deploys the site.
