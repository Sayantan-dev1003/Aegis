"use client";

import React, { useEffect, useState } from "react";
import { useNotifications, Notification } from "@/app/contexts/NotificationContext";
import { useWebSocket } from "@/app/contexts/WebSocketContext";
import { AlertTriangle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./notification.module.css";

export function NotificationToast() {
  const { latestEvent } = useWebSocket();
  const { doNotDisturb } = useNotifications();
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  const router = useRouter();

  // Listen for new critical items via websocket directly
  useEffect(() => {
    if (latestEvent?.event_type === "notification" && latestEvent.notification) {
      const notif = latestEvent.notification as Notification;
      if (notif.priority === "critical") {
        if (doNotDisturb && notif.target_role !== "admin") return;
        setActiveToasts(prev => {
          // Avoid duplicates if same event fires twice
          if (prev.find(t => t.id === notif.id)) return prev;
          return [notif, ...prev];
        });
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
          removeToast(notif.id);
        }, 10000);
      }
    }
  }, [latestEvent]);

  const removeToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleAction = (notif: Notification) => {
    removeToast(notif.id);
    if (notif.transaction_id) {
      router.push(`/reviewer/investigate?id=${notif.transaction_id}`);
    }
  };

  if (activeToasts.length === 0) return null;

  return (
    <div className={styles.toastContainer}>
      {activeToasts.map((toast) => (
        <div
          key={toast.id}
          className={styles.toastItem}
          role="alert"
        >
          <div className={styles.toastIcon}>
            <AlertTriangle size={20} />
          </div>
          <div className={styles.toastContent}>
            <h4 className={styles.toastTitle}>{toast.title}</h4>
            <p className={styles.toastMessage}>
              {toast.message}
            </p>
            <div className={styles.toastActions}>
              {toast.transaction_id && (
                <button
                  onClick={() => handleAction(toast)}
                  className={styles.toastActionBtn}
                >
                  View Case
                </button>
              )}
              <button
                onClick={() => removeToast(toast.id)}
                className={styles.toastDismissBtn}
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className={styles.toastCloseIcon}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
