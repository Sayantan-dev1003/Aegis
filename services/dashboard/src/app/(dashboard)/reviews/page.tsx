"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../lib/api";
import styles from "../components.module.css";

interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  merchant_id: string;
  status: string;
  created_at: string;
}

export default function ReviewsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadReviews = async () => {
      try {
        // Assume API supports filtering by status (which it does via query logic)
        const data = await fetchApi("/transactions?status=needs_review");
        setTransactions(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadReviews();
  }, []);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Review Queue</h1>
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>Loading...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>Queue is empty.</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.id.split("-")[0]}...</td>
                    <td>{new Date(tx.created_at).toLocaleString()}</td>
                    <td>{tx.account_id}</td>
                    <td>${tx.amount.toFixed(2)}</td>
                    <td>
                      <Link href={`/transactions/${tx.id}`} className="btn-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                        Review Now
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
