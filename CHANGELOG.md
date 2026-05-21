# Changelog

All notable changes to the AlphaSignal fork of `tradingview-mcp`.

This fork follows [semver](https://semver.org/) loosely: major bumps when tool response shapes change or new error sentinels appear; minor when tools are added; patch for bug fixes that preserve shapes.

## [2.0.0] — 2026-05-21

Aligns `package.json` version with the long-standing `src/server.js` `version: '2.0.0'` field (previously `package.json` lagged at `1.0.0`). Bumped as major because the #140 cherry-pick changes `quote_get` / `data_get_ohlcv` happy-path latency (10–15 s for cross-symbol calls vs. ~instant before) and introduces a new `{ success: false, stale_feed: true, ... }` response sentinel that callers may need to handle. See [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) for the routing recommendation.

### Fixed

- **#140** `quote_get(symbol=X)` and `data_get_ohlcv({symbol=X})` ignored the `symbol` parameter and returned the active chart's data. Cherry-picked ORDO618's upstream PR #154 (commit `ee3f0fc`) which adds a `_withSymbol(symbol, fn)` wrapper around the read: switches chart, waits for `mainSeries.isLoading()` to clear, reads, restores the original symbol. Includes a v2 silent-fallback sentinel (`{success: false, stale_feed: true, reason, fallback_advice, requested_symbol, current_chart_symbol}`) for the case where the WS feed is frozen — surfaces the failure instead of returning stale data. Fork-only adjustment: added `src/fallback/{state,adapter}.js` stubs (`fc7319b`) because PR #154 imports a fallback adapter that exists in neither upstream nor ORDO618's fork.
- **#171** `chart_get_visible_range`, `chart_scroll_to_date`, `symbol_info` all threw `evaluate is not defined`. Root cause: three functions in `src/core/chart.js` were missed during the DI refactor — they referenced `evaluate` directly but the module only imports it as `_evaluate` alias. Fix mirrors the existing `_resolve(_deps)` pattern used by the other functions in the file. (commit `06668f6`)
- **#116 + #137** `draw_list`, `draw_clear`, `draw_remove_one`, `draw_get_properties` all errored with `getChartApi is not defined`. Same DI root cause as #171, in `src/core/drawing.js`. Caught by the ESLint baseline below. (commit `d835799`)

### Added

- **`docs/MAINTENANCE.md`** (commit `b7da824`) — patches log, quality gates (lint / test:unit / smoke), upstream-sync procedure, MCP restart pattern, known-disabled features, performance trade-offs, backlog.
- **`scripts/smoke-test.js`** + `npm run smoke` (commit `8c5e17f`, extended in this release to 13 tools) — local pre-merge smoke test with structured assertions (status / payload schema / latency). Includes regression guards for #140, #171, and #116/#137. Requires running TV Desktop. Inspired by webull-agent-skills' observability principle.
- **`src/lib/failure-log.js`** + `wrapServer()` integration (commit `93d10ff`) — JSON-lines append to `~/.tradingview-mcp/failures.jsonl` (override via `TV_MCP_FAILURE_LOG` env) for every tool throw and every `{isError: true}` response. Sensitive-key masking on `args`. Transparent to per-tool code via a single `wrapServer(server)` call in `src/server.js`.
- **ESLint flat config** (`eslint.config.js`) + `npm run lint` (commit `7d1fa0c`) — `no-undef: error` and `no-unused-vars: warn`. The baseline cleanup pass folded into the same commit fixed three real warning sources (unused imports in `pane.js` / `tab.js` / `watchlist.js`, unused arg in `wait.js`).
- **GitHub Actions CI** (`.github/workflows/ci.yml`, commit `9f740a3`) — runs `npm ci` + `npm run lint` + `npm run test:unit` + `node --check scripts/smoke-test.js` on push to `main` / `alphasignal-main` and on PRs.

### Removed

- **`UPSTREAM_PR_DRAFT.md`** and **`test-symbol-cache-fix.mjs`** — both arrived with the #140 cherry-pick (`ee3f0fc`) as author's drafts for upstream submission and their own smoke test. Not relevant to our fork; the patches log + `scripts/smoke-test.js` cover the same ground better.

### Performance notes

- **`quote_get(symbol=X)` cross-symbol cost ≈ 10–15 s** in this release because the #140 fix performs a real `chart.setSymbol(X)` + load-wait + read + restore. Same-symbol reads (`quote_get()` without args, or with the active chart's symbol) are unchanged. For multi-symbol baselines, use `watchlist_get` against a pre-populated watchlist — single instant call, no chart switch. See `docs/MAINTENANCE.md` → "Performance trade-offs".
- **Chart visibly switches** to the requested off-chart symbol for the duration of a cross-symbol `quote_get`. Visible to anyone watching the TV window. Acceptable for batch tool use, less so for interactive live analysis.

## Prior history

For pre-fork upstream history see the commit log on `main` before `4795784` (the merge base when this fork's `alphasignal-main` branch was cut on 2026-05-21).
