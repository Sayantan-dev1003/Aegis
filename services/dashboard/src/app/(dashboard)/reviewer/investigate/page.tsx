"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RadialRiskGauge } from "@/components/RadialRiskGauge";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ShapFeature { feature: string; value: number; direction: "fraud" | "legit"; }
interface VelocityBucket { window: string; txnCount: number; amount: string; }
interface TxnHistoryItem { id: string; date: string; amount: string; merchant: string; status: "approved" | "declined" | "escalated" | "flagged"; }
interface ActivityLog { actor: string; action: string; timestamp: string; }

// ─── Mock Investigation Data ──────────────────────────────────────────────────
const CASES: Record<string, {
  txnId: string; amount: string; currency: string; merchant: string; timestamp: string;
  riskScore: number; confidence: number; flagReason: string; queue: string; status: string;
  customer: { name: string; accountId: string; email: string; accountAge: string; kycStatus: "verified" | "pending" | "mismatch"; };
  device: { id: string; type: string; browser: string; ip: string; country: string; city: string; isNew: boolean; };
  shap: ShapFeature[];
  velocity: { card: VelocityBucket[]; device: VelocityBucket[]; ip: VelocityBucket[]; };
  history: TxnHistoryItem[];
  activity: ActivityLog[];
  linkedAccounts: { accountId: string; name: string; reason: string; }[];
}> = {
  "3": {
    txnId: "TXN-9901-CZ", amount: "₹1,02,000", currency: "INR", merchant: "PayFast Gateway",
    timestamp: "2026-08-01 08:52:14 IST", riskScore: 91, confidence: 94, flagReason: "ATO-01: Password Reset + Immediate Withdrawal",
    queue: "ATO Suspects", status: "Escalated",
    customer: { name: "Amit Verma", accountId: "ACC-2041-ZX", email: "a**t@gmail.com", accountAge: "3 years, 4 months", kycStatus: "verified" },
    device: { id: "DEV-9921-UNFMILIAR", type: "Mobile (Android 14)", browser: "Chrome 126", ip: "203.88.12.91", country: "India", city: "Hyderabad", isNew: true },
    shap: [
      { feature: "New device used for this transaction", value: 28, direction: "fraud" },
      { feature: "Password reset 22 minutes ago", value: 24, direction: "fraud" },
      { feature: "Withdrawal amount is 4.2× monthly avg", value: 18, direction: "fraud" },
      { feature: "Location 1,840 km from last transaction", value: 14, direction: "fraud" },
      { feature: "Account in good standing (3+ years)", value: 10, direction: "legit" },
    ],
    velocity: {
      card: [
        { window: "Last 1h", txnCount: 3, amount: "₹1,24,000" },
        { window: "Last 24h", txnCount: 5, amount: "₹1,49,000" },
        { window: "Last 7d", txnCount: 12, amount: "₹2,30,000" },
      ],
      device: [
        { window: "Last 1h", txnCount: 3, amount: "₹1,24,000" },
        { window: "Last 24h", txnCount: 3, amount: "₹1,24,000" },
        { window: "Last 7d", txnCount: 3, amount: "₹1,24,000" },
      ],
      ip: [
        { window: "Last 1h", txnCount: 4, amount: "₹1,38,500" },
        { window: "Last 24h", txnCount: 6, amount: "₹1,72,000" },
        { window: "Last 7d", txnCount: 8, amount: "₹2,11,000" },
      ],
    },
    history: [
      { id: "h1", date: "2026-07-28", amount: "₹4,200", merchant: "Swiggy", status: "approved" },
      { id: "h2", date: "2026-07-25", amount: "₹18,000", merchant: "Amazon India", status: "approved" },
      { id: "h3", date: "2026-07-20", amount: "₹92,000", merchant: "HDFC UPI", status: "flagged" },
      { id: "h4", date: "2026-07-15", amount: "₹3,500", merchant: "Zomato", status: "approved" },
      { id: "h5", date: "2026-06-30", amount: "₹22,000", merchant: "PayFast Gateway", status: "declined" },
    ],
    activity: [
      { actor: "System", action: "Case auto-escalated by Rule ATO-01", timestamp: "08:52:20 IST" },
      { actor: "Aisha K.", action: "Claimed this case", timestamp: "08:54:10 IST" },
      { actor: "You", action: "Opened case for investigation", timestamp: "09:48:00 IST" },
    ],
    linkedAccounts: [
      { accountId: "ACC-8821-PQ", name: "Rahul Verma", reason: "Same device ID used in last 24h" },
      { accountId: "ACC-3341-RW", name: "Unknown Entity", reason: "Shared IP address (203.88.12.91)" },
    ],
  },
};

const FALLBACK_CASE = CASES["3"];

// ─── Sub-Components ───────────────────────────────────────────────────────────
const REASON_CODES = [
  "Select a reason code…",
  "Confirmed Fraud: Account Takeover",
  "Confirmed Fraud: Card Not Present",
  "Confirmed Fraud: Synthetic Identity",
  "Legitimate: Customer Verified by Phone",
  "Legitimate: Transaction Pattern Normal",
  "Legitimate: Business Payment Verified",
  "Escalate: Requires Senior Review",
  "Escalate: Compliance / AML Review Needed",
  "Request Info: Pending Customer Response",
];

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

function InvestigationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const caseId = searchParams.get("id") || "3";
  const [liveTx, setLiveTx] = useState<any>(null);

  React.useEffect(() => {
    if (!caseId) return;
    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("aegis_token="))
      ?.split("=")[1];
    fetch(`http://localhost:8080/api/v1/transactions/${caseId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.transaction) setLiveTx(d);
      })
      .catch(() => {});
  }, [caseId]);

  const rawCase = CASES[caseId] || FALLBACK_CASE;
  const caseData = liveTx
    ? {
        ...rawCase,
        txnId: liveTx.transaction.id.substring(0, 12).toUpperCase(),
        amount:
          (liveTx.transaction.currency === "INR"
            ? "₹"
            : liveTx.transaction.currency || "₹") +
          Number(liveTx.transaction.amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        currency: liveTx.transaction.currency || "INR",
        merchant: liveTx.transaction.merchant_name || "Merchant",
        timestamp: new Date(
          liveTx.transaction.timestamp || liveTx.transaction.created_at
        ).toLocaleString(),
        riskScore: Math.round((liveTx.fraud_result?.fraud_score || 0.88) * 100),
        confidence: Math.round((liveTx.fraud_result?.fraud_score || 0.88) * 100),
        status: liveTx.transaction.status,
        queue: liveTx.transaction.queue_name || "ML Borderline Review",
      }
    : rawCase;

  const [decision, setDecision] = useState<"approve" | "decline" | "block" | "escalate" | null>(null);
  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [activeVelocity, setActiveVelocity] = useState<"card" | "device" | "ip">("card");

  const handleSubmit = async () => {
    if (!decision || reasonCode === REASON_CODES[0]) return;
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("aegis_token="))
        ?.split("=")[1];
      await fetch(`http://localhost:8080/api/v1/transactions/${caseId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          decision:
            decision === "approve"
              ? "approved"
              : decision === "decline"
              ? "declined"
              : decision === "block"
              ? "blocked"
              : "escalated",
          reason_code: reasonCode,
          notes: notes,
        }),
      });
    } catch {
      // Continue even if offline
    }
    setSubmitted(true);
    setTimeout(() => router.push("/reviewer/queue"), 1500);
  };

  const kycColor = caseData.customer.kycStatus === "verified" ? "var(--risk-low)" : caseData.customer.kycStatus === "pending" ? "var(--risk-medium)" : "var(--risk-critical)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

      {/* ── Case Header ─────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)" }}>
            <RadialRiskGauge score={caseData.riskScore} size={84} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--reviewer-accent)" }}>{caseData.txnId}</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(244,63,94,0.12)", color: "var(--risk-critical)", border: "1px solid rgba(244,63,94,0.3)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>
                  ⚠ {caseData.status}
                </span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: "var(--reviewer-accent-light)", color: "var(--reviewer-accent)", border: "1px solid var(--reviewer-border)", fontSize: "0.72rem", fontWeight: 700 }}>
                  {caseData.queue}
                </span>
              </div>
              <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--text-main)", fontFamily: "monospace", lineHeight: 1.1, marginTop: 4 }}>{caseData.amount}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>
                {caseData.merchant} · {caseData.timestamp}
              </div>
              <div style={{ marginTop: 6, color: "var(--risk-medium)", fontSize: "0.82rem", fontWeight: 600 }}>
                🚨 {caseData.flagReason}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginBottom: 4 }}>ML Confidence</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--risk-critical)", fontFamily: "monospace" }}>{caseData.confidence}%</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Fraud probability</div>
          </div>
        </div>
      </div>

      {/* ── Main 2-col layout ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "var(--space-lg)", alignItems: "start" }}>

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* SHAP Panel */}
          <Section title="🔍 Why Was This Flagged? (SHAP Explanation)">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {caseData.shap.map((f, i) => {
                const isFraud = f.direction === "fraud";
                const barColor = isFraud ? "var(--risk-critical)" : "var(--risk-low)";
                const bgColor = isFraud ? "rgba(244,63,94,0.08)" : "rgba(16,185,129,0.08)";
                return (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", background: bgColor, border: `1px solid ${isFraud ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.2)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-main)", fontWeight: 500 }}>
                        {isFraud ? "⬆" : "⬇"} {f.feature}
                      </span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: barColor, fontFamily: "monospace" }}>+{f.value}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--border-color)" }}>
                      <div style={{ height: "100%", width: `${f.value}%`, background: barColor, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Velocity Panel */}
          <Section title="⚡ Velocity Signals">
            <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
              {(["card", "device", "ip"] as const).map(v => (
                <button key={v} onClick={() => setActiveVelocity(v)}
                  style={{ padding: "5px 16px", borderRadius: 20, border: activeVelocity === v ? "1px solid var(--reviewer-border)" : "1px solid var(--border-color)", background: activeVelocity === v ? "var(--reviewer-accent-light)" : "transparent", color: activeVelocity === v ? "var(--reviewer-accent)" : "var(--text-muted)", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", textTransform: "uppercase" }}>
                  {v}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-md)" }}>
              {caseData.velocity[activeVelocity].map((v, i) => (
                <div key={i} style={{ padding: "var(--space-md)", background: "var(--bg-color)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{v.window}</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--reviewer-accent)", fontFamily: "monospace" }}>{v.txnCount}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>transactions</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-main)", fontFamily: "monospace", marginTop: 4 }}>{v.amount}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Customer History */}
          <Section title="📋 Customer Transaction History">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  {["Date", "Amount", "Merchant", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 600, textAlign: "left", fontSize: "0.78rem", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {caseData.history.map((h, i) => {
                  const sColor = h.status === "approved" ? "var(--risk-low)" : h.status === "declined" ? "var(--risk-critical)" : h.status === "escalated" ? "var(--risk-critical)" : "var(--risk-medium)";
                  return (
                    <tr key={h.id} style={{ borderBottom: i === caseData.history.length - 1 ? "none" : "1px solid var(--border-color)" }}>
                      <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>{h.date}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "monospace" }}>{h.amount}</td>
                      <td style={{ padding: "10px 12px" }}>{h.merchant}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 12, background: `${sColor}18`, color: sColor, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>{h.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          {/* Linked Entity Graph */}
          <Section title="🕸 Linked Entity Graph">
            <div style={{ background: "var(--bg-color)", borderRadius: "var(--radius-md)", padding: "var(--space-lg)", border: "1px solid var(--border-color)", minHeight: 120 }}>
              <div style={{ display: "flex", gap: "var(--space-lg)", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                {/* Central node */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--reviewer-accent-light)", border: "2px solid var(--reviewer-accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: "1.4rem" }}>👤</div>
                  <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--reviewer-accent)", fontWeight: 700 }}>{caseData.customer.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>PRIMARY</div>
                </div>
                {/* Links */}
                {caseData.linkedAccounts.map((acc, i) => (
                  <React.Fragment key={i}>
                    <div style={{ color: "var(--text-disabled)", fontSize: "1.2rem" }}>——</div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(244,63,94,0.1)", border: "2px dashed var(--risk-critical)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: "1.2rem" }}>⚠️</div>
                      <div style={{ marginTop: 6, fontSize: "0.72rem", color: "var(--risk-critical)", fontWeight: 700 }}>{acc.name}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", maxWidth: 100 }}>{acc.reason}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* Customer Profile */}
          <Section title="👤 Customer Profile">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Name", val: caseData.customer.name },
                { label: "Account ID", val: caseData.customer.accountId, mono: true },
                { label: "Email", val: caseData.customer.email, mono: true },
                { label: "Account Age", val: caseData.customer.accountAge },
                { label: "KYC Status", val: caseData.customer.kycStatus.toUpperCase(), color: kycColor },
              ].map(({ label, val, mono, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, fontFamily: mono ? "monospace" : undefined, color: color || "var(--text-main)" }}>{val}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/reviewer/customer")}
              style={{ marginTop: "var(--space-md)", width: "100%", padding: "8px", background: "transparent", border: "1px solid var(--reviewer-border)", borderRadius: "var(--radius-sm)", color: "var(--reviewer-accent)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}>
              View Full 360 Profile →
            </button>
          </Section>

          {/* Device & Network */}
          <Section title="💻 Device & Network">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Device", val: caseData.device.type },
                { label: "Device ID", val: caseData.device.id, mono: true },
                { label: "Browser", val: caseData.device.browser },
                { label: "IP Address", val: caseData.device.ip, mono: true },
                { label: "Location", val: `${caseData.device.city}, ${caseData.device.country}` },
              ].map(({ label, val, mono }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, fontFamily: mono ? "monospace" : undefined, color: "var(--text-main)" }}>{val}</span>
                </div>
              ))}
              {caseData.device.isNew && (
                <div style={{ marginTop: 4, padding: "6px 12px", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: "var(--radius-sm)", color: "var(--risk-critical)", fontSize: "0.78rem", fontWeight: 700 }}>
                  ⚠ NEW DEVICE — Never seen before
                </div>
              )}
            </div>
          </Section>

          {/* Decision Panel */}
          <div style={{ background: "var(--surface-color)", border: submitted ? "1px solid var(--risk-low)" : "1px solid var(--reviewer-border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "0 0 20px var(--reviewer-accent-glow)" }}>
            <div style={{ padding: "var(--space-md) var(--space-lg)", borderBottom: "1px solid var(--border-color)", background: "var(--reviewer-accent-subtle)" }}>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--reviewer-accent)" }}>⚖ Decision Panel</span>
            </div>
            <div style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {submitted ? (
                <div style={{ textAlign: "center", padding: "var(--space-xl)", color: "var(--risk-low)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 8 }}>✓</div>
                  <div style={{ fontWeight: 700 }}>Decision Submitted</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>Redirecting to queue…</div>
                </div>
              ) : (
                <>
                  {/* Decision Buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)" }}>
                    {[
                      { key: "approve", label: "✓ Approve", bg: decision === "approve" ? "rgba(16,185,129,0.15)" : "transparent", border: "rgba(16,185,129,0.4)", color: "var(--risk-low)" },
                      { key: "decline", label: "✕ Decline", bg: decision === "decline" ? "rgba(244,63,94,0.15)" : "transparent", border: "rgba(244,63,94,0.4)", color: "var(--risk-critical)" },
                      { key: "block", label: "🔒 Block", bg: decision === "block" ? "rgba(244,63,94,0.15)" : "transparent", border: "rgba(244,63,94,0.4)", color: "var(--risk-critical)" },
                      { key: "escalate", label: "⬆ Escalate", bg: decision === "escalate" ? "rgba(245,158,11,0.15)" : "transparent", border: "rgba(245,158,11,0.4)", color: "var(--risk-medium)" },
                    ].map(({ key, label, bg, border, color }) => (
                      <button
                        key={key}
                        onClick={() => setDecision(key as typeof decision)}
                        style={{ padding: "10px", borderRadius: "var(--radius-sm)", border: `1px solid ${border}`, background: bg, color, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s", outline: decision === key ? `2px solid ${color}` : "none" }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Reason Code */}
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 6, fontWeight: 600 }}>Reason Code *</label>
                    <select
                      value={reasonCode}
                      onChange={e => setReasonCode(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: reasonCode === REASON_CODES[0] ? "var(--text-muted)" : "var(--text-main)", fontSize: "0.82rem" }}
                    >
                      {REASON_CODES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "block", marginBottom: 6, fontWeight: 600 }}>Investigation Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add your investigation notes here — visible to team leads and auditors…"
                      rows={4}
                      style={{ width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-main)", fontSize: "0.82rem", resize: "vertical", lineHeight: 1.6 }}
                    />
                  </div>

                  {/* Evidence upload */}
                  <div style={{ padding: "10px 14px", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-sm)", textAlign: "center", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    📎 Attach evidence (screenshots, docs)
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!decision || reasonCode === REASON_CODES[0]}
                    style={{
                      padding: "12px", background: decision && reasonCode !== REASON_CODES[0] ? "var(--reviewer-accent)" : "var(--border-color)",
                      border: "none", borderRadius: "var(--radius-sm)", color: decision ? "#0A0E14" : "var(--text-disabled)",
                      fontWeight: 800, fontSize: "0.95rem", cursor: decision ? "pointer" : "not-allowed", transition: "all 0.2s",
                      letterSpacing: "0.02em"
                    }}>
                    Submit Decision →
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <Section title="📝 Case Activity Log">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {caseData.activity.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--reviewer-accent-light)", border: "1px solid var(--reviewer-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", flexShrink: 0 }}>
                    {a.actor === "System" ? "⚙" : a.actor[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-main)", fontWeight: 600 }}>{a.actor}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{a.action}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-disabled)", fontFamily: "monospace", marginTop: 2 }}>{a.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
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
