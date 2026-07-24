"use client";

import React, { useState, useEffect } from 'react';
import { fetchApi } from "../../../lib/api";
import { Modal } from '@/components/Modal';
import { RefreshCw } from 'lucide-react';
import ALL_COUNTRIES from '../../../../data/countries.json';

const PAGE_SIZE = 20;

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  backgroundColor: '#0f1117',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-md)',
  colorScheme: 'dark',
  fontSize: '0.8rem',
  cursor: 'pointer',
};

const StatusBadge = ({ status, decision }: { status: string, decision?: string }) => {
  let color = '';
  let bg = '';
  
  if (status === 'reviewed') {
    if (decision === 'confirmed_fraud') {
      return (
        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--risk-critical)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          Reviewed 
          <span style={{ backgroundColor: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>Fraud</span>
        </span>
      );
    } else if (decision === 'legitimate') {
      return (
        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--risk-low)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          Reviewed 
          <span style={{ backgroundColor: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>Legit</span>
        </span>
      );
    }
    color = '#60a5fa'; bg = 'rgba(96, 165, 250, 0.15)'; 
  } else {
    switch (status) {
      case 'scored': color = 'var(--risk-low)'; bg = 'rgba(18, 183, 106, 0.15)'; break;
      case 'auto_blocked': color = 'var(--risk-critical)'; bg = 'rgba(229, 72, 77, 0.15)'; break;
      case 'escalated': color = '#facc15'; bg = 'rgba(250, 204, 21, 0.15)'; break;
      case 'pending': color = '#a78bfa'; bg = 'rgba(167, 139, 250, 0.15)'; break;
      case 'scoring_failed': color = 'var(--text-disabled)'; bg = 'rgba(71, 85, 105, 0.25)'; break;
      default: color = 'var(--text-secondary)'; bg = 'var(--bg-surface-hover)';
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: bg, color: color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
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

const TimeSelect = ({ value, onChange, disabled }: { value: string, onChange: (val: string) => void, disabled: boolean }) => {
  const h24 = value ? parseInt(value.split(':')[0]) : 12;
  const hour = value ? (h24 % 12 || 12).toString().padStart(2, '0') : '';
  const minute = value ? value.split(':')[1] : '';
  const period = value ? (h24 >= 12 ? 'PM' : 'AM') : 'AM';

  const updateValue = (h: string, m: string, p: string) => {
    if (!h || !m) return;
    let h24New = parseInt(h) % 12;
    if (p === 'PM') h24New += 12;
    onChange(`${h24New.toString().padStart(2, '0')}:${m}`);
  };

  return (
    <div style={{ display: 'flex', gap: '4px', opacity: disabled ? 0.5 : 1 }}>
      <select disabled={disabled} value={hour} onChange={e => updateValue(e.target.value, minute || '00', period)} style={{...selectStyle, padding: '6px 4px'}} title={disabled ? "Select a date first" : ""}>
        <option value="">HH</option>
        {Array.from({length: 12}, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>:</span>
      <select disabled={disabled} value={minute} onChange={e => updateValue(hour || '12', e.target.value, period)} style={{...selectStyle, padding: '6px 4px'}} title={disabled ? "Select a date first" : ""}>
        <option value="">MM</option>
        {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)} 
      </select>
      <select disabled={disabled} value={period} onChange={e => updateValue(hour || '12', minute || '00', e.target.value)} style={{...selectStyle, padding: '6px 4px'}} title={disabled ? "Select a date first" : ""}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fromTimeFilter, setFromTimeFilter] = useState('');
  const [toTimeFilter, setToTimeFilter] = useState('');
  const [amountRangeFilter, setAmountRangeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');


  // Pagination cursor
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState('');
  const [nextCursor, setNextCursor] = useState('');

  const [viewingTx, setViewingTx] = useState<any>(null);
  const [submittingTxId, setSubmittingTxId] = useState<string | null>(null);

  
  const loadData = async (cursor: string = '') => {
    setLoading(true);
    try {
      let url = `http://localhost:8080/api/v1/transactions?limit=${PAGE_SIZE}&_t=${Date.now()}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
      
      if (dateFilter) {
        if (fromTimeFilter) {
          url += `&from_date=${new Date(`${dateFilter}T${fromTimeFilter}:00`).toISOString()}`;
        } else {
          url += `&from_date=${new Date(`${dateFilter}T00:00:00`).toISOString()}`;
        }
        
        if (toTimeFilter) {
          url += `&to_date=${new Date(`${dateFilter}T${toTimeFilter}:00`).toISOString()}`;
        } else {
          url += `&to_date=${new Date(`${dateFilter}T23:59:59`).toISOString()}`;
        }
      }
      if (channelFilter) url += `&channel=${channelFilter}`;
      if (typeFilter) url += `&transaction_type=${typeFilter}`;
      if (countryFilter) url += `&country_code=${countryFilter}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      
      if (amountRangeFilter) {
        switch (amountRangeFilter) {
          case '<1000': url += `&max_amount=1000`; break;
          case '1000 to 5000': url += `&min_amount=1000&max_amount=5000`; break;
          case '5000 to 10000': url += `&min_amount=5000&max_amount=10000`; break;
          case '10000 to 50000': url += `&min_amount=10000&max_amount=50000`; break;
          case '50000 to 1L': url += `&min_amount=50000&max_amount=100000`; break;
          case '1L to 5L': url += `&min_amount=100000&max_amount=500000`; break;
          case '5L to 10L': url += `&min_amount=500000&max_amount=1000000`; break;
          case '10L to 50L': url += `&min_amount=1000000&max_amount=5000000`; break;
          case '50L to 1Cr': url += `&min_amount=5000000&max_amount=10000000`; break;
          case '> 1Cr': url += `&min_amount=10000000`; break;
        }
      }

      const data = await fetchApi(url);
      setTransactions(data.data || []);
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
  }, [statusFilter, dateFilter, fromTimeFilter, toTimeFilter, amountRangeFilter, channelFilter, typeFilter, countryFilter, searchQuery]);

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

  const handleQuickReview = async (e: React.MouseEvent, id: string, decision: 'fraud' | 'legit') => {
    e.stopPropagation();
    if (submittingTxId) return;
    setSubmittingTxId(id);
    try {
      const apiDecision = decision === 'fraud' ? 'confirmed_fraud' : 'legitimate';
      await fetchApi(`http://localhost:8080/api/v1/transactions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision: apiDecision, notes: 'Quick reviewed from ledger' })
      });
      // Update local state to reflect the new status
      setTransactions(prev => prev.map(t => 
        t.id === id ? { ...t, status: 'reviewed', review_decision: apiDecision } : t
      ));
    } catch (err) {
      console.error("Failed to submit review", err);
      alert("Failed to submit review");
    } finally {
      setSubmittingTxId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', alignItems: 'flex-end', overflowX: 'auto', paddingBottom: '4px' }}>
          <FilterGroup label="Status">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="scored">Scored</option>
              <option value="auto_blocked">Auto Blocked</option>
              <option value="escalated">Escalated</option>
              <option value="scoring_failed">Scoring Failed</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Date">
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ ...selectStyle, colorScheme: 'dark' }} />
          </FilterGroup>
          <FilterGroup label="From Time">
            <TimeSelect value={fromTimeFilter} onChange={setFromTimeFilter} disabled={!dateFilter} />
          </FilterGroup>
          <FilterGroup label="To Time">
            <TimeSelect value={toTimeFilter} onChange={setToTimeFilter} disabled={!dateFilter} />
          </FilterGroup>
          <FilterGroup label="Amount Range">
            <select value={amountRangeFilter} onChange={e => setAmountRangeFilter(e.target.value)} style={selectStyle}>
              <option value="">Any</option>
              <option value="<1000">&lt;1000</option>
              <option value="1000 to 5000">1000 to 5000</option>
              <option value="5000 to 10000">5000 to 10000</option>
              <option value="10000 to 50000">10000 to 50000</option>
              <option value="50000 to 1L">50000 to 1L</option>
              <option value="1L to 5L">1L to 5L</option>
              <option value="5L to 10L">5L to 10L</option>
              <option value="10L to 50L">10L to 50L</option>
              <option value="50L to 1Cr">50L to 1Cr</option>
              <option value="> 1Cr">&gt; 1Cr</option>
            </select>
          </FilterGroup>
          <FilterGroup label="Channel">
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={selectStyle}>
              <option value="">All</option>
              <option value="online">Online</option>
              <option value="pos">POS</option>
              <option value="atm">ATM</option>
            </select>
          </FilterGroup>
          <FilterGroup label="Type">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
              <option value="">All</option>
              <option value="purchase">Purchase</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="transfer">Transfer</option>
            </select>
          </FilterGroup>
          <FilterGroup label="Country">
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{...selectStyle, maxWidth: '140px'}}>
              <option value="">All Countries</option>
              {ALL_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </FilterGroup>

        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%' }}>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '60%' }}>
            <div style={{ flex: 1 }}>
              <input 
                type="text" 
                placeholder="Enter Transaction ID, Account ID or Merchant Name" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...selectStyle, width: '100%', padding: '10px 14px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ visibility: (statusFilter || dateFilter || fromTimeFilter || toTimeFilter || amountRangeFilter || channelFilter || typeFilter || countryFilter || searchQuery) ? 'visible' : 'hidden' }}>
              <button
                onClick={() => { setStatusFilter(''); setDateFilter(''); setFromTimeFilter(''); setToTimeFilter(''); setAmountRangeFilter(''); setChannelFilter(''); setTypeFilter(''); setCountryFilter(''); setSearchQuery(''); }}
                style={{ ...selectStyle, padding: '9px 14px', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.05)', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.85rem' }}
              >
                Clear Filters
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Showing {transactions.length} results</span>
            <button title="Refresh Data" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px', borderRadius: '6px', cursor: 'pointer' }} onClick={() => loadData(currentCursor)}>
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-hover)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tx ID</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merchant</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fraud Score</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Channel / Type</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Location / IP</th>
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
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      title={t.id}
                      onClick={() => navigator.clipboard?.writeText(t.id)}
                      style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(148,163,184,0.15)', cursor: 'copy', whiteSpace: 'nowrap' }}
                    >
                      {t.id.substring(0, 8)}…
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(t.timestamp || t.ingested_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                    {t.account_id}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{t.merchant_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.merchant_category}</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {t.currency === 'INR' ? '₹' : (t.currency || '')}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                      <StatusBadge status={t.status} decision={t.review_decision} />
                      {t.status === 'escalated' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button disabled={submittingTxId === t.id} onClick={(e) => handleQuickReview(e, t.id, 'legit')} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: submittingTxId === t.id ? 'wait' : 'pointer', opacity: submittingTxId === t.id ? 0.5 : 1 }}>Legit</button>
                          <button disabled={submittingTxId === t.id} onClick={(e) => handleQuickReview(e, t.id, 'fraud')} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: submittingTxId === t.id ? 'wait' : 'pointer', opacity: submittingTxId === t.id ? 0.5 : 1 }}>Fraud</button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {t.fraud_score !== undefined && t.fraud_score !== null ? t.fraud_score.toFixed(3) : '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>
                    <div style={{ fontSize: '0.85rem' }}>{t.channel}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.transaction_type}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.85rem' }}>{t.country_code}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.ip_address || 'N/A'}</div>
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
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '16px', backgroundColor: 'var(--bg-surface-hover)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                 <div>
                    <FilterLabel label="Transaction ID" />
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{viewingTx.transaction?.id}</div>
                 </div>
                 <div>
                    <FilterLabel label="Status" />
                    <div style={{ marginTop: '2px' }}><StatusBadge status={viewingTx.transaction?.status} decision={viewingTx.review?.decision} /></div>
                 </div>
                 <div>
                    <FilterLabel label="Amount" />
                    <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>
                      {viewingTx.transaction?.currency === 'INR' ? '₹' : (viewingTx.transaction?.currency || '')}{viewingTx.transaction?.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                 </div>
                 <div>
                    <FilterLabel label="External Bank ID" />
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.external_id || 'N/A'}</div>
                 </div>
                 <div>
                    <FilterLabel label="Event Timestamp" />
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.timestamp ? new Date(viewingTx.transaction?.timestamp).toLocaleString() : 'N/A'}</div>
                 </div>
                 <div>
                    <FilterLabel label="System Ingested At" />
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.created_at ? new Date(viewingTx.transaction?.created_at).toLocaleString() : 'N/A'}</div>
                 </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                 <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account & Merchant</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                       <div>
                          <FilterLabel label="Account ID" />
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{viewingTx.transaction?.card_id}</div>
                       </div>
                       <div>
                          <FilterLabel label="Merchant Name" />
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{viewingTx.transaction?.merchant_name}</div>
                       </div>
                       <div>
                          <FilterLabel label="Merchant ID" />
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.merchant_id}</div>
                       </div>
                       <div>
                          <FilterLabel label="Merchant Category" />
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.merchant_category}</div>
                       </div>
                    </div>
                 </div>

                 <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Source & Location</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                       <div>
                          <FilterLabel label="Channel" />
                          <div style={{ textTransform: 'capitalize', fontSize: '0.9rem' }}>{viewingTx.transaction?.channel}</div>
                       </div>
                       <div>
                          <FilterLabel label="Type" />
                          <div style={{ textTransform: 'capitalize', fontSize: '0.9rem' }}>{viewingTx.transaction?.transaction_type}</div>
                       </div>
                       <div>
                          <FilterLabel label="Country" />
                          <div style={{ fontSize: '0.85rem' }}>{viewingTx.transaction?.country_code}</div>
                       </div>
                       <div>
                          <FilterLabel label="IP Address" />
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.ip_address || 'N/A'}</div>
                       </div>
                       <div style={{ gridColumn: '1 / -1' }}>
                          <FilterLabel label="Device ID" />
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{viewingTx.transaction?.device_id || 'N/A'}</div>
                       </div>
                    </div>
                 </div>
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
