# Repository Guidelines

## Project Structure & Module Organization
This repository is a static GitHub Pages site. The root `index.html` is the landing page; feature pages live in `app/`, `card/`, `protocol/`, `financials/`, `listings/`, `team/`, `tdic/`, and `op/`. Shared assets are centralized in `shared/js/` and `shared/css/`. Keep business logic in page companion modules such as `app/app.js`, `card/card-app.js`, and `range-monitor.js`; leave DOM wiring inside the HTML page that consumes them.

## Build, Test, and Development Commands
There is no build system, package manager, or CI pipeline. Use a simple static server for local work:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/` and test the affected routes, for example `/app/`, `/card/app.html`, or `/protocol/`. Deployment is a plain push to `main`:

```bash
git add <files>
git commit -m "fix: concise summary"
git push origin main
```

## Coding Style & Naming Conventions
Use vanilla HTML, CSS, and JavaScript. Follow the existing 2-space indentation in JS/HTML and preserve the local style of page-level `<style>` blocks. Prefer `const`/`let`, camelCase identifiers, and kebab-case file names. Business logic modules should expose a single namespace ending in `Logic` and stay DOM-free; shared helpers belong in `shared/js/`. Keep shared imports stable: shared CSS/JS first, page-specific code after.

## Testing Guidelines
There is no automated test suite or coverage gate yet. Manual smoke testing is required for every change. Check desktop and mobile layouts, confirm the browser console is clean, and verify both happy-path and error handling for fetch/Web3 flows. If you touch shared CSS or JS, re-test at least `/app/`, `/card/app.html`, `/protocol/`, and `/range-monitor.html`.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style: `fix: ...`, `refactor: ...`, and `docs: ...`. Keep commits focused and descriptive. Pull requests should include a short summary, affected pages/modules, manual validation steps, linked issues, and screenshots for UI changes. Call out any edits to `shared/js/config.js`, contract addresses, backend URLs, or GitHub Pages files such as `CNAME`.

## Security & Configuration Tips
`shared/js/config.js` contains production-facing endpoints, chain IDs, and contract addresses that are exposed client-side. Do not add new secrets to the frontend. Treat config changes as cross-cutting and verify every page that depends on the updated value.
