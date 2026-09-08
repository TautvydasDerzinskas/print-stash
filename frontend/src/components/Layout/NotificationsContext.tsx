import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import { notificationsApi, type Notification } from "../../api/notifications";
import { UnauthorizedError } from "../../api/client";

type NotificationsContextValue = {
  items: Notification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// Not urgent -- the primary trigger for a new notification is the current tab's own tracked
// import job finishing (ImportJobContext refreshes this directly when that happens). This
// interval only catches a notification created elsewhere (another tab/device).
const POLL_INTERVAL_MS = 45_000;

export function NotificationsProvider({
  onUnauthorized,
  children,
}: {
  onUnauthorized?: () => void;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await notificationsApi.list();
      setItems(result.items);
      setUnreadCount(result.unread_count);
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
    }
  }, [onUnauthorized]);

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      setUnreadCount(0);
      setItems(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ items, unreadCount, refresh, markAllRead }), [items, unreadCount, refresh, markAllRead]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
