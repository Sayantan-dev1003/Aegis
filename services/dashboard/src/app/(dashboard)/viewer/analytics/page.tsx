"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../../../lib/api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";

// Icons
const FilterIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const FileTextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const SpinnerIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ animation: "spin 1s linear infinite" }}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </svg>
);

// New icons for Queue SLA Compliance Card
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);

const TableIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

const BarChartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" x2="12" y1="20" y2="10" />
    <line x1="18" x2="18" y1="20" y2="4" />
    <line x1="6" x2="6" y1="20" y2="16" />
  </svg>
);

const DatabaseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
    <path d="M3 12A9 3 0 0 0 21 12" />
  </svg>
);

// 8 standard Aegis operational review queues from DB schema
const DEFAULT_DB_QUEUES = [
  { id: "1", name: "ML Borderline Review", sla_target_minutes: 60, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "2", name: "AML / Structuring Investigations", sla_target_minutes: 1440, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "3", name: "KYC & Onboarding Escalations", sla_target_minutes: 120, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "4", name: "Account Takeover (ATO) Suspects", sla_target_minutes: 30, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "5", name: "High Value Transactions", sla_target_minutes: 15, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "6", name: "Chargeback & Dispute Review", sla_target_minutes: 240, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "7", name: "VIP / White-Glove Support", sla_target_minutes: 10, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
  { id: "8", name: "Default Fallback Queue", sla_target_minutes: 60, total_cases: 0, cases_breached: 0, breach_rate: 0, status: "active" },
];

const formatQueueShortName = (name: string) => {
  const map: Record<string, string> = {
    "ML Borderline Review": "ML Borderline",
    "AML / Structuring Investigations": "AML / Struct.",
    "KYC & Onboarding Escalations": "KYC / Onboard",
    "Account Takeover (ATO) Suspects": "ATO Suspects",
    "High Value Transactions": "High Value",
    "Chargeback & Dispute Review": "Chargeback",
    "VIP / White-Glove Support": "VIP Support",
    "Default Fallback Queue": "Fallback",
  };
  return map[name] || (name.length > 14 ? name.substring(0, 13) + "…" : name);
};

const formatSlaWindow = (minutes: number) => {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)}d`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
};

const CustomSLATooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const isZeroCases = data.totalCases === 0;

  return (
    <div
      style={{
        background: "rgba(10, 14, 20, 0.95)",
        border: "1px solid rgba(139, 92, 246, 0.4)",
        borderRadius: "10px",
        padding: "12px 14px",
        color: "#E8EDF4",
        fontSize: "0.78rem",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
        minWidth: "220px",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#E8EDF4", marginBottom: "4px" }}>
        {data.name}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#8D9AAB", marginBottom: "8px" }}>
        SLA Target Window: <strong style={{ color: "#8B5CF6" }}>{data.slaLabel}</strong>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#8D9AAB" }}>Total Queue Cases:</span>
          <strong style={{ color: isZeroCases ? "#64748B" : "#E8EDF4" }}>
            {data.totalCases} {isZeroCases ? "(0 pending)" : "txns"}
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#8D9AAB" }}>SLA Breached Cases:</span>
          <strong style={{ color: data.breachedCases > 0 ? "#F43F5E" : "#10B981" }}>
            {data.breachedCases} cases
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#8D9AAB" }}>Target SLA Baseline:</span>
          <strong style={{ color: "rgba(139, 92, 246, 0.9)" }}>{data.targetSla}%</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#8D9AAB" }}>Actual SLA Adherence:</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <strong style={{ color: data.actualSla >= data.targetSla ? "#10B981" : "#F43F5E" }}>
              {data.actualSla}%
            </strong>
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: "4px",
                background: data.actualSla >= data.targetSla ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                color: data.actualSla >= data.targetSla ? "#10B981" : "#F43F5E",
              }}
            >
              {data.actualSla >= data.targetSla ? "PASSED" : "BREACHED"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default function ViewerAnalyticsPage() {
  const [timeRange, setTimeRange] = useState("30d");
  const [loading, setLoading] = useState(false);

  // Dynamic state for DB queues
  const [queues, setQueues] = useState<any[]>(DEFAULT_DB_QUEUES);
  const [queuesLoading, setQueuesLoading] = useState<boolean>(false);
  const [queueViewMode, setQueueViewMode] = useState<"chart" | "table">("chart");

  const loadQueues = async () => {
    setQueuesLoading(true);
    try {
      const data = await fetchApi("http://localhost:8080/admin/queues", { cache: "no-store" });
      if (Array.isArray(data) && data.length > 0) {
        setQueues(data);
      } else {
        setQueues(DEFAULT_DB_QUEUES);
      }
    } catch (e) {
      console.error("Failed to load queues from DB:", e);
      setQueues(DEFAULT_DB_QUEUES);
    } finally {
      setQueuesLoading(false);
    }
  };

  // Dynamic state for Analyst Case Outcome Distribution from DB
  const [decisionDistribution, setDecisionDistribution] = useState<any[]>([
    { name: "Approved (Legitimate)", value: 68.4, count: 18420, color: "#10B981" },
    { name: "Declined (Confirmed Fraud)", value: 21.2, count: 5710, color: "#F43F5E" },
    { name: "Auto-Blocked by Velocity", value: 7.8, count: 2100, color: "#8B5CF6" },
    { name: "Escalated to AML/PEP", value: 2.6, count: 700, color: "#F59E0B" },
  ]);
  const [totalOutcomes, setTotalOutcomes] = useState<number>(26930);
  const [outcomesLoading, setOutcomesLoading] = useState<boolean>(false);
  const [outcomesLive, setOutcomesLive] = useState<boolean>(false);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const loadOutcomes = async () => {
    setOutcomesLoading(true);
    try {
      const data = await fetchApi(`http://localhost:8080/api/v1/stats/outcomes?timeFrame=${timeRange}`, { cache: "no-store" });
      if (data && Array.isArray(data.data) && data.data.length === 4) {
        setDecisionDistribution(data.data);
        setTotalOutcomes(data.total || 0);
        setOutcomesLive(true);
      }
    } catch (e) {
      console.error("Failed to load dynamic outcome distribution:", e);
      setOutcomesLive(false);
    } finally {
      setOutcomesLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
    loadOutcomes();
  }, [timeRange]);

  // SLA Compliance Data dynamically computed from DB queues (All 8 Queues)
  const slaComplianceData = (queues.length > 0 ? queues : DEFAULT_DB_QUEUES).map((q) => {
    const totalCases = q.total_cases || 0;
    const breachedCases = q.cases_breached || 0;
    const breachRate = q.breach_rate || 0.0;

    // When totalCases === 0, adherence is 100% (0 SLA breaches out of 0 cases in DB)
    const actualSla = totalCases > 0 ? Number((100 - breachRate).toFixed(1)) : 100.0;
    const targetSla = q.name?.includes("VIP") || q.name?.includes("High Value") ? 99.0 : 98.0;

    return {
      id: q.id,
      name: q.name,
      shortName: formatQueueShortName(q.name || "Queue"),
      slaMinutes: q.sla_target_minutes || 60,
      slaLabel: formatSlaWindow(q.sla_target_minutes || 60),
      targetSla,
      actualSla,
      breachedCases,
      totalCases,
      status: q.status || "active",
      description: q.description || "",
    };
  });

  const totalQueueCases = slaComplianceData.reduce((acc, curr) => acc + (curr.totalCases || 0), 0);
  const totalBreached = slaComplianceData.reduce((acc, curr) => acc + (curr.breachedCases || 0), 0);
  const overallAdherence = totalQueueCases > 0
    ? Number(((100 - (totalBreached / totalQueueCases) * 100)).toFixed(1))
    : 100.0;

  // Decision distribution donut chart (Dynamic DB with baseline fallback for empty state)
  const isZeroOutcomes = totalOutcomes === 0;
  const donutData = isZeroOutcomes
    ? [
        { name: "Approved (Legitimate)", value: 25, count: 0, color: "#10B981" },
        { name: "Declined (Confirmed Fraud)", value: 25, count: 0, color: "#F43F5E" },
        { name: "Auto-Blocked by Velocity", value: 25, count: 0, color: "#8B5CF6" },
        { name: "Escalated to AML/PEP", value: 25, count: 0, color: "#F59E0B" },
      ]
    : decisionDistribution;

  // Standardized compliance report templates (3 Dynamic PDF Regulatory Reports)
  const reportTemplates = [
    {
      title: "Monthly Fraud Loss & Prevention Report",
      description: "Aggregated financial breakdown of auto-blocked fraud, reviewer declines, and net chargeback exposure.",
      schedule: "Monthly (1st of month)",
      format: "PDF",
      lastGenerated: "2026-07-01",
    },
    {
      title: "Queue SLA Breach Audit",
      description: "Detailed compliance log of all transactions exceeding the 30-minute and 2-hour manual review SLAs.",
      schedule: "Weekly (Monday 06:00 UTC)",
      format: "PDF",
      lastGenerated: "2026-07-20",
    },
    {
      title: "Model & Rule Overlap Analysis",
      description: "Comparative matrix of cases caught by XGBoost ML vs. deterministic velocity rules.",
      schedule: "On-Demand",
      format: "PDF",
      lastGenerated: "2026-07-25",
    },
  ];

  const handleDownloadReport = async (reportName: string) => {
    try {
      setDownloadingReport(reportName);
      const res = await fetch(`http://localhost:8080/reports/export?report=${encodeURIComponent(reportName)}&timeFrame=${timeRange}`);
      if (!res.ok) {
        throw new Error("Failed to generate PDF report from server");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = `${reportName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export error:", err);
      alert(`Failed to generate ${reportName} PDF. Please check backend connection.`);
    } finally {
      setDownloadingReport(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Standardized Compliance Report Library (Open Layout without Box Container) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#E8EDF4" }}>
              Standardized Compliance & Audit Report Library
            </div>
            <div style={{ fontSize: "0.78rem", color: "#8D9AAB", marginTop: "4px" }}>
              One-click export of pre-configured auditor reports • PII export is restricted by policy
            </div>
          </div>

          {/* Global Time Horizon Filter (In place of PII Export Protected capsule) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                color: "#8D9AAB",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Time Horizon
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
                minWidth: "160px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>

        {/* 3 Export Cards Grid (Directly open on the page, no box container) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "18px" }}>
          {reportTemplates.map((rep) => (
            <div
              key={rep.title}
              style={{
                background: "rgba(13, 17, 23, 0.75)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "16px",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      color: "#8B5CF6",
                      background: "rgba(139, 92, 246, 0.12)",
                      padding: "8px",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FileTextIcon />
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#E8EDF4" }}>{rep.title}</div>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#8D9AAB", lineHeight: 1.5 }}>{rep.description}</div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  paddingTop: "14px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.68rem", color: "#64748B", textTransform: "uppercase", fontWeight: 600 }}>Schedule</div>
                  <div style={{ fontSize: "0.78rem", color: "#E8EDF4", fontWeight: 700 }}>{rep.schedule}</div>
                </div>
                <button
                  onClick={() => handleDownloadReport(rep.title)}
                  disabled={downloadingReport === rep.title}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(139, 92, 246, 0.4)",
                    background: downloadingReport === rep.title ? "rgba(139, 92, 246, 0.3)" : "rgba(139, 92, 246, 0.15)",
                    color: "#E8EDF4",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: downloadingReport === rep.title ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {downloadingReport === rep.title ? (
                    <>
                      <SpinnerIcon />
                      exporting....
                    </>
                  ) : (
                    <>
                      <DownloadIcon />
                      Export {rep.format}
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Chart Columns: SLA Adherence vs Decision Split (70:30 Ratio) */}
      <div style={{ display: "grid", gridTemplateColumns: "70fr 30fr", gap: "20px" }}>
        {/* Queue SLA Compliance Chart (Dynamic 8 Operational DB Queues) */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(139, 92, 246, 0.22)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#E8EDF4" }}>
                  Queue SLA Compliance & Breach Analysis
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#10B981",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: "20px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981", boxShadow: "0 0 8px #10B981" }} />
                  8 Active Queue
                </span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "#8D9AAB", marginTop: "3px" }}>
                Target vs. Actual SLA adherence percentage across all 8 operational review queues
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "rgba(13, 17, 23, 0.8)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  padding: "2px",
                }}
              >
                <button
                  onClick={() => setQueueViewMode("chart")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: queueViewMode === "chart" ? "rgba(139, 92, 246, 0.25)" : "transparent",
                    color: queueViewMode === "chart" ? "#E8EDF4" : "#8D9AAB",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <BarChartIcon />
                  Chart
                </button>
                <button
                  onClick={() => setQueueViewMode("table")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: queueViewMode === "table" ? "rgba(139, 92, 246, 0.25)" : "transparent",
                    color: queueViewMode === "table" ? "#E8EDF4" : "#8D9AAB",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <TableIcon />
                  Table
                </button>
              </div>

              <button
                onClick={() => {
                  loadQueues();
                  loadOutcomes();
                }}
                disabled={queuesLoading || outcomesLoading}
                title="Refresh queue and outcome data from DB"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(13, 17, 23, 0.8)",
                  color: "#8D9AAB",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <RefreshIcon />
              </button>
            </div>
          </div>

          {/* Chart vs Table View */}
          {queueViewMode === "chart" ? (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slaComplianceData} margin={{ top: 15, right: 10, left: -20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="actualSlaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#6D28D9" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="targetSlaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(139, 92, 246, 0.35)" stopOpacity={1} />
                      <stop offset="100%" stopColor="rgba(139, 92, 246, 0.1)" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="shortName"
                    stroke="#8D9AAB"
                    fontSize={11}
                    interval={0}
                    angle={-90}
                    textAnchor="end"
                    dy={5}
                    height={90}
                  />
                  <YAxis stroke="#8D9AAB" fontSize={11} domain={[90, 100]} />
                  <Tooltip content={<CustomSLATooltip />} />
                  <Legend wrapperStyle={{ fontSize: "0.78rem", color: "#8D9AAB", paddingTop: "14px" }} />
                  <Bar dataKey="targetSla" name="Target SLA (%)" fill="url(#targetSlaGrad)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualSla" name="Actual SLA (%)" fill="url(#actualSlaGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", maxHeight: 300 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#8D9AAB", textAlign: "left" }}>
                    <th style={{ padding: "10px 14px", fontWeight: 600 }}>Queue Name (DB)</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600 }}>SLA Window</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Total Cases</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Breached Cases</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Adherence Rate</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slaComplianceData.map((q, idx) => (
                    <tr
                      key={q.id || idx}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        color: "#E8EDF4",
                        background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{q.name}</td>
                      <td style={{ padding: "10px 14px", color: "#8B5CF6", fontFamily: "monospace" }}>{q.slaLabel}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace" }}>{q.totalCases}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", color: q.breachedCases > 0 ? "#F43F5E" : "#10B981" }}>
                        {q.breachedCases}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                          <span style={{ fontWeight: 700, color: q.actualSla >= q.targetSla ? "#10B981" : "#F43F5E" }}>
                            {q.actualSla}%
                          </span>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: q.actualSla >= q.targetSla ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                              color: q.actualSla >= q.targetSla ? "#10B981" : "#F43F5E",
                            }}
                          >
                            {q.actualSla >= q.targetSla ? "PASSED" : "BREACHED"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "12px",
                            background: "rgba(16, 185, 129, 0.12)",
                            color: "#10B981",
                          }}
                        >
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Dynamic Summary Metrics Footer - Sleek Glassmorphism Stat Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "12px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: "16px",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "10px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#8D9AAB" }}>Total Cases in Queue</span>
              <strong style={{ fontSize: "0.85rem", color: "#E8EDF4", fontFamily: "monospace" }}>
                {totalQueueCases} txns
              </strong>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "10px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#8D9AAB" }}>Total Breached Cases</span>
              <strong
                style={{
                  fontSize: "0.85rem",
                  color: totalBreached > 0 ? "#F43F5E" : "#10B981",
                  fontFamily: "monospace",
                }}
              >
                {totalBreached} cases
              </strong>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(139, 92, 246, 0.2)",
                borderRadius: "10px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#8D9AAB" }}>Overall SLA Adherence</span>
              <strong
                style={{
                  fontSize: "0.88rem",
                  color: overallAdherence >= 98 ? "#10B981" : "#F59E0B",
                  fontFamily: "monospace",
                }}
              >
                {overallAdherence}%
              </strong>
            </div>
          </div>
        </div>

        {/* Decision Outcomes Donut Chart */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8EDF4" }}>
              Analyst Case Outcome Distribution
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
                Proportion of decisions across all manual review queues
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", justifyContent: "flex-end" }}>
                {outcomesLive && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#10B981",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "20px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#10B981", boxShadow: "0 0 8px #10B981" }} />
                    LIVE DB • {totalOutcomes.toLocaleString()} DECISIONS
                  </span>
                )}
                <button
                  onClick={() => { loadOutcomes(); }}
                  disabled={outcomesLoading}
                  title="Refresh analyst outcomes from DB"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(13, 17, 23, 0.8)",
                    color: "#8D9AAB",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <RefreshIcon />
                </button>
              </div>
            </div>
          </div>

          <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0A0E14",
                    border: "1px solid #232C3A",
                    borderRadius: "8px",
                    color: "#E8EDF4",
                    fontSize: "0.78rem",
                  }}
                  formatter={(val: any, name: any, props: any) => [
                    `${val}% (${props.payload.count.toLocaleString()} txns)`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
            {decisionDistribution.map((item) => (
              <div key={item.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.78rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", color: "#E8EDF4" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: item.color }} />
                  {item.name}
                </span>
                <span style={{ fontFamily: "monospace", color: "#8D9AAB" }}>
                  {item.value}% ({item.count.toLocaleString()})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
