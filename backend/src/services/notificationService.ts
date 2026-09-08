import { prisma } from "../db";

const LIST_LIMIT = 50;

export async function createNotification(
  userId: string,
  data: { title: string; body?: string | null; externalUrl?: string | null; internalPath?: string | null },
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      title: data.title,
      body: data.body ?? null,
      externalUrl: data.externalUrl ?? null,
      internalPath: data.internalPath ?? null,
    },
  });
}

export async function listNotifications(userId: string) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unreadCount };
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
