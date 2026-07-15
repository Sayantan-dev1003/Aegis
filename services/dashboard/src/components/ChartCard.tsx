import React from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  liveIndicator?: boolean;
  externalLink?: string;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, liveIndicator, externalLink, children }) => {
  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '320px'
    }}>
      <div style={{
        padding: 'var(--space-md) var(--space-lg)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
            {liveIndicator && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--risk-low)', fontWeight: 500 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--risk-low)', display: 'inline-block', boxShadow: '0 0 6px var(--risk-low)' }} />
                Live
              </div>
            )}
          </div>
          {subtitle && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{subtitle}</div>}
        </div>
        {externalLink && (
          <a href={externalLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 500 }}>
            Open ↗
          </a>
        )}
      </div>
      <div style={{ padding: 'var(--space-lg)', flexGrow: 1, position: 'relative', minHeight: '250px' }}>
        {children}
      </div>
    </div>
  );
};
