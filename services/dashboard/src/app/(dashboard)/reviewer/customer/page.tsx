"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { RadialRiskGauge } from "@/components/RadialRiskGauge";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const CUSTOMER = {
  name: "Amit Verma",
  accountId: "ACC-2041-ZX",
  email: "a**t@gmail.com",
  phone: "+91 ****-****-22",
  accountAge: "3 years, 4 months",
  kycStatus: "verified" as const,
  accountTier: "Standard",
  totalVolume: "₹28,40,000",
  fraudFlagCount: 3,
  chargebackCount: 0,
  lastActive: "2026-08-01 09:18 IST",
  riskTrend: [42, 38, 45, 51, 60, 68, 72, 91],
  tags: ["High-Velocity", "New Device Alert", "ATO Flag"],
  transactions: [
    { id: "t1", date: "2026-08-01", amount: "₹1,02,000", merchant: "PayFast Gateway", type: "P2P Transfer", status: "escalated", fraudScore: 91 },
    { id: "t2", date: "2026-07-28", amount: "₹4,200", merchant: "Swiggy", type: "Card Payment", status: "approved", fraudScore: 12 },
    { id: "t3", date: "2026-07-25", amount: "₹18,000", merchant: "Amazon India", type: "Card Payment", status: "approved", fraudScore: 22 },
    { id: "t4", date: "2026-07-20", amount: "₹92,000", merchant: "HDFC UPI", type: "UPI Transfer", status: "flagged", fraudScore: 74 },
    { id: "t5", date: "2026-07-15", amount: "₹3,500", merchant: "Zomato", type: "Card Payment", status: "approved", fraudScore: 8 },
    { id: "t6", date: "2026-06-30", amount: "₹22,000", merchant: "PayFast Gateway", type: "Wire Transfer", status: "declined", fraudScore: 65 },
    { id: "t7", date: "2026-06-15", amount: "₹8,900", merchant: "BookMyShow", type: "Card Payment", status: "approved", fraudScore: 15 },
    { id: "t8", date: "2026-05-28", amount: "₹45,000", merchant: "NEFT Transfer", type: "Bank Transfer", status: "approved", fraudScore: 31 },
  ],
  decisions: [
    { date: "2026-07-20", decision: "declined", reviewer: "Rahul S.", reasonCode: "Confirmed Fraud: Card Not Present", txnId: "TXN-4420-AX" },
    { date: "2026-06-30", decision: "declined", reviewer: "Aisha K.", reasonCode: "Escalate: Compliance / AML Review Needed", txnId: "TXN-2289-BC" },
    { date: "2026-05-10", decision: "approved", reviewer: "System Auto", reasonCode: "Legitimate: Transaction Pattern Normal", txnId: "TXN-0011-ZZ" },
  ],
  devices: [
    { id: "DEV-9921-UNFAMILIAR", type: "Mobile Android 14", browser: "Chrome 126", ip: "203.88.12.91", city: "Hyderabad", lastSeen: "Today 09:18", isNew: true },
    { id: "DEV-3312-KNOWN", type: "Mobile iOS 17", browser: "Safari 17", ip: "182.74.10.22", city: "Mumbai", lastSeen: "Jul 25 2026", isNew: false },
    { id: "DEV-1100-KNOWN", type: "Desktop Windows 11", browser: "Edge 124", ip: "182.74.10.22", city: "Mumbai", lastSeen: "Jun 18 2026", isNew: false },
  ],
  linkedAccounts: [
    { accountId: "ACC-8821-PQ", name: "Rahul Verma", relation: "Same device in 24h", riskScore: 62 },
    { accountId: "ACC-3341-RW", name: "Unknown Entity", relation: "Shared IP address", riskScore: 84 },
  ],
  notes: [
    { author: "Aisha K.", date: "2026-06-30", text: "Customer flagged twice in 30 days. Pattern consistent with account sharing or compromised credentials. Monitoring." },
    { author: "Rahul S.", date: "2026-07-20", text: "Declined high-value UPI. Unusual merchant. Flagged for ATO pattern." },
  ],
};

// ─── Sub-Components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.8rem", fontWeight: 800, fontFamily: "monospace", color: color || "var(--text-main)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{ padding: "var(--space-md) var(--space-lg)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
        <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
        <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-main)" }}>{title}</span>
      </div>
      <div style={{ padding: "var(--space-lg)" }}>{children}</div>
    </div>
  );
}

// ─── Risk Sparkline (SVG mini chart) ─────────────────────────────────────────
function RiskSparkline({ data }: { data: number[] }) {
  const width = 260; const height = 60; const n = data.length;
  const xStep = width / (n - 1);
  const points = data.map((v, i) => `${i * xStep},${height - (v / 100) * height}`).join(" ");
  const fillPoints = `0,${height} ${points} ${(n - 1) * xStep},${height}`;
  const lastColor = data[data.length - 1] >= 75 ? "var(--risk-critical)" : data[data.length - 1] >= 45 ? "var(--risk-medium)" : "var(--risk-low)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 60 }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lastColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lastColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill="url(#sparkGrad)" />
      <polyline points={points} fill="none" stroke={lastColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(n - 1) * xStep} cy={height - (data[n - 1] / 100) * height} r="4" fill={lastColor} />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CustomerProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"transactions" | "decisions" | "devices" | "notes">("transactions");
  const [newNote, setNewNote] = useState("");

  const kycColor = CUSTOMER.kycStatus === "verified" ? "var(--risk-low)" : CUSTOMER.kycStatus === "pending" ? "var(--risk-medium)" : "var(--risk-critical)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

      {/* ── Profile Header ────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-xl)", flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--reviewer-accent-light)", border: "2px solid var(--reviewer-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", flexShrink: 0 }}>
            {CUSTOMER.name[0]}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>{CUSTOMER.name}</h2>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: `${kycColor}18`, color: kycColor, border: `1px solid ${kycColor}40`, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>
                ✓ {CUSTOMER.kycStatus}
              </span>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: "var(--reviewer-accent-light)", color: "var(--reviewer-accent)", border: "1px solid var(--reviewer-border)", fontSize: "0.72rem", fontWeight: 700 }}>
                {CUSTOMER.accountTier}
              </span>
            </div>
            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: "0.85rem", fontFamily: "monospace" }}>{CUSTOMER.accountId}</div>
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: "0.82rem" }}>{CUSTOMER.email} · {CUSTOMER.phone}</div>
            <div style={{ marginTop: 6, display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              {CUSTOMER.tags.map(t => (
                <span key={t} style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(244,63,94,0.1)", color: "var(--risk-critical)", border: "1px solid rgba(244,63,94,0.2)", fontSize: "0.72rem", fontWeight: 700 }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          {/* Risk trend */}
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Risk Score Trend (8 weeks)</div>
            <RiskSparkline data={CUSTOMER.riskTrend} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.72rem", color: "var(--text-disabled)", fontFamily: "monospace" }}>
              <span>8w ago</span>
              <span style={{ color: "var(--risk-critical)", fontWeight: 700 }}>Now: {CUSTOMER.riskTrend[CUSTOMER.riskTrend.length - 1]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)" }}>
        <KpiCard label="Total Volume" value={CUSTOMER.totalVolume} sub="Lifetime" color="var(--reviewer-accent)" />
        <KpiCard label="Fraud Flags" value={CUSTOMER.fraudFlagCount} sub="Historical" color={CUSTOMER.fraudFlagCount > 2 ? "var(--risk-critical)" : "var(--risk-medium)"} />
        <KpiCard label="Chargebacks" value={CUSTOMER.chargebackCount} sub="Last 180 days" color={CUSTOMER.chargebackCount > 0 ? "var(--risk-medium)" : "var(--risk-low)"} />
        <KpiCard label="Account Age" value={CUSTOMER.accountAge} sub={`Last active: ${CUSTOMER.lastActive}`} />
      </div>

      {/* ── Tabbed Content ────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", padding: "0 var(--space-lg)" }}>
          {([
            { key: "transactions", label: `Transactions (${CUSTOMER.transactions.length})` },
            { key: "decisions", label: `Past Decisions (${CUSTOMER.decisions.length})` },
            { key: "devices", label: `Devices (${CUSTOMER.devices.length})` },
            { key: "notes", label: `Notes (${CUSTOMER.notes.length})` },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "var(--space-md) var(--space-md)",
                background: "transparent", border: "none",
                borderBottom: activeTab === t.key ? "2px solid var(--reviewer-accent)" : "2px solid transparent",
                color: activeTab === t.key ? "var(--reviewer-accent)" : "var(--text-muted)",
                fontWeight: activeTab === t.key ? 700 : 500,
                cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap",
                transition: "all 0.2s", marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "var(--space-lg)" }}>
          {/* Transactions Tab */}
          {activeTab === "transactions" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  {["Date", "Amount", "Merchant", "Type", "Fraud Score", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 600, textAlign: "left", fontSize: "0.78rem", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CUSTOMER.transactions.map((t, i) => {
                  const sColor = t.status === "approved" ? "var(--risk-low)" : t.status === "escalated" || t.status === "declined" ? "var(--risk-critical)" : "var(--risk-medium)";
                  return (
                    <tr key={t.id} style={{ borderBottom: i === CUSTOMER.transactions.length - 1 ? "none" : "1px solid var(--border-color)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>{t.date}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "monospace" }}>{t.amount}</td>
                      <td style={{ padding: "10px 12px" }}>{t.merchant}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "0.8rem" }}>{t.type}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border-color)" }}>
                            <div style={{ height: "100%", width: `${t.fraudScore}%`, background: t.fraudScore >= 75 ? "var(--risk-critical)" : t.fraudScore >= 45 ? "var(--risk-medium)" : "var(--risk-low)", borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 700, color: t.fraudScore >= 75 ? "var(--risk-critical)" : t.fraudScore >= 45 ? "var(--risk-medium)" : "var(--risk-low)" }}>{t.fraudScore}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 12, background: `${sColor}18`, color: sColor, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>{t.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Decisions Tab */}
          {activeTab === "decisions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {CUSTOMER.decisions.map((d, i) => {
                const dColor = d.decision === "approved" ? "var(--risk-low)" : d.decision === "declined" ? "var(--risk-critical)" : "var(--risk-medium)";
                return (
                  <div key={i} style={{ padding: "var(--space-md)", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-lg)", flexWrap: "wrap" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${dColor}18`, border: `1px solid ${dColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                      {d.decision === "approved" ? "✓" : d.decision === "declined" ? "✕" : "⬆"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: dColor, textTransform: "uppercase", fontSize: "0.85rem" }}>{d.decision}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 2 }}>{d.reasonCode}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--reviewer-accent)" }}>{d.txnId}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>by {d.reviewer} · {d.date}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Devices Tab */}
          {activeTab === "devices" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {CUSTOMER.devices.map((d, i) => (
                <div key={i} style={{ padding: "var(--space-md)", background: "var(--bg-color)", border: d.isNew ? "1px solid rgba(244,63,94,0.3)" : "1px solid var(--border-color)", borderRadius: "var(--radius-md)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: d.isNew ? "rgba(244,63,94,0.1)" : "var(--reviewer-accent-light)", border: d.isNew ? "1px solid rgba(244,63,94,0.3)" : "1px solid var(--reviewer-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                    💻
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{d.type} · {d.browser}</div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {d.id} · IP: {d.ip} · {d.city}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {d.isNew && <div style={{ padding: "2px 8px", borderRadius: 12, background: "rgba(244,63,94,0.1)", color: "var(--risk-critical)", fontSize: "0.72rem", fontWeight: 700, marginBottom: 4 }}>NEW</div>}
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>Last: {d.lastSeen}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === "notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {CUSTOMER.notes.map((n, i) => (
                <div key={i} style={{ padding: "var(--space-md)", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: "var(--reviewer-accent)", fontSize: "0.85rem" }}>{n.author}</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>{n.date}</span>
                  </div>
                  <p style={{ margin: 0, color: "var(--text-main)", fontSize: "0.85rem", lineHeight: 1.6 }}>{n.text}</p>
                </div>
              ))}
              {/* Add note */}
              <div style={{ marginTop: "var(--space-sm)" }}>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                  placeholder="Add an internal note about this customer…"
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-main)", fontSize: "0.85rem", resize: "vertical", lineHeight: 1.6 }} />
                <button disabled={!newNote.trim()}
                  style={{ marginTop: 8, padding: "8px 20px", background: newNote.trim() ? "var(--reviewer-accent)" : "var(--border-color)", border: "none", borderRadius: "var(--radius-sm)", color: newNote.trim() ? "#0A0E14" : "var(--text-disabled)", fontWeight: 700, fontSize: "0.82rem", cursor: newNote.trim() ? "pointer" : "not-allowed" }}>
                  Save Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Linked Accounts ───────────────────────────────────────── */}
      <Section title="🕸 Linked Accounts">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {CUSTOMER.linkedAccounts.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)", padding: "var(--space-md)", background: "var(--bg-color)", border: "1px dashed rgba(244,63,94,0.3)", borderRadius: "var(--radius-md)" }}>
              <RadialRiskGauge score={a.riskScore} size={48} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{a.name}</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{a.accountId}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--risk-medium)", marginTop: 2 }}>🔗 {a.relation}</div>
              </div>
              <button style={{ padding: "6px 14px", background: "transparent", border: "1px solid var(--reviewer-border)", borderRadius: "var(--radius-sm)", color: "var(--reviewer-accent)", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>
                View Profile →
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
