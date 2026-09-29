import React, { useState, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { KpiCard, MonthlyMatrixLedger, StatusDot } from './ui/AssocDesignSystem';
import { Language, UserRole, MotorcycleRegistration, PaymentReceipt, TermStatus } from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus, calculateTermStatus } from '../utils/paymentUtils';
import { SmartImage } from './SmartImage';
import { getPermissionState, savePaymentReceiptToDb, deletePaymentReceiptFromDb } from '../services/dbService';
import { formatEthiopianDate, formatEthiopianDateTime, toEthiopianDate, ethiopianToGregorian, ETHIOPIAN_MONTHS, EthiopianDate } from '../utils/ethiopianCalendar';
import { LoadingSpinner } from './ui/Skeleton';
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
    () => new Date().toISOString().split('T')[0]
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

  // Reconciliation Drawer State (Replaces modal-heavy flows with inline right slide-over side-sheet)
  const [reconcileReceipt, setReconcileReceipt] = useState<PaymentReceipt | null>(null);
  const [reconcileVerifyInput, setReconcileVerifyInput] = useState('');
  const [reconcileVerifyStatus, setReconcileVerifyStatus] = useState<'idle' | 'matched' | 'mismatch'>('idle');
  const [reconcileCopiedField, setReconcileCopiedField] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
      const res = await fetch('/api/cheki/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: ref,
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
    const list: PaymentReceipt[] = [...(paymentReceipts || [])];
    const existingKeys = new Set(list.map((r) => cleanStr(r.receiptNumber)));

    if (Array.isArray(registrations)) {
      registrations.forEach((reg) => {
        if (!reg) return;
        const hasPayment = Boolean(
          reg.receiptNumber ||
          reg.lastReceiptNumber ||
          reg.lastPaymentDate ||
          reg.paymentAmount ||
          reg.lastPaymentAmount ||
          reg.receiptScreenshot ||
          reg.activeTermExpirationDate
        );
        if (!hasPayment) return;

        const rcNum = cleanStr(reg.lastReceiptNumber || reg.receiptNumber);
        if (rcNum && existingKeys.has(rcNum)) return;
        if (rcNum) existingKeys.add(rcNum);

        const payDate = reg.lastPaymentDate || reg.registrationDate || new Date().toISOString().split('T')[0];
        const expDate = reg.activeTermExpirationDate || (payDate ? calculateOneMonthExpiration(payDate) : '');

        list.push({
          id: `reg-receipt-${reg.id}`,
          receiptNumber: reg.lastReceiptNumber || reg.receiptNumber || `REC-${reg.id}`,
          ownerRegistrationId: reg.id,
          ownerName: reg.fullName || '',
          plateNumber: reg.plateNumber,
          phone: reg.phone,
          paymentDate: payDate,
          expirationDate: expDate,
          amount: reg.lastPaymentAmount || reg.paymentAmount || '500 ETB',
          receiptScreenshot: reg.receiptScreenshot,
          enteredBy: reg.registeredBy || 'SYSTEM',
          createdAt: (reg as any).createdAt || `${payDate}T08:00:00Z`,
          status: 'valid',
          verifiedByCheki: true,
          chekiBank: 'CBE',
          notes: reg.plateNumber ? `Plate: ${reg.plateNumber}` : undefined,
        });
      });
    }

    return list;
  }, [paymentReceipts, registrations]);

  // Auto-calculated registration details, last payment expiration status, and debt
  const selectedRegInfo = useMemo(() => {
    const val = regNumber.trim().toLowerCase();
    if (!val) return null;

    const found = registrations.find(
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
    const payDateStr = rawPayDate.split('T')[0].split(' ')[0].trim();
    if (!payDateStr) return true;

    // 1. Direct match with selected date range
    if (startDate && endDate) {
      if (payDateStr >= startDate && payDateStr <= endDate) return true;
    } else if (startDate && !endDate) {
      if (payDateStr >= startDate) return true;
    } else if (!startDate && endDate) {
      if (payDateStr <= endDate) return true;
    }

    // 2. Preset 'this_month': Ensure payments in current Ethiopian month OR current calendar month OR active term covering this month match
    if (dateRangePreset === 'this_month') {
      const today = new Date();
      const currentGregMonth = today.toISOString().slice(0, 7); // e.g. "2026-09"
      if (payDateStr.startsWith(currentGregMonth)) {
        return true;
      }

      try {
        const ethPay = toEthiopianDate(payDateStr);
        const ethNow = toEthiopianDate(today);
        if (ethPay.year === ethNow.year && ethPay.month === ethNow.month) {
          return true;
        }
      } catch {}

      // Active term coverage: if payment was made for this month
      const expDateStr = (rc.expirationDate || '').split('T')[0].split(' ')[0].trim();
      if (expDateStr && startDate && expDateStr >= startDate && payDateStr <= (endDate || startDate)) {
        return true;
      }
    }

    // 3. Preset 'this_year': Ensure payments in current Ethiopian year OR current calendar year match
    if (dateRangePreset === 'this_year') {
      const currentGregYear = new Date().toISOString().slice(0, 4);
      if (payDateStr.startsWith(currentGregYear)) {
        return true;
      }
      try {
        const ethPay = toEthiopianDate(payDateStr);
        const ethNow = toEthiopianDate(new Date());
        if (ethPay.year === ethNow.year) {
          return true;
        }
      } catch {}
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
        createdAt: new Date().toISOString(),
        enteredAt: new Date().toISOString(),
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

      if (reconcileReceipt && reconcileReceipt.id === deleteConfirmId) {
        setReconcileReceipt(null);
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

      const numAmount = parseFloat(String(rc.amount || '500').replace(/[^0-9.]/g, '')) || 500;
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

  // Monthly Matrix Ledger columns: Meskerem up to current Ethiopian month of this Ethiopian year
  const matrixColumns = useMemo(() => {
    const cols = [];
    const maxMonth = Math.min(Math.max(currentEthMonth, 1), 13);
    for (let m = 1; m <= maxMonth; m++) {
      const monthObj = ETHIOPIAN_MONTHS[m - 1];
      const label = isAmharic ? monthObj.shortAm : monthObj.shortEn;
      const fullTitle = isAmharic ? `${monthObj.am} (${monthObj.en})` : `${monthObj.en} - ${monthObj.am}`;
      cols.push({
        key: `eth_m_${m}`,
        monthNum: m,
        label,
        title: fullTitle,
        year: currentEthYear,
      });
    }
    return cols;
  }, [currentEthMonth, currentEthYear, isAmharic]);

  // All Matrix Rows generated across member registrations with real-time payment status lookup
  const allMatrixRows = useMemo(() => {
    const cleanPlate = (s?: string) => (s || '').replace(/[\s\-_]/g, '').toLowerCase();
    const cleanStr = (s?: string) => (s || '').trim().toLowerCase();
    const cleanPhone = (s?: string) => (s || '').replace(/[^0-9]/g, '');

    const members = Array.isArray(registrations) ? [...registrations] : [];

    // Also include any unique receipt owners with plate numbers not in registrations
    const regIds = new Set(members.map((m) => cleanStr(m.id)));
    const regPlates = new Set(members.map((m) => cleanPlate(m.plateNumber)).filter(Boolean));
    const regNames = new Set(members.map((m) => cleanStr(m.fullName)).filter(Boolean));

    combinedReceipts.forEach((rc) => {
      const rcRegId = cleanStr(rc.ownerRegistrationId);
      const rcPlate = cleanPlate(rc.plateNumber);
      const rcName = cleanStr(rc.ownerName);

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

      // 1. Match from full combinedReceipts collection across multiple keys
      const matchedReceipts = combinedReceipts.filter((rc) => {
        if (!rc) return false;
        if (rc.ownerRegistrationId && cleanStr(rc.ownerRegistrationId) === regIdClean) return true;
        if (regPlateClean && rc.plateNumber && cleanPlate(rc.plateNumber) === regPlateClean) return true;
        if (regPhoneClean && rc.phone && cleanPhone(rc.phone) === regPhoneClean) return true;
        if (regNameClean && rc.ownerName && cleanStr(rc.ownerName) === regNameClean) return true;
        return false;
      });

      // 2. Also incorporate payment receipt data directly attached to the registration intake record
      const allReceipts = [...matchedReceipts];
      const hasRegReceipt = Boolean(
        reg.receiptNumber ||
        reg.lastReceiptNumber ||
        reg.paymentAmount ||
        reg.lastPaymentAmount ||
        reg.lastPaymentDate ||
        reg.activeTermExpirationDate
      );

      if (hasRegReceipt) {
        const regReceiptNo = cleanStr(reg.lastReceiptNumber || reg.receiptNumber);
        const alreadyInList = allReceipts.some((r) => r.receiptNumber && cleanStr(r.receiptNumber) === regReceiptNo);
        if (!alreadyInList) {
          const payDate = reg.lastPaymentDate || reg.registrationDate || new Date().toISOString().split('T')[0];
          const expDate = reg.activeTermExpirationDate || calculateOneMonthExpiration(payDate);
          allReceipts.push({
            id: `reg-init-${reg.id}`,
            receiptNumber: reg.lastReceiptNumber || reg.receiptNumber || 'INITIAL',
            ownerRegistrationId: reg.id,
            ownerName: reg.fullName || '',
            plateNumber: reg.plateNumber,
            phone: reg.phone,
            paymentDate: payDate,
            expirationDate: expDate,
            amount: reg.lastPaymentAmount || reg.paymentAmount || '500 ETB',
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
        return {
          receipt: rc,
          payEth,
          expEth,
          status, // 'active' | 'expiring_soon' | 'expired'
          daysRemaining,
        };
      });

      // Map each column month to its status
      const periods: Record<string, 'paid' | 'unpaid' | 'pending' | 'muted'> = {};

      matrixColumns.forEach((col) => {
        const targetMonth = col.monthNum;
        const targetYear = col.year;
        const isCurrentMonth = targetMonth === currentEthMonth && targetYear === currentEthYear;

        // If member has no payment records whatsoever in the DB, show muted dot
        if (!hasAnyPaymentRecord) {
          periods[col.key] = 'muted';
          return;
        }

        // A. Check if any receipt was paid specifically in this Ethiopian month/year
        const directMonthMatches = parsedReceipts.filter(
          (item) => item.payEth && item.payEth.year === targetYear && item.payEth.month === targetMonth
        );

        // B. Check if any receipt term covers this Ethiopian month (validity duration spans across this month)
        const targetPeriodIndex = targetYear * 13 + targetMonth;
        const coveringMatches = parsedReceipts.filter((item) => {
          if (!item.payEth) return false;
          const payIndex = item.payEth.year * 13 + item.payEth.month;
          const expIndex = item.expEth ? item.expEth.year * 13 + item.expEth.month : payIndex;
          return targetPeriodIndex >= payIndex && targetPeriodIndex <= expIndex;
        });

        const activeReceipt = parsedReceipts.find((r) => r.status === 'active');
        const expiringReceipt = parsedReceipts.find((r) => r.status === 'expiring_soon');

        if (isCurrentMonth) {
          // For current month: evaluate live active status
          if (reg.termStatus === 'CURRENT' || activeReceipt) {
            periods[col.key] = 'paid';
          } else if (reg.termStatus === 'DUE' || expiringReceipt) {
            periods[col.key] = 'pending';
          } else if (coveringMatches.length > 0 || directMonthMatches.length > 0) {
            const hasActiveCover = coveringMatches.some((m) => m.status === 'active');
            const hasExpiringCover = coveringMatches.some((m) => m.status === 'expiring_soon');
            if (hasActiveCover) periods[col.key] = 'paid';
            else if (hasExpiringCover) periods[col.key] = 'pending';
            else periods[col.key] = 'unpaid';
          } else if (hasAnyPaymentRecord) {
            // Member has payment history but has not paid for the current month
            periods[col.key] = 'unpaid';
          } else {
            periods[col.key] = 'muted';
          }
        } else {
          // For other/past months:
          if (directMonthMatches.length > 0 || coveringMatches.length > 0) {
            periods[col.key] = 'paid';
          } else {
            // Check registration date to see if member was already enrolled during that month
            let regEth: EthiopianDate | null = null;
            try {
              if (reg.registrationDate) regEth = toEthiopianDate(reg.registrationDate);
            } catch {}

            const regPeriodIndex = regEth ? regEth.year * 13 + regEth.month : 0;
            if (regPeriodIndex && targetPeriodIndex < regPeriodIndex) {
              // Member was not yet registered in this past month
              periods[col.key] = 'muted';
            } else {
              // Member was registered but has no payment for that month
              periods[col.key] = 'unpaid';
            }
          }
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
  }, [registrations, combinedReceipts, matrixColumns, currentEthMonth, currentEthYear, isAmharic]);

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

  // Matrix member counts according to current month status
  const matrixCounts = useMemo(() => {
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
  }, [allMatrixRows]);

  // Ethiopian Monthly Fee Statistics metrics
  const ethiopianMonthlyMetrics = useMemo(() => {
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

  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-4 pb-12">
      {/* HEADER SECTION: Minimized, sleek, matching other tables in the app */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-[#1C2434] py-2.5 px-3.5 sm:px-4 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] shadow-2xs">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-[#1C2434] dark:text-white tracking-tight flex items-center gap-2">
            <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Icon className="material-symbols-outlined text-[18px] shrink-0">
                payments
              </Icon>
            </span>
            <span>{isAmharic ? 'የአባልነት ክፍያ ማህደር' : 'Membership Fee Directory'}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {canAddReceipt ? (
            <button
              type="button"
              onClick={() => setIsFormOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3C50E0] hover:bg-[#3C50E0]/90 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
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

      {/* TOP-LEVEL VIEW TABS: SEPARATE TABS FOR TABLE AND METRICS */}
      {canViewTable && canViewKPIs && (
        <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] rounded-sm px-4 pt-1 shadow-2xs">
          <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto scrollbar-none -mb-[1px]">
            <button
              type="button"
              onClick={() => setActiveMainTab('table')}
              className={`group relative flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                currentTab === 'table'
                  ? 'border-[#3C50E0] text-[#3C50E0] dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:border-[#CBD5E1]'
              }`}
            >
              <Icon className="material-symbols-outlined text-[18px]">table_chart</Icon>
              <span>{isAmharic ? 'የደረሰኞች ዝርዝር ሰንጠረዥ' : 'Receipts Table'}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                  currentTab === 'table'
                    ? 'bg-[#3C50E0]/10 text-[#3C50E0] dark:bg-blue-400/10 dark:text-blue-300'
                    : 'bg-[#F1F5F9] text-[#64748B] dark:bg-[#24303F] dark:text-[#8A99AD]'
                }`}
              >
                {filteredMatrixRows.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('metrics')}
              className={`group relative flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                currentTab === 'metrics'
                  ? 'border-[#3C50E0] text-[#3C50E0] dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:border-[#CBD5E1]'
              }`}
            >
              <Icon className="material-symbols-outlined text-[18px]">payments</Icon>
              <span>{isAmharic ? 'የወርሃዊ ክፍያ ስታቲስቲክስ' : 'Monthly Fee Statistics'}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  currentTab === 'metrics'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-[#F1F5F9] text-[#64748B] dark:bg-[#24303F] dark:text-[#8A99AD]'
                }`}
              >
                {ethiopianMonthlyMetrics.totalRevenue.toLocaleString()} ETB
              </span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: MONTHLY FEE STATISTICS VIEW (STANDALONE DEDICATED TAB) */}
      {currentTab === 'metrics' && canViewKPIs && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Date Filter Card for Metrics (Kept per User Request) */}
          <div className="rounded-sm border border-[#E2E8F0] bg-white shadow-default dark:border-[#2E3A47] dark:bg-[#1C2434] relative">
            {renderDateRangePicker()}
          </div>

          {/* MONTHLY FEE STATISTICS CONTAINER */}
          <div className="p-3.5 sm:p-5 space-y-4 bg-white dark:bg-[#1C2434] rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] shadow-default">
            {/* Header with Ethiopian Month Title & Badge */}
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

              {/* Month Badge */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300/50 dark:border-emerald-700/50 whitespace-nowrap">
                  {ethiopianMonthlyMetrics.monthName} {ethiopianMonthlyMetrics.targetYear} {isAmharic ? 'ዓ.ም' : 'E.C.'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#3C50E0]/10 text-[#3C50E0] dark:text-blue-400 border border-[#3C50E0]/20 shrink-0">
                  {isAmharic ? 'ወቅታዊ' : 'Current'}
                </span>
              </div>
            </div>

            {/* 5-Column Responsive Metric Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 1. Paid Members */}
              <div
                onClick={() => {
                  setStatusFilter('active');
                  setActiveMainTab('table');
                }}
                className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-500/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 hover:shadow-xs active:scale-102 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300 truncate block">
                    {isAmharic ? 'የተከፈሉ አባላት' : 'Paid Members'}
                  </span>
                  <Icon className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400 shrink-0">check_circle</Icon>
                </div>
                <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 tracking-tight leading-tight">
                  {ethiopianMonthlyMetrics.paidMembersCount}
                </p>
                <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 truncate">
                  {isAmharic ? 'ወቅታዊ ክፍያ የተጠናቀቀ' : 'Fully paid for month'}
                </p>
              </div>

              {/* 2. Payment Due Soon */}
              <div
                onClick={() => {
                  setStatusFilter('expiring_soon');
                  setActiveMainTab('table');
                }}
                className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-500/20 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 hover:shadow-xs active:scale-102 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300 truncate block">
                    {isAmharic ? 'ሊያልቅ የደረሰ' : 'Due Soon'}
                  </span>
                  <Icon className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0">schedule</Icon>
                </div>
                <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight leading-tight">
                  {ethiopianMonthlyMetrics.dueSoonMembersCount}
                </p>
                <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-1 truncate">
                  {isAmharic ? 'በ 5 ቀናት ውስጥ የሚያበቃ' : 'Expiring in ≤5 days'}
                </p>
              </div>

              {/* 3. Unpaid / Overdue */}
              <div
                onClick={() => {
                  setStatusFilter('expired');
                  setActiveMainTab('table');
                }}
                className="p-3.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-500/20 hover:bg-rose-100/70 dark:hover:bg-rose-900/40 hover:shadow-xs active:scale-102 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-extrabold text-rose-800 dark:text-rose-300 truncate block">
                    {isAmharic ? 'ያልተከፈለባቸው' : 'Unpaid / Overdue'}
                  </span>
                  <Icon className="material-symbols-outlined text-[18px] text-rose-600 dark:text-rose-400 shrink-0">warning</Icon>
                </div>
                <p className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight leading-tight">
                  {ethiopianMonthlyMetrics.unpaidMembersCount}
                </p>
                <p className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-1 truncate">
                  {isAmharic ? 'ክፍያ ያልተፈጸመ' : 'Delinquent dues'}
                </p>
              </div>

              {/* 4. Month Revenue */}
              <div
                onClick={() => {
                  setStatusFilter('all');
                  setActiveMainTab('table');
                }}
                className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-500/20 hover:bg-blue-100/70 dark:hover:bg-blue-900/40 hover:shadow-xs active:scale-102 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-extrabold text-blue-800 dark:text-blue-300 truncate block">
                    {isAmharic ? 'የወሩ ገቢ' : 'Month Revenue'}
                  </span>
                  <Icon className="material-symbols-outlined text-[18px] text-blue-600 dark:text-blue-400 shrink-0">account_balance_wallet</Icon>
                </div>
                <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 tracking-tight leading-tight">
                  {ethiopianMonthlyMetrics.totalRevenue.toLocaleString()}
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1">
                    {isAmharic ? 'ብር' : 'ETB'}
                  </span>
                </p>
                <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 mt-1 truncate">
                  {ethiopianMonthlyMetrics.totalReceiptsCount} {isAmharic ? 'ደረሰኞች ተመዝግበዋል' : 'receipts recorded'}
                </p>
              </div>

              {/* 5. Compliance Rate */}
              <div
                onClick={() => {
                  setStatusFilter('all');
                  setActiveMainTab('table');
                }}
                className="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-500/20 hover:bg-purple-100/70 dark:hover:bg-purple-900/40 hover:shadow-xs active:scale-102 transition-all duration-200 cursor-pointer group min-w-0 overflow-hidden select-none col-span-2 sm:col-span-1"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-extrabold text-purple-800 dark:text-purple-300 truncate block">
                    {isAmharic ? 'የክፍያ ምጣኔ' : 'Compliance Rate'}
                  </span>
                  <Icon className="material-symbols-outlined text-[18px] text-purple-600 dark:text-purple-400 shrink-0">pie_chart</Icon>
                </div>
                <p className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 tracking-tight leading-tight">
                  {ethiopianMonthlyMetrics.complianceRate}%
                </p>
                <div className="w-full bg-purple-200/60 dark:bg-purple-900/50 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="bg-purple-600 dark:bg-purple-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, ethiopianMonthlyMetrics.complianceRate))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Additional Status Distribution & Quick Actions Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-[#F7F9FC] dark:bg-[#24303F] rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] space-y-3">
                <h4 className="text-xs font-bold text-[#1C2434] dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-[18px] text-[#3C50E0]">donut_large</Icon>
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
                  <p className="text-xs text-[#64748B] dark:text-[#8A99AD] mt-1">
                    {isAmharic
                      ? 'የወርሃዊ መዋጮ ማትሪክስ መዝገብን ለማየት ወይም አዲስ ክፍያ ለመመዝገብ ከታች ያሉትን አቋራጮች ይጠቀሙ።'
                      : 'Use quick links below to jump to the matrix table or record a new dues receipt.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setActiveMainTab('table');
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-[#3C50E0] hover:bg-[#3C50E0]/90 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
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
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-bold flex items-center gap-2">
              <Icon className="material-symbols-outlined text-amber-600 text-[20px] shrink-0">lock</Icon>
              <span>
                {isAmharic
                  ? 'ተነባቢ ብቻ ሁነታ፡ አዲስ የክፍያ ደረሰኝ መመዝገብ አልተፈቀደም (የማየት ፈቃድ ብቻ)።'
                  : 'Read-only mode active: Creating new payment receipts is disabled for your role.'}
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
                list="reg-numbers-datalist"
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
            </div>
            <datalist id="reg-numbers-datalist">
              {registrations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName} ({r.plateNumber || 'No Plate'}) — {r.phone}
                </option>
              ))}
              {registrations
                .filter((r) => r.plateNumber)
                .map((r) => (
                  <option key={`plate-${r.id}`} value={r.plateNumber}>
                    {r.fullName} — Reg #: {r.id}
                  </option>
                ))}
            </datalist>

            {/* INTEGRATED READ-ONLY MANIFEST STRIP (Zero-Jump Dynamic Fields) */}
            <div
              className={`transition-all duration-150 rounded-lg border p-3 ${
                selectedRegInfo
                  ? 'bg-slate-50 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 shadow-2xs'
                  : 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
              }`}
            >
              {selectedRegInfo ? (
                <div className="flex flex-wrap items-center justify-between gap-y-2.5 gap-x-4 text-xs">
                  {/* 1. Name */}
                  <div className="flex items-center gap-2 min-w-[150px]">
                    <Icon className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-[18px]">
                      person
                    </Icon>
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300  leading-none">
                        {isAmharic ? 'የባለቤት ስም' : 'Owner Name'}
                      </span>
                      <span className="font-black text-slate-950 dark:text-white text-xs">
                        {selectedRegInfo.registration.fullName}
                      </span>
                    </div>
                  </div>

                  {/* 2. Plate */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Icon className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-[18px]">
                      numbers
                    </Icon>
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300  leading-none">
                        {isAmharic ? 'ሰሌዳ ቁጥር' : 'Plate #'}
                      </span>
                      <span className="font-mono font-black text-slate-950 dark:text-white text-xs">
                        {selectedRegInfo.registration.plateNumber || (isAmharic ? 'ሰሌዳ የለም' : 'No Plate')}
                      </span>
                    </div>
                  </div>

                  {/* 3. Status & Expiration */}
                  <div className="flex items-center gap-2 min-w-[160px]">
                    <Icon className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-[18px]">
                      verified_user
                    </Icon>
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300  leading-none">
                        {isAmharic ? 'የሂሳብ ሁኔታ' : 'Ledger Status'}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black  tracking-wider ${
                            selectedRegInfo.termStatus === 'CURRENT'
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-400'
                              : selectedRegInfo.termStatus === 'DUE'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-400'
                              : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border border-rose-400'
                          }`}
                        >
                          {selectedRegInfo.termStatus}
                        </span>
                        <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                          {selectedRegInfo.expirationStatusType === 'active'
                            ? `(${selectedRegInfo.daysRemaining}d left)`
                            : selectedRegInfo.expirationStatusType === 'expiring_soon'
                            ? `(Due: ${selectedRegInfo.daysRemaining}d)`
                            : selectedRegInfo.expirationStatusType === 'expired'
                            ? `(Overdue ${Math.abs(selectedRegInfo.daysRemaining)}d)`
                            : '(Unpaid)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Prior Balance / Debt */}
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Icon className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-[18px]">
                      account_balance_wallet
                    </Icon>
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300  leading-none">
                        {isAmharic ? 'ያልተከፈለ ዕዳ / ቀሪ' : 'Prior Balance / Debt'}
                      </span>
                      <span
                        className={`font-mono font-black text-xs ${
                          selectedRegInfo.unpaidDebtAmount > 0
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {selectedRegInfo.unpaidDebtAmount} ETB
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between py-0.5 text-slate-700 dark:text-slate-300 text-xs">
                  <div className="flex items-center gap-2">
                    <Icon className="material-symbols-outlined text-slate-600 dark:text-slate-400 text-[18px]">
                      badge
                    </Icon>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {isAmharic
                        ? 'የምዝገባ ቁጥር ሲያስገቡ የባለቤት ስም፣ ሰሌዳ፣ የሂሳብ ሁኔታ እና ቀሪ ዕዳ በራስ-ሰር እዚህ ይሞላል።'
                        : 'Auto-fetched manifest strip will display Name, Plate, Status, and Prior Balance.'}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold  tracking-wider px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 shrink-0">
                    {isAmharic ? 'ዝግጁ' : 'Ready'}
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
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-black transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
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

      {/* TAB 2: TABLE SECTION (STANDALONE DEDICATED TAB) */}
      {currentTab === 'table' && canViewTable && (
        <div className="rounded-sm border border-[#E2E8F0] bg-white shadow-default dark:border-[#2E3A47] dark:bg-[#1C2434] relative animate-in fade-in duration-150">
          {/* NATIVE DATE RANGE PICKER (TAILWIND STYLED) */}
          {renderDateRangePicker()}

          {/* SEARCH & STATUS FILTER TOOLBAR (TAILADMIN DESIGN) */}
          <div className="p-4 md:px-6 bg-[#F7F9FC] dark:bg-[#24303F] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-0 max-w-md">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#64748B] dark:text-[#8A99AD]">
                <Icon className="material-symbols-outlined text-[18px]">search</Icon>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAmharic
                    ? 'በደረሰኝ #፣ በስም፣ ወይም በሰሌዳ ፈልግ...'
                    : 'Search receipt #, owner name, or plate...'
                }
                className="w-full rounded-sm border border-[#E2E8F0] bg-white py-2 pl-9 pr-8 text-xs text-[#1C2434] outline-none transition focus:border-[#3C50E0] active:border-[#3C50E0] dark:border-[#2E3A47] dark:bg-[#1C2434] dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-2.5 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer font-bold text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Tabs with Counts in Underline Tabs Style */}
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none flex-nowrap shrink-0 max-w-full -mb-[1px]">
              {[
                { key: 'all' as const, label: isAmharic ? 'ሁሉም' : 'All', count: matrixCounts.all },
                { key: 'active' as const, label: isAmharic ? 'ህጋዊ' : 'Active', count: matrixCounts.active },
                { key: 'expiring_soon' as const, label: isAmharic ? 'የደረሰ' : 'Due Soon', count: matrixCounts.expiring },
                { key: 'expired' as const, label: isAmharic ? 'ያለፈበት' : 'Expired', count: matrixCounts.expired },
              ].map((tab) => {
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`group relative flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 select-none ${
                      isActive
                        ? 'border-[#3C50E0] text-[#3C50E0] dark:text-white dark:border-[#3C50E0] font-bold'
                        : 'border-transparent text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:border-[#CBD5E1] dark:hover:border-[#334155]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold transition-colors ${
                        isActive
                          ? 'bg-[#3C50E0]/12 text-[#3C50E0] dark:bg-[#3C50E0]/30 dark:text-blue-300'
                          : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]'
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
          <div className="px-4 md:px-6 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-end">
            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex-wrap">
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

          {/* MONTHLY MATRIX LEDGER TABLE (RESPONSIVE HORIZONTAL SCROLL & COLLAPSIBLE ROWS) */}
          <div className="overflow-x-auto">
            <MonthlyMatrixLedger
              columns={matrixColumns}
              rows={filteredMatrixRows}
              showNumbering={true}
              numberHeaderLabel={isAmharic ? 'ተ.ቁ' : '#'}
              memberHeaderLabel={isAmharic ? 'አባል / ባለቤት' : 'Member / Owner'}
              plateHeaderLabel={isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}
              showPlateColumn={true}
              isAmharic={isAmharic}
              expandableMobile={true}
              emptyMessage={isAmharic ? 'ምንም የወርሃዊ መዋጮ መረጃ አልተገኘም።' : 'No ledger records available.'}
              onRowClick={(row) => {
                const memberReg = registrations.find((r) => String(r.id) === String(row.id));
                const matchedRc = combinedReceipts.find(
                  (rc) =>
                    (rc.ownerRegistrationId && String(rc.ownerRegistrationId) === String(row.id)) ||
                    (rc.plateNumber && row.plateNumber && rc.plateNumber.toLowerCase() === row.plateNumber.toLowerCase()) ||
                    (rc.plateNumber && memberReg?.plateNumber && rc.plateNumber.toLowerCase() === memberReg.plateNumber.toLowerCase())
                );
                if (matchedRc) {
                  setReconcileReceipt(matchedRc);
                } else if (memberReg || row.plateNumber) {
                  handleRegNumberChange(row.plateNumber || memberReg?.plateNumber || String(row.id));
                  setIsFormOpen(true);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* RECONCILIATION DRAWER (Inline Side-Sheet sliding in from the right) */}
      {reconcileReceipt && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Subtle semi-transparent backdrop allowing parent records to remain visible in background */}
          <div
            onClick={() => setReconcileReceipt(null)}
            className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 transition-opacity"
          />

          {/* Side-Sheet Drawer Content Container */}
          <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-300 dark:border-slate-800 shadow-2xl z-10 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-slate-300 text-[16px] sm:text-[18px] shrink-0">
                    compare_arrows
                  </Icon>
                  <h3 className="text-sm sm:text-base font-black  tracking-wide">
                    {isAmharic ? 'የባንክ ማስታረቂያ & ደረሰኝ ማጣሪያ' : 'Bank Reconciliation & Audit Drawer'}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 font-mono">
                  Receipt: #{reconcileReceipt.receiptNumber} — {reconcileReceipt.ownerName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReconcileReceipt(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body: Scrollable */}
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* CBE / Telebirr Reference Comparator Strip */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="material-symbols-outlined text-[14px] text-slate-600 dark:text-slate-400 shrink-0">
                      account_balance
                    </Icon>
                    <span className="font-black text-slate-950 dark:text-white ">
                      {isAmharic ? 'የባንክ ማጣቀሻ ማረጋገጫ' : 'Bank Reference Verification'}
                    </span>
                  </div>
                  {reconcileReceipt.verifiedByCheki && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black  bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-400 flex items-center gap-1">
                      <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                      <span>Cheki Verified ({reconcileReceipt.chekiBank || 'Bank'})</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Bank Reference ID with Quick Copy */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="block text-[10px]  font-bold text-slate-700 dark:text-slate-300">
                        {isAmharic ? 'የማጣቀሻ ቁጥር' : 'Reference # (FT / Ref)'}
                      </span>
                      <span className="font-mono font-black text-slate-950 dark:text-white text-xs sm:text-sm">
                        {reconcileReceipt.receiptNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(reconcileReceipt.receiptNumber, 'Reference #')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Icon className="material-symbols-outlined text-[14px]">
                        {reconcileCopiedField === 'Reference #' ? 'check' : 'content_copy'}
                      </Icon>
                      <span>{reconcileCopiedField === 'Reference #' ? (isAmharic ? 'ተቀድቷል' : 'Copied') : (isAmharic ? 'ቅዳ' : 'Copy')}</span>
                    </button>
                  </div>

                  {/* Amount with Quick Copy */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="block text-[10px]  font-bold text-slate-700 dark:text-slate-300">
                        {isAmharic ? 'የተረጋገጠ መጠን' : 'Amount'}
                      </span>
                      <span className="font-mono font-black text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
                        {reconcileReceipt.amount || '500 ETB'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(String(reconcileReceipt.amount || '500 ETB'), 'Amount')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Icon className="material-symbols-outlined text-[14px]">
                        {reconcileCopiedField === 'Amount' ? 'check' : 'content_copy'}
                      </Icon>
                      <span>{reconcileCopiedField === 'Amount' ? (isAmharic ? 'ተቀድቷል' : 'Copied') : (isAmharic ? 'ቅዳ' : 'Copy')}</span>
                    </button>
                  </div>
                </div>

                {/* Instant Verification Comparator Tool */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    {isAmharic
                      ? 'ከባንክ ኤስኤምኤስ ወይም ከመተግበሪያ የተገኘ የማጣቀሻ ቁጥር እዚህ አጣራ፦'
                      : 'Compare Bank Statement SMS / Web Reference against Ledger:'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={reconcileVerifyInput}
                      onChange={(e) => handleRunReconcileComparison(reconcileReceipt.receiptNumber, e.target.value)}
                      placeholder={
                        isAmharic
                          ? 'የባንክ ኤስኤምኤስ ወይም ማጣቀሻ ቁጥር ለጥፍ...'
                          : 'Paste CBE / Telebirr SMS string or reference here to test match...'
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {reconcileVerifyStatus === 'matched' && (
                    <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-400 text-emerald-950 dark:text-emerald-100 rounded-lg font-bold flex items-center gap-2">
                      <Icon className="material-symbols-outlined text-emerald-700 text-[18px]">check_circle</Icon>
                      <span>
                        {isAmharic
                          ? 'ትክክለኛ ማረጋገጫ ተገኝቷል! የማጣቀሻ ቁጥሩ ከባንክ መዝገብ ጋር ይዛመዳል።'
                          : 'Reference match verified! Transaction successfully reconciled with bank ledger.'}
                      </span>
                    </div>
                  )}

                  {reconcileVerifyStatus === 'mismatch' && (
                    <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 border border-amber-400 text-amber-950 dark:text-amber-100 rounded-lg font-bold flex items-center gap-2">
                      <Icon className="material-symbols-outlined text-amber-700 text-[18px]">warning</Icon>
                      <span>
                        {isAmharic
                          ? 'የማጣቀሻ ቁጥሩ ከደረሰኙ ጋር አልተዛመደም። እባክዎን የቁምፊዎችን ትክክለኛነት ያረጋግጡ።'
                          : 'Reference string does not match receipt ID. Please check character accuracy.'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* DUAL-CALENDAR TIMELINE CARD */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700 pb-2">
                  <Icon className="material-symbols-outlined text-[14px] text-slate-600 dark:text-slate-400 shrink-0">
                    calendar_month
                  </Icon>
                  <span className="font-black text-slate-950 dark:text-white ">
                    {isAmharic ? 'የቀን አቆጣጠር ማጠቃለያ' : 'Dual-Calendar Timeline & Term Status'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px]  font-bold text-slate-700 dark:text-slate-300">
                      {isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date (Ethiopian)'}
                    </span>
                    <span className="font-black text-slate-950 dark:text-white text-xs sm:text-sm block mt-0.5">
                      {formatEthiopianDate(reconcileReceipt.paymentDate, isAmharic ? 'am' : 'en')}
                    </span>
                    {!isAmharic && (
                      <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300 block">
                        Audit GC: {reconcileReceipt.paymentDate}
                      </span>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px]  font-bold text-slate-700 dark:text-slate-300">
                      {isAmharic ? 'የ1 ወር ማብቂያ ቀን' : 'Expiration Date (Ethiopian)'}
                    </span>
                    <span className="font-black text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm block mt-0.5">
                      {formatEthiopianDate(reconcileReceipt.expirationDate, isAmharic ? 'am' : 'en')}
                    </span>
                    {!isAmharic && (
                      <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300 block">
                        Audit GC: {reconcileReceipt.expirationDate}
                      </span>
                    )}
                  </div>
                </div>

                {(reconcileReceipt.enteredAt || reconcileReceipt.createdAt) && (
                  <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <strong>{isAmharic ? 'የተመዘገበበት ሰዓት:' : 'Audit Timestamp:'}</strong>{' '}
                    {formatEthiopianDateTime(reconcileReceipt.enteredAt || reconcileReceipt.createdAt, isAmharic ? 'am' : 'en')}
                  </div>
                )}
              </div>

              {/* HIGH-RES PROOF SCREENSHOT VIEWER */}
              <div className="space-y-2">
                <span className="block text-xs font-black text-slate-950 dark:text-white ">
                  {isAmharic ? 'የተያያዘ የክፍያ ማረጋገጫ ፎቶ' : 'Attached Receipt Proof Image'}
                </span>

                <div className="rounded-xl bg-black border border-slate-800 p-2 flex items-center justify-center min-h-[220px] max-h-[360px] overflow-auto">
                  {reconcileReceipt.receiptScreenshot ? (
                    <img
                      src={reconcileReceipt.receiptScreenshot}
                      alt="Receipt Proof Screenshot"
                      className="max-h-[340px] w-auto object-contain rounded-lg shadow-md"
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-400 space-y-1">
                      <Icon className="material-symbols-outlined text-[32px]">image_not_supported</Icon>
                      <p className="font-bold text-xs">{isAmharic ? 'ምንም ስክሪንሾት አልተያያዘም።' : 'No screenshot attached.'}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(reconcileReceipt.id)}
                className="px-3 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[16px]">delete</Icon>
                <span>{isAmharic ? 'ደረሰኝ ሰርዝ' : 'Delete Receipt'}</span>
              </button>

              <button
                type="button"
                onClick={() => setReconcileReceipt(null)}
                className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all cursor-pointer shadow-xs"
              >
                {isAmharic ? 'ዝጋ' : 'Close Drawer'}
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
    </div>
  );
};
