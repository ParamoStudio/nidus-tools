// Pure-helper tests for the submission Worker. Run: node test/worker.test.mjs
import { slugify, base64Bytes, validateSubmission, validateUpdate, assembleEntry, mergeEntry, sha256hex } from "../src/index.js";

let failed = 0;
function eq(actual, expected, label) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error("FAIL " + label + "\n  expected " + e + "\n  got      " + a); failed++; }
  else console.log("ok   " + label);
}
function ok(cond, label) { eq(!!cond, true, label); }

// slugify
eq(slugify("Glaze Recipes"), "glaze-recipes", "slugify basic");
eq(slugify("  Héllo, World!! "), "hello-world", "slugify accents/punct");
eq(slugify("***"), "untitled", "slugify empty fallback");

// base64Bytes (~ decoded length)
eq(base64Bytes(btoa("hello")), 5, "base64Bytes hello");
eq(base64Bytes(""), 0, "base64Bytes empty");

var cats = ["ceramics", "software"];
function baseBody(extra) {
  return Object.assign({
    type: "microtool", name: "My Tool", summary: "Does a thing.",
    why: "Because reasons.", category: "ceramics", author: "me", version: "1.0.0",
    file: { name: "x.js", contentBase64: btoa("var tool={};") },
    screenshots: [
      { name: "a.png", contentBase64: btoa("img1") },
      { name: "b.png", contentBase64: btoa("img2") },
    ],
    website: "",
  }, extra || {});
}

ok(validateSubmission(baseBody(), cats).ok, "validate happy microtool");
eq(validateSubmission(baseBody({ website: "spam" }), cats).ok, false, "honeypot rejected");
eq(validateSubmission(baseBody({ type: "nope" }), cats).ok, false, "bad type rejected");
eq(validateSubmission(baseBody({ category: "dance" }), cats).ok, false, "unknown category rejected");
eq(validateSubmission(baseBody({ name: "" }), cats).ok, false, "missing name rejected");
eq(validateSubmission(baseBody({ file: { name: "x.md", contentBase64: btoa("x") } }), cats).ok, false, "wrong ext rejected");
eq(validateSubmission(baseBody({ screenshots: [baseBody().screenshots[0]] }), cats).ok, false, "one screenshot rejected");

// template needs no screenshots, and rejects if provided
var tpl = { type: "template", name: "Ceramic Product", summary: "A blueprint.", why: "For pots.",
  category: "ceramics", author: "me", version: "1.0.0", file: { name: "t.md", contentBase64: btoa("# X") }, screenshots: [], website: "" };
ok(validateSubmission(tpl, cats).ok, "validate happy template");
eq(validateSubmission(Object.assign({}, tpl, { screenshots: [{ name: "a.png", contentBase64: btoa("i") }] }), cats).ok, false, "template with screenshot rejected");

// oversized code
var big = "a".repeat(300 * 1024);
eq(validateSubmission(baseBody({ file: { name: "x.js", contentBase64: btoa(big) } }), cats).ok, false, "oversized code rejected");

// assembleEntry
var e = assembleEntry(baseBody(), "my-tool", ["png", "jpg"]);
eq(e.id, "my-tool", "assemble id");
eq(e.file, "tool.js", "assemble file name");
eq(e.screenshots, { primary: "screenshot-1.png", secondary: "screenshot-2.jpg" }, "assemble screenshots");
ok(/^\d{4}-\d{2}-\d{2}$/.test(e.addedAt), "assemble addedAt date");
var et = assembleEntry(tpl, "ceramic-product", []);
eq(et.screenshots, undefined, "template has no screenshots key");
eq(et.file, "template.md", "template file name");

// forkedFrom provenance
var fk = assembleEntry(baseBody({ forkedFrom: { id: "glaze-recipes", name: "Glaze Recipes", type: "tool" } }), "my-fork", ["png", "png"]);
eq(fk.forkedFrom, { id: "glaze-recipes", name: "Glaze Recipes", type: "tool" }, "assemble forkedFrom");
eq(assembleEntry(baseBody(), "x", ["png", "png"]).forkedFrom, undefined, "no forkedFrom when absent");

// validateUpdate: token required; files optional
eq(validateUpdate(baseBody(), cats).ok, false, "update without token rejected");
ok(validateUpdate(baseBody({ editToken: "abc", screenshots: [], file: null }), cats).ok, "update allows omitted file+shots");
ok(validateUpdate(baseBody({ editToken: "abc" }), cats).ok, "update with replacements ok");
eq(validateUpdate(baseBody({ editToken: "abc", screenshots: [baseBody().screenshots[0]] }), cats).ok, false, "update one screenshot rejected");
ok(validateUpdate(Object.assign({}, tpl, { editToken: "abc" }), cats).ok, "update template ok");

// mergeEntry keeps identity + hash, sets updatedAt
var existing = { id: "my-tool", type: "microtool", name: "Old", summary: "old", why: "old", author: "a", authorUrl: "", version: "1.0.0", category: "ceramics", file: "tool.js", screenshots: { primary: "screenshot-1.png", secondary: "screenshot-2.png" }, editTokenHash: "deadbeef", addedAt: "2026-01-01" };
var merged = mergeEntry(existing, baseBody({ name: "New Name", version: "2.0.0" }));
eq(merged.id, "my-tool", "merge keeps id");
eq(merged.editTokenHash, "deadbeef", "merge keeps token hash");
eq(merged.addedAt, "2026-01-01", "merge keeps addedAt");
eq(merged.name, "New Name", "merge updates name");
eq(merged.version, "2.0.0", "merge updates version");
ok(/^\d{4}-\d{2}-\d{2}$/.test(merged.updatedAt), "merge sets updatedAt");

// sha256hex determinism (async)
var h1 = await sha256hex("hello");
var h2 = await sha256hex("hello");
eq(h1, h2, "sha256hex deterministic");
eq(h1, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "sha256hex known vector");
ok(h1 !== (await sha256hex("hell0")), "sha256hex differs on input");

console.log(failed ? ("\n" + failed + " test(s) failed") : "\nAll tests passed");
process.exit(failed ? 1 : 0);
