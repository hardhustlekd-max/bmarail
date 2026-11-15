import React from 'react';
import { Icon } from './ui/Icon';

export const ColdStartLoader: React.FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[9999999] bg-surface text-on-surface flex flex-col items-center justify-center p-4"
    >
      <div className="w-14 h-14 rounded-full bg-surface-container border border-outline-variant shadow-sm flex items-center justify-center mb-4">
        <Icon name="progress_activity" size={32} className="text-primary animate-spin" />
      </div>
      <h2 className="text-lg font-bold text-on-surface">Waking up system...</h2>
      <p className="text-sm text-on-surface-variant mt-1.5 text-center">
        Initial server load may take a moment.
      </p>
    </div>
  );
};
