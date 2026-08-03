import React from 'react';

interface StatusBadgeProps {
  status: string;
  decision?: string | null;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, decision, label }) => {
  let color = '#94A3B8';
  let bg = 'rgba(148, 163, 184, 0.1)';
  let border = 'rgba(148, 163, 184, 0.25)';
  let text = label || (status ? status.replace('_', ' ') : 'Unknown');

  const s = (status || '').toLowerCase();
  const d = (decision || '').toLowerCase();

  if (s === 'auto_blocked') {
    color = '#EF4444';
    bg = 'rgba(239, 68, 68, 0.12)';
    border = 'rgba(239, 68, 68, 0.3)';
    text = 'Auto Blocked';
  } else if (s === 'escalated') {
    color = '#FACC15';
    bg = 'rgba(250, 204, 21, 0.12)';
    border = 'rgba(250, 204, 21, 0.3)';
    text = 'Escalated';
  } else if (s === 'pending') {
    color = '#A78BFA';
    bg = 'rgba(167, 139, 250, 0.12)';
    border = 'rgba(167, 139, 250, 0.3)';
    text = 'Pending';
  } else if (s === 'reviewed') {
    if (d === 'legitimate' || d === 'false_positive') {
      color = '#10B981';
      bg = 'rgba(16, 185, 129, 0.12)';
      border = 'rgba(16, 185, 129, 0.3)';
      text = 'Reviewed: Legit';
    } else if (d === 'confirmed_fraud') {
      color = '#EF4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      border = 'rgba(239, 68, 68, 0.35)';
      text = 'Reviewed: Fraud';
    } else {
      color = '#38BDF8';
      bg = 'rgba(56, 189, 248, 0.12)';
      border = 'rgba(56, 189, 248, 0.3)';
      text = 'Reviewed';
    }
  } else if (s === 'scored') {
    color = '#10B981';
    bg = 'rgba(16, 185, 129, 0.1)';
    border = 'rgba(16, 185, 129, 0.2)';
    text = 'Scored';
  } else if (s === 'active') {
    color = '#10B981';
  } else if (s === 'warning') {
    color = '#FACC15';
  } else if (s === 'critical') {
    color = '#EF4444';
  }

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '9999px',
      backgroundColor: bg,
      border: `1px solid ${border}`,
      color: color,
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      textTransform: 'capitalize'
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
