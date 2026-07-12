var tool = {
  id: "recipe-normalizer",
  name: "Recipe Normalizer",
  icon: "percent",
  summary: "Normalize any technical recipe — glazes, clay bodies, cocktails, chemicals, paints — to a base of 100, with additives as a percentage, and export it as a clean Markdown table.",
  inputs: [
    { key: "title", type: "text", label: "Recipe name", placeholder: "e.g. Base #1" },
    { key: "base", type: "table", label: "Base materials", addLabel: "Add material",
      columns: [
        { key: "material", label: "Material", type: "text" },
        { key: "amount", label: "Amount", type: "number" }
      ] },
    { key: "additives", type: "table", label: "Additives (% of base, not normalized)", addLabel: "Add additive",
      columns: [
        { key: "material", label: "Additive", type: "text" },
        { key: "amount", label: "%", type: "number" }
      ] }
  ],
  render: function(data) {
    function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
    function fmt(x) { return x.toFixed(2); }
    var base = (data.base || []).filter(function(r) { return r.material && r.material.trim() && num(r.amount) > 0; });
    var adds = (data.additives || []).filter(function(r) { return r.material && r.material.trim() && num(r.amount) !== 0; });
    var totalGrams = base.reduce(function(s, r) { return s + num(r.amount); }, 0);

    var lines = [];
    var title = (data.title && data.title.trim()) ? data.title.trim() : "Recipe";
    lines.push("# " + title);
    lines.push("");
    lines.push("| Material | Amount |");
    lines.push("| --- | ---: |");

    if (totalGrams > 0) {
      base.forEach(function(r) {
        lines.push("| " + r.material.trim() + " | " + fmt(num(r.amount) / totalGrams * 100) + " |");
      });
      lines.push("| **Total base recipe** | **100.00** |");
    } else {
      lines.push("| _(no base materials)_ | 0.00 |");
    }

    var addTotal = 0;
    adds.forEach(function(r) {
      addTotal += num(r.amount);
      lines.push("| + " + r.material.trim() + " | " + fmt(num(r.amount)) + " |");
    });
    lines.push("| **Total** | **" + fmt((totalGrams > 0 ? 100 : 0) + addTotal) + "** |");
    return lines.join("\n");
  }
};