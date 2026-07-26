"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Slider } from '@/components/Slider';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar, CartesianGrid, Legend, LabelList
} from 'recharts';

// ─── Tooltip style ────────────────────────────────────────────────────────────

const ttStyle = {
  contentStyle: { backgroundColor: '#0D1117', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E8EDF4', fontSize: '0.8rem' },
  labelStyle: { color: '#8D9AAB' },
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const BrainIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.16"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.16"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);

// ─── Reusable primitives ──────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, accent, change }: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  change?: { pct: number } | null;
}) => (
  <div style={{
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '12px', padding: '16px 20px',
    position: 'relative', overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
      <div style={{ fontSize: '0.72rem', color: '#8D9AAB', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {change !== undefined && change !== null && (
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '12px', fontFamily: 'monospace',
          background: change.pct >= 0 ? 'rgba(52,211,153,0.12)' : 'rgba(244,63,94,0.12)',
          color: change.pct >= 0 ? '#34D399' : '#F43F5E',
          border: `1px solid ${change.pct >= 0 ? 'rgba(52,211,153,0.3)' : 'rgba(244,63,94,0.3)'}`,
        }}>
          {change.pct >= 0 ? `▲ +${change.pct.toFixed(1)}%` : `▼ ${change.pct.toFixed(1)}%`}
        </div>
      )}
    </div>
    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: accent, lineHeight: 1, fontFamily: 'monospace' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.7rem', color: '#4E5A6B', marginTop: '4px' }}>{sub}</div>}
    <div style={{
      position: 'absolute', top: '-20px', right: '-20px', width: '70px', height: '70px',
      borderRadius: '50%', background: `radial-gradient(circle, ${accent}12 0%, transparent 70%)`,
      pointerEvents: 'none',
    }} />
  </div>
);

const ChartCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div style={{
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', overflow: 'hidden',
  }}>
    <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#E8EDF4' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.75rem', color: '#8D9AAB', marginTop: '2px' }}>{subtitle}</div>}
    </div>
    <div style={{ padding: '16px 20px 20px' }}>{children}</div>
  </div>
);

// ─── Version status badge ─────────────────────────────────────────────────────

const VersionBadge = ({ active, deployedAt }: { active: boolean; deployedAt?: string }) => {
  const isNew = !active && !deployedAt;
  
  let text = 'Archived';
  let color = '#8D9AAB';
  let bg = 'rgba(148,163,184,0.08)';
  let border = 'rgba(148,163,184,0.15)';
  
  if (active) {
    text = 'Live';
    color = '#34D399';
    bg = 'rgba(52,211,153,0.1)';
    border = 'rgba(52,211,153,0.3)';
  } else if (isNew) {
    text = 'Ready';
    color = '#60A5FA';
    bg = 'rgba(96,165,250,0.1)';
    border = 'rgba(96,165,250,0.3)';
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
      background: bg,
      border: `1px solid ${border}`,
      color: color,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      {text}
    </span>
  );
};

const JobStatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    completed: { color: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' },
    failed:    { color: '#F43F5E', bg: 'rgba(244,63,94,0.1)',   border: 'rgba(244,63,94,0.3)'   },
    pending:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
    running:   { color: '#22D3EE', bg: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.3)'  },
  };
  const m = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: '20px',
      fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize',
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>{status}</span>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ModelManagementPage() {
  const [threshold, setThreshold] = useState(0.5);
  const [isRollbackOpen, setIsRollbackOpen] = useState(false);
  const [isRetrainOpen, setIsRetrainOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrainJobs, setRetrainJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [isRetraining, setIsRetraining] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<string>('loading');

  const [prData, setPrData] = useState<any[]>([]);
  const [shapData, setShapData] = useState<any[]>([]);

  const zeroStat = { threshold: threshold, precision: 0, recall: 0, flaggedPct: 0, tp: 0, fp: 0, tn: 0, fn: 0, businessScore: 0 };
  const foundStat = prData.length > 0
    ? prData.reduce((prev, curr) => {
        const currDiff = Math.abs(Number(curr.threshold ?? curr.Threshold ?? 0) - threshold);
        const prevDiff = Math.abs(Number(prev.threshold ?? prev.Threshold ?? 0) - threshold);
        return currDiff < prevDiff ? curr : prev;
      })
    : zeroStat;
  const currentStats = {
    threshold: Number(foundStat.threshold ?? foundStat.Threshold ?? threshold),
    precision: Number(foundStat.precision ?? foundStat.Precision ?? 0),
    recall: Number(foundStat.recall ?? foundStat.Recall ?? 0),
    flaggedPct: Number(
      foundStat.flaggedPct ??
      (foundStat['False Positive Rate'] !== undefined ? Number(foundStat['False Positive Rate']) * 100 :
      (foundStat.fp_rate !== undefined ? Number(foundStat.fp_rate) * 100 : 0))
    ),
  };

  const loadModels = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/models');
      setModels(data || []);
    } catch (e) {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/retrain-jobs');
      setRetrainJobs(data || []);
      setIsRetraining(data && data.some((j: any) => j.status === 'pending'));
    } catch (e) {
      // noop
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/models/active/metrics');
      if (data && data.threshold_metrics && Array.isArray(data.threshold_metrics) && data.threshold_metrics.length > 0) {
        const normalizedPr = data.threshold_metrics.map((d: any) => {
          const t = Number(d.threshold ?? d.Threshold ?? 0);
          const p = Number(d.precision ?? d.Precision ?? 0);
          const r = Number(d.recall ?? d.Recall ?? 0);
          let f = Number(d.flaggedPct ?? 0);
          if (d['False Positive Rate'] !== undefined) {
            f = Number(d['False Positive Rate']) * 100;
          } else if (d.fp_rate !== undefined) {
            f = Number(d.fp_rate) * 100;
          }
          const totalSamples = 118108; // Total validation dataset size
          const tpVal = d.TP !== undefined ? Number(d.TP) : (d.tp !== undefined ? Number(d.tp) : Math.round(4133 * r));
          const fpVal = d.FP !== undefined ? Number(d.FP) : (d.fp !== undefined ? Number(d.fp) : Math.round(113975 * (f / 100)));
          const fnVal = d.FN !== undefined ? Number(d.FN) : (d.fn !== undefined ? Number(d.fn) : Math.max(0, 4133 - tpVal));
          const tnVal = d.TN !== undefined ? Number(d.TN) : (d.tn !== undefined ? Number(d.tn) : Math.max(0, totalSamples - (tpVal + fpVal + fnVal)));
          const bsVal = d['Business Score'] !== undefined ? Number(d['Business Score']) : (d.business_score !== undefined ? Number(d.business_score) : (tpVal * 500 - fpVal * 25));
          return {
            threshold: t,
            precision: p,
            recall: r,
            flaggedPct: f,
            tp: tpVal,
            fp: fpVal,
            tn: tnVal,
            fn: fnVal,
            businessScore: bsVal,
          };
        });
        setPrData(normalizedPr);

        // Dynamically set initial slider threshold to the optimal F1 threshold from the model
        let bestThreshold = 0.5;
        let bestF1 = -1;
        normalizedPr.forEach((item: any) => {
          const p = item.precision;
          const r = item.recall;
          const f1 = (p + r) > 0 ? (2 * p * r) / (p + r) : 0;
          if (f1 > bestF1) {
            bestF1 = f1;
            bestThreshold = item.threshold;
          }
        });
        setThreshold(bestThreshold);
      } else {
        setPrData([]);
      }
      if (data && data.shap_importance && Array.isArray(data.shap_importance) && data.shap_importance.length > 0) {
        const normalizedShap = data.shap_importance.slice(0, 10).map((s: any) => ({
          feature: String(s.feature || s.Feature || s.name || 'Unknown'),
          value: Number(s.value ?? s.mean_abs_shap ?? s['Mean Abs SHAP'] ?? 0),
        }));
        setShapData(normalizedShap);
      } else {
        setShapData([]);
      }
    } catch (e) {
      setPrData([]);
      setShapData([]);
    }
  };

  const loadWorkerStatus = async () => {
    try {
      const data = await fetchApi('http://localhost:8080/admin/ml-worker/status');
      if (data && data.status) {
        setWorkerStatus(data.status);
      } else {
        setWorkerStatus('offline');
      }
    } catch (e) {
      setWorkerStatus('offline');
    }
  };

  useEffect(() => { loadModels(); loadJobs(); loadMetrics(); }, []);

  useEffect(() => {
    loadWorkerStatus();
    const interval = setInterval(loadWorkerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let tid: NodeJS.Timeout;
    let interval = 5000;
    const poll = async () => {
      if (!isRetraining) return;
      await loadJobs(); await loadModels();
      interval = Math.min(interval * 1.5, 30000);
      tid = setTimeout(poll, interval);
    };
    if (isRetraining) tid = setTimeout(poll, interval);
    return () => { if (tid) clearTimeout(tid); };
  }, [isRetraining]);

  const handleTriggerRetrain = async () => {
    try {
      setIsRetraining(true);
      await fetchApi('http://localhost:8080/admin/retrain-jobs', { method: 'POST' });
      setIsRetrainOpen(false);
      loadJobs();
    } catch (e) {
      setIsRetraining(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedVersion) return;
    try {
      await fetchApi(`http://localhost:8080/admin/models/${selectedVersion}/rollback`, { method: 'POST' });
      setIsRollbackOpen(false);
      loadModels();
    } catch (e) {
      alert('Failed to rollback model');
    }
  };

  const active = models.find(m => m.is_active) || models[0] || {};
  const selectedModelInfo = models.find(m => m.id === selectedVersion) || {};
  const isSelectedModelNew = !selectedModelInfo.is_active && !selectedModelInfo.deployed_at;

  const prevModel = models.find(m => m.id !== active.id) || null;

  const getPctChange = (currVal: number, prevVal?: number): { pct: number } | null => {
    if (!prevModel || prevVal === undefined || prevVal === null || prevVal === 0) return null;
    return { pct: ((currVal - prevVal) / prevVal) * 100 };
  };

  const kpis = [
    {
      label: 'PR-AUC',
      value: (active.pr_auc || 0).toFixed(3),
      sub: 'precision-recall area',
      accent: '#5C6EF8',
      change: getPctChange(Number(active.pr_auc || 0), Number(prevModel?.pr_auc || 0)),
    },
    {
      label: 'ROC-AUC',
      value: (active.roc_auc || 0).toFixed(3),
      sub: 'discriminative power',
      accent: '#22D3EE',
      change: getPctChange(Number(active.roc_auc || 0), Number(prevModel?.roc_auc || 0)),
    },
    {
      label: 'Recall',
      value: (active.recall || 0).toFixed(3),
      sub: 'true-positive rate',
      accent: '#34D399',
      change: getPctChange(Number(active.recall || 0), Number(prevModel?.recall || 0)),
    },
    {
      label: 'Precision',
      value: (active.precision || 0).toFixed(3),
      sub: 'positive pred. value',
      accent: '#F59E0B',
      change: getPctChange(Number(active.precision || 0), Number(prevModel?.precision || 0)),
    },
    {
      label: 'F1 Score',
      value: (active.f1_score || 0).toFixed(3),
      sub: 'harmonic mean',
      accent: '#8B5CF6',
      change: getPctChange(Number(active.f1_score || 0), Number(prevModel?.f1_score || 0)),
    },
  ];

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', backgroundColor: '#0D1117',
    border: '1px solid rgba(255,255,255,0.1)', color: '#E8EDF4',
    borderRadius: '8px', colorScheme: 'dark', fontSize: '0.875rem', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Row 2: PR Curve + Confusion Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ChartCard
          title="Precision / Recall vs. Threshold"
          subtitle={`At threshold ${threshold.toFixed(2)} — flagged: ${currentStats.flaggedPct.toFixed(1)}%  ·  precision: ${(currentStats.precision * 100).toFixed(1)}%  ·  recall: ${(currentStats.recall * 100).toFixed(1)}%`}
        >
          <div style={{ height: 240, marginBottom: '12px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="threshold" stroke="#4E5A6B" tick={{ fontSize: 11 }} type="number" domain={[0, 1]} />
                <YAxis stroke="#4E5A6B" tick={{ fontSize: 11 }} domain={[0, 1]} />
                <Tooltip {...ttStyle} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) : v} />
                <Legend wrapperStyle={{ fontSize: '0.78rem', color: '#8D9AAB' }} />
                <Line type="monotone" dataKey="precision" stroke="#22D3EE" strokeWidth={2} dot={false} name="Precision" />
                <Line type="monotone" dataKey="recall"    stroke="#34D399" strokeWidth={2} dot={false} name="Recall" />
                <ReferenceLine x={threshold} stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Slider value={threshold} onChange={setThreshold} min={0} max={1} step={0.01} />
        </ChartCard>

        <ChartCard
          title="Confusion Matrix (At Selected Threshold)"
          subtitle={`Validation sample distribution at threshold ${threshold.toFixed(2)}`}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '8px 0', height: '100%', alignContent: 'center' }}>
            <div style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.72rem', color: '#34D399', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>True Positives (Fraud Caught)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E8EDF4', marginTop: '6px', fontFamily: 'monospace' }}>{(foundStat.tp || 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#8D9AAB', marginTop: '4px' }}>Correctly blocked fraud transactions</div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.72rem', color: '#F59E0B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>False Positives (False Alarms)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E8EDF4', marginTop: '6px', fontFamily: 'monospace' }}>{(foundStat.fp || 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#8D9AAB', marginTop: '4px' }}>Legitimate txns flagged for review</div>
            </div>
            <div style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.25)', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.72rem', color: '#22D3EE', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>True Negatives (Correct Approval)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E8EDF4', marginTop: '6px', fontFamily: 'monospace' }}>{(foundStat.tn || 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#8D9AAB', marginTop: '4px' }}>Legitimate txns passed smoothly</div>
            </div>
            <div style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.72rem', color: '#F43F5E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>False Negatives (Missed Fraud)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E8EDF4', marginTop: '6px', fontFamily: 'monospace' }}>{(foundStat.fn || 0).toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#8D9AAB', marginTop: '4px' }}>Fraud txns slipped through</div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Row 3: Feature Importance + Version History Scroller */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ChartCard title="Feature Importance (SHAP)" subtitle="Top 10 features by mean absolute SHAP value">
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={shapData} margin={{ top: 5, right: 50, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" stroke="#4E5A6B" tick={{ fontSize: 11 }} />
                <YAxis dataKey="feature" type="category" width={140} interval={0} tick={(props: any) => {
                  const { x, y, payload } = props;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={-8} y={4} fill="#8D9AAB" fontSize={11} textAnchor="end" alignmentBaseline="middle">{payload.value}</text>
                    </g>
                  );
                }} />
                <Bar dataKey="value" fill="#5C6EF8" radius={[0, 4, 4, 0]} activeBar={false}>
                  <LabelList dataKey="value" position="right" formatter={(v: any) => typeof v === 'number' ? `${(v * 100).toFixed(0)}%` : v} fill="#8D9AAB" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Version History" subtitle="Deployed model versions and rollback controls">
          <div style={{ height: 320, overflowY: 'auto', paddingRight: '4px' }}>
            {loading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>Loading version history…</div>
            ) : models.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>No model versions found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0D1117', zIndex: 5 }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Version', 'Deployed At', 'Status'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#4E5A6B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map((m, i) => (
                    <tr key={m.id} style={{ borderBottom: i < models.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ fontFamily: 'monospace', color: '#A5B4FC', fontWeight: 600 }}>{m.version}</span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#8D9AAB', fontSize: '0.82rem' }}>
                        {m.deployed_at ? new Date(m.deployed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                          <VersionBadge active={m.is_active} deployedAt={m.deployed_at} />
                          {!m.is_active && (
                            <button
                              onClick={() => { setSelectedVersion(m.id); setIsRollbackOpen(true); }}
                              style={{
                                padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                                background: m.deployed_at ? 'rgba(245,158,11,0.08)' : 'rgba(96,165,250,0.08)',
                                border: `1px solid ${m.deployed_at ? 'rgba(245,158,11,0.25)' : 'rgba(96,165,250,0.25)'}`,
                                color: m.deployed_at ? '#FCD34D' : '#60A5FA', fontSize: '0.75rem', fontWeight: 600,
                              }}
                            >
                              {m.deployed_at ? 'Rollback' : 'Deploy'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Retrain Jobs */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: '#E8EDF4' }}>Retrain Jobs</div>
            <div style={{ fontSize: '0.8rem', color: '#8D9AAB', marginTop: '2px' }}>Training job history and current status</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {workerStatus === 'loading' && (
              <span style={{ fontSize: '0.8rem', color: '#F59E0B', fontWeight: 500 }}>ML Worker is loading...</span>
            )}
            {workerStatus === 'offline' && (
              <span style={{ fontSize: '0.8rem', color: '#F43F5E', fontWeight: 500 }}>ML Worker is offline</span>
            )}
            <button
              onClick={() => setIsRetrainOpen(true)}
              disabled={isRetraining || workerStatus !== 'live'}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '9px 18px', borderRadius: '8px', border: 'none', 
                cursor: (isRetraining || workerStatus !== 'live') ? 'not-allowed' : 'pointer',
                background: (isRetraining || workerStatus !== 'live') ? 'rgba(92,110,248,0.3)' : 'linear-gradient(135deg, #5C6EF8 0%, #7E8DF9 100%)',
                color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                boxShadow: (isRetraining || workerStatus !== 'live') ? 'none' : '0 4px 14px rgba(92,110,248,0.35)',
                opacity: (isRetraining || workerStatus !== 'live') ? 0.7 : 1,
              }}
            >
              <RefreshIcon />
              {isRetraining ? 'Training…' : 'Trigger Retrain'}
            </button>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden' }}>
          {loadingJobs ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>Loading jobs…</div>
          ) : retrainJobs.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#4E5A6B', fontSize: '0.875rem' }}>No retrain jobs found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Job ID', 'Status', 'Started', 'Duration'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#4E5A6B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retrainJobs.map((j, i) => (
                  <tr key={j.id} style={{ borderBottom: i < retrainJobs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', color: '#8D9AAB', fontSize: '0.8rem' }}>{j.id?.slice(0, 12)}…</td>
                    <td style={{ padding: '14px 18px' }}><JobStatusBadge status={j.status} /></td>
                    <td style={{ padding: '14px 18px', color: '#8D9AAB', fontSize: '0.82rem' }}>{j.startedAt ? new Date(j.startedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td style={{ padding: '14px 18px', color: '#E8EDF4', fontFamily: 'monospace' }}>{j.durationSec ? `${Math.floor(j.durationSec / 60)}m ${j.durationSec % 60}s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={isRollbackOpen}
        title={isSelectedModelNew ? "Deploy New Model" : "Confirm Rollback"}
        description={isSelectedModelNew ? "Are you sure you want to deploy this new model? All live traffic will redirect to it." : "Are you sure you want to rollback to this model version? All live scoring traffic will immediately redirect to the older model."}
        confirmLabel={isSelectedModelNew ? "Deploy" : "Rollback"}
        danger={!isSelectedModelNew}
        onConfirm={handleRollback}
        onCancel={() => setIsRollbackOpen(false)}
      />
      <ConfirmDialog
        isOpen={isRetrainOpen}
        title="Trigger Model Retrain"
        description="This will start a new training job using the latest data. Training typically takes 15 to 20 minutes. Do you want to proceed?"
        confirmLabel="Start Retrain"
        onConfirm={handleTriggerRetrain}
        onCancel={() => setIsRetrainOpen(false)}
      />
    </div>
  );
}
