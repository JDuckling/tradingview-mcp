/**
 * Fallback adapter stub.
 *
 * Companion to ./state.js. These functions are only called when
 * `isFallbackActive()` returns true, which never happens in the current fork
 * (see ./state.js for context). They throw if invoked anyway, surfacing a
 * clear error instead of silently returning undefined.
 */
function _notWired(fn) {
  throw new Error(
    `fallback.${fn}() invoked but no fallback data source is wired in this fork. ` +
    `Update src/fallback/state.js if you intentionally enabled fallback.`
  );
}

export function getOhlcv() { _notWired('getOhlcv'); }
export function getIndicator() { _notWired('getIndicator'); }
export function getStrategyResults() { _notWired('getStrategyResults'); }
export function getTrades() { _notWired('getTrades'); }
export function getEquity() { _notWired('getEquity'); }
export function getQuote() { _notWired('getQuote'); }
export function getDepth() { _notWired('getDepth'); }
export function getStudyValues() { _notWired('getStudyValues'); }
export function getPineLines() { _notWired('getPineLines'); }
export function getPineLabels() { _notWired('getPineLabels'); }
export function getPineTables() { _notWired('getPineTables'); }
export function getPineBoxes() { _notWired('getPineBoxes'); }
