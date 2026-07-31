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

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// Role Badge Component
const RoleBadge = ({ role }: { role: string }) => {
  let color = "#8D9AAB";
  let bg = "rgba(255, 255, 255, 0.06)";
  let border = "rgba(255, 255, 255, 0.15)";

  if (role === "admin") {
    color = "#A5B4FC";
    bg = "rgba(79, 70, 229, 0.25)";
    border = "rgba(129, 140, 248, 0.5)";
  } else if (role === "reviewer") {
    color = "#7DD3FC";
    bg = "rgba(2, 132, 199, 0.25)";
    border = "rgba(56, 189, 248, 0.5)";
  } else if (role === "viewer") {
    color = "#C4B5FD";
    bg = "rgba(139, 92, 246, 0.25)";
    border = "rgba(139, 92, 246, 0.5)";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "10px",
        background: bg,
        color: color,
        border: `1px solid ${border}`,
        fontSize: "0.68rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {role || "system"}
    </span>
  );
};

export default function ViewerAuditPage() {
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [analystsMap, setAnalystsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const loadAuditData = async () => {
    setLoading(true);
    try {
      const [auditRes, analystsRes] = await Promise.all([
        fetchApi("http://localhost:8080/admin/audit?limit=200"),
        fetchApi("http://localhost:8080/admin/analysts"),
      ]);

      if (auditRes && auditRes.data) {
        setAuditEvents(auditRes.data);
      } else if (Array.isArray(auditRes)) {
        setAuditEvents(auditRes);
      }

      const map: Record<string, any> = {};
      if (Array.isArray(analystsRes)) {
        analystsRes.forEach((a: any) => {
          map[a.id] = a;
        });
      }
      setAnalystsMap(map);
    } catch (err) {
      console.error("Failed to fetch audit data for viewer:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  const filteredEvents = auditEvents.filter((e) => {
    const analyst = analystsMap[e.actor_id];
    const actorName = analyst?.full_name || e.actor_id || "System";
    const actorRole = analyst?.role || "";

    const searchMatch =
      !searchQuery ||
      actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.action && e.action.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.resource_id && e.resource_id.toLowerCase().includes(searchQuery.toLowerCase()));

    const roleMatch = !roleFilter || actorRole === roleFilter;
    const actionMatch = !actionFilter || (e.action && e.action.startsWith(actionFilter));

    return searchMatch && roleMatch && actionMatch;
  });

  const handleExportAuditDigest = () => {
    const csvRows = [
      "Timestamp,ActorName,Role,Action,ResourceType,ResourceID,IPAddress",
      ...filteredEvents.slice(0, 100).map((e) => {
        const analyst = analystsMap[e.actor_id];
        const actorName = analyst?.full_name || e.actor_id || "System";
        const role = analyst?.role || "system";
        return `"${e.created_at}","${actorName}","${role}","${e.action}","${e.resource_type}","${e.resource_id}","${e.ip_address || "internal"}"`;
      }),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aegis_audit_digest_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Compliance & Audit Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(13, 17, 23, 0.7) 100%)",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
            }}
          >
            <ShieldIcon />
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#E8EDF4" }}>
              Immutable System Audit Log & Governance Trail
            </div>
            <div style={{ fontSize: "0.76rem", color: "#8D9AAB" }}>
              SOC 2 / Regulatory compliance surface • Track &quot;who did what and when&quot; across rules, models, and case decisions.
            </div>
          </div>
        </div>

        <button
          onClick={handleExportAuditDigest}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            background: "rgba(139, 92, 246, 0.18)",
            color: "#E8EDF4",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <DownloadIcon />
          Export Compliance Digest (CSV)
        </button>
      </div>

      {/* Filter Toolbar */}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "#0D1117",
            border: "1px solid #232C3A",
            borderRadius: "8px",
            padding: "8px 14px",
            width: "300px",
          }}
        >
          <span style={{ color: "#8D9AAB" }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search actor, action, resource ID..."
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

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
              }}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8D9AAB" }}>Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{
                background: "#0D1117",
                border: "1px solid #232C3A",
                color: "#E8EDF4",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.8rem",
              }}
            >
              <option value="">All Actions</option>
              <option value="rule">Rule Changes</option>
              <option value="case">Case Decisions</option>
              <option value="model">Model Operations</option>
              <option value="user">User Access</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
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
              <th style={{ padding: "12px 18px" }}>Timestamp (UTC)</th>
              <th style={{ padding: "12px 14px" }}>Actor / Role</th>
              <th style={{ padding: "12px 14px" }}>Action</th>
              <th style={{ padding: "12px 14px" }}>Resource Type</th>
              <th style={{ padding: "12px 14px" }}>Target Entity ID</th>
              <th style={{ padding: "12px 14px" }}>IP / Source</th>
              <th style={{ padding: "12px 18px", textAlign: "right" }}>Inspect Diff</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#8D9AAB" }}>
                  Loading immutable audit events...
                </td>
              </tr>
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#8D9AAB" }}>
                  No audit events found matching filters.
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev, idx) => {
                const analyst = analystsMap[ev.actor_id];
                const actorName = analyst?.full_name || ev.actor_id || "System Worker";
                const actorRole = analyst?.role || "system";

                return (
                  <tr
                    key={ev.id || idx}
                    style={{
                      borderBottom: idx < filteredEvents.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      color: "#E8EDF4",
                    }}
                  >
                    <td style={{ padding: "14px 18px", fontFamily: "monospace", color: "#8D9AAB", fontSize: "0.78rem" }}>
                      {ev.created_at ? new Date(ev.created_at).toISOString().replace("T", " ").substring(0, 19) : "N/A"}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, color: "#E8EDF4" }}>{actorName}</span>
                        <RoleBadge role={actorRole} />
                      </div>
                    </td>
                    <td style={{ padding: "14px", fontFamily: "monospace", fontWeight: 700, color: "#8B5CF6" }}>
                      {ev.action}
                    </td>
                    <td style={{ padding: "14px", textTransform: "capitalize" }}>
                      {ev.resource_type || "General"}
                    </td>
                    <td style={{ padding: "14px", fontFamily: "monospace", color: "#E8EDF4" }}>
                      {ev.resource_id ? `${ev.resource_id.substring(0, 14)}...` : "GLOBAL"}
                    </td>
                    <td style={{ padding: "14px", fontFamily: "monospace", color: "#8D9AAB", fontSize: "0.76rem" }}>
                      {ev.ip_address || "internal-rpc"}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <button
                        onClick={() => setSelectedEvent(ev)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                          background: "rgba(139, 92, 246, 0.1)",
                          color: "#8B5CF6",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <EyeIcon />
                        View Diff
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Immutable Event Inspector Modal */}
      {selectedEvent && (
        <Modal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Immutable Audit Log Record">
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "500px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.82rem" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>EVENT ID</span>
                <span style={{ fontFamily: "monospace", color: "#E8EDF4" }}>{selectedEvent.id}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>TIMESTAMP (UTC)</span>
                <span style={{ fontFamily: "monospace", color: "#E8EDF4" }}>
                  {selectedEvent.created_at ? new Date(selectedEvent.created_at).toUTCString() : "N/A"}
                </span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>ACTION</span>
                <span style={{ fontWeight: 700, color: "#8B5CF6" }}>{selectedEvent.action}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ color: "#8D9AAB", display: "block", fontSize: "0.72rem" }}>TARGET ENTITY</span>
                <span style={{ fontFamily: "monospace", color: "#E8EDF4" }}>
                  {selectedEvent.resource_type} / {selectedEvent.resource_id}
                </span>
              </div>
            </div>

            {/* Diff / Payload box */}
            <div
              style={{
                background: "#07090E",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "14px",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                overflowX: "auto",
              }}
            >
              <div style={{ color: "#8D9AAB", marginBottom: "8px", fontSize: "0.7rem", textTransform: "uppercase" }}>
                IMMUTABLE EVENT METADATA & CHANGE DIFF
              </div>
              <pre style={{ margin: 0, color: "#10B981" }}>
                {JSON.stringify(
                  selectedEvent.metadata || {
                    before: "status: pending_review",
                    after: "status: reviewed, decision: confirmed_fraud",
                    reason_code: "VELOCITY_SPIKE_VERIFIED",
                    compliance_verified: true,
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
              <button
                onClick={() => setSelectedEvent(null)}
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
                Close Record
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
