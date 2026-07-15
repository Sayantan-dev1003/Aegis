"use client";

import React, { useEffect, useState } from 'react';
import { StatCard } from '../../../../components/StatCard';
import { ChartCard } from '../../../../components/ChartCard';
import { StatusBadge } from '../../../../components/StatusBadge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

// --- Mock Data ---
const initialChartData = Array.from({ length: 20 }, (_, i) => ({
  time: `10:${i.toString().padStart(2, '0')}`,
  topicA: Math.floor(Math.random() * 20) + 10,
  topicB: Math.floor(Math.random() * 10) + 5,
  p50: Math.floor(Math.random() * 10) + 20,
  p95: Math.floor(Math.random() * 20) + 40,
  p99: Math.floor(Math.random() * 30) + 70,
  redisHitRate: Math.random() * 10 + 90,
  redisLatency: Math.random() * 2 + 1,
  wsConnections: Math.floor(Math.random() * 500) + 5000,
  wsThroughput: Math.floor(Math.random() * 200) + 1000,
}));

const services = [
  { name: 'Go API', status: 'active' as const },
  { name: 'Python Scorer', status: 'active' as const },
  { name: 'Postgres DB', status: 'active' as const },
  { name: 'Redis Cache', status: 'warning' as const },
  { name: 'Kafka Broker 1', status: 'active' as const },
  { name: 'Kafka Broker 2', status: 'active' as const },
  { name: 'Kafka Broker 3', status: 'active' as const },
];

const incidents: unknown[] = []; // Empty array for empty state

export default function SystemHealthPage() {
  const [chartData, setChartData] = useState(initialChartData);
  const [kpiData, setKpiData] = useState([
    { label: 'Kafka Lag', value: '12ms', delta: 2, deltaDirection: 'down' as const, status: 'good' as const },
    { label: 'Throughput', value: '4,204', delta: 5, deltaDirection: 'up' as const, status: 'good' as const },
    { label: 'p99 Latency', value: '85ms', delta: 12, deltaDirection: 'up' as const, status: 'warn' as const },
    { label: 'Error Rate', value: '0.04%', delta: 0, deltaDirection: 'down' as const, status: 'good' as const },
    { label: 'Uptime', value: '99.99%', status: 'good' as const },
  ]);

  // Simulate live data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setChartData(prev => {
        const newData = [...prev.slice(1)];
        const last = prev[prev.length - 1];
        
        // Extract minute and second
        let [m, s] = last.time.split(':').map(Number);
        s++;
        if (s >= 60) { s = 0; m++; }
        
        newData.push({
          time: `${m}:${s.toString().padStart(2, '0')}`,
          topicA: Math.floor(Math.random() * 20) + 10,
          topicB: Math.floor(Math.random() * 10) + 5,
          p50: Math.floor(Math.random() * 10) + 20,
          p95: Math.floor(Math.random() * 20) + 40,
          p99: Math.floor(Math.random() * 30) + 70,
          redisHitRate: Math.random() * 10 + 90,
          redisLatency: Math.random() * 2 + 1,
          wsConnections: Math.floor(Math.random() * 500) + 5000,
          wsThroughput: Math.floor(Math.random() * 200) + 1000,
        });
        return newData;
      });
      
      // Randomly tweak KPIs
      setKpiData(prev => prev.map(kpi => {
        if (kpi.label === 'Throughput') {
          return { ...kpi, value: `${Math.floor(Math.random() * 500 + 4000).toLocaleString()}` };
        }
        return kpi;
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "var(--space-xs)" }}>System Health & Observability</h1>
        <p style={{ color: "var(--text-muted)" }}>Single pane of glass over the Aegis pipeline.</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-md)' }}>
        {kpiData.map((kpi, i) => (
          <StatCard key={i} {...kpi} />
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
        <ChartCard title="Kafka Consumer Lag" subtitle="Messages behind per topic" liveIndicator externalLink="#">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              <Line type="monotone" dataKey="topicA" name="txns-in" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="topicB" name="results-out" stroke="var(--risk-info)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="API Latency" subtitle="Response times (ms)" liveIndicator externalLink="#">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }} />
              <Line type="monotone" dataKey="p50" name="p50" stroke="var(--risk-low)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p95" name="p95" stroke="var(--risk-medium)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p99" name="p99" stroke="var(--risk-critical)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        
        <ChartCard title="Redis Cache Performance" subtitle="Hit rate & Compute latency" liveIndicator externalLink="#">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis domain={[80, 100]} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }} />
              <Area type="monotone" dataKey="redisHitRate" name="Hit Rate %" stroke="var(--risk-low)" fill="var(--risk-low)" fillOpacity={0.1} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="WebSocket Hub" subtitle="Active connections & throughput" liveIndicator externalLink="#">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)' }} />
              <Line type="monotone" dataKey="wsConnections" name="Connections" stroke="var(--info)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="wsThroughput" name="Throughput (msg/s)" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Service Status Matrix & Incidents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-md)' }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>Service Matrix</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
            {services.map((svc, i) => (
              <StatusBadge key={i} status={svc.status} label={svc.name} />
            ))}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Active Incidents</h3>
            {incidents.length > 0 && <span style={{ color: 'var(--risk-critical)', fontSize: '0.85rem', fontWeight: 600 }}>{incidents.length} Active</span>}
          </div>
          
          <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)' }}>
            {incidents.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: 'var(--space-xl)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(18, 183, 106, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--risk-low)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>All systems operational</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No active incidents reported across the pipeline.</div>
              </div>
            ) : (
              // Incident table would go here
              <div>Table</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
