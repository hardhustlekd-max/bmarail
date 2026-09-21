import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { Language, UserRole, SystemUser, SystemSettings } from '../types';
import { addAuditLogToDb, subscribeSettings, saveSettingsToDb, DEFAULT_SETTINGS } from '../services/dbService';

export interface RoleDefinition {
  id: string;
  roleKey: UserRole | string;
  titleAm: string;
  titleEn: string;
  userCountText: string;
  avatarBg: string;
  avatarType: 'secretary' | 'officer' | 'manager' | 'it' | 'superadmin' | 'custom';
  status: 'active' | 'inactive';
}

export type PermissionState = 'allow' | 'view_only' | 'deny';

export interface ModuleTaskItem {
  id: number;
  icon: string;
  titleAm: string;
  titleEn: string;
  descriptionAm: string;
  descriptionEn: string;
}

export interface SystemModule {
  id: string;
  titleAm: string;
  titleEn: string;
  descriptionAm: string;
  descriptionEn: string;
  icon: string;
  badgeBg: string;
  governedComponents: {
    sideMenuAm: string;
    sideMenuEn: string;
    metricsAm: string;
    metricsEn: string;
    quickMenusAm: string;
    quickMenusEn: string;
    tablesAm: string;
    tablesEn: string;
  };
  tasks: ModuleTaskItem[];
}

export const SYSTEM_MODULES: SystemModule[] = [
  {
    id: 'registration_permits',
    titleAm: '1. አባልና ተሽከርካሪ ምዝገባ ሞጁል',
    titleEn: 'Member & Vehicle Registration Module',
    descriptionAm: 'የአባላት አዲስ ምዝገባ፣ የማመልከቻ ማስተካከያ፣ የሰነድ ማያያዣ እና የአባላት መዝገብ ሰንጠረዥ ቁጥጥር',
    descriptionEn: 'Unified governance for member registrations, corrections, document attachments, and registry tables.',
    icon: 'how_to_reg',
    badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300',
    governedComponents: {
      sideMenuAm: 'የአባላት ምዝገባ፣ የዛሬ ማመልከቻዎች፣ የአባላት ሰንጠረዥ',
      sideMenuEn: 'Member Registrations, Today Submissions, Registry Table',
      metricsAm: 'ጠቅላላ የተመዘገቡ፣ በመጠባበቅ ላይ፣ የጸደቁ ፈቃዶች፣ ውድቅ የተደረጉ',
      metricsEn: 'Total Registered, Pending Approval, Approved Permits, Rejections',
      quickMenusAm: 'አዲስ ምዝገባ ቅጽ፣ ማመልከቻ ማስተካከያ',
      quickMenusEn: 'New Registration Form, Edit Submission',
      tablesAm: 'የአባላትና ተሽከርካሪዎች መዝገብ ሰንጠረዥ',
      tablesEn: 'Member & Vehicle Registrations Ledger Table',
    },
    tasks: [
      {
        id: 1,
        icon: 'person_add',
        titleAm: 'አዲስ አባል / ተሽከርካሪ መመዝገብ',
        titleEn: 'Register New Member / Vehicle',
        descriptionAm: 'አዲስ አባልና የሞተር መረጃ መመዝገቢያ ቅጽ መክፈት',
        descriptionEn: 'Access and submit new registration forms.',
      },
      {
        id: 2,
        icon: 'edit',
        titleAm: 'የአባል መመዝገቢያ ማስተካከል',
        titleEn: 'Edit Member & Vehicle Info',
        descriptionAm: 'የቀረቡ ማመልከቻዎችን እና የአባል መረጃ ማረም',
        descriptionEn: 'Edit same-day or existing member submissions.',
      },
      {
        id: 3,
        icon: 'two_wheeler',
        titleAm: 'የተሽከርካሪና አባል መረጃ ማየት',
        titleEn: 'View Members & Vehicles List',
        descriptionAm: 'የተመዘገቡ አባላትን መዝገብና ዝርዝር ማየት',
        descriptionEn: 'View vehicle registry records and detailed cards.',
      },
      {
        id: 4,
        icon: 'attach_file',
        titleAm: 'ሰነዶች መስቀልና ማያያዝ',
        titleEn: 'Upload Documents & Permits',
        descriptionAm: 'የመንጃ ፈቃድ፣ ብሄራዊ መታወቂያ እና የክፍያ ደረሰኝ መስቀል',
        descriptionEn: 'Upload and update verification documents.',
      },
    ],
  },
  {
    id: 'enforcement_verification',
    titleAm: '2. የትራፊክ ፍተሻና የመስክ ቁጥጥር ሞጁል',
    titleEn: 'Traffic Enforcement & Field Verification Module',
    descriptionAm: 'የQR ኮድ ስካነር፣ የቀጥታ ፍተሻ ታሪክ፣ ያልተመዘገቡ ተሽከርካሪዎች ሪፖርት እና የኦፊሰሮች ምደባ',
    descriptionEn: 'Live QR scanner, field inspection logs, unregistered vehicle reports, and officer duty assignments.',
    icon: 'local_police',
    badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300',
    governedComponents: {
      sideMenuAm: 'የQR ኮድ ስካነር፣ የፍተሻ ታሪክ፣ ያልተመዘገቡ ተሽከርካሪዎች',
      sideMenuEn: 'QR Scanner, Inspection History Log, Unregistered Vehicles',
      metricsAm: 'በስራ ላይ ያሉ ኦፊሰሮች፣ የዛሬ ፍተሻዎች፣ ማስጠንቀቂያ የተሰጣቸው',
      metricsEn: 'Active Officers On Duty, Today Verification Scans, Flagged Vehicles',
      quickMenusAm: 'የQR ኮድ ስካነር፣ ያልተመዘገበ ተሽከርካሪ ሪፖርት',
      quickMenusEn: 'Real-time QR Code Scanner, Submit Unregistered Report',
      tablesAm: 'የፍተሻ ታሪክ ሰንጠረዥ፣ ያልተመዘገቡ ተሽከርካሪዎች ሰንጠረዥ',
      tablesEn: 'Real-time Verification Logs Table, Unregistered Vehicles Table',
    },
    tasks: [
      {
        id: 5,
        icon: 'barcode_scanner',
        titleAm: 'የQR ኮድ ስካነርና የቀጥታ ማረጋገጫ',
        titleEn: 'Real-time QR Code Scanner',
        descriptionAm: 'የካሜራ ስካነር በመጠቀም የፍቃድ ህጋዊነት ማረጋገጥ',
        descriptionEn: 'Scan QR permits via device camera for instant verification.',
      },
      {
        id: 6,
        icon: 'description',
        titleAm: 'የፍተሻ ሪፖርቶችና ታሪክ ማየት',
        titleEn: 'Inspection Reports & Logs Visibility',
        descriptionAm: 'በኦፊሰሮች የተደረጉ ፍተሻዎችን እና የፍተሻ ታሪክ ማየት',
        descriptionEn: 'Access field inspection logs and historical verification scans.',
      },
      {
        id: 7,
        icon: 'report_problem',
        titleAm: 'ያልተመዘገቡ ተሽከርካሪዎች ሪፖርት',
        titleEn: 'Unregistered Vehicle Reporting',
        descriptionAm: 'ያልተመዘገቡ ወይም ህገ-ወጥ ተሽከርካሪዎችን መመዝገብና ማየት',
        descriptionEn: 'Submit and view unregistered or flagged vehicle reports.',
      },
      {
        id: 8,
        icon: 'badge',
        titleAm: 'የኦፊሰሮች ምደባና የስራ ፈረቃ',
        titleEn: 'Officer Duty & Shift Assignments',
        descriptionAm: 'የትራፊክ ኦፊሰሮችን በየክፍለ ከተማውና ፍተሻ ጣቢያ መመደብ',
        descriptionEn: 'Manage officer checkpoint assignments and duty shifts.',
      },
    ],
  },
  {
    id: 'print_production',
    titleAm: '3. የPVC ካርድ ህትመትና ባች ትዕዛዝ ሞጁል',
    titleEn: 'PVC Card Production & Batch Orders Module',
    descriptionAm: 'የPVC ካርድ ህትመት ወረፋ፣ የባች ማዘዣዎች፣ ኤክስፖርት እና የህትመት ሁኔታ',
    descriptionEn: 'PVC card printing queues, batch printing orders, export lists, and print status trackers.',
    icon: 'print',
    badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300',
    governedComponents: {
      sideMenuAm: 'የPVC ህትመት ወረፋ፣ የባች ትዕዛዞች',
      sideMenuEn: 'PVC Print Queue, Batch Orders',
      metricsAm: 'በህትመት ላይ ያሉ ባቾች፣ የተጠናቀቁ ካርዶች',
      metricsEn: 'Pending Print Batches, Cards In-Printing, Completed Prints',
      quickMenusAm: 'የባች ህትመት ማዘዣ፣ ኤክስፖርት',
      quickMenusEn: 'Order Batch Print, Export Print List',
      tablesAm: 'የህትመት ባች ትዕዛዞች ሰንጠረዥ',
      tablesEn: 'Print Batch Orders Table & Card Queue',
    },
    tasks: [
      {
        id: 9,
        icon: 'inventory_2',
        titleAm: 'የPVC ካርድ ህትመትና የባች ትዕዛዝ ማኔጅመንት',
        titleEn: 'PVC Card Printing Queue & Batch Orders',
        descriptionAm: 'የጸደቁ ፈቃዶችን ወደ ህትመት ማስተላለፍና የባች ትዕዛዝ ማዘዝ',
        descriptionEn: 'Process approved permits into print batch orders and queues.',
      },
    ],
  },
  {
    id: 'revenue_payments',
    titleAm: '4. የገቢና የንግድ ባንክ ክፍያ ደረሰኞች ሞጁል',
    titleEn: 'Revenue & Payment Receipts Module',
    descriptionAm: 'የ1 ወር ክፍያ ደረሰኝ መመዝገቢያ፣ የቴሌብር/ባንክ ማረጋገጫ፣ የገቢ ስታቲስቲክስ እና ሰንጠረዥ',
    descriptionEn: 'Commercial Bank and Telebirr payment receipt entries, revenue KPIs, and ledger records.',
    icon: 'payments',
    badgeBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300',
    governedComponents: {
      sideMenuAm: 'የክፍያ ደረሰኞች፣ የገቢ መዝገብ ሰንጠረዥ',
      sideMenuEn: 'Payment Receipts, Revenue Ledger Table',
      metricsAm: 'ጠቅላላ ገቢ፣ ንቁ ደረሰኞች፣ ጊዜያቸው ያለፈባቸው',
      metricsEn: 'Total Revenue (ETB), Active Receipts, Expired/Delinquent Terms',
      quickMenusAm: 'የክፍያ ደረሰኝ መዝግብ፣ ማረጋገጫ ፈትሽ',
      quickMenusEn: 'Enter Payment Receipt, Verify Reference',
      tablesAm: 'የንግድ ባንክ / ቴሌብር ክፍያ ደረሰኞች ሰንጠረዥ',
      tablesEn: 'Payment Receipts Ledger Table',
    },
    tasks: [
      {
        id: 10,
        icon: 'add_card',
        titleAm: 'የክፍያ ደረሰኝ መመዝገቢያ ቅጽ',
        titleEn: 'Payment Receipt Entry Form',
        descriptionAm: 'አዲስ የባንክ ወይም የቴሌብር ክፍያ ደረሰኝ መመዝገብና ማስገቢያ ቅጽ መጠቀም',
        descriptionEn: 'Access and submit new monthly bank/telebirr payment receipt entries.',
      },
      {
        id: 17,
        icon: 'analytics',
        titleAm: 'የክፍያ ደረሰኞች ስታቲስቲክስ (KPIs)',
        titleEn: 'Payment Receipts & Revenue Financial KPIs',
        descriptionAm: 'የወርሃዊ ክፍያ አጠቃላይ ገቢ፣ ህጋዊና ጊዜያቸው ያለፈባቸው ባለቤቶች ስታቲስቲክስ',
        descriptionEn: 'View financial revenue metrics, active compliance, and expired term statistics.',
      },
      {
        id: 16,
        icon: 'table_view',
        titleAm: 'የክፍያ ደረሰኞች ማህደር ሰንጠረዥ',
        titleEn: 'Payment Receipts Ledger Table',
        descriptionAm: 'የተመዘገቡ ክፍያ ደረሰኞች ሙሉ ሰንጠረዥና ማህደር ማየት',
        descriptionEn: 'View complete table records of logged bank/telebirr payment receipts.',
      },
    ],
  },
  {
    id: 'governance_audit',
    titleAm: '5. የስርዓት አስተዳደርና ሴኪዩሪቲ ኦዲት ሞጁል',
    titleEn: 'Authority Governance & System Audit Module',
    descriptionAm: 'የተጠቃሚዎች አካውንት አስተዳደር፣ የሚናና ፈቃዶች ማትሪክስ፣ የክፍለ ከተማ እገዳ እና ኦዲት ሎግ',
    descriptionEn: 'User accounts management, role & permissions matrix, sub-city freeze, and security audit logs.',
    icon: 'admin_panel_settings',
    badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300',
    governedComponents: {
      sideMenuAm: 'የተጠቃሚዎች አስተዳደር፣ የሚና ፈቃዶች፣ ኦዲት ሎግ፣ ቅንብሮች',
      sideMenuEn: 'User Management, Permissions Matrix, Audit Logs, Settings',
      metricsAm: 'የሴኪዩሪቲ ኦዲት ሎጎች፣ የታገዱ ክፍለ ከተሞች፣ የስርዓት ተጠቃሚዎች',
      metricsEn: 'Security Audit Logs Count, Frozen Subcities, System Users Count',
      quickMenusAm: 'አዲስ ተጠቃሚ መፍጠር፣ የሚና ፈቃዶች ማትሪክስ፣ ዳታቤዝ ማጽጃ',
      quickMenusEn: 'Create User Account, Role Permissions, System Reset',
      tablesAm: 'የኦዲት ሎግ ሰንጠረዥ፣ የተጠቃሚዎች ሰንጠረዥ፣ የክፍለ ከተማ እገዳ ሰንጠረዥ',
      tablesEn: 'Security Audit Logs Table, User Accounts Table, Sub-city Freeze Table',
    },
    tasks: [
      {
        id: 11,
        icon: 'delete_forever',
        titleAm: 'አባል / ተሽከርካሪ መዝገብ መሰረዝ',
        titleEn: 'Delete Member / Vehicle Record',
        descriptionAm: 'የተሳሳቱ ወይም ህገ-ወጥ መዝገቦችን ሙሉ በሙሉ መሰረዝ',
        descriptionEn: 'Permanently remove or purge vehicle registration entries.',
      },
      {
        id: 12,
        icon: 'database',
        titleAm: 'የዳታቤዝ አስተዳደርና ባክአፕ',
        titleEn: 'System Database Management',
        descriptionAm: 'ዳታቤዝ እንደገና ማስጀመር፣ ባክአፕ መውሰድና ዳታ ማፅዳት',
        descriptionEn: 'Perform database backups, maintenance, and factory resets.',
      },
      {
        id: 13,
        icon: 'group_add',
        titleAm: 'የስርዓቱ ተጠቃሚዎች ማኔጅመንት',
        titleEn: 'User Accounts Management',
        descriptionAm: 'አዲስ ሰራተኛ አካውንት መፍጠር፣ ማገድና ፓስወርድ መቀየር',
        descriptionEn: 'Create, update, disable, and manage staff user accounts.',
      },
      {
        id: 14,
        icon: 'security',
        titleAm: 'የሚናና ፈቃዶች አስተዳደር ማትሪክስ',
        titleEn: 'Role & Permission Matrix Management',
        descriptionAm: 'ለየሚናው የሚፈቀዱና የሚከለከሉ የስራ ሞጁሎችን ማዋቀር',
        descriptionEn: 'Configure access control matrix and role permission presets.',
      },
      {
        id: 15,
        icon: 'policy',
        titleAm: 'የሴኪዩሪቲ ኦዲት ሎግና የክፍለ ከተማ እገዳ',
        titleEn: 'Security Audit Logs & Sub-city Controls',
        descriptionAm: 'የሰራተኞች እንቅስቃሴ ኦዲት ማየትና በክፍለ ከተማ ደረጃ ስራ ማገድ',
        descriptionEn: 'Audit system activity logs and toggle sub-city operation freezes.',
      },
    ],
  },
];

const INITIAL_ROLES: RoleDefinition[] = [
  {
    id: 'role-secretary',
    roleKey: 'clerk',
    titleAm: 'ጸሃፊ',
    titleEn: 'Secretary',
    userCountText: '3 ተጠቃሚ',
    avatarBg: 'bg-amber-600',
    avatarType: 'secretary',
    status: 'active',
  },
  {
    id: 'role-officer',
    roleKey: 'officer',
    titleAm: 'ኦፊሰር',
    titleEn: 'Officer',
    userCountText: '5 ተጠቃሚ',
    avatarBg: 'bg-blue-600',
    avatarType: 'officer',
    status: 'active',
  },
  {
    id: 'role-manager',
    roleKey: 'admin',
    titleAm: 'ስራ አስኪያጅ',
    titleEn: 'Manager',
    userCountText: '2 ተጠቃሚ',
    avatarBg: 'bg-emerald-600',
    avatarType: 'manager',
    status: 'active',
  },
  {
    id: 'role-it',
    roleKey: 'it_specialist',
    titleAm: 'አይቲ ባለሙያ',
    titleEn: 'IT Specialist',
    userCountText: '1 ተጠቃሚ',
    avatarBg: 'bg-purple-600',
    avatarType: 'it',
    status: 'active',
  },
  {
    id: 'role-superadmin',
    roleKey: 'superadmin',
    titleAm: 'ሱፐር አድሚን',
    titleEn: 'Super Admin',
    userCountText: '1 ተጠቃሚ',
    avatarBg: 'bg-rose-600',
    avatarType: 'superadmin',
    status: 'active',
  },
];

const INITIAL_PERMISSIONS: Record<string, Record<number, PermissionState>> = {
  'role-secretary': {
    1: 'allow',
    2: 'allow',
    3: 'allow',
    4: 'allow',
    5: 'view_only',
    6: 'view_only',
    7: 'view_only',
    8: 'view_only',
    9: 'deny',
    10: 'allow',
    17: 'allow',
    16: 'allow',
    11: 'deny',
    12: 'deny',
    13: 'deny',
    14: 'deny',
    15: 'deny',
  },
  'role-officer': {
    1: 'deny',
    2: 'deny',
    3: 'view_only',
    4: 'view_only',
    5: 'allow',
    6: 'allow',
    7: 'allow',
    8: 'allow',
    9: 'deny',
    10: 'deny',
    17: 'deny',
    16: 'deny',
    11: 'deny',
    12: 'deny',
    13: 'deny',
    14: 'deny',
    15: 'deny',
  },
  'role-manager': {
    1: 'allow',
    2: 'allow',
    3: 'allow',
    4: 'allow',
    5: 'allow',
    6: 'allow',
    7: 'allow',
    8: 'allow',
    9: 'allow',
    10: 'allow',
    17: 'allow',
    16: 'allow',
    11: 'view_only',
    12: 'view_only',
    13: 'view_only',
    14: 'deny',
    15: 'view_only',
  },
  'role-it': {
    1: 'view_only',
    2: 'view_only',
    3: 'view_only',
    4: 'view_only',
    5: 'allow',
    6: 'view_only',
    7: 'view_only',
    8: 'view_only',
    9: 'allow',
    10: 'allow',
    17: 'allow',
    16: 'allow',
    11: 'allow',
    12: 'allow',
    13: 'allow',
    14: 'allow',
    15: 'allow',
  },
  'role-superadmin': {
    1: 'allow',
    2: 'allow',
    3: 'allow',
    4: 'allow',
    5: 'allow',
    6: 'allow',
    7: 'allow',
    8: 'allow',
    9: 'allow',
    10: 'allow',
    17: 'allow',
    16: 'allow',
    11: 'allow',
    12: 'allow',
    13: 'allow',
    14: 'allow',
    15: 'allow',
  },
};

interface RolePermissionManagementProps {
  currentLang: Language;
  currentUserBadgeId: string;
  users?: SystemUser[];
  settings?: SystemSettings;
  onToggleClerkSetting?: (key: any) => void;
  onShowToast?: (msg: string, type?: 'success' | 'warning' | 'info') => void;
  onOpenUsersTable?: () => void;
}

export const RolePermissionManagement: React.FC<RolePermissionManagementProps> = ({
  currentLang,
  currentUserBadgeId,
  users = [],
  settings: propSettings,
  onShowToast,
  onOpenUsersTable,
}) => {
  const isAmharic = currentLang === 'am';

  const [roles, setRoles] = useState<RoleDefinition[]>(() => {
    if (propSettings?.roleDefinitions && Array.isArray(propSettings.roleDefinitions) && propSettings.roleDefinitions.length > 0) {
      return propSettings.roleDefinitions;
    }
    const saved = localStorage.getItem('permit_role_definitions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_ROLES;
      }
    }
    return INITIAL_ROLES;
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string>('role-secretary');
  const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, Record<number, PermissionState>>>(() => {
    if (propSettings?.rolePermissions && Object.keys(propSettings.rolePermissions).length > 0) {
      return propSettings.rolePermissions as any;
    }
    const saved = localStorage.getItem('permit_role_permissions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_PERMISSIONS;
      }
    }
    return INITIAL_PERMISSIONS;
  });

  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [newRoleTitleAm, setNewRoleTitleAm] = useState('');
  const [newRoleTitleEn, setNewRoleTitleEn] = useState('');
  const [newRoleTemplate, setNewRoleTemplate] = useState('role-secretary');

  // Selected role object
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.id === selectedRoleId) || roles[0];
  }, [roles, selectedRoleId]);

  // Dynamic user count computation if users are provided
  const dynamicRoles = useMemo(() => {
    return roles.map((r) => {
      if (users.length > 0) {
        const count = users.filter((u) => u.role === r.roleKey).length;
        if (count > 0) {
          return {
            ...r,
            userCountText: `${count} ${isAmharic ? 'ተጠቃሚ' : 'Users'}`,
          };
        }
      }
      return r;
    });
  }, [roles, users, isAmharic]);

  // Current permissions for the selected role
  const currentRolePerms = permissionsMatrix[selectedRoleId] || INITIAL_PERMISSIONS['role-secretary'] || {};

  // Set permission for an individual task
  const handleSetPermission = (taskId: number, state: PermissionState) => {
    setPermissionsMatrix((prev) => ({
      ...prev,
      [selectedRoleId]: {
        ...(prev[selectedRoleId] || INITIAL_PERMISSIONS[selectedRoleId] || {}),
        [taskId]: state,
      },
    }));
  };

  // Master Module Control: Sets all sub-tasks in a module to state
  const handleSetModuleMasterPermission = (moduleObj: SystemModule, state: PermissionState) => {
    setPermissionsMatrix((prev) => {
      const currentMap = { ...(prev[selectedRoleId] || INITIAL_PERMISSIONS[selectedRoleId] || {}) };
      moduleObj.tasks.forEach((t) => {
        currentMap[t.id] = state;
      });
      return {
        ...prev,
        [selectedRoleId]: currentMap,
      };
    });
  };

  // Compute Module Master State (allow / view_only / deny / custom)
  const getModuleMasterState = (moduleObj: SystemModule): PermissionState | 'mixed' => {
    const taskStates = moduleObj.tasks.map((t) => currentRolePerms[t.id] || 'deny');
    const firstState = taskStates[0];
    const isAllSame = taskStates.every((s) => s === firstState);
    if (isAllSame) return firstState;
    return 'mixed';
  };

  const handleSavePermissions = async () => {
    localStorage.setItem('permit_role_permissions', JSON.stringify(permissionsMatrix));
    localStorage.setItem('permit_role_definitions', JSON.stringify(roles));

    await saveSettingsToDb({
      rolePermissions: permissionsMatrix,
      roleDefinitions: roles,
    });

    await addAuditLogToDb({
      actorBadgeId: currentUserBadgeId || 'SUPER-ADMIN-01',
      actorRole: 'superadmin',
      action: 'ROLE_PERMISSIONS_UPDATED',
      details: `Updated permissions matrix for role: ${selectedRole.titleAm} ${selectedRole.titleEn}`,
      severity: 'warning',
    });

    if (onShowToast) {
      onShowToast(
        isAmharic
          ? `የ${selectedRole.titleAm} ሚና የተቀናጀ የሞጁሎች ፈቃድ በተሳካ ሁኔታ ተቀምጧል`
          : `Unified module permissions for ${selectedRole.titleEn} successfully saved`,
        'success'
      );
    }
  };

  const handleResetPermissions = () => {
    const defaultForRole = INITIAL_PERMISSIONS[selectedRoleId] || INITIAL_PERMISSIONS['role-secretary'];
    setPermissionsMatrix((prev) => ({
      ...prev,
      [selectedRoleId]: { ...defaultForRole },
    }));

    if (onShowToast) {
      onShowToast(
        isAmharic ? 'የሞጁሎች ፈቃዶች ወደ መጀመሪያው ሁኔታ ተመልሰዋል' : 'Module permissions reset to default',
        'info'
      );
    }
  };

  const handleCreateNewRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleTitleAm.trim()) return;

    const newId = `role-custom-${Date.now()}`;
    const newRole: RoleDefinition = {
      id: newId,
      roleKey: 'custom',
      titleAm: newRoleTitleAm.trim(),
      titleEn: newRoleTitleEn.trim() ? newRoleTitleEn.trim() : newRoleTitleAm.trim(),
      userCountText: `0 ${isAmharic ? 'ተጠቃሚ' : 'Users'}`,
      avatarBg: 'bg-teal-600',
      avatarType: 'custom',
      status: 'active',
    };

    const templatePerms = permissionsMatrix[newRoleTemplate] || INITIAL_PERMISSIONS['role-secretary'];
    const updatedRoles = [...roles, newRole];
    const updatedMatrix = {
      ...permissionsMatrix,
      [newId]: { ...templatePerms },
    };

    setRoles(updatedRoles);
    setPermissionsMatrix(updatedMatrix);

    localStorage.setItem('permit_role_definitions', JSON.stringify(updatedRoles));
    localStorage.setItem('permit_role_permissions', JSON.stringify(updatedMatrix));

    await saveSettingsToDb({
      roleDefinitions: updatedRoles,
      rolePermissions: updatedMatrix,
    });

    setSelectedRoleId(newId);
    setShowNewRoleModal(false);
    setNewRoleTitleAm('');
    setNewRoleTitleEn('');

    if (onShowToast) {
      onShowToast(
        isAmharic ? `አዲስ ሚና "${newRole.titleAm}" ተፈጥሯል` : `New role "${newRole.titleAm}" created`,
        'success'
      );
    }
  };

  return (
    <div className="space-y-5 font-sans text-on-surface">
      {/* Role Selection Cards Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-black uppercase tracking-wider text-secondary">
            {isAmharic ? 'የስርዓት ሚናዎች' : 'System Roles'}
          </span>
          <button
            type="button"
            onClick={() => setShowNewRoleModal(true)}
            className="px-3 py-1.5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Icon className="material-symbols-outlined text-[16px]">add</Icon>
            <span>{isAmharic ? 'አዲስ ሚና' : 'Add Role'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {dynamicRoles.map((r) => {
            const isSelected = r.id === selectedRoleId;

            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-surface-container-lowest border-[#0f172a] dark:border-blue-400 ring-2 ring-[#0f172a]/20 shadow-xs'
                    : 'bg-surface border-outline-variant/60 hover:border-slate-400 hover:bg-surface-container-lowest'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${r.avatarBg}`} />
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-[#0f172a] text-white' : 'bg-surface-container text-secondary'
                  }`}>
                    {r.userCountText}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-black text-on-surface line-clamp-1">
                    {r.titleAm}
                  </div>
                  <div className="text-[10px] font-medium text-secondary line-clamp-1">
                    {r.titleEn}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Header & Role Bar */}
      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0f172a] text-white flex items-center justify-center font-bold shrink-0">
            <Icon className="material-symbols-outlined text-[18px]">admin_panel_settings</Icon>
          </div>
          <div>
            <span className="text-[11px] font-bold text-secondary block">
              {isAmharic ? 'የሚና ፈቃዶች አስተዳደር' : 'Role Permissions Governance'}
            </span>
            <span className="text-sm font-black text-on-surface">
              {selectedRole.titleAm} — {selectedRole.titleEn}
            </span>
          </div>
        </div>

        {/* Legend Bar */}
        <div className="flex items-center gap-4 text-xs font-bold shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-emerald-800 dark:text-emerald-300">{isAmharic ? 'ፈቃድ' : 'Allow'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-amber-800 dark:text-amber-300">{isAmharic ? 'ማየት ብቻ' : 'View Only'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <span className="text-rose-800 dark:text-rose-300">{isAmharic ? 'ከልክል' : 'Deny'}</span>
          </div>

          {onOpenUsersTable && (
            <button
              type="button"
              onClick={onOpenUsersTable}
              className="text-xs font-black text-[#0f172a] dark:text-blue-400 hover:underline cursor-pointer ml-2"
            >
              {isAmharic ? 'ሰራተኞች' : 'Users List'}
            </button>
          )}
        </div>
      </div>

      {/* Clean Flat Modules List */}
      <div className="space-y-4">
        {SYSTEM_MODULES.map((moduleObj) => {
          const masterState = getModuleMasterState(moduleObj);

          return (
            <div
              key={moduleObj.id}
              className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest overflow-hidden transition-all duration-150"
            >
              {/* Module Header Bar */}
              <div className="p-3.5 px-4 border-b border-outline-variant/40 bg-surface-container/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="material-symbols-outlined text-[22px] text-[#0f172a] dark:text-blue-400 shrink-0">{moduleObj.icon}</Icon>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black text-on-surface uppercase tracking-wider">
                      {isAmharic ? moduleObj.titleAm : moduleObj.titleEn}
                    </h3>
                  </div>
                </div>

                {/* Master Selector */}
                <div className="flex items-center gap-1 p-0.5 bg-surface-container rounded-lg border border-outline-variant/60 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleSetModuleMasterPermission(moduleObj, 'allow')}
                    className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                      masterState === 'allow'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-surface-container-high'
                    }`}
                  >
                    {isAmharic ? 'ሁሉንም ፍቀድ' : 'Allow All'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetModuleMasterPermission(moduleObj, 'view_only')}
                    className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                      masterState === 'view_only'
                        ? 'bg-amber-500 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-surface-container-high'
                    }`}
                  >
                    {isAmharic ? 'ማየት ብቻ' : 'View Only'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetModuleMasterPermission(moduleObj, 'deny')}
                    className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                      masterState === 'deny'
                        ? 'bg-rose-500 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-surface-container-high'
                    }`}
                  >
                    {isAmharic ? 'ሁሉንም ከልክል' : 'Deny All'}
                  </button>
                </div>
              </div>

              {/* Clean Flat Sub-Tasks Rows */}
              <div className="divide-y divide-outline-variant/30">
                {moduleObj.tasks.map((task) => {
                  const taskState = currentRolePerms[task.id] || 'deny';

                  return (
                    <div
                      key={task.id}
                      className="p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-surface-container/20 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-black text-on-surface">
                          {task.titleAm}
                        </div>
                      </div>

                      {/* Task Segmented Control */}
                      <div className="grid grid-cols-3 gap-1 shrink-0 bg-surface-container p-0.5 rounded-md border border-outline-variant/40">
                        <button
                          type="button"
                          onClick={() => handleSetPermission(task.id, 'allow')}
                          className={`py-1 px-2.5 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                            taskState === 'allow'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-on-surface'
                          }`}
                        >
                          {isAmharic ? 'ፍቀድ' : 'Allow'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetPermission(task.id, 'view_only')}
                          className={`py-1 px-2.5 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                            taskState === 'view_only'
                              ? 'bg-amber-500 text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-on-surface'
                          }`}
                        >
                          {isAmharic ? 'ማየት' : 'View'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetPermission(task.id, 'deny')}
                          className={`py-1 px-2.5 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                            taskState === 'deny'
                              ? 'bg-rose-500 text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-on-surface'
                          }`}
                        >
                          {isAmharic ? 'ከልክል' : 'Deny'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Footer Bar */}
      <div className="p-3.5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={handleResetPermissions}
          className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black text-xs rounded-lg transition-all cursor-pointer"
        >
          {isAmharic ? 'ዳግም አስጀምር' : 'Reset Defaults'}
        </button>

        <button
          type="button"
          onClick={handleSavePermissions}
          className="px-5 py-2 bg-[#0f172a] hover:bg-slate-800 text-white font-black text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Icon className="material-symbols-outlined text-[16px]">save</Icon>
          <span>{isAmharic ? 'ፈቃዶች አስቀምጥ' : 'Save Permissions'}</span>
        </button>
      </div>

      {/* Modal for Creating Custom Role */}
      {showNewRoleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-outline-variant rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
              <h3 className="text-sm font-black text-on-surface">
                {isAmharic ? 'አዲስ የስራ ሚና መፍጠር' : 'Create Custom Role'}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewRoleModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-on-surface cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[20px]">close</Icon>
              </button>
            </div>

            <form onSubmit={handleCreateNewRole} className="space-y-3.5">
              <div>
                <label className="block text-xs font-black text-on-surface mb-1">
                  {isAmharic ? 'የሚናው ስም በአማርኛ' : 'Role Title (Amharic)'} *
                </label>
                <input
                  type="text"
                  required
                  value={newRoleTitleAm}
                  onChange={(e) => setNewRoleTitleAm(e.target.value)}
                  placeholder="ምሳሌ፡ የክፍያ ተቆጣጣሪ"
                  className="w-full bg-surface border border-outline-variant rounded-md px-3 py-2 text-xs font-extrabold focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-on-surface mb-1">
                  {isAmharic ? 'የሚናው ስም በእንግሊዘኛ' : 'Role Title (English)'}
                </label>
                <input
                  type="text"
                  value={newRoleTitleEn}
                  onChange={(e) => setNewRoleTitleEn(e.target.value)}
                  placeholder="e.g. Revenue Inspector"
                  className="w-full bg-surface border border-outline-variant rounded-md px-3 py-2 text-xs font-extrabold focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-on-surface mb-1">
                  {isAmharic ? 'የመነሻ ፈቃዶች ሞዴል' : 'Template Role Permissions'}
                </label>
                <select
                  value={newRoleTemplate}
                  onChange={(e) => setNewRoleTemplate(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded-md px-3 py-2 text-xs font-extrabold cursor-pointer focus:outline-hidden focus:border-blue-600"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.titleAm} — {r.titleEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-outline-variant/60">
                <button
                  type="button"
                  onClick={() => setShowNewRoleModal(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs rounded-md cursor-pointer"
                >
                  {isAmharic ? 'ሰርዝ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0f172a] hover:bg-slate-800 text-white font-black text-xs rounded-md shadow-xs cursor-pointer"
                >
                  {isAmharic ? 'ሚናውን ፍጠር' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
