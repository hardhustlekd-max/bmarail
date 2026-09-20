import { ExpandableMemberCard } from './ExpandableMemberCard';
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { formatEthiopianDate } from '../utils/ethiopianCalendar';
import {
  updateRegistrationInDb,
  deleteRegistrationFromDb,
  bulkDeleteRegistrationsFromDb,
  saveRegistrationToDb,
  updateRegistrationStatusInDb,
  addAuditLogToDb,
  isTaskAllowed,
  getPermissionState,
  savePaymentReceiptToDb,
  deletePaymentReceiptFromDb,
} from '../services/dbService';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  OfficerAssignment,
  VerificationLog,
  PaymentReceipt,
} from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus } from '../utils/paymentUtils';
import { getReceiptsForRegistration, getLatestReceiptForRegistration, getUnifiedPaymentCompliance, getChassisDisplay, getChassisNumber } from '../utils/unifiedMemberUtils';
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
import { LoadingSpinner } from './ui/Skeleton';

interface TablesPageProps {
  lang: Language;
  userRole: UserRole;
  userBadgeId?: string;
  registrations: MotorcycleRegistration[];
  officers: OfficerAssignment[];
  verificationLogs?: VerificationLog[];
  paymentReceipts?: PaymentReceipt[];
  onSavePaymentReceipt?: (receipt: PaymentReceipt) => void;
  onDeletePaymentReceipt?: (id: string) => void;
  onApproveRegistration: (id: string) => void;
  onRejectRegistration: (id: string, reason: string) => void;
  onAddVerificationLog?: (log: VerificationLog) => void;
  initialTableTab?: 'approved' | 'pending' | 'expired';
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isLoading?: boolean;
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
  onDeletePaymentReceipt,
  onApproveRegistration,
  onRejectRegistration,
  onAddVerificationLog,
  initialTableTab,
  onShowToast,
  isLoading = false,
}) => {
  const isAmharic = lang === 'am';

  if (isLoading) {
    return null;
  }

  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';
  const hasTaskEditPermission = isTaskAllowed(userRole, 2);
  const isReadOnly = !isSuperAdmin && getPermissionState(userRole, 2) === 'view_only';
  const canEditRegistration = isSuperAdmin || (hasTaskEditPermission && !isReadOnly);

  const [editingRegistration, setEditingRegistration] = useState<MotorcycleRegistration | null>(null);
  const [expandedReceipts, setExpandedReceipts] = useState<Record<string, boolean>>({});

  const toggleReceiptExpand = (rcId: string) => {
    setExpandedReceipts((prev) => ({
      ...prev,
      [rcId]: !prev[rcId],
    }));
  };

  const handleDeleteReceiptClick = async (receiptId: string) => {
    if (!window.confirm(isAmharic ? 'እርግጠኛ ነዎት ይህንን የክፍያ ደረሰኝ መሰረዝ ይፈልጋሉ?' : 'Are you sure you want to delete this payment receipt?')) {
      return;
    }
    try {
      if (onDeletePaymentReceipt) {
        await onDeletePaymentReceipt(receiptId);
      } else {
        await deletePaymentReceiptFromDb(receiptId);
        onShowToast?.(
          isAmharic ? 'የክፍያ ደረሰኝ በተሳካ ሁኔታ ተሰርዟል።' : 'Payment receipt deleted successfully.',
          'success'
        );
      }
    } catch (err: any) {
      onShowToast?.(
        isAmharic ? 'ደረሰኙን ለመሰረዝ አልተቻለም።' : 'Failed to delete payment receipt.',
        'error'
      );
    }
  };

  const renderStatusBadge = (status?: string, alwaysShowText: boolean = false, reg?: MotorcycleRegistration) => {
    const textClass = alwaysShowText ? 'inline' : 'hidden sm:inline';
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981]" title={isAmharic ? 'የተፈቀደ' : 'Approved'}>
            <Icon className="material-symbols-outlined text-[14px] shrink-0">check_circle</Icon>
            <span className={textClass}>{isAmharic ? 'የተፈቀደ' : 'Approved'}</span>
          </span>
        );
      case 'printed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3C50E0]" title={isAmharic ? 'የታተመ' : 'Printed'}>
            <Icon className="material-symbols-outlined text-[14px] shrink-0">print</Icon>
            <span className={textClass}>{isAmharic ? 'የታተመ' : 'Printed'}</span>
          </span>
        );
      case 'ordered_print':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6366F1]" title={isAmharic ? 'በሕትመት' : 'In Print'}>
            <Icon className="material-symbols-outlined text-[14px] shrink-0">local_printshop</Icon>
            <span className={textClass}>{isAmharic ? 'በሕትመት' : 'In Print'}</span>
          </span>
        );
      case 'rejected':
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#FB5454]" title={status === 'expired' ? (isAmharic ? 'ጊዜው ያለፈበት' : 'Expired') : (isAmharic ? 'ውድቅ' : 'Rejected')}>
            <Icon className="material-symbols-outlined text-[14px] shrink-0">cancel</Icon>
            <span className={textClass}>{status === 'expired' ? (isAmharic ? 'ጊዜው ያለፈበት' : 'Expired') : (isAmharic ? 'ውድቅ' : 'Rejected')}</span>
          </span>
        );
      case 'pending_approval':
      case 'pending':
      default:
        if (reg?.isCorrection || reg?.lastRejectionReason) {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400" title={isAmharic ? 'ተስተካክሎ የቀረበ' : 'Corrected & Resubmitted'}>
              <Icon className="material-symbols-outlined text-[14px] shrink-0">edit_note</Icon>
              <span className={textClass}>{isAmharic ? 'ተስተካክሎ የቀረበ' : 'Corrected & Resubmitted'}</span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F59E0B]" title={isAmharic ? 'የሚጠበቅ' : 'Pending'}>
            <Icon className="material-symbols-outlined text-[14px] shrink-0">schedule</Icon>
            <span className={textClass}>{isAmharic ? 'የሚጠበቅ' : 'Pending'}</span>
          </span>
        );
    }
  };

  // Status border class helper for rectangular avatar
  const getStatusBorderClass = (status?: string, reg?: MotorcycleRegistration) => {
    if (status === 'approved' || status === 'printed') {
      return 'border-[#10B981] dark:border-[#10B981] ring-1 ring-[#10B981]/30';
    }
    if (status === 'ordered_print') {
      return 'border-[#6366F1] dark:border-[#6366F1] ring-1 ring-[#6366F1]/30';
    }
    if (status === 'rejected' || status === 'expired') {
      return 'border-[#FB5454] dark:border-[#FB5454] ring-1 ring-[#FB5454]/30';
    }
    if (reg?.isCorrection || reg?.lastRejectionReason) {
      return 'border-amber-500 dark:border-amber-500 ring-1 ring-amber-500/30';
    }
    return 'border-[#F59E0B] dark:border-[#F59E0B] ring-1 ring-[#F59E0B]/30';
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
    if (reg.hideFromOtherUsers && !isSuperAdmin) {
      return isAmharic ? '🔒 [የተደበቀ ባለቤት]' : '🔒 [Hidden Owner]';
    }
    return reg.fullName || '—';
  };

  const getDisplayPhone = (reg: MotorcycleRegistration) => {
    if (reg.hideFromOtherUsers && !isSuperAdmin) {
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
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [regCategoryFilter, setRegCategoryFilter] = useState<'all' | 'private' | 'commercial' | 'governmental'>('all');
  const [regSubCityFilter, setRegSubCityFilter] = useState<string>('all');

  // Role-specific scoped registrations (hidden records excluded from totals & tables except for Super Admin)
  const scopedRegistrations = React.useMemo(() => {
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

  const approvedCount = scopedRegistrations.filter(
    (r) => r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print'
  ).length;

  const pendingCount = scopedRegistrations.filter(
    (r) => r.status === 'pending_approval' || (r.status as string) === 'pending'
  ).length;

  const expiredCount = scopedRegistrations.filter(
    (r) => (r.status as string) === 'expired' || r.status === 'rejected'
  ).length;

  const filteredRegistrations = scopedRegistrations.filter((r) => {
    // 1. Status Filter
    let matchesStatus = true;
    if (activeTableTab === 'approved') {
      matchesStatus = r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print';
    } else if (activeTableTab === 'pending') {
      matchesStatus = r.status === 'pending_approval' || (r.status as string) === 'pending';
    } else if (activeTableTab === 'expired') {
      matchesStatus = (r.status as string) === 'expired' || r.status === 'rejected';
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
        (r.engineOrSerialNo || '').toLowerCase().includes(q) ||
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

  // --- BULK SELECTION & ACTION STATE ---
  const [selectedRegIds, setSelectedRegIds] = useState<Set<string>>(new Set());
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkPrintRosterModal, setShowBulkPrintRosterModal] = useState(false);

  // Clear selection when switching tabs
  React.useEffect(() => {
    setSelectedRegIds(new Set());
  }, [activeTableTab]);

  const isAllPageSelected =
    paginatedRegistrations.length > 0 &&
    paginatedRegistrations.every((r) => selectedRegIds.has(r.id));

  const toggleSelectRow = (id: string) => {
    setSelectedRegIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedRegIds((prev) => {
      const next = new Set(prev);
      const allSelected = paginatedRegistrations.every((r) => next.has(r.id));
      if (allSelected) {
        paginatedRegistrations.forEach((r) => next.delete(r.id));
      } else {
        paginatedRegistrations.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedRegIds(new Set(filteredRegistrations.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedRegIds(new Set());
  };

  const selectedRegsList = React.useMemo(() => {
    return registrations.filter((r) => selectedRegIds.has(r.id));
  }, [registrations, selectedRegIds]);

  const selectedPendingCount = React.useMemo(() => {
    return selectedRegsList.filter(
      (r) => r.status === 'pending_approval' || (r.status as string) === 'pending'
    ).length;
  }, [selectedRegsList]);

  const executeBulkApprove = async () => {
    if (selectedRegIds.size === 0) return;
    setIsSubmittingBulk(true);
    try {
      const selectedIds = Array.from(selectedRegIds);
      let approvedCount = 0;

      for (const id of selectedIds) {
        const reg = registrations.find((r) => r.id === id);
        if (reg) {
          const updatedRecord: MotorcycleRegistration = {
            ...reg,
            status: 'approved',
            rejectionReason: undefined,
          };
          await saveRegistrationToDb(updatedRecord);
          await updateRegistrationStatusInDb(id, 'approved');
          approvedCount++;
        }
      }

      await addAuditLogToDb({
        actorBadgeId: userBadgeId || (isSuperAdmin ? 'SUPERADMIN' : 'ADMIN-01'),
        actorRole: userRole,
        action: 'BULK_REGISTRATIONS_APPROVED',
        details: `${userRole} bulk approved ${approvedCount} member registrations from Records & Tables`,
        severity: 'info',
      });

      onShowToast?.(
        isAmharic
          ? `${approvedCount} አባላት በጅምላ በተሳካ ሁኔታ ጸድቀዋል!`
          : `Successfully approved ${approvedCount} selected member(s)!`,
        'success'
      );

      setSelectedRegIds(new Set());
      setShowBulkApproveModal(false);
    } catch (err: any) {
      console.error('Bulk approve failed:', err);
      onShowToast?.(
        isAmharic ? 'በጅምላ ማጽደቅ ላይ ስህተት ተፈጥሯል' : 'Error performing bulk approval',
        'error'
      );
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  const executeBulkDelete = async () => {
    if (selectedRegIds.size === 0) return;
    setIsSubmittingBulk(true);
    try {
      const idsToDelete = Array.from(selectedRegIds);
      await bulkDeleteRegistrationsFromDb(idsToDelete);

      await addAuditLogToDb({
        actorBadgeId: userBadgeId || (isSuperAdmin ? 'SUPERADMIN' : 'ADMIN'),
        actorRole: userRole,
        action: 'BULK_REGISTRATIONS_DELETED',
        details: `${userRole} bulk deleted ${idsToDelete.length} member registrations`,
        severity: 'warning',
      });

      onShowToast?.(
        isAmharic
          ? `${idsToDelete.length} የተመረጡ አባላት መረጃ በቋሚነት ተሰርዟል!`
          : `Successfully deleted ${idsToDelete.length} selected member records!`,
        'success'
      );

      setSelectedRegIds(new Set());
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      onShowToast?.(
        isAmharic ? 'በጅምላ መሰረዝ ላይ ስህተት ተፈጥሯል' : 'Failed to perform bulk delete',
        'error'
      );
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  const executeBulkToggleHide = async (shouldHide: boolean) => {
    if (selectedRegIds.size === 0) return;
    setIsSubmittingBulk(true);
    try {
      const ids = Array.from(selectedRegIds);
      let count = 0;
      for (const id of ids) {
        await updateRegistrationInDb(id, { hideFromOtherUsers: shouldHide });
        count++;
      }
      onShowToast?.(
        isAmharic
          ? `${count} አባላት ${shouldHide ? 'ተደብቀዋል' : 'ግልፅ ተደርገዋል'}!`
          : `Successfully ${shouldHide ? 'hidden' : 'unhidden'} ${count} selected records!`,
        'success'
      );
      setSelectedRegIds(new Set());
    } catch (e) {
      onShowToast?.(isAmharic ? 'ስህተት ተፈጥሯል' : 'Error updating visibility', 'error');
    } finally {
      setIsSubmittingBulk(false);
    }
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
      {/* SINGLE UNIFIED TABLE CONTAINER (TAILADMIN DATATABLE DESIGN) */}
      <div className="rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] shadow-xs overflow-hidden divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">

        {/* CONTAINER HEADER */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1C2434]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-sm bg-[#3C50E0]/10 text-[#3C50E0] flex items-center justify-center">
              <Icon className="material-symbols-outlined text-[20px]">table_chart</Icon>
            </div>
            <div>
              <h3 className="font-semibold text-base sm:text-lg text-[#1C2434] dark:text-white">
                {userRole === 'clerk'
                  ? (activeTableTab === 'approved'
                      ? (isAmharic ? 'የፀደቁ ተሽከርካሪዎች' : 'Approved Motor Registry')
                      : (isAmharic ? 'የቀረቡ ማመልከቻዎች' : 'View Submissions'))
                  : (isAmharic ? 'የአባላት መረጃዎች ማህደር' : 'Records & Tables')}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showHiddenControls && isSuperAdmin && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FB5454]/10 border border-[#FB5454]/20 text-[#FB5454] rounded-sm text-xs font-semibold shadow-2xs">
                <Icon className="material-symbols-outlined text-[16px]">visibility_off</Icon>
                <span>
                  {isAmharic ? 'ጠቅላላ የተደበቁ:' : 'Total Hidden:'}{' '}
                  {registrations.filter((r) => r.hideFromOtherUsers).length}
                </span>
              </div>
            )}

            {/* Mobile Search Icon Toggle on table header opposite left side */}
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen((prev) => !prev)}
              className={`sm:hidden w-9 h-9 rounded-sm flex items-center justify-center border transition-colors cursor-pointer ${
                isMobileSearchOpen || regSearchQuery
                  ? 'bg-[#3C50E0] text-white border-[#3C50E0]'
                  : 'bg-white dark:bg-[#1C2434] text-[#64748B] dark:text-[#8A99AD] border-[#E2E8F0] dark:border-[#2E3A47] hover:text-[#1C2434] dark:hover:text-white'
              }`}
              title={isAmharic ? 'ፈልግ' : 'Search'}
            >
              <Icon className="material-symbols-outlined text-[18px]">
                {isMobileSearchOpen ? 'close' : 'search'}
              </Icon>
            </button>
          </div>
        </div>

        {/* Mobile Search Dropdown */}
        {isMobileSearchOpen && (
          <div className="sm:hidden p-3 bg-white dark:bg-[#1C2434] border-b border-[#E2E8F0] dark:border-[#2E3A47] animate-fade-in">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#8A99AD]">
                <Icon className="material-symbols-outlined text-[16px]">search</Icon>
              </div>
              <input
                type="text"
                autoFocus
                value={regSearchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  const isSuperUser = isSuperAdmin;
                  if (isSuperUser && val.toLowerCase().includes('super1212')) {
                    setShowHiddenControls(true);
                    const cleaned = val.replace(/super1212/gi, '').trim();
                    setRegSearchQuery(cleaned);
                  } else {
                    setRegSearchQuery(val);
                  }
                  setRegPage(1);
                }}
                placeholder={isAmharic ? 'በስም፣ ሰሌዳ፣ ስልክ ወይም ቻሲስ ፈልግ...' : 'Search by name, plate, phone, chasis...'}
                className="w-full rounded-sm border border-[#3C50E0] bg-[#F7F9FC] dark:bg-[#24303F] py-2 pl-9 pr-8 text-xs text-[#1C2434] dark:text-white outline-none"
              />
              {regSearchQuery && (
                <button
                  type="button"
                  onClick={() => setRegSearchQuery('')}
                  className="absolute inset-y-0 right-2.5 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
                >
                  <Icon className="material-symbols-outlined text-[15px]">close</Icon>
                </button>
              )}
            </div>
          </div>
        )}

        {/* SUB-FILTER SLIDE BAR (TAILADMIN DESIGN: LIVE SEARCH & STATUS BUTTONS) */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 bg-[#F7F9FC] dark:bg-[#24303F]/60 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
          {/* Live Search Input (Hidden on mobile, shown in header dropdown) */}
          <div className="relative flex-1 min-w-[200px] max-w-sm hidden sm:block">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#8A99AD]">
              <Icon className="material-symbols-outlined text-[16px]">search</Icon>
            </div>
            <input
              type="text"
              value={regSearchQuery}
              onChange={(e) => {
                const val = e.target.value;
                const isSuperUser = isSuperAdmin;
                if (isSuperUser && val.toLowerCase().includes('super1212')) {
                  setShowHiddenControls(true);
                  const cleaned = val.replace(/super1212/gi, '').trim();
                  setRegSearchQuery(cleaned);
                } else {
                  setRegSearchQuery(val);
                }
                setRegPage(1);
              }}
              placeholder={isAmharic ? 'በስም፣ ሰሌዳ፣ ስልክ ወይም ቻሲስ ፈልግ...' : 'Search by name, plate, phone, chasis...'}
              className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm text-xs text-[#1C2434] dark:text-white placeholder-[#8A99AD] focus:border-[#3C50E0] focus:outline-none transition-colors"
            />
            {regSearchQuery && (
              <button
                type="button"
                onClick={() => setRegSearchQuery('')}
                className="absolute inset-y-0 right-2.5 flex items-center text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[15px]">close</Icon>
              </button>
            )}
          </div>

          {/* Status Tabs in TailAdmin Button Group Style */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none max-w-full pb-1 sm:pb-0">
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              {[
                {
                  id: 'approved' as const,
                  label: isAmharic ? 'የፀደቁ' : 'Approved',
                  count: approvedCount,
                  badgeColor: 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]',
                },
                {
                  id: 'pending' as const,
                  label: isAmharic ? 'የሚጠበቁ' : 'Pending',
                  count: pendingCount,
                  badgeColor:
                    pendingCount > 0
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                      : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]',
                },
                {
                  id: 'expired' as const,
                  label: isAmharic ? 'ያለፈበት' : 'Expired',
                  count: expiredCount,
                  badgeColor:
                    expiredCount > 0
                      ? 'bg-[#FB5454]/20 text-[#FB5454]'
                      : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]',
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
                    className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 select-none rounded-sm ${
                      isActive
                        ? 'bg-[#3C50E0] text-white font-semibold shadow-xs'
                        : 'bg-white dark:bg-[#1C2434] hover:bg-[#F7F9FC] dark:hover:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white border border-[#E2E8F0] dark:border-[#2E3A47]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium transition-colors ${
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
                className="px-2.5 py-1.5 rounded-sm text-xs font-medium text-[#FB5454] hover:bg-[#FB5454]/10 transition-colors flex items-center gap-1 cursor-pointer border border-[#FB5454]/20"
                title={isAmharic ? 'ማጣሪያዎችን አጽዳ' : 'Reset Filters'}
              >
                <span>{isAmharic ? 'አጽዳ' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        {/* --- BULK ACTION BANNER (WHEN RECORDS SELECTED) --- */}
        {selectedRegIds.size > 0 && (
          <div className="m-3 sm:m-4 p-3 sm:p-4 bg-gradient-to-r from-[#3C50E0]/12 via-[#3C50E0]/6 to-transparent dark:from-[#3C50E0]/25 dark:via-[#3C50E0]/12 border border-[#3C50E0]/30 rounded-md flex flex-wrap items-center justify-between gap-3 animate-fade-in shadow-xs">
            {/* Left: Info & Selection count */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-[#3C50E0] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Icon className="material-symbols-outlined text-[20px]">checklist</Icon>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs sm:text-sm text-[#1C2434] dark:text-white">
                    {isAmharic
                      ? `${selectedRegIds.size} አባላት ተመርጠዋል`
                      : `${selectedRegIds.size} member(s) selected`}
                  </span>
                  {selectedRegIds.size < filteredRegistrations.length && (
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="text-[11px] font-bold text-[#3C50E0] hover:underline cursor-pointer"
                    >
                      {isAmharic
                        ? `(ሁሉንም ${filteredRegistrations.length} አባላት ምረጥ)`
                        : `(Select all ${filteredRegistrations.length})`}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD]">
                  {isAmharic
                    ? 'በተመረጡት አባላት ላይ የጅምላ እርምጃዎችን መፈጸም ይችላሉ'
                    : 'Perform bulk actions on the selected member records'}
                </p>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Bulk Approve Action (if admin or superadmin) */}
              {(userRole === 'admin' || isSuperAdmin) && (
                <button
                  type="button"
                  onClick={() => setShowBulkApproveModal(true)}
                  disabled={isSubmittingBulk}
                  className="px-3 py-1.5 rounded-md bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={isAmharic ? 'የተመረጡትን በጅምላ አጽድቅ' : 'Bulk Approve Selected'}
                >
                  <Icon className="material-symbols-outlined text-[16px]">check_circle</Icon>
                  <span>
                    {isAmharic
                      ? `በጅምላ አጽድቅ ${selectedPendingCount > 0 ? `(${selectedPendingCount})` : ''}`
                      : `Bulk Approve ${selectedPendingCount > 0 ? `(${selectedPendingCount})` : ''}`}
                  </span>
                </button>
              )}

              {/* Print / Export Selected List */}
              <button
                type="button"
                onClick={() => setShowBulkPrintRosterModal(true)}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#3C50E0] text-[#1C2434] dark:text-white hover:text-[#3C50E0] font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                title={isAmharic ? 'የተመረጡትን ዝርዝር አትም' : 'Print Selected List'}
              >
                <Icon className="material-symbols-outlined text-[16px]">print</Icon>
                <span>{isAmharic ? 'ዝርዝር አትም' : 'Print List'}</span>
              </button>

              {/* SuperAdmin Bulk Hide/Unhide */}
              {isSuperAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => executeBulkToggleHide(true)}
                    disabled={isSubmittingBulk}
                    className="px-2.5 py-1.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer flex items-center gap-1"
                    title={isAmharic ? 'ከተጠቃሚዎች ደብቅ' : 'Hide from other users'}
                  >
                    <Icon className="material-symbols-outlined text-[15px]">visibility_off</Icon>
                    <span>{isAmharic ? 'ደብቅ' : 'Hide'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => executeBulkToggleHide(false)}
                    disabled={isSubmittingBulk}
                    className="px-2.5 py-1.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer flex items-center gap-1"
                    title={isAmharic ? 'ለሁሉም ግልፅ አድርግ' : 'Show to all users'}
                  >
                    <Icon className="material-symbols-outlined text-[15px]">visibility</Icon>
                    <span>{isAmharic ? 'ግልፅ አድርግ' : 'Unhide'}</span>
                  </button>
                </div>
              )}

              {/* Bulk Delete (if allowed) */}
              {(isTaskAllowed(userRole, 11) || isSuperAdmin) && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  disabled={isSubmittingBulk}
                  className="px-3 py-1.5 rounded-md bg-[#FB5454]/10 hover:bg-[#FB5454]/20 border border-[#FB5454]/30 text-[#FB5454] font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={isAmharic ? 'የተመረጡትን በጅምላ ሰርዝ' : 'Bulk Delete Selected'}
                >
                  <Icon className="material-symbols-outlined text-[16px]">delete</Icon>
                  <span>{isAmharic ? 'በጅምላ ሰርዝ' : 'Bulk Delete'}</span>
                </button>
              )}

              {/* Clear selection button */}
              <button
                type="button"
                onClick={clearSelection}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-[#64748B] hover:text-[#1C2434] dark:hover:text-white transition-colors cursor-pointer"
              >
                {isAmharic ? 'ሰርዝ (Deselect)' : 'Deselect'}
              </button>
            </div>
          </div>
        )}

        {/* --- VIEW 1: REGISTRATIONS TABLE (FILTERED BY STATUS) --- */}
        {(activeTableTab === 'approved' || activeTableTab === 'pending' || activeTableTab === 'expired') && (
          <div className="min-h-[580px] flex flex-col justify-between">
            {/* Desktop Data Table (>= md) WITH STANDALONE COLUMNS */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] text-xs uppercase tracking-wider font-semibold border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                    <th className="py-3 px-3 text-center min-w-[85px] align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        <label
                          className="inline-flex items-center gap-1 cursor-pointer select-none"
                          title={isAmharic ? 'በዚህ ገጽ ያሉትን ሁሉንም ምረጥ/ሰርዝ' : 'Select/Deselect All on Page'}
                        >
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            onChange={toggleSelectAllPage}
                            className="w-4 h-4 rounded-xs border-[#E2E8F0] dark:border-[#2E3A47] text-[#3C50E0] focus:ring-[#3C50E0] cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-[#1C2434] dark:text-white uppercase">
                            {isAmharic ? 'ሁሉም' : 'All'}
                          </span>
                        </label>
                      </div>
                    </th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'የባለቤት ስም' : 'Owner Name'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'ስልክ ቁጥር' : 'Phone'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate No'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'አይነት / ነዳጅ' : 'Category'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'ቻሲስ' : 'Chasis'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'ብራንድ / ሞዴል' : 'Brand & Model'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                    <th className="py-4 px-4 whitespace-nowrap">{isAmharic ? 'የተመዘገበበት ቀን' : 'Registered Date'}</th>
                    <th className="py-4 px-4 text-center whitespace-nowrap">{isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}</th>
                    <th className="py-4 px-4 text-right whitespace-nowrap">{isAmharic ? 'እርምጃዎች' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] text-xs">
                  {registrations.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-12 text-center text-[#64748B] dark:text-[#8A99AD]">
                        <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                          <Icon className="material-symbols-outlined text-[36px] text-[#8A99AD]">inbox</Icon>
                          <span className="font-semibold text-sm text-[#1C2434] dark:text-white">
                            {isAmharic ? 'ምንም የተመዘገቡ መረጃዎች የሉም' : 'No Vehicle Registrations Found'}
                          </span>
                          <span className="text-xs text-[#64748B] dark:text-[#8A99AD]">
                            {isAmharic
                              ? 'አዲስ የሞተር ብስክሌት መረጃዎች ሲመዘገቡ በዚህ ሰንጠረዥ ውስጥ ይዘረዘራሉ።'
                              : 'Vehicle permit applications will appear in this table once submitted.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRegistrations.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-10 text-center text-[#64748B] dark:text-[#8A99AD]">
                        <div className="flex flex-col items-center justify-center gap-2 py-4">
                          <Icon className="material-symbols-outlined text-[32px] text-[#8A99AD]">search_off</Icon>
                          <span className="font-semibold text-sm text-[#1C2434] dark:text-white">
                            {isAmharic ? 'ምንም የሚመሳሰል ማህደር አልተገኘም' : 'No matching motorcycle records found.'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTableTab('approved');
                            }}
                            className="px-3 py-1.5 bg-[#3C50E0] text-white font-medium text-xs rounded-sm shadow-xs hover:bg-opacity-90 cursor-pointer"
                          >
                            {isAmharic ? 'የፀደቁትን አሳይ' : 'Show Approved Permits'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                      paginatedRegistrations.map((reg, index) => {
                        const isExpanded = !!expandedRegs[reg.id];
                        const isRowSelected = selectedRegIds.has(reg.id);
                        return (
                          <React.Fragment key={reg.id}>
                            <tr className={`h-16 align-middle transition-colors ${
                              isRowSelected
                                ? 'bg-[#3C50E0]/8 dark:bg-[#3C50E0]/15 hover:bg-[#3C50E0]/12 dark:hover:bg-[#3C50E0]/20'
                                : 'hover:bg-[#F7F9FC]/70 dark:hover:bg-[#24303F]/50'
                            }`}>
                              {/* Index Number & Expand Toggle + Bulk Select Checkbox */}
                              <td className="px-3 py-2.5 align-middle h-16 text-center font-mono font-medium text-[#8A99AD]">
                                <div className="flex items-center justify-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={isRowSelected}
                                    onChange={() => toggleSelectRow(reg.id)}
                                    className="w-4 h-4 rounded-xs border-[#E2E8F0] dark:border-[#2E3A47] text-[#3C50E0] focus:ring-[#3C50E0] cursor-pointer shrink-0"
                                    title={isAmharic ? 'አባል ምረጥ' : 'Select member'}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => toggleRegExpand(reg.id)}
                                    className={`w-6 h-6 rounded-sm flex items-center justify-center transition-colors cursor-pointer ${
                                      isExpanded
                                        ? 'bg-[#3C50E0] text-white shadow-xs'
                                        : 'text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47]'
                                    }`}
                                    title={isExpanded ? (isAmharic ? 'አጣጥፍ' : 'Collapse') : (isAmharic ? 'ሰነዶችን እና ዝርዝር አሳይ' : 'Expand Documents & Details')}
                                  >
                                    <Icon className="material-symbols-outlined text-[16px]">
                                      {isExpanded ? 'expand_less' : 'expand_more'}
                                    </Icon>
                                  </button>
                                  <span>{regStartIndex + index + 1}</span>
                                </div>
                              </td>

                              {/* Standalone Column 1: Owner Name */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedRegForDetails(reg)}
                                  className="font-semibold text-xs sm:text-sm text-[#1C2434] dark:text-white hover:text-[#3C50E0] dark:hover:text-[#3C50E0] transition-colors text-left flex items-center gap-1.5 cursor-pointer max-w-[200px]"
                                >
                                  <span className="truncate">{getDisplayName(reg)}</span>
                                  {reg.hideFromOtherUsers && isSuperAdmin && (
                                    <span className="px-1 py-0.2 rounded-sm text-[9px] font-bold bg-[#FB5454]/10 text-[#FB5454] border border-[#FB5454]/20 shrink-0">
                                      🔒
                                    </span>
                                  )}
                                </button>
                              </td>

                              {/* Standalone Column 2: Phone Number */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <span className="text-xs font-mono font-medium text-[#64748B] dark:text-[#8A99AD]">
                                  {getDisplayPhone(reg)}
                                </span>
                              </td>

                              {/* Standalone Column 3: Plate Number */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <span className="font-mono font-bold text-xs text-[#1C2434] dark:text-white">
                                  {reg.plateNumber || '—'}
                                </span>
                              </td>

                              {/* Standalone Column 4: Vehicle Category (Fuel / EV) */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                {reg.vehicleCategory === 'electric' ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981]">
                                    <Icon className="material-symbols-outlined text-[13px]">electric_bolt</Icon>
                                    <span>{isAmharic ? 'ኤሌክትሪክ' : 'Electric'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3C50E0]">
                                    <Icon className="material-symbols-outlined text-[13px]">local_gas_station</Icon>
                                    <span>{isAmharic ? 'ቤንዚን' : 'Gasoline'}</span>
                                  </span>
                                )}
                              </td>

                              {/* Standalone Column 5: Chasis */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <span className="font-mono font-medium text-xs text-[#1C2434] dark:text-[#DEE4EE] block max-w-[140px] truncate" title={getChassisDisplay(reg)}>
                                  {getChassisDisplay(reg)}
                                </span>
                              </td>

                              {/* Standalone Column 6: Brand & Model */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <span className="font-medium text-xs text-[#1C2434] dark:text-[#DEE4EE] block max-w-[130px] truncate" title={`${reg.motorBrand || ''} ${reg.motorModel || ''}`}>
                                  {reg.motorBrand ? `${reg.motorBrand} ${reg.motorModel || ''}`.trim() : '—'}
                                </span>
                              </td>

                              {/* Standalone Column 7: Sub-City */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <span className="font-semibold text-xs text-[#1C2434] dark:text-white block">
                                  {reg.subCity || '—'}
                                </span>
                              </td>

                              {/* Standalone Column 8: Registration Date */}
                              <td className="px-4 py-3 align-middle h-16 whitespace-nowrap">
                                <span className="font-mono text-xs text-[#64748B] dark:text-[#8A99AD] block">
                                  {reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—'}
                                </span>
                              </td>

                              {/* Permit Status */}
                              <td className="px-4 py-3 align-middle h-16 text-center whitespace-nowrap">
                                {renderStatusBadge(reg.status, false, reg)}
                              </td>

                              {/* Actions Column: Clean Expand / Action Trigger */}
                              <td className="px-4 py-3 align-middle h-16 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => toggleRegExpand(reg.id)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-all cursor-pointer ${
                                    isExpanded
                                      ? 'bg-[#3C50E0] text-white shadow-xs'
                                      : 'border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#3C50E0] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white hover:text-[#3C50E0]'
                                  }`}
                                  title={isExpanded ? (isAmharic ? 'ተግባራትን እና ሰነዶችን ዝጋ' : 'Close Actions & Documents') : (isAmharic ? 'ተግባራትን እና ሰነዶችን ዘርጋ' : 'Expand Actions & Documents')}
                                >
                                  <span>{isExpanded ? (isAmharic ? 'ዝጋ' : 'Close') : (isAmharic ? 'ተግባራት' : 'Actions')}</span>
                                  <Icon className="material-symbols-outlined text-[16px]">
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                  </Icon>
                                </button>
                              </td>
                            </tr>

                            {/* Desktop Collapsible Sub-row: Action Buttons & Attached Documents */}
                            {isExpanded && (
                              <tr className="bg-[#F7F9FC]/90 dark:bg-[#24303F]/80 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                                <td colSpan={11} className="px-5 py-3">
                                  <div className="space-y-3">
                                    {/* Member Information Card (Redesigned Style) */}
                                    <ExpandableMemberCard
                                      fullName={getDisplayName(reg)}
                                      roleOrTitle={reg.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric') : (isAmharic ? 'የነዳጅ' : 'Gasoline')}
                                      badgeId={reg.plateNumber || reg.id}
                                      status={reg.status}
                                      portraitUrl={reg.userPortraitThumbnail || reg.userPortraitPhoto || reg.ownerPhoto}
                                      isAmharic={isAmharic}
                                      fields={[
                                        { label: isAmharic ? 'የአባል መለያ:' : 'Member ID:', value: reg.id },
                                        { label: isAmharic ? 'የሞተር አይነት:' : 'Motor Type:', value: reg.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric') : (isAmharic ? 'የነዳጅ' : 'Gasoline') },
                                        { label: isAmharic ? 'ክፍለ ከተማ:' : 'Sub-City:', value: reg.subCity || 'በላይ ዘለቀ ክፍለ ከተማ' },
                                        { label: isAmharic ? 'ስልክ ቁጥር:' : 'Phone Number:', value: getDisplayPhone(reg) },
                                        { label: isAmharic ? 'የሰሌዳ ቁጥር:' : 'Plate Number:', value: reg.plateNumber || '—' },
                                        { label: isAmharic ? 'የቻሲስ ቁጥር:' : 'Chassis Number:', value: getChassisDisplay(reg) },
                                        { label: isAmharic ? 'የተመዘገበበት ቀን:' : 'Registered Date:', value: reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—' }
                                      ]}
                                    />

                                    {/* Action Buttons Toolbar (TailAdmin Style) */}
                                    <div className="p-3.5 rounded-sm bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] shadow-xs flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-sm bg-[#3C50E0]/10 text-[#3C50E0] flex items-center justify-center border border-[#3C50E0]/20 shrink-0">
                                          <Icon className="material-symbols-outlined text-[18px]">touch_app</Icon>
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold text-xs text-[#1C2434] dark:text-white uppercase tracking-wider">
                                              {isAmharic ? 'የተግባር አዝራሮች (Action Buttons)' : 'Action Buttons'}
                                            </span>
                                            {renderStatusBadge(reg.status)}
                                          </div>
                                          <span className="text-[11px] text-[#64748B] dark:text-[#8A99AD]">
                                            {getDisplayName(reg)} • {reg.plateNumber || getChassisDisplay(reg) || reg.id}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Action Controls List */}
                                      <div className="flex flex-wrap items-center gap-2">
                                        {/* 1. Approval Controls */}
                                        {(userRole === 'admin' || isSuperAdmin) && reg.status === 'pending_approval' && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => onApproveRegistration(reg.id)}
                                              className="px-3 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white font-medium text-xs rounded-sm shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                                            >
                                              <Icon className="material-symbols-outlined text-[16px]">check_circle</Icon>
                                              <span>{isAmharic ? 'አፅድቅ' : 'Approve'}</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setRejectingId(reg.id)}
                                              className="px-3 py-1.5 bg-[#FB5454]/10 text-[#FB5454] hover:bg-[#FB5454]/20 font-medium text-xs rounded-sm border border-[#FB5454]/20 transition-colors cursor-pointer flex items-center gap-1.5"
                                            >
                                              <Icon className="material-symbols-outlined text-[16px]">cancel</Icon>
                                              <span>{isAmharic ? 'ሰርዝ (Reject)' : 'Reject'}</span>
                                            </button>
                                          </>
                                        )}

                                        {/* 2. Edit Registration */}
                                        {canEditRegistration && (
                                          <button
                                            id={`edit-reg-btn-${reg.id}`}
                                            type="button"
                                            onClick={() => setEditingRegistration(reg)}
                                            className="px-3 py-1.5 border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#3C50E0] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white hover:text-[#3C50E0] font-medium text-xs rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                            title={isAmharic ? 'የአባል መረጃ አሻሽል (Edit)' : 'Edit Registration'}
                                          >
                                            <Icon className="material-symbols-outlined text-[16px]">edit</Icon>
                                            <span>{isAmharic ? 'መረጃ አሻሽል' : 'Edit Info'}</span>
                                          </button>
                                        )}

                                        {/* 3. Association ID Card */}
                                        {(userRole === 'admin' || isSuperAdmin) && (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedRegForQR(reg)}
                                            className="px-3 py-1.5 bg-[#3C50E0] hover:bg-opacity-90 text-white font-medium text-xs rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                                            title={isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር መታወቂያ' : 'Bahirdar Motorist Association ID'}
                                          >
                                            <Icon className="material-symbols-outlined text-[16px]">badge</Icon>
                                            <span>{isAmharic ? 'የማህበር መታወቂያ' : 'Association ID'}</span>
                                          </button>
                                        )}

                                        {/* 4. Permits (Print Permit & Sticker) */}
                                        {(reg.status === 'approved' || reg.status === 'printed' || reg.status === 'ordered_print') && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => setSelectedRegForA4(reg)}
                                              className="px-3 py-1.5 border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#3C50E0] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white hover:text-[#3C50E0] font-medium text-xs rounded-sm transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                              title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ ወረቀት አትም' : 'Print Movement Permit Document'}
                                            >
                                              <Icon className="material-symbols-outlined text-[16px]">print</Icon>
                                              <span>{isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Print Permit'}</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => setSelectedRegForSticker(reg)}
                                              className="px-3 py-1.5 bg-[#10B981] hover:bg-opacity-90 text-white font-medium text-xs rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                                              title={isAmharic ? 'የሞተር QR ተለጣፊ አትም' : 'Print Vehicle QR Sticker'}
                                            >
                                              <Icon className="material-symbols-outlined text-[16px]">qr_code_scanner</Icon>
                                              <span>{isAmharic ? 'QR ተለጣፊ' : 'QR Sticker'}</span>
                                            </button>
                                          </>
                                        )}

                                        {/* 5. View Full Details Modal */}
                                        <button
                                          type="button"
                                          onClick={() => setSelectedRegForDetails(reg)}
                                          className="px-3 py-1.5 border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#3C50E0] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-[#3C50E0] dark:hover:text-white font-medium text-xs rounded-sm transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                          title={isAmharic ? 'ዝርዝር መረጃ ይመልከቱ' : 'View Full Details'}
                                        >
                                          <Icon className="material-symbols-outlined text-[16px]">visibility</Icon>
                                          <span>{isAmharic ? 'ዝርዝር እይ' : 'Full Details'}</span>
                                        </button>

                                        {/* 6. SuperAdmin Visibility Toggle */}
                                        {showHiddenControls && isSuperAdmin && (() => {
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
                                              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer font-medium text-xs flex items-center gap-1.5 ${
                                                isSuperUserRegistered
                                                  ? 'opacity-40 cursor-not-allowed text-[#8A99AD] bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47]'
                                                  : reg.hideFromOtherUsers
                                                  ? 'bg-[#FB5454] hover:bg-opacity-90 text-white shadow-xs'
                                                  : 'bg-[#10B981] hover:bg-opacity-90 text-white shadow-xs'
                                              }`}
                                              title={
                                                isSuperUserRegistered
                                                  ? (isAmharic ? 'የሱፐር አድሚን ምዝገባ (መደበቅ አይቻልም)' : 'Super Admin Entry (Cannot Hide)')
                                                  : reg.hideFromOtherUsers
                                                  ? (isAmharic ? 'መረጃውን ለሌሎች ግልፅ አድርግ' : 'Show Owner to Others')
                                                  : (isAmharic ? 'መረጃውን ከሌሎች ደብቅ' : 'Hide Owner from Others')
                                              }
                                            >
                                              <Icon className="material-symbols-outlined text-[16px]">
                                                {reg.hideFromOtherUsers ? 'visibility_off' : 'visibility'}
                                              </Icon>
                                              <span>{reg.hideFromOtherUsers ? (isAmharic ? 'ግልፅ አድርግ' : 'Unhide') : (isAmharic ? 'ደብቅ' : 'Hide')}</span>
                                            </button>
                                          );
                                        })()}

                                        {/* 7. Permanent Delete */}
                                        {isTaskAllowed(userRole, 11) && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              if (window.confirm(isAmharic ? 'ይህንን ምዝገባ በቋሚነት መሰረዝ ይፈልጋሉ?' : 'Are you sure you want to permanently delete this registration?')) {
                                                await deleteRegistrationFromDb(reg.id);
                                              }
                                            }}
                                            className="px-3 py-1.5 bg-[#FB5454]/10 hover:bg-[#FB5454] hover:text-white text-[#FB5454] border border-[#FB5454]/20 font-medium text-xs rounded-sm transition-colors cursor-pointer flex items-center gap-1.5"
                                            title={isAmharic ? 'ምዝገባውን ሰርዝ' : 'Delete Registration'}
                                          >
                                            <Icon className="material-symbols-outlined text-[16px]">delete</Icon>
                                            <span>{isAmharic ? 'አጥፋ' : 'Delete'}</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Attached Documents Gallery */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                          <Icon className="material-symbols-outlined text-[16px] text-yellow-600 dark:text-yellow-400">photo_library</Icon>
                                          <span>{isAmharic ? 'የተያያዙ ሰነዶች (ለማጉላት ተጫን):' : 'Attached Documents (Click to Zoom):'}</span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedRegForDetails(reg)}
                                          className="text-xs font-semibold text-[#3C50E0] hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>{isAmharic ? 'ሙሉ ማህደር በዝርዝር እይ' : 'Inspect Full Record'}</span>
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
                {/* Mobile Select All Header Bar */}
                {filteredRegistrations.length > 0 && (
                  <div className="p-3 bg-[#F7F9FC] dark:bg-[#24303F]/80 border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1C2434] dark:text-white cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={toggleSelectAllPage}
                        className="w-4 h-4 rounded-xs border-[#E2E8F0] dark:border-[#2E3A47] text-[#3C50E0] focus:ring-[#3C50E0] cursor-pointer"
                      />
                      <span>{isAmharic ? 'ሁሉንም አባላት ምረጥ (Select All)' : 'Select All Members'}</span>
                    </label>
                    {selectedRegIds.size > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3C50E0] text-white shadow-2xs">
                        {isAmharic ? `${selectedRegIds.size} ተመርጠዋል` : `${selectedRegIds.size} selected`}
                      </span>
                    )}
                  </div>
                )}

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
                    const isCardSelected = selectedRegIds.has(reg.id);
                    return (
                      <div
                        key={reg.id}
                        className={`p-3.5 sm:p-4 transition-colors ${
                          isCardSelected
                            ? 'bg-[#3C50E0]/8 dark:bg-[#3C50E0]/15'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Unexpanded Record Header - Redesigned Style */}
                        <div
                          className="flex items-center justify-between gap-3 cursor-pointer select-none p-1"
                          onClick={() => toggleRegExpand(reg.id)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Checkbox for selection */}
                            <input
                              type="checkbox"
                              checked={isCardSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelectRow(reg.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded-xs border-[#E2E8F0] dark:border-[#2E3A47] text-[#3C50E0] focus:ring-[#3C50E0] cursor-pointer shrink-0"
                              title={isAmharic ? 'አባል ምረጥ' : 'Select member'}
                            />

                            {/* Status-Bordered Rectangular Avatar */}
                            <div className={`w-12 h-14 rounded-md border-2 ${getStatusBorderClass(reg.status, reg)} bg-slate-100 dark:bg-slate-800 p-0.5 shadow-2xs shrink-0 overflow-hidden flex items-center justify-center`}>
                              {(reg.userPortraitThumbnail || reg.userPortraitPhoto || reg.ownerPhoto) ? (
                                <img
                                  src={reg.userPortraitThumbnail || reg.userPortraitPhoto || reg.ownerPhoto}
                                  alt={getDisplayName(reg)}
                                  className="w-full h-full object-cover rounded-xs"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                                />
                              ) : (
                                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain p-0.5 rounded-xs" />
                              )}
                            </div>

                            {/* Header Details */}
                            <div className="min-w-0 flex-1 space-y-1">
                              {/* Member Name */}
                              <h4 className="text-sm sm:text-base font-extrabold text-[#1C2434] dark:text-white leading-tight truncate">
                                {getDisplayName(reg)}
                              </h4>

                              <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                                {/* Motor Type Tag */}
                                {reg.vehicleCategory === 'electric' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                                    <Icon className="material-symbols-outlined text-[11px]">electric_bolt</Icon>
                                    <span>{isAmharic ? 'ኤሌክትሪክ' : 'Electric'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3C50E0]/15 text-[#3C50E0] border border-[#3C50E0]/30">
                                    <Icon className="material-symbols-outlined text-[11px]">local_gas_station</Icon>
                                    <span>{isAmharic ? 'የነዳጅ' : 'Gasoline'}</span>
                                  </span>
                                )}

                                {/* Badge ID Pill */}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F1F5F9] dark:bg-[#2E3A47] text-[#1C2434] dark:text-white text-[10px] sm:text-[11px] font-mono font-bold rounded-md tracking-wider border border-slate-200 dark:border-slate-700">
                                  <Icon className="material-symbols-outlined text-[12px] text-[#64748B] dark:text-[#8A99AD]">badge</Icon>
                                  <span>{reg.plateNumber || reg.id}</span>
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
                        <div className={`collapsible-grid ${isExpanded ? 'expanded' : ''}`}>
                          <div className="collapsible-grid-inner">
                            <div className="mt-3.5 pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
                              {/* Member Information List */}
                              <ExpandableMemberCard
                                showHeader={false}
                                isAmharic={isAmharic}
                                fields={[
                                  { label: isAmharic ? 'የአባል መለያ:' : 'Member ID:', value: reg.id },
                                  { label: isAmharic ? 'የሞተር አይነት:' : 'Motor Type:', value: reg.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric') : (isAmharic ? 'የነዳጅ' : 'Gasoline') },
                                  { label: isAmharic ? 'ክፍለ ከተማ:' : 'Sub-City:', value: reg.subCity || 'በላይ ዘለቀ ክፍለ ከተማ' },
                                  { label: isAmharic ? 'ስልክ ቁጥር:' : 'Phone Number:', value: getDisplayPhone(reg) },
                                  { label: isAmharic ? 'የሰሌዳ ቁጥር:' : 'Plate Number:', value: reg.plateNumber || '—' },
                                  { label: isAmharic ? 'የቻሲስ ቁጥር:' : 'Chassis Number:', value: getChassisDisplay(reg) },
                                  { label: isAmharic ? 'የተመዘገበበት ቀን:' : 'Registered Date:', value: reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—' }
                                ]}
                              />

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

                              {showHiddenControls && isSuperAdmin && (() => {
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

                              {(userRole === 'admin' || isSuperAdmin) && (
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
                                    className="px-3 py-1.5 bg-[#1e293b] text-yellow-400 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow-2xs"
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

                              {(userRole === 'admin' || isSuperAdmin) && reg.status === 'pending_approval' && (
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
                        </div>
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </div>
          )}

        {/* INTEGRATED PAGINATION CONTROLS FOOTER (TAILADMIN DESIGN) */}
        {filteredRegistrations.length > 0 && (
          <div className="bg-white dark:bg-[#1C2434] px-4 sm:px-6 py-4 flex flex-row items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#8A99AD] border-t border-[#E2E8F0] dark:border-[#2E3A47] shrink-0">
            {/* Left corner: Items per page selector */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-medium text-[#1C2434] dark:text-white">{isAmharic ? 'በአንድ ገጽ:' : 'Rows per page:'}</span>
              <select
                value={String(regPageSize)}
                onChange={(e) => {
                  setRegPageSize(Number(e.target.value));
                  setRegPage(1);
                }}
                className="py-1 px-2 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs focus:border-[#3C50E0] focus:outline-none cursor-pointer"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <span className="hidden sm:inline font-medium text-[#64748B] dark:text-[#8A99AD]">
                {isAmharic
                  ? `${regStartIndex + 1}-${Math.min(regStartIndex + regPageSize, totalRegs)} ከ ${totalRegs} መዝገቦች`
                  : `Showing ${regStartIndex + 1}–${Math.min(regStartIndex + regPageSize, totalRegs)} of ${totalRegs} entries`}
              </span>
            </div>

            {/* Right corner: TailAdmin pagination buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={activeRegPage <= 1}
                onClick={() => setRegPage(activeRegPage - 1)}
                className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Icon className="material-symbols-outlined text-[16px]">chevron_left</Icon>
                <span>{isAmharic ? 'ቀዳሚ' : 'Previous'}</span>
              </button>

              <span className="px-3 py-1.5 bg-[#3C50E0] text-white rounded-sm font-semibold font-mono text-xs shadow-xs">
                {activeRegPage} / {totalRegPages}
              </span>

              <button
                type="button"
                disabled={activeRegPage >= totalRegPages}
                onClick={() => setRegPage(activeRegPage + 1)}
                className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
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
                <div className="w-10 h-10 rounded-md bg-[#1e293b] text-yellow-400 flex items-center justify-center font-bold shadow-xs">
                  <Icon className="material-symbols-outlined text-[24px]">two_wheeler</Icon>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {isAmharic ? 'የተሟላ የሞተር ሳይክል ምዝገባ መረጃ' : 'Motorcycle Registration Record Details'}
                  </h3>
                  <p className="text-xs font-mono text-slate-500">
                    Record ID: <span className="font-bold text-[#1e293b] dark:text-yellow-400">{selectedRegForDetails.id}</span>
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
                  <DataField label={isAmharic ? 'ቻሲስ:' : 'Chasis:'} value={getChassisDisplay(selectedRegForDetails)} isMono />
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
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-bold ${compliance.badgeClass}`}>
                        <Icon className="material-symbols-outlined text-[13px]">
                          {compliance.status === 'active' ? 'check_circle' : compliance.status === 'expiring_soon' ? 'alarm' : 'cancel'}
                        </Icon>
                        <span>{isAmharic ? compliance.labelAm : compliance.labelEn}</span>
                      </span>

                      {(userRole as string) !== 'officer' && isTaskAllowed(userRole, 1) && (
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
                      <div className="space-y-3">
                        {/* Desktop & Tablet Table (TailAdmin Design) */}
                        <div className="hidden sm:block overflow-x-auto rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434]">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F7F9FC] dark:bg-[#24303F] text-xs font-semibold text-[#1C2434] dark:text-white uppercase border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                              <tr>
                                <th className="px-3 py-2.5">#</th>
                                <th className="px-3 py-2.5 font-medium">{isAmharic ? 'ደረሰኝ ቁጥር' : 'Receipt No'}</th>
                                <th className="px-3 py-2.5 font-medium">{isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}</th>
                                <th className="px-3 py-2.5 font-medium">{isAmharic ? 'የሚያበቃበት' : 'Valid Until'}</th>
                                <th className="px-3 py-2.5 font-medium">{isAmharic ? 'መጠን' : 'Amount'}</th>
                                <th className="px-3 py-2.5 font-medium">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                                <th className="px-3 py-2.5 font-medium">{isAmharic ? 'ሰነድ' : 'Slip'}</th>
                                {isSuperAdmin && <th className="px-3 py-2.5 text-center font-medium">{isAmharic ? 'አማራጮች' : 'Actions'}</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] font-medium text-xs">
                              {matchedReceipts.map((rc, idx) => {
                                const rcStatus = getPaymentReceiptStatus(rc.expirationDate);
                                return (
                                  <tr key={rc.id || idx} className="hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/50 transition-colors">
                                    <td className="px-3 py-2.5 font-mono text-[#64748B] dark:text-[#8A99AD]">{idx + 1}</td>
                                    <td className="px-3 py-2.5 font-mono font-medium text-[#3C50E0]">{rc.receiptNumber}</td>
                                    <td className="px-3 py-2.5 font-mono text-[#1C2434] dark:text-white">{formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}</td>
                                    <td className="px-3 py-2.5 font-mono text-[#1C2434] dark:text-white">{formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}</td>
                                    <td className="px-3 py-2.5 font-bold text-[#1C2434] dark:text-white">{rc.amount ? `${rc.amount} ETB` : '—'}</td>
                                    <td className="px-3 py-2.5">
                                      <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${
                                        rcStatus.status === 'active'
                                          ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20'
                                          : rcStatus.status === 'expiring_soon'
                                          ? 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                                          : 'bg-[#FB5454]/10 text-[#FB5454] border border-[#FB5454]/20'
                                      }`}>
                                        {rcStatus.status === 'active' ? (isAmharic ? 'ህጋዊ' : 'Active') : rcStatus.status === 'expiring_soon' ? (isAmharic ? 'ሊያልቅ' : 'Expiring') : (isAmharic ? 'ያለፈ' : 'Expired')}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {rc.receiptScreenshot ? (
                                        <button
                                          type="button"
                                          onClick={() => openDocumentCarousel(rc.receiptScreenshot!, selectedRegForDetails, `${selectedRegForDetails.fullName} — Receipt #${rc.receiptNumber}`)}
                                          className="text-[#3C50E0] hover:underline font-medium cursor-pointer flex items-center gap-0.5"
                                        >
                                          <Icon className="material-symbols-outlined text-[15px]">image</Icon>
                                          <span>{isAmharic ? 'እይ' : 'View'}</span>
                                        </button>
                                      ) : (
                                        <span className="text-[#64748B] dark:text-[#8A99AD] italic">—</span>
                                      )}
                                    </td>
                                    {isSuperAdmin && (
                                      <td className="px-3 py-2.5 text-center">
                                        <button
                                          type="button"
                                          onClick={() => rc.id && handleDeleteReceiptClick(rc.id)}
                                          className="text-[#FB5454] hover:bg-[#FB5454]/10 font-medium cursor-pointer inline-flex items-center gap-0.5 p-1 rounded-sm transition-colors"
                                          title={isAmharic ? 'ደረሰኝ ሰርዝ' : 'Delete Receipt'}
                                        >
                                          <Icon className="material-symbols-outlined text-[16px]">delete</Icon>
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Expandable Receipts View (Visible on mobile screens only) */}
                        <div className="sm:hidden space-y-2">
                          {matchedReceipts.map((rc, idx) => {
                            const rcStatus = getPaymentReceiptStatus(rc.expirationDate);
                            const isExpanded = !!expandedReceipts[rc.id || ''];
                            return (
                              <div
                                key={rc.id || idx}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden transition-all duration-150 shadow-2xs"
                              >
                                {/* Header (Always Visible, Clickable to Expand) */}
                                <div
                                  onClick={() => rc.id && toggleReceiptExpand(rc.id)}
                                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/20 select-none"
                                >
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                                      <span className="text-xs font-black text-slate-900 dark:text-white font-mono truncate">
                                        {rc.receiptNumber}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-bold text-slate-800 dark:text-slate-300">
                                      {rc.amount ? `${rc.amount} ETB` : '—'}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded ${
                                      rcStatus.status === 'active'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : rcStatus.status === 'expiring_soon'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    }`}>
                                      {rcStatus.status === 'active' ? (isAmharic ? 'ህጋዊ' : 'Active') : rcStatus.status === 'expiring_soon' ? (isAmharic ? 'ሊያልቅ' : 'Expiring') : (isAmharic ? 'ያለፈ' : 'Expired')}
                                    </span>
                                    <Icon className={`material-symbols-outlined text-slate-500 transition-transform duration-200 text-[18px] ${isExpanded ? 'rotate-180' : ''}`}>
                                      keyboard_arrow_down
                                    </Icon>
                                  </div>
                                </div>

                                {/* Expandable Details */}
                                <div className={`collapsible-grid ${isExpanded ? 'expanded' : ''}`}>
                                  <div className="collapsible-grid-inner">
                                    <div className="p-3 pt-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-[11px] space-y-2.5">
                                      <div className="grid grid-cols-2 gap-2 pt-2.5">
                                        <div>
                                          <span className="text-[9px] text-slate-400 font-extrabold uppercase block">{isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}</span>
                                          <span className="font-mono text-slate-800 dark:text-slate-200">{formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}</span>
                                        </div>
                                        <div>
                                          <span className="text-[9px] text-slate-400 font-extrabold uppercase block">{isAmharic ? 'የሚያበቃበት ቀን' : 'Valid Until'}</span>
                                          <span className="font-mono text-slate-800 dark:text-slate-200">{formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}</span>
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60">
                                        {rc.receiptScreenshot ? (
                                          <button
                                            type="button"
                                            onClick={() => openDocumentCarousel(rc.receiptScreenshot!, selectedRegForDetails, `${selectedRegForDetails.fullName} — Receipt #${rc.receiptNumber}`)}
                                            className="text-slate-700 hover:text-blue-800 dark:text-blue-400 font-black underline cursor-pointer flex items-center gap-1 py-1"
                                          >
                                            <Icon className="material-symbols-outlined text-[14px]">image</Icon>
                                            <span>{isAmharic ? 'ሰነድ እይ' : 'View Slip'}</span>
                                          </button>
                                        ) : (
                                          <span className="text-slate-400 italic">{isAmharic ? 'ምስል አልተያያዘም' : 'No Slip Screenshot'}</span>
                                        )}

                                        {isSuperAdmin && (
                                          <button
                                            type="button"
                                            onClick={() => rc.id && handleDeleteReceiptClick(rc.id)}
                                            className="text-rose-600 hover:text-rose-800 dark:text-rose-400 font-black cursor-pointer flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 px-2.5 py-1 rounded border border-rose-200/50 dark:border-rose-900/50 hover:bg-rose-100 transition-colors"
                                          >
                                            <Icon className="material-symbols-outlined text-[14px]">delete</Icon>
                                            <span>{isAmharic ? 'ሰርዝ' : 'Delete'}</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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

                {(userRole === 'admin' || isSuperAdmin) && (
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
                    <span>{isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር መታወቂያ' : 'Bahirdar Motorist Association ID'}</span>
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
                      className="px-3.5 py-2 bg-[#1e293b] hover:bg-[#071330] text-yellow-400 font-extrabold rounded-md text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
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

                {(userRole as string) !== 'officer' && isTaskAllowed(userRole, 1) && (
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
                    {renewalModalReg.fullName} • {renewalModalReg.plateNumber || getChassisDisplay(renewalModalReg)}
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
                  <span className="font-mono font-bold text-[#1e293b] dark:text-yellow-400 block truncate">{renewalModalReg.plateNumber || '—'}</span>
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
        onSaveSuccess={() => {
          setEditingRegistration(null);
        }}
      />

      {/* --- BULK APPROVE CONFIRMATION MODAL --- */}
      {showBulkApproveModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md max-w-lg w-full p-5 space-y-4 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#10B981]/15 text-[#10B981] flex items-center justify-center font-bold">
                  <Icon className="material-symbols-outlined text-[20px]">check_circle</Icon>
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-[#1C2434] dark:text-white">
                    {isAmharic ? 'የጅምላ ማፅደቅ ማረጋገጫ' : 'Confirm Bulk Approval'}
                  </h4>
                  <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD]">
                    {isAmharic
                      ? `ለተመረጡት ${selectedRegIds.size} አባላት ማፅደቅ እርግጠኛ ነዎት?`
                      : `Are you sure you want to approve ${selectedRegIds.size} selected member(s)?`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkApproveModal(false)}
                className="text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[18px]">close</Icon>
              </button>
            </div>

            {/* Selected preview list */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[#F7F9FC] dark:bg-[#24303F] rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] text-xs divide-y divide-slate-200 dark:divide-slate-700">
              {selectedRegsList.map((reg, idx) => (
                <div key={reg.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-[#1C2434] dark:text-white truncate block">
                      {idx + 1}. {getDisplayName(reg)}
                    </span>
                    <span className="text-[11px] text-[#64748B] dark:text-[#8A99AD]">
                      {getDisplayPhone(reg)} • {reg.subCity || '—'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] text-[#1C2434] dark:text-white shrink-0">
                    {reg.plateNumber || getChassisDisplay(reg) || reg.id}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkApproveModal(false)}
                disabled={isSubmittingBulk}
                className="px-3.5 py-1.5 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] text-xs font-semibold text-[#64748B] dark:text-[#8A99AD] hover:bg-[#F7F9FC] dark:hover:bg-[#2E3A47] cursor-pointer"
              >
                {isAmharic ? 'ተመለስ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeBulkApprove}
                disabled={isSubmittingBulk}
                className="px-4 py-1.5 rounded-md bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingBulk ? (
                  <Icon className="material-symbols-outlined text-[16px] animate-spin">refresh</Icon>
                ) : (
                  <Icon className="material-symbols-outlined text-[16px]">check_circle</Icon>
                )}
                <span>
                  {isAmharic
                    ? `አጽድቅ (${selectedRegIds.size})`
                    : `Confirm Approve (${selectedRegIds.size})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BULK DELETE CONFIRMATION MODAL --- */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C2434] border border-[#FB5454]/30 rounded-md max-w-lg w-full p-5 space-y-4 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#FB5454]/15 text-[#FB5454] flex items-center justify-center font-bold">
                  <Icon className="material-symbols-outlined text-[20px]">warning</Icon>
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-[#1C2434] dark:text-white">
                    {isAmharic ? 'የጅምላ መሰረዝ ማረጋገጫ' : 'Confirm Bulk Deletion'}
                  </h4>
                  <p className="text-[11px] text-[#FB5454] font-medium">
                    {isAmharic
                      ? `ማስጠንቀቂያ! የተመረጡትን ${selectedRegIds.size} አባላት በቋሚነት ለመሰረዝ እርግጠኛ ነዎት?`
                      : `Warning! Are you sure you want to permanently delete ${selectedRegIds.size} selected member(s)?`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[18px]">close</Icon>
              </button>
            </div>

            <p className="text-xs text-[#64748B] dark:text-[#8A99AD] leading-relaxed">
              {isAmharic
                ? 'ይህ እርምጃ መረጃዎችን ከመረጃ ቋቱ (Database) ሙሉ በሙሉ የሚያጠፋ ሲሆን ወደ ኋላ መመለስ አይቻልም።'
                : 'This action will permanently remove all selected registrations from the database and cannot be undone.'}
            </p>

            {/* Selected preview list */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[#FB5454]/5 rounded-md border border-[#FB5454]/20 text-xs divide-y divide-slate-200 dark:divide-slate-700">
              {selectedRegsList.map((reg, idx) => (
                <div key={reg.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-[#1C2434] dark:text-white truncate block">
                      {idx + 1}. {getDisplayName(reg)}
                    </span>
                    <span className="text-[11px] text-[#64748B] dark:text-[#8A99AD]">
                      {getDisplayPhone(reg)} • {reg.subCity || '—'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm bg-white dark:bg-[#1C2434] border border-[#FB5454]/30 text-[#FB5454] shrink-0">
                    {reg.plateNumber || getChassisDisplay(reg) || reg.id}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isSubmittingBulk}
                className="px-3.5 py-1.5 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] text-xs font-semibold text-[#64748B] dark:text-[#8A99AD] hover:bg-[#F7F9FC] dark:hover:bg-[#2E3A47] cursor-pointer"
              >
                {isAmharic ? 'ተመለስ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeBulkDelete}
                disabled={isSubmittingBulk}
                className="px-4 py-1.5 rounded-md bg-[#FB5454] hover:bg-[#D34040] text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingBulk ? (
                  <Icon className="material-symbols-outlined text-[16px] animate-spin">refresh</Icon>
                ) : (
                  <Icon className="material-symbols-outlined text-[16px]">delete_forever</Icon>
                )}
                <span>
                  {isAmharic
                    ? `በቋሚነት ሰርዝ (${selectedRegIds.size})`
                    : `Delete Permanently (${selectedRegIds.size})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BULK PRINT ROSTER MODAL --- */}
      {showBulkPrintRosterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between bg-[#F7F9FC] dark:bg-[#24303F]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#3C50E0] text-white flex items-center justify-center">
                  <Icon className="material-symbols-outlined text-[18px]">print</Icon>
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#1C2434] dark:text-white">
                    {isAmharic ? 'የተመረጡ አባላት ዝርዝር ማህደር' : 'Selected Members Roster'}
                  </h3>
                  <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD]">
                    {isAmharic ? `ጠቅላላ የተመረጡ: ${selectedRegsList.length} አባላት` : `Total Selected: ${selectedRegsList.length} member(s)`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-3.5 py-1.5 bg-[#3C50E0] hover:bg-[#3C50E0]/90 text-white font-bold text-xs rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Icon className="material-symbols-outlined text-[16px]">print</Icon>
                  <span>{isAmharic ? 'ወዲያውኑ አትም' : 'Print Now'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkPrintRosterModal(false)}
                  className="p-1.5 rounded-md hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
                >
                  <Icon className="material-symbols-outlined text-[20px]">close</Icon>
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-white text-[#1C2434]">
              {/* Official Document Header */}
              <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" />
                </div>
                <h4 className="font-extrabold text-xs tracking-wider text-slate-800 uppercase">
                  {isAmharic ? 'የአማራ ብሔራዊ ክልላዊ መንግሥት የባህር ዳር ከተማ አስተዳደር' : 'Amhara National Regional State Bahir Dar City Administration'}
                </h4>
                <h3 className="font-black text-sm tracking-wide text-slate-900 uppercase">
                  {isAmharic ? 'የትራንስፖርትና ደንብ ማስከበር መምሪያ' : 'Transport & Enforcement Department'}
                </h3>
                <h2 className="font-extrabold text-base text-blue-900 uppercase">
                  {isAmharic ? 'የባህር ዳር ሞተር አሽከርካሪዎች ማህበር — የአባላት ማህደር ሪፖርት' : 'Bahir Dar Motorist Association — Members Registry Report'}
                </h2>
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono pt-2 border-t border-slate-300 mt-2">
                  <span>{isAmharic ? 'ቀን:' : 'Date:'} {formatEthiopianDate(new Date().toISOString().split('T')[0], isAmharic ? 'am' : 'en')}</span>
                  <span>{isAmharic ? 'ጠቅላላ የተመረጡ አባላት:' : 'Total Members:'} <strong>{selectedRegsList.length}</strong></span>
                  <span>{isAmharic ? 'የተዘጋጀው በ:' : 'Generated By:'} {userRole.toUpperCase()} ({userBadgeId || 'ADMIN'})</span>
                </div>
              </div>

              {/* Table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border border-slate-400">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 border-b border-slate-400 font-bold text-[11px]">
                      <th className="p-2 border-r border-slate-300 text-center w-10">#</th>
                      <th className="p-2 border-r border-slate-300">{isAmharic ? 'የባለቤት ስም' : 'Owner Name'}</th>
                      <th className="p-2 border-r border-slate-300">{isAmharic ? 'ስልክ ቁጥር' : 'Phone'}</th>
                      <th className="p-2 border-r border-slate-300">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate No'}</th>
                      <th className="p-2 border-r border-slate-300">{isAmharic ? 'ቻሲስ ቁጥር' : 'Chassis No'}</th>
                      <th className="p-2 border-r border-slate-300">{isAmharic ? 'አይነት' : 'Category'}</th>
                      <th className="p-2 border-r border-slate-300">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                      <th className="p-2 border-r border-slate-300 text-center">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                      <th className="p-2 text-center">{isAmharic ? 'የምዝገባ ቀን' : 'Reg Date'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {selectedRegsList.map((reg, idx) => (
                      <tr key={reg.id} className="hover:bg-slate-50">
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-300 font-bold">{getDisplayName(reg)}</td>
                        <td className="p-2 border-r border-slate-300 font-mono">{getDisplayPhone(reg)}</td>
                        <td className="p-2 border-r border-slate-300 font-mono font-bold">{reg.plateNumber || '—'}</td>
                        <td className="p-2 border-r border-slate-300 font-mono text-[10px]">{getChassisDisplay(reg)}</td>
                        <td className="p-2 border-r border-slate-300">
                          {reg.vehicleCategory === 'electric' ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric') : (isAmharic ? 'የነዳጅ' : 'Gasoline')}
                        </td>
                        <td className="p-2 border-r border-slate-300">{reg.subCity || '—'}</td>
                        <td className="p-2 border-r border-slate-300 text-center">
                          {reg.status === 'approved' || reg.status === 'printed' ? (isAmharic ? 'የፀደቀ' : 'Approved') : (isAmharic ? 'የሚጠበቅ' : 'Pending')}
                        </td>
                        <td className="p-2 text-center font-mono text-[10px]">
                          {reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures Footer */}
              <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs text-slate-700">
                <div>
                  <p className="font-bold">{isAmharic ? 'ያዘጋጀው ባለሙያ ፊርማ:' : 'Prepared By Signature:'}</p>
                  <div className="mt-6 border-b border-slate-400 w-48"></div>
                  <p className="text-[10px] text-slate-500 mt-1">{isAmharic ? 'ስም እና ማህተም' : 'Name & Stamp'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{isAmharic ? 'ያረጋገጠው ኃላፊ ፊርማ:' : 'Approved By Head Signature:'}</p>
                  <div className="mt-6 border-b border-slate-400 w-48 ml-auto"></div>
                  <p className="text-[10px] text-slate-500 mt-1">{isAmharic ? 'ስም እና የቢሮ ማህተም' : 'Name & Official Stamp'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
