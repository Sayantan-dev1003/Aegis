"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchApi } from "../../../lib/api";
import styles from "../../components.module.css";
import detailStyles from "./detail.module.css";

interface FraudResult {
  fraud_score: number;
  raw_score: number;
  threshold_used: number;
  is_fraud: boolean;
  confidence: string;
  top_features: Record<string, number>;
  model_version: string;
}

interface TransactionDetail {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  merchant_id: string;
  merchant_category: string;
  device_id: string;
  status: string;
  created_at: string;
  fraud_result?: FraudResult;
}

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const loadTx = async () => {
      try {
        const data = await fetchApi(`/transactions/${id}`);
        setTx(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadTx();
  }, [id]);

  const handleAction = async (action: "approve" | "block") => {
    try {
      await fetchApi(`/transactions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          notes: `Manually ${action}d from dashboard`,
        }),
      });
      // reload
      const data = await fetchApi(`/transactions/${id}`);
      setTx(data);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (error) return <div style={{ padding: "2rem", color: "red" }}>{error}</div>;
  if (!tx) return <div style={{ padding: "2rem" }}>Not found</div>;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Transaction Details</h1>
        <button className="btn-secondary" onClick={() => router.back()}>
          ← Back
        </button>
      </div>

      <div className={detailStyles.grid}>
        <div className="card">
          <h2 className={detailStyles.sectionTitle}>Overview</h2>
          <div className={detailStyles.field}>
            <span className={detailStyles.label}>ID</span>
            <span className={detailStyles.value}>{tx.id}</span>
          </div>
          <div className={detailStyles.field}>
            <span className={detailStyles.label}>Status</span>
            <span className={detailStyles.value} style={{ fontWeight: 600, textTransform: "uppercase" }}>
              {tx.status}
            </span>
          </div>
          <div className={detailStyles.field}>
            <span className={detailStyles.label}>Amount</span>
            <span className={detailStyles.value}>${tx.amount.toFixed(2)} {tx.currency}</span>
          </div>
          <div className={detailStyles.field}>
            <span className={detailStyles.label}>Account</span>
            <span className={detailStyles.value}>{tx.account_id}</span>
          </div>
          <div className={detailStyles.field}>
            <span className={detailStyles.label}>Merchant</span>
            <span className={detailStyles.value}>{tx.merchant_id} ({tx.merchant_category})</span>
          </div>
          <div className={detailStyles.field}>
            <span className={detailStyles.label}>Time</span>
            <span className={detailStyles.value}>{new Date(tx.created_at).toLocaleString()}</span>
          </div>

          {tx.status === "needs_review" && (
            <div className={detailStyles.actionRow}>
              <button className={`btn-primary`} style={{ backgroundColor: "var(--success-color)" }} onClick={() => handleAction("approve")}>
                Approve
              </button>
              <button className={`btn-primary`} style={{ backgroundColor: "var(--error-color)" }} onClick={() => handleAction("block")}>
                Block
              </button>
            </div>
          )}
        </div>

        {tx.fraud_result ? (
          <div className="card">
            <h2 className={detailStyles.sectionTitle}>Fraud Analysis</h2>
            <div className={detailStyles.field}>
              <span className={detailStyles.label}>Score</span>
              <span className={`${detailStyles.value} ${tx.fraud_result.fraud_score > tx.fraud_result.threshold_used ? styles.scoreHigh : styles.scoreLow}`}>
                {(tx.fraud_result.fraud_score * 100).toFixed(1)}% 
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                  (Threshold: {(tx.fraud_result.threshold_used * 100).toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className={detailStyles.field}>
              <span className={detailStyles.label}>Confidence</span>
              <span className={detailStyles.value}>{tx.fraud_result.confidence}</span>
            </div>
            <div className={detailStyles.field}>
              <span className={detailStyles.label}>Model Version</span>
              <span className={detailStyles.value}>{tx.fraud_result.model_version}</span>
            </div>

            <h3 className={detailStyles.subTitle}>Top SHAP Features</h3>
            <ul className={detailStyles.featureList}>
              {Object.entries(tx.fraud_result.top_features || {}).map(([feat, val]) => (
                <li key={feat} className={detailStyles.featureItem}>
                  <span>{feat}</span>
                  <span style={{ color: val > 0 ? "var(--error-color)" : "var(--success-color)" }}>
                    {val > 0 ? "+" : ""}{val.toFixed(3)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="card">
            <h2 className={detailStyles.sectionTitle}>Fraud Analysis</h2>
            <p style={{ color: "var(--text-muted)" }}>No scoring result available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
