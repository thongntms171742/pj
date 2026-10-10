// ── Structured logger ────────────────────────────────────────────────────────
// Replaces ad-hoc `console.error(...)` / `console.warn(...)` calls with a
// single `log()` helper that emits JSON for easier parsing in production
// log aggregators (Loki, CloudWatch, etc.). Phase 6 will migrate all
// existing call sites; for now, new code should prefer this helper.

type Level = "info" | "warn" | "error";

export interface LogFields {
  reqId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function log(level: Level, ctx: string, fields?: LogFields): void {
  const ts = new Date().toISOString();
  const payload = { ts, level, ctx, ...fields };
  // Use the right console method so colors / driver routing still works.
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Convenience: error with a thrown err attached. */
export function logError(ctx: string, err: unknown, fields?: LogFields): void {
  log("error", ctx, {
    ...fields,
    err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });
}

/** Convenience: warning. */
export function logWarn(ctx: string, fields?: LogFields): void {
  log("warn", ctx, fields);
}

/** Convenience: info. */
export function logInfo(ctx: string, fields?: LogFields): void {
  log("info", ctx, fields);
}
