import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: '40px',
        height: '22px',
        backgroundColor: checked ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.15)',
        border: '1px solid var(--border-color)',
        borderRadius: '11px',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.2s',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center'
      }}
    >
      <span
        style={{
          display: 'block',
          width: '18px',
          height: '18px',
          backgroundColor: '#ffffff',
          borderRadius: '50%',
          transform: checked ? 'translateX(19px)' : 'translateX(1px)',
          transition: 'transform 0.2s',
          boxShadow: checked ? '0 0 8px rgba(255, 255, 255, 0.5)' : '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </button>
  );
};
