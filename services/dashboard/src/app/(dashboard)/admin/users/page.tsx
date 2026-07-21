"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const UserPlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" x2="19" y1="12" y2="12"/>
  </svg>
);

// ─── Permission matrix ────────────────────────────────────────────────────────

const permissionMatrix = [
  { capability: 'View dashboards and health metrics',  admin: true,  reviewer: true,  viewer: true  },
  { capability: 'View case queues and audit logs',     admin: true,  reviewer: true,  viewer: true  },
  { capability: 'Review and transition cases',         admin: true,  reviewer: true,  viewer: false },
  { capability: 'Create and edit rules',               admin: true,  reviewer: false, viewer: false },
  { capability: 'Deploy/Rollback ML models',           admin: true,  reviewer: false, viewer: false },
  { capability: 'Manage users and roles',              admin: true,  reviewer: false, viewer: false },
];

// ─── Role badge ───────────────────────────────────────────────────────────────

const RoleBadge = ({ role }: { role: string }) => {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    admin:    { color: '#A5B4FC', bg: 'rgba(79,70,229,0.25)',  border: 'rgba(129,140,248,0.5)' },
    reviewer: { color: '#7DD3FC', bg: 'rgba(2,132,199,0.25)',  border: 'rgba(56,189,248,0.5)'  },
    viewer:   { color: '#CBD5E1', bg: 'rgba(71,85,105,0.25)',  border: 'rgba(148,163,184,0.5)' },
  };
  const m = map[role] || map.viewer;
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '10px', background: m.bg, color: m.color, border: `1px solid ${m.border}`, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {role}
    </span>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const IntModal = ({ isOpen, onClose, title, width = '420px', children }: {
  isOpen: boolean; onClose: () => void; title: string; width?: string; children: React.ReactNode;
}) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: width,
        background: 'linear-gradient(145deg, #0f1117 0%, #0D1117 100%)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)', overflow: 'hidden',
        animation: 'modalIn 0.18s ease',
      }}>
        <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#E8EDF4' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8D9AAB', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}><CloseIcon /></button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
};

// ─── Form primitives ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E8EDF4',
  fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, colorScheme: 'dark', cursor: 'pointer' };

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8D9AAB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
    {children}
  </div>
);

const PrimaryBtn = ({ onClick, disabled, loading, children }: { onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} disabled={disabled || loading} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: (disabled || loading) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)', color: '#fff', fontWeight: 600, fontSize: '0.875rem', boxShadow: '0 4px 14px rgba(92,110,248,0.35)', opacity: (disabled || loading) ? 0.6 : 1 }}>
    {children}
  </button>
);

const CancelBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8D9AAB', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>{children}</button>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [roleFilter, setRoleFilter]     = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const [isInviteOpen, setIsInviteOpen]          = useState(false);
  const [editingUser, setEditingUser]             = useState<any>(null);
  const [deactivatingId, setDeactivatingId]       = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', password: '', role: 'viewer' });
  const [inviteError, setInviteError]   = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const loadUsers = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/analysts');
      setUsers(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleUpdate = async () => {
    if (!editingUser) return;
    try {
      await fetchApi(`http://localhost:8080/admin/analysts/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: editingUser.role, is_active: editingUser.is_active }),
      });
      setEditingUser(null); loadUsers();
    } catch (e) { alert('Failed to update user'); }
  };

  const handleInvite = async () => {
    setInviteError('');
    if (!inviteForm.full_name.trim()) { setInviteError('Full name is required.'); return; }
    if (!inviteForm.email.trim())     { setInviteError('Email is required.'); return; }
    if (!inviteForm.password.trim())  { setInviteError('Password is required.'); return; }
    setInviteLoading(true);
    try {
      await fetchApi('http://localhost:8080/admin/analysts', { method: 'POST', body: JSON.stringify(inviteForm) });
      setIsInviteOpen(false);
      setInviteForm({ full_name: '', email: '', password: '', role: 'viewer' });
      loadUsers();
    } catch (e: any) {
      setInviteError(e?.message || 'Failed to create user. Email may already be in use.');
    } finally { setInviteLoading(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivatingId) return;
    try {
      await fetchApi(`http://localhost:8080/admin/analysts/${deactivatingId}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
      setDeactivatingId(null); loadUsers();
    } catch (e) { alert('Failed to deactivate user'); }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const filtered = users.filter(u => {
    const matchSearch = (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === 'All' || u.role === roleFilter.toLowerCase();
    const matchStatus = statusFilter === 'All' || (u.is_active ? 'active' : 'inactive') === statusFilter.toLowerCase();
    return matchSearch && matchRole && matchStatus;
  });

  const activeCount = users.filter(u => u.is_active).length;
  const adminCount  = users.filter(u => u.role === 'admin').length;

  if (loading) return <div style={{ padding: '40px', color: '#8D9AAB' }}>Loading users…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {[
          { label: 'Total Users', value: String(users.length), sub: 'across all roles', accent: '#5C6EF8', glow: 'rgba(92,110,248,0.12)' },
          { label: 'Active Users', value: String(activeCount), sub: 'with active access', accent: '#34D399', glow: 'rgba(52,211,153,0.12)' },
          { label: 'Admins', value: String(adminCount), sub: 'admin accounts', accent: '#F59E0B', glow: 'rgba(245,158,11,0.12)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.72rem', color: '#8D9AAB', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{s.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#E8EDF4', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#4E5A6B', marginTop: '3px' }}>{s.sub}</div>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '70px', height: '70px', borderRadius: '50%', background: `radial-gradient(circle, ${s.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px' }}>
            <SearchIcon /><span style={{ color: '#4E5A6B' }}>|</span>
            <input type="text" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', color: '#E8EDF4', fontSize: '0.875rem', minWidth: '200px' }} />
          </div>
          {(['All', 'Admin', 'Reviewer', 'Viewer'] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} style={{
              padding: '7px 14px', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              background: roleFilter === r ? 'rgba(92,110,248,0.2)' : 'rgba(255,255,255,0.04)',
              border: roleFilter === r ? '1px solid rgba(92,110,248,0.4)' : '1px solid rgba(255,255,255,0.07)',
              color: roleFilter === r ? '#A5B4FC' : '#8D9AAB',
            }}>
              {r}
            </button>
          ))}
          <button onClick={() => setStatusFilter(statusFilter === 'Active' ? 'All' : 'Active')} style={{
            padding: '7px 14px', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            background: statusFilter === 'Active' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
            border: statusFilter === 'Active' ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.07)',
            color: statusFilter === 'Active' ? '#34D399' : '#8D9AAB',
          }}>
            Active Only
          </button>
        </div>
        <PrimaryBtn onClick={() => setIsInviteOpen(true)}>
          <UserPlusIcon /> Add User
        </PrimaryBtn>
      </div>

      {/* Users Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>No users match your filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                {['Full Name', 'Email', 'Role', 'Queues', 'Status', 'Last Login', ''].map(h => (
                  <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#4E5A6B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(92,110,248,0.12)', border: '1px solid rgba(92,110,248,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#A5B4FC', fontWeight: 700, fontSize: '0.72rem',
                      }}>
                        {getInitials(u.full_name)}
                      </div>
                      <span style={{ fontWeight: 600, color: '#E8EDF4' }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#8D9AAB', fontSize: '0.82rem' }}>{u.email}</td>
                  <td style={{ padding: '14px 18px' }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {!u.queues || u.queues.length === 0
                        ? <span style={{ color: '#4E5A6B', fontSize: '0.8rem', fontStyle: 'italic' }}>None</span>
                        : u.queues.map((q: string) => (
                          <span key={q} style={{ padding: '2px 7px', background: 'rgba(92,110,248,0.1)', border: '1px solid rgba(92,110,248,0.2)', borderRadius: '5px', fontSize: '0.72rem', color: '#A5B4FC' }}>{q}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: u.is_active ? '#34D399' : '#4E5A6B' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: u.is_active ? '#34D399' : '#4E5A6B', boxShadow: u.is_active ? '0 0 5px rgba(52,211,153,0.5)' : 'none' }} />
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#8D9AAB', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {u.last_login
                      ? new Date(u.last_login).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : <span style={{ fontStyle: 'italic', color: '#4E5A6B' }}>Never</span>}
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingUser(u)} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(92,110,248,0.08)', border: '1px solid rgba(92,110,248,0.2)', color: '#A5B4FC', fontSize: '0.75rem', fontWeight: 600 }}>Edit</button>
                      {u.is_active && (
                        <button onClick={() => setDeactivatingId(u.id)} style={{ padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#FCA5A5', fontSize: '0.75rem', fontWeight: 600 }}>Deactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Permission Matrix */}
      <div>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#E8EDF4' }}>Permission Matrix</div>
          <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>What each role can do in Aegis</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#4E5A6B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Capability</th>
                {[
                  { role: 'Admin', color: '#A5B4FC' },
                  { role: 'Reviewer', color: '#7DD3FC' },
                  { role: 'Viewer', color: '#94A3B8' },
                ].map(r => (
                  <th key={r.role} style={{ padding: '12px 20px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: r.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{r.role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionMatrix.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: idx < permissionMatrix.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '13px 20px', color: '#E8EDF4' }}>{row.capability}</td>
                  {[row.admin, row.reviewer, row.viewer].map((allowed, j) => (
                    <td key={j} style={{ padding: '13px 20px', textAlign: 'center' }}>
                      {allowed
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(52,211,153,0.15)', color: '#34D399' }}><CheckIcon /></span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', color: '#4E5A6B' }}><MinusIcon /></span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Add User */}
      <IntModal isOpen={isInviteOpen} onClose={() => { setIsInviteOpen(false); setInviteError(''); setInviteForm({ full_name: '', email: '', password: '', role: 'viewer' }); }} title="Add New User">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {inviteError && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '8px', color: '#FCA5A5', fontSize: '0.85rem' }}>
              {inviteError}
            </div>
          )}
          <FormField label="Full Name">
            <input style={inputStyle} type="text" placeholder="e.g. Jane Smith" value={inviteForm.full_name} onChange={e => setInviteForm({ ...inviteForm, full_name: e.target.value })} />
          </FormField>
          <FormField label="Email Address">
            <input style={inputStyle} type="email" placeholder="user@company.com" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} />
          </FormField>
          <FormField label="Password">
            <input style={inputStyle} type="password" placeholder="Enter password" value={inviteForm.password} onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })} />
          </FormField>
          <FormField label="Role">
            <select style={selectStyle} value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}>
              <option value="viewer">Viewer — read-only access</option>
              <option value="reviewer">Reviewer — can work cases</option>
              <option value="admin">Admin — full system access</option>
            </select>
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <CancelBtn onClick={() => { setIsInviteOpen(false); setInviteError(''); }}>Cancel</CancelBtn>
            <PrimaryBtn onClick={handleInvite} loading={inviteLoading}>{inviteLoading ? 'Adding…' : 'Add User'}</PrimaryBtn>
          </div>
        </div>
      </IntModal>

      {/* Edit User */}
      <IntModal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="Edit User">
        {editingUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(92,110,248,0.15)', border: '1px solid rgba(92,110,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A5B4FC', fontWeight: 700 }}>
                {getInitials(editingUser.full_name)}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#E8EDF4' }}>{editingUser.full_name}</div>
                <div style={{ color: '#8D9AAB', fontSize: '0.82rem' }}>{editingUser.email}</div>
              </div>
            </div>
            <FormField label="Role">
              <select style={selectStyle} value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="reviewer">Reviewer</option>
                <option value="viewer">Viewer</option>
              </select>
            </FormField>
            <FormField label="Active Status">
              <select style={selectStyle} value={editingUser.is_active ? 'active' : 'inactive'} onChange={e => setEditingUser({ ...editingUser, is_active: e.target.value === 'active' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
            <div style={{ fontSize: '0.75rem', color: '#4E5A6B', padding: '6px 0' }}>Role changes will be recorded in the Audit Log.</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <CancelBtn onClick={() => setEditingUser(null)}>Cancel</CancelBtn>
              <PrimaryBtn onClick={handleUpdate}>Save Changes</PrimaryBtn>
            </div>
          </div>
        )}
      </IntModal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivatingId}
        title="Deactivate User"
        description="Are you sure? This user will immediately lose access to Aegis and all active sessions will be terminated."
        confirmLabel="Deactivate"
        danger={false}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivatingId(null)}
      />
    </div>
  );
}
