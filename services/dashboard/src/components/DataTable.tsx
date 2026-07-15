import React, { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (item: T) => void;
  emptyState?: ReactNode;
  loading?: boolean;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  onRowClick,
  emptyState,
  loading
}: DataTableProps<T>) {
  if (loading) {
    return <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  if (!rows.length && emptyState) {
    return <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--text-secondary)' }}>{emptyState}</div>;
  }

  return (
    <div style={{
      width: '100%',
      overflowX: 'auto',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-hover)' }}>
            {columns.map(col => (
              <th key={col.key} style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr 
              key={row.id || idx}
              onClick={() => onRowClick && onRowClick(row)}
              style={{
                borderBottom: idx === rows.length - 1 ? 'none' : '1px solid var(--border-color)',
                cursor: onRowClick ? 'pointer' : 'default'
              }}
            >
              {columns.map(col => (
                <td key={col.key} style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                  {col.render ? col.render(row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
