"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { Modal } from '@/components/Modal';

const PAGE_SIZE = 20;

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  backgroundColor: '#0f1117',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-md)',
  colorScheme: 'dark',
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const RoleBadge = ({ role }: { role: string }) => {
  if (!role) return null;
  let color = '';
  let bg = '';
  let borderColor = '';

  if (role === 'admin') {
    color = '#A5B4FC';
    bg = 'rgba(79, 70, 229, 0.25)';
    borderColor = 'rgba(129, 140, 248, 0.5)';
  } else if (role === 'reviewer') {
    color = '#7DD3FC';
    bg = 'rgba(2, 132, 199, 0.25)';
    borderColor = 'rgba(56, 189, 248, 0.5)';
  } else {
    color = '#CBD5E1';
    bg = 'rgba(71, 85, 105, 0.25)';
    borderColor = 'rgba(148, 163, 184, 0.5)';
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 7px',
      borderRadius: '10px',
      background: bg,
      color: color,
      border: `1px solid ${borderColor}`,
      fontSize: '0.6rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  );
};

const ActionBadge = ({ action }: { action: string }) => {
  const verb = action.split('.')[1] || action;
  let color = '';
  let bg = '';

  switch (verb) {
    case 'created': color = 'var(--risk-low)'; bg = 'rgba(18, 183, 106, 0.15)'; break;
    case 'updated': color = 'var(--info)'; bg = 'rgba(76, 194, 255, 0.15)'; break;
    case 'deleted': color = 'var(--risk-critical)'; bg = 'rgba(229, 72, 77, 0.15)'; break;
    case 'rolled_back': color = 'var(--risk-medium)'; bg = 'rgba(245, 165, 36, 0.15)'; break;
    case 'deployed': color = '#a78bfa'; bg = 'rgba(167, 139, 250, 0.15)'; break;
    case 'revoked': color = '#fb923c'; bg = 'rgba(251, 146, 60, 0.15)'; break;
    case 'requeued': color = '#facc15'; bg = 'rgba(250, 204, 21, 0.15)'; break;
    default: color = 'var(--text-secondary)'; bg = 'var(--bg-surface-hover)';
  }

  return (
    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: bg, color: color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
      {action.replace('.', ' › ')}
    </span>
  );
};

const FilterLabel = ({ label }: { label: string }) => (
  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</span>
);

const FilterGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <FilterLabel label={label} />
    {children}
  </div>
);

export default function AuditLogPage() {
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [analystsMap, setAnalystsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const [viewingDiff, setViewingDiff] = useState<any>(null);

  const loadData = async () => {
    try {
      const [auditData, analystsData] = await Promise.all([
        fetchApi("http://localhost:8080/admin/audit?limit=500"),
        fetchApi("http://localhost:8080/admin/analysts")
      ]);

      setAuditEvents(auditData.data || []);

      const map: Record<string, any> = {};
      if (analystsData) {
        analystsData.forEach((a: any) => { map[a.id] = a; });
      }
      setAnalystsMap(map);
    } catch (err) {
      console.error("Failed to load audit data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, actionFilter, resourceTypeFilter, roleFilter, dateFilter]);

  const filteredEvents = auditEvents.filter(e => {
    const analyst = analystsMap[e.actor_id];
    const actorName = analyst?.full_name || e.actor_id || "System";
    const actorRole = analyst?.role || "";

    // Search: actor name only
    const matchesSearch = searchQuery === '' || actorName.toLowerCase().includes(searchQuery.toLowerCase());

    // Action filter — e.action is like "rule.created"
    const matchesAction = actionFilter === '' || e.action === actionFilter;

    // Resource type filter — e.resource_type
    const matchesResource = resourceTypeFilter === '' || e.resource_type === resourceTypeFilter;

    // Role filter — actor's role
    const matchesRole = roleFilter === '' || actorRole === roleFilter;

    // Date filter — compare date part only (local date)
    let matchesDate = true;
    if (dateFilter) {
      const eventDate = new Date(e.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD
      matchesDate = eventDate === dateFilter;
    }

    return matchesSearch && matchesAction && matchesResource && matchesRole && matchesDate;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const paginatedEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getInitials = (name: string) => {
    if (!name) return "U";
    if (name === 'System') return 'SY';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const renderDiffContent = (before: string, after: string) => {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    return (
      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.5, backgroundColor: '#000', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        {beforeLines.map((line, i) => {
          if (!afterLines.includes(line)) return <div key={`del-${i}`} style={{ backgroundColor: 'rgba(229, 72, 77, 0.2)', color: '#ff8a8a', padding: '0 8px', margin: '0 -16px' }}>- {line}</div>;
          return <div key={`unchanged-${i}`} style={{ color: '#888', padding: '0 8px' }}>  {line}</div>;
        })}
        {afterLines.map((line, i) => {
          if (!beforeLines.includes(line)) return <div key={`add-${i}`} style={{ backgroundColor: 'rgba(18, 183, 106, 0.2)', color: '#8affb8', padding: '0 8px', margin: '0 -16px' }}>+ {line}</div>;
          return null;
        })}
      </div>
    );
  };

  if (loading) return <div style={{ padding: "2rem", color: 'var(--text-secondary)' }}>Loading audit logs...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>

      {/* Filter Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>

          <FilterGroup label="Search Actor">
            <input
              type="text"
              placeholder="Search by actor name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...selectStyle, width: '200px', padding: '7px 10px' }}
            />
          </FilterGroup>

          <FilterGroup label="Action">
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={selectStyle}>
              <option value="">All Actions</option>
              <optgroup label="Analyst">
                <option value="analyst.created">analyst.created</option>
                <option value="analyst.updated">analyst.updated</option>
              </optgroup>
              <optgroup label="Rule">
                <option value="rule.created">rule.created</option>
                <option value="rule.updated">rule.updated</option>
                <option value="rule.deleted">rule.deleted</option>
              </optgroup>
              <optgroup label="Queue">
                <option value="queue.created">queue.created</option>
                <option value="queue.updated">queue.updated</option>
                <option value="queue.deleted">queue.deleted</option>
              </optgroup>
              <optgroup label="Model">
                <option value="model.deployed">model.deployed</option>
                <option value="model.rolled_back">model.rolled_back</option>
              </optgroup>
              <optgroup label="Integration">
                <option value="apikey.created">apikey.created</option>
                <option value="apikey.revoked">apikey.revoked</option>
                <option value="webhook.created">webhook.created</option>
                <option value="webhook.updated">webhook.updated</option>
                <option value="webhook.deleted">webhook.deleted</option>
              </optgroup>
              <optgroup label="Config / DLQ">
                <option value="config.updated">config.updated</option>
                <option value="dlq.requeued">dlq.requeued</option>
              </optgroup>
            </select>
          </FilterGroup>

          <FilterGroup label="Resource Type">
            <select value={resourceTypeFilter} onChange={e => setResourceTypeFilter(e.target.value)} style={selectStyle}>
              <option value="">All Resources</option>
              <option value="analyst">Analyst</option>
              <option value="rule">Rule</option>
              <option value="queue">Queue</option>
              <option value="model_version">Model Version</option>
              <option value="apikey">API Key</option>
              <option value="webhook">Webhook</option>
              <option value="system_config">System Config</option>
              <option value="transaction">Transaction</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Actor Role">
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Date">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ ...selectStyle, colorScheme: 'dark' }}
            />
          </FilterGroup>

          {(searchQuery || actionFilter || resourceTypeFilter || roleFilter || dateFilter) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <FilterLabel label="&nbsp;" />
              <button
                onClick={() => { setSearchQuery(''); setActionFilter(''); setResourceTypeFilter(''); setRoleFilter(''); setDateFilter(''); }}
                style={{ ...selectStyle, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.05)', cursor: 'pointer' }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {filteredEvents.length} result{filteredEvents.length !== 1 ? 's' : ''}
          </span>
          <button style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
            Export ↓
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-hover)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>IP Address</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actor</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resource ID</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resource Type</th>
              <th style={{ padding: '12px 16px', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedEvents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No audit logs match the current filters.
                </td>
              </tr>
            ) : paginatedEvents.map((e: any, idx: number) => {
              const analyst = analystsMap[e.actor_id];
              const displayName = analyst?.full_name || e.actor_id || "System";
              const role = analyst?.role || "";
              const isLast = idx === paginatedEvents.length - 1;

              return (
                <tr key={e.id || idx} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-color)', transition: 'background 0.15s' }}
                  onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)')}
                  onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Timestamp */}
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>

                  {/* IP Address */}
                  <td style={{ padding: '14px 16px' }}>
                    {e.ip_address ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-hover)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                        {e.ip_address}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>

                  {/* Actor */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', border: '1px solid var(--border-color)', flexShrink: 0 }}>
                        {getInitials(displayName)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{displayName}</span>
                        {role && <RoleBadge role={role} />}
                      </div>
                    </div>
                  </td>

                  {/* Action */}
                  <td style={{ padding: '14px 16px' }}>
                    <ActionBadge action={e.action || ''} />
                  </td>

                  {/* Resource ID */}
                  <td style={{ padding: '14px 16px' }}>
                    {e.resource_id ? (
                      <span
                        title={e.resource_id}
                        onClick={() => navigator.clipboard?.writeText(e.resource_id)}
                        style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(148,163,184,0.15)', cursor: 'copy', whiteSpace: 'nowrap' }}
                      >
                        {e.resource_id.substring(0, 8)}…
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>

                  {/* Resource Type */}
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                    {e.resource_type?.replace('_', ' ') || '—'}
                  </td>

                  {/* Diff icon */}
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {(e.old_value || e.new_value) && (
                      <button
                        onClick={() => setViewingDiff(e)}
                        title="View change diff"
                        style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s, border-color 0.15s, background 0.15s' }}
                        onMouseEnter={ev => { ev.currentTarget.style.color = '#a5b4fc'; ev.currentTarget.style.borderColor = 'rgba(165,180,252,0.5)'; ev.currentTarget.style.background = 'rgba(165,180,252,0.08)'; }}
                        onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--text-secondary)'; ev.currentTarget.style.borderColor = 'var(--border-color)'; ev.currentTarget.style.background = 'none'; }}
                      >
                        ⊞
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: currentPage === 1 ? 'transparent' : 'var(--bg-surface)', color: currentPage === 1 ? 'var(--text-disabled)' : 'var(--text-primary)', cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: '0.875rem', transition: 'all 0.15s' }}
          >
            ← Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
            const isActive = page === currentPage;
            return (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                style={{ width: '34px', height: '34px', borderRadius: '6px', border: `1px solid ${isActive ? 'rgba(99,102,241,0.6)' : 'var(--border-color)'}`, backgroundColor: isActive ? 'rgba(99,102,241,0.2)' : 'var(--bg-surface)', color: isActive ? '#a5b4fc' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: isActive ? 700 : 400, transition: 'all 0.15s', boxShadow: isActive ? '0 0 8px rgba(99,102,241,0.3)' : 'none' }}
              >
                {page}
              </button>
            );
          })}

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: currentPage === totalPages ? 'transparent' : 'var(--bg-surface)', color: currentPage === totalPages ? 'var(--text-disabled)' : 'var(--text-primary)', cursor: currentPage === totalPages ? 'default' : 'pointer', fontSize: '0.875rem', transition: 'all 0.15s' }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Page info */}
      <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '-8px' }}>
        Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredEvents.length)}–{Math.min(currentPage * PAGE_SIZE, filteredEvents.length)} of {filteredEvents.length} entries
      </div>

      {/* Diff Modal */}
      <Modal isOpen={!!viewingDiff} onClose={() => setViewingDiff(null)} title="Change Diff" width="700px">
        {viewingDiff && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <div><strong>Action:</strong> <span style={{ textTransform: 'capitalize' }}>{viewingDiff.action}</span></div>
              <div><strong>Resource:</strong> <span style={{ textTransform: 'capitalize' }}>{viewingDiff.resource_type}</span> ({viewingDiff.resource_id || '—'})</div>
              <div><strong>Actor:</strong> {analystsMap[viewingDiff.actor_id]?.full_name || viewingDiff.actor_id || "System"}</div>
            </div>

            {renderDiffContent(
              viewingDiff.old_value || "{}",
              viewingDiff.new_value || "{}"
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setViewingDiff(null)} style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
