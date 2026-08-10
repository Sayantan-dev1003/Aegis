"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { useWebSocket } from "./WebSocketContext";

export interface Notification {
  id: string;
  reviewer_id: string;
  event_type: string;
  priority: "critical" | "warning" | "info";
  title: string;
  message: string;
  target_role?: string;
  transaction_id?: string;
  created_at: string;
}

interface NotificationContextType {
  items: Notification[];
  unreadCount: number;
  isLoading: boolean;
  doNotDisturb: boolean;
  toggleDoNotDisturb: () => void;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { latestEvent } = useWebSocket();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [lastReadTime, setLastReadTime] = useState<string | null>(null);

  // Hydrate on mount
  useEffect(() => {
    if (!token) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch("http://localhost:8080/api/v1/reviewer/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setItems(data.items || []);
        setUnreadCount(data.unread_count || 0);
        setLastReadTime(new Date().toISOString());
      } catch (err) {
        console.error("Failed to fetch notifications", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [token]);

  // Subscribe to real-time notifications via WebSocket
  useEffect(() => {
    if (!latestEvent) return;

    // Check if this event is a notification (not raw transaction feed)
    if (latestEvent.event_type === "notification" && latestEvent.notification) {
      const notif: Notification = latestEvent.notification;
      setItems((prev) => [notif, ...prev].slice(0, 100));
      setUnreadCount((prev) => prev + 1);
    }
  }, [latestEvent]);

  const markAllRead = async () => {
    try {
      await fetch("http://localhost:8080/api/v1/reviewer/notifications/read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnreadCount(0);
      setLastReadTime(new Date().toISOString());
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const toggleDoNotDisturb = () => setDoNotDisturb(!doNotDisturb);

  return (
    <NotificationContext.Provider value={{ items, unreadCount, isLoading, doNotDisturb, toggleDoNotDisturb, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
