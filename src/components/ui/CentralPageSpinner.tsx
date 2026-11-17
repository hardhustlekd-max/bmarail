import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

export interface SpinnerIconProps {
  size?: number;
  className?: string;
  trackClassName?: string;
  spinning?: boolean;
  rotationDeg?: number;
}

/**
 * Material `progress_activity` spinner icon with a viewBox-matched concentric track ring.
 * Both the track circle (r=370, strokeWidth=60) and `progress_activity` share viewBox `0 -960 960 960`.
 */
export const SpinnerIcon: React.FC<SpinnerIconProps> = ({
  size = 34,
  className = 'text-primary',
  trackClassName = 'text-primary/15 dark:text-primary/20',
  spinning = true,
  rotationDeg = 0,
}) => {
  const scaledSize = `calc(${size}px * var(--ui-scale, 1))`;

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: scaledSize, height: scaledSize }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 -960 960 960"
        fill="none"
        className={`absolute inset-0 pointer-events-none ${trackClassName}`}
        aria-hidden="true"
      >
        <circle
          cx="480"
          cy="-480"
          r="370"
          stroke="currentColor"
          strokeWidth="60"
        />
      </svg>
      <span
        className={`inline-flex items-center justify-center ${spinning ? 'animate-spin' : ''}`}
        style={!spinning ? { transform: `rotate(${rotationDeg}deg)` } : undefined}
      >
        <Icon
          name="progress_activity"
          size={size}
          className={className}
        />
      </span>
    </span>
  );
};

export interface CentralPageSpinnerProps {
  label?: string;
  subtitle?: string;
  isOverlay?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Delay in ms before displaying overlay spinner so fast operations do not flash */
  delayMs?: number;
}

export const CentralPageSpinner: React.FC<CentralPageSpinnerProps> = ({
  label,
  subtitle,
  isOverlay = true,
  className = '',
  size = 'md',
  delayMs = isOverlay ? 400 : 0,
}) => {
  const [visible, setVisible] = useState<boolean>(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    if (visible) return;
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, visible]);

  if (!visible) {
    return null;
  }

  const sizeMap = {
    sm: {
      container: 'w-8 h-8',
      iconSize: 24,
    },
    md: {
      container: 'w-11 h-11',
      iconSize: 34,
    },
    lg: {
      container: 'w-14 h-14',
      iconSize: 44,
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const badge = (
    <div
      className={`${currentSize.container} rounded-full bg-surface-container border border-outline-variant shadow-sm flex items-center justify-center shrink-0 animate-spinner-badge`}
    >
      <SpinnerIcon size={currentSize.iconSize} />
    </div>
  );

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center justify-center gap-2.5 select-none pointer-events-auto"
    >
      {badge}
      {label ? (
        <div className="flex flex-col items-center text-center gap-0.5">
          <span className="text-xs font-semibold text-on-surface">{label}</span>
          {subtitle && (
            <span className="text-[11px] text-on-surface-variant">{subtitle}</span>
          )}
        </div>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );

  if (!isOverlay) {
    return (
      <div className={`flex items-center justify-center p-4 w-full ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/20 dark:bg-black/50 backdrop-blur-[1.5px] animate-spinner-backdrop ${className}`}
    >
      {content}
    </div>
  );
};
