# Maintenance — JDuckling/tradingview-mcp

This fork is the AlphaSignal data-MCP. Upstream is `tradesdontlie/tradingview-mcp` — its maintainer has been inactive since 2026-04-04, so we maintain this fork directly and carry our own patches.

## Applied patches

| Closes | Branch | SHA | Notes |
|---|---|---|---|
| #140 (`quote_get` ignores symbol) | alphasignal-main | `ee3f0fc` | Cherry-pick of ORDO618 PR #154. Adds `_withSymbol(symbol, fn)` wrapper + v2 stale-feed sentinel. |
| #140 dependency | alphasignal-main | `fc7319b` | Stubs in `src/fallback/` so PR #154's `isFallbackActive` import doesn't break. |
| #171 (`evaluate is not defined`) | alphasignal-main | `06668f6` | DI miss in `src/core/chart.js` — 3 functions (`getVisibleRange`, `scrollToDate`, `symbolInfo`) didn't take `_deps` / call `_resolve`. |
| #116 + #137 (drawing API broken) | alphasignal-main | `d835799` | Same DI miss in `src/core/drawing.js` — 4 functions (`listDrawings`, `getProperties`, `removeOne`, `clearAll`). Caught by ESLint baseline. |

## Local quality gates

`npm run lint` — ESLint flat config (`eslint.config.js`). `no-undef: error` is the rule that caught #116/#137 and is the regression class CI blocks. Exits 0.

`npm run test:unit` — node:test runner over `pine_analyze.test.js` + `cli.test.js`. 29 tests, no TV required.

`npm run smoke` — `scripts/smoke-test.js`. 11 structured assertions (status / schema / latency) against the live TV Desktop session. Includes explicit regression guards for #140 and all three #171-fixed functions. Requires TV running with `--remote-debugging-port=9222`. Use this before merging to `main`.

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
