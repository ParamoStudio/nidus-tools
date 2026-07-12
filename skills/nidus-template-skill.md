---
name: nidus-blueprint-maker
description: Author a Nidus "Current Blueprint" template — a tiny .md that defines the labelled fields of a project-direction blueprint for a discipline (ceramics, software, writing, woodworking, music…). Use when the user wants to create, scaffold, or design a Blueprint template for Nidus, add a new project-type template, or asks "how do I make a Nidus blueprint template". Not for installable card-tools (see nidus-toolmaker) or micro-tools.
---

# Nidus Blueprint template

A Blueprint is Nidus's pinned "Current Direction" for a project — a small, always-visible focal point
answering *"given everything we know, what are we actually making right now?"*. A **template** just
defines that blueprint's labelled fields for a kind of project. Making one is deliberately trivial.

## The format: a plain `.md`

```markdown
<!-- icon: flame -->
# Ceramic Product

## Goal
## Product
## Clay
## Glaze
## Firing
## Packaging
## Current Unknowns
## Success Criteria
```

Rules — that's the whole spec:
- **`# Title`** (one line) → the template's name (shown on the picker tile and in the read view). If the
  file has no `# ` line, the filename is used.
- **`## Field`** (one per line) → each becomes a labelled field, in order. At least one is required.
- **`<!-- icon: NAME -->`** (optional, any line) → an SF Symbol for the picker tile, so it matches the
  built-ins. Omit it and a neutral default (`square.grid.2x2`) is used. See the icon list below.
- Nothing else is parsed. No values, no frontmatter, no field types — fields are just short one-line
  text anchors (≤140 chars each), which the user fills in and can annul individually.

## Where it goes

The user imports the `.md` from the Blueprint panel's template picker ("Import a template…", macOS). It's
copied into `_templates/blueprint/<slug>.md` at the vault root and becomes reusable across every project.
Re-importing a file with the same `# Title` updates that template rather than duplicating it.

## Design guidance (keep it a focal point, not a form)

- **6–9 fields is the sweet spot.** A blueprint is a mental anchor; 15 fields makes it a document.
- **Order matters** — lead with the outcome (`Goal`/`Question`/`Concept`), end with the open edges
  (`Current Unknowns`/`Known Risks`/`Open Questions`) so the eye lands on "what's still undecided".
- **Label the enduring dimensions of the discipline**, not tasks or steps (those live in the Task tool).
  For a discipline, ask: what are the 6–8 things that, once chosen, define the piece? Those are fields.
- Field labels are short nouns/noun-phrases (`Wood species`, not `What wood will you use?`).

## Icon list (safe, common SF Symbols)

Any valid SF Symbol name works; these are dependable, on-theme picks:

- **Craft / making**: `flame`, `hammer`, `paintbrush`, `paintpalette`, `scissors`, `wrench.and.screwdriver`, `cube`, `square.stack.3d.up`
- **Design / visual**: `photo.artframe`, `paintbrush.pointed`, `pencil.and.outline`, `ruler`, `camera`, `theatermasks`
- **Software / tech**: `chevron.left.forwardslash.chevron.right`, `cpu`, `server.rack`, `terminal`, `gearshape.2`, `app.badge`
- **Research / science**: `flask`, `testtube.2`, `chart.xyaxis.line`, `atom`, `magnifyingglass`, `books.vertical`
- **Writing / words**: `text.book.closed`, `doc.text`, `pencil`, `quote.bubble`, `character.book.closed`
- **Music / sound**: `music.note`, `music.quarternote.3`, `waveform`, `pianokeys`, `guitars`
- **Business / plan**: `target`, `scope`, `flag.checkered`, `calendar`, `chart.pie`, `list.bullet.clipboard`
- **Generic / neutral**: `square.grid.2x2`, `circle.grid.2x2`, `sparkles`, `star`, `map`, `lightbulb`

## Full example — a new "Woodworking Piece" template

```markdown
<!-- icon: hammer -->
# Woodworking Piece

## Goal
## Piece
## Wood species
## Joinery
## Finish
## Dimensions
## Current Unknowns
## Definition of Done
```

Hand the user this `.md` (or write it to a file they can import). That's the entire deliverable.
