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
  const isAmharic = lang === 'am';

  // Calculate counts for each permit status in a single pass
  const { pendingCount, approvedCount, rejectedCount, totalCount } = React.useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    registrations.forEach((r) => {
      if (r.status === 'pending_approval' || (r.status as string) === 'pending') pending++;
      else if (r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print') approved++;
      else if (r.status === 'rejected') rejected++;
    });
    return {
      pendingCount: pending,
      approvedCount: approved,
      rejectedCount: rejected,
      totalCount: registrations.length || 1,
    };
  }, [registrations]);

  // Status Cards Data Config
  const statusCards = [
    {
      key: 'pending_approval',
      label: isAmharic ? 'በመጠባበቅ' : 'Pending',
      count: isLoading ? '—' : pendingCount,
      percentage: Math.round((pendingCount / totalCount) * 100),
      icon: 'pending_actions',
      bg: 'bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#F1F5F9] dark:hover:bg-[#333A48] border-[#E2E8F0] dark:border-[#2E3A47]',
      labelClass: 'text-[#475569] dark:text-[#CBD5E1]',
      description: isAmharic ? 'ማፅደቂያ የሚጠበቁ' : 'Awaiting review',
    },
    {
      key: 'approved',
      label: isAmharic ? 'የጸደቁ' : 'Approved',
      count: isLoading ? '—' : approvedCount,
      percentage: Math.round((approvedCount / totalCount) * 100),
      icon: 'verified',
      bg: 'bg-emerald-50/70 dark:bg-[#10B981]/10 hover:bg-emerald-100/60 dark:hover:bg-[#10B981]/15 border-emerald-200/80 dark:border-[#10B981]/30',
      labelClass: 'text-emerald-700 dark:text-[#6EE7B7]',
      description: isAmharic ? 'የተረጋገጡ' : 'Verified & active',
    },
    {
      key: 'rejected',
      label: isAmharic ? 'ውድቅ' : 'Rejected',
      count: isLoading ? '—' : rejectedCount,
      percentage: Math.round((rejectedCount / totalCount) * 100),
      icon: 'cancel',
      bg: 'bg-rose-50/70 dark:bg-[#FB5454]/10 hover:bg-rose-100/60 dark:hover:bg-[#FB5454]/15 border-rose-200/80 dark:border-[#FB5454]/30',
      labelClass: 'text-rose-700 dark:text-[#FDA4AF]',
      description: isAmharic ? 'ውድቅ የተደረጉ' : 'Failed eligibility',
    },
    {
      key: 'all',
      label: isAmharic ? 'ጠቅላላ' : 'Total',
      count: isLoading ? '—' : registrations.length,
      percentage: 100,
      icon: 'assessment',
      bg: 'bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/15 border-primary/20 dark:border-primary/30',
      labelClass: 'text-primary',
      description: isAmharic ? 'ሁሉም ምዝገባዎች' : 'All registrations',
    },
  ];

  return (
    <div
      id="permit-status-summary"
      className={
        borderless
          ? 'p-4 sm:p-5 space-y-4'
          : 'bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg p-4 sm:p-5 shadow-xs space-y-4'
      }
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3.5">
        <div className="flex items-center gap-3">
          <Icon className="material-symbols-outlined text-icon-xl text-primary shrink-0">analytics</Icon>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm sm:text-base text-[#1C2434] dark:text-white tracking-wider">
                {isAmharic ? 'የአባላት ምዝገባ ስታቲስቲክስ' : 'Member Registration Statistics'}
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
              className={`p-2.5 sm:p-3 rounded-lg ${card.bg} border cursor-pointer group min-w-0 overflow-hidden select-none transition-colors`}
            >
              <div className="mb-1 sm:mb-1.5 text-center">
                <span className={`text-2xs sm:text-xs font-extrabold tracking-tight ${card.labelClass} truncate block group-hover:text-primary transition-colors`}>
                  {card.label}
                </span>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-[#1C2434] dark:text-white tracking-tight leading-tight text-center">{card.count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};


