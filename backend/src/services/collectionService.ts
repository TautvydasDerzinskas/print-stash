import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { printOutsByIds } from "./printLoader";
import { toSystemCollectionOut, type CollectionOut, type SystemCollectionKey } from "../dto";
import type { Collection, Prisma } from "@prisma/client";

export function normalizeCollectionName(name: string): string {
  return name.trim().toLowerCase();
}

/** Throws 409 if `name` matches one of the built-in pseudo-collections' names ("Favourites",
 * "Browsing History") -- those ids are reserved, so a same-named real Collection would just be a
 * confusing second card with the identical label. Checked before assertCollectionNameAvailable
 * so the reserved-name message wins over a plain "already exists" for these two names. */
function assertCollectionNameNotReserved(name: string): void {
  const normalized = normalizeCollectionName(name);
  const reserved = Object.values(SYSTEM_COLLECTIONS).find((c) => normalizeCollectionName(c.name) === normalized);
  if (reserved) throw new HttpError(409, `"${reserved.name}" is reserved for the built-in collection`);
}

/** Throws 409 if `name` is already taken by another of this user's collections (or is reserved
 * for a built-in pseudo-collection). Used by the manual create/rename routes so a raw Prisma
 * unique-constraint violation never reaches the client. */
export async function assertCollectionNameAvailable(
  userId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  assertCollectionNameNotReserved(name);
  const existing = await prisma.collection.findFirst({
    where: {
      userId,
      nameNormalized: normalizeCollectionName(name),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) throw new HttpError(409, `A collection named "${name.trim()}" already exists`);
}

/** Looks up a user's collection by name (case-insensitive), creating it if it doesn't exist yet.
 * Used by the MakerWorld collection import flow: re-importing the same MakerWorld collection
 * (identified by its title) lands in the same Collection row instead of creating a duplicate. */
export async function findOrCreateCollectionByName(userId: string, name: string): Promise<Collection> {
  const trimmed = name.trim();
  const nameNormalized = normalizeCollectionName(trimmed);
  const existing = await prisma.collection.findFirst({ where: { userId, nameNormalized } });
  if (existing) return existing;
  return prisma.collection.create({ data: { userId, name: trimmed, nameNormalized } });
}

/** Adds `printIds` to a collection, skipping any already present, continuing the display
 * position from wherever the collection's items currently leave off. */
export async function addPrintsToCollection(collectionId: string, printIds: string[]): Promise<void> {
  if (!printIds.length) return;
  const last = await prisma.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { position: "desc" },
  });
  let nextPosition = (last?.position ?? -1) + 1;
  await prisma.collectionItem.createMany({
    data: printIds.map((printId) => ({ collectionId, printId, position: nextPosition++ })),
    skipDuplicates: true,
  });
}

// ---- Built-in "Favourites" / "Browsing History" pseudo-collections ----------------------------
//
// These aren't real Collection rows -- they're synthesized on the fly from Print.favoritedAt /
// Print.lastViewedAt (a print is "in" one iff that column is non-null, ordered most-recent-first)
// so there's nothing to keep in sync, and no join-table membership to manage. Their ids ("favorites"
// / "history") are reserved and can never collide with a real Collection's cuid.

const SYSTEM_COLLECTION_COVER_LIMIT = 4;

type SystemCollectionMeta = { id: string; name: string; field: "favoritedAt" | "lastViewedAt" };

export const SYSTEM_COLLECTIONS: Record<SystemCollectionKey, SystemCollectionMeta> = {
  favorites: { id: "favorites", name: "Favourites", field: "favoritedAt" },
  history: { id: "history", name: "Browsing History", field: "lastViewedAt" },
};

const SYSTEM_COLLECTION_IDS = new Map<string, SystemCollectionKey>(
  (Object.keys(SYSTEM_COLLECTIONS) as SystemCollectionKey[]).map((key) => [SYSTEM_COLLECTIONS[key].id, key]),
);

export function systemCollectionKeyForId(id: string): SystemCollectionKey | null {
  return SYSTEM_COLLECTION_IDS.get(id) ?? null;
}

export function isSystemCollectionId(id: string): boolean {
  return SYSTEM_COLLECTION_IDS.has(id);
}

function systemCollectionWhere(userId: string, field: "favoritedAt" | "lastViewedAt"): Prisma.PrintWhereInput {
  return field === "favoritedAt" ? { userId, favoritedAt: { not: null } } : { userId, lastViewedAt: { not: null } };
}

function systemCollectionOrderBy(field: "favoritedAt" | "lastViewedAt"): Prisma.PrintOrderByWithRelationInput {
  return field === "favoritedAt" ? { favoritedAt: "desc" } : { lastViewedAt: "desc" };
}

export async function loadSystemCollectionOut(userId: string, key: SystemCollectionKey): Promise<CollectionOut> {
  const meta = SYSTEM_COLLECTIONS[key];
  const where = systemCollectionWhere(userId, meta.field);
  const [itemCount, coverRows] = await Promise.all([
    prisma.print.count({ where }),
    prisma.print.findMany({
      where,
      orderBy: systemCollectionOrderBy(meta.field),
      take: SYSTEM_COLLECTION_COVER_LIMIT,
      select: { id: true },
    }),
  ]);
  const coverIds = coverRows.map((r) => r.id);
  const printOuts = await printOutsByIds(userId, coverIds);
  const coverPrints = coverIds.map((id) => printOuts.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  return toSystemCollectionOut(meta.id, key, meta.name, itemCount, coverPrints);
}

export async function listSystemCollectionOuts(userId: string): Promise<CollectionOut[]> {
  return Promise.all(
    (Object.keys(SYSTEM_COLLECTIONS) as SystemCollectionKey[]).map((key) => loadSystemCollectionOut(userId, key)),
  );
}
