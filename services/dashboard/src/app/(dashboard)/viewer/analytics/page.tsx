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

export default function ViewerAnalyticsPage() {
  const [metric, setMetric] = useState("sla_breach_rate");
  const [dimension, setDimension] = useState("by_queue");
  const [timeRange, setTimeRange] = useState("30d");
  const [loading, setLoading] = useState(false);

  // SLA Compliance Chart Data across review queues
  const slaComplianceData = [
    { queue: "High Value Txns", targetSla: 99.0, actualSla: 99.4, breachedCases: 2, totalCases: 340 },
    { queue: "New Account Spikes", targetSla: 98.0, actualSla: 98.8, breachedCases: 5, totalCases: 418 },
    { queue: "Card Testing Review", targetSla: 97.0, actualSla: 96.5, breachedCases: 18, totalCases: 512 },
    { queue: "Crypto Cash-out", targetSla: 99.5, actualSla: 99.7, breachedCases: 1, totalCases: 290 },
    { queue: "PEP / AML Escalations", targetSla: 100.0, actualSla: 100.0, breachedCases: 0, totalCases: 84 },
  ];

  // Decision distribution donut chart
  const decisionDistribution = [
    { name: "Approved (Legitimate)", value: 68.4, count: 18420, color: "#10B981" },
    { name: "Declined (Confirmed Fraud)", value: 21.2, count: 5710, color: "#F43F5E" },
    { name: "Auto-Blocked by Velocity", value: 7.8, count: 2100, color: "#8B5CF6" },
    { name: "Escalated to AML/PEP", value: 2.6, count: 700, color: "#F59E0B" },
  ];

  // Standardized compliance report templates
  const reportTemplates = [
    {
      title: "Monthly Fraud Loss & Prevention Report",
      description: "Aggregated financial breakdown of auto-blocked fraud, reviewer declines, and net chargeback exposure.",
      schedule: "Monthly (1st of month)",
      format: "PDF + CSV",
      lastGenerated: "2026-07-01",
    },
    {
      title: "Queue SLA Breach Audit",
      description: "Detailed compliance log of all transactions exceeding the 30-minute and 2-hour manual review SLAs.",
      schedule: "Weekly (Monday 06:00 UTC)",
      format: "CSV (Auditor Format)",
      lastGenerated: "2026-07-20",
    },
    {
      title: "Analyst Decision Sampling Report",
      description: "Randomized 5% sample of approved and declined cases with reviewer notes for SOC 2 quality control.",
      schedule: "Bi-Weekly",
      format: "PDF Digest",
      lastGenerated: "2026-07-15",
    },
    {
      title: "Model & Rule Overlap Analysis",
      description: "Comparative matrix of cases caught by XGBoost ML vs. deterministic velocity rules.",
      schedule: "On-Demand",
      format: "CSV + JSON",
      lastGenerated: "2026-07-25",
    },
  ];

  const handleDownloadReport = (reportName: string) => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "ReportName,GeneratedAt,Status\n" +
      `"${reportName}",${new Date().toISOString()},READY\n` +
      "Metric,SampleValue,ComplianceStatus\n" +
      "SLA Adherence Rate,98.6%,PASSED\n" +
      "Total Fraud Blocked,$2450180,PASSED\n" +
      "PII Raw Data Export,RESTRICTED,SECURE_ANONYMIZED\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportName.toLowerCase().replace(/[^a-z0-9]/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Report Builder Toolbar */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(139, 92, 246, 0.25)",
          borderRadius: "16px",
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(139, 92, 246, 0.15)",
              color: "#8B5CF6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FilterIcon />
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#E8EDF4" }}>
              Self-Serve Compliance Analytics Builder
            </div>
            <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
              Dynamic slice-and-dice over aggregate fraud & SLA metrics without database access
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>Metric:</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
              }}
            >
              <option value="sla_breach_rate">Queue SLA Breach Rate</option>
              <option value="total_fraud_blocked">Total Fraud Blocked ($)</option>
              <option value="reviewer_throughput">Reviewer Case Throughput</option>
              <option value="false_positive_ratio">False Positive Ratio</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>Dimension:</span>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
              }}
            >
              <option value="by_queue">By Review Queue</option>
              <option value="by_rule">By Triggered Rule</option>
              <option value="by_channel">By Payment Channel</option>
              <option value="by_risk_band">By Risk Score Band</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>Horizon:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
              }}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Two Chart Columns: SLA Adherence vs Decision Split */}
      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "20px" }}>
        {/* Queue SLA Compliance Chart */}
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
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8EDF4" }}>
              Queue SLA Compliance & Breach Analysis
            </div>
            <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
              Target vs. Actual SLA adherence percentage per operational review queue
            </div>
          </div>

          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaComplianceData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="queue" stroke="#8D9AAB" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                <YAxis stroke="#8D9AAB" fontSize={11} domain={[90, 100]} />
                <Tooltip
                  contentStyle={{
                    background: "#0A0E14",
                    border: "1px solid #232C3A",
                    borderRadius: "8px",
                    color: "#E8EDF4",
                    fontSize: "0.78rem",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "0.78rem", color: "#8D9AAB" }} />
                <Bar dataKey="targetSla" name="Target SLA (%)" fill="rgba(139, 92, 246, 0.4)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actualSla" name="Actual SLA (%)" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.78rem",
              color: "#8D9AAB",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: "12px",
            }}
          >
            <span>Total SLA Breached Cases: <strong style={{ color: "#F43F5E" }}>26 cases</strong></span>
            <span>Overall SLA Adherence: <strong style={{ color: "#10B981" }}>98.9%</strong> (Above 98.0% Target)</span>
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
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8EDF4" }}>
              Analyst Case Outcome Distribution
            </div>
            <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
              Proportion of decisions across all manual review queues
            </div>
          </div>

          <div style={{ width: "100%", height: 210, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={decisionDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {decisionDistribution.map((entry, index) => (
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

      {/* Standardized Compliance Report Library */}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8EDF4" }}>
              Standardized Compliance & Audit Report Library
            </div>
            <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
              One-click export of pre-configured auditor reports • PII export is restricted by policy
            </div>
          </div>
          <span className="badge-read-only">
            <CheckCircleIcon />
            PII Export Protected
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {reportTemplates.map((rep) => (
            <div
              key={rep.title}
              style={{
                background: "rgba(13, 17, 23, 0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ color: "#8B5CF6" }}>
                    <FileTextIcon />
                  </div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#E8EDF4" }}>{rep.title}</div>
                </div>
                <div style={{ fontSize: "0.76rem", color: "#8D9AAB", lineHeight: 1.4 }}>{rep.description}</div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  paddingTop: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Schedule</div>
                  <div style={{ fontSize: "0.75rem", color: "#E8EDF4", fontWeight: 600 }}>{rep.schedule}</div>
                </div>
                <button
                  onClick={() => handleDownloadReport(rep.title)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid rgba(139, 92, 246, 0.4)",
                    background: "rgba(139, 92, 246, 0.15)",
                    color: "#E8EDF4",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <DownloadIcon />
                  Export {rep.format}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
