"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';

const ActionBadge = ({ action }: { action: string }) => {
  let color = '';
  let bg = '';
  
  switch (action) {
    case 'created': color = 'var(--risk-low)'; bg = 'rgba(18, 183, 106, 0.15)'; break;
    case 'updated': color = 'var(--info)'; bg = 'rgba(76, 194, 255, 0.15)'; break;
    case 'deleted': color = 'var(--risk-critical)'; bg = 'rgba(229, 72, 77, 0.15)'; break;
    case 'rolled_back': color = 'var(--risk-medium)'; bg = 'rgba(245, 165, 36, 0.15)'; break;
    default: color = 'var(--text-secondary)'; bg = 'var(--bg-surface-hover)';
  }

  return (
    <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '6px', backgroundColor: bg, color: color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
      {action.replace('_', ' ')}
    </span>
  );
};

export default function AuditLogPage() {
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [targetFilter, setTargetFilter] = useState('All');
  
  const [viewingDiff, setViewingDiff] = useState<any>(null);

  const loadAuditLogs = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/audit");
      setAuditEvents(data.data || []);
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const filteredEvents = auditEvents.filter(e => {
    const actorName = e.actor_id || "System";
    const summaryStr = e.details ? JSON.stringify(e.details) : "";
    const matchesSearch = summaryStr.toLowerCase().includes(searchQuery.toLowerCase()) || actorName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'All' || e.action === actionFilter.toLowerCase().replace(' ', '_');
    const matchesTarget = targetFilter === 'All' || e.entity_type === targetFilter.toLowerCase();
    return matchesSearch && matchesAction && matchesTarget;
  });

  const getInitials = (name: string) => {
    if (!name) return "U";
    if (name === 'System') return 'SY';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const renderDiffContent = (before: string, after: string) => {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    // extremely naive diff for demo purposes
    return (
      <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.5, backgroundColor: '#000', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        {beforeLines.map((line, i) => {
          if (!afterLines.includes(line)) {
            return <div key={`del-${i}`} style={{ backgroundColor: 'rgba(229, 72, 77, 0.2)', color: '#ff8a8a', padding: '0 8px', margin: '0 -16px' }}>- {line}</div>;
          }
          return <div key={`unchanged-${i}`} style={{ color: '#888', padding: '0 8px' }}>  {line}</div>;
        })}
        {afterLines.map((line, i) => {
          if (!beforeLines.includes(line)) {
            return <div key={`add-${i}`} style={{ backgroundColor: 'rgba(18, 183, 106, 0.2)', color: '#8affb8', padding: '0 8px', margin: '0 -16px' }}>+ {line}</div>;
          }
          return null;
        })}
      </div>
    );
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading audit logs...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Header / Filter Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <input 
            type="text" 
            placeholder="Search audit log..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', width: '250px' }}
          />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
            <option>All</option><option>Created</option><option>Updated</option><option>Deleted</option><option>Rolled Back</option>
          </select>
          <select value={targetFilter} onChange={e => setTargetFilter(e.target.value)} style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
            <option>All</option><option>Rule</option><option>Model</option><option>User</option><option>Queue</option><option>Config</option>
          </select>
          <input type="date" style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
        </div>
        <button
          style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          Export &darr;
        </button>
      </div>

      {/* Audit Log Table */}
      <div>
        <DataTable
          columns={[
            { key: 'timestamp', header: 'Timestamp', render: (e: any) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{new Date(e.created_at).toLocaleString()}</span> },
            { key: 'actor', header: 'Actor', render: (e: any) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.65rem', border: '1px solid var(--border-color)' }}>
                  {getInitials(e.actor_id || "System")}
                </div>
                <div style={{ fontWeight: 500 }}>{e.actor_id || "System"}</div>
              </div>
            )},
            { key: 'action', header: 'Action', render: (e: any) => <ActionBadge action={e.action} /> },
            { key: 'target', header: 'Target', render: (e: any) => <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{e.entity_type}</span> },
            { key: 'summary', header: 'Summary', render: (e: any) => {
              let summary = "";
              if (e.action === "created") summary = `Created ${e.entity_type}`;
              else if (e.action === "updated") summary = `Updated ${e.entity_type}`;
              else if (e.action === "deleted") summary = `Deleted ${e.entity_type}`;
              else summary = `${e.action} ${e.entity_type}`;
              return <span style={{ color: 'var(--text-primary)' }}>{summary}</span>;
            }},
            { key: 'diffAction', header: '', render: (e: any) => (
              e.details ? (
                <button 
                  onClick={() => setViewingDiff(e)} 
                  style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  View Diff
                </button>
              ) : null
            )}
          ]}
          rows={filteredEvents}
        />
      </div>

      {/* Diff Modal */}
      <Modal isOpen={!!viewingDiff} onClose={() => setViewingDiff(null)} title="Configuration Change Diff" width="700px">
        {viewingDiff && viewingDiff.details && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <div><strong>Action:</strong> <span style={{ textTransform: 'capitalize' }}>{viewingDiff.action.replace('_', ' ')}</span></div>
              <div><strong>Target:</strong> <span style={{ textTransform: 'capitalize' }}>{viewingDiff.entity_type} ({viewingDiff.entity_id})</span></div>
              <div><strong>Actor:</strong> {viewingDiff.actor_id || "System"}</div>
            </div>
            
            {renderDiffContent(
              viewingDiff.details.before ? JSON.stringify(viewingDiff.details.before, null, 2) : "{}",
              viewingDiff.details.after ? JSON.stringify(viewingDiff.details.after, null, 2) : "{}"
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button 
                onClick={() => setViewingDiff(null)} 
                style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
