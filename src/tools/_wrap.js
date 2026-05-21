/**
 * Tool-handler helpers that emit OperationResult responses (v3.0.0+).
 *
 * Most tool handlers are a trivial try { core() } catch (err) { ... } pair.
 * `wrapOk` collapses that to a one-liner; tools that need finer error
 * classification (e.g. distinguishing not_found from internal_error) can
 * compose `okResponse` / `errResponse` manually inside their own try/catch.
 */
import { ok, err, STATUS_CODES } from '../lib/operation-result.js';
import { jsonResult } from './_format.js';

/**
 * Default handler: invoke the core function, wrap its return value in an
 * `ok` OperationResult; on any throw, wrap as INTERNAL_ERROR.
 *
 * Use when the tool has no special error-classification needs.
 */
export function wrapOk(toolName, coreFn) {
  return async (args = {}) => {
    try {
      const payload = await coreFn(args);
      return jsonResult(ok(payload, toolName));
    } catch (e) {
      return jsonResult(
        err(STATUS_CODES.INTERNAL_ERROR, e?.message || String(e), toolName),
        true,
      );
    }
  };
}

/** Build a success MCP response. */
export function okResponse(toolName, payload) {
  return jsonResult(ok(payload, toolName));
}

/** Build a failure MCP response. */
export function errResponse(toolName, statusCode, detail, payload = null) {
  return jsonResult(err(statusCode, detail, toolName, payload), true);
}

/**
 * Heuristic mapper from thrown error.message to a status_code. Conservative —
 * only matches obvious patterns, defaults to INTERNAL_ERROR. Use when you'd
 * otherwise write a chain of `if (msg.includes(...))` in the catch block.
 */
export function classifyError(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('not found') || m.includes('no such')) return STATUS_CODES.NOT_FOUND;
  if (m.includes('timeout') || m.includes('timed out')) return STATUS_CODES.TIMEOUT;
  if (m.includes('cdp') || m.includes('connection') || m.includes('not running'))
    return STATUS_CODES.CONNECTION_ERROR;
  if (m.includes('invalid') || m.includes('must be') || m.includes('required'))
    return STATUS_CODES.VALIDATION_ERROR;
  if (m.includes('not supported') || m.includes("doesn't support"))
    return STATUS_CODES.NOT_SUPPORTED;
  return STATUS_CODES.INTERNAL_ERROR;
}

/** Re-exports for ergonomics. */
export { STATUS_CODES };
