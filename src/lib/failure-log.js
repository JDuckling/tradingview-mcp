/**
 * JSON-lines failure log for MCP tool invocations.
 *
 * Inspired by webull-agent-skills audit-event pattern. Goal: when a tool
 * throws or returns an error response during a live Claude Code session,
 * capture enough context to debug the regression after the fact — without
 * polluting stdout (which the MCP stdio transport uses) and without
 * forcing per-tool instrumentation.
 *
 * Path: $TV_MCP_FAILURE_LOG (default: ~/.tradingview-mcp/failures.jsonl).
 * Format: one JSON object per line, append-only, no rotation (rotate manually
 * if file exceeds a few MB — daily rotation is a future enhancement).
 *
 * Sensitive-field masking: keys matching SENSITIVE_KEY_RE in `args` get
 * value replaced with "[REDACTED]" before write. Recursive over nested
 * objects/arrays.
 */
import { mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_LOG_PATH = join(homedir(), '.tradingview-mcp', 'failures.jsonl');
const LOG_PATH = process.env.TV_MCP_FAILURE_LOG || DEFAULT_LOG_PATH;

const SENSITIVE_KEY_RE = /token|secret|password|api[-_]?key|authorization|cookie/i;
const MAX_STACK_LINES = 10;
const MAX_ARGS_LEN = 2000;

let initFailed = false;

function ensureDir() {
  if (initFailed) return false;
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true, mode: 0o755 });
    return true;
  } catch (e) {
    initFailed = true;
    process.stderr.write(`failure-log: cannot create dir ${dirname(LOG_PATH)}: ${e.message}\n`);
    return false;
  }
}

function mask(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(mask);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : mask(v);
  }
  return out;
}

function truncate(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) + '…[truncated]' : s;
}

function trimStack(stack) {
  if (!stack) return undefined;
  return stack.split('\n').slice(0, MAX_STACK_LINES).join('\n');
}

/**
 * Serialise args defensively: catches circular references, getter throws,
 * and stack-overflow on deeply nested objects. Returns a fallback string
 * rather than throwing — the log itself must never crash the server.
 */
function safeSerialiseArgs(args) {
  if (args === undefined) return undefined;
  try {
    return truncate(JSON.stringify(mask(args)), MAX_ARGS_LEN);
  } catch (e) {
    return `[failure-log: args serialisation failed: ${String(e?.message || e).slice(0, 200)}]`;
  }
}

/**
 * Record a tool failure. Non-throwing: log itself never crashes the server.
 * @param {object} entry
 * @param {string} entry.tool — MCP tool name (e.g. "quote_get")
 * @param {object} [entry.args] — tool input args (will be masked)
 * @param {string} entry.error — error message
 * @param {string} [entry.stack] — error stack trace (will be trimmed)
 * @param {string} [entry.kind] — "throw" | "error_response" (default: "throw")
 */
export function logFailure({ tool, args, error, stack, kind = 'throw' }) {
  if (!ensureDir()) return;
  const entry = {
    ts: new Date().toISOString(),
    tool: tool || 'unknown',
    kind,
    error: truncate(String(error || ''), 500),
    args: safeSerialiseArgs(args),
    stack: trimStack(stack),
  };
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', { mode: 0o644 });
  } catch (e) {
    if (!initFailed) {
      initFailed = true;
      process.stderr.write(`failure-log: append failed (${LOG_PATH}): ${e.message}\n`);
    }
  }
}

/**
 * Wrap an McpServer instance so that every registered tool's handler
 * invocations are tracked: thrown errors AND `isError: true` responses
 * both append a structured line to the failure log.
 *
 * Returns the same server instance (mutated in place) for chaining.
 *
 * Usage in src/server.js:
 *   const server = wrapServer(new McpServer(...));
 *   registerHealthTools(server);  // unchanged; wrapping is transparent
 */
export function wrapServer(server) {
  const originalTool = server.tool.bind(server);
  server.tool = function (name, ...rest) {
    if (rest.length === 0 || typeof rest[rest.length - 1] !== 'function') {
      return originalTool(name, ...rest);
    }
    const handler = rest[rest.length - 1];
    const head = rest.slice(0, -1);
    const wrappedHandler = async (args) => {
      try {
        const result = await handler(args);
        if (result?.isError === true) {
          let inner;
          try {
            inner = JSON.parse(result?.content?.[0]?.text || '{}');
          } catch { inner = {}; }
          logFailure({
            tool: name,
            args,
            error: inner?.error || 'error_response (no error field)',
            kind: 'error_response',
          });
        }
        return result;
      } catch (err) {
        logFailure({ tool: name, args, error: err?.message, stack: err?.stack });
        throw err;
      }
    };
    return originalTool(name, ...head, wrappedHandler);
  };
  return server;
}
