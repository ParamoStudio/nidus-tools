// Nidus installable tool — "Glaze Recipes" (a Glazy-style glaze bank).
// • The tile groups glazes by fired result (native card rows) with an "Open Glaze Library" button at
//   the bottom that opens the navigator; "New glaze" always lives in the expanded view (right pane).
// • It's `shareable:true`, so it ACCEPTS dropped cards (bidirectional with Inbox/Ideas/Tasks) and its
//   own cards can be dragged out.
// • Opening a glaze opens the SAME form, pre-filled, so you EDIT it with the pickers + material tables
//   (not the note editor). NON-DESTRUCTIVE: this tool OWNS only its own `extra` fields (recipe/status/
//   surface/cone/notes) + title + photos, and NEVER writes the card body — so a card that also lives in
//   Ideas/Tasks keeps its freeform notes intact. The recipe is rendered for display from `extra` (base →
//   100, additives as %); each tool shows only what's relevant to it. Hotkey "g".
var tool = {
  manifest: {
    id: "glaze-recipes", name: "Glaze Recipes", icon: "book.closed",
    summary: "A recipe book of glazes — normalized recipe, cone, surface — grouped by fired result.",
    version: "1.7.0", sizes: ["1x2", "2x2", "1x1"], allowsMultiple: true,
    store: ["glaze-recipes.md"], shareable: true, hotkey: "g", openLabel: "Open Glaze Library"
  },

  tile: function (ctx) {
    var groups = [
      { key: "tested",   label: "Tested" },
      { key: "totry",    label: "To try" },
      { key: "rejected", label: "Rejected" }
    ];
    var children = [{ type: "text", value: "Glaze recipes", style: "caption" }];
    groups.forEach(function (g) {
      var inGroup = ctx.cards.filter(function (c) { return (c.extra && c.extra.status) === g.key; });
      if (!inGroup.length) return;
      children.push({ type: "text", value: g.label, style: "heading" });
      children.push({ type: "cardList", cards: inGroup, onTap: "open", subtitle: "surface" });
    });
    var untagged = ctx.cards.filter(function (c) { return !(c.extra && c.extra.status); });
    if (untagged.length) {
      children.push({ type: "text", value: "Unsorted", style: "heading" });
      children.push({ type: "cardList", cards: untagged, onTap: "open", subtitle: "surface" });
    }
    if (!ctx.cards.length) {
      children.push({ type: "text", value: "No glazes yet — open the library to add one.", style: "caption" });
    }
    // (No open button here — the host pins an "Open Glaze Library" footer, and the tile header opens it too.)
    return { type: "stack", axis: "v", spacing: 8, children: children };
  },

  expanded: function (ctx) {
    var top = {
      type: "stack", axis: "h", spacing: 20, children: [
        { type: "section", title: "All recipes", children: [
          // Photo tiles grouped by category. Drag a tile to another group to recategorize it.
          { type: "cardGrid", cards: ctx.cards, groupBy: "status", badge: "surface",
            onOpen: "open", onMove: "recategorize", groups: [
              { key: "tested",   label: "Tested" },
              { key: "totry",    label: "To try" },
              { key: "rejected", label: "Rejected" },
              { key: "",         label: "Unsorted" }
            ] }
        ] },
        { type: "section", title: "New glaze", children: [
          { type: "form", submit: "add", submitLabel: "Save recipe", inputs: recipeInputs() }
        ] }
      ]
    };
    var children = [top];
    var lib = librarySection(ctx);   // the OPTIONAL cross-project bank, if this build supports it
    if (lib) children.push(lib);
    return { type: "stack", axis: "v", spacing: 20, children: children };
  },

  // Opening a glaze → a calm READ view (name + photos + the normalized recipe + notes). The pencil
  // switches to `edit` below.
  card: function (card, ctx) {
    var ex = card.extra || {};
    var kids = [{ type: "text", value: card.title, style: "title" }];
    if (card.images && card.images.length) { kids.push({ type: "gallery", images: card.images }); }
    if (isGlaze(card)) {
      // A glaze made in this tool: show its badges + normalized recipe.
      var badges = [];
      if (ex.status)  badges.push({ type: "badge", value: statusLabel(ex.status) });
      if (ex.surface) badges.push({ type: "badge", value: ex.surface });
      if (ex.cone)    badges.push({ type: "badge", value: "Cone " + ex.cone });
      if (badges.length) { kids.push({ type: "stack", axis: "h", spacing: 8, children: badges }); }
      // Rendered from THIS tool's own fields (extra), never from card.body — so we show only what's ours.
      kids.push({ type: "markdown", value: recipeMarkdown(ex) });
      // Optional cross-project bank toggle: keep a favourite glaze so another project can pull it in.
      if (ctx.nidus.library) {
        kids.push(ctx.nidus.library.contains(card.id)
          ? { type: "button", label: "✓ In your library — remove", role: "destructive", onTap: "removeFromLibrary", with: { id: card.id } }
          : { type: "button", label: "Save to library", icon: "tray.and.arrow.down", onTap: "saveToLibrary", with: { id: card.id } });
      }
    } else {
      // An imported/foreign card: NON-DESTRUCTIVE — show only its title + photos here (its own content
      // stays intact and is visible in its original tool). Press the pencil to make it a glaze.
      kids.push({ type: "text", value: "Imported card — press the pencil to fill in its glaze recipe.", style: "caption" });
    }
    return { type: "stack", axis: "v", spacing: 12, children: kids };
  },

  // The pencil opens THIS: the same form, pre-filled from card.extra → edit with pickers + tables +
  // photos → Save.
  edit: function (card, ctx) {
    var ex = card.extra || {};
    var base = safeParse(ex.base), adds = safeParse(ex.additives);
    return {
      type: "form", submit: "save", submitLabel: "Save changes", with: { id: card.id },
      initial: {
        name: card.title, cone: ex.cone || "", status: ex.status || "", surface: ex.surface || "",
        base: base, additives: adds, notes: ex.notes || "", photos: card.images || []
      },
      inputs: recipeInputs()
    };
  },

  handlers: {
    open:    function (ctx, payload) { ctx.nidus.openCard(payload.id); },
    openLog: function (ctx, payload) { ctx.nidus.openExpanded(); },
    // Write ONLY our own fields (extra) + title + photos. We omit `body` on purpose so any freeform
    // content the card carries from other tools is preserved — the tool is non-destructive by design.
    add:     function (ctx, payload) { var g = build(payload); ctx.nidus.cards.add({ title: g.title, extra: g.extra, images: g.images }); },
    save:    function (ctx, payload) { var g = build(payload); ctx.nidus.cards.update(payload.id, { title: g.title, extra: g.extra, images: g.images }); },
    // Drag a tile to another category → just change our own `status` field. Body untouched.
    recategorize: function (ctx, payload) {
      ctx.nidus.cards.update(payload.id, { extra: { status: payload.group } });
    },
    // Cross-project bank. save/remove are owner-gated by the host; importHere makes an independent copy.
    saveToLibrary:     function (ctx, payload) { if (ctx.nidus.library) ctx.nidus.library.save(payload.id); },
    removeFromLibrary: function (ctx, payload) { if (ctx.nidus.library) ctx.nidus.library.remove(payload.id); },
    importFromLibrary: function (ctx, payload) { if (ctx.nidus.library) ctx.nidus.library.importHere(payload.id); }
  }
};

// The optional "My glaze library" section shown at the bottom of the expanded view: every glaze this
// account has banked across ALL projects. Import one into the current project (an independent copy);
// entries this project owns can also be removed. Returns null if the build has no library support.
function librarySection(ctx) {
  if (!ctx.nidus.library) return null;
  var entries = ctx.nidus.library.all();
  var kids = [];
  if (!entries.length) {
    kids.push({ type: "text", style: "caption",
      value: "No glazes banked yet. Open a glaze and “Save to library” to reuse it in other projects." });
  } else {
    entries.forEach(function (e) {
      var ex = e.extra || {};
      var label = e.title + (ex.surface ? " · " + ex.surface : "") + (ex.cone ? " · Cone " + ex.cone : "");
      var row = { type: "stack", axis: "h", spacing: 10, children: [
        { type: "text", value: label, style: "body" },
        { type: "spacer" },
        { type: "button", label: "Import here", icon: "square.and.arrow.down", onTap: "importFromLibrary", with: { id: e.id } }
      ] };
      if (e.ownedHere) {
        row.children.push({ type: "button", label: "Remove", role: "destructive", onTap: "removeFromLibrary", with: { id: e.id } });
      }
      kids.push(row);
    });
  }
  return { type: "section", title: "My glaze library (all projects)", children: kids };
}

// The shared form schema (used by both New glaze and Edit glaze).
function recipeInputs() {
  return [
    { type: "row", fields: [
      { key: "name", type: "text", label: "Name" },
      { key: "cone", type: "text", label: "Cone" }
    ] },
    { key: "status", type: "picker", label: "Status", options: [
      { value: "tested", label: "Tested" }, { value: "totry", label: "To try" }, { value: "rejected", label: "Rejected" }
    ] },
    { key: "surface", type: "picker", label: "Surface", options: [
      { value: "Glossy", label: "Glossy" }, { value: "Semi-glossy", label: "Semi-glossy" }, { value: "Matte", label: "Matte" }
    ] },
    { key: "base", type: "table", label: "Base materials (normalized to 100)", addLabel: "Add material", columns: [
      { key: "material", label: "Material" }, { key: "amount", label: "Amount", numeric: true }
    ] },
    { key: "additives", type: "table", label: "Additives (% of base, not normalized)", addLabel: "Add additive", columns: [
      { key: "material", label: "Additive" }, { key: "amount", label: "%", numeric: true }
    ] },
    { key: "notes", type: "textarea", label: "Notes" },
    { key: "photos", type: "photos", label: "Photos of the result" }
  ];
}

// Builds {title, images, extra} from a form payload. ALL of the tool's data lives in extra (JSON) for
// round-trip editing — we never build a `body`, so the card's freeform notes stay ours-to-ignore, intact.
function build(payload) {
  function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
  var base = (payload.base || []).filter(function (r) { return (r.material || "").trim() && num(r.amount) > 0; });
  var adds = (payload.additives || []).filter(function (r) { return (r.material || "").trim() && num(r.amount) !== 0; });
  var ex = {
    status:  normalizeStatus(payload.status),
    surface: (payload.surface || "").trim(),
    cone:    (payload.cone || "").trim(),
    notes:   (payload.notes || "").trim(),
    base:      JSON.stringify(base),
    additives: JSON.stringify(adds)
  };
  var name = (payload.name || "Untitled glaze").trim();
  return { title: name, images: payload.photos || [], extra: ex };
}

// Renders the readable, normalized Markdown recipe from a card's extra (base → 100, additives as %).
// Display only — used by card(); the result is NEVER written back to the card body.
function recipeMarkdown(ex) {
  function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
  function fmt(x) { return x.toFixed(2); }
  var base = safeParse(ex.base), adds = safeParse(ex.additives);
  var total = base.reduce(function (s, r) { return s + num(r.amount); }, 0);

  // (Status/surface/cone are shown as pills in the card view, not in the body.)
  var lines = [];
  lines.push("## Recipe", "", "| Material | Amount |", "| --- | ---: |");
  if (total > 0) {
    base.forEach(function (r) { lines.push("| " + r.material.trim() + " | " + fmt(num(r.amount) / total * 100) + " |"); });
    lines.push("| **Total base recipe** | **100.00** |");
  }
  var addTotal = 0;
  adds.forEach(function (r) { addTotal += num(r.amount); lines.push("| + " + r.material.trim() + " | " + fmt(num(r.amount)) + " |"); });
  lines.push("| **Total** | **" + fmt((total > 0 ? 100 : 0) + addTotal) + "** |", "");

  if ((ex.notes || "").trim()) { lines.push("## Notes", "", ex.notes.trim()); }
  return lines.join("\n");
}

// A card is one of THIS tool's own glazes (vs a foreign card dragged in) when it carries any of the
// fields this tool writes. Foreign cards (from Inbox/Ideas/Tasks) have none of these.
function isGlaze(card) {
  var ex = card.extra || {};
  return !!(ex.status || ex.surface || ex.cone || ex.base || ex.additives);
}
function safeParse(s) { try { var v = JSON.parse(s || "[]"); return (v && v.length) ? v : []; } catch (e) { return []; } }
function statusLabel(s) { return s === "tested" ? "Tested" : (s === "rejected" ? "Rejected" : "To try"); }
function normalizeStatus(s) {
  s = ((s || "").trim().toLowerCase());
  if (s.indexOf("test") === 0) return "tested";
  if (s.indexOf("rej") === 0) return "rejected";
  if (s.indexOf("to") === 0 || s.indexOf("try") === 0) return "totry";
  return "";
}
