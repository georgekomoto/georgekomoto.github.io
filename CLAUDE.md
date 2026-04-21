# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. 
Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. 
For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them. Don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" 
If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it. Don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. 
Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, 
fewer rewrites due to overcomplication, and clarifying questions come 
before implementation rather than after mistakes.

---

## Project specifics

### Repository purpose

Personal GitHub Pages site for R. George Komoto, served from the root of `georgekomoto/georgekomoto.github.io`. GitHub Pages serves `index.html` directly; pushes to the default branch are the deploy.

### Stack and build

- Plain static HTML/CSS/JS — **no build step, no package manager, no test suite, no linter**. There is no `npm`, `bundler`, or Jekyll config; nothing needs to be installed or compiled to preview the site.
- To preview locally, open `index.html` in a browser or run any static server (e.g. `python3 -m http.server`) from the repo root.
- The site is built on the **Prologue** template by HTML5 UP (see `README.txt` for original credits and `LICENSE.txt` for the CCA 3.0 license terms). The template uses jQuery plus the legacy `skel` responsive framework; both are vendored under `assets/js/`.

### Code structure

- `index.html` — the entire single-page site. Sections (`#top`, `#portfolio`, `#about`, `#contact`) are linked from the sidebar `#nav` via hash anchors and scroll-spy. Any new section must follow the same pattern: a `<section id="..." class="...">` block plus a matching `<li><a href="#..." id="..-link" class="icon fa-... skel-layers-ignoreHref">` entry in `#nav`.
- `assets/css/main.css` — **compiled output, edit `assets/sass/main.scss` instead.** There is no automated pipeline in this repo to regenerate `main.css` from the Sass; if you change Sass you must compile it externally (e.g. `sass assets/sass/main.scss assets/css/main.css`) and commit both files. If you only need a small CSS tweak, editing `main.css` directly is acceptable but should also be reflected in the Sass to avoid drift.
- `assets/sass/` — `main.scss` plus `libs/` (`_skel.scss`, `_vars.scss`, `_functions.scss`, `_mixins.scss`). Breakpoints (`wide`, `normal`, `narrow`, `narrower`, `mobile`) and the grid are configured via `skel-breakpoints` / `skel-layout` calls at the top of `main.scss` and mirrored in `assets/js/main.js` — keep the two in sync if you change them.
- `assets/js/main.js` — site behavior (scrolly nav, placeholder polyfill, mobile prioritization). Vendored libs (`jquery.min.js`, `jquery.scrolly.min.js`, `jquery.scrollzer.min.js`, `skel.min.js`, `util.js`) and IE shims under `assets/js/ie/` should not be edited.
- `assets/css/ie8.css` / `ie9.css` and the `<!--[if lte IE ...]>` blocks in `index.html` are legacy IE shims from the template — leave them alone unless intentionally dropping IE support.
- `images/` — site images. `avatar.jpg` and `banner.jpg` are referenced by the layout; `pic02.jpg`–`pic08.jpg` are template placeholder images still wired into the Portfolio and About sections.

### Conventions

- Most of `index.html` is still template lorem-ipsum copy. When editing, prefer replacing placeholder text/images in place over restructuring the markup, so the template's CSS classes (`one dark cover`, `4u 12u$(mobile)`, `image fit`, `image featured`, etc.) keep working — these are skel grid/utility classes, not arbitrary names.
- The contact form's `action="#"` is a placeholder; it does not submit anywhere. Do not claim the form is functional unless an endpoint is wired up.
- Keep changes minimal and template-compatible; the README is intentionally one line (`# georgekomoto.github.io`) — don't expand it without being asked.

### Deployment

GitHub Pages auto-deploys from the default branch. Feature work for this task happens on `claude/add-claude-documentation-G6C5g`; do not push directly to the Pages-serving branch unless explicitly asked.
