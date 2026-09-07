import { Router } from "express";
import { z } from "zod";
import { AUTH_ENABLED, AUTH_PASSWORD, AUTH_TOKEN_TTL, AUTH_USERNAME } from "../config";
import { createToken, requireAuth, verifyToken } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";

const router = Router();

const loginSchema = z.object({ username: z.string(), password: z.string() });

router.post("/login", (req, res) => {
  if (!AUTH_ENABLED) throw new HttpError(503, "Authentication is not configured on the server");
  const body = parseBody(loginSchema, req.body);
  if (body.username !== AUTH_USERNAME || body.password !== AUTH_PASSWORD) {
    throw new HttpError(401, "Invalid username or password");
  }
  const token = createToken(body.username);
  res.json({ token, expires_in: AUTH_TOKEN_TTL });
});

router.post("/refresh", requireAuth, (req, res) => {
  if (!AUTH_ENABLED) throw new HttpError(503, "Authentication is not configured on the server");
  const header = req.header("authorization");
  const headerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const token = headerToken || queryToken;
  if (!token) throw new HttpError(401, "Unauthorized");
  const payload = verifyToken(token);
  if (!payload?.sub) throw new HttpError(401, "Invalid or expired token");
  const newToken = createToken(payload.sub);
  res.json({ token: newToken, expires_in: AUTH_TOKEN_TTL });
});

export default router;
