"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
type AlertSeverity = "critical" | "high" | "medium" | "info";

interface AlertItem {
  id: string;
  txnId: string;
  title: string;
  description: string;
  queue: string;
  severity: AlertSeverity;
  slaMinutes: number;
  riskScore: number;
  amount: string;
  timestamp: string;
  isRead: boolean;
  isNew?: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INITIAL_ALERTS: AlertItem[] = [
  {
    id: "a1", txnId: "TXN-8821-AX", title: "Critical: High-Value Transaction Flagged",
    description: "₹5,24,000 INR transaction from IndiaMart B2B exceeded HVT-01 threshold. Senior analyst required within 15m SLA.",
    queue: "High Value Transactions", severity: "critical", slaMinutes: 15, riskScore: 82, amount: "₹5,24,000",
    timestamp: "2 min ago", isRead: false, isNew: true,
  },
  {
    id: "a2", txnId: "TXN-9901-CZ", title: "ATO Alert: Password Reset + Withdrawal",
    description: "Rule ATO-01 triggered — withdrawal of ₹1,02,000 within 22min of password reset. Possible account takeover.",
    queue: "ATO Suspects", severity: "critical", slaMinutes: 30, riskScore: 91, amount: "₹1,02,000",
    timestamp: "8 min ago", isRead: false,
  },
  {
    id: "a3", txnId: "TXN-7754-EF", title: "Geo-Velocity Alert: Impossible Travel",
    description: "Same account active in Mumbai and Hyderabad within 90 minutes. 1,840 km distance detected.",
    queue: "ATO Suspects", severity: "high", slaMinutes: 30, riskScore: 78, amount: "₹87,000",
    timestamp: "18 min ago", isRead: false,
  },
  {
    id: "a4", txnId: "TXN-5566-IJ", title: "KYC Flag: Unverified Account",
    description: "New account (< 24h old) attempted ₹24,500 transaction with pending KYC. Rule KYC-01 triggered.",
    queue: "KYC & Onboarding", severity: "high", slaMinutes: 120, riskScore: 63, amount: "₹24,500",
    timestamp: "35 min ago", isRead: true,
  },
  {
    id: "a5", txnId: "TXN-4432-BK", title: "ML Grey Zone: Score 0.62",
    description: "Transaction score in borderline range (0.45–0.75). Model uncertain — analyst review needed for feedback loop.",
    queue: "ML Borderline Review", severity: "medium", slaMinutes: 60, riskScore: 67, amount: "₹48,500",
    timestamp: "42 min ago", isRead: true,
  },
  {
    id: "a6", txnId: "TXN-3311-DD", title: "⚠ SLA Breach: Case TXN-3311-DD",
    description: "ML Borderline Review case has exceeded 60m SLA. Immediate attention required.",
    queue: "ML Borderline Review", severity: "critical", slaMinutes: 0, riskScore: 55, amount: "$12,400",
    timestamp: "1h 5m ago", isRead: false,
  },
  {
    id: "a7", txnId: "TXN-2289-GH", title: "AML: Smurfing Pattern Detected",
    description: "3 transactions of ₹47–49k within 24h — Rule AML-01 triggered. Regulatory review required.",
    queue: "AML / Structuring", severity: "high", slaMinutes: 1440, riskScore: 48, amount: "₹48,500",
    timestamp: "3h ago", isRead: true,
  },
  {
    id: "a8", txnId: "TXN-1123-KL", title: "High Value: New Case Assigned",
    description: "₹6,12,000 B2B export payment added to your High Value queue. SLA: 15 minutes.",
    queue: "High Value Transactions", severity: "critical", slaMinutes: 15, riskScore: 71, amount: "₹6,12,000",
    timestamp: "Just now", isRead: false, isNew: true,
  },
];

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; bg: string; border: string; icon: string; label: string }> = {
  critical: { color: "var(--risk-critical)", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.25)", icon: "🔴", label: "Critical" },
  high:     { color: "var(--risk-medium)", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", icon: "🟠", label: "High" },
  medium:   { color: "var(--reviewer-accent)", bg: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.2)", icon: "🔵", label: "Medium" },
  info:     { color: "var(--text-muted)", bg: "transparent", border: "var(--border-color)", icon: "⚪", label: "Info" },
};

const PREF_CHANNELS = ["Push Notification", "Email Alert", "WebSocket Feed"];
const PREF_BANDS = ["Critical (score ≥ 75)", "High (score 60–74)", "Medium (score 45–59)", "SLA Breaches", "New Case Assignments"];

// ─── Sub-Components ───────────────────────────────────────────────────────────
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10, flexShrink: 0 }}>
      <span style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: color, opacity: 0.5, animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
      <span style={{ position: "relative", borderRadius: "50%", width: "100%", height: "100%", background: color, display: "inline-block" }} />
      <style>{`@keyframes ping { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(2.5); opacity: 0; } }`}</style>
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "all">("all");
  const [filterRead, setFilterRead] = useState<"all" | "unread">("all");
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefChannels, setPrefChannels] = useState(new Set(["Push Notification", "WebSocket Feed"]));
  const [prefBands, setPrefBands] = useState(new Set(["Critical (score ≥ 75)", "High (score 60–74)", "SLA Breaches", "New Case Assignments"]));
  const [newCount, setNewCount] = useState(alerts.filter(a => !a.isRead).length);

  // Simulate a new incoming WebSocket alert after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      const incoming: AlertItem = {
        id: "live-1", txnId: "TXN-LIVE-01", title: "🔴 Live: VIP Account Flagged",
        description: "ENTERPRISE_PLATINUM account transaction of ₹2,40,000 triggered VIP-01 rule. 10m SLA.",
        queue: "VIP / White-Glove Support", severity: "critical", slaMinutes: 10, riskScore: 89, amount: "₹2,40,000",
        timestamp: "Just now", isRead: false, isNew: true,
      };
      setAlerts(prev => [incoming, ...prev]);
      setNewCount(n => n + 1);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const markRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true, isNew: false } : a));
    setNewCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = () => {
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true, isNew: false })));
    setNewCount(0);
  };

  const filtered = alerts
    .filter(a => filterSeverity === "all" || a.severity === filterSeverity)
    .filter(a => filterRead === "all" || !a.isRead);

  const unreadCount = alerts.filter(a => !a.isRead).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

      {/* ── Live Connection Banner ────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px var(--space-lg)", background: "var(--reviewer-accent-subtle)", border: "1px solid var(--reviewer-border)", borderRadius: "var(--radius-md)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <PulsingDot color="var(--reviewer-accent)" />
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--reviewer-accent)" }}>WebSocket Feed Live — Real-time alerts from your assigned queues</span>
        </div>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
          {unreadCount} unread
        </span>
      </div>

      {/* ── Filters + Actions Bar ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-md)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          {/* Severity filters */}
          {(["all", "critical", "high", "medium"] as const).map(s => (
            <button key={s} onClick={() => setFilterSeverity(s)}
              style={{
                padding: "5px 14px", borderRadius: 20, border: filterSeverity === s ? `1px solid ${s === "all" ? "var(--reviewer-border)" : SEVERITY_CONFIG[s as AlertSeverity]?.border || "var(--reviewer-border)"}` : "1px solid var(--border-color)",
                background: filterSeverity === s ? (s === "all" ? "var(--reviewer-accent-light)" : `${SEVERITY_CONFIG[s as AlertSeverity]?.bg}`) : "transparent",
                color: filterSeverity === s ? (s === "all" ? "var(--reviewer-accent)" : SEVERITY_CONFIG[s as AlertSeverity]?.color) : "var(--text-muted)",
                fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", transition: "all 0.2s", textTransform: "capitalize"
              }}>
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <div style={{ width: 1, height: 28, background: "var(--border-color)", alignSelf: "center" }} />
          <button onClick={() => setFilterRead(filterRead === "all" ? "unread" : "all")}
            style={{ padding: "5px 14px", borderRadius: 20, border: filterRead === "unread" ? "1px solid var(--reviewer-border)" : "1px solid var(--border-color)", background: filterRead === "unread" ? "var(--reviewer-accent-light)" : "transparent", color: filterRead === "unread" ? "var(--reviewer-accent)" : "var(--text-muted)", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}>
            Unread Only {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>

        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <button onClick={markAllRead}
            style={{ padding: "6px 16px", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}>
            Mark All Read
          </button>
          <button onClick={() => setShowPrefs(!showPrefs)}
            style={{ padding: "6px 16px", background: showPrefs ? "var(--reviewer-accent-light)" : "transparent", border: `1px solid ${showPrefs ? "var(--reviewer-border)" : "var(--border-color)"}`, borderRadius: "var(--radius-sm)", color: showPrefs ? "var(--reviewer-accent)" : "var(--text-muted)", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}>
            ⚙ Preferences
          </button>
        </div>
      </div>

      {/* ── Preferences Panel ────────────────────────────────────── */}
      {showPrefs && (
        <div style={{ background: "var(--surface-color)", border: "1px solid var(--reviewer-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "var(--space-lg)", color: "var(--reviewer-accent)" }}>⚙ Notification Preferences</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-xl)" }}>
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-md)" }}>Channels</div>
              {PREF_CHANNELS.map(c => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={prefChannels.has(c)} onChange={() => {
                    setPrefChannels(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
                  }} style={{ accentColor: "var(--reviewer-accent)", width: 16, height: 16 }} />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-main)" }}>{c}</span>
                </label>
              ))}
            </div>
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-md)" }}>Alert Triggers</div>
              {PREF_BANDS.map(b => (
                <label key={b} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", cursor: "pointer" }}>
                  <input type="checkbox" checked={prefBands.has(b)} onChange={() => {
                    setPrefBands(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n; });
                  }} style={{ accentColor: "var(--reviewer-accent)", width: 16, height: 16 }} />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-main)" }}>{b}</span>
                </label>
              ))}
            </div>
          </div>
          <button onClick={() => setShowPrefs(false)} style={{ marginTop: "var(--space-lg)", padding: "8px 20px", background: "var(--reviewer-accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#0A0E14", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
            Save Preferences
          </button>
        </div>
      )}

      {/* ── Alerts Feed ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "var(--space-2xl)", textAlign: "center", background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>🔔</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No alerts match your current filters</div>
            <div style={{ fontSize: "0.85rem" }}>Your queues are clear — great job!</div>
          </div>
        ) : (
          filtered.map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity];
            const isSlaBreached = alert.slaMinutes === 0;
            return (
              <div
                key={alert.id}
                onClick={() => markRead(alert.id)}
                style={{
                  display: "flex", gap: "var(--space-md)", padding: "var(--space-md) var(--space-lg)",
                  background: !alert.isRead ? cfg.bg : "var(--surface-color)",
                  border: `1px solid ${!alert.isRead ? cfg.border : "var(--border-color)"}`,
                  borderLeft: `3px solid ${!alert.isRead ? cfg.color : "var(--border-color)"}`,
                  borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all 0.2s",
                  position: "relative", alignItems: "flex-start",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${cfg.bg}`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = !alert.isRead ? cfg.bg : "var(--surface-color)"; }}
              >
                {/* NEW badge */}
                {alert.isNew && (
                  <div style={{ position: "absolute", top: "var(--space-sm)", right: "var(--space-sm)", display: "flex", alignItems: "center", gap: 4 }}>
                    <PulsingDot color={cfg.color} />
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>NEW</span>
                  </div>
                )}

                {/* Icon */}
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: cfg.bg, border: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                  {cfg.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontWeight: !alert.isRead ? 800 : 600, fontSize: "0.9rem", color: !alert.isRead ? cfg.color : "var(--text-main)" }}>
                      {alert.title}
                    </span>
                    {!alert.isRead && <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />}
                  </div>
                  <p style={{ margin: "0 0 8px 0", fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{alert.description}</p>
                  <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--reviewer-accent)", fontWeight: 700 }}>{alert.txnId}</span>
                    <span style={{ color: "var(--text-disabled)" }}>·</span>
                    <span style={{ padding: "2px 8px", borderRadius: 12, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontSize: "0.7rem", fontWeight: 700 }}>{alert.queue}</span>
                    <span style={{ color: "var(--text-disabled)" }}>·</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.8rem" }}>{alert.amount}</span>
                    {isSlaBreached && <span style={{ padding: "2px 8px", borderRadius: 12, background: "rgba(244,63,94,0.15)", color: "var(--risk-critical)", fontSize: "0.7rem", fontWeight: 700 }}>⚠ SLA BREACHED</span>}
                    {!isSlaBreached && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>SLA: {alert.slaMinutes}m</span>}
                  </div>
                </div>

                {/* Right: time + CTA */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-sm)", flexShrink: 0, minWidth: 100 }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{alert.timestamp}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead(alert.id); router.push(`/reviewer/investigate?id=${alert.id}`); }}
                    style={{ padding: "5px 12px", background: "var(--reviewer-accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#0A0E14", fontWeight: 700, fontSize: "0.75rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                    Jump to Case →
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
