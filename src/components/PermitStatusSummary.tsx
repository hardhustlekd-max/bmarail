import React from 'react';
import { Icon } from './ui/Icon';
import { Language, MotorcycleRegistration } from '../types';
import { PermitStatusSummarySkeleton } from './ui/Skeleton';

interface PermitStatusSummaryProps {
  registrations: MotorcycleRegistration[];
  lang: Language;
  onSelectStatusFilter?: (status: string) => void;
  borderless?: boolean;
  isLoading?: boolean;
}

export const PermitStatusSummary: React.FC<PermitStatusSummaryProps> = ({
  registrations,
  lang,
  onSelectStatusFilter,
  borderless = false,
  isLoading = false,
}) => {
  if (isLoading) {
    return <PermitStatusSummarySkeleton />;
  }

  const isAmharic = lang === 'am';

  // Calculate counts for each permit status
  const pendingCount = registrations.filter((r) => r.status === 'pending_approval').length;
  const approvedCount = registrations.filter((r) => r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print').length;
  const rejectedCount = registrations.filter((r) => r.status === 'rejected').length;

  // Status Cards Data Config - Minimalist styling
  const statusCards = [
    {
      key: 'pending_approval',
      label: isAmharic ? 'በመጠባበቅ' : 'Pending',
      count: pendingCount,
      dotColor: 'bg-amber-500',
    },
    {
      key: 'approved',
      label: isAmharic ? 'የጸደቁ' : 'Approved',
      count: approvedCount,
      dotColor: 'bg-emerald-500',
    },
    {
      key: 'rejected',
      label: isAmharic ? 'ውድቅ' : 'Rejected',
      count: rejectedCount,
      dotColor: 'bg-rose-500',
    },
    {
      key: 'all',
      label: isAmharic ? 'ጠቅላላ' : 'Total',
      count: registrations.length,
      dotColor: 'bg-slate-400 dark:bg-slate-500',
    },
  ];

  return (
    <div
      id="permit-status-summary"
      className={
        borderless
          ? 'p-4 sm:p-5 space-y-3'
          : 'bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 sm:p-5 space-y-3'
      }
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2.5">
        <h3 className="font-semibold text-xs sm:text-sm text-on-surface uppercase tracking-wider">
          {isAmharic ? 'የአባላት አስተዳደር ሁኔታ' : 'Permit Status Breakdown'}
        </h3>
      </div>

      {/* Breakdown Grid - Minimalist flat stat blocks */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {statusCards.map((card) => (
          <div
            key={card.key}
            onClick={() => onSelectStatusFilter && onSelectStatusFilter(card.key)}
            className="p-2.5 sm:p-3 rounded-md bg-surface-container-low/60 dark:bg-slate-900/40 hover:bg-surface-container-low dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none border border-outline-variant/40 dark:border-slate-800/60"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dotColor}`} />
              <span className="text-[11px] font-medium text-secondary truncate">
                {card.label}
              </span>
            </div>
            <p className="text-base sm:text-lg lg:text-xl font-bold text-on-surface tracking-tight">
              {card.count}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};


