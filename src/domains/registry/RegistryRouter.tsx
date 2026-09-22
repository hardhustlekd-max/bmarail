import React from 'react';
import { UserRole } from '../../types';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { FormsPage } from '../../components/FormsPage';
import { TodaySubmissionsPage } from '../../components/TodaySubmissionsPage';
import { TablesPage } from '../../components/TablesPage';
import { isTaskViewable } from '../../services/dbService';

interface RegistryRouterProps {
  activePage: string;
  setActivePage: (page: string) => void;
  lang: 'am' | 'en';
  userRole: UserRole;
  userBadgeId: string;
  userSubCity?: string;
  tableInitialTab?: 'approved' | 'pending' | 'expired';
}

export const RegistryRouter: React.FC<RegistryRouterProps> = ({
  activePage,
  setActivePage,
  lang,
  userRole,
  userBadgeId,
  tableInitialTab,
}) => {
  const {
    registrations,
    officers,
    verificationLogs,
    paymentReceipts,
    isLoading,
    saveRegistration,
    approveRegistration,
    rejectRegistration,
    addPaymentReceipt,
    deletePaymentReceipt,
    addVerificationLog,
    saveOfficerAssignment,
  } = useData();

  const { addToast } = useToast();

  if (activePage === 'forms') {
    if (!isTaskViewable(userRole, 1)) {
      return (
        <div className="p-6 text-center">
          <p className="text-rose-500 font-bold">
            {lang === 'am' 
              ? 'ይህንን ገጽ ለመመልከት ፈቃድ የለዎትም።' 
              : 'You do not have permission to view this page.'}
          </p>
        </div>
      );
    }
    return (
      <FormsPage
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        registrations={registrations}
        officers={officers}
        onAddRegistration={saveRegistration}
        onViewRegistered={() => setActivePage('today_submissions_adjust')}
        onAddOfficerAssignment={saveOfficerAssignment}
      />
    );
  }

  if (activePage === 'today_submissions_adjust') {
    if (!isTaskViewable(userRole, 2)) {
      return (
        <div className="p-6 text-center">
          <p className="text-rose-500 font-bold">
            {lang === 'am' 
              ? 'ይህንን ገጽ ለመመልከት ፈቃድ የለዎትም።' 
              : 'You do not have permission to view this page.'}
          </p>
        </div>
      );
    }
    return (
      <TodaySubmissionsPage
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        registrations={registrations}
        onNavigateToNewRegistration={() => setActivePage('forms')}
        onShowToast={(msg, type) => addToast(msg, (type as string) === 'warning' ? 'error' : type)}
        isLoading={isLoading}
      />
    );
  }

  if (activePage === 'tables') {
    if (!isTaskViewable(userRole, 3)) {
      return (
        <div className="p-6 text-center">
          <p className="text-rose-500 font-bold">
            {lang === 'am' 
              ? 'ይህንን ገጽ ለመመልከት ፈቃድ የለዎትም።' 
              : 'You do not have permission to view this page.'}
          </p>
        </div>
      );
    }
    return (
      <TablesPage
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        registrations={registrations}
        officers={officers}
        verificationLogs={verificationLogs}
        paymentReceipts={paymentReceipts}
        onSavePaymentReceipt={addPaymentReceipt}
        onDeletePaymentReceipt={deletePaymentReceipt}
        onApproveRegistration={approveRegistration}
        onRejectRegistration={rejectRegistration}
        onAddVerificationLog={addVerificationLog}
        initialTableTab={tableInitialTab}
        onShowToast={(msg, type) => addToast(msg, (type as string) === 'warning' ? 'error' : type)}
        isLoading={isLoading}
      />
    );
  }

  return null;
};
