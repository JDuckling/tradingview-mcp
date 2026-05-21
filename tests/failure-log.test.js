/**
 * Tests for src/lib/failure-log.js — focusing on rotation and resilience.
 *
 * Uses a temp directory + env override (TV_MCP_FAILURE_LOG) so the test
 * never touches the real ~/.tradingview-mcp/failures.jsonl.
 *
 * Each test spawns a child node process with the env override and the
 * appropriate cap; we can't just import the module because LOG_PATH is
 * captured at module load time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function freshTmp() {
  return mkdtempSync(join(tmpdir(), 'tv-mcp-failure-log-test-'));
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * Run a logFailure call in a child process so module-load env capture is fresh.
 * Returns the contents of the tmp dir afterwards.
 */
function runChild(envOverrides, snippet) {
  const tmp = freshTmp();
  const env = {
    ...process.env,
    TV_MCP_FAILURE_LOG: join(tmp, 'failures.jsonl'),
    ...envOverrides,
  };
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e',
        `import('${process.cwd()}/src/lib/failure-log.js').then(m => { ${snippet} });`],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { tmp, files: readdirSync(tmp).sort() };
  } catch (e) {
    return { tmp, files: readdirSync(tmp).sort(), error: e.message };
  }
}

test('append: creates file on first call', () => {
  const { tmp, files } = runChild({}, `
    m.logFailure({ tool: 'first', error: 'hello' });
  `);
  try {
    assert.deepEqual(files, ['failures.jsonl']);
    const stat = statSync(join(tmp, 'failures.jsonl'));
    assert.ok(stat.size > 0);
  } finally {
    cleanup(tmp);
  }
});

test('size-based rotation: file > MAX → renamed with timestamp suffix', () => {
  const tmp = freshTmp();
  const logPath = join(tmp, 'failures.jsonl');
  // Pre-seed file at >100 bytes so MAX=100 triggers
  writeFileSync(logPath, '{"old":"entry"}\n'.repeat(20)); // ~300 bytes
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e',
        `import('${process.cwd()}/src/lib/failure-log.js').then(m => { m.logFailure({ tool: 'after_rotate', error: 'x' }); });`],
      {
        env: { ...process.env, TV_MCP_FAILURE_LOG: logPath, TV_MCP_FAILURE_LOG_MAX_BYTES: '100' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const after = readdirSync(tmp).sort();
    // Expect: rotated file (with .timestamp.jsonl) + new failures.jsonl
    assert.equal(after.length, 2, `expected 2 files, got ${after}`);
    assert.ok(after.includes('failures.jsonl'), 'fresh failures.jsonl should exist');
    const rotated = after.find(f => f !== 'failures.jsonl');
    assert.match(rotated, /^failures\.\d{4}-\d{2}-\d{2}\.\d{6}\.jsonl$/, `rotated filename pattern: ${rotated}`);
  } finally {
    cleanup(tmp);
  }
});

test('date-based rotation: mtime from previous day → renamed with date suffix', () => {
  const tmp = freshTmp();
  const logPath = join(tmp, 'failures.jsonl');
  writeFileSync(logPath, '{"old":"entry"}\n');
  // Backdate mtime to 2 days ago
  const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000);
  utimesSync(logPath, twoDaysAgo, twoDaysAgo);
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e',
        `import('${process.cwd()}/src/lib/failure-log.js').then(m => { m.logFailure({ tool: 'today', error: 'x' }); });`],
      {
        env: { ...process.env, TV_MCP_FAILURE_LOG: logPath },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const after = readdirSync(tmp).sort();
    assert.equal(after.length, 2);
    const rotated = after.find(f => f !== 'failures.jsonl');
    // Date suffix is YYYY-MM-DD from the file's mtime (= 2 days ago)
    const expectedDate = twoDaysAgo.toISOString().slice(0, 10);
    assert.equal(rotated, `failures.${expectedDate}.jsonl`);
  } finally {
    cleanup(tmp);
  }
});

test('rotation is silent on missing file (no spurious failure)', () => {
  const { tmp, files, error } = runChild({}, `
    m.logFailure({ tool: 'first', error: 'x' });
  `);
  try {
    assert.equal(error, undefined);
    assert.deepEqual(files, ['failures.jsonl']);
  } finally {
    cleanup(tmp);
  }
});

test('circular args still handled after rotation logic', () => {
  const { tmp, files } = runChild({}, `
    const circ = { a: 1 };
    circ.self = circ;
    m.logFailure({ tool: 'circ', args: circ, error: 'x' });
  `);
  try {
    assert.deepEqual(files, ['failures.jsonl']);
  } finally {
    cleanup(tmp);
  }
});
