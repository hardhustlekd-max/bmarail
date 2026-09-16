import React from 'react';
import { UserRole } from '../../types';
import { useData } from '../../context/DataContext';
import { MunicipalDashboardOverview } from '../../components/MunicipalDashboardOverview';

interface DashboardOverviewRouterProps {
  lang: 'am' | 'en';
  userRole: UserRole;
  userBadgeId: string;
  onQuickAction: (actionKey: string) => void;
  isLoading?: boolean;
}

export const DashboardOverviewRouter: React.FC<DashboardOverviewRouterProps> = ({
  lang,
  userRole,
  userBadgeId,
  onQuickAction,
  isLoading,
}) => {
  const {
    registrations,
    officers,
    verificationLogs,
    unregisteredReports,
    paymentReceipts,
    addVerificationLog,
    isLoading: dataLoading,
  } = useData();

  return (
    <MunicipalDashboardOverview
      userBadgeId={userBadgeId}
      userRole={userRole}
      lang={lang}
      registrations={registrations}
      officers={officers}
      verificationLogs={verificationLogs}
      unregisteredReports={unregisteredReports}
      paymentReceipts={paymentReceipts}
      onQuickAction={onQuickAction}
      onAddVerificationLog={addVerificationLog}
      isLoading={isLoading ?? dataLoading}
    />
  );
};
