"use client";

import React, { useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import styles from "../../components.module.css";

interface ConfigItem {
  key: string;
  value: string;
  description: string;
  updated_at: string;
  updated_by: string;
}

export default function AdminConfigPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const data = await fetchApi("/admin/config");
      setConfigs(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    try {
      await fetchApi(`/admin/config/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValue }),
      });
      setEditingKey(null);
      await loadConfigs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>System Configuration</h1>
      </div>

      {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}

      <div className="card">
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Description</th>
                <th>Last Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>Loading...</td>
                </tr>
              ) : (
                configs.map((conf) => (
                  <tr key={conf.key}>
                    <td style={{ fontWeight: 600 }}>{conf.key}</td>
                    <td>
                      {editingKey === conf.key ? (
                        <input
                          type="text"
                          className="input-field"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                      ) : (
                        <span style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{conf.value}</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{conf.description}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {new Date(conf.updated_at).toLocaleString()}<br/>
                      <span style={{ color: "var(--text-muted)" }}>by {conf.updated_by}</span>
                    </td>
                    <td>
                      {editingKey === conf.key ? (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button className="btn-primary" onClick={() => handleSave(conf.key)} style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Save</button>
                          <button className="btn-secondary" onClick={() => setEditingKey(null)} style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}>Cancel</button>
                        </div>
                      ) : (
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setEditingKey(conf.key);
                            setEditValue(conf.value);
                          }}
                          style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                        >
                          Edit
                        </button>
                      )}
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
