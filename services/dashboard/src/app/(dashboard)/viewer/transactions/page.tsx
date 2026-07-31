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
  border: '1px solid var(--border-color, #1F2937)',
  color: 'var(--text-main, #E8EDF4)',
  borderRadius: 'var(--radius-md, 10px)',
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
        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--risk-critical, #F43F5E)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          Reviewed 
          <span style={{ backgroundColor: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>Fraud</span>
        </span>
      );
    } else if (decision === 'legitimate') {
      return (
        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--risk-low, #10B981)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
          Reviewed 
          <span style={{ backgroundColor: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>Legit</span>
        </span>
      );
    }
    color = '#c4b5fd'; bg = 'rgba(139, 92, 246, 0.15)'; 
  } else {
    switch (status) {
      case 'scored': color = 'var(--risk-low, #10B981)'; bg = 'rgba(18, 183, 106, 0.15)'; break;
      case 'auto_blocked': color = 'var(--risk-critical, #F43F5E)'; bg = 'rgba(229, 72, 77, 0.15)'; break;
      case 'escalated': color = '#facc15'; bg = 'rgba(250, 204, 21, 0.15)'; break;
      case 'pending': color = '#a78bfa'; bg = 'rgba(167, 139, 250, 0.15)'; break;
      case 'scoring_failed': color = 'var(--text-disabled, #4E5A6B)'; bg = 'rgba(71, 85, 105, 0.25)'; break;
      default: color = 'var(--text-muted, #8D9AAB)'; bg = 'var(--surface-hover, #161B22)';
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: bg, color: color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const FilterLabel = ({ label }: { label: string }) => (
  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</span>
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
      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted, #8D9AAB)' }}>:</span>
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

export default function ViewerTransactionsPage() {
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
      if (data && data.data) {
        setTransactions(data.data || []);
        setNextCursor(data.next_cursor || '');
      } else if (Array.isArray(data)) {
        setTransactions(data);
        setNextCursor('');
      } else {
        setTransactions([]);
        setNextCursor('');
      }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl, 24px)', paddingBottom: 'var(--space-xl, 24px)' }}>


      {/* Filter Toolbar */}
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
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8D9AAB)' }}>Showing {transactions.length} results</span>
            <button title="Refresh Data" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface-color, #0D1117)', border: '1px solid var(--border-color, #1F2937)', color: 'var(--text-main, #E8EDF4)', padding: '8px', borderRadius: '6px', cursor: 'pointer' }} onClick={() => loadData(currentCursor)}>
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <div style={{ backgroundColor: 'var(--surface-color, #0D1117)', border: '1px solid var(--border-color, #1F2937)', borderRadius: 'var(--radius-lg, 16px)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color, #1F2937)', backgroundColor: 'var(--surface-hover, #161B22)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tx ID</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merchant</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fraud Score</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Channel / Type</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-muted, #8D9AAB)', fontWeight: 500, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Location / IP</th>
              <th style={{ padding: '12px 16px', width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted, #8D9AAB)' }}>Loading transactions...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted, #8D9AAB)', fontSize: '0.9rem' }}>No transactions found.</td></tr>
            ) : transactions.map((t: any, idx: number) => {
              const isLast = idx === transactions.length - 1;
              return (
                <tr key={t.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-color, #1F2937)', transition: 'background 0.15s' }}
                  onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = 'var(--surface-hover, #161B22)')}
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
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted, #8D9AAB)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(t.timestamp || t.ingested_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                    {t.account_id}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{t.merchant_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8D9AAB)' }}>{t.merchant_category}</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {t.currency === 'INR' ? '₹' : (t.currency || '')}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                      <StatusBadge status={t.status} decision={t.review_decision} />
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {t.fraud_score !== undefined && t.fraud_score !== null ? t.fraud_score.toFixed(3) : '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>
                    <div style={{ fontSize: '0.85rem' }}>{t.channel}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8D9AAB)' }}>{t.transaction_type}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.85rem' }}>{t.country_code}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8D9AAB)' }}>{t.ip_address || 'N/A'}</div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => viewTransactionDetails(t.id)}
                      title="View transaction details"
                      style={{ background: 'none', border: '1px solid var(--border-color, #1F2937)', color: 'var(--text-muted, #8D9AAB)', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseEnter={ev => { ev.currentTarget.style.color = '#c4b5fd'; ev.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)'; ev.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--text-muted, #8D9AAB)'; ev.currentTarget.style.borderColor = 'var(--border-color, #1F2937)'; ev.currentTarget.style.background = 'none'; }}
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

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <button
          disabled={cursorStack.length === 0}
          onClick={handlePrevPage}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #1F2937)', backgroundColor: cursorStack.length === 0 ? 'transparent' : 'var(--surface-color, #0D1117)', color: cursorStack.length === 0 ? 'var(--text-disabled, #4E5A6B)' : 'var(--text-main, #E8EDF4)', cursor: cursorStack.length === 0 ? 'default' : 'pointer', fontSize: '0.875rem' }}
        >
          ← Prev
        </button>

        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #8D9AAB)' }}>Page {cursorStack.length + 1}</span>

        <button
          disabled={!nextCursor}
          onClick={handleNextPage}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #1F2937)', backgroundColor: !nextCursor ? 'transparent' : 'var(--surface-color, #0D1117)', color: !nextCursor ? 'var(--text-disabled, #4E5A6B)' : 'var(--text-main, #E8EDF4)', cursor: !nextCursor ? 'default' : 'pointer', fontSize: '0.875rem' }}
        >
          Next →
        </button>
      </div>

      {/* Transaction Details Modal */}
      <Modal isOpen={!!viewingTx} onClose={() => setViewingTx(null)} title="Transaction Details" width="800px">
        {viewingTx && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '16px', backgroundColor: 'var(--surface-hover, #161B22)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #1F2937)' }}>
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
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.external_id || 'N/A'}</div>
                 </div>
                 <div>
                    <FilterLabel label="Event Timestamp" />
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.timestamp ? new Date(viewingTx.transaction?.timestamp).toLocaleString() : 'N/A'}</div>
                 </div>
                 <div>
                    <FilterLabel label="System Ingested At" />
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.created_at ? new Date(viewingTx.transaction?.created_at).toLocaleString() : 'N/A'}</div>
                 </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                 <div style={{ backgroundColor: 'var(--surface-hover, #161B22)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #1F2937)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-main, #E8EDF4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account & Merchant</h4>
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
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.merchant_id}</div>
                       </div>
                       <div>
                          <FilterLabel label="Merchant Category" />
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.merchant_category}</div>
                       </div>
                    </div>
                 </div>

                 <div style={{ backgroundColor: 'var(--surface-hover, #161B22)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #1F2937)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-main, #E8EDF4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Source & Location</h4>
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
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.ip_address || 'N/A'}</div>
                       </div>
                       <div style={{ gridColumn: '1 / -1' }}>
                          <FilterLabel label="Device ID" />
                          <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted, #8D9AAB)' }}>{viewingTx.transaction?.device_id || 'N/A'}</div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            {viewingTx.fraud_result && (
              <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ML Fraud Analysis</h4>
                
                <div style={{ display: 'flex', gap: '32px', marginBottom: '16px' }}>
                  <div>
                    <FilterLabel label="Fraud Score" />
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: viewingTx.fraud_result.is_fraud ? 'var(--risk-critical, #F43F5E)' : 'var(--risk-low, #10B981)' }}>
                      {(viewingTx.fraud_result.fraud_score * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <FilterLabel label="Model Decision" />
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '4px', color: viewingTx.fraud_result.is_fraud ? 'var(--risk-critical, #F43F5E)' : 'var(--risk-low, #10B981)' }}>
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
                              <div style={{ width: '160px', fontFamily: 'monospace', color: 'var(--text-muted, #8D9AAB)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fw.feature}>{fw.feature}</div>
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
              <button onClick={() => setViewingTx(null)} style={{ padding: '8px 16px', backgroundColor: 'var(--surface-hover, #161B22)', border: '1px solid var(--border-color, #1F2937)', color: 'var(--text-main, #E8EDF4)', borderRadius: 'var(--radius-md, 10px)', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
