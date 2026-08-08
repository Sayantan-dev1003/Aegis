"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RadialRiskGauge } from "@/components/RadialRiskGauge";
import { Clock, Download, User, PauseCircle, ArrowUpCircle, AlertTriangle, ShieldCheck, Banknote, ListTodo } from "lucide-react";

// Font (Inter) and all animation keyframes/utility classes live in globals.css

// ─── Types ────────────────────────────────────────────────────────────────────
interface ShapFeature { feature: string; value: number; direction: "fraud" | "legit"; }
interface VelocityBucket { window: string; txnCount: number; amount: string; }
interface TxnHistoryItem { id: string; date: string; amount: string; merchant: string; status: "approved" | "declined" | "escalated" | "flagged"; }
interface ActivityLog { actor: string; action: string; timestamp: string; }

// ─── Mock Investigation Data (Removed) ─────────────────────────────────────────

// ─── Decision-scoped reason codes (§3.9) ─────────────────────────────────────
const REASON_CODES: Record<"approve" | "block" | "escalate", string[]> = {
  approve: [
    "Customer verified by phone",
    "Transaction pattern consistent with account history",
    "Business/merchant payment verified",
    "KYC re-confirmed, false positive on device/location signal",
  ],
  block: [
    "Confirmed account takeover",
    "Confirmed card-not-present fraud",
    "Confirmed synthetic identity",
    "Confirmed money-mule / structuring pattern",
    "Customer denied making the transaction (via support call)",
    "Transaction against unknown/unverified account",
  ],
  escalate: [
    "Requires senior analyst review",
    "Requires compliance / AML / SAR filing",
    "Ambiguous signals, insufficient evidence to decide",
    "Suspected fraud ring, needs cross-account investigation",
  ],
};



// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="invest-card" style={{ animation: "fadeSlideIn 0.4s ease both" }}>
      <div className="invest-section-header">
        <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: "1rem", lineHeight: 1 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-main)", fontFamily: "Inter, sans-serif" }}>{title}</span>
      </div>
      <div style={{ padding: "var(--space-lg)" }}>{children}</div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────
function InvestigationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const caseId = searchParams.get("id") || "3";
  const returnPage = searchParams.get("returnPage") || "1";
  const [liveTx, setLiveTx] = useState<any>(null);
  const [liveCustomer, setLiveCustomer] = useState<any>(null);
  const [liveHistory, setLiveHistory] = useState<any>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const historyLimit = 5;

  const [myQueueId, setMyQueueId] = useState("");
  const [myAnalystId, setMyAnalystId] = useState("");

  React.useEffect(() => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("aegis_token="))
      ?.split("=")[1];
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setMyAnalystId(payload.sub || "");
        
        fetch("http://localhost:8080/api/v1/analysts/me", {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.queue_id) {
              setMyQueueId(data.queue_id);
            }
          })
          .catch(() => {});
      } catch (e) {}
    }
  }, []);

  const getPageNumbers = React.useCallback((current: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  }, []);

  React.useEffect(() => {
    if (!caseId) return;
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("aegis_token="))
      ?.split("=")[1];
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`http://localhost:8080/api/v1/transactions/${caseId}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.transaction) {
          setLiveTx(d);
          const accountId = d.transaction.card_id;
          if (accountId) {
            // Fetch Customer Profile
            fetch(`http://localhost:8080/api/v1/customers/${accountId}`, { headers })
              .then((r) => (r.ok ? r.json() : null))
              .then((c) => {
                if (c) setLiveCustomer(c);
              });
          }
        }
      })
      .catch(() => {});
  }, [caseId]);

  React.useEffect(() => {
    if (!liveTx?.transaction?.card_id) return;
    const accountId = liveTx.transaction.card_id;
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("aegis_token="))
      ?.split("=")[1];
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`http://localhost:8080/api/v1/transactions?search=${accountId}&limit=100`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data?.transactions || [];
          setLiveHistory({
            transactions: list,
            total: data.total || list.length
          });
        }
      })
      .catch(() => {});
  }, [liveTx]);

  // ── Derive customer data: live API takes priority over mock ────────────────
  const customerData = React.useMemo(() => {
    if (liveCustomer) {
      // Compute account age from created_at (the only date we have)
      const createdAt = liveCustomer.created_at ? new Date(liveCustomer.created_at) : null;
      let ageStr = "Unknown";
      if (createdAt && !isNaN(createdAt.getTime())) {
        const totalDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const years = Math.floor(totalDays / 365);
        const months = Math.floor((totalDays % 365) / 30);
        ageStr = years > 0
          ? `${years} year${years !== 1 ? 's' : ''}${months > 0 ? `, ${months} month${months !== 1 ? 's' : ''}` : ''}`
          : `${months} month${months !== 1 ? 's' : ''}`;
      }
      return {
        name: liveCustomer.full_name || "—",
        accountId: liveCustomer.account_id || "—",
        email: liveCustomer.email || "—",
        accountAge: ageStr,
        kycStatus: (liveCustomer.kyc_status?.toLowerCase() || "pending") as "verified" | "pending" | "mismatch",
      };
    }
    return { name: "—", accountId: "—", email: "—", accountAge: "—", kycStatus: "pending" as any };
  }, [liveCustomer]);

  // ── Derive history data: live API takes priority over mock ──────────────────
  const historyData = React.useMemo(() => {
    if (liveHistory?.transactions && liveHistory.transactions.length > 0) {
      const startIndex = (historyPage - 1) * historyLimit;
      const paginated = liveHistory.transactions.slice(startIndex, startIndex + historyLimit);
      return paginated.map((t: any) => ({
        id: t.id,
        timestamp: new Date(t.timestamp || Date.now()).toLocaleString(),
        txnId: t.id,
        account: t.account_id || "—",
        status: (t.status === "reviewed" && t.review_decision === "escalate") ? "escalated"
          : (t.status === "scored_approved" || t.status === "approved") ? "approved"
          : t.status === "auto_blocked" ? "declined"
          : t.status === "reviewed" ? "reviewed"
          : "flagged",
        score: t.risk_score != null ? `${Math.round(t.risk_score * 100)}%` : "—",
        flagReason: t.risk_band || "—",
        amount: (t.currency === "INR" ? "₹" : (t.currency || "₹")) +
          Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        riskSource: t.risk_source || "—",
        merchant: t.merchant_name || "Merchant",
        channel: t.channel || "—",
        location: `${t.country_code || "—"} / ${t.ip_address || "—"}`,
        rejects: t.reject_count != null ? t.reject_count.toString() : "0",
      }));
    }
    return [];
  }, [liveHistory, historyPage]);

  const caseData = React.useMemo(() => {
    if (!liveTx) return null;
    return {
      txnId: liveTx.transaction.id,
      amount:
        (liveTx.transaction.currency === "INR" ? "₹" : liveTx.transaction.currency || "₹") +
        Number(liveTx.transaction.amount).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      currency: liveTx.transaction.currency || "INR",
      merchant: liveTx.transaction.merchant_name || "Merchant",
      merchantCategory: liveTx.transaction.merchant_category || "Retail",
      transactionType: liveTx.transaction.transaction_type || "Purchase",
      channel: liveTx.transaction.channel || "Online",
      queueId: liveTx.transaction.queue_id || "",
      timestamp: new Date(
        liveTx.transaction.timestamp || liveTx.transaction.created_at || Date.now()
      ).toLocaleString(),
      riskScore: Math.round((liveTx.fraud_result?.fraud_score || 0.88) * 100),
      confidence: Math.round((liveTx.fraud_result?.fraud_score || 0.88) * 100),
      flagReason: liveTx.fraud_result?.model_version || "Suspicious Activity",
      status: liveTx.transaction.status,
      queue: liveTx.transaction.queue_name || "",
      priorityLevel: liveTx.transaction.priority_level || "normal",
      riskBand: liveTx.transaction.risk_band || "low",
      customer: customerData,
      history: historyData,
      device: {
        id: liveTx.transaction.device_id || "Unknown",
        ip: liveTx.transaction.ip_address || "Unknown",
        country: liveTx.transaction.country_code || "Unknown",
        isNew: false
      }
    };
  }, [liveTx, customerData, historyData]);

  // ── Decision Panel state ──────────────────────────────────────────────────
  const [decision, setDecision] = useState<"approve" | "block" | "escalate" | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeVelocity, setActiveVelocity] = useState<"card" | "device" | "ip">("ip");

  const [queues, setQueues] = useState<any[]>([]);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [targetQueueId, setTargetQueueId] = useState("");
  const [targetAnalystId, setTargetAnalystId] = useState("");

  React.useEffect(() => {
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("aegis_token="))
      ?.split("=")[1];
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`http://localhost:8080/api/v1/queues`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setQueues(data);
      })
      .catch(() => {});

    fetch(`http://localhost:8080/api/v1/analysts`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data)) {
          // Exclude current analyst (will need token decoding or just use full list for now)
          setAnalysts(data);
        }
      })
      .catch(() => {});
  }, []);

  // Reset reason code when decision changes
  React.useEffect(() => { setReasonCode(""); }, [decision]);

  // ── Fix P0: correct decision value mapping (§3.9) ─────────────────────────
  const handleSubmit = async () => {
    if (!decision || !reasonCode || !notes.trim()) return;
    setSubmitError(null);

    const backendDecision =
      decision === "approve" ? "legitimate" :
      decision === "block"   ? "confirmed_fraud" :
                               "escalate";

    const payload: any = { decision: backendDecision, reason_code: reasonCode, notes };
    if (decision === "escalate") {
      if (targetQueueId) payload.target_queue_id = targetQueueId;
      if (targetAnalystId) payload.target_analyst_id = targetAnalystId;
    }

    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("aegis_token="))
        ?.split("=")[1];
      const res = await fetch(`http://localhost:8080/api/v1/transactions/${caseId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Submission failed — please retry.");
      return;
    }

    setSubmitted(true);
    setTimeout(() => router.push(`/reviewer/queue?page=${returnPage}`), 1500);
  };

  const canSubmit = !!decision && !!reasonCode && notes.trim().length > 0;
  // kycColor moved to after early return

  // ── Decision button config — top row only (Approve + Block); Escalate is
  //    rendered full-width below with its own grid span, so only 2 entries here.
  const decisionButtons = [
    { key: "approve" as const, label: "✓ Approve", activeColor: "var(--risk-low)",     activeBg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)" },
    { key: "block"   as const, label: "🔒 Block",   activeColor: "var(--risk-critical)", activeBg: "rgba(244,63,94,0.15)",  border: "rgba(244,63,94,0.4)"  },
  ];

  const submitBtnStyle: React.CSSProperties = {
    padding: "13px",
    background: canSubmit
      ? "linear-gradient(135deg, var(--reviewer-accent) 0%, #0891B2 100%)"
      : "var(--border-color)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: canSubmit ? "#07090E" : "var(--text-disabled)",
    fontWeight: 800,
    fontSize: "0.95rem",
    cursor: canSubmit ? "pointer" : "not-allowed",
    transition: "all 0.2s",
    letterSpacing: "0.02em",
    fontFamily: "Inter, sans-serif",
    boxShadow: canSubmit ? "0 4px 16px rgba(6,182,212,0.3)" : "none",
  };

  if (!caseData) {
    return <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>Loading investigation details...</div>;
  }

  const kycColor = caseData.customer.kycStatus === "verified" ? "var(--risk-low)"
    : caseData.customer.kycStatus === "pending" ? "var(--risk-medium)"
    : "var(--risk-critical)";

  return (
    // Inter font and all animation/class styles are in globals.css
    <div style={{ fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

      {/* ── Back button ─────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => router.back()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)", padding: "7px 14px",
            color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 600,
            cursor: "pointer", transition: "all 0.18s", fontFamily: "Inter, sans-serif",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--reviewer-accent)"; (e.currentTarget as HTMLElement).style.color = "var(--reviewer-accent)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-color)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          id="back-btn"
        >
          ← Back
        </button>
      </div>

      {/* ── Case Header ─────────────────────────────────────────────────────── */}
      <div
        className="invest-card"
        style={{
          background: "linear-gradient(135deg, #0D1117 0%, #0f1923 100%)",
          borderColor: "rgba(6,182,212,0.2)",
          animation: "fadeSlideIn 0.3s ease both",
        }}
      >
        <div style={{ padding: "var(--space-lg) var(--space-xl)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xl)", width: "100%" }}>
            <RadialRiskGauge score={caseData.riskScore} size={88} />
            <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--reviewer-accent)", letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                    {caseData.txnId}
                  </span>
                  {liveTx?.review?.decision === "legitimate" ? (
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(16, 185, 129, 0.12)", color: "#10B981", border: "1px solid rgba(16, 185, 129, 0.3)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      ✓ APPROVED
                    </span>
                  ) : (liveTx?.transaction?.status === "reviewed" && liveTx?.review?.decision === "escalate") ? (
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(245, 158, 11, 0.12)", color: "#F59E0B", border: "1px solid rgba(245, 158, 11, 0.3)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      ⟲ ESCALATED
                    </span>
                  ) : liveTx?.review?.decision === "confirmed_fraud" ? (
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(239, 68, 68, 0.12)", color: "#EF4444", border: "1px solid rgba(239, 68, 68, 0.3)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      ⚠ BLOCKED
                    </span>
                  ) : (
                    <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(244,63,94,0.12)", color: "var(--risk-critical)", border: "1px solid rgba(244,63,94,0.3)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      ⚠ {caseData.status}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--text-main)", fontFamily: "monospace", lineHeight: 1.1 }}>
                  {caseData.amount}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.83rem", marginTop: 6 }}>
                  {caseData.merchant} · {caseData.timestamp}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                  <span><strong style={{ color: "var(--text-main)" }}>Category:</strong> {caseData.merchantCategory}</span>
                  <span><strong style={{ color: "var(--text-main)" }}>Type:</strong> {caseData.transactionType}</span>
                  <span><strong style={{ color: "var(--text-main)" }}>Channel:</strong> {caseData.channel}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-md)", flexShrink: 0 }}>
                <div style={{
                  textAlign: "right", padding: "10px 14px",
                  background: "rgba(234,179,8,0.06)",
                  border: "1px solid rgba(234,179,8,0.15)",
                  borderRadius: "var(--radius-md)",
                }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Priority Level</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--risk-high)", textTransform: "capitalize", lineHeight: 1 }}>
                    {caseData.priorityLevel.replace('_', ' ')}
                  </div>
                </div>
                <div style={{
                  textAlign: "right", padding: "10px 14px",
                  background: "rgba(249,115,22,0.06)",
                  border: "1px solid rgba(249,115,22,0.15)",
                  borderRadius: "var(--radius-md)",
                }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Risk Band</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--risk-critical)", textTransform: "capitalize", lineHeight: 1 }}>
                    {caseData.riskBand}
                  </div>
                </div>
                <div style={{
                  textAlign: "right", padding: "10px 14px",
                  background: "rgba(244,63,94,0.06)",
                  border: "1px solid rgba(244,63,94,0.15)",
                  borderRadius: "var(--radius-md)",
                }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>ML Confidence</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--risk-critical)", fontFamily: "monospace", lineHeight: 1 }}>
                    {caseData.confidence}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2-col layout ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "var(--space-lg)", alignItems: "start" }}>

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", minWidth: 0 }}>

          {/* Customer Profile & Device Network Side-by-Side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            {/* Customer Profile */}

            <Section title="Customer Profile" icon="👤">
              <div>
                {[
                  { label: "Name",        val: caseData.customer.name },
                  { label: "Account ID",  val: caseData.customer.accountId, mono: true },
                  { label: "Email",       val: caseData.customer.email, mono: true },
                  { label: "Account Age", val: caseData.customer.accountAge },
                  { label: "KYC Status",  val: caseData.customer.kycStatus.toUpperCase(), color: kycColor },
                ].map(({ label, val, mono, color }) => (
                  <div key={label} className="invest-row">
                    <span style={{ fontSize: "0.77rem", color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: "0.84rem", fontWeight: 600, fontFamily: mono ? "monospace" : "Inter, sans-serif", color: color || "var(--text-main)" }}>{val}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Device & Network */}
            <Section title="Device & Network" icon="💻">
              <div>
                {[
                  { label: "Device ID",  val: caseData.device.id, mono: true },
                  { label: "IP Address", val: caseData.device.ip, mono: true },
                  { label: "Location",   val: caseData.device.country },
                ].map(({ label, val, mono }) => (
                  <div key={label} className="invest-row">
                    <span style={{ fontSize: "0.77rem", color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, fontFamily: mono ? "monospace" : "Inter, sans-serif", color: "var(--text-main)" }}>{val}</span>
                  </div>
                ))}
                {caseData.device.isNew && (
                  <div style={{
                    marginTop: 10, padding: "8px 12px",
                    background: "rgba(244,63,94,0.08)",
                    border: "1px solid rgba(244,63,94,0.25)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--risk-critical)",
                    fontSize: "0.78rem", fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ fontSize: "1rem" }}>⚠</span>
                    NEW DEVICE — Never seen before
                  </div>
                )}
              </div>
            </Section>
          </div>

          {/* Customer History */}
          <div className="invest-card" style={{ animation: "fadeSlideIn 0.4s ease both" }}>
            <div className="invest-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "1rem", lineHeight: 1 }}>📋</span>
                <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-main)", fontFamily: "Inter, sans-serif" }}>Customer Transaction History</span>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "monospace" }}>Account ID: {caseData.customer.accountId}</span>
            </div>
            <div style={{ padding: "var(--space-lg)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                <thead>
                  <tr>
                    {["Timestamp", "TXN id", "Status", "Score", "Risk Band", "Amount", "Risk Source", "Merchant", "Channel", "Location", "Rejects", ""].map(h => (
                      <th key={h} style={{ padding: "6px 12px 10px", color: "var(--text-muted)", fontWeight: 600, textAlign: "left", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-color)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {caseData.history.map((h: any, i: number) => {
                    const sColor =
                      h.status === "approved" ? "var(--risk-low)" :
                      h.status === "flagged"  ? "var(--risk-medium)" :
                      "var(--risk-critical)";
                    return (
                      <tr
                        key={h.id}
                        className="history-row"
                        style={{ borderBottom: i === caseData.history.length - 1 ? "none" : "1px solid var(--border-color)", transition: "background 0.15s" }}
                      >
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>{h.timestamp}</td>
                        <td style={{ padding: "10px 12px", color: "var(--reviewer-accent)", fontFamily: "monospace", fontSize: "0.8rem" }}>{h.txnId.split("-")[0]}...</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 12, background: `${sColor}18`, color: sColor, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {h.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-main)" }}>{h.score}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{h.flagReason}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "monospace", color: "var(--text-main)" }}>{h.amount}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{h.riskSource}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-main)" }}>{h.merchant}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{h.channel}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{h.location}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-main)", textAlign: "center" }}>{h.rejects}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <button
                            onClick={() => router.push(`/reviewer/investigate?id=${h.id}&returnPage=${returnPage}`)}
                            style={{ background: "transparent", border: "none", color: "var(--reviewer-accent)", cursor: "pointer", fontSize: "1rem" }}
                            title="Investigate"
                          >
                            →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {liveHistory?.total > historyLimit && (() => {
              const totalPages = Math.ceil(liveHistory.total / historyLimit);
              return (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 20px", borderTop: "1px solid rgba(255, 255, 255, 0.07)",
                  backgroundColor: "rgba(15, 23, 42, 0.6)", flexWrap: "wrap", gap: "12px",
                  marginTop: "16px", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#94A3B8", fontSize: "0.82rem" }}>
                    <span>
                      Showing <strong style={{ color: "#E8EDF4" }}>{(historyPage - 1) * historyLimit + 1} - {Math.min(historyPage * historyLimit, liveHistory.total)}</strong> of <strong style={{ color: "#E8EDF4" }}>{liveHistory.total}</strong> cases
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                      style={{
                        padding: "6px 12px", borderRadius: "6px",
                        backgroundColor: historyPage === 1 ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: historyPage === 1 ? "#475569" : "#E8EDF4",
                        cursor: historyPage === 1 ? "not-allowed" : "pointer",
                        fontSize: "0.8rem", fontWeight: 500, transition: "all 0.15s",
                      }}
                    >
                      Prev
                    </button>

                    {getPageNumbers(historyPage, totalPages).map((page, idx) => {
                      if (page === "...") {
                        return <span key={`ellipsis-${idx}`} style={{ padding: "0 6px", color: "#64748B", fontSize: "0.85rem", userSelect: "none" }}>...</span>;
                      }
                      const pageNum = page as number;
                      const isActive = pageNum === historyPage;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setHistoryPage(pageNum)}
                          style={{
                            minWidth: "32px", height: "32px", padding: "0 8px", borderRadius: "6px",
                            backgroundColor: isActive ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.04)",
                            border: isActive ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                            color: isActive ? "#38BDF8" : "#94A3B8",
                            fontWeight: isActive ? 700 : 500, fontSize: "0.82rem",
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                      disabled={historyPage === totalPages}
                      style={{
                        padding: "6px 12px", borderRadius: "6px",
                        backgroundColor: historyPage === totalPages ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: historyPage === totalPages ? "#475569" : "#E8EDF4",
                        cursor: historyPage === totalPages ? "not-allowed" : "pointer",
                        fontSize: "0.8rem", fontWeight: 500, transition: "all 0.15s",
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Activity Log */}
          <Section title="Activity Log" icon="⏱️">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {(() => {
                const logs = [];
                const toIST = (ts: string | Date | null | undefined) => {
                  if (!ts) return null;
                  const d = new Date(ts);
                  if (isNaN(d.getTime())) return null;
                  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                };

                const tx = liveTx?.transaction;
                if (!tx) return <div style={{ color: "var(--text-muted)" }}>Loading logs...</div>;

                if (tx.timestamp) logs.push({ label: "Transaction Occurred", ts: toIST(tx.timestamp), icon: <Banknote size={16} /> });
                if (tx.created_at || tx.ingested_at) logs.push({ label: "Ingested at", ts: toIST(tx.created_at || tx.ingested_at), icon: <Download size={16} /> });
                if (tx.updated_at) logs.push({ label: "Queued at", ts: toIST(tx.updated_at), icon: <ListTodo size={16} /> });
                if (tx.sla_start_at) logs.push({ label: "SLA Started at", ts: toIST(tx.sla_start_at), icon: <Clock size={16} /> });
                if (tx.claimed_at) logs.push({ label: `Claimed by ${tx.claimed_by_name || "Unknown"}`, ts: toIST(tx.claimed_at), icon: <User size={16} /> });

                // Terminal states (only ONE)
                if (tx.escalated_at) {
                  logs.push({ label: `Escalated to ${tx.escalated_to || "Unknown"}`, ts: toIST(tx.escalated_at), icon: <ArrowUpCircle size={16} />, color: "#F59E0B" });
                } else if (tx.breached_at) {
                  logs.push({ label: "Breached at", ts: toIST(tx.breached_at), icon: <AlertTriangle size={16} />, color: "#EF4444" });
                } else if (liveTx?.review?.reviewed_at) {
                  logs.push({ label: `Reviewed by ${tx.claimed_by_name || liveTx.review.reviewer_id || "Unknown"}`, ts: toIST(liveTx.review.reviewed_at), icon: <ShieldCheck size={16} />, color: liveTx.review.decision === "confirmed_fraud" ? "var(--risk-critical)" : liveTx.review.decision === "escalate" ? "#F59E0B" : "var(--risk-low)" });
                }

                const validLogs = logs.filter(l => l.ts).reverse();
                return validLogs.map((log, i) => (
                  <div key={i} style={{ display: "flex", gap: "var(--space-md)", alignItems: "flex-start", position: "relative" }}>
                    {i !== validLogs.length - 1 && (
                      <div style={{ position: "absolute", left: 14, top: 30, bottom: -16, width: 2, background: "var(--border-color)" }} />
                    )}
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: log.color ? `${log.color}22` : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", flexShrink: 0, zIndex: 1, border: `1px solid ${log.color ? log.color : "var(--border-color)"}` }}>
                      {log.icon}
                    </div>
                    <div style={{ paddingTop: 4 }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: log.color || "var(--text-main)" }}>{log.label}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: 2 }}>{log.ts}</div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN — sticky */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", position: "sticky", top: 0 }}>

          {/* Decision Panel */}
          <div
            className="invest-card"
            style={{
              border: submitted
                ? "1px solid rgba(16,185,129,0.4)"
                : decision
                  ? "1px solid var(--reviewer-border)"
                  : "1px solid var(--border-color)",
              boxShadow: decision && !submitted ? "0 0 24px var(--reviewer-accent-glow)" : "none",
              transition: "border-color 0.25s, box-shadow 0.25s",
              animation: "fadeSlideIn 0.5s ease both",
            }}
          >
            <div style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border-color)",
              background: "rgba(6,182,212,0.05)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 3, height: 18, background: "var(--reviewer-accent)", borderRadius: 2, display: "inline-block" }} />
              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--reviewer-accent)", fontFamily: "Inter, sans-serif" }}>⚖ Decision Panel</span>
            </div>

            <div style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {submitted ? (
                <div style={{ textAlign: "center", padding: "var(--space-xl)", animation: "successPop 0.4s ease both" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 10, color: "var(--risk-low)" }}>✓</div>
                  <div style={{ fontWeight: 800, color: "var(--risk-low)", fontSize: "1.05rem", fontFamily: "Inter, sans-serif" }}>Decision Submitted</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 6 }}>Returning to queue…</div>
                </div>
              ) : (liveTx?.review && !(liveTx.transaction?.status === "reviewed" && liveTx.review.decision === "escalate" && (liveTx.transaction.queue_id === myQueueId || liveTx.transaction.claimed_by === myAnalystId))) ? (
                <div style={{ textAlign: "center", padding: "var(--space-xl)" }}>
                  <div style={{ 
                    fontSize: "2.5rem", 
                    marginBottom: 10, 
                    color: liveTx.review.decision === "escalate" ? "#F59E0B" : (liveTx.review.decision === "legitimate" ? "var(--risk-low)" : "#EF4444")
                  }}>
                    {liveTx.review.decision === "escalate" ? "⟲" : (liveTx.review.decision === "legitimate" ? "✓" : "✗")}
                  </div>
                  <div style={{ 
                    fontWeight: 800, 
                    color: liveTx.review.decision === "escalate" ? "#F59E0B" : (liveTx.review.decision === "legitimate" ? "var(--risk-low)" : "#EF4444"), 
                    fontSize: "1.05rem", 
                    fontFamily: "Inter, sans-serif",
                    textTransform: "uppercase"
                  }}>
                    {liveTx.review.decision === "escalate" ? "Escalated" : (liveTx.review.decision === "legitimate" ? "Approved" : "Blocked")}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.4 }}>
                    This transaction has already been {liveTx.review.decision === "escalate" ? "escalated" : "reviewed"}.<br/>
                    {liveTx.review.notes && (
                      <span style={{ display: "block", marginTop: 8, fontStyle: "italic", color: "#94A3B8" }}>
                        "{liveTx.review.notes}"
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <>

                  {/* 3 decision buttons: top row 2 cols, escalate full-width */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {decisionButtons.slice(0, 2).map(({ key, label, activeColor, activeBg, border }) => (
                      <button
                        key={key}
                        id={`decision-btn-${key}`}
                        onClick={() => setDecision(key)}
                        className="decision-btn"
                        style={{
                          border: `1px solid ${decision === key ? activeColor : border}`,
                          background: decision === key ? activeBg : "transparent",
                          color: activeColor,
                          outline: decision === key ? `2px solid ${activeColor}` : "none",
                          outlineOffset: 1,
                          fontFamily: "Inter, sans-serif",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {!(liveTx?.review?.decision === "escalate") && (
                  <button
                    id="decision-btn-escalate"
                    onClick={() => setDecision("escalate")}
                    className="decision-btn"
                    style={{
                      width: "100%",
                      border: `1px solid ${decision === "escalate" ? "var(--risk-medium)" : "rgba(245,158,11,0.4)"}`,
                      background: decision === "escalate" ? "rgba(245,158,11,0.15)" : "transparent",
                      color: "var(--risk-medium)",
                      outline: decision === "escalate" ? "2px solid var(--risk-medium)" : "none",
                      outlineOffset: 1,
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    ⬆ Escalate
                  </button>
                  )}

                  {/* Target dropdowns for Escalate */}
                  {decision === "escalate" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                      <div>
                        <label style={{ fontSize: "0.77rem", color: "var(--text-muted)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                          Target (Queue - Reviewer)
                        </label>
                        <select
                          value={targetAnalystId}
                          onChange={(e) => {
                             const selAnalystId = e.target.value;
                             setTargetAnalystId(selAnalystId);
                             const analyst = analysts.find(a => a.id === selAnalystId);
                             if (analyst && analyst.queue_id) {
                               setTargetQueueId(analyst.queue_id);
                             } else {
                               setTargetQueueId("");
                             }
                          }}
                          className="invest-input"
                          style={{ width: "100%", padding: "10px", appearance: "auto", background: "#0a0a0a", color: "var(--text-main)" }}
                        >
                          <option value="" style={{ background: "#0a0a0a", color: "var(--text-main)" }}>-- Select a Target --</option>
                          {analysts.map(a => {
                            const q = queues.find(q => q.id === a.queue_id);
                            const qName = q ? q.name : "Unassigned Queue";
                            return (
                              <option key={a.id} value={a.id} style={{ background: "#0a0a0a", color: "var(--text-main)" }}>
                                {qName} - {a.full_name}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Reason Code — scoped to selected decision */}
                  <div>
                    <label style={{ fontSize: "0.77rem", color: "var(--text-muted)", display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em" }}>
                      Reason Code <span style={{ color: "var(--risk-critical)" }}>*</span>
                    </label>
                    <select
                      id="reason-code-select"
                      value={reasonCode}
                      onChange={e => setReasonCode(e.target.value)}
                      disabled={!decision}
                      style={{
                        width: "100%", padding: "8px 12px",
                        background: "var(--bg-color)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-sm)",
                        color: reasonCode ? "var(--text-main)" : "var(--text-muted)",
                        fontSize: "0.82rem", fontFamily: "Inter, sans-serif",
                        opacity: decision ? 1 : 0.5,
                        cursor: decision ? "auto" : "not-allowed",
                      }}
                    >
                      <option value="">Select a reason code…</option>
                      {decision && REASON_CODES[decision].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: "0.77rem", color: "var(--text-muted)", display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em" }}>
                      Investigation Notes <span style={{ color: "var(--risk-critical)" }}>*</span>
                    </label>
                    <textarea
                      id="investigation-notes"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add your investigation notes here — visible to team leads and auditors…"
                      rows={4}
                      style={{
                        width: "100%", padding: "8px 12px",
                        background: "var(--bg-color)",
                        border: `1px solid ${notes.trim().length > 0 ? "var(--reviewer-border)" : "var(--border-color)"}`,
                        borderRadius: "var(--radius-sm)", color: "var(--text-main)",
                        fontSize: "0.82rem", resize: "vertical", lineHeight: 1.6,
                        fontFamily: "Inter, sans-serif", transition: "border-color 0.2s",
                      }}
                    />
                    {!notes.trim() && decision && (
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
                        Notes required before submitting
                      </div>
                    )}
                  </div>

                  {/* Evidence upload (UI only — no backend) */}
                  <div style={{
                    padding: "10px 14px",
                    border: "1px dashed var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    textAlign: "center", cursor: "pointer",
                    color: "var(--text-muted)", fontSize: "0.82rem",
                    transition: "border-color 0.2s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--text-disabled)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-color)")}
                  >
                    📎 Attach evidence (screenshots, docs)
                  </div>

                  {/* Error state */}
                  {submitError && (
                    <div style={{
                      padding: "8px 12px", borderRadius: "var(--radius-sm)",
                      background: "rgba(244,63,94,0.08)",
                      border: "1px solid rgba(244,63,94,0.25)",
                      color: "var(--risk-critical)", fontSize: "0.8rem", fontWeight: 600,
                    }}>
                      ⚠ {submitError}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    id="submit-decision-btn"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={submitBtnStyle}
                    onMouseEnter={e => { if (canSubmit) (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "none"; }}
                  >
                    Submit Decision →
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function InvestigationPage() {
  return (
    <Suspense fallback={<div style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--text-muted)" }}>Loading case details...</div>}>
      <InvestigationContent />
    </Suspense>
  );
}
