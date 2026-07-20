"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { DataTable } from '@/components/DataTable';
import { Drawer } from '@/components/Drawer';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Modals / Drawers state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/analysts");
      setUsers(data || []);
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      await fetchApi(`http://localhost:8080/admin/analysts/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: editingUser.role, is_active: editingUser.is_active })
      });
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      console.error("Failed to update user", err);
      alert("Failed to update user");
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingUserId) return;
    try {
      await fetchApi(`http://localhost:8080/admin/analysts/${deactivatingUserId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false })
      });
      setDeactivatingUserId(null);
      loadUsers();
    } catch (err) {
      console.error("Failed to deactivate user", err);
      alert("Failed to deactivate user");
    }
  };

  const filteredUsers = users.filter(u => {
    const nameMatch = u.full_name ? u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const emailMatch = u.email ? u.email.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const matchesSearch = nameMatch || emailMatch;
    const matchesRole = roleFilter === 'All' || u.role === roleFilter.toLowerCase();
    const statusStr = u.is_active ? 'active' : 'inactive';
    const matchesStatus = statusFilter === 'All' || statusStr === statusFilter.toLowerCase();
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading users...</div>;

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
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', colorScheme: 'dark', appearance: 'auto' }}>
            <option value="All" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>All</option>
            <option value="Admin" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Admin</option>
            <option value="Reviewer" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Reviewer</option>
            <option value="Viewer" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Viewer</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', colorScheme: 'dark', appearance: 'auto' }}>
            <option value="All" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>All</option>
            <option value="Active" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Active</option>
            <option value="Inactive" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Inactive</option>
          </select>
        </div>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', boxShadow: '0 0 12px rgba(99,102,241,0.4)', letterSpacing: '0.02em' }}
        >
          + Add User
        </button>
      </div>

      {/* Users Table */}
      <div>
        <DataTable
          columns={[
            { key: 'name', header: 'Full Name', render: (u: any) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', border: '1px solid var(--border-color)' }}>
                  {getInitials(u.full_name)}
                </div>
                <span style={{ fontWeight: 600 }}>{u.full_name}</span>
              </div>
            )},
            { key: 'email', header: 'Email', render: (u: any) => <span style={{ color: 'var(--text-secondary)' }}>{u.email}</span> },
            { key: 'role', header: 'Role', render: (u: any) => <RoleBadge role={u.role} /> },
            { key: 'queues', header: 'Queues', render: (u: any) => (
              <div style={{ display: 'flex', gap: '4px' }}>
                {!u.queues || u.queues.length === 0 ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>None</span> : 
                  u.queues.map((q: string) => <span key={q} style={{ padding: '2px 6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.75rem' }}>{q}</span>)
                }
              </div>
            )},
            { key: 'status', header: 'Status', render: (u: any) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: u.is_active ? 'var(--risk-low)' : 'var(--text-disabled)' }} />
                <span style={{ textTransform: 'capitalize' }}>{u.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            )},
            { key: 'lastLogin', header: 'Last Login', render: (u: any) => {
              if (!u.last_login) return <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Never</span>;
              const d = new Date(u.last_login);
              const pad = (n: number) => n.toString().padStart(2, '0');
              return <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {`${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
              </span>;
            }},
            { key: 'actions', header: '', render: (u: any) => (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setEditingUser(u)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>Edit</button>
                {u.is_active && <button onClick={() => setDeactivatingUserId(u.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-critical)', cursor: 'pointer', fontSize: '0.85rem' }}>Deactivate</button>}
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
      <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Add User" width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Full Name</label>
            <input type="text" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="John Doe" />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Email Address</label>
            <input type="email" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="user@aegis.com" />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Password</label>
            <input type="password" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="Enter password" />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Role</label>
            <select style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: '#e2e8f0', borderRadius: 'var(--radius-md)', colorScheme: 'dark' }}>
              <option style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Viewer</option>
              <option style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Reviewer</option>
              <option style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => setIsInviteModalOpen(false)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => setIsInviteModalOpen(false)} style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>Add User</button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="Edit User" width="400px">
        {editingUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.125rem' }}>{editingUser.full_name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{editingUser.email}</div>
            </div>
            
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Role</label>
              <select value={editingUser.role} onChange={(e) => setEditingUser({...editingUser, role: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: '#e2e8f0', borderRadius: 'var(--radius-md)', colorScheme: 'dark' }}>
                <option value="admin" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Admin</option>
                <option value="reviewer" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Reviewer</option>
                <option value="viewer" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Viewer</option>
              </select>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Note: Role changes will be logged in the Audit Log.</p>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Active Status</label>
              <select value={editingUser.is_active ? "active" : "inactive"} onChange={(e) => setEditingUser({...editingUser, is_active: e.target.value === "active"})} style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: '#e2e8f0', borderRadius: 'var(--radius-md)', colorScheme: 'dark' }}>
                <option value="active" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Active</option>
                <option value="inactive" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Inactive</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: '10px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUpdateUser} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={!!deactivatingUserId}
        title="Deactivate User"
        description="Are you sure you want to deactivate this user? They will immediately lose access to the Aegis console and any active sessions will be terminated."
        confirmLabel="Deactivate"
        danger={false}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivatingUserId(null)}
      />
    </div>
  );
}
