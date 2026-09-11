import { prisma } from "../db";

// Slicers offered for a future "open in {slicer}" launch. Most register their own URL protocol
// (e.g. bambustudio://); a couple (bambustudio, prusaslicer, cura) instead route through the
// Thingport Bridge helper -- see frontend's utils/slicerLaunch.ts BRIDGED_SLICERS for why.
// Anything else falls under "other".
export const SLICER_IDS = ["bambustudio", "orcaslicer", "prusaslicer", "cura", "crealityprintlink", "other"] as const;
export type SlicerId = (typeof SLICER_IDS)[number];

function isSlicerId(value: string): value is SlicerId {
  return (SLICER_IDS as readonly string[]).includes(value);
}

export async function getUserSlicer(userId: string): Promise<SlicerId | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { slicer: true } });
  const value = user?.slicer;
  return value && isSlicerId(value) ? value : null;
}

export async function setUserSlicer(userId: string, slicer: string | null): Promise<SlicerId | null> {
  const next = slicer && isSlicerId(slicer) ? slicer : null;
  await prisma.user.update({ where: { id: userId }, data: { slicer: next } });
  return next;
}
