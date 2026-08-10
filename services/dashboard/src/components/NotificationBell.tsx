"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications, Notification } from "@/app/contexts/NotificationContext";
import { Bell, BellOff, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import styles from "./notification.module.css";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { items, unreadCount, doNotDisturb, toggleDoNotDisturb, markAllRead } = useNotifications();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notif: Notification) => {
    if (notif.transaction_id) {
      router.push(`/reviewer/investigate?id=${notif.transaction_id}`);
    }
    setIsOpen(false);
  };

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case "critical": return styles.priorityCritical;
      case "warning": return styles.priorityWarning;
      default: return styles.priorityInfo;
    }
  };

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={styles.bellButton}
        title={doNotDisturb ? "Do Not Disturb is ON" : "Notifications"}
      >
        {doNotDisturb ? <BellOff size={20} className={styles.dndActiveIcon} /> : <Bell size={20} />}
        {unreadCount > 0 && !doNotDisturb && (
          <span className={styles.badge}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdownWrapper}>
          <div className={styles.dropdownHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h3>Notifications</h3>
              <button 
                onClick={toggleDoNotDisturb}
                className={`${styles.dndToggleBtn} ${doNotDisturb ? styles.dndActive : ""}`}
                title="Toggle Do Not Disturb"
              >
                {doNotDisturb ? <BellOff size={14} /> : <Bell size={14} />}
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className={styles.markReadBtn}
              >
                <Check size={14} />
                Mark all read
              </button>
            )}
          </div>
          
          <div className={styles.dropdownList}>
            {items.length === 0 ? (
              <div className={styles.emptyState}>
                No notifications yet.
              </div>
            ) : (
              items.map((notif, idx) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`${styles.notificationItem} ${idx < unreadCount ? styles.unread : ""}`}
                >
                  <div className={`${styles.priorityIndicator} ${getPriorityClass(notif.priority)}`} />
                  <div className={styles.itemContent}>
                    <div className={styles.itemHeader}>
                      <h4 className={styles.itemTitle}>
                        {notif.target_role === "admin" && <span className={`${styles.roleBadge} ${styles.roleBadgeAdmin}`}>System</span>}
                        {notif.target_role === "reviewer" && <span className={`${styles.roleBadge} ${styles.roleBadgeReviewer}`}>Reviewers</span>}
                        {notif.target_role === "viewer" && <span className={`${styles.roleBadge} ${styles.roleBadgeViewer}`}>Viewers</span>}
                        {notif.title}
                      </h4>
                      <span className={styles.itemTime}>
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className={styles.itemMessage}>
                      {notif.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
