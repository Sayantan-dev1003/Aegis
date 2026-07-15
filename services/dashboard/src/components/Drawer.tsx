import React, { useEffect, useRef, ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children, width = '400px' }) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => drawerRef.current?.focus(), 0);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      zIndex: 100,
      backdropFilter: 'blur(1px)'
    }} onClick={onClose}>
      <div 
        ref={drawerRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--bg-base)',
          borderLeft: '1px solid var(--border-color)',
          width: '100%',
          maxWidth: width,
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
          boxShadow: '-10px 0 25px rgba(0,0,0,0.5)',
          animation: 'slideIn 0.2s ease-out'
        }}
      >
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{title}</h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.5rem',
              lineHeight: 1,
              padding: '4px'
            }}
          >&times;</button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto', flexGrow: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
};
