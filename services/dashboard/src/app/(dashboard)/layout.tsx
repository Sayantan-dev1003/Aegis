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

  const navLinks = [
    { name: "Transactions", path: "/transactions" },
    { name: "Review Queue", path: "/reviews" },
    { name: "Analytics", path: "/stats" },
    { name: "Settings", path: "/admin/config" },
  ];

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
          <div className={styles.userName}>{user?.username || "Analyst"}</div>
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
