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
          ? 'ይህ አገልግሎት በእርስዎ ሚና ፈቃድ ገደብ ተጥሎበታል።'
          : 'Submission restricted: Your current role does not have registration submission permissions.'
      );
      return { success: false, error: 'Registration submission restricted' };
    }
    return onAddRegistration(newReg, options);
  };

  return (
    <div className="space-y-2 md:space-y-2.5">
      {isDenied ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-400 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
          <Icon className="material-symbols-outlined text-[18px]">gpp_maybe</Icon>
          <span>
            {isAmharic
              ? 'አዲስ አባልና ተሽከርካሪ መመዝገብ በእርስዎ ሚና ፈቃዶች (RBAC) መሰረት ገደብ ተጥሎበታል።'
              : 'Registration Submission Restricted: New member registration is disabled by active role permissions.'}
          </span>
        </div>
      ) : isReadOnly ? (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
          <Icon className="material-symbols-outlined text-[18px]">warning</Icon>
          <span>
            {isAmharic
              ? 'ተነባቢ ብቻ ሁነታ ተተግብሯል፡ በእርስዎ ሚና ፈቃዶች መሰረት ማስተካከል እና አዲስ ምዝገባ ማስገባት አይቻልም።'
              : 'Read-Only Mode Active: Form editing and submissions are disabled based on your role permissions.'}
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

