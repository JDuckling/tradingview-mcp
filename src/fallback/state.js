/**
 * Fallback state stub.
 *
 * Cherry-picked PR #154 (issue #140 fix) wires every public read in
 * src/core/data.js through `isFallbackActive()` so the caller can pivot to
 * an external data source (CCXT for crypto, services.yahoo_fallback for
 * forex/metals/indices) when the TradingView WebSocket feed is unavailable.
 *
 * This AlphaSignal fork does not (yet) ship a non-TV fallback path. Returning
 * `false` keeps the existing TV-only read path active everywhere. A future
 * plan ([[reference_webull_agent_skills]] / Phase 2 IBKR) can wire a real
 * data source here without re-patching core/data.js.
 */
export function isFallbackActive() {
  return false;
}
