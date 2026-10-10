import { Response } from "express";

/**
 * Response helpers — every successful controller response should go
 * through one of these so the status code is set consistently and the
 * intent is obvious at the call site.
 *
 * BEFORE:
 *   res.json({ user });
 *   res.status(201).json({ user });
 *   res.status(204).send();
 *
 * AFTER:
 *   ok(res, { user });
 *   created(res, { user });
 *   noContent(res);
 */

/** 200 OK with a JSON body. */
export function ok<T>(res: Response, body: T): Response {
  return res.status(200).json(body);
}

/** 201 Created with a JSON body. */
export function created<T>(res: Response, body: T): Response {
  return res.status(201).json(body);
}

/** 204 No Content. Use for DELETE and other "nothing to return" cases. */
export function noContent(res: Response): Response {
  return res.status(204).send();
}
