#!/usr/bin/env node
/**
 * Live integration test for the REST-based alert deletion path (core.deleteAlerts).
 *
 * Non-destructive by default. It creates its own throwaway alerts (message
 * prefixed TEST_DELETE_ME) on the active chart symbol, deletes them — first a
 * single scalar id, then the remainder as a bulk array (the exact REST call
 * delete_all uses) — and asserts only the throwaways were removed while every
 * pre-existing (non-tagged) alert survives untouched. Stray tagged alerts from
 * a prior run are cleaned up first, so the test is idempotent.
 *
 * Set TEST_DELETE_ALL=1 to additionally exercise deleteAlerts({delete_all:true}).
 * WARNING: that deletes EVERY alert on the account, not just this test's. Off
 * by default.
 *
 * Usage:   node scripts/test-alert-delete.js
 * Requires: TradingView Desktop open with --remote-debugging-port=9222 and a
 *           chart loaded (the throwaway alerts are created on its symbol).
 */
import { create, list, deleteAlerts } from '../src/core/alerts.js';
import { disconnect } from '../src/connection.js';

const TAG = 'TEST_DELETE_ME';
let failed = 0;

function check(label, cond, detail) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

const tagged = alerts => (alerts || []).filter(a => String(a.message || '').startsWith(TAG));

async function main() {
  console.log('Live alert-delete test against TradingView Desktop\n');

  // Snapshot. Non-tagged alerts are the user's real ones and must survive.
  const start = await list();
  if (start.error) throw new Error(`alert_list failed: ${start.error}`);
  const baselineIds = (start.alerts || []).filter(a => !String(a.message || '').startsWith(TAG)).map(a => a.alert_id);
  const strays = tagged(start.alerts).map(a => a.alert_id);
  console.log(`Baseline: ${baselineIds.length} pre-existing alert(s) to preserve; ${strays.length} stray test alert(s) to clean.\n`);

  // Idempotency: clear any leftover tagged alerts from a previous run (bulk).
  if (strays.length) await deleteAlerts({ alert_id: strays });

  // Create two throwaway alerts at clearly-non-market prices.
  const a1 = await create({ condition: 'crossing', price: 0.01, message: `${TAG} 1` });
  const a2 = await create({ condition: 'crossing', price: 0.02, message: `${TAG} 2` });
  check('create throwaway #1', a1.success === true && !!a1.alert_id, `id=${a1.alert_id}`);
  check('create throwaway #2', a2.success === true && !!a2.alert_id, `id=${a2.alert_id}`);

  const afterCreate = await list();
  check('both throwaways present in list', tagged(afterCreate.alerts).length === 2, `found ${tagged(afterCreate.alerts).length}`);

  // 1) Delete by SCALAR alert_id.
  const d1 = await deleteAlerts({ alert_id: a1.alert_id });
  check('delete by scalar alert_id -> success', d1.success === true, `deleted_count=${d1.deleted_count}, source=${d1.source}`);
  const afterScalar = await list();
  check('scalar delete removed exactly one throwaway', tagged(afterScalar.alerts).length === 1, `remaining ${tagged(afterScalar.alerts).length}`);

  // 2) Delete the remainder by BULK ARRAY (same REST call delete_all makes).
  const remaining = tagged(afterScalar.alerts).map(a => a.alert_id);
  const d2 = await deleteAlerts({ alert_id: remaining });
  check('delete by bulk array -> success', d2.success === true, `deleted_count=${d2.deleted_count}`);

  // Verify: no throwaways left, every baseline alert intact.
  const afterAll = await list();
  const afterIds = (afterAll.alerts || []).map(a => a.alert_id);
  check('no throwaway alerts remain', tagged(afterAll.alerts).length === 0, `leftover ${tagged(afterAll.alerts).length}`);
  check('pre-existing alerts untouched', baselineIds.every(id => afterIds.includes(id)), `${baselineIds.length} preserved`);

  // Bad-input guard: neither argument should throw, not silently succeed.
  let threw = false;
  try { await deleteAlerts({}); } catch { threw = true; }
  check('deleteAlerts({}) rejects (needs alert_id or delete_all)', threw);

  // Optional destructive path — off unless explicitly opted in.
  if (process.env.TEST_DELETE_ALL === '1') {
    console.log('\nTEST_DELETE_ALL=1 — running destructive delete_all (wipes ALL alerts)...');
    const dAll = await deleteAlerts({ delete_all: true });
    const emptied = await list();
    check('delete_all -> success', dAll.success === true, `deleted_count=${dAll.deleted_count}`);
    check('account has zero alerts after delete_all', (emptied.alerts || []).length === 0, `remaining ${(emptied.alerts || []).length}`);
  } else {
    console.log('\n(skipping destructive delete_all — set TEST_DELETE_ALL=1 to run it)');
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
}

main()
  .catch(e => { console.error('\ntest crashed:', e.message); failed++; })
  .finally(async () => { await disconnect(); process.exit(failed === 0 ? 0 : 1); });
