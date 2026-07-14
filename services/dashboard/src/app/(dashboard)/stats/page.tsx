"use client";

import React, { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import styles from "../components.module.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function StatsPage() {
  const [summary, setSummary] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [sumData, trendData] = await Promise.all([
          fetchApi("/stats/summary"),
          fetchApi("/stats/trends")
        ]);
        setSummary(sumData);
        setTrends(trendData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  if (loading) return <div style={{ padding: "2rem" }}>Loading Analytics...</div>;

  const chartData = trends?.data?.map((item: any) => ({
    time: new Date(item.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    total: item.total_volume,
    fraud: item.fraud_volume,
  })) || [];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Analytics</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        <div className="card">
          <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Total Transactions</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--primary-color)" }}>
            {summary?.total_transactions?.toLocaleString() || 0}
          </div>
        </div>
        <div className="card">
          <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Blocked (Auto + Manual)</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--error-color)" }}>
            {((summary?.auto_blocked || 0) + (summary?.blocked || 0)).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Needs Review</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--warning-color)" }}>
            {summary?.needs_review?.toLocaleString() || 0}
          </div>
        </div>
        <div className="card">
          <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Avg Score</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>
            {((summary?.avg_fraud_score || 0) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="card" style={{ height: "400px", padding: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1.5rem", color: "var(--text-muted)" }}>Volume Trends (24h)</h2>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} dx={-10} />
            <Tooltip 
              contentStyle={{ backgroundColor: "#1f2937", color: "#f9fafb", borderRadius: "8px", border: "1px solid #374151", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.5)" }}
            />
            <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total Volume" />
            <Line type="monotone" dataKey="fraud" stroke="#ef4444" strokeWidth={2} dot={false} name="Fraud Volume" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
