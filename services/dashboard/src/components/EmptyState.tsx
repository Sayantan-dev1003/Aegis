import React, { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, actionLabel, onAction }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      border: '1px dashed var(--border-color)',
      borderRadius: 'var(--radius-md)',
      backgroundColor: 'var(--bg-surface)'
    }}>
      {icon && <div style={{ fontSize: '2.5rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>{icon}</div>}
      <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '1.125rem' }}>{title}</h3>
      <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', maxWidth: '400px', fontSize: '0.875rem' }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
