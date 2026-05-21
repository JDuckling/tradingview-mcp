# Maintenance — JDuckling/tradingview-mcp

This fork is the AlphaSignal data-MCP. Upstream is `tradesdontlie/tradingview-mcp` — its maintainer has been inactive since 2026-04-04, so we maintain this fork directly and carry our own patches.

## Applied patches

| Closes | Branch | SHA | Notes |
|---|---|---|---|
| #140 (`quote_get` ignores symbol) | alphasignal-main | `ee3f0fc` | Cherry-pick of ORDO618 PR #154. Adds `_withSymbol(symbol, fn)` wrapper + v2 stale-feed sentinel. |
| #140 dependency | alphasignal-main | `fc7319b` | Stubs in `src/fallback/` so PR #154's `isFallbackActive` import doesn't break. |
| #171 (`evaluate is not defined`) | alphasignal-main | `06668f6` | DI miss in `src/core/chart.js` — 3 functions (`getVisibleRange`, `scrollToDate`, `symbolInfo`) didn't take `_deps` / call `_resolve`. |
| #116 + #137 (drawing API broken) | alphasignal-main | `d835799` | Same DI miss in `src/core/drawing.js` — 4 functions (`listDrawings`, `getProperties`, `removeOne`, `clearAll`). Caught by ESLint baseline. |
| #140 follow-up (2.0.1) | alphasignal-fix-incomplete | `344ce31` | MCP tool `data_get_ohlcv` schema in `src/tools/data.js` didn't actually expose the `symbol` parameter even though `core.getOhlcv` accepted one — the 2.0.0 release fixed #140 only for `quote_get` in practice. Also hardens `src/lib/failure-log.js mask()` against circular refs / deep nests (would have crashed the server). |
| **v3.0.0 OperationResult contract** | (Phase 1-5 PRs #7 / #8 / #10 / #11 / this one) | `1bb0700` / `684798a` / `1ee10e6` / `a3e8014` | All 78 MCP tools now return a unified `{ok, status_code, detail, payload, action, trade_outcome}` shape. STATUS_CODES enum: success / validation_error / connection_error / timeout / not_supported / internal_error / stale_data / not_found / rate_limited. See `src/lib/operation-result.js`, `schemas/operation-result.json`, `tests/operation-result.test.js`, and the CHANGELOG 3.0.0 entry. Foundation for Phase 2 IBKR execution-tier `trade_outcome` extension. |
| **v3.0.1 Phase 6 cleanup** | PR #15 | `94378ea` | `src/tools/_wrap.js` strips cosmetic `success: true` from payloads, translates legacy `success: false` and PR-#154 stale-feed sentinel into proper `err()` responses. Smoke +6 read-only assertions (20/20). MCP-stdio smoke variant added (PR #16, `ec557d4`, 14/14). |
| **#143** (`data_get_study_values` same-name dedup) | this batch | `6c0588a` | Cherry-pick of kuldeeppatel123/tradingview-mcp@`08d44f5` (T109 pick C). Adds `entity_id` + normalized `inputs` map per study entry. Resolves the case of multiple "Moving Average Exponential" studies at different lengths all looking identical to callers. Conflict resolved against the v3.0.0 fallback guard. |
| **#144** (`capture_screenshot` stale frame) | this batch | `141207c` | Cherry-pick of tlcreativeart-hub/tradingview-mcp@`e177b56` (upstream PR #148). Adds `wait_for_render` MCP arg + `waitForRender` core option + `waitForChartCanvasReady()` helper in `src/wait.js`. Conflict resolved against v3.0.0 wrapOk handler. |
| **#142** (stuck state after failed indicator add) | PR #19 | `6a70e70` | `manageIndicator(action="add")` wraps `createStudy()` in try/finally + dispatches Escape KeyboardEvent on every exit so leftover "Insert Indicator" modal doesn't block subsequent adds. Verified live: forced-fail add → MACD add succeeds. |
| **#164** (`watchlist_add` button not found) | PR #19 | `6a70e70` | TV 3.1.0 removed the historical `[data-name="base-watchlist-widget-button"]`. Rewrite skips the toggle check, expands the add-button selector chain (`[data-name="watchlist-add-symbol-button"]` for 3.1.x), adds DOM-walk + last-resort "+" button fallback. Payload now reports `selector_used` for drift diagnosis. Verified live: NVDA added (count 11→12). |
| Pine Editor selector drift | PR #20 + PR #21 | `985aec5` / `72ad891` | `ensurePineEditorOpen()` selector chain expanded with TV 3.1.0 names + RU locale, bottom-widget-bar tab fallback, CDP Alt+E hotkey path. **Modifier bug fix in 3.1.1**: initial Alt+E used `modifiers: 8` (= Shift per CDP spec, not Alt). Now `modifiers: 1` with inline comment documenting the bitmask (1=Alt, 2=Ctrl, 4=Meta, 8=Shift). Verified live: `pine_new(indicator)` opens Monaco + injects template. |

## Local quality gates

`npm run lint` — ESLint flat config (`eslint.config.js`). `no-undef: error` is the rule that caught #116/#137 and is the regression class CI blocks. Exits 0.

`npm run test:unit` — node:test runner over `pine_analyze.test.js` + `cli.test.js` + `operation-result.test.js`. 49 tests, no TV required. The 20 `operation-result` tests use Ajv 2020 (`ajv/dist/2020.js`) to validate the OperationResult JSON Schema.

`npm run smoke` — `scripts/smoke-test.js`. 14 structured assertions (status / schema / latency) against the live TV Desktop session. Includes explicit regression guards for #140 on both `quote_get` and `data_get_ohlcv` paths, all three #171-fixed functions, and the #116/#137 drawing API. Requires TV running with `--remote-debugging-port=9222`. Use this before merging to `main`.

`npm test` — full e2e (requires TV). Optional in maintenance flow.

## Failure log

Tool-handler exceptions and `{isError: true}` responses are appended to `~/.tradingview-mcp/failures.jsonl` (override via `TV_MCP_FAILURE_LOG` env). JSON lines, sensitive-key masking, stack trimmed to 10 lines. Wired via `wrapServer()` in `src/server.js` — transparent to per-tool code.

To rotate: stop MCP, `mv failures.jsonl failures.jsonl.YYYY-MM-DD`, restart. No automatic rotation.

To inspect during a debugging session:

```bash
tail -f ~/.tradingview-mcp/failures.jsonl | jq .
```

## CI

`.github/workflows/ci.yml` runs on every push to `main` / `alphasignal-main` and on every PR: `npm ci` + `npm run lint` + `npm run test:unit` + `node --check scripts/smoke-test.js` (syntax-only — the live smoke test requires TV Desktop, unavailable on GitHub runners).

Smoke test is the local pre-merge equivalent.

## Upstream sync procedure

Upstream is abandoned, so most syncs are no-ops. When upstream does move:

```bash
git remote add upstream https://github.com/tradesdontlie/tradingview-mcp.git   # one-time
git fetch upstream
git log --oneline main..upstream/main                                          # what's new upstream
```

Decision tree per upstream commit:

- **Bug fix that overlaps our patches** (e.g. upstream merges PR #154): cherry-pick may produce conflicts. Verify with `npm run smoke` after; if cleaner than our patch, drop ours via `git revert` then cherry-pick upstream's.
- **Unrelated feature / fix**: cherry-pick directly. `git cherry-pick <SHA>`. Re-run lint + smoke.
- **Refactor that affects our patched files**: read carefully before merging — refactor may reintroduce the DI bugs we fixed.

Always re-run `npm run lint && npm run test:unit && npm run smoke` after a sync.

## Merging PRs (gh CLI gotcha)

`gh pr merge --repo X` without an explicit PR number prints help and **silently does nothing** — no error code, no failure message. Hit this in real workflow once (PR #9 was closed unmerged because the merge command no-op'd, then `git branch -d` and remote delete left the commit orphaned). Always pass the PR number explicitly:

```bash
gh pr merge <N> --repo JDuckling/tradingview-mcp --merge
```

The local `git branch -d <name>` only complains about merge state against `origin/<name>`, not against `main` — it deletes the branch if upstream tracks it, even if `main` doesn't have the commits. Safer flow: only delete the local branch after `gh pr view <N>` reports `state: MERGED`.

## Rollback

If a sync or a new patch breaks live use, revert in our `main` directly:

```bash
git checkout main
git revert <bad-SHA>          # creates a revert commit (preserves history)
git push origin main
```

Then restart MCP server (kill the `node /Users/evgeniiutkin/tradingview-mcp/src/server.js` PIDs — Claude Code auto-respawns).

## Restarting MCP server

The server doesn't hot-reload. After any merge to `main` or local edit during a live Claude Code session:

```bash
kill $(pgrep -f "tradingview-mcp/src/server.js")
```

Claude Code's MCP transport detects the broken pipe and respawns a new process from the current on-disk code within a second or two. Verify with `mcp__tradingview__tv_health_check`.

## Known-disabled features

- `src/fallback/` is stub-only. The PR #154 design supports pivoting to CCXT (crypto) / Yahoo (forex/metals/indices) when TV's WS feed freezes, but no real adapter is wired in this fork. Stubs throw "not wired" on invocation; `isFallbackActive()` always returns `false`. Wire here if/when needed.

## Performance trade-offs

### `quote_get(symbol=X)` and `data_get_ohlcv(symbol=X)` are slow on cross-symbol calls

The #140 fix (cherry-pick of PR #154) makes `data.getQuote({ symbol })` and `data.getOhlcv({ symbol })` correct: when `symbol !== chart.symbol()`, the wrapper calls `chart.setSymbol(X)`, waits for `mainSeries.isLoading()` to clear, reads the bars, then restores the original symbol.

> **Patched in 2.0.1:** in the 2.0.0 release, `data_get_ohlcv` did not actually expose a `symbol` parameter at the MCP layer even though `core.getOhlcv` accepted one — the MCP tool wrapper forwarded only `{ count, summary }`. From 2.0.1 onward both tools propagate `symbol` correctly.

Measured cost: **~13.5 s per call** in the smoke test (`quote_get(TVC:DXY)` with chart on `BATS:MSTR`). The chart also physically switches to the requested symbol for ~10 seconds — visible to anyone watching the TV window.

**Routing recommendation:**

- **Cross-asset baseline (4+ symbols at once):** use `watchlist_get` against a pre-populated watchlist (e.g. `AlphaSignal Macro` with DXY/VIX/US10Y/BTC.D). Single instant call, no chart switch, no flicker.
- **Same-symbol read:** `quote_get()` / `data_get_ohlcv()` without `symbol` is a no-op wrapper — instant, unchanged from pre-fix behaviour.
- **Ad-hoc single off-chart quote / bars:** `quote_get(symbol=X)` / `data_get_ohlcv(symbol=X)` works but accept the 10–15 s + UI flicker.
- **Pair-trade leg monitoring:** add both symbols to a watchlist + `watchlist_get` once per check.

## Backlog (deferred to future patches batches)

- ~~**`failure-log.js` rotation.**~~ **DONE in PR #14** (`a63e904`) — date-based + size-based (10 MB default, env override `TV_MCP_FAILURE_LOG_MAX_BYTES`).
- ~~**Smoke-test via MCP transport.**~~ **DONE in PR #16** (`ec557d4`) — `scripts/smoke-mcp.js` + `npm run smoke:mcp` (14/14).
- ~~**Smoke-test coverage expansion.**~~ **DONE in PR #15** — core-layer smoke now 20/20; stdio smoke 14/14.
- ~~**ESLint over `tests/`.**~~ **DONE in PR #13** (`fddd707`).
- ~~**CI matrix.**~~ **DONE in PR #13** — matrix `[20, 22]`.
- **PR review (solo-dev workflow).** This fork is single-maintainer R&D, so PRs are self-merged after self-review. If anyone else starts contributing, switch to required-review flow.
- **Remaining upstream bugs in our fork:** #142 (stuck state after failed `chart_manage_indicator add` blocks subsequent adds — needs UI-state cleanup / reset, no upstream PR yet) and #164 (`watchlist_add` button-not-found — selector/timing issue, no upstream PR yet). Both need novel debugging rather than cherry-pick; deferred to a future patches batch. #143 and #144 are now closed (cherry-picked from community forks — see Applied patches table).
- ~~**OperationResult `payload.success` legacy noise.**~~ **DONE in PR #15** — `wrapOk` now strips cosmetic `success: true` and translates `success: false` / stale-feed sentinel into proper `err()`. Verified via MCP-stdio smoke `FAIL_SUCCESS_NOISE` guard.

## Backlog (still open)

- ~~**Upstream bugs #142 / #164.**~~ **DONE in PR #19** — both fixed with selector / modal-cleanup rewrites, verified live. See Applied patches table.
- **PR review (solo-dev workflow).** This fork is single-maintainer R&D, so PRs are self-merged after self-review. If anyone else starts contributing, switch to required-review flow.
- **`pine_new` / `pine_open` / `pine_save` smoke-mcp coverage.** The Pine Editor open path is now patched, but smoke-mcp has no pine_new assertion yet — selector drift could recur unnoticed. Worth a side-effect-free pine_new test (delete the script via `pine_save` cleanup after).
- **`pine_open` / `pine_save` selector audit.** Likely same TV 3.1.0 drift class as `pine_new` (PR #20). Not yet verified.
- **Wider locale handling in selectors.** RU locale aria-label added for Pine; same approach could harden watchlist_add / indicator search dialogs (other locales: DE, ES, ZH, etc.).
