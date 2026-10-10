import { Request, Response, RequestHandler } from "express";
import { handleInternalError } from "./errors";

/**
 * Async controller signature — receives req/res, returns a Promise.
 * Use this for every controller so async errors are routed to the global
 * error handler consistently.
 */
export type AsyncHandler = (
  req: Request,
  res: Response
) => Promise<unknown>;

/**
 * Wrap an async controller so any thrown / rejected error becomes a
 * JSON `INTERNAL_ERROR` response via `handleInternalError`. This replaces
 * the manual `try { ... } catch (err) { handleInternalError(...) }` block
 * that was repeated ~80 times across controllers.
 *
 * BEFORE (12 lines, every controller):
 *
 *   export const listTrees = async (req, res) => {
 *     try {
 *       if (!assertAdmin(req, res)) return;
 *       // ... body
 *     } catch (err) {
 *       handleInternalError(res, err, "[admin] listTrees error");
 *     }
 *   };
 *
 * AFTER (7 lines, no try/catch):
 *
 *   export const listTrees = ah(async (req, res) => {
 *     if (!assertAdmin(req, res)) return;
 *     // ... body
 *   });
 *
 * Note: controllers that already sent a response (e.g. via sendError) and
 * then throw are still safe — Express's res is single-use; we just log
 * the secondary error and don't double-send.
 */
export function ah(fn: AsyncHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (res.headersSent) {
        // Response already started — log but don't try to overwrite it.
        console.error(
          `[asyncRoute] error after response sent for ${req.method} ${req.path}:`,
          err
        );
        return;
      }
      handleInternalError(res, err, `[${req.method} ${req.path}] uncaught`);
    }
  };
}
