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
    { name: "Model Management", path: "/admin/model-manage" },
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

  const getPageMeta = (path: string) => {
    const metaMap: Record<string, { title: string, subtitle: string }> = {
      "/admin/health": { title: "System Health & Observability", subtitle: "Single pane of glass over the Aegis pipeline." },
      "/admin/model-manage": { title: "Model Management", subtitle: "Manage and deploy ML models." },
      "/admin/rules": { title: "Rules & Velocity", subtitle: "Configure fraud detection rules and velocity checks." },
      "/admin/users": { title: "User Management", subtitle: "Manage analyst accounts, roles, and permissions." },
      "/admin/queue": { title: "Queue Config", subtitle: "Manage routing rules and SLAs for manual review workflows." },
      "/admin/audit": { title: "Audit Log", subtitle: "Track system changes and analyst actions." },
      "/admin/integrations": { title: "Integrations", subtitle: "Manage programmatic access and event subscriptions." },
    };

    const match = Object.keys(metaMap).find(k => path.startsWith(k));
    if (match) return metaMap[match];

    const route = navLinks.find(l => path.startsWith(l.path));
    return { title: route?.name || "Aegis Dashboard", subtitle: "" };
  };
  
  const pageMeta = getPageMeta(pathname);

  return (
    <div className={styles.layoutWrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitle}>AEGIS</div>
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
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.topBar}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "var(--text-main)", lineHeight: 1.2 }}>{pageMeta.title}</h1>
            {pageMeta.subtitle && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>{pageMeta.subtitle}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-main)", lineHeight: 1.2 }}>{user?.full_name || "Analyst"}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Role: {user?.role || "analyst"}</span>
              </div>
              <button onClick={logout} className={styles.signOutBtn}>
                Sign Out
              </button>
            </div>
          </div>
        </header>
        <div className={styles.contentArea}>
          {children}
        </div>
      </main>
    </div>
  );
}
