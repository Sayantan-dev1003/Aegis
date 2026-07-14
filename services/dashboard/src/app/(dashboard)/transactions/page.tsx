"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../lib/api";
import { useWebSocket, TransactionEvent } from "../../contexts/WebSocketContext";
import styles from "../components.module.css";

interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  merchant_id: string;
  status: string;
  created_at: string;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { latestEvent } = useWebSocket();

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const data = await fetchApi("/transactions?limit=20");
        setTransactions(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadTransactions();
  }, []);

  // Prepend live events
  useEffect(() => {
    if (latestEvent) {
      setTransactions((prev) => {
        // Prevent duplicates if API fetch overlaps with live feed
        if (prev.some((tx) => tx.id === latestEvent.transaction_id)) {
          // Update status if it exists
          return prev.map(tx => tx.id === latestEvent.transaction_id ? {
            ...tx,
            status: latestEvent.status
          } : tx);
        }
        
        const newTx: Transaction = {
          id: latestEvent.transaction_id,
          account_id: latestEvent.account_id,
          amount: latestEvent.amount,
          currency: "USD", // Assumed for mock
          merchant_id: latestEvent.merchant_id,
          status: latestEvent.status,
          created_at: latestEvent.timestamp,
        };
        return [newTx, ...prev].slice(0, 50);
      });
    }
  }, [latestEvent]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Approved</span>;
      case "needs_review":
        return <span className={`${styles.badge} ${styles.badgeWarning}`}>Review</span>;
      case "auto_blocked":
      case "blocked":
        return <span className={`${styles.badge} ${styles.badgeDanger}`}>Blocked</span>;
      default:
        return <span className={`${styles.badge} ${styles.badgeNeutral}`}>{status}</span>;
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Live Transactions</h1>
      </div>

      {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}

      <div className="card">
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Time</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>Loading...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>No transactions found.</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <Link href={`/transactions/${tx.id}`} style={{ color: "var(--primary-color)", fontWeight: 500 }}>
                        {tx.id.split("-")[0]}...
                      </Link>
                    </td>
                    <td>{new Date(tx.created_at).toLocaleTimeString()}</td>
                    <td>{tx.account_id}</td>
                    <td>${tx.amount.toFixed(2)}</td>
                    <td>{getStatusBadge(tx.status)}</td>
                    <td>
                      <Link href={`/transactions/${tx.id}`} className="btn-secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
