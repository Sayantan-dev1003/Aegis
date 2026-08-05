"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { fetchApi } from "../../../lib/api";
import { Modal } from '@/components/Modal';
import { RefreshCw } from 'lucide-react';
import ALL_COUNTRIES from '../../../../data/countries.json';

// Domain-known values for static dropdowns (channels/types/categories used by the simulator).
const KNOWN_CHANNELS = ['online', 'pos', 'upi', 'mobile_wallet'];
const KNOWN_TYPES = ['purchase', 'transfer'];
const KNOWN_CATEGORIES = [
  'retail', 'food_delivery', 'transport', 'streaming', 'grocery',
  'fashion', 'travel', 'fintech', 'gaming', 'wholesale', 'electronics',
];

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
    } else if (decision === 'legitimate' || decision === 'false_positive') {
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
      case 'received':       color = '#94a3b8'; bg = 'rgba(148, 163, 184, 0.12)'; break;
      case 'pending':        color = '#a78bfa'; bg = 'rgba(167, 139, 250, 0.15)'; break;
      case 'escalated':      color = '#facc15'; bg = 'rgba(250, 204, 21, 0.15)';  break;
      case 'auto_blocked':   color = 'var(--risk-critical)'; bg = 'rgba(229, 72, 77, 0.15)'; break;
      case 'scored_approved':color = 'var(--risk-low)'; bg = 'rgba(18, 183, 106, 0.15)'; break;
      case 'scoring_failed': color = 'var(--text-disabled)'; bg = 'rgba(71, 85, 105, 0.25)'; break;
      default:               color = 'var(--text-secondary)'; bg = 'var(--bg-surface-hover)';
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '6px', backgroundColor: bg, color: color, fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {status.replace(/_/g, ' ')}
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

const thStyle: React.CSSProperties = {
  padding: '12px 12px',
  color: 'var(--text-secondary)',
  fontWeight: 500,
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

export default function TransactionsPage() {
  // ── Server-returned data ────────────────────────────────────────────
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Filters (all server-side) ───────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fromTimeFilter, setFromTimeFilter] = useState('');
  const [toTimeFilter, setToTimeFilter] = useState('');
  const [amountRangeFilter, setAmountRangeFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [merchantCategoryFilter, setMerchantCategoryFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Cursor-based pagination ─────────────────────────────────────────
  // pageCursors[i] = the cursor required to fetch page i.
  //   pageCursors[0] = "" (page 1 needs no cursor)
  //   pageCursors[1] = cursor returned at end of page 1 (to fetch page 2)
  //   etc.
  const [pageCursors, setPageCursors] = useState<string[]>(['']);
  const [currentPageIdx, setCurrentPageIdx] = useState(0); // 0-based
  const [nextCursor, setNextCursor] = useState('');
  const [pageSize, setPageSize] = useState(10);

  const [viewingTx, setViewingTx] = useState<any>(null);

  // ── Build URL from current filters ─────────────────────────────────
  const buildUrl = useCallback((cursor: string): string => {
    let url = `http://localhost:8080/api/v1/transactions?limit=${pageSize}&_t=${Date.now()}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    if (statusFilter) url += `&status=${statusFilter}`;
    if (dateFilter) {
      url += fromTimeFilter
        ? `&from_date=${new Date(`${dateFilter}T${fromTimeFilter}:00`).toISOString()}`
        : `&from_date=${new Date(`${dateFilter}T00:00:00`).toISOString()}`;
      url += toTimeFilter
        ? `&to_date=${new Date(`${dateFilter}T${toTimeFilter}:00`).toISOString()}`
        : `&to_date=${new Date(`${dateFilter}T23:59:59`).toISOString()}`;
    }
    if (countryFilter) url += `&country_code=${countryFilter}`;
    if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
    if (channelFilter) url += `&channel=${channelFilter}`;
    if (typeFilter) url += `&transaction_type=${typeFilter}`;
    if (merchantCategoryFilter) url += `&merchant_category=${merchantCategoryFilter}`;
    if (amountRangeFilter) {
      switch (amountRangeFilter) {
        case '<1000':          url += `&max_amount=1000`; break;
        case '1000 to 5000':   url += `&min_amount=1000&max_amount=5000`; break;
        case '5000 to 10000':  url += `&min_amount=5000&max_amount=10000`; break;
        case '10000 to 50000': url += `&min_amount=10000&max_amount=50000`; break;
        case '50000 to 1L':    url += `&min_amount=50000&max_amount=100000`; break;
        case '1L to 5L':       url += `&min_amount=100000&max_amount=500000`; break;
        case '5L to 10L':      url += `&min_amount=500000&max_amount=1000000`; break;
        case '10L to 50L':     url += `&min_amount=1000000&max_amount=5000000`; break;
        case '50L to 1Cr':     url += `&min_amount=5000000&max_amount=10000000`; break;
        case '> 1Cr':          url += `&min_amount=10000000`; break;
      }
    }
    return url;
  }, [pageSize, statusFilter, dateFilter, fromTimeFilter, toTimeFilter, amountRangeFilter,
      channelFilter, typeFilter, merchantCategoryFilter, countryFilter, searchQuery]);

  // ── Core fetch ──────────────────────────────────────────────────────
  const loadPage = useCallback(async (cursor: string) => {
    setLoading(true);
    try {
      const url = buildUrl(cursor);
      const data = await fetchApi(url);
      setRows(data.data || []);
      setTotalCount(data.total ?? 0);
      setNextCursor(data.next_cursor || '');
    } catch (err) {
      console.error('Failed to load transactions', err);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  // ── Reset + reload when filters or page size change ─────────────────
  useEffect(() => {
    setPageCursors(['']);
    setCurrentPageIdx(0);
    setNextCursor('');
    loadPage('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter, fromTimeFilter, toTimeFilter, amountRangeFilter,
      channelFilter, typeFilter, merchantCategoryFilter, countryFilter, searchQuery, pageSize]);

  // ── Navigation ──────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (!nextCursor) return;
    const newIdx = currentPageIdx + 1;
    setPageCursors(prev => {
      const updated = [...prev];
      if (newIdx >= updated.length) updated.push(nextCursor);
      return updated;
    });
    setCurrentPageIdx(newIdx);
    loadPage(nextCursor);
  }, [nextCursor, currentPageIdx, loadPage]);

  const goPrev = useCallback(() => {
    if (currentPageIdx === 0) return;
    const newIdx = currentPageIdx - 1;
    setCurrentPageIdx(newIdx);
    loadPage(pageCursors[newIdx]);
  }, [currentPageIdx, pageCursors, loadPage]);

  const hasActiveFilters = statusFilter || dateFilter || fromTimeFilter || toTimeFilter ||
    amountRangeFilter || channelFilter || typeFilter || merchantCategoryFilter ||
    countryFilter || searchQuery;

  const clearAllFilters = () => {
    setStatusFilter('');
    setDateFilter('');
    setFromTimeFilter('');
    setToTimeFilter('');
    setAmountRangeFilter('');
    setChannelFilter('');
    setTypeFilter('');
    setMerchantCategoryFilter('');
    setCountryFilter('');
    setSearchQuery('');
  };

  // ── Pagination display values ───────────────────────────────────────
  const currentPageNum = currentPageIdx + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : currentPageIdx * pageSize + 1;
  const endItem = Math.min(currentPageIdx * pageSize + rows.length, totalCount);

  const viewTransactionDetails = async (id: string) => {
    try {
      const data = await fetchApi(`http://localhost:8080/api/v1/transactions/${id}`);
      setViewingTx(data);
    } catch (err) {
      console.error('Failed to fetch details', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* ── Row 1: All 7 filters in one nowrap line ── */}
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '8px', alignItems: 'flex-end', width: '100%' }}>

          <FilterGroup label="Status">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...selectStyle, minWidth: '120px' }}>
              <option value="">All Statuses</option>
              <option value="received">Received</option>
              <option value="pending">Pending</option>
              <option value="escalated">Escalated</option>
              <option value="auto_blocked">Auto Blocked</option>
              <option value="scored_approved">Scored Approved</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Date">
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ ...selectStyle, minWidth: '120px', colorScheme: 'dark' }} />
          </FilterGroup>

          <FilterGroup label="From Time">
            <TimeSelect value={fromTimeFilter} onChange={setFromTimeFilter} disabled={!dateFilter} />
          </FilterGroup>

          <FilterGroup label="To Time">
            <TimeSelect value={toTimeFilter} onChange={setToTimeFilter} disabled={!dateFilter} />
          </FilterGroup>

          <FilterGroup label="Amount Range">
            <select value={amountRangeFilter} onChange={e => setAmountRangeFilter(e.target.value)} style={{ ...selectStyle, minWidth: '100px' }}>
              <option value="">Any</option>
              <option value="<1000">&lt;1000</option>
              <option value="1000 to 5000">1k–5k</option>
              <option value="5000 to 10000">5k–10k</option>
              <option value="10000 to 50000">10k–50k</option>
              <option value="50000 to 1L">50k–1L</option>
              <option value="1L to 5L">1L–5L</option>
              <option value="5L to 10L">5L–10L</option>
              <option value="10L to 50L">10L–50L</option>
              <option value="50L to 1Cr">50L–1Cr</option>
              <option value="> 1Cr">&gt;1Cr</option>
            </select>
          </FilterGroup>

          <FilterGroup label="Channel">
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ ...selectStyle, minWidth: '108px' }}>
              <option value="">All</option>
              {KNOWN_CHANNELS.map(ch => (
                <option key={ch} value={ch}>{ch.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup label="Type">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...selectStyle, minWidth: '108px' }}>
              <option value="">All</option>
              {KNOWN_TYPES.map(tp => (
                <option key={tp} value={tp}>{tp.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup label="Merchant Category">
            <select value={merchantCategoryFilter} onChange={e => setMerchantCategoryFilter(e.target.value)} style={{ ...selectStyle, minWidth: '148px' }}>
              <option value="">All Categories</option>
              {KNOWN_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </FilterGroup>

        </div>

        {/* ── Row 2: Search + Refresh ── */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', width: '100%' }}>

          <div>
            <input
              type="text"
              placeholder="Txn ID, Account ID or Merchant"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...selectStyle, width: '540px', padding: '7px 12px', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={clearAllFilters}
              style={{ ...selectStyle, padding: '6px 12px', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.05)', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.8rem', visibility: hasActiveFilters ? 'visible' : 'hidden' }}
            >
              Clear Filters
            </button>
            <button
              title="Refresh Data"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}
              onClick={() => loadPage(pageCursors[currentPageIdx] || '')}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1400px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-hover)' }}>
                <th style={thStyle}>Timestamp</th>
                <th style={thStyle}>Txn ID</th>
                <th style={thStyle}>Account</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Fraud Score</th>
                <th style={thStyle}>Risk Source</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={thStyle}>Merchant Name</th>
                <th style={thStyle}>Merchant Category</th>
                <th style={thStyle}>Channel</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Location</th>
                <th style={{ ...thStyle, width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading transactions...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No transactions found.</td></tr>
              ) : rows.map((t: any, idx: number) => {
                const isLast = idx === rows.length - 1;
                return (
                  <tr key={t.id} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-color)', transition: 'background 0.15s' }}
                    onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)')}
                    onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Timestamp */}
                    <td style={{ padding: '14px 12px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {new Date(t.timestamp || t.ingested_at).toLocaleString()}
                    </td>
                    {/* Txn ID */}
                    <td style={{ padding: '14px 12px' }}>
                      <span
                        title={t.id}
                        onClick={() => navigator.clipboard?.writeText(t.id)}
                        style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(148,163,184,0.15)', cursor: 'copy', whiteSpace: 'nowrap' }}
                      >
                        {t.id.substring(0, 8)}…
                      </span>
                    </td>
                    {/* Account */}
                    <td style={{ padding: '14px 12px', fontWeight: 500 }}>
                      {t.account_id}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '14px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                        <StatusBadge status={t.status} decision={t.review_decision} />
                        {(t.reject_count || 0) >= 2 && (
                          <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#F87171', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 600 }}>
                            🚫 2+ Rejects (Admin)
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Fraud Score */}
                    <td style={{ padding: '14px 12px' }}>
                      {t.fraud_score !== undefined && t.fraud_score !== null ? (() => {
                        const s = t.fraud_score;
                        const bg = s >= 0.85 ? 'rgba(239,68,68,0.15)' : s >= 0.7 ? 'rgba(249,115,22,0.15)' : s >= 0.45 ? 'rgba(250,204,21,0.15)' : 'rgba(16,185,129,0.15)';
                        const border = s >= 0.85 ? '1px solid rgba(239,68,68,0.3)' : s >= 0.7 ? '1px solid rgba(249,115,22,0.3)' : s >= 0.45 ? '1px solid rgba(250,204,21,0.3)' : '1px solid rgba(16,185,129,0.3)';
                        const color = s >= 0.85 ? '#F87171' : s >= 0.7 ? '#FB923C' : s >= 0.45 ? '#FACC15' : '#10B981';
                        return (
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', backgroundColor: bg, border, color, fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {s.toFixed(3)}
                          </span>
                        );
                      })() : <span style={{ color: 'var(--text-disabled)', fontSize: '0.82rem' }}>—</span>}
                    </td>
                    {/* Risk Source */}
                    <td style={{ padding: '14px 12px' }}>
                      {t.risk_source && (
                        <span style={{
                          fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", padding: "1px 5px", borderRadius: "4px",
                          backgroundColor: t.risk_source === "hybrid" ? "rgba(139, 92, 246, 0.15)" : t.risk_source === "ml" ? "rgba(6, 182, 212, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: t.risk_source === "hybrid" ? "#A78BFA" : t.risk_source === "ml" ? "#22D3EE" : "#FBBF24"
                        }}>
                          {t.risk_source}
                        </span>
                      )}
                    </td>
                    {/* Amount */}
                    <td style={{ padding: '14px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {t.currency === 'INR' ? '₹' : (t.currency || '')}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    {/* Merchant Name */}
                    <td style={{ padding: '14px 12px', fontWeight: 500, fontSize: '0.85rem' }}>
                      {t.merchant_name}
                    </td>
                    {/* Merchant Category */}
                    <td style={{ padding: '14px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {t.merchant_category?.replace(/_/g, ' ') || '—'}
                    </td>
                    {/* Channel */}
                    <td style={{ padding: '14px 12px', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                      {t.channel?.replace(/_/g, ' ') || '—'}
                    </td>
                    {/* Type */}
                    <td style={{ padding: '14px 12px', fontSize: '0.85rem', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                      {t.transaction_type?.replace(/_/g, ' ') || '—'}
                    </td>
                    {/* Location */}
                    <td style={{ padding: '14px 12px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{t.country_code}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{t.ip_address || 'N/A'}</div>
                    </td>
                    {/* Action */}
                    <td style={{ padding: '14px 12px', textAlign: 'center' }}>
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

        {/* ── Pagination Bar ── */}
        {!loading && totalCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', borderTop: '1px solid var(--border-color)',
            backgroundColor: 'rgba(15, 23, 42, 0.4)', flexWrap: 'wrap', gap: '12px',
          }}>
            {/* Left: Showing X-Y of Z | Rows per page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              <span>
                Showing{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{startItem} – {endItem}</strong>
                {' '}of{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{totalCount.toLocaleString()}</strong>
                {' '}cases
              </span>
              <span style={{ color: 'var(--border-color)' }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  style={{ backgroundColor: '#0F172A', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Right: Prev | Page N of M | Next */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={goPrev}
                disabled={currentPageIdx === 0 || loading}
                style={{
                  padding: '6px 12px', borderRadius: '6px',
                  backgroundColor: currentPageIdx === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: currentPageIdx === 0 ? '#475569' : 'var(--text-primary)',
                  cursor: currentPageIdx === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
                }}
              >
                Prev
              </button>

              <span style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600,
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38BDF8',
                whiteSpace: 'nowrap',
              }}>
                Page {currentPageNum} of {totalPages}
              </span>

              <button
                onClick={goNext}
                disabled={!nextCursor || loading}
                style={{
                  padding: '6px 12px', borderRadius: '6px',
                  backgroundColor: !nextCursor ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: !nextCursor ? '#475569' : 'var(--text-primary)',
                  cursor: !nextCursor ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Transaction Detail Modal ── */}
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
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account &amp; Merchant</h4>
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
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{viewingTx.transaction?.merchant_category?.replace(/_/g, ' ')}</div>
                       </div>
                    </div>
                 </div>

                 <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Source &amp; Location</h4>
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
                                 <div style={{ width: `${Math.min(100, fw.importance * 1000)}%`, backgroundColor: fw.weight > 0 ? '#ef4444' : '#3b82f6' }}></div>
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
