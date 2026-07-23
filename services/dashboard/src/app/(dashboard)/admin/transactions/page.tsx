"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { Modal } from '@/components/Modal';

const PAGE_SIZE = 20;

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  backgroundColor: '#0f1117',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-md)',
  colorScheme: 'dark',
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const StatusBadge = ({ status }: { status: string }) => {
  let color = '';
  let bg = '';
  
  switch (status) {
    case 'scored': color = 'var(--risk-low)'; bg = 'rgba(18, 183, 106, 0.15)'; break;
    case 'auto_blocked': color = 'var(--risk-critical)'; bg = 'rgba(229, 72, 77, 0.15)'; break;
    case 'escalated': color = '#facc15'; bg = 'rgba(250, 204, 21, 0.15)'; break;
    case 'pending': color = '#a78bfa'; bg = 'rgba(167, 139, 250, 0.15)'; break;
    case 'scoring_failed': color = 'var(--text-disabled)'; bg = 'rgba(71, 85, 105, 0.25)'; break;
    default: color = 'var(--text-secondary)'; bg = 'var(--bg-surface-hover)';
  }

  return (
    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: bg, color: color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {status.replace('_', ' ')}
    </span>
  );
};

const FilterLabel = ({ label }: { label: string }) => (
  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</span>
);

const FilterGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <FilterLabel label={label} />
    {children}
  </div>
);

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Pagination cursor
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState('');
  const [nextCursor, setNextCursor] = useState('');

  const [viewingTx, setViewingTx] = useState<any>(null);

  const loadData = async (cursor: string = '') => {
    setLoading(true);
    try {
      let url = `http://localhost:8080/api/v1/transactions?limit=${PAGE_SIZE}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      const data = await fetchApi(url);
      
      let filteredData = data.data || [];

      // Client-side date filter (since API expects RFC3339 from/to, simpler to filter client-side for single date picker)
      if (dateFilter) {
        filteredData = filteredData.filter((t: any) => {
          const eventDate = new Date(t.timestamp || t.ingested_at).toLocaleDateString('en-CA');
          return eventDate === dateFilter;
        });
      }

      setTransactions(filteredData);
      setNextCursor(data.next_cursor || '');
    } catch (err) {
      console.error("Failed to load transactions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    setCursorStack([]);
    setCurrentCursor('');
    loadData(''); 
  }, [statusFilter, dateFilter]);

  const handleNextPage = () => {
    if (nextCursor) {
      setCursorStack([...cursorStack, currentCursor]);
      setCurrentCursor(nextCursor);
      loadData(nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (cursorStack.length > 0) {
      const prevCursor = cursorStack[cursorStack.length - 1];
      setCursorStack(cursorStack.slice(0, -1));
      setCurrentCursor(prevCursor);
      loadData(prevCursor);
    }
  };

  const viewTransactionDetails = async (id: string) => {
    try {
      const data = await fetchApi(`http://localhost:8080/api/v1/transactions/${id}`);
      setViewingTx(data);
    } catch (err) {
      console.error("Failed to fetch details", err);
    }
  };

  const handleQuickReview = async (id: string, decision: 'fraud' | 'legit') => {
    try {
      await fetchApi(`http://localhost:8080/api/v1/transactions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes: 'Quick reviewed from ledger' })
      });
      // Update local state to reflect the new status
      setTransactions(prev => prev.map(t => 
        t.id === id ? { ...t, status: 'reviewed' } : t
      ));
    } catch (err) {
      console.error("Failed to submit review", err);
      alert("Failed to submit review");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>

          <FilterGroup label="Status">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="scored">Scored</option>
              <option value="auto_blocked">Auto Blocked</option>
              <option value="escalated">Escalated</option>
              <option value="scoring_failed">Scoring Failed</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Date">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ ...selectStyle, colorScheme: 'dark' }}
            />
          </FilterGroup>

          {(statusFilter || dateFilter) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <FilterLabel label="&nbsp;" />
              <button
                onClick={() => { setStatusFilter(''); setDateFilter(''); }}
                style={{ ...selectStyle, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.05)', cursor: 'pointer' }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }} onClick={() => loadData(currentCursor)}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-hover)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tx ID</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merchant</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Channel / Type</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Location / IP</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fraud Score</th>
              <th style={{ padding: '12px 16px', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading transactions...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No transactions found.</td></tr>
            ) : transactions.map((t: any, idx: number) => {
              const isLast = idx === transactions.length - 1;
              return (
                <tr key={t.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-color)', transition: 'background 0.15s' }}
                  onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)')}
                  onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(t.timestamp || t.ingested_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      title={t.id}
                      onClick={() => navigator.clipboard?.writeText(t.id)}
                      style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(148,163,184,0.15)', cursor: 'copy', whiteSpace: 'nowrap' }}
                    >
                      {t.id.substring(0, 8)}…
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                    {t.account_id}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {t.currency === 'INR' ? '₹' : (t.currency || '')}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                      <StatusBadge status={t.status} />
                      {t.status === 'escalated' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => handleQuickReview(t.id, 'legit')} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: 'pointer' }}>Legit</button>
                          <button onClick={() => handleQuickReview(t.id, 'fraud')} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}>Fraud</button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{t.merchant_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.merchant_category}</div>
                  </td>
                  <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>
                    <div style={{ fontSize: '0.85rem' }}>{t.channel}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.transaction_type}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.85rem' }}>{t.country_code}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.ip_address || 'N/A'}</div>
                  </td>
                  <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {t.fraud_score !== undefined && t.fraud_score !== null ? t.fraud_score.toFixed(3) : '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => viewTransactionDetails(t.id)}
                      title="View transaction details"
                      style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseEnter={ev => { ev.currentTarget.style.color = '#a5b4fc'; ev.currentTarget.style.borderColor = 'rgba(165,180,252,0.5)'; ev.currentTarget.style.background = 'rgba(165,180,252,0.08)'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--text-secondary)'; ev.currentTarget.style.borderColor = 'var(--border-color)'; ev.currentTarget.style.background = 'none'; }}
                    >
                      ›
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <button
          disabled={cursorStack.length === 0}
          onClick={handlePrevPage}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: cursorStack.length === 0 ? 'transparent' : 'var(--bg-surface)', color: cursorStack.length === 0 ? 'var(--text-disabled)' : 'var(--text-primary)', cursor: cursorStack.length === 0 ? 'default' : 'pointer', fontSize: '0.875rem' }}
        >
          ← Prev
        </button>

        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Page {cursorStack.length + 1}</span>

        <button
          disabled={!nextCursor}
          onClick={handleNextPage}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: !nextCursor ? 'transparent' : 'var(--bg-surface)', color: !nextCursor ? 'var(--text-disabled)' : 'var(--text-primary)', cursor: !nextCursor ? 'default' : 'pointer', fontSize: '0.875rem' }}
        >
          Next →
        </button>
      </div>

      <Modal isOpen={!!viewingTx} onClose={() => setViewingTx(null)} title="Transaction Details" width="800px">
        {viewingTx && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', backgroundColor: 'var(--bg-surface-hover)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
               <div>
                  <FilterLabel label="Transaction ID" />
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{viewingTx.transaction?.id}</div>
               </div>
               <div>
                  <FilterLabel label="Status" />
                  <div><StatusBadge status={viewingTx.transaction?.status} /></div>
               </div>
               <div>
                  <FilterLabel label="Account ID" />
                  <div style={{ fontWeight: 500 }}>{viewingTx.transaction?.card_id}</div>
               </div>
               <div>
                  <FilterLabel label="Amount" />
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>₹{viewingTx.transaction?.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
               </div>
               <div>
                  <FilterLabel label="Ingested At" />
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{new Date(viewingTx.transaction?.created_at).toLocaleString()}</div>
               </div>
            </div>

            {viewingTx.fraud_result && (
              <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(79, 70, 229, 0.2)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ML Fraud Analysis</h4>
                
                <div style={{ display: 'flex', gap: '32px', marginBottom: '16px' }}>
                  <div>
                    <FilterLabel label="Fraud Score" />
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: viewingTx.fraud_result.is_fraud ? 'var(--risk-critical)' : 'var(--risk-low)' }}>
                      {(viewingTx.fraud_result.fraud_score * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <FilterLabel label="Model Decision" />
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '4px', color: viewingTx.fraud_result.is_fraud ? 'var(--risk-critical)' : 'var(--risk-low)' }}>
                      {viewingTx.fraud_result.is_fraud ? 'Likely Fraud' : 'Clear'}
                    </div>
                  </div>
                  <div>
                    <FilterLabel label="Model Version" />
                    <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', marginTop: '6px' }}>{viewingTx.fraud_result.model_version || 'Unknown'}</div>
                  </div>
                </div>

                {viewingTx.fraud_result.feature_weights && viewingTx.fraud_result.feature_weights.length > 0 && (
                  <div>
                     <FilterLabel label="Top Contributing Features (SHAP)" />
                     <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {viewingTx.fraud_result.feature_weights.map((fw: any, idx: number) => (
                           <div key={idx} style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', gap: '8px' }}>
                              <div style={{ width: '160px', fontFamily: 'monospace', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fw.feature}>{fw.feature}</div>
                              <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                 <div style={{ 
                                   width: `${Math.min(100, fw.importance * 1000)}%`, 
                                   backgroundColor: fw.weight > 0 ? '#ef4444' : '#3b82f6' 
                                  }}></div>
                              </div>
                              <div style={{ width: '60px', textAlign: 'right', fontFamily: 'monospace', color: fw.weight > 0 ? '#ef4444' : '#3b82f6' }}>
                                 {fw.weight > 0 ? '+' : ''}{fw.weight.toFixed(4)}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setViewingTx(null)} style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
