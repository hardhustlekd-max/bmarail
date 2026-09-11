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

export const HomePage: React.FC<HomePageProps> = ({
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
          className="px-4 py-2 bg-[#1D61E7] hover:bg-blue-700 text-white rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
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
        return 'ማመልከቻ ማስተካከያ';
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
    document.title = `${currentNavbarTitleAmharic} | የባህር ዳር ማዘጋጃ ቤት`;
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
      return [
        homeItem,
        {
          label: isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction',
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
    syncCriticalStartup(activePage).catch((err) => {
      console.warn('HomePage critical startup sync notice:', err);
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

  // Dynamic Municipal System Notifications based on real Firestore state and RBAC permissions
  const systemNotifications = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];

    // RBAC Permission checks based on user's active role and permission matrix
    const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRole === 'role-superadmin';
    const isManager = userRole === 'admin' || userRole === 'role-manager';
    const isOfficer = userRole === 'officer' || userRole === 'role-officer';
    const isClerk = userRole === 'clerk' || userRole === 'role-secretary';
    const isItSpecialist = userRole === 'it_specialist' || userRole === 'role-it';

    // 1. Pending registration applications (Clerk review, Manager review, Superadmin review)
    // Field officers who only patrol must NOT receive clerical registration review alerts
    const canViewPendingRegs = isSuperAdmin || isManager || (
      !isOfficer && (
        isTaskViewable(userRole, 8) ||
        isTaskViewable(userRole, 1) ||
        (isClerk && (settings.showClerkSubmissionsAction ?? true))
      )
    );

    if (canViewPendingRegs) {
      const pendingRegs = registrations.filter((r) => r.status === 'pending_approval');
      if (pendingRegs.length > 0) {
        list.push({
          id: `pending_regs_summary_${pendingRegs.length}`,
          title: isAmharic
            ? `${pendingRegs.length} አዳዲስ ማመልከቻዎች ማፅደቅ ይጠብቃሉ`
            : `${pendingRegs.length} Applications Awaiting Review`,
          description: isAmharic
            ? 'የቀረቡ አዳዲስ የሞተር ምዝገባዎች ማረጋገጫና ውሳኔ ይፈልጋሉ።'
            : 'Newly submitted motor applications require verification and approval.',
          type: 'pending_approval',
          icon: 'how_to_reg',
          iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
          badgeLabel: isAmharic ? 'ማፅደቂያ' : 'Approval',
          badgeBg: 'bg-blue-500/20',
          badgeText: 'text-blue-700 dark:text-blue-300',
          actionPage: 'tables',
          actionTab: 'pending',
        });

        // Show up to 3 individual pending registrations with member names
        pendingRegs.slice(0, 3).forEach((reg) => {
          list.push({
            id: `reg_pending_${reg.id}`,
            title: `${reg.fullName} (${reg.plateNumber || reg.id})`,
            description: isAmharic
              ? `የተሽከርካሪ ምዝገባ ማመልከቻ ቀርቧል - ${reg.subCity || 'ባህር ዳር'}`
              : `Motorcycle registration submitted - ${reg.subCity || 'Bahir Dar'}`,
            time: reg.registrationDate,
            type: 'pending_approval',
            icon: 'motorcycle',
            iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
            badgeLabel: isAmharic ? 'አዲስ' : 'New',
            badgeBg: 'bg-indigo-500/20',
            badgeText: 'text-indigo-700 dark:text-indigo-300',
            actionPage: 'tables',
            actionTab: 'pending',
          });
        });
      }
    }

    // 1b. Registration Record Actions by Manager / Admin (Approved & Rejected Notifications)
    const approvedRegs = registrations.filter((r) => r.status === 'approved');
    if (approvedRegs.length > 0) {
      approvedRegs.slice(0, 2).forEach((reg) => {
        list.push({
          id: `reg_approved_${reg.id}`,
          title: isAmharic ? `ፈቃድ ጸድቋል: ${reg.fullName} (${reg.plateNumber || 'ሰሌዳ'})` : `Permit Approved: ${reg.fullName} (${reg.plateNumber || 'Plate'})`,
          description: isAmharic ? `የሰሌዳ ቁጥር እና የባጅ ፈቃድ በሥራ አስኪያጅ/አስተዳዳሪ ጸድቋል።` : `Registration and permit card approved by manager/admin.`,
          time: reg.registrationDate,
          type: 'print_order',
          icon: 'check_circle',
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          badgeLabel: isAmharic ? 'ጸድቋል' : 'Approved',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-700 dark:text-emerald-300',
          actionPage: 'tables',
          actionTab: 'approved',
        });
      });
    }

    const rejectedRegs = registrations.filter((r) => r.status === 'rejected');
    if (rejectedRegs.length > 0) {
      rejectedRegs.slice(0, 2).forEach((reg) => {
        list.push({
          id: `reg_rejected_${reg.id}`,
          title: isAmharic ? `ማመልከቻ ውድቅ ተደርጓል: ${reg.fullName}` : `Application Rejected: ${reg.fullName}`,
          description: reg.rejectionReason || (isAmharic ? 'ሰነዶች አልሟሉም ወይም ማስተካከያ ይፈልጋል' : 'Documents incomplete or required correction'),
          time: reg.registrationDate,
          type: 'flagged_inspection',
          icon: 'cancel',
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          badgeLabel: isAmharic ? 'ውድቅ' : 'Rejected',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-700 dark:text-rose-300',
          actionPage: 'tables',
          actionTab: 'pending',
        });
      });
    }

    // 2. Flagged or Warning inspection patrol logs
    // Visible for field officers, supervisors/managers, superadmins, IT, or roles with Task 5 or 10 viewable
    const canViewInspectionLogs = isSuperAdmin || isManager || isOfficer || isItSpecialist ||
      isTaskViewable(userRole, 5) || isTaskViewable(userRole, 10);

    if (canViewInspectionLogs) {
      const flaggedLogs = verificationLogs.filter(
        (l) => l.verificationStatus === 'flagged' || l.verificationStatus === 'warning'
      );
      if (flaggedLogs.length > 0) {
        list.push({
          id: `flagged_logs_summary_${flaggedLogs.length}`,
          title: isAmharic
            ? `${flaggedLogs.length} የፍተሻ ጥሰቶች/ማስጠንቀቂያዎች`
            : `${flaggedLogs.length} Inspection Violations/Warnings`,
          description: isAmharic
            ? 'በመንገድ ፍተሻ ወቅት የተመዘገቡ የህግ ጥሰቶች ወይም ያልተሟሉ ሰነዶች አሉ።'
            : 'Traffic patrol officers flagged non-compliant or expired permits.',
          type: 'flagged_inspection',
          icon: 'warning',
          iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
          badgeLabel: isAmharic ? 'ማስጠንቀቂያ' : 'Alert',
          badgeBg: 'bg-rose-500/20',
          badgeText: 'text-rose-700 dark:text-rose-300',
          actionPage: 'inspection_report',
        });

        // For officers and traffic supervisors, show up to 2 recent flagged incident alerts
        if (isOfficer || isManager || isSuperAdmin) {
          flaggedLogs.slice(0, 2).forEach((log) => {
            list.push({
              id: `log_flagged_${log.id}`,
              title: `${log.plateNumber || log.driverName || log.badgeId} - ${isAmharic ? 'ጥሰት ተመዝግቧል' : 'Flagged Violation'}`,
              description: log.notes || (isAmharic ? 'የመንገድ ላይ ፍተሻ ህግ ጥሰት ተገኝቷል' : 'Roadside patrol non-compliance violation logged'),
              time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : undefined,
              type: 'flagged_inspection',
              icon: 'gavel',
              iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
              badgeLabel: isAmharic ? 'ጥሰት' : 'Violation',
              badgeBg: 'bg-rose-500/20',
              badgeText: 'text-rose-700 dark:text-rose-300',
              actionPage: 'inspection_report',
            });
          });
        }
      }
    }

    // 3. Unregistered vehicle incident reports
    // Relevant for patrol officers, traffic directors, managers, and superadmins
    const canViewUnregistered = isSuperAdmin || isManager || isOfficer ||
      isTaskViewable(userRole, 5) || isTaskViewable(userRole, 10);

    if (canViewUnregistered && unregisteredReports.length > 0) {
      list.push({
        id: `unreg_reports_summary_${unregisteredReports.length}`,
        title: isAmharic
          ? `${unregisteredReports.length} ያልተመዘገቡ ሞተሮች ሪፖርት`
          : `${unregisteredReports.length} Unregistered Vehicle Reports`,
        description: isAmharic
          ? 'በመንገድ ላይ የተገኙ ያልተመዘገቡ ተሽከርካሪዎች ጥቆማዎች ቀርበዋል።'
          : 'Patrol officers submitted incident reports on unregistered motorcycles.',
        type: 'unregistered_alert',
        icon: 'no_crash',
        iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        badgeLabel: isAmharic ? 'ያልተመዘገበ' : 'Unregistered',
        badgeBg: 'bg-amber-500/20',
        badgeText: 'text-amber-800 dark:text-amber-300',
        actionPage: 'unregistered_list',
      });
    }

    // 4. Pending Print Orders
    // Relevant for printing workstation staff, managers, IT, and superadmin (not field patrol officers)
    const canViewPrintOrders = !isOfficer && (
      isSuperAdmin || isManager || isItSpecialist ||
      (isClerk && (settings.showClerkApprovedVehiclesAction ?? false) && isTaskViewable(userRole, 8))
    );

    if (canViewPrintOrders) {
      const pendingPrints = printOrders.filter((p) => p.status === 'pending' || p.status === 'in_printing');
      if (pendingPrints.length > 0) {
        list.push({
          id: `print_orders_summary_${pendingPrints.length}`,
          title: isAmharic
            ? `${pendingPrints.length} የህትመት ትዕዛዞች በሂደት ላይ`
            : `${pendingPrints.length} Print Batches in Progress`,
          description: isAmharic
            ? 'የባጅና የሰሌዳ ፈቃድ ህትመት ባቾች በመዘጋጀት ላይ ናቸው።'
            : 'Batches queued or being printed for official permit cards and stickers.',
          type: 'print_order',
          icon: 'print',
          iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          badgeLabel: isAmharic ? 'ህትመት' : 'Printing',
          badgeBg: 'bg-emerald-500/20',
          badgeText: 'text-emerald-700 dark:text-emerald-300',
          actionPage: 'tables',
          actionTab: 'approved',
        });
      }
    }

    // 5. Pending payment receipts
    // Relevant for finance, clerks, managers, and superadmins (Task 15/16) - not field patrol officers
    const canViewPayments = !isOfficer && (
      isSuperAdmin || isManager || isClerk ||
      isTaskViewable(userRole, 15) || isTaskViewable(userRole, 16)
    );

    if (canViewPayments) {
      const pendingPayments = paymentReceipts.filter((p) => p.status === 'pending');
      if (pendingPayments.length > 0) {
        list.push({
          id: `pending_payments_summary_${pendingPayments.length}`,
          title: isAmharic
            ? `${pendingPayments.length} ያልተረጋገጡ የክፍያ ደረሰኞች`
            : `${pendingPayments.length} Pending Payment Receipts`,
          description: isAmharic
            ? 'የባንክ ክፍያ ደረሰኞች ማረጋገጫና ቼክ በመጠባበቅ ላይ ናቸው።'
            : 'Deposit slips waiting for clerk/finance payment verification.',
          type: 'pending_payment',
          icon: 'receipt_long',
          iconBg: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
          badgeLabel: isAmharic ? 'ክፍያ' : 'Payment',
          badgeBg: 'bg-teal-500/20',
          badgeText: 'text-teal-700 dark:text-teal-300',
          actionPage: 'payment_receipts',
        });
      }
    }

    // 6. Officer Patrol Shift & Active Duty Status (Only for Officers)
    if (isOfficer) {
      const matchingOfficer = officers.find(
        (o) => o.badgeId === userBadgeId || o.id === userBadgeId || o.phone === userBadgeId
      );
      const subCityAssigned = matchingOfficer?.subCity || 'ባህር ዳር ዙሪያ / Bahir Dar';
      const zoneAssigned = matchingOfficer?.assignedZone || 'ዋና ዋና የመንገድ ኮሪደሮች';

      list.push({
        id: `officer_assignment_${userBadgeId || 'active'}`,
        title: isAmharic
          ? `የኦፊሰር ስራ ምድብ - ${subCityAssigned}`
          : `Patrol Duty Assignment - ${subCityAssigned}`,
        description: isAmharic
          ? `ምድብ ቀጠና: ${zoneAssigned} | የፍተሻ ሁኔታ: ንቁ አገልግሎት ላይ`
          : `Assigned Sector: ${zoneAssigned} | Status: Active on Field Duty`,
        type: 'info',
        icon: 'local_police',
        iconBg: 'bg-blue-600/15 text-blue-700 dark:text-blue-300',
        badgeLabel: isAmharic ? 'ምድብ' : 'Duty',
        badgeBg: 'bg-blue-600/20',
        badgeText: 'text-blue-800 dark:text-blue-300',
        actionPage: 'scan',
      });
    }

    // 7. IT & Governance System Security / User Alerts (Only for IT Specialist & Superadmin)
    const canViewSystemMgmt = isSuperAdmin || isItSpecialist || isTaskViewable(userRole, 13) || isTaskViewable(userRole, 12);
    if (canViewSystemMgmt) {
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
          badgeLabel: isAmharic ? 'አስተዳደር' : 'Admin',
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
    (item: NotificationItem) => {
      // Mark selected notification as read in DB & local state
      setReadNotificationIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
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
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
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
          : `Payment receipt #${receipt.receiptNumber} saved successfully!`,
        'success'
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
            : `Registration for ${newReg.fullName} stored successfully in Firebase Database!`,
          'success'
        );
      } else {
        addToast(
          isAmharic ? 'የኦንላይን ዳታቤዝ ማስቀመጥ አልተሳካም!' : 'Online Firebase database save failed!',
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
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:z-50 md:bg-[#0A1838] md:text-white md:border-r md:border-[#16274E] md:p-3.5 md:justify-between md:shadow-2xl">
        <div className="flex flex-col h-full min-h-0">
          {/* Desktop Brand & Logo Header */}
          <div
            onClick={() => handleSideMenuClick('dashboard', 'dashboard')}
            className="flex items-center gap-3 px-1 py-1 mb-5 cursor-pointer hover:opacity-90 transition-opacity select-none"
            title={isAmharic ? 'ወደ ዋና ገፅ ሂድ' : 'Go to Dashboard'}
          >
            <div className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center shrink-0 overflow-hidden border border-white/20">
              <img src={APP_LOGO} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            </div>
            <div className="min-w-0">
              <h1 id="desktop-header-text" className="font-black text-xs text-white tracking-tight leading-tight truncate">
                {isAmharic ? 'ባህርዳር ሞተረኞች ማህበር' : 'BAHIR DAR MOTORCYCLISTS ASSOCIATION'}
              </h1>
            </div>
          </div>

          {/* Desktop Main Menu Items Navigation List */}
          <nav className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/20">
            {/* Dashboard Link */}
            <button
              type="button"
              onClick={() => handleSideMenuClick('dashboard', 'dashboard')}
              onDoubleClick={() => {
                if (userRole === 'superadmin') {
                  setActivePage('superadmin_owners' as any);
                }
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activePage === 'dashboard'
                  ? 'bg-[#1D61E7] text-white font-black shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="material-symbols-outlined text-[20px]">space_dashboard</Icon>
              <span>{isAmharic ? 'ዋና ገፅ' : 'Dashboard'}</span>
            </button>

            {/* CLERK SPECIFIC SIDE MENU - EXACTLY MATCHING QUICK ACTIONS */}
            {userRole === 'clerk' ? (
              <>
                {/* 1. New Registration */}
                {isTaskViewable(userRole, 1) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('forms')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'forms'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">how_to_reg</Icon>
                    <span>{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
                  </button>
                )}

                {/* 2. Submission Correction */}
                {isTaskViewable(userRole, 2) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('today_submissions_adjust')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'today_submissions_adjust'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">edit_note</Icon>
                    <span>{isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction'}</span>
                  </button>
                )}

                {/* 3. Scan QR Code */}
                {isTaskViewable(userRole, 5) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('scan')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'scan'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">qr_code_scanner</Icon>
                    <span>{isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}</span>
                  </button>
                )}

                {/* 4. Payment Receipts Entry */}
                {isTaskViewable(userRole, 1) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('payment_receipts')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'payment_receipts'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px] text-emerald-400">receipt_long</Icon>
                    <span>{isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts'}</span>
                  </button>
                )}

                {/* 4. Optional: View Submissions (Controlled by Super Admin toggle) */}
                {settings.showClerkSubmissionsAction && isTaskViewable(userRole, 8) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('tables')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'tables'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">folder_open</Icon>
                    <span>{isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'}</span>
                  </button>
                )}

                {/* 5. Optional: Approved Motor Registry (Controlled by Super Admin toggle) */}
                {settings.showClerkApprovedVehiclesAction && isTaskViewable(userRole, 8) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTableInitialTab('approved');
                      setActivePage('tables');
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'tables'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">verified</Icon>
                    <span>{isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Registry'}</span>
                  </button>
                )}

                {/* 6. Inspection Report Link (if clerk permitted) */}
                {isTaskViewable(userRole, 10) && (
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionInitialFilter('all');
                      setActivePage('inspection_report');
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'inspection_report'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">analytics</Icon>
                    <span>{isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report'}</span>
                  </button>
                )}
              </>
            ) : (
              /* NON-CLERK ROLES (ADMIN, OFFICER, SUPERADMIN) */
              <>
                {/* Registration Link */}
                {userRole !== 'officer' && isTaskViewable(userRole, 1) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('forms')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'forms'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">how_to_reg</Icon>
                    <span>{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
                  </button>
                )}

                {/* Payment Receipts Link */}
                {userRole !== 'officer' && isTaskViewable(userRole, 1) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('payment_receipts')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'payment_receipts'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px] text-emerald-400">receipt_long</Icon>
                    <span>{isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts'}</span>
                  </button>
                )}

                {/* Records Table Link */}
                {userRole !== 'officer' && isTaskViewable(userRole, 8) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('tables')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'tables'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">table_chart</Icon>
                    <span>{isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Tables'}</span>
                  </button>
                )}

                {/* Inspection Report Link */}
                {isTaskViewable(userRole, 10) && (
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionInitialFilter('all');
                      setActivePage('inspection_report');
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'inspection_report'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">analytics</Icon>
                    <span>{isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report'}</span>
                  </button>
                )}

                {/* Scan QR Scanner Link */}
                {isTaskViewable(userRole, 5) && (
                  <button
                    type="button"
                    onClick={() => setActivePage('scan')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'scan'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px]">qr_code_scanner</Icon>
                    <span>{isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}</span>
                  </button>
                )}

                {/* Report Unregistered Vehicle Link */}
                <button
                  type="button"
                  onClick={() => setActivePage('report_unregistered')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activePage === 'report_unregistered'
                      ? 'bg-[#1D61E7] text-white font-black shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="material-symbols-outlined text-[20px] text-amber-400">report_problem</Icon>
                  <span>{isAmharic ? 'ባልተመዘገበ ተሽከርካሪ ሪፖርት' : 'Report Unregistered Vehicle'}</span>
                </button>

                {/* Unlawful Motors Link (Manager & Super Admin) */}
                {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && (
                  <button
                    type="button"
                    onClick={() => setActivePage('unregistered_list')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'unregistered_list'
                        ? 'bg-[#1D61E7] text-white font-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[20px] text-red-400">no_drinks</Icon>
                    <span>{isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry'}</span>
                  </button>
                )}
              </>
            )}

            {/* Super Admin Dedicated Governance Links (SUPER ADMIN ONLY) */}
            {(userRole === 'superadmin') && (
              <div className="pt-2 mt-2 border-t border-white/15 space-y-1">
                <p className="text-[10px] font-black text-[#60A5FA] uppercase tracking-wider px-3 mb-1 flex items-center gap-1">
                  <Icon className="material-symbols-outlined text-[14px]">admin_panel_settings</Icon>
                  <span>{isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin'}</span>
                </p>

                {/* 1. System Users & Roles */}
                <button
                  type="button"
                  onClick={() => setActivePage('superadmin_users')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activePage === 'superadmin_users' || activePage === 'superadmin'
                      ? 'bg-[#1D61E7] text-white font-black shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="material-symbols-outlined text-[18px]">manage_accounts</Icon>
                  <span>{isAmharic ? 'ሚና እና ፈቃድ' : 'Roles & Permissions'}</span>
                </button>

                {/* 2. Sub-City Governance */}
                <button
                  type="button"
                  onClick={() => setActivePage('superadmin_subcities')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activePage === 'superadmin_subcities'
                      ? 'bg-[#1D61E7] text-white font-black shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="material-symbols-outlined text-[18px]">location_city</Icon>
                  <span>{isAmharic ? 'የክፍለ ከተማ ቁጥጥር' : 'Sub-City Governance'}</span>
                </button>

                {/* 4. Master Permit Controls */}
                <button
                  type="button"
                  onClick={() => setActivePage('superadmin_permits')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activePage === 'superadmin_permits'
                      ? 'bg-[#1D61E7] text-white font-black shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="material-symbols-outlined text-[18px]">verified</Icon>
                  <span>{isAmharic ? 'የፈቃድ ቁጥጥር' : 'Master Permit Rules'}</span>
                </button>

                {/* 5. System Maintenance & DB */}
                <button
                  type="button"
                  onClick={() => setActivePage('superadmin_maintenance')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activePage === 'superadmin_maintenance'
                      ? 'bg-[#1D61E7] text-white font-black shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="material-symbols-outlined text-[18px]">database</Icon>
                  <span>{isAmharic ? 'የሲስተም ጥገና' : 'System Maintenance'}</span>
                </button>
              </div>
            )}

            {/* Universal Settings Page Link (For All Roles) */}
            <div className="pt-2 mt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => {
                  setActivePage('settings');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  activePage === 'settings'
                    ? 'bg-[#1D61E7] text-white font-black shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="material-symbols-outlined text-[20px]">settings</Icon>
                <span>{isAmharic ? 'ቅንብሮች' : 'Settings'}</span>
              </button>
            </div>
          </nav>

          {/* Sidebar Bottom Profile Card & Logout (Matching Image Exact Structure) */}
          <div className="pt-3 border-t border-[#1E3466] space-y-2 mt-auto">
            <div className="bg-[#112248] border border-[#1E3466] rounded-md p-2.5 flex items-center gap-2.5 text-white shadow-xs">
              <div className="w-9 h-9 rounded-full bg-slate-200 border-2 border-amber-400 shrink-0 overflow-hidden shadow-xs flex items-center justify-center">
                <img src={APP_LOGO} alt="User Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-black text-white block truncate leading-tight">
                  {userBadgeId ? userBadgeId : (isAmharic ? 'አቶ መፈሪያ' : 'Mr. Meferiya')}
                </span>
                <span className="text-[10px] text-slate-300 font-medium block truncate">
                  {userRole === 'superadmin' ? 'Super Admin' : userRole === 'admin' ? 'Manager' : userRole === 'clerk' ? 'Secretary' : 'Officer'}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] text-emerald-400 font-bold">Online</span>
                </div>
              </div>
            </div>

            {/* Bottom Non-Red Logout Button (With Confirmation Modal) */}
            <button
              type="button"
              onClick={() => setIsLogoutModalOpen(true)}
              className="w-full bg-[#132A5E] hover:bg-[#1A387C] text-white border border-[#2A4E9B] font-extrabold text-xs py-2.5 rounded-md flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98"
            >
              <Icon className="material-symbols-outlined text-[18px] text-amber-400">logout</Icon>
              <span>{isAmharic ? 'ወጣ (Logout)' : 'Logout'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN CONTAINER & TOP HEADER (md:pl-64) ==================== */}
      <div className="md:pl-64 flex-1 flex flex-col min-w-0 h-full max-h-full overflow-hidden">
        
        {/* MOBILE NAVIGATION HEADER (md:hidden) */}
        <header className="sticky top-0 z-50 bg-[#0B1E48] text-white shadow-md px-3 sm:px-6 py-2.5 md:hidden shrink-0 relative overflow-hidden">
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
                  <h1 id="header-text" className="font-extrabold text-xs sm:text-sm text-white tracking-tight leading-tight truncate">
                    {isAmharic ? 'ባህርዳር ሞተረኞች ማህበር' : 'BAHIR DAR MOTORCYCLISTS ASSOCIATION'}
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
                      ? 'bg-yellow-500 text-[#0B1E48] shadow-xs font-black'
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
                        ? 'bg-yellow-500 text-[#0B1E48] shadow-xs font-black'
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
                        ? 'bg-yellow-500 text-[#0B1E48] shadow-xs font-black'
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
                        ? 'bg-yellow-500 text-[#0B1E48] shadow-xs font-black'
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
                        ? 'bg-yellow-500 text-[#0B1E48] shadow-xs font-black'
                        : 'text-white/90 hover:bg-white/15'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-[16px]">qr_code_scanner</Icon>
                    <span>{isAmharic ? 'ፍተሻ' : 'Scan'}</span>
                  </button>
                )}
              </nav>

              {/* Right Controls (UNIFIED MENU TOGGLE BUTTON & NOTIFICATION BELL) */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Mobile Notification Bell Icon Button */}
                <div className="relative" ref={mobileNotificationRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotificationOpen(!isNotificationOpen);
                      if (isMobileMenuOpen) setIsMobileMenuOpen(false);
                    }}
                    className={`w-9 h-9 flex items-center justify-center rounded-md border transition-all cursor-pointer shrink-0 shadow-2xs relative ${
                      isNotificationOpen
                        ? 'bg-yellow-500 text-[#0B1E48] border-yellow-400 font-black'
                        : 'bg-white/10 border-white/20 text-white hover:bg-white/20 active:scale-95'
                    }`}
                    title={isAmharic ? 'ማሳወቂያዎች' : 'Notifications'}
                    aria-label="Notifications"
                  >
                    <Icon className="material-symbols-outlined text-[20px]">notifications</Icon>
                    {unreadNotificationCount > 0 && (
                      <span className="bg-rose-500 text-white text-[10px] font-black min-w-[18px] h-4.5 px-1 rounded-full flex items-center justify-center absolute -top-1.5 -right-1.5 shadow-2xs border-2 border-[#0B1E48] animate-pulse">
                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* Mobile Drawer Menu Toggle */}
                <button
                  ref={mobileMenuButtonRef}
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(!isMobileMenuOpen);
                    if (isNotificationOpen) setIsNotificationOpen(false);
                  }}
                  aria-label="Toggle Navigation Menu"
                  className="w-9 h-9 flex items-center justify-center rounded-md bg-white/10 border border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer shrink-0 shadow-2xs"
                >
                  <Icon className="material-symbols-outlined text-[22px]">
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
        {isMobileMenuOpen && (
          <div
            className="fixed top-[53px] sm:top-[57px] inset-x-0 bottom-0 z-40 bg-slate-950/65 backdrop-blur-md transition-opacity duration-300 animate-in fade-in md:hidden flex justify-end"
            onClick={() => setIsMobileMenuOpen(false)}
            onPointerDown={() => setIsMobileMenuOpen(false)}
            onTouchStart={() => setIsMobileMenuOpen(false)}
          >
            {/* Right Slide-Out Drawer Panel (Reduced Width for Mobile UI) */}
            <div
              ref={mobileDrawerRef}
              className="relative w-64 sm:w-72 max-w-[78vw] h-full bg-[#0B1E48] text-white border-l border-yellow-500/30 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300 ease-out p-4 sm:p-5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                {/* Mobile Simple Ethiopian Calendar Date & Time Widget */}
                <div className="bg-gradient-to-r from-white/10 to-white/5 border border-yellow-500/30 rounded-lg p-3 text-white space-y-2 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-yellow-400 font-extrabold text-xs">
                      <Icon className="material-symbols-outlined text-[18px]">calendar_month</Icon>
                      <span>{isAmharic ? ethDate.formattedAm : ethDate.formattedEn}</span>
                    </div>
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded font-black">
                      {isAmharic ? ethDate.weekdayAm : ethDate.weekdayEn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1.5 border-t border-white/10 font-mono">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                      <Icon className="material-symbols-outlined text-[15px]">schedule</Icon>
                      <span>{isAmharic ? ethDate.timeAm : ethDate.timeEn}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-extrabold">
                      GMT+3
                    </span>
                  </div>
                </div>

                {/* Mobile Main Navigation Links */}
                <div className="space-y-1">
                  <p className="text-[10px] font-extrabold text-yellow-400/80 uppercase tracking-wider px-1 mb-1.5">
                    {isAmharic ? 'ዋና ክፍሎች' : 'Navigation Pages'}
                  </p>

                  {/* Dashboard */}
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activePage === 'dashboard'
                        ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                        : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'dashboard' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                        space_dashboard
                      </Icon>
                      <span className="font-extrabold">{isAmharic ? 'ዋና ገፅ' : 'Dashboard'}</span>
                    </div>
                    <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                  </button>

                  {/* CLERK SPECIFIC MOBILE DRAWER - MATCHING QUICK ACTIONS */}
                  {userRole === 'clerk' ? (
                    <>
                      {/* 1. New Registration */}
                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('forms');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'forms'
                            ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                            : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'forms' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                            how_to_reg
                          </Icon>
                          <span className="font-extrabold">{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
                        </div>
                        <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                      </button>

                      {/* 2. Submission Correction */}
                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('today_submissions_adjust');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'today_submissions_adjust'
                            ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                            : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'today_submissions_adjust' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                            edit_note
                          </Icon>
                          <span className="font-extrabold">{isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction'}</span>
                        </div>
                        <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                      </button>

                      {/* 3. Scan QR Code */}
                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('scan');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'scan'
                            ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                            : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'scan' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                            qr_code_scanner
                          </Icon>
                          <span className="font-extrabold">{isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}</span>
                        </div>
                        <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                      </button>

                      {/* 4. Optional: View Submissions */}
                      {settings.showClerkSubmissionsAction && (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePage('tables');
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            activePage === 'tables'
                              ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'tables' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                              folder_open
                            </Icon>
                            <span className="font-extrabold">{isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'}</span>
                          </div>
                          <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                        </button>
                      )}

                      {/* 5. Optional: Approved Registry */}
                      {settings.showClerkApprovedVehiclesAction && (
                        <button
                          type="button"
                          onClick={() => {
                            setTableInitialTab('approved');
                            setActivePage('tables');
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            activePage === 'tables'
                              ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'tables' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                              verified
                            </Icon>
                            <span className="font-extrabold">{isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Registry'}</span>
                          </div>
                          <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                        </button>
                      )}
                    </>
                  ) : (
                    /* NON-CLERK MOBILE MENU */
                    <>
                      {/* Registration */}
                      {userRole !== 'officer' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePage('forms');
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            activePage === 'forms'
                              ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'forms' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                              how_to_reg
                            </Icon>
                            <span className="font-extrabold">{isAmharic ? 'ምዝገባ' : 'Registration'}</span>
                          </div>
                          <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                        </button>
                      )}

                      {/* Database Records */}
                      {userRole !== 'officer' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePage('tables');
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            activePage === 'tables'
                              ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'tables' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                              table_chart
                            </Icon>
                            <span className="font-extrabold">{isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Database'}</span>
                          </div>
                          <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                        </button>
                      )}

                      {/* Inspection Report */}
                      {isTaskViewable(userRole, 10) && (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectionInitialFilter('all');
                            setActivePage('inspection_report');
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            activePage === 'inspection_report'
                              ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'inspection_report' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                              analytics
                            </Icon>
                            <span className="font-extrabold">{isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report'}</span>
                          </div>
                          <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                        </button>
                      )}

                      {/* Scan QR */}
                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('scan');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'scan'
                            ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                            : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'scan' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                            qr_code_scanner
                          </Icon>
                          <span className="font-extrabold">{isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code'}</span>
                        </div>
                        <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                      </button>

                      {/* Unlawful Motors (Manager & Super Admin) */}
                      {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && (
                        <button
                          type="button"
                          onClick={() => {
                            setActivePage('unregistered_list');
                            setIsMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            activePage === 'unregistered_list'
                              ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'unregistered_list' ? 'text-[#0B1E48]' : 'text-red-400'}`}>
                              no_drinks
                            </Icon>
                            <span className="font-extrabold">{isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry'}</span>
                          </div>
                          <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                        </button>
                      )}
                    </>
                  )}

                  {/* Separate Super Admin Functions Menu */}
                  {(userRole === 'superadmin') && (
                    <div className="pt-3 mt-3 border-t border-white/15 space-y-1">
                      <p className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1">
                        <Icon className="material-symbols-outlined text-[14px]">admin_panel_settings</Icon>
                        <span>{isAmharic ? 'ዋና አስተዳዳሪ' : 'Super Admin'}</span>
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('superadmin_users');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'superadmin_users' || activePage === 'superadmin'
                            ? 'bg-amber-400 text-[#0B1E48] font-black shadow-sm'
                            : 'bg-purple-950/40 border border-purple-500/30 text-purple-200 hover:bg-purple-900/40'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[18px]">manage_accounts</Icon>
                        <span>{isAmharic ? 'ሚና እና ፈቃድ' : 'Roles & Permissions'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('superadmin_subcities');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'superadmin_subcities'
                            ? 'bg-amber-400 text-[#0B1E48] font-black shadow-sm'
                            : 'bg-purple-950/40 border border-purple-500/30 text-purple-200 hover:bg-purple-900/40'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[18px]">location_city</Icon>
                        <span>{isAmharic ? 'የክፍለ ከተማ ቁጥጥር' : 'Sub-City Governance'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('superadmin_permits');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'superadmin_permits'
                            ? 'bg-amber-400 text-[#0B1E48] font-black shadow-sm'
                            : 'bg-purple-950/40 border border-purple-500/30 text-purple-200 hover:bg-purple-900/40'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[18px]">verified</Icon>
                        <span>{isAmharic ? 'የፈቃድ ቁጥጥር' : 'Master Permit Rules'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActivePage('superadmin_maintenance');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          activePage === 'superadmin_maintenance'
                            ? 'bg-amber-400 text-[#0B1E48] font-black shadow-sm'
                            : 'bg-purple-950/40 border border-purple-500/30 text-purple-200 hover:bg-purple-900/40'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[18px]">database</Icon>
                        <span>{isAmharic ? 'የሲስተም ጥገና' : 'System Maintenance'}</span>
                      </button>
                    </div>
                  )}

                  {/* Settings Link for All Roles */}
                  <div className="pt-2 mt-2 border-t border-white/15">
                    <button
                      type="button"
                      onClick={() => {
                        setActivePage('settings');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        activePage === 'settings'
                          ? 'bg-yellow-500 text-[#0B1E48] shadow-sm font-black'
                          : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`material-symbols-outlined text-[20px] ${activePage === 'settings' ? 'text-[#0B1E48]' : 'text-yellow-400'}`}>
                          settings
                        </Icon>
                        <span className="font-extrabold">{isAmharic ? 'ቅንብሮች' : 'Settings'}</span>
                      </div>
                      <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
                    </button>
                  </div>
                </div>
              </div>

              {/* Drawer Bottom Actions */}
              <div className="space-y-3 pt-3 border-t border-white/15">
                <p className="text-[10px] font-extrabold text-yellow-400/80 uppercase tracking-wider px-1">
                  {isAmharic ? 'የስርዓት ማስተካከያ' : 'System Preferences'}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {/* Language Toggle */}
                  <button
                    type="button"
                    onClick={onToggleLang}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-white/10 border border-white/20 text-xs font-bold text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="material-symbols-outlined text-[18px]">translate</Icon>
                      <span>{currentLang === 'am' ? 'English' : 'አማርኛ'}</span>
                    </div>
                  </button>

                  {/* Theme Toggle */}
                  {onToggleTheme && (
                    <button
                      type="button"
                      onClick={onToggleTheme}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-white/10 border border-white/20 text-xs font-bold text-white hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="material-symbols-outlined text-[18px]">
                          {currentTheme === 'dark' ? 'dark_mode' : 'light_mode'}
                        </Icon>
                        <span>{currentTheme === 'dark' ? 'Light' : 'Dark'}</span>
                      </div>
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
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#132A5E] hover:bg-[#1A387C] border border-[#2A4E9B] text-white rounded-md text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <Icon className="material-symbols-outlined text-[18px] text-amber-400">logout</Icon>
                  <span>{isAmharic ? 'ውጣ' : 'Sign Out'}</span>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* DESKTOP TOP BAR (hidden md:flex) */}
        <header className="hidden md:flex items-center justify-between px-4 sm:px-6 py-3 bg-white text-slate-900 sticky top-0 z-40 shadow-2xs relative overflow-hidden">
          {/* Animated Navbar Action Loading Progress Bar (Under top navbar) */}
          {actionLoadingState.isLoading && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-100 dark:bg-slate-800 overflow-hidden z-50 pointer-events-none">
              <div className="h-full bg-gradient-to-r from-blue-600 via-amber-400 to-blue-600 animate-navbar-progress rounded-full" />
            </div>
          )}

          {/* Left Side: Active Page Title */}
          <div className="flex items-center gap-3">
            <h2 className="font-black text-base text-[#0B1E48] tracking-tight flex items-center gap-2.5">
              <Icon className="material-symbols-outlined text-[#1D61E7] text-[24px]">
                {activePage === 'dashboard' && 'space_dashboard'}
                {activePage === 'forms' && 'how_to_reg'}
                {activePage === 'today_submissions_adjust' && 'edit_note'}
                {activePage === 'tables' && (tableInitialTab === 'approved' ? 'verified' : 'table_chart')}
                {activePage === 'inspection_report' && 'analytics'}
                {activePage === 'report_unregistered' && 'report_problem'}
                {activePage === 'unregistered_list' && 'no_drinks'}
                {activePage === 'payment_receipts' && 'receipt_long'}
                {activePage === 'workstation' && 'badge'}
                {activePage === 'scan' && 'qr_code_scanner'}
                {(activePage === 'superadmin_users' || activePage === 'superadmin') && 'manage_accounts'}
                {activePage === 'superadmin_subcities' && 'location_city'}
                {activePage === 'superadmin_security' && 'shield'}
                {activePage === 'superadmin_permits' && 'verified'}
                {activePage === 'superadmin_maintenance' && 'database'}
                {activePage === 'superadmin_owners' && 'badge'}
                {activePage === 'settings' && 'settings'}
              </Icon>
              <span>
                {activePage === 'dashboard' && (isAmharic ? 'ዋና ገፅ' : 'Dashboard')}
                {activePage === 'forms' && (isAmharic ? 'አዲስ ምዝገባ' : 'New Registration')}
                {activePage === 'today_submissions_adjust' && (isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction')}
                {activePage === 'tables' && (
                  userRole === 'clerk'
                    ? (tableInitialTab === 'approved' ? (isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Motor Registry') : (isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'))
                    : (isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Tables')
                )}
                {activePage === 'inspection_report' && (isAmharic ? 'የፍተሻ ሪፖርት' : 'Inspection Report')}
                {activePage === 'report_unregistered' && (isAmharic ? 'ባልተመዘገበ ተሽከርካሪ ሪፖርት' : 'Report Unregistered Vehicle')}
                {activePage === 'unregistered_list' && (isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry')}
                {activePage === 'payment_receipts' && (isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts')}
                {activePage === 'workstation' && (isAmharic ? 'የተጠቃሚ ሚና ስራ ማዕከል' : 'Role Workstation')}
                {activePage === 'scan' && (isAmharic ? 'ኮውአር ኮድ ፈትሽ' : 'Scan QR Code')}
                {(activePage === 'superadmin_users' || activePage === 'superadmin') && (isAmharic ? 'ሚና እና ፈቃድ' : 'Roles & Permissions')}
                {activePage === 'superadmin_subcities' && (isAmharic ? 'የክፍለ ከተማ ቁጥጥር' : 'Sub-City Governance')}
                {activePage === 'superadmin_security' && (isAmharic ? 'የሴኪዩሪቲ ኦዲት' : 'Security & Audit Logs')}
                {activePage === 'superadmin_permits' && (isAmharic ? 'የፈቃድ ቁጥጥር' : 'Master Permit Rules')}
                {activePage === 'superadmin_maintenance' && (isAmharic ? 'የሲስተም ጥገና' : 'System Maintenance')}
                {activePage === 'superadmin_owners' && (isAmharic ? 'የተመዘገቡ ባለቤቶች' : 'Registered Owners Directory')}
                {activePage === 'settings' && (isAmharic ? 'ቅንብሮች' : 'Settings')}
              </span>
            </h2>
          </div>

          {/* Right Side Tools: Notifications, Mail, Date Dropdown, User Dropdown */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Notification Bell Icon Button with dynamic unread badge */}
            <div className="relative" ref={notificationDropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                  isNotificationOpen
                    ? 'bg-primary text-white border border-primary shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-200/90 text-slate-700'
                }`}
                title={isAmharic ? 'ማሳወቂያዎች' : 'Notifications'}
                aria-label="Notifications"
              >
                <Icon className="material-symbols-outlined text-[20px]">notifications</Icon>
                {unreadNotificationCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black min-w-[18px] h-4.5 px-1 rounded-full flex items-center justify-center absolute -top-1 -right-1 shadow-2xs border-2 border-white animate-pulse">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Desktop Notification Dropdown */}
              {isNotificationOpen && (
                <div
                  className="absolute right-0 mt-2 w-84 sm:w-96 bg-surface-container-lowest border border-outline-variant/80 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 text-on-surface"
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
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-2 cursor-pointer transition-all shadow-2xs select-none"
                title={isAmharic ? 'የኢትዮጵያ ቀን መቁጠሪያ' : 'Ethiopian Calendar'}
              >
                <Icon className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">calendar_month</Icon>
                <span className="font-extrabold">{isAmharic ? ethDate.formattedAm : ethDate.formattedEn}</span>
                <span className="hidden lg:inline text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono px-1.5 py-0.5 rounded font-bold">
                  {isAmharic ? ethDate.timeAm : ethDate.timeEn}
                </span>
                <Icon className="material-symbols-outlined text-slate-400 text-[16px]">
                  {isDateDropdownOpen ? 'expand_less' : 'expand_more'}
                </Icon>
              </button>

              {/* Interactive Ethiopian Calendar Dropdown */}
              {isDateDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-80 sm:w-88 bg-surface-container-lowest border border-outline-variant/80 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-on-surface"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Municipal Calendar Header */}
                  <div className="bg-[#0B1E48] text-white p-3.5 rounded-lg border-b-2 border-yellow-500 space-y-1 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                        <Icon className="material-symbols-outlined text-[14px]">event</Icon>
                        {isAmharic ? 'የኢትዮጵያ ቀን መቁጠሪያ' : 'Ethiopian National Calendar'}
                      </span>
                      <span className="text-[11px] font-black bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
                        {ethDate.weekdayAm} ({ethDate.weekdayEn})
                      </span>
                    </div>
                    <div className="text-base font-black tracking-tight text-white">
                      {ethDate.monthNameAm} {ethDate.day} ቀን {ethDate.year} ዓ.ም
                    </div>
                    <div className="text-xs text-slate-300 font-medium">
                      {ethDate.monthNameEn} {ethDate.day}, {ethDate.year} EC
                    </div>
                  </div>

                  {/* Real-time Digital Clocks */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-surface-container p-2.5 rounded-lg border border-outline-variant">
                      <span className="text-[11px] text-secondary block font-bold">
                        {isAmharic ? 'መደበኛ ሰዓት' : 'Standard Time'}
                      </span>
                      <span className="font-mono font-black text-xs text-primary flex items-center gap-1 mt-0.5">
                        <Icon className="material-symbols-outlined text-[14px] text-amber-500">schedule</Icon>
                        {isAmharic ? ethDate.timeAm : ethDate.timeEn}
                      </span>
                    </div>

                    <div className="bg-surface-container p-2.5 rounded-lg border border-outline-variant">
                      <span className="text-[11px] text-secondary block font-bold">
                        {isAmharic ? 'የሀገር ባህል ሰዓት' : 'Ethiopian Local Time'}
                      </span>
                      <span className="font-mono font-black text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1 mt-0.5">
                        <Icon className="material-symbols-outlined text-[14px]">sunny</Icon>
                        {ethDate.traditionalTimeAm}
                      </span>
                    </div>
                  </div>

                  {/* Ethiopian Calendar Date & GMT+3 Standard */}
                  <div className="mt-3 bg-surface-container/60 p-2.5 rounded-lg border border-outline-variant flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[11px] text-secondary block font-bold">
                        {isAmharic ? 'የኢትዮጵያ ካሌንደር (GMT+3)' : 'Ethiopian Calendar (GMT+3)'}
                      </span>
                      <span className="font-bold text-on-surface">
                        {isAmharic ? ethDate.formattedAm : ethDate.formattedEn}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-extrabold text-amber-800 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded">
                      GMT+3
                    </span>
                  </div>

                  {/* Calendar Quick Month Navigation Grid for Visual Display */}
                  <div className="mt-3 pt-3 border-t border-outline-variant">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-extrabold text-on-surface">
                        {isAmharic ? `የወሩ ቀናት (${ethDate.monthNameAm})` : `Days of ${ethDate.monthNameEn}`}
                      </span>
                      <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded">
                        {isAmharic ? 'ዛሬ: ' + ethDate.day : 'Today: ' + ethDate.day}
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold">
                      {['እ', 'ሰ', 'ማ', 'ረ', 'ሐ', 'ዓ', 'ቅ'].map((day, idx) => (
                        <div key={idx} className="text-secondary text-[11px] font-black py-0.5">
                          {day}
                        </div>
                      ))}
                      {Array.from({ length: ethDate.isPagume ? 6 : 30 }, (_, i) => i + 1).map((d) => (
                        <div
                          key={d}
                          className={`py-1 rounded font-mono font-bold text-xs ${
                            d === ethDate.day
                              ? 'bg-[#0B1E48] text-yellow-300 font-black shadow-xs ring-2 ring-yellow-400'
                              : 'text-on-surface hover:bg-surface-container'
                          }`}
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Close / Dismiss */}
                  <div className="mt-3 pt-2 border-t border-outline-variant/60 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDateDropdownOpen(false)}
                      className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors cursor-pointer border border-outline-variant"
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
                className="bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
              >
                <div className="w-6 h-6 rounded-full bg-[#0B1E48] text-white flex items-center justify-center shrink-0 border border-slate-200">
                  <Icon className="material-symbols-outlined text-[14px]">person</Icon>
                </div>
                <div className="text-left hidden sm:block">
                  <span className="text-xs font-black text-on-surface block leading-tight">
                    {userBadgeId ? userBadgeId : (isAmharic ? 'አቶ መፈሪያ' : 'Mr. Meferiya')}
                  </span>
                </div>
                <Icon className="material-symbols-outlined text-secondary text-[18px]">expand_more</Icon>
              </button>

              {/* User Dropdown Menu */}
              {isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-on-surface">
                  <div className="px-4 py-2 border-b border-outline-variant/60">
                    <p className="text-xs font-black text-on-surface">
                      {userBadgeId ? userBadgeId : (isAmharic ? 'አቶ መፈሪያ' : 'Mr. Meferiya')}
                    </p>
                    <p className="text-xs text-secondary font-semibold capitalize">
                      {userRole === 'superadmin' ? 'Super Admin' : userRole === 'admin' ? 'Manager' : userRole === 'clerk' ? 'Secretary' : 'Officer'}
                    </p>
                  </div>

                  {/* Role Switcher in Dropdown */}
                  {onSwitchRole && (
                    <div className="px-3 py-2 border-b border-outline-variant/60 space-y-1">
                      <p className="text-[11px] font-extrabold uppercase text-secondary tracking-wider">
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
                            className={`px-2 py-1 rounded-md text-[11px] font-bold capitalize text-left transition-all ${
                              userRole === r
                                ? 'bg-primary text-white font-black'
                                : 'text-on-surface hover:bg-surface-container'
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
                      className="w-full px-3 py-2 text-xs font-bold text-on-surface hover:bg-surface-container flex items-center gap-2 text-left cursor-pointer transition-colors"
                    >
                      <Icon className="material-symbols-outlined text-[18px] text-secondary">settings</Icon>
                      <span>{isAmharic ? 'ቅንብሮች (Settings)' : 'Settings'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserDropdownOpen(false);
                        setIsLogoutModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 text-left cursor-pointer transition-colors border-t border-outline-variant/40"
                    >
                      <Icon className="material-symbols-outlined text-[18px] text-rose-600 dark:text-rose-400">logout</Icon>
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
            : "flex-1 overflow-y-auto w-full max-w-7xl md:max-w-[1600px] px-3 sm:px-4 md:px-6 pt-1.5 sm:pt-2 md:pt-2 pb-16 md:pb-8 mx-auto min-h-0"
        }>
          {/* BREADCRUMB NAVIGATION MENU */}
          {activePage !== 'scan' && (
            <nav aria-label="Breadcrumb" className="bg-transparent px-0 py-0 mb-1 sm:mb-1.5 md:mb-2 flex items-center overflow-x-auto scrollbar-none transition-all">
              <ol className="flex items-center gap-1 sm:gap-1.5 text-xs font-semibold text-secondary min-w-0">
                {breadcrumbItems.map((item, index) => {
                  const isLast = index === breadcrumbItems.length - 1;
                  return (
                    <li key={index} className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
                      {index > 0 && (
                        <Icon className="material-symbols-outlined text-[13px] text-secondary shrink-0 opacity-60">
                          chevron_right
                        </Icon>
                      )}
                      <button
                        type="button"
                        onClick={() => setActivePage(item.page as any)}
                        disabled={isLast}
                        className={`flex items-center gap-1 py-0.5 px-2 rounded-md transition-all text-xs ${
                          isLast
                            ? 'text-on-surface font-extrabold cursor-default bg-surface-container/60'
                            : 'text-secondary hover:text-on-surface hover:bg-surface-container font-semibold cursor-pointer'
                        }`}
                      >
                        <Icon className="material-symbols-outlined text-[15px] shrink-0 opacity-80">
                          {item.icon}
                        </Icon>
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
            <>
              {/* PAGE 1: UNIVERSAL DASHBOARD OVERVIEW */}
              {activePage === 'dashboard' && (
                <MunicipalDashboardOverview
                  userBadgeId={userBadgeId}
                  userRole={userRole}
                  lang={currentLang}
                  registrations={registrations}
                  officers={officers}
                  verificationLogs={verificationLogs}
                  unregisteredReports={unregisteredReports}
                  paymentReceipts={paymentReceipts}
                  onQuickAction={handleQuickAction}
                  onAddVerificationLog={handleAddVerificationLog}
                />
              )}

              {/* PAGE 2: DEDICATED FORMS PAGE */}
              {activePage === 'forms' && (
                <FormsPage
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  registrations={registrations}
                  officers={officers}
                  onAddRegistration={handleAddRegistration}
                  onViewRegistered={() => setActivePage('today_submissions_adjust')}
                  onAddOfficerAssignment={handleAddOfficerAssignment}
                />
              )}

              {/* PAGE: TODAY'S SUBMISSIONS / EDITING & CORRECTION */}
              {activePage === 'today_submissions_adjust' && (
                <TodaySubmissionsPage
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  registrations={registrations}
                  onNavigateToNewRegistration={() => setActivePage('forms')}
                  onShowToast={(msg, type) => addToast(msg, type === 'warning' ? 'error' : type)}
                />
              )}

              {/* PAGE 3: DEDICATED TABLES & RECORDS PAGE */}
              {activePage === 'tables' && (
                <TablesPage
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  registrations={registrations}
                  officers={officers}
                  verificationLogs={verificationLogs}
                  paymentReceipts={paymentReceipts}
                  onSavePaymentReceipt={handleAddPaymentReceipt}
                  onApproveRegistration={handleApproveRegistration}
                  onRejectRegistration={handleRejectRegistration}
                  onAddVerificationLog={handleAddVerificationLog}
                  initialTableTab={tableInitialTab}
                  onShowToast={(msg, type) => addToast(msg, type === 'warning' ? 'error' : type)}
                />
              )}

              {/* PAGE: DEDICATED INSPECTION REPORT (VERIFICATION LOG) PAGE */}
              {activePage === 'inspection_report' && (
                <OfficerVerificationHistory
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  registrations={registrations}
                  verificationLogs={verificationLogs}
                  onAddVerificationLog={handleAddVerificationLog}
                  initialStatusFilter={inspectionInitialFilter}
                />
              )}

              {/* PAGE: UNREGISTERED VEHICLE REPORT FORM */}
              {activePage === 'report_unregistered' && (
                <UnregisteredVehicleForm
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  officerName={userRole === 'officer' ? 'Traffic Patrol Officer' : 'System Officer'}
                  onSubmitReport={handleAddUnregisteredReport}
                  onCancel={() => setActivePage('unregistered_list')}
                />
              )}

              {/* PAGE: UNREGISTERED VEHICLE REPORTS LIST */}
              {activePage === 'unregistered_list' && (
                <UnregisteredReportsList
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  unregisteredReports={unregisteredReports}
                  onUpdateStatus={handleUpdateUnregisteredReportStatus}
                  onNewReportClick={() => setActivePage('report_unregistered')}
                  onOpenRegisterForm={() => setActivePage('forms')}
                />
              )}

              {/* PAGE: PAYMENT RECEIPT ENTRY & EXPIRATION METRICS */}
              {activePage === 'payment_receipts' && (
                <PaymentReceiptsPage
                  lang={currentLang}
                  userRole={userRole}
                  userBadgeId={userBadgeId}
                  paymentReceipts={paymentReceipts}
                  registrations={registrations}
                  onSaveReceipt={handleAddPaymentReceipt}
                  onAddPaymentReceipt={handleAddPaymentReceipt}
                  onDeleteReceipt={handleDeletePaymentReceipt}
                  onDeletePaymentReceipt={handleDeletePaymentReceipt}
                />
              )}

              {/* PAGE 7: SUPER ADMIN GOVERNANCE SEPARATE PAGES */}
              {activePage.startsWith('superadmin') && userRole === 'superadmin' && (
                <SuperAdminInterface
                  currentLang={currentLang}
                  currentUserBadgeId={userBadgeId}
                  initialTab={
                    activePage === 'superadmin_subcities'
                      ? 'subcities'
                      : activePage === 'superadmin_owners'
                      ? 'owners'
                      : activePage === 'superadmin_permits'
                      ? 'permits'
                      : activePage === 'superadmin_maintenance'
                      ? 'maintenance'
                      : 'users'
                  }
                  onShowToast={(msg, type) => addToast(msg, type === 'warning' ? 'error' : type)}
                />
              )}

              {/* PAGE 6: FULL-SCREEN QR SCANNER & VERIFICATION PAGE */}
              {activePage === 'scan' && (
                <SharedScannerModal
                  isOpen={true}
                  onClose={() => setActivePage('dashboard')}
                  lang={currentLang}
                  registrations={registrations}
                  userBadgeId={userBadgeId}
                  userRole={userRole}
                  onAddVerificationLog={handleAddVerificationLog}
                  isPage={true}
                />
              )}

              {/* PAGE 8: UNIVERSAL USER & SYSTEM SETTINGS PAGE (ALL ROLES) */}
              {activePage === 'settings' && (
                <SettingsPage
                  userBadgeId={userBadgeId}
                  userRole={userRole}
                  currentLang={currentLang}
                  currentTheme={currentTheme}
                  onToggleLang={onToggleLang}
                  onToggleTheme={onToggleTheme}
                  onLogoutClick={() => setIsLogoutModalOpen(true)}
                />
              )}
            </>
          )}
        </main>

        {/* Modern, elegant system footer containing language and theme selectors */}
        <footer className="w-full border-t border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
          <div className="text-slate-400 dark:text-slate-500 text-[11px] font-medium text-center sm:text-left">
            {isAmharic ? '© 2016 የግንቦት 12 የባህር ዳር ክፍለ ከተሞች ፈቃድ ቁጥጥር ስርዓት። መብቱ የተጠበቀ ነው።' : '© 2026 Bahir Dar Sub-City Permit Governance System. All rights reserved.'}
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
      </div>

      {/* Floating Toast Notification Stack */}
      <div id="toast-notifications-container" className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 w-full max-w-[360px] pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg border animate-fadeIn transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-surface-container-lowest text-on-surface border-emerald-500 border-l-4'
                : toast.type === 'info'
                ? 'bg-surface-container-lowest text-on-surface border-primary border-l-4'
                : 'bg-surface-container-lowest text-on-surface border-rose-500 border-l-4'
            }`}
          >
            <Icon className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${
              toast.type === 'success' ? 'text-emerald-500' : toast.type === 'info' ? 'text-primary' : 'text-rose-500'
            }`}>
              {toast.type === 'success' ? 'check_circle' : toast.type === 'info' ? 'info' : 'error'}
            </Icon>
            <div className="flex-1">
              <p className="text-xs font-bold leading-snug">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-secondary hover:text-on-surface shrink-0 cursor-pointer transition-colors"
            >
              <Icon className="material-symbols-outlined text-[16px] font-bold">close</Icon>
            </button>
          </div>
        ))}
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
              <div className="w-12 h-12 rounded-xl bg-[#0B1E48] text-amber-400 flex items-center justify-center shrink-0 border border-yellow-500/40 shadow-xs">
                <Icon className="material-symbols-outlined text-[26px]">logout</Icon>
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
                <span className="font-mono bg-surface-container-high px-2 py-0.5 rounded text-[11px] font-extrabold text-[#0B1E48] dark:text-yellow-400">
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
