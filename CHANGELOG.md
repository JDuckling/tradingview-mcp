# Changelog

All notable changes to the AlphaSignal fork of `tradingview-mcp`.

This fork follows [semver](https://semver.org/) loosely: major bumps when tool response shapes change or new error sentinels appear; minor when tools are added; patch for bug fixes that preserve shapes.

## [3.1.1] — 2026-05-21

Three follow-up PRs after 3.1.0. All bug fixes / cleanup, no contract changes.

### Fixed

- **#142** (stuck state after failed `chart_manage_indicator add`, PR #19,
  commit `6a70e70`) — `manageIndicator(action="add")` wraps `createStudy()`
  in try/finally and dispatches an Escape KeyboardEvent on every exit path.
  TV's "Insert Indicator" dialog was being left open on failed add,
  blocking subsequent add + pine_new calls until TV restart. Verified live:
  forced-fail add → MACD add now succeeds (previously blocked).
- **#164** (`watchlist_add` "Watchlist button not found", PR #19) — the
  legacy `[data-name="base-watchlist-widget-button"]` selector was removed
  in TV 3.1.0 and the old code threw before ever attempting the add.
  Rewrite: skip the toggle check entirely (if `watchlist_get` works, the
  panel is reachable), broader add-button selector list (incl.
  `[data-name="watchlist-add-symbol-button"]` for TV 3.1.x), DOM-walk
  fallback that scans right-panel buttons for aria-label / title /
  textContent matches, last-resort "+" button in upper-right quadrant.
  Payload now reports `selector_used` for future drift diagnosis.
  Verified live: NASDAQ:NVDA added (watchlist count 11 → 12).
- **Pine Editor `pine_new` selector drift** (PR #20, commit `985aec5`)
  — surfaced through #142 live verification; same root cause as #164.
  `ensurePineEditorOpen()` selector chain expanded
  (`[data-name="pine-editor-button"]` + aria-label / title / class
  variants incl. RU locale), bottom-widget-bar tab fallback, CDP-level
  Alt+E hotkey path. Verified live: `pine_new(indicator)` now opens
  Monaco and injects template.
- **Pine Editor Alt+E CDP modifier bug** (this PR) — initial Alt+E
  fallback used `modifiers: 8` which is **Shift** per CDP spec, not Alt
  (Alt = 1). Hotkey path was silently broken; Pine Editor only opened
  via the selector chain. Now corrected to `modifiers: 1`. Inline
  comment added documenting the CDP modifier bitmask
  (1=Alt, 2=Ctrl, 4=Meta, 8=Shift) to prevent recurrence.

### Cleanup

- **`wrapServer` dead fallback** (PR #19) — removed `inner.error` legacy
  v2 fallback from the failure-log error extraction. Since the v3.0.0
  hard break (PR #11) every tool handler emits `inner.detail`; the
  fallback was load-bearing only during the migration window.
- **Git orphan objects** (PR #19) — `git gc --prune=now --aggressive`
  cleaned ~10 unreachable trees/commits/blobs from PR #9 abandoned
  branch and the kuldeeppatel123 / tlcreativeart-hub cherry-pick
  fetches. `git fsck --unreachable` now empty.

### Added

- **`_shapePayload` unit tests** (PR #19, +11 tests in
  `tests/wrap.test.js`) — covers the three Phase 6 return-shape rules
  (stale_feed sentinel → STALE_DATA, success: false → INTERNAL_ERROR,
  success: true → strip) without needing live TV / frozen WS. Plus
  defensive cases (null, array, primitive, branch ordering). `_shapePayload`
  exported from `src/tools/_wrap.js` for test access. test:unit total
  54 → 65.
- **`wait_for_render` true-path in `smoke-mcp`** (PR #19) — added
  assertion that calls `capture_screenshot({region:'chart',
  wait_for_render: true})` and checks `payload.waited_for_render === true`.
  smoke:mcp 14/14 → 15/15.
- **`docs/MAINTENANCE.md` "Merging PRs (gh CLI gotcha)"** (PR #19) —
  codifies the rule that `gh pr merge <N> --repo X` must always include
  the PR number explicitly. The no-arg form prints help and silently
  no-ops; combined with `git branch -d`, this is how PR #9 was
  orphaned and recovered via cherry-pick into PR #10.

## [3.1.0] — 2026-05-21

Five additive PRs after the 3.0.0 contract refactor. No breaking changes
in this release; minor bump per semver because PRs #14 and #17 add new
behavioural surface (failure-log rotation, `wait_for_render` arg).

### Fixed

- **#143** (`data_get_study_values` same-name dedup, PR #17, commit
  `6c0588a`) — cherry-pick of `kuldeeppatel123/tradingview-mcp@08d44f5`.
  Each study entry now carries `entity_id` + a normalized `inputs` map,
  so multiple EMAs at different lengths are distinguishable. Conflict
  resolved against the v3.0.0 fallback guard.
- **#144** (`capture_screenshot` stale frame, PR #17, commit `141207c`)
  — cherry-pick of `tlcreativeart-hub/tradingview-mcp@e177b56`
  (upstream PR #148). Adds `wait_for_render` MCP arg + `waitForRender`
  core option + `waitForChartCanvasReady()` helper in `src/wait.js`.
  Use after `chart_set_symbol` / `chart_set_timeframe` to avoid a
  stale-frame screenshot.
- **wrapOk graceful-failure misclassification** (PR #15, commit
  `94378ea`) — in 3.0.0, core functions that returned
  `{success: false, error: '...'}` as a non-throwing failure path were
  being wrapped as `ok({success: false, ...})`, leaving consumers with
  `r.ok === true` despite the failure. Now translated to proper
  `err(STATUS_CODES.INTERNAL_ERROR, raw.error, ...)`.
- **stale-feed sentinel mis-wrap** (PR #15) — PR #154's
  `{success: false, stale_feed: true, ...}` shape was similarly being
  wrapped as `ok()` in 3.0.0. Now translated to
  `err(STATUS_CODES.STALE_DATA, raw.reason, ...)` with the rest of the
  sentinel carried in `payload`.

### Added

- **failure-log rotation** (PR #14, commit `a63e904`) —
  `src/lib/failure-log.js` rotates the log on every append if the file
  is from a previous UTC day (→ `failures.<YYYY-MM-DD>.jsonl`) or
  exceeds `MAX_LOG_BYTES` (default 10 MB, override via
  `TV_MCP_FAILURE_LOG_MAX_BYTES`, → `failures.<YYYY-MM-DD.HHMMSS>.jsonl`).
  Non-throwing. 5 new tests in `tests/failure-log.test.js`.
- **`scripts/smoke-mcp.js` + `npm run smoke:mcp`** (PR #16, commit
  `ec557d4`) — spawns `node src/server.js`, performs MCP initialize
  handshake over stdio JSON-RPC, validates 14 tool responses against
  the OperationResult JSON Schema via Ajv. Closes the gap that
  `smoke-test.js` (core-import) cannot cover. Includes a
  `FAIL_SUCCESS_NOISE` guard that fails if Phase 6 strip regresses.
- **Phase 6 cosmetic `success: true` strip** (PR #15) — `wrapOk` now
  strips the field from payloads before returning ok(). Consumers read
  straight from `r.payload.X`, no more `r.payload.success` noise.
- **Smoke coverage** (PR #15) — core-import smoke +6 read-only tools:
  tv_discover, tv_ui_state, alert_list, replay_status, tab_list,
  pane_list. Total 20/20.
- **CI matrix node 20/22** (PR #13, commit `fddd707`).
- **ESLint over `tests/`** (PR #13) — extends `lint` script to cover
  the test directory; baseline cleaned (4 warnings fixed).

### Changed

- **`failure-log.js wrapServer()`** (PR #8 ground-prepared, PR #15
  finalised) — error-response handler reads `inner.detail` (v3) with
  `inner.error` as a v2 legacy fallback. Done now that all tool
  handlers emit `inner.detail`.

## [3.0.0] — 2026-05-21

**Breaking change:** every MCP tool now returns a unified `OperationResult` shape instead of the previous per-tool `{success, error}` / raw payload mix. Consumers (Claude Code system.md, third-party clients) MUST update their response parsing. See `src/lib/operation-result.js` for the contract and the migration plan in `plans/2026-06-01-mcp-operation-result-contract.md`.

### Contract

```
{
  ok: boolean,              // true on success
  status_code: string,      // enum: success / validation_error / connection_error / timeout /
                            //       not_supported / internal_error / stale_data / not_found / rate_limited
  detail: string,           // human-readable; non-empty when ok=false
  payload: any,             // tool-specific data on success; null on failure (or partial data, e.g. stale-feed sentinel)
  action: string,           // MCP tool name
  trade_outcome: object|null  // reserved for Phase 2 IBKR execution-tier tools; always null in this release
}
```

The contract is adapted from webull-agent-skills' execution-tier `OperationResult` pattern so that Phase 2 IBKR can extend it (`trade_outcome`) without re-shaping the data tier.

### Added

- **`src/lib/operation-result.js`** (commit `1bb0700`) — factory functions `ok()` / `err()`, enum `STATUS_CODES`, predicate `isOperationResult()`. Strict validation: unknown status_codes throw, empty detail throws, status_code='success' to `err()` throws.
- **`schemas/operation-result.json`** — JSON Schema draft 2020-12. Used by smoke-test + unit tests via `ajv` (devDependency). Production code stays validation-free (hybrid validation strategy).
- **`tests/operation-result.test.js`** — 20 unit tests covering factory happy paths, factory rejection paths, schema validation. `test:unit` now runs 49 tests total.
- **`src/tools/_wrap.js`** (commit `684798a`) — `wrapOk(toolName, coreFn)` helper that collapses the trivial try/catch around a core call. `okResponse` / `errResponse` for tools with custom error classification. `classifyError(message)` heuristic mapper (available but used sparingly; per-tool inline mapping reads cleaner).

### Migrated (all 78 tools)

Three category PRs:
- **Cat 1 (24 tools, commit `684798a`)**: chart + data + watchlist + symbol.
  - `data_get_indicator`: 'Study not found' → `NOT_FOUND`.
  - `depth_get`: missing DOM panel → `NOT_SUPPORTED`; legacy `hint` preserved in `payload`.
  - `watchlist_add`: upstream #164 'Watchlist button not found' → `NOT_SUPPORTED`; Escape-key UI recovery preserved.
- **Cat 2 (29 tools, commit `1ee10e6`)**: drawing + pine + ui.
  - `draw_remove_one` / `draw_get_properties`: 'Shape not found' → `NOT_FOUND`.
  - `pine_open`: 'not found' / 'no such' → `NOT_FOUND`; legacy `source: 'internal_api'` preserved in `payload`.
- **Cat 3 (25 tools, commit `a3e8014`)**: health + replay + alerts + batch + capture + indicators + pane + tab.
  - `tv_health_check`: failure → `CONNECTION_ERROR`; launch hint preserved in `payload`.
  - `indicator_set_inputs` / `indicator_toggle_visibility`: 'Study not found' → `NOT_FOUND`.

Everything else uses the `wrapOk` default (any throw → `INTERNAL_ERROR`).

### Changed

- **`src/lib/failure-log.js`** `wrapServer()` now reads `inner.detail` (v3.0.0 OperationResult field) with `inner.error` as a v2 legacy fallback so partially-migrated states don't lose log text.

### Known transitional behaviour

- **`payload` may still contain a legacy `success: true` field** for tools where the core function returns `{success: true, ...}`. Harmless noise — consumers should read `r.ok`, not `r.payload.success`. A future Phase 6 could strip `success` from core return shapes, but that's a behavioural cleanup, not a contract change.
- **Smoke test** still imports core/* directly so it can't catch tool-registration bugs (e.g. a schema/param mismatch). Documented in `docs/MAINTENANCE.md` backlog: a future smoke variant should spawn the MCP server and exercise tools through stdio.

## [2.0.1] — 2026-05-21

Follow-up patch after a second critical-review pass found two real gaps in the 2.0.0 release.

### Fixed

- **`data_get_ohlcv` MCP schema did not expose `symbol`.** The 2.0.0 release cherry-picked PR #154 which makes `core.getOhlcv({ symbol })` correct — but the MCP tool registration in `src/tools/data.js` only forwarded `{ count, summary }`. Net effect: `data_get_ohlcv` via MCP still returned active-chart data regardless of any `symbol` requested by the caller, even though `core.getOhlcv` was capable of switching. The 2.0.0 CHANGELOG / PR description / MAINTENANCE.md all claimed the fix covered both `quote_get` and `data_get_ohlcv`; that was only half true. Schema now exposes `symbol` (optional) with a description matching `quote_get`'s — same ~10-15 s cross-symbol cost.
- **`src/lib/failure-log.js` `mask()` could crash the MCP server** on circular references or pathologically deep objects (stack overflow inside the recursive masker, thrown *outside* the existing `try/catch` around `appendFileSync`). New `safeSerialiseArgs()` wraps both `mask()` and `JSON.stringify()` in a try/catch and falls back to a `"[failure-log: args serialisation failed: <reason>]"` sentinel so the log entry is still written and the server stays up.

### Added

- **Smoke-test cross-symbol assertion** for `data_get_ohlcv` (was missing — earlier smoke only exercised the no-symbol path, which is why the MCP-layer schema gap slipped through). 14/14 pass.

### Known limitation surfaced

- `scripts/smoke-test.js` imports `core/*` modules directly, not the MCP tool layer. It can therefore never catch tool-registration bugs like the `data_get_ohlcv` symbol omission above. Worth a future smoke variant that spawns the MCP server and exercises tools through stdio — backlog.

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
