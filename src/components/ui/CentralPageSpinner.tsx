import React from 'react';

export interface CentralPageSpinnerProps {
  label?: string;
  subtitle?: string;
  isOverlay?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CentralPageSpinner: React.FC<CentralPageSpinnerProps> = ({
  isOverlay = true,
  className = '',
  size = 'md',
}) => {
  const sizeMap = {
    sm: {
      container: 'w-8 h-8',
      arrow: 'w-4 h-4',
    },
    md: {
      container: 'w-11 h-11 sm:w-12 sm:h-12',
      arrow: 'w-5.5 h-5.5 sm:w-6 sm:h-6',
    },
    lg: {
      container: 'w-14 h-14 sm:w-16 sm:h-16',
      arrow: 'w-7 h-7 sm:w-8 sm:h-8',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex items-center justify-center select-none pointer-events-auto"
    >
      {/* Circular background with circular spinning arrow — decreased size, NO label, NO drop shadow, NO blur */}
      <div
        className={`${currentSize.container} rounded-full bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-center shrink-0`}
      >
        <svg
          className={`${currentSize.arrow} text-primary animate-spin`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <polyline points="8 8 3 8 3 3" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <polyline points="16 16 21 16 21 21" />
        </svg>
      </div>
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
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-black/20 dark:bg-black/40 transition-opacity duration-150 ${className}`}
    >
      {content}
    </div>
  );
};

