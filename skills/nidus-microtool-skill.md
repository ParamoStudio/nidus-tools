---
name: nidus-microtool-maker
description: Author a Nidus micro-tool — a single self-contained .js file that adds a small schema-driven form to a note card and turns the input into a Markdown block copied to the clipboard. Use when the user asks to create/generate a Nidus micro-tool, a card plugin, or "a micro-tool for Nidus". Different from installable card-tools (see nidus-toolmaker, a whole new tool with its own tile/cards) and Blueprint templates (see nidus-blueprint-maker).
---

# Nidus Micro-Tool Maker

You are generating a **Nidus micro-tool**: a single self-contained `.js` file that adds a small,
schema-driven form (accessed from a floating column beside any card in Edit mode) and turns the
user's input into a **Markdown block copied to the clipboard** — the user pastes it (⌘V) wherever
they want. The host draws ALL the form UI (add/remove rows, live Markdown preview); you only declare
the input schema and a pure `render(data)` function. Your entire output is ONE `.js` file — no prose,
no fences, no extra files.

This is smaller and simpler than a full installable tool (`nidus-toolmaker`): a micro-tool has no tile,
no cards, no persistence — it's a one-shot generator, gone the moment its output is copied.

## Runtime (read first)

Bare JavaScriptCore (`JSContext`): no DOM, no `window`/`console`, no `import`/`require`, no network, no
filesystem, no timers, no `async`/`await`, no `fetch`. `var`/`function`, `Array`/`String` methods,
`parseFloat`, `Math`, `JSON` are safe; avoid exotic syntax. **Pure and deterministic**: same input →
same output, no randomness, no dates, no side effects.

## The `tool` object (exact contract)

One global `var tool = { ... };` with: `id` (kebab-case, unique), `name` (≤~24 chars), `icon` (an SF
Symbol name, e.g. `percent`, `flame`, `tablecells`; falls back to `wand.and.stars`), `summary` (one
sentence), `inputs` (array, may be `[]`), `render` (function(data) → Markdown string).

## Input schema (`inputs`) — the types

```js
{ key: "title", type: "text", label: "Recipe name", placeholder: "e.g. Base #1" }
{ key: "notes", type: "textarea", label: "Notes" }
{ key: "ratio", type: "number", label: "Ratio", placeholder: "0" }   // arrives as a STRING, parse yourself

// Fixed-column repeating table:
{ key: "base", type: "table", label: "Base materials", addLabel: "Add material",
  columns: [{ key: "material", label: "Material", type: "text" }, { key: "amount", label: "Amount", type: "number" }] }

// Free-growing grid (both rows AND columns), when columns aren't fixed/semantic:
{ key: "grid", type: "grid", label: "Table", rows: 2, cols: 2 }

// Several scalar fields on one line (declutters tall forms):
{ type: "row", fields: [
    { key: "name", type: "text", label: "Material", maxLength: 14 },
    { key: "max", type: "number", label: "Max %" } ] }

// Choose one preset — value is a string, drives conditional fields via showWhen:
{ key: "template", type: "picker", label: "Template", style: "list",  // "list" | "chips" | "menu"
  options: [{ value: "cocktail", label: "Cocktail", description: "A drink recipe." }] }

// A numbered series — code prefix + count → N rows with an auto label + editable columns:
{ key: "batch", type: "batch", label: "Tests",
  columns: [{ key: "change", label: "Change / additive" }, { key: "notes", label: "Notes" }] }
// render receives data.batch = { prefix: "Nm", items: [ { n: 1, change, notes }, … ] }
```

Any `text`/`number` (top-level or inside `row`) may set `maxLength`. Every `key` must be unique in its
scope, `[a-zA-Z0-9_]+`. `table` starts with one empty row; `grid` starts at `rows`×`cols` — never
assume content in `render`, filter/guard empties. A blank field just yields `""` to `render` — there's
no separate "disable" control; treat empty as "skip this section" in your own logic if a whole section
(heading included) should hide when unfilled.

**Conditional fields (`showWhen`)** — build a template picker whose fields only appear once chosen:
```js
{ key: "spirit", type: "text", label: "Base spirit", showWhen: { key: "template", equals: "cocktail" } }
```
`equals` is a string or array of strings. The picker starts unselected, so nothing shows until picked.

`table` vs `grid`: use `table` when columns are known/semantic (read by key); use `grid` when the user
should freely add columns or the tool is essentially a visual table editor (you receive a 2D
`string[][]`, first row conventionally the header — read defensively, `(row && row[i]) || ""`).

## `render(data)` (exact contract)

`data` is keyed by each input's `key`. `text`/`textarea`/`number` → string (parse numbers yourself,
guard `NaN`). `table` → array of row objects. `grid` → 2D string array. Must `return` a single Markdown
string — never `undefined`/a number/an object; on empty input return a sensible minimal Markdown
string rather than throwing.

```js
render: function(data) {
  function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
  var rows = (data.base || []).filter(function(r) { return r.material && r.material.trim() && num(r.amount) > 0; });
  var lines = ["# " + (data.title || "Recipe"), "", "| Material | Amount |", "| --- | ---: |"];
  rows.forEach(function(r) { lines.push("| " + r.material.trim() + " | " + num(r.amount).toFixed(2) + " |"); });
  return lines.join("\n");
}
```

## Markdown Nidus renders (produce ONLY this subset)

`#`/`##`/`###` headings, `**bold**`/`*italic*`, `- `/`* ` bullets, `1. ` numbered lists, GFM pipe
tables (header + `---`/`---:` separator + rows, keep every row rectangular), and fenced ` ``` ` code
blocks (monospace, whitespace preserved — good for ASCII diagrams). NOT supported: nested/indented
lists, blockquotes, images, multi-paragraph cells, link syntax (renders as plain text).

## Icons, naming, install

`icon` is a real SF Symbol (e.g. `percent`, `tablecells`, `flame`, `drop`, `testtube.2`,
`chart.bar`, `ruler`, `wand.and.stars` as fallback) — no emoji, no paths. Save as `<id>.js`; `id` must
not collide with a built-in (`recipe-normalizer`, `table-builder`, `triaxial-calculator`,
`batch-renamer`, `template-library`) or another installed one. The user installs via a card's Edit
mode → micro-tools column → **+ (Manage) → Import micro-tool (.js)**, or by dropping it into the
vault's `_microtools/` folder.

## Self-check before you output

One `var tool = {...}`; all six fields present with correct types; every input/column `key` unique;
`render` reads those exact keys, treats everything as a string, guards `NaN`/blanks, returns Markdown;
only the supported Markdown subset; tables rectangular; no imports/async/I-O/randomness/dates; output
is ONLY the `.js` content.

## Worked example (a quick ratio tool)

```js
var tool = {
  id: "ratio-percent", name: "Ratio to %", icon: "percent",
  summary: "Turn a part and a whole into a percentage line.",
  inputs: [
    { key: "part", type: "number", label: "Part", placeholder: "0" },
    { key: "whole", type: "number", label: "Whole", placeholder: "0" }
  ],
  render: function(data) {
    function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
    var w = num(data.whole);
    var pct = w === 0 ? 0 : num(data.part) / w * 100;
    return "**" + num(data.part) + " / " + w + "** = **" + pct.toFixed(2) + "%**";
  }
};
```

For the complete contract with every worked example (table-builder's grid consumption, batch
composition, multi-template pickers with `showWhen`) and edge-case rules, see
`NIDUS-microtool-authoring.md` in the Nidus repo root — this file is the condensed, actionable version.
