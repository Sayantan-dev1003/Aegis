"use client";

import React, { useState } from "react";
import { Drawer } from "./Drawer";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  User,
  CreditCard,
  MapPin,
  Smartphone,
} from "lucide-react";

interface InvestigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any | null;
  token?: string | null;
  onReviewed: () => void;
}

export const InvestigationDrawer: React.FC<InvestigationDrawerProps> = ({
  isOpen,
  onClose,
  transaction,
  token,
  onReviewed,
}) => {
  const [decision, setDecision] = useState<string>("legitimate");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!transaction) return null;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      setErrorMsg("Please provide investigation notes for audit compliance.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `http://localhost:8080/api/v1/transactions/${transaction.id}/review`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            decision,
            notes,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to submit review");
      }

      onReviewed();
      onClose();
      setNotes("");
    } catch (err: any) {
      setErrorMsg(err.message || "Error submitting decision");
    } finally {
      setSubmitting(false);
    }
  };

  const score = (transaction.risk_score || 0) * 100;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Investigate Case #${transaction.id?.slice(0, 8)}`}
      width="540px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", color: "#E2E8F0" }}>
        
        {/* Risk Score & Status Header */}
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background:
              score >= 85
                ? "rgba(239, 68, 68, 0.12)"
                : score >= 70
                ? "rgba(249, 115, 22, 0.12)"
                : "rgba(16, 185, 129, 0.12)",
            border:
              score >= 85
                ? "1px solid rgba(239, 68, 68, 0.3)"
                : score >= 70
                ? "1px solid rgba(249, 115, 22, 0.3)"
                : "1px solid rgba(16, 185, 129, 0.3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>
              Risk Assessment
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F8FAFC", marginTop: "2px" }}>
              Score: {score.toFixed(1)}%
            </div>
          </div>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "#F8FAFC",
            }}
          >
            {transaction.status || "escalated"}
          </span>
        </div>

        {/* Transaction Metadata Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <div>
            <span style={{ fontSize: "0.72rem", color: "#94A3B8", display: "flex", alignItems: "center", gap: "4px" }}>
              <CreditCard size={13} /> Amount
            </span>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#F8FAFC", marginTop: "2px" }}>
              {transaction.currency || "INR"} {Number(transaction.amount || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#94A3B8", display: "flex", alignItems: "center", gap: "4px" }}>
              <User size={13} /> Account ID
            </span>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#E2E8F0", marginTop: "2px", fontFamily: "monospace" }}>
              {transaction.account_id || "N/A"}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#94A3B8", display: "flex", alignItems: "center", gap: "4px" }}>
              <MapPin size={13} /> Location
            </span>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#E2E8F0", marginTop: "2px" }}>
              {transaction.country_code || "IN"} ({transaction.ip_address || "N/A"})
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#94A3B8", display: "flex", alignItems: "center", gap: "4px" }}>
              <Smartphone size={13} /> Channel / Device
            </span>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#E2E8F0", marginTop: "2px" }}>
              {transaction.channel || "Web"} ({transaction.device_id?.slice(0, 8) || "N/A"})
            </div>
          </div>
        </div>

        {/* Flag Reason */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "12px",
            padding: "14px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>
            Rule Trigger / Flag Reason
          </div>
          <div style={{ fontSize: "0.9rem", color: "#F8FAFC", marginTop: "6px", fontWeight: 500 }}>
            {transaction.flag_reason || "Triggered high-risk anomaly pattern during real-time scoring."}
          </div>
        </div>

        {/* Verdict Submission Form */}
        <form onSubmit={handleSubmitReview} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#F8FAFC", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Submit Investigation Decision
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => setDecision("legitimate")}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "10px",
                border: decision === "legitimate" ? "2px solid #10B981" : "1px solid rgba(255,255,255,0.15)",
                backgroundColor: decision === "legitimate" ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.03)",
                color: decision === "legitimate" ? "#10B981" : "#94A3B8",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
            >
              <CheckCircle2 size={16} /> Legitimate (Release)
            </button>
            <button
              type="button"
              onClick={() => setDecision("confirmed_fraud")}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "10px",
                border: decision === "confirmed_fraud" ? "2px solid #EF4444" : "1px solid rgba(255,255,255,0.15)",
                backgroundColor: decision === "confirmed_fraud" ? "rgba(239, 68, 68, 0.15)" : "rgba(255,255,255,0.03)",
                color: decision === "confirmed_fraud" ? "#EF4444" : "#94A3B8",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
            >
              <ShieldAlert size={16} /> Confirmed Fraud
            </button>
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "6px" }}>
              Investigation Notes / Rationale (Required)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document evidence, verified KYC details, or reason for decision..."
              rows={4}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                backgroundColor: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#F8FAFC",
                fontSize: "0.85rem",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {errorMsg && (
            <div style={{ color: "#EF4444", fontSize: "0.82rem", background: "rgba(239, 68, 68, 0.1)", padding: "10px 14px", borderRadius: "8px" }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "10px",
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#E2E8F0",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 2,
                padding: "12px",
                borderRadius: "10px",
                backgroundColor: decision === "confirmed_fraud" ? "#EF4444" : "#10B981",
                border: "none",
                color: "#FFFFFF",
                fontWeight: 700,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Submitting Decision..." : "Submit Verdict"}
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  );
};
