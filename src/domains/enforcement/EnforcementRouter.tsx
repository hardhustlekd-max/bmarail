import React from 'react';
import { UserRole } from '../../types';
import { useData } from '../../context/DataContext';
import { SharedScannerModal } from '../../components/SharedScannerModal';
import { OfficerVerificationHistory } from '../../components/OfficerVerificationHistory';
import { UnregisteredVehicleForm } from '../../components/UnregisteredVehicleForm';
import { UnregisteredReportsList } from '../../components/UnregisteredReportsList';

interface EnforcementRouterProps {
  activePage: string;
  setActivePage: (page: string) => void;
  lang: 'am' | 'en';
  userRole: UserRole;
  userBadgeId: string;
  userSubCity?: string;
}

export const EnforcementRouter: React.FC<EnforcementRouterProps> = ({
  activePage,
  setActivePage,
  lang,
  userRole,
  userBadgeId,
}) => {
  const {
    registrations,
    verificationLogs,
    unregisteredReports,
    isLoading,
    addVerificationLog,
    saveUnregisteredReport,
    updateUnregisteredReportStatus,
  } = useData();

  if (activePage === 'scan') {
    return (
      <SharedScannerModal
        isOpen={true}
        onClose={() => setActivePage('dashboard')}
        lang={lang}
        registrations={registrations}
        userBadgeId={userBadgeId}
        userRole={userRole}
        onAddVerificationLog={addVerificationLog}
        isPage={true}
      />
    );
  }

  if (activePage === 'inspection_report') {
    return (
      <OfficerVerificationHistory
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        verificationLogs={verificationLogs}
        registrations={registrations}
        onAddVerificationLog={addVerificationLog}
      />
    );
  }

  if (activePage === 'report_unregistered') {
    return (
      <UnregisteredVehicleForm
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        officerName={userRole === 'officer' ? 'Traffic Patrol Officer' : 'System Officer'}
        onSubmitReport={saveUnregisteredReport}
        onCancel={() => setActivePage('unregistered_list')}
      />
    );
  }

  if (activePage === 'unregistered_list') {
    return (
      <UnregisteredReportsList
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        unregisteredReports={unregisteredReports}
        onUpdateStatus={updateUnregisteredReportStatus}
        onNewReportClick={() => setActivePage('report_unregistered')}
        onOpenRegisterForm={() => setActivePage('forms')}
        isLoading={isLoading}
      />
    );
  }

  return null;
};
