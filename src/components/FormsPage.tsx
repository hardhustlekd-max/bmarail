import React from 'react';
import { Icon } from './ui/Icon';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  OfficerAssignment,
} from '../types';
import { MultiStepRegistrationForm } from './MultiStepRegistrationForm';
import { getPermissionState } from '../services/dbService';

interface FormsPageProps {
  lang: Language;
  userRole: UserRole;
  userBadgeId: string;
  registrations: MotorcycleRegistration[];
  officers: OfficerAssignment[];
  onAddRegistration: (
    newReg: MotorcycleRegistration,
    options?: { forceLocalOnly?: boolean }
  ) => Promise<any> | any;
  onViewRegistered?: () => void;
  onAddOfficerAssignment: (assignment: OfficerAssignment) => void;
}

export const FormsPage: React.FC<FormsPageProps> = ({
  lang,
  userRole,
  userBadgeId,
  registrations,
  onAddRegistration,
  onViewRegistered,
}) => {
  const isAmharic = lang === 'am';
  const permission = getPermissionState(userRole, 1);
  const isDenied = permission === 'deny';
  const isReadOnly = permission === 'view_only' || isDenied;

  const handleAddWithPermission = async (
    newReg: MotorcycleRegistration,
    options?: { forceLocalOnly?: boolean }
  ) => {
    if (isReadOnly) {
      alert(
        isAmharic
          ? 'አዲስ ምዝገባ በሚናዎ ፈቃድ ተገድቧል።'
          : 'Registration is disabled for your role.'
      );
      return { success: false, error: 'Registration submission restricted' };
    }
    return onAddRegistration(newReg, options);
  };

  return (
    <div className="space-y-2 md:space-y-2.5">
      {isDenied ? (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
          <Icon className="material-symbols-outlined text-[18px] text-rose-600 dark:text-rose-400 shrink-0">gpp_maybe</Icon>
          <span>
            {isAmharic
              ? 'አዲስ ምዝገባ በሚናዎ ፈቃድ ተገድቧል።'
              : 'Registration disabled for your role.'}
          </span>
        </div>
      ) : isReadOnly ? (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 rounded-xl text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
          <Icon className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0">warning</Icon>
          <span>
            {isAmharic
              ? 'ተነባቢ ብቻ ሁነታ፡ አዲስ ምዝገባ ተገድቧል።'
              : 'Read-only mode: Submissions disabled.'}
          </span>
        </div>
      ) : null}

      {/* Main Registration Form Body */}
      <div className={isReadOnly ? 'pointer-events-none opacity-80 select-none' : ''}>
        <MultiStepRegistrationForm
          lang={lang}
          userRole={userRole}
          registrations={registrations}
          onAddRegistration={handleAddWithPermission}
          onViewRegistered={onViewRegistered}
          userBadgeId={userBadgeId}
        />
      </div>
    </div>
  );
};

