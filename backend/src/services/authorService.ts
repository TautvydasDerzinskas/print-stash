import { prisma } from "../db";
import type { ImportedAuthorInfo } from "./importResolvers";
import type { Author } from "@prisma/client";

export function buildAuthorId(provider: string, externalId: string): string {
  return `${provider}:${externalId}`;
}

/** Upserts an Author row from resolved import metadata and returns the full record (not just
 * its id) so callers can build an immediate API response without a second fetch. Always
 * refreshes the stored fields (bio/avatar/etc. can change between imports), so re-importing a
 * model from an already-known author keeps that author's record current rather than stale from
 * first import. Never throws -- a broken author fetch shouldn't fail the print import itself. */
export async function upsertAuthorFromImport(info: ImportedAuthorInfo | null): Promise<Author | null> {
  if (!info) return null;
  const id = buildAuthorId(info.provider, info.externalId);
  try {
    return await prisma.author.upsert({
      where: { id },
      create: {
        id,
        provider: info.provider,
        externalId: info.externalId,
        name: info.name,
        handle: info.handle,
        bio: info.bio,
        bioTranslated: info.bioTranslated,
        links: info.links,
        avatarUrl: info.avatarUrl,
        backgroundUrl: info.backgroundUrl,
      },
      update: {
        name: info.name,
        handle: info.handle,
        bio: info.bio,
        bioTranslated: info.bioTranslated,
        links: info.links,
        avatarUrl: info.avatarUrl,
        backgroundUrl: info.backgroundUrl,
      },
    });
  } catch {
    return null;
  }
}
