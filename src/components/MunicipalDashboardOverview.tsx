import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { motion } from 'motion/react';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  OfficerAssignment,
  VerificationLog,
  UnregisteredVehicleReport,
  PaymentReceipt,
  SystemUser,
  SystemSettings,
} from '../types';
import {
  subscribeSystemUsers,
  subscribeSettings,
  DEFAULT_SETTINGS,
  getPermissionState,
  isTaskAllowed,
  isTaskViewable,
} from '../services/dbService';
import { getPaymentReceiptStatus } from '../utils/paymentUtils';
import { QRCodeCard } from './QRCodeCard';
import { SharedScannerModal } from './SharedScannerModal';
import { PermitStatusSummary } from './PermitStatusSummary';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SmartImage } from './SmartImage';
import { LoadingSpinner } from './ui/Skeleton';
import {
  FullscreenDocumentCarouselModal,
  buildRegistrationDocumentList,
  DocumentViewerItem,
} from './FullscreenDocumentCarouselModal';

interface MunicipalDashboardOverviewProps {
  userBadgeId: string;
  userRole: UserRole;
  lang: Language;
  registrations: MotorcycleRegistration[];
  officers: OfficerAssignment[];
  verificationLogs?: VerificationLog[];
  unregisteredReports?: UnregisteredVehicleReport[];
  paymentReceipts?: PaymentReceipt[];
  onQuickAction?: (actionKey: string) => void;
  onAddVerificationLog?: (log: VerificationLog) => void;
  isLoading?: boolean;
}

export const MunicipalDashboardOverview: React.FC<MunicipalDashboardOverviewProps> = ({
  userBadgeId,
  userRole,
  lang,
  registrations,
  officers,
  verificationLogs = [],
  unregisteredReports = [],
  paymentReceipts = [],
  onQuickAction,
  onAddVerificationLog,
  isLoading = false,
}) => {
  const isAmharic = lang === 'am';

  // Subscribe to system users list for superadmin KPIs
  const [users, setUsers] = useState<SystemUser[]>([]);
  useEffect(() => {
    const unsub = subscribeSystemUsers((data) => setUsers(data || []));
    return () => unsub();
  }, []);

  // Subscribe to system settings for role-based visibility toggles
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    const unsub = subscribeSettings((data) => {
      if (data) setSettings(data);
    });
    return () => unsub();
  }, []);

  // State for Instant Plate / QR Inspector Search on Dashboard
  const [searchPlate, setSearchPlate] = useState('');
  const [selectedRegForModal, setSelectedRegForModal] = useState<MotorcycleRegistration | null>(null);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<VerificationLog | null>(null);
  const [carouselModal, setCarouselModal] = useState<{
    items: DocumentViewerItem[];
    initialIndex: number;
  } | null>(null);

  const openDocumentCarousel = (targetUrl: string, log?: VerificationLog) => {
    if (!targetUrl) return;
    const matchingReg = log ? registrations.find((r) => r.plateNumber === log.plateNumber) : null;
    let docs: DocumentViewerItem[] = [];
    if (matchingReg) {
      docs = buildRegistrationDocumentList(matchingReg, lang);
    } else if (log) {
      if (log.userPortraitPhoto) {
        docs.push({ url: log.userPortraitPhoto, title: `${log.fullName} — ${isAmharic ? 'የባለቤት ፎቶ' : 'Driver Portrait'}` });
      }
      if (log.nationalIdPhoto) {
        docs.push({ url: log.nationalIdPhoto, title: `${log.fullName} — ${isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}` });
      }
      if (log.drivingLicensePhoto) {
        docs.push({ url: log.drivingLicensePhoto, title: `${log.fullName} — ${isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}` });
      }
      if (log.drivingPermitPhoto) {
        docs.push({ url: log.drivingPermitPhoto, title: `${log.fullName} — ${isAmharic ? 'የመንቀሳቀሻ ፈቃድ' : 'Police Permit'}` });
      }
    }
    const foundIdx = docs.findIndex((d) => d.url === targetUrl);
    if (foundIdx >= 0) {
      setCarouselModal({
        items: docs,
        initialIndex: foundIdx,
      });
    } else {
      setCarouselModal({
        items: [{ url: targetUrl, title: isAmharic ? 'ሰነድ' : 'Document' }, ...docs],
        initialIndex: 0,
      });
    }
  };

  // Match current officer assignment details
  const currentOfficerAssigned = officers.find(
    (o) => o.badgeId.toLowerCase() === userBadgeId.toLowerCase() || o.officerName.toLowerCase().includes(userBadgeId.toLowerCase())
  );

  const activeCheckpointLocation = (currentOfficerAssigned?.assignedSubcity || currentOfficerAssigned?.subCity)
    ? `${currentOfficerAssigned?.assignedSubcity || currentOfficerAssigned?.subCity} Checkpoint`
    : 'Central Subcity Patrol Checkpoint Alpha';

  // Role-specific scoped registrations for Dashboard KPIs (hidden records excluded except for Super Admin)
  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';
  const scopedRegs = React.useMemo(() => {
    let list = registrations;
    if (!isSuperAdmin) {
      list = list.filter((r) => !r.hideFromOtherUsers);
    }
    if (userRole === 'clerk') {
      const clerkBadge = (userBadgeId || '').trim().toLowerCase();
      return list.filter((r) => {
        const regBy = (r.registeredBy || '').trim().toLowerCase();
        return regBy === clerkBadge || (clerkBadge && regBy.includes(clerkBadge)) || (!r.registeredBy && clerkBadge === 'clerk-001');
      });
    }
    return list;
  }, [registrations, isSuperAdmin, userRole, userBadgeId]);

  // Scoped payment receipts matching member records and user role permissions
  const scopedPaymentReceipts = React.useMemo(() => {
    if (userRole === 'clerk') {
      const clerkBadge = (userBadgeId || '').trim().toLowerCase();
      const scopedRegIds = new Set(scopedRegs.map((r) => (r.id || '').trim().toLowerCase()));
      const scopedPlates = new Set(scopedRegs.map((r) => (r.plateNumber || '').trim().toLowerCase()).filter(Boolean));

      return paymentReceipts.filter((rc) => {
        const rcEntered = (rc.enteredBy || '').trim().toLowerCase();
        if (rcEntered === clerkBadge || (clerkBadge && rcEntered.includes(clerkBadge))) return true;
        const rcRegId = (rc.ownerRegistrationId || '').trim().toLowerCase();
        if (rcRegId && scopedRegIds.has(rcRegId)) return true;
        const rcPlate = (rc.plateNumber || '').trim().toLowerCase();
        if (rcPlate && scopedPlates.has(rcPlate)) return true;
        return false;
      });
    }
    return paymentReceipts;
  }, [paymentReceipts, scopedRegs, userRole, userBadgeId]);

  // Payment Expiration Metrics calculation derived from scoped receipts
  const paymentMetrics = React.useMemo(() => {
    let total = scopedPaymentReceipts.length;
    let activeCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;

    scopedPaymentReceipts.forEach((rc) => {
      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      if (status === 'active') activeCount++;
      else if (status === 'expiring_soon') expiringSoonCount++;
      else if (status === 'expired') expiredCount++;
    });

    return { total, activeCount, expiringSoonCount, expiredCount };
  }, [scopedPaymentReceipts]);

  // Verification logs for dashboard metrics:
  // - Only logs associated with hidden vehicles are excluded for non-superadmins
  // - All other verification logs are visible across all management and officer dashboards
  const scopedVerificationLogs = React.useMemo(() => {
    let list = verificationLogs;
    if (!isSuperAdmin) {
      list = list.filter((log) => {
        const isHidden = registrations.some((r) => r.hideFromOtherUsers && (
          (r.plateNumber && r.plateNumber.trim() !== '' && r.plateNumber.toLowerCase() === log.plateNumber?.toLowerCase()) ||
          (r.engineOrSerialNo && r.engineOrSerialNo.trim() !== '' && r.engineOrSerialNo.toLowerCase() === log.engineOrSerialNo?.toLowerCase()) ||
          r.id === log.id
        ));
        return !isHidden;
      });
    }
    return list;
  }, [verificationLogs, registrations, userRole]);

  const pendingCount = scopedRegs.filter((r) => r.status === 'pending_approval').length;
  const approvedCount = scopedRegs.filter(
    (r) => r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print'
  ).length;
  const illegalVehiclesCount = scopedRegs.filter((r) => r.status === 'rejected').length;
  const activeOfficersCount = officers.filter((o) => o.status === 'active').length;

  const todayStr = new Date().toISOString().split('T')[0];
  const todaySubmissionsCount = scopedRegs.filter(
    (r) => (r.registrationDate || '').split(' ')[0] === todayStr
  ).length;

  const totalLogsCount = scopedVerificationLogs.length;
  const verifiedLogsCount = scopedVerificationLogs.filter((l) => l.verificationStatus === 'verified').length;
  const warningLogsCount = scopedVerificationLogs.filter(
    (l) => l.verificationStatus === 'warning' || l.verificationStatus === 'flagged'
  ).length;

  // Search match for live dashboard plate lookup
  const livePlateSearchMatch = searchPlate.trim()
    ? registrations.find(
        (r) =>
          (r.plateNumber || '').toLowerCase().includes(searchPlate.trim().toLowerCase()) ||
          (r.fullName || '').toLowerCase().includes(searchPlate.trim().toLowerCase()) ||
          (r.engineOrSerialNo || '').toLowerCase().includes(searchPlate.trim().toLowerCase())
      )
    : null;

  // Dynamic role-based Quick Action Shortcuts configuration
  const getRoleQuickActions = () => {
    switch (userRole) {
      case 'clerk': {
        const clerkActions: Array<{
          key: string;
          title: string;
          subtitle: string;
          icon: string;
          badge: string;
          iconBg: string;
        }> = [];

        // 1. New Registration Quick Action
        if ((settings.showClerkNewRegistrationAction ?? true) && isTaskAllowed('clerk', 1)) {
          clerkActions.push({
            key: 'new_registration',
            title: isAmharic ? 'አዲስ ምዝገባ' : 'New Registration',
            subtitle: isAmharic ? 'የባለቤትና ሞተር ቅጽ' : 'Register Motor & Owner',
            icon: 'how_to_reg',
            badge: isAmharic ? 'ቅጽ' : 'Form',
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        // 2. Submission Correction Quick Action
        if ((settings.showClerkEditSubmissionAction ?? true) && isTaskAllowed('clerk', 2)) {
          clerkActions.push({
            key: 'today_submissions_adjust',
            title: isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction',
            subtitle: isAmharic ? 'የዛሬ ማመልከቻዎችን ማረም' : 'Edit today submissions',
            icon: 'edit_note',
            badge: `${todaySubmissionsCount} ${isAmharic ? 'የዛሬ' : 'Today'}`,
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        // 3. Scan QR Code Quick Action
        if ((settings.showClerkQrScanAction ?? true) && isTaskAllowed('clerk', 5)) {
          clerkActions.push({
            key: 'quick_verify',
            title: isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code',
            subtitle: isAmharic ? 'በካሜራ ፈቃድ አረጋግጥ' : 'Instant camera verify',
            icon: 'qr_code_scanner',
            badge: isAmharic ? 'ፍተሻ' : 'Scanner',
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        // 4. Payment Receipts Entry Quick Action
        if ((settings.showClerkPaymentReceiptsAction ?? true) && (isTaskAllowed('clerk', 15) || isTaskAllowed('clerk', 16))) {
          clerkActions.push({
            key: 'payment_receipts',
            title: isAmharic ? 'የክፍያ ደረሰኝ መዝግብ' : 'Add Payment Receipts',
            subtitle: isAmharic ? 'የ1 ወር ክፍያ ደረሰኝ ማስገቢያ ቅጽ' : 'Open receipt entry form',
            icon: 'receipt_long',
            badge: isAmharic ? 'አዲስ' : 'New Form',
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        // 5. View Submissions Quick Action
        if (settings.showClerkSubmissionsAction && isTaskViewable('clerk', 8)) {
          clerkActions.push({
            key: 'view_submissions',
            title: isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions',
            subtitle: `${registrations.length} ${isAmharic ? 'ጠቅላላ መዝገቦች' : 'total records'}`,
            icon: 'folder_open',
            badge: `${registrations.length} ${isAmharic ? 'መዝገቦች' : 'Total'}`,
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        // 6. Approved Motor Registry Quick Action
        if (settings.showClerkApprovedVehiclesAction && isTaskViewable('clerk', 8)) {
          clerkActions.push({
            key: 'approved_vehicles',
            title: isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Motor Registry',
            subtitle: `${approvedCount} ${isAmharic ? 'የፀደቁ' : 'approved permits'}`,
            icon: 'verified',
            badge: `${approvedCount} ${isAmharic ? 'የጸደቁ' : 'Valid'}`,
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        return {
          title: isAmharic ? 'የፀሀፊ ፈጣን አቋራጮች' : 'Clerk Quick Actions',
          headerIcon: 'badge',
          actions: clerkActions,
        };
      }

      case 'admin':
        return {
          title: isAmharic ? 'የአስተዳዳሪ የስራ አቋራጮች' : 'Manager Operations',
          headerIcon: 'shield_person',
          actions: [
            {
              key: 'pending_approvals',
              title: isAmharic ? 'የአባልነት ማመልከቻዎች' : 'Pending Approvals Queue',
              subtitle: `${pendingCount} ${isAmharic ? 'ውሳኔ የሚጠብቁ' : 'awaiting decision'}`,
              icon: 'pending_actions',
              badge: `${pendingCount} ${isAmharic ? 'ይጠብቃሉ' : 'Pending'}`,
              iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            },
            {
              key: 'vehicle_directory',
              title: isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Member Records Database',
              subtitle: `${registrations.length} ${isAmharic ? 'ጠቅላላ ማህደሮች' : 'system records'}`,
              icon: 'two_wheeler',
              badge: `${registrations.length} ${isAmharic ? 'ተሽከርካሪዎች' : 'Motors'}`,
              iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            },
            {
              key: 'inspection_report_full',
              title: isAmharic ? 'የፍተሻ ሪፖርቶችና ታሪክ' : 'Verification Logs & History',
              subtitle: `${scopedVerificationLogs.length} ${isAmharic ? 'የተደረጉ ፍተሻዎች' : 'recorded scans'}`,
              icon: 'analytics',
              badge: `${scopedVerificationLogs.length} ${isAmharic ? 'ሪፖርቶች' : 'Logs'}`,
              iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            },
            {
              key: 'unregistered_list',
              title: isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry',
              subtitle: `${unregisteredReports.length} ${isAmharic ? 'ሪፖርቶች' : 'incidents logged'}`,
              icon: 'no_drinks',
              badge: `${unregisteredReports.length} ${isAmharic ? 'ሪፖርቶች' : 'Reports'}`,
              iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            },
            {
              key: 'quick_verify',
              title: isAmharic ? 'የኪውአር ኮድ መፈተሻ' : 'QR Code Scanner',
              subtitle: isAmharic ? 'የፍቃድ ካሜራ ፍተሻ' : 'Mobile camera lookup',
              icon: 'qr_code_scanner',
              badge: isAmharic ? 'ፍተሻ' : 'Scanner',
              iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            },
          ],
        };

      case 'officer': {
        const officerActions = [
          {
            key: 'report_unregistered',
            title: isAmharic ? 'ባልተመዘገበ ተሽከርካሪ ሪፖርት' : 'Report Unregistered Vehicle',
            subtitle: isAmharic ? 'ያልተመዘገቡ ተሽከርካሪዎችን ለመመዝገብ' : 'Log unpermitted motor incident',
            icon: 'report_problem',
            badge: isAmharic ? 'አዲስ ሪፖርት' : 'New Report',
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          },
        ];

        // Include Inspection Report Logs ONLY if RBAC Task 10 is not denied
        if (getPermissionState(userRole, 10) !== 'deny') {
          officerActions.push({
            key: 'inspection_report',
            title: isAmharic ? 'የፍተሻ ሪፖርትና ታሪክ' : 'Inspection Report Logs',
            subtitle: `${scopedVerificationLogs.length} ${isAmharic ? 'የተደረጉ ፍተሻዎች' : 'scans recorded'}`,
            icon: 'analytics',
            badge: `${scopedVerificationLogs.length} ${isAmharic ? 'ፍተሻዎች' : 'Logs'}`,
            iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          });
        }

        return {
          title: isAmharic ? 'የተቆጣጣሪ የመስክ አቋራጮች' : 'Field Officer Patrol Shortcuts',
          headerIcon: 'policy',
          actions: officerActions,
        };
      }

      default:
        return {
          title: isAmharic ? 'የቅጽበታዊ ስራዎች አቋራጭ' : 'Quick Action Shortcuts',
          headerIcon: 'bolt',
          actions: [],
        };
    }
  };

  const currentRoleConfig = getRoleQuickActions();

  const handleActionClick = (actionKey: string) => {
    if (onQuickAction) {
      onQuickAction(actionKey);
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* BIG HERO SCAN QR CODE BUTTON FOR TRAFFIC OFFICER */}
      {userRole === 'officer' && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-6 sm:p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-full pb-3 border-b border-outline-variant/50 text-center">
            <span className="text-xs sm:text-sm font-extrabold text-on-surface tracking-wide uppercase">
              {isAmharic ? 'የሞተር ፈቃድ ኪውአር ኮድ ፍተሻ' : 'Motorcycle Permit QR Code Inspection'}
            </span>
          </div>

          <div
            onClick={() => handleActionClick('quick_verify')}
            className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center shadow-md group cursor-pointer hover:bg-blue-500/20 active:scale-95 touch-manipulation transition-all duration-300"
          >
            <Icon className="material-symbols-outlined text-[42px] sm:text-[48px] text-slate-700 group-hover:scale-110 transition-transform duration-300">
              qr_code_scanner
            </Icon>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-black text-on-surface mb-1">
              {isAmharic ? 'የQR ኮድ ፍተሻ ማዕከል' : 'QR Permit Inspection Center'}
            </h2>
            <p className="text-xs text-secondary font-medium max-w-sm">
              {isAmharic
                ? 'የሞተረኞችን የፈቃድ መታወቂያ ወይም የሞተር ተለጣፊ ትክክለኛነት በካሜራ ለማረጋገጥ ከታች ያለውን ሰማያዊ ቁልፍ ይጫኑ'
                : 'Tap the blue button below or click the scanner ring to verify rider permit IDs or stickers.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleActionClick('quick_verify')}
            className="w-full max-w-xs min-h-[48px] py-3.5 px-6 rounded-lg bg-[#0f172a] hover:bg-slate-800 active:scale-95 touch-manipulation transition-all font-black text-xs sm:text-sm text-white tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[22px]">photo_camera</Icon>
            <span>{isAmharic ? 'ፍተሻ ጀምር' : 'Launch QR Scanner'}</span>
          </button>
        </div>
      )}
            {/* ==================== UNIFIED OVERVIEW CONTAINER ==================== */}
      <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-xs overflow-hidden mb-6">
        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 px-4 sm:px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">
          <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">dashboard</Icon>
          <h2 className="font-black text-sm sm:text-base text-on-surface uppercase tracking-wider">
            {isAmharic ? 'አጠቃላይ እይታ' : 'Overview'}
          </h2>
        </div>
        <div className="flex flex-col divide-y divide-outline-variant/60 dark:divide-slate-800">

      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}
      {userRole === 'superadmin' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5">
            <div className="flex items-center gap-2.5">
              <Icon className="material-symbols-outlined text-[22px] text-amber-600 shrink-0">admin_panel_settings</Icon>
              <div>
                <h3 className="text-sm sm:text-base font-black text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'የበላይ አስተዳዳሪ ቁጥጥር ማዕከል' : 'Super Admin Governance Metrics'}
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-3">
            {/* Total Users */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:shadow-md active:scale-105 active:bg-slate-700/20 dark:active:bg-blue-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
            >
              <div className="flex justify-between items-center text-slate-700 dark:text-blue-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-slate-700">
                  {isAmharic ? 'ተጠቃሚዎች' : 'Users'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">group</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{users.length}</p>
            </div>

            {/* Super Admins & Admins */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:shadow-md active:scale-105 active:bg-purple-600/20 dark:active:bg-purple-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
            >
              <div className="flex justify-between items-center text-purple-600 dark:text-purple-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-purple-600">
                  {isAmharic ? 'አስተዳዳሪዎች' : 'Admins'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">shield_person</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">
                {users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length}
              </p>
            </div>

            {/* Blocked Users */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2 sm:p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:shadow-md active:scale-105 active:bg-rose-600/20 dark:active:bg-rose-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
            >
              <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-rose-600">
                  {isAmharic ? 'የታገዱ' : 'Blocked'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">person_off</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">
                {users.filter((u) => u.status === 'disabled').length}
              </p>
            </div>

            {/* Registrations Total */}
            <div
              onClick={() => onQuickAction && onQuickAction('approved_vehicles')}
              className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:shadow-md active:scale-105 active:bg-teal-600/20 dark:active:bg-teal-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
            >
              <div className="flex justify-between items-center text-teal-600 dark:text-teal-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-teal-600">
                  {isAmharic ? 'ፈቃዶች' : 'Permits'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">two_wheeler</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{registrations.length}</p>
            </div>

            {/* Pending Approvals */}
            <div
              onClick={() => onQuickAction && onQuickAction('pending_approvals')}
              className="p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:shadow-md active:scale-105 active:bg-amber-600/20 dark:active:bg-amber-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
            >
              <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-amber-600">
                  {isAmharic ? 'የሚጠብቁ' : 'Pending'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">pending_actions</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">
                {registrations.filter((r) => r.status === 'pending_approval').length}
              </p>
            </div>

            {/* System Security Score */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2 sm:p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:shadow-md active:scale-105 active:bg-emerald-600/20 dark:active:bg-emerald-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
            >
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-emerald-600">
                  {isAmharic ? 'ደህንነት' : 'Security'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">security</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">99.9%</p>
            </div>
          </div>
        </div>
      )}

      {/* Inline QR Scanner (In-Page instead of Modal) */}
      {showLookupModal && (
        <div className="p-4 sm:p-5 space-y-3 animate-in slide-in-from-top-4 duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-outline-variant/60">
            <div className="flex items-center gap-2">
              <Icon className="material-symbols-outlined text-primary text-[22px]">qr_code_scanner</Icon>
              <h3 className="font-extrabold text-sm text-on-surface">
                {isAmharic ? 'የቀጥታ QR እና ሰሌዳ መለያ ፍተሻ' : 'Live QR & License Plate Scanner'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowLookupModal(false)}
              className="text-secondary hover:text-on-surface p-1 rounded-lg hover:bg-surface-container text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Icon className="material-symbols-outlined text-[18px]">close</Icon>
              <span>{isAmharic ? 'ዝጋ' : 'Close Scanner'}</span>
            </button>
          </div>
          <SharedScannerModal
            isOpen={true}
            onClose={() => setShowLookupModal(false)}
            lang={lang}
            registrations={registrations}
            userBadgeId={userBadgeId || 'OFF-8842'}
            onAddVerificationLog={onAddVerificationLog || (() => {})}
            isPage={true}
          />
        </div>
      )}

      {/* CLERK STATS OVERVIEW CARDS (ONLY VISIBLE WHEN TOGGLED ON IN SUPER ADMIN) */}
      {userRole === 'clerk' && settings.showClerkPermitStatus && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5">
            <div className="flex items-center gap-2.5">
              <Icon className="material-symbols-outlined text-[22px] text-slate-700 shrink-0">badge</Icon>
              <div>
                <h3 className="text-sm sm:text-base font-black text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'የምዝገባ መረጃዎች' : 'Clerk Intake Dashboard Metrics'}
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            <button
              onClick={() => onQuickAction && onQuickAction('view_submissions')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:shadow-md active:scale-105 active:bg-slate-700/20 dark:active:bg-blue-500/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-slate-700 dark:text-blue-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'ጠቅላላ የቀረቡ' : 'Submitted'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">folder_open</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{registrations.length}</p>
            </button>

            <button
              onClick={() => onQuickAction && onQuickAction('kpi_pending')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:shadow-md active:scale-105 active:bg-amber-600/20 dark:active:bg-amber-500/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'የሚጠበቁ' : 'Review'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">pending</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{pendingCount}</p>
            </button>

            <button
              onClick={() => onQuickAction && onQuickAction('kpi_approved')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:shadow-md active:scale-105 active:bg-emerald-600/20 dark:active:bg-emerald-500/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30 min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'የጸደቁ' : 'Approved'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">verified</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{approvedCount}</p>
            </button>

            <button
              onClick={() => onQuickAction && onQuickAction('kpi_expired')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:shadow-md active:scale-105 active:bg-rose-600/20 dark:active:bg-rose-500/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/30 min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'ውድቅ' : 'Rejected'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">cancel</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{illegalVehiclesCount}</p>
            </button>
          </div>
        </div>
      )}

      {/* ==================== STANDALONE METRIC SECTIONS (FOR SUPER ADMIN & MANAGER) ==================== */}
      {(userRole === 'superadmin' || userRole === 'admin') && (
        <>
          {/* 1. Payment Receipts & Compliance Metrics (Super Admin Only) */}
          {(userRole === 'superadmin' || (userRole as string) === 'super_admin') && (
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">payments</Icon>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-on-surface dark:text-white uppercase tracking-wider">
                      {isAmharic ? 'የገቢዎችና ደረሰኞች ቁጥጥር' : 'Revenue Ledger & Compliance'}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
                {/* Total Receipts */}
                <div
                  onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                  className="p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:shadow-md active:scale-105 active:bg-slate-700/20 dark:active:bg-blue-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
                >
                  <div className="flex justify-between items-center text-slate-700 dark:text-blue-400 mb-1">
                    <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-slate-700">
                      {isAmharic ? 'ጠቅላላ ደረሰኞች' : 'Total Receipts'}
                    </span>
                    <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">receipt</Icon>
                  </div>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{paymentMetrics.total}</p>
                </div>

                {/* Active Valid (1 month) */}
                <div
                  onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                  className="p-2 sm:p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:shadow-md active:scale-105 active:bg-emerald-600/20 dark:active:bg-emerald-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
                >
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 mb-1">
                    <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-emerald-600">
                      {isAmharic ? 'ትክክለኛ' : 'Valid'}
                    </span>
                    <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">verified</Icon>
                  </div>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">
                    {paymentMetrics.activeCount}
                  </p>
                </div>

                {/* Expiring Soon */}
                <div
                  onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                  className="p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:shadow-md active:scale-105 active:bg-amber-600/20 dark:active:bg-amber-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
                >
                  <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 mb-1">
                    <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-amber-600">
                      {isAmharic ? 'ሊያልቅ የደረሰ' : 'Expiring'}
                    </span>
                    <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">alarm</Icon>
                  </div>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">
                    {paymentMetrics.expiringSoonCount}
                  </p>
                </div>

                {/* Expired */}
                <div
                  onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                  className="p-2 sm:p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:shadow-md active:scale-105 active:bg-rose-600/20 dark:active:bg-rose-500/30 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
                >
                  <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 mb-1">
                    <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate group-hover:text-rose-600">
                      {isAmharic ? 'ያለፈበት' : 'Expired'}
                    </span>
                    <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0 group-hover:scale-110 transition-transform">cancel</Icon>
                  </div>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">
                    {paymentMetrics.expiredCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. Permit Status Breakdown */}
          <PermitStatusSummary
            registrations={registrations}
            lang={lang}
            isLoading={isLoading}
            borderless={true}
            onSelectStatusFilter={(statusKey) => {
              if (onQuickAction) {
                if (statusKey === 'pending_approval') {
                  onQuickAction('kpi_pending');
                } else if (statusKey === 'approved') {
                  onQuickAction('kpi_approved');
                } else if (statusKey === 'rejected') {
                  onQuickAction('kpi_expired');
                } else {
                  onQuickAction('system_records');
                }
              }
            }}
          />

          {/* 3. Field Officer Patrol & Inspection Hub */}
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5">
              <div className="flex items-center gap-2.5">
                <Icon className="material-symbols-outlined text-[22px] text-slate-700 shrink-0">policy</Icon>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-on-surface dark:text-white uppercase tracking-wider">
                    {isAmharic ? 'የመስክ ቁጥጥርና ፍተሻ ማዕከል' : 'Patrol & Inspection Hub'}
                  </h3>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
              <button
                type="button"
                onClick={() => onQuickAction && onQuickAction('officer_logs_today')}
                className="w-full text-left p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-500/40 group min-w-0 overflow-hidden"
              >
                <div className="flex justify-between items-center text-slate-700 dark:text-blue-400 mb-1">
                  <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                    {isAmharic ? 'የዛሬ ፍተሻዎች' : 'Verifications'}
                  </span>
                  <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">verified</Icon>
                </div>
                <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{totalLogsCount}</p>
              </button>

              <button
                type="button"
                onClick={() => onQuickAction && onQuickAction('approved_vehicles')}
                className="w-full text-left p-2 sm:p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500/40 group min-w-0 overflow-hidden"
              >
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 mb-1">
                  <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                    {isAmharic ? 'የፀደቁ' : 'Valid'}
                  </span>
                  <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">two_wheeler</Icon>
                </div>
                <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{approvedCount}</p>
              </button>

              <button
                type="button"
                onClick={() => onQuickAction && onQuickAction('officer_logs_warning')}
                className="w-full text-left p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/40 group min-w-0 overflow-hidden"
              >
                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 mb-1">
                  <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                    {isAmharic ? 'ማስጠንቀቂያ' : 'Warnings'}
                  </span>
                  <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">warning</Icon>
                </div>
                <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{warningLogsCount}</p>
              </button>

              <button
                type="button"
                onClick={() => onQuickAction && onQuickAction('kpi_expired')}
                className="w-full text-left p-2 sm:p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-rose-500/40 group min-w-0 overflow-hidden"
              >
                <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 mb-1">
                  <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                    {isAmharic ? 'ሕገ-ወጥ' : 'Illegal'}
                  </span>
                  <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">block</Icon>
                </div>
                <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{illegalVehiclesCount}</p>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}
      {userRole === 'officer' && getPermissionState(userRole, 10) !== 'deny' && (
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5">
            <div className="flex items-center gap-2.5">
              <Icon className="material-symbols-outlined text-[22px] text-slate-700 shrink-0">policy</Icon>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'የተቆጣጣሪ የመስክ መቆጣጠሪያ ማዕከል' : 'Field Officer Patrol & Inspection Hub'}
                </h2>
              </div>
            </div>
          </div>

          {/* Officer Key Metrics Cards Grid */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('officer_logs_today')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-500/40 group min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-slate-700 dark:text-blue-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'የዛሬ ፍተሻዎች' : 'Verifications'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">verified</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{totalLogsCount}</p>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('approved_vehicles')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500/40 group min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'የፀደቁ' : 'Valid'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">two_wheeler</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{approvedCount}</p>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('officer_logs_warning')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/40 group min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'ማስጠንቀቂያ' : 'Warnings'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">warning</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{warningLogsCount}</p>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('kpi_expired')}
              className="w-full text-left p-2 sm:p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-rose-500/40 group min-w-0 overflow-hidden"
            >
              <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 mb-1">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-tight text-on-surface truncate">
                  {isAmharic ? 'ሕገ-ወጥ' : 'Illegal'}
                </span>
                <Icon className="material-symbols-outlined text-[15px] sm:text-[18px] shrink-0">block</Icon>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-700 dark:text-slate-300 tracking-tight leading-tight">{illegalVehiclesCount}</p>
            </button>
          </div>
        </div>
      )}

              </div>
      </div>

      {/* ==================== QUICK ACTION SHORTCUTS ==================== */}
      {currentRoleConfig.actions.length > 0 && (
        <div className="p-4 sm:p-6 bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <div className="flex items-center gap-3">
              <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">{currentRoleConfig.headerIcon}</Icon>
              <h3 className="text-sm sm:text-base font-extrabold text-on-surface">
                {currentRoleConfig.title}
              </h3>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${currentRoleConfig.actions.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3 sm:gap-4`}>
            {currentRoleConfig.actions.map((act) => (
              <button
                key={act.key}
                type="button"
                onClick={() => handleActionClick(act.key)}
                className="min-h-[56px] p-4 bg-surface-container-low/70 hover:bg-surface-container border border-outline-variant/60 rounded-xl text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group shadow-2xs hover:shadow-xs active:scale-98"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-xl ${act.iconBg} flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
                    <Icon className="material-symbols-outlined text-[22px]">{act.icon}</Icon>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-on-surface group-hover:text-primary transition-colors truncate">
                      {act.title}
                    </h4>
                    <p className="text-xs text-secondary mt-0.5 truncate font-medium">
                      {act.subtitle}
                    </p>
                  </div>
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-secondary group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0">
                  <Icon className="material-symbols-outlined text-[20px]">
                    chevron_right
                  </Icon>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RECENT FIELD VERIFICATIONS FEED FOR OFFICER DASHBOARD */}
      {((userRole === 'officer' && getPermissionState(userRole, 10) !== 'deny') || userRole === 'admin' || userRole === 'superadmin') && (
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex justify-between items-center border-b border-outline-variant pb-2.5">
            <div className="flex items-center gap-2">
              <Icon className="material-symbols-outlined text-primary text-[20px]">history</Icon>
              <h3 className="text-sm sm:text-base font-bold text-on-surface uppercase tracking-wider">
                {isAmharic ? 'የቅርብ ጊዜ የመስክ ፍተሻዎች' : 'Recent Field Verifications'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('inspection_report_all')}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <span>{isAmharic ? 'ሁሉንም ታሪክ ይመልከቱ' : 'View Full Verification Logs'}</span>
              <Icon className="material-symbols-outlined text-[14px]">arrow_forward</Icon>
            </button>
          </div>

          {scopedVerificationLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-secondary space-y-1">
              <p className="font-bold">{isAmharic ? 'ምንም የማረጋገጫ ታሪክ አልተመዘገበም' : 'No verification logs recorded yet.'}</p>
              <p className="text-[11px]">
                {isAmharic ? 'የሞባይል ካሜራ በመጠቀም QR ፍቃድ ይፈትሹ።' : 'Use the camera scanner or instant plate search to log new verifications.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {scopedVerificationLogs.slice(0, 4).map((log) => (
                <div
                  key={log.id}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-surface-container-low/50 transition-colors px-1"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shrink-0 shadow-2xs ${
                      log.verificationStatus === 'verified'
                        ? 'bg-emerald-600'
                        : 'bg-amber-600'
                    }`}>
                      <Icon className="material-symbols-outlined text-[18px]">
                        {log.verificationStatus === 'verified' ? 'verified' : 'warning'}
                      </Icon>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-primary">{log.plateNumber}</span>
                        <span className="font-medium text-xs text-on-surface">{log.fullName}</span>
                      </div>
                      <p className="text-[10px] text-secondary">
                        {log.officerNotes} • <span className="font-mono">{log.scannedAt}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                    <span className="text-[10px] text-secondary font-mono">
                      {log.officerBadgeId || userBadgeId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                        log.verificationStatus === 'verified'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {log.verificationStatus}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedLogForDetails(log)}
                      className="p-1 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container cursor-pointer"
                    >
                      <Icon className="material-symbols-outlined text-[16px]">visibility</Icon>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: INSPECT PERMIT CARD MODAL */}
      {selectedRegForModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto transition-all duration-200">
          <ZoomableDocumentContainer
            lang={lang}
            userRole={userRole}
            title={isAmharic ? 'የሞተርሳይክል ፍቃድ ካርድ ቅድመ-እይታ' : 'Permit Card Inspection'}
            onClose={() => setSelectedRegForModal(null)}
          >
            <QRCodeCard registration={selectedRegForModal} lang={lang} />
          </ZoomableDocumentContainer>
        </div>
      )}

      {/* MODAL: INSPECT LOG DETAILS DIGITAL ID CARD */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto transition-all duration-200">
          <ZoomableDocumentContainer
            lang={lang}
            userRole={userRole}
            title={isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር መታወቂያ' : 'Bahirdar Motorist Association ID'}
            onClose={() => setSelectedLogForDetails(null)}
          >
            <QRCodeCard
              registration={
                registrations.find((r) => r.plateNumber === selectedLogForDetails.plateNumber) || {
                  id: selectedLogForDetails.id,
                  fullName: selectedLogForDetails.fullName,
                  phone: selectedLogForDetails.phone,
                  userPortraitPhoto: selectedLogForDetails.userPortraitPhoto,
                  nationalIdPhoto: selectedLogForDetails.nationalIdPhoto || '',
                  drivingLicensePhoto: selectedLogForDetails.drivingLicensePhoto || '',
                  drivingPermitPhoto: selectedLogForDetails.drivingPermitPhoto || '',
                  vehicleCategory: selectedLogForDetails.vehicleCategory,
                  engineOrSerialNo: selectedLogForDetails.engineOrSerialNo,
                  plateNumber: selectedLogForDetails.plateNumber,
                  registrationDate: selectedLogForDetails.scannedAt,
                  status: selectedLogForDetails.permitStatus,
                  qrCodeData: selectedLogForDetails.plateNumber,
                  registeredBy: selectedLogForDetails.officerBadgeId || userBadgeId,
                }
              }
              lang={lang}
            />
          </ZoomableDocumentContainer>
        </div>
      )}

      {/* 100% VIEWPORT FILLING CAROUSEL DOCUMENT ZOOM VIEWER */}
      {carouselModal && (
        <FullscreenDocumentCarouselModal
          items={carouselModal.items}
          initialIndex={carouselModal.initialIndex}
          lang={lang}
          onClose={() => setCarouselModal(null)}
        />
      )}
    </div>
  );
};
