import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { KpiCard, MonthlyMatrixLedger, StatusDot, StatusBadge, MatrixRowItem, MetricStatCard, MetricGrid } from './ui/AssocDesignSystem';
import { Language, UserRole, MotorcycleRegistration, PaymentReceipt, TermStatus } from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus, calculateTermStatus } from '../utils/paymentUtils';
import { SmartImage } from './SmartImage';
import {
  getPermissionState,
  savePaymentReceiptToDb,
  deletePaymentReceiptFromDb,
  ServerMonthlyFeeStatistics,
  getCachedServerMonthlyFeeStatistics,
  subscribeMonthlyFeeStatistics,
  fetchMembershipFeeDirectory,
  fetchMonthlyFeeStatisticsServerSide,
} from '../services/dbService';
import { formatEthiopianDate, formatEthiopianDateTime, toEthiopianDate, ethiopianToGregorian, ETHIOPIAN_MONTHS, EthiopianDate, getDefaultEthiopianRegistrationDate, getTodayEthiopianDateTimeIso, normalizeToEthiopianDateStr } from '../utils/ethiopianCalendar';
import { LoadingSpinner, TableSkeleton } from './ui/Skeleton';
import { EthiopianDateRangePicker, DateRangePreset, computeEthiopianPresetRange } from './EthiopianDateRangePicker';
import { EthiopianDatePickerPopover } from './ui/EthiopianDatePickerPopover';

interface PaymentReceiptsPageProps {
  userBadgeId: string;
  userRole: UserRole;
  lang: Language;
  registrations: MotorcycleRegistration[];
  paymentReceipts: PaymentReceipt[];
  initialFilter?: 'all' | 'active' | 'expiring_soon' | 'expired';
  onSaveReceipt?: (receipt: PaymentReceipt) => Promise<void>;
  onAddPaymentReceipt?: (receipt: PaymentReceipt) => Promise<void>;
  onDeleteReceipt?: (id: string) => Promise<void>;
  onDeletePaymentReceipt?: (id: string) => Promise<void>;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isLoading?: boolean;
}

export const PaymentReceiptsPage: React.FC<PaymentReceiptsPageProps> = ({
  userBadgeId,
  userRole,
  lang,
  registrations,
  paymentReceipts,
  initialFilter = 'all',
  onSaveReceipt,
  onAddPaymentReceipt,
  onDeleteReceipt,
  onDeletePaymentReceipt,
  onShowToast,
  isLoading = false,
}) => {
  const isAmharic = lang === 'am';
  const monthNamesAm = ['ጥር (Jan)', 'የካቲት (Feb)', 'መጋቢት (Mar)', 'ሚያዝያ (Apr)', 'ግንቦት (May)', 'ሰኔ (Jun)', 'ሐምሌ (Jul)', 'ነሐሴ (Aug)', 'መስከረም (Sep)', 'ጥቅምት (Oct)', 'ህዳር (Nov)', 'ታህሳስ (Dec)'];
  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Granular RBAC Permission checks for Entry Form (Task 10), Financial KPIs (Task 17), and Table (Task 16)
  const entryFormPermission = getPermissionState(userRole, 10);
  const canAddReceipt = entryFormPermission !== 'deny';
  const isFormReadOnly = entryFormPermission === 'view_only';
  const canViewKPIs = getPermissionState(userRole, 17) !== 'deny';
  const canViewTable = getPermissionState(userRole, 16) !== 'deny';

  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';

  // Association motors / company vehicles are strictly hidden from non-superadmins in metrics and matrix lists
  const effectiveRegistrations = useMemo(() => {
    if (isSuperAdmin) return registrations || [];
    return (registrations || []).filter((r) => !r.hideFromOtherUsers);
  }, [registrations, isSuperAdmin]);

  const effectivePaymentReceipts = useMemo(() => {
    if (isSuperAdmin) return paymentReceipts || [];
    const hiddenRegIds = new Set(
      (registrations || []).filter((r) => r.hideFromOtherUsers).map((r) => (r.id || '').trim().toLowerCase())
    );
    const hiddenPlates = new Set(
      (registrations || []).filter((r) => r.hideFromOtherUsers).map((r) => (r.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase()).filter(Boolean)
    );
    return (paymentReceipts || []).filter((rc) => {
      const regId = (rc.ownerRegistrationId || '').trim().toLowerCase();
      const plate = (rc.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase();
      if (regId && hiddenRegIds.has(regId)) return false;
      if (plate && hiddenPlates.has(plate)) return false;
      return true;
    });
  }, [paymentReceipts, registrations, isSuperAdmin]);

  // Toggle state for new receipt entry form (Default to OPEN for clerk role when permitted)
  const [isFormOpen, setIsFormOpen] = useState(() => userRole === 'clerk' && canAddReceipt);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Form Fields
  const [receiptNumber, setReceiptNumber] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [selectedRegId, setSelectedRegId] = useState<string>('');
  const [ownerName, setOwnerName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(
    () => getDefaultEthiopianRegistrationDate()
  );
  const [amount, setAmount] = useState<string>('500');
  const [receiptScreenshot, setReceiptScreenshot] = useState<string>('');
  const [notes, setNotes] = useState('');

  // In-form Cheki Verifier State
  const [formChekiBank, setFormChekiBank] = useState('');
  const [formChekiLoading, setFormChekiLoading] = useState(false);
  const [formChekiResult, setFormChekiResult] = useState<any>(null);
  const [formChekiError, setFormChekiError] = useState('');
  const [isReceiptChekiVerified, setIsReceiptChekiVerified] = useState(false);
  const [chekiVerifiedBankName, setChekiVerifiedBankName] = useState('');

  // Member Full Information Drawer State
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{
    row: MatrixRowItem;
    member: MotorcycleRegistration | null;
    receipts: PaymentReceipt[];
  } | null>(null);
  const [previewDocPhoto, setPreviewDocPhoto] = useState<{ url: string; title: string } | null>(null);
  const [reconcileVerifyInput, setReconcileVerifyInput] = useState('');
  const [reconcileVerifyStatus, setReconcileVerifyStatus] = useState<'idle' | 'matched' | 'mismatch'>('idle');
  const [reconcileCopiedField, setReconcileCopiedField] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<PaymentReceipt | null>(null);
  const [editFormAmount, setEditFormAmount] = useState('');
  const [editFormNotes, setEditFormNotes] = useState('');
  const [editFormPaymentDate, setEditFormPaymentDate] = useState('');
  const [editFormExpDate, setEditFormExpDate] = useState('');

  // Server-Side Monthly Fee Statistics for instant zero-lag rendering
  const [serverFeeStats, setServerFeeStats] = useState<ServerMonthlyFeeStatistics | null>(getCachedServerMonthlyFeeStatistics());
  React.useEffect(() => {
    const unsub = subscribeMonthlyFeeStatistics((data) => {
      if (data) setServerFeeStats(data);
    });
    return () => unsub();
  }, []);

  const handleVerifyReceiptInForm = async () => {
    const ref = receiptNumber.trim();
    if (!ref) {
      setFormChekiError(
        isAmharic
          ? 'እባክዎን መጀመሪያ የደረሰኝ / ባንክ ማጣቀሻ ቁጥር ያስገቡ!'
          : 'Please enter a receipt or bank reference number first!'
      );
      return;
    }

    setFormChekiLoading(true);
    setFormChekiError('');
    setFormChekiResult(null);

    try {
      const res = await fetch('/api/verify-receipt-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: ref, // Assuming user inputs URL directly or we interpret it as URL
          bank: formChekiBank.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Verification failed');
      }
      setFormChekiResult(data);

      if (data.verified) {
        setIsReceiptChekiVerified(true);
        const bName = data.bank || data.bankName || (formChekiBank ? formChekiBank.toUpperCase() : 'Bank');
        setChekiVerifiedBankName(bName);

        if (data.amount !== undefined && data.amount !== null) {
          const numAmount = String(data.amount).replace(/[^0-9.]/g, '');
          if (numAmount) {
            setAmount(numAmount);
          }
        }

        if (data.date) {
          try {
            const dt = new Date(data.date);
            if (!isNaN(dt.getTime())) {
              setPaymentDate(dt.toISOString().split('T')[0]);
            }
          } catch {}
        }

        const tag = `[Cheki Verified: ${bName}, Ref: ${data.reference || ref}]`;
        setNotes((prev) => {
          if (!prev) return tag;
          if (prev.includes('Cheki Verified')) return prev;
          return `${prev} | ${tag}`;
        });
      } else {
        setIsReceiptChekiVerified(false);
        setChekiVerifiedBankName('');
      }
    } catch (err: any) {
      setFormChekiError(
        err?.message ||
          (isAmharic
            ? 'የቼኪ ማረጋገጫ አልተሳካም። እባክዎን የባንክ ማጣቀሻ ቁጥሩን ያረጋግጡ።'
            : 'Cheki verification failed. Please check the reference number or try another bank.')
      );
      setIsReceiptChekiVerified(false);
    } finally {
      setFormChekiLoading(false);
    }
  };

  // Calculate 1 month expiration date live from paymentDate state
  const calculatedExpirationDate = useMemo(() => {
    return calculateOneMonthExpiration(paymentDate);
  }, [paymentDate]);

  // Combine explicit payment receipts with all member registration records that have payment data
  const combinedReceipts = useMemo<PaymentReceipt[]>(() => {
    const cleanStr = (s?: string) => (s || '').trim().toLowerCase();
    const list: PaymentReceipt[] = [...(effectivePaymentReceipts || [])];
    const explicitRegIds = new Set(
      list.map((r) => cleanStr(r.ownerRegistrationId)).filter(Boolean)
    );
    const existingReceiptNos = new Set(
      list.map((r) => cleanStr(r.receiptNumber)).filter(Boolean)
    );

    if (Array.isArray(effectiveRegistrations)) {
      effectiveRegistrations.forEach((reg) => {
        if (!reg || !reg.id) return;
        const regIdClean = cleanStr(reg.id);
        if (explicitRegIds.has(regIdClean)) return;

        const hasPayment = Boolean(
          reg.receiptNumber ||
          reg.lastReceiptNumber ||
          reg.lastPaymentDate ||
          reg.paymentAmount ||
          reg.lastPaymentAmount ||
          reg.receiptScreenshot ||
          reg.activeTermExpirationDate ||
          reg.termStatus === 'CURRENT' ||
          reg.status === 'approved' ||
          reg.status === 'printed' ||
          reg.status === 'ordered_print'
        );
        if (!hasPayment) return;

        let rcNum = cleanStr(reg.lastReceiptNumber || reg.receiptNumber);
        if (!rcNum || existingReceiptNos.has(rcNum)) {
          rcNum = `REC-${reg.id}`;
        }
        existingReceiptNos.add(rcNum);

        const rawPayDate = reg.lastPaymentDate || reg.registrationDate || getDefaultEthiopianRegistrationDate();
        const payDate = normalizeToEthiopianDateStr(rawPayDate);
        const expDate = reg.activeTermExpirationDate
          ? normalizeToEthiopianDateStr(reg.activeTermExpirationDate)
          : calculateOneMonthExpiration(payDate);

        list.push({
          id: `reg-receipt-${reg.id}`,
          receiptNumber: reg.lastReceiptNumber || reg.receiptNumber || `REC-${reg.id}`,
          ownerRegistrationId: reg.id,
          ownerName: reg.fullName || '',
          plateNumber: reg.plateNumber,
          phone: reg.phone,
          paymentDate: payDate,
          expirationDate: expDate,
          amount: reg.lastPaymentAmount || reg.paymentAmount || (reg.vehicleCategory === 'electric' ? '50 ETB' : '100 ETB'),
          vehicleCategory: reg.vehicleCategory,
          receiptScreenshot: reg.receiptScreenshot,
          enteredBy: reg.registeredBy || 'SYSTEM',
          createdAt: (reg as any).createdAt || `${payDate} 08:00:00`,
          status: 'valid',
          verifiedByCheki: true,
          chekiBank: 'CBE',
          notes: reg.plateNumber ? `Plate: ${reg.plateNumber}` : undefined,
        });
      });
    }

    return list;
  }, [effectivePaymentReceipts, effectiveRegistrations]);

  // Auto-calculated registration details, last payment expiration status, and debt
  const selectedRegInfo = useMemo(() => {
    const val = regNumber.trim().toLowerCase();
    if (!val) return null;

    const found = effectiveRegistrations.find(
      (r) =>
        r.id.toLowerCase() === val ||
        (r.plateNumber && r.plateNumber.toLowerCase() === val) ||
        (r.engineOrSerialNo && r.engineOrSerialNo.toLowerCase() === val) ||
        r.fullName.toLowerCase() === val
    );

    if (!found) return null;

    const prevReceipts = combinedReceipts.filter(
      (rc) =>
        (rc.ownerRegistrationId && rc.ownerRegistrationId === found.id) ||
        (rc.plateNumber && found.plateNumber && rc.plateNumber.toLowerCase() === found.plateNumber.toLowerCase()) ||
        rc.ownerName.toLowerCase() === found.fullName.toLowerCase()
    );

    const sortedReceipts = [...prevReceipts].sort((a, b) => {
      return new Date(b.expirationDate).getTime() - new Date(a.expirationDate).getTime();
    });

    const latestReceipt = sortedReceipts[0] || null;

    let expirationStatusType: 'active' | 'expiring_soon' | 'expired' | 'none' = 'none';
    let daysRemaining = 0;
    let unpaidDebtAmount = 0;
    let overdueMonths = 0;

    if (latestReceipt && latestReceipt.expirationDate) {
      const statusInfo = getPaymentReceiptStatus(latestReceipt.expirationDate);
      expirationStatusType = statusInfo.status;
      daysRemaining = statusInfo.daysRemaining;

      if (statusInfo.status === 'expired') {
        const daysOverdue = Math.abs(daysRemaining);
        overdueMonths = Math.max(1, Math.ceil(daysOverdue / 30));
        unpaidDebtAmount = overdueMonths * 500;
      } else {
        unpaidDebtAmount = 0;
      }
    } else {
      expirationStatusType = 'none';
      unpaidDebtAmount = 500;
    }

    const termStatus: TermStatus = found.termStatus || (
      latestReceipt?.expirationDate ? calculateTermStatus(latestReceipt.expirationDate) : 'DELINQUENT'
    );

    return {
      registration: found,
      latestReceipt,
      expirationStatusType,
      termStatus,
      daysRemaining,
      unpaidDebtAmount,
      overdueMonths,
    };
  }, [regNumber, registrations, combinedReceipts]);

  // Filter & Search state for table
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring_soon' | 'expired'>(
    initialFilter
  );

  // Server-Side Paginated Membership Fee Directory State (Default 10 records per request)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverRows, setServerRows] = useState<MatrixRowItem[] | null>(null);
  const [serverPagination, setServerPagination] = useState<{
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  } | null>(null);
  const [isFetchingRows, setIsFetchingRows] = useState(false);

  // Top-level View Tab: 'table' vs 'metrics' (Separating metrics and table into dedicated tabs)
  const [activeMainTab, setActiveMainTab] = useState<'table' | 'metrics'>('table');

  const currentTab = useMemo(() => {
    if (canViewTable && !canViewKPIs) return 'table';
    if (!canViewTable && canViewKPIs) return 'metrics';
    return activeMainTab;
  }, [canViewTable, canViewKPIs, activeMainTab]);

  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('this_month');
  const [startDate, setStartDate] = useState<string>(() => computeEthiopianPresetRange('this_month').start);
  const [endDate, setEndDate] = useState<string>(() => computeEthiopianPresetRange('this_month').end);

  const handleSelectPreset = (preset: DateRangePreset) => {
    setDateRangePreset(preset);
    if (preset !== 'custom') {
      const range = computeEthiopianPresetRange(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  const matchesDateFilter = (rc: PaymentReceipt) => {
    if (dateRangePreset === 'all') return true;

    const rawPayDate = rc.paymentDate || rc.createdAt || '';
    if (!rawPayDate) return true;
    const ethPayDateStr = normalizeToEthiopianDateStr(rawPayDate);
    if (!ethPayDateStr) return true;

    // 1. Direct match with selected date range (both in Ethiopian YYYY-MM-DD)
    if (startDate && endDate) {
      const normStart = normalizeToEthiopianDateStr(startDate);
      const normEnd = normalizeToEthiopianDateStr(endDate);
      if (ethPayDateStr >= normStart && ethPayDateStr <= normEnd) return true;
    } else if (startDate && !endDate) {
      const normStart = normalizeToEthiopianDateStr(startDate);
      if (ethPayDateStr >= normStart) return true;
    } else if (!startDate && endDate) {
      const normEnd = normalizeToEthiopianDateStr(endDate);
      if (ethPayDateStr <= normEnd) return true;
    }

    // 2. Preset 'this_month': Ensure payments in current Ethiopian month OR active term covering this month match
    if (dateRangePreset === 'this_month') {
      const ethNow = toEthiopianDate(new Date());
      const [pYear, pMonth] = ethPayDateStr.split('-').map(Number);
      if (pYear === ethNow.year && pMonth === ethNow.month) {
        return true;
      }

      // Active term coverage: if payment actively covers this Ethiopian month
      const expDateStr = (rc.expirationDate || '').split('T')[0].split(' ')[0].trim();
      if (expDateStr) {
        const { status } = getPaymentReceiptStatus(expDateStr);
        if (status === 'active' || status === 'expiring_soon') {
          return true;
        }
      }
    }

    // 3. Preset 'this_year': Ensure payments in current Ethiopian year match
    if (dateRangePreset === 'this_year') {
      const ethNow = toEthiopianDate(new Date());
      const pYear = Number(ethPayDateStr.split('-')[0]);
      if (pYear === ethNow.year) {
        return true;
      }
    }

    return false;
  };

  // Handle typing or selecting Registration Number
  const handleRegNumberChange = (value: string) => {
    setRegNumber(value);
    const val = value.trim().toLowerCase();

    if (!val) {
      setSelectedRegId('');
      setOwnerName('');
      setPlateNumber('');
      setPhone('');
      setIsAutoFilled(false);
      return;
    }

    const found = registrations.find(
      (r) =>
        r.id.toLowerCase() === val ||
        (r.plateNumber && r.plateNumber.toLowerCase() === val) ||
        (r.engineOrSerialNo && r.engineOrSerialNo.toLowerCase() === val) ||
        r.fullName.toLowerCase() === val
    );

    if (found) {
      setSelectedRegId(found.id);
      setOwnerName(found.fullName || '');
      setPlateNumber(found.plateNumber || '');
      setPhone(found.phone || '');
      setIsAutoFilled(true);
    } else {
      setSelectedRegId('');
      setIsAutoFilled(false);
    }
  };

  // Image screenshot file upload handler
  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      if (onShowToast) {
        onShowToast(
          isAmharic
            ? 'የምስሉ መጠን ከ 8MB መብለጥ የለበትም።'
            : 'File size exceeds 8MB. Please choose a smaller image.',
          'error'
        );
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit payment receipt entry form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (isFormReadOnly || !canAddReceipt) {
      setSubmitError(
        isAmharic
          ? 'ተነባቢ ብቻ ሁነታ፡ አዲስ የክፍያ ደረሰኝ መመዝገብ በእርስዎ ሚና አይፈቀድም።'
          : 'Read-only mode: Submitting new payment receipts is restricted for your role.'
      );
      return;
    }

    if (!receiptNumber.trim()) {
      setSubmitError(isAmharic ? 'የደረሰኝ ቁጥር መሞላት አለበት!' : 'Receipt number is required!');
      return;
    }

    if (!ownerName.trim()) {
      setSubmitError(isAmharic ? 'የባለቤት ስም መሞላት አለበት!' : 'Owner name is required!');
      return;
    }

    if (!paymentDate) {
      setSubmitError(isAmharic ? 'የተከፈለበት ቀን መመረጥ አለበት!' : 'Payment date is required!');
      return;
    }

    if (selectedRegInfo && selectedRegInfo.expirationStatusType === 'active') {
      setSubmitError(
        isAmharic
          ? `የዚህ ባለቤት ክፍያ በንቃት ላይ ይገኛል (ቀሪ ቀን፦ ${selectedRegInfo.daysRemaining})። ክፍያው ሳያልቅ ድጋሚ መክፈል አይፈቀድም።`
          : `This owner's payment term is still active (${selectedRegInfo.daysRemaining} days remaining). Renewal is only allowed when due or expired.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const expirationDate = calculateOneMonthExpiration(paymentDate);

      const newReceipt: PaymentReceipt = {
        id: `RECEIPT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        receiptNumber: receiptNumber.trim(),
        ownerRegistrationId: selectedRegId || undefined,
        ownerName: ownerName.trim(),
        plateNumber: plateNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        paymentDate,
        expirationDate,
        amount: amount.trim() ? `${amount.trim()} ETB` : '500 ETB',
        receiptScreenshot: receiptScreenshot || undefined,
        enteredBy: userBadgeId,
        createdAt: getTodayEthiopianDateTimeIso(),
        enteredAt: getTodayEthiopianDateTimeIso(),
        verifiedByCheki: isReceiptChekiVerified,
        chekiBank: isReceiptChekiVerified ? (chekiVerifiedBankName || formChekiBank || 'Bank') : undefined,
        notes: notes.trim() || undefined,
      };

      if (onAddPaymentReceipt) {
        await onAddPaymentReceipt(newReceipt);
      } else if (onSaveReceipt) {
        await onSaveReceipt(newReceipt);
      } else {
        await savePaymentReceiptToDb(newReceipt);
        if (onShowToast) {
          onShowToast(
            isAmharic
              ? `የደረሰኝ #${newReceipt.receiptNumber} ምዝገባ ተጠናቋል`
              : `Receipt #${newReceipt.receiptNumber} recorded successfully`,
            'success'
          );
        }
      }

      setSubmitSuccess(
        isAmharic
          ? 'የክፍያ ደረሰኙ በተሳካ ሁኔታ ተመዝግቧል! የ1 ወር ማብቂያ ቀን በራስ-ሰር ተሰልቷል።'
          : 'Payment receipt saved successfully! 1-Month expiration computed.'
      );

      // Reset form fields
      setReceiptNumber('');
      setRegNumber('');
      setSelectedRegId('');
      setOwnerName('');
      setPlateNumber('');
      setPhone('');
      setIsAutoFilled(false);
      setReceiptScreenshot('');
      setNotes('');
      setFormChekiResult(null);
      setIsReceiptChekiVerified(false);
      setChekiVerifiedBankName('');
      setFormChekiError('');

      if (userRole !== 'clerk') {
        setIsFormOpen(false);
      }
    } catch (err: any) {
      console.error('Error saving payment receipt:', err);
      setSubmitError(
        err?.message ||
          (isAmharic
            ? 'ደረሰኙን በመመዝገብ ላይ ስህተት አጋጥሟል። እባክዎን ደግመው ይሞክሩ።'
            : 'Failed to save receipt. Please try again.')
      );
      if (onShowToast) {
        onShowToast(
          isAmharic ? 'ደረሰኝ መመዝገብ አልተሳካም' : 'Failed to save payment receipt',
          'error'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Receipt Handler
  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmId) return;

    try {
      if (onDeletePaymentReceipt) {
        await onDeletePaymentReceipt(deleteConfirmId);
      } else if (onDeleteReceipt) {
        await onDeleteReceipt(deleteConfirmId);
      } else {
        await deletePaymentReceiptFromDb(deleteConfirmId);
        if (onShowToast) {
          onShowToast(
            isAmharic ? 'የክፍያ ደረሰኝ በተሳካ ሁኔታ ተሰርዟል' : 'Payment receipt deleted successfully',
            'info'
          );
        }
      }

      if (deleteConfirmId) {
        setSelectedMemberDetail((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            receipts: prev.receipts.filter((r) => r.id !== deleteConfirmId),
          };
        });
      }
    } catch (err) {
      console.error('Error deleting receipt:', err);
      if (onShowToast) {
        onShowToast(
          isAmharic ? 'ደረሰኙን መሰረዝ አልተሳካም' : 'Failed to delete payment receipt',
          'error'
        );
      }
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Reconcile Drawer Bank Matching comparator
  const handleRunReconcileComparison = (targetRef: string, inputVal: string) => {
    setReconcileVerifyInput(inputVal);
    const cleanTarget = targetRef.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const cleanInput = inputVal.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleanInput) {
      setReconcileVerifyStatus('idle');
    } else if (cleanTarget.includes(cleanInput) || cleanInput.includes(cleanTarget)) {
      setReconcileVerifyStatus('matched');
    } else {
      setReconcileVerifyStatus('mismatch');
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setReconcileCopiedField(fieldName);
    setTimeout(() => setReconcileCopiedField(null), 2000);
    if (onShowToast) {
      onShowToast(
        isAmharic ? `${fieldName} ወደ ክሊፕቦርድ ተቀድቷል` : `${fieldName} copied to clipboard`,
        'info'
      );
    }
  };

  const handlePrintReceipt = (rc: PaymentReceipt) => {
    if (!rc) return;
    const printWin = window.open('', '_blank');
    if (!printWin) {
      if (onShowToast) onShowToast(isAmharic ? 'የህትመት መስኮት መክፈት አልተቻለም' : 'Could not open print window', 'error');
      return;
    }
    const ethDate = formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en');
    const expEthDate = formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #${rc.receiptNumber}</title>
          <style>
            body { font-family: sans-serif; padding: 24px; max-width: 550px; margin: auto; background: #fff; color: #0f172a; }
            .header { text-align: center; border-bottom: 2px solid #24963e; padding-bottom: 12px; margin-bottom: 20px; }
            .title { font-size: 18px; font-weight: 900; color: #0f172a; }
            .subtitle { font-size: 12px; color: #24963e; font-weight: bold; margin-top: 4px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
            .label { color: #64748b; font-weight: bold; }
            .val { font-weight: bold; color: #0f172a; }
            .total { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin-top: 16px; font-size: 15px; font-weight: 900; display: flex; justify-content: space-between; }
            .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">ባህር ዳር ሞተር ቢስክሌት አሶሴሽን</div>
            <div class="subtitle">Bahir Dar Motorcycle Association — Official Receipt</div>
          </div>
          <div class="row"><span class="label">Receipt Number / የደረሰኝ ቁጥር:</span><span class="val">#${rc.receiptNumber}</span></div>
          <div class="row"><span class="label">Member Name / የባለቤት ስም:</span><span class="val">${rc.ownerName}</span></div>
          <div class="row"><span class="label">Plate Number / የሰሌዳ ቁጥር:</span><span class="val">${rc.plateNumber || 'N/A'}</span></div>
          <div class="row"><span class="label">Payment Date / የተከፈለበት ቀን:</span><span class="val">${ethDate}</span></div>
          <div class="row"><span class="label">Valid Until / የሚያበቃበት ቀን:</span><span class="val" style="color:#24963e">${expEthDate}</span></div>
          <div class="row"><span class="label">Clerk / የመዘገበው ሰራተኛ:</span><span class="val">${rc.enteredBy}</span></div>
          <div class="total">
            <span>Total Amount Paid / የተከፈለ መጠን:</span>
            <span style="color:#166534">${rc.amount || '500 ETB'}</span>
          </div>
          <div class="footer">Verified Official System Receipt — ${new Date().toLocaleDateString()}</div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  const handleOpenEditTransaction = (rc: PaymentReceipt) => {
    setEditingReceipt(rc);
    setEditFormAmount(String(rc.amount || '500').replace(/[^0-9.]/g, ''));
    setEditFormNotes(rc.notes || '');
    setEditFormPaymentDate(rc.paymentDate || '');
    setEditFormExpDate(rc.expirationDate || '');
  };

  const handleSaveEditedTransaction = async () => {
    if (!editingReceipt) return;
    try {
      const updatedReceipt: PaymentReceipt = {
        ...editingReceipt,
        amount: `${editFormAmount.trim() || '500'} ETB`,
        notes: editFormNotes.trim() || undefined,
        paymentDate: editFormPaymentDate || editingReceipt.paymentDate,
        expirationDate: editFormExpDate || editingReceipt.expirationDate,
      };
      if (onSaveReceipt) {
        await onSaveReceipt(updatedReceipt);
      } else {
        await savePaymentReceiptToDb(updatedReceipt);
      }
      if (onShowToast) {
        onShowToast(
          isAmharic ? 'የክፍያ መረጃው በተሳካ ሁኔታ ተሻሽሏል' : 'Transaction updated successfully',
          'success'
        );
      }
      setEditingReceipt(null);
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(isAmharic ? 'ማሻሻል አልተሳካም' : 'Failed to update transaction', 'error');
      }
    }
  };

  // Filtered Receipts for table & cards
  const filteredReceipts = useMemo(() => {
    return combinedReceipts.filter((rc) => {
      const matchesSearch =
        !searchQuery.trim() ||
        rc.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rc.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rc.plateNumber && rc.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (rc.ownerRegistrationId && rc.ownerRegistrationId.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (!matchesDateFilter(rc)) return false;

      if (statusFilter === 'all') return true;

      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      return status === statusFilter;
    });
  }, [combinedReceipts, searchQuery, statusFilter, startDate, endDate, dateRangePreset]);

  // KPI Metrics Summary
  const metrics = useMemo(() => {
    let activeCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let totalRevenue = 0;
    let count = 0;

    combinedReceipts.forEach((rc) => {
      if (!matchesDateFilter(rc)) return;
      count++;
      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      if (status === 'active') activeCount++;
      else if (status === 'expiring_soon') expiringCount++;
      else if (status === 'expired') expiredCount++;

      const fallbackAmount = rc.vehicleCategory === 'electric' ? 50 : 100;
      const numAmount = parseFloat(String(rc.amount || fallbackAmount).replace(/[^0-9.]/g, '')) || fallbackAmount;
      totalRevenue += numAmount;
    });

    return {
      totalReceipts: count,
      activeCount,
      expiringCount,
      expiredCount,
      totalRevenue,
    };
  }, [combinedReceipts, startDate, endDate, dateRangePreset]);

  // Current Ethiopian date reference for the Matrix Ledger
  const currentEthDate = useMemo(() => toEthiopianDate(new Date()), []);
  const currentEthYear = currentEthDate.year;
  const currentEthMonth = currentEthDate.month; // 1 (መስከረም) to 13 (ጳጉሜ)

  // Monthly Matrix Ledger columns: All 13 months of the Ethiopian year (Meskerem through Pagume)
  const matrixColumns = useMemo(() => {
    return ETHIOPIAN_MONTHS.map((monthObj) => {
      const label = isAmharic ? monthObj.shortAm : monthObj.shortEn;
      const fullLabel = isAmharic ? monthObj.am : monthObj.en;
      const fullTitle = isAmharic ? `${monthObj.am} (${monthObj.en})` : `${monthObj.en} - ${monthObj.am}`;
      return {
        key: `eth_m_${monthObj.id}`,
        monthNum: monthObj.id,
        label,
        fullLabel,
        title: fullTitle,
        year: currentEthYear,
      };
    });
  }, [currentEthYear, isAmharic]);

  // All Matrix Rows generated across member registrations with real-time payment status lookup
  const allMatrixRows = useMemo(() => {
    const cleanPlate = (s?: string) => (s || '').replace(/[\s\-_]/g, '').toLowerCase();
    const cleanStr = (s?: string) => (s || '').trim().toLowerCase();
    const cleanPhone = (s?: string) => (s || '').replace(/[^0-9]/g, '');

    const members = Array.isArray(effectiveRegistrations) ? [...effectiveRegistrations] : [];

    // Also include any unique receipt owners with plate numbers not in registrations
    const regIds = new Set(members.map((m) => cleanStr(m.id)));
    const regPlates = new Set(members.map((m) => cleanPlate(m.plateNumber)).filter(Boolean));
    const regNames = new Set(members.map((m) => cleanStr(m.fullName)).filter(Boolean));

    // Pre-index combinedReceipts into fast lookup maps
    const receiptsByRegId = new Map<string, PaymentReceipt[]>();
    const receiptsByPlate = new Map<string, PaymentReceipt[]>();
    const receiptsByPhone = new Map<string, PaymentReceipt[]>();
    const receiptsByName = new Map<string, PaymentReceipt[]>();

    combinedReceipts.forEach((rc) => {
      if (!rc) return;
      const rcRegId = cleanStr(rc.ownerRegistrationId);
      const rcPlate = cleanPlate(rc.plateNumber);
      const rcPhone = cleanPhone(rc.phone);
      const rcName = cleanStr(rc.ownerName);

      if (rcRegId) {
        const arr = receiptsByRegId.get(rcRegId) || [];
        arr.push(rc);
        receiptsByRegId.set(rcRegId, arr);
      }
      if (rcPlate) {
        const arr = receiptsByPlate.get(rcPlate) || [];
        arr.push(rc);
        receiptsByPlate.set(rcPlate, arr);
      }
      if (rcPhone) {
        const arr = receiptsByPhone.get(rcPhone) || [];
        arr.push(rc);
        receiptsByPhone.set(rcPhone, arr);
      }
      if (rcName) {
        const arr = receiptsByName.get(rcName) || [];
        arr.push(rc);
        receiptsByName.set(rcName, arr);
      }

      const alreadyCovered =
        (rcRegId && regIds.has(rcRegId)) ||
        (rcPlate && regPlates.has(rcPlate)) ||
        (rcName && regNames.has(rcName));

      if (!alreadyCovered && (rcPlate || rcName)) {
        members.push({
          id: rc.ownerRegistrationId || rc.id,
          fullName: rc.ownerName || rc.plateNumber || 'Unknown Owner',
          plateNumber: rc.plateNumber || '',
          phone: rc.phone || '',
          registrationDate: rc.paymentDate || rc.createdAt,
          termStatus: 'CURRENT',
        } as any);
        if (rcRegId) regIds.add(rcRegId);
        if (rcPlate) regPlates.add(rcPlate);
        if (rcName) regNames.add(rcName);
      }
    });

    return members.map((reg) => {
      const regIdClean = cleanStr(reg.id);
      const regPlateClean = cleanPlate(reg.plateNumber);
      const regPhoneClean = cleanPhone(reg.phone);
      const regNameClean = cleanStr(reg.fullName);

      // 1. O(1) Fast Match from indexed maps
      const matchedReceipts: PaymentReceipt[] =
        (regIdClean ? receiptsByRegId.get(regIdClean) : null) ||
        (regPlateClean ? receiptsByPlate.get(regPlateClean) : null) ||
        (regPhoneClean ? receiptsByPhone.get(regPhoneClean) : null) ||
        (regNameClean ? receiptsByName.get(regNameClean) : null) ||
        [];

      // 2. Also incorporate payment receipt data directly attached to the registration intake record
      const allReceipts = [...matchedReceipts];
      const hasRegReceipt = Boolean(
        reg.receiptNumber ||
        reg.lastReceiptNumber ||
        reg.paymentAmount ||
        reg.lastPaymentAmount ||
        reg.lastPaymentDate ||
        reg.activeTermExpirationDate ||
        reg.termStatus === 'CURRENT' ||
        reg.status === 'approved' ||
        reg.status === 'printed' ||
        reg.status === 'ordered_print'
      );

      if (hasRegReceipt) {
        const regReceiptNo = cleanStr(reg.lastReceiptNumber || reg.receiptNumber);
        const alreadyInList = allReceipts.some((r) => r.receiptNumber && cleanStr(r.receiptNumber) === regReceiptNo);
        if (!alreadyInList) {
          const rawPayDate = reg.lastPaymentDate || reg.registrationDate || getDefaultEthiopianRegistrationDate();
          const payDate = normalizeToEthiopianDateStr(rawPayDate);
          const expDate = reg.activeTermExpirationDate
            ? normalizeToEthiopianDateStr(reg.activeTermExpirationDate)
            : calculateOneMonthExpiration(payDate);
          allReceipts.push({
            id: `reg-init-${reg.id}`,
            receiptNumber: reg.lastReceiptNumber || reg.receiptNumber || 'INITIAL',
            ownerRegistrationId: reg.id,
            ownerName: reg.fullName || '',
            plateNumber: reg.plateNumber,
            phone: reg.phone,
            paymentDate: payDate,
            expirationDate: expDate,
            amount: reg.lastPaymentAmount || reg.paymentAmount || (reg.vehicleCategory === 'electric' ? '50 ETB' : '100 ETB'),
            vehicleCategory: reg.vehicleCategory,
            enteredBy: reg.registeredBy || 'SYSTEM',
            createdAt: payDate,
          });
        }
      }

      // Check if this member has ANY payment history in the database at all
      const hasAnyPaymentRecord = allReceipts.length > 0 || Boolean(reg.termStatus && reg.termStatus !== 'DELINQUENT');

      // Parse Ethiopian calendar dates and active status for each receipt
      const parsedReceipts = allReceipts.map((rc) => {
        const payDateStr = rc.paymentDate || rc.createdAt || '';
        const expDateStr = rc.expirationDate || (payDateStr ? calculateOneMonthExpiration(payDateStr) : '');
        let payEth: EthiopianDate | null = null;
        let expEth: EthiopianDate | null = null;
        try {
          if (payDateStr) payEth = toEthiopianDate(payDateStr);
        } catch {}
        try {
          if (expDateStr) expEth = toEthiopianDate(expDateStr);
        } catch {}

        const { status, daysRemaining } = getPaymentReceiptStatus(expDateStr);
        const payIndex = payEth ? payEth.year * 13 + payEth.month : 0;
        const expIndex = expEth ? expEth.year * 13 + expEth.month : payIndex;

        return {
          receipt: rc,
          payEth,
          expEth,
          payIndex,
          expIndex,
          status, // 'active' | 'expiring_soon' | 'expired'
          daysRemaining,
        };
      });

      // Map each column month to its status (including advance payment coverage & 5-day due-soon threshold)
      const periods: Record<string, 'paid' | 'unpaid' | 'pending' | 'muted'> = {};

      matrixColumns.forEach((col) => {
        const targetMonth = col.monthNum;
        const targetYear = col.year;
        const targetIndex = targetYear * 13 + targetMonth;
        const currentIndex = currentEthYear * 13 + currentEthMonth;

        // If member has no payment records whatsoever in the DB, show muted dot
        if (!hasAnyPaymentRecord) {
          periods[col.key] = 'muted';
          return;
        }

        // Check if any payment receipt actively covers targetIndex (from payIndex up to expIndex - 1)
        const activeCoverageReceipt = parsedReceipts.find(
          (item) => item.payIndex && item.expIndex && targetIndex >= item.payIndex && targetIndex < item.expIndex
        );

        if (activeCoverageReceipt) {
          // If in active coverage range: evaluate whether it's expiring soon (<= 5 days remaining)
          if (
            (targetIndex === currentIndex || targetIndex === activeCoverageReceipt.expIndex - 1) &&
            activeCoverageReceipt.daysRemaining <= 5 &&
            activeCoverageReceipt.daysRemaining >= 0
          ) {
            periods[col.key] = 'pending';
          } else {
            periods[col.key] = 'paid';
          }
        } else if (targetIndex === currentIndex) {
          // Current month with no active coverage
          if (parsedReceipts.some((r) => r.status === 'expiring_soon')) {
            periods[col.key] = 'pending';
          } else {
            periods[col.key] = 'unpaid';
          }
        } else if (targetIndex < currentIndex) {
          // Past month with no payment coverage
          periods[col.key] = 'unpaid';
        } else {
          // Future month with no advance payment -> muted grey dot
          periods[col.key] = 'muted';
        }
      });

      const matchedPlateFromReceipt = matchedReceipts.find((rc) => rc.plateNumber && rc.plateNumber.trim())?.plateNumber;
      const plate = (reg.plateNumber ? reg.plateNumber.trim() : '') || (matchedPlateFromReceipt ? matchedPlateFromReceipt.trim() : '');

      return {
        id: reg.id,
        title: reg.fullName || (isAmharic ? 'ያልተገለጸ አባል' : 'Unnamed Member'),
        plateNumber: plate || undefined,
        periods,
        member: reg,
        allReceipts,
        currentMonthStatus: periods[`eth_m_${currentEthMonth}`] || 'muted',
      };
    });
  }, [effectiveRegistrations, combinedReceipts, matrixColumns, currentEthMonth, currentEthYear, isAmharic]);

  // Filter matrix rows according to search query and status filter
  const filteredMatrixRows = useMemo(() => {
    return allMatrixRows.filter((row) => {
      // 1. Search Query filter (matches Name, Plate, Phone, ID, or Receipt Number)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const cleanQ = q.replace(/[\s\-_]/g, '');
        const matchesName = row.title.toLowerCase().includes(q);
        const matchesPlate =
          (row.plateNumber || '').toLowerCase().includes(q) ||
          (row.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase().includes(cleanQ) ||
          (row.member?.plateNumber || '').toLowerCase().includes(q) ||
          (row.member?.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase().includes(cleanQ);
        const matchesPhone = (row.member?.phone || '').toLowerCase().includes(q);
        const matchesId = String(row.member?.id || '').toLowerCase().includes(q);
        const matchesReceipt = row.allReceipts.some((rc) =>
          (rc.receiptNumber || '').toLowerCase().includes(q) ||
          (rc.plateNumber || '').toLowerCase().includes(q)
        );
        if (!matchesName && !matchesPlate && !matchesPhone && !matchesId && !matchesReceipt) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return row.currentMonthStatus === 'paid';
      if (statusFilter === 'expiring_soon') return row.currentMonthStatus === 'pending';
      if (statusFilter === 'expired') return row.currentMonthStatus === 'unpaid';

      return true;
    });
  }, [allMatrixRows, searchQuery, statusFilter]);

  // Server-Side Paginated Membership Fee Directory Fetch Effect
  React.useEffect(() => {
    let isMounted = true;
    const fetchPageData = async () => {
      setIsFetchingRows(true);
      try {
        const result = await fetchMembershipFeeDirectory({
          page,
          limit: pageSize,
          search: searchQuery.trim(),
          status: statusFilter,
          month: currentEthMonth,
          year: currentEthYear,
          role: userRole,
          badgeId: userBadgeId,
        });
        if (isMounted && result && result.rows) {
          setServerRows(result.rows);
          setServerPagination(result.pagination);
        }
      } catch (err) {
        console.warn('[PaymentReceiptsPage] Server-side page fetch notice:', err);
      } finally {
        if (isMounted) setIsFetchingRows(false);
      }
    };

    const timer = setTimeout(fetchPageData, searchQuery ? 200 : 0);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [page, pageSize, searchQuery, statusFilter, currentEthMonth, currentEthYear, userRole, userBadgeId, registrations, paymentReceipts]);

  // Fetch server-side monthly fee statistics when selected month/year changes
  useEffect(() => {
    let isMounted = true;
    fetchMonthlyFeeStatisticsServerSide(currentEthMonth, currentEthYear).then((stats) => {
      if (isMounted && stats) {
        setServerFeeStats(stats);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentEthMonth, currentEthYear]);

  // Pagination calculations (seamless fallback to client slicing if server data is pending)
  const totalEntries = serverPagination ? serverPagination.totalCount : filteredMatrixRows.length;
  const totalPages = serverPagination ? serverPagination.totalPages : Math.max(1, Math.ceil(totalEntries / pageSize));
  const activePage = Math.min(page, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const displayMatrixRows = useMemo(() => {
    if (serverRows && serverRows.length > 0) {
      return serverRows;
    }
    return filteredMatrixRows.slice(startIndex, startIndex + pageSize);
  }, [serverRows, filteredMatrixRows, startIndex, pageSize]);

  // Matrix member counts according to current month status
  const matrixCounts = useMemo(() => {
    if (isSuperAdmin && serverFeeStats) {
      return {
        all: serverFeeStats.activeBillableCount,
        active: serverFeeStats.paidMembersCount,
        expiring: serverFeeStats.dueSoonMembersCount,
        expired: serverFeeStats.unpaidMembersCount,
      };
    }
    let active = 0;
    let expiring = 0;
    let expired = 0;
    allMatrixRows.forEach((r) => {
      if (r.currentMonthStatus === 'paid') active++;
      else if (r.currentMonthStatus === 'pending') expiring++;
      else if (r.currentMonthStatus === 'unpaid') expired++;
    });
    return {
      all: allMatrixRows.length,
      active,
      expiring,
      expired,
    };
  }, [allMatrixRows, serverFeeStats, isSuperAdmin]);

  // Ethiopian Monthly Fee Statistics metrics
  const ethiopianMonthlyMetrics = useMemo(() => {
    // If fast server-side statistics are available, return immediately with zero client delay
    if (isSuperAdmin && serverFeeStats) {
      return {
        targetMonth: serverFeeStats.targetMonth,
        targetYear: serverFeeStats.targetYear,
        monthName: isAmharic ? serverFeeStats.monthNameAm : serverFeeStats.monthNameEn,
        isCurrentMonth: serverFeeStats.isCurrentMonth,
        totalRevenue: serverFeeStats.totalRevenue,
        totalReceiptsCount: serverFeeStats.totalReceiptsCount,
        paidMembersCount: serverFeeStats.paidMembersCount,
        dueSoonMembersCount: serverFeeStats.dueSoonMembersCount,
        unpaidMembersCount: serverFeeStats.unpaidMembersCount,
        activeBillableCount: serverFeeStats.activeBillableCount,
        complianceRate: serverFeeStats.complianceRate,
      };
    }

    const monthObj = ETHIOPIAN_MONTHS[currentEthMonth - 1] || ETHIOPIAN_MONTHS[0];
    const monthName = isAmharic ? monthObj.am : monthObj.en;

    const paidMembersCount = matrixCounts.active;
    const dueSoonMembersCount = matrixCounts.expiring;
    const unpaidMembersCount = matrixCounts.expired;
    const billableCount = matrixCounts.all;
    const complianceRate =
      billableCount > 0 ? Math.round(((paidMembersCount + dueSoonMembersCount) / billableCount) * 100) : 0;

    return {
      targetMonth: currentEthMonth,
      targetYear: currentEthYear,
      monthName,
      isCurrentMonth: true,
      totalRevenue: metrics.totalRevenue,
      totalReceiptsCount: metrics.totalReceipts,
      paidMembersCount,
      dueSoonMembersCount,
      unpaidMembersCount,
      activeBillableCount: billableCount,
      complianceRate,
    };
  }, [currentEthMonth, currentEthYear, isAmharic, matrixCounts, metrics]);

  // Reusable Tailwind-styled Date Range Picker matching table toolbar UI and controls
  const renderDateRangePicker = () => {
    return (
      <EthiopianDateRangePicker
        startDate={startDate}
        endDate={endDate}
        preset={dateRangePreset}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onPresetChange={setDateRangePreset}
        lang={isAmharic ? 'am' : 'en'}
      />
    );
  };

  return (
    <div className="pb-3 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* UNIFIED WORKSPACE CARD SHELL (HOUSING INTEGRATED HEADER, FLUSH TABS, FILTERS & VIEW) */}
      <div className="rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] shadow-xs overflow-hidden divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] w-full max-w-full min-w-0">
        {/* 1. INTEGRATED TITLE BAR / HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-[#1C2434] py-2.5 px-3.5 sm:px-5 w-full max-w-full min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Icon className="material-symbols-outlined text-[20px]">payments</Icon>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#1C2434] dark:text-white tracking-tight flex items-center gap-2">
                <span>{isAmharic ? 'የአባልነት ክፍያ ማህደር' : 'Membership Fee Directory'}</span>
              </h2>
              <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD] font-medium hidden sm:block">
                {isAmharic ? 'የወርሃዊ መዋጮ ማትሪክስ ሰንጠረዥ እና ገቢ ስታቲስቲክስ' : 'Monthly dues matrix ledger & revenue statistics'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {canAddReceipt ? (
              <button
                type="button"
                onClick={() => setIsFormOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
              >
                <Icon className="material-symbols-outlined text-[16px]">
                  {isFormOpen ? 'close' : 'add'}
                </Icon>
                <span>
                  {isFormOpen
                    ? isAmharic ? 'ቅጹን ዝጋ' : 'Close Form'
                    : isAmharic ? 'አዲስ ክፍያ' : 'New payment'}
                </span>
              </button>
            ) : (
              <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-bold flex items-center gap-1.5">
                <Icon className="material-symbols-outlined text-[15px]">lock</Icon>
                <span>{isAmharic ? 'የደረሰኝ መመዝገቢያ ተገድቧል' : 'Receipt Entry Restricted'}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. FLUSH WORKSPACE TABS (ATTACHED DIRECTLY UNDERNEATH TITLE BAR, ZERO GAP) */}
        {canViewTable && canViewKPIs && (
          <div className="flex items-center justify-between bg-[#F8FAFC] dark:bg-[#1E293B]/70 px-3 sm:px-5 pt-1.5 overflow-hidden w-full max-w-full">
            <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto scrollbar-none -mb-[1px] w-full min-w-0">
              <button
                type="button"
                onClick={() => setActiveMainTab('table')}
                className={`group relative flex items-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  currentTab === 'table'
                    ? 'border-primary text-primary dark:text-primary dark:border-primary bg-white dark:bg-[#1C2434] rounded-t-md shadow-2xs'
                    : 'border-transparent text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:border-[#CBD5E1]'
                }`}
              >
                <Icon className="material-symbols-outlined text-[18px]">table_chart</Icon>
                <span>{isAmharic ? 'የደረሰኞች ዝርዝር ሰንጠረዥ' : 'Receipts Table'}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    currentTab === 'table'
                      ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                      : 'bg-[#E2E8F0] text-[#64748B] dark:bg-[#24303F] dark:text-[#8A99AD]'
                  }`}
                >
                  {totalEntries}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMainTab('metrics')}
                className={`group relative flex items-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  currentTab === 'metrics'
                    ? 'border-primary text-primary dark:text-primary dark:border-primary bg-white dark:bg-[#1C2434] rounded-t-md shadow-2xs'
                    : 'border-transparent text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:border-[#CBD5E1]'
                }`}
              >
                <Icon className="material-symbols-outlined text-[18px]">payments</Icon>
                <span>{isAmharic ? 'የወርሃዊ ክፍያ ስታቲስቲክስ' : 'Monthly Fee Statistics'}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    currentTab === 'metrics'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-[#E2E8F0] text-[#64748B] dark:bg-[#24303F] dark:text-[#8A99AD]'
                  }`}
                >
                  {isLoading ? '—' : `${ethiopianMonthlyMetrics.totalRevenue.toLocaleString()} ETB`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: MONTHLY FEE STATISTICS VIEW (INTEGRATED FLUSH VIEW) */}
        {currentTab === 'metrics' && canViewKPIs && (
          <div className="w-full max-w-full min-w-0 divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">
            {/* Integrated Date Filter for Metrics */}
            <div className="w-full max-w-full overflow-hidden">
              {renderDateRangePicker()}
            </div>

            {/* Integrated Statistics Container */}
            <div className="p-3.5 sm:p-5 space-y-4 bg-white dark:bg-[#1C2434] w-full max-w-full overflow-hidden">
              {/* Header with Ethiopian Month Title */}
              <div className="flex items-center justify-between gap-2.5 sm:gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
              {/* Title */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Icon className="material-symbols-outlined text-[20px]">payments</Icon>
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#1C2434] dark:text-white tracking-wide truncate">
                    {isAmharic ? 'የወርሃዊ ክፍያ ስታቲስቲክስ' : 'Monthly Fee Statistics'}
                  </h3>
                  <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD] font-medium">
                    {isAmharic
                      ? 'የኢትዮጵያ ዘመን አቆጣጠር መሠረት ያደረገ የወርሃዊ መዋጮ እና የክፍያ ተገዢነት ማጠቃለያ'
                      : 'Ethiopian calendar monthly dues collection & compliance summary'}
                  </p>
                </div>
              </div>
            </div>

            {/* 5-Column Responsive Metric Statistics Cards (Clean Design System) */}
            <MetricGrid columns={5}>
              {/* 1. Paid Members */}
              <MetricStatCard
                label={isAmharic ? 'የተከፈሉ አባላት' : 'Paid Members'}
                value={isLoading ? '—' : ethiopianMonthlyMetrics.paidMembersCount}
                subtext={isAmharic ? 'ወቅታዊ ክፍያ የተጠናቀቀ' : 'Fully paid for month'}
                statusVariant="paid"
                onClick={() => {
                  setStatusFilter('active');
                  setActiveMainTab('table');
                }}
              />

              {/* 2. Payment Due Soon */}
              <MetricStatCard
                label={isAmharic ? 'ሊያልቅ የደረሰ' : 'Due Soon'}
                value={isLoading ? '—' : ethiopianMonthlyMetrics.dueSoonMembersCount}
                subtext={isAmharic ? 'በ 5 ቀናት ውስጥ የሚያበቃ' : 'Expiring in ≤5 days'}
                statusVariant="due"
                onClick={() => {
                  setStatusFilter('expiring_soon');
                  setActiveMainTab('table');
                }}
              />

              {/* 3. Unpaid / Overdue */}
              <MetricStatCard
                label={isAmharic ? 'ያልተከፈለባቸው' : 'Unpaid / Overdue'}
                value={isLoading ? '—' : ethiopianMonthlyMetrics.unpaidMembersCount}
                subtext={isAmharic ? 'ክፍያ ያልተፈጸመ' : 'Delinquent dues'}
                statusVariant="overdue"
                onClick={() => {
                  setStatusFilter('expired');
                  setActiveMainTab('table');
                }}
              />

              {/* 4. Month Revenue */}
              <MetricStatCard
                label={isAmharic ? 'የወሩ ገቢ' : 'Month Revenue'}
                value={isLoading ? '—' : ethiopianMonthlyMetrics.totalRevenue.toLocaleString()}
                unit={isAmharic ? 'ብር' : 'ETB'}
                subtext={isLoading ? (isAmharic ? 'በመጫን ላይ...' : 'Loading...') : `${ethiopianMonthlyMetrics.totalReceiptsCount} ${isAmharic ? 'ደረሰኞች ተመዝግበዋል' : 'receipts recorded'}`}
                icon="account_balance_wallet"
                onClick={() => {
                  setStatusFilter('all');
                  setActiveMainTab('table');
                }}
              />

              {/* 5. Compliance Rate */}
              <MetricStatCard
                label={isAmharic ? 'የክፍያ ምጣኔ' : 'Compliance Rate'}
                value={isLoading ? '—' : `${ethiopianMonthlyMetrics.complianceRate}%`}
                icon="pie_chart"
                progress={isLoading ? 0 : ethiopianMonthlyMetrics.complianceRate}
                className="col-span-2 sm:col-span-1"
                onClick={() => {
                  setStatusFilter('all');
                  setActiveMainTab('table');
                }}
              />
            </MetricGrid>

            {/* Additional Status Distribution & Quick Actions Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-[#F7F9FC] dark:bg-[#24303F] rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] space-y-3">
                <h4 className="text-xs font-bold text-[#1C2434] dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-[18px] text-primary">donut_large</Icon>
                  <span>{isAmharic ? 'የክፍያ ሁኔታዎች ስርጭት' : 'Payment Status Breakdown'}</span>
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {isAmharic ? 'የተከፈሉ አባላት' : 'Paid Members'}
                    </span>
                    <span className="font-mono font-bold text-[#1C2434] dark:text-white">
                      {ethiopianMonthlyMetrics.paidMembersCount} / {ethiopianMonthlyMetrics.activeBillableCount} ({ethiopianMonthlyMetrics.complianceRate}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      {isAmharic ? 'ሊያልቅ የደረሰ' : 'Due Soon'}
                    </span>
                    <span className="font-mono font-bold text-[#1C2434] dark:text-white">
                      {ethiopianMonthlyMetrics.dueSoonMembersCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      {isAmharic ? 'ያልተከፈለባቸው (ዕዳ)' : 'Unpaid / Overdue'}
                    </span>
                    <span className="font-mono font-bold text-[#1C2434] dark:text-white">
                      {ethiopianMonthlyMetrics.unpaidMembersCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#F7F9FC] dark:bg-[#24303F] rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-[#1C2434] dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Icon className="material-symbols-outlined text-[18px] text-emerald-600">account_balance</Icon>
                    <span>{isAmharic ? 'የአባልነት ክፍያ እርምጃዎች' : 'Membership Fee Actions'}</span>
                  </h4>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setActiveMainTab('table');
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Icon className="material-symbols-outlined text-[16px]">table_chart</Icon>
                    <span>{isAmharic ? 'ማትሪክስ መዝገብ ይመልከቱ' : 'View Matrix Table'}</span>
                  </button>
                  {canAddReceipt && (
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(true)}
                      className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Icon className="material-symbols-outlined text-[16px]">add</Icon>
                      <span>{isAmharic ? 'አዲስ ክፍያ' : 'New payment'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT ENTRY FORM WITH ZERO-JUMP INTEGRATED MANIFEST STRIP */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-6 sm:pt-12 md:pt-14 pb-8 p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F]">
              <div className="flex items-center gap-2">
                <Icon className="material-symbols-outlined text-[18px] text-slate-700 dark:text-slate-300 shrink-0">
                  add_card
                </Icon>
                <h3 className="text-sm font-black text-slate-950 dark:text-white tracking-wider">
                  {isAmharic ? 'አዲስ የወርሃዊ ክፍያ ደረሰኝ መመዝገቢያ ቅጽ' : 'New Monthly Payment Receipt Entry'}
                </h3>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                  Clerk: {userBadgeId}
                </span>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:text-[#1C2434] hover:bg-[#E2E8F0]/50 dark:hover:bg-[#2E3A47] dark:text-[#8A99AD] dark:hover:text-white transition-all cursor-pointer"
                >
                  <Icon className="material-symbols-outlined text-[20px]">close</Icon>
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable form) */}
            <form
              onSubmit={handleSubmitForm}
              className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin bg-white dark:bg-[#1C2434]"
            >

          {isFormReadOnly && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs">
              <Icon className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[20px] shrink-0">lock</Icon>
              <span>
                {isAmharic
                  ? 'ተነባቢ ብቻ ሁነታ፡ አዲስ ደረሰኝ መመዝገብ ተገድቧል።'
                  : 'Read-only mode: Creating receipts is disabled.'}
              </span>
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 rounded-lg text-xs font-bold flex items-center gap-2">
              <Icon className="material-symbols-outlined text-rose-600 text-[20px] shrink-0">error</Icon>
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-lg text-xs font-bold flex items-center gap-2">
              <Icon className="material-symbols-outlined text-emerald-600 text-[20px] shrink-0">check_circle</Icon>
              <span>{submitSuccess}</span>
            </div>
          )}

          {/* Form Top Row: Receipt # Standalone for optimal mobile layout */}
          <div className="space-y-3.5">
            {/* 1. Standalone Receipt / Bank Reference Number */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-900 dark:text-slate-100  tracking-wide">
                {isAmharic ? 'የደረሰኝ ቁጥር / የባንክ ማጣቀሻ ቁጥር' : 'Receipt # / Bank Reference'}
                <span className="text-rose-600 ml-1">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder={isAmharic ? 'ለምሳሌ፡ FT26071... ወይም REC-8902' : 'e.g., FT26071... or REC-8902'}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
                  <Icon className="material-symbols-outlined text-[16px]">receipt</Icon>
                </div>
              </div>
            </div>

            {/* 2. Bank System Verification & Payment Date Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Bank Selector and Verification Button */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-100  tracking-wide">
                  {isAmharic ? 'የባንክ ማረጋገጫ' : 'Bank System Check'}
                </label>
                <div className="flex gap-2">
                  <select
                    value={formChekiBank}
                    onChange={(e) => setFormChekiBank(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">{isAmharic ? 'ራስ-ሰር ባንክ' : 'Auto Bank'}</option>
                    <option value="cbe">CBE</option>
                    <option value="telebirr">Telebirr</option>
                    <option value="awash">Awash</option>
                    <option value="dashen">Dashen</option>
                    <option value="abyssinia">Abyssinia</option>
                    <option value="coop">Coop</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleVerifyReceiptInForm}
                    disabled={formChekiLoading || !receiptNumber.trim()}
                    className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed active:scale-95"
                    title={isAmharic ? 'ደረሰኙን አረጋግጥ' : 'Verify receipt on bank system via Cheki API'}
                  >
                    {formChekiLoading ? (
                      <>
                        <Icon className="material-symbols-outlined text-[15px] animate-spin">progress_activity</Icon>
                        <span>{isAmharic ? 'በማጣራት...' : 'Checking...'}</span>
                      </>
                    ) : (
                      <>
                        <Icon className="material-symbols-outlined text-[15px]">verified</Icon>
                        <span>{isAmharic ? 'አረጋግጥ' : 'Verify'}</span>
                      </>
                    )}
                  </button>
                </div>

                {formChekiError && (
                  <div className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-lg text-[11px] font-bold flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className="material-symbols-outlined text-[15px] shrink-0">error</Icon>
                      <span>{formChekiError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormChekiError('')}
                      className="text-rose-600 hover:text-rose-800 font-bold text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Payment Date Input in Ethiopian Calendar */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wide">
                  <span>{isAmharic ? 'የተከፈለበት ቀን (E.C.)' : 'Payment Date (E.C.)'}</span>
                </label>
                <EthiopianDatePickerPopover
                  value={paymentDate}
                  onChange={setPaymentDate}
                  lang={isAmharic ? 'am' : 'en'}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* ZERO-JUMP DYNAMIC FIELDS: Integrated read-only manifest strip directly below registration input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 dark:text-slate-100  tracking-wide flex items-center justify-between">
              <span>{isAmharic ? 'የምዝገባ ቁጥር፣ ሰሌዳ፣ ወይም ሞተር ቁጥር' : 'Registration ID, Plate #, or Engine #'}</span>
              {regNumber && (
                <button
                  type="button"
                  onClick={() => {
                    setRegNumber('');
                    setSelectedRegId('');
                    setOwnerName('');
                    setPlateNumber('');
                    setPhone('');
                    setIsAutoFilled(false);
                  }}
                  className="text-[10px] text-rose-600 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Icon className="material-symbols-outlined text-[12px]">cancel</Icon>
                  <span>{isAmharic ? 'አፅዳ' : 'Clear'}</span>
                </button>
              )}
            </label>

            <div className="relative">
              <input
                type="text"
                value={regNumber}
                onChange={(e) => handleRegNumberChange(e.target.value)}
                onFocus={() => setIsFormOpen(true)}
                placeholder={
                  isAmharic
                    ? 'የምዝገባ ቁጥር፣ ሰሌዳ፣ ወይም ሞተር ቁጥር አስገባ...'
                    : 'Enter Registration #, Plate #, or Engine #'
                }
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
                <Icon className="material-symbols-outlined text-[18px]">search</Icon>
              </div>

              {/* Custom Suggestion Dropdown */}
              {regNumber.length >= 2 && !isAutoFilled && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {effectiveRegistrations
                    .filter(
                      (r) =>
                        r.id.toLowerCase().includes(regNumber.toLowerCase()) ||
                        (r.plateNumber && r.plateNumber.toLowerCase().includes(regNumber.toLowerCase())) ||
                        (r.fullName && r.fullName.toLowerCase().includes(regNumber.toLowerCase()))
                    )
                    .slice(0, 10)
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          handleRegNumberChange(r.id);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <span className="font-bold">{r.fullName}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          ({r.plateNumber || 'No Plate'}) — ID: {r.id}
                        </span>
                      </button>
                    ))}
                  {effectiveRegistrations.filter(
                    (r) =>
                      r.id.toLowerCase().includes(regNumber.toLowerCase()) ||
                      (r.plateNumber && r.plateNumber.toLowerCase().includes(regNumber.toLowerCase())) ||
                      (r.fullName && r.fullName.toLowerCase().includes(regNumber.toLowerCase()))
                  ).length === 0 && (
                    <div className="px-4 py-2 text-xs text-slate-500 italic">
                      {isAmharic ? 'ምንም ውጤት አልተገኘም' : 'No results found'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* INTEGRATED READ-ONLY MANIFEST STRIP (Zero-Jump Dynamic Fields) */}
            <div
              className={`transition-all duration-150 rounded-xl border p-4 ${
                selectedRegInfo
                  ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
              }`}
            >
              {selectedRegInfo ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* 1. Name */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      {isAmharic ? 'የባለቤት ስም' : 'Owner Name'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-sm truncate">
                      {selectedRegInfo.registration.fullName}
                    </span>
                  </div>

                  {/* 2. Plate */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      {isAmharic ? 'ሰሌዳ ቁጥር' : 'Plate #'}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {selectedRegInfo.registration.plateNumber || (isAmharic ? 'ሰሌዳ የለም' : 'No Plate')}
                    </span>
                  </div>

                  {/* 3. Status */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      {isAmharic ? 'የሂሳብ ሁኔታ' : 'Ledger Status'}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-black tracking-wider w-fit ${
                        selectedRegInfo.termStatus === 'CURRENT'
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : selectedRegInfo.termStatus === 'DUE'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                          : 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
                      }`}
                    >
                      {selectedRegInfo.termStatus}
                    </span>
                  </div>

                  {/* 4. Prior Balance */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      {isAmharic ? 'ቀሪ ዕዳ' : 'Prior Debt'}
                    </span>
                    <span
                      className={`font-mono font-bold text-sm ${
                        selectedRegInfo.unpaidDebtAmount > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {selectedRegInfo.unpaidDebtAmount} ETB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-slate-400">
                  <Icon className="material-symbols-outlined text-[20px]">info</Icon>
                  <span className="text-xs font-medium">
                    {isAmharic
                      ? 'የምዝገባ ቁጥር ሲያስገቡ የባለቤት ስም፣ ሰሌዳ፣ የሂሳብ ሁኔታ እና ቀሪ ዕዳ በራስ-ሰር እዚህ ይሞላል።'
                      : 'Auto-fetched manifest strip will display Name, Plate, Status, and Prior Balance once a registration is selected.'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount and Expiration Timeline Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Amount */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-900 dark:text-slate-100  tracking-wide">
                {isAmharic ? 'የተከፈለው መጠን (ብር)' : 'Amount Paid (ETB)'}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
              />
            </div>

            {/* Calculated Expiration Date (1 Month Term) with Prominent Ethiopian Calendar */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400  tracking-wide flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Icon className="material-symbols-outlined text-[16px]">event_available</Icon>
                  <span>{isAmharic ? 'የ1 ወር ማብቂያ ቀን' : 'Calculated 1-Month Expiry (Eth)'}</span>
                </span>
                {!isAmharic && (
                  <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300">
                    GC: {calculatedExpirationDate}
                  </span>
                )}
              </label>
              <div className="w-full px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center justify-between shadow-2xs">
                <span className="font-mono text-xs sm:text-sm">
                  {formatEthiopianDate(calculatedExpirationDate, isAmharic ? 'am' : 'en')}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px]  font-black bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100">
                  +1 {isAmharic ? 'ወር' : 'Month'}
                </span>
              </div>
            </div>
          </div>

          {/* Screenshot Upload Dropzone */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-900 dark:text-slate-100  tracking-wide">
              {isAmharic ? 'የደረሰኝ ፎቶ ስቀል' : 'Receipt Screenshot Upload'}
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
              {receiptScreenshot ? (
                <div className="relative w-28 h-20 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-2xs shrink-0 bg-black">
                  <img
                    src={receiptScreenshot}
                    alt="Receipt Screenshot"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReceiptScreenshot('')}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs shadow-md cursor-pointer hover:bg-rose-700"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="w-28 h-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                  <Icon className="material-symbols-outlined text-[24px]">receipt</Icon>
                  <span className="text-[9px] font-bold mt-0.5">
                    {isAmharic ? 'ፎቶ የለም' : 'No Image'}
                  </span>
                </div>
              )}

              <div className="space-y-1 text-center sm:text-left">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotUpload}
                  id="receipt-screenshot-upload"
                  className="hidden"
                />
                <label
                  htmlFor="receipt-screenshot-upload"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer transition-all shadow-xs"
                >
                  <Icon className="material-symbols-outlined text-[16px]">cloud_upload</Icon>
                  <span>{isAmharic ? 'የደረሰኝ ፎቶ ስቀል' : 'Upload Receipt Screenshot'}</span>
                </label>
                <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  {isAmharic
                    ? 'የቴሌብር/የባንክ ማረጋገጫ ስክሪንሾት ወይም የወረቀት ደረሰኙን ፎቶ ያያይዙ።'
                    : 'Upload Telebirr, CBE SMS, or physical paper treasury receipt photo.'}
                </p>
              </div>
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-900 dark:text-slate-100  tracking-wide">
              {isAmharic ? 'ተጨማሪ ማብራሪያ' : 'Notes & Remarks'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAmharic ? 'ተጨማሪ መረጃ ካለ ያስገቡ...' : 'Add optional clerk notes...'}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
            >
              {isAmharic ? 'ሰርዝ' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isFormReadOnly || !canAddReceipt || selectedRegInfo?.expirationStatusType === 'active'}
              className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-black transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Icon className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </Icon>
                  <span>{isAmharic ? 'እየተመዘገበ...' : 'Saving Receipt...'}</span>
                </>
              ) : selectedRegInfo?.expirationStatusType === 'active' ? (
                <>
                  <Icon className="material-symbols-outlined text-[18px]">block</Icon>
                  <span>{isAmharic ? 'ክፍያ አስቀድሞ ተፈፅሟል' : 'Already Paid (Prevented)'}</span>
                </>
              ) : (
                <>
                  <Icon className="material-symbols-outlined text-[18px]">save</Icon>
                  <span>{isAmharic ? 'የክፍያ ደረሰኝ መዝግብ' : 'Save Payment Receipt'}</span>
                </>
              )}
            </button>
          </div>
        </form>
          </div>
        </div>
      )}

      {/* TAB 2: TABLE SECTION (INTEGRATED FLUSH VIEW) */}
      {currentTab === 'table' && canViewTable && (
        <div className="w-full max-w-full min-w-0 divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">
          {/* Integrated Native Date Range Picker */}
          <div className="w-full max-w-full overflow-hidden">
            {renderDateRangePicker()}
          </div>

          {/* SEARCH & STATUS FILTER TOOLBAR (TAILADMIN DESIGN) */}
          <div className="px-3 sm:px-4 py-2 bg-[#F7F9FC] dark:bg-[#24303F] flex flex-wrap items-center gap-2 w-full max-w-full border-b border-[#E2E8F0] dark:border-[#2E3A47]">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[200px] max-w-xs md:max-w-sm shrink-0 sm:shrink">
              <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-[#64748B] dark:text-[#8A99AD]">
                <Icon className="material-symbols-outlined text-[17px]">search</Icon>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={
                  isAmharic
                    ? 'በደረሰኝ #፣ በስም፣ ወይም በሰሌዳ ፈልግ...'
                    : 'Search receipt #, owner name, plate...'
                }
                className="w-full h-8 rounded-md border border-[#E2E8F0] bg-white py-1 pl-8 pr-7 text-xs text-[#1C2434] outline-none transition focus:border-primary active:border-primary dark:border-[#2E3A47] dark:bg-[#1C2434] dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute inset-y-0 right-2 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
                  title={isAmharic ? 'ፍለጋውን አጽዳ' : 'Clear search'}
                >
                  <Icon className="material-symbols-outlined text-[16px]">close</Icon>
                </button>
              )}
            </div>

            {/* Status Segmented Pill Tabs (Never overlaps or hangs) */}
            <div className="inline-flex items-center p-0.5 rounded-md bg-[#E2E8F0]/70 dark:bg-[#1C2434]/80 border border-[#E2E8F0] dark:border-[#2E3A47] h-8 shrink-0 overflow-x-auto scrollbar-none sm:ms-auto">
              {[
                { key: 'all' as const, label: isAmharic ? 'ሁሉም' : 'All', count: matrixCounts.all },
                { key: 'active' as const, label: isAmharic ? 'ክፍያ የፈጸሙ' : 'Paid', count: matrixCounts.active },
                { key: 'expiring_soon' as const, label: isAmharic ? 'የደረሰ' : 'Due Soon', count: matrixCounts.expiring },
                { key: 'expired' as const, label: isAmharic ? 'ያልተከፈለባቸው' : 'Overdue', count: matrixCounts.expired },
              ].map((tab) => {
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.key);
                      setPage(1);
                    }}
                    className={`h-7 px-2 sm:px-2.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap select-none ${
                      isActive
                        ? 'bg-white dark:bg-primary text-primary dark:text-white shadow-2xs font-extrabold'
                        : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                        isActive
                          ? 'bg-primary/10 text-primary dark:bg-white/20 dark:text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-[#64748B] dark:text-[#8A99AD]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* MATRIX STATUS LEGEND */}
          <div className="px-3 sm:px-4 py-1.5 bg-slate-50 dark:bg-slate-900/50 border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between sm:justify-end gap-2 w-full max-w-full flex-wrap">
            <div className="flex items-center gap-2.5 sm:gap-3 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <StatusDot status="paid" size={10} />
                <span>{isAmharic ? 'የተከፈለ' : 'Paid'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <StatusDot status="pending" size={10} />
                <span>{isAmharic ? 'ሊያልቅ የደረሰ' : 'Due'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <StatusDot status="unpaid" size={10} />
                <span>{isAmharic ? 'ያልተከፈለ' : 'Unpaid'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <StatusDot status="muted" size={10} />
                <span>{isAmharic ? 'መረጃ የለም' : 'No Record'}</span>
              </span>
            </div>
          </div>

          {/* MONTHLY MATRIX LEDGER TABLE */}
          <div className="overflow-x-hidden md:overflow-x-auto bg-white dark:bg-[#1C2434] w-full max-w-full min-w-0">
            <MonthlyMatrixLedger
              columns={matrixColumns}
              rows={displayMatrixRows}
              showNumbering={true}
              numberHeaderLabel={isAmharic ? 'ተ.ቁ' : '#'}
              memberHeaderLabel={isAmharic ? 'አባል / ባለቤት' : 'Member / Owner'}
              plateHeaderLabel={isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}
              showPlateColumn={true}
              isAmharic={isAmharic}
              expandableMobile={true}
              emptyMessage={isAmharic ? 'ምንም የወርሃዊ መዋጮ መረጃ አልተገኘም።' : 'No ledger records available.'}
              actionsHeaderLabel={isAmharic ? 'ተግባራት' : 'Actions'}
              renderActions={(row, isMobile) => {
                const latestRc = (row as any).allReceipts?.[0] || null;

                if (isMobile) {
                  return (
                    <React.Fragment>
                      {/* 1. Record Payment */}
                      {(isSuperAdmin || canAddReceipt) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const plate = row.plateNumber || String(row.id);
                            handleRegNumberChange(plate);
                            setIsFormOpen(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="w-full min-h-[38px] px-2.5 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-2xs transition-all cursor-pointer"
                        >
                          <Icon name="add_card" size={16} />
                          <span className="truncate">{isAmharic ? 'ክፍያ መዝግብ' : 'Record Payment'}</span>
                        </button>
                      )}

                      {/* 2. View Ledger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const memberReg =
                            registrations.find((r) => String(r.id) === String(row.id)) ||
                            registrations.find((r) => r.plateNumber && row.plateNumber && r.plateNumber.toLowerCase() === row.plateNumber.toLowerCase()) ||
                            null;
                          const memberReceipts = combinedReceipts.filter(
                            (rc) =>
                              (rc.ownerRegistrationId && String(rc.ownerRegistrationId) === String(row.id)) ||
                              (rc.plateNumber && row.plateNumber && rc.plateNumber.toLowerCase() === row.plateNumber.toLowerCase())
                          );
                          setSelectedMemberDetail({ row, member: memberReg, receipts: memberReceipts });
                        }}
                        className="w-full min-h-[38px] px-2.5 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-650 active:scale-95 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-2xs transition-all cursor-pointer"
                      >
                        <Icon name="visibility" size={16} />
                        <span className="truncate">{isAmharic ? 'የሂሳብ መዝገብ' : 'View Ledger'}</span>
                      </button>

                      {/* 3. Print Receipt */}
                      {latestRc && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintReceipt(latestRc);
                          }}
                          className="w-full min-h-[38px] px-2.5 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-sky-50 dark:bg-sky-950/80 hover:bg-sky-100 dark:hover:bg-sky-900 active:scale-95 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-800 shadow-2xs transition-all cursor-pointer"
                        >
                          <Icon name="print" size={16} />
                          <span className="truncate">{isAmharic ? 'ደረሰኝ አትም' : 'Print Receipt'}</span>
                        </button>
                      )}

                      {/* 4. Edit Transaction */}
                      {isSuperAdmin && latestRc && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditTransaction(latestRc);
                          }}
                          className="w-full min-h-[38px] px-2.5 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900 active:scale-95 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 shadow-2xs transition-all cursor-pointer"
                        >
                          <Icon name="edit" size={16} />
                          <span className="truncate">{isAmharic ? 'ክፍያ አርትዕ' : 'Edit Transaction'}</span>
                        </button>
                      )}
                    </React.Fragment>
                  );
                }

                return (
                  <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-nowrap">
                    {/* 1. Record Payment */}
                    {(isSuperAdmin || canAddReceipt) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const plate = row.plateNumber || String(row.id);
                          handleRegNumberChange(plate);
                          setIsFormOpen(true);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-2xs transition-all active:scale-95 cursor-pointer"
                        title={isAmharic ? 'አዲስ ክፍያ መዝግብ' : 'Record New Payment'}
                      >
                        <Icon name="add_card" size={13} />
                        <span>{isAmharic ? 'ክፍያ' : 'Pay'}</span>
                      </button>
                    )}

                    {/* 2. View Ledger */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const memberReg =
                          registrations.find((r) => String(r.id) === String(row.id)) ||
                          registrations.find((r) => r.plateNumber && row.plateNumber && r.plateNumber.toLowerCase() === row.plateNumber.toLowerCase()) ||
                          null;
                        const memberReceipts = combinedReceipts.filter(
                          (rc) =>
                            (rc.ownerRegistrationId && String(rc.ownerRegistrationId) === String(row.id)) ||
                            (rc.plateNumber && row.plateNumber && rc.plateNumber.toLowerCase() === row.plateNumber.toLowerCase())
                        );
                        setSelectedMemberDetail({ row, member: memberReg, receipts: memberReceipts });
                      }}
                      className="px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 transition-all active:scale-95 cursor-pointer"
                      title={isAmharic ? 'የአባል ሂሳብ መዝገብ እይ' : 'View Member Ledger'}
                    >
                      <Icon name="visibility" size={13} />
                      <span>{isAmharic ? 'ሂሳብ' : 'Ledger'}</span>
                    </button>

                    {/* 3. Print Receipt */}
                    {latestRc && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintReceipt(latestRc);
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-sky-50 dark:bg-sky-950/80 hover:bg-sky-100 dark:hover:bg-sky-900 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-800 transition-all active:scale-95 cursor-pointer"
                        title={isAmharic ? 'የመጨረሻውን ደረሰኝ አትም' : 'Print Latest Receipt'}
                      >
                        <Icon name="print" size={13} />
                        <span>{isAmharic ? 'ሕትመት' : 'Print'}</span>
                      </button>
                    )}

                    {/* 4. Edit Transaction */}
                    {isSuperAdmin && latestRc && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditTransaction(latestRc);
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/80 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 transition-all active:scale-95 cursor-pointer"
                        title={isAmharic ? 'የክፍያ ዝርዝር አርትዕ (SuperAdmin)' : 'Edit Transaction (SuperAdmin)'}
                      >
                        <Icon name="edit" size={13} />
                        <span>{isAmharic ? 'አርትዕ' : 'Edit'}</span>
                      </button>
                    )}
                  </div>
                );
              }}
              onRowClick={(row) => {
                const memberReg =
                  registrations.find((r) => String(r.id) === String(row.id)) ||
                  registrations.find(
                    (r) =>
                      r.plateNumber &&
                      row.plateNumber &&
                      r.plateNumber.toLowerCase() === row.plateNumber.toLowerCase()
                  ) ||
                  null;

                const memberReceipts = combinedReceipts.filter(
                  (rc) =>
                    (rc.ownerRegistrationId && String(rc.ownerRegistrationId) === String(row.id)) ||
                    (memberReg && rc.ownerRegistrationId && String(rc.ownerRegistrationId) === String(memberReg.id)) ||
                    (rc.plateNumber && row.plateNumber && rc.plateNumber.toLowerCase() === row.plateNumber.toLowerCase()) ||
                    (rc.plateNumber && memberReg?.plateNumber && rc.plateNumber.toLowerCase() === memberReg.plateNumber.toLowerCase())
                );

                setSelectedMemberDetail({
                  row,
                  member: memberReg,
                  receipts: memberReceipts,
                });
                setReconcileVerifyInput('');
                setReconcileVerifyStatus('idle');
              }}
            />
          </div>

          {/* PAGINATION BAR (TAILADMIN DESIGN) - FIXED / STICKY AT BOTTOM */}
          <div className="bg-white dark:bg-[#1C2434] px-3.5 sm:px-5 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#8A99AD] border-t border-[#E2E8F0] dark:border-[#2E3A47] shrink-0 sticky bottom-0 z-10 shadow-2xs">
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-medium text-[#1C2434] dark:text-white">{isAmharic ? 'በአንድ ገጽ:' : 'Rows per page:'}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="py-1 px-2 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="hidden sm:inline font-medium text-[#64748B] dark:text-[#8A99AD]">
                {isAmharic
                  ? `${startIndex + 1}-${Math.min(startIndex + pageSize, totalEntries)} ከ ${totalEntries} አባላት`
                  : `Showing ${startIndex + 1}–${Math.min(startIndex + pageSize, totalEntries)} of ${totalEntries} members`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={activePage <= 1 || isFetchingRows}
                className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Icon className="material-symbols-outlined text-[16px]">chevron_left</Icon>
                <span>{isAmharic ? 'ቀዳሚ' : 'Previous'}</span>
              </button>

              <span className="px-3 py-1.5 bg-primary text-white rounded-sm font-semibold font-mono text-xs shadow-xs">
                {activePage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={activePage >= totalPages || isFetchingRows}
                className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE UNIFIED WORKSPACE CARD SHELL */}
      </div>

      {/* MEMBER FULL INFORMATION DRAWER (Slide-Over Side-Sheet) */}
      {selectedMemberDetail && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Subtle semi-transparent backdrop */}
          <div
            onClick={() => setSelectedMemberDetail(null)}
            className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 transition-opacity"
          />

          {/* Side-Sheet Drawer Content Container */}
          <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-300 dark:border-slate-800 shadow-2xl z-10 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 text-primary">
                  <Icon name="assignment_ind" size={24} />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h3 className="text-sm sm:text-base font-black tracking-wide truncate flex items-center gap-2">
                    <span>{isAmharic ? 'የአባል ሙሉ መረጃ' : 'Member Full Information'}</span>
                  </h3>
                  <p className="text-xs text-slate-300 font-medium truncate">
                    {selectedMemberDetail.member?.fullName || selectedMemberDetail.row.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(selectedMemberDetail.member?.plateNumber || selectedMemberDetail.row.plateNumber) && (
                  <span className="hidden sm:inline-block px-2.5 py-1 rounded bg-slate-800 border border-slate-700 font-mono font-bold text-xs text-amber-400">
                    {selectedMemberDetail.member?.plateNumber || selectedMemberDetail.row.plateNumber}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMemberDetail(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body: Scrollable */}
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Member Overview: 2-Column Side-by-Side Grid (Portrait & Member Information) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Column 1: Portrait Photo Card */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center relative overflow-hidden">
                  <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-700/80 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Icon name="person" size={14} className="text-primary" />
                      <span>{isAmharic ? 'የአባል ፎቶ' : 'Member Portrait'}</span>
                    </span>
                    {(selectedMemberDetail.member?.userPortraitPhoto || selectedMemberDetail.member?.ownerPhoto || selectedMemberDetail.member?.userPortraitThumbnail) && (
                      <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
                        <Icon name="zoom_in" size={12} />
                        {isAmharic ? 'አጉላ' : 'Zoom'}
                      </span>
                    )}
                  </div>

                  {selectedMemberDetail.member?.userPortraitPhoto || selectedMemberDetail.member?.ownerPhoto || selectedMemberDetail.member?.userPortraitThumbnail ? (
                    <div
                      onClick={() => {
                        const photoUrl = selectedMemberDetail.member?.userPortraitPhoto || selectedMemberDetail.member?.ownerPhoto || selectedMemberDetail.member?.userPortraitThumbnail;
                        if (photoUrl) {
                          setPreviewDocPhoto({
                            url: photoUrl,
                            title: isAmharic ? 'የአባል ፎቶ' : 'Member Portrait Photo',
                          });
                        }
                      }}
                      className="relative w-full max-w-[180px] aspect-square rounded-xl overflow-hidden border-2 border-primary/60 shadow-md cursor-pointer group bg-slate-200 dark:bg-slate-700"
                    >
                      <SmartImage
                        src={selectedMemberDetail.member?.userPortraitPhoto || selectedMemberDetail.member?.ownerPhoto || selectedMemberDetail.member?.userPortraitThumbnail || ''}
                        alt={selectedMemberDetail.member?.fullName || 'Member Photo'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity font-bold gap-1 text-xs">
                        <Icon name="zoom_in" size={18} />
                        <span>{isAmharic ? 'ትልቅ እይ' : 'View Full'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full max-w-[180px] aspect-square rounded-xl bg-primary/10 border-2 border-dashed border-primary/30 flex flex-col items-center justify-center text-primary gap-2">
                      <span className="text-4xl font-black">
                        {(selectedMemberDetail.member?.fullName || selectedMemberDetail.row.title || 'M').charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {isAmharic ? 'ፎቶ አልተጫነም' : 'No Photo Uploaded'}
                      </span>
                    </div>
                  )}

                  {/* Subtitle / Plate badge in portrait card */}
                  <div className="mt-3 flex items-center gap-1.5 justify-center flex-wrap">
                    <span className="font-mono font-bold text-xs bg-slate-900 text-amber-400 dark:bg-slate-950 px-2.5 py-0.5 rounded border border-slate-700">
                      {selectedMemberDetail.member?.plateNumber || selectedMemberDetail.row.plateNumber || '—'}
                    </span>
                  </div>
                </div>

                {/* Column 2: Member Information Card */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700/80">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Icon name="assignment_ind" size={14} className="text-primary" />
                        <span>{isAmharic ? 'የአባል ዝርዝር መረጃ' : 'Member Details'}</span>
                      </span>
                      {selectedMemberDetail.member?.status && (
                        <StatusBadge
                          label={selectedMemberDetail.member.status.replace('_', ' ').toUpperCase()}
                          variant={
                            selectedMemberDetail.member.status === 'approved'
                              ? 'success'
                              : selectedMemberDetail.member.status === 'pending_approval'
                              ? 'pending'
                              : selectedMemberDetail.member.status === 'printed' || selectedMemberDetail.member.status === 'ordered_print'
                              ? 'info'
                              : 'danger'
                          }
                        />
                      )}
                    </div>

                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {isAmharic ? 'ሙሉ ስም' : 'Full Name'}
                      </span>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {selectedMemberDetail.member?.fullName || selectedMemberDetail.row.title}
                      </h4>
                    </div>

                    {selectedMemberDetail.member?.phone && (
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {isAmharic ? 'ስልክ ቁጥር' : 'Phone Number'}
                        </span>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 mt-0.5">
                          <Icon name="phone" size={13} className="text-primary shrink-0" />
                          <a
                            href={`tel:${selectedMemberDetail.member.phone}`}
                            className="font-mono font-bold hover:text-primary transition-colors text-xs"
                          >
                            {selectedMemberDetail.member.phone}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedMemberDetail.member?.phone || '', 'Phone')}
                            className="text-[10px] p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary transition-colors cursor-pointer"
                            title={isAmharic ? 'ስልክ ቁጥር ቅዳ' : 'Copy Phone'}
                          >
                            <Icon name="content_copy" size={11} />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {isAmharic ? 'ክፍለ ከተማ' : 'Subcity'}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block truncate mt-0.5">
                          {selectedMemberDetail.member?.subCity || '—'}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {isAmharic ? 'የመታወቂያ ቁጥር' : 'Member ID'}
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs block truncate mt-0.5">
                          #{selectedMemberDetail.member?.id || selectedMemberDetail.row.id}
                        </span>
                      </div>
                    </div>

                    {selectedMemberDetail.member?.registrationDate && (
                      <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {isAmharic ? 'የተመዘገበበት ቀን (ኢትዮጵያ)' : 'Registration Date (E.C.)'}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-xs block mt-0.5">
                          {formatEthiopianDate(selectedMemberDetail.member.registrationDate, isAmharic ? 'am' : 'en')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Vehicle & Technical Specifications Card */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-slate-950 dark:text-white">
                    <Icon name="two_wheeler" size={18} className="text-primary" />
                    <span>{isAmharic ? 'የተሽከርካሪ እና የሞተር መረጃ' : 'Vehicle & Motor Specifications'}</span>
                  </div>
                  <span className="font-mono font-bold text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
                    {selectedMemberDetail.member?.plateNumber || selectedMemberDetail.row.plateNumber || '—'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}
                    </span>
                    <span className="font-mono font-black text-slate-900 dark:text-white text-xs block mt-0.5">
                      {selectedMemberDetail.member?.plateNumber || selectedMemberDetail.row.plateNumber || '—'}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAmharic ? 'የተሽከርካሪ ምድብ' : 'Vehicle Category'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs block mt-0.5">
                      {selectedMemberDetail.member?.vehicleCategory === 'electric'
                        ? isAmharic ? 'የኤሌክትሪክ ሞተር' : 'Electric'
                        : isAmharic ? 'ከ110cc በታች ቤንዚን' : 'Gas under 110cc'}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAmharic ? 'የሞተር / ሴሪያል ቁጥር' : 'Engine / Serial #'}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-xs block mt-0.5 truncate">
                      {selectedMemberDetail.member?.engineOrSerialNo || selectedMemberDetail.member?.engineNumber || '—'}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAmharic ? 'የሻሲ ቁጥር' : 'Chassis #'}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-xs block mt-0.5 truncate">
                      {selectedMemberDetail.member?.chassisNumber || '—'}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAmharic ? 'ብራንድ / ሞዴል' : 'Brand & Model'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs block mt-0.5 truncate">
                      {[selectedMemberDetail.member?.motorBrand, selectedMemberDetail.member?.motorModel].filter(Boolean).join(' ') || '—'}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {isAmharic ? 'የአገልግሎት ዘርፍ' : 'Service Category'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs block mt-0.5 truncate">
                      {selectedMemberDetail.member?.serviceCategory || (isAmharic ? 'መደበኛ' : 'Standard')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Official Member Documents & Photos */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-slate-950 dark:text-white">
                    <Icon name="photo_library" size={18} className="text-primary" />
                    <span>{isAmharic ? 'የአባሉ ሰነዶች እና ፎቶዎች' : 'Member Documents & Photos'}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isAmharic ? 'ትልቅ ለማየት ፎቶውን ይንኩ' : 'Click thumbnail to zoom'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    {
                      label: isAmharic ? 'የአባል ፎቶ' : 'Member Photo',
                      url: selectedMemberDetail.member?.userPortraitPhoto || selectedMemberDetail.member?.ownerPhoto || selectedMemberDetail.member?.userPortraitThumbnail,
                    },
                    {
                      label: isAmharic ? 'የታደሰ መታወቂያ' : 'National ID Front',
                      url: selectedMemberDetail.member?.nationalIdPhoto,
                    },
                    {
                      label: isAmharic ? 'የመንጃ ፈቃድ' : 'Driving License',
                      url: selectedMemberDetail.member?.drivingLicensePhoto,
                    },
                    {
                      label: isAmharic ? 'የማሽከርከር ፈቃድ' : 'Driving Permit',
                      url: selectedMemberDetail.member?.drivingPermitPhoto,
                    },
                  ].map((doc, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (doc.url) {
                          setPreviewDocPhoto({ url: doc.url, title: doc.label });
                        }
                      }}
                      className={`relative p-2 rounded-lg border text-center transition-all ${
                        doc.url
                          ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-primary cursor-pointer group shadow-2xs'
                          : 'bg-slate-100/50 dark:bg-slate-900/40 border-dashed border-slate-200 dark:border-slate-800 cursor-default'
                      }`}
                    >
                      <span className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate mb-1.5">
                        {doc.label}
                      </span>
                      {doc.url ? (
                        <div className="w-full h-20 rounded-md overflow-hidden bg-black/10 relative">
                          <SmartImage
                            src={doc.url}
                            alt={doc.label}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <Icon name="zoom_in" size={18} />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-20 rounded-md flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800">
                          <Icon name="image_not_supported" size={20} />
                          <span className="text-[9px] mt-1 font-medium">{isAmharic ? 'አልተያያዘም' : 'Not attached'}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Membership Fee & Payment Receipts History */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-slate-950 dark:text-white">
                    <Icon name="receipt_long" size={18} className="text-primary" />
                    <span>{isAmharic ? 'የተመዘገቡ የክፍያ ደረሰኞች ታሪክ' : 'Payment Receipts & Dues History'}</span>
                  </div>
                  <span className="font-mono font-bold text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                    {selectedMemberDetail.receipts.length} {isAmharic ? 'ደረሰኞች' : 'Receipts'}
                  </span>
                </div>

                {selectedMemberDetail.receipts.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedMemberDetail.receipts.map((rc) => (
                      <div
                        key={rc.id}
                        className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-slate-900 dark:text-white text-xs">
                              #{rc.receiptNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rc.receiptNumber, 'Receipt #')}
                              className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                              title={isAmharic ? 'ቅዳ' : 'Copy'}
                            >
                              <Icon name={reconcileCopiedField === 'Receipt #' ? 'check' : 'content_copy'} size={13} />
                            </button>
                            {rc.verifiedByCheki && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 flex items-center gap-0.5">
                                <Icon name="verified" size={11} />
                                <span>{rc.chekiBank ? rc.chekiBank.toUpperCase() : 'Bank'} Verified</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 text-xs">
                              {rc.amount ? `${rc.amount} ETB` : '500 ETB'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(rc.id)}
                              className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                              title={isAmharic ? 'ደረሰኝ ሰርዝ' : 'Delete Receipt'}
                            >
                              <Icon name="delete" size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="text-[10px] block text-slate-400 font-bold">
                              {isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] block text-slate-400 font-bold">
                              {isAmharic ? 'የማብቂያ ቀን' : 'Expiration Date'}
                            </span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              {formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] block text-slate-400 font-bold">
                              {isAmharic ? 'የመዘገበው ሰራተኛ' : 'Entered By'}
                            </span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {rc.enteredBy || 'System'}
                            </span>
                          </div>
                        </div>

                        {rc.receiptScreenshot && (
                          <div className="pt-1.5 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewDocPhoto({
                                  url: rc.receiptScreenshot || '',
                                  title: `${isAmharic ? 'የደረሰኝ ፎቶ' : 'Receipt Proof'} #${rc.receiptNumber}`,
                                })
                              }
                              className="text-xs text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Icon name="receipt" size={14} />
                              <span>{isAmharic ? 'የተያያዘውን የክፍያ ደረሰኝ ፎቶ ይመልከቱ' : 'View Attached Receipt Screenshot'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400 space-y-1">
                    <Icon name="receipt" size={24} className="mx-auto text-slate-400" />
                    <p className="font-bold text-xs">
                      {isAmharic ? 'ምንም የተመዘገበ የወርሃዊ ክፍያ ደረሰኝ የለም።' : 'No payment receipts recorded yet for this member.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
              {canAddReceipt && (
                <button
                  type="button"
                  onClick={() => {
                    const plate = selectedMemberDetail.member?.plateNumber || selectedMemberDetail.row.plateNumber || String(selectedMemberDetail.row.id);
                    handleRegNumberChange(plate);
                    setSelectedMemberDetail(null);
                    setIsFormOpen(true);
                  }}
                  className="py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                >
                  <Icon name="add_card" size={16} />
                  <span>{isAmharic ? 'አዲስ ክፍያ መዝግብ' : 'Record New Payment'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedMemberDetail(null)}
                className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all cursor-pointer shadow-xs ml-auto"
              >
                {isAmharic ? 'ዝጋ' : 'Close Drawer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT & PHOTO LIGHTBOX MODAL */}
      {previewDocPhoto && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div className="relative max-w-3xl w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 animate-in zoom-in-95 duration-150">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold text-sm">{previewDocPhoto.title}</span>
              <button
                type="button"
                onClick={() => setPreviewDocPhoto(null)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center cursor-pointer text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewDocPhoto.url}
                alt={previewDocPhoto.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewDocPhoto(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                {isAmharic ? 'ዝጋ' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 md:pt-16 pb-8 p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <Icon className="material-symbols-outlined text-[28px]">warning</Icon>
              <h3 className="text-base font-black  tracking-wide">
                {isAmharic ? 'የክፍያ ደረሰኝ ሰርዝ?' : 'Delete Payment Receipt?'}
              </h3>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
              {isAmharic
                ? 'ይህንን የተመዘገበ የክፍያ ደረሰኝ ከሲስተሙ ለመሰረዝ እርግጠኛ ነዎት? ይህ ተግባር አይመለስም።'
                : 'Are you sure you want to delete this registered payment receipt? This action cannot be undone.'}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
              >
                {isAmharic ? 'ተመለስ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all cursor-pointer shadow-xs"
              >
                {isAmharic ? 'አዎ ሰርዝ' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TRANSACTION MODAL (SUPERADMIN ONLY) */}
      {editingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Icon name="edit" size={18} className="text-amber-500" />
                <span>{isAmharic ? 'የክፍያ ዝርዝር አርትዕ' : 'Edit Transaction'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingReceipt(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-md"
                title={isAmharic ? 'ዝጋ' : 'Close'}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAmharic ? 'የደረሰኝ ቁጥር' : 'Receipt Number'}
                </label>
                <input
                  type="text"
                  disabled
                  value={editingReceipt.receiptNumber}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-500 dark:text-slate-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAmharic ? 'የተከፈለ መጠን (ብር)' : 'Amount Paid (ETB)'}
                </label>
                <input
                  type="number"
                  value={editFormAmount}
                  onChange={(e) => setEditFormAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAmharic ? 'የተከፈለበት ቀን (E.C.)' : 'Payment Date (E.C.)'}
                </label>
                <EthiopianDatePickerPopover
                  value={editFormPaymentDate}
                  onChange={(newDate) => {
                    setEditFormPaymentDate(newDate);
                    setEditFormExpDate(calculateOneMonthExpiration(newDate));
                  }}
                  lang={isAmharic ? 'am' : 'en'}
                  className="w-full"
                />
              </div>

              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center justify-between shadow-2xs">
                <span>{isAmharic ? 'የማብቂያ ቀን (ኢትዮጵያ):' : 'Calculated Expiry (Eth):'}</span>
                <span className="font-mono">{formatEthiopianDate(editFormExpDate || editingReceipt.expirationDate, isAmharic ? 'am' : 'en')}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAmharic ? 'ማስታወሻ / ዝርዝር' : 'Notes / Description'}
                </label>
                <input
                  type="text"
                  value={editFormNotes}
                  onChange={(e) => setEditFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingReceipt(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                {isAmharic ? 'ሰርዝ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveEditedTransaction}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs cursor-pointer"
              >
                {isAmharic ? 'አስቀምጥ' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
