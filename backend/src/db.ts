import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { STORAGE, THUMBS, BUNDLES, PREVIEWS, MODEL_PREVIEWS } from "./config";

for (const dir of [STORAGE, THUMBS, BUNDLES, PREVIEWS, MODEL_PREVIEWS]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const prisma = new PrismaClient();
