"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { DataTable } from '@/components/DataTable';
import { Toggle } from '@/components/Toggle';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import styles from './rules.module.css';

// Default Velocity Config
const DEFAULT_VELOCITY_CONFIGS = [
  { entity: 'Card', windows: ['1h', '24h', '7d'] },
  { entity: 'User', windows: ['24h', '7d', '30d'] },
  { entity: 'IP', windows: ['1h', '24h'] },
  { entity: 'Device', windows: ['1h', '24h', '7d'] }
];

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [windowModalEntity, setWindowModalEntity] = useState<string | null>(null);
  const [newWindowValue, setNewWindowValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Rule State
  const [newRule, setNewRule] = useState({
    name: '', entity: 'card', metric: 'velocity', operator: '>=', value: '', window: '24h', action: 'flag'
  });

  // Backtest state
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [backtestResult, setBacktestResult] = useState<{triggerCount: number, overlapWithMlPct: number, estimatedPrecision: number} | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  // Velocity Config State
  const [velocityConfigs, setVelocityConfigs] = useState<{entity: string, windows: string[]}[]>(DEFAULT_VELOCITY_CONFIGS);

  useEffect(() => {
    const stored = localStorage.getItem('velocityConfigs');
    if (stored) {
      try {
        setVelocityConfigs(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse velocity configs", e);
      }
    }
  }, []);

  const handleAddWindowClick = (entity: string) => {
    setWindowModalEntity(entity);
    setNewWindowValue('');
  };

  const confirmAddWindow = () => {
    if (!windowModalEntity || !newWindowValue.trim()) return;
    const newWindow = newWindowValue.trim();
    
    const updated = velocityConfigs.map(c => {
      if (c.entity === windowModalEntity) {
        if (c.windows.includes(newWindow)) return c;
        return { ...c, windows: [...c.windows, newWindow] };
      }
      return c;
    });
    setVelocityConfigs(updated);
    localStorage.setItem('velocityConfigs', JSON.stringify(updated));
    setWindowModalEntity(null);
  };

  const handleRemoveWindow = (entity: string, windowToRemove: string) => {
    const updated = velocityConfigs.map(c => {
      if (c.entity === entity) {
        return { ...c, windows: c.windows.filter(w => w !== windowToRemove) };
      }
      return c;
    });
    setVelocityConfigs(updated);
    localStorage.setItem('velocityConfigs', JSON.stringify(updated));
  };

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

  const confirmDelete = async () => {
    if (!ruleToDelete) return;
    try {
      await fetchApi(`http://localhost:8080/admin/rules/${ruleToDelete}`, { method: "DELETE" });
      setRules(rules.filter(r => r.id !== ruleToDelete));
      setRuleToDelete(null);
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
    } catch (err: any) {
      console.error("Failed to create rule", err);
      alert(`Failed to create rule: ${err.message || "Unknown error"}`);
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
    <div className={styles.pageContainer}>
      {/* Header Row */}
      <div className={styles.headerRow}>
        <div className={styles.searchContainer}>
          <svg className={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="Search custom rules..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className={styles.createButton}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Rule
        </button>
      </div>

      {/* Rules Table */}
      <div style={{ animation: "fadeIn 0.5s ease-out" }}>
        <DataTable
          columns={[
            { key: 'name', header: 'Name', render: (r: any) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { key: 'conditionSummary', header: 'Condition', render: (r: any) => <code style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{`${r.metric} ${r.operator} ${r.value}`}</code> },
            { key: 'entity', header: 'Entity', render: (r: any) => <span style={{ textTransform: 'capitalize' }}>{r.entity}</span> },
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
              <button onClick={() => setRuleToDelete(r.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-critical)', cursor: 'pointer', opacity: 0.8, transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.8'}>Delete</button>
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
      <div style={{ animation: "fadeIn 0.6s ease-out" }}>
        <h3 className={styles.sectionTitle}>Velocity Configuration</h3>
        <div className={styles.velocityGrid}>
          {velocityConfigs.map((config) => (
            <div key={config.entity} className={styles.velocityCard}>
              <h4 className={styles.velocityCardTitle}>{config.entity} Velocity</h4>
              <div className={styles.windowTags}>
                {config.windows.map(w => (
                  <span key={w} className={styles.windowTag}>
                    {w} <button onClick={() => handleRemoveWindow(config.entity, w)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', padding: '0 0 0 4px', fontSize: '1.1em', lineHeight: '1' }}>&times;</button>
                  </span>
                ))}
                <button onClick={() => handleAddWindowClick(config.entity)} className={styles.addWindowBtn}>+ Add</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Backtest Sandbox */}
      <div className={styles.sandboxContainer} style={{ animation: "fadeIn 0.7s ease-out" }}>
        <h3 className={styles.sectionTitle}>Backtest Sandbox</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-md)', fontSize: '0.9rem' }}>Test the impact of a rule against historical data before enforcing it.</p>
        <div className={styles.sandboxControls}>
          <select 
            value={selectedRuleId} 
            onChange={e => setSelectedRuleId(e.target.value)}
            className={styles.selectInput}
          >
            <option value="">Select a rule to backtest...</option>
            {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className={styles.selectInput}>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
          <button
            onClick={handleRunBacktest}
            disabled={!selectedRuleId || isBacktesting}
            className={styles.runBtn}
          >
            {isBacktesting ? "Running..." : "Run Backtest"}
          </button>
        </div>
        
        {backtestResult && (
          <div className={styles.resultPanel}>
            <div className={styles.resultItem}>
              <span style={{ color: 'var(--text-main)' }}>Would trigger</span>
              <span style={{ color: 'var(--primary-color)', fontSize: '1.2rem' }}>{backtestResult.triggerCount.toLocaleString()}</span>
              <span style={{ color: 'var(--text-main)' }}>times</span>
            </div>
            <span className={styles.resultDot}>•</span>
            <div className={styles.resultItem}>
              <span style={{ color: 'var(--text-main)' }}>Overlap with ML:</span>
              <span style={{ color: 'var(--risk-info)' }}>{backtestResult.overlapWithMlPct}%</span>
            </div>
            <span className={styles.resultDot}>•</span>
            <div className={styles.resultItem}>
              <span style={{ color: 'var(--text-main)' }}>Est. Precision:</span>
              <span style={{ color: 'var(--risk-low)' }}>{backtestResult.estimatedPrecision}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Custom Rule" width="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className={styles.modalInputGroup}>
            <label className={styles.modalLabel}>Rule Name</label>
            <input type="text" value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} className={styles.modalInput} placeholder="e.g. High Card Velocity" />
          </div>
          
          <div className={styles.modalGrid2}>
            <div className={styles.modalInputGroup}>
              <label className={styles.modalLabel}>Entity</label>
              <select value={newRule.entity} onChange={e => setNewRule({...newRule, entity: e.target.value})} className={styles.selectInput} style={{ width: '100%' }}>
                <option value="card">Card</option>
                <option value="user">User</option>
                <option value="ip">IP</option>
                <option value="device">Device</option>
              </select>
            </div>
            <div className={styles.modalInputGroup}>
              <label className={styles.modalLabel}>Metric</label>
              <select value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})} className={styles.selectInput} style={{ width: '100%' }}>
                <option value="velocity">Velocity</option>
                <option value="amount">Amount</option>
              </select>
            </div>
          </div>
          
          <div className={styles.modalGrid3}>
            <div className={styles.modalInputGroup}>
              <label className={styles.modalLabel}>Operator</label>
              <select value={newRule.operator} onChange={e => setNewRule({...newRule, operator: e.target.value})} className={styles.selectInput} style={{ width: '100%' }}>
                <option value=">=">&gt;=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value="==">==</option>
              </select>
            </div>
            <div className={styles.modalInputGroup}>
              <label className={styles.modalLabel}>Value</label>
              <input type="number" value={newRule.value} onChange={e => setNewRule({...newRule, value: e.target.value})} className={styles.modalInput} placeholder="e.g. 5" />
            </div>
            <div className={styles.modalInputGroup}>
              <label className={styles.modalLabel}>Window</label>
              <select value={newRule.window} onChange={e => setNewRule({...newRule, window: e.target.value})} className={styles.selectInput} style={{ width: '100%' }}>
                <option value="1h">1 Hour</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
              </select>
            </div>
          </div>

          <div className={styles.modalInputGroup}>
            <label className={styles.modalLabel}>Action (Consequence)</label>
            <select value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})} className={styles.selectInput} style={{ width: '100%' }}>
              <option value="flag">Flag for Review (Low Friction)</option>
              <option value="step_up">Step-up Auth (Medium Friction)</option>
              <option value="block">Block Transaction (High Friction)</option>
            </select>
          </div>

          <div className={styles.modalActions}>
            <button onClick={() => setIsCreateModalOpen(false)} className={styles.cancelBtn}>
              Cancel
            </button>
            <button onClick={handleCreateRule} className={styles.createButton} style={{ margin: 0 }}>
              Save Rule
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!ruleToDelete} onClose={() => setRuleToDelete(null)} title="Confirm Deletion" width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <p style={{ color: 'var(--text-main)', margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>
            Are you sure you want to delete this rule? This action cannot be undone.
          </p>
          <div className={styles.modalActions}>
            <button onClick={() => setRuleToDelete(null)} className={styles.cancelBtn}>
              Cancel
            </button>
            <button onClick={confirmDelete} className={styles.createButton} style={{ margin: 0, background: 'var(--risk-critical)', boxShadow: 'none' }}>
              Delete Rule
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Window Modal */}
      <Modal isOpen={!!windowModalEntity} onClose={() => setWindowModalEntity(null)} title={`Add ${windowModalEntity} Window`} width="400px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className={styles.modalInputGroup}>
            <label className={styles.modalLabel}>Window Duration</label>
            <input 
              type="text" 
              value={newWindowValue} 
              onChange={e => setNewWindowValue(e.target.value)} 
              className={styles.modalInput} 
              placeholder="e.g. 12h, 48h, 90d" 
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') confirmAddWindow();
              }}
            />
          </div>
          <div className={styles.modalActions}>
            <button onClick={() => setWindowModalEntity(null)} className={styles.cancelBtn}>
              Cancel
            </button>
            <button onClick={confirmAddWindow} className={styles.createButton} style={{ margin: 0 }}>
              Add Window
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
