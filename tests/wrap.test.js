/**
 * Unit tests for src/tools/_wrap.js shape-translation logic (Phase 6).
 *
 * These cover behaviours that smoke tests can't reproduce on demand:
 *   - stale_feed sentinel from PR #154 (requires frozen TV WebSocket
 *     to surface live; here we feed the shape directly).
 *   - legacy `{success: false, error: '...'}` graceful-failure shape.
 *   - cosmetic `success: true` strip.
 *   - non-object / null / primitive payloads (defensive).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _shapePayload, STATUS_CODES } from '../src/tools/_wrap.js';

/** Unwrap the JSON-stringified OperationResult from a jsonResult() response. */
function unwrap(mcpResponse) {
  const text = mcpResponse?.content?.[0]?.text;
  if (!text) throw new Error('no content[0].text');
  return JSON.parse(text);
}

test('stale_feed sentinel → STATUS_CODES.STALE_DATA + payload preserved', () => {
  const raw = {
    success: false,
    stale_feed: true,
    reason: 'mainSeries.isLoading() timeout after 5s — TV Chrome WS feed appears frozen',
    requested_symbol: 'BINANCE:BTCUSDT.P',
    current_chart_symbol: 'BATS:AAPL',
    fallback_advice: 'Use CCXT MCP for crypto',
  };
  const result = unwrap(_shapePayload('quote_get', raw));
  assert.equal(result.ok, false);
  assert.equal(result.status_code, STATUS_CODES.STALE_DATA);
  assert.equal(result.detail, raw.reason);
  assert.equal(result.action, 'quote_get');
  assert.equal(result.payload.stale_feed, true);
  assert.equal(result.payload.requested_symbol, 'BINANCE:BTCUSDT.P');
  assert.equal(result.payload.current_chart_symbol, 'BATS:AAPL');
  assert.equal(result.payload.fallback_advice, 'Use CCXT MCP for crypto');
  // Confirm `success` and `reason` removed from payload (now top-level).
  assert.equal('success' in result.payload, false);
  assert.equal('reason' in result.payload, false);
});

test('stale_feed sentinel with missing reason → fallback detail', () => {
  const raw = { stale_feed: true, requested_symbol: 'X' };
  const result = unwrap(_shapePayload('quote_get', raw));
  assert.equal(result.ok, false);
  assert.equal(result.status_code, STATUS_CODES.STALE_DATA);
  assert.equal(result.detail, 'stale_feed');
  assert.equal(result.payload.stale_feed, true);
  assert.equal(result.payload.requested_symbol, 'X');
});

test('graceful failure (success: false) → STATUS_CODES.INTERNAL_ERROR + payload', () => {
  const raw = {
    success: false,
    error: 'Layout "X" not found.',
    source: 'internal_api',
  };
  const result = unwrap(_shapePayload('layout_switch', raw));
  assert.equal(result.ok, false);
  assert.equal(result.status_code, STATUS_CODES.INTERNAL_ERROR);
  assert.equal(result.detail, 'Layout "X" not found.');
  assert.equal(result.action, 'layout_switch');
  assert.deepEqual(result.payload, { source: 'internal_api' });
});

test('graceful failure with no error field → fallback detail, null payload when rest empty', () => {
  const raw = { success: false };
  const result = unwrap(_shapePayload('any_tool', raw));
  assert.equal(result.ok, false);
  assert.equal(result.status_code, STATUS_CODES.INTERNAL_ERROR);
  assert.equal(result.detail, 'legacy graceful failure (no error field)');
  assert.equal(result.payload, null);
});

test('cosmetic success: true → strip the field, ok() wrap', () => {
  const raw = {
    success: true,
    cdp_connected: true,
    chart_symbol: 'BATS:MSTR',
    chart_resolution: '60',
  };
  const result = unwrap(_shapePayload('tv_health_check', raw));
  assert.equal(result.ok, true);
  assert.equal(result.status_code, STATUS_CODES.SUCCESS);
  assert.equal(result.detail, '');
  assert.equal(result.action, 'tv_health_check');
  assert.equal('success' in result.payload, false);
  assert.equal(result.payload.cdp_connected, true);
  assert.equal(result.payload.chart_symbol, 'BATS:MSTR');
});

test('payload without success key → ok() wrap unchanged', () => {
  const raw = { foo: 1, bar: 'two' };
  const result = unwrap(_shapePayload('whatever', raw));
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, raw);
});

test('null payload → ok() wrap, payload normalised to null', () => {
  const result = unwrap(_shapePayload('whatever', null));
  assert.equal(result.ok, true);
  assert.equal(result.payload, null);
});

test('array payload → ok() wrap, no shape rewrites', () => {
  const raw = [1, 2, 3];
  const result = unwrap(_shapePayload('whatever', raw));
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, [1, 2, 3]);
});

test('primitive payload (string) → ok() wrap', () => {
  const result = unwrap(_shapePayload('whatever', 'hello'));
  assert.equal(result.ok, true);
  assert.equal(result.payload, 'hello');
});

test('order: stale_feed wins over success: false', () => {
  // Real _staleFallbackResponse has both fields. stale_feed translation must
  // run before the generic graceful-failure handler so STALE_DATA wins.
  const raw = { success: false, stale_feed: true, reason: 'frozen' };
  const result = unwrap(_shapePayload('quote_get', raw));
  assert.equal(result.status_code, STATUS_CODES.STALE_DATA);
});

test('order: success: false wins over success: true (defensive — would never happen)', () => {
  // Pathological: success could only be one value. We test the first matching
  // branch wins so behaviour is predictable if input is malformed.
  // Here success === false matches the failure branch.
  const raw = { success: false };
  const result = unwrap(_shapePayload('any', raw));
  assert.equal(result.ok, false);
});
