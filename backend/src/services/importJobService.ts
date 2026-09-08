import { prisma } from "../db";
import type { ImportJob, ImportJobType, Prisma } from "@prisma/client";

export async function getActiveJob(userId: string): Promise<ImportJob | null> {
  return prisma.importJob.findFirst({ where: { userId, status: "RUNNING" } });
}

export async function getJob(id: string, userId: string): Promise<ImportJob | null> {
  return prisma.importJob.findFirst({ where: { id, userId } });
}

export async function createJob(
  userId: string,
  type: ImportJobType,
  data: { sourceUrl: string; sourceLabel?: string | null; provider?: string | null; total?: number },
): Promise<ImportJob> {
  return prisma.importJob.create({
    data: {
      userId,
      type,
      sourceUrl: data.sourceUrl,
      sourceLabel: data.sourceLabel ?? null,
      provider: data.provider ?? null,
      total: data.total ?? 0,
    },
  });
}

export async function updateJob(id: string, data: Prisma.ImportJobUpdateInput): Promise<void> {
  await prisma.importJob.update({ where: { id }, data });
}
