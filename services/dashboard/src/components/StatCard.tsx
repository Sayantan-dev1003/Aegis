import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaDirection?: 'up' | 'down';
  status?: 'good' | 'warn' | 'critical';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, delta, deltaDirection, status }) => {
  let statusColor = 'transparent';
  if (status === 'good') statusColor = 'var(--risk-low)';
  if (status === 'warn') statusColor = 'var(--risk-medium)';
  if (status === 'critical') statusColor = 'var(--risk-critical)';

  // Determine delta color simply based on status if provided, else neutral
  const deltaColor = status ? statusColor : 'var(--text-secondary)';

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      borderTop: status ? `3px solid ${statusColor}` : '1px solid var(--border-color)'
    }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-jetbrains-mono)' }}>{value}</div>
      {delta !== undefined && (
        <div style={{ 
          color: deltaColor,
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: 500
        }}>
          {deltaDirection === 'down' ? '↓' : '↑'} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
};
