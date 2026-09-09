import { prisma } from "../db";

// Slicers that register their own URL protocol for opening a remote model directly (e.g.
// bambustudio://) -- the only ones worth offering here, since the whole point of this preference
// is a future "open in {slicer}" launch via that protocol. Anything else falls under "other".
export const SLICER_IDS = ["bambustudio", "orcaslicer", "prusaslicer", "crealityprintlink", "other"] as const;
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
