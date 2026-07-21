"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { Modal } from '@/components/Modal';
import { Toggle } from '@/components/Toggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const generateSparkline = (base: number) => Array.from({ length: 14 }, (_, i) => ({ value: Math.max(0, base + Math.random() * 5 - 2.5) }));

export default function QueuePage() {
  const [queues, setQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuringQueue, setConfiguringQueue] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const loadQueues = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/queues", { cache: "no-store" });
      setQueues((data || []).map((q: any) => ({
        ...q,
        sparkline: generateSparkline(q.breach_rate || 2) // Stub sparkline since it's not in the API
      })));
    } catch (err) {
      console.error("Failed to load queues", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
  }, []);

  const handleSaveQueue = async () => {
    try {
      if (configuringQueue.isNew) {
        await fetchApi("http://localhost:8080/admin/queues", {
          method: "POST",
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            assignment_rule: formData.assignment_rule,
            sla_target_minutes: parseInt(formData.sla_target_minutes),
            coverage_start: formData.coverage_start || '09:00',
            coverage_end: formData.coverage_end || '17:00',
            timezone: formData.timezone || 'UTC',
          })
        });
      } else {
        await fetchApi(`http://localhost:8080/admin/queues/${configuringQueue.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: formData.active ? "active" : "paused" })
        });
      }
      setConfiguringQueue(null);
      loadQueues();
    } catch (err) {
      console.error("Failed to save queue", err);
      alert("Failed to save queue");
    }
  };

  const handleDelete = async () => {
    if (!configuringQueue?.id) return;
    try {
      await fetchApi(`http://localhost:8080/admin/queues/${configuringQueue.id}`, { method: "DELETE" });
      setConfiguringQueue(null);
      setIsDeleting(false);
      loadQueues();
    } catch (err) {
      console.error("Failed to delete queue", err);
      alert("Failed to delete queue");
    }
  };

  const openConfig = (q: any) => {
    setConfiguringQueue(q);
    setFormData({
      name: q.name,
      description: q.description || "",
      assignment_rule: q.assignment_rule || "round_robin",
      sla_target_minutes: q.sla_target_minutes || 60,
      active: q.status === "active"
    });
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading queues...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          onClick={() => {
            setConfiguringQueue({ isNew: true });
            setFormData({ name: '', description: '', sla_target_minutes: 60, assignment_rule: 'round_robin', active: true, coverage_start: '09:00', coverage_end: '17:00', timezone: 'UTC' });
          }}
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 0 16px rgba(99,102,241,0.4)', letterSpacing: '0.5px' }}
        >
          + Create Queue
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-lg)' }}>
        {queues.map(q => (
          <div key={q.id} style={{
            background: 'linear-gradient(160deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.98) 100%)',
            border: `1px solid ${q.status === 'active' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)'}`,
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            opacity: q.status === 'active' ? 1 : 0.55,
            boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(16px)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 36px 0 rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 0 20px rgba(99, 102, 241, 0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)'; }}>

            {/* Title + Assignment Rule */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: q.status === 'active' ? '#34d399' : '#64748b', boxShadow: q.status === 'active' ? '0 0 6px #34d399' : 'none', flexShrink: 0 }} />
                <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, letterSpacing: '0.3px', lineHeight: 1.3 }}>{q.name}</h3>
              </div>
              <p style={{ margin: '0 0 8px 14px', color: '#64748b', fontSize: '0.78rem', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.description}</p>
              <div style={{ marginLeft: '14px' }}>
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#818cf8', fontWeight: 500, letterSpacing: '0.3px', textTransform: 'capitalize' }}>
                  {q.assignment_rule?.replace('_', ' ') || 'round robin'}
                </span>
              </div>
            </div>

            {/* Metrics Row */}
            <div style={{ display: 'flex', gap: '0', padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex: 1, paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Open Cases</div>
                <div style={{ color: '#38bdf8', fontSize: '1.4rem', fontWeight: 700, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", textShadow: '0 0 8px rgba(56, 189, 248, 0.25)', lineHeight: 1 }}>{q.open_cases || 0}</div>
              </div>
              <div style={{ flex: 1, paddingLeft: '12px', paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>SLA Target</div>
                <div style={{ color: '#e2e8f0', fontSize: '1.4rem', fontWeight: 700, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1 }}>{q.sla_target_minutes}m</div>
              </div>
              <div style={{ flex: 2, paddingLeft: '12px' }}>
                <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Breach Rate</span>
                  <span style={{ color: (q.breach_rate || 0) > 5 ? '#f43f5e' : '#34d399', fontWeight: 600 }}>{(q.breach_rate || 0).toFixed(1)}%</span>
                </div>
                <div style={{ height: '26px', width: '100%', filter: 'drop-shadow(0 0 3px rgba(6, 182, 212, 0.25))' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={q.sparkline}>
                      <Line type="monotone" dataKey="value" stroke={(q.breach_rate || 0) > 5 ? "#f43f5e" : "#06b6d4"} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Footer: Status badge left, Configure button right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <span style={{ fontSize: '0.65rem', padding: '3px 9px', borderRadius: '20px', backgroundColor: q.status === 'active' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(148, 163, 184, 0.08)', border: `1px solid ${q.status === 'active' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(148, 163, 184, 0.15)'}`, color: q.status === 'active' ? '#34d399' : '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                {q.status === 'active' ? '● Active' : '○ Paused'}
              </span>
              <button
                onClick={() => openConfig(q)}
                style={{ backgroundColor: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.25)', color: '#818cf8', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.4px', transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.15)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.06)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                Configure ›
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Configure Modal */}
      <Modal isOpen={!!configuringQueue} onClose={() => setConfiguringQueue(null)} title={configuringQueue?.isNew ? 'Create Queue' : 'Configure Queue'} width="500px">
        {configuringQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            {!configuringQueue.isNew && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Active Status</label>
                <Toggle checked={formData.active} onChange={(v) => setFormData({...formData, active: v})} />
              </div>
            )}

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Queue Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} disabled={!configuringQueue.isNew} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} disabled={!configuringQueue.isNew} rows={3} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', resize: 'none' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Assignment Rule</label>
              <select value={formData.assignment_rule} onChange={(e) => setFormData({...formData, assignment_rule: e.target.value})} disabled={!configuringQueue.isNew} style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: '#e2e8f0', borderRadius: 'var(--radius-md)', colorScheme: 'dark', appearance: 'auto' }}>
                <option value="round_robin" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Round Robin (Auto-assign)</option>
                <option value="skill_based" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Skill Based (Tags)</option>
                <option value="manual" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Manual Pull (Queue)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>SLA Timer (Minutes)</label>
              <input type="number" value={formData.sla_target_minutes} onChange={(e) => setFormData({...formData, sla_target_minutes: e.target.value})} disabled={!configuringQueue.isNew} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Coverage Hours & Timezone</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="time" value={formData.coverage_start} onChange={(e) => setFormData((prev: any) => ({...prev, coverage_start: e.target.value}))} disabled={!configuringQueue.isNew} style={{ padding: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', colorScheme: 'dark' }} />
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>to</span>
                <input type="time" value={formData.coverage_end} onChange={(e) => setFormData((prev: any) => ({...prev, coverage_end: e.target.value}))} disabled={!configuringQueue.isNew} style={{ padding: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', colorScheme: 'dark' }} />
                <select value={formData.timezone} onChange={(e) => setFormData((prev: any) => ({...prev, timezone: e.target.value}))} disabled={!configuringQueue.isNew} style={{ flexGrow: 1, padding: '8px 12px', backgroundColor: '#1a1f2e', border: '1px solid var(--border-color)', color: '#e2e8f0', borderRadius: 'var(--radius-md)', colorScheme: 'dark', appearance: 'auto' }}>
                  <option value="UTC" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>UTC</option>
                  <option value="EST" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Eastern Time</option>
                  <option value="PST" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>Pacific Time</option>
                  <option value="IST" style={{ backgroundColor: '#1a1f2e', color: '#e2e8f0' }}>India Standard Time</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
              {!configuringQueue.isNew && (
                <button 
                  onClick={() => setIsDeleting(true)}
                  style={{ padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid var(--risk-critical)', color: 'var(--risk-critical)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                >
                  Delete Queue
                </button>
              )}
              <div style={{ flexGrow: 1 }} />
              <button onClick={() => setConfiguringQueue(null)} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveQueue} style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

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

