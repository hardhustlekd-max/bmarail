import React, { useState } from 'react';
import { motion } from 'motion/react';
import { formatEthiopianDate } from '../utils/ethiopianCalendar';
import { updateRegistrationInDb, deleteRegistrationFromDb, isTaskAllowed, getPermissionState, savePaymentReceiptToDb } from '../services/dbService';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  OfficerAssignment,
  VerificationLog,
  PaymentReceipt,
} from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus } from '../utils/paymentUtils';
import { getReceiptsForRegistration, getLatestReceiptForRegistration, getUnifiedPaymentCompliance } from '../utils/unifiedMemberUtils';
import { uploadDocumentPhoto } from '../services/storageService';
import { DocumentUploadInput } from './DocumentUploadInput';
import { QRCodeCard } from './QRCodeCard';
import { A4PermitPaper } from './A4PermitPaper';
import { OfficerVerificationHistory } from './OfficerVerificationHistory';
import { VehicleQRSticker } from './VehicleQRSticker';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SmartImage } from './SmartImage';
import { DataField, SelectField } from './ui/StreamlinedUI';
import { Icon } from './ui/Icon';
import {
  FullscreenDocumentCarouselModal,
  buildRegistrationDocumentList,
  DocumentViewerItem,
} from './FullscreenDocumentCarouselModal';
import { EditRegistrationModal } from './EditRegistrationModal';
import { triggerDocumentPrint } from '../utils/printUtils';

interface TablesPageProps {
  lang: Language;
  userRole: UserRole;
  userBadgeId?: string;
  registrations: MotorcycleRegistration[];
  officers: OfficerAssignment[];
  verificationLogs?: VerificationLog[];
  paymentReceipts?: PaymentReceipt[];
  onSavePaymentReceipt?: (receipt: PaymentReceipt) => void;
  onApproveRegistration: (id: string) => void;
  onRejectRegistration: (id: string, reason: string) => void;
  onAddVerificationLog?: (log: VerificationLog) => void;
  initialTableTab?: 'approved' | 'pending' | 'expired';
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const TablesPage: React.FC<TablesPageProps> = ({
  lang,
  userRole,
  userBadgeId,
  registrations,
  officers,
  verificationLogs = [],
  paymentReceipts = [],
  onSavePaymentReceipt,
  onApproveRegistration,
  onRejectRegistration,
  onAddVerificationLog,
  initialTableTab,
  onShowToast,
}) => {
  const isAmharic = lang === 'am';

  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';
  const hasTaskEditPermission = isTaskAllowed(userRole, 2);
  const isReadOnly = !isSuperAdmin && getPermissionState(userRole, 2) === 'view_only';
  const canEditRegistration = isSuperAdmin || (hasTaskEditPermission && !isReadOnly);

  const [editingRegistration, setEditingRegistration] = useState<MotorcycleRegistration | null>(null);

  const renderStatusBadge = (status?: string, alwaysShowText: boolean = false) => {
    const textClass = alwaysShowText ? 'inline' : 'hidden sm:inline';
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-2xs" title={isAmharic ? 'የተፈቀደ' : 'Approved'}>
            <Icon className="material-symbols-outlined text-[13px] shrink-0">check_circle</Icon>
            <span className={textClass}>{isAmharic ? 'የተፈቀደ' : 'Approved'}</span>
          </span>
        );
      case 'printed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800 shadow-2xs" title={isAmharic ? 'የታተመ' : 'Printed'}>
            <Icon className="material-symbols-outlined text-[13px] shrink-0">print</Icon>
            <span className={textClass}>{isAmharic ? 'የታተመ' : 'Printed'}</span>
          </span>
        );
      case 'ordered_print':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 shadow-2xs" title={isAmharic ? 'በሕትመት' : 'In Print'}>
            <Icon className="material-symbols-outlined text-[13px] shrink-0">layers</Icon>
            <span className={textClass}>{isAmharic ? 'በሕትመት' : 'In Print'}</span>
          </span>
        );
      case 'rejected':
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs" title={status === 'expired' ? (isAmharic ? 'ጊዜው ያለፈበት' : 'Expired') : (isAmharic ? 'ውድቅ' : 'Rejected')}>
            <Icon className="material-symbols-outlined text-[13px] shrink-0">cancel</Icon>
            <span className={textClass}>{status === 'expired' ? (isAmharic ? 'ጊዜው ያለፈበት' : 'Expired') : (isAmharic ? 'ውድቅ' : 'Rejected')}</span>
          </span>
        );
      case 'pending_approval':
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shadow-2xs" title={isAmharic ? 'የሚጠበቅ' : 'Pending'}>
            <Icon className="material-symbols-outlined text-[13px] shrink-0">schedule</Icon>
            <span className={textClass}>{isAmharic ? 'የሚጠበቅ' : 'Pending'}</span>
          </span>
        );
    }
  };

  // If user role is Officer, render the dedicated Verification History & Scanned Vehicles Log
  if (userRole === 'officer') {
    return (
      <OfficerVerificationHistory
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        registrations={registrations}
        verificationLogs={verificationLogs}
        onAddVerificationLog={onAddVerificationLog}
      />
    );
  }

  const canShowRegistration = userRole === 'clerk' || userRole === 'admin';
  const canShowPrint = userRole === 'admin';

  // Helper functions for masking hidden owner details for non-superadmin users
  const getDisplayName = (reg: MotorcycleRegistration) => {
    if (reg.hideFromOtherUsers && userRole !== 'superadmin' && userRole !== 'super_admin') {
      return isAmharic ? '🔒 [የተደበቀ ባለቤት]' : '🔒 [Hidden Owner]';
    }
    return reg.fullName || '—';
  };

  const getDisplayPhone = (reg: MotorcycleRegistration) => {
    if (reg.hideFromOtherUsers && userRole !== 'superadmin' && userRole !== 'super_admin') {
      return '***-***-****';
    }
    return reg.phone || '—';
  };

  // Table status filter tab: 'approved' | 'pending' | 'expired'
  const [activeTableTab, setActiveTableTab] = useState<'approved' | 'pending' | 'expired'>(initialTableTab || 'approved');

  // Secret trigger state for hiding registrations on the main Motorcycle Registry page
  const [showHiddenControls, setShowHiddenControls] = useState(false);

  // Sync state if initialTableTab prop changes
  React.useEffect(() => {
    if (initialTableTab) {
      setActiveTableTab(initialTableTab);
    }
  }, [initialTableTab]);

  // Search & secondary filter states
  const [regSearchQuery, setRegSearchQuery] = useState('');
  const [regCategoryFilter, setRegCategoryFilter] = useState<'all' | 'private' | 'commercial' | 'governmental'>('all');
  const [regSubCityFilter, setRegSubCityFilter] = useState<string>('all');

  // Role-specific scoped registrations (hidden records excluded from totals & tables except for Super Admin)
  const scopedRegistrations = React.useMemo(() => {
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

  const approvedCount = scopedRegistrations.filter(
    (r) => r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print'
  ).length;

  const pendingCount = scopedRegistrations.filter(
    (r) => r.status === 'pending_approval' || r.status === 'pending'
  ).length;

  const expiredCount = scopedRegistrations.filter(
    (r) => r.status === 'expired' || r.status === 'rejected'
  ).length;

  const filteredRegistrations = scopedRegistrations.filter((r) => {
    // 1. Status Filter
    let matchesStatus = true;
    if (activeTableTab === 'approved') {
      matchesStatus = r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print';
    } else if (activeTableTab === 'pending') {
      matchesStatus = r.status === 'pending_approval' || r.status === 'pending';
    } else if (activeTableTab === 'expired') {
      matchesStatus = r.status === 'expired' || r.status === 'rejected';
    }

    if (!matchesStatus) return false;

    // 2. Search Query Filter
    if (regSearchQuery.trim()) {
      const q = regSearchQuery.toLowerCase().trim();
      const matchesSearch =
        (r.plateNumber || '').toLowerCase().includes(q) ||
        (r.fullName || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.chassisNumber || '').toLowerCase().includes(q) ||
        (r.engineNumber || '').toLowerCase().includes(q) ||
        (r.subCity || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    // 3. Category Filter
    if (regCategoryFilter !== 'all') {
      if (r.serviceCategory !== regCategoryFilter) return false;
    }

    // 4. Sub-City Filter
    if (regSubCityFilter !== 'all') {
      if (r.subCity !== regSubCityFilter) return false;
    }

    return true;
  });

  // --- REGISTRATIONS TABLE STATE ---
  const [regPage, setRegPage] = useState(1);
  const [regPageSize, setRegPageSize] = useState(10);

  const [selectedRegForQR, setSelectedRegForQR] = useState<MotorcycleRegistration | null>(null);
  const [selectedRegForA4, setSelectedRegForA4] = useState<MotorcycleRegistration | null>(null);
  const [selectedRegForSticker, setSelectedRegForSticker] = useState<MotorcycleRegistration | null>(null);
  const [selectedRegForDetails, setSelectedRegForDetails] = useState<MotorcycleRegistration | null>(null);
  const [carouselModal, setCarouselModal] = useState<{
    items: DocumentViewerItem[];
    initialIndex: number;
  } | null>(null);

  const openDocumentCarousel = (targetUrl: string, reg: MotorcycleRegistration, fallbackTitle?: string) => {
    if (!targetUrl) return;
    const docs = buildRegistrationDocumentList(reg, lang);
    const foundIdx = docs.findIndex((d) => d.url === targetUrl);
    if (foundIdx >= 0) {
      setCarouselModal({
        items: docs,
        initialIndex: foundIdx,
      });
    } else {
      setCarouselModal({
        items: [{ url: targetUrl, title: fallbackTitle || (isAmharic ? 'ሰነድ' : 'Document') }, ...docs],
        initialIndex: 0,
      });
    }
  };

  // Rejection reason prompt state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const totalRegs = filteredRegistrations.length;
  const totalRegPages = Math.ceil(totalRegs / regPageSize) || 1;
  const activeRegPage = Math.min(regPage, totalRegPages);
  const regStartIndex = (activeRegPage - 1) * regPageSize;
  const paginatedRegistrations = filteredRegistrations.slice(regStartIndex, regStartIndex + regPageSize);

  const handleConfirmReject = (id: string) => {
    if (!rejectReason.trim()) return;
    onRejectRegistration(id, rejectReason.trim());
    setRejectingId(null);
    setRejectReason('');
  };

  // Mobile collapsed card states
  const [expandedRegs, setExpandedRegs] = useState<Record<string, boolean>>({});

  const toggleRegExpand = (id: string) => {
    setExpandedRegs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Renewal receipt logging modal state for members
  const [renewalModalReg, setRenewalModalReg] = useState<MotorcycleRegistration | null>(null);
  const [renewalReceiptNumber, setRenewalReceiptNumber] = useState('');
  const [renewalAmount, setRenewalAmount] = useState('500');
  const [renewalPaymentDate, setRenewalPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [renewalScreenshot, setRenewalScreenshot] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [isSubmittingRenewal, setIsSubmittingRenewal] = useState(false);
  const [renewalError, setRenewalError] = useState('');
  const [renewalSuccess, setRenewalSuccess] = useState('');

  const handleOpenRenewalModal = (reg: MotorcycleRegistration) => {
    setRenewalModalReg(reg);
    setRenewalReceiptNumber('');
    setRenewalAmount(reg.paymentAmount ? String(reg.paymentAmount) : '500');
    setRenewalPaymentDate(new Date().toISOString().split('T')[0]);
    setRenewalScreenshot('');
    setRenewalNotes('');
    setRenewalError('');
    setRenewalSuccess('');
  };

  const handleSaveRenewalReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewalModalReg) return;
    if (!renewalReceiptNumber.trim()) {
      setRenewalError(isAmharic ? 'እባክዎን የደረሰኝ ቁጥር ያስገቡ' : 'Please enter receipt number');
      return;
    }

    setIsSubmittingRenewal(true);
    setRenewalError('');

    try {
      let finalScreenshot = renewalScreenshot;
      if (renewalScreenshot && (renewalScreenshot.startsWith('data:image/') || renewalScreenshot.startsWith('blob:'))) {
        try {
          finalScreenshot = await uploadDocumentPhoto(renewalScreenshot, 'permits/receipts');
        } catch {
          // fallback
        }
      }

      const expirationDate = calculateOneMonthExpiration(renewalPaymentDate);

      const newReceipt: PaymentReceipt = {
        id: `PAY-${Date.now().toString().slice(-6)}`,
        receiptNumber: renewalReceiptNumber.trim(),
        ownerRegistrationId: renewalModalReg.id,
        ownerName: renewalModalReg.fullName || '',
        plateNumber: renewalModalReg.plateNumber || '',
        phone: renewalModalReg.phone || '',
        paymentDate: renewalPaymentDate,
        expirationDate,
        amount: renewalAmount.trim() || undefined,
        receiptScreenshot: finalScreenshot || undefined,
        notes: renewalNotes.trim() || undefined,
        enteredBy: userBadgeId || 'CLERK',
        createdAt: new Date().toISOString(),
      };

      await savePaymentReceiptToDb(newReceipt);

      await updateRegistrationInDb(renewalModalReg.id, {
        receiptNumber: newReceipt.receiptNumber,
        paymentAmount: newReceipt.amount ? String(newReceipt.amount) : undefined,
        receiptScreenshot: newReceipt.receiptScreenshot,
      });

      onSavePaymentReceipt?.(newReceipt);

      if (selectedRegForDetails && selectedRegForDetails.id === renewalModalReg.id) {
        setSelectedRegForDetails({
          ...selectedRegForDetails,
          receiptNumber: newReceipt.receiptNumber,
          paymentAmount: newReceipt.amount ? String(newReceipt.amount) : undefined,
          receiptScreenshot: newReceipt.receiptScreenshot,
        });
      }

      setRenewalSuccess(
        isAmharic
          ? `ደረሰኝ #${newReceipt.receiptNumber} በተሳካ ሁኔታ ተመዝግቧል!`
          : `Receipt #${newReceipt.receiptNumber} recorded successfully!`
      );

      setTimeout(() => {
        setRenewalModalReg(null);
        setRenewalSuccess('');
      }, 1000);
    } catch (err: any) {
      setRenewalError(err?.message || (isAmharic ? 'ደረሰኙን መመዝገብ አልተሳካም' : 'Failed to record receipt'));
    } finally {
      setIsSubmittingRenewal(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* SINGLE UNIFIED TABLE CONTAINER (PERMIT STATUS BREAKDOWN CONTAINER STYLE) */}
      <div className="bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-lg shadow-xs overflow-hidden divide-y divide-outline-variant/60 dark:divide-slate-800">

        {/* CONTAINER HEADER (MATCHING PERMIT STATUS BREAKDOWN CARD HEADER) */}
        <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Icon className="material-symbols-outlined text-[20px]">table_chart</Icon>
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-on-surface dark:text-white">
                {userRole === 'clerk'
                  ? (activeTableTab === 'approved'
                      ? (isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Motor Registry')
                      : (isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'))
                  : (isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Tables')}
              </h3>
              <p className="hidden sm:block text-[11px] font-normal text-secondary/80 dark:text-slate-400 mt-0.5">
                {isAmharic
                  ? 'የፀደቁ፣ በመጠባበቅ ላይ ያሉ እና ውድቅ የተደረጉ የተሽከርካሪ መረጃዎች ዝርዝር'
                  : 'Registry and verification records of all motorcycle permits'}
              </p>
            </div>
          </div>

          {showHiddenControls && (userRole === 'superadmin' || userRole === 'super_admin') && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-full text-xs font-black shadow-2xs animate-pulse">
              <Icon className="material-symbols-outlined text-[16px]">visibility_off</Icon>
              <span>
                {isAmharic ? 'ጠቅላላ የተደበቁ:' : 'Total Hidden:'}{' '}
                {registrations.filter((r) => r.hideFromOtherUsers).length}
              </span>
            </div>
          )}
        </div>

        {/* SUB-FILTER SLIDE BAR (FOR REGISTRATIONS: LIVE SEARCH & STATUS SLIDE PILLS) */}
        <div className="p-2.5 sm:p-3 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-b border-outline-variant/40 dark:border-slate-800">
          {/* Live Search Input */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Icon className="material-symbols-outlined text-[16px]">search</Icon>
            </div>
            <input
              type="text"
              value={regSearchQuery}
              onChange={(e) => {
                const val = e.target.value;
                const isSuperUser = userRole === 'superadmin' || userRole === 'super_admin';
                if (isSuperUser && val.toLowerCase().includes('super1212')) {
                  setShowHiddenControls(true);
                  const cleaned = val.replace(/super1212/gi, '').trim();
                  setRegSearchQuery(cleaned);
                } else {
                  setRegSearchQuery(val);
                }
                setRegPage(1);
              }}
              placeholder={isAmharic ? 'በስም፣ ሰሌዳ፣ ስልክ ወይም ቻሲስ ፈልግ...' : 'Search by name, plate, phone, chassis...'}
              className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs"
            />
            {regSearchQuery && (
              <button
                type="button"
                onClick={() => setRegSearchQuery('')}
                className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[15px]">close</Icon>
              </button>
            )}
          </div>

          {/* Status Tabs in Clean Compact Pill Style */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {[
                {
                  id: 'approved' as const,
                  label: isAmharic ? 'የፀደቁ' : 'Approved',
                  count: approvedCount,
                  badgeColor: 'bg-surface-container-highest text-secondary',
                },
                {
                  id: 'pending' as const,
                  label: isAmharic ? 'የሚጠበቁ' : 'Pending',
                  count: pendingCount,
                  badgeColor:
                    pendingCount > 0
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : 'bg-surface-container-highest text-secondary',
                },
                {
                  id: 'expired' as const,
                  label: isAmharic ? 'ያለፈበት' : 'Expired',
                  count: expiredCount,
                  badgeColor:
                    expiredCount > 0
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                      : 'bg-surface-container-highest text-secondary',
                },
              ].map((tab) => {
                const isActive = activeTableTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTableTab(tab.id);
                      setRegPage(1);
                    }}
                    className={`group relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold transition-all cursor-pointer whitespace-nowrap select-none rounded-md ${
                      isActive
                        ? 'bg-primary text-white font-extrabold shadow-2xs'
                        : 'bg-surface-container/60 hover:bg-surface-container text-secondary hover:text-on-surface border border-outline-variant/60 font-medium'
                    }`}
                  >
                    <span className="tracking-tight">{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold transition-colors ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : tab.badgeColor
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Reset filter button if filtered */}
            {(regSearchQuery || regSubCityFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setRegSearchQuery('');
                  setRegSubCityFilter('all');
                  setRegPage(1);
                }}
                className="px-2.5 py-1 rounded-full text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1 cursor-pointer"
                title={isAmharic ? 'ማጣሪያዎችን አጽዳ' : 'Reset Filters'}
              >
                <span>{isAmharic ? 'አጽዳ' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        {/* --- VIEW 1: REGISTRATIONS TABLE (FILTERED BY STATUS) --- */}
        {(activeTableTab === 'approved' || activeTableTab === 'pending' || activeTableTab === 'expired') && (
          <div className="min-h-[580px] flex flex-col justify-between">
            {/* Desktop Data Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3.5 text-center w-12">#</th>
                    <th className="px-4 py-3.5">{isAmharic ? 'የባለቤት ስም' : 'Owner Name'}</th>
                    <th className="px-4 py-3.5">{isAmharic ? 'የሰሌዳ ቁጥር & አይነት' : 'Plate No & Category'}</th>
                    <th className="px-4 py-3.5">{isAmharic ? 'ሴሪያል / ቻሲስ ቁጥር' : 'Chassis / Engine Serial'}</th>
                    <th className="px-4 py-3.5">{isAmharic ? 'ክፍለ ከተማ & ቀን' : 'Sub-City & Date'}</th>
                    <th className="px-4 py-3.5 text-center">{isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}</th>
                    <th className="px-4 py-3.5 text-right">{isAmharic ? 'እርምጃዎች' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {registrations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                          <Icon className="material-symbols-outlined text-[36px] text-slate-400 dark:text-slate-600">inbox</Icon>
                          <span className="font-bold text-sm text-slate-700 dark:text-slate-200">
                            {isAmharic ? 'ምንም የተመዘገቡ መረጃዎች የሉም' : 'No Vehicle Registrations Found'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {isAmharic
                              ? 'አዲስ የሞተር ብስክሌት መረጃዎች ሲመዘገቡ በዚህ ሰንጠረዥ ውስጥ ይዘረዘራሉ።'
                              : 'Vehicle permit applications will appear in this table once submitted.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRegistrations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2 py-4">
                          <Icon className="material-symbols-outlined text-[32px] text-slate-400 dark:text-slate-600">search_off</Icon>
                          <span className="font-bold text-sm text-slate-700 dark:text-slate-300">
                            {isAmharic ? 'ምንም የሚመሳሰል ማህደር አልተገኘም' : 'No matching motorcycle records found.'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTableTab('approved');
                            }}
                            className="px-3 py-1.5 bg-yellow-500 text-[#0B1E48] font-extrabold text-xs rounded-md shadow-xs hover:bg-yellow-400 cursor-pointer"
                          >
                            {isAmharic ? 'የፀደቁትን አሳይ' : 'Show Approved Permits'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                      paginatedRegistrations.map((reg, index) => {
                        const isExpanded = !!expandedRegs[reg.id];
                        return (
                          <React.Fragment key={reg.id}>
                            <tr className="h-16 align-middle hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                              {/* Index Number & Expand Toggle */}
                              <td className="px-3 py-2.5 align-middle h-16 text-center font-mono font-bold text-slate-400">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleRegExpand(reg.id)}
                                    className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                      isExpanded
                                        ? 'bg-yellow-500 text-[#0B1E48]'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                                    }`}
                                    title={isExpanded ? (isAmharic ? 'አጣጥፍ' : 'Collapse') : (isAmharic ? 'ሰነዶችን እና ዝርዝር አሳይ' : 'Expand Documents & Details')}
                                  >
                                    <Icon className="material-symbols-outlined text-[18px]">
                                      {isExpanded ? 'expand_less' : 'expand_more'}
                                    </Icon>
                                  </button>
                                  <span>{regStartIndex + index + 1}</span>
                                </div>
                              </td>

                              {/* Owner Name */}
                              <td className="px-4 py-2.5 align-middle h-16">
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setSelectedRegForDetails(reg)}
                                  className="font-black text-sm text-slate-900 dark:text-white hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors text-left truncate max-w-[220px] flex items-center gap-1 cursor-pointer"
                                >
                                  <span className="truncate">{getDisplayName(reg)}</span>
                                  {reg.hideFromOtherUsers && (userRole === 'superadmin' || userRole === 'super_admin') && (
                                    <span className="px-1 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 shrink-0">
                                      🔒
                                    </span>
                                  )}
                                </button>
                                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 block truncate">
                                  {getDisplayPhone(reg)}
                                </span>
                              </div>
                            </td>

                            {/* Plate Number & Category */}
                            <td className="px-4 py-2.5 align-middle h-16">
                              <div className="space-y-1">
                                <span className="font-mono font-black text-xs text-[#0B1E48] dark:text-yellow-400 inline-block">
                                  {reg.plateNumber || '—'}
                                </span>
                                <div>
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 inline-block">
                                    {reg.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric (EV)') : (isAmharic ? 'ቤንዚን' : 'Gasoline')}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Engine / Chassis Serial */}
                            <td className="px-4 py-2.5 align-middle h-16">
                              <div className="space-y-0.5">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block truncate max-w-[150px]">
                                  {reg.engineOrSerialNo || '—'}
                                </span>
                                {reg.motorBrand && (
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                                    {reg.motorBrand} {reg.motorModel || ''}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Sub-City & Date */}
                            <td className="px-4 py-2.5 align-middle h-16 text-xs text-slate-600 dark:text-slate-300">
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-900 dark:text-white block">{reg.subCity || '—'}</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">{reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—'}</span>
                              </div>
                            </td>

                            {/* Permit Status */}
                            <td className="px-4 py-2.5 align-middle h-16 text-center">
                              {renderStatusBadge(reg.status)}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-2.5 align-middle h-16 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && reg.status === 'pending_approval' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => onApproveRegistration(reg.id)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg shadow-xs transition-colors cursor-pointer"
                                    >
                                      {isAmharic ? 'አፅድቅ' : 'Approve'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingId(reg.id)}
                                      className="px-2.5 py-1 bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-200 font-extrabold text-[11px] rounded-lg transition-colors cursor-pointer"
                                    >
                                      {isAmharic ? 'ሰርዝ' : 'Reject'}
                                    </button>
                                  </>
                                )}

                                 {isTaskAllowed(userRole, 11) && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (window.confirm(isAmharic ? 'ይህንን ምዝገባ በቋሚነት መሰረዝ ይፈልጋሉ?' : 'Are you sure you want to permanently delete this registration?')) {
                                        await deleteRegistrationFromDb(reg.id);
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[11px] rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-0.5"
                                    title={isAmharic ? 'ምዝገባውን ሰርዝ' : 'Delete Registration'}
                                  >
                                    <Icon className="material-symbols-outlined text-[13px]">delete</Icon>
                                    <span>{isAmharic ? 'አጥፋ' : 'Delete'}</span>
                                  </button>
                                )}

                                {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRegForQR(reg)}
                                    className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title={isAmharic ? 'የሞተረኞች ማህበር መታወቂያ' : 'Motorcyclists Association ID'}
                                  >
                                    <Icon className="material-symbols-outlined text-[15px]">badge</Icon>
                                    <span className="hidden xl:inline">{isAmharic ? 'መታወቂያ' : 'Association ID'}</span>
                                  </button>
                                )}

                                {canEditRegistration && (
                                  <button
                                    id={`edit-reg-btn-${reg.id}`}
                                    type="button"
                                    onClick={() => setEditingRegistration(reg)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-[11px] rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                                    title={isAmharic ? 'የአባል መረጃ አሻሽል (Edit)' : 'Edit Registration'}
                                  >
                                    <Icon className="material-symbols-outlined text-[15px]">edit</Icon>
                                    <span className="hidden xl:inline">{isAmharic ? 'አሻሽል' : 'Edit'}</span>
                                  </button>
                                )}

                                {(reg.status === 'approved' || reg.status === 'printed' || reg.status === 'ordered_print') && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRegForA4(reg)}
                                      className="px-2.5 py-1 bg-[#0B1E48] hover:bg-[#071330] text-yellow-400 font-extrabold text-[11px] rounded-lg transition-all cursor-pointer border border-yellow-500/30 flex items-center gap-1 shadow-2xs"
                                      title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ ወረቀት አትም' : 'Print Movement Permit Document'}
                                    >
                                      <Icon className="material-symbols-outlined text-[15px]">print</Icon>
                                      <span className="hidden xl:inline">{isAmharic ? 'ፍቃድ' : 'Permit'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setSelectedRegForSticker(reg)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                      title={isAmharic ? 'የሞተር QR ተለጣፊ አትም' : 'Print Vehicle QR Sticker'}
                                    >
                                      <Icon className="material-symbols-outlined text-[15px]">qr_code_scanner</Icon>
                                      <span className="hidden xl:inline">{isAmharic ? 'ተለጣፊ' : 'Sticker'}</span>
                                    </button>
                                  </>
                                )}

                                {showHiddenControls && (userRole === 'superadmin' || userRole === 'super_admin') && (() => {
                                  const isSuperUserRegistered = !reg.registeredBy || 
                                    reg.registeredBy.toLowerCase() === 'superadmin' || 
                                    reg.registeredBy.toLowerCase() === 'super_admin' || 
                                    reg.registeredBy.toLowerCase().includes('super');
                                  return (
                                    <button
                                      type="button"
                                      disabled={isSuperUserRegistered}
                                      onClick={async () => {
                                        if (isSuperUserRegistered) return;
                                        const newHide = !reg.hideFromOtherUsers;
                                        await updateRegistrationInDb(reg.id, { hideFromOtherUsers: newHide });
                                      }}
                                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                        isSuperUserRegistered
                                          ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-100 dark:bg-slate-800/40'
                                          : reg.hideFromOtherUsers
                                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs'
                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                      }`}
                                      title={
                                        isSuperUserRegistered
                                          ? (isAmharic ? 'የሱፐር አድሚን ምዝገባ (መደበቅ አይቻልም)' : 'Super Admin Entry (Cannot Hide)')
                                          : reg.hideFromOtherUsers
                                          ? (isAmharic ? 'መረጃውን ለሌሎች ግልፅ አድርግ' : 'Show Owner to Others')
                                          : (isAmharic ? 'መረጃውን ከሌሎች ደብቅ' : 'Hide Owner from Others')
                                      }
                                    >
                                      <Icon className="material-symbols-outlined text-[17px]">
                                        {reg.hideFromOtherUsers ? 'visibility_off' : 'visibility'}
                                      </Icon>
                                    </button>
                                  );
                                })()}

                                <button
                                  type="button"
                                  onClick={() => setSelectedRegForDetails(reg)}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                                  title={isAmharic ? 'ዝርዝር መረጃ' : 'View Full Details'}
                                >
                                  <Icon className="material-symbols-outlined text-[18px]">visibility</Icon>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => toggleRegExpand(reg.id)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    isExpanded
                                      ? 'bg-yellow-500 text-[#0B1E48] shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                  }`}
                                  title={isExpanded ? (isAmharic ? 'ሰነዶችን ደብቅ' : 'Hide Documents') : (isAmharic ? 'ሰነዶችን ዘርጋ' : 'Expand Documents')}
                                >
                                  <Icon className="material-symbols-outlined text-[18px]">
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                  </Icon>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Desktop Collapsible Attached Documents Sub-row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
                              <td colSpan={7} className="px-6 py-3.5">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                      <Icon className="material-symbols-outlined text-[16px] text-yellow-600 dark:text-yellow-400">photo_library</Icon>
                                      <span>{isAmharic ? 'የተያያዙ ሰነዶች (ለማጉላት ተጫን):' : 'Attached Documents (Click to Zoom):'}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedRegForDetails(reg)}
                                      className="text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>{isAmharic ? 'ሙሉ ዝርዝር እይ' : 'View Full Details'}</span>
                                      <Icon className="material-symbols-outlined text-[14px]">arrow_forward</Icon>
                                    </button>
                                  </div>

                                  {(reg.userPortraitPhoto || reg.ownerPhoto || reg.nationalIdPhoto || reg.nationalIdBackPhoto || reg.drivingLicensePhoto || reg.drivingPermitPhoto) ? (
                                    <div className="flex items-center gap-3 overflow-x-auto pb-1">
                                      {(reg.userPortraitPhoto || reg.ownerPhoto) && (
                                        <div
                                          onClick={() => openDocumentCarousel((reg.userPortraitPhoto || reg.ownerPhoto)!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}`)}
                                          className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                          title={isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}
                                        >
                                          <SmartImage src={reg.userPortraitThumbnail || reg.userPortraitPhoto || reg.ownerPhoto} alt="Portrait" fallbackIcon="person" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                          </div>
                                        </div>
                                      )}
                                      {reg.nationalIdPhoto && (
                                        <div
                                          onClick={() => openDocumentCarousel(reg.nationalIdPhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}`)}
                                          className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                          title={isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}
                                        >
                                          <SmartImage src={reg.nationalIdPhoto} alt="National ID" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                          </div>
                                        </div>
                                      )}
                                      {reg.nationalIdBackPhoto && (
                                        <div
                                          onClick={() => openDocumentCarousel(reg.nationalIdBackPhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}`)}
                                          className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                          title={isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}
                                        >
                                          <SmartImage src={reg.nationalIdBackPhoto} alt="National ID Back" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                          </div>
                                        </div>
                                      )}
                                      {reg.drivingLicensePhoto && (
                                        <div
                                          onClick={() => openDocumentCarousel(reg.drivingLicensePhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}`)}
                                          className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                          title={isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                                        >
                                          <SmartImage src={reg.drivingLicensePhoto} alt="License" fallbackIcon="card_membership" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                          </div>
                                        </div>
                                      )}
                                      {reg.drivingPermitPhoto && (
                                        <div
                                          onClick={() => openDocumentCarousel(reg.drivingPermitPhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}`)}
                                          className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                          title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}
                                        >
                                          <SmartImage src={reg.drivingPermitPhoto} alt="Permit" fallbackIcon="menu_book" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">{isAmharic ? 'ምንም የተያያዘ ሰነድ የለም' : 'No attached documents uploaded.'}</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                </table>
              </div>

              {/* Mobile Cards / Collapsed Rows View (< md) */}
              <div className="block md:hidden divide-y divide-slate-200 dark:divide-slate-800">
                {registrations.length === 0 ? (
                  <div className="p-10 text-center text-slate-500 dark:text-slate-400 space-y-1.5">
                    <Icon className="material-symbols-outlined text-[36px] text-slate-400 dark:text-slate-600 mx-auto block">inbox</Icon>
                    <p className="font-bold text-xs text-slate-700 dark:text-slate-200">
                      {isAmharic ? 'ምንም የተመዘገቡ መረጃዎች የሉም' : 'No Vehicle Registrations Found'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                      {isAmharic
                        ? 'አዲስ የሞተር ብስክሌት መረጃዎች ሲመዘገቡ እዚህ ይታያሉ።'
                        : 'Vehicle permit applications will appear here once submitted.'}
                    </p>
                  </div>
                ) : filteredRegistrations.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    <Icon className="material-symbols-outlined text-[32px] text-slate-400 dark:text-slate-600 mx-auto block mb-1">search_off</Icon>
                    {isAmharic ? 'ምንም የሚመሳሰል ማህደር አልተገኘም' : 'No matching motorcycle records found.'}
                  </div>
                ) : (
                  paginatedRegistrations.map((reg, index) => {
                    const isExpanded = !!expandedRegs[reg.id];
                    return (
                      <div key={reg.id} className="p-3.5 sm:p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        {/* Collapsed Card Header */}
                        <div
                          className="flex items-center justify-between gap-3 cursor-pointer select-none"
                          onClick={() => toggleRegExpand(reg.id)}
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-slate-400">#{regStartIndex + index + 1}</span>
                              <span className="font-black text-sm text-slate-900 dark:text-white truncate block">{getDisplayName(reg)}</span>
                            </div>

                            <div className="flex items-center gap-3 text-xs flex-wrap pt-0.5">
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 mr-1">{isAmharic ? 'ሰሌዳ፡' : 'Plate:'}</span>
                                <span className="font-mono font-black text-[#0B1E48] dark:text-yellow-400">{reg.plateNumber || '—'}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 mr-1">{isAmharic ? 'አይነት፡' : 'Type:'}</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {reg.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric') : (isAmharic ? 'ቤንዚን' : 'Gasoline')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right Side Expand Icon */}
                          <div className="shrink-0 pl-1">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shadow-2xs">
                              <Icon className="material-symbols-outlined text-[20px]">
                                {isExpanded ? 'expand_less' : 'expand_more'}
                              </Icon>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Mobile Body Drawer */}
                        {isExpanded && (
                          <div className="mt-3.5 pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-3.5 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 rounded-md border border-slate-200/80 dark:border-slate-700/80">
                            {/* Status Text Badge Header */}
                            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-700/80">
                              <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">
                                {isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}
                              </span>
                              {renderStatusBadge(reg.status, true)}
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <DataField label={isAmharic ? 'የማህደር መለያ:' : 'Record ID:'} value={reg.id} isMono />
                              <DataField label={isAmharic ? 'ስልክ ቁጥር:' : 'Phone Number:'} value={reg.phone || '—'} isMono />
                              <DataField label={isAmharic ? 'ክፍለ ከተማ:' : 'Sub-City:'} value={reg.subCity || '—'} />
                              <DataField label={isAmharic ? 'ሴሪያል ቁጥር:' : 'Serial No:'} value={reg.engineOrSerialNo || '—'} isMono />
                              <DataField label={isAmharic ? 'የተመዘገበበት ቀን:' : 'Registered Date:'} value={reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—'} isMono />
                              <DataField label={isAmharic ? 'የመዘገበው:' : 'Registered By:'} value={reg.registeredBy || '—'} isMono />
                            </div>

                            {/* Document Photo Previews / Attachments List */}
                            {(reg.userPortraitPhoto || reg.ownerPhoto || reg.nationalIdPhoto || reg.nationalIdBackPhoto || reg.drivingLicensePhoto || reg.drivingPermitPhoto) && (
                              <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                  {isAmharic ? 'የተያያዙ ሰነዶች (ለማጉላት ተጫን):' : 'Attached Documents (Click to Zoom):'}
                                </span>
                                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                  {(reg.userPortraitPhoto || reg.ownerPhoto) && (
                                    <div
                                      onClick={() => openDocumentCarousel((reg.userPortraitPhoto || reg.ownerPhoto)!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}`)}
                                      className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                      title={isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}
                                    >
                                      <SmartImage src={reg.userPortraitThumbnail || reg.userPortraitPhoto || reg.ownerPhoto} alt="Portrait" fallbackIcon="person" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                  )}
                                  {reg.nationalIdPhoto && (
                                    <div
                                      onClick={() => openDocumentCarousel(reg.nationalIdPhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}`)}
                                      className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                      title={isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}
                                    >
                                      <SmartImage src={reg.nationalIdPhoto} alt="National ID" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                  )}
                                  {reg.nationalIdBackPhoto && (
                                    <div
                                      onClick={() => openDocumentCarousel(reg.nationalIdBackPhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}`)}
                                      className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                      title={isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}
                                    >
                                      <SmartImage src={reg.nationalIdBackPhoto} alt="National ID Back" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                  )}
                                  {reg.drivingLicensePhoto && (
                                    <div
                                      onClick={() => openDocumentCarousel(reg.drivingLicensePhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}`)}
                                      className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                      title={isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                                    >
                                      <SmartImage src={reg.drivingLicensePhoto} alt="License" fallbackIcon="card_membership" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                  )}
                                  {reg.drivingPermitPhoto && (
                                    <div
                                      onClick={() => openDocumentCarousel(reg.drivingPermitPhoto!, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}`)}
                                      className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                      title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}
                                    >
                                      <SmartImage src={reg.drivingPermitPhoto} alt="Permit" fallbackIcon="menu_book" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                      </div>
                                    </div>
                                  )}
                                  {(() => {
                                    const latestRc = getLatestReceiptForRegistration(reg, paymentReceipts);
                                    const receiptImg = latestRc?.receiptScreenshot || reg.receiptScreenshot;
                                    if (!receiptImg) return null;
                                    return (
                                      <div
                                        onClick={() => openDocumentCarousel(receiptImg, reg, `${getDisplayName(reg)} — ${isAmharic ? 'የክፍያ ደረሰኝ' : 'Payment Receipt Slip'}`)}
                                        className="w-12 h-14 rounded-lg overflow-hidden border border-emerald-500 dark:border-emerald-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                        title={isAmharic ? 'የባንክ ክፍያ ደረሰኝ' : 'Payment Receipt Slip'}
                                      >
                                        <SmartImage src={receiptImg} alt="Receipt Slip" fallbackIcon="receipt_long" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Mobile Actions Bar */}
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedRegForDetails(reg)}
                                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1"
                              >
                                <Icon className="material-symbols-outlined text-[16px]">visibility</Icon>
                                <span>{isAmharic ? 'ዝርዝር' : 'Details'}</span>
                              </button>

                              {canEditRegistration && (
                                <button
                                  id={`mobile-edit-reg-btn-${reg.id}`}
                                  type="button"
                                  onClick={() => setEditingRegistration(reg)}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow-2xs transition-colors"
                                  title={isAmharic ? 'መረጃ አሻሽል' : 'Edit Registration'}
                                >
                                  <Icon className="material-symbols-outlined text-[16px]">edit</Icon>
                                  <span>{isAmharic ? 'አሻሽል' : 'Edit'}</span>
                                </button>
                              )}

                              {showHiddenControls && (userRole === 'superadmin' || userRole === 'super_admin') && (() => {
                                const isSuperUserRegistered = !reg.registeredBy || 
                                  reg.registeredBy.toLowerCase() === 'superadmin' || 
                                  reg.registeredBy.toLowerCase() === 'super_admin' || 
                                  reg.registeredBy.toLowerCase().includes('super');
                                return (
                                  <button
                                    type="button"
                                    disabled={isSuperUserRegistered}
                                    onClick={async () => {
                                      if (isSuperUserRegistered) return;
                                      const newHide = !reg.hideFromOtherUsers;
                                      await updateRegistrationInDb(reg.id, { hideFromOtherUsers: newHide });
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                      isSuperUserRegistered
                                        ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-100 dark:bg-slate-800/40'
                                        : reg.hideFromOtherUsers
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-emerald-600 text-white'
                                    }`}
                                    title={
                                      isSuperUserRegistered
                                        ? (isAmharic ? 'የሱፐር አድሚን ምዝገባ (መደበቅ አይቻልም)' : 'Super Admin Entry (Cannot Hide)')
                                        : reg.hideFromOtherUsers
                                        ? (isAmharic ? 'ለሌሎች አሳይ' : 'Show Owner')
                                        : (isAmharic ? 'ለሌሎች ደብቅ' : 'Hide Owner')
                                    }
                                  >
                                    <Icon className="material-symbols-outlined text-[16px]">
                                      {reg.hideFromOtherUsers ? 'visibility_off' : 'visibility'}
                                    </Icon>
                                    <span>
                                      {isSuperUserRegistered
                                        ? (isAmharic ? 'የተጠበቀ' : 'Protected')
                                        : reg.hideFromOtherUsers
                                        ? (isAmharic ? 'የተደበቀ' : 'Hidden')
                                        : (isAmharic ? 'ደብቅ' : 'Hide')}
                                    </span>
                                  </button>
                                );
                              })()}

                              {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedRegForQR(reg)}
                                  className="px-3 py-1.5 bg-purple-700 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                  <Icon className="material-symbols-outlined text-[16px]">badge</Icon>
                                  <span>{isAmharic ? 'መታወቂያ' : 'Digital ID'}</span>
                                </button>
                              )}

                              {(reg.status === 'approved' || reg.status === 'printed' || reg.status === 'ordered_print') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRegForA4(reg)}
                                    className="px-3 py-1.5 bg-[#0B1E48] text-yellow-400 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    <Icon className="material-symbols-outlined text-[16px]">print</Icon>
                                    <span>{isAmharic ? 'ፍቃድ' : 'Permit'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setSelectedRegForSticker(reg)}
                                    className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    <Icon className="material-symbols-outlined text-[16px]">qr_code_scanner</Icon>
                                    <span>{isAmharic ? 'ተለጣፊ' : 'Sticker'}</span>
                                  </button>
                                </>
                              )}

                              {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && reg.status === 'pending_approval' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onApproveRegistration(reg.id)}
                                    className="px-3 py-1.5 bg-emerald-600 text-white font-extrabold text-xs rounded-lg cursor-pointer"
                                  >
                                    {isAmharic ? 'አፅድቅ' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRejectingId(reg.id)}
                                    className="px-3 py-1.5 bg-rose-600 text-white font-extrabold text-xs rounded-lg cursor-pointer"
                                  >
                                    {isAmharic ? 'ሰርዝ' : 'Reject'}
                                  </button>
                                </>
                              )}

                              {isTaskAllowed(userRole, 11) && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm(isAmharic ? 'ይህንን ምዝገባ በቋሚነት መሰረዝ ይፈልጋሉ?' : 'Are you sure you want to permanently delete this registration?')) {
                                      await deleteRegistrationFromDb(reg.id);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-red-600 text-white font-extrabold text-xs rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title={isAmharic ? 'ምዝገባውን ሰርዝ' : 'Delete Registration'}
                                >
                                  <Icon className="material-symbols-outlined text-[14px]">delete</Icon>
                                  <span>{isAmharic ? 'አጥፋ' : 'Delete'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        {/* INTEGRATED PAGINATION CONTROLS FOOTER */}
        {filteredRegistrations.length > 0 && (
          <div className="bg-slate-50/80 dark:bg-slate-800/60 px-4 py-3 flex flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
            {/* Left corner: Items per page selector */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-medium text-slate-700 dark:text-slate-300">{isAmharic ? 'በአንድ ገጽ:' : 'Rows per page:'}</span>
              <SelectField
                value={String(regPageSize)}
                onChange={(e) => {
                  setRegPageSize(Number(e.target.value));
                  setRegPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </SelectField>
              <span className="hidden sm:inline font-medium text-slate-500 dark:text-slate-400">
                {isAmharic
                  ? `${regStartIndex + 1}-${Math.min(regStartIndex + regPageSize, totalRegs)} ከ ${totalRegs} መዝገቦች`
                  : `Showing ${regStartIndex + 1}–${Math.min(regStartIndex + regPageSize, totalRegs)} of ${totalRegs} entries`}
              </span>
            </div>

            {/* Right corner: Side-by-side pagination buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={activeRegPage <= 1}
                onClick={() => setRegPage(activeRegPage - 1)}
                className="px-2.5 sm:px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md disabled:opacity-40 disabled:cursor-not-allowed font-extrabold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Icon className="material-symbols-outlined text-[16px]">chevron_left</Icon>
                <span>{isAmharic ? 'ቀዳሚ' : 'Previous'}</span>
              </button>

              <span className="px-2.5 sm:px-3 py-1 bg-white dark:bg-slate-900 rounded-md font-bold font-mono text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                {activeRegPage} / {totalRegPages}
              </span>

              <button
                type="button"
                disabled={activeRegPage >= totalRegPages}
                onClick={() => setRegPage(activeRegPage + 1)}
                className="px-2.5 sm:px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md disabled:opacity-40 disabled:cursor-not-allowed font-extrabold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QR Inspector Modal */}
      {selectedRegForQR && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto transition-all duration-200">
          <ZoomableDocumentContainer
            lang={lang}
            userRole={userRole}
            title={isAmharic ? 'የባለቤትነት QR መታወቂያ' : 'Official Digital Permit & QR Badge'}
            onClose={() => setSelectedRegForQR(null)}
            onPrint={() => triggerDocumentPrint('id-card')}
          >
            <QRCodeCard registration={selectedRegForQR} lang={lang} />
          </ZoomableDocumentContainer>
        </div>
      )}

      {/* Full A4 Permit Paper Modal */}
      {selectedRegForA4 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto transition-all duration-200">
          <ZoomableDocumentContainer
            lang={lang}
            userRole={userRole}
            title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ ሰነድ (Permit)' : 'Official Movement Permit Document'}
            onClose={() => setSelectedRegForA4(null)}
            onPrint={() => triggerDocumentPrint('a4')}
          >
            <A4PermitPaper
              registration={selectedRegForA4}
              lang={lang}
              onClose={() => setSelectedRegForA4(null)}
            />
          </ZoomableDocumentContainer>
        </div>
      )}

      {/* Vehicle QR Sticker Modal */}
      {selectedRegForSticker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto transition-all duration-200">
          <ZoomableDocumentContainer
            lang={lang}
            userRole={userRole}
            title={isAmharic ? 'የሞተር QR ተለጣፊ (Vehicle Sticker)' : 'Vehicle QR Sticker'}
            onClose={() => setSelectedRegForSticker(null)}
            onPrint={() => triggerDocumentPrint('sticker')}
          >
            <VehicleQRSticker
              registration={selectedRegForSticker}
              lang={lang}
              onClose={() => setSelectedRegForSticker(null)}
            />
          </ZoomableDocumentContainer>
        </div>
      )}

      {/* Rejection Reason Prompt Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="font-extrabold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <Icon className="material-symbols-outlined">cancel</Icon>
              <span>{isAmharic ? 'የማህደር መሰረዣ ምክንያት' : 'Provide Rejection Reason'}</span>
            </h3>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={isAmharic ? 'ምሳሌ፡ ያልተሟላ የመንጃ ፍቃድ ፎቶ' : 'e.g. Blurry driving license photo or invalid chassis number'}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-3 text-xs text-slate-900 dark:text-white h-24 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingId(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs rounded-md font-bold cursor-pointer"
              >
                {isAmharic ? 'ተመለስ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmReject(rejectingId)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-md font-extrabold cursor-pointer shadow-xs"
              >
                {isAmharic ? 'ሰርዝ' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Vehicle Registration Record Details Inspector Modal */}
      {selectedRegForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-[#0B1E48] text-yellow-400 flex items-center justify-center font-bold shadow-xs">
                  <Icon className="material-symbols-outlined text-[24px]">two_wheeler</Icon>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {isAmharic ? 'የተሟላ የሞተር ሳይክል ምዝገባ መረጃ' : 'Motorcycle Registration Record Details'}
                  </h3>
                  <p className="text-xs font-mono text-slate-500">
                    Record ID: <span className="font-bold text-[#0B1E48] dark:text-yellow-400">{selectedRegForDetails.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRegForDetails(null)}
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[20px]">close</Icon>
              </button>
            </div>

            {/* Status Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-md border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">{isAmharic ? 'የምዝገባ ሁኔታ:' : 'Permit Status:'}</span>
                {renderStatusBadge(selectedRegForDetails.status)}
              </div>
              {selectedRegForDetails.registeredBy && (
                <div className="text-xs font-mono text-slate-500">
                  {isAmharic ? 'የመዘገበው ባጅ:' : 'Registered By:'} <span className="font-bold text-slate-900 dark:text-white">{selectedRegForDetails.registeredBy}</span>
                </div>
              )}
            </div>

            {/* Rejection notice if rejected */}
            {selectedRegForDetails.status === 'rejected' && selectedRegForDetails.rejectionReason && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-900 dark:text-rose-200">
                <span className="font-bold block mb-0.5">{isAmharic ? 'የመሰረዣ ምክንያት:' : 'Rejection Reason:'}</span>
                <p>{selectedRegForDetails.rejectionReason}</p>
              </div>
            )}

            {/* Core Data Grids */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-extrabold text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-1.5 flex items-center gap-1.5">
                  <Icon className="material-symbols-outlined text-[16px] text-yellow-600 dark:text-yellow-400">person</Icon>
                  <span>{isAmharic ? 'የባለቤት መረጃ' : 'Owner Information'}</span>
                </h4>
                <div className="space-y-1.5">
                  <DataField label={isAmharic ? 'ሙሉ ስም:' : 'Full Name:'} value={selectedRegForDetails.fullName || '—'} />
                  <DataField label={isAmharic ? 'ስልክ ቁጥር:' : 'Phone Number:'} value={selectedRegForDetails.phone || '—'} isMono />
                  <DataField label={isAmharic ? 'ክፍለ ከተማ:' : 'Sub-City:'} value={selectedRegForDetails.subCity || '—'} />
                  <DataField label={isAmharic ? 'የተመዘገበበት ቀን:' : 'Registration Date:'} value={selectedRegForDetails.registrationDate ? formatEthiopianDate(selectedRegForDetails.registrationDate, isAmharic ? 'am' : 'en') : '—'} isMono />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-extrabold text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-1.5 flex items-center gap-1.5">
                  <Icon className="material-symbols-outlined text-[16px] text-yellow-600 dark:text-yellow-400">electric_moped</Icon>
                  <span>{isAmharic ? 'የተሽከርካሪ መረጃ' : 'Vehicle Specifications'}</span>
                </h4>
                <div className="space-y-1.5">
                  <DataField 
                    label={isAmharic ? 'ዓይነት:' : 'Category:'} 
                    value={selectedRegForDetails.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ (EV)' : 'Electric (EV)') : (isAmharic ? 'ቤንዚን (Gasoline)' : 'Gasoline (<110cc)')} 
                    isPrimary 
                  />
                  <DataField label={isAmharic ? 'የሰሌዳ ቁጥር:' : 'Plate Number:'} value={selectedRegForDetails.plateNumber || '—'} isMono />
                  <DataField label={isAmharic ? 'ሴሪያል / ቻሲስ ቁጥር:' : 'Engine / Chassis No:'} value={selectedRegForDetails.engineOrSerialNo || '—'} isMono />
                  <DataField label={isAmharic ? 'የሞተር ምርት እና ሞዴል:' : 'Brand & Model:'} value={`${selectedRegForDetails.motorBrand || '—'} ${selectedRegForDetails.motorModel || ''}`} />
                </div>
              </div>
            </div>

            {/* Payment Status & Current Receipt Standing */}
            {(() => {
              const matchedReceipts = getReceiptsForRegistration(selectedRegForDetails, paymentReceipts);
              const latestRc = getLatestReceiptForRegistration(selectedRegForDetails, paymentReceipts);
              const compliance = getUnifiedPaymentCompliance(selectedRegForDetails, paymentReceipts);

              return (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-md border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <h4 className="font-extrabold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Icon className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">receipt_long</Icon>
                      <span>{isAmharic ? 'የክፍያ ሁኔታ እና የወቅቱ ደረሰኝ' : 'Payment Status & Current Receipt'}</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${compliance.badgeClass}`}>
                        <Icon className="material-symbols-outlined text-[13px]">
                          {compliance.status === 'active' ? 'check_circle' : compliance.status === 'expiring_soon' ? 'alarm' : 'cancel'}
                        </Icon>
                        <span>{isAmharic ? compliance.labelAm : compliance.labelEn}</span>
                      </span>

                      {userRole !== 'officer' && isTaskAllowed(userRole, 1) && (
                        <button
                          type="button"
                          onClick={() => handleOpenRenewalModal(selectedRegForDetails)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          title={isAmharic ? 'አዲስ የክፍያ ደረሰኝ መዝግብ' : 'Record Renewal Receipt'}
                        >
                          <Icon className="material-symbols-outlined text-[14px]">add_card</Icon>
                          <span>{isAmharic ? '+ ደረሰኝ መዝግብ' : '+ Log Receipt'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAmharic ? 'የደረሰኝ ቁጥር:' : 'Receipt No:'}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white block truncate">
                        {latestRc?.receiptNumber || selectedRegForDetails.receiptNumber || '—'}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAmharic ? 'የክፍያ መጠን:' : 'Amount (ETB):'}</span>
                      <span className="font-bold text-slate-900 dark:text-white block">
                        {latestRc?.amount ? `${latestRc.amount} ETB` : selectedRegForDetails.paymentAmount ? `${selectedRegForDetails.paymentAmount} ETB` : '—'}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAmharic ? 'የተከፈለበት ቀን:' : 'Payment Date:'}</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 block">
                        {latestRc?.paymentDate ? formatEthiopianDate(latestRc.paymentDate, isAmharic ? 'am' : 'en') : '—'}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-bold block">{isAmharic ? 'የሚያበቃበት ቀን:' : 'Expiration Date:'}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white block">
                        {latestRc?.expirationDate ? formatEthiopianDate(latestRc.expirationDate, isAmharic ? 'am' : 'en') : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Chronological Payment Receipts Ledger */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        {isAmharic ? `የተመዘገቡ ደረሰኞች ታሪክ (${matchedReceipts.length})` : `Payment Receipts Ledger (${matchedReceipts.length})`}
                      </span>
                    </div>

                    {matchedReceipts.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic py-1.5 bg-white dark:bg-slate-900/60 rounded px-2.5 border border-slate-200/60 dark:border-slate-700/50">
                        {isAmharic ? 'ምንም የተመዘገበ ተከታታይ የክፍያ ደረሰኝ የለም።' : 'No periodic payment receipts recorded yet for this member.'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                            <tr>
                              <th className="px-2.5 py-1.5">#</th>
                              <th className="px-2.5 py-1.5">{isAmharic ? 'ደረሰኝ ቁጥር' : 'Receipt No'}</th>
                              <th className="px-2.5 py-1.5">{isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}</th>
                              <th className="px-2.5 py-1.5">{isAmharic ? 'የሚያበቃበት' : 'Valid Until'}</th>
                              <th className="px-2.5 py-1.5">{isAmharic ? 'መጠን' : 'Amount'}</th>
                              <th className="px-2.5 py-1.5">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                              <th className="px-2.5 py-1.5">{isAmharic ? 'ሰነድ' : 'Slip'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium text-[11px]">
                            {matchedReceipts.map((rc, idx) => {
                              const rcStatus = getPaymentReceiptStatus(rc.expirationDate);
                              return (
                                <tr key={rc.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="px-2.5 py-1.5 font-mono text-slate-400">{idx + 1}</td>
                                  <td className="px-2.5 py-1.5 font-mono font-bold text-slate-900 dark:text-white">{rc.receiptNumber}</td>
                                  <td className="px-2.5 py-1.5 font-mono">{formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}</td>
                                  <td className="px-2.5 py-1.5 font-mono">{formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}</td>
                                  <td className="px-2.5 py-1.5 font-bold">{rc.amount ? `${rc.amount} ETB` : '—'}</td>
                                  <td className="px-2.5 py-1.5">
                                    <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded ${
                                      rcStatus.status === 'active'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : rcStatus.status === 'expiring_soon'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    }`}>
                                      {rcStatus.status === 'active' ? (isAmharic ? 'ህጋዊ' : 'Active') : rcStatus.status === 'expiring_soon' ? (isAmharic ? 'ሊያልቅ' : 'Expiring') : (isAmharic ? 'ያለፈ' : 'Expired')}
                                    </span>
                                  </td>
                                  <td className="px-2.5 py-1.5">
                                    {rc.receiptScreenshot ? (
                                      <button
                                        type="button"
                                        onClick={() => openDocumentCarousel(rc.receiptScreenshot!, selectedRegForDetails, `${selectedRegForDetails.fullName} — Receipt #${rc.receiptNumber}`)}
                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-bold underline cursor-pointer flex items-center gap-0.5"
                                      >
                                        <Icon className="material-symbols-outlined text-[13px]">image</Icon>
                                        <span>{isAmharic ? 'እይ' : 'View'}</span>
                                      </button>
                                    ) : (
                                      <span className="text-slate-400 italic">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Document Photos */}
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <h4 className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <Icon className="material-symbols-outlined text-[18px] text-yellow-600 dark:text-yellow-400">photo_library</Icon>
                <span>{isAmharic ? 'የተያያዙ ፎቶዎች እና ሰነዶች (Click to Zoom)' : 'Uploaded Document Photos (Click to Zoom)'}</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block truncate">
                    {isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}
                  </span>
                  <div
                    onClick={() => selectedRegForDetails.userPortraitPhoto && openDocumentCarousel(selectedRegForDetails.userPortraitPhoto, selectedRegForDetails, `${selectedRegForDetails.fullName} — Portrait`)}
                    className="h-28 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer group relative shadow-2xs"
                  >
                    {selectedRegForDetails.userPortraitPhoto ? (
                      <>
                        <SmartImage src={selectedRegForDetails.userPortraitPhoto} alt="Portrait" fallbackIcon="person" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Icon className="material-symbols-outlined text-[20px]">zoom_in</Icon>
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">{isAmharic ? 'አልተያያዘም' : 'None'}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block truncate">
                    {isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}
                  </span>
                  <div
                    onClick={() => selectedRegForDetails.nationalIdPhoto && openDocumentCarousel(selectedRegForDetails.nationalIdPhoto, selectedRegForDetails, `${selectedRegForDetails.fullName} — National ID`)}
                    className="h-28 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer group relative shadow-2xs"
                  >
                    {selectedRegForDetails.nationalIdPhoto ? (
                      <>
                        <SmartImage src={selectedRegForDetails.nationalIdPhoto} alt="National ID" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Icon className="material-symbols-outlined text-[20px]">zoom_in</Icon>
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">{isAmharic ? 'አልተያያዘም' : 'None'}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block truncate">
                    {isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                  </span>
                  <div
                    onClick={() => selectedRegForDetails.drivingLicensePhoto && openDocumentCarousel(selectedRegForDetails.drivingLicensePhoto, selectedRegForDetails, `${selectedRegForDetails.fullName} — License`)}
                    className="h-28 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer group relative shadow-2xs"
                  >
                    {selectedRegForDetails.drivingLicensePhoto ? (
                      <>
                        <SmartImage src={selectedRegForDetails.drivingLicensePhoto} alt="Driving License" fallbackIcon="card_membership" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Icon className="material-symbols-outlined text-[20px]">zoom_in</Icon>
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">{isAmharic ? 'አልተያያዘም' : 'None'}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block truncate">
                    {isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}
                  </span>
                  <div
                    onClick={() => selectedRegForDetails.drivingPermitPhoto && openDocumentCarousel(selectedRegForDetails.drivingPermitPhoto, selectedRegForDetails, `${selectedRegForDetails.fullName} — Permit`)}
                    className="h-28 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer group relative shadow-2xs"
                  >
                    {selectedRegForDetails.drivingPermitPhoto ? (
                      <>
                        <SmartImage src={selectedRegForDetails.drivingPermitPhoto} alt="Permit" fallbackIcon="menu_book" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Icon className="material-symbols-outlined text-[20px]">zoom_in</Icon>
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">{isAmharic ? 'አልተያያዘም' : 'None'}</span>
                    )}
                  </div>
                </div>

                {/* 5. Bank Receipt Slip */}
                {(() => {
                  const latestRc = getLatestReceiptForRegistration(selectedRegForDetails, paymentReceipts);
                  const slipPhoto = latestRc?.receiptScreenshot || selectedRegForDetails.receiptScreenshot;
                  return (
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 font-bold block truncate">
                        {isAmharic ? 'የክፍያ ደረሰኝ' : 'Receipt Slip'}
                      </span>
                      <div
                        onClick={() => slipPhoto && openDocumentCarousel(slipPhoto, selectedRegForDetails, `${selectedRegForDetails.fullName} — ${isAmharic ? 'የክፍያ ደረሰኝ' : 'Receipt Slip'}`)}
                        className="h-28 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer group relative shadow-2xs"
                      >
                        {slipPhoto ? (
                          <>
                            <SmartImage src={slipPhoto} alt="Receipt Slip" fallbackIcon="receipt_long" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Icon className="material-symbols-outlined text-[20px]">zoom_in</Icon>
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">{isAmharic ? 'አልተያያዘም' : 'None'}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">

                {canEditRegistration && (
                  <button
                    id="details-modal-edit-reg-btn"
                    type="button"
                    onClick={() => {
                      const reg = selectedRegForDetails;
                      setSelectedRegForDetails(null);
                      setEditingRegistration(reg);
                    }}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <Icon className="material-symbols-outlined text-[18px]">edit</Icon>
                    <span>{isAmharic ? 'መረጃ አሻሽል (Edit)' : 'Edit Registration'}</span>
                  </button>
                )}

                {(userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin') && (
                  <button
                    type="button"
                    onClick={() => {
                      const reg = selectedRegForDetails;
                      setSelectedRegForDetails(null);
                      setSelectedRegForQR(reg);
                    }}
                    className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-extrabold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <Icon className="material-symbols-outlined text-[18px]">badge</Icon>
                    <span>{isAmharic ? 'የሞተረኞች ማህበር መታወቂያ' : 'Motorcyclists Association ID'}</span>
                  </button>
                )}

                {(selectedRegForDetails.status === 'approved' || selectedRegForDetails.status === 'printed' || selectedRegForDetails.status === 'ordered_print') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const reg = selectedRegForDetails;
                        setSelectedRegForDetails(null);
                        setSelectedRegForA4(reg);
                      }}
                      className="px-3.5 py-2 bg-[#0B1E48] hover:bg-[#071330] text-yellow-400 font-extrabold rounded-md text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Icon className="material-symbols-outlined text-[16px]">print</Icon>
                      <span>{isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Print Permit'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const reg = selectedRegForDetails;
                        setSelectedRegForDetails(null);
                        setSelectedRegForSticker(reg);
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                    >
                      <Icon className="material-symbols-outlined text-[18px]">qr_code_scanner</Icon>
                      <span>{isAmharic ? 'ተለጣፊ' : 'Print Sticker'}</span>
                    </button>
                  </>
                )}

                {userRole !== 'officer' && isTaskAllowed(userRole, 1) && (
                  <button
                    type="button"
                    onClick={() => handleOpenRenewalModal(selectedRegForDetails)}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <Icon className="material-symbols-outlined text-[16px]">receipt_long</Icon>
                    <span>{isAmharic ? 'የክፍያ ደረሰኝ መዝግብ' : 'Log Payment Receipt'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedRegForDetails(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs rounded-md font-bold cursor-pointer transition-colors"
              >
                {isAmharic ? 'ዝጋ' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEWAL MONTHLY PAYMENT RECEIPT MODAL */}
      {renewalModalReg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <Icon className="material-symbols-outlined text-[22px]">add_card</Icon>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                    {isAmharic ? 'የወርሃዊ ክፍያ ደረሰኝ መመዝገቢያ' : 'Record Monthly Payment Receipt'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {renewalModalReg.fullName} • {renewalModalReg.plateNumber || renewalModalReg.engineOrSerialNo}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenewalModalReg(null)}
                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[20px]">close</Icon>
              </button>
            </div>

            {renewalError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded text-xs text-rose-800 dark:text-rose-200">
                {renewalError}
              </div>
            )}

            {renewalSuccess && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded text-xs text-emerald-800 dark:text-emerald-200 font-bold">
                {renewalSuccess}
              </div>
            )}

            <form onSubmit={handleSaveRenewalReceipt} className="space-y-3.5 text-xs">
              {/* Member Pre-filled Info (Read-only confirmation) */}
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">{isAmharic ? 'ባለቤት:' : 'Member Name:'}</span>
                  <span className="font-bold text-slate-900 dark:text-white block truncate">{renewalModalReg.fullName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">{isAmharic ? 'የሰሌዳ ቁጥር:' : 'Plate Number:'}</span>
                  <span className="font-mono font-bold text-[#0B1E48] dark:text-yellow-400 block truncate">{renewalModalReg.plateNumber || '—'}</span>
                </div>
              </div>

              {/* Receipt Number & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የደረሰኝ ቁጥር *' : 'Receipt Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CBE-8492041"
                    value={renewalReceiptNumber}
                    onChange={(e) => setRenewalReceiptNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የክፍያ መጠን (ብር)' : 'Amount (ETB)'}
                  </label>
                  <input
                    type="number"
                    placeholder="500"
                    value={renewalAmount}
                    onChange={(e) => setRenewalAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              {/* Payment Date & Calculated Expiration Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}
                  </label>
                  <input
                    type="date"
                    value={renewalPaymentDate}
                    onChange={(e) => setRenewalPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የሚያበቃበት ቀን (1 ወር)' : 'Expiration Date (1 month)'}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={calculateOneMonthExpiration(renewalPaymentDate)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono font-bold cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Receipt Screenshot Upload */}
              <div className="space-y-1">
                <DocumentUploadInput
                  label={isAmharic ? 'የባንክ ደረሰኝ ፎቶ (ማረጋገጫ)' : 'Bank Receipt Slip Photo'}
                  photoUrl={renewalScreenshot}
                  onPhotoChange={setRenewalScreenshot}
                  isAmharic={isAmharic}
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  {isAmharic ? 'ማስታወሻ / አስተያየት' : 'Remarks / Notes'}
                </label>
                <input
                  type="text"
                  placeholder={isAmharic ? 'አማራጭ ማስታወሻ...' : 'Optional notes...'}
                  value={renewalNotes}
                  onChange={(e) => setRenewalNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSubmittingRenewal}
                  onClick={() => setRenewalModalReg(null)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs rounded-md font-bold cursor-pointer"
                >
                  {isAmharic ? 'ተመለስ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRenewal}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs rounded-md font-extrabold cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  {isSubmittingRenewal ? (
                    <>
                      <Icon className="material-symbols-outlined text-[16px] animate-spin">progress_activity</Icon>
                      <span>{isAmharic ? 'እየተመዘገበ...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Icon className="material-symbols-outlined text-[16px]">check</Icon>
                      <span>{isAmharic ? 'መዝግብ' : 'Save Receipt'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CAROUSEL DOCUMENT ZOOM VIEWER */}
      {carouselModal && (
        <FullscreenDocumentCarouselModal
          items={carouselModal.items}
          initialIndex={carouselModal.initialIndex}
          lang={lang}
          onClose={() => setCarouselModal(null)}
        />
      )}

      {/* EDIT REGISTRATION MODAL */}
      <EditRegistrationModal
        isOpen={!!editingRegistration}
        registration={editingRegistration}
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        onClose={() => setEditingRegistration(null)}
        onSaveSuccess={(updatedReg) => {
          setEditingRegistration(null);
          if (onShowToast) {
            onShowToast(
              isAmharic
                ? `የአባል ${updatedReg.fullName} መረጃ በተሳካ ሁኔታ ተሻሽሏል`
                : `Registration for ${updatedReg.fullName} updated successfully`,
              'success'
            );
          }
        }}
      />
    </div>
  );
};
