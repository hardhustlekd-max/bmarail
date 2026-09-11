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
import { subscribeSystemUsers, subscribeSettings, DEFAULT_SETTINGS, getPermissionState } from '../services/dbService';
import { getPaymentReceiptStatus } from '../utils/paymentUtils';
import { QRCodeCard } from './QRCodeCard';
import { SharedScannerModal } from './SharedScannerModal';
import { PermitStatusSummary } from './PermitStatusSummary';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SmartImage } from './SmartImage';
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
  const [activeMetricsTab, setActiveMetricsTab] = useState<'payments' | 'permits' | 'patrol'>('payments');
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

  const activeCheckpointLocation = currentOfficerAssigned?.assignedSubcity
    ? `${currentOfficerAssigned.assignedSubcity} Checkpoint`
    : 'Central Subcity Patrol Checkpoint Alpha';

  // Role-specific scoped registrations for Dashboard KPIs (hidden records excluded except for Super Admin)
  const scopedRegs = React.useMemo(() => {
    let list = registrations;
    if (userRole !== 'superadmin' && userRole !== 'super_admin') {
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
  }, [registrations, userRole, userBadgeId]);

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
    if (userRole !== 'superadmin' && userRole !== 'super_admin') {
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
        }> = [
          {
            key: 'new_registration',
            title: isAmharic ? 'አዲስ ምዝገባ' : 'New Registration',
            subtitle: isAmharic ? 'የባለቤትና ሞተር ቅጽ' : 'Register Motor & Owner',
            icon: 'how_to_reg',
            badge: isAmharic ? 'ቅጽ' : 'Form',
            iconBg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
          },
          {
            key: 'today_submissions_adjust',
            title: isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction',
            subtitle: isAmharic ? 'የዛሬ ማመልከቻዎችን ማረም' : 'Edit today submissions',
            icon: 'edit_note',
            badge: `${todaySubmissionsCount} ${isAmharic ? 'የዛሬ' : 'Today'}`,
            iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
          },
          {
            key: 'quick_verify',
            title: isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code',
            subtitle: isAmharic ? 'በካሜራ ፈቃድ አረጋግጥ' : 'Instant camera verify',
            icon: 'qr_code_scanner',
            badge: isAmharic ? 'ፍተሻ' : 'Scanner',
            iconBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
          },
          {
            key: 'payment_receipts',
            title: isAmharic ? 'የክፍያ ደረሰኝ መዝግብ' : 'Add Payment Receipts',
            subtitle: isAmharic ? 'የ1 ወር ክፍያ ደረሰኝ ማስገቢያ ቅጽ' : 'Open receipt entry form',
            icon: 'receipt_long',
            badge: isAmharic ? 'አዲስ' : 'New Form',
            iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
          },
        ];

        // Only visible when toggle is ON in Super Admin
        if (settings.showClerkSubmissionsAction) {
          clerkActions.push({
            key: 'view_submissions',
            title: isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions',
            subtitle: `${registrations.length} ${isAmharic ? 'ጠቅላላ መዝገቦች' : 'total records'}`,
            icon: 'folder_open',
            badge: `${registrations.length} ${isAmharic ? 'መዝገቦች' : 'Total'}`,
            iconBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
          });
        }

        // Only visible when toggle is ON in Super Admin
        if (settings.showClerkApprovedVehiclesAction) {
          clerkActions.push({
            key: 'approved_vehicles',
            title: isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Motor Registry',
            subtitle: `${approvedCount} ${isAmharic ? 'የፀደቁ' : 'approved permits'}`,
            icon: 'verified',
            badge: `${approvedCount} ${isAmharic ? 'የጸደቁ' : 'Valid'}`,
            iconBg: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
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
              iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
            },
            {
              key: 'vehicle_directory',
              title: isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Member Records Database',
              subtitle: `${registrations.length} ${isAmharic ? 'ጠቅላላ ማህደሮች' : 'system records'}`,
              icon: 'two_wheeler',
              badge: `${registrations.length} ${isAmharic ? 'ተሽከርካሪዎች' : 'Motors'}`,
              iconBg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
            },
            {
              key: 'inspection_report_full',
              title: isAmharic ? 'የፍተሻ ሪፖርቶችና ታሪክ' : 'Verification Logs & History',
              subtitle: `${scopedVerificationLogs.length} ${isAmharic ? 'የተደረጉ ፍተሻዎች' : 'recorded scans'}`,
              icon: 'analytics',
              badge: `${scopedVerificationLogs.length} ${isAmharic ? 'ሪፖርቶች' : 'Logs'}`,
              iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
            },
            {
              key: 'unregistered_list',
              title: isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry',
              subtitle: `${unregisteredReports.length} ${isAmharic ? 'ሪፖርቶች' : 'incidents logged'}`,
              icon: 'no_drinks',
              badge: `${unregisteredReports.length} ${isAmharic ? 'ሪፖርቶች' : 'Reports'}`,
              iconBg: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
            },
            {
              key: 'quick_verify',
              title: isAmharic ? 'የኪውአር ኮድ መፈተሻ' : 'QR Code Scanner',
              subtitle: isAmharic ? 'የፍቃድ ካሜራ ፍተሻ' : 'Mobile camera lookup',
              icon: 'qr_code_scanner',
              badge: isAmharic ? 'ፍተሻ' : 'Scanner',
              iconBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
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
            iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
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
            iconBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
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



  return (
    <div className="space-y-4 sm:space-y-5">
      {/* PAGE HEADER (MATCHING TOP NAVBAR: ዋና ገፅ / Dashboard) */}
      <div className="p-3.5 sm:p-4 bg-surface-container-lowest border border-outline-variant/70 rounded-lg shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Icon className="material-symbols-outlined text-[20px]">space_dashboard</Icon>
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-on-surface">
              {isAmharic ? 'ዋና ገፅ' : 'Dashboard'}
            </h3>
            <p className="hidden sm:block text-[11px] font-normal text-secondary mt-0.5">
              {isAmharic
                ? 'የባህር ዳር ከተማ አስተዳደር የሞተር ሳይክል ፈቃድና ቁጥጥር አጠቃላይ ማጠቃለያ'
                : 'Bahir Dar City Administration Motorcycle Permit & Inspection Dashboard'}
            </p>
          </div>
        </div>
      </div>

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
            className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center shadow-md group cursor-pointer hover:bg-blue-500/20 transition-all duration-300"
          >
            <Icon className="material-symbols-outlined text-[68px] sm:text-[80px] text-blue-600 group-hover:scale-110 transition-transform duration-300">
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
            className="w-full max-w-xs py-3.5 px-6 rounded-lg bg-[#1D61E7] hover:bg-blue-700 transition-all font-black text-xs sm:text-sm text-white tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-md cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[22px]">photo_camera</Icon>
            <span>{isAmharic ? 'ፍተሻ ጀምር' : 'Launch QR Scanner'}</span>
          </button>
        </div>
      )}
      {/* SUPER ADMIN KEY GOVERNANCE STATS CARDS (FOR SUPERADMIN ROLE ON DASHBOARD ONLY) */}
      {userRole === 'superadmin' && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Icon className="material-symbols-outlined text-[20px]">admin_panel_settings</Icon>
              </div>
              <div>
                <h3 className="text-xs font-black text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'የበላይ አስተዳዳሪ ቁጥጥር ማዕከል' : 'Super Admin Governance Metrics'}
                </h3>
                <p className="text-[10px] text-secondary font-medium">
                  {isAmharic ? 'የስርዓቱ ተጠቃሚዎችና አጠቃላይ የፈቃድ ስታቲስቲክስ' : 'System user directories & global permit metrics overview'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {/* Total Users */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2.5 sm:p-3 rounded-lg border border-blue-200/80 dark:border-blue-800/50 bg-gradient-to-br from-blue-500/5 via-surface-container/30 to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group"
            >
              <div className="flex justify-between items-center text-blue-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ጠቅላላ ተጠቃሚዎች' : 'Total Users'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">group</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{users.length}</p>
            </div>

            {/* Super Admins & Admins */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2.5 sm:p-3 rounded-lg border border-purple-200/80 dark:border-purple-800/50 bg-gradient-to-br from-purple-500/5 via-surface-container/30 to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group"
            >
              <div className="flex justify-between items-center text-purple-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'አስተዳዳሪዎች' : 'Admins'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">shield_person</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">
                {users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length}
              </p>
            </div>

            {/* Blocked Users */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2.5 sm:p-3 rounded-lg border border-rose-200/80 dark:border-rose-800/50 bg-gradient-to-br from-rose-500/5 via-surface-container/30 to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group"
            >
              <div className="flex justify-between items-center text-rose-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'የታገዱ ተጠቃሚዎች' : 'Blocked Users'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">person_off</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-rose-600">
                {users.filter((u) => u.status === 'disabled').length}
              </p>
            </div>

            {/* Registrations Total */}
            <div
              onClick={() => onQuickAction && onQuickAction('approved_vehicles')}
              className="p-2.5 sm:p-3 rounded-lg border border-teal-200/80 dark:border-teal-800/50 bg-gradient-to-br from-teal-500/5 via-surface-container/30 to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group"
            >
              <div className="flex justify-between items-center text-teal-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ጠቅላላ ፈቃዶች' : 'Total Permits'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">two_wheeler</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{registrations.length}</p>
            </div>

            {/* Pending Approvals */}
            <div
              onClick={() => onQuickAction && onQuickAction('pending_approvals')}
              className="p-2.5 sm:p-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-500/5 via-surface-container/30 to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group"
            >
              <div className="flex justify-between items-center text-amber-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'የሚጠብቁ' : 'Pending'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">pending_actions</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-600">
                {registrations.filter((r) => r.status === 'pending_approval').length}
              </p>
            </div>

            {/* System Security Score */}
            <div
              onClick={() => onQuickAction && onQuickAction('superadmin_users')}
              className="p-2.5 sm:p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-500/5 via-surface-container/30 to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer group"
            >
              <div className="flex justify-between items-center text-emerald-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ደህንነት' : 'Security Status'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">security</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-600">99.9%</p>
            </div>
          </div>
        </div>
      )}

      {/* Inline QR Scanner (In-Page instead of Modal) */}
      {showLookupModal && (
        <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 shadow-sm space-y-3 animate-in slide-in-from-top-4 duration-200">
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
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center shrink-0">
                <Icon className="material-symbols-outlined text-[20px]">badge</Icon>
              </div>
              <div>
                <h3 className="text-xs font-black text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'የምዝገባ መረጃዎች' : 'Clerk Intake Dashboard Metrics'}
                </h3>
                <p className="text-[10px] text-secondary font-medium">
                  {isAmharic ? 'የተመዘገቡ ባለቤቶችና ተሽከርካሪዎች ሁኔታ' : 'Active motorcycle registration records status'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <button
              onClick={() => onQuickAction && onQuickAction('view_submissions')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-blue-200/80 dark:border-blue-800/50 bg-gradient-to-br from-blue-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-500/30"
            >
              <div className="flex justify-between items-center text-blue-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ጠቅላላ የቀረቡ' : 'Submitted Total'}
                </span>
                <Icon className="material-symbols-outlined text-[16px]">folder_open</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{registrations.length}</p>
            </button>

            <button
              onClick={() => onQuickAction && onQuickAction('kpi_pending')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/30"
            >
              <div className="flex justify-between items-center text-amber-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ማፅደቂያ የሚጠበቁ' : 'Awaiting Review'}
                </span>
                <Icon className="material-symbols-outlined text-[16px]">pending</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{pendingCount}</p>
            </button>

            <button
              onClick={() => onQuickAction && onQuickAction('kpi_approved')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500/30"
            >
              <div className="flex justify-between items-center text-emerald-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'የጸደቁ' : 'Approved Permits'}
                </span>
                <Icon className="material-symbols-outlined text-[16px]">verified</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{approvedCount}</p>
            </button>

            <button
              onClick={() => onQuickAction && onQuickAction('kpi_expired')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-red-200/80 dark:border-red-800/50 bg-gradient-to-br from-red-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-red-500/30"
            >
              <div className="flex justify-between items-center text-red-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ውድቅ የተደረጉ' : 'Rejected'}
                </span>
                <Icon className="material-symbols-outlined text-[16px]">cancel</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{illegalVehiclesCount}</p>
            </button>
          </div>
        </div>
      )}

      {/* ==================== METRIC SECTIONS TABBED CONTAINER (FOR SUPER ADMIN & MANAGER) ==================== */}
      {(userRole === 'superadmin' || userRole === 'admin') && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 dark:border-outline-variant/60 rounded-xl shadow-2xs overflow-hidden">
          {/* Clean Compact Tab Bar */}
          <div className="bg-surface-container/35 dark:bg-surface-container-high/20 border-b border-outline-variant/70 dark:border-outline-variant/60 flex items-center gap-1.5 p-2 flex-wrap">
            {[
              {
                id: 'payments' as const,
                label: isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts',
                count: paymentMetrics.total,
                badgeColor:
                  paymentMetrics.expiringSoonCount + paymentMetrics.expiredCount > 0
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-surface-container-highest text-secondary',
              },
              {
                id: 'permits' as const,
                label: isAmharic ? 'የአባላት አስተዳደር ሁኔታ' : 'Permit Status',
                count: registrations.length,
                badgeColor: 'bg-surface-container-highest text-secondary',
              },
              {
                id: 'patrol' as const,
                label: isAmharic ? 'የመስክ ቁጥጥር' : 'Patrol & Inspection',
                count: totalLogsCount,
                badgeColor: 'bg-surface-container-highest text-secondary',
              },
            ].map((tab) => {
              const isActive = activeMetricsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveMetricsTab(tab.id)}
                  className={`group relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold transition-all cursor-pointer whitespace-nowrap select-none rounded-md ${
                    isActive
                      ? 'bg-primary text-white font-extrabold shadow-2xs'
                      : 'bg-surface-container/60 hover:bg-surface-container text-secondary hover:text-on-surface border border-outline-variant/60 font-medium'
                  }`}
                >
                  <span className="tracking-tight">{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold transition-colors ${
                      isActive && tab.id === 'payments' && paymentMetrics.expiringSoonCount + paymentMetrics.expiredCount > 0
                        ? 'bg-amber-500/30 text-amber-200'
                        : isActive
                        ? 'bg-white/20 text-white'
                        : tab.badgeColor
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Merged Content Area */}
          <div className="p-4 sm:p-5">
            {/* TAB CONTENT: 1. Payment Receipts Metrics */}
            {activeMetricsTab === 'payments' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Icon className="material-symbols-outlined text-[20px]">payments</Icon>
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                        <span>{isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts'}</span>
                      </h3>
                      <p className="text-[10px] text-secondary font-medium">
                        {isAmharic ? 'የ1 ወር ክፍያ ደረሰኞች የጊዜ ገደብና አጠቃላይ ስታቲስቲክስ' : '1-month payment receipt status, validation & expiry tracking'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  {/* Total Receipts */}
                  <div
                    onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                    className="p-2.5 sm:p-3 rounded-lg border border-blue-200/80 dark:border-blue-800/50 bg-gradient-to-br from-blue-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center text-blue-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'ጠቅላላ ደረሰኞች' : 'Total Receipts'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px]">receipt</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-on-surface">{paymentMetrics.total}</p>
                  </div>

                  {/* Active Valid (1 month) */}
                  <div
                    onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                    className="p-2.5 sm:p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center text-emerald-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'ትክክለኛ (ህጋዊ)' : 'Active Valid'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px]">verified</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">
                      {paymentMetrics.activeCount}
                    </p>
                  </div>

                  {/* Expiring Soon */}
                  <div
                    onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                    className="p-2.5 sm:p-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center text-amber-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'ሊያልቅ የደረሰ' : 'Expiring Soon'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px] animate-pulse">alarm</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-400">
                      {paymentMetrics.expiringSoonCount}
                    </p>
                  </div>

                  {/* Expired */}
                  <div
                    onClick={() => onQuickAction && onQuickAction('payment_receipts')}
                    className="p-2.5 sm:p-3 rounded-lg border border-rose-200/80 dark:border-rose-800/50 bg-gradient-to-br from-rose-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center text-rose-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'ጊዜው ያለፈበት' : 'Expired'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px]">cancel</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-400">
                      {paymentMetrics.expiredCount}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 2. Permit Status Breakdown */}
            {activeMetricsTab === 'permits' && (
              <PermitStatusSummary
                registrations={registrations}
                lang={lang}
                borderless
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
            )}

            {/* TAB CONTENT: 3. Field Officer Patrol & Inspection Hub */}
            {activeMetricsTab === 'patrol' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <Icon className="material-symbols-outlined text-[20px]">policy</Icon>
                    </div>
                    <div>
                      <h2 className="font-black text-xs sm:text-sm text-on-surface uppercase tracking-wider">
                        {isAmharic ? 'የተቆጣጣሪ የመስክ መቆጣጠሪያ ማዕከል' : 'Field Officer Patrol & Inspection Hub'}
                      </h2>
                      <p className="text-[10px] text-secondary font-medium">
                        {isAmharic ? 'የአሁኑ የፓትሮል መረጃዎችና የፍተሻ ስታቲስቲክስ' : 'Real-time patrol and permit inspection metrics'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => onQuickAction && onQuickAction('officer_logs_today')}
                    className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-blue-200/80 dark:border-blue-800/50 bg-gradient-to-br from-blue-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-500/30 group"
                  >
                    <div className="flex justify-between items-center text-blue-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'የዛሬ ፍተሻዎች' : 'Verifications Today'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">verified</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-on-surface">{totalLogsCount}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onQuickAction && onQuickAction('approved_vehicles')}
                    className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500/30 group"
                  >
                    <div className="flex justify-between items-center text-emerald-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Valid Vehicles'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">two_wheeler</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-on-surface">{approvedCount}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onQuickAction && onQuickAction('officer_logs_warning')}
                    className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/30 group"
                  >
                    <div className="flex justify-between items-center text-amber-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'ማስጠንቀቂያ/ግጭት' : 'Warnings'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">warning</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-on-surface">{warningLogsCount}</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onQuickAction && onQuickAction('kpi_expired')}
                    className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-red-200/80 dark:border-red-800/50 bg-gradient-to-br from-red-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-red-500/30 group"
                  >
                    <div className="flex justify-between items-center text-red-600 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                        {isAmharic ? 'ሕገ-ወጥ ተሽከርካሪዎች' : 'Illegal Vehicles'}
                      </span>
                      <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">block</Icon>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-on-surface">{illegalVehiclesCount}</p>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== FIELD OFFICER PATROL HUB (FOR OFFICER ROLE ONLY) ==================== */}
      {userRole === 'officer' && getPermissionState(userRole, 10) !== 'deny' && (
        <div className="bg-surface-container-lowest border border-outline-variant/70 rounded-lg p-3 sm:p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center shrink-0">
                <Icon className="material-symbols-outlined text-[20px]">policy</Icon>
              </div>
              <div>
                <h2 className="font-black text-xs sm:text-sm text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'የተቆጣጣሪ የመስክ መቆጣጠሪያ ማዕከል' : 'Field Officer Patrol & Inspection Hub'}
                </h2>
                <p className="text-[10px] text-secondary font-medium">
                  {isAmharic ? 'የአሁኑ የፓትሮል መረጃዎችና የፍተሻ ስታቲስቲክስ' : 'Real-time patrol and permit inspection metrics'}
                </p>
              </div>
            </div>
          </div>

          {/* Officer Key Metrics Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('officer_logs_today')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-blue-200/80 dark:border-blue-800/50 bg-gradient-to-br from-blue-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-500/30 group"
            >
              <div className="flex justify-between items-center text-blue-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'የዛሬ ፍተሻዎች' : 'Verifications Today'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">verified</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{totalLogsCount}</p>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('approved_vehicles')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500/30 group"
            >
              <div className="flex justify-between items-center text-emerald-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Valid Vehicles'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">two_wheeler</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{approvedCount}</p>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('officer_logs_warning')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/30 group"
            >
              <div className="flex justify-between items-center text-amber-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ማስጠንቀቂያ/ግጭት' : 'Warnings'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">warning</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{warningLogsCount}</p>
            </button>

            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('kpi_expired')}
              className="w-full text-left p-2.5 sm:p-3 rounded-lg border border-red-200/80 dark:border-red-800/50 bg-gradient-to-br from-red-500/5 via-surface-container/30 to-transparent hover:scale-[1.02] active:scale-98 transition-all duration-200 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-red-500/30 group"
            >
              <div className="flex justify-between items-center text-red-600 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-on-surface">
                  {isAmharic ? 'ሕገ-ወጥ ተሽከርካሪዎች' : 'Illegal Vehicles'}
                </span>
                <Icon className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform duration-200">block</Icon>
              </div>
              <p className="text-xl sm:text-2xl font-black text-on-surface">{illegalVehiclesCount}</p>
            </button>
          </div>
        </div>
      )}

      {/* ==================== QUICK ACTION SHORTCUTS ==================== */}
      {currentRoleConfig.actions.length > 0 && (
        <div className="p-4 sm:p-6 bg-surface-container-lowest border border-outline-variant/70 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="material-symbols-outlined text-[20px]">{currentRoleConfig.headerIcon}</Icon>
              </div>
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
                    <h4 className="text-xs sm:text-sm font-extrabold text-on-surface group-hover:text-primary transition-colors truncate">
                      {act.title}
                    </h4>
                    <p className="text-[11px] text-secondary mt-0.5 truncate font-medium">
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
              <Icon className="material-symbols-outlined text-primary text-[18px]">history</Icon>
              <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                {isAmharic ? 'የቅርብ ጊዜ የመስክ ፍተሻዎች' : 'Recent Field Verifications'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onQuickAction && onQuickAction('inspection_report_all')}
              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
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
            title={isAmharic ? 'የሞተረኞች ማህበር መታወቂያ' : 'Motorcyclists Association ID'}
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
