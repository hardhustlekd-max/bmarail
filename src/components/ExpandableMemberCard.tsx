import React from 'react';

export interface MemberField {
  label: string;
  value: React.ReactNode;
}

export interface ExpandableMemberCardProps {
  fullName: string;
  roleOrTitle?: string;
  badgeId?: string;
  statusText?: string;
  isActive?: boolean;
  portraitUrl?: string;
  fields: MemberField[];
  isAmharic?: boolean;
}

export const ExpandableMemberCard: React.FC<ExpandableMemberCardProps> = ({
  fullName,
  roleOrTitle,
  badgeId,
  statusText,
  isActive = true,
  portraitUrl,
  fields,
  isAmharic = true,
}) => {
  return (
    <div className="bg-white dark:bg-[#1C2434] p-4 sm:p-5 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] shadow-sm mb-4">
      {/* Header: Avatar, Name, Badge, Status */}
      <div className="flex items-center gap-3.5 sm:gap-4">
        {/* Emblem/Avatar Circle with Gold Ring */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-amber-400 p-0.5 bg-white shadow-xs shrink-0 overflow-hidden flex items-center justify-center">
          {portraitUrl ? (
            <img
              src={portraitUrl}
              alt={fullName}
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                // Fallback to logo on image error
                (e.target as HTMLImageElement).src = '/logo.png';
              }}
            />
          ) : (
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain rounded-full"
            />
          )}
        </div>

        {/* Member Details Header */}
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-base sm:text-lg font-extrabold text-[#1C2434] dark:text-white leading-tight truncate">
            {fullName} {roleOrTitle && <span className="text-slate-500 dark:text-slate-400 font-bold text-xs sm:text-sm">({roleOrTitle})</span>}
          </h4>

          {/* Badge Pill */}
          {badgeId && (
            <div>
              <span className="inline-block px-3 py-0.5 bg-[#F1F5F9] dark:bg-[#2E3A47] text-[#1C2434] dark:text-white text-xs font-black rounded-md tracking-wider">
                {badgeId}
              </span>
            </div>
          )}

          {/* Active Status */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span>
              {statusText || (isActive ? (isAmharic ? 'ንቁ መለያ (Active Session)' : 'Active Session') : (isAmharic ? 'የታገደ' : 'Inactive'))}
            </span>
          </div>
        </div>
      </div>

      {/* Horizontal Divider */}
      <div className="border-t border-[#F1F5F9] dark:border-[#2E3A47] my-3.5" />

      {/* Key-Value Details Grid */}
      <div className="space-y-2.5 text-xs sm:text-sm">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="text-slate-400 dark:text-slate-400 font-bold shrink-0">{field.label}</span>
            <span className="font-extrabold text-[#1C2434] dark:text-white text-right truncate">
              {field.value || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
