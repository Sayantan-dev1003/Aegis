"use client";

import React, { useState, useEffect, useRef } from 'react';
import { fetchApi } from "../../../lib/api";
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ─── Icons (inline SVG) ──────────────────────────────────────────────────────

const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
  </svg>
);

const WebhookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const ActivityIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>
  </svg>
);

// ─── Scope badge ──────────────────────────────────────────────────────────────

const SCOPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  read_only:  { label: 'read_only',  color: '#7DD3FC', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.3)'  },
  evaluate:   { label: 'evaluate',   color: '#A5B4FC', bg: 'rgba(129,140,248,0.12)', border: 'rgba(129,140,248,0.3)' },
  report:     { label: 'report',     color: '#86EFAC', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
};

const ScopeBadge = ({ scope }: { scope: string }) => {
  const meta = SCOPE_META[scope] || { label: scope, color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 600,
      color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
      fontFamily: 'monospace', whiteSpace: 'nowrap', letterSpacing: '0.02em',
    }}>
      <ShieldIcon />
      {meta.label}
    </span>
  );
};

// ─── Event badge ──────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { color: string; bg: string }> = {
  'case.created':   { color: '#86EFAC', bg: 'rgba(74,222,128,0.12)'  },
  'case.resolved':  { color: '#7DD3FC', bg: 'rgba(56,189,248,0.12)'  },
  'rule.breached':  { color: '#FCA5A5', bg: 'rgba(248,113,113,0.12)' },
};

const EventBadge = ({ event }: { event: string }) => {
  const meta = EVENT_META[event] || { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      fontSize: '0.7rem', fontWeight: 600, color: meta.color, background: meta.bg,
      fontFamily: 'monospace', whiteSpace: 'nowrap',
    }}>
      {event}
    </span>
  );
};

// ─── Status dot ───────────────────────────────────────────────────────────────

const StatusDot = ({ active }: { active: boolean }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontSize: '0.8rem', fontWeight: 500,
    color: active ? '#34D399' : '#F87171',
  }}>
    <span style={{
      width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
      backgroundColor: active ? '#34D399' : '#F87171',
      boxShadow: active ? '0 0 6px rgba(52,211,153,0.5)' : '0 0 6px rgba(248,113,113,0.5)',
    }} />
    {active ? 'Active' : 'Inactive'}
  </span>
);

// ─── Copy button ──────────────────────────────────────────────────────────────

const CopyButton = ({ text, style }: { text: string; style?: React.CSSProperties }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={handleCopy} style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
      background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
      border: copied ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(255,255,255,0.1)',
      color: copied ? '#34D399' : '#94A3B8',
      fontSize: '0.75rem', fontWeight: 500,
      transition: 'all 0.2s ease',
      ...style,
    }}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

// ─── Empty State ─────────────────────────────────────────────────────────────

const EmptySlate = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '56px 24px', gap: '12px', textAlign: 'center',
  }}>
    <div style={{
      width: '52px', height: '52px', borderRadius: '14px',
      background: 'rgba(92,110,248,0.08)', border: '1px solid rgba(92,110,248,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(92,110,248,0.6)',
    }}>
      {icon}
    </div>
    <div style={{ color: '#E8EDF4', fontWeight: 600, fontSize: '0.95rem' }}>{title}</div>
    <div style={{ color: '#8D9AAB', fontSize: '0.82rem', maxWidth: '260px', lineHeight: 1.6 }}>{desc}</div>
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────

const IntModal = ({
  isOpen, onClose, title, children, width = '460px',
}: {
  isOpen: boolean; onClose: () => void; title: string;
  children: React.ReactNode; width?: string;
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      }} />
      {/* Panel */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: width,
        background: 'linear-gradient(145deg, #0f1117 0%, #0D1117 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(92,110,248,0.1)',
        overflow: 'hidden',
        animation: 'modalIn 0.18s ease',
      }}>
        <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#E8EDF4' }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#8D9AAB',
            padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}>
            <CloseIcon />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
};

// ─── Drawer ───────────────────────────────────────────────────────────────────

const IntDrawer = ({
  isOpen, onClose, title, subtitle, children,
}: {
  isOpen: boolean; onClose: () => void; title: string;
  subtitle?: string; children: React.ReactNode;
}) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
      <div onClick={onClose} style={{
        flex: 1, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
      }} />
      <div style={{
        width: '560px', height: '100%', overflow: 'auto',
        background: 'linear-gradient(180deg, #0D1117 0%, #07090E 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        animation: 'drawerIn 0.22s ease',
      }}>
        <style>{`@keyframes drawerIn { from { transform:translateX(40px); opacity:0; } to { transform:translateX(0); opacity:1; } }`}</style>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#E8EDF4' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#8D9AAB',
            padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center',
          }}>
            <CloseIcon />
          </button>
        </div>
        <div style={{ padding: '24px', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
};

// ─── Styled checkbox ──────────────────────────────────────────────────────────

const CheckboxRow = ({
  id, label, sublabel, checked, onChange,
}: {
  id: string; label: string; sublabel?: string; checked: boolean; onChange: (checked: boolean) => void;
}) => (
  <label htmlFor={id} style={{
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
    background: checked ? 'rgba(92,110,248,0.07)' : 'transparent',
    border: `1px solid ${checked ? 'rgba(92,110,248,0.25)' : 'rgba(255,255,255,0.05)'}`,
    transition: 'all 0.15s ease',
  }}>
    <div style={{
      width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
      background: checked ? 'var(--primary-color, #5C6EF8)' : 'rgba(255,255,255,0.05)',
      border: `2px solid ${checked ? 'transparent' : 'rgba(255,255,255,0.2)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s ease',
    }}>
      {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
    </div>
    <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
    <div>
      <div style={{ color: '#E8EDF4', fontSize: '0.875rem', fontWeight: checked ? 600 : 400 }}>{label}</div>
      {sublabel && <div style={{ color: '#8D9AAB', fontSize: '0.75rem', marginTop: '1px' }}>{sublabel}</div>}
    </div>
  </label>
);

// ─── Form input ───────────────────────────────────────────────────────────────

const FormField = ({
  label, children,
}: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8D9AAB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </label>
    {children}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#E8EDF4', fontSize: '0.875rem',
  outline: 'none', transition: 'border-color 0.15s',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys');

  // API Keys state
  const [keys, setKeys] = useState<any[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<any>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [newKeyForm, setNewKeyForm] = useState({ name: '', scopes: [] as string[] });

  // Webhooks state
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(true);
  const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false);
  const [viewingWebhook, setViewingWebhook] = useState<any>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<any[]>([]);
  const [newWebhookForm, setNewWebhookForm] = useState({ url: '', events: [] as string[] });

  const loadKeys = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/api-keys");
      setKeys(data || []);
    } catch (err) {
      console.error("Failed to load keys", err);
    } finally {
      setKeysLoading(false);
    }
  };

  const loadWebhooks = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/webhooks");
      setWebhooks(data || []);
    } catch (err) {
      console.error("Failed to load webhooks", err);
    } finally {
      setWebhooksLoading(false);
    }
  };

  useEffect(() => { loadKeys(); loadWebhooks(); }, []);

  const handleGenerateKey = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/api-keys", {
        method: "POST",
        body: JSON.stringify(newKeyForm),
      });
      setNewKeyData(data);
      loadKeys();
    } catch (err) {
      console.error("Failed to generate key", err);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokingKeyId) return;
    try {
      await fetchApi(`http://localhost:8080/admin/api-keys/${revokingKeyId}`, { method: "DELETE" });
      setRevokingKeyId(null);
      loadKeys();
    } catch (err) {
      console.error("Failed to revoke key", err);
    }
  };

  const handleCloseKeyModal = () => {
    setIsCreateKeyOpen(false);
    setNewKeyData(null);
    setNewKeyForm({ name: '', scopes: [] });
  };

  const handleAddWebhook = async () => {
    try {
      await fetchApi("http://localhost:8080/admin/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: newWebhookForm.url, events: newWebhookForm.events, is_active: true }),
      });
      setIsCreateWebhookOpen(false);
      setNewWebhookForm({ url: '', events: [] });
      loadWebhooks();
    } catch (err) {
      console.error("Failed to add webhook", err);
    }
  };

  const handleViewDeliveries = async (webhook: any) => {
    setViewingWebhook(webhook);
    setWebhookDeliveries([]);
    try {
      const data = await fetchApi(`http://localhost:8080/admin/webhooks/${webhook.id}/deliveries`);
      setWebhookDeliveries(data || []);
    } catch (err) {
      console.error("Failed to load deliveries", err);
    }
  };

  // ─── Derived stats ──────────────────────────────────────────────────────────
  const activeKeys = keys.filter(k => !k.revoked_at).length;
  const activeWebhooks = webhooks.filter(w => w.is_active).length;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {[
          {
            icon: <KeyIcon />, label: 'Active API Keys', value: keysLoading ? '—' : String(activeKeys),
            sub: `${keys.length} total issued`, accent: '#5C6EF8',
          },
          {
            icon: <WebhookIcon />, label: 'Active Webhooks', value: webhooksLoading ? '—' : String(activeWebhooks),
            sub: `${webhooks.length} endpoints registered`, accent: '#06B6D4',
          },
          {
            icon: <ActivityIcon />, label: 'Event Types', value: '3',
            sub: 'case.created · case.resolved · rule.breached', accent: '#8B5CF6',
          },
        ].map(s => (
          <div key={s.label} style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px', padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: '16px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0,
              background: `${s.accent}18`, border: `1px solid ${s.accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: s.accent,
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#8D9AAB', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{s.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E8EDF4', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: '#4E5A6B', marginTop: '3px' }}>{s.sub}</div>
            </div>
            {/* Decorative glow */}
            <div style={{
              position: 'absolute', top: '-20px', right: '-20px',
              width: '80px', height: '80px', borderRadius: '50%',
              background: `radial-gradient(circle, ${s.accent}10 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '0',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px', padding: '4px', width: 'fit-content',
      }}>
        {(['keys', 'webhooks'] as const).map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '7px 18px', borderRadius: '7px', cursor: 'pointer',
                background: isActive ? 'linear-gradient(135deg, rgba(92,110,248,0.25) 0%, rgba(92,110,248,0.15) 100%)' : 'transparent',
                color: isActive ? '#A5B4FC' : '#8D9AAB',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                border: isActive ? '1px solid rgba(92,110,248,0.3)' : '1px solid transparent',
                transition: 'all 0.18s ease',
              } as React.CSSProperties}
            >
              {tab === 'keys' ? <KeyIcon /> : <WebhookIcon />}
              {tab === 'keys' ? 'API Keys' : 'Webhooks'}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '20px', height: '18px', borderRadius: '9px', padding: '0 5px',
                fontSize: '0.65rem', fontWeight: 700,
                background: isActive ? 'rgba(92,110,248,0.3)' : 'rgba(255,255,255,0.06)',
                color: isActive ? '#A5B4FC' : '#4E5A6B',
              }}>
                {tab === 'keys' ? keys.length : webhooks.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════ API KEYS TAB ═══════════════════════════ */}
      {activeTab === 'keys' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#E8EDF4' }}>API Keys</div>
              <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>
                Machine-to-machine authentication tokens with scoped permissions.
              </div>
            </div>
            <button
              onClick={() => setIsCreateKeyOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)',
                color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                boxShadow: '0 4px 14px rgba(92,110,248,0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <PlusIcon />
              Generate New Key
            </button>
          </div>

          {/* Table */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px',
            overflow: 'hidden',
          }}>
            {keysLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>
                Loading API keys…
              </div>
            ) : keys.length === 0 ? (
              <EmptySlate
                icon={<KeyIcon />}
                title="No API keys yet"
                desc="Generate your first API key to start making programmatic requests to the Aegis API."
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Name', 'Key Prefix', 'Scopes', 'Created', 'Last Used', ''].map(h => (
                      <th key={h} style={{
                        padding: '12px 18px', textAlign: 'left',
                        fontSize: '0.72rem', fontWeight: 600, color: '#4E5A6B',
                        textTransform: 'uppercase', letterSpacing: '0.07em',
                        background: 'rgba(255,255,255,0.02)',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k, i) => (
                    <tr key={k.id} style={{
                      borderBottom: i < keys.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      transition: 'background 0.12s',
                    }}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
                            background: 'rgba(92,110,248,0.1)', border: '1px solid rgba(92,110,248,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#7E8DF9', fontSize: '0.6rem', fontWeight: 700,
                          }}>
                            <KeyIcon />
                          </div>
                          <span style={{ fontWeight: 600, color: '#E8EDF4' }}>{k.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: '0.82rem', color: '#A5B4FC',
                          background: 'rgba(92,110,248,0.08)', border: '1px solid rgba(92,110,248,0.2)',
                          padding: '3px 8px', borderRadius: '6px',
                        }}>
                          {k.key_prefix}…
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(k.scopes || []).map((s: string) => <ScopeBadge key={s} scope={s} />)}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#8D9AAB', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {new Date(k.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#8D9AAB', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : <span style={{ color: '#4E5A6B', fontStyle: 'italic' }}>Never used</span>}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <button
                          onClick={() => setRevokingKeyId(k.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', border: 'none',
                            background: 'rgba(248,113,113,0.08)', color: '#FCA5A5',
                            fontSize: '0.75rem', fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <TrashIcon />
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════ WEBHOOKS TAB ═════════════════════════════ */}
      {activeTab === 'webhooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#E8EDF4' }}>Webhooks</div>
              <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>
                Push real-time fraud events to your own HTTP endpoints.
              </div>
            </div>
            <button
              onClick={() => setIsCreateWebhookOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)',
                color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                boxShadow: '0 4px 14px rgba(92,110,248,0.35)',
              }}
            >
              <PlusIcon />
              Add Webhook
            </button>
          </div>

          {/* Cards */}
          {webhooksLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>
              Loading webhooks…
            </div>
          ) : webhooks.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '14px',
            }}>
              <EmptySlate
                icon={<WebhookIcon />}
                title="No webhooks configured"
                desc="Add a webhook to receive real-time notifications when fraud events occur in your system."
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {webhooks.map(w => {
                const successRate = w.success_rate_pct ?? 100;
                const isHealthy = successRate >= 90;
                return (
                  <div key={w.id} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '12px', padding: '18px 20px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    transition: 'border-color 0.15s, background 0.15s',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Left accent bar */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
                      background: w.is_active ? 'linear-gradient(180deg, #34D399, #059669)' : '#374151',
                      borderRadius: '3px 0 0 3px',
                    }} />

                    {/* Webhook icon */}
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                      background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22D3EE',
                    }}>
                      <WebhookIcon />
                    </div>

                    {/* URL & events */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600, color: '#E8EDF4',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {w.url}
                        </span>
                        <StatusDot active={w.is_active} />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(w.events || []).map((e: string) => <EventBadge key={e} event={e} />)}
                      </div>
                    </div>

                    {/* Success rate */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontSize: '1.2rem', fontWeight: 700,
                        color: isHealthy ? '#34D399' : '#F87171',
                        lineHeight: 1,
                      }}>
                        {successRate}%
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#4E5A6B', marginTop: '2px' }}>success rate</div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleViewDeliveries(w)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '6px 12px', borderRadius: '7px', cursor: 'pointer',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#8D9AAB', fontSize: '0.78rem', fontWeight: 500,
                          transition: 'all 0.15s',
                        }}
                      >
                        <ActivityIcon />
                        Deliveries
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ MODALS & DRAWERS ══════════════════════════════ */}

      {/* Generate API Key Modal */}
      <IntModal
        isOpen={isCreateKeyOpen}
        onClose={handleCloseKeyModal}
        title={newKeyData ? "🔑 Your New API Key" : "Generate API Key"}
        width={newKeyData ? "540px" : "420px"}
      >
        {!newKeyData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormField label="Key Name">
              <input
                type="text"
                value={newKeyForm.name}
                onChange={e => setNewKeyForm({ ...newKeyForm, name: e.target.value })}
                placeholder="e.g., Backend Worker, CI/CD Pipeline"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Permissions">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { scope: 'read_only', label: 'Read Only', sub: 'Fetch fraud decisions, cases, and configuration' },
                  { scope: 'evaluate',  label: 'Evaluate',  sub: 'Submit transactions for scoring and decisions' },
                  { scope: 'report',    label: 'Report',    sub: 'Access analytics, audit logs, and exports' },
                ].map(({ scope, label, sub }) => (
                  <CheckboxRow
                    key={scope} id={`scope-${scope}`}
                    label={label} sublabel={sub}
                    checked={newKeyForm.scopes.includes(scope)}
                    onChange={checked => {
                      const next = checked
                        ? [...newKeyForm.scopes, scope]
                        : newKeyForm.scopes.filter(s => s !== scope);
                      setNewKeyForm({ ...newKeyForm, scopes: next });
                    }}
                  />
                ))}
              </div>
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button onClick={handleCloseKeyModal} style={{
                padding: '8px 16px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#8D9AAB', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
              }}>
                Cancel
              </button>
              <button
                onClick={handleGenerateKey}
                disabled={!newKeyForm.name.trim() || newKeyForm.scopes.length === 0}
                style={{
                  padding: '8px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #5C6EF8, #7E8DF9)',
                  color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                  opacity: (!newKeyForm.name.trim() || newKeyForm.scopes.length === 0) ? 0.5 : 1,
                  boxShadow: '0 4px 12px rgba(92,110,248,0.3)',
                }}
              >
                Generate Key
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Warning banner */}
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              display: 'flex', gap: '12px',
            }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FCD34D', marginBottom: '3px' }}>
                  Copy this key now — it won't be shown again
                </div>
                <div style={{ fontSize: '0.78rem', color: '#92400E', lineHeight: 1.5 }}>
                  For security reasons, this key is displayed only once. If you lose it, you'll need to revoke it and issue a new one.
                </div>
              </div>
            </div>

            {/* Key display */}
            <FormField label="API Key">
              <div style={{
                display: 'flex', gap: '8px', alignItems: 'stretch',
                padding: '12px 14px', borderRadius: '9px',
                background: '#000', border: '1px solid rgba(92,110,248,0.3)',
              }}>
                <span style={{
                  flex: 1, fontFamily: 'monospace', fontSize: '0.82rem', color: '#A5B4FC',
                  wordBreak: 'break-all', lineHeight: 1.6,
                }}>
                  {newKeyData.plaintext_key || ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <CopyButton text={newKeyData.plaintext_key || ''} />
              </div>
            </FormField>

            <button
              onClick={handleCloseKeyModal}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #5C6EF8, #7E8DF9)',
                color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                boxShadow: '0 4px 12px rgba(92,110,248,0.3)',
              }}
            >
              ✓ I've saved this key securely
            </button>
          </div>
        )}
      </IntModal>

      {/* Revoke Key Confirm */}
      <ConfirmDialog
        isOpen={!!revokingKeyId}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? Any services using this key will immediately lose access and requests will fail."
        confirmLabel="Revoke Key"
        danger={true}
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokingKeyId(null)}
      />

      {/* Add Webhook Modal */}
      <IntModal isOpen={isCreateWebhookOpen} onClose={() => setIsCreateWebhookOpen(false)} title="Add Webhook" width="480px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Endpoint URL">
            <input
              type="url"
              value={newWebhookForm.url}
              onChange={e => setNewWebhookForm({ ...newWebhookForm, url: e.target.value })}
              placeholder="https://your-service.com/webhooks/aegis"
              style={inputStyle}
            />
          </FormField>

          <FormField label="Events to Subscribe">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { event: 'case.created',  label: 'Case Created',  sub: 'Fired when a new fraud case is opened for review' },
                { event: 'case.resolved', label: 'Case Resolved', sub: 'Fired when a case is closed with a decision' },
                { event: 'rule.breached', label: 'Rule Breached',  sub: 'Fired when a velocity or fraud rule is triggered' },
              ].map(({ event, label, sub }) => (
                <CheckboxRow
                  key={event} id={`event-${event}`}
                  label={label} sublabel={sub}
                  checked={newWebhookForm.events.includes(event)}
                  onChange={checked => {
                    const next = checked
                      ? [...newWebhookForm.events, event]
                      : newWebhookForm.events.filter(ev => ev !== event);
                    setNewWebhookForm({ ...newWebhookForm, events: next });
                  }}
                />
              ))}
            </div>
          </FormField>

          {/* Signing secret info */}
          <div style={{
            padding: '12px 14px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
            display: 'flex', gap: '10px', alignItems: 'center',
          }}>
            <ShieldIcon />
            <div style={{ fontSize: '0.78rem', color: '#8D9AAB', lineHeight: 1.5 }}>
              An HMAC-SHA256 signing secret will be generated and returned upon creation.
              Use it to verify that requests originate from Aegis.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button onClick={() => setIsCreateWebhookOpen(false)} style={{
              padding: '8px 16px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: '#8D9AAB', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
            }}>
              Cancel
            </button>
            <button
              onClick={handleAddWebhook}
              disabled={!newWebhookForm.url.trim() || newWebhookForm.events.length === 0}
              style={{
                padding: '8px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #5C6EF8, #7E8DF9)',
                color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                opacity: (!newWebhookForm.url.trim() || newWebhookForm.events.length === 0) ? 0.5 : 1,
                boxShadow: '0 4px 12px rgba(92,110,248,0.3)',
              }}
            >
              Add Webhook
            </button>
          </div>
        </div>
      </IntModal>

      {/* Delivery Logs Drawer */}
      <IntDrawer
        isOpen={!!viewingWebhook}
        onClose={() => setViewingWebhook(null)}
        title="Delivery Logs"
        subtitle={viewingWebhook?.url}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {webhookDeliveries.length === 0 ? (
            <EmptySlate
              icon={<ActivityIcon />}
              title="No deliveries yet"
              desc="Deliveries will appear here once Aegis starts sending events to this endpoint."
            />
          ) : webhookDeliveries.map(del => (
            <div key={del.id} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${del.success ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
            }}>
              {/* Status dot */}
              <div style={{
                width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0,
                background: del.success ? '#34D399' : '#F87171',
                boxShadow: `0 0 6px ${del.success ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)'}`,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, color: '#E8EDF4', fontSize: '0.875rem' }}>{del.event_type}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8D9AAB' }}>
                  {new Date(del.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem',
                  color: del.response_status >= 200 && del.response_status < 300 ? '#34D399' : '#F87171',
                }}>
                  HTTP {del.response_status}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#8D9AAB' }}>{del.response_ms}ms</div>
              </div>

              {!del.success && (
                <button style={{
                  padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                  color: '#FCA5A5', fontWeight: 600, flexShrink: 0,
                }}>
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      </IntDrawer>
    </div>
  );
}
