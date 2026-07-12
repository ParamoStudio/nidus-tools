# Contributing a tool, micro tool, or template

This marketplace has no upload form and no backend — you submit by opening a pull request, and a
maintainer reviews it before it appears on the site. That's the whole moderation model.

## 1. Fork the repo, then add a folder

Pick the right type and create `entries/<type>/<your-id>/`:

```
entries/tools/<your-id>/          entries/microtools/<your-id>/     entries/templates/<your-id>/
  tool.js                           tool.js                           template.md
  entry.json                        entry.json                        entry.json
  screenshot-tile.png                screenshot-form.png               (no screenshots)
  screenshot-expanded.png            screenshot-output.png
  README.md (optional)               README.md (optional)              README.md (optional)
```

`<your-id>` is a kebab-case slug, unique across the whole `entries/` tree, and must match the `id`
field inside your `entry.json`.

## 2. Author the actual tool content

Not sure how to write the file itself? Nidus has a dedicated authoring guide for each type — hand the
whole guide to an AI (Claude, ChatGPT, etc.) or read it yourself:

- **Tool** (`tool.js`, a full workspace tool: tile + cards + expanded view) → see
  [`NIDUS-SKILL-tool.md`](https://github.com/ParamoStudio/Nidus/blob/main/Skills/NIDUS-SKILL-tool.md) /
  the full `NIDUS-installable-tool-spec.md`.
- **Micro tool** (`tool.js`, a form → Markdown block) → see
  [`NIDUS-SKILL-microtool.md`](https://github.com/ParamoStudio/Nidus/blob/main/Skills/NIDUS-SKILL-microtool.md).
- **Template** (`template.md`, a Current Blueprint field list) → see
  [`NIDUS-SKILL-blueprint.md`](https://github.com/ParamoStudio/Nidus/blob/main/Skills/NIDUS-SKILL-blueprint.md).

## 3. Fill in `entry.json`

Every type uses the same shape — this is the *only* place display metadata lives, since none of the
source file formats carry it themselves:

```json
{
  "id": "your-id",
  "type": "tool",
  "name": "Display Name",
  "summary": "One sentence, shown on the card.",
  "why": "2–4 sentences: what it's for, its use cases, why you built it. This is what makes a submission read as intentional rather than a dump.",
  "author": "your-name-or-handle",
  "authorUrl": "https://github.com/you",
  "version": "1.0.0",
  "category": "one of the ids in categories.json",
  "file": "tool.js"
}
```

- `type` must be `tool`, `microtool`, or `template`, and must match the folder you put it in.
- `category` must be one of the ids listed in [`categories.json`](categories.json). If your discipline
  genuinely isn't represented, open an issue first rather than inventing a new category in your PR.
- `screenshots` (tools and micro tools only — **omit entirely for templates**):
  ```json
  "screenshots": { "primary": "screenshot-tile.png", "secondary": "screenshot-expanded.png" }
  ```
  - **Tool**: `primary` = the collapsed board tile, `secondary` = the expanded/open view.
  - **Micro tool**: `primary` = the form open beside a card, `secondary` = an example of the rendered
    Markdown output.
  - **Template**: don't add a screenshot. A blueprint's entire content is its title + field list, and
    the site renders that live from your `template.md` — a screenshot would just be friction for zero
    extra information.

## 4. Open the PR

A maintainer checks: the file actually loads/parses per its spec, `entry.json` is complete and honest,
screenshots are the real thing (not a stock photo), and nothing is spam, offensive, or malicious. Once
merged, an Action rebuilds the catalog and republishes the site automatically — no further steps on
your end.

## Ground rules

- One tool/micro-tool/template per PR, please — keeps review fast.
- Tools and micro tools are plain JavaScript with no filesystem, network, or system access at runtime
  (Nidus sandboxes them); that's enforced by the Nidus app itself, not by us, but obviously don't submit
  something that tries to work around it.
- Keep `why` honest and specific. "A tool for X because Y" beats generic marketing language.
- If you're updating your own existing entry, bump `version` in `entry.json`.
