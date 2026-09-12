import type { Author } from "../api/prints";

/** The author's own profile page on the site they were imported from -- what the Author page's
 * provider chip links to. MakerWorld's Author.links holds arbitrary external links the creator
 * added to their bio (Instagram, a personal site, ...), not their MakerWorld profile, so that
 * one is built from their numeric external id instead: .../u/<id> always resolves, unlike the
 * newer @handle path, which needs a handle the creator may not have set. Thingiverse and
 * Printables both already store the real profile URL as links[0] at import time (Thingiverse:
 * the official API's own creator.public_url; Printables: built from their @handle -- see
 * backend's services/{thingiverseApi,printablesApi}.ts), so those are used directly instead of
 * re-deriving a URL scheme here. */
export function authorProfileUrl(author: Pick<Author, "provider" | "external_id" | "links">): string | null {
  if (author.provider === "makerworld") {
    return `https://makerworld.com/en/u/${author.external_id}`;
  }
  return author.links[0] ?? null;
}
