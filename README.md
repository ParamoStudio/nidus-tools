# Nidus Tools

A community marketplace for add-ons to **[Nidus](https://github.com/ParamoStudio/Nidus)** — the
local-first macOS/iPadOS workspace app. Browse, search, and download extras made by other makers, then
import them into your own Nidus.

**→ [Open the marketplace](https://paramostudio.github.io/nidus-tools/)**

## What you'll find here

Three kinds of installable add-ons, each a single small file:

- **Tools** — a whole new tool in your workspace (its own tile, cards, and expanded view). Think a glaze
  recipe book, an event log, a snippet library.
- **Micro tools** — a small form that turns your input into a clean, formatted block you can drop
  anywhere. Think a unit converter or a recipe normalizer.
- **Templates** — a ready-made layout for a project's "Current Blueprint", tuned to a discipline
  (ceramics, woodworking, writing…).

## How to use an add-on

1. Find one you like and click **Download** — you get a single `.js` file (tools, micro tools) or `.md`
   file (templates).
2. Open **Nidus → Tool Library → Import** and pick the file you just downloaded.

That's it. There's no auto-installer and nothing runs on your machine from this website — you download a
file and import it yourself.

## Share your own

Made something for Nidus? Add it so others can find it — you don't need to be a programmer, and it's
free. Click **Submit your own** on the [marketplace home page](https://paramostudio.github.io/nidus-tools/),
or read the full step-by-step guide in **[CONTRIBUTING.md](CONTRIBUTING.md)**.

In short: put your file in a small folder, fill in a short description (name, one-line summary, and *why*
you built it), add two screenshots if it's a tool or micro tool, and open a pull request. A maintainer
reviews it, and once approved it appears here automatically.

## Is it safe to download things here?

Nidus runs every imported tool in a locked-down sandbox with no access to your files, network, or
system, so a downloaded add-on can't harm your machine. On top of that, every submission is reviewed by
a human before it appears here. Still, use common sense — if something looks off, don't import it.

---

<sub>For maintainers: the site is a static GitHub Pages build. `scripts/build-index.js` compiles every
`entries/**/entry.json` into `tools/index.json`, and `.github/workflows/build-index.yml` runs it,
publishes each entry's file as a GitHub Release asset (for real download counts), and deploys on every
push to `main`. Run `node scripts/build-index.js` then serve the folder statically to work locally.</sub>
