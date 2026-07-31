"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../../../lib/api";
import { Modal } from "@/components/Modal";

// Icons
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// Helper for masking PII in Viewer Mode
const maskPii = (id: string, type: "card" | "user" = "user") => {
  if (!id) return "N/A";
  if (id.length <= 6) return id;
  const prefix = id.substring(0, 4);
  const suffix = id.substring(id.length - 4);
  return `${prefix}****${suffix}`;
};

// Status Badge Component
const StatusBadge = ({ status, decision }: { status: string; decision?: string }) => {
  let color = "";
  let bg = "";

  if (status === "reviewed") {
    if (decision === "confirmed_fraud") {
      return (
        <span
          style={{
            display: "inline-flex",
            gap: "6px",
            alignItems: "center",
            padding: "3px 10px",
            borderRadius: "6px",
            backgroundColor: "rgba(244, 63, 94, 0.15)",
            color: "#F43F5E",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          Reviewed
          <span style={{ backgroundColor: "#F43F5E", color: "#fff", padding: "1px 6px", borderRadius: "4px", fontSize: "0.68rem" }}>
            Fraud
          </span>
        </span>
      );
    } else if (decision === "legitimate") {
      return (
        <span
          style={{
            display: "inline-flex",
            gap: "6px",
            alignItems: "center",
            padding: "3px 10px",
            borderRadius: "6px",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            color: "#10B981",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          Reviewed
          <span style={{ backgroundColor: "#10B981", color: "#fff", padding: "1px 6px", borderRadius: "4px", fontSize: "0.68rem" }}>
            Legit
          </span>
        </span>
      );
    }
    color = "#60A5FA";
    bg = "rgba(96, 165, 250, 0.15)";
  } else {
    switch (status) {
      case "scored":
        color = "#10B981";
        bg = "rgba(16, 185, 129, 0.15)";
        break;
      case "auto_blocked":
        color = "#F43F5E";
        bg = "rgba(244, 63, 94, 0.15)";
        break;
      case "escalated":
        color = "#F59E0B";
        bg = "rgba(245, 158, 11, 0.15)";
        break;
      case "pending":
        color = "#8B5CF6";
        bg = "rgba(139, 92, 246, 0.15)";
        break;
      default:
        color = "#8D9AAB";
        bg = "rgba(255, 255, 255, 0.05)";
    }
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: "6px",
        backgroundColor: bg,
        color: color,
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
};

export default function ViewerTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      let url = `http://localhost:8080/api/v1/transactions?limit=50&_t=${Date.now()}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (channelFilter) url += `&channel=${channelFilter}`;

      const res = await fetchApi(url);
      if (res && res.data) {
        setTransactions(res.data);
      } else if (Array.isArray(res)) {
        setTransactions(res);
      }
    } catch (err) {
      console.error("Failed to load transactions for Viewer:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [statusFilter, channelFilter]);

  const filteredTransactions = transactions.filter((tx) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const idMatch = tx.id && tx.id.toLowerCase().includes(q);
    const usrMatch = tx.user_id && tx.user_id.toLowerCase().includes(q);
    const cardMatch = tx.card_id && tx.card_id.toLowerCase().includes(q);
    return idMatch || usrMatch || cardMatch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Read-Only Governance Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(13, 17, 23, 0.7) 100%)",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(139, 92, 246, 0.2)",
              color: "#8B5CF6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LockIcon />
          </div>
          <div>
            <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#E8EDF4" }}>
              Read-Only Transaction Ledger & Case Histories
            </div>
            <div style={{ fontSize: "0.76rem", color: "#8D9AAB" }}>
              Compliance Mode: Case decisions (Approve / Decline) are disabled • Raw PII export is restricted to prevent data leakage.
            </div>
          </div>
        </div>

        <span className="badge-read-only">
          <ShieldIcon />
          No Case Actions Allowed
        </span>
      </div>

      {/* Filters Toolbar */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "14px",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Search Box */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "#0D1117",
            border: "1px solid #232C3A",
            borderRadius: "8px",
            padding: "8px 14px",
            minWidth: "280px",
          }}
        >
          <span style={{ color: "#8D9AAB" }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search Txn ID, masked User ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#E8EDF4",
              fontSize: "0.82rem",
              width: "100%",
            }}
          />
        </div>

        {/* Dropdown Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
              }}
            >
              <option value="">All Outcomes</option>
              <option value="auto_blocked">Auto Blocked</option>
              <option value="reviewed">Reviewed by Analyst</option>
              <option value="escalated">Escalated</option>
              <option value="scored">Approved (Scored)</option>
            </select>
          </div>

          <button
            onClick={loadTransactions}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              background: "rgba(139, 92, 246, 0.15)",
              color: "#E8EDF4",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh Ledger
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#8D9AAB", textAlign: "left" }}>
              <th style={{ padding: "12px 18px" }}>Txn ID</th>
              <th style={{ padding: "12px 14px" }}>Timestamp</th>
              <th style={{ padding: "12px 14px" }}>Masked Entity</th>
              <th style={{ padding: "12px 14px" }}>Amount</th>
              <th style={{ padding: "12px 14px" }}>Risk Score</th>
              <th style={{ padding: "12px 14px" }}>Outcome / Status</th>
              <th style={{ padding: "12px 14px" }}>Decided By</th>
              <th style={{ padding: "12px 18px", textAlign: "right" }}>Audit</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#8D9AAB" }}>
                  Loading immutable transaction ledger...
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#8D9AAB" }}>
                  No transactions matching current filter criteria.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx, idx) => (
                <tr
                  key={tx.id || idx}
                  style={{
                    borderBottom: idx < filteredTransactions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    color: "#E8EDF4",
                    transition: "background 0.2s ease",
                  }}
                >
                  <td style={{ padding: "14px 18px", fontFamily: "monospace", fontWeight: 600, color: "#8B5CF6" }}>
                    {tx.id ? `${tx.id.substring(0, 12)}...` : "N/A"}
                  </td>
                  <td style={{ padding: "14px", color: "#8D9AAB", fontSize: "0.78rem" }}>
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : "Just now"}
                  </td>
                  <td style={{ padding: "14px", fontFamily: "monospace", color: "#E8EDF4" }}>
                    {maskPii(tx.user_id, "user")}
                  </td>
                  <td style={{ padding: "14px", fontFamily: "monospace", fontWeight: 700 }}>
                    ${tx.amount ? Number(tx.amount).toFixed(2) : "0.00"}
                  </td>
                  <td style={{ padding: "14px" }}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        background:
                          tx.risk_score > 75
                            ? "rgba(244, 63, 94, 0.15)"
                            : tx.risk_score > 40
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(16, 185, 129, 0.15)",
                        color: tx.risk_score > 75 ? "#F43F5E" : tx.risk_score > 40 ? "#F59E0B" : "#10B981",
                      }}
                    >
                      {tx.risk_score !== undefined ? `${tx.risk_score} / 100` : "N/A"}
                    </span>
                  </td>
                  <td style={{ padding: "14px" }}>
                    <StatusBadge status={tx.status || "scored"} decision={tx.decision} />
                  </td>
                  <td style={{ padding: "14px", color: "#8D9AAB", fontSize: "0.78rem" }}>
                    {tx.analyst_id ? (
                      <span style={{ color: "#E8EDF4", fontWeight: 600 }}>{tx.analyst_id}</span>
                    ) : (
                      "System (Automated)"
                    )}
                  </td>
                  <td style={{ padding: "14px 18px", textAlign: "right" }}>
                    <button
                      onClick={() => setSelectedTx(tx)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid rgba(139, 92, 246, 0.3)",
                        background: "rgba(139, 92, 246, 0.1)",
                        color: "#8B5CF6",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <EyeIcon />
                      Inspect Case
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Read-Only Transaction Inspection Modal */}
      {selectedTx && (
        <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="Read-Only Case Audit & Decision Record">
          <div style={{ display: "flex", flexDirection: "column", gap: "18px", minWidth: "480px" }}>
            {/* Modal Read-Only Notice */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "8px",
                fontSize: "0.78rem",
                color: "#F59E0B",
              }}
            >
              <LockIcon />
              <span>You are viewing this case in Compliance Oversight mode. Editing decisions or adding notes is disabled.</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.82rem" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>TRANSACTION ID</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#E8EDF4" }}>{selectedTx.id}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>RISK SCORE</span>
                <span style={{ fontWeight: 700, color: "#F43F5E" }}>{selectedTx.risk_score} / 100</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>MASKED USER / CARD</span>
                <span style={{ fontFamily: "monospace", color: "#E8EDF4" }}>
                  {maskPii(selectedTx.user_id)} • {maskPii(selectedTx.card_id, "card")}
                </span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>AMOUNT / CHANNEL</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#E8EDF4" }}>
                  ${selectedTx.amount} ({selectedTx.channel || "Web Card"})
                </span>
              </div>
            </div>

            {/* SHAP & Rules Explanations */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "14px" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#E8EDF4", marginBottom: "8px" }}>
                AI Model & Velocity Rule Justification
              </div>
              <div style={{ fontSize: "0.78rem", color: "#8D9AAB", lineHeight: 1.5 }}>
                • <strong>High-Velocity Card Usage:</strong> Exceeded 5 attempts within 1 hour on linked card.<br />
                • <strong>Device Fingerprint Shift:</strong> IP geo-location mismatch with billing zip code.<br />
                • <strong>Automated Action:</strong> {selectedTx.status === "auto_blocked" ? "Hard blocked by velocity threshold." : "Escalated for manual review queue."}
              </div>
            </div>

            {/* Audit Log Note */}
            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
              <button
                onClick={() => setSelectedTx(null)}
                style={{
                  padding: "7px 18px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#8B5CF6",
                  color: "#fff",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close Audit Record
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
