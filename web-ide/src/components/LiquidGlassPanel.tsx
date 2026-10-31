import React from 'react';

interface LiquidGlassPanelProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
}

export const LiquidGlassPanel: React.FC<LiquidGlassPanelProps> = ({
  children,
  className = '',
  contentClassName = '',
  style,
}) => {
  return (
    <div className={`liquid-glass-panel ${className}`.trim()} style={style}>
      <div className="glass-backdrop" aria-hidden="true" />
      <div className={`panel-content ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
};
