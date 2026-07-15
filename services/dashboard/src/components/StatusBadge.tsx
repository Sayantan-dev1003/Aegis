import React from 'react';

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'warning' | 'critical' | 'pending';
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  let color = 'var(--risk-info)'; // default/pending
  if (status === 'active') color = 'var(--risk-low)';
  if (status === 'warning') color = 'var(--risk-medium)';
  if (status === 'critical') color = 'var(--risk-critical)';
  if (status === 'inactive') color = 'var(--text-disabled)';

  const text = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '9999px',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      color: 'var(--text-primary)',
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: 1
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 4px ${color}`
      }} />
      {text}
    </div>
  );
};
