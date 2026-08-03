"use client";

import React, { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── Mock Performance Data ────────────────────────────────────────────────────
const ACCURACY_DATA = [
  { week: "W1 Jun", accuracy: 88, throughput: 42 },
  { week: "W2 Jun", accuracy: 84, throughput: 38 },
  { week: "W3 Jun", accuracy: 91, throughput: 54 },
  { week: "W4 Jun", accuracy: 87, throughput: 48 },
  { week: "W1 Jul", accuracy: 93, throughput: 61 },
  { week: "W2 Jul", accuracy: 90, throughput: 57 },
  { week: "W3 Jul", accuracy: 95, throughput: 63 },
  { week: "W4 Jul", accuracy: 92, throughput: 59 },
];

const AHT_DATA = [
  { day: "Mon", aht: 22 },
  { day: "Tue", aht: 18 },
  { day: "Wed", aht: 25 },
  { day: "Thu", aht: 16 },
  { day: "Fri", aht: 19 },
  { day: "Sat", aht: 14 },
];

const DECISION_BREAKDOWN = [
  { name: "Approved", value: 142, color: "var(--risk-low)" },
  { name: "Declined", value: 78, color: "var(--risk-critical)" },
  { name: "Blocked", value: 23, color: "#F43F5E" },
  { name: "Escalated", value: 19, color: "var(--risk-medium)" },
];

const PERIOD_DATA = {
  day: { reviewed: 12, approved: 7, declined: 3, blocked: 1, escalated: 1, accuracy: 91.7, aht: "16m", sla: 100, escalationRate: 8.3 },
  week: { reviewed: 63, approved: 38, declined: 17, blocked: 5, escalated: 3, accuracy: 92.1, aht: "19m", sla: 96.8, escalationRate: 4.8 },
  month: { reviewed: 262, approved: 142, declined: 78, blocked: 23, escalated: 19, accuracy: 89.3, aht: "21m", sla: 94.3, escalationRate: 7.3 },
};

const LEADERBOARD = [
  { rank: 1, name: "Aisha K.", reviewed: 310, accuracy: 94.2, aht: "17m", badge: "🏆" },
  { rank: 2, name: "Rahul S.", reviewed: 289, accuracy: 92.8, aht: "19m", badge: "🥈" },
  { rank: 3, name: "You", reviewed: 262, accuracy: 89.3, aht: "21m", badge: "🥉", isMe: true },
  { rank: 4, name: "Sneha M.", reviewed: 241, accuracy: 87.1, aht: "24m", badge: "" },
  { rank: 5, name: "Dev K.", reviewed: 198, accuracy: 85.6, aht: "26m", badge: "" },
];

// ─── Sub-Components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, trend }: { label: string; value: string | number; sub?: string; color?: string; trend?: "up" | "down" | "neutral" }) {
  const trendColor = trend === "up" ? "var(--risk-low)" : trend === "down" ? "var(--risk-critical)" : "var(--text-muted)";
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "";
  return (
    <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -20, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${color || "var(--reviewer-accent-glow)"} 0%, transparent 70%)`, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: "2rem", fontWeight: 900, fontFamily: "monospace", color: color || "var(--text-main)" }}>{value}</div>
      {(sub || trend) && (
        <div style={{ marginTop: 6, fontSize: "0.78rem", color: trendColor, display: "flex", gap: 4, alignItems: "center" }}>
          {trendArrow && <span style={{ fontWeight: 700 }}>{trendArrow}</span>}
          <span style={{ color: "var(--text-muted)" }}>{sub}</span>
        </div>
      )}
    </div>
  );
}

const CUSTOM_TOOLTIP_STYLE = {
  background: "var(--surface-color)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "var(--text-main)",
  fontSize: "0.82rem",
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const data = PERIOD_DATA[period];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>

      {/* ── Period Selector ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
        {(["day", "week", "month"] as const).map(p => (
          <button key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: "7px 20px", borderRadius: 20,
              border: period === p ? "1px solid var(--reviewer-border)" : "1px solid var(--border-color)",
              background: period === p ? "var(--reviewer-accent-light)" : "transparent",
              color: period === p ? "var(--reviewer-accent)" : "var(--text-muted)",
              fontWeight: period === p ? 700 : 500, fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s",
              textTransform: "capitalize"
            }}>
            {p === "day" ? "Today" : p === "week" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)" }}>
        <KpiCard label="Cases Reviewed" value={data.reviewed} sub="Total" color="var(--reviewer-accent)" trend="up" />
        <KpiCard label="Accuracy Rate" value={`${data.accuracy}%`} sub="vs confirmed outcomes" color={data.accuracy >= 90 ? "var(--risk-low)" : "var(--risk-medium)"} trend={data.accuracy >= 90 ? "up" : "neutral"} />
        <KpiCard label="Avg Handling Time" value={data.aht} sub="Target: < 25m" color="var(--text-main)" trend="up" />
        <KpiCard label="SLA Compliance" value={`${data.sla}%`} sub="Cases within SLA" color={data.sla >= 95 ? "var(--risk-low)" : "var(--risk-medium)"} trend={data.sla >= 95 ? "up" : "down"} />
      </div>

      {/* ── Decision Breakdown + Donut ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-lg)" }}>

        {/* Decision count cards */}
        <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
            <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Decision Breakdown</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)" }}>
            {[
              { label: "Approved", count: data.approved, icon: "✓", color: "var(--risk-low)" },
              { label: "Declined", count: data.declined, icon: "✕", color: "var(--risk-critical)" },
              { label: "Blocked", count: data.blocked, icon: "🔒", color: "#F43F5E" },
              { label: "Escalated", count: data.escalated, icon: "⬆", color: "var(--risk-medium)" },
            ].map(({ label, count, icon, color }) => (
              <div key={label} style={{ padding: "var(--space-md)", background: "var(--bg-color)", borderRadius: "var(--radius-md)", border: `1px solid ${color}30`, textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, fontFamily: "monospace", color }}>{count}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-disabled)", marginTop: 2 }}>
                  {Math.round((count / data.reviewed) * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pie Chart */}
        <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "var(--space-md)" }}>Decision Ratio</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={DECISION_BREAKDOWN} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value">
                {DECISION_BREAKDOWN.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {DECISION_BREAKDOWN.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Accuracy + Throughput Chart ───────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
          <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Accuracy & Throughput Trend (8 Weeks)</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={ACCURACY_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="week" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
            <Line type="monotone" dataKey="accuracy" stroke="var(--reviewer-accent)" strokeWidth={2} dot={{ fill: "var(--reviewer-accent)", r: 4 }} name="Accuracy %" />
            <Line type="monotone" dataKey="throughput" stroke="var(--risk-low)" strokeWidth={2} dot={{ fill: "var(--risk-low)", r: 4 }} strokeDasharray="5 5" name="Cases Reviewed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── AHT Trend ────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Avg Handling Time — This Week (minutes)</span>
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(16,185,129,0.12)", color: "var(--risk-low)", fontSize: "0.78rem", fontWeight: 700 }}>
            Target: &lt; 25m ✓
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={AHT_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="day" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} domain={[0, 30]} />
            <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v) => [`${Number(v) || 0}m`, "Avg Handling Time"]} />
            {/* Target reference line at 25 */}
            <Bar dataKey="aht" fill="var(--reviewer-accent)" radius={[4, 4, 0, 0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: "var(--space-sm)", display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span style={{ display: "inline-block", width: 24, height: 2, background: "var(--risk-medium)", borderTop: "1px dashed var(--risk-medium)" }} />
          25m SLA target line
        </div>
      </div>

      {/* ── Team Leaderboard ──────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "var(--space-md) var(--space-lg)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Team Leaderboard — This Month</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
              {["Rank", "Analyst", "Reviewed", "Accuracy", "Avg Handling Time"].map(h => (
                <th key={h} style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 600, textAlign: "left", fontSize: "0.78rem", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEADERBOARD.map((l, i) => (
              <tr key={l.rank}
                style={{
                  borderBottom: i === LEADERBOARD.length - 1 ? "none" : "1px solid var(--border-color)",
                  background: l.isMe ? "var(--reviewer-accent-subtle)" : "transparent",
                  transition: "background 0.15s"
                }}
                onMouseEnter={e => { if (!l.isMe) (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = l.isMe ? "var(--reviewer-accent-subtle)" : "transparent"; }}
              >
                <td style={{ padding: "12px 16px", fontSize: "1.1rem" }}>{l.badge || `#${l.rank}`}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontWeight: l.isMe ? 800 : 600, color: l.isMe ? "var(--reviewer-accent)" : "var(--text-main)" }}>
                    {l.name} {l.isMe && <span style={{ fontSize: "0.72rem", padding: "2px 6px", background: "var(--reviewer-accent-light)", borderRadius: 4, color: "var(--reviewer-accent)", marginLeft: 4 }}>YOU</span>}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 700 }}>{l.reviewed}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: l.accuracy >= 92 ? "var(--risk-low)" : l.accuracy >= 88 ? "var(--risk-medium)" : "var(--text-main)" }}>
                    {l.accuracy}%
                  </span>
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "var(--text-muted)" }}>{l.aht}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
