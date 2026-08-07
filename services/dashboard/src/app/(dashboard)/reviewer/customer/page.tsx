"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../contexts/AuthContext";

// ─── Sub-Components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.8rem", fontWeight: 800, fontFamily: "monospace", color: color || "var(--text-main)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────
function CustomerProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("id");
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<"transactions" | "decisions" | "notes">("transactions");
  
  // Local state for notes (as API for customer notes is not defined)
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState<any[]>([]);

  // Data states
  const [customer, setCustomer] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTransactions, setTotalTransactions] = useState(0);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      // Load customer profile
      const resCust = await fetch(`http://localhost:8080/api/v1/customers/${accountId}`, { headers });
      if (resCust.ok) setCustomer(await resCust.json());

      // Load transactions with pagination
      const resTx = await fetch(`http://localhost:8080/api/v1/customers/${accountId}/transactions?page=${currentPage}&limit=${pageSize}`, { headers });
      if (resTx.ok) {
        const txData = await resTx.json();
        setTransactions(txData.transactions || []);
        setTotalTransactions(txData.total || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [accountId, token, currentPage, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregated KPIs from the current page of transactions
  const totalVolume = transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const fraudFlags = transactions.filter(t => (t.fraud_score || 0) >= 0.70 || t.status === "escalated" || t.status === "breached" || t.is_fraud).length;
  const chargebacks = 0; // Not available in transaction summary

  // Extract decisions from the fetched transactions
  const decisions = transactions
    .filter(t => t.review_decision || t.status === "approved" || t.status === "auto_blocked" || t.status === "reviewed")
    .map(t => ({
      decision: t.review_decision || (t.status === "auto_blocked" ? "declined" : "approved"),
      reviewer: t.assignee || "System Auto",
      reasonCode: t.reject_count > 0 ? "Rejected by reviewer" : (t.status === "auto_blocked" ? "High Risk: Auto Blocked" : "Reviewed / Legitimate"),
      txnId: t.id,
      date: new Date(t.timestamp || t.created_at || Date.now()).toLocaleString(),
    }));
  
  const getPageNumbers = useCallback((current: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize));

  if (loading && !customer) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Loading customer profile…</div>;
  if (!customer) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Customer not found. Account ID: {accountId || "None provided"}</div>;

  const kycStatus = customer.kyc_status?.toLowerCase() || "pending";
  const kycColor = kycStatus === "verified" ? "var(--risk-low)" : kycStatus === "pending" ? "var(--risk-medium)" : "var(--risk-critical)";

  const accountAgeStr = (() => {
    if (!customer.created_at) return "N/A";
    const created = new Date(customer.created_at);
    const days = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${Math.floor(days / 365)} years, ${Math.floor((days % 365) / 30)} months`;
  })();

  const formatTimestamp = (dateVal: any) => {
    const d = new Date(dateVal || Date.now());
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  const handleSaveNote = () => {
    if (!newNote.trim()) return;
    setNotes(prev => [...prev, {
      author: "Current User",
      date: formatTimestamp(Date.now()),
      text: newNote.trim()
    }]);
    setNewNote("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", paddingBottom: "32px" }}>
      {/* ── Profile Header ────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-xl)", flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--reviewer-accent-light)", border: "2px solid var(--reviewer-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", flexShrink: 0, textTransform: "uppercase" }}>
            {(customer.full_name || "U")[0]}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>{customer.full_name || "Unknown Customer"}</h2>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: `${kycColor}18`, color: kycColor, border: `1px solid ${kycColor}40`, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>
                ✓ {kycStatus}
              </span>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: "var(--reviewer-accent-light)", color: "var(--reviewer-accent)", border: "1px solid var(--reviewer-border)", fontSize: "0.72rem", fontWeight: 700 }}>
                Standard
              </span>
            </div>
            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: "0.85rem", fontFamily: "monospace" }}>{customer.account_id}</div>
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: "0.82rem" }}>{customer.email || "No Email Provided"}</div>
          </div>
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)" }}>
        <KpiCard label="Page Volume" value={`₹${totalVolume.toLocaleString()}`} sub="From listed transactions" color="var(--reviewer-accent)" />
        <KpiCard label="Fraud Flags" value={fraudFlags} sub="From listed transactions" color={fraudFlags > 0 ? "var(--risk-critical)" : "var(--risk-medium)"} />
        <KpiCard label="Chargebacks" value={chargebacks} sub="Last 180 days" color={chargebacks > 0 ? "var(--risk-medium)" : "var(--risk-low)"} />
        <KpiCard label="Account Age" value={accountAgeStr} sub={`Joined: ${formatTimestamp(customer.created_at)}`} />
      </div>

      {/* ── Tabbed Content ────────────────────────────────────────── */}
      <div style={{ background: "var(--surface-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", padding: "0 var(--space-lg)" }}>
          {([
            { key: "transactions", label: `Transactions (${totalTransactions})` },
            { key: "decisions", label: `Past Decisions (${decisions.length})` },
            { key: "notes", label: `Notes (${notes.length})` },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "var(--space-md) var(--space-md)",
                background: "transparent", border: "none",
                borderBottom: activeTab === t.key ? "2px solid var(--reviewer-accent)" : "2px solid transparent",
                color: activeTab === t.key ? "var(--reviewer-accent)" : "var(--text-muted)",
                fontWeight: activeTab === t.key ? 700 : 500,
                cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap",
                transition: "all 0.2s", marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "var(--space-lg)" }}>
          {/* Transactions Tab */}
          {activeTab === "transactions" && (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                      {["Date", "Amount", "Merchant", "Channel", "Fraud Score", "Status"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", color: "var(--text-muted)", fontWeight: 600, textAlign: "left", fontSize: "0.78rem", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => {
                      const sColor = t.status === "approved" || t.status === "reviewed" ? "var(--risk-low)" : t.status === "escalated" || t.status === "auto_blocked" || t.status === "breached" ? "var(--risk-critical)" : "var(--risk-medium)";
                      const scoreStr = (t.fraud_score || 0) * 100;
                      return (
                        <tr key={t.id} style={{ borderBottom: i === transactions.length - 1 ? "none" : "1px solid var(--border-color)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{formatTimestamp(t.timestamp || t.created_at)}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>{t.currency === "INR" || !t.currency ? "₹" : t.currency} {Number(t.amount || 0).toLocaleString()}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{t.merchant_name || "N/A"}</td>
                          <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "0.8rem", whiteSpace: "nowrap", textTransform: "capitalize" }}>{(t.channel || "N/A").replace("_", " ")}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border-color)" }}>
                                <div style={{ height: "100%", width: `${scoreStr}%`, background: scoreStr >= 75 ? "var(--risk-critical)" : scoreStr >= 45 ? "var(--risk-medium)" : "var(--risk-low)", borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 700, color: scoreStr >= 75 ? "var(--risk-critical)" : scoreStr >= 45 ? "var(--risk-medium)" : "var(--risk-low)" }}>{scoreStr.toFixed(0)}</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 12, background: `${sColor}18`, color: sColor, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>No transactions found for this customer.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Premium Pagination Control Bar */}
              {transactions.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 20px", borderTop: "1px solid rgba(255, 255, 255, 0.07)",
                  backgroundColor: "rgba(15, 23, 42, 0.6)", flexWrap: "wrap", gap: "12px",
                  marginTop: "16px", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#94A3B8", fontSize: "0.82rem" }}>
                    <span>
                      Showing <strong style={{ color: "#E8EDF4" }}>{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalTransactions)}</strong> of <strong style={{ color: "#E8EDF4" }}>{totalTransactions}</strong> cases
                    </span>
                    <span style={{ color: "#334155" }}>|</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        style={{
                          backgroundColor: "#0F172A", border: "1px solid rgba(255, 255, 255, 0.12)",
                          color: "#E8EDF4", borderRadius: "6px", padding: "4px 8px", fontSize: "0.8rem", cursor: "pointer",
                        }}
                      >
                        {[5, 10, 20, 50].map(size => (
                          <option key={size} value={size} style={{ backgroundColor: "#0F172A", color: "#E8EDF4" }}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: "6px 12px", borderRadius: "6px",
                        backgroundColor: currentPage === 1 ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: currentPage === 1 ? "#475569" : "#E8EDF4",
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                        fontSize: "0.8rem", fontWeight: 500, transition: "all 0.15s",
                      }}
                    >
                      Prev
                    </button>

                    {getPageNumbers(currentPage, totalPages).map((page, idx) => {
                      if (page === "...") {
                        return <span key={`ellipsis-${idx}`} style={{ padding: "0 6px", color: "#64748B", fontSize: "0.85rem", userSelect: "none" }}>...</span>;
                      }
                      const pageNum = page as number;
                      const isActive = pageNum === currentPage;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
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
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: "6px 12px", borderRadius: "6px",
                        backgroundColor: currentPage === totalPages ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: currentPage === totalPages ? "#475569" : "#E8EDF4",
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                        fontSize: "0.8rem", fontWeight: 500, transition: "all 0.15s",
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Decisions Tab */}
          {activeTab === "decisions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {decisions.length === 0 && <div style={{ padding: "16px", color: "var(--text-muted)", textAlign: "center" }}>No past decisions for this customer.</div>}
              {decisions.map((d, i) => {
                const dColor = d.decision.toLowerCase() === "approved" || d.decision.toLowerCase() === "reviewed" ? "var(--risk-low)" : "var(--risk-critical)";
                return (
                  <div key={i} style={{ padding: "var(--space-md)", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-lg)", flexWrap: "wrap" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${dColor}18`, border: `1px solid ${dColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                      {dColor === "var(--risk-low)" ? "✓" : "✕"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: dColor, textTransform: "uppercase", fontSize: "0.85rem" }}>{d.decision}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 2 }}>{d.reasonCode}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--reviewer-accent)" }}>{d.txnId}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>by {d.reviewer} · {d.date}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === "notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {notes.length === 0 && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px" }}>No investigation notes yet.</div>}
              {notes.map((n, i) => (
                <div key={i} style={{ padding: "var(--space-md)", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: "var(--reviewer-accent)", fontSize: "0.85rem" }}>{n.author}</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>{n.date}</span>
                  </div>
                  <p style={{ margin: 0, color: "var(--text-main)", fontSize: "0.85rem", lineHeight: 1.6 }}>{n.text}</p>
                </div>
              ))}
              {/* Add note */}
              <div style={{ marginTop: "var(--space-sm)" }}>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                  placeholder="Add an internal note about this customer…"
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-main)", fontSize: "0.85rem", resize: "vertical", lineHeight: 1.6 }} />
                <button disabled={!newNote.trim()} onClick={handleSaveNote}
                  style={{ marginTop: 8, padding: "8px 20px", background: newNote.trim() ? "var(--reviewer-accent)" : "var(--border-color)", border: "none", borderRadius: "var(--radius-sm)", color: newNote.trim() ? "#0A0E14" : "var(--text-disabled)", fontWeight: 700, fontSize: "0.82rem", cursor: newNote.trim() ? "pointer" : "not-allowed" }}>
                  Save Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Loading Customer...</div>}>
      <CustomerProfilePageInner />
    </Suspense>
  );
}

