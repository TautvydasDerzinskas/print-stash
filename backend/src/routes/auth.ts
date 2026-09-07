import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AUTH_TOKEN_TTL, INITIAL_ADMIN_EMAIL } from "../config";
import { createToken, requireAuth } from "../auth";
import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { getAllowRegistrations } from "../services/settingsService";
import { toUserOut } from "../dto";
import type { Role } from "@prisma/client";

const router = Router();

const PASSWORD_HASH_COST = 12;

const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string(),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const email = body.email.toLowerCase();

    // The designated initial-admin address may always create the first admin account, even
    // if registrations are otherwise disabled -- an operator can never lock themselves out of
    // bootstrapping the instance. Once any admin exists, this exception no longer applies.
    const isInitialAdminEmail = Boolean(INITIAL_ADMIN_EMAIL) && email === INITIAL_ADMIN_EMAIL;
    const adminExists = (await prisma.user.count({ where: { role: "ADMIN" } })) > 0;
    const bootstrapping = isInitialAdminEmail && !adminExists;

    if (!bootstrapping && !(await getAllowRegistrations(true))) {
      throw new HttpError(403, "Registration is currently disabled");
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, PASSWORD_HASH_COST);
    const role: Role = isInitialAdminEmail ? "ADMIN" : "MEMBER";
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: body.displayName, role },
    });

    const token = createToken(user.id, user.role);
    res.json({ token, expires_in: AUTH_TOKEN_TTL, user: toUserOut(user) });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Same generic message whether the email doesn't exist or the password is wrong -- don't
    // let a login attempt be used to enumerate registered addresses.
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    const token = createToken(user.id, user.role);
    res.json({ token, expires_in: AUTH_TOKEN_TTL, user: toUserOut(user) });
  }),
);

router.post(
  "/refresh",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(401, "Invalid or expired token");
    const token = createToken(user.id, user.role);
    res.json({ token, expires_in: AUTH_TOKEN_TTL });
  }),
);

export default router;
