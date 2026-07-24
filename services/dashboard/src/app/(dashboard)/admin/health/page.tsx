"use client";

import React, { useEffect, useState } from 'react';
import { fetchApi } from "../../../lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ─── Icons ────────────────────────────────────────────────────────────────────

const ActivityIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const ZapIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const ServerIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>
  </svg>
);

const ClockIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const DatabaseIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

// ─── KPI Stat card ────────────────────────────────────────────────────────────

const KpiCard = ({
  icon, label, value, sub, accent, glow,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accent: string; glow: string;
}) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', padding: '18px 20px',
    display: 'flex', alignItems: 'center', gap: '16px',
    position: 'relative', overflow: 'hidden',
  }}>
    <div style={{
      width: '42px', height: '42px', borderRadius: '11px', flexShrink: 0,
      background: `${accent}18`, border: `1px solid ${accent}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '0.72rem', color: '#8D9AAB', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#E8EDF4', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#4E5A6B', marginTop: '3px' }}>{sub}</div>}
    </div>
    <div style={{
      position: 'absolute', top: '-20px', right: '-20px',
      width: '80px', height: '80px', borderRadius: '50%',
      background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
      pointerEvents: 'none',
    }} />
  </div>
);

// ─── Chart card ───────────────────────────────────────────────────────────────

const ChartSection = ({
  title, subtitle, live, children,
}: { title: string; subtitle: string; live?: boolean; children: React.ReactNode }) => (
  <div style={{
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', overflow: 'hidden',
  }}>
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#E8EDF4' }}>{title}</span>
          {live && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#34D399', fontWeight: 600 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34D399', boxShadow: '0 0 6px #34D399', display: 'inline-block' }} />
              LIVE
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#8D9AAB', marginTop: '2px' }}>{subtitle}</div>
      </div>
    </div>
    <div style={{ padding: '16px 20px 20px' }}>
      {children}
    </div>
  </div>
);

const tooltipStyle = {
  contentStyle: { backgroundColor: '#0D1117', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E8EDF4', fontSize: '0.8rem' },
  labelStyle: { color: '#8D9AAB' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: 'Last 8 Sec', value: '8s' },
  { label: 'Last 30 Sec', value: '30s' },
  { label: 'Last 1 Min', value: '1m' },
  { label: 'Last 2 Min', value: '2m' },
  { label: 'Last 10 Min', value: '10m' },
  { label: 'Last 30 Min', value: '30m' },
  { label: 'Last 1 Hour', value: '1h' },
  { label: 'Last 2 Hours', value: '2h' },
  { label: 'Last 6 Hours', value: '6h' },
  { label: 'Last 12 Hours', value: '12h' },
  { label: 'Last 1 Day', value: '24h' },
  { label: 'Last 2 Days', value: '48h' },
  { label: 'Last 4 Days', value: '96h' },
  { label: 'Last 1 Week', value: '168h' },
  { label: 'Last 2 Weeks', value: '336h' },
  { label: 'Last 1 Month', value: '720h' },
];

const getDurationMs = (range: string) => {
  const val = parseInt(range);
  if (range.endsWith('s')) return val * 1000;
  if (range.endsWith('m')) return val * 60 * 1000;
  if (range.endsWith('h')) return val * 60 * 60 * 1000;
  return 120 * 1000;
};


export default function SystemHealthPage() {
  const [chartData, setChartData] = useState<any[]>([]);
  const [kpiData, setKpiData] = useState<any>({});
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('2m');
  const [incidents, setIncidents] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchIncidents = async () => {
      try {
        const data = await fetchApi('http://localhost:8080/api/v1/incidents');
        if (mounted && Array.isArray(data)) {
          setIncidents(data);
        }
      } catch (err) {
        console.error('Failed to load incidents', err);
      }
    };
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const formatTime = (time: number) => {
    if (isNaN(time)) return '';
    // Round to nearest second purely for cleaner display
    const d = new Date(Math.round(time / 1000) * 1000);
    
    if (timeRange === '720h') {
      return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    }
    if (['336h', '168h', '96h', '48h', '24h'].includes(timeRange)) {
      return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    }
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
  };

  // Load history when timeRange changes or on initial mount
  useEffect(() => {
    let mounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const historyData = await fetchApi(`http://localhost:8080/admin/metrics?history=true&duration=${timeRange}`);
        if (!mounted) return;
        if (historyData && Array.isArray(historyData)) {
          setChartData(historyData);
        }
      } catch (err) {
        console.error('Failed to load history metrics', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchHistory();
    return () => { mounted = false; };
  }, [timeRange]);

  // Poll for live metrics
  useEffect(() => {
    let mounted = true;

    const loadLiveMetrics = async () => {
      try {
        const data = await fetchApi("http://localhost:8080/admin/metrics");
        if (!mounted || !data) return;

        const durationMs = getDurationMs(timeRange);
        const intervalMs = durationMs / 8;
        const now = Date.now();
        const roundedTime = Math.floor(now / intervalMs) * intervalMs;

        setChartData(prev => {
          const next = [...prev];
          const filtered = next.filter(d => d.time >= roundedTime - durationMs && d.time !== roundedTime);
          filtered.push({
            time: roundedTime,
            topicA: data.consumer_lag?.['transactions.raw'] || 0,
            topicB: data.consumer_lag?.['transactions.scored'] || 0,
            p50: parseInt(data.api_latency?.p50 || '0'),
            p95: parseInt(data.api_latency?.p95 || '0'),
            p99: parseInt(data.api_latency?.p99 || '0'),
          });
          return filtered.sort((a,b) => a.time - b.time);
        });

        setKpiData({
          errorRate: data.error_rate || '0%',
          uptime: data.uptime || '100%',
          p50: data.api_latency?.p50 || '0ms',
          p99: data.api_latency?.p99 || '0ms',
          redisHit: data.redis_hit_rate || '0%',
        });

        setServices(data.services || []);
      } catch (err) {
        console.error('Failed to load live metrics', err);
      }
    };

    const durationMs = getDurationMs(timeRange);
    const intervalMs = durationMs / 8; // 8 divisions = interval

    const interval = setInterval(loadLiveMetrics, intervalMs);
    return () => { mounted = false; clearInterval(interval); };
  }, [timeRange]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '40px', color: '#8D9AAB' }}>
        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #5C6EF8', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        Loading live metrics…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const kpiCards = [
    { icon: <ActivityIcon />, label: 'Error Rate', value: kpiData.errorRate, sub: 'last 5 minutes', accent: '#34D399', glow: 'rgba(52,211,153,0.12)' },
    { icon: <ClockIcon />, label: 'Uptime', value: kpiData.uptime, sub: 'current session', accent: '#5C6EF8', glow: 'rgba(92,110,248,0.12)' },
    { icon: <ZapIcon />, label: 'API p50', value: kpiData.p50, sub: 'median latency', accent: '#22D3EE', glow: 'rgba(34,211,238,0.12)' },
    { icon: <ZapIcon />, label: 'API p99', value: kpiData.p99, sub: 'tail latency', accent: '#F59E0B', glow: 'rgba(245,158,11,0.12)' },
    { icon: <DatabaseIcon />, label: 'Redis Hit Rate', value: kpiData.redisHit, sub: 'cache efficiency', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.12)' },
  ];

  const durationMs = getDurationMs(timeRange);
  const intervalMs = durationMs / 8;
  const now = Date.now();
  const roundedEnd = Math.floor(now / intervalMs) * intervalMs;
  const ticks = [];
  for (let i = 8; i >= 0; i--) {
    ticks.push(roundedEnd - i * intervalMs);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* Header controls */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-10px' }}>
        <select 
          value={timeRange} 
          onChange={(e) => setTimeRange(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#E8EDF4',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          {TIME_RANGES.map(tr => (
            <option key={tr.value} value={tr.value} style={{ background: '#0D1117', color: '#E8EDF4' }}>
              {tr.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
        {kpiCards.map(c => <KpiCard key={c.label} {...c} />)}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ChartSection title="Kafka Consumer Lag" subtitle="Messages behind per topic, rolling 20 data points" live>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 35, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis 
                dataKey="time" 
                type="number" 
                domain={[ticks[0], ticks[8]]} 
                ticks={ticks}
                interval={0}
                tickFormatter={formatTime} 
                stroke="#4E5A6B" 
                fontSize={9.5} 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8} 
              />
              <YAxis stroke="#4E5A6B" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="topicA" name="txns-raw" stroke="#5C6EF8" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="topicB" name="txns-scored" stroke="#22D3EE" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            {[{ color: '#5C6EF8', label: 'transactions.raw' }, { color: '#22D3EE', label: 'transactions.scored' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#8D9AAB' }}>
                <div style={{ width: '16px', height: '2px', background: l.color, borderRadius: '2px' }} />
                {l.label}
              </div>
            ))}
          </div>
        </ChartSection>

        <ChartSection title="API Latency" subtitle="Response times in milliseconds (p50 / p95 / p99)" live>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 35, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis 
                dataKey="time" 
                type="number" 
                domain={[ticks[0], ticks[8]]} 
                ticks={ticks}
                interval={0}
                tickFormatter={formatTime} 
                stroke="#4E5A6B" 
                fontSize={9.5} 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8} 
              />
              <YAxis stroke="#4E5A6B" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="p50" name="p50" stroke="#34D399" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p95" name="p95" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p99" name="p99" stroke="#F43F5E" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            {[{ color: '#34D399', label: 'p50' }, { color: '#F59E0B', label: 'p95' }, { color: '#F43F5E', label: 'p99' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#8D9AAB' }}>
                <div style={{ width: '16px', height: '2px', background: l.color, borderRadius: '2px' }} />
                {l.label}
              </div>
            ))}
          </div>
        </ChartSection>
      </div>

      {/* Active Incidents */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '14px', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#E8EDF4' }}>Active Incidents</div>
            <div style={{ fontSize: '0.75rem', color: '#8D9AAB', marginTop: '2px' }}>Ongoing alerts and degradations</div>
          </div>
          {incidents.length > 0 && (
            <span style={{
              padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
              background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#F43F5E',
            }}>
              {incidents.length} Active
            </span>
          )}
        </div>

        <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', textAlign: 'center' }}>
          {incidents.length === 0 ? (
            <>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34D399',
              }}>
                <CheckCircleIcon />
              </div>
              <div style={{ fontWeight: 600, color: '#E8EDF4' }}>All systems operational</div>
              <div style={{ fontSize: '0.82rem', color: '#8D9AAB' }}>No active incidents or degradations reported.</div>
            </>
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {incidents.map(inc => (
                <div key={inc.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#E8EDF4', fontSize: '0.9rem' }}>{inc.title}</span>
                    <span style={{ fontSize: '0.75rem', color: '#8D9AAB' }}>{new Date(inc.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#8D9AAB', marginBottom: '10px' }}>{inc.description}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: inc.severity === 'critical' || inc.severity === 'high' ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)', color: inc.severity === 'critical' || inc.severity === 'high' ? '#F43F5E' : '#F59E0B', border: `1px solid ${inc.severity === 'critical' || inc.severity === 'high' ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)'}`, textTransform: 'uppercase' }}>
                      {inc.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
