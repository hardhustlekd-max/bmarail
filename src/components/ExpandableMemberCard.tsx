import React from 'react';

export interface MemberField {
  label: string;
  value: React.ReactNode;
}

export interface ExpandableMemberCardProps {
  fullName?: string;
  roleOrTitle?: string;
  badgeId?: string;
  status?: string;
  portraitUrl?: string;
  fields: MemberField[];
  isAmharic?: boolean;
  showHeader?: boolean;
}

export const ExpandableMemberCard: React.FC<ExpandableMemberCardProps> = ({
  fullName,
  roleOrTitle,
  badgeId,
  portraitUrl,
  fields,
  showHeader = true,
}) => {
  return (
    <div className="py-2 space-y-2.5">
      {showHeader && (
        <>
          {/* Header: Rectangular Avatar with Clean Border, Name, Badge */}
          <div className="flex items-center gap-3 sm:gap-3.5">
            {/* Rectangular Avatar with Neutral Border */}
            <div className="w-12 h-14 sm:w-14 sm:h-16 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 shadow-2xs shrink-0 overflow-hidden flex items-center justify-center">
              {portraitUrl ? (
                <img
                  src={portraitUrl}
                  alt={fullName || 'Avatar'}
                  className="w-full h-full object-cover rounded-xs"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.png';
                  }}
                />
              ) : (
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="w-full h-full object-contain p-1 rounded-xs"
                />
              )}
            </div>

            {/* Member Details Header */}
            <div className="min-w-0 flex-1 space-y-1">
              <h4 className="text-sm sm:text-base font-extrabold text-[#1C2434] dark:text-white leading-tight truncate">
                {fullName} {roleOrTitle && <span className="text-slate-500 dark:text-slate-400 font-bold text-xs">({roleOrTitle})</span>}
              </h4>

              {/* Badge Pill */}
              {badgeId && (
                <div>
                  <span className="inline-block px-2.5 py-0.5 bg-[#F1F5F9] dark:bg-[#2E3A47] text-[#1C2434] dark:text-white text-[11px] sm:text-xs font-black rounded-md tracking-wider">
                    {badgeId}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Horizontal Divider */}
          <div className="border-t border-[#F1F5F9] dark:border-[#2E3A47] my-2.5" />
        </>
      )}

      {/* Key-Value Details Grid - Direct Layout without Outer Card Container */}
      <div className="space-y-2 text-xs sm:text-sm">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center justify-between gap-3 py-0.5">
            <span className="text-slate-500 dark:text-slate-400 font-extrabold shrink-0">{field.label}</span>
            <span className="font-extrabold text-[#1C2434] dark:text-white text-right truncate">
              {field.value || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
