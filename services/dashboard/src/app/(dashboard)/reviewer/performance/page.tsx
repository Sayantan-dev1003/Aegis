"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { CheckCircle2, XCircle, ShieldOff, ArrowUpCircle, ListChecks, Gauge, Timer, ShieldCheck } from "lucide-react";
import { fetchApi } from "@/app/lib/api";

// ─── Interfaces ───────────────────────────────────────────────────────────

interface SummaryData {
  period: string;
  cases_reviewed: number;
  throughput_per_day: number;
  avg_handling_time_minutes: number;
  sla_compliance_pct: number;
  decision_breakdown: {
    approved: number;
    declined: number;
    escalated: number;
  };
}

interface TrendData {
  metric: string;
  range: string;
  sla_target_minutes?: number;
  buckets: { label: string; value: number }[];
}

interface LeaderboardData {
  period: string;
  sort: string;
  rows: {
    reviewer_id: string;
    name: string;
    queue: string;
    cases_reviewed: number;
    sla_compliance_pct: number;
    avg_handling_time_minutes: number;
    escalation_rate_pct: number;
  }[];
}

// ─── Sub-Components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, trend, Icon }: { label: string; value: string | number; sub?: string; color?: string; trend?: "up" | "down" | "neutral", Icon?: React.ElementType }) {
  const trendColor = trend === "up" ? "var(--risk-low)" : trend === "down" ? "var(--risk-critical)" : "var(--text-muted)";
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "";
  return (
    <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -20, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${color || "var(--reviewer-accent-glow)"} 0%, transparent 70%)`, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</div>
        {Icon && <Icon size={18} color={color || "var(--text-muted)"} />}
      </div>
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
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  
  const [throughputRange, setThroughputRange] = useState<"week" | "month" | "year">("month");
  const [throughputTrend, setThroughputTrend] = useState<TrendData | null>(null);
  
  const [ahtRange, setAhtRange] = useState<"week" | "month" | "year">("week");
  const [ahtTrend, setAhtTrend] = useState<TrendData | null>(null);

  const [leaderboardPeriod, setLeaderboardPeriod] = useState<"today" | "week" | "month">("month");
  const [leaderboardSort, setLeaderboardSort] = useState<"sla" | "escalation">("sla");
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);

  // Fetch Summary
  useEffect(() => {
    fetchApi(`/reviewer/performance/summary?period=${period}`)
      .then(setSummary)
      .catch(console.error);
  }, [period]);

  // Fetch Throughput Trend
  useEffect(() => {
    fetchApi(`/reviewer/performance/trend?metric=throughput&range=${throughputRange}`)
      .then(setThroughputTrend)
      .catch(console.error);
  }, [throughputRange]);

  // Fetch AHT Trend
  useEffect(() => {
    fetchApi(`/reviewer/performance/trend?metric=aht&range=${ahtRange}`)
      .then(setAhtTrend)
      .catch(console.error);
  }, [ahtRange]);

  // Fetch Leaderboard
  useEffect(() => {
    fetchApi(`/reviewer/performance/leaderboard?period=${leaderboardPeriod}&sort=${leaderboardSort}`)
      .then(setLeaderboard)
      .catch(console.error);
  }, [leaderboardPeriod, leaderboardSort]);

  if (!summary) return <div>Loading...</div>;

  const DECISION_BREAKDOWN = [
    { name: "Approved", value: summary.decision_breakdown.approved, color: "var(--risk-low)", icon: CheckCircle2 },
    { name: "Declined", value: summary.decision_breakdown.declined, color: "var(--risk-critical)", icon: XCircle },
    { name: "Escalated", value: summary.decision_breakdown.escalated, color: "var(--risk-medium)", icon: ArrowUpCircle },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>

      {/* ── KPI Row + Decision Ratio (Section 1 + 2) ───────────────────────── */}
      <div>
        <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
          {(["today", "week", "month"] as const).map(p => (
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
              {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)" }}>
          <KpiCard label="Cases Reviewed" value={summary.cases_reviewed} sub="Total cases reviewed" color="var(--reviewer-accent)" trend="up" Icon={ListChecks} />
          <KpiCard label="Throughput" value={`${summary.throughput_per_day.toFixed(1)} / day`} sub="Cases per active day" color="var(--risk-low)" trend="up" Icon={Gauge} />
          <KpiCard label="Avg Handling Time" value={`${summary.avg_handling_time_minutes.toFixed(1)}m`} sub="Time from claim to review" color="var(--text-main)" trend="up" Icon={Timer} />
          <KpiCard label="SLA Compliance %" value={`${summary.sla_compliance_pct.toFixed(1)}%`} sub="Cases within SLA" color={summary.sla_compliance_pct >= 95 ? "var(--risk-low)" : "var(--risk-medium)"} trend={summary.sla_compliance_pct >= 95 ? "up" : "down"} Icon={ShieldCheck} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-lg)", marginTop: "var(--space-lg)" }}>
          <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
              <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
              <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Decision Breakdown</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-md)" }}>
              {DECISION_BREAKDOWN.map(({ name, value, icon: Icon, color }) => (
                <div key={name} style={{ padding: "var(--space-md)", background: "var(--bg-color)", borderRadius: "var(--radius-md)", border: `1px solid ${color}30`, textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Icon size={24} color={color} /></div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 900, fontFamily: "monospace", color }}>{value}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-disabled)", marginTop: 2 }}>
                    {summary.cases_reviewed > 0 ? Math.round((value / summary.cases_reviewed) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>

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
      </div>

      {/* ── Throughput Trend (Section 3) ───────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Throughput Trend</span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            {(["week", "month", "year"] as const).map(p => (
              <button key={p}
                onClick={() => setThroughputRange(p)}
                style={{
                  padding: "5px 12px", borderRadius: 12,
                  border: throughputRange === p ? "1px solid var(--reviewer-border)" : "1px solid var(--border-color)",
                  background: throughputRange === p ? "var(--reviewer-accent-light)" : "transparent",
                  color: throughputRange === p ? "var(--reviewer-accent)" : "var(--text-muted)",
                  fontWeight: throughputRange === p ? 700 : 500, fontSize: "0.75rem", cursor: "pointer", transition: "all 0.2s",
                  textTransform: "capitalize"
                }}>
                This {p}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={throughputTrend?.buckets || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v) => [Number(v) || 0, "Cases Reviewed"]} />
            <Bar dataKey="value" fill="var(--risk-low)" radius={[4, 4, 0, 0]} opacity={0.85} name="Cases Reviewed" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── AHT Trend (Section 4) ────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Avg Handling Time Trend (minutes)</span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
            {ahtTrend?.sla_target_minutes !== undefined && ahtTrend.sla_target_minutes > 0 && (
              <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(16,185,129,0.12)", color: "var(--risk-low)", fontSize: "0.78rem", fontWeight: 700, marginRight: 8 }}>
                Target: &lt; {ahtTrend.sla_target_minutes}m
              </span>
            )}
            {(["week", "month", "year"] as const).map(p => (
              <button key={p}
                onClick={() => setAhtRange(p)}
                style={{
                  padding: "5px 12px", borderRadius: 12,
                  border: ahtRange === p ? "1px solid var(--reviewer-border)" : "1px solid var(--border-color)",
                  background: ahtRange === p ? "var(--reviewer-accent-light)" : "transparent",
                  color: ahtRange === p ? "var(--reviewer-accent)" : "var(--text-muted)",
                  fontWeight: ahtRange === p ? 700 : 500, fontSize: "0.75rem", cursor: "pointer", transition: "all 0.2s",
                  textTransform: "capitalize"
                }}>
                This {p}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ahtTrend?.buckets || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v) => [`${Number(v)?.toFixed(1) || 0}m`, "Avg Handling Time"]} />
            {ahtTrend?.sla_target_minutes && (
              <Line type="step" dataKey={() => ahtTrend.sla_target_minutes} stroke="var(--risk-medium)" strokeWidth={2} strokeDasharray="5 5" name="SLA Target" />
            )}
            <Bar dataKey="value" fill="var(--reviewer-accent)" radius={[4, 4, 0, 0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
        {ahtTrend?.sla_target_minutes && (
          <div style={{ marginTop: "var(--space-sm)", display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span style={{ display: "inline-block", width: 24, height: 2, background: "var(--risk-medium)", borderTop: "1px dashed var(--risk-medium)" }} />
            {ahtTrend.sla_target_minutes}m SLA target line
          </div>
        )}
      </div>

      {/* ── Team Leaderboard (Section 5) ──────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "var(--space-md) var(--space-lg)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Team Leaderboard</span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "var(--space-sm)", borderRight: "1px solid var(--border-color)", paddingRight: "var(--space-md)" }}>
              {(["today", "week", "month"] as const).map(p => (
                <button key={p}
                  onClick={() => setLeaderboardPeriod(p)}
                  style={{
                    padding: "3px 8px", borderRadius: 12,
                    background: leaderboardPeriod === p ? "var(--reviewer-accent-light)" : "transparent",
                    color: leaderboardPeriod === p ? "var(--reviewer-accent)" : "var(--text-muted)",
                    fontWeight: leaderboardPeriod === p ? 700 : 500, fontSize: "0.75rem", cursor: "pointer", transition: "all 0.2s",
                    border: "none", textTransform: "capitalize"
                  }}>
                  {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>
            <select
              value={leaderboardSort}
              onChange={(e) => setLeaderboardSort(e.target.value as "sla" | "escalation")}
              style={{
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
                color: "var(--text-main)",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: "0.8rem",
                cursor: "pointer"
              }}
            >
              <option value="sla">Sort: SLA Compliance</option>
              <option value="escalation">Sort: Escalation Rate</option>
            </select>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-color)" }}>
              {["Rank", "Analyst", "Queue", "Cases Reviewed", "SLA Compliance %", "Avg Handling Time", "Escalation Rate %"].map((h, i) => (
                <th key={h} style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 600, textAlign: i > 2 ? "right" : "left", fontSize: "0.78rem", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(leaderboard?.rows || []).map((l, i) => (
              <tr key={l.reviewer_id}
                style={{
                  borderBottom: i === (leaderboard?.rows.length || 0) - 1 ? "none" : "1px solid var(--border-color)",
                  transition: "background 0.15s"
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td style={{ padding: "12px 16px", fontSize: "1rem" }}>{i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
                    {l.name}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>{l.queue}</td>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 700, textAlign: "right" }}>{l.cases_reviewed}</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: l.sla_compliance_pct >= 95 ? "var(--risk-low)" : l.sla_compliance_pct >= 90 ? "var(--risk-medium)" : "var(--risk-critical)" }}>
                    {l.sla_compliance_pct.toFixed(1)}%
                  </span>
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "var(--text-muted)", textAlign: "right" }}>{l.avg_handling_time_minutes.toFixed(1)}m</td>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "var(--text-muted)", textAlign: "right" }}>{l.escalation_rate_pct.toFixed(1)}%</td>
              </tr>
            ))}
            {leaderboard?.rows?.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)" }}>No reviews found for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
