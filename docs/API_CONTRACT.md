# PrintStash API contract

Node.js + Express + Prisma (Postgres) backend, ported from MakersVault's FastAPI/SQLModel/SQLite
backend, with one structural change: a **Print** is a set of one or more **Plates** (multi-part
prints) instead of a single file. Everything else behaves the same as MakersVault.

Base path: no prefix, ever — routes are mounted directly (`/health`, `/prints`, `/login`, ...).
In production the backend also serves the built frontend as static files from the same origin
(see `backend/src/app.ts`'s `express.static(FRONTEND_DIST)`), so the UI calls these routes with
plain relative paths and no reverse proxy is involved.

Auth: identical scheme to MakersVault — single-user JWT (HS256). `AUTH_USERNAME`/`AUTH_PASSWORD`/
`AUTH_SECRET`/`AUTH_TOKEN_TTL` env vars. `AUTH_ENABLED = Boolean(username && password)`. Every
route (except `/health`) runs a `requireAuth` middleware that accepts either an `Authorization:
Bearer <token>` header or a `?token=` query param, and is a no-op when auth is disabled.

## Types

```ts
type PreparedPrint = {
  printer?: string | null;
  material?: string | null;
  nozzle_mm?: number | null;
  layer_height_mm?: number | null;
  estimated_seconds?: number | null;
  format?: string | null; // "gcode" | "bgcode" | "gcode_3mf"
  removable: boolean;
};

type Plate = {
  id: string;
  print_id: string;
  position: number;      // dense, 0-based, ordered
  filename: string;
  mime: string;
  size: number;
  url: string;            // /print/{printId}/plate/{plateId}/file/{filename}
  thumb_url?: string | null; // /plate/{plateId}/thumb.jpg?v=... if a thumb exists
};

type PrintFile = { // supporting doc or prepared-print attachment (print-level, not per-plate)
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string; // /print/{printId}/files/{fileId}
};

type Print = {
  id: string;
  name: string;
  title?: string | null;
  notes?: string | null;
  creator?: string | null;
  collection?: string | null;
  tags: string[];
  folder_id?: string | null;
  storage_path?: string | null; // parent directory shared by all plates
  plates: Plate[];              // ordered by position, length >= 1
  thumb_url?: string | null;    // denormalized = plates[0].thumb_url, for card grids
  supporting_file_count: number;
  prepared_print?: PreparedPrint | null;
  slicer_url?: string | null;     // prepared file if present, else plates[0].url
  slicer_filename?: string | null;
};

type Folder = { id: string; name: string; tags: string[]; parent_id?: string | null };
```

## Routes

Mechanical renames from MakersVault (identical request/response shape, `asset` → `print`):

- `GET /health` -> `{ ok, auth_required }`
- `GET/POST /settings/mount-import`
- `GET/POST /settings/storage` (sample path now returns a `plate_paths: string[]` array of 2
  example rendered paths instead of a single `sample_path` string, to show that sibling plates
  share the `{model}` directory)
- `POST /login`, `POST /refresh`
- `GET/POST /print/:id/files`, `GET/DELETE /print/:id/files/:fileId` (supporting files, unchanged
  semantics)
- `GET/DELETE /print/:id/prepared-print`
- `POST /print/:id/tags`, `POST /print/:id/meta`, `DELETE /print/:id`, `POST /print/:id/folder`
- `GET/POST /folders`, `PATCH /folder/:id`, `DELETE /folder/:id`, `GET /folder/:id/download`
- `POST /import`, `POST /import/inspect`, `POST /import/zip/entries`, `POST /import/zip` — URL and
  zip-extraction imports always create a single-plate print per item (the separate/multiplate
  choice below only applies to the direct upload picker/drag-drop).

Shape changes / new routes (plate-aware):

- `POST /upload` — multipart, **multiple `files` fields accepted**. Additional field
  `mode: "separate" | "multiplate"` (required only when more than one file is sent; ignored for a
  single file). Always responds `{ prints: Print[] }`.
  - `mode=separate` (or single file): each file becomes its own single-plate `Print`.
  - `mode=multiplate`: all files become `Plate`s (in submitted order) of one new `Print`.
- `POST /print/:id/plates` — multipart, add one or more plates to an existing print (used by
  "drop a file onto an existing print card" and the print detail view's "Add plate" action).
  Appends at `position = max(position)+1`. Responds `{ print: Print }`.
- `DELETE /print/:id/plates/:plateId` — remove a plate; 409 if it is the only remaining plate
  (delete the whole print instead). Renumbers remaining plates densely. Responds `{ print: Print }`.
- `POST /print/:id/plates/reorder` — body `{ plate_ids: string[] }` (full ordered list), rewrites
  `position` transactionally. Responds `{ print: Print }`.
- `POST /print/:id/plate/:plateId/rename` — body `{ filename: string }`. Responds `{ print: Print }`.
- `GET /print/:id/plate/:plateId/file/:filename` — streams the plate's file (replaces
  `GET /file/{asset_id}/{name}`).
- `GET /print/:id/thumb.jpg` — the print card thumbnail (= plate[0]'s thumbnail).
- `GET /plate/:plateId/thumb.jpg` — a specific plate's thumbnail (for the plate switcher UI).
- `POST /plate/:plateId/thumbnail-generated` — client-rendered PNG/JPEG/WebP snapshot for one
  plate (replaces `POST /asset/{id}/thumbnail-generated`), same 8MB cap.
- `GET /prints` (was `GET /assets`) — same filters (`q`, `tags`, `folder_id`) and pagination
  (`limit`, `offset`, `X-Has-More`/`X-Next-Offset` headers); sort key becomes
  `name, plates[0].filename, id`.
- `GET /tags` (was `GET /tags`) — same filters, implemented via `unnest(tags)` over the filtered
  `Print` set.
- `POST /download/zip` — body `{ print_ids?: string[], tag?: string, folder_id?: string, filename?: string }`
  (was `{ asset_ids, tag, folder_id, filename }`).
- `POST /import/zip` response — `{ prints: Print[], failed: string[] }` (was `{ assets, failed }`).
- `POST /download/zip`, `GET /folder/:id/download` — zip arcname becomes
  `{folder_or_unassigned}/{print.name}/{plate.filename}` for every plate, and
  `{folder_or_unassigned}/{print.name}/supporting/{file.filename}` for supporting files. The extra
  `{print.name}` directory level (new vs. MakersVault) is required so sibling plates from
  different prints, or same-named plates across prints, can't collide in the zip.

Retired: `POST /asset/{id}/rename` (renaming "the file" doesn't map onto a print with no single
filename) — replaced by `POST /print/:id/plate/:plateId/rename` for plate filenames, while
`Print.name` (the folder-unique display name) renames via the existing `POST /print/:id/meta`.

## Storage path templating

Same template contract as MakersVault (`validate_storage_template`, default
`{folder}/{model}/{filename}`, tokens `folder,collection,tags,creator,model,name,filename,id`,
`{filename}` required exactly once in the final path segment). Rendered **once per Plate**:

- `{model}` / `{name}` = `Print.name` (shared by every plate of a print — this is what makes all
  plates land in the same `{folder}/{model}/` directory under the default template).
- `{filename}` = the individual `Plate.filename`.
- `{folder}`, `{collection}`, `{tags}`, `{creator}` = pulled from the parent `Print`.
- `{id}` = the owning `Print.id` (not a plate id).
- New optional token `{plate}` = 1-based `Plate.position + 1`, for templates that want an explicit
  per-plate disambiguator. Not needed by the default template.

Filename collisions between two plates of the *same* print (e.g. two uploads both named
`body.stl`) are resolved by an `availablePlateFilename(printId, dirTokens, desiredFilename)`
helper that auto-suffixes (`body.stl` -> `body-2.stl`), mirroring the existing per-folder
`unique_model_name`/`available_model_name` dedup pattern. `PrintFile`s (supporting/prepared) are
never template-rendered; they always live at `STORAGE/bundles/{printId}/{fileId}/{filename}`.

## Behavioral notes carried over unchanged

- Folder-scoped `Print.name` uniqueness (case-insensitive), including at the root — enforced via
  `nameNormalized` + the composite unique index plus a partial unique index for `folderId IS
  NULL` (see `schema.prisma` migration comment).
- Prepared-print detection/metadata sniffing (`prepared_print.py` logic) stays **print-level**: a
  sliced job output covers the whole build plate across all plates, so it is not tied to a single
  `Plate`.
- Mount-import volume scanning, zip-import wizard, MakerWorld/Printables/Thingiverse link import,
  and settings (mount-import, storage template) all behave the same; each imported/extracted item
  is a single-plate `Print` (no multiplate prompt in these flows).
- SSRF guard on outbound import URLs, filename sanitization, size limits — unchanged.
