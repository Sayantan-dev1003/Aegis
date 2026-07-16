"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { DataTable } from '@/components/DataTable';
import { Toggle } from '@/components/Toggle';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';

// Dummy Velocity Config (Assuming velocity config table was meant to be managed similarly, but keeping simple for now)
const velocityConfigs = [
  { entity: 'Card', windows: ['1h', '24h', '7d'] },
  { entity: 'User', windows: ['24h', '7d', '30d'] },
  { entity: 'IP', windows: ['1h', '24h'] },
  { entity: 'Device', windows: ['1h', '24h', '7d'] }
];

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Rule State
  const [newRule, setNewRule] = useState({
    name: '', entity: 'card', metric: 'velocity', operator: '>=', value: '', window: '24h', action: 'flag'
  });

  // Backtest state
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [backtestResult, setBacktestResult] = useState<{triggerCount: number, overlapWithMlPct: number, estimatedPrecision: number} | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const loadRules = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/rules");
      setRules(data || []);
    } catch (err) {
      console.error("Failed to load rules", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const filteredRules = rules.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await fetchApi(`http://localhost:8080/admin/rules/${id}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: active })
      });
      setRules(rules.map(r => r.id === id ? { ...r, is_active: active } : r));
    } catch (err) {
      console.error("Failed to toggle rule", err);
      alert("Failed to toggle rule");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await fetchApi(`http://localhost:8080/admin/rules/${id}`, { method: "DELETE" });
      setRules(rules.filter(r => r.id !== id));
    } catch (err) {
      console.error("Failed to delete rule", err);
      alert("Failed to delete rule");
    }
  };

  const handleCreateRule = async () => {
    try {
      await fetchApi("http://localhost:8080/admin/rules", {
        method: "POST",
        body: JSON.stringify({
          name: newRule.name,
          entity: newRule.entity,
          metric: newRule.metric,
          operator: newRule.operator,
          value: parseFloat(newRule.value),
          window: newRule.window,
          action: newRule.action
        })
      });
      setIsCreateModalOpen(false);
      setNewRule({ name: '', entity: 'card', metric: 'velocity', operator: '>=', value: '', window: '24h', action: 'flag' });
      loadRules();
    } catch (err) {
      console.error("Failed to create rule", err);
      alert("Failed to create rule");
    }
  };

  const handleRunBacktest = async () => {
    if (!selectedRuleId) return;
    setIsBacktesting(true);
    setBacktestResult(null);
    try {
      const data = await fetchApi(`http://localhost:8080/admin/rules/${selectedRuleId}/backtest`, { method: "POST" });
      setBacktestResult({
        triggerCount: data.match_count || 0,
        overlapWithMlPct: 85, // Stub
        estimatedPrecision: Math.round((data.precision || 0) * 100)
      });
    } catch (err) {
      console.error("Backtest failed", err);
      alert("Backtest failed");
    } finally {
      setIsBacktesting(false);
    }
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading rules...</div>;

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
            { key: 'conditionSummary', header: 'Condition', render: (r: any) => <code style={{ backgroundColor: 'var(--bg-base)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{`${r.metric} ${r.operator} ${r.value}`}</code> },
            { key: 'entity', header: 'Entity' },
            { key: 'window', header: 'Window' },
            { key: 'action', header: 'Action', render: (r: any) => (
              <StatusBadge 
                status={r.action === 'block' ? 'critical' : r.action === 'step_up' ? 'warning' : 'active'} 
                label={r.action.replace('_', ' ')} 
              />
            )},
            { key: 'triggerCount24h', header: 'Triggers (24h)', render: (r: any) => r.triggers_24h || '-' },
            { key: 'precisionPct', header: 'Precision %', render: (r: any) => r.precision ? `${Math.round(r.precision * 100)}%` : '-' },
            { key: 'active', header: 'Active', render: (r: any) => (
              <Toggle checked={r.is_active} onChange={(c) => handleToggleActive(r.id, c)} />
            )},
            { key: 'actions', header: '', render: (r: any) => (
              <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-critical)', cursor: 'pointer' }}>Delete</button>
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
            disabled={!selectedRuleId || isBacktesting}
            style={{ backgroundColor: 'var(--accent)', opacity: (selectedRuleId && !isBacktesting) ? 1 : 0.5, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: (selectedRuleId && !isBacktesting) ? 'pointer' : 'not-allowed', fontWeight: 500 }}
          >
            {isBacktesting ? "Running..." : "Run Backtest"}
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
          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Rule Name</label>
            <input type="text" value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="e.g. High Velocity" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Entity</label>
              <select value={newRule.entity} onChange={e => setNewRule({...newRule, entity: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value="card">Card</option>
                <option value="user">User</option>
                <option value="ip">IP</option>
                <option value="device">Device</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Metric</label>
              <select value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value="velocity">Velocity</option>
                <option value="amount">Amount</option>
              </select>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Operator</label>
              <select value={newRule.operator} onChange={e => setNewRule({...newRule, operator: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value=">=">&gt;=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value="==">==</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Value</label>
              <input type="number" value={newRule.value} onChange={e => setNewRule({...newRule, value: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }} placeholder="e.g. 5" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Window</label>
              <select value={newRule.window} onChange={e => setNewRule({...newRule, window: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
                <option value="1h">1h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Action</label>
            <select value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)' }}>
              <option value="flag">Flag for Review</option>
              <option value="step_up">Step-up Auth</option>
              <option value="block">Block</option>
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
              onClick={handleCreateRule}
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

