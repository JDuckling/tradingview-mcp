/**
 * Unit tests for core.drawBatch (draw_batch tool, v3.2.0).
 *
 * drawBatch is a pure aggregator over injectable per-item executors
 * (`_deps.drawShape` / `_deps.createAlert`) — so these tests need no live CDP:
 * they inject fakes and assert continue-on-error + the summary tally + per-index
 * results. Live drawing is exercised by e2e.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core/drawing.js';

test('drawBatch: aggregates shapes + alerts, continues on per-item error', async () => {
  let drawn = 0;
  const _deps = {
    drawShape: async (a) => {
      drawn += 1;
      if (a.shape === 'bad') throw new Error('boom');
      return { success: true, shape: a.shape, entity_id: 'id' + drawn };
    },
    createAlert: async (a) => {
      if (a.price < 0) throw new Error('bad price');
      return { alert_id: 1000 + a.price, symbol: a.symbol, price: a.price };
    },
  };
  const r = await core.drawBatch({
    shapes: [
      { shape: 'horizontal_line', point: { time: 1, price: 2 } },
      { shape: 'bad', point: { time: 1, price: 2 } },
    ],
    alertSpecs: [
      { condition: 'greater_than', price: 10, symbol: 'BATS:X' },
      { condition: 'less_than', price: -1, symbol: 'BATS:Y' },
    ],
    _deps,
  });

  assert.equal(r.summary.shapes_total, 2);
  assert.equal(r.summary.shapes_drawn, 1);
  assert.equal(r.summary.shapes_failed, 1);
  assert.equal(r.summary.alerts_total, 2);
  assert.equal(r.summary.alerts_created, 1);
  assert.equal(r.summary.alerts_failed, 1);

  assert.equal(r.shapes[0].ok, true);
  assert.equal(r.shapes[0].entity_id, 'id1');
  assert.equal(r.shapes[1].ok, false);
  assert.match(r.shapes[1].error, /boom/);

  assert.equal(r.alerts[0].ok, true);
  assert.equal(r.alerts[0].alert_id, 1010);
  assert.equal(r.alerts[0].symbol, 'BATS:X');
  assert.equal(r.alerts[1].ok, false);
  assert.equal(r.alerts[1].symbol, 'BATS:Y');
});

test('drawBatch: empty plan → zero summary, empty arrays', async () => {
  const r = await core.drawBatch({});
  assert.equal(r.summary.shapes_total, 0);
  assert.equal(r.summary.alerts_total, 0);
  assert.deepEqual(r.shapes, []);
  assert.deepEqual(r.alerts, []);
});

test('drawBatch: all shapes fail → drawn 0, failed N', async () => {
  const _deps = {
    drawShape: async () => { throw new Error('cdp down'); },
    createAlert: async () => ({}),
  };
  const r = await core.drawBatch({
    shapes: [
      { shape: 'a', point: { time: 1, price: 1 } },
      { shape: 'b', point: { time: 1, price: 1 } },
    ],
    _deps,
  });
  assert.equal(r.summary.shapes_drawn, 0);
  assert.equal(r.summary.shapes_failed, 2);
  assert.equal(r.shapes.every(s => s.ok === false), true);
});

test('drawBatch: shape spec (incl. overrides object + point2) passed through verbatim', async () => {
  let seen;
  const _deps = { drawShape: async (a) => { seen = a; return { entity_id: 'z' }; } };
  await core.drawBatch({
    shapes: [{
      shape: 'rectangle',
      point: { time: 1, price: 1 },
      point2: { time: 2, price: 0 },
      overrides: { linecolor: '#fff', linewidth: 2 },
      text: 'зона',
    }],
    _deps,
  });
  assert.equal(seen.shape, 'rectangle');
  assert.equal(seen.overrides.linecolor, '#fff');
  assert.equal(seen.point2.price, 0);
  assert.equal(seen.text, 'зона');
});

test('drawBatch: alerts-only plan (no shapes) works', async () => {
  const _deps = {
    drawShape: async () => { throw new Error('should not be called'); },
    createAlert: async (a) => ({ alert_id: 7, symbol: a.symbol, price: a.price }),
  };
  const r = await core.drawBatch({
    alertSpecs: [{ condition: 'greater_than', price: 100, symbol: 'BATS:QQQ' }],
    _deps,
  });
  assert.equal(r.summary.shapes_total, 0);
  assert.equal(r.summary.alerts_created, 1);
  assert.equal(r.alerts[0].alert_id, 7);
});
