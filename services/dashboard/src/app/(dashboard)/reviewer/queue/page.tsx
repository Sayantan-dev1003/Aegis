"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../contexts/AuthContext";
import { RadialRiskGauge } from "@/components/RadialRiskGauge";
import { EmptyState } from "@/components/EmptyState";
import {
  Layers,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Search,
  RefreshCw,
  UserCheck,
} from "lucide-react";

// ─── Filter Sub-Components (Admin Image 3 Style - No Box Container) ───────────
const FilterLabel = ({ label }: { label: string }) => (
  <span
    style={{
      fontSize: "0.7rem",
      color: "#94A3B8",
      fontWeight: 500,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      marginBottom: "2px",
    }}
  >
    {label}
  </span>
);

const FilterGroup = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
    <FilterLabel label={label} />
    {children}
  </div>
);

// ─── KpiCard Component (Admin Image 1 Glass Aesthetic) ────────────────────────
const KpiCard = ({
  icon,
  label,
  value,
  sub,
  accent,
  glow,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  glow: string;
}) => (
  <div
    style={{
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "14px",
      padding: "18px 20px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    }}
  >
    <div
      style={{
        width: "44px",
        height: "44px",
        borderRadius: "11px",
        flexShrink: 0,
        background: `${accent}18`,
        border: `1px solid ${accent}35`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: accent,
      }}
    >
      {icon}
    </div>
    <div>
      <div
        style={{
          fontSize: "0.72rem",
          color: "#8D9AAB",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "3px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#E8EDF4", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "0.72rem", color: "#64748B", marginTop: "4px", fontWeight: 500 }}>
          {sub}
        </div>
      )}
    </div>
    <div
      style={{
        position: "absolute",
        top: "-20px",
        right: "-20px",
        width: "90px",
        height: "90px",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }}
    />
  </div>
);

// ─── Main Reviewer Queue Page ─────────────────────────────────────────────────
export default function ReviewerQueuePage() {
  const router = useRouter();
  const { user, token } = useAuth();

  // Dynamic real-time data state from APIs (No static/dummy data)
  const [analystProfile, setAnalystProfile] = useState<any>(null);
  const [queues, setQueues] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  // Separate filter states (Above table, no box container)
  const [dateFilter, setDateFilter] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [amountRangeFilter, setAmountRangeFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Claimed state in-memory during session
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  // Determine reviewer's assigned queue
  const myQueueId = analystProfile?.queue_id || (user as any)?.queue_id;
  const myQueueName =
    analystProfile?.queue_name || (user as any)?.queue_name || "High Value Transactions";

  const assignedQueueObj = useMemo(
    () =>
      queues.find(
        (q) => q.id === myQueueId || q.name === myQueueName
      ) || { name: myQueueName, sla_target_minutes: 60 },
    [queues, myQueueId, myQueueName]
  );

  const myQueueSla = assignedQueueObj.sla_target_minutes || 60;

  // ─── Fetch real-time dynamic data from APIs ──────────────────────────────────
  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        // 1. Fetch current analyst profile to know assigned queue
        try {
          const resMe = await fetch("http://localhost:8080/api/v1/analysts/me", { headers });
          if (resMe.ok) {
            const meData = await resMe.json();
            setAnalystProfile(meData);
          }
        } catch {
          // Fallback silently
        }

        // 2. Fetch all queues
        try {
          const resQ = await fetch("http://localhost:8080/api/v1/queues", { headers });
          if (resQ.ok) {
            const qData = await resQ.json();
            setQueues(Array.isArray(qData) ? qData : []);
          }
        } catch {
          // Continue if queue fetch fails
        }

        // 3. Fetch real live transactions (for this queue including escalated and SLA breached cases)
        try {
          let url = "http://localhost:8080/api/v1/transactions?limit=200";
          if (myQueueId) {
            url += `&queue_id=${encodeURIComponent(myQueueId)}`;
          }
          const resTx = await fetch(url, {
            headers,
          });
          if (resTx.ok) {
            const txData = await resTx.json();
            const rawList: any[] = Array.isArray(txData)
              ? txData
              : Array.isArray(txData?.data)
              ? txData.data
              : [];
            setTransactions(rawList);
          }
        } catch {
          setTransactions([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, myQueueId]
  );

  useEffect(() => {
    loadData();
    // Live polling interval every 20 seconds for real-time dynamic updates
    const timer = setInterval(() => loadData(true), 20000);
    return () => clearInterval(timer);
  }, [loadData]);

  // SLA ticker for dynamic countdown
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // ─── Helper: Determine if a transaction belongs to this Reviewer's queue ───
  const isAssignedToMe = useCallback(
    (t: any) => {
      const validStatuses = ["escalated", "breached", "pending", "scored", "auto_blocked", "reviewed"];
      if (!t.status || !validStatuses.includes(t.status.toLowerCase())) {
        return false;
      }
      if (myQueueId && (t.queue_id === myQueueId || t.original_queue_id === myQueueId)) return true;
      if (myQueueName && (t.queue_name === myQueueName || t.original_queue_name === myQueueName)) return true;
      if (
        (!t.queue_id || t.queue_id === "") &&
        (!t.queue_name || t.queue_name === "")
      ) {
        return true;
      }
      return false;
    },
    [myQueueId, myQueueName]
  );

  // ─── Helpers for SLA & Flag Reasons ─────────────────────────────────────────
  const getSlaRemaining = useCallback(
    (t: any) => {
      if (t.status === "breached") return 0;
      const slaTarget = t.queue_id ? queues.find((q: any) => q.id === t.queue_id)?.sla_target_minutes || myQueueSla : myQueueSla;
      const start = new Date(
        t.sla_start_at || t.created_at || t.timestamp || Date.now()
      ).getTime();
      const elapsedMinutes = Math.floor((Date.now() - start) / 60000);
      return Math.max(-99, slaTarget - elapsedMinutes);
    },
    [myQueueSla, queues, tick]
  );

  const formatTimestamp = (dateVal: any) => {
    const d = new Date(dateVal || Date.now());
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const hh = String(hours).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${sec} ${ampm}`;
  };

  const getFlagReason = useCallback((t: any) => {
    const score = t.fraud_score || 0;
    if (score >= 0.85) return `Critical ML Score (${Math.round(score * 100)}%)`;
    if (score >= 0.70) return `High Fraud Risk (${Math.round(score * 100)}%)`;
    if (score >= 0.45) return `ML Borderline Anomaly (${Math.round(score * 100)}%)`;
    if ((t.amount || 0) >= 50000)
      return `High Value (₹${Number(t.amount || 0).toLocaleString()})`;
    if (t.channel === "atm" || t.channel === "mobile_wallet")
      return `Suspicious ${t.channel.toUpperCase()} Activity`;
    return `Rule Triggered Anomaly`;
  }, []);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "scored":
        return { color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" };
      case "auto_blocked":
        return { color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" };
      case "breached":
        return { color: "#ef4444", bg: "rgba(239, 68, 68, 0.18)" };
      case "escalated":
        return { color: "#facc15", bg: "rgba(250, 204, 21, 0.15)" };
      case "pending":
        return { color: "#a78bfa", bg: "rgba(167, 139, 250, 0.15)" };
      case "reviewed":
        return { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)" };
      default:
        return { color: "#94a3b8", bg: "rgba(148, 163, 184, 0.15)" };
    }
  };

  // ─── Reviewer Queue Cases (Strictly their own queue only) ───────────────────
  const myQueueCases = useMemo(() => {
    return transactions.filter((t) => isAssignedToMe(t));
  }, [transactions, isAssignedToMe]);

  // ─── Filtered Cases for Table (00:00 to 23:59 of selected date & filters) ───
  const filteredTransactions = useMemo(() => {
    return myQueueCases.filter((t) => {
      // Date filter: compare transaction YYYY-MM-DD
      if (dateFilter) {
        const txDate = new Date(t.timestamp || t.ingested_at || t.created_at || Date.now());
        const txIsoDateStr = txDate.toISOString().split("T")[0];
        const localYear = txDate.getFullYear();
        const localMonth = String(txDate.getMonth() + 1).padStart(2, "0");
        const localDay = String(txDate.getDate()).padStart(2, "0");
        const txLocalDateStr = `${localYear}-${localMonth}-${localDay}`;
        if (txIsoDateStr !== dateFilter && txLocalDateStr !== dateFilter) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all") {
        if (t.status !== statusFilter) return false;
      }

      // Amount range filter
      const amt = Number(t.amount || 0);
      if (amountRangeFilter === "<1000" && amt >= 1000) return false;
      if (amountRangeFilter === "1000 to 5000" && (amt < 1000 || amt > 5000)) return false;
      if (amountRangeFilter === "5000 to 50000" && (amt < 5000 || amt > 50000)) return false;
      if (amountRangeFilter === "50000 to 1L" && (amt < 50000 || amt > 100000)) return false;
      if (amountRangeFilter === "> 1L" && amt <= 100000) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = t.id?.toLowerCase().includes(q);
        const matchAcc = t.account_id?.toLowerCase().includes(q);
        const matchMerch = t.merchant_name?.toLowerCase().includes(q);
        if (!matchId && !matchAcc && !matchMerch) return false;
      }

      return true;
    });
  }, [
    myQueueCases,
    dateFilter,
    statusFilter,
    amountRangeFilter,
    searchQuery,
  ]);

  // ─── KPI Metrics Calculation (Dynamic from logged in reviewer's queue) ──────
  const queueDepthCount = useMemo(() => myQueueCases.length, [myQueueCases]);

  const myOpenCount = useMemo(
    () => myQueueCases.filter((t) => !t.review_decision).length,
    [myQueueCases]
  );

  const slaAtRiskCount = useMemo(
    () =>
      myQueueCases.filter((t) => {
        if (t.review_decision) return false;
        const rem = getSlaRemaining(t);
        return rem <= 15;
      }).length,
    [myQueueCases, getSlaRemaining]
  );

  const claimSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(`http://localhost:8080/api/v1/transactions/${id}/claim`, {
        method: "POST",
        headers,
      });
    } catch {
      // fallback
    }
    setClaimedIds((prev) => new Set([...prev, id]));
    loadData(true);
  };

  const rejectSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(`http://localhost:8080/api/v1/transactions/${id}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: "Rejected by reviewer" }),
      });
    } catch {
      // fallback
    }
    loadData(true);
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const selectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#E8EDF4",
    fontSize: "0.84rem",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "32px" }}>
      
      {/* ── 1. Top Capsule Header (ONLY capsule tag + Refresh button) ──────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <span
            style={{
              padding: "8px 20px",
              borderRadius: "24px",
              backgroundColor: "rgba(6, 182, 212, 0.14)",
              border: "1px solid rgba(6, 182, 212, 0.4)",
              color: "#06B6D4",
              fontSize: "0.88rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 15px rgba(6, 182, 212, 0.15)",
            }}
          >
            <UserCheck size={17} /> Assigned: {myQueueName}
          </span>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 16px",
              borderRadius: "10px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#E8EDF4",
              fontSize: "0.84rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh Queue"}
          </button>
        </div>
      </div>

      {/* ── 2. KPI Metrics Cards (Admin Image 1 Glass Aesthetic) ─────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
      >
        <KpiCard
          icon={<Layers size={22} />}
          label="My Queue Depth"
          value={loading ? "..." : queueDepthCount}
          sub={`Total cases in ${myQueueName}`}
          accent="#38BDF8"
          glow="rgba(56, 189, 248, 0.16)"
        />
        <KpiCard
          icon={<ShieldAlert size={22} />}
          label="My Open Cases"
          value={loading ? "..." : myOpenCount}
          sub="Awaiting investigation & decision"
          accent="#F59E0B"
          glow="rgba(245, 158, 11, 0.16)"
        />
        <KpiCard
          icon={<AlertTriangle size={22} />}
          label="SLA At Risk"
          value={loading ? "..." : slaAtRiskCount}
          sub={
            slaAtRiskCount > 0
              ? `⚠️ ${slaAtRiskCount} cases < 15m remaining`
              : "All cases within safe SLA window"
          }
          accent={slaAtRiskCount > 0 ? "#EF4444" : "#10B981"}
          glow={
            slaAtRiskCount > 0
              ? "rgba(239, 68, 68, 0.2)"
              : "rgba(16, 185, 129, 0.15)"
          }
        />
        <KpiCard
          icon={<Clock size={22} />}
          label="Queue SLA Target"
          value={`${myQueueSla}m`}
          sub={`Target resolution for ${myQueueName}`}
          accent="#10B981"
          glow="rgba(16, 185, 129, 0.15)"
        />
      </div>

      {/* ── 3. Separate Filters ABOVE Table (No Box Container - Image 3 Style) ─ */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <FilterGroup label="Date">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ ...selectStyle, colorScheme: "dark" }}
            />
          </FilterGroup>

          <FilterGroup label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>All Statuses</option>
              <option value="escalated" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Escalated</option>
              <option value="breached" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Breached</option>
              <option value="reviewed" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Reviewed</option>
              <option value="pending" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Pending</option>
              <option value="scored" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Scored</option>
              <option value="auto_blocked" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Auto Blocked</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Amount Range">
            <select
              value={amountRangeFilter}
              onChange={(e) => setAmountRangeFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>Any Amount</option>
              <option value="<1000" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>&lt; ₹1,000</option>
              <option value="1000 to 5000" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>₹1,000 to ₹5,000</option>
              <option value="5000 to 50000" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>₹5,000 to ₹50,000</option>
              <option value="50000 to 1L" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>₹50,000 to ₹1L</option>
              <option value="> 1L" style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>&gt; ₹1L</option>
            </select>
          </FilterGroup>
        </div>

        {/* Second Row of Filters: Full-width Search Input & Action Controls */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            width: "100%",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flex: "1 1 320px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748B",
                }}
              />
              <input
                type="text"
                placeholder="Enter Transaction ID, Account ID or Merchant Name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  ...selectStyle,
                  width: "100%",
                  padding: "10px 14px 10px 38px",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {(dateFilter !== "" ||
              statusFilter !== "all" ||
              amountRangeFilter !== "" ||
              searchQuery !== "") && (
              <button
                onClick={() => {
                  setDateFilter("");
                  setStatusFilter("all");
                  setAmountRangeFilter("");
                  setSearchQuery("");
                }}
                style={{
                  ...selectStyle,
                  padding: "9px 14px",
                  color: "#f87171",
                  borderColor: "rgba(248,113,113,0.3)",
                  background: "rgba(248,113,113,0.05)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontSize: "0.85rem",
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: "0.85rem", color: "#94A3B8" }}>
              Showing {filteredTransactions.length} results
            </span>
            <button
              title="Refresh Data"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#E8EDF4",
                padding: "8px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onClick={() => loadData(true)}
            >
              <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Table UI Container (Admin Image 3 Dark Theme Table Style) ───── */}
      <div
        style={{
          backgroundColor: "#121822",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Real-Time Cases Table (Dark Theme, No Checkboxes/Shortcuts) ───── */}
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                }}
              >
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  TX ID
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Timestamp
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Account
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    textAlign: "right",
                  }}
                >
                  Amount
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Flag Reason
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  SLA Timer
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "14px 16px",
                    color: "#94A3B8",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    textAlign: "right",
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "60px",
                      textAlign: "center",
                      color: "#94A3B8",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <RefreshCw size={26} className="animate-spin text-slate-400" />
                      <span>Loading assigned real-time case queue...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "60px", textAlign: "center" }}>
                    <EmptyState
                      icon="🛡️"
                      title="No cases match selected filters"
                      description="All clear! Try clearing the date or search filter to inspect other cases."
                    />
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t, idx) => {
                  const isLast = idx === filteredTransactions.length - 1;
                  const isClaimedByMe =
                    claimedIds.has(t.id) ||
                    t.assignee === "You" ||
                    t.assignee === user?.full_name;
                  const score = t.fraud_score || 0;
                  const scoreVal = Math.round(score * 100);
                  const slaRem = getSlaRemaining(t);
                  const isSlaBreached = slaRem <= 0;
                  const isSlaWarning = slaRem <= 15 && !isSlaBreached;

                  // Dynamic Queue Label
                  const displayQueue =
                    t.queue_name ||
                    (t.queue_id ? queues.find((q: any) => q.id === t.queue_id)?.name : null) ||
                    (t.queue_id === myQueueId ? myQueueName : "Unassigned Queue");

                  const statusStyle = getStatusStyle(t.status || "scored");

                  return (
                    <tr
                      key={t.id}
                      onClick={() => {
                        router.push(`/reviewer/investigate?id=${t.id}`);
                      }}
                      style={{
                        borderBottom: isLast
                          ? "none"
                          : "1px solid rgba(255, 255, 255, 0.06)",
                        backgroundColor: isSlaBreached
                          ? "rgba(239, 68, 68, 0.04)"
                          : "transparent",
                        transition: "background-color 0.15s",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "rgba(255, 255, 255, 0.03)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isSlaBreached
                          ? "rgba(239, 68, 68, 0.04)"
                          : "transparent";
                      }}
                    >
                      {/* TX ID Badge (Admin ledger copy pill style) */}
                      <td style={{ padding: "16px" }}>
                        <span
                          title="Copy Transaction ID"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard?.writeText(t.id);
                          }}
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.78rem",
                            color: "#94a3b8",
                            backgroundColor: "rgba(148, 163, 184, 0.08)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid rgba(148, 163, 184, 0.15)",
                            cursor: "copy",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                        >
                          {t.id.substring(0, 8)}…
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td
                        style={{
                          padding: "16px",
                          color: "#94A3B8",
                          fontSize: "0.82rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatTimestamp(
                          t.timestamp || t.ingested_at || t.created_at || Date.now()
                        )}
                      </td>

                      {/* Customer Account ID */}
                      <td style={{ padding: "16px", fontWeight: 500, color: "#E2E8F0" }}>
                        {t.account_id || "ACCT-UNKNOWN"}
                      </td>

                      {/* Amount */}
                      <td
                        style={{
                          padding: "16px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          color: "#F8FAFC",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.currency === "INR" || !t.currency ? "₹" : t.currency}{" "}
                        {Number(t.amount || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      {/* Computed Readable Flag Reason Pill + Risk Score + Source Badge */}
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                backgroundColor:
                                  score >= 0.85
                                    ? "rgba(239, 68, 68, 0.12)"
                                    : score >= 0.7
                                    ? "rgba(249, 115, 22, 0.12)"
                                    : "rgba(255, 255, 255, 0.05)",
                                color:
                                  score >= 0.85
                                    ? "#EF4444"
                                    : score >= 0.7
                                    ? "#F97316"
                                    : "#CBD5E1",
                                border:
                                  score >= 0.85
                                    ? "1px solid rgba(239, 68, 68, 0.3)"
                                    : score >= 0.7
                                    ? "1px solid rgba(249, 115, 22, 0.3)"
                                    : "1px solid rgba(255, 255, 255, 0.12)",
                                fontSize: "0.76rem",
                                fontWeight: 600,
                                display: "inline-block",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {getFlagReason(t)}
                            </span>
                            {/* Risk Source Badge */}
                            {t.risk_source && (
                              <span
                                title={`Risk Source: ${t.risk_source}`}
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  backgroundColor:
                                    t.risk_source === "hybrid"
                                      ? "rgba(139, 92, 246, 0.15)"
                                      : t.risk_source === "ml"
                                      ? "rgba(6, 182, 212, 0.15)"
                                      : "rgba(245, 158, 11, 0.15)",
                                  color:
                                    t.risk_source === "hybrid"
                                      ? "#A78BFA"
                                      : t.risk_source === "ml"
                                      ? "#22D3EE"
                                      : "#FBBF24",
                                  border:
                                    t.risk_source === "hybrid"
                                      ? "1px solid rgba(139, 92, 246, 0.3)"
                                      : t.risk_source === "ml"
                                      ? "1px solid rgba(6, 182, 212, 0.3)"
                                      : "1px solid rgba(245, 158, 11, 0.3)",
                                }}
                              >
                                {t.risk_source === "hybrid" ? "⚡ Hybrid" : t.risk_source === "ml" ? "🤖 ML" : "📋 Rule"}
                              </span>
                            )}
                          </div>
                          {/* Risk Score Progress Bar */}
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "80px", height: "4px", borderRadius: "2px", backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, Math.max(0, score * 100))}%`,
                                height: "100%",
                                backgroundColor: score >= 0.95 ? "#EF4444" : score >= 0.85 ? "#F97316" : score >= 0.45 ? "#FACC15" : "#10B981",
                                transition: "width 0.3s ease"
                              }} />
                            </div>
                            <span style={{ fontSize: "0.72rem", color: "#94A3B8", fontFamily: "monospace", fontWeight: 600 }}>
                              {(score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* SLA Live Countdown Timer */}
                      <td style={{ padding: "16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            color: t.sla_paused_at
                              ? "#60A5FA"
                              : isSlaBreached
                              ? "#EF4444"
                              : isSlaWarning
                              ? "#F59E0B"
                              : "#10B981",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            fontFamily: "monospace",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Clock size={14} />
                          {t.sla_paused_at ? "⏸ PAUSED" : isSlaBreached ? "⚠ BREACHED" : `${slaRem}m LEFT`}
                          {isSlaWarning && !t.sla_paused_at && (
                            <span style={{
                              fontSize: "0.68rem",
                              backgroundColor: "rgba(245, 158, 11, 0.15)",
                              color: "#F59E0B",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              fontWeight: 700,
                              textTransform: "uppercase"
                            }}>
                              VIP SLA (≤15m)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Pill & Distinct Risk Band Badge */}
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              textTransform: "capitalize",
                              whiteSpace: "nowrap",
                              backgroundColor: statusStyle.bg,
                              color: statusStyle.color,
                              width: "fit-content",
                            }}
                          >
                            {(t.status || "scored").replace("_", " ")}
                          </span>
                          {t.status === "auto_blocked" || score >= 0.95 ? (
                            <span
                              title="Hard auto-block threshold reached (score ≥ 0.95)"
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                backgroundColor: "rgba(239, 68, 68, 0.2)",
                                color: "#F87171",
                                border: "1px solid rgba(239, 68, 68, 0.4)",
                                width: "fit-content",
                              }}
                            >
                              🔴 Critical (ML Block)
                            </span>
                          ) : score >= 0.85 ? (
                            <span
                              title="High risk band — requires human review (score 0.85–0.94)"
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                backgroundColor: "rgba(249, 115, 22, 0.15)",
                                color: "#FB923C",
                                border: "1px solid rgba(249, 115, 22, 0.3)",
                                width: "fit-content",
                              }}
                            >
                              🟠 High Risk (Human Review)
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Action Column */}
                      <td
                        style={{ padding: "16px", textAlign: "right" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isClaimedByMe && !t.review_decision ? (
                          <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                            <button
                              onClick={(e) => claimSingle(t.id, e)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(16, 185, 129, 0.15)",
                                color: "#10B981",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                fontWeight: 600,
                                fontSize: "0.78rem",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Claim
                            </button>
                            {t.reject_count && t.reject_count >= 2 ? (
                              <span
                                title="Reject cap reached (≥ 2 rejects) — requires Admin Escalation"
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                                  color: "#F87171",
                                  border: "1px solid rgba(239, 68, 68, 0.35)",
                                  fontWeight: 600,
                                  fontSize: "0.72rem",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                🚫 Reject Cap (Admin)
                              </span>
                            ) : (
                              <button
                                onClick={(e) => rejectSingle(t.id, e)}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "8px",
                                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                                  color: "#EF4444",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  fontWeight: 600,
                                  fontSize: "0.78rem",
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", gap: "8px" }}>
                            <button
                              onClick={() => router.push(`/reviewer/investigate?id=${t.id}`)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(56, 189, 248, 0.15)",
                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                color: "#38BDF8",
                                fontWeight: 600,
                                fontSize: "0.78rem",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Investigate
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
