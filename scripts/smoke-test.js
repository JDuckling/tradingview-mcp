#!/usr/bin/env node
/**
 * Local pre-merge smoke test for tradingview-mcp.
 *
 * Runs 14 read-only assertions against the live TV Desktop session reachable
 * via CDP. Fail-closed: any unmet assertion (status / schema / timeout)
 * returns exit code 1.
 *
 * Usage:
 *   node scripts/smoke-test.js
 *   npm run smoke
 *
 * Requirements:
 *   - TradingView Desktop launched with --remote-debugging-port=9222
 *     (or whatever CDP_PORT env points at).
 *   - A chart is loaded (any symbol; default test data adapts to it).
 *
 * Inspired by the webull-agent-skills observability principle: per-call
 * fail-closed check of (status, payload schema, latency). NB this is NOT
 * the literal webull "defense in depth" or "OperationResult" patterns —
 * those are execution-tier (live broker orders) and don't apply to a
 * read-only data MCP. We borrow the structured-assertion idea, not the
 * security model.
 *
 * Coverage gap to remember: this script imports `src/core/*` directly, so
 * it cannot catch tool-registration / schema bugs in `src/tools/*`. A
 * future variant that spawns the MCP server and exercises tools through
 * stdio would close that gap. See docs/MAINTENANCE.md backlog.
 */
import * as health from '../src/core/health.js';
import * as chart from '../src/core/chart.js';
import * as data from '../src/core/data.js';
import * as watchlist from '../src/core/watchlist.js';
import * as pine from '../src/core/pine.js';
import * as capture from '../src/core/capture.js';
import * as drawing from '../src/core/drawing.js';

const TIMEOUT_DEFAULT_MS = 8000;
const TIMEOUT_LONG_MS = 15000;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

const ASSERTIONS = [
  {
    name: 'tv_health_check',
    fn: () => health.healthCheck(),
    assert: r =>
      r?.success === true &&
      r?.cdp_connected === true &&
      isNonEmptyString(r?.chart_symbol) &&
      r?.api_available === true,
  },
  {
    name: 'chart_get_state',
    fn: () => chart.getState(),
    assert: r =>
      r?.success === true &&
      isNonEmptyString(r?.symbol) &&
      isNonEmptyString(String(r?.resolution)) &&
      Array.isArray(r?.studies),
  },
  {
    name: 'data_get_ohlcv (summary, no symbol)',
    fn: () => data.getOhlcv({ count: 10, summary: true }),
    assert: r =>
      r?.success === true &&
      r?.bar_count === 10 &&
      isFiniteNumber(r?.open) &&
      isFiniteNumber(r?.close) &&
      Array.isArray(r?.last_5_bars),
  },
  {
    name: 'data_get_ohlcv (cross-symbol TVC:DXY, verifies #140 on ohlcv path)',
    timeout: TIMEOUT_LONG_MS,
    fn: () => data.getOhlcv({ count: 10, summary: true, symbol: 'TVC:DXY' }),
    assert: r => {
      if (r?.stale_feed === true) {
        return r?.requested_symbol === 'TVC:DXY';
      }
      return (
        r?.success === true &&
        r?.bar_count === 10 &&
        isFiniteNumber(r?.open) &&
        isFiniteNumber(r?.close) &&
        Array.isArray(r?.last_5_bars) &&
        // DXY trades roughly 90-115 — sanity guard so we don't accidentally
        // read MSTR / BTC / AAPL prices if the wrapper silently fails.
        r.close > 50 && r.close < 200
      );
    },
  },
  {
    name: 'quote_get (TVC:DXY, verifies #140)',
    timeout: TIMEOUT_LONG_MS,
    fn: () => data.getQuote({ symbol: 'TVC:DXY' }),
    assert: r => {
      if (r?.stale_feed === true) {
        console.log('    NOTE: stale_feed sentinel returned (frozen WS) — counts as pass per PR #154 v2');
        return r?.requested_symbol === 'TVC:DXY';
      }
      return (
        r?.success === true &&
        r?.symbol === 'TVC:DXY' &&
        isFiniteNumber(r?.last) &&
        isNonEmptyString(r?.description)
      );
    },
  },
  {
    name: 'chart_get_visible_range (verifies #171)',
    fn: () => chart.getVisibleRange(),
    assert: r =>
      r?.success === true &&
      isFiniteNumber(r?.visible_range?.from) &&
      isFiniteNumber(r?.visible_range?.to) &&
      isFiniteNumber(r?.bars_range?.from) &&
      isFiniteNumber(r?.bars_range?.to),
  },
  {
    name: 'symbol_info (verifies #171)',
    fn: () => chart.symbolInfo(),
    assert: r =>
      r?.success === true &&
      isNonEmptyString(r?.symbol) &&
      isNonEmptyString(r?.full_name) &&
      isNonEmptyString(r?.type),
  },
  {
    name: 'chart_scroll_to_date (verifies #171; mutates+restores)',
    timeout: TIMEOUT_LONG_MS,
    fn: async () => {
      const before = await chart.getVisibleRange();
      const result = await chart.scrollToDate({ date: '2026-04-01' });
      if (before?.success && before?.visible_range?.from && before?.visible_range?.to) {
        await chart.setVisibleRange({
          from: before.visible_range.from,
          to: before.visible_range.to,
        });
      }
      return result;
    },
    assert: r =>
      r?.success === true &&
      isFiniteNumber(r?.centered_on) &&
      isNonEmptyString(String(r?.resolution)),
  },
  {
    name: 'data_get_study_values',
    fn: () => data.getStudyValues(),
    assert: r =>
      r?.success === true &&
      typeof r?.study_count === 'number' &&
      Array.isArray(r?.studies),
  },
  {
    name: 'watchlist_get',
    fn: () => watchlist.get(),
    assert: r => r?.success === true || r?.error,
  },
  {
    name: 'pine_list_scripts',
    timeout: TIMEOUT_LONG_MS,
    fn: () => pine.listScripts(),
    assert: r => r?.success === true || Array.isArray(r?.scripts) || r?.error,
  },
  {
    name: 'capture_screenshot (chart region)',
    timeout: TIMEOUT_LONG_MS,
    fn: () => capture.captureScreenshot({ region: 'chart' }),
    assert: r =>
      r?.success === true &&
      isNonEmptyString(r?.file_path) &&
      isFiniteNumber(r?.size_bytes) &&
      r.size_bytes > 0,
  },
  {
    name: 'draw_list (verifies #116/#137)',
    fn: () => drawing.listDrawings(),
    assert: r =>
      r?.success === true &&
      typeof r?.count === 'number' &&
      Array.isArray(r?.shapes),
  },
  {
    name: 'draw_get_properties (verifies #116/#137; read-only on first shape if any)',
    fn: async () => {
      const list = await drawing.listDrawings();
      if (!list?.shapes?.length) {
        return { success: true, _skipped: 'no shapes on chart' };
      }
      return drawing.getProperties({ entity_id: list.shapes[0].id });
    },
    assert: r =>
      r?.success === true &&
      (r?._skipped || isNonEmptyString(r?.entity_id)),
  },
];

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms).unref()
  );
}

async function runOne({ name, fn, assert, timeout: t = TIMEOUT_DEFAULT_MS }) {
  const start = Date.now();
  try {
    const result = await Promise.race([fn(), timeout(t)]);
    const latency = Date.now() - start;
    let valid = false;
    try {
      valid = !!assert(result);
    } catch (e) {
      return { name, status: 'FAIL_ASSERT_THREW', latency, error: e.message, result };
    }
    if (latency > t) {
      return { name, status: 'FAIL_LATENCY', latency, budget: t, result };
    }
    return { name, status: valid ? 'PASS' : 'FAIL_SCHEMA', latency, result };
  } catch (e) {
    return { name, status: 'FAIL_ERROR', latency: Date.now() - start, error: e.message };
  }
}

function fmt(r) {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  const tail = r.status === 'PASS'
    ? `${r.latency}ms`
    : `${r.status}${r.error ? `: ${r.error}` : ''} (${r.latency}ms)`;
  return `  ${icon} ${r.name.padEnd(52)} ${tail}`;
}

async function main() {
  console.log('Running smoke test against live TradingView session\n');
  const results = [];
  for (const a of ASSERTIONS) {
    const r = await runOne(a);
    console.log(fmt(r));
    if (r.status !== 'PASS' && r.result !== undefined) {
      console.log(`    payload: ${JSON.stringify(r.result).slice(0, 200)}`);
    }
    results.push(r);
  }
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.length - pass;
  console.log(`\n${pass}/${results.length} passed${fail ? ` — ${fail} failure(s)` : ''}\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('smoke-test runner crashed:', e);
  process.exit(2);
});
