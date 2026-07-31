"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../../../lib/api";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Icons
const ShieldIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const TrendingUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ActivityIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// Radial Risk Gauge (0-100)
const RadialRiskGauge = ({ score, size = 52 }: { score: number; size?: number }) => {
  const radius = size * 0.38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score > 75 ? "#F43F5E" : score > 40 ? "#F59E0B" : "#10B981";

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="5"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="5"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "absolute", fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace", color: "#E8EDF4" }}>
        {score}
      </div>
    </div>
  );
};

// KPI Card Component
const ExecutiveKpiCard = ({
  icon,
  label,
  value,
  subtext,
  change,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  change?: { value: string; positive: boolean };
  accent: string;
}) => (
  <div
    style={{
      background: "linear-gradient(135deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)",
      border: "1px solid rgba(139, 92, 246, 0.22)",
      borderRadius: "16px",
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.5)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: `${accent}18`,
          border: `1px solid ${accent}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accent,
        }}
      >
        {icon}
      </div>
      {change && (
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: "12px",
            background: change.positive ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
            color: change.positive ? "#10B981" : "#F43F5E",
            border: `1px solid ${change.positive ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
          }}
        >
          {change.positive ? "▲ " : "▼ "}
          {change.value}
        </span>
      )}
    </div>
    <div>
      <div style={{ fontSize: "0.74rem", color: "#8D9AAB", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#E8EDF4", fontFamily: "monospace", lineHeight: 1.1 }}>
        {value}
      </div>
      {subtext && <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "6px" }}>{subtext}</div>}
    </div>
    <div
      style={{
        position: "absolute",
        top: "-25px",
        right: "-25px",
        width: "90px",
        height: "90px",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}15 0%, transparent 70%)`,
        pointerEvents: "none",
      }}
    />
  </div>
);

export default function ViewerOverviewPage() {
  const [timeHorizon, setTimeHorizon] = useState("12h");
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendsData, setTrendsData] = useState<any[]>([]);
  const [merchantRiskData, setMerchantRiskData] = useState<any[]>([]);
  const [merchantSortBy, setMerchantSortBy] = useState<"fraud_rate" | "amount_saved">("fraud_rate");
  const [merchantPage, setMerchantPage] = useState(1);
  const [channelData, setChannelData] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [summaryRes, velocityRes, merchantRes, channelRes] = await Promise.all([
          fetchApi(`http://localhost:8080/api/v1/stats/executive?time_frame=${timeHorizon}`),
          fetchApi(`http://localhost:8080/api/v1/stats/verdict-velocity?time_frame=${timeHorizon}`),
          fetchApi(`http://localhost:8080/api/v1/stats/merchant-risk?time_frame=${timeHorizon}`),
          fetchApi(`http://localhost:8080/api/v1/stats/channel-performance?time_frame=${timeHorizon}`),
        ]);
        if (!mounted) return;

        setSummaryData(summaryRes || {});

        const rawVelocity = Array.isArray(velocityRes) ? velocityRes : (velocityRes?.data || []);
        setTrendsData(rawVelocity);

        const rawMerchant = Array.isArray(merchantRes) ? merchantRes : (merchantRes?.data || []);
        setMerchantRiskData(rawMerchant);

        const rawChannel = Array.isArray(channelRes) ? channelRes : (channelRes?.data || []);
        setChannelData(rawChannel);
      } catch (err) {
        console.error("Failed to fetch overview data:", err);
        setSummaryData({});
        setTrendsData([]);
        setMerchantRiskData([]);
        setChannelData([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDashboard();
    const timer = setInterval(loadDashboard, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [timeHorizon]);

  const totalTxns = summaryData?.total_monitored_txns ?? 0;
  const fraudTxnsCount = summaryData?.fraud_txns_count ?? 0;
  const autoBlockedCount = summaryData?.auto_blocked_count ?? 0;
  const confirmedFraudCount = summaryData?.confirmed_fraud_count ?? 0;
  const legitCount = summaryData?.legit_count ?? 0;
  const fraudRateVal = Number(summaryData?.overall_fraud_rate ?? 0).toFixed(2);
  const slaAdherenceVal = Number(summaryData?.queue_sla_adherence ?? 0).toFixed(1);
  const totalFraudPrevented = summaryData?.total_fraud_prevented ?? 0;
  const formattedPrevented = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(totalFraudPrevented);

  const handleExportBriefing = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Metric,Value,TimeHorizon\n" +
      "Total Fraud Prevented," + formattedPrevented.replace(/,/g, "") + "," + timeHorizon + "\n" +
      "Overall Fraud Rate," + fraudRateVal + "%," + timeHorizon + "\n" +
      "Queue SLA Adherence," + slaAdherenceVal + "%," + timeHorizon + "\n" +
      "Total Monitored Txns," + totalTxns + "," + timeHorizon + "\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aegis_executive_briefing_${timeHorizon}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortedMerchantRisk = [...merchantRiskData].sort((a: any, b: any) => {
    const fraudRateA = Number(a.fraud_rate || 0);
    const fraudRateB = Number(b.fraud_rate || 0);
    const savedA = Number(a.saved_inr || 0);
    const savedB = Number(b.saved_inr || 0);
    if (merchantSortBy === "fraud_rate") {
      return fraudRateB - fraudRateA || savedB - savedA;
    }
    return savedB - savedA || fraudRateB - fraudRateA;
  });

  const itemsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(sortedMerchantRisk.length / itemsPerPage));
  const safePage = Math.min(merchantPage, totalPages);
  const paginatedMerchantRisk = sortedMerchantRisk.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Executive Action Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 22px",
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(13, 17, 23, 0.6) 100%)",
          border: "1px solid rgba(139, 92, 246, 0.25)",
          borderRadius: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "rgba(139, 92, 246, 0.2)",
              color: "#8B5CF6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(139, 92, 246, 0.4)",
            }}
          >
            <ShieldIcon />
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#E8EDF4" }}>
              Executive Compliance & Oversight Surface
            </div>
            <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
              Real-time read-only briefing • All system configuration and rule mutations are locked.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Time Horizon Selector */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "3px",
            }}
          >
            {["12h", "24h", "7d", "30d", "90d"].map((window) => (
              <button
                key={window}
                onClick={() => setTimeHorizon(window)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: timeHorizon === window ? "#8B5CF6" : "transparent",
                  color: timeHorizon === window ? "#fff" : "#8D9AAB",
                  transition: "all 0.2s ease",
                }}
              >
                {window.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportBriefing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "7px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              background: "rgba(139, 92, 246, 0.15)",
              color: "#E8EDF4",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <DownloadIcon />
            Export PDF / CSV Briefing
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "18px",
        }}
      >
        <ExecutiveKpiCard
          icon={<ShieldIcon />}
          label="Total Fraud Prevented"
          value={formattedPrevented}
          subtext={`${autoBlockedCount.toLocaleString("en-IN")} blocked & ${confirmedFraudCount.toLocaleString("en-IN")} confirmed cases`}
          accent="#8B5CF6"
        />
        <ExecutiveKpiCard
          icon={<TrendingUpIcon />}
          label="Overall Fraud Rate"
          value={`${fraudRateVal}%`}
          subtext={`${fraudTxnsCount.toLocaleString("en-IN")} fraud & ${legitCount.toLocaleString("en-IN")} legit cases`}
          accent="#10B981"
        />
        <ExecutiveKpiCard
          icon={<ClockIcon />}
          label="Queue SLA Adherence"
          value={`${slaAdherenceVal}%`}
          subtext="Average across active reviewer queues"
          accent="#3B82F6"
        />
        <ExecutiveKpiCard
          icon={<ActivityIcon />}
          label="Total Monitored Txns"
          value={totalTxns.toLocaleString("en-IN")}
          subtext="Throughput across all channels"
          accent="#EC4899"
        />
      </div>

      {/* Charts Section: Trend + Typologies */}
      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "20px" }}>
        {/* Fraud Velocity Trend Area Chart */}
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
                Transaction Verdict Velocity ({timeHorizon.toUpperCase()})
              </div>
              <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
                Approved vs. Flagged for Review vs. Auto-Blocked Fraud
              </div>
            </div>
            <div style={{ display: "flex", gap: "16px", fontSize: "0.75rem" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10B981" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10B981" }} /> Approved
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#F59E0B" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F59E0B" }} /> Flagged
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#F43F5E" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F43F5E" }} /> Blocked
              </span>
            </div>
          </div>

          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendsData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <defs>
                  <linearGradient id="colorApprove" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorFlag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBlock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="time"
                  stroke="#8D9AAB"
                  fontSize={10}
                  tickLine={false}
                  interval={0}
                  angle={-90}
                  textAnchor="end"
                  dx={-4}
                  dy={4}
                  height={60}
                />
                <YAxis stroke="#8D9AAB" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#0A0E14",
                    border: "1px solid #232C3A",
                    borderRadius: "8px",
                    color: "#E8EDF4",
                    fontSize: "0.78rem",
                  }}
                />
                <Area type="monotone" dataKey="approved" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorApprove)" />
                <Area type="monotone" dataKey="flagged" stroke="#F59E0B" strokeWidth={2} fillOpacity={1} fill="url(#colorFlag)" />
                <Area type="monotone" dataKey="blocked" stroke="#F43F5E" strokeWidth={2} fillOpacity={1} fill="url(#colorBlock)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Fraud Typologies Card */}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8EDF4" }}>
                Merchant Category Risk Spectrum ({timeHorizon.toUpperCase()})
              </div>
              <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
                Volume & fraud triggers by business category
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "3px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => { setMerchantSortBy("fraud_rate"); setMerchantPage(1); }}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  background: merchantSortBy === "fraud_rate" ? "#8B5CF6" : "transparent",
                  color: merchantSortBy === "fraud_rate" ? "#FFFFFF" : "#8D9AAB",
                  transition: "all 0.2s ease",
                }}
              >
                Fraud Rate (%)
              </button>
              <button
                onClick={() => { setMerchantSortBy("amount_saved"); setMerchantPage(1); }}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  background: merchantSortBy === "amount_saved" ? "#8B5CF6" : "transparent",
                  color: merchantSortBy === "amount_saved" ? "#FFFFFF" : "#8D9AAB",
                  transition: "all 0.2s ease",
                }}
              >
                Amount Saved
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px", minHeight: "210px" }}>
            {paginatedMerchantRisk.map((item: any, idx: number) => {
              const colors = ["#8B5CF6", "#EC4899", "#F59E0B", "#3B82F6", "#10B981", "#6366F1"];
              const barColor = colors[idx % colors.length];
              const formatSavedINR = new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              }).format(item.saved_inr || 0);
              const fraudRateVal = Number(item.fraud_rate || 0);

              return (
                <div key={item.category || idx} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", flexWrap: "wrap", gap: "4px" }}>
                    <span style={{ color: "#E8EDF4", fontWeight: 600, textTransform: "capitalize" }}>
                      {item.category}
                    </span>
                    <span style={{ color: "#8D9AAB", fontFamily: "monospace" }}>
                      {item.txn_count} cases ({fraudRateVal.toFixed(2)}% fraud) • {formatSavedINR} saved
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: "10px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(8, fraudRateVal))}%`,
                        height: "100%",
                        background: barColor,
                        borderRadius: "10px",
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "auto",
                paddingTop: "12px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <button
                disabled={safePage <= 1}
                onClick={() => setMerchantPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: safePage <= 1 ? "rgba(255,255,255,0.25)" : "#E8EDF4",
                  cursor: safePage <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Prev
              </button>
              <div style={{ display: "flex", gap: "4px" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => setMerchantPage(pageNum)}
                    style={{
                      width: "26px",
                      height: "26px",
                      fontSize: "0.75rem",
                      fontWeight: safePage === pageNum ? 700 : 500,
                      borderRadius: "6px",
                      border: "none",
                      background: safePage === pageNum ? "#8B5CF6" : "rgba(255,255,255,0.04)",
                      color: safePage === pageNum ? "#FFFFFF" : "#8D9AAB",
                      cursor: "pointer",
                    }}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>
              <button
                disabled={safePage >= totalPages}
                onClick={() => setMerchantPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: safePage >= totalPages ? "rgba(255,255,255,0.25)" : "#E8EDF4",
                  cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Channel Risk Breakdown Table */}
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
            Payment Channel & Portfolio Performance
          </div>
          <div style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>
            Summary of throughput, fraud prevention, and operational status across channels
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#8D9AAB", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>Payment Channel</th>
              <th style={{ padding: "10px 14px" }}>Monitored Volume</th>
              <th style={{ padding: "10px 14px" }}>Fraud Rate</th>
              <th style={{ padding: "10px 14px" }}>Est. Loss Prevented</th>
              <th style={{ padding: "10px 14px" }}>System SLA Health</th>
              <th style={{ padding: "10px 14px" }}>Risk Index</th>
            </tr>
          </thead>
          <tbody>
            {channelData.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "28px 14px", textAlign: "center", color: "#4B5563", fontSize: "0.82rem" }}>
                  {loading ? "Loading channel data…" : "No channel data available for the selected window."}
                </td>
              </tr>
            ) : (
              channelData.map((row: any, idx: number) => {
                const slaColor =
                  row.sla_health === "Critical"
                    ? { bg: "rgba(244, 63, 94, 0.15)", text: "#F43F5E", border: "rgba(244, 63, 94, 0.3)" }
                    : row.sla_health === "Elevated"
                    ? { bg: "rgba(245, 158, 11, 0.15)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.3)" }
                    : { bg: "rgba(16, 185, 129, 0.15)", text: "#10B981", border: "rgba(16, 185, 129, 0.3)" };

                const fraudRateNum = Number(row.fraud_rate ?? 0);
                const fraudRateColor =
                  fraudRateNum >= 3.0 ? "#F43F5E" : fraudRateNum >= 1.5 ? "#F59E0B" : "#10B981";

                const formattedPreventedINR = new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(row.prevented_inr ?? 0);

                return (
                  <tr
                    key={row.raw_channel ?? idx}
                    style={{
                      borderBottom: idx < channelData.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      color: "#E8EDF4",
                    }}
                  >
                    <td style={{ padding: "14px", fontWeight: 600 }}>{row.channel}</td>
                    <td style={{ padding: "14px", fontFamily: "monospace" }}>
                      {(row.volume ?? 0).toLocaleString("en-IN")} txns
                    </td>
                    <td style={{ padding: "14px", fontFamily: "monospace", color: fraudRateColor }}>
                      {fraudRateNum.toFixed(2)}%
                    </td>
                    <td style={{ padding: "14px", fontFamily: "monospace", fontWeight: 700, color: "#8B5CF6" }}>
                      {formattedPreventedINR}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background: slaColor.bg,
                          color: slaColor.text,
                          border: `1px solid ${slaColor.border}`,
                        }}
                      >
                        {row.sla_health}
                      </span>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <RadialRiskGauge score={row.risk_index ?? 0} size={42} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
