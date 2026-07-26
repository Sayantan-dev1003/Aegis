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

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const LayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
  </svg>
);

// ─── Modal ────────────────────────────────────────────────────────────────────

const IntModal = ({ isOpen, onClose, title, width = '480px', children }: {
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
        <div style={{ padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
};

// ─── Form helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E8EDF4',
  fontSize: '0.875rem', outline: 'none',
};

const selectStyle: React.CSSProperties = { ...inputStyle, colorScheme: 'dark', cursor: 'pointer' };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'none' as const };
const timeStyle: React.CSSProperties = { ...inputStyle, width: 'auto', colorScheme: 'dark' };

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8D9AAB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
    {children}
  </div>
);

const PrimaryBtn = ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)', color: '#fff', fontWeight: 600, fontSize: '0.875rem', boxShadow: '0 4px 14px rgba(92,110,248,0.35)', opacity: disabled ? 0.5 : 1 }}>
    {children}
  </button>
);

const CancelBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8D9AAB', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>{children}</button>
);

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button onClick={() => onChange(!checked)} style={{
    width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
    background: checked ? 'linear-gradient(135deg, #5C6EF8, #7E8DF9)' : 'rgba(255,255,255,0.1)',
    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    boxShadow: checked ? '0 0 8px rgba(92,110,248,0.4)' : 'none',
  }}>
    <span style={{ position: 'absolute', top: '3px', left: checked ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
  </button>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const [queues, setQueues]               = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [configuringQueue, setConfiguringQueue] = useState<any>(null);
  const [isDeleting, setIsDeleting]       = useState(false);
  const [formData, setFormData]           = useState<any>({});

  const loadQueues = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/queues', { cache: 'no-store' });
      setQueues(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadQueues(); }, []);

  const openConfig = (q: any) => {
    setConfiguringQueue(q);
    setFormData({
      name: q.name,
      description: q.description || '',
      sla_target_minutes: q.sla_target_minutes || 60,
      coverage_start: q.coverage_start || '09:00',
      coverage_end: q.coverage_end || '17:00',
      timezone: q.timezone || 'UTC',
      active: q.status === 'active',
    });
  };

  const handleSave = async () => {
    try {
      if (configuringQueue.isNew) {
        await fetchApi('http://localhost:8080/admin/queues', {
          method: 'POST',
          body: JSON.stringify({
            name: formData.name, description: formData.description,
            sla_target_minutes: parseInt(formData.sla_target_minutes),
            coverage_start: formData.coverage_start || '09:00',
            coverage_end: formData.coverage_end || '17:00',
            timezone: formData.timezone || 'UTC',
          }),
        });
      } else {
        await fetchApi(`http://localhost:8080/admin/queues/${configuringQueue.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: formData.active ? 'active' : 'paused' }),
        });
      }
      setConfiguringQueue(null); loadQueues();
    } catch (e) { alert('Failed to save queue'); }
  };

  const handleDelete = async () => {
    if (!configuringQueue?.id) return;
    try {
      await fetchApi(`http://localhost:8080/admin/queues/${configuringQueue.id}`, { method: 'DELETE' });
      setConfiguringQueue(null); setIsDeleting(false); loadQueues();
    } catch (e) { alert('Failed to delete queue'); }
  };

  if (loading) return <div style={{ padding: '40px', color: '#8D9AAB' }}>Loading queues…</div>;

  const activeQueues = queues.filter(q => q.status === 'active').length;
  const totalCases   = queues.reduce((a, q) => a + (q.open_cases || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {[
          { label: 'Total Queues',  value: String(queues.length), sub: 'routing pipelines',    accent: '#5C6EF8', glow: 'rgba(92,110,248,0.12)'  },
          { label: 'Active Queues', value: String(activeQueues),  sub: 'currently processing', accent: '#34D399', glow: 'rgba(52,211,153,0.12)'  },
          { label: 'Open Cases',    value: String(totalCases),    sub: 'pending review',        accent: '#22D3EE', glow: 'rgba(34,211,238,0.12)'  },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.72rem', color: '#8D9AAB', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{s.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#E8EDF4', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#4E5A6B', marginTop: '3px' }}>{s.sub}</div>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '70px', height: '70px', borderRadius: '50%', background: `radial-gradient(circle, ${s.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PrimaryBtn onClick={() => {
          setConfiguringQueue({ isNew: true });
          setFormData({ name: '', description: '', sla_target_minutes: 60, active: true, coverage_start: '09:00', coverage_end: '17:00', timezone: 'UTC' });
        }}>
          <PlusIcon /> Create Queue
        </PrimaryBtn>
      </div>

      {/* Queue Cards Grid */}
      {queues.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '56px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(92,110,248,0.08)', border: '1px solid rgba(92,110,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(92,110,248,0.6)' }}><LayersIcon /></div>
          <div style={{ color: '#E8EDF4', fontWeight: 600 }}>No queues yet</div>
          <div style={{ color: '#8D9AAB', fontSize: '0.82rem' }}>Create your first queue to start routing fraud cases to reviewers.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {queues.map(q => {
            const isActive = q.status === 'active';
            const breachBad = (q.breach_rate || 0) > 5;
            return (
              <div key={q.id} style={{
                background: 'linear-gradient(160deg, rgba(15,23,42,0.95) 0%, rgba(10,15,30,0.98) 100%)',
                border: `1px solid ${isActive ? 'rgba(92,110,248,0.2)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: '14px', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '14px',
                opacity: isActive ? 1 : 0.55,
                boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                position: 'relative', overflow: 'hidden',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 20px rgba(92,110,248,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)'; }}
              >
                {/* Active side bar */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: isActive ? 'linear-gradient(180deg, #34D399, #059669)' : '#374151', borderRadius: '3px 0 0 3px' }} />

                {/* Title, Description & Reviewer */}
                <div>
                  <h3 style={{ margin: '0 0 6px 0', color: '#F8FAFC', fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>{q.name}</h3>
                  {q.description && <p style={{ margin: '0 0 10px 0', color: '#64748B', fontSize: '0.78rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.description}</p>}
                  <div>
                    <span style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: '20px', background: 'rgba(92,110,248,0.12)', border: '1px solid rgba(129,140,248,0.35)', color: '#E0E7FF', fontWeight: 600, display: 'inline-block' }}>
                      {q.assigned_reviewer || 'Unassigned'}
                    </span>
                  </div>
                </div>

                {/* Spacious, borderless 5-metric bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'rgba(15, 23, 42, 0.45)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  margin: '12px 0 16px 0',
                }}>
                  {[
                    { label: 'Open',        val: q.open_cases || 0,                     color: '#38BDF8' },
                    { label: 'Total',       val: q.total_cases || 0,                    color: '#A5B4FC' },
                    { label: 'SLA Target',  val: `${q.sla_target_minutes}m`,            color: '#E2E8F0' },
                    { label: 'Breached',    val: q.cases_breached || 0,                 color: (q.cases_breached || 0) > 0 ? '#F43F5E' : '#94A3B8' },
                    { label: 'Breach Rate', val: `${(q.breach_rate || 0).toFixed(1)}%`, color: breachBad ? '#F43F5E' : '#34D399' },
                  ].map((item) => (
                    <div key={item.label} style={{ textAlign: 'center' }}>
                      <div style={{ color: '#64748B', fontSize: '0.67rem', fontWeight: 600, marginBottom: '4px', letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>
                        {item.label}
                      </div>
                      <div style={{ color: item.color, fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>
                        {item.val}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.65rem', padding: '3px 9px', borderRadius: '20px',
                    background: isActive ? 'rgba(16,185,129,0.08)' : 'rgba(148,163,184,0.08)',
                    border: `1px solid ${isActive ? 'rgba(16,185,129,0.25)' : 'rgba(148,163,184,0.15)'}`,
                    color: isActive ? '#34D399' : '#64748B',
                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px',
                  }}>
                    {isActive ? '● Active' : '○ Paused'}
                  </span>
                  <button
                    onClick={() => openConfig(q)}
                    style={{ background: 'rgba(92,110,248,0.06)', border: '1px solid rgba(92,110,248,0.25)', color: '#818CF8', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(92,110,248,0.15)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(92,110,248,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(92,110,248,0.06)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    Configure ›
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Configure Modal ── */}
      <IntModal
        isOpen={!!configuringQueue}
        onClose={() => setConfiguringQueue(null)}
        title={configuringQueue?.isNew ? 'Create Queue' : 'Configure Queue'}
        width="500px"
      >
        {configuringQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {!configuringQueue.isNew && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#E8EDF4', fontSize: '0.9rem' }}>Active Status</div>
                  <div style={{ fontSize: '0.75rem', color: '#8D9AAB', marginTop: '2px' }}>Toggle to pause / resume this queue</div>
                </div>
                <Toggle checked={formData.active} onChange={v => setFormData({ ...formData, active: v })} />
              </div>
            )}

            <FormField label="Queue Name">
              <input style={inputStyle} type="text" value={formData.name} disabled={!configuringQueue.isNew} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </FormField>

            <FormField label="Description">
              <textarea style={textareaStyle} rows={3} value={formData.description} disabled={!configuringQueue.isNew} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </FormField>

            <FormField label="SLA Timer (Minutes)">
              <input style={inputStyle} type="number" value={formData.sla_target_minutes} disabled={!configuringQueue.isNew} onChange={e => setFormData({ ...formData, sla_target_minutes: e.target.value })} />
            </FormField>

            <FormField label="Coverage Hours & Timezone">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input style={timeStyle} type="time" value={formData.coverage_start} disabled={!configuringQueue.isNew} onChange={e => setFormData((p: any) => ({ ...p, coverage_start: e.target.value }))} />
                <span style={{ color: '#8D9AAB', fontSize: '0.8rem' }}>to</span>
                <input style={timeStyle} type="time" value={formData.coverage_end} disabled={!configuringQueue.isNew} onChange={e => setFormData((p: any) => ({ ...p, coverage_end: e.target.value }))} />
                <select style={{ ...selectStyle, flexGrow: 1 }} value={formData.timezone} disabled={!configuringQueue.isNew} onChange={e => setFormData((p: any) => ({ ...p, timezone: e.target.value }))}>
                  <option value="UTC">UTC</option>
                  <option value="EST">Eastern Time</option>
                  <option value="PST">Pacific Time</option>
                  <option value="IST">India Standard Time</option>
                </select>
              </div>
            </FormField>

            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {!configuringQueue.isNew && (
                <button onClick={() => setIsDeleting(true)} style={{ padding: '9px 16px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', color: '#FCA5A5', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
                  Delete Queue
                </button>
              )}
              <div style={{ flexGrow: 1 }} />
              <CancelBtn onClick={() => setConfiguringQueue(null)}>Cancel</CancelBtn>
              <PrimaryBtn onClick={handleSave}>Save Changes</PrimaryBtn>
            </div>
          </div>
        )}
      </IntModal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={isDeleting}
        title="Delete Queue"
        description={`Are you sure you want to delete "${configuringQueue?.name}"? ${configuringQueue?.open_cases || 0} open cases will be reassigned to the default fallback queue.`}
        confirmLabel="Delete Queue"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleting(false)}
      />
    </div>
  );
}
