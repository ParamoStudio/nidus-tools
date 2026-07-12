---
name: nidus-toolmaker
description: Author a Nidus installable tool — a single self-contained .js file that adds a new tool (its own tile, cards, expanded view) to the Nidus workspace, using only recycled declarative primitives plus a sandboxed HTML escape hatch. Use when the user asks to create/generate/scaffold a Nidus tool, a Nidus plugin, an installable tool, or "a tool for Nidus". Not for Nidus MICRO-tools (those turn a form into a Markdown block copied to the clipboard — different, simpler; see NIDUS-microtool-authoring.md).
---

# Nidus Toolmaker

You are generating a **Nidus installable tool**: one self-contained `.js` file that a user imports
locally into Nidus (it lands in the vault's `_tools/` folder, syncs if the vault syncs, and is
deletable). It adds a full tool to the workspace — a board tile, its own cards, an expanded view —
**without any native/compiled code**.

The authoritative contract is **`NIDUS-installable-tool-spec.md`** in the Nidus project root. Read it
if available. This skill is the working summary + the hard-won patterns; when they disagree, the spec
wins.

## Non-negotiables (get these wrong and it won't load)

1. **Output exactly one `.js` file.** No prose, no Markdown fences, no extra files (unless the user
   explicitly wants a multi-asset `.nidustool` bundle). One `var tool = { ... };` global.
2. **Runtime = bare JavaScriptCore** for the tool logic: no DOM, no `window`, no `require`/`import`,
   no timers, no `fetch`, no `async`/`await`. Pure ECMAScript + the injected `nidus` object. (Async
   and a DOM exist ONLY inside an `html` web-view node.)
3. **Render functions return JSON-serializable view trees, never UI.** A node is
   `{ type, ...props, children? }`. The host paints them natively. You cannot invent native UI.
4. **All persistence goes through `nidus`** (`nidus.cards.add/update/remove/all/get`). Never touch
   files. Your custom fields live as strings in `card.extra`.
5. **Sizes** are only from `1x1 / 2x1 / 1x2 / 2x2`. List those the tile genuinely looks good in;
   include `1x2` when reasonable; `1x1` is the baseline.

## The shape

```js
var tool = {
  manifest: {
    id: "kebab-unique", name: "Short Name", icon: "sf.symbol.name",
    summary: "One sentence.", version: "1.0.0",
    sizes: ["1x1","1x2"], allowsMultiple: true,
    store: ["yourtool.md"],
    shareable: false,           // true → also set accepts:[CardKind], produces:"generic"
    hotkey: "g"                 // optional single letter → pressing it opens the expanded view
  },
  tile:     function(ctx) { return /* node */; },        // required — the closed board tile
  expanded: function(ctx) { return /* node */; },        // optional — full-window view
  card:     function(card, ctx) { return /* node */; },  // optional — a card's detail
  handlers: { name: function(ctx, payload) { /* mutate via ctx.nidus */ } }
};
```

`ctx` gives you `ctx.nidus`, `ctx.size`, and `ctx.cards` (snapshot of `nidus.cards.all()`).

## The recycled primitives (your whole vocabulary)

- Layout/text: `stack` (`axis:"v"|"h"`, `spacing`, `children`), `section` (`title`, `children` — a
  titled bordered panel; use it to give a region its OWN division, e.g. a "New glaze" form pane),
  `text` (`value`, `style:"title"|"heading"|"body"|"caption"`), `markdown` (`value`), `image`
  (`src`,`alt`), `field` (`label`,`value` — a read-only label/value row), `divider`, `spacer`,
  `badge` (`value`).
- Data: `cardList` (native card rows), `cardGrid` (photo tiles grouped by category, drag between
  groups), `table` (`headers:[...]`, `rows:[[...]]` — read-only), `gallery` (`images:[...]` → thumbnail
  row), `form` (`inputs`,`submit`,`submitLabel`), `grid`, `microtool`.
  - **`cardGrid`** (`cards`, `groups:[{key,label}]`, `groupBy:"<extraField>"`, `badge:"<extraField>"`,
    `onOpen`, `onMove`): shows cards as photo tiles (first image or a placeholder) under a section per
    group, with a small badge from an `extra` field. **Dragging a tile to another group calls
    `onMove` with `{id, group}`** — for the handler to recategorize (update `card.extra[groupBy]`).
    This is scoped to the grid (never leaks to other tools). Great for a categorized library
    (Tested / To try / Rejected).
  - **`form` inputs** — live in the host now: `text`, `textarea`, `number`, `row` (side-by-side),
    **`picker`** (`options:[{value,label}]` → chip selector), **`photos`** (paste/import images →
    stored in the card's `_assets/`; pass the resulting paths to `card.images`), and **`table`** (`columns:[{key,label,
    numeric}]`, `addLabel` → an editable rows table; the handler receives it as an array of
    `{columnKey: value}` objects). Not wired yet: `grid`, `batch`, `showWhen`.
  - `cardList` renders the app's **real card rows** (native look, draggable, "…" menu) — so your
    lists match Inbox/Ideas exactly. `onTap` names a handler that gets `{id}`.
  - **Editable `form`s** — a form may declare `initial: {key: value}` (pre-fill; a table key's initial
    is an array of `{column: value}` rows) and `with: {…}` (static fields merged into the submit
    payload — carry the card id for editing). So a `card(card, ctx)` can render **the same form,
    pre-filled from `card.extra`**, with `submit:"save"` + `with:{id:card.id}`, and the save handler
    does `nidus.cards.update(payload.id, {...})`. This is how a niche tool is EDITED with its own
    pickers/tables instead of the generic note editor.
  - **Read view + edit form**: define **`card(card, ctx)`** = a calm READ view (title, `gallery` of
    `card.images`, the recipe `markdown`) AND **`edit(card, ctx)`** = the pre-filled form. The host
    shows the read view with a pencil that flips to the edit form; saving returns to read. (Omit both
    → the native card detail.) Store round-trip data in `card.extra` (JSON-encode arrays); regenerate
    the readable body on save. Photos captured by a `photos` input → pass to `card.images`.
  - **Opening the tool**: if it defines `expanded`, the host pins an **"Open …" footer** on the tile
    and the tile HEADER opens it too — set `manifest.openLabel` for the footer text. Don't add your own
    open button.
  - **Compute in the handler.** Normalize, total, format there (base materials → 100, additives as raw
    % — same math as the Recipe Normalizer) and write the finished Markdown table into the body.
  - **Card sharing**: set `shareable:true` and a card dropped onto your tile is moved into your store,
    and your cards can be dragged out to Inbox/Ideas/Tasks (bidirectional). Silos leave it false.
  - **Be non-destructive — this is the load-bearing rule.** A card is shared across tools; each tool
    shows only what's relevant to it and must never delete the rest (like Tasks not dumping a note's body).
    Two halves:
    - **On WRITE**: keep ALL your data in `card.extra` (JSON-encode arrays) and **do not write `body`** on
      add/update. `nidus.cards.update(id, {…})` only overwrites the keys you pass, so omitting `body`
      preserves whatever freeform notes the card carries from Ideas/Tasks. Regenerating `body` from your
      own fields WIPES foreign content — a real bug users will hit. Render your readable view from `extra`
      instead. (If you truly need portable text in the body, own only a delimited region with
      `<!-- yourtool:start -->…<!-- end -->` markers and splice, never replace the whole body.)
    - **On DISPLAY**: detect your own cards (`card.extra` carries a field only you write) and, for foreign
      ones, show **only title + `gallery`** plus a hint — never render their raw body as if it were yours.
      The pencil (`edit()`) lets the user fill in your fields to adopt it.
    Everything above (extra-as-truth, read/edit, photos, drag-recategorize) is expressible in a single
    self-contained `.js` — no native code — so any AI or person can author a tool on par with the built-ins.
- Controls: `button` (`label`,`icon`,`onTap`,`role`).
- Escape hatch: `html` (see below).

Handlers run your JS with a fresh `ctx` and a `payload` (a form's `data`, or a tapped card's `id`);
do your `nidus.cards.*` mutation there; the host re-renders.

The `nidus` object (in `ctx.nidus`, and inside `html` widgets): `cards.all/get(id)/add(obj)/update(id,
patch)/remove(id)`, `openCard(id)` (open a card's detail), `openExpanded()` (open THIS tool's expanded
view — use it from a "＋" button in the tile), `clipboard.copy(text)`.

### `nidus.library` — OPTIONAL cross-project bank

A project's cards are local to that project. If your tool has items worth reusing across projects (a
favourite glaze, a template, a preset — NOT contextual field-work like tasks or an inbox), opt in to the
bank: a folder at the vault root (`_library/<toolid>/`) that any project can read. **Feature-detect it**
(`if (ctx.nidus.library) …`) — older builds won't have it.

- `library.save(cardId)` → copy this project's card (+ its photos) into the bank, stamped with this
  project as **owner**. Returns false if a different project owns that entry.
- `library.remove(cardId)` → remove from the bank. **Owner-gated**: only the project that saved it can.
- `library.contains(cardId)` → bool. Use it to toggle a "Save to library" / "In library — remove" button.
- `library.all()` → the bank's entries `[{id,title,images,extra, ownedHere}]`. `ownedHere` tells you
  whether THIS project may remove it (show Remove) or only copy it (show Import).
- `library.importHere(entryId)` → copy an entry into this project as a NEW, independent card (new id, its
  own photo files). The bank entry is never touched.

**Hierarchy = single source of truth**: the owning project can add/remove; everyone else can only import
copies. An imported copy has a new id (`contains` is false for it), so it naturally offers "Save to
library" again — re-banking is deliberate, never accidental mutation of the original.

### Traditional, native-feeling tools (you have all the pieces)

You are NOT limited to the HTML widget — most tools should be built from the native primitives and feel
like Inbox/Ideas. Everything a "recipe book" needs is expressible:

- **Recent items on the tile, groups below** — store a tag/status in `card.extra` (e.g.
  `extra.status = "tested" | "rejected" | "to-try"`), then in `tile` filter `ctx.cards` and render a
  `text` heading + a `cardList` per group. Groups are just filtered card lists — no special "folder"
  type needed.
- **A "＋" that opens the full tool** — a `button` whose handler calls `ctx.nidus.openExpanded()`.
- **A two-pane expanded** (navigator left, input right) — `stack axis:"h"` with a `cardList` on the
  left and a `form` on the right. Tapping a card → `openCard`.

So the choice isn't "HTML tool vs simple tool": build the structure natively, and reach for `html` only
for a genuinely custom visual (a swatch grid, a fretboard, a canvas).

## The HTML escape hatch (for bespoke widgets)

When a native primitive can't express it (a chord grid, calculator, canvas, mini synth), drop in:

```js
{ type: "html", height: 260, network: false, html: "<!doctype html>…" }
```

Inside that web view (a sandboxed WKWebView) you have a DOM and an async `window.nidus` bridge that
reads/writes **this tool's own cards** — `await nidus.cards.all()`, `await nidus.cards.add({...})`,
`nidus.on("cardsChanged", render)`. Keep it self-contained (inline CSS/JS). No network unless
`network: true` is declared (and the user may still be asked). The bridge reaches ONLY this tool's
data — never other tools, files, or the system.

## Patterns learned building Nidus (apply these)

- **Cards are lossless & non-destructive**: show only the fields you care about; never assume you own
  every field — preserve `extra`. This is what makes card sharing safe.
- **Keep the tile inviting and compact**: a short `cardList` of recent items + a quick-add `form`
  reads far better than a wall of controls. The tool is "worth more open" — put the depth in
  `expanded`.
- **Single vs multiple instances**: set `allowsMultiple:false` for tools where one-per-project is the
  only thing that makes sense (a project has one history, one notebook, one archive).
- **Standalone vs shareable**: default `shareable:false`. Declare `shareable:true` + `accepts`/
  `produces` when it's meaningful. NOTE (host status): the declaration is read, but **cross-tool
  drag-sharing of cards with Inbox/Ideas/Tasks is not wired into the host yet** — for now a tool owns
  and displays its own cards. Build as if a card is yours; sharing lights up later without changing
  your tool.
- **Determinism in logic; side effects only via `nidus`.** Render = read + return a tree.
- **Size to content, don't design for a scroll.** The host now sizes the expanded view and the card
  panel to their natural content height (capped only by the window) — a panel grows to fit rather than
  trapping content behind a scrollbar. So lay a view out at the length it needs and trust it to fit;
  don't cram everything to dodge scrolling, and don't assume a fixed short height. (If content genuinely
  exceeds the window, it still scrolls — that's the only case where a scroll appears.) A very tall
  single form is fine, but if a view has two distinct jobs, an `expanded` two-pane (`stack axis:"h"`)
  usually reads better than one enormous column.

## Before you output

- [ ] One `.js`, one global `var tool`, no extra text.
- [ ] `manifest` complete and valid; `sizes` from the four; `store` names your `.md`.
- [ ] `tile` returns a tree; `expanded`/`card` if warranted.
- [ ] All writes via `nidus.cards.*`; custom fields in `card.extra` as strings.
- [ ] Bespoke visuals only inside a sandboxed `html` node; `network` false unless truly required.
- [ ] No imports, no filesystem, no timers/async in the tool logic.

If the user gives you a purpose (e.g. "glaze iterations", "code snippets", "a metronome"), pick the
smallest set of primitives that fits, reach for `html` only for the genuinely custom part, and prefer
one `.js` file.
