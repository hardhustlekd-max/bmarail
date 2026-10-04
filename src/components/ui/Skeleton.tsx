import React from 'react';
export { CentralPageSpinner, type CentralPageSpinnerProps } from './CentralPageSpinner';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      style={style}
      className={`animate-pulse bg-slate-200/80 dark:bg-slate-800/80 rounded-md ${className}`}
    />
  );
};

export const LoadingSpinner: React.FC<{ label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  label,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2.5 p-4 ${className}`}>
      <div
        className={`${sizeClasses[size]} border-slate-300 dark:border-slate-700 border-t-primary rounded-full animate-spin`}
      />
      {label && (
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
};

export const MetricCardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 min-w-0 ${className}`}>
      <div className="flex flex-col items-center gap-1.5">
        <Skeleton className="h-3 w-16 sm:w-20" />
        <Skeleton className="h-6 sm:h-8 w-10 sm:w-14 my-0.5" />
      </div>
    </div>
  );
};

export const MetricGridSkeleton: React.FC<{ count?: number; columns?: number | string; className?: string }> = ({
  count = 4,
  columns = 4,
  className = '',
}) => {
  const gridColsClass =
    typeof columns === 'number'
      ? columns === 3
        ? 'grid-cols-3'
        : columns === 5
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
        : 'grid-cols-2 sm:grid-cols-4'
      : columns;

  return (
    <div className={`grid gap-1.5 sm:gap-3 ${gridColsClass} ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <MetricCardSkeleton key={idx} />
      ))}
    </div>
  );
};

export const TableRowSkeleton: React.FC<{ columnsCount?: number }> = ({ columnsCount = 6 }) => {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      {Array.from({ length: columnsCount }).map((_, idx) => (
        <td key={idx} className="px-4 py-3.5">
          <Skeleton className={`h-4 ${idx === 0 ? 'w-24' : idx === 1 ? 'w-32' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columnsCount?: number; showHeaderControls?: boolean }> = ({
  rows = 5,
  columnsCount = 6,
  showHeaderControls = true,
}) => {
  return (
    <div className="w-full bg-white dark:bg-[#1C2434] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
      {showHeaderControls && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
            <tr>
              {Array.from({ length: columnsCount }).map((_, idx) => (
                <th key={idx} className="px-4 py-3">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, idx) => (
              <TableRowSkeleton key={idx} columnsCount={columnsCount} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PermitStatusSummarySkeleton: React.FC = () => {
  return <MetricGridSkeleton count={4} columns={4} />;
};

export const DashboardOverviewSkeleton: React.FC<{ userRole?: string; isAmharic?: boolean }> = ({
  userRole = 'clerk',
  isAmharic = true,
}) => {
  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
      {/* 1. Hero QR Scanner Center Placeholder (For Officer Role) */}
      {userRole === 'officer' && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-6 sm:p-8 shadow-xs flex flex-col items-center justify-center space-y-4">
          <Skeleton className="h-4 w-48 sm:w-64" />
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <Skeleton className="w-16 h-16 rounded-full" />
          </div>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-72 max-w-sm" />
          <Skeleton className="h-12 w-full max-w-xs rounded-lg" />
        </div>
      )}

      {/* 2. Unified Overview Container */}
      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-xs overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 sm:px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-5 h-5 rounded-md" />
            <Skeleton className="h-4 w-28 sm:w-36" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        <div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800">
          {/* Section 1: Monthly Fee Statistics */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded-full" />
                <Skeleton className="h-4 w-44 sm:w-56" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 flex flex-col items-center gap-1.5"
                >
                  <Skeleton className="h-3 w-16 sm:w-20" />
                  <Skeleton className="h-6 sm:h-7 w-12 sm:w-16 my-0.5" />
                  <Skeleton className="h-2.5 w-14" />
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Permit Registrations Status */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded-full" />
                <Skeleton className="h-4 w-40 sm:w-52" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 flex flex-col items-center gap-1.5"
                >
                  <Skeleton className="h-3 w-16 sm:w-20" />
                  <Skeleton className="h-6 sm:h-7 w-10 sm:w-14 my-0.5" />
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Field Verification Inspections */}
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded-full" />
                <Skeleton className="h-4 w-36 sm:w-48" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 flex flex-col items-center gap-1.5"
                >
                  <Skeleton className="h-3 w-14 sm:w-18" />
                  <Skeleton className="h-6 sm:h-7 w-8 sm:w-12 my-0.5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Monthly Matrix Ledger Section Skeleton */}
      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/60 pb-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-5 h-5 rounded-md" />
            <div>
              <Skeleton className="h-4 w-44 sm:w-56 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>

        {/* Matrix rows skeleton */}
        <div className="space-y-2.5 pt-1">
          {Array.from({ length: 5 }).map((_, rIdx) => (
            <div
              key={rIdx}
              className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div>
                  <Skeleton className="h-3.5 w-32 mb-1" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                {Array.from({ length: 12 }).map((_, cIdx) => (
                  <Skeleton key={cIdx} className="w-6 h-6 rounded-full" />
                ))}
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* 4. Quick Actions Grid Skeleton */}
      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 pb-3">
          <Skeleton className="w-5 h-5 rounded-md" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30 flex flex-col items-center gap-2"
            >
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

