# Adding your add-on

You don't need to be a programmer to share a tool, micro tool, or template here. Pick whichever path
feels easier.

*(First time making the file itself? See [How to make one](HOW-TO-MAKE.md) — an AI can build it for you.)*

---

## Easiest path: the upload form

The simplest way — no GitHub account, no git — is the **[Upload form](https://paramostudio.github.io/nidus-tools/submit.html)**
on the marketplace. Drop in your file, fill a few fields, done. It opens the pull request for you and
gives you a link to follow the review. The paths below are for people who'd rather do it by hand.

**Updating or forking:** when you submit through the form you get a one-time **edit code** — save it. To
change your add-on later, open it on the marketplace → **Update (if you're the owner)** → paste the code.
Anyone can also **Fork** an add-on to publish an improved version, credited back to the original.

---

## Let an AI do it

Open your AI assistant (Claude, ChatGPT, or one that can use GitHub) and say something like:

> *"Help me submit my Nidus tool to the nidus-tools marketplace at
> https://github.com/ParamoStudio/nidus-tools — here's my file."*

Point it at this repo and give it your file. It can create the folder, write the small description, and
open the submission for you. Then you just confirm.

---

## By-hand path (still simple)

You'll add one small folder and open a "pull request" (GitHub's way of saying *"here's my addition,
please include it"*). GitHub shows you buttons for each step.

**1. Make a folder** for your add-on, based on its type:

```
entries/tools/<your-name>/           ← for a tool
entries/microtools/<your-name>/      ← for a micro tool
entries/templates/<your-name>/       ← for a template
```

**2. Put your file in it** (`tool.js` for a tool or micro tool, `template.md` for a template).

**3. Add a small `entry.json`** describing it — copy this and fill it in:

```json
{
  "id": "your-name",
  "type": "tool",
  "name": "Display Name",
  "summary": "One sentence about what it does.",
  "why": "2–4 sentences: what it's for and why you made it.",
  "author": "your-name",
  "authorUrl": "https://github.com/you",
  "version": "1.0.0",
  "category": "ceramics",
  "file": "tool.js"
}
```

- `type` is `tool`, `microtool`, or `template` (match the folder).
- `category` must be one from [`categories.json`](categories.json).
- **Tools and micro tools** also need two screenshots and this line in `entry.json`:
  ```json
  "screenshots": { "primary": "screenshot-1.png", "secondary": "screenshot-2.png" }
  ```
  For a tool: the collapsed tile, then the open view. For a micro tool: the form, then an example of its
  output. **Templates need no screenshots** — the site draws a preview from your file.

**4. Open a pull request.** A maintainer checks it and merges it. Once merged, it appears on the site
automatically.

---

## The rules (short)

- One add-on per pull request.
- Keep the `why` honest and specific.
- Nidus runs every add-on in a locked sandbox (no file, network, or system access), but don't submit
  anything spammy, broken, or malicious — PRs are reviewed.
- Updating your own entry? Bump the `version`.
