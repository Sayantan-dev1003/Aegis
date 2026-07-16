"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { Slider } from '@/components/Slider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, CartesianGrid, Legend } from 'recharts';

// Dummy Data for charts (no backend provided for these)
const precisionRecallData = Array.from({ length: 100 }, (_, i) => {
  const threshold = i / 100;
  return {
    threshold,
    precision: Math.min(1, 0.4 + threshold * 0.6 + Math.random() * 0.05),
    recall: Math.max(0, 1 - Math.pow(threshold, 2) + Math.random() * 0.05),
    flaggedPct: Math.max(0, (1 - threshold) * 15)
  };
});

const featureImportanceData = [
  { feature: 'amount', value: 0.85 },
  { feature: 'distance_from_home', value: 0.72 },
  { feature: 'time_since_last_txn', value: 0.65 },
  { feature: 'merchant_category', value: 0.58 },
  { feature: 'velocity_24h', value: 0.51 },
  { feature: 'device_velocity', value: 0.44 },
  { feature: 'ip_risk_score', value: 0.38 },
  { feature: 'is_foreign', value: 0.31 },
  { feature: 'card_age_days', value: 0.25 },
  { feature: 'email_domain_risk', value: 0.19 }
];

const driftData = Array.from({ length: 30 }, (_, i) => ({
  date: `07-${(i + 1).toString().padStart(2, '0')}`,
  amount: 0.02 + Math.random() * 0.03,
  velocity_24h: 0.01 + Math.random() * 0.02,
  ip_risk_score: 0.05 + Math.random() * 0.08 + (i > 20 ? 0.1 : 0),
}));

const retrainJobs = [
  { id: 'job-942', status: 'completed', startedAt: '2026-07-09 22:00', durationSec: 3450 },
  { id: 'job-910', status: 'completed', startedAt: '2026-06-14 22:00', durationSec: 3380 },
  { id: 'job-855', status: 'failed', startedAt: '2026-05-19 22:00', durationSec: 420 },
];

export default function ModelManagementPage() {
  const [threshold, setThreshold] = useState(0.62);
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [isRetrainOpen, setIsRetrainOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Live Data
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const currentStats = precisionRecallData.find(d => d.threshold >= threshold) || precisionRecallData[0];

  const loadModels = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/models");
      setModels(data || []);
    } catch (err) {
      console.error("Failed to load models", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const activeModel = models.find(m => m.is_active);
  const prAuc = activeModel ? activeModel.precision : 0.887; 
  const rocAuc = activeModel ? activeModel.recall : 0.977; 
  const f1 = activeModel ? activeModel.f1_score : 0.824; 

  const handleRollback = async () => {
    if (!selectedVersion) return;
    try {
      await fetchApi(`http://localhost:8080/admin/models/${selectedVersion}/rollback`, {
        method: "POST"
      });
      setIsRollbackOpen(false);
      loadModels();
    } catch (err) {
      console.error("Failed to rollback", err);
      alert("Failed to rollback model");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* Model Card */}
      <div style={{ 
        backgroundColor: 'var(--bg-surface)', 
        border: '1px solid var(--border-color)', 
        borderRadius: 'var(--radius-lg)', 
        padding: 'var(--space-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{activeModel ? `XGBoost ${activeModel.version}` : 'Loading...'}</h2>
        <StatusBadge status="active" label="Live" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>·</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Deployed {activeModel && activeModel.deployed_at ? new Date(activeModel.deployed_at).toLocaleDateString() : 'Unknown'}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>·</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Trained on IEEE-CIS</span>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)' }}>
        <StatCard label="PR-AUC" value={prAuc.toFixed(3)} delta={2.1} deltaDirection="up" status="good" />
        <StatCard label="ROC-AUC" value={rocAuc.toFixed(3)} delta={0.5} deltaDirection="up" status="good" />
        <StatCard label="Accuracy" value="0.990" delta={0.1} deltaDirection="up" status="good" />
        <StatCard label="F1 Score" value={f1.toFixed(3)} delta={1.2} deltaDirection="up" status="good" />
      </div>

      {/* 2-Column: PR Curve & SHAP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <ChartCard title="Precision / Recall vs. Threshold" subtitle={`At threshold ${threshold.toFixed(2)}: ${currentStats.flaggedPct.toFixed(1)}% flagged, ${(currentStats.precision*100).toFixed(1)}% precision, ${(currentStats.recall*100).toFixed(1)}% recall`}>
          <div style={{ height: 250, marginBottom: 'var(--space-lg)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={precisionRecallData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="threshold" stroke="var(--text-secondary)" tick={{fontSize: 12}} type="number" domain={[0, 1]} />
                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={[0, 1]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="precision" stroke="var(--info)" strokeWidth={2} dot={false} name="Precision" />
                <Line type="monotone" dataKey="recall" stroke="var(--risk-low)" strokeWidth={2} dot={false} name="Recall" />
                <ReferenceLine x={threshold} stroke="var(--text-primary)" strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Slider value={threshold} onChange={setThreshold} min={0} max={1} step={0.01} />
        </ChartCard>

        <ChartCard title="Feature Importance (SHAP)" subtitle="Top 10 features by mean absolute SHAP value">
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={featureImportanceData} margin={{ top: 10, right: 10, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis dataKey="feature" type="category" stroke="var(--text-secondary)" tick={{fontSize: 12}} width={120} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  cursor={{fill: 'var(--bg-surface-hover)'}}
                />
                <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Feature Drift Chart */}
      <ChartCard title="Feature Drift (Population Stability Index)" subtitle="Monitoring key features for distribution shifts over 30 days">
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={driftData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
              <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
              />
              <Legend />
              <Line type="monotone" dataKey="amount" stroke="var(--info)" strokeWidth={2} dot={false} name="amount" />
              <Line type="monotone" dataKey="velocity_24h" stroke="var(--risk-low)" strokeWidth={2} dot={false} name="velocity_24h" />
              <Line type="monotone" dataKey="ip_risk_score" stroke="var(--risk-medium)" strokeWidth={2} dot={false} name="ip_risk_score" />
              <ReferenceLine y={0.1} stroke="var(--risk-critical)" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Warning Threshold', fill: 'var(--risk-critical)', fontSize: 12 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Model Version History */}
      <div>
        <h3 style={{ margin: '0 0 var(--space-md) 0', color: 'var(--text-primary)' }}>Version History</h3>
        {loading ? <div>Loading version history...</div> : (
          <DataTable
            columns={[
              { key: 'version', header: 'Version' },
              { key: 'deployedAt', header: 'Deployed At', render: (row: any) => row.deployed_at ? new Date(row.deployed_at).toLocaleString() : '-' },
              { key: 'prAuc', header: 'Precision / Recall', render: (row: any) => `${row.precision?.toFixed(3) || 0} / ${row.recall?.toFixed(3) || 0}` },
              { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.is_active ? 'active' : 'inactive'} label={row.is_active ? 'live' : 'archived'} /> },
              { key: 'actions', header: '', render: (row: any) => (
                row.is_active ? null : (
                  <button
                    onClick={() => { setSelectedVersion(row.id); setIsRollbackOpen(true); }}
                    style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Rollback
                  </button>
                )
              )}
            ]}
            rows={models}
          />
        )}
      </div>

      {/* Retrain Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Retrain Jobs</h3>
          <button
            onClick={() => setIsRetrainOpen(true)}
            style={{ backgroundColor: 'var(--accent)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
          >
            Trigger Retrain
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'id', header: 'Job ID' },
            { key: 'status', header: 'Status', render: (row: any) => (
              <StatusBadge 
                status={row.status === 'completed' ? 'active' : row.status === 'failed' ? 'critical' : 'pending'} 
                label={row.status} 
              />
            )},
            { key: 'startedAt', header: 'Started' },
            { key: 'durationSec', header: 'Duration', render: (row: any) => row.durationSec ? `${Math.floor(row.durationSec / 60)}m ${row.durationSec % 60}s` : '-' }
          ]}
          rows={retrainJobs}
        />
      </div>

      {/* Modals */}
      <ConfirmDialog
        isOpen={isRollbackOpen}
        title="Confirm Rollback"
        description={`Are you sure you want to rollback to this model version? This will immediately direct all live scoring traffic to the older model.`}
        confirmLabel="Rollback"
        danger={true}
        onConfirm={handleRollback}
        onCancel={() => setIsRollbackOpen(false)}
      />

      <ConfirmDialog
        isOpen={isRetrainOpen}
        title="Trigger Model Retrain"
        description="This will start a new training job using the latest 30 days of data. The job typically takes 45-60 minutes to complete."
        confirmLabel="Start Training"
        onConfirm={() => setIsRetrainOpen(false)}
        onCancel={() => setIsRetrainOpen(false)}
      />
    </div>
  );
}
