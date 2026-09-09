import { prisma } from "../db";

/** Per-user MakerWorld session cookie -- unlike the Thingiverse Access Token (instance-wide,
 * admin-configured, see settingsService.ts), a MakerWorld import runs as *that user's own*
 * MakerWorld login, so each user brings their own cookie. Stored directly on User rather than
 * the generic Setting table since it's scoped to one user, not the whole instance. Read by
 * routes/imports.ts as a fallback whenever a request doesn't carry its own makerworld_cookie
 * (see withStoredMakerworldCookie there), and by adminService.ts to show connection status in
 * the admin Users table. */
export async function getUserMakerworldCookie(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { makerworldCookie: true } });
  return user?.makerworldCookie ?? null;
}

export async function setUserMakerworldCookie(userId: string, cookie: string | null): Promise<boolean> {
  const trimmed = (cookie ?? "").trim();
  await prisma.user.update({ where: { id: userId }, data: { makerworldCookie: trimmed || null } });
  return Boolean(trimmed);
}
