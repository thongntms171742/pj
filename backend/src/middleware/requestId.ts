import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Per-request id middleware. Assigns `req.id` either from the incoming
 * `X-Request-Id` header (so callers can correlate) or generates a new
 * UUID. The id is included in error logs via `handleInternalError`.
 */
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const incoming = req.headers["x-request-id"];
  if (typeof incoming === "string" && incoming.length > 0 && incoming.length <= 128) {
    req.id = incoming;
  } else {
    req.id = crypto.randomUUID();
  }
  // Echo back so clients can log the same id we logged.
  _res.setHeader("X-Request-Id", req.id);
  next();
}
