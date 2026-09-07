import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not forward rejected promises from async handlers to the error middleware —
 * an unwrapped `async (req, res) => { throw new HttpError(...) }` would just hang the request.
 * Wrap every async route handler with this so thrown/rejected errors reach the HttpError
 * middleware in app.ts.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
