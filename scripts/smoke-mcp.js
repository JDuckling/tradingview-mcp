#!/usr/bin/env node
/**
 * MCP-stdio smoke test — closes the blind spot of scripts/smoke-test.js.
 *
 * The core-import smoke (scripts/smoke-test.js) calls src/core/* functions
 * directly, so it CANNOT catch:
 *   - Tool registration bugs in src/tools/* (e.g. v2.0.0 missed `symbol`
 *     param in data_get_ohlcv schema even though core accepted it).
 *   - OperationResult wrapping bugs in src/tools/_wrap.js (the Phase 6
 *     stale_feed / success: false / success: true rewrites).
 *   - MCP protocol-level issues (stdio framing, tool list registration).
 *
 * This script spawns `node src/server.js`, performs the MCP initialize
 * handshake over stdio JSON-RPC, then calls a curated set of read-only
 * tools and validates the response shape against the OperationResult
 * JSON Schema (via ajv).
 *
 * Usage: node scripts/smoke-mcp.js
 * Requires: TradingView Desktop running with --remote-debugging-port=9222
 *           (same as smoke-test.js).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCHEMA_PATH = join(ROOT, 'schemas', 'operation-result.json');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateOpResult = ajv.compile(schema);

const TOOL_CALLS = [
  // (name, args, expectations on payload)
  { name: 'tv_health_check', args: {},
    expect: p => p?.cdp_connected === true && typeof p?.chart_symbol === 'string',
    note: 'cdp_connected + chart_symbol present, no success field noise' },
  { name: 'chart_get_state', args: {},
    expect: p => typeof p?.symbol === 'string' && Array.isArray(p?.studies),
    note: 'symbol + studies present' },
  { name: 'data_get_ohlcv', args: { count: 5, summary: true },
    expect: p => p?.bar_count === 5 && Array.isArray(p?.last_5_bars),
    note: 'bar_count + last_5_bars present' },
  { name: 'data_get_ohlcv', args: { count: 3, summary: true, symbol: 'TVC:DXY' },
    expect: p => p?.bar_count === 3 && Number.isFinite(p?.close)
                 && p.close > 50 && p.close < 200,
    note: 'cross-symbol DXY: in 50-200 sanity range (verifies #140 MCP-layer)' },
  { name: 'quote_get', args: { symbol: 'TVC:DXY' },
    expect: p => p?.symbol === 'TVC:DXY' && Number.isFinite(p?.close)
                 && p.close > 50 && p.close < 200,
    note: 'symbol echo + price in DXY range (verifies #140)' },
  { name: 'chart_get_visible_range', args: {},
    expect: p => Number.isFinite(p?.visible_range?.from)
                 && Number.isFinite(p?.visible_range?.to),
    note: 'visible_range.from/to numeric (verifies #171)' },
  { name: 'symbol_info', args: {},
    expect: p => typeof p?.symbol === 'string' && typeof p?.full_name === 'string',
    note: 'symbol + full_name (verifies #171)' },
  { name: 'tv_discover', args: {},
    expect: p => typeof p === 'object',
    note: 'returns object (any shape)' },
  { name: 'tv_ui_state', args: {},
    expect: p => typeof p === 'object',
    note: 'returns object' },
  { name: 'watchlist_get', args: {},
    expect: p => typeof p === 'object',
    note: 'returns object (empty watchlist still valid)' },
  { name: 'tab_list', args: {},
    expect: p => typeof p?.tab_count === 'number' && Array.isArray(p?.tabs),
    note: 'tab_count + tabs array' },
  { name: 'pane_list', args: {},
    expect: p => typeof p?.chart_count === 'number' && Array.isArray(p?.panes),
    note: 'chart_count + panes array' },
  { name: 'draw_list', args: {},
    expect: p => typeof p?.count === 'number' && Array.isArray(p?.shapes),
    note: 'count + shapes array (verifies #116/#137)' },
  { name: 'data_get_indicator', args: { entity_id: 'forced_not_found_xyz_smoke_stdio' },
    expectErr: 'not_found',
    note: 'forced NOT_FOUND classifier (verifies err lane)' },
];

const TIMEOUT_MS = 30000;
const SERVER_BOOT_MS = 2000;

class McpStdioClient {
  constructor() {
    this.proc = spawn(process.execPath, [join(ROOT, 'src', 'server.js')], {
      cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'],
    });
    this.buffer = '';
    this.pending = new Map();  // id → {resolve, reject}
    this.nextId = 1;
    this.proc.stdout.on('data', (chunk) => this._onData(chunk));
    this.proc.on('exit', (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`server exited (code ${code})`));
      }
    });
  }

  _onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`MCP error: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      }
    }
  }

  _send(method, params, expectReply = true) {
    const id = expectReply ? this.nextId++ : undefined;
    const msg = { jsonrpc: '2.0', method, params };
    if (id != null) msg.id = id;
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
    if (!expectReply) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request ${method} (id=${id}) timed out`));
      }, TIMEOUT_MS).unref();
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  async initialize() {
    const result = await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-mcp', version: '1.0' },
    });
    await this._send('notifications/initialized', {}, false);
    return result;
  }

  callTool(name, args) {
    return this._send('tools/call', { name, arguments: args });
  }

  shutdown() {
    try { this.proc.kill('SIGTERM'); } catch { /* ignore */ }
  }
}

function parseOpResult(toolResult) {
  // tools/call result: { content: [{type:'text', text:'<json>'}], isError?: boolean }
  const text = toolResult?.content?.[0]?.text;
  if (typeof text !== 'string') {
    return { ok: false, parseError: 'no content[0].text' };
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, parseError: e.message };
  }
}

async function main() {
  console.log('Spawning MCP server over stdio...\n');
  const client = new McpStdioClient();

  // Give the server a moment to boot before sending initialize.
  await new Promise(r => setTimeout(r, SERVER_BOOT_MS));

  try {
    await client.initialize();
  } catch (e) {
    console.error('initialize failed:', e.message);
    client.shutdown();
    process.exit(2);
  }

  const results = [];
  for (const call of TOOL_CALLS) {
    const start = Date.now();
    let opResult, status;
    try {
      const toolResult = await client.callTool(call.name, call.args);
      opResult = parseOpResult(toolResult);
      if (opResult.parseError) {
        status = `FAIL_PARSE: ${opResult.parseError}`;
      } else if (!validateOpResult(opResult)) {
        status = `FAIL_SCHEMA: ${JSON.stringify(validateOpResult.errors).slice(0, 200)}`;
      } else if (call.expectErr) {
        if (opResult.ok === false && opResult.status_code === call.expectErr) {
          status = 'PASS';
        } else {
          status = `FAIL_EXPECT_ERR: expected status_code=${call.expectErr}, got ok=${opResult.ok} status_code=${opResult.status_code}`;
        }
      } else if (!opResult.ok) {
        status = `FAIL_NOT_OK: status_code=${opResult.status_code} detail=${opResult.detail?.slice(0, 100)}`;
      } else if (call.expect && !call.expect(opResult.payload)) {
        status = `FAIL_PAYLOAD: ${JSON.stringify(opResult.payload).slice(0, 200)}`;
      } else if (opResult.payload && typeof opResult.payload === 'object' && 'success' in opResult.payload) {
        status = `FAIL_SUCCESS_NOISE: payload still contains 'success' field (Phase 6 strip failed)`;
      } else {
        status = 'PASS';
      }
    } catch (e) {
      status = `FAIL_CALL: ${e.message}`;
    }
    const latency = Date.now() - start;
    const icon = status === 'PASS' ? '✓' : '✗';
    const label = `${call.name}${call.args && Object.keys(call.args).length ? ` ${JSON.stringify(call.args)}` : ''}`;
    console.log(`  ${icon} ${label.padEnd(56)} ${latency}ms${status === 'PASS' ? '' : '   ' + status}`);
    results.push({ name: call.name, status, latency });
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log(`\n${passed}/${total} passed${passed === total ? '' : ' — ' + (total - passed) + ' failure(s)'}\n`);

  client.shutdown();
  process.exit(passed === total ? 0 : 1);
}

main().catch(e => {
  console.error('smoke-mcp runner crashed:', e);
  process.exit(2);
});
