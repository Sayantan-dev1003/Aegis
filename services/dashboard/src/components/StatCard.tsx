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
  let gradientColor = 'transparent';
  if (status === 'good') {
    statusColor = 'var(--risk-low)';
    gradientColor = 'rgba(16, 185, 129, 0.15)';
  }
  if (status === 'warn') {
    statusColor = 'var(--risk-medium)';
    gradientColor = 'rgba(245, 158, 11, 0.15)';
  }
  if (status === 'critical') {
    statusColor = 'var(--risk-critical)';
    gradientColor = 'rgba(244, 63, 94, 0.15)';
  }

  const deltaColor = status ? statusColor : 'var(--text-muted)';

  return (
    <div style={{
      backgroundColor: 'var(--surface-color)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
    }}>
      {status && (
        <div style={{
          position: 'absolute',
          top: '-50%',
          right: '-20%',
          width: '150px',
          height: '150px',
          background: `radial-gradient(circle, ${gradientColor} 0%, rgba(0,0,0,0) 70%)`,
          borderRadius: '50%',
          pointerEvents: 'none'
        }} />
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{label}</div>
        {status && (
          <div style={{ 
            width: '12px', 
            height: '12px', 
            borderRadius: '50%', 
            backgroundColor: statusColor,
            boxShadow: `0 0 10px ${statusColor}`
          }} />
        )}
      </div>

      <div style={{ color: 'var(--text-main)', fontSize: '2rem', fontWeight: 700, position: 'relative', zIndex: 1 }}>
        {value}
      </div>

      {delta !== undefined && (
        <div style={{ 
          color: deltaColor,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: 600,
          position: 'relative',
          zIndex: 1
        }}>
          {deltaDirection === 'down' ? '↓' : '↑'} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
};
