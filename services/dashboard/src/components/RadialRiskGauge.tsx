import React from 'react';

interface RadialRiskGaugeProps {
  score: number; // 0 to 100
  size?: number;
}

export const RadialRiskGauge: React.FC<RadialRiskGaugeProps> = ({ score, size = 64 }) => {
  // Clamp score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, score));
  
  // Determine risk level, color, and icon shape
  let color = 'var(--risk-low)';
  let icon = null;
  
  if (clampedScore >= 76) {
    color = 'var(--risk-critical)';
    // Triangle pointing up/down for critical
    icon = (
      <polygon points="12,4 20,18 4,18" fill="currentColor" />
    );
  } else if (clampedScore >= 31) {
    color = 'var(--risk-medium)';
    // Circle for medium
    icon = (
      <circle cx="12" cy="12" r="7" fill="currentColor" />
    );
  } else {
    // Check for low
    icon = (
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    );
  }

  // SVG arc math
  const strokeWidth = 8;
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  // We want a 270 degree arc (3/4 of a circle)
  const arcLength = circumference * 0.75;
  const offset = circumference - (clampedScore / 100) * arcLength;

  return (
    <div style={{ 
      position: 'relative', 
      width: size, 
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column'
    }}>
      <svg 
        viewBox="0 0 100 100" 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'rotate(135deg)' }}
      >
        {/* Background track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke="var(--border-color)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Active progress */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{ color, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, transform: 'translateY(-2px)' }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-jetbrains-mono)' }}>
          {clampedScore}
        </span>
        <svg viewBox="0 0 24 24" width={size * 0.25} height={size * 0.25} style={{ marginTop: 2 }}>
          {icon}
        </svg>
      </div>
    </div>
  );
};
