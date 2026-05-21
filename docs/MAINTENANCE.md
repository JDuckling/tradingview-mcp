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

## Local quality gates

`npm run lint` — ESLint flat config (`eslint.config.js`). `no-undef: error` is the rule that caught #116/#137 and is the regression class CI blocks. Exits 0.

`npm run test:unit` — node:test runner over `pine_analyze.test.js` + `cli.test.js`. 29 tests, no TV required.

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

- **`failure-log.js` rotation.** Manual today (see "Failure log" above). Worth implementing daily rotation + 10 MB cap when the log starts growing.
- **Smoke-test via MCP transport, not via direct core import.** `scripts/smoke-test.js` currently imports `src/core/*` directly, so it cannot catch MCP-layer bugs like the `data_get_ohlcv` schema omission that slipped through 2.0.0 → 2.0.1. A second smoke variant that spawns the MCP server and exercises tools through stdio would close this gap.
- **Smoke-test coverage expansion.** Currently 14 tools out of 78. Worth adding: `alert_*`, `pine_compile`, `pine_check`, `indicator_*` (add/remove round-trip), `tab_*`, `pane_*`, `batch_run`.
- **ESLint over `tests/`.** Currently excluded — test files may carry the same DI shape bugs we fixed in `src/core/`. Tighten when convenient.
- **CI matrix.** Node 20 only today. Bump to `[20, 22]` matrix when Node 22 becomes mainstream-default.
- **PR review (solo-dev workflow).** This fork is single-maintainer R&D, so PRs are self-merged after self-review. If anyone else starts contributing, switch to required-review flow.
- **Remaining upstream bugs in our fork:** #142 (stuck state after failed indicator add), #143 (`data_get_study_values` dedup by name — there's a community fix in upstream commit `08d44f5b` if needed), #144 (`capture_screenshot` stale frame), #164 (`watchlist_add` button-not-found). Backlog for next patches batch.
