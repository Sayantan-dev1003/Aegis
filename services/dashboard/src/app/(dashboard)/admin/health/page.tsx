"use client";

import React, { useEffect, useState } from 'react';
import { fetchApi } from "../../../lib/api";
import { StatCard } from '../../../../components/StatCard';
import { ChartCard } from '../../../../components/ChartCard';
import { StatusBadge } from '../../../../components/StatusBadge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function SystemHealthPage() {
  const [chartData, setChartData] = useState<any[]>([]);
  const [kpiData, setKpiData] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Poll for metrics every 5 seconds
  useEffect(() => {
    let mounted = true;
    
    const loadMetrics = async () => {
      try {
        const data = await fetchApi("http://localhost:8080/admin/metrics");
        if (!mounted || !data) return;
        
        // Push a new data point to chartData
        const now = new Date();
        const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        setChartData(prev => {
          const newData = [...prev];
          if (newData.length > 20) newData.shift();
          newData.push({
            time: timeStr,
            topicA: data.consumer_lag?.["transactions.raw"] || 0,
            topicB: data.consumer_lag?.["transactions.scored"] || 0,
            p50: parseInt(data.api_latency?.p50 || "0"),
            p95: parseInt(data.api_latency?.p95 || "0"),
            p99: parseInt(data.api_latency?.p99 || "0"),
            redisHitRate: parseInt(data.redis_hit_rate || "0"),
          });
          return newData;
        });
        
        // Set KPIs
        setKpiData([
          { label: 'Error Rate', value: data.error_rate || '0%', status: 'good' as const },
          { label: 'Uptime', value: data.uptime || '100%', status: 'good' as const },
          { label: 'API p50', value: data.api_latency?.p50 || '0ms', status: 'good' as const },
          { label: 'API p99', value: data.api_latency?.p99 || '0ms', status: 'warn' as const },
          { label: 'Redis Hit Rate', value: data.redis_hit_rate || '0%', status: 'good' as const },
        ]);
        
        // Set Services
        setServices(data.services || []);
      } catch (err) {
        console.error("Failed to load metrics", err);
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return <div style={{ padding: "2rem" }}>Loading live metrics...</div>;
  }

  const incidents: any[] = [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-md)' }}>
        {kpiData.map((kpi, i) => (
          <StatCard key={i} {...kpi} />
        ))}
      </div>

      {/* Graphs - Side by Side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>
        <ChartCard title="Kafka Consumer Lag" subtitle="Messages behind per topic" liveIndicator externalLink="#">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }} />
              <Line type="monotone" dataKey="topicA" name="txns-in" stroke="var(--primary-color)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="topicB" name="results-out" stroke="var(--risk-info)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="API Latency" subtitle="Response times (ms)" liveIndicator externalLink="#">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }} />
              <Line type="monotone" dataKey="p50" name="p50" stroke="var(--risk-low)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p95" name="p95" stroke="var(--risk-medium)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p99" name="p99" stroke="var(--risk-critical)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Active Incidents (Full Width) */}
      <div style={{ backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Active Incidents</h3>
          {incidents.length > 0 && <span style={{ color: 'var(--risk-critical)', fontSize: '0.85rem', fontWeight: 600 }}>{incidents.length} Active</span>}
        </div>
        
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)' }}>
          {incidents.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: 'var(--space-xl)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--risk-low)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>All systems operational</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No active incidents reported.</div>
            </div>
          ) : (
            <div>Table</div>
          )}
        </div>
      </div>
    </div>
  );
}

