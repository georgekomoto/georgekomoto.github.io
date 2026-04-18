# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

Personal GitHub Pages site for R. George Komoto, served from the root of `georgekomoto/georgekomoto.github.io`. GitHub Pages serves `index.html` directly; pushes to the default branch are the deploy.

## Stack and build

- Plain static HTML/CSS/JS — **no build step, no package manager, no test suite, no linter**. There is no `npm`, `bundler`, or Jekyll config; nothing needs to be installed or compiled to preview the site.
- To preview locally, open `index.html` in a browser or run any static server (e.g. `python3 -m http.server`) from the repo root.
- The site is built on the **Prologue** template by HTML5 UP (see `README.txt` for original credits and `LICENSE.txt` for the CCA 3.0 license terms). The template uses jQuery plus the legacy `skel` responsive framework; both are vendored under `assets/js/`.

## Code structure

- `index.html` — the entire single-page site. Sections (`#top`, `#portfolio`, `#about`, `#contact`) are linked from the sidebar `#nav` via hash anchors and scroll-spy. Any new section must follow the same pattern: a `<section id="..." class="...">` block plus a matching `<li><a href="#..." id="..-link" class="icon fa-... skel-layers-ignoreHref">` entry in `#nav`.
- `assets/css/main.css` — **compiled output, edit `assets/sass/main.scss` instead.** There is no automated pipeline in this repo to regenerate `main.css` from the Sass; if you change Sass you must compile it externally (e.g. `sass assets/sass/main.scss assets/css/main.css`) and commit both files. If you only need a small CSS tweak, editing `main.css` directly is acceptable but should also be reflected in the Sass to avoid drift.
- `assets/sass/` — `main.scss` plus `libs/` (`_skel.scss`, `_vars.scss`, `_functions.scss`, `_mixins.scss`). Breakpoints (`wide`, `normal`, `narrow`, `narrower`, `mobile`) and the grid are configured via `skel-breakpoints` / `skel-layout` calls at the top of `main.scss` and mirrored in `assets/js/main.js` — keep the two in sync if you change them.
- `assets/js/main.js` — site behavior (scrolly nav, placeholder polyfill, mobile prioritization). Vendored libs (`jquery.min.js`, `jquery.scrolly.min.js`, `jquery.scrollzer.min.js`, `skel.min.js`, `util.js`) and IE shims under `assets/js/ie/` should not be edited.
- `assets/css/ie8.css` / `ie9.css` and the `<!--[if lte IE ...]>` blocks in `index.html` are legacy IE shims from the template — leave them alone unless intentionally dropping IE support.
- `images/` — site images. `avatar.jpg` and `banner.jpg` are referenced by the layout; `pic02.jpg`–`pic08.jpg` are template placeholder images still wired into the Portfolio and About sections.

## Conventions

- Most of `index.html` is still template lorem-ipsum copy. When editing, prefer replacing placeholder text/images in place over restructuring the markup, so the template's CSS classes (`one dark cover`, `4u 12u$(mobile)`, `image fit`, `image featured`, etc.) keep working — these are skel grid/utility classes, not arbitrary names.
- The contact form's `action="#"` is a placeholder; it does not submit anywhere. Do not claim the form is functional unless an endpoint is wired up.
- Keep changes minimal and template-compatible; the README is intentionally one line (`# georgekomoto.github.io`) — don't expand it without being asked.

## Deployment

GitHub Pages auto-deploys from the default branch. Feature work for this task happens on `claude/add-claude-documentation-G6C5g`; do not push directly to the Pages-serving branch unless explicitly asked.
