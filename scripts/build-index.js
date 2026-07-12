#!/usr/bin/env node
// Walks entries/<type>/<id>/entry.json, validates, and writes tools/index.json.
// Run locally (`node scripts/build-index.js`) or from the GitHub Action on every push to main.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENTRIES_DIR = path.join(ROOT, "entries");
const OUT_FILE = path.join(ROOT, "tools", "index.json");

const TYPES = ["tools", "microtools", "templates"];
const TYPE_TO_SINGULAR = { tools: "tool", microtools: "microtool", templates: "template" };

const REQUIRED_FIELDS = ["id", "type", "name", "summary", "why", "author", "version", "category", "file"];
const REQUIRED_SCREENSHOT_TYPES = new Set(["tool", "microtool"]);
const VALID_CATEGORIES = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, "categories.json"), "utf8")).map((c) => c.id)
);

let errors = [];
let entries = [];

for (const typeDir of TYPES) {
  const dir = path.join(ENTRIES_DIR, typeDir);
  if (!fs.existsSync(dir)) continue;
  const expectedType = TYPE_TO_SINGULAR[typeDir];

  for (const id of fs.readdirSync(dir)) {
    const entryDir = path.join(dir, id);
    if (!fs.statSync(entryDir).isDirectory()) continue;
    const entryJsonPath = path.join(entryDir, "entry.json");

    if (!fs.existsSync(entryJsonPath)) {
      errors.push(`${typeDir}/${id}: missing entry.json`);
      continue;
    }

    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(entryJsonPath, "utf8"));
    } catch (e) {
      errors.push(`${typeDir}/${id}: invalid JSON in entry.json (${e.message})`);
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!entry[field] || String(entry[field]).trim() === "") {
        errors.push(`${typeDir}/${id}: missing required field "${field}"`);
      }
    }

    if (entry.id !== id) {
      errors.push(`${typeDir}/${id}: entry.json id "${entry.id}" must match folder name "${id}"`);
    }
    if (entry.type !== expectedType) {
      errors.push(`${typeDir}/${id}: entry.json type "${entry.type}" must be "${expectedType}" (folder ${typeDir}/)`);
    }
    if (entry.category && !VALID_CATEGORIES.has(entry.category)) {
      errors.push(`${typeDir}/${id}: unknown category "${entry.category}" (see categories.json)`);
    }
    if (entry.file && !fs.existsSync(path.join(entryDir, entry.file))) {
      errors.push(`${typeDir}/${id}: file "${entry.file}" referenced in entry.json does not exist`);
    }

    if (REQUIRED_SCREENSHOT_TYPES.has(expectedType)) {
      const shots = entry.screenshots || {};
      if (!shots.primary || !shots.secondary) {
        errors.push(`${typeDir}/${id}: type "${expectedType}" requires screenshots.primary and screenshots.secondary`);
      } else {
        for (const key of ["primary", "secondary"]) {
          if (!fs.existsSync(path.join(entryDir, shots[key]))) {
            errors.push(`${typeDir}/${id}: screenshot "${shots[key]}" does not exist`);
          }
        }
      }
    }

    if (!entry.addedAt) {
      entry.addedAt = new Date().toISOString().slice(0, 10);
    }

    // Paths relative to the repo root, so the site can fetch them directly.
    entry.dir = `entries/${typeDir}/${id}`;
    entries.push(entry);
  }
}

if (errors.length) {
  console.error("build-index failed:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

entries.sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2) + "\n");
console.log(`Wrote ${entries.length} entries to ${path.relative(ROOT, OUT_FILE)}`);
