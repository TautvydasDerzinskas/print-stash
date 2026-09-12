/** Sentinel `:authorId`/`author_id` value meaning "this viewer's own uploads" -- matched by the
 *  backend's identical SELF_AUTHOR_ID in routes/prints.ts. A real Author id is always
 *  "<provider>:<externalId>" (see authorService.ts), so this bare string can never collide with
 *  one. Used both as a route param (`/authors/self`, handled by AuthorPage's self mode) and as
 *  the `author_id` query param sent to printsApi.list for that mode's grid.
 */
export const SELF_AUTHOR_ID = "self";
