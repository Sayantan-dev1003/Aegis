"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import styles from "./dashboard.module.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();
  const pathname = usePathname();

  const adminNav = [
    { name: "System Health", path: "/admin/health" },
    { name: "Model Management", path: "/admin/models" },
    { name: "Rules & Velocity", path: "/admin/rules" },
    { name: "User Management", path: "/admin/users" },
    { name: "Queue Config", path: "/admin/queue" },
    { name: "Audit Log", path: "/admin/audit" },
    { name: "Integrations", path: "/admin/integrations" },
  ];

  const reviewerNav = [
    { name: "Case Queue", path: "/reviewer/queue" },
    { name: "Investigation", path: "/reviewer/investigate" },
    { name: "Customer 360", path: "/reviewer/customer" },
    { name: "My Performance", path: "/reviewer/performance" },
    { name: "Alerts", path: "/reviewer/alerts" },
  ];

  const viewerNav = [
    { name: "Executive Overview", path: "/viewer/overview" },
    { name: "Analytics & Reports", path: "/viewer/analytics" },
    { name: "Model Performance", path: "/viewer/models" },
    { name: "Audit Trail", path: "/viewer/audit" },
  ];

  const role = user?.role || "reviewer";
  const navLinks = role === "admin" ? adminNav : role === "viewer" ? viewerNav : reviewerNav;

  return (
    <div className={styles.layoutWrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitle}>Aegis</div>
        </div>
        <ul className={styles.navList}>
          {navLinks.map((link) => (
            <li key={link.path} className={styles.navItem}>
              <Link 
                href={link.path} 
                className={`${styles.navLink} ${pathname.startsWith(link.path) ? styles.navLinkActive : ""}`}
              >
                {link.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.userSection}>
          <div className={styles.userName}>{user?.full_name || "Analyst"}</div>
          <div style={{ color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
            Role: {user?.role || "analyst"}
          </div>
          <button onClick={logout} className="btn-secondary" style={{ width: "100%", padding: "0.25rem" }}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.topBar}>
          <div className={styles.connectionStatus}>
            <span className={`${styles.statusDot} ${isConnected ? styles.statusConnected : styles.statusDisconnected}`}></span>
            {isConnected ? "Live Data Connected" : "Disconnected"}
          </div>
        </header>
        <div className={styles.contentArea}>
          {children}
        </div>
      </main>
    </div>
  );
}
