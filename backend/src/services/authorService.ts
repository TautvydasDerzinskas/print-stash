import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import type { ImportedAuthorInfo } from "./importResolvers";
import type { Author, User } from "@prisma/client";

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

/** Deletes an Author row once nothing references it any more. Author rows aren't user-scoped --
 * two different users importing the same MakerWorld/Thingiverse/Printables creator share one row
 * -- so this checks Print.authorId across every user, not just the caller's. Used after clearing
 * a print's authorId (the Edit modal's "reset author" action) to avoid leaving an orphaned Author
 * behind once the last print referencing it has been detached. */
export async function deleteAuthorIfOrphaned(authorId: string): Promise<void> {
  const remaining = await prisma.print.count({ where: { authorId } });
  if (remaining > 0) return;
  await prisma.author.delete({ where: { id: authorId } }).catch(() => undefined);
}

/** Whether ANY Thingport account has claimed this Author as themselves -- what the Author page
 * uses to decide whether to show "It's me!" at all, without revealing *who* claimed it (Author
 * rows are shared/global, so the claimant could be a different account on this instance). */
export async function isAuthorLinked(authorId: string): Promise<boolean> {
  const link = await prisma.authorLink.findUnique({ where: { authorId }, select: { id: true } });
  return Boolean(link);
}

/** The Author rows this user has claimed as themselves -- backs both the "My models" page's
 * provider chips and (via authorIdsForSelfPrints below) its models grid, and lets the Author page
 * work out locally whether to show "It's me!" (hidden once the viewer already has a different
 * author linked for that same provider -- see linkAuthorToUser's PROVIDER_ALREADY_LINKED check). */
export async function getLinkedAuthorsForUser(userId: string): Promise<Author[]> {
  const links = await prisma.authorLink.findMany({ where: { userId }, include: { author: true } });
  return links.map((l) => l.author);
}

/** Author ids linked to this user, for the "My models" grid query (routes/prints.ts's
 * SELF_AUTHOR_ID handling) -- a plain id list is all that query needs, unlike
 * getLinkedAuthorsForUser's full rows for the chips UI. */
export async function getLinkedAuthorIds(userId: string): Promise<string[]> {
  const links = await prisma.authorLink.findMany({ where: { userId }, select: { authorId: true } });
  return links.map((l) => l.authorId);
}

/** Claims an Author row as this user's own identity (the Author page's "It's me!" button, after
 * its confirmation modal). Enforces the two real-world rules AuthorLink's schema comment
 * describes -- this author isn't already claimed by anyone, and the user doesn't already have a
 * *different* author linked for this same provider -- then merges the author's bio/backgroundUrl
 * onto the user record, but only into fields still empty (a user who links a second provider
 * keeps whatever bio/cover their first link already set; see User's own doc comment). The
 * author's profile link is "copied over" implicitly and unconditionally by the link relation
 * itself -- unlike bio/cover, there's no "already defined" case for it to conditionally skip. */
export async function linkAuthorToUser(userId: string, authorId: string): Promise<{ author: Author; user: User }> {
  const author = await prisma.author.findUnique({ where: { id: authorId } });
  if (!author) throw new HttpError(404, "Author not found");

  const [existingLinkForAuthor, existingLinkForProvider] = await Promise.all([
    prisma.authorLink.findUnique({ where: { authorId } }),
    prisma.authorLink.findUnique({ where: { userId_provider: { userId, provider: author.provider } } }),
  ]);
  if (existingLinkForAuthor) {
    throw new HttpError(409, "This author is already linked to an account", "AUTHOR_ALREADY_LINKED");
  }
  if (existingLinkForProvider) {
    throw new HttpError(409, "You already have a linked author for this provider", "PROVIDER_ALREADY_LINKED");
  }

  await prisma.authorLink.create({ data: { userId, authorId, provider: author.provider } });

  const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const bio = author.bio || author.bioTranslated;
  const patch: { bio?: string; backgroundUrl?: string } = {};
  if (!currentUser.bio && bio) patch.bio = bio;
  if (!currentUser.backgroundUrl && author.backgroundUrl) patch.backgroundUrl = author.backgroundUrl;
  const user = Object.keys(patch).length ? await prisma.user.update({ where: { id: userId }, data: patch }) : currentUser;

  return { author, user };
}
