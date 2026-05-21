/**
 * `OperationResult` — unified response contract for every MCP tool in this
 * fork (v3.0.0+). All 78 tool handlers return this exact shape. The contract
 * is adapted from the webull-agent-skills execution-tier pattern (`OperationResult`
 * from their SKILL.md) — see [[reference_webull_agent_skills]] — so that when
 * Phase 2 IBKR adds execution tools, both data and execution layers share a
 * single response shape with a single handling path on the Claude side.
 *
 * Shape:
 *   {
 *     ok: boolean,           // true on success; false otherwise
 *     status_code: string,   // enum value from STATUS_CODES (see below)
 *     detail: string,        // human-readable summary. Non-empty when ok=false.
 *     payload: any,          // tool-specific data on success; null on failure
 *     action: string,        // tool name (e.g. "quote_get"). Always present.
 *     trade_outcome: object|null  // reserved for Phase 2 IBKR; always null here
 *   }
 *
 * Factory functions:
 *   ok(payload, action) → OperationResult     // status_code: "success", detail: ""
 *   err(status_code, detail, action, payload?) → OperationResult
 *
 * Production behaviour: factories validate the enum (`status_code` must be one
 * of STATUS_CODES) and the basic shape; bad inputs throw synchronously so the
 * tool handler crashes loudly instead of returning a malformed contract.
 *
 * Dev/test behaviour: `schemas/operation-result.json` ships a JSON Schema
 * consumed by smoke-test + unit tests via `ajv` (devDependency). Production
 * stays validation-free — see Decision 3 in `plans/2026-06-01-...md`.
 */

/**
 * Closed enum of status codes. Adding a value here is a contract change —
 * smoke-test fixtures and schema in `schemas/operation-result.json` must be
 * updated together.
 */
export const STATUS_CODES = Object.freeze({
  SUCCESS: 'success',
  VALIDATION_ERROR: 'validation_error',    // bad args from caller (zod or our own guard)
  CONNECTION_ERROR: 'connection_error',    // CDP disconnected, TV not running, ws closed
  TIMEOUT: 'timeout',                      // operation exceeded its time budget
  NOT_SUPPORTED: 'not_supported',          // tool can't satisfy this in current context
  INTERNAL_ERROR: 'internal_error',        // uncaught exception, programming bug
  STALE_DATA: 'stale_data',                // PR #154 stale_feed sentinel — feed frozen, not a timeout
  NOT_FOUND: 'not_found',                  // resource (study, entity_id, symbol) doesn't exist
  RATE_LIMITED: 'rate_limited',            // TV API throttle (reserved; no live source yet)
});

const VALID_CODES = new Set(Object.values(STATUS_CODES));

function _requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`OperationResult: '${field}' must be a non-empty string, got: ${value === '' ? "''" : typeof value}`);
  }
}

/**
 * Build a success OperationResult.
 * @param {*} payload — tool-specific data (any JSON-serialisable value, or null)
 * @param {string} action — MCP tool name (e.g. "quote_get")
 * @returns {OperationResult}
 */
export function ok(payload, action) {
  _requireNonEmptyString(action, 'action');
  return {
    ok: true,
    status_code: STATUS_CODES.SUCCESS,
    detail: '',
    payload: payload === undefined ? null : payload,
    action,
    trade_outcome: null,
  };
}

/**
 * Build a failure OperationResult.
 * @param {string} status_code — must be one of STATUS_CODES values (not 'success')
 * @param {string} detail — human-readable error message (non-empty)
 * @param {string} action — MCP tool name
 * @param {*} [payload] — optional partial data the caller can still use (e.g.
 *   stale-feed sentinel carries `requested_symbol` even when ok=false). Default: null.
 * @returns {OperationResult}
 */
export function err(status_code, detail, action, payload = null) {
  _requireNonEmptyString(status_code, 'status_code');
  _requireNonEmptyString(detail, 'detail');
  _requireNonEmptyString(action, 'action');
  if (!VALID_CODES.has(status_code)) {
    throw new RangeError(`OperationResult: unknown status_code '${status_code}'. Use STATUS_CODES.* constants.`);
  }
  if (status_code === STATUS_CODES.SUCCESS) {
    throw new RangeError(`OperationResult: err() called with status_code='success' — use ok() instead.`);
  }
  return {
    ok: false,
    status_code,
    detail,
    payload,
    action,
    trade_outcome: null,
  };
}

/**
 * Type predicate. Useful for callers that need to narrow before reading payload.
 * @param {*} value
 * @returns {boolean}
 */
export function isOperationResult(value) {
  return !!(
    value &&
    typeof value === 'object' &&
    typeof value.ok === 'boolean' &&
    typeof value.status_code === 'string' &&
    VALID_CODES.has(value.status_code) &&
    typeof value.detail === 'string' &&
    typeof value.action === 'string' &&
    value.action.length > 0 &&
    'payload' in value &&
    'trade_outcome' in value
  );
}
