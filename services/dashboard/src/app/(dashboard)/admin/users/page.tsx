"use client";

import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Drawer } from '@/components/Drawer';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Dummy Data
const initialUsers = [
  { id: 'usr-1', name: 'Alice Chen', email: 'alice@aegis.com', role: 'admin', queues: ['Tier 3', 'Escalations'], status: 'active', lastActiveAt: '10 mins ago', mfaEnforced: true },
  { id: 'usr-2', name: 'Bob Smith', email: 'bob@aegis.com', role: 'reviewer', queues: ['Tier 1', 'Tier 2'], status: 'active', lastActiveAt: '1 hr ago', mfaEnforced: true },
  { id: 'usr-3', name: 'Charlie Davis', email: 'charlie@aegis.com', role: 'viewer', queues: [], status: 'inactive', lastActiveAt: '5 days ago', mfaEnforced: false },
  { id: 'usr-4', name: 'Diana Prince', email: 'diana@aegis.com', role: 'reviewer', queues: ['Tier 1'], status: 'active', lastActiveAt: 'Just now', mfaEnforced: true },
];

const RoleBadge = ({ role }: { role: string }) => {
  let color = '';
  let bg = '';
  if (role === 'admin') { color = '#818CF8'; bg = 'rgba(129, 140, 248, 0.15)'; } // indigo
  else if (role === 'reviewer') { color = '#38BDF8'; bg = 'rgba(56, 189, 248, 0.15)'; } // sky
  else { color = '#94A3B8'; bg = 'rgba(148, 163, 184, 0.15)'; } // slate

  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '6px',
      backgroundColor: bg,
      color: color,
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'capitalize'
    }}>
      {role}
    </span>
  );
};

const permissionMatrix = [
  { capability: 'View dashboards and health metrics', admin: true, reviewer: true, viewer: true },
  { capability: 'View case queues and audit logs', admin: true, reviewer: true, viewer: true },
  { capability: 'Review and transition cases', admin: true, reviewer: true, viewer: false },
  { capability: 'Create and edit rules', admin: true, reviewer: false, viewer: false },
  { capability: 'Deploy/Rollback ML models', admin: true, reviewer: false, viewer: false },
  { capability: 'Manage users and roles', admin: true, reviewer: false, viewer: false },
];

export default function UsersPage() {
  const [users, setUsers] = useState(initialUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Modals / Drawers state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(null);

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'All' || u.role === roleFilter.toLowerCase();
    const matchesStatus = statusFilter === 'All' || u.status === statusFilter.toLowerCase();
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <input 
            type="text" 
            placeholder="Search users..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', width: '250px' }}
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
            <option>All</option><option>Admin</option><option>Reviewer</option><option>Viewer</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
        </div>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          style={{ backgroundColor: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
        >
          + Invite User
        </button>
      </div>

      {/* Users Table */}
      <div>
        <DataTable
          columns={[
            { key: 'user', header: 'User', render: (u: any) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', border: '1px solid var(--border-color)' }}>
                  {getInitials(u.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                </div>
              </div>
            )},
            { key: 'role', header: 'Role', render: (u: any) => <RoleBadge role={u.role} /> },
            { key: 'queues', header: 'Queues', render: (u: any) => (
              <div style={{ display: 'flex', gap: '4px' }}>
                {u.queues.length === 0 ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>None</span> : 
                  u.queues.map((q: string) => <span key={q} style={{ padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{q}</span>)
                }
              </div>
            )},
            { key: 'status', header: 'Status', render: (u: any) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: u.status === 'active' ? 'var(--risk-low)' : 'var(--text-disabled)' }} />
                <span style={{ textTransform: 'capitalize' }}>{u.status}</span>
              </div>
            )},
            { key: 'lastActiveAt', header: 'Last Active', render: (u: any) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{u.lastActiveAt}</span> },
            { key: 'actions', header: '', render: (u: any) => (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setEditingUser(u)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>Edit</button>
                <button onClick={() => setDeactivatingUserId(u.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-critical)', cursor: 'pointer', fontSize: '0.85rem' }}>Deactivate</button>
              </div>
            )}
          ]}
          rows={filteredUsers}
        />
      </div>

      {/* Permission Matrix */}
      <div>
        <h3 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--text-primary)' }}>Permission Matrix</h3>
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-hover)' }}>
                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Capability</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>Admin</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>Reviewer</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>Viewer</th>
              </tr>
            </thead>
            <tbody>
              {permissionMatrix.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: idx === permissionMatrix.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{row.capability}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.admin ? '✅' : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.reviewer ? '✅' : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{row.viewer ? '✅' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invite User" width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Email Address</label>
            <input type="email" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="user@aegis.com" />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Role</label>
            <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
              <option>Viewer</option>
              <option>Reviewer</option>
              <option>Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => setIsInviteModalOpen(false)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => setIsInviteModalOpen(false)} style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Send Invite</button>
          </div>
        </div>
      </Modal>

      {/* Edit Drawer */}
      <Drawer isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="Edit User">
        {editingUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.125rem' }}>{editingUser.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{editingUser.email}</div>
            </div>
            
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Role</label>
              <select defaultValue={editingUser.role} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value="admin">Admin</option>
                <option value="reviewer">Reviewer</option>
                <option value="viewer">Viewer</option>
              </select>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Note: Role changes will be logged in the Audit Log.</p>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Assigned Queues</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['Tier 1', 'Tier 2', 'Tier 3', 'Escalations'].map(q => (
                  <label key={q} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    <input type="checkbox" defaultChecked={editingUser.queues.includes(q)} />
                    {q}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
              <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: '10px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: '10px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={!!deactivatingUserId}
        title="Deactivate User"
        description="Are you sure you want to deactivate this user? They will immediately lose access to the Aegis console and any active sessions will be terminated."
        confirmLabel="Deactivate"
        danger={true}
        onConfirm={() => {
          setUsers(users.map(u => u.id === deactivatingUserId ? { ...u, status: 'inactive' } : u));
          setDeactivatingUserId(null);
        }}
        onCancel={() => setDeactivatingUserId(null)}
      />
    </div>
  );
}
