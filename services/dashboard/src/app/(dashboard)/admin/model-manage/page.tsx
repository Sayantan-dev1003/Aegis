"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { StatCard } from '@/components/StatCard';
import { ChartCard } from '@/components/ChartCard';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { Slider } from '@/components/Slider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, CartesianGrid, Legend, LabelList } from 'recharts';

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



export default function ModelManagementPage() {
  const [threshold, setThreshold] = useState(0.62);
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [isRetrainOpen, setIsRetrainOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Live Data
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [retrainJobsData, setRetrainJobsData] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [isRetraining, setIsRetraining] = useState(false);

  const currentStats = precisionRecallData.find(d => d.threshold >= threshold) || precisionRecallData[0];

  const loadModels = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/models");
      setModels(data || []);
    } catch (err) {
      console.error("Failed to load models", err);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRetrainJobs = async () => {
    try {
      const data = await fetchApi("http://localhost:8080/admin/retrain-jobs");
      setRetrainJobsData(data || []);
      // Check if any job is pending to continue polling
      const hasPending = data && data.some((job: any) => job.status === 'pending');
      setIsRetraining(hasPending);
    } catch (err) {
      console.error("Failed to load retrain jobs", err);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadModels();
    loadRetrainJobs();
  }, []);

  // Dynamic polling mechanism with backoff
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let currentInterval = 5000; // start at 5s
    const maxInterval = 30000;  // cap at 30s

    const poll = async () => {
      if (!isRetraining) return;
      await loadRetrainJobs();
      await loadModels();
      currentInterval = Math.min(currentInterval * 1.5, maxInterval);
      timeoutId = setTimeout(poll, currentInterval);
    };

    if (isRetraining) {
      timeoutId = setTimeout(poll, currentInterval);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isRetraining]);

  const handleTriggerRetrain = async () => {
    try {
      setIsRetraining(true);
      await fetchApi("http://localhost:8080/admin/retrain-jobs", {
        method: "POST"
      });
      setIsRetrainOpen(false);
      loadRetrainJobs(); // immediately reload jobs
    } catch (error) {
      console.error("Failed to trigger retrain", error);
      setIsRetraining(false);
    }
  };

  const activeModel = models.find(m => m.is_active) || models[0] || {};
  const prAuc = activeModel.pr_auc || 0.000; 
  const rocAuc = activeModel.roc_auc || 0.000; 
  const recall = activeModel.recall || 0.000;
  const precision = activeModel.precision || 0.000;
  const f1 = activeModel.f1_score || 0.000; 

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

  const PRSubtitle = (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>At threshold <strong style={{color: 'var(--text-main)'}}>{threshold.toFixed(2)}</strong>:</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <span style={{ padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'rgb(96, 165, 250)', fontSize: '0.8rem', fontWeight: 600 }}>Flagged: {currentStats.flaggedPct.toFixed(1)}%</span>
        <span style={{ padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'rgb(52, 211, 153)', fontSize: '0.8rem', fontWeight: 600 }}>Precision: {(currentStats.precision * 100).toFixed(1)}%</span>
        <span style={{ padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'rgb(251, 191, 36)', fontSize: '0.8rem', fontWeight: 600 }}>Recall: {(currentStats.recall * 100).toFixed(1)}%</span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-md)' }}>
        <StatCard label="PR-AUC" value={prAuc.toFixed(3)} status="good" />
        <StatCard label="ROC-AUC" value={rocAuc.toFixed(3)} status="good" />
        <StatCard label="Recall" value={recall.toFixed(3)} status="good" />
        <StatCard label="Precision" value={precision.toFixed(3)} status="good" />
        <StatCard label="F1 Score" value={f1.toFixed(3)} status="good" />
      </div>

      {/* 2-Column: PR Curve & SHAP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <ChartCard title="Precision / Recall vs. Threshold" subtitle={PRSubtitle}>
          <div style={{ height: 250, marginBottom: 'var(--space-lg)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={precisionRecallData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="threshold" stroke="var(--text-secondary)" tick={{fontSize: 12}} type="number" domain={[0, 1]} />
                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={[0, 1]} />
                <Tooltip 
                  formatter={(value: any) => typeof value === 'number' ? value.toFixed(3) : value}
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
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={featureImportanceData} margin={{ top: 10, right: 60, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis dataKey="feature" type="category" width={140} interval={0} tick={(props: any) => {
                  const { x, y, payload } = props;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={-10} y={4} fill="#ffffff" fontSize={12} textAnchor="end" alignmentBaseline="middle">
                        {payload.value}
                      </text>
                    </g>
                  );
                }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} activeBar={false}>
                  <LabelList dataKey="value" position="right" formatter={(val: any) => typeof val === 'number' ? `${(val * 100).toFixed(0)}%` : val} fill="#ffffff" fontSize={12} />
                </Bar>
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
                formatter={(value: any) => typeof value === 'number' ? value.toFixed(3) : value}
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
          <h2 className="text-xl font-semibold text-white">Retrain Jobs</h2>
          <button 
            onClick={() => setIsRetrainOpen(true)}
            disabled={isRetraining}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: isRetraining ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 500,
              padding: 0,
              opacity: isRetraining ? 0.5 : 1
            }}
          >
            {isRetraining ? 'Training...' : 'Trigger Retrain'}
          </button>
        </div>
        {loadingJobs ? (
          <div className="text-gray-400 py-4 text-center">Loading jobs...</div>
        ) : (
          <DataTable
            columns={[
              { key: 'id', header: 'Job ID' },
              { key: 'status', header: 'Status', render: (row: any) => (
                <StatusBadge 
                  status={row.status === 'completed' ? 'active' : row.status === 'failed' ? 'critical' : 'pending'} 
                  label={row.status} 
                />
              )},
              { key: 'startedAt', header: 'Started', render: (row: any) => new Date(row.startedAt).toLocaleString() },
              { key: 'durationSec', header: 'Duration', render: (row: any) => row.durationSec ? `${Math.floor(row.durationSec / 60)}m ${row.durationSec % 60}s` : '-' }
            ]}
            rows={retrainJobsData}
          />
        )}
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
        description="This will start a new training job using the latest data. The job typically takes 45-60 minutes to complete. Do you want to proceed?"
        onConfirm={handleTriggerRetrain}
        onCancel={() => setIsRetrainOpen(false)}
        confirmLabel="Start Retrain"
      />
    </div>
  );
}
