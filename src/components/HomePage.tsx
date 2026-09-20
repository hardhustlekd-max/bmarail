import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from './ui/Icon';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  OfficerAssignment,
  PrintBatchOrder,
  VerificationLog,
  UnregisteredVehicleReport,
  PaymentReceipt,
  SystemSettings,
} from '../types';
import {
  getStoredActivePage,
  saveActivePage,
} from '../utils/storage';
import {
  subscribeRegistrations,
  subscribeOfficers,
  subscribePrintOrders,
  subscribeVerificationLogs,
  subscribeUnregisteredReports,
  subscribePaymentReceipts,
  saveRegistrationToDb,
  updateRegistrationStatusInDb,
  saveOfficerToDb,
  savePrintOrderToDb,
  updatePrintOrderStatusInDb,
  saveVerificationLogToDb,
  saveUnregisteredReportToDb,
  updateUnregisteredReportStatusInDb,
  savePaymentReceiptToDb,
  deletePaymentReceiptFromDb,
  syncAllCollectionsWithDb,
  syncCriticalStartup,
  syncActivePageCollection,
  subscribeSettings,
  DEFAULT_SETTINGS,
  isTaskViewable,
  isTaskAllowed,
  getPermissionState,
  loadUserNotificationStateFromDb,
  saveUserNotificationStateToDb,
} from '../services/dbService';
import { MunicipalDashboardOverview } from './MunicipalDashboardOverview';
import { FormsPage } from './FormsPage';
import { TablesPage } from './TablesPage';
import { TodaySubmissionsPage } from './TodaySubmissionsPage';
import { SharedScannerModal } from './SharedScannerModal';
import { SuperAdminInterface } from './SuperAdminInterface';
import { OfficerVerificationHistory } from './OfficerVerificationHistory';
import { UnregisteredVehicleForm } from './UnregisteredVehicleForm';
import { UnregisteredReportsList } from './UnregisteredReportsList';
import { PaymentReceiptsPage } from './PaymentReceiptsPage';
import { SettingsPage } from './SettingsPage';
import { NotificationDropdown, NotificationItem } from './NotificationDropdown';
import { APP_LOGO } from '../types';
import { toEthiopianDate } from '../utils/ethiopianCalendar';
import {
  subscribeActionLoading,
  pulseNavbarLoader,
  ActionState,
} from '../services/actionTracker';
import { ToastProvider, useToast } from '../context/ToastContext';
import { DataProvider, useData } from '../context/DataContext';
import { ActionProvider } from '../context/ActionContext';
import { DashboardOverviewRouter } from '../domains/dashboard/DashboardOverviewRouter';
import { RegistryRouter } from '../domains/registry/RegistryRouter';
import { EnforcementRouter } from '../domains/enforcement/EnforcementRouter';
import { RevenueRouter } from '../domains/revenue/RevenueRouter';
import { GovernanceRouter } from '../domains/governance/GovernanceRouter';

interface HomePageProps {
  userBadgeId: string;
  userRole: UserRole;
  currentLang: Language;
  currentTheme?: 'light' | 'dark';
  onToggleLang: () => void;
  onToggleTheme?: () => void;
  onLogout: () => void;
  onSwitchRole?: (newRole: UserRole) => void;
}

export type ActiveHomePage =
  | 'dashboard'
  | 'forms'
  | 'tables'
  | 'today_submissions_adjust'
  | 'workstation'
  | 'scan'
  | 'inspection_report'
  | 'report_unregistered'
  | 'unregistered_list'
  | 'payment_receipts'
  | 'superadmin_users'
  | 'superadmin_subcities'
  | 'superadmin_security'
  | 'superadmin_permits'
  | 'superadmin_maintenance'
  | 'superadmin_owners'
  | 'superadmin'
  | 'settings';

const HomePageShell: React.FC<HomePageProps> = ({
  userBadgeId,
  userRole,
  currentLang,
  currentTheme = 'light',
  onToggleLang,
  onToggleTheme,
  onLogout,
  onSwitchRole,
}) => {
  const isAmharic = currentLang === 'am';

  // User profile dropdown toggle state for topbar
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  // Stored read / cleared notification IDs scoped per user account & role on Firestore database
  const userNotificationScope = `bahirdar_notif_${userBadgeId || 'badge'}_${userRole || 'role'}`;
  const readStorageKey = `${userNotificationScope}_read`;
  const clearedStorageKey = `${userNotificationScope}_cleared`;

  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [clearedNotificationIds, setClearedNotificationIds] = useState<Set<string>>(() => new Set());

  // Load read/cleared notifications from Firestore database when active user account or role changes
  useEffect(() => {
    let isMounted = true;
    loadUserNotificationStateFromDb(userNotificationScope).then((data) => {
      if (!isMounted) return;
      if (data) {
        setReadNotificationIds(new Set(data.readIds));
        setClearedNotificationIds(new Set(data.clearedIds));
      } else {
        // Fallback to localStorage
        try {
          const savedRead = localStorage.getItem(readStorageKey);
          const savedCleared = localStorage.getItem(clearedStorageKey);
          setReadNotificationIds(savedRead ? new Set(JSON.parse(savedRead)) : new Set());
          setClearedNotificationIds(savedCleared ? new Set(JSON.parse(savedCleared)) : new Set());
        } catch {}
      }
    });

    return () => {
      isMounted = false;
    };
  }, [userNotificationScope, readStorageKey, clearedStorageKey]);

  // State for expandable side menu accordion groups (collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    registrations: false,
    verification: false,
    superadmin: false,
    settings: false,
  });

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const notificationDropdownRef = React.useRef<HTMLDivElement>(null);
  const mobileNotificationRef = React.useRef<HTMLDivElement>(null);
  const mobileNotificationModalRef = React.useRef<HTMLDivElement>(null);
  const mobileDrawerRef = React.useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isNotificationOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!target) return;
      if (
        notificationDropdownRef.current &&
        notificationDropdownRef.current.contains(target)
      ) {
        return;
      }
      if (
        mobileNotificationRef.current &&
        mobileNotificationRef.current.contains(target)
      ) {
        return;
      }
      if (
        mobileNotificationModalRef.current &&
        mobileNotificationModalRef.current.contains(target)
      ) {
        return;
      }
      setIsNotificationOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isNotificationOpen]);

  // Global action loader state for navbar
  const [actionLoadingState, setActionLoadingState] = useState<ActionState>({
    isLoading: false,
    activeCount: 0,
    labelAm: '',
    labelEn: '',
    timestamp: Date.now(),
  });

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeActionLoading((state) => {
      setActionLoadingState(state);
    });
    return () => unsubscribe();
  }, []);

  // Active top page navigation with browser back/forward history support
  const [activePage, _setActivePage] = useState<ActiveHomePage>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashPage = window.location.hash.replace('#', '') as ActiveHomePage;
      if (hashPage) return hashPage;
    }
    const saved = getStoredActivePage();
    return (saved as any) || 'dashboard';
  });

  const setActivePage = useCallback(
    (target: ActiveHomePage | ((prev: ActiveHomePage) => ActiveHomePage)) => {
      pulseNavbarLoader('ገፁ እየተጫነ ነው...', 'Loading view...', 350);
      setPageLoading(true);
      setTimeout(() => {
        setPageLoading(false);
      }, 450);
      _setActivePage((prev) => {
        const next = typeof target === 'function' ? target(prev) : target;
        if (next !== prev) {
          if (typeof window !== 'undefined') {
            window.history.pushState({ page: next }, '', `#${next}`);
          }
          saveActivePage(next);
        }
        return next;
      });
    },
    [isAmharic]
  );

  // Sync with browser back/forward buttons via popstate
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Ensure initial entry is in history
    const initialHash = window.location.hash ? window.location.hash.replace('#', '') : '';
    const initialPage = (initialHash as ActiveHomePage) || activePage || 'dashboard';
    window.history.replaceState({ page: initialPage }, '', `#${initialPage}`);

    const handlePopState = (event: PopStateEvent) => {
      const targetPage =
        event.state?.page ||
        (window.location.hash ? window.location.hash.replace('#', '') : 'dashboard');
      if (targetPage) {
        _setActivePage(targetPage as ActiveHomePage);
        saveActivePage(targetPage);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Role accessibility control for officer
  useEffect(() => {
    const allowedOfficerPages = ['dashboard', 'scan', 'settings', 'inspection_report', 'report_unregistered', 'tables'];
    if (userRole === 'officer' && !allowedOfficerPages.includes(activePage)) {
      setActivePage('dashboard');
      saveActivePage('dashboard');
    }
  }, [userRole, activePage, setActivePage]);

  // Automatically open the side menu group containing the active page, collapsing others
  useEffect(() => {
    const pageToGroupMap: Record<string, string> = {
      forms: 'registrations',
      tables: 'registrations',
      payment_receipts: 'registrations',
      today_submissions_adjust: 'registrations',
      scan: 'verification',
      report_unregistered: 'verification',
      unregistered_list: 'verification',
      inspection_report: 'verification',
      superadmin_users: 'superadmin',
      print_batches: 'superadmin',
      activity_logs: 'superadmin',
      settings: 'settings',
    };

    const targetGroup = pageToGroupMap[activePage];
    setExpandedGroups({
      registrations: targetGroup === 'registrations',
      verification: targetGroup === 'verification',
      superadmin: targetGroup === 'superadmin',
      settings: targetGroup === 'settings',
    });
  }, [activePage]);

  // Logout confirmation modal state
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Live real-time clock and Ethiopian Calendar state
  const [currentDateTime, setCurrentDateTime] = useState<Date>(() => new Date());
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const ethDate = useMemo(() => toEthiopianDate(currentDateTime), [currentDateTime]);

  const handleUserLogout = () => {
    saveActivePage('dashboard');
    _setActivePage('dashboard');
    if (typeof window !== 'undefined') {
      window.history.replaceState({ page: 'dashboard' }, '', window.location.pathname);
    }
    setIsMobileMenuOpen(false);
    onLogout();
  };

  // Mobile menu open state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Desktop sidebar collapse/expand states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const isCollapsed = isSidebarCollapsed && !isSidebarHovered;

  // Close mobile navigation drawer when clicking or tapping outside on mobile devices
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent | PointerEvent) => {
      const target = e.target as Node;
      if (!target) return;
      // Do not close if clicking inside the mobile drawer panel itself
      if (mobileDrawerRef.current && mobileDrawerRef.current.contains(target)) {
        return;
      }
      // Do not close if clicking the toggle button (it handles its own toggle click)
      if (mobileMenuButtonRef.current && mobileMenuButtonRef.current.contains(target)) {
        return;
      }
      setIsMobileMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isMobileMenuOpen]);

  // Table active tab filter state passed to TablesPage
  const [tableInitialTab, setTableInitialTab] = useState<'approved' | 'pending' | 'expired'>('approved');

  // Inspection report filter state passed to OfficerVerificationHistory
  const [inspectionInitialFilter, setInspectionInitialFilter] = useState<'all' | 'verified' | 'warning' | 'flagged'>('all');

  // Universal RBAC Task Mapping for all pages
  const PAGE_TASK_MAP: Record<string, number> = {
    dashboard: 9, // View Count / Statistics / Dashboard
    forms: 1, // Register New Member / Vehicle
    today_submissions_adjust: 2, // Edit Member / Submission Correction
    tables: 8, // View Members List / Tables & Records
    inspection_report: 10, // View Reports / Inspection Report
    report_unregistered: 5, // Field Patrol & Scanner
    unregistered_list: 5, // Field Patrol & Scanner
    payment_receipts: 1, // Payment Receipt Entry & Validity Tracking
    scan: 5, // Barcode / QR Scanner
    settings: 9, // Universal Settings Page
    superadmin_users: 14,
    superadmin_subcities: 13,
    superadmin_security: 14,
    superadmin_permits: 11,
    superadmin_maintenance: 12,
    superadmin: 14,
    superadmin_owners: 11,
  };

  const currentTaskId = PAGE_TASK_MAP[activePage] || 9;
  const currentPagePermission = getPermissionState(userRole, currentTaskId);
  const isCurrentPageBlocked = currentPagePermission === 'deny';

  useEffect(() => {
    if (isCurrentPageBlocked) {
      addToast(
        isAmharic
          ? 'ይህ ክፍል በፈቃድ መቆጣጠሪያ (RBAC) ታግዷል!'
          : 'This section is currently blocked by your RBAC configuration!',
        'error'
      );
    }
  }, [activePage, isCurrentPageBlocked, isAmharic]);

  const renderBlockedPageUI = () => (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-xl shadow-sm space-y-6 animate-in fade-in zoom-in duration-200 my-auto">
      <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 shadow-sm animate-pulse">
        <Icon className="material-symbols-outlined text-[36px]">gpp_bad</Icon>
      </div>
      <div className="space-y-2 max-w-md">
        <h3 className="text-lg font-black text-on-surface dark:text-white">
          {isAmharic ? 'ይህ ክፍል በፈቃድ መቆጣጠሪያ (RBAC) ታግዷል' : 'Access Blocked by RBAC Matrix'}
        </h3>
        <p className="text-xs text-outline dark:text-slate-400 leading-relaxed font-medium">
          {isAmharic
            ? 'ይህ ክፍል በሪል-ታይም የሚና እና ፈቃድ መቆጣጠሪያ (RBAC) ቅንብር ምክንያት እንዳይከፈት ታግዷል። እባክዎን የሲስተም ባለቤትን ወይም ዋና አይቲ ባለሙያን ያነጋግሩ።'
            : 'Access to this specific section has been dynamically blocked by the active Role-Based Access Control (RBAC) matrix. Please contact the system owner or network administrator.'}
        </p>
      </div>
      <div className="flex items-center gap-2 text-[11px] font-black uppercase text-rose-600 dark:text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-full border border-rose-500/20">
        <Icon className="material-symbols-outlined text-[14px]">shield</Icon>
        <span>{isAmharic ? 'የደህንነት ማስጠንቀቂያ' : 'Security Alert'}</span>
      </div>
      {activePage !== 'dashboard' && getPermissionState(userRole, 9) !== 'deny' && (
        <button
          type="button"
          onClick={() => setActivePage('dashboard')}
          className="px-4 py-2 bg-[#0f172a] hover:bg-slate-800 text-white rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Icon className="material-symbols-outlined text-[16px]">arrow_back</Icon>
          <span>{isAmharic ? 'ወደ ዋና ገፅ ተመለስ' : 'Return to Dashboard'}</span>
        </button>
      )}
    </div>
  );

  // Dynamic Amharic navbar title memo for the active page
  const currentNavbarTitleAmharic = useMemo(() => {
    switch (activePage) {
      case 'dashboard':
        return 'ዋና ገፅ';
      case 'forms':
        return 'አዲስ ምዝገባ';
      case 'today_submissions_adjust':
        return ['admin', 'superadmin', 'super_admin', 'manager'].includes(userRole) ? 'የቀረቡ ማስተካከያዎች' : 'ማመልከቻ ማስተካከያ';
      case 'tables':
        return userRole === 'clerk'
          ? (tableInitialTab === 'approved' ? 'የፀደቁ ተሽከርካሪዎች' : 'የቀረቡ ማመልከቻዎች')
          : 'የአባላት መረጃዎች ማህደር';
      case 'inspection_report':
        return 'የፍተሻ ሪፖርት';
      case 'report_unregistered':
        return 'ባልተመዘገበ ተሽከርካሪ ሪፖርት';
      case 'unregistered_list':
        return 'የህገወጥ ሞተሮች ማህደር';
      case 'payment_receipts':
        return 'የክፍያ ደረሰኞች';
      case 'workstation':
        return 'የተጠቃሚ ሚና ስራ ማዕከል';
      case 'scan':
        return 'ኮውአር ኮድ ፈትሽ';
      case 'superadmin_users':
      case 'superadmin':
        return 'ሚና እና ፈቃድ';
      case 'superadmin_subcities':
        return 'የክፍለ ከተማ ቁጥጥር';
      case 'superadmin_security':
        return 'የሴኪዩሪቲ ኦዲት';
      case 'superadmin_permits':
        return 'የፈቃድ ቁጥጥር';
      case 'superadmin_maintenance':
        return 'የሲስተም ጥገና';
      case 'superadmin_owners':
        return 'የተመዘገቡ ባለቤቶች';
      case 'settings':
        return 'ቅንብሮች';
      default:
        return 'ዋና ገፅ';
    }
  }, [activePage, userRole, tableInitialTab]);

  // Synchronize browser document.title throughout the app to reflect the top navbar title in Amharic
  useEffect(() => {
    document.title = `${currentNavbarTitleAmharic} | ባህር ዳር ሞተረኞች ማህበር`;
  }, [currentNavbarTitleAmharic]);

  // Dynamic Breadcrumb navigation calculation matching side menu page titles
  const breadcrumbItems = useMemo(() => {
    const homeItem = {
      label: isAmharic ? 'ዋና ገፅ' : 'Dashboard',
      page: 'dashboard',
      icon: 'space_dashboard',
    };

    if (activePage === 'dashboard') {
      return [homeItem];
    }

    if (activePage === 'forms') {
      return [
        homeItem,
        {
          label: isAmharic ? 'አዲስ ምዝገባ' : 'New Registration',
          page: 'forms',
          icon: 'how_to_reg',
        },
      ];
    }

    if (activePage === 'today_submissions_adjust') {
      const isPrivileged = ['admin', 'superadmin', 'super_admin', 'manager'].includes(userRole);
      return [
        homeItem,
        {
          label: isAmharic
            ? (isPrivileged ? 'የቀረቡ ማስተካከያዎች' : 'ማመልከቻ ማስተካከያ')
            : (isPrivileged ? 'Submitted Corrections' : 'Submission Correction'),
          page: 'today_submissions_adjust',
          icon: 'edit_note',
        },
      ];
    }

    if (activePage === 'tables') {
      return [
        homeItem,
        {
          label: userRole === 'clerk'
            ? (tableInitialTab === 'approved'
                ? (isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Motor Registry')
                : (isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'))
            : (isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Tables'),
          page: 'tables',
          icon: userRole === 'clerk' ? (tableInitialTab === 'approved' ? 'verified' : 'folder_open') : 'table_chart',
        },
      ];
    }

    if (activePage === 'inspection_report') {
      return [
        homeItem,
        {
          label: isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report',
          page: 'inspection_report',
          icon: 'analytics',
        },
      ];
    }

    if (activePage === 'report_unregistered') {
      return [
        homeItem,
        {
          label: isAmharic ? 'ባልተመዘገበ ተሽከርካሪ ሪፖርት' : 'Report Unregistered Vehicle',
          page: 'report_unregistered',
          icon: 'report_problem',
        },
      ];
    }

    if (activePage === 'unregistered_list') {
      return [
        homeItem,
        {
          label: isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry',
          page: 'unregistered_list',
          icon: 'no_drinks',
        },
      ];
    }

    if (activePage === 'payment_receipts') {
      return [
        homeItem,
        {
          label: isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts',
          page: 'payment_receipts',
          icon: 'receipt_long',
        },
      ];
    }

    if (activePage === 'scan') {
      return [
        homeItem,
        {
          label: isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code',
          page: 'scan',
          icon: 'qr_code_scanner',
        },
      ];
    }

    if (activePage === 'settings') {
      return [
        homeItem,
        {
          label: isAmharic ? 'ቅንብሮች' : 'Settings',
          page: 'settings',
          icon: 'settings',
        },
      ];
    }

    if (activePage.startsWith('superadmin')) {
      const parent = {
        label: isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin',
        page: 'superadmin_users',
        icon: 'admin_panel_settings',
      };
      let current = {
        label: isAmharic ? 'ሚና እና ፈቃድ' : 'Roles & Permissions',
        page: activePage,
        icon: 'manage_accounts',
      };

      if (activePage === 'superadmin_subcities') {
        current = {
          label: isAmharic ? 'የክፍለ ከተማ ቁጥጥር' : 'Sub-City Governance',
          page: activePage,
          icon: 'location_city',
        };
      } else if (activePage === 'superadmin_security') {
        current = {
          label: isAmharic ? 'የሴኪዩሪቲ ኦዲት' : 'Security & Audit Logs',
          page: activePage,
          icon: 'shield',
        };
      } else if (activePage === 'superadmin_permits') {
        current = {
          label: isAmharic ? 'የፈቃድ ቁጥጥር' : 'Master Permit Rules',
          page: activePage,
          icon: 'verified',
        };
      } else if (activePage === 'superadmin_maintenance') {
        current = {
          label: isAmharic ? 'የሲስተም ጥገና' : 'System Maintenance',
          page: activePage,
          icon: 'database',
        };
      } else if (activePage === 'superadmin_owners') {
        current = {
          label: isAmharic ? 'የተመዘገቡ ባለቤቶች' : 'Registered Owners Directory',
          page: activePage,
          icon: 'badge',
        };
      }

      return [homeItem, parent, current];
    }

    return [homeItem];
  }, [activePage, isAmharic, userRole, tableInitialTab]);

  // Shared System State connected to Firestore "permit" database
  const [registrations, setRegistrations] = useState<MotorcycleRegistration[]>([]);
  const [officers, setOfficers] = useState<OfficerAssignment[]>([]);
  const [printOrders, setPrintOrders] = useState<PrintBatchOrder[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [unregisteredReports, setUnregisteredReports] = useState<UnregisteredVehicleReport[]>([]);
  const [paymentReceipts, setPaymentReceipts] = useState<PaymentReceipt[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  // Real-time Firestore subscriptions with smart, quota-safe local-first cache
  useEffect(() => {
    // Fast startup: sync settings, officers, and initial page collection
    setIsInitialLoading(true);
    syncCriticalStartup(activePage)
      .catch((err) => {
        console.warn('HomePage critical startup sync notice:', err);
      })
      .finally(() => {
        setIsInitialLoading(false);
      });

    // Subscribe to in-memory state listeners
    const unsubRegs = subscribeRegistrations(setRegistrations);
    const unsubOffs = subscribeOfficers(setOfficers);
    const unsubPrints = subscribePrintOrders(setPrintOrders);
    const unsubLogs = subscribeVerificationLogs(setVerificationLogs);
    const unsubUnregistered = subscribeUnregisteredReports(setUnregisteredReports);
    const unsubPayments = subscribePaymentReceipts(setPaymentReceipts);
    const unsubSettings = subscribeSettings((data) => {
      if (data) setSettings(data);
    });

    return () => {
      unsubRegs();
      unsubOffs();
      unsubPrints();
      unsubLogs();
      unsubUnregistered();
      unsubPayments();
      unsubSettings();
    };
  }, []);

  // Save active page tab to localStorage and trigger on-demand sync for the active page
  useEffect(() => {
    saveActivePage(activePage);
    syncActivePageCollection(activePage).catch((err) => {
      console.warn('Page collection on-demand sync notice:', err);
    });
  }, [activePage]);

  // Live background polling and focus sync for real-time multi-user UI updates without manual page refresh
  useEffect(() => {
    const handleFocus = () => {
      syncActivePageCollection(activePage).catch(() => {});
      syncAllCollectionsWithDb().catch(() => {});
    };
    window.addEventListener('focus', handleFocus);

    const interval = setInterval(() => {
      syncActivePageCollection(activePage).catch(() => {});
    }, 8000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [activePage]);

  // Dynamic Municipal System Notifications routed strictly by RBAC recipient responsibility
  const systemNotifications = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];

    // RBAC Role classification
    const roleStr = userRole as string;
    const isSuperAdmin = roleStr === 'superadmin' || roleStr === 'super_admin' || roleStr === 'role-superadmin';
    const isManager = roleStr === 'admin' || roleStr === 'role-manager';
    const isOfficer = roleStr === 'officer' || roleStr === 'role-officer';
    const isClerk = roleStr === 'clerk' || roleStr === 'role-secretary';
    const isItSpecialist = roleStr === 'it_specialist' || roleStr === 'role-it';

    // =========================================================================
    // 1. RECIPIENT: MANAGER / ADMIN / SUPERADMIN (Approvers)
    // Receive notifications for items waiting for their review/approval from Clerks/Officers.
    // =========================================================================
    if (isManager || isSuperAdmin) {
      const pendingRegs = registrations.filter((r) => r.status === 'pending_approval');
      if (pendingRegs.length > 1) {
        list.push({
          id: `pending_regs_summary_${pendingRegs.length}`,
          title: isAmharic
            ? `${pendingRegs.length} አዳዲስ ማመልከቻዎች የስራ አስኪያጅ ውሳኔ ይጠብቃሉ`
            : `${pendingRegs.length} Registration Submissions Awaiting Approval`,
          description: isAmharic
            ? `በፀሐፊዎች የተመዘገቡ ${pendingRegs.length} አዳዲስ የሞተር ምዝገባ ማመልከቻዎች የስራ አስኪያጅ ማረጋገጫና ውሳኔ ይፈልጋሉ።`
            : `${pendingRegs.length} new motor registration applications submitted by clerks require manager verification and approval.`,
          type: 'pending_approval',
          icon: 'how_to_reg',
          iconBg: 'bg-[#3C50E0]/15 text-[#3C50E0] dark:text-blue-400',
          badgeLabel: isAmharic ? 'ማፅደቂያ' : 'Approval Needed',
          badgeBg: 'bg-[#3C50E0]/20',
          badgeText: 'text-[#3C50E0] dark:text-blue-300',
          actionPage: 'tables',
          actionTab: 'pending',
          subItems: pendingRegs.map((reg) => ({
            id: `sub_pending_${reg.id}`,
            title: `${reg.fullName} (${reg.plateNumber || reg.id})`,
            description: reg.isCorrection || reg.lastRejectionReason
              ? (isAmharic
                  ? `ተስተካክሎ የቀረበ ማመልከቻ - ክፍለ ከተማ: ${reg.subCity || 'ባህር ዳር'}`
                  : `Resubmitted Correction - Subcity: ${reg.subCity || 'Bahir Dar'}`)
              : (isAmharic
                  ? `አዲስ የተሽከርካሪ ምዝገባ - ክፍለ ከተማ: ${reg.subCity || 'ባህር ዳር'}`
                  : `New Motor Registration - Subcity: ${reg.subCity || 'Bahir Dar'}`),
            time: reg.registrationDate,
            actionPage: (reg.isCorrection || reg.lastRejectionReason) ? 'today_submissions_adjust' : 'tables',
            actionTab: 'pending',
          })),
        });
      } else if (pendingRegs.length === 1) {
        const reg = pendingRegs[0];
        list.push({
          id: `reg_pending_single_${reg.id}`,
          title: reg.isCorrection || reg.lastRejectionReason
            ? (isAmharic ? `ማስተካከያ ተደርጎ የቀረበ: ${reg.fullName} (${reg.plateNumber || reg.id})` : `Correction Resubmitted: ${reg.fullName} (${reg.plateNumber || reg.id})`)
            : (isAmharic ? `አዲስ ማመልከቻ: ${reg.fullName} (${reg.plateNumber || reg.id})` : `New Submission: ${reg.fullName} (${reg.plateNumber || reg.id})`),
          description: isAmharic
            ? `የማመልከቻ ቁጥር ${reg.plateNumber || reg.id} በፀሐፊ ተመዝግቦ የስራ አስኪያጅ ውሳኔ በመጠባበቅ ላይ ይገኛል።`
            : `Registration application for ${reg.fullName} (${reg.plateNumber || reg.id}) submitted by clerk is waiting for manager decision.`,
          time: reg.registrationDate,
          type: 'pending_approval',
          icon: 'how_to_reg',
          iconBg: 'bg-[#3C50E0]/15 text-[#3C50E0] dark:text-blue-400',
          badgeLabel: isAmharic ? 'ማፅደቂያ' : 'Approval Needed',
          badgeBg: 'bg-[#3C50E0]/20',
          badgeText: 'text-[#3C50E0] dark:text-blue-300',
          actionPage: (reg.isCorrection || reg.lastRejectionReason) ? 'today_submissions_adjust' : 'tables',
          actionTab: 'pending',
        });
      }

      // Flagged patrol inspection violations logged by officers needing manager review
      const flaggedLogs = verificationLogs.filter(
        (l) => l.verificationStatus === 'flagged' || l.verificationStatus === 'warning'
      );
      if (flaggedLogs.length > 1) {
        list.push({
          id: `flagged_logs_summary_${flaggedLogs.length}`,
          title: isAmharic
            ? `${flaggedLogs.length} የፍተሻ ጥሰቶችና ማስጠንቀቂያዎች ተመዝግበዋል`
            : `${flaggedLogs.length} Field Inspection Violations Logged`,
          description: isAmharic
            ? 'በመንገድ ፍተሻ ወቅት በኦፊሰሮች የተመዘገቡ የህግ ጥሰቶች የስራ አስኪያጅ ግምገማ ይፈልጋሉ።'
            : 'Patrol officers reported non-compliant vehicle violations needing manager review.',
          type: 'flagged_inspection',
          icon: 'warning',
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          badgeLabel: isAmharic ? 'የጥሰት ሪፖርት' : 'Violation Report',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-700 dark:text-rose-300',
          actionPage: 'inspection_report',
          subItems: flaggedLogs.map((log) => ({
            id: `sub_flagged_${log.id}`,
            title: `${log.plateNumber} - ${log.notes || 'ጥሰት/ማስጠንቀቂያ'}`,
            description: isAmharic
              ? `በኦፊሰር የተመዘገበ ጥሰት - ቦታ: ${log.locationName || 'ባህር ዳር'}`
              : `Flagged during road inspection - Location: ${log.locationName || 'Bahir Dar'}`,
            time: log.timestamp || log.scannedAt,
            actionPage: 'inspection_report',
          })),
        });
      } else if (flaggedLogs.length === 1) {
        const log = flaggedLogs[0];
        list.push({
          id: `flagged_log_single_${log.id}`,
          title: isAmharic
            ? `የፍተሻ ጥሰት ሪፖርት: ${log.plateNumber}`
            : `Inspection Violation: ${log.plateNumber}`,
          description: isAmharic
            ? `በኦፊሰር የተመዘገበ ጥሰት: ${log.notes || 'የሰነድ/የፈቃድ ጉድለት'} | ቦታ: ${log.locationName || 'ባህር ዳር'}`
            : `Flagged violation reported by officer: ${log.notes || 'Licensing/Document Issue'} | Location: ${log.locationName || 'Bahir Dar'}`,
          time: log.timestamp || log.scannedAt,
          type: 'flagged_inspection',
          icon: 'warning',
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          badgeLabel: isAmharic ? 'የጥሰት ሪፖርት' : 'Violation Report',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-700 dark:text-rose-300',
          actionPage: 'inspection_report',
        });
      }

      // Unregistered vehicle reports logged by patrol officers
      if (unregisteredReports.length > 1) {
        list.push({
          id: `unreg_reports_summary_${unregisteredReports.length}`,
          title: isAmharic
            ? `${unregisteredReports.length} ያልተመዘገቡ ሞተሮች ጥቆማዎች ቀርበዋል`
            : `${unregisteredReports.length} Unregistered Vehicle Patrol Reports`,
          description: isAmharic
            ? 'በኦፊሰሮች በሜዳ ላይ የተገኙ ያልተመዘገቡ ተሽከርካሪዎች ሪፖርቶች ለክትትል ቀርበዋል።'
            : 'Field officers reported unregistered motorcycle incidents during patrol duty.',
          type: 'unregistered_alert',
          icon: 'no_crash',
          iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
          badgeLabel: isAmharic ? 'ያልተመዘገበ' : 'Unregistered Alert',
          badgeBg: 'bg-amber-500/20',
          badgeText: 'text-amber-800 dark:text-amber-300',
          actionPage: 'unregistered_list',
          subItems: unregisteredReports.map((rep) => ({
            id: `sub_unreg_${rep.id}`,
            title: `${rep.driverName || 'ያልተመዘገበ ተሽከርካሪ'} (${rep.chassisNumber || rep.id})`,
            description: isAmharic
              ? `የኦፊሰር ጥቆማ - ቦታ: ${rep.locationName || rep.subCity || 'ባህር ዳር'}`
              : `Patrol report - Location: ${rep.locationName || rep.subCity || 'Bahir Dar'}`,
            time: rep.reportedAt,
            actionPage: 'unregistered_list',
          })),
        });
      } else if (unregisteredReports.length === 1) {
        const rep = unregisteredReports[0];
        list.push({
          id: `unreg_report_single_${rep.id}`,
          title: isAmharic
            ? `ያልተመዘገበ ሞተር ጥቆማ: ${rep.driverName || 'ያልታወቀ'}`
            : `Unregistered Motor Report: ${rep.driverName || 'Unknown'}`,
          description: isAmharic
            ? `የቻሲስ ቁጥር: ${rep.chassisNumber || rep.id} | በኦፊሰር የተመዘገበበት ቦታ: ${rep.locationName || rep.subCity || 'ባህር ዳር'}`
            : `Chassis No: ${rep.chassisNumber || rep.id} | Reported location: ${rep.locationName || rep.subCity || 'Bahir Dar'}`,
          time: rep.reportedAt,
          type: 'unregistered_alert',
          icon: 'no_crash',
          iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
          badgeLabel: isAmharic ? 'ያልተመዘገበ' : 'Unregistered Alert',
          badgeBg: 'bg-amber-500/20',
          badgeText: 'text-amber-800 dark:text-amber-300',
          actionPage: 'unregistered_list',
        });
      }

      // Pending payment deposit receipts requiring verification
      const pendingPayments = paymentReceipts.filter((p) => p.status === 'pending');
      if (pendingPayments.length > 1) {
        list.push({
          id: `pending_payments_summary_${pendingPayments.length}`,
          title: isAmharic
            ? `${pendingPayments.length} ያልተረጋገጡ የክፍያ ደረሰኞች`
            : `${pendingPayments.length} Pending Payment Deposit Receipts`,
          description: isAmharic
            ? 'የባንክ ክፍያ ደረሰኞች ማረጋገጫና ቼክ በመጠባበቅ ላይ ናቸው።'
            : 'Deposit slips waiting for bank payment clearance and verification.',
          type: 'pending_payment',
          icon: 'receipt_long',
          iconBg: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
          badgeLabel: isAmharic ? 'ክፍያ ማረጋገጫ' : 'Payment Verification',
          badgeBg: 'bg-teal-500/20',
          badgeText: 'text-teal-700 dark:text-teal-300',
          actionPage: 'payment_receipts',
          subItems: pendingPayments.map((p) => ({
            id: `sub_payment_${p.id}`,
            title: `ደረሰኝ #${p.receiptNumber} (${p.amount || 0} ETB)`,
            description: isAmharic
              ? `ክፍያ ከ ${p.ownerName || p.enteredBy} - ማረጋገጫ በመጠባበቅ ላይ`
              : `Deposit slip from ${p.ownerName || p.enteredBy} - Pending verification`,
            actionPage: 'payment_receipts',
          })),
        });
      } else if (pendingPayments.length === 1) {
        const p = pendingPayments[0];
        list.push({
          id: `pending_payment_single_${p.id}`,
          title: isAmharic
            ? `የክፍያ ደረሰኝ ማረጋገጫ: #${p.receiptNumber}`
            : `Deposit Receipt Pending: #${p.receiptNumber}`,
          description: isAmharic
            ? `ክፍያ ከ ${p.ownerName || p.enteredBy} (${p.amount || 0} ETB) የማረጋገጫ ቼክ ይፈልጋል።`
            : `Payment receipt from ${p.ownerName || p.enteredBy} (${p.amount || 0} ETB) requires bank verification.`,
          type: 'pending_payment',
          icon: 'receipt_long',
          iconBg: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
          badgeLabel: isAmharic ? 'ክፍያ ማረጋገጫ' : 'Payment Verification',
          badgeBg: 'bg-teal-500/20',
          badgeText: 'text-teal-700 dark:text-teal-300',
          actionPage: 'payment_receipts',
        });
      }
    }

    // =========================================================================
    // 2. RECIPIENT: CLERK / DATA ENCODER (Submitting Staff)
    // Receive notifications when Manager approves or rejects their submissions.
    // =========================================================================
    if (isClerk || isSuperAdmin) {
      // Approved submissions notification for Clerks
      const approvedRegs = registrations.filter((r) => r.status === 'approved');
      if (approvedRegs.length > 1) {
        list.push({
          id: `approved_regs_summary_${approvedRegs.length}`,
          title: isAmharic
            ? `${approvedRegs.length} ማመልከቻዎች በስራ አስኪያጅ ጸድቀዋል`
            : `${approvedRegs.length} Registration Submissions Approved by Manager`,
          description: isAmharic
            ? 'የተረጋገጡ አዳዲስ የሞተር ፈቃዶች፤ የባጅ/ሰሌዳ ህትመት ማከናወን ወይም ለባለቤቱ መስጠት ይችላሉ።'
            : 'Newly approved motor registration applications ready for permit card printing and issuing.',
          type: 'print_order',
          icon: 'check_circle',
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          badgeLabel: isAmharic ? 'በስራ አስኪያጅ ጸድቋል' : 'Approved by Manager',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-700 dark:text-emerald-300',
          actionPage: 'tables',
          actionTab: 'approved',
          subItems: approvedRegs.map((reg) => ({
            id: `sub_approved_${reg.id}`,
            title: `${reg.fullName} (${reg.plateNumber || reg.id})`,
            description: isAmharic
              ? 'በስራ አስኪያጅ የተረጋገጠ - ለፈቃድ አሰጣጥ ዝግጁ'
              : 'Approved by manager - Ready for permit issuance',
            time: reg.registrationDate,
            actionPage: 'tables',
            actionTab: 'approved',
          })),
        });
      } else if (approvedRegs.length === 1) {
        const reg = approvedRegs[0];
        const isWasCorrection = reg.isCorrection || reg.lastRejectionReason;
        list.push({
          id: `reg_approved_single_${reg.id}`,
          title: isWasCorrection
            ? (isAmharic ? `ማስተካከያው በስራ አስኪያጅ ጸድቋል: ${reg.fullName}` : `Correction Approved by Manager: ${reg.fullName}`)
            : (isAmharic ? `ማመልከቻው በስራ አስኪያጅ ጸድቋል: ${reg.fullName}` : `Application Approved by Manager: ${reg.fullName}`),
          description: isAmharic
            ? `ለ ${reg.fullName} (${reg.plateNumber || 'ሰሌዳ'}) የቀረበው ማመልከቻ ጸድቋል፤ የባጅ/ሰሌዳ ፈቃድ ማተም ይችላሉ።`
            : `Registration for ${reg.fullName} (${reg.plateNumber || 'Plate'}) was approved by manager. Ready for permit issue.`,
          time: reg.registrationDate,
          type: 'print_order',
          icon: 'check_circle',
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          badgeLabel: isAmharic ? 'በስራ አስኪያጅ ጸድቋል' : 'Approved by Manager',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-700 dark:text-emerald-300',
          actionPage: 'tables',
          actionTab: 'approved',
        });
      }

      // Rejected / Correction Needed submissions notification for Clerks
      const rejectedRegs = registrations.filter((r) => r.status === 'rejected');
      if (rejectedRegs.length > 1) {
        list.push({
          id: `rejected_regs_summary_${rejectedRegs.length}`,
          title: isAmharic
            ? `${rejectedRegs.length} ማመልከቻዎች ማስተካከያ ይፈልጋሉ (ውድቅ ተደርገዋል)`
            : `${rejectedRegs.length} Applications Require Correction (Rejected)`,
          description: isAmharic
            ? 'በስራ አስኪያጅ አስተያየት ተሰጥቶባቸው የተመለሱ ማመልከቻዎች፤ እባክዎን በCorrection Table አስተካክለው ድጋሚ ያቅርቡ።'
            : 'Applications returned by manager with correction notes. Please update and resubmit in Submission Correction table.',
          type: 'flagged_inspection',
          icon: 'published_with_changes',
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          badgeLabel: isAmharic ? 'ማስተካከያ ይፈልጋል' : 'Needs Correction',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-700 dark:text-rose-300',
          actionPage: 'today_submissions_adjust',
          actionTab: 'pending',
          subItems: rejectedRegs.map((reg) => ({
            id: `sub_rejected_${reg.id}`,
            title: `${reg.fullName} (${reg.plateNumber || reg.id})`,
            description: reg.rejectionReason
              ? (isAmharic ? `ምክንያት: ${reg.rejectionReason}` : `Reason: ${reg.rejectionReason}`)
              : (isAmharic ? 'ምክንያት: ሰነዶች አልሟሉም ወይም ማስተካከያ ይፈልጋል' : 'Reason: Documents incomplete or require correction'),
            time: reg.registrationDate,
            actionPage: 'today_submissions_adjust',
            actionTab: 'pending',
          })),
        });
      } else if (rejectedRegs.length === 1) {
        const reg = rejectedRegs[0];
        const reasonText = reg.rejectionReason
          ? (isAmharic ? `የስራ አስኪያጅ አስተያየት: ${reg.rejectionReason}` : `Manager Rejection Reason: ${reg.rejectionReason}`)
          : (isAmharic ? 'የስራ አስኪያጅ አስተያየት: ሰነዶች አልሟሉም ወይም ማስተካከያ ይፈልጋል' : 'Manager Rejection Reason: Documents incomplete or require correction');

        list.push({
          id: `reg_rejected_single_${reg.id}`,
          title: isAmharic
            ? `ማስተካከያ ይፈልጋል (ውድቅ): ${reg.fullName} (${reg.plateNumber || 'ሰሌዳ'})`
            : `Correction Required (Rejected): ${reg.fullName} (${reg.plateNumber || 'Plate'})`,
          description: reasonText,
          time: reg.registrationDate,
          type: 'flagged_inspection',
          icon: 'published_with_changes',
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          badgeLabel: isAmharic ? 'ማስተካከያ ይፈልጋል' : 'Needs Correction',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-700 dark:text-rose-300',
          actionPage: 'today_submissions_adjust',
          actionTab: 'pending',
        });
      }

      // Pending print batches ready for card printing
      const pendingPrints = printOrders.filter((p) => p.status === 'pending' || p.status === 'in_printing');
      if (pendingPrints.length > 0) {
        list.push({
          id: `print_orders_clerk_${pendingPrints.length}`,
          title: isAmharic
            ? `${pendingPrints.length} የህትመት ትዕዛዞች ለማተም ዝግጁ ናቸው`
            : `${pendingPrints.length} Permit Batches Ready for Printing`,
          description: isAmharic
            ? 'የተረጋገጡ የባጅና የሰሌዳ ፈቃድ ህትመቶች በህትመት ክፍል ይገኛሉ።'
            : 'Approved permit cards and plates queued in the printing workstation.',
          type: 'print_order',
          icon: 'print',
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          badgeLabel: isAmharic ? 'የህትመት ክፍል' : 'Print Queue',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-700 dark:text-emerald-300',
          actionPage: 'tables',
          actionTab: 'approved',
        });
      }
    }

    // =========================================================================
    // 3. RECIPIENT: FIELD PATROL OFFICER (Patrol & Verification)
    // Receive duty updates and new approved plates in their subcity to verify on road.
    // =========================================================================
    if (isOfficer) {
      const matchingOfficer = officers.find(
        (o) => o.badgeId === userBadgeId || o.id === userBadgeId || o.phone === userBadgeId
      );
      const subCityAssigned = matchingOfficer?.subCity || 'ባህር ዳር ዙሪያ / Bahir Dar';
      const zoneAssigned = matchingOfficer?.assignedZone || 'ዋና ዋና የመንገድ ኮሪደሮች';

      // Active Duty Sector
      list.push({
        id: `officer_assignment_${userBadgeId || 'active'}`,
        title: isAmharic
          ? `የኦፊሰር የጥበቃ ምድብ - ${subCityAssigned}`
          : `Patrol Duty Assignment - ${subCityAssigned}`,
        description: isAmharic
          ? `የተመደበ ቀጠና: ${zoneAssigned} | የኦፊሰር ሁኔታ: በሜዳ ፍተሻ ላይ`
          : `Assigned Patrol Sector: ${zoneAssigned} | Officer Status: Active Patrol`,
        type: 'info',
        icon: 'local_police',
        iconBg: 'bg-[#3C50E0]/15 text-[#3C50E0] dark:text-blue-300',
        badgeLabel: isAmharic ? 'የስራ ምድብ' : 'On Patrol Duty',
        badgeBg: 'bg-[#3C50E0]/20',
        badgeText: 'text-[#3C50E0] dark:text-blue-300',
        actionPage: 'scan',
      });

      // Show recent approved permits in officer's subcity so officer can verify active plate numbers
      const newlyApprovedInSubCity = registrations.filter((r) => r.status === 'approved');
      if (newlyApprovedInSubCity.length > 0) {
        list.push({
          id: `officer_approved_plates_${newlyApprovedInSubCity.length}`,
          title: isAmharic
            ? `${newlyApprovedInSubCity.length} አዳዲስ ህጋዊ ሰሌዳዎች ተመዝግበዋል`
            : `${newlyApprovedInSubCity.length} Newly Registered Plates Active`,
          description: isAmharic
            ? 'በክፍለ ከተማዎ አዳዲስ የሞተር ፈቃዶችና ሰሌዳዎች በስራ አስኪያጅ ጸድቀው ስራ ላይ ውለዋል።'
            : 'Newly approved motor permits and plate numbers registered for verification on road.',
          type: 'info',
          icon: 'verified',
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          badgeLabel: isAmharic ? 'ህጋዊ ሰሌዳዎች' : 'Active Plates',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-700 dark:text-emerald-300',
          actionPage: 'scan',
        });
      }
    }

    // =========================================================================
    // 4. RECIPIENT: IT SPECIALIST / SYSTEM ADMINISTRATOR
    // System performance, unassigned officers, database maintenance.
    // =========================================================================
    if (isItSpecialist) {
      const unassignedOfficers = officers.filter((o) => !o.subCity || o.status === 'inactive');
      if (unassignedOfficers.length > 0) {
        list.push({
          id: `unassigned_officers_${unassignedOfficers.length}`,
          title: isAmharic
            ? `${unassignedOfficers.length} ያልተመደቡ ወይም ያልነቁ ኦፊሰሮች`
            : `${unassignedOfficers.length} Unassigned / Inactive Officers`,
          description: isAmharic
            ? 'አዳዲስ ኦፊሰሮችን ወደ ክፍለ ከተማ ወይም የጥበቃ ቀጠና ይመድቡ።'
            : 'Assign registered patrol officers to sub-cities and active patrol sectors.',
          type: 'info',
          icon: 'manage_accounts',
          iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
          badgeLabel: isAmharic ? 'ስርዓት አስተዳደር' : 'System Governance',
          badgeBg: 'bg-purple-500/20',
          badgeText: 'text-purple-700 dark:text-purple-300',
          actionPage: 'superadmin_users',
        });
      }
    }

    // Filter out items cleared by user
    return list.filter((item) => !clearedNotificationIds.has(item.id));
  }, [
    userRole,
    userBadgeId,
    officers,
    settings,
    registrations,
    verificationLogs,
    unregisteredReports,
    printOrders,
    paymentReceipts,
    clearedNotificationIds,
    isAmharic,
  ]);

  const unreadNotificationCount = useMemo(() => {
    return systemNotifications.filter((n) => !readNotificationIds.has(n.id)).length;
  }, [systemNotifications, readNotificationIds]);

  const handleMarkAllNotificationsAsRead = useCallback(() => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev);
      systemNotifications.forEach((n) => next.add(n.id));
      const readArr = Array.from(next) as string[];
      const clearedArr = Array.from(clearedNotificationIds) as string[];
      saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
      try {
        localStorage.setItem(readStorageKey, JSON.stringify(readArr));
      } catch (e) {}
      return next;
    });
  }, [systemNotifications, clearedNotificationIds, userNotificationScope, readStorageKey]);

  const handleClearAllNotifications = useCallback(() => {
    setClearedNotificationIds((prev) => {
      const next = new Set(prev);
      systemNotifications.forEach((n) => next.add(n.id));
      const readArr = Array.from(readNotificationIds) as string[];
      const clearedArr = Array.from(next) as string[];
      saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
      try {
        localStorage.setItem(clearedStorageKey, JSON.stringify(clearedArr));
      } catch (e) {}
      return next;
    });
  }, [systemNotifications, readNotificationIds, userNotificationScope, clearedStorageKey]);

  const handleSelectNotification = useCallback(
    (item: any) => {
      // Mark selected notification (and parent item if applicable) as read in DB & local state
      setReadNotificationIds((prev) => {
        const next = new Set(prev);
        if (item.id) next.add(item.id);
        if (item.parentId) next.add(item.parentId);
        const readArr = Array.from(next) as string[];
        const clearedArr = Array.from(clearedNotificationIds) as string[];
        saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
        try {
          localStorage.setItem(readStorageKey, JSON.stringify(readArr));
        } catch (e) {}
        return next;
      });

      // Close dropdown
      setIsNotificationOpen(false);

      // Navigate to destination
      if (item.actionTab && (item.actionTab === 'pending' || item.actionTab === 'approved')) {
        setTableInitialTab(item.actionTab);
      }
      if (item.actionPage) {
        setActivePage(item.actionPage);
      }
    },
    [setActivePage, setTableInitialTab, clearedNotificationIds, userNotificationScope, readStorageKey]
  );

  // Toasts Notification State
  interface ToastItem {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    title?: string;
    tag?: string;
  }

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'success',
    options?: { title?: string; tag?: string }
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [
      ...prev,
      {
        id,
        message,
        type,
        title: options?.title,
        tag: options?.tag,
      },
    ]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Handlers for Firestore database updates
  const handleAddVerificationLog = async (newLog: VerificationLog, isNoteUpdate: boolean = false) => {
    try {
      await saveVerificationLogToDb(newLog);
      // Removed auto-save notification toast as requested
    } catch (err) {
      addToast(
        isAmharic ? 'የፍተሻ ማህደር ማስቀመጥ አልተሳካም!' : 'Failed to save verification log to database!',
        'error'
      );
    }
  };

  const handleAddUnregisteredReport = async (report: UnregisteredVehicleReport) => {
    try {
      await saveUnregisteredReportToDb(report);
      addToast(
        isAmharic ? 'የባልተመዘገበ ተሽከርካሪ ሪፖርት በተሳካ ሁኔታ ተመዝግቧል!' : 'Unregistered vehicle report saved successfully!',
        'success'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'ሪፖርቱን ማስቀመጥ አልተሳካም!' : 'Failed to save unregistered report!',
        'error'
      );
    }
  };

  const handleUpdateUnregisteredReportStatus = async (
    id: string,
    status: 'pending' | 'under_investigation' | 'registered' | 'resolved',
    notes?: string
  ) => {
    try {
      await updateUnregisteredReportStatusInDb(id, status, notes);
      addToast(
        isAmharic ? 'የሪፖርቱ ሁኔታ ተዘምኗል!' : 'Report status updated successfully!',
        'success'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'የሪፖርቱን ሁኔታ ማዘመን አልተሳካም!' : 'Failed to update report status!',
        'error'
      );
    }
  };

  const handleAddPaymentReceipt = async (receipt: PaymentReceipt) => {
    try {
      await savePaymentReceiptToDb(receipt);
      addToast(
        isAmharic
          ? `የክፍያ ደረሰኝ ቁጥር ${receipt.receiptNumber} በተሳካ ሁኔታ ተመዝግቧል!`
          : `Payment receipt #${receipt.receiptNumber} registered successfully!`,
        'success',
        {
          title: isAmharic ? 'የክፍያ ደረሰኝ ተመዝግቧል' : 'Receipt Registered Successfully',
          tag: `#${receipt.receiptNumber}`,
        }
      );
    } catch (err) {
      addToast(
        isAmharic ? 'የክፍያ ደረሰኙን ማስቀመጥ አልተሳካም!' : 'Failed to save payment receipt!',
        'error'
      );
    }
  };

  const handleDeletePaymentReceipt = async (id: string) => {
    try {
      await deletePaymentReceiptFromDb(id);
      addToast(
        isAmharic ? 'የክፍያ ደረሰኙ ተሰርዟል!' : 'Payment receipt deleted successfully!',
        'info'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'የክፍያ ደረሰኙን መሰረዝ አልተሳካም!' : 'Failed to delete payment receipt!',
        'error'
      );
    }
  };

  const handleAddRegistration = async (
    newReg: MotorcycleRegistration,
    options?: { forceLocalOnly?: boolean }
  ) => {
    try {
      const res = await saveRegistrationToDb(newReg, options);
      if (res.success) {
        addToast(
          isAmharic
            ? `የ ${newReg.fullName} ምዝገባ በተሳካ ሁኔታ በዳታቤዝ ተቀምጧል!`
            : `Registration for ${newReg.fullName} stored successfully in Database!`,
          'success'
        );
      } else {
        addToast(
          isAmharic ? 'የኦንላይን ዳታቤዝ ማስቀመጥ አልተሳካም!' : 'Online database save failed!',
          'error'
        );
      }
      return res;
    } catch (err) {
      addToast(
        isAmharic ? 'ምዝገባውን ማስቀመጥ አልተሳካም!' : 'Failed to store registration!',
        'error'
      );
      return { success: false, error: 'Save failed' };
    }
  };

  const handleApproveRegistration = async (id: string) => {
    try {
      await updateRegistrationStatusInDb(id, 'approved');
      addToast(
        isAmharic
          ? `የምዝገባ መለያ ${id} በዳታቤዝ ውስጥ ጸድቋል!`
          : `Registration ${id} approved successfully in database!`,
        'success'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'ማጽደቅ አልተሳካም!' : 'Failed to approve registration!',
        'error'
      );
    }
  };

  const handleRejectRegistration = async (id: string, reason: string) => {
    try {
      await updateRegistrationStatusInDb(id, 'rejected', reason);
      addToast(
        isAmharic
          ? `የምዝገባ መለያ ${id} ውድቅ ተደርጓል!`
          : `Registration ${id} rejected in database!`,
        'info'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'ውድቅ ማድረግ አልተሳካም!' : 'Failed to reject registration!',
        'error'
      );
    }
  };

  const handleAddOfficerAssignment = async (assignment: OfficerAssignment) => {
    try {
      await saveOfficerToDb(assignment);
      addToast(
        isAmharic
          ? `ኦፊሰር ${assignment.officerName} በተሳካ ሁኔታ ተመድቧል!`
          : `Officer ${assignment.officerName} successfully assigned and saved to database!`,
        'success'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'ምደባውን ማስቀመጥ አልተሳካም!' : 'Failed to save assignment in database!',
        'error'
      );
    }
  };

  const handleCreatePrintOrder = async (registrationIds: string[], notes: string) => {
    try {
      const newOrder: PrintBatchOrder = {
        id: `BATCH-PRINT-${Math.floor(900 + Math.random() * 99)}`,
        orderDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
        registrationIds,
        status: 'pending',
        notes,
        totalItems: registrationIds.length,
        totalCount: registrationIds.length,
        updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      };
      await savePrintOrderToDb(newOrder);
      addToast(
        isAmharic
          ? 'የሕትመት ትእዛዝ በተሳካ ሁኔታ ተፈጥሯል!'
          : 'Batch print order created successfully in database!',
        'success'
      );
    } catch (err) {
      addToast(
        isAmharic ? 'የሕትመት ትእዛዝ መፍጠር አልተሳካም!' : 'Failed to create print order!',
        'error'
      );
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: 'pending' | 'in_printing' | 'completed'
  ) => {
    await updatePrintOrderStatusInDb(orderId, status);

    if (status === 'completed') {
      const order = printOrders.find((o) => o.id === orderId);
      if (order) {
        for (const regId of order.registrationIds) {
          await updateRegistrationStatusInDb(regId, 'printed');
        }
      }
    }
  };

  const handleQuickAction = (actionKey: string) => {
    if (actionKey === 'today_submissions_adjust') {
      setActivePage('today_submissions_adjust');
    } else if (actionKey === 'quick_verify') {
      setActivePage('scan');
    } else if (actionKey === 'approved_vehicles' || actionKey === 'kpi_approved') {
      setTableInitialTab('approved');
      setActivePage('tables');
    } else if (actionKey === 'pending_approvals' || actionKey === 'kpi_pending') {
      setTableInitialTab('pending');
      setActivePage('tables');
    } else if (actionKey === 'kpi_expired' || actionKey === 'rejected_vehicles') {
      setTableInitialTab('expired');
      setActivePage('tables');
    } else if (
      actionKey === 'officer_logs_today' ||
      actionKey === 'inspection_report_all' ||
      actionKey === 'inspection_report' ||
      actionKey === 'inspection_report_full' ||
      actionKey === 'verification_logs'
    ) {
      setInspectionInitialFilter('all');
      setActivePage('inspection_report');
    } else if (actionKey === 'officer_logs_verified') {
      setInspectionInitialFilter('verified');
      setActivePage('inspection_report');
    } else if (actionKey === 'officer_logs_warning') {
      setInspectionInitialFilter('warning');
      setActivePage('inspection_report');
    } else if (actionKey === 'officer_logs_flagged') {
      setInspectionInitialFilter('flagged');
      setActivePage('inspection_report');
    } else if (actionKey === 'report_unregistered') {
      setActivePage('report_unregistered');
    } else if (
      actionKey === 'unregistered_list' ||
      actionKey === 'unregistered_reports' ||
      actionKey === 'unregistered_reports_list'
    ) {
      setActivePage('unregistered_list');
    } else if (actionKey === 'payment_receipts') {
      setActivePage('payment_receipts');
    } else if (actionKey === 'superadmin_users') {
      setActivePage('superadmin_users');
    } else if (actionKey === 'superadmin_subcities') {
      setActivePage('superadmin_subcities');
    } else if (actionKey === 'superadmin_security') {
      setActivePage('superadmin_security');
    } else if (actionKey === 'superadmin_permits') {
      setActivePage('superadmin_permits');
    } else if (actionKey === 'superadmin_maintenance') {
      setActivePage('superadmin_maintenance');
    } else if (
      actionKey === 'new_registration' ||
      actionKey === 'deploy_officer' ||
      actionKey === 'batch_print'
    ) {
      setActivePage('forms');
    } else if (
      actionKey === 'view_submissions' ||
      actionKey === 'vehicle_directory' ||
      actionKey === 'system_records' ||
      actionKey === 'officers_directory' ||
      actionKey === 'print_history'
    ) {
      setActivePage('tables');
    } else if (
      actionKey === 'print_queue' ||
      actionKey === 'inspect_proofs' ||
      actionKey === 'checkpoint_status'
    ) {
      setActivePage('workstation');
    }
  };

  // Side Menu double tap/click handler for Super Admin (triggers Registered Owners table & search bar)
  const lastSideMenuTapRef = React.useRef<{ time: number; itemKey: string }>({ time: 0, itemKey: '' });

  const handleSideMenuClick = (targetPage: any, itemKey: string = targetPage) => {
    if (userRole === 'superadmin') {
      const now = Date.now();
      const diff = now - lastSideMenuTapRef.current.time;
      if (diff < 400 && lastSideMenuTapRef.current.itemKey === itemKey) {
        // Double tap or double click detected on side menu for super admin!
        setActivePage('superadmin_owners' as any);
        setIsMobileMenuOpen(false);
        lastSideMenuTapRef.current = { time: 0, itemKey: '' };
        return;
      }
      lastSideMenuTapRef.current = { time: now, itemKey };
    }
    setActivePage(targetPage);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="h-screen h-[100dvh] max-h-screen max-h-[100dvh] overflow-hidden bg-surface text-on-surface flex flex-col font-sans">
      {/* ==================== DESKTOP SIDEBAR NAVIGATION (hidden md:flex) ==================== */}
      <aside 
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'ASIDE' || target.closest('#desktop-header-text') || target.closest('.sidebar-logo-container')) {
            setIsSidebarCollapsed(!isSidebarCollapsed);
          }
        }}
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:z-50 md:bg-[#1C2434] md:text-[#DEE4EE] md:border-r md:border-[#2E3A47] md:justify-between md:shadow-2xl transition-all duration-300 ease-in-out select-none ${
          isCollapsed ? 'md:w-16 md:p-2 items-center' : 'md:w-64 md:p-3.5'
        }`}
      >
        <div className="flex flex-col h-full min-h-0 w-full">
          {/* Desktop Brand & Logo Header */}
          <div
            onClick={() => handleSideMenuClick('dashboard', 'dashboard')}
            className={`flex items-center cursor-pointer hover:opacity-95 transition-all select-none sidebar-logo-container ${
              isCollapsed ? 'justify-center p-0.5 mb-4' : 'gap-2.5 px-1 py-0.5 mb-3.5'
            }`}
            title={isAmharic ? 'ወደ ዋና ገፅ ሂድ (ለመቀየር ጠቅ ያድርጉ)' : 'Go to Dashboard (Click to toggle sidebar)'}
          >
            <div className="w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center shrink-0 overflow-hidden border border-white/20">
              <img src={APP_LOGO} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <h1 id="desktop-header-text" className={`text-white leading-tight truncate whitespace-nowrap ${isAmharic ? 'font-black text-sm lg:text-[14px]' : 'font-black text-xs lg:text-[13px] tracking-tight'}`}>
                  {isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር' : 'BAHIRDAR MOTORIST ASSOCIATION'}
                </h1>
                <p className="text-[10px] text-[#8A99AD] font-medium tracking-wide">
                  {isAmharic ? 'የሞተር ብስክሌት ማህበር' : 'Motorist Admin System'}
                </p>
              </div>
            )}
          </div>

          {/* Desktop Main Menu Items Navigation List */}
          <nav className="flex-1 overflow-y-auto space-y-2 pr-0.5 scrollbar-thin scrollbar-thumb-[#333A48] w-full">
            {/* GROUP 1: OVERVIEW */}
            <div>
              {!isCollapsed ? (
                <p className="text-[10.5px] font-semibold text-[#8A99AD] uppercase tracking-wider px-2.5 mb-1 flex items-center gap-1.5">
                  <Icon className="material-symbols-outlined text-[13px] shrink-0">dashboard</Icon>
                  <span>{isAmharic ? 'ዋና ማውጫ' : 'Menu'}</span>
                </p>
              ) : (
                <div className="border-b border-[#2E3A47] my-1.5" />
              )}
              <button
                type="button"
                onClick={() => handleSideMenuClick('dashboard', 'dashboard')}
                onDoubleClick={() => {
                  if (userRole === 'superadmin') {
                    setActivePage('superadmin_owners' as any);
                  }
                }}
                className={`w-full flex items-center rounded-sm text-xs lg:text-[13px] font-medium transition-all cursor-pointer whitespace-nowrap truncate active:scale-[0.98] ${
                  isCollapsed ? 'justify-center p-2' : 'gap-2 px-2.5 py-2'
                } ${
                  activePage === 'dashboard'
                    ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                    : 'text-[#DEE4EE] hover:text-white hover:bg-[#333A48]'
                }`}
                title={isAmharic ? 'ዋና ገፅ' : 'Dashboard'}
              >
                <Icon className={`material-symbols-outlined text-[17px] shrink-0 ${activePage === 'dashboard' ? 'text-[#3C50E0]' : ''}`}>space_dashboard</Icon>
                {!isCollapsed && <span className="truncate">{isAmharic ? 'ዋና ገፅ' : 'Dashboard'}</span>}
              </button>
            </div>

            {/* GROUP 2: REGISTRATIONS & PERMITS (Expandable Accordion Submenu) */}
            <div className="pt-1 border-t border-[#2E3A47]">
              <button
                type="button"
                onClick={() => toggleGroup('registrations')}
                className={`w-full flex items-center justify-between rounded-sm text-[11px] font-semibold uppercase tracking-wider text-[#8A99AD] hover:text-white hover:bg-[#333A48] active:scale-[0.98] transition-all cursor-pointer select-none ${
                  isCollapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
                }`}
                title={isAmharic ? 'ምዝገባ እና ፈቃዶች' : 'Registrations & Permits'}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Icon className="material-symbols-outlined text-[15px] shrink-0">assignment</Icon>
                  {!isCollapsed && <span className="truncate">{isAmharic ? 'ምዝገባ እና ፈቃዶች' : 'Registrations & Permits'}</span>}
                </div>
                {!isCollapsed && (
                  <Icon className={`material-symbols-outlined text-[15px] transition-transform duration-200 shrink-0 ${expandedGroups.registrations ? 'rotate-180 text-[#3C50E0]' : 'text-[#8A99AD]'}`}>
                    expand_more
                  </Icon>
                )}
              </button>

              <div className={`collapsible-grid ${expandedGroups.registrations && !isCollapsed ? 'expanded' : ''}`}>
                <div className="collapsible-grid-inner">
                  <div className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-[#2E3A47] ml-2.5 py-0.5">
                    {userRole === 'clerk' ? (
                      <>
                        {(settings.showClerkNewRegistrationAction ?? true) && isTaskViewable(userRole, 1) && (
                          <button
                            type="button"
                            onClick={() => setActivePage('forms')}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'forms'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0">app_registration</Icon>
                            <span>{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
                          </button>
                        )}

                        {(settings.showClerkEditSubmissionAction ?? true) && isTaskViewable(userRole, 2) && (
                          <button
                            type="button"
                            onClick={() => setActivePage('today_submissions_adjust')}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'today_submissions_adjust'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0">edit_note</Icon>
                            <span>{isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction'}</span>
                          </button>
                        )}

                        {settings.showClerkSubmissionsAction && isTaskViewable(userRole, 8) && (
                          <button
                            type="button"
                            onClick={() => setActivePage('tables')}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'tables'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0">folder_open</Icon>
                            <span>{isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'}</span>
                          </button>
                        )}

                        {settings.showClerkApprovedVehiclesAction && isTaskViewable(userRole, 8) && (
                          <button
                            type="button"
                            onClick={() => {
                              setTableInitialTab('approved');
                              setActivePage('tables');
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'tables'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0">verified</Icon>
                            <span>{isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Registry'}</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {userRole !== 'officer' && isTaskViewable(userRole, 1) && (
                          <button
                            type="button"
                            onClick={() => setActivePage('forms')}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'forms'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0">app_registration</Icon>
                            <span>{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
                          </button>
                        )}

                        {userRole !== 'officer' && isTaskViewable(userRole, 2) && (
                          <button
                            type="button"
                            onClick={() => setActivePage('today_submissions_adjust')}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'today_submissions_adjust'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0 text-amber-400">edit_note</Icon>
                            <span>
                              {isAmharic
                                ? (['admin', 'superadmin', 'super_admin', 'manager'].includes(userRole) ? 'የቀረቡ ማስተካከያዎች' : 'ማመልከቻ ማስተካከያ')
                                : (['admin', 'superadmin', 'super_admin', 'manager'].includes(userRole) ? 'Submitted Corrections' : 'Submission Correction')}
                            </span>
                          </button>
                        )}

                        {userRole !== 'officer' && isTaskViewable(userRole, 8) && (
                          <button
                            type="button"
                            onClick={() => setActivePage('tables')}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                              activePage === 'tables'
                                ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                                : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                            }`}
                          >
                            <Icon className="material-symbols-outlined text-[16px] shrink-0">table_chart</Icon>
                            <span>{isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Tables'}</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* GROUP 3: VERIFICATION & PATROL (Expandable Accordion Submenu) */}
            <div className="pt-1 border-t border-[#2E3A47]">
              <button
                type="button"
                onClick={() => toggleGroup('verification')}
                className={`w-full flex items-center justify-between rounded-sm text-[11px] font-semibold uppercase tracking-wider text-[#8A99AD] hover:text-white hover:bg-[#333A48] active:scale-[0.98] transition-all cursor-pointer select-none ${
                  isCollapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
                }`}
                title={isAmharic ? 'ቁጥጥር እና ፍተሻ' : 'Verification & Patrol'}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Icon className="material-symbols-outlined text-[15px] shrink-0">security</Icon>
                  {!isCollapsed && <span className="truncate">{isAmharic ? 'ቁጥጥር እና ፍተሻ' : 'Verification & Patrol'}</span>}
                </div>
                {!isCollapsed && (
                  <Icon className={`material-symbols-outlined text-[15px] transition-transform duration-200 shrink-0 ${expandedGroups.verification ? 'rotate-180 text-[#3C50E0]' : 'text-[#8A99AD]'}`}>
                    expand_more
                  </Icon>
                )}
              </button>

              <div className={`collapsible-grid ${expandedGroups.verification && !isCollapsed ? 'expanded' : ''}`}>
                <div className="collapsible-grid-inner">
                  <div className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-[#2E3A47] ml-2.5 py-0.5">
                    {isTaskViewable(userRole, 5) && (
                      <button
                        type="button"
                        onClick={() => setActivePage('scan')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'scan'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[16px] shrink-0">qr_code_scanner</Icon>
                        <span>{isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}</span>
                      </button>
                    )}

                    {isTaskViewable(userRole, 10) && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectionInitialFilter('all');
                          setActivePage('inspection_report');
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'inspection_report'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[16px] shrink-0">analytics</Icon>
                        <span>{isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report'}</span>
                      </button>
                    )}

                    {userRole !== 'clerk' && (
                      <button
                        type="button"
                        onClick={() => setActivePage('report_unregistered')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'report_unregistered'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[16px] text-amber-400 shrink-0">report_problem</Icon>
                        <span>{isAmharic ? 'ባልተመዘገበ ተሽከርካሪ ሪፖርት' : 'Report Unregistered'}</span>
                      </button>
                    )}

                    {userRole !== 'clerk' && (userRole === 'admin' || userRole === 'superadmin' || (userRole as string) === 'super_admin') && (
                      <button
                        type="button"
                        onClick={() => setActivePage('unregistered_list')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'unregistered_list'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[16px] text-red-400 shrink-0">policy</Icon>
                        <span>{isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* GROUP 4: SUPER ADMIN GOVERNANCE (Expandable Accordion Submenu) */}
            {userRole === 'superadmin' && (
              <div className="pt-1 border-t border-[#2E3A47]">
                <button
                  type="button"
                  onClick={() => toggleGroup('superadmin')}
                  className={`w-full flex items-center justify-between rounded-sm text-[11px] font-semibold uppercase tracking-wider text-[#8A99AD] hover:text-white hover:bg-[#333A48] active:scale-[0.98] transition-all cursor-pointer select-none ${
                    isCollapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
                  }`}
                  title={isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin'}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Icon className="material-symbols-outlined text-[15px] shrink-0">admin_panel_settings</Icon>
                    {!isCollapsed && <span className="truncate">{isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin'}</span>}
                  </div>
                  {!isCollapsed && (
                    <Icon className={`material-symbols-outlined text-[15px] transition-transform duration-200 shrink-0 ${expandedGroups.superadmin ? 'rotate-180 text-[#3C50E0]' : 'text-[#8A99AD]'}`}>
                      expand_more
                    </Icon>
                  )}
                </button>

                <div className={`collapsible-grid ${expandedGroups.superadmin && !isCollapsed ? 'expanded' : ''}`}>
                  <div className="collapsible-grid-inner">
                    <div className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-[#2E3A47] ml-2.5 py-0.5">
                      <button
                        type="button"
                        onClick={() => setActivePage('superadmin_users')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'superadmin_users' || activePage === 'superadmin'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[15px] shrink-0">manage_accounts</Icon>
                        <span>{isAmharic ? 'ሚና እና ፈቃድ' : 'Roles & Permissions'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActivePage('superadmin_subcities')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'superadmin_subcities'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[15px] shrink-0">location_city</Icon>
                        <span>{isAmharic ? 'የክፍለ ከተማ ቁጥጥር' : 'Sub-City Governance'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActivePage('superadmin_permits')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'superadmin_permits'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[15px] shrink-0">workspace_premium</Icon>
                        <span>{isAmharic ? 'የፈቃድ ቁጥጥር' : 'Master Permit Rules'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActivePage('superadmin_maintenance')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'superadmin_maintenance'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[15px] shrink-0">storage</Icon>
                        <span>{isAmharic ? 'የሲስተም ጥገና' : 'System Maintenance'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActivePage('payment_receipts')}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                          activePage === 'payment_receipts'
                            ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                            : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[15px] text-emerald-400 shrink-0">receipt_long</Icon>
                        <span>{isAmharic ? 'የገቢዎች ማህደር' : 'Revenue Ledger'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* GROUP 5: SYSTEM & SETTINGS (Expandable Accordion Submenu) */}
            <div className="pt-1 border-t border-[#2E3A47]">
              <button
                type="button"
                onClick={() => toggleGroup('settings')}
                className={`w-full flex items-center justify-between rounded-sm text-[11px] font-semibold uppercase tracking-wider text-[#8A99AD] hover:text-white hover:bg-[#333A48] active:scale-[0.98] transition-all cursor-pointer select-none ${
                  isCollapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
                }`}
                title={isAmharic ? 'ቅንብሮችና ስርዓት' : 'System & Settings'}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Icon className="material-symbols-outlined text-[15px] shrink-0">settings</Icon>
                  {!isCollapsed && <span className="truncate">{isAmharic ? 'ቅንብሮችና ስርዓት' : 'System & Settings'}</span>}
                </div>
                {!isCollapsed && (
                  <Icon className={`material-symbols-outlined text-[15px] transition-transform duration-200 shrink-0 ${expandedGroups.settings ? 'rotate-180 text-[#3C50E0]' : 'text-[#8A99AD]'}`}>
                    expand_more
                  </Icon>
                )}
              </button>

              <div className={`collapsible-grid ${expandedGroups.settings && !isCollapsed ? 'expanded' : ''}`}>
                <div className="collapsible-grid-inner">
                  <div className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-[#2E3A47] ml-2.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActivePage('settings');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer active:scale-[0.98] ${
                        activePage === 'settings'
                          ? 'bg-[#333A48] text-white font-semibold shadow-2xs border-l-2 border-[#3C50E0]'
                          : 'text-[#8A99AD] hover:text-white hover:bg-[#333A48]/60'
                      }`}
                    >
                      <Icon className="material-symbols-outlined text-[16px] shrink-0">tune</Icon>
                      <span>{isAmharic ? 'ቅንብሮች' : 'Settings'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Sidebar Bottom Profile Card & Logout (TailAdmin Dark Card Style) */}
          <div className="pt-2 border-t border-[#2E3A47] space-y-1.5 mt-auto w-full">
            <div className={`bg-[#24303F] border border-[#2E3A47] rounded-sm text-white shadow-xs transition-all flex items-center ${
              isCollapsed ? 'p-1 justify-center' : 'p-2 gap-2'
            }`}>
              <div className="w-8 h-8 rounded-full bg-slate-700 border-2 border-[#3C50E0] shrink-0 overflow-hidden shadow-xs flex items-center justify-center">
                <img src={APP_LOGO} alt="User Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-white block truncate leading-tight">
                    {userBadgeId ? userBadgeId : (isAmharic ? 'አቶ መፈሪያ' : 'Mr. Meferiya')}
                  </span>
                  <span className="text-[10.5px] text-[#8A99AD] font-normal block truncate">
                    {userRole === 'superadmin' ? 'Super Admin' : userRole === 'admin' ? 'Manager' : userRole === 'clerk' ? 'Secretary' : 'Officer'}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                    <span className="text-[9.5px] text-[#10B981] font-medium">Online</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom TailAdmin Style Logout Button */}
            <button
              type="button"
              onClick={() => setIsLogoutModalOpen(true)}
              className={`w-full bg-[#24303F] hover:bg-[#333A48] text-[#DEE4EE] hover:text-white border border-[#2E3A47] font-medium text-xs rounded-sm flex items-center justify-center transition-all cursor-pointer active:scale-98 ${
                isCollapsed ? 'p-2' : 'py-1.5 gap-1.5'
              }`}
              title={isAmharic ? 'ወጣ (Logout)' : 'Logout'}
            >
              <Icon className="material-symbols-outlined text-[15px] text-[#F87171] shrink-0">logout</Icon>
              {!isCollapsed && <span>{isAmharic ? 'ወጣ (Logout)' : 'Logout'}</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN CONTAINER & TOP HEADER ==================== */}
      <div className={`flex-1 flex flex-col min-w-0 h-full max-h-full overflow-hidden transition-all duration-300 ease-in-out ${
        isCollapsed ? 'md:pl-16' : 'md:pl-64'
      }`}>
        
        {/* MOBILE NAVIGATION HEADER (md:hidden) */}
        <header className="sticky top-0 z-50 bg-[#1e293b] text-white shadow-md px-3 sm:px-6 py-2.5 md:hidden shrink-0 relative overflow-hidden">
          {/* Animated Navbar Action Loading Progress Bar (Under top navbar) */}
          {actionLoadingState.isLoading && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 overflow-hidden z-50 pointer-events-none">
              <div className="h-full bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 animate-navbar-progress rounded-full" />
            </div>
          )}

          <div className="relative z-50 max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
              
              {/* Left Logo & App Brand Title */}
              <div
                onClick={() => {
                  setActivePage('dashboard');
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2.5 min-w-0 shrink cursor-pointer hover:opacity-90 transition-opacity select-none"
                title={isAmharic ? 'ወደ ዋና ገፅ ሂድ' : 'Go to Dashboard'}
              >
                <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                  <img src={APP_LOGO} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                </div>
                <div className="min-w-0">
                  <h1 id="header-text" className={`text-white leading-tight truncate whitespace-nowrap ${isAmharic ? 'font-black text-sm sm:text-base md:text-lg tracking-normal' : 'font-black text-xs sm:text-sm md:text-base tracking-tight'}`}>
                    {isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር' : 'BAHIRDAR MOTORIST ASSOCIATION'}
                  </h1>
                </div>
              </div>

              {/* Center Navigation Tabs (Visible on Tablet / Medium screens md:flex) */}
              <nav className="hidden md:flex items-center gap-1 bg-black/20 p-1 rounded-md border border-white/20 shrink-0">
                <button
                  type="button"
                  onClick={() => setActivePage('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activePage === 'dashboard'
                      ? 'bg-yellow-500 text-[#1e293b] shadow-xs font-black'
                      : 'text-white/90 hover:bg-white/15'
                  }`}
                >
                  <Icon className="material-symbols-outlined text-[16px]">space_dashboard</Icon>
                  <span>{isAmharic ? 'ዋና ገፅ' : 'Dashboard'}</span>
                </button>

                {userRole !== 'officer' && (
                  <button
                    type="button"
                    onClick={() => setActivePage('forms')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activePage === 'forms'
                        ? 'bg-yellow-500 text-[#1e293b] shadow-xs font-black'
                        : 'text-white/90 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[16px]">how_to_reg</Icon>
                    <span>{isAmharic ? 'ምዝገባ' : 'Registration'}</span>
                  </button>
                )}

                {userRole !== 'officer' && (
                  <button
                    type="button"
                    onClick={() => setActivePage('tables')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activePage === 'tables'
                        ? 'bg-yellow-500 text-[#1e293b] shadow-xs font-black'
                        : 'text-white/90 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[16px]">table_chart</Icon>
                    <span>{isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records'}</span>
                  </button>
                )}

                {isTaskViewable(userRole, 10) && (
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionInitialFilter('all');
                      setActivePage('inspection_report');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activePage === 'inspection_report'
                        ? 'bg-yellow-500 text-[#1e293b] shadow-xs font-black'
                        : 'text-white/90 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[16px]">analytics</Icon>
                    <span>{isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection'}</span>
                  </button>
                )}

                {userRole !== 'clerk' && (
                  <button
                    type="button"
                    onClick={() => setActivePage('scan')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activePage === 'scan'
                        ? 'bg-yellow-500 text-[#1e293b] shadow-xs font-black'
                        : 'text-white/90 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[16px]">qr_code_scanner</Icon>
                    <span>{isAmharic ? 'ፍተሻ' : 'Scan'}</span>
                  </button>
                )}
              </nav>

              {/* Right Controls (BORDERLESS MENU TOGGLE BUTTON & NOTIFICATION BELL FOR MOBILE) */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Mobile Notification Bell Icon Button (Container removed for sleek mobile appearance) */}
                <div className="relative" ref={mobileNotificationRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotificationOpen(!isNotificationOpen);
                      if (isMobileMenuOpen) setIsMobileMenuOpen(false);
                    }}
                    className={`p-1.5 flex items-center justify-center transition-colors cursor-pointer shrink-0 relative touch-manipulation active:scale-90 ${
                      isNotificationOpen
                        ? 'text-yellow-400'
                        : 'text-white hover:text-yellow-400'
                    }`}
                    title={isAmharic ? 'ማሳወቂያዎች' : 'Notifications'}
                    aria-label="Notifications"
                  >
                    <Icon className="material-symbols-outlined text-[20px] sm:text-[22px]">notifications</Icon>
                    {unreadNotificationCount > 0 && (
                      <span className="bg-rose-500 text-white text-[10px] font-black min-w-[17px] h-4 px-1 rounded-full flex items-center justify-center absolute -top-0.5 -right-0.5 shadow-2xs border border-[#1e293b]">
                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* Mobile Drawer Menu Toggle (Container removed for sleek mobile appearance) */}
                <button
                  ref={mobileMenuButtonRef}
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(!isMobileMenuOpen);
                    if (isNotificationOpen) setIsNotificationOpen(false);
                  }}
                  aria-label="Toggle Navigation Menu"
                  className="p-1.5 flex items-center justify-center text-white hover:text-yellow-400 active:scale-90 touch-manipulation transition-colors cursor-pointer shrink-0"
                >
                  <Icon className="material-symbols-outlined text-[22px] sm:text-[24px]">
                    {isMobileMenuOpen ? 'close' : 'menu'}
                  </Icon>
                </button>
              </div>

            </div>
          </header>

        {/* Mobile Notification Modal / Drawer Overlay (Positioned directly under top header) */}
        {isNotificationOpen && (
          <div
            className="fixed top-[53px] sm:top-[57px] inset-x-0 bottom-0 z-40 bg-slate-950/65 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in md:hidden p-3 flex justify-center items-start"
            onClick={() => setIsNotificationOpen(false)}
          >
            <div
              ref={mobileNotificationModalRef}
              className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200 max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <NotificationDropdown
                notifications={systemNotifications}
                readIds={readNotificationIds}
                onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                onClearAll={handleClearAllNotifications}
                onSelectNotification={handleSelectNotification}
                onQuickAction={handleSelectNotification}
                onClose={() => setIsNotificationOpen(false)}
                isAmharic={isAmharic}
                isMobile={true}
              />
            </div>
          </div>
        )}

        {/* Mobile Backdrop & Right Slide-Out Drawer Menu (Positioned BELOW top header) */}
        <div
          className={`fixed top-[53px] sm:top-[57px] inset-x-0 bottom-0 z-40 bg-slate-950/65 backdrop-blur-md md:hidden flex justify-end side-menu-backdrop ${
            isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
          onPointerDown={() => setIsMobileMenuOpen(false)}
          onTouchStart={() => setIsMobileMenuOpen(false)}
        >
          {/* Right Slide-Out Drawer Panel (Optimized Width & Compact Padding for Mobile UI) */}
          <div
            ref={mobileDrawerRef}
            className={`relative w-64 sm:w-70 max-w-[80vw] h-full bg-[#1e293b] text-white border-l border-yellow-500/30 shadow-2xl flex flex-col justify-between overflow-y-auto p-3 sm:p-3.5 side-menu-drawer ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              {/* Mobile Simple Ethiopian Calendar Date & Time Widget */}
              <div className="bg-white/5 border border-yellow-500/20 rounded-lg p-2.5 text-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-yellow-400 font-extrabold text-xs">
                    <Icon className="material-symbols-outlined text-[17px]">calendar_month</Icon>
                    <span>{isAmharic ? ethDate.formattedAm : ethDate.formattedEn}</span>
                  </div>
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded font-black">
                    {isAmharic ? ethDate.weekdayAm : ethDate.weekdayEn}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-white/10 font-mono">
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                    <Icon className="material-symbols-outlined text-[14px]">schedule</Icon>
                    <span>{isAmharic ? ethDate.timeAm : ethDate.timeEn}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-extrabold">
                    GMT+3
                  </span>
                </div>
              </div>

              {/* Mobile Main Navigation Links */}
              <div className="space-y-2">
                <p className="text-[10px] font-extrabold text-yellow-400/80 uppercase tracking-wider px-1 mb-1">
                  {isAmharic ? 'ዋና ክፍሎች' : 'Navigation Pages'}
                </p>

                {/* Dashboard */}
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[42px] rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] active:bg-slate-700 ${
                    activePage === 'dashboard'
                      ? 'bg-yellow-500 text-[#1e293b] shadow-2xs font-black'
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`material-symbols-outlined text-[19px] ${activePage === 'dashboard' ? 'text-[#1e293b]' : 'text-yellow-400'}`}>
                      space_dashboard
                    </Icon>
                    <span className="font-extrabold text-xs">{isAmharic ? 'ዋና ገፅ' : 'Dashboard'}</span>
                  </div>
                  <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                </button>

                {/* Expandable Group: Registrations & Permits */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup('registrations')}
                    className="w-full flex items-center justify-between px-3 py-2.5 min-h-[40px] rounded-lg bg-white/5 border border-white/10 text-xs font-black uppercase text-yellow-400 hover:bg-white/15 active:scale-[0.98] transition-all cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="material-symbols-outlined text-[18px] text-yellow-400">assignment</Icon>
                      <span>{isAmharic ? 'ምዝገባ እና ፈቃዶች' : 'Registrations & Permits'}</span>
                    </div>
                    <Icon className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${expandedGroups.registrations ? 'rotate-180 text-yellow-400' : 'text-slate-400'}`}>
                      expand_more
                    </Icon>
                  </button>

                  <div className={`collapsible-grid ${expandedGroups.registrations ? 'expanded' : ''}`}>
                    <div className="collapsible-grid-inner">
                      <div className="mt-1 space-y-1 pl-2.5 border-l-2 border-yellow-500/30 ml-2 py-1">
                        {userRole === 'clerk' ? (
                          <>
                            {(settings.showClerkNewRegistrationAction ?? true) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePage('forms');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'forms'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-amber-400">app_registration</Icon>
                                  <span>{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}

                            {(settings.showClerkEditSubmissionAction ?? true) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePage('today_submissions_adjust');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'today_submissions_adjust'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-amber-400">edit_note</Icon>
                                  <span>{isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction'}</span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}

                            {settings.showClerkSubmissionsAction && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePage('tables');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'tables'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-blue-400">folder_open</Icon>
                                  <span>{isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'}</span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}

                            {settings.showClerkApprovedVehiclesAction && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTableInitialTab('approved');
                                  setActivePage('tables');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'tables'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-emerald-400">verified</Icon>
                                  <span>{isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Registry'}</span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {userRole !== 'officer' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePage('forms');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'forms'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-amber-400">app_registration</Icon>
                                  <span>{isAmharic ? 'ምዝገባ' : 'Registration'}</span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}

                            {userRole !== 'officer' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePage('today_submissions_adjust');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'today_submissions_adjust'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-amber-400">edit_note</Icon>
                                  <span>
                                    {isAmharic
                                      ? (['admin', 'superadmin', 'super_admin', 'manager'].includes(userRole) ? 'የቀረቡ ማስተካከያዎች' : 'ማመልከቻ ማስተካከያ')
                                      : (['admin', 'superadmin', 'super_admin', 'manager'].includes(userRole) ? 'Submitted Corrections' : 'Submission Correction')}
                                  </span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}

                            {userRole !== 'officer' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePage('tables');
                                  setIsMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                                  activePage === 'tables'
                                    ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Icon className="material-symbols-outlined text-[18px] text-blue-400">table_chart</Icon>
                                  <span>{isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Database'}</span>
                                </div>
                                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expandable Group: Verification & Patrol */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup('verification')}
                    className="w-full flex items-center justify-between px-2.5 py-2 min-h-[38px] rounded-lg bg-white/5 border border-white/10 text-xs font-black uppercase text-yellow-400 hover:bg-white/15 active:scale-[0.98] transition-all cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="material-symbols-outlined text-[18px] text-yellow-400">security</Icon>
                      <span>{isAmharic ? 'ቁጥጥር እና ፍተሻ' : 'Verification & Patrol'}</span>
                    </div>
                    <Icon className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${expandedGroups.verification ? 'rotate-180 text-yellow-400' : 'text-slate-400'}`}>
                      expand_more
                    </Icon>
                  </button>

                  <div className={`collapsible-grid ${expandedGroups.verification ? 'expanded' : ''}`}>
                    <div className="collapsible-grid-inner">
                      <div className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-yellow-500/30 ml-2 py-0.5">
                        {isTaskViewable(userRole, 5) && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('scan');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'scan'
                                ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-yellow-400">qr_code_scanner</Icon>
                              <span>{isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>
                        )}

                        {isTaskViewable(userRole, 10) && (
                          <button
                            type="button"
                            onClick={() => {
                              setInspectionInitialFilter('all');
                              setActivePage('inspection_report');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'inspection_report'
                                ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-amber-400">analytics</Icon>
                              <span>{isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>
                        )}

                        {userRole !== 'clerk' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('report_unregistered');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'report_unregistered'
                                ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-amber-400">report_problem</Icon>
                              <span>{isAmharic ? 'ባልተመዘገበ ተሽከርካሪ ሪፖርት' : 'Report Unregistered'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>
                        )}

                        {(userRole === 'admin' || userRole === 'superadmin' || (userRole as string) === 'super_admin') && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('unregistered_list');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'unregistered_list'
                                ? 'bg-yellow-500 text-[#1e293b] font-black shadow-2xs'
                                : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-red-400">policy</Icon>
                              <span>{isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expandable Group: Super Admin (Visible if superadmin) */}
                {userRole === 'superadmin' && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup('superadmin')}
                      className="w-full flex items-center justify-between px-2.5 py-2 min-h-[38px] rounded-lg bg-purple-950/40 border border-purple-500/30 text-xs font-black uppercase text-amber-300 hover:bg-purple-900/40 active:scale-[0.98] transition-all cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="material-symbols-outlined text-[18px] text-amber-300">admin_panel_settings</Icon>
                        <span>{isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin'}</span>
                      </div>
                      <Icon className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${expandedGroups.superadmin ? 'rotate-180 text-amber-300' : 'text-purple-300'}`}>
                        expand_more
                      </Icon>
                    </button>

                    <div className={`collapsible-grid ${expandedGroups.superadmin ? 'expanded' : ''}`}>
                      <div className="collapsible-grid-inner">
                        <div className="mt-0.5 space-y-0.5 pl-2 border-l-2 border-purple-400/40 ml-2 py-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('superadmin_users');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'superadmin_users' || activePage === 'superadmin'
                                ? 'bg-amber-400 text-[#1e293b] font-black shadow-2xs'
                                : 'text-purple-100 hover:bg-purple-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-amber-300">manage_accounts</Icon>
                              <span>{isAmharic ? 'ሚና እና ፈቃድ' : 'Roles & Permissions'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('superadmin_subcities');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'superadmin_subcities'
                                ? 'bg-amber-400 text-[#1e293b] font-black shadow-2xs'
                                : 'text-purple-100 hover:bg-purple-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-amber-300">location_city</Icon>
                              <span>{isAmharic ? 'የክፍለ ከተማ ቁጥጥር' : 'Sub-City Governance'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('superadmin_permits');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'superadmin_permits'
                                ? 'bg-amber-400 text-[#1e293b] font-black shadow-2xs'
                                : 'text-purple-100 hover:bg-purple-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-amber-300">workspace_premium</Icon>
                              <span>{isAmharic ? 'የፈቃድ ቁጥጥር' : 'Master Permit Rules'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('superadmin_maintenance');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'superadmin_maintenance'
                                ? 'bg-amber-400 text-[#1e293b] font-black shadow-2xs'
                                : 'text-purple-100 hover:bg-purple-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-amber-300">storage</Icon>
                              <span>{isAmharic ? 'የሲስተም ጥገና' : 'System Maintenance'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActivePage('payment_receipts');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.97] ${
                              activePage === 'payment_receipts'
                                ? 'bg-amber-400 text-[#1e293b] font-black shadow-2xs'
                                : 'text-purple-100 hover:bg-purple-900/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="material-symbols-outlined text-[18px] text-emerald-400">receipt_long</Icon>
                              <span>{isAmharic ? 'የገቢዎች ማህደር' : 'Revenue Ledger'}</span>
                            </div>
                            <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Settings Link for All Roles */}
                <div className="pt-1.5 mt-1 border-t border-white/15">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('settings');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation active:scale-[0.98] ${
                      activePage === 'settings'
                        ? 'bg-yellow-500 text-[#1e293b] shadow-2xs font-black'
                        : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`material-symbols-outlined text-[19px] ${activePage === 'settings' ? 'text-[#1e293b]' : 'text-yellow-400'}`}>
                        settings
                      </Icon>
                      <span className="font-extrabold text-xs">{isAmharic ? 'ቅንብሮች' : 'Settings'}</span>
                    </div>
                    <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                  </button>
                </div>
              </div>

              {/* Drawer Bottom Actions */}
              <div className="space-y-2 pt-2 border-t border-white/15">
                <p className="text-[10px] font-extrabold text-yellow-400/80 uppercase tracking-wider px-1">
                  {isAmharic ? 'የስርዓት ማስተካከያ' : 'System Preferences'}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {/* Language Toggle */}
                  <button
                    type="button"
                    onClick={onToggleLang}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[38px] rounded-lg bg-white/10 border border-white/20 text-xs font-bold text-white hover:bg-white/20 active:scale-95 touch-manipulation transition-all cursor-pointer"
                  >
                    <Icon className="material-symbols-outlined text-[16px]">translate</Icon>
                    <span>{currentLang === 'am' ? 'English' : 'አማርኛ'}</span>
                  </button>

                  {/* Theme Toggle */}
                  {onToggleTheme && (
                    <button
                      type="button"
                      onClick={onToggleTheme}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[38px] rounded-lg bg-white/10 border border-white/20 text-xs font-bold text-white hover:bg-white/20 active:scale-95 touch-manipulation transition-all cursor-pointer"
                    >
                      <Icon className="material-symbols-outlined text-[16px]">
                        {currentTheme === 'dark' ? 'dark_mode' : 'light_mode'}
                      </Icon>
                      <span>{currentTheme === 'dark' ? 'Light' : 'Dark'}</span>
                    </button>
                  )}
                </div>

                {/* Mobile Non-Red Logout Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsLogoutModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[40px] bg-[#132A5E] hover:bg-[#1A387C] active:scale-[0.98] border border-[#2A4E9B] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-[18px] text-amber-400">logout</Icon>
                  <span>{isAmharic ? 'ውጣ' : 'Sign Out'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* DESKTOP TOP BAR (hidden md:flex) */}
        <header className="hidden md:flex items-center justify-between px-4 sm:px-6 md:px-8 py-2.5 bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-[#DEE4EE] border-b border-[#E2E8F0] dark:border-[#2E3A47] sticky top-0 z-40 shadow-xs relative overflow-hidden transition-colors">
          {/* Animated Navbar Action Loading Progress Bar (Under top navbar) */}
          {actionLoadingState.isLoading && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-100 dark:bg-slate-800 overflow-hidden z-50 pointer-events-none">
              <div className="h-full bg-gradient-to-r from-[#3C50E0] via-amber-400 to-[#3C50E0] animate-navbar-progress rounded-full" />
            </div>
          )}

          {/* Left Side: Sidebar Toggle Button & Current Context */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="w-8.5 h-8.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
              title={isCollapsed ? (isAmharic ? 'ሳይድባር ዘርጋ' : 'Expand Sidebar') : (isAmharic ? 'ሳይድባር አሳንስ' : 'Collapse Sidebar')}
              aria-label="Toggle Sidebar"
            >
              <Icon className="material-symbols-outlined text-[20px]">
                {isCollapsed ? 'menu_open' : 'menu'}
              </Icon>
            </button>

            {/* Context breadcrumb snippet on desktop */}
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B] dark:text-[#8A99AD]">
                {isAmharic ? 'ባህር ዳር ሞተረኞች' : 'Bahir Dar Motorist'}
              </span>
              <span className="text-xs text-[#CBD5E1] dark:text-[#2E3A47]">/</span>
              <span className="text-xs font-bold text-[#1C2434] dark:text-white capitalize">
                {breadcrumbItems[breadcrumbItems.length - 1]?.label}
              </span>
            </div>
          </div>

          {/* Right Side Tools: Language, Theme, Notifications, Date Dropdown, User Dropdown */}
          <div className="flex items-center gap-2">
            {/* Desktop Language Selector Toggle */}
            {onToggleLang && (
              <button
                type="button"
                onClick={onToggleLang}
                className="h-8.5 px-3 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 select-none"
                title={isAmharic ? 'ወደ እንግሊዝኛ ቀይር' : 'Switch to Amharic'}
                aria-label="Toggle Language"
              >
                <Icon className="material-symbols-outlined text-[16px] text-[#3C50E0]">translate</Icon>
                <span className="font-bold">{currentLang === 'am' ? 'English' : 'አማርኛ'}</span>
              </button>
            )}

            {/* Desktop Theme Selector Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="w-8.5 h-8.5 rounded-full border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 select-none"
                title={currentTheme === 'dark' ? (isAmharic ? 'ወደ ብርሃን ገጽታ ቀይር' : 'Switch to Light Mode') : (isAmharic ? 'ወደ ጨለማ ገጽታ ቀይር' : 'Switch to Dark Mode')}
                aria-label="Toggle Dark Mode"
              >
                <Icon className="material-symbols-outlined text-[18px] text-amber-500">
                  {currentTheme === 'dark' ? 'dark_mode' : 'light_mode'}
                </Icon>
              </button>
            )}

            {/* Notification Bell Icon Button with dynamic unread badge */}
            <div className="relative" ref={notificationDropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className={`w-8.5 h-8.5 rounded-full border flex items-center justify-center transition-all cursor-pointer relative shadow-xs ${
                  isNotificationOpen
                    ? 'border-[#3C50E0] bg-[#3C50E0] text-white'
                    : 'border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white'
                }`}
                title={isAmharic ? 'ማሳወቂያዎች' : 'Notifications'}
                aria-label="Notifications"
              >
                <Icon className="material-symbols-outlined text-[19px]">notifications</Icon>
                {unreadNotificationCount > 0 && (
                  <span className="bg-[#FB5454] text-white text-[10px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center absolute -top-1 -right-1 shadow-2xs border border-white dark:border-[#1C2434]">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Desktop Notification Dropdown */}
              {isNotificationOpen && (
                <div
                  className="absolute right-0 mt-2 w-84 sm:w-96 bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 text-[#1C2434] dark:text-[#DEE4EE]"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <NotificationDropdown
                    notifications={systemNotifications}
                    readIds={readNotificationIds}
                    onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                    onClearAll={handleClearAllNotifications}
                    onSelectNotification={handleSelectNotification}
                    onQuickAction={handleSelectNotification}
                    onClose={() => setIsNotificationOpen(false)}
                    isAmharic={isAmharic}
                    isMobile={false}
                  />
                </div>
              )}
            </div>

            {/* Real Working Ethiopian Calendar Date & Time Selector Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                className="h-8.5 px-3 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-[#DEE4EE] text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-xs select-none hover:border-[#3C50E0]"
                title={isAmharic ? 'የኢትዮጵያ ቀን መቁጠሪያ' : 'Ethiopian Calendar'}
              >
                <Icon className="material-symbols-outlined text-amber-500 text-[17px]">calendar_month</Icon>
                <span className="font-bold">{isAmharic ? ethDate.formattedAm : ethDate.formattedEn}</span>
                <span className="hidden lg:inline text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono px-1.5 py-0.5 rounded font-bold">
                  {isAmharic ? ethDate.timeAm : ethDate.timeEn}
                </span>
                <Icon className="material-symbols-outlined text-[#8A99AD] text-[15px]">
                  {isDateDropdownOpen ? 'expand_less' : 'expand_more'}
                </Icon>
              </button>

              {/* Interactive Ethiopian Calendar Dropdown */}
              {isDateDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-80 sm:w-88 bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-[#1C2434] dark:text-[#DEE4EE]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Municipal Calendar Header */}
                  <div className="bg-[#1C2434] dark:bg-[#24303F] text-white p-3.5 rounded-sm border-b-2 border-[#3C50E0] space-y-1 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-[#3C50E0] dark:text-[#6574F5] uppercase tracking-wider flex items-center gap-1">
                        <Icon className="material-symbols-outlined text-[14px]">event</Icon>
                        {isAmharic ? 'የኢትዮጵያ ቀን መቁጠሪያ' : 'Ethiopian National Calendar'}
                      </span>
                      <span className="text-[11px] font-black bg-[#3C50E0]/20 text-[#6574F5] px-2 py-0.5 rounded">
                        {ethDate.weekdayAm} ({ethDate.weekdayEn})
                      </span>
                    </div>
                    <div className="text-base font-black tracking-tight text-white">
                      {ethDate.monthNameAm} {ethDate.day} ቀን {ethDate.year} ዓ.ም
                    </div>
                    <div className="text-xs text-[#8A99AD] font-medium">
                      {ethDate.monthNameEn} {ethDate.day}, {ethDate.year} EC
                    </div>
                  </div>

                  {/* Real-time Digital Clocks */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-[#F7F9FC] dark:bg-[#24303F] p-2.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47]">
                      <span className="text-[11px] text-[#64748B] dark:text-[#8A99AD] block font-bold">
                        {isAmharic ? 'መደበኛ ሰዓት' : 'Standard Time'}
                      </span>
                      <span className="font-mono font-black text-xs text-[#3C50E0] flex items-center gap-1 mt-0.5">
                        <Icon className="material-symbols-outlined text-[14px] text-amber-500">schedule</Icon>
                        {isAmharic ? ethDate.timeAm : ethDate.timeEn}
                      </span>
                    </div>

                    <div className="bg-[#F7F9FC] dark:bg-[#24303F] p-2.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47]">
                      <span className="text-[11px] text-[#64748B] dark:text-[#8A99AD] block font-bold">
                        {isAmharic ? 'የሀገር ባህል ሰዓት' : 'Ethiopian Local Time'}
                      </span>
                      <span className="font-mono font-black text-xs text-amber-600 dark:text-amber-300 flex items-center gap-1 mt-0.5">
                        <Icon className="material-symbols-outlined text-[14px]">sunny</Icon>
                        {ethDate.traditionalTimeAm}
                      </span>
                    </div>
                  </div>

                  {/* Ethiopian Calendar Date & GMT+3 Standard */}
                  <div className="mt-3 bg-[#F7F9FC] dark:bg-[#24303F] p-2.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[11px] text-[#64748B] dark:text-[#8A99AD] block font-bold">
                        {isAmharic ? 'የኢትዮጵያ ካሌንደር (GMT+3)' : 'Ethiopian Calendar (GMT+3)'}
                      </span>
                      <span className="font-bold text-[#1C2434] dark:text-white">
                        {isAmharic ? ethDate.formattedAm : ethDate.formattedEn}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-extrabold text-[#3C50E0] bg-[#3C50E0]/10 border border-[#3C50E0]/30 px-2 py-1 rounded-sm">
                      GMT+3
                    </span>
                  </div>

                  {/* Calendar Quick Month Navigation Grid for Visual Display */}
                  <div className="mt-3 pt-3 border-t border-[#E2E8F0] dark:border-[#2E3A47]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-extrabold text-[#1C2434] dark:text-white">
                        {isAmharic ? `የወሩ ቀናት (${ethDate.monthNameAm})` : `Days of ${ethDate.monthNameEn}`}
                      </span>
                      <span className="text-xs font-extrabold text-[#3C50E0] bg-[#3C50E0]/10 border border-[#3C50E0]/30 px-2 py-0.5 rounded-sm">
                        {isAmharic ? 'ዛሬ: ' + ethDate.day : 'Today: ' + ethDate.day}
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold">
                      {['እ', 'ሰ', 'ማ', 'ረ', 'ሐ', 'ዓ', 'ቅ'].map((day, idx) => (
                        <div key={idx} className="text-[#8A99AD] text-[11px] font-black py-0.5">
                          {day}
                        </div>
                      ))}
                      {Array.from({ length: ethDate.isPagume ? 6 : 30 }, (_, i) => i + 1).map((d) => (
                        <div
                          key={d}
                          className={`py-1 rounded-sm font-mono font-bold text-xs ${
                            d === ethDate.day
                              ? 'bg-[#3C50E0] text-white font-black shadow-xs'
                              : 'text-[#1C2434] dark:text-[#DEE4EE] hover:bg-[#F1F5F9] dark:hover:bg-[#24303F]'
                          }`}
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Close / Dismiss */}
                  <div className="mt-3 pt-2 border-t border-[#E2E8F0] dark:border-[#2E3A47] flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDateDropdownOpen(false)}
                      className="px-3.5 py-1.5 rounded-sm bg-[#F1F5F9] hover:bg-[#E2E8F0] dark:bg-[#24303F] dark:hover:bg-[#333A48] text-xs font-semibold text-[#1C2434] dark:text-white transition-colors cursor-pointer border border-[#E2E8F0] dark:border-[#2E3A47]"
                    >
                      {isAmharic ? 'ዝጋ' : 'Close'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Top-Right Active User Dropdown Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="h-8.5 px-2.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white hover:border-[#3C50E0] flex items-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <div className="w-6 h-6 rounded-full bg-[#1C2434] border border-[#3C50E0] text-white flex items-center justify-center shrink-0 overflow-hidden">
                  <img src={APP_LOGO} alt="User Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="text-left hidden sm:block">
                  <span className="text-xs font-semibold text-[#1C2434] dark:text-white block leading-tight truncate max-w-[110px]">
                    {userBadgeId ? userBadgeId : (isAmharic ? 'አቶ መፈሪያ' : 'Mr. Meferiya')}
                  </span>
                </div>
                <Icon className="material-symbols-outlined text-[#8A99AD] text-[16px]">expand_more</Icon>
              </button>

              {/* User Dropdown Menu */}
              {isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-[#1C2434] dark:text-[#DEE4EE]">
                  <div className="px-4 py-2 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                    <p className="text-xs font-bold text-[#1C2434] dark:text-white">
                      {userBadgeId ? userBadgeId : (isAmharic ? 'አቶ መፈሪያ' : 'Mr. Meferiya')}
                    </p>
                    <p className="text-xs text-[#8A99AD] font-medium capitalize">
                      {userRole === 'superadmin' ? 'Super Admin' : userRole === 'admin' ? 'Manager' : userRole === 'clerk' ? 'Secretary' : 'Officer'}
                    </p>
                  </div>

                  {/* Role Switcher in Dropdown */}
                  {onSwitchRole && (
                    <div className="px-3 py-2 border-b border-[#E2E8F0] dark:border-[#2E3A47] space-y-1">
                      <p className="text-[10px] font-bold uppercase text-[#8A99AD] tracking-wider">
                        {isAmharic ? 'ሚና ቀይር' : 'Switch Role'}
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {(['clerk', 'admin', 'officer', 'superadmin'] as UserRole[]).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              onSwitchRole(r);
                              setIsUserDropdownOpen(false);
                            }}
                            className={`px-2 py-1 rounded-sm text-[11px] font-medium capitalize text-left transition-all ${
                              userRole === r
                                ? 'bg-[#3C50E0] text-white font-semibold'
                                : 'text-[#1C2434] dark:text-[#DEE4EE] hover:bg-[#F1F5F9] dark:hover:bg-[#24303F]'
                            }`}
                          >
                            {r === 'admin' ? (isAmharic ? 'ሥራ አስኪያጅ' : 'Manager') : r === 'superadmin' ? (isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin') : r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Settings and Sign out options in User Dropdown */}
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActivePage('settings');
                        setIsUserDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-xs font-medium text-[#1C2434] dark:text-[#DEE4EE] hover:bg-[#F1F5F9] dark:hover:bg-[#24303F] flex items-center gap-2 text-left cursor-pointer transition-colors"
                    >
                      <Icon className="material-symbols-outlined text-[17px] text-[#8A99AD]">settings</Icon>
                      <span>{isAmharic ? 'ቅንብሮች (Settings)' : 'Settings'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserDropdownOpen(false);
                        setIsLogoutModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2 text-left cursor-pointer transition-colors border-t border-[#E2E8F0] dark:border-[#2E3A47]"
                    >
                      <Icon className="material-symbols-outlined text-[17px] text-rose-600 dark:text-rose-400">logout</Icon>
                      <span>{isAmharic ? 'ውጣ (Sign Out)' : 'Sign Out'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className={
          activePage === 'scan'
            ? "flex-1 w-full mx-auto p-0 max-w-none h-full min-h-0 max-h-full flex flex-col overflow-hidden"
            : "flex-1 overflow-y-auto w-full max-w-7xl md:max-w-[1600px] px-3 sm:px-4 md:px-6 pt-1.5 sm:pt-2 md:pt-2 pb-6 md:pb-8 mx-auto min-h-0 flex flex-col"
        }>
          {/* BREADCRUMB NAVIGATION MENU */}
          {activePage !== 'scan' && (
            <nav aria-label="Breadcrumb" className="bg-transparent px-0 py-0 mb-2 sm:mb-3 flex items-center overflow-x-auto scrollbar-none transition-all">
              <ol className="flex items-center gap-1 sm:gap-1.5 text-xs font-medium text-[#64748B] dark:text-[#8A99AD] min-w-0">
                {breadcrumbItems.map((item, index) => {
                  const isLast = index === breadcrumbItems.length - 1;
                  return (
                    <li key={index} className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
                      {index > 0 && (
                        <Icon className="material-symbols-outlined text-[13px] text-[#8A99AD] shrink-0 opacity-70">
                          chevron_right
                        </Icon>
                      )}
                      <button
                        type="button"
                        onClick={() => setActivePage(item.page as any)}
                        disabled={isLast}
                        className={`flex items-center py-1 px-2.5 rounded-sm transition-all text-xs ${
                          isLast
                            ? 'text-[#3C50E0] font-semibold cursor-default bg-[#3C50E0]/10 dark:bg-[#3C50E0]/20'
                            : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white hover:bg-[#E2E8F0]/50 dark:hover:bg-[#2E3A47]/50 font-medium cursor-pointer'
                        }`}
                      >
                        <span className="truncate max-w-[130px] sm:max-w-[220px]">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {isCurrentPageBlocked ? (
            renderBlockedPageUI()
          ) : (
            <div
              key={activePage}
              className={
                activePage === 'scan'
                  ? "flex-1 w-full h-full min-h-[500px] flex flex-col overflow-hidden"
                  : "animate-page-enter flex-none flex flex-col"
              }
            >
              {/* Domain 1: Universal Dashboard Overview */}
              {activePage === 'dashboard' && (
                <DashboardOverviewRouter
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  onQuickAction={handleQuickAction}
                  isLoading={isInitialLoading || pageLoading}
                />
              )}

              {/* Domain 2: Registry Domain (Forms, Today's Submissions, Tables) */}
              {['forms', 'today_submissions_adjust', 'tables'].includes(activePage) && (
                <RegistryRouter
                  activePage={activePage}
                  setActivePage={(p) => setActivePage(p as ActiveHomePage)}
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  tableInitialTab={tableInitialTab}
                />
              )}

              {/* Domain 3: Enforcement (Field) Domain (Scanner, Inspection Reports, Unregistered Reports) */}
              {['scan', 'inspection_report', 'report_unregistered', 'unregistered_list'].includes(activePage) && (
                <EnforcementRouter
                  activePage={activePage}
                  setActivePage={(p) => setActivePage(p as ActiveHomePage)}
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                />
              )}

              {/* Domain 4: Revenue (Treasury) Domain (Payment Receipts & Ledger Metrics) */}
              {activePage === 'payment_receipts' && (
                <RevenueRouter
                  activePage={activePage}
                  setActivePage={(p) => setActivePage(p as ActiveHomePage)}
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                />
              )}

              {/* Domain 5: Governance Domain (SuperAdmin Governance & Settings) */}
              {(activePage.startsWith('superadmin') || activePage === 'settings') && (
                <GovernanceRouter
                  activePage={activePage}
                  setActivePage={(p) => setActivePage(p as ActiveHomePage)}
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  currentTheme={currentTheme}
                  onToggleLang={onToggleLang}
                  onToggleTheme={onToggleTheme}
                  onLogoutClick={() => setIsLogoutModalOpen(true)}
                />
              )}
            </div>
          )}

          {/* Modern, elegant system footer containing language and theme selectors */}
          {activePage !== 'scan' && (
            <footer className="app-grounded-footer w-full border-t border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 rounded-lg">
              <div className="text-slate-400 dark:text-slate-500 text-[11px] font-medium text-center sm:text-left">
                {isAmharic ? '© 2016 የግንቦት 12 ባህር ዳር ሞተረኞች ማህበር ፈቃድ ቁጥጥር ስርዓት። መብቱ የተጠበቀ ነው።' : '© 2026 Bahirdar Motorist Association Permit Governance System. All rights reserved.'}
              </div>
              
              <div className="flex items-center gap-3">
                {/* Language Selector */}
                <button
                  type="button"
                  onClick={onToggleLang}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs"
                >
                  <Icon className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400">translate</Icon>
                  <span>{currentLang === 'am' ? 'English' : 'አማርኛ'}</span>
                </button>

                {/* Theme Selector */}
                {onToggleTheme && (
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs"
                  >
                    <Icon className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400">
                      {currentTheme === 'dark' ? 'light_mode' : 'dark_mode'}
                    </Icon>
                    <span>{currentTheme === 'dark' ? (isAmharic ? 'ብርሃን (Light)' : 'Light Mode') : (isAmharic ? 'ጨለማ (Dark)' : 'Dark Mode')}</span>
                  </button>
                )}
              </div>
            </footer>
          )}
        </main>
      </div>

      {/* Floating Toast Notification Stack - Right Aligned, Animated, Filled Background */}
      <div
        id="toast-notifications-container"
        className="fixed top-5 right-5 z-[99999] flex flex-col items-end gap-3 w-full max-w-[390px] pointer-events-none px-4 sm:px-0"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';
          const isInfo = toast.type === 'info' || (!isSuccess && !isError && !isWarning);

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto relative overflow-hidden w-full self-end ml-auto rounded-xl p-3.5 sm:p-4 shadow-xl text-white transition-all duration-300 animate-toast-in ${
                isSuccess
                  ? 'bg-emerald-600 border border-emerald-500 shadow-emerald-950/25 animate-toast-pulse-success'
                  : isError
                  ? 'bg-rose-600 border border-rose-500 shadow-rose-950/25'
                  : isWarning
                  ? 'bg-amber-600 border border-amber-500 shadow-amber-950/25'
                  : 'bg-slate-900 border border-slate-700 shadow-black/30'
              }`}
            >
              {/* Subtle top-light edge highlight */}
              <div className="absolute inset-x-0 top-0 h-[1px] bg-white/25 pointer-events-none" />

              {/* Subtle shimmer animation for success */}
              {isSuccess && (
                <div className="absolute inset-0 -translate-x-full animate-toast-shimmer bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
              )}

              <div className="flex items-start gap-3 relative z-10">
                {/* Animated Icon badge with filled contrast container */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-xs ${
                    isSuccess
                      ? 'bg-white/20 text-white'
                      : isError
                      ? 'bg-white/20 text-white'
                      : isWarning
                      ? 'bg-white/20 text-white'
                      : 'bg-white/15 text-white'
                  }`}
                >
                  <Icon
                    className={`material-symbols-outlined text-[20px] ${
                      isSuccess ? 'animate-toast-pop' : ''
                    }`}
                  >
                    {isSuccess ? 'check_circle' : isError ? 'error' : isWarning ? 'warning' : 'info'}
                  </Icon>
                </div>

                <div className="flex-1 min-w-0 pr-1 text-left">
                  {toast.title && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-black tracking-wide uppercase opacity-90">
                        {toast.title}
                      </span>
                      {toast.tag && (
                        <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] font-mono font-bold">
                          {toast.tag}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs font-bold leading-snug text-white/95 break-words">
                    {toast.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-white/80 hover:text-white hover:bg-white/15 p-1 rounded-md shrink-0 cursor-pointer transition-colors"
                  title={isAmharic ? 'ዝጋ' : 'Dismiss'}
                >
                  <Icon className="material-symbols-outlined text-[16px] font-bold">close</Icon>
                </button>
              </div>

              {/* Subtle Auto-dismiss Countdown Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/15 overflow-hidden">
                <div className="h-full bg-white/40 animate-toast-countdown" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Universal Logout Confirmation Modal for All Users */}
      {isLogoutModalOpen && (
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsLogoutModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 text-on-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#1e293b] text-amber-400 flex items-center justify-center shrink-0 border border-yellow-500/40 shadow-xs">
                <Icon className="material-symbols-outlined text-[20px]">logout</Icon>
              </div>
              <div>
                <h3 className="text-base font-black text-on-surface tracking-tight">
                  {isAmharic ? 'ከሲስተም መውጣት ማረጋገጫ' : 'Confirm System Logout'}
                </h3>
                <p className="text-xs text-outline mt-0.5">
                  {isAmharic ? 'የስራ ክፍለ ጊዜዎን ማጠናቀቅ ይፈልጋሉ?' : 'Are you sure you want to end your active session?'}
                </p>
              </div>
            </div>

            <div className="bg-surface-container p-3.5 rounded-lg border border-outline-variant/60 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-on-surface font-bold">
                <span className="text-outline">{isAmharic ? 'ተጠቃሚ መለያ:' : 'Logged User:'}</span>
                <span className="font-mono bg-surface-container-high px-2 py-0.5 rounded text-[11px] font-extrabold text-[#1e293b] dark:text-yellow-400">
                  {userBadgeId || 'System User'}
                </span>
              </div>
              <div className="flex justify-between items-center text-on-surface font-bold">
                <span className="text-outline">{isAmharic ? 'የስራ ሚና:' : 'System Role:'}</span>
                <span className="uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black">
                  {userRole}
                </span>
              </div>
              <p className="text-[11px] text-outline pt-1">
                {isAmharic
                  ? 'ከሲስተሙ ሲወጡ የአሁኑ የስራ ክፍለ ጊዜዎ ይዘጋል።'
                  : 'You will be safely signed out from your active workspace session.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-bold text-on-surface transition-all cursor-pointer shadow-2xs active:scale-98"
              >
                {isAmharic ? 'ይቅር / ተመለስ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  handleUserLogout();
                }}
                className="px-5 py-2.5 rounded-lg bg-[#132A5E] hover:bg-[#1A387C] text-white border border-[#2A4E9B] text-xs font-black shadow-sm transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <Icon className="material-symbols-outlined text-[16px] text-amber-400">logout</Icon>
                <span>{isAmharic ? 'አዎ፣ ውጣ' : 'Yes, Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const HomePage: React.FC<HomePageProps> = (props) => {
  return (
    <ToastProvider>
      <DataProvider lang={props.currentLang}>
        <ActionProvider>
          <HomePageShell {...props} />
        </ActionProvider>
      </DataProvider>
    </ToastProvider>
  );
};
