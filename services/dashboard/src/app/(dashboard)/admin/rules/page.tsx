"use client";

import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Toggle } from '@/components/Toggle';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';

// Dummy Data
const initialRules = [
  { id: 'rule-1', name: 'High Velocity (Card)', entity: 'card', conditionSummary: 'velocity_24h >= 5', window: '24h', action: 'block', triggerCount24h: 142, precisionPct: 82, active: true, priority: 1 },
  { id: 'rule-2', name: 'Foreign IP + Large Txn', entity: 'ip', conditionSummary: 'is_foreign == 1 && amount > 1000', window: '1h', action: 'step_up', triggerCount24h: 45, precisionPct: 68, active: true, priority: 2 },
  { id: 'rule-3', name: 'New Device Burst', entity: 'device', conditionSummary: 'device_velocity >= 3', window: '1h', action: 'flag', triggerCount24h: 89, precisionPct: 74, active: false, priority: 3 },
];

const velocityConfigs = [
  { entity: 'Card', windows: ['1h', '24h', '7d'] },
  { entity: 'User', windows: ['24h', '7d', '30d'] },
  { entity: 'IP', windows: ['1h', '24h'] },
  { entity: 'Device', windows: ['1h', '24h', '7d'] }
];

export default function RulesPage() {
  const [rules, setRules] = useState(initialRules);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Backtest state
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [backtestResult, setBacktestResult] = useState<{triggerCount: number, overlapWithMlPct: number, estimatedPrecision: number} | null>(null);

  const filteredRules = rules.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleToggleActive = (id: string, active: boolean) => {
    setRules(rules.map(r => r.id === id ? { ...r, active } : r));
  };

  const handleRunBacktest = () => {
    if (!selectedRuleId) return;
    setBacktestResult({
      triggerCount: Math.floor(Math.random() * 2000) + 100,
      overlapWithMlPct: Math.floor(Math.random() * 40) + 40,
      estimatedPrecision: Math.floor(Math.random() * 30) + 60
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Search rules..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            width: '300px'
          }}
        />
        <button
          onClick={() => setIsCreateModalOpen(true)}
          style={{ backgroundColor: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
        >
          + Create Rule
        </button>
      </div>

      {/* Rules Table */}
      <div>
        <DataTable
          columns={[
            { key: 'name', header: 'Name', render: (r: any) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { key: 'conditionSummary', header: 'Condition', render: (r: any) => <code style={{ backgroundColor: 'var(--bg-base)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{r.conditionSummary}</code> },
            { key: 'entity', header: 'Entity' },
            { key: 'window', header: 'Window' },
            { key: 'action', header: 'Action', render: (r: any) => (
              <StatusBadge 
                status={r.action === 'block' ? 'critical' : r.action === 'step_up' ? 'warning' : 'active'} 
                label={r.action.replace('_', ' ')} 
              />
            )},
            { key: 'triggerCount24h', header: 'Triggers (24h)' },
            { key: 'precisionPct', header: 'Precision %', render: (r: any) => `${r.precisionPct}%` },
            { key: 'active', header: 'Active', render: (r: any) => (
              <Toggle checked={r.active} onChange={(c) => handleToggleActive(r.id, c)} />
            )},
            { key: 'actions', header: '', render: () => (
              <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Edit</button>
            )}
          ]}
          rows={filteredRules}
          emptyState={
            <EmptyState 
              icon="🛡️"
              title="No custom rules yet" 
              description="Fraud is currently only caught by the ML model. Add a rule to layer in deterministic checks."
              actionLabel="Create Rule"
              onAction={() => setIsCreateModalOpen(true)}
            />
          }
        />
      </div>

      {/* Velocity Config Panel */}
      <div>
        <h3 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--text-primary)' }}>Velocity Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)' }}>
          {velocityConfigs.map((config) => (
            <div key={config.entity} style={{ 
              backgroundColor: 'var(--bg-surface)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 'var(--radius-lg)', 
              padding: 'var(--space-lg)' 
            }}>
              <h4 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--text-primary)' }}>{config.entity} Velocity</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {config.windows.map(w => (
                  <span key={w} style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '4px 8px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', 
                    borderRadius: '9999px', fontSize: '0.75rem', color: 'var(--text-secondary)'
                  }}>
                    {w} <button style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer' }}>×</button>
                  </span>
                ))}
                <button style={{
                  padding: '4px 8px', backgroundColor: 'transparent', border: '1px dashed var(--border-color)', 
                  borderRadius: '9999px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer'
                }}>+ Add Window</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Backtest Sandbox */}
      <div style={{ 
        backgroundColor: 'var(--bg-surface)', 
        border: '1px solid var(--border-color)', 
        borderRadius: 'var(--radius-lg)', 
        padding: 'var(--space-lg)' 
      }}>
        <h3 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--text-primary)' }}>Backtest Sandbox</h3>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <select 
            value={selectedRuleId} 
            onChange={e => setSelectedRuleId(e.target.value)}
            style={{ padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}
          >
            <option value="">Select a rule...</option>
            {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select style={{ padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
          <button
            onClick={handleRunBacktest}
            disabled={!selectedRuleId}
            style={{ backgroundColor: 'var(--accent)', opacity: selectedRuleId ? 1 : 0.5, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: selectedRuleId ? 'pointer' : 'not-allowed', fontWeight: 500 }}
          >
            Run Backtest
          </button>
        </div>
        
        {backtestResult && (
          <div style={{ padding: '16px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Would trigger {backtestResult.triggerCount.toLocaleString()} times</span>
            <span style={{ color: 'var(--text-secondary)', margin: '0 8px' }}>·</span>
            <span style={{ color: 'var(--info)' }}>{backtestResult.overlapWithMlPct}% overlap with ML flags</span>
            <span style={{ color: 'var(--text-secondary)', margin: '0 8px' }}>·</span>
            <span style={{ color: 'var(--risk-low)' }}>Est. precision {backtestResult.estimatedPrecision}%</span>
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Rule" width="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Entity</label>
              <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option>Card</option>
                <option>User</option>
                <option>IP</option>
                <option>Device</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Metric</label>
              <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option>Velocity</option>
                <option>Amount</option>
                <option>Distinct Countries</option>
              </select>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Operator</label>
              <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option>&gt;=</option>
                <option>&gt;</option>
                <option>&lt;</option>
                <option>==</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Value</label>
              <input type="number" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="e.g. 5" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Window</label>
              <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option>1h</option>
                <option>24h</option>
                <option>7d</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Action</label>
            <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
              <option>Flag for Review</option>
              <option>Step-up Auth</option>
              <option>Block</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={() => setIsCreateModalOpen(false)}
              style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => setIsCreateModalOpen(false)}
              style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            >
              Save Rule
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
