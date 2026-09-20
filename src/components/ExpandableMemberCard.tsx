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
          {/* Header: Rectangular Avatar with Clean Neutral Border, Name, Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Rectangular Avatar with Neutral Border (Portrait 3:4 Aspect Ratio) */}
            <div className="w-9.5 h-12.5 sm:w-10 sm:h-13 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 shadow-2xs shrink-0 overflow-hidden flex items-center justify-center">
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
                  className="w-full h-full object-contain p-0.5 rounded-xs"
                />
              )}
            </div>

            {/* Member Details Header */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="text-sm font-bold text-[#1C2434] dark:text-white leading-tight truncate">
                {fullName} {roleOrTitle && <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">({roleOrTitle})</span>}
              </h4>

              {/* Badge ID without box design */}
              {badgeId && (
                <div>
                  <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 tracking-wide">
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

      {/* Key-Value Details Grid - Item Values Alignment Starts from Center */}
      <div className="space-y-2 text-xs sm:text-sm">
        {fields.map((field, index) => (
          <div key={index} className="grid grid-cols-2 gap-3 sm:gap-4 py-0.5 items-center">
            <span className="text-[#1C2434] dark:text-white font-extrabold truncate min-w-0">
              {field.label}
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-extrabold text-left truncate min-w-0">
              {field.value || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
