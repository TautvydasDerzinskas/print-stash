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
    let user = await prisma.user.findUnique({ where: { email } });
    // Same generic message whether the email doesn't exist or the password is wrong -- don't
    // let a login attempt be used to enumerate registered addresses.
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    // Mirrors /register's bootstrap exception: if this account registered as the initial-admin
    // address before INITIAL_ADMIN_EMAIL was actually visible to the process (a common ordering
    // issue -- e.g. a compose .env added after the container was first created), it would be
    // stuck as MEMBER forever since role is otherwise only ever set at creation. Promote it here
    // too, under the same "only while no admin exists yet" guard.
    if (user.role !== "ADMIN" && Boolean(INITIAL_ADMIN_EMAIL) && email === INITIAL_ADMIN_EMAIL) {
      const adminExists = (await prisma.user.count({ where: { role: "ADMIN" } })) > 0;
      if (!adminExists) {
        user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      }
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
