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
 * OperationResult.
 *
 * Three return-shape rules applied to the raw core response (since v3.0.1,
 * Phase 6 of the OperationResult migration):
 *
 *   1. PR-#154 stale-feed sentinel: `raw.stale_feed === true` → translate
 *      to `err(STATUS_CODES.STALE_DATA, raw.reason, toolName, restOfRaw)`.
 *      The sentinel was a v2-era half-OperationResult shape; in v3 it
 *      lives in the proper err() lane.
 *   2. Legacy graceful failure: `raw.success === false` → translate to
 *      `err(STATUS_CODES.INTERNAL_ERROR, raw.error, toolName, restOfRaw)`.
 *      Core functions that used `{success: false, error: '...'}` as a
 *      non-throwing failure path now surface as proper err responses
 *      instead of `ok({success: false, ...})` (which was semantically
 *      wrong in v3.0.0).
 *   3. Cosmetic success field: `raw.success === true` → strip the field
 *      before wrapping in ok(). All historic `{success: true, ...}` core
 *      return shapes are cleaned to `{...}` so consumers read straight
 *      from `r.payload.X` without the noise.
 *
 * Any uncaught throw → INTERNAL_ERROR. Use the manual `okResponse` /
 * `errResponse` builders for finer status_code classification.
 */
export function wrapOk(toolName, coreFn) {
  return async (args = {}) => {
    try {
      const raw = await coreFn(args);
      return _shapePayload(toolName, raw);
    } catch (e) {
      return jsonResult(
        err(STATUS_CODES.INTERNAL_ERROR, e?.message || String(e), toolName),
        true,
      );
    }
  };
}

function _shapePayload(toolName, raw) {
  if (raw && typeof raw === 'object') {
    if (raw.stale_feed === true) {
      const { stale_feed: _sf, success: _s, reason, ...rest } = raw;
      return jsonResult(
        err(STATUS_CODES.STALE_DATA, reason || 'stale_feed', toolName,
            { stale_feed: true, ...rest }),
        true,
      );
    }
    if (raw.success === false) {
      const detail = raw.error || 'legacy graceful failure (no error field)';
      const { success: _s, error: _e, ...rest } = raw;
      const payload = Object.keys(rest).length ? rest : null;
      return jsonResult(
        err(STATUS_CODES.INTERNAL_ERROR, detail, toolName, payload),
        true,
      );
    }
    if (raw.success === true) {
      const { success: _s, ...rest } = raw;
      return jsonResult(ok(rest, toolName));
    }
  }
  return jsonResult(ok(raw, toolName));
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
