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
  const totalCount = registrations.length || 1; // avoid division by zero

  // Status Cards Data Config
  const statusCards = [
    {
      key: 'pending_approval',
      label: isAmharic ? 'በመጠባበቅ' : 'Pending',
      count: pendingCount,
      percentage: Math.round((pendingCount / totalCount) * 100),
      icon: 'pending_actions',
      badgeBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
      bg: 'bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/40',
      textClass: 'text-amber-700 dark:text-amber-400',
      description: isAmharic ? 'ማፅደቂያ የሚጠበቁ' : 'Awaiting review',
    },
    {
      key: 'approved',
      label: isAmharic ? 'የጸደቁ' : 'Approved',
      count: approvedCount,
      percentage: Math.round((approvedCount / totalCount) * 100),
      icon: 'verified',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
      textClass: 'text-emerald-700 dark:text-emerald-400',
      description: isAmharic ? 'የተረጋገጡ' : 'Verified & active',
    },
    {
      key: 'rejected',
      label: isAmharic ? 'ውድቅ' : 'Rejected',
      count: rejectedCount,
      percentage: Math.round((rejectedCount / totalCount) * 100),
      icon: 'cancel',
      badgeBg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700',
      bg: 'bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/40',
      textClass: 'text-rose-700 dark:text-rose-400',
      description: isAmharic ? 'ውድቅ የተደረጉ' : 'Failed eligibility',
    },
    {
      key: 'all',
      label: isAmharic ? 'ጠቅላላ' : 'Total',
      count: registrations.length,
      percentage: 100,
      icon: 'assessment',
      badgeBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-slate-800',
      bg: 'bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800/70',
      textClass: 'text-slate-800 dark:text-blue-400',
      description: isAmharic ? 'ሁሉም ምዝገባዎች' : 'All registrations',
    },
  ];

  return (
    <div
      id="permit-status-summary"
      className={
        borderless
          ? 'p-4 sm:p-5 space-y-4'
          : 'bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-4 sm:p-5 shadow-xs space-y-4'
      }
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 pb-3.5">
        <div className="flex items-center gap-3">
          <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">analytics</Icon>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm sm:text-base text-on-surface uppercase tracking-wider">
                {isAmharic ? 'የአባላት አስተዳደር ሁኔታ' : 'Permit Status Breakdown'}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Grid - 4 cards horizontal without wrap & without overflow */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {statusCards.map((card) => {
          return (
            <div
              key={card.key}
              onClick={() => onSelectStatusFilter && onSelectStatusFilter(card.key)}
              className={`p-2 sm:p-3 rounded-lg ${card.bg} hover:shadow-md active:scale-105 active:bg-[#0f172a]/25 dark:active:bg-[#0f172a]/40 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none`}
            >
              <div className={`flex justify-between items-center ${card.textClass} mb-1`}>
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-primary transition-colors">
                  {card.label}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">{card.icon}</Icon>
              </div>
              <p className="text-lg sm:text-2xl lg:text-3xl font-black text-on-surface tracking-tight leading-tight">{card.count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};


