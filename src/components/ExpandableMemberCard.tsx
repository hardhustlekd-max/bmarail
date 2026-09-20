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
  status = 'pending_approval',
  portraitUrl,
  fields,
  showHeader = true,
}) => {
  // Determine border color based on actual registration status
  const getStatusBorderColor = (st: string) => {
    switch (st) {
      case 'approved':
        return 'border-emerald-500 bg-emerald-50/20';
      case 'rejected':
        return 'border-rose-500 bg-rose-50/20';
      case 'pending_approval':
      case 'ordered_print':
      case 'printed':
        return 'border-amber-500 bg-amber-50/20';
      case 'disabled':
        return 'border-slate-400 bg-slate-100/30';
      default:
        return 'border-slate-300 dark:border-slate-700';
    }
  };

  const statusBorderClass = getStatusBorderColor(status);

  return (
    <div className="bg-white dark:bg-[#1C2434] p-4 sm:p-5 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] shadow-sm mb-4">
      {showHeader && (
        <>
          {/* Header: Rectangular Avatar with Status Border, Name, Badge */}
          <div className="flex items-center gap-3.5 sm:gap-4">
            {/* Rectangular Avatar with Registration Status Border */}
            <div className={`w-14 h-16 sm:w-16 sm:h-18 rounded-md border-2 p-0.5 shadow-xs shrink-0 overflow-hidden flex items-center justify-center ${statusBorderClass}`}>
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
            <div className="min-w-0 flex-1 space-y-1.5">
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
            </div>
          </div>

          {/* Horizontal Divider */}
          <div className="border-t border-[#F1F5F9] dark:border-[#2E3A47] my-3.5" />
        </>
      )}

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
