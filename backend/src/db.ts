import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { STORAGE, THUMBS, BUNDLES, PREVIEWS, MODEL_PREVIEWS } from "./config";

for (const dir of [STORAGE, THUMBS, BUNDLES, PREVIEWS, MODEL_PREVIEWS]) {
  fs.mkdirSync(dir, { recursive: true });
}

let client = new PrismaClient();

// Every other module does `import { prisma } from "../db"` once and calls methods on it
// directly, so services/databaseSettingsService.ts's live "Test & Save" database switch can't
// just reassign a plain export -- every existing import would keep pointing at the old client
// object. This Proxy forwards every property access to whichever client is current, so the
// swap is invisible to all ~25 files that already import `prisma` this way.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    return Reflect.get(client as object, prop, client);
  },
});

/** Swaps the client every `prisma.*` call resolves to from this point on. Only called by
 * databaseSettingsService.ts, and only after it has already verified the new connection works.
 * The outgoing client is disconnected in the background -- nothing references it anymore, so a
 * failure there doesn't matter. */
export function setActiveClient(next: PrismaClient): void {
  const old = client;
  client = next;
  void old.$disconnect().catch(() => undefined);
}
