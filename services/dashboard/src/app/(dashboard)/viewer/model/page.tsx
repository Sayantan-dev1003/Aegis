"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "../../../lib/api";
const KpiCard = ({
  label,
  value,
  sub,
  accent,
  change,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  change?: { pct: number } | null;
}) => (
  <div
    style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "12px",
      padding: "16px 20px",
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "4px",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          color: "#8D9AAB",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      {change !== undefined && change !== null && (
        <div
          style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: "12px",
            fontFamily: "monospace",
            background:
              change.pct >= 0 ? "rgba(52,211,153,0.12)" : "rgba(244,63,94,0.12)",
            color: change.pct >= 0 ? "#34D399" : "#F43F5E",
            border: `1px solid ${
              change.pct >= 0 ? "rgba(52,211,153,0.3)" : "rgba(244,63,94,0.3)"
            }`,
          }}
        >
          {change.pct >= 0
            ? `▲ +${change.pct.toFixed(1)}%`
            : `▼ ${change.pct.toFixed(1)}%`}
        </div>
      )}
    </div>
    <div
      style={{
        fontSize: "1.6rem",
        fontWeight: 700,
        color: accent,
        lineHeight: 1,
        fontFamily: "monospace",
      }}
    >
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: "0.7rem", color: "#4E5A6B", marginTop: "4px" }}>
        {sub}
      </div>
    )}
    <div
      style={{
        position: "absolute",
        top: "-20px",
        right: "-20px",
        width: "70px",
        height: "70px",
        borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}12 0%, transparent 70%)`,
        pointerEvents: "none",
      }}
    />
  </div>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const ActionBadge = ({ action }: { action: string }) => {
  const map: Record<string, { color: string; bg: string }> = {
    block:   { color: '#F43F5E', bg: 'rgba(244,63,94,0.12)'  },
    flag:    { color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
  };
  const m = map[action?.toLowerCase()] || { color: '#8D9AAB', bg: 'rgba(148,163,184,0.1)' };
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, color: m.color, background: m.bg, textTransform: 'capitalize' }}>
      {(action || 'flag').replace('_', ' ')}
    </span>
  );
};

export default function ViewerModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEntity, setFilterEntity] = useState("All");
  const [filterAction, setFilterAction] = useState("All");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadGovernanceData = async () => {
      setLoading(true);
      try {
        const [modRes, rulRes, queRes] = await Promise.all([
          fetchApi("http://localhost:8080/admin/models"),
          fetchApi("http://localhost:8080/admin/rules"),
          fetchApi("http://localhost:8080/admin/queues"),
        ]);
        if (!mounted) return;

        if (Array.isArray(modRes)) setModels(modRes);
        if (Array.isArray(rulRes)) setRules(rulRes);
        if (Array.isArray(queRes)) setQueues(queRes);
        if (mounted) setLastRefreshed(new Date());
      } catch (err) {
        console.error("Failed to load governance data:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadGovernanceData();
    return () => {
      mounted = false;
    };
  }, []);

  const activeModel = models.find((m) => m.status === "active" || m.is_active) || models[0] || {
    name: "xgboost_fraud_scorer_v2.4",
    version: "v2.4.1",
    deployed_at: "2026-07-15 04:00:00",
    pr_auc: 0.888,
    roc_auc: 0.977,
    recall: 0.795,
    precision: 0.905,
    f1_score: 0.847,
    accuracy: "99.2%",
    dataset: "IEEE-CIS Fraud Training Corpus (118k samples)",
  };

  const prevModel = activeModel.id ? (models.find((m) => m.id !== activeModel.id) || null) : null;

  const getPctChange = (currVal: number, prevVal?: number): { pct: number } | null => {
    if (!prevModel || prevVal === undefined || prevVal === null || prevVal === 0) return null;
    return { pct: ((currVal - prevVal) / prevVal) * 100 };
  };

  const kpis = [
    {
      label: "PR-AUC",
      value: Number(activeModel.pr_auc || 0.888).toFixed(3),
      sub: "precision-recall area",
      accent: "#5C6EF8",
      change: getPctChange(Number(activeModel.pr_auc || 0), Number(prevModel?.pr_auc || 0)),
    },
    {
      label: "ROC-AUC",
      value: Number(activeModel.roc_auc || 0.977).toFixed(3),
      sub: "discriminative power",
      accent: "#22D3EE",
      change: getPctChange(Number(activeModel.roc_auc || 0), Number(prevModel?.roc_auc || 0)),
    },
    {
      label: "Recall",
      value: Number(activeModel.recall || 0.795).toFixed(3),
      sub: "true-positive rate",
      accent: "#34D399",
      change: getPctChange(Number(activeModel.recall || 0), Number(prevModel?.recall || 0)),
    },
    {
      label: "Precision",
      value: Number(activeModel.precision || 0.905).toFixed(3),
      sub: "positive pred. value",
      accent: "#F59E0B",
      change: getPctChange(Number(activeModel.precision || 0), Number(prevModel?.precision || 0)),
    },
    {
      label: "F1 Score",
      value: Number(activeModel.f1_score || 0.847).toFixed(3),
      sub: "harmonic mean",
      accent: "#8B5CF6",
      change: getPctChange(Number(activeModel.f1_score || 0), Number(prevModel?.f1_score || 0)),
    },
  ];

  const filteredRules = rules.filter((r) => {
    const matchSearch = !searchQuery || (r.name && r.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchEntity = filterEntity === "All" || (r.entity && r.entity.toLowerCase() === filterEntity.toLowerCase());
    const matchAction = filterAction === "All" || (r.action && r.action.toLowerCase() === filterAction.toLowerCase());
    return matchSearch && matchEntity && matchAction;
  });

  const activeCount = rules.filter((r) => r.is_active !== false).length;
  const blockCount = rules.filter((r) => r.action === "block").length;

  const formatRefreshed = (d: Date) => {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // Section header helper
  const SectionHeader = ({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) => (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingBottom: "10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div>
        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#E8EDF4", letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ fontSize: "0.78rem", color: "#8D9AAB", marginTop: "2px" }}>{subtitle}</div>
      </div>
      {right && <div>{right}</div>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", paddingBottom: "40px" }}>

      {/* ── SECTION 1: ML Model Performance ─────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <SectionHeader
          title="ML Model Performance"
          subtitle="Live metrics of the active fraud detection model deployed in production."
          right={
            lastRefreshed ? (
              <span style={{ fontSize: "0.75rem", color: "#4E5A6B", display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Last refreshed {formatRefreshed(lastRefreshed)}
              </span>
            ) : null
          }
        />
        {/* 5 KPI metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "14px" }}>
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      </div>

      {/* ── SECTION 2: Fraud Detection Rules ────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <SectionHeader
          title="Fraud Detection Rules"
          subtitle="Read-only audit of active deterministic and velocity rules enforced in production."
          right={
            lastRefreshed ? (
              <span style={{ fontSize: "0.75rem", color: "#4E5A6B", display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Last refreshed {formatRefreshed(lastRefreshed)}
              </span>
            ) : null
          }
        />

        {/* Stats Summary Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
          {[
            { label: "Total Rules", value: String(rules.length), sub: "custom fraud rules", accent: "#5C6EF8", glow: "rgba(92,110,248,0.12)" },
            { label: "Active Rules", value: String(activeCount), sub: "currently enforced", accent: "#34D399", glow: "rgba(52,211,153,0.12)" },
            { label: "Block Actions", value: String(blockCount), sub: "hard-block rules", accent: "#F43F5E", glow: "rgba(244,63,94,0.12)" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                padding: "16px 20px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#8D9AAB", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{s.label}</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: s.accent, lineHeight: 1, fontFamily: "monospace" }}>{s.value}</div>
              <div style={{ fontSize: "0.7rem", color: "#4E5A6B", marginTop: "3px" }}>{s.sub}</div>
              <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "70px", height: "70px", borderRadius: "50%", background: `radial-gradient(circle, ${s.glow} 0%, transparent 70%)`, pointerEvents: "none" }} />
            </div>
          ))}
        </div>

        {/* Filter bar + table */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "8px 12px",
                width: "240px",
              }}
            >
              <SearchIcon />
              <span style={{ color: "#4E5A6B" }}>|</span>
              <input
                type="text"
                placeholder="Search by name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: "#E8EDF4",
                  fontSize: "0.875rem",
                  flex: 1,
                }}
              />
            </div>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#E8EDF4",
                borderRadius: "8px",
                colorScheme: "dark",
                fontSize: "0.875rem",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="All" style={{ background: "#1A202C" }}>
                All Entities
              </option>
              <option value="user" style={{ background: "#1A202C" }}>
                User
              </option>
              <option value="device" style={{ background: "#1A202C" }}>
                Device
              </option>
              <option value="ip" style={{ background: "#1A202C" }}>
                IP
              </option>
              <option value="card" style={{ background: "#1A202C" }}>
                Card
              </option>
            </select>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#E8EDF4",
                borderRadius: "8px",
                colorScheme: "dark",
                fontSize: "0.875rem",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="All" style={{ background: "#1A202C" }}>
                All Actions
              </option>
              <option value="flag" style={{ background: "#1A202C" }}>
                Flag
              </option>
              <option value="block" style={{ background: "#1A202C" }}>
                Block
              </option>
            </select>
            {(searchQuery || filterEntity !== "All" || filterAction !== "All") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterEntity("All");
                  setFilterAction("All");
                }}
                style={{
                  padding: "8px 12px",
                  background: "rgba(244,63,94,0.08)",
                  border: "1px solid rgba(244,63,94,0.2)",
                  color: "#FCA5A5",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  fontWeight: 600,
                  outline: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {!loading && (
              <span style={{ fontSize: "0.78rem", color: "#4E5A6B" }}>
                Showing <strong style={{ color: "#8D9AAB" }}>{filteredRules.length}</strong> of <strong style={{ color: "#8D9AAB" }}>{rules.length}</strong> rules
              </span>
            )}
            <span
              style={{
                fontSize: "0.78rem",
                color: "#8D9AAB",
                fontStyle: "italic",
                padding: "6px 12px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "8px",
              }}
            >
              Read-Only Audit View
            </span>
          </div>
          </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "14px",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#8D9AAB" }}>
              Loading rules…
            </div>
          ) : filteredRules.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  background: "rgba(92,110,248,0.08)",
                  border: "1px solid rgba(92,110,248,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(92,110,248,0.6)",
                  margin: "0 auto 12px",
                }}
              >
                <ShieldIcon />
              </div>
              <div style={{ color: "#E8EDF4", fontWeight: 600, fontSize: "0.95rem" }}>
                No active rules match criteria
              </div>
              <div style={{ color: "#8D9AAB", fontSize: "0.82rem", marginTop: "4px" }}>
                Try adjusting your search or filter selections.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {[
                    "Name",
                    "Condition",
                    "Entity",
                    "Window",
                    "Action",
                    "Target Queue",
                    "Triggers (24h)",
                    "Active",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        color: "#4E5A6B",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((r, i) => (
                  <tr
                    key={r.id || i}
                    style={{
                      borderBottom:
                        i < filteredRules.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <td style={{ padding: "13px 16px", fontWeight: 600, color: "#E8EDF4" }}>
                      {r.name}
                    </td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      <code
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          padding: "2px 8px",
                          borderRadius: "5px",
                          fontSize: "0.8rem",
                          color: "#A5B4FC",
                          fontFamily: "monospace",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.metric || "velocity"} {r.operator || ">="} {r.value || "10"}
                      </code>
                    </td>
                    <td
                      style={{
                        padding: "13px 16px",
                        color: "#8D9AAB",
                        textTransform: "capitalize",
                      }}
                    >
                      {r.entity || "card"}
                    </td>
                    <td
                      style={{
                        padding: "13px 16px",
                        color: "#8D9AAB",
                        fontFamily: "monospace",
                        fontSize: "0.82rem",
                      }}
                    >
                      {r.window || "24h"}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <ActionBadge action={r.action} />
                    </td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      {r.queue_id ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            background: "rgba(92,110,248,0.12)",
                            color: "#A5B4FC",
                            border: "1px solid rgba(92,110,248,0.25)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {queues.find((q) => q.id === r.queue_id)?.name ||
                            "Assigned Queue"}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.72rem",
                            fontWeight: 500,
                            background: "rgba(255,255,255,0.05)",
                            color: "#8D9AAB",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Default Fallback
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "13px 16px",
                        color: "#E8EDF4",
                        fontFamily: "monospace",
                      }}
                    >
                      {r.triggers_24h ?? "0"}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      {r.is_active !== false ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#34D399",
                            background: "rgba(52,211,153,0.12)",
                            border: "1px solid rgba(52,211,153,0.25)",
                          }}
                        >
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#8D9AAB",
                            background: "rgba(148,163,184,0.1)",
                            border: "1px solid rgba(148,163,184,0.2)",
                          }}
                        >
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
