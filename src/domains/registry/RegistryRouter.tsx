import React from 'react';
import { UserRole } from '../../types';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { FormsPage } from '../../components/FormsPage';
import { TodaySubmissionsPage } from '../../components/TodaySubmissionsPage';
import { TablesPage } from '../../components/TablesPage';

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
