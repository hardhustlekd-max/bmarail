import React from 'react';

export const ColdStartLoader: React.FC = () => (
  <div className="fixed inset-0 z-[9999999] bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-4">
    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Waking up system...</h2>
    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 text-center">
      Initial server load may take a moment.
    </p>
  </div>
);
