import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { STORAGE, THUMBS, BUNDLES } from "./config";

for (const dir of [STORAGE, THUMBS, BUNDLES]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const prisma = new PrismaClient();
