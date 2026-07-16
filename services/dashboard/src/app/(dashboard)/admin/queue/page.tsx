"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { Drawer } from '@/components/Drawer';
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
      const data = await fetchApi("http://localhost:8080/admin/queues");
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
            coverage_start: "09:00", // Stub
            coverage_end: "17:00", // Stub
            timezone: "UTC", // Stub
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>Case Queues</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Manage routing rules and SLAs for manual review workflows.</p>
        </div>
        <button
          onClick={() => {
            setConfiguringQueue({ isNew: true });
            setFormData({ name: '', description: '', sla_target_minutes: 60, assignment_rule: 'round_robin', active: true });
          }}
          style={{ backgroundColor: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
        >
          + Create Queue
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-lg)' }}>
        {queues.map(q => (
          <div key={q.id} style={{
            backgroundColor: 'var(--bg-surface)',
            border: `1px solid ${q.status === 'active' ? 'var(--border-color)' : 'var(--bg-surface-hover)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            opacity: q.status === 'active' ? 1 : 0.6
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '1.125rem' }}>{q.name}</h3>
                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: q.status === 'active' ? 'var(--risk-low)' : 'var(--text-disabled)', color: '#fff' }}>
                  {q.status === 'active' ? 'Active' : 'Paused'}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', height: '40px', overflow: 'hidden' }}>{q.description}</p>
            </div>
            
            <div style={{ display: 'flex', gap: '24px', padding: '16px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>Open Cases</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>{q.open_cases || 0}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>SLA Target</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>{q.sla_target_minutes}m</div>
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Breach Rate</span>
                  <span style={{ color: (q.breach_rate || 0) > 5 ? 'var(--risk-critical)' : 'var(--risk-low)' }}>{(q.breach_rate || 0).toFixed(1)}%</span>
                </div>
                <div style={{ height: '24px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={q.sparkline}>
                      <Line type="monotone" dataKey="value" stroke={(q.breach_rate || 0) > 5 ? "var(--risk-critical)" : "var(--risk-low)"} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
              <button 
                onClick={() => openConfig(q)}
                style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Configure Drawer */}
      <Drawer isOpen={!!configuringQueue} onClose={() => setConfiguringQueue(null)} title={configuringQueue?.isNew ? 'Create Queue' : 'Configure Queue'} width="500px">
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
              <select value={formData.assignment_rule} onChange={(e) => setFormData({...formData, assignment_rule: e.target.value})} disabled={!configuringQueue.isNew} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value="round_robin">Round Robin (Auto-assign)</option>
                <option value="skill_based">Skill Based (Tags)</option>
                <option value="manual">Manual Pull (Queue)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>SLA Timer (Minutes)</label>
              <input type="number" value={formData.sla_target_minutes} onChange={(e) => setFormData({...formData, sla_target_minutes: e.target.value})} disabled={!configuringQueue.isNew} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Coverage Hours & Timezone</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="time" defaultValue="09:00" disabled={!configuringQueue.isNew} style={{ padding: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>to</span>
                <input type="time" defaultValue="17:00" disabled={!configuringQueue.isNew} style={{ padding: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
                <select defaultValue="UTC" disabled={!configuringQueue.isNew} style={{ flexGrow: 1, padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                  <option value="UTC">UTC</option>
                  <option value="EST">Eastern Time</option>
                  <option value="PST">Pacific Time</option>
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
              <button onClick={handleSaveQueue} style={{ padding: '10px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        )}
      </Drawer>

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

