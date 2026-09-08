import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  external_url: string | null;
  internal_path: string | null;
  read: boolean;
  created_at: string;
};

export type NotificationsListResult = {
  items: Notification[];
  unread_count: number;
};

export const notificationsApi = {
  list: async (): Promise<NotificationsListResult> => {
    const res = await fetch(`${apiBase()}/notifications`, { headers: authHeaders() });
    assertOk(res, "Failed to load notifications");
    return res.json();
  },

  markAllRead: async (): Promise<void> => {
    const res = await fetch(`${apiBase()}/notifications/read-all`, {
      method: "POST",
      headers: authHeaders(),
    });
    assertOk(res, "Failed to mark notifications as read");
  },
};
