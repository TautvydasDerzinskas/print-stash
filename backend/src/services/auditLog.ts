import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

export type LogAction =
  | "user_logged_in"
  | "user_logged_out"
  | "model_uploaded"
  | "model_imported"
  | "import_completed"
  | "model_edited"
  | "model_deleted"
  | "collection_created"
  | "collection_edited"
  | "collection_deleted"
  | "collection_item_added"
  | "collection_item_removed";

/** Writes one admin-audit-trail entry (see the Log model's schema.prisma doc comment). Always
 * fire-and-forget (`void createLog(...)`, never awaited by the caller) -- a logging failure must
 * never break the user-facing action it's recording. */
export async function createLog(params: {
  userId: string;
  action: LogAction;
  targetId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetId: params.targetId ?? null,
        details: (params.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[auditLog] Failed to write log entry:", err);
  }
}
