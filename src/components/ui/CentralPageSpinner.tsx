import React from 'react';

export interface CentralPageSpinnerProps {
  label?: string;
  subtitle?: string;
  isOverlay?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CentralPageSpinner: React.FC<CentralPageSpinnerProps> = ({
  label,
  subtitle,
  isOverlay = true,
  className = '',
  size = 'md',
}) => {
  const sizeMap = {
    sm: {
      ring: 'w-10 h-10 border-3',
      dot: 'w-2 h-2',
      card: 'px-5 py-4 min-w-[180px]',
      text: 'text-xs',
    },
    md: {
      ring: 'w-14 h-14 border-4',
      dot: 'w-3 h-3',
      card: 'px-7 py-6 min-w-[220px]',
      text: 'text-sm',
    },
    lg: {
      ring: 'w-16 h-16 border-4',
      dot: 'w-3.5 h-3.5',
      card: 'px-8 py-7 min-w-[260px]',
      text: 'text-base',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`bg-white/95 dark:bg-[#1C2434]/95 border border-[#E2E8F0] dark:border-[#2E3A47] shadow-2xl rounded-2xl ${currentSize.card} flex flex-col items-center gap-3.5 max-w-xs mx-auto text-center transform scale-100 animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-auto`}
    >
      {/* Central Double-Ring Spinning Animation */}
      <div className={`relative flex items-center justify-center ${size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-16 h-16' : 'w-14 h-14'}`}>
        {/* Subtle background track */}
        <div
          className={`${currentSize.ring} rounded-full border-slate-200/90 dark:border-slate-700/60`}
        />
        {/* Active spinning ring */}
        <div
          className={`absolute inset-0 ${currentSize.ring} rounded-full border-transparent border-t-primary border-r-primary animate-spin`}
        />
        {/* Center pulsing accent dot */}
        <div className={`absolute ${currentSize.dot} rounded-full bg-primary animate-pulse shadow-sm`} />
      </div>

      {/* Status text & Subtitle */}
      <div className="flex flex-col items-center gap-0.5">
        <span className={`${currentSize.text} font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-snug`}>
          {label || 'እባክዎ ይጠብቁ...'}
        </span>
        {subtitle && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (!isOverlay) {
    return (
      <div className={`flex items-center justify-center p-8 w-full ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/25 dark:bg-black/45 backdrop-blur-[2px] transition-all duration-200 animate-fade-in ${className}`}
    >
      {content}
    </div>
  );
};
