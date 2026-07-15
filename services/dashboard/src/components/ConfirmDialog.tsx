import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, description, confirmLabel, danger, onConfirm, onCancel
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => {
        dialogRef.current?.focus();
      }, 0);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div 
        ref={dialogRef}
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          outline: 'none',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
          {description}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              backgroundColor: danger ? 'var(--risk-critical)' : 'var(--accent)',
              border: 'none',
              color: '#fff',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
