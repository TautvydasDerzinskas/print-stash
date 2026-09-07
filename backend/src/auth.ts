import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AUTH_ALGO, AUTH_ENABLED, AUTH_SECRET, AUTH_TOKEN_TTL } from "./config";

export function createToken(username: string): string {
  return jwt.sign({ sub: username }, AUTH_SECRET, {
    algorithm: AUTH_ALGO,
    expiresIn: AUTH_TOKEN_TTL,
  });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, AUTH_SECRET, { algorithms: [AUTH_ALGO] }) as { sub: string };
  } catch {
    return null;
  }
}

/**
 * Accepts either an `Authorization: Bearer <token>` header or a `?token=` query
 * param (needed for <img>/direct file links that can't set headers). No-op when
 * auth is disabled entirely (mirrors MakersVault's require_auth dependency).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_ENABLED) {
    next();
    return;
  }
  const header = req.header("authorization");
  const headerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const token = headerToken || queryToken;
  if (!token || !verifyToken(token)) {
    res.status(401).json({ detail: "Unauthorized" });
    return;
  }
  next();
}
