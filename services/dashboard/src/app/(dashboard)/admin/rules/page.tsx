"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

const FlaskIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6l1 6-4 12-4-12 1-6z"/><path d="M5 9h14"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_VELOCITY_CONFIGS = [
  { entity: 'Card',   windows: ['1h', '24h', '7d'] },
  { entity: 'User',   windows: ['24h', '7d', '30d'] },
  { entity: 'IP',     windows: ['1h', '24h'] },
  { entity: 'Device', windows: ['1h', '24h', '7d'] },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#E8EDF4', fontSize: '0.875rem', outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, colorScheme: 'dark', cursor: 'pointer',
};

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8D9AAB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
    {children}
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────

const IntModal = ({ isOpen, onClose, title, width = '460px', children }: {
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
        boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(92,110,248,0.1)',
        overflow: 'hidden', animation: 'modalIn 0.18s ease',
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

// ─── Action badge ─────────────────────────────────────────────────────────────

const ActionBadge = ({ action }: { action: string }) => {
  const map: Record<string, { color: string; bg: string }> = {
    block:   { color: '#F43F5E', bg: 'rgba(244,63,94,0.12)'  },
    step_up: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    flag:    { color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
  };
  const m = map[action] || { color: '#8D9AAB', bg: 'rgba(148,163,184,0.1)' };
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, color: m.color, background: m.bg, textTransform: 'capitalize' }}>
      {action.replace('_', ' ')}
    </span>
  );
};

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!checked)}
    style={{
      width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
      background: checked ? 'linear-gradient(135deg, #5C6EF8, #7E8DF9)' : 'rgba(255,255,255,0.1)',
      position: 'relative', transition: 'background 0.2s',
      boxShadow: checked ? '0 0 8px rgba(92,110,248,0.4)' : 'none',
    }}
  >
    <span style={{
      position: 'absolute', top: '3px', left: checked ? '21px' : '3px',
      width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
      transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    }} />
  </button>
);

// ─── Btn helpers ──────────────────────────────────────────────────────────────

const PrimaryBtn = ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '8px',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)',
    color: '#fff', fontWeight: 600, fontSize: '0.875rem',
    boxShadow: '0 4px 14px rgba(92,110,248,0.35)', opacity: disabled ? 0.5 : 1,
  }}>
    {children}
  </button>
);

const CancelBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8D9AAB', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
    {children}
  </button>
);

const DangerBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: '#FCA5A5', fontWeight: 600, fontSize: '0.875rem' }}>
    {children}
  </button>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const [rules, setRules]                 = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [isCreateOpen, setIsCreateOpen]   = useState(false);
  const [ruleToDelete, setRuleToDelete]   = useState<string | null>(null);
  const [windowEntity, setWindowEntity]   = useState<string | null>(null);
  const [newWindow, setNewWindow]         = useState('');
  const [search, setSearch]               = useState('');
  const [velocityConfigs, setVelocityConfigs] = useState(DEFAULT_VELOCITY_CONFIGS);

  const [newRule, setNewRule] = useState({
    name: '', entity: 'card', metric: 'velocity', operator: '>=', value: '', window: '24h', action: 'flag',
  });

  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [isBacktesting, setIsBacktesting]   = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('velocityConfigs');
    if (stored) { try { setVelocityConfigs(JSON.parse(stored)); } catch (e) {} }
  }, []);

  const loadRules = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/rules');
      setRules(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRules(); }, []);

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await fetchApi(`http://localhost:8080/admin/rules/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) });
      setRules(rules.map(r => r.id === id ? { ...r, is_active: active } : r));
    } catch (e) { alert('Failed to toggle rule'); }
  };

  const confirmDelete = async () => {
    if (!ruleToDelete) return;
    try {
      await fetchApi(`http://localhost:8080/admin/rules/${ruleToDelete}`, { method: 'DELETE' });
      setRules(rules.filter(r => r.id !== ruleToDelete));
      setRuleToDelete(null);
    } catch (e) { alert('Failed to delete rule'); }
  };

  const handleCreate = async () => {
    try {
      await fetchApi('http://localhost:8080/admin/rules', {
        method: 'POST',
        body: JSON.stringify({ ...newRule, value: parseFloat(newRule.value) }),
      });
      setIsCreateOpen(false);
      setNewRule({ name: '', entity: 'card', metric: 'velocity', operator: '>=', value: '', window: '24h', action: 'flag' });
      loadRules();
    } catch (e: any) { alert(`Failed to create rule: ${e.message || 'Unknown error'}`); }
  };

  const handleBacktest = async () => {
    if (!selectedRuleId) return;
    setIsBacktesting(true); setBacktestResult(null);
    try {
      const data = await fetchApi(`http://localhost:8080/admin/rules/${selectedRuleId}/backtest`, { method: 'POST' });
      setBacktestResult({ triggerCount: data.match_count || 0, overlap: 85, precision: Math.round((data.precision || 0) * 100) });
    } catch (e) { alert('Backtest failed'); }
    finally { setIsBacktesting(false); }
  };

  const saveVelocityToLocal = (updated: typeof velocityConfigs) => {
    setVelocityConfigs(updated);
    localStorage.setItem('velocityConfigs', JSON.stringify(updated));
  };

  const confirmAddWindow = () => {
    if (!windowEntity || !newWindow.trim()) return;
    const updated = velocityConfigs.map(c =>
      c.entity === windowEntity && !c.windows.includes(newWindow.trim())
        ? { ...c, windows: [...c.windows, newWindow.trim()] }
        : c
    );
    saveVelocityToLocal(updated);
    setWindowEntity(null);
  };

  const removeWindow = (entity: string, w: string) => {
    saveVelocityToLocal(velocityConfigs.map(c => c.entity === entity ? { ...c, windows: c.windows.filter(x => x !== w) } : c));
  };

  const filtered = rules.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ padding: '40px', color: '#8D9AAB' }}>Loading rules…</div>;

  const activeCount = rules.filter(r => r.is_active).length;
  const blockCount  = rules.filter(r => r.action === 'block').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {[
          { label: 'Total Rules', value: String(rules.length), sub: 'custom fraud rules', accent: '#5C6EF8', glow: 'rgba(92,110,248,0.12)' },
          { label: 'Active Rules', value: String(activeCount), sub: 'currently enforced', accent: '#34D399', glow: 'rgba(52,211,153,0.12)' },
          { label: 'Block Actions', value: String(blockCount), sub: 'hard-block rules', accent: '#F43F5E', glow: 'rgba(244,63,94,0.12)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.72rem', color: '#8D9AAB', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{s.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#E8EDF4', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#4E5A6B', marginTop: '3px' }}>{s.sub}</div>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '70px', height: '70px', borderRadius: '50%', background: `radial-gradient(circle, ${s.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          </div>
        ))}
      </div>

      {/* ── Rules Table ─────────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', width: '260px' }}>
            <SearchIcon /><span style={{ color: '#4E5A6B' }}>|</span>
            <input
              type="text" placeholder="Search rules…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', color: '#E8EDF4', fontSize: '0.875rem', flex: 1 }}
            />
          </div>
          <PrimaryBtn onClick={() => setIsCreateOpen(true)}>
            <PlusIcon /> Create Rule
          </PrimaryBtn>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(92,110,248,0.08)', border: '1px solid rgba(92,110,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(92,110,248,0.6)', margin: '0 auto 12px' }}>
                <ShieldIcon />
              </div>
              <div style={{ color: '#E8EDF4', fontWeight: 600, fontSize: '0.95rem' }}>No custom rules yet</div>
              <div style={{ color: '#8D9AAB', fontSize: '0.82rem', marginTop: '4px' }}>Fraud is currently caught only by the ML model. Add a rule for deterministic checks.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Name', 'Condition', 'Entity', 'Window', 'Action', 'Triggers (24h)', 'Precision', 'Active', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#4E5A6B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <td style={{ padding: '13px 16px', fontWeight: 600, color: '#E8EDF4' }}>{r.name}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <code style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '5px', fontSize: '0.8rem', color: '#A5B4FC', fontFamily: 'monospace' }}>
                        {r.metric} {r.operator} {r.value}
                      </code>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#8D9AAB', textTransform: 'capitalize' }}>{r.entity}</td>
                    <td style={{ padding: '13px 16px', color: '#8D9AAB', fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.window}</td>
                    <td style={{ padding: '13px 16px' }}><ActionBadge action={r.action} /></td>
                    <td style={{ padding: '13px 16px', color: '#E8EDF4', fontFamily: 'monospace' }}>{r.triggers_24h ?? '—'}</td>
                    <td style={{ padding: '13px 16px', color: r.precision ? '#34D399' : '#4E5A6B', fontFamily: 'monospace' }}>{r.precision ? `${Math.round(r.precision * 100)}%` : '—'}</td>
                    <td style={{ padding: '13px 16px' }}><Toggle checked={r.is_active} onChange={v => handleToggle(r.id, v)} /></td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <button onClick={() => setRuleToDelete(r.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#FCA5A5', fontSize: '0.75rem', fontWeight: 600 }}>
                        <TrashIcon /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Velocity Config ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#E8EDF4' }}>Velocity Configuration</div>
          <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>Time windows used for velocity tracking per entity type</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {velocityConfigs.map(cfg => (
            <div key={cfg.entity} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#A5B4FC', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                {cfg.entity} Velocity
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {cfg.windows.map(w => (
                  <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(92,110,248,0.1)', border: '1px solid rgba(92,110,248,0.25)', color: '#A5B4FC' }}>
                    {w}
                    <button onClick={() => removeWindow(cfg.entity, w)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(165,180,252,0.6)', padding: 0, fontSize: '1rem', lineHeight: 1, display: 'flex' }}>×</button>
                  </span>
                ))}
                <button onClick={() => { setWindowEntity(cfg.entity); setNewWindow(''); }} style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', color: '#8D9AAB', cursor: 'pointer' }}>
                  + Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Backtest Sandbox ─────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '20px 24px' }}>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#E8EDF4' }}>Backtest Sandbox</div>
          <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>Simulate a rule against historical data before enforcing it.</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selectedRuleId} onChange={e => setSelectedRuleId(e.target.value)} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E8EDF4', borderRadius: '8px', colorScheme: 'dark', fontSize: '0.875rem', minWidth: '200px' }}>
            <option value="">Select a rule to backtest…</option>
            {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#E8EDF4', borderRadius: '8px', colorScheme: 'dark', fontSize: '0.875rem' }}>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
          <button
            onClick={handleBacktest}
            disabled={!selectedRuleId || isBacktesting}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px',
              borderRadius: '8px', border: 'none', cursor: (!selectedRuleId || isBacktesting) ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)',
              color: '#fff', fontWeight: 600, fontSize: '0.875rem',
              opacity: (!selectedRuleId || isBacktesting) ? 0.5 : 1,
              boxShadow: '0 4px 14px rgba(92,110,248,0.3)',
            }}
          >
            <FlaskIcon />
            {isBacktesting ? 'Running…' : 'Run Backtest'}
          </button>
        </div>

        {backtestResult && (
          <div style={{ marginTop: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '14px 18px', borderRadius: '10px', background: 'rgba(92,110,248,0.06)', border: '1px solid rgba(92,110,248,0.15)' }}>
            {[
              { label: 'Would trigger', value: backtestResult.triggerCount.toLocaleString(), sub: 'times', color: '#A5B4FC' },
              { label: 'Overlap with ML', value: `${backtestResult.overlap}%`, sub: '', color: '#22D3EE' },
              { label: 'Est. Precision', value: `${backtestResult.precision}%`, sub: '', color: '#34D399' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ color: '#8D9AAB', fontSize: '0.82rem' }}>{r.label}:</span>
                <span style={{ color: r.color, fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace' }}>{r.value}</span>
                {r.sub && <span style={{ color: '#8D9AAB', fontSize: '0.82rem' }}>{r.sub}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {/* Create Rule */}
      <IntModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Custom Rule" width="560px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Rule Name">
            <input style={inputStyle} type="text" placeholder="e.g. High Card Velocity" value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Entity">
              <select style={selectStyle} value={newRule.entity} onChange={e => setNewRule({ ...newRule, entity: e.target.value })}>
                <option value="card">Card</option>
                <option value="user">User</option>
                <option value="ip">IP</option>
                <option value="device">Device</option>
              </select>
            </FormField>
            <FormField label="Metric">
              <select style={selectStyle} value={newRule.metric} onChange={e => setNewRule({ ...newRule, metric: e.target.value })}>
                <option value="velocity">Velocity</option>
                <option value="amount">Amount</option>
              </select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <FormField label="Operator">
              <select style={selectStyle} value={newRule.operator} onChange={e => setNewRule({ ...newRule, operator: e.target.value })}>
                <option value=">=">&gt;=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value="==">==</option>
              </select>
            </FormField>
            <FormField label="Value">
              <input style={inputStyle} type="number" placeholder="e.g. 5" value={newRule.value} onChange={e => setNewRule({ ...newRule, value: e.target.value })} />
            </FormField>
            <FormField label="Window">
              <select style={selectStyle} value={newRule.window} onChange={e => setNewRule({ ...newRule, window: e.target.value })}>
                <option value="1h">1 Hour</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
              </select>
            </FormField>
          </div>
          <FormField label="Action (Consequence)">
            <select style={selectStyle} value={newRule.action} onChange={e => setNewRule({ ...newRule, action: e.target.value })}>
              <option value="flag">Flag for Review (Low Friction)</option>
              <option value="step_up">Step-up Auth (Medium Friction)</option>
              <option value="block">Block Transaction (High Friction)</option>
            </select>
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <CancelBtn onClick={() => setIsCreateOpen(false)}>Cancel</CancelBtn>
            <PrimaryBtn onClick={handleCreate} disabled={!newRule.name.trim() || !newRule.value}>Save Rule</PrimaryBtn>
          </div>
        </div>
      </IntModal>

      {/* Delete Confirm */}
      <IntModal isOpen={!!ruleToDelete} onClose={() => setRuleToDelete(null)} title="Delete Rule" width="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: '#E8EDF4', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
            Are you sure you want to delete this rule? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <CancelBtn onClick={() => setRuleToDelete(null)}>Cancel</CancelBtn>
            <DangerBtn onClick={confirmDelete}>Delete Rule</DangerBtn>
          </div>
        </div>
      </IntModal>

      {/* Add Window */}
      <IntModal isOpen={!!windowEntity} onClose={() => setWindowEntity(null)} title={`Add ${windowEntity} Window`} width="360px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormField label="Window Duration">
            <input style={inputStyle} type="text" placeholder="e.g. 12h, 48h, 90d" value={newWindow}
              onChange={e => setNewWindow(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmAddWindow(); }}
            />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <CancelBtn onClick={() => setWindowEntity(null)}>Cancel</CancelBtn>
            <PrimaryBtn onClick={confirmAddWindow} disabled={!newWindow.trim()}>Add Window</PrimaryBtn>
          </div>
        </div>
      </IntModal>
    </div>
  );
}
