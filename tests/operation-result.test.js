import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import { ok, err, isOperationResult, STATUS_CODES } from '../src/lib/operation-result.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '..', 'schemas', 'operation-result.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const ALL_FIELDS = ['ok', 'status_code', 'detail', 'payload', 'action', 'trade_outcome'];

function assertValidShape(result, label) {
  assert.deepEqual(Object.keys(result).sort(), [...ALL_FIELDS].sort(), `${label}: keys mismatch`);
  assert.equal(isOperationResult(result), true, `${label}: isOperationResult predicate`);
  const valid = validate(result);
  assert.equal(valid, true, `${label}: ajv schema — ${JSON.stringify(validate.errors)}`);
}

test('ok() — success with object payload', () => {
  const r = ok({ symbol: 'TVC:DXY', last: 99.4 }, 'quote_get');
  assertValidShape(r, 'ok-object');
  assert.equal(r.ok, true);
  assert.equal(r.status_code, STATUS_CODES.SUCCESS);
  assert.equal(r.detail, '');
  assert.deepEqual(r.payload, { symbol: 'TVC:DXY', last: 99.4 });
  assert.equal(r.action, 'quote_get');
  assert.equal(r.trade_outcome, null);
});

test('ok() — success with array payload', () => {
  const r = ok([1, 2, 3], 'data_get_ohlcv');
  assertValidShape(r, 'ok-array');
  assert.deepEqual(r.payload, [1, 2, 3]);
});

test('ok() — success with null payload (undefined coerced to null)', () => {
  const r = ok(undefined, 'tv_health_check');
  assertValidShape(r, 'ok-undefined');
  assert.equal(r.payload, null);
});

test('ok() — success with explicit null payload', () => {
  const r = ok(null, 'pine_save');
  assertValidShape(r, 'ok-null');
  assert.equal(r.payload, null);
});

test('ok() — success with primitive payload (string)', () => {
  const r = ok('test-output', 'pine_get_console');
  assertValidShape(r, 'ok-string');
  assert.equal(r.payload, 'test-output');
});

test('ok() throws on missing action', () => {
  assert.throws(() => ok({ data: 1 }, ''), /action/);
  assert.throws(() => ok({ data: 1 }, undefined), /action/);
  assert.throws(() => ok({ data: 1 }, null), /action/);
});

test('err() — validation_error', () => {
  const r = err(STATUS_CODES.VALIDATION_ERROR, 'symbol is required', 'quote_get');
  assertValidShape(r, 'err-validation');
  assert.equal(r.ok, false);
  assert.equal(r.status_code, 'validation_error');
  assert.equal(r.detail, 'symbol is required');
  assert.equal(r.payload, null);
  assert.equal(r.action, 'quote_get');
});

test('err() — connection_error', () => {
  const r = err(STATUS_CODES.CONNECTION_ERROR, 'CDP not reachable on port 9222', 'tv_health_check');
  assertValidShape(r, 'err-conn');
  assert.equal(r.status_code, 'connection_error');
});

test('err() — stale_data carries partial payload', () => {
  const sentinel = {
    requested_symbol: 'TVC:DXY',
    current_chart_symbol: 'BATS:MSTR',
    fallback_advice: 'use CCXT for crypto',
  };
  const r = err(
    STATUS_CODES.STALE_DATA,
    'mainSeries.isLoading() timeout — TV WS feed frozen',
    'quote_get',
    sentinel,
  );
  assertValidShape(r, 'err-stale');
  assert.equal(r.status_code, 'stale_data');
  assert.deepEqual(r.payload, sentinel);
});

test('err() throws on unknown status_code', () => {
  assert.throws(
    () => err('unicorn_error', 'some detail', 'quote_get'),
    /unknown status_code/,
  );
});

test('err() rejects status_code="success"', () => {
  assert.throws(
    () => err(STATUS_CODES.SUCCESS, 'detail', 'quote_get'),
    /use ok\(\) instead/,
  );
});

test('err() throws on missing detail', () => {
  assert.throws(() => err(STATUS_CODES.INTERNAL_ERROR, '', 'quote_get'), /detail/);
});

test('err() throws on missing action', () => {
  assert.throws(() => err(STATUS_CODES.TIMEOUT, 'op timed out', ''), /action/);
});

test('STATUS_CODES — all 9 expected enum values present', () => {
  const expected = [
    'success', 'validation_error', 'connection_error', 'timeout',
    'not_supported', 'internal_error', 'stale_data', 'not_found', 'rate_limited',
  ];
  const got = Object.values(STATUS_CODES).sort();
  assert.deepEqual(got, expected.sort());
});

test('STATUS_CODES — frozen (cannot mutate)', () => {
  assert.throws(() => { STATUS_CODES.NEW_CODE = 'sneaky'; }, TypeError);
});

test('isOperationResult — true for valid', () => {
  assert.equal(isOperationResult(ok({}, 'x')), true);
  assert.equal(isOperationResult(err(STATUS_CODES.TIMEOUT, 'd', 'x')), true);
});

test('isOperationResult — false for malformed shapes', () => {
  assert.equal(isOperationResult(null), false);
  assert.equal(isOperationResult(undefined), false);
  assert.equal(isOperationResult({}), false);
  assert.equal(isOperationResult({ ok: true }), false);
  assert.equal(isOperationResult({ ok: true, status_code: 'success', detail: '', action: 'x' }), false); // missing payload / trade_outcome
  assert.equal(isOperationResult({ ok: true, status_code: 'WAT', detail: '', payload: null, action: 'x', trade_outcome: null }), false);
  assert.equal(isOperationResult({ ok: true, status_code: 'success', detail: '', payload: null, action: '', trade_outcome: null }), false);
});

test('ajv schema — rejects ok=true with non-success status_code', () => {
  const malformed = { ok: true, status_code: 'timeout', detail: '', payload: null, action: 'x', trade_outcome: null };
  assert.equal(validate(malformed), false);
});

test('ajv schema — rejects ok=false with empty detail', () => {
  const malformed = { ok: false, status_code: 'timeout', detail: '', payload: null, action: 'x', trade_outcome: null };
  assert.equal(validate(malformed), false);
});

test('ajv schema — rejects extra properties', () => {
  const r = ok({}, 'x');
  r.extra = 'not allowed';
  assert.equal(validate(r), false);
});
