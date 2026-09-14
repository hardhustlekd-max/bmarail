import React from 'react';
import { Icon } from './ui/Icon';
import { Language, MotorcycleRegistration } from '../types';

interface PermitStatusSummaryProps {
  registrations: MotorcycleRegistration[];
  lang: Language;
  onSelectStatusFilter?: (status: string) => void;
  borderless?: boolean;
}

export const PermitStatusSummary: React.FC<PermitStatusSummaryProps> = ({
  registrations,
  lang,
  onSelectStatusFilter,
  borderless = false,
}) => {
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
      border: 'border-amber-200 dark:border-amber-900/60',
      bg: 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30',
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
      border: 'border-emerald-200 dark:border-emerald-900/60',
      bg: 'bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
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
      border: 'border-rose-200 dark:border-rose-900/60',
      bg: 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/30',
      textClass: 'text-rose-700 dark:text-rose-400',
      description: isAmharic ? 'ውድቅ የተደረጉ' : 'Failed eligibility',
    },
    {
      key: 'all',
      label: isAmharic ? 'ጠቅላላ' : 'Total',
      count: registrations.length,
      percentage: 100,
      icon: 'assessment',
      badgeBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700',
      border: 'border-slate-200 dark:border-slate-800',
      bg: 'bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70',
      textClass: 'text-blue-700 dark:text-blue-400',
      description: isAmharic ? 'ሁሉም ምዝገባዎች' : 'All registrations',
    },
  ];

  return (
    <div
      id="permit-status-summary"
      className={
        borderless
          ? 'space-y-4'
          : 'bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-4 sm:p-5 shadow-xs space-y-4'
      }
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Icon className="material-symbols-outlined text-[20px]">analytics</Icon>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-xs sm:text-sm text-on-surface uppercase tracking-wider">
                {isAmharic ? 'የአባላት አስተዳደር ሁኔታ' : 'Permit Status Breakdown'}
              </h3>
            </div>
            <p className="text-[11px] text-secondary font-medium mt-0.5">
              {isAmharic ? 'የሁሉም ፈቃዶች ሁኔታና ብዛት ማጠቃለያ' : 'Real-time state overview of all permit applications'}
            </p>
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
              className={`p-1.5 sm:p-3 rounded-lg border ${card.border} ${card.bg} transition-colors cursor-pointer group min-w-0 overflow-hidden`}
            >
              <div className={`flex justify-between items-center ${card.textClass} mb-0.5 sm:mb-1`}>
                <span className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {card.label}
                </span>
                <Icon className="material-symbols-outlined text-[13px] sm:text-[16px] shrink-0">{card.icon}</Icon>
              </div>
              <p className="text-base sm:text-2xl font-black text-on-surface tracking-tight leading-tight">{card.count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};


