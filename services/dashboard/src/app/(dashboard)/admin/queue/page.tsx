"use client";

import React, { useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { Toggle } from '@/components/Toggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Dummy Data
const generateSparkline = (base: number) => Array.from({ length: 14 }, (_, i) => ({ value: Math.max(0, base + Math.random() * 5 - 2.5) }));

const initialQueues = [
  { id: 'q-1', name: 'Tier 1 Review', description: 'First-pass manual review for medium risk flags', openCases: 142, slaMinutes: 60, breachRatePct: 4.2, assignmentRule: 'round_robin', active: true, sparkline: generateSparkline(4) },
  { id: 'q-2', name: 'Escalations', description: 'High value or complex fraud cases', openCases: 28, slaMinutes: 120, breachRatePct: 1.5, assignmentRule: 'skill_based', active: true, sparkline: generateSparkline(1.5) },
  { id: 'q-3', name: 'Account Takeover', description: 'Dedicated queue for ATO investigation', openCases: 56, slaMinutes: 30, breachRatePct: 12.8, assignmentRule: 'round_robin', active: true, sparkline: generateSparkline(12) },
  { id: 'q-4', name: 'VIP Support', description: 'White-glove review for top tier accounts', openCases: 4, slaMinutes: 15, breachRatePct: 0.0, assignmentRule: 'manual', active: false, sparkline: generateSparkline(0) },
];

export default function QueuePage() {
  const [queues, setQueues] = useState(initialQueues);
  const [configuringQueue, setConfiguringQueue] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>Case Queues</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Manage routing rules and SLAs for manual review workflows.</p>
        </div>
        <button
          onClick={() => setConfiguringQueue({ name: '', description: '', slaMinutes: 60, assignmentRule: 'round_robin', active: true, isNew: true })}
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
            border: `1px solid ${q.active ? 'var(--border-color)' : 'var(--bg-surface-hover)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            opacity: q.active ? 1 : 0.6
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '1.125rem' }}>{q.name}</h3>
                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: q.active ? 'var(--risk-low)' : 'var(--text-disabled)', color: '#fff' }}>
                  {q.active ? 'Active' : 'Paused'}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', height: '40px', overflow: 'hidden' }}>{q.description}</p>
            </div>
            
            <div style={{ display: 'flex', gap: '24px', padding: '16px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>Open Cases</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>{q.openCases}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>SLA Target</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono)' }}>{q.slaMinutes}m</div>
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Breach Rate</span>
                  <span style={{ color: q.breachRatePct > 5 ? 'var(--risk-critical)' : 'var(--risk-low)' }}>{q.breachRatePct.toFixed(1)}%</span>
                </div>
                <div style={{ height: '24px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={q.sparkline}>
                      <Line type="monotone" dataKey="value" stroke={q.breachRatePct > 5 ? "var(--risk-critical)" : "var(--risk-low)"} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
              <button 
                onClick={() => setConfiguringQueue(q)}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Active Status</label>
              <Toggle checked={configuringQueue.active} onChange={(v) => setConfiguringQueue({...configuringQueue, active: v})} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Queue Name</label>
              <input type="text" defaultValue={configuringQueue.name} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Description</label>
              <textarea defaultValue={configuringQueue.description} rows={3} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', resize: 'none' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Assignment Rule</label>
              <select defaultValue={configuringQueue.assignmentRule} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value="round_robin">Round Robin (Auto-assign)</option>
                <option value="skill_based">Skill Based (Tags)</option>
                <option value="manual">Manual Pull (Queue)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>SLA Timer (Minutes)</label>
              <input type="number" defaultValue={configuringQueue.slaMinutes} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Coverage Hours & Timezone</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="time" defaultValue="09:00" style={{ padding: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>to</span>
                <input type="time" defaultValue="17:00" style={{ padding: '8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} />
                <select defaultValue="UTC" style={{ flexGrow: 1, padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
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
              <button onClick={() => setConfiguringQueue(null)} style={{ padding: '10px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        isOpen={isDeleting}
        title="Delete Queue"
        description={`Are you sure you want to delete "${configuringQueue?.name}"? ${configuringQueue?.openCases} open cases will be reassigned to the default fallback queue.`}
        confirmLabel="Delete Queue"
        danger={true}
        onConfirm={() => {
          setQueues(queues.filter(q => q.id !== configuringQueue?.id));
          setIsDeleting(false);
          setConfiguringQueue(null);
        }}
        onCancel={() => setIsDeleting(false)}
      />

    </div>
  );
}
