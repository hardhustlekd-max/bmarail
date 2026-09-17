import React, { useState, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { Language, UserRole, MotorcycleRegistration, PaymentReceipt, TermStatus } from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus, calculateTermStatus } from '../utils/paymentUtils';
import { SmartImage } from './SmartImage';
import { getPermissionState, savePaymentReceiptToDb, deletePaymentReceiptFromDb } from '../services/dbService';
import { formatEthiopianDate, formatEthiopianDateTime } from '../utils/ethiopianCalendar';
import { LoadingSpinner } from './ui/Skeleton';

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

  if (isLoading) {
    return null;
  }

  // RBAC Permission checks for KPIs and Table
  const canViewKPIs = getPermissionState(userRole, 15) !== 'deny';
  const canViewTable = getPermissionState(userRole, 16) !== 'deny';

  // Toggle state for new receipt entry form (Default to OPEN for clerk role)
  const [isFormOpen, setIsFormOpen] = useState(() => userRole === 'clerk');
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

    const prevReceipts = paymentReceipts.filter(
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
  }, [regNumber, registrations, paymentReceipts]);

  // Filter & Search state for table
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring_soon' | 'expired'>(
    initialFilter
  );

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
    return paymentReceipts.filter((rc) => {
      const matchesSearch =
        !searchQuery.trim() ||
        rc.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rc.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rc.plateNumber && rc.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (rc.ownerRegistrationId && rc.ownerRegistrationId.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;

      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      return status === statusFilter;
    });
  }, [paymentReceipts, searchQuery, statusFilter]);

  // KPI Metrics Summary
  const metrics = useMemo(() => {
    let activeCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let totalRevenue = 0;

    paymentReceipts.forEach((rc) => {
      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      if (status === 'active') activeCount++;
      else if (status === 'expiring_soon') expiringCount++;
      else if (status === 'expired') expiredCount++;

      const numAmount = parseFloat(String(rc.amount || '500').replace(/[^0-9.]/g, '')) || 500;
      totalRevenue += numAmount;
    });

    return {
      totalReceipts: paymentReceipts.length,
      activeCount,
      expiringCount,
      expiredCount,
      totalRevenue,
    };
  }, [paymentReceipts]);

  return (
    <div className="space-y-4 pb-12">
      {/* HEADER SECTION: Clean, high-contrast, non-nested */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-950 dark:text-white tracking-tight flex items-center gap-2">
            <Icon className="material-symbols-outlined text-slate-900 dark:text-slate-100 text-[26px]">
              account_balance_wallet
            </Icon>
            <span>{isAmharic ? 'የክፍያ ደረሰኝ & የሂሳብ መዝገብ' : 'Payment Receipts & Revenue Ledger'}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsFormOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-black hover:bg-slate-800 dark:hover:bg-white transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Icon className="material-symbols-outlined text-[18px]">
              {isFormOpen ? 'remove_circle' : 'add_circle'}
            </Icon>
            <span>
              {isFormOpen
                ? isAmharic ? 'ቅጹን ዝጋ' : 'Close Form'
                : isAmharic ? '+ አዲስ የክፍያ ደረሰኝ መዝግብ' : '+ New Payment Receipt'}
            </span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS: High-Contrast Sunlight Legible */}
      {canViewKPIs && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total Revenue */}
          <div className="bg-slate-50 dark:bg-slate-900/30 p-3.5 rounded-xl shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                {isAmharic ? 'አጠቃላይ ገቢ' : 'Total Revenue'}
              </span>
              <Icon className="material-symbols-outlined text-slate-900 dark:text-slate-100 text-[20px]">
                payments
              </Icon>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-black text-slate-950 dark:text-white font-mono">
                {metrics.totalRevenue.toLocaleString()}
              </span>
              <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">ETB</span>
            </div>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-0.5 block">
              {metrics.totalReceipts} {isAmharic ? 'የተመዘገቡ ደረሰኞች' : 'receipts recorded'}
            </span>
          </div>

          {/* Active / Current */}
          <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3.5 rounded-xl shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-emerald-800 dark:text-emerald-300 tracking-wider">
                {isAmharic ? 'ህጋዊ' : 'Active (CURRENT)'}
              </span>
              <Icon className="material-symbols-outlined text-emerald-700 dark:text-emerald-400 text-[20px]">
                check_circle
              </Icon>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-black text-slate-950 dark:text-white font-mono">
                {metrics.activeCount}
              </span>
              <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-400">
                {isAmharic ? 'ባለቤቶች' : 'owners'}
              </span>
            </div>
            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 mt-0.5 block">
              {isAmharic ? 'የ1 ወር ክፍያቸው ያልተጠናቀቀ' : 'Payment term up to date'}
            </span>
          </div>

          {/* Expiring Soon (DUE) */}
          <div className="bg-amber-50 dark:bg-amber-900/30 p-3.5 rounded-xl shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-amber-800 dark:text-amber-300 tracking-wider">
                {isAmharic ? 'ሊያልቅ የደረሰ' : 'Due Soon (DUE)'}
              </span>
              <Icon className="material-symbols-outlined text-amber-700 dark:text-amber-400 text-[20px]">
                alarm
              </Icon>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-black text-slate-950 dark:text-white font-mono">
                {metrics.expiringCount}
              </span>
              <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-400">
                {isAmharic ? 'ባለቤቶች' : 'owners'}
              </span>
            </div>
            <span className="text-[10px] font-bold text-amber-800 dark:text-amber-400 mt-0.5 block">
              {isAmharic ? 'በ 7 ቀናት ውስጥ የሚያልቅ' : 'Expires within 7 days'}
            </span>
          </div>

          {/* Delinquent / Expired */}
          <div className="bg-rose-50 dark:bg-rose-900/30 p-3.5 rounded-xl shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-rose-800 dark:text-rose-300 tracking-wider">
                {isAmharic ? 'ያለፈበት' : 'Expired (DELINQUENT)'}
              </span>
              <Icon className="material-symbols-outlined text-rose-700 dark:text-rose-400 text-[20px]">
                error
              </Icon>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-black text-slate-950 dark:text-white font-mono">
                {metrics.expiredCount}
              </span>
              <span className="text-[11px] font-extrabold text-rose-800 dark:text-rose-400">
                {isAmharic ? 'ባለቤቶች' : 'owners'}
              </span>
            </div>
            <span className="text-[10px] font-bold text-rose-800 dark:text-rose-400 mt-0.5 block">
              {isAmharic ? 'ክፍያ ያልፈፀሙ / ዕዳ ያለባቸው' : 'Overdue terms requiring renewal'}
            </span>
          </div>
        </div>
      )}

      {/* RECEIPT ENTRY FORM WITH ZERO-JUMP INTEGRATED MANIFEST STRIP */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmitForm}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Icon className="material-symbols-outlined text-slate-900 dark:text-slate-100 text-[22px]">
                add_card
              </Icon>
              <h3 className="text-sm font-black text-slate-950 dark:text-white uppercase tracking-wider">
                {isAmharic ? 'አዲስ የወርሃዊ ክፍያ ደረሰኝ መመዝገቢያ ቅጽ' : 'New Monthly Payment Receipt Entry'}
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
              CLERK: {userBadgeId}
            </span>
          </div>

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
              <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
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
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
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

              {/* Payment Date Input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center justify-between">
                  <span>{isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}</span>
                  <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                    {formatEthiopianDate(paymentDate, isAmharic ? 'am' : 'en')}
                  </span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* ZERO-JUMP DYNAMIC FIELDS: Integrated read-only manifest strip directly below registration input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center justify-between">
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
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase leading-none">
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
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase leading-none">
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
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase leading-none">
                        {isAmharic ? 'የሂሳብ ሁኔታ' : 'Ledger Status'}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
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
                      <span className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-300 uppercase leading-none">
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
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 shrink-0">
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
              <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
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
              <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide flex items-center justify-between">
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
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100">
                  +1 {isAmharic ? 'ወር' : 'Month'}
                </span>
              </div>
            </div>
          </div>

          {/* Screenshot Upload Dropzone */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
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
            <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
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
              disabled={isSubmitting || selectedRegInfo?.expirationStatusType === 'active'}
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
      )}

      {/* TABLE SECTION: High-Contrast, Flattened, Non-Nested */}
      {canViewTable && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
          {/* SEARCH & STATUS FILTER TOOLBAR */}
          <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-0 max-w-md">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                <Icon className="material-symbols-outlined text-[16px]">search</Icon>
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
                className="w-full pl-8 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-2.5 flex items-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer font-bold text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Tabs with Counts */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { key: 'all' as const, label: isAmharic ? 'ሁሉም' : 'All', count: paymentReceipts.length },
                { key: 'active' as const, label: isAmharic ? 'ህጋዊ' : 'Active', count: metrics.activeCount },
                { key: 'expiring_soon' as const, label: isAmharic ? 'የደረሰ' : 'Due Soon', count: metrics.expiringCount },
                { key: 'expired' as const, label: isAmharic ? 'ያለፈበት' : 'Expired', count: metrics.expiredCount },
              ].map((tab) => {
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                        isActive
                          ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DESKTOP TABLE VIEW (>= md) WITH ELEVATED ETHIOPIAN DUAL-CALENDAR TIMELINES */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider font-black border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3.5 text-center w-12">#</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የደረሰኝ ቁጥር' : 'Receipt #'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የባለቤት ስም & ሰሌዳ' : 'Owner & Vehicle'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date (Eth/GC)'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የ1 ወር ማብቂያ ቀን & ሁኔታ' : 'Expiration & Status'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'መጠን (ብር)' : 'Amount'}</th>
                  <th className="px-4 py-3.5 text-center">{isAmharic ? 'ማረጋገጫ ፎቶ' : 'Proof'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'መዝጋቢ' : 'Clerk'}</th>
                  <th className="px-4 py-3.5 text-right">{isAmharic ? 'ማስታረቂያ / እርምጃ' : 'Reconcile / Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-700 dark:text-slate-300">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Icon className="material-symbols-outlined text-[36px] text-slate-500">
                          find_in_page
                        </Icon>
                        <p className="font-bold text-sm">
                          {isAmharic
                            ? 'ምንም የተመዘገበ የክፍያ ደረሰኝ አልተገኘም።'
                            : 'No payment receipts found matching criteria.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((rc, idx) => {
                    const { status, daysRemaining } = getPaymentReceiptStatus(rc.expirationDate);

                    return (
                      <tr
                        key={rc.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        {/* Index */}
                        <td className="px-4 py-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                          {idx + 1}
                        </td>

                        {/* Receipt Number */}
                        <td className="px-4 py-3 font-mono font-black text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setReconcileReceipt(rc)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              title={isAmharic ? 'የማስታረቂያ ዝርዝር ክፈት' : 'Open Reconciliation Drawer'}
                            >
                              <Icon className="material-symbols-outlined text-[14px]">receipt</Icon>
                              <span>{rc.receiptNumber}</span>
                            </button>
                            {rc.verifiedByCheki && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400"
                                title={`Verified on Bank System via Cheki API (${rc.chekiBank || 'Bank'})`}
                              >
                                <Icon className="material-symbols-outlined text-[11px]">verified</Icon>
                                <span>Cheki</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Owner & Vehicle Details */}
                        <td className="px-4 py-3">
                          <div className="font-black text-slate-950 dark:text-white">{rc.ownerName}</div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                            {rc.plateNumber && (
                              <span className="font-mono font-black bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                                {rc.plateNumber}
                              </span>
                            )}
                            {rc.phone && <span className="font-mono">{rc.phone}</span>}
                          </div>
                        </td>

                        {/* Payment Date: Primary Ethiopian Calendar */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-black text-slate-950 dark:text-white text-xs">
                            {formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}
                          </div>
                          {!isAmharic && (
                            <div className="font-mono text-[10px] font-extrabold text-slate-700 dark:text-slate-300">
                              GC: {rc.paymentDate}
                            </div>
                          )}
                        </td>

                        {/* Expiration Date: Primary Ethiopian Calendar + Status Badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-mono font-black text-slate-950 dark:text-white text-xs">
                            {formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}
                          </div>
                          {!isAmharic && (
                            <div className="font-mono text-[10px] font-extrabold text-slate-700 dark:text-slate-300">
                              GC: {rc.expirationDate}
                            </div>
                          )}
                          <div className="mt-1">
                            {status === 'active' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400">
                                <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                                <span>
                                  {isAmharic ? 'ህጋዊ' : 'Active'} ({daysRemaining} {isAmharic ? 'ቀን ይቀራል' : 'd left'})
                                </span>
                              </span>
                            )}
                            {status === 'expiring_soon' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-400">
                                <Icon className="material-symbols-outlined text-[12px]">alarm</Icon>
                                <span>
                                  {isAmharic ? 'ሊያልቅ ነው' : 'Due Soon'} ({daysRemaining} {isAmharic ? 'ቀን' : 'd'})
                                </span>
                              </span>
                            )}
                            {status === 'expired' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border border-rose-400">
                                <Icon className="material-symbols-outlined text-[12px]">error</Icon>
                                <span>{isAmharic ? 'ጊዜው አልፏል' : 'Expired'}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 font-black whitespace-nowrap text-slate-950 dark:text-white font-mono">
                          {rc.amount || '500 ETB'}
                        </td>

                        {/* Proof Screenshot Thumbnail */}
                        <td className="px-4 py-3 text-center">
                          {rc.receiptScreenshot ? (
                            <button
                              type="button"
                              onClick={() => setReconcileReceipt(rc)}
                              className="inline-block relative w-10 h-10 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-2xs hover:scale-105 transition-transform cursor-pointer group bg-black"
                              title={isAmharic ? 'ስክሪንሾት በትልቅ መጠን ይመልከቱ' : 'View screenshot in drawer'}
                            >
                              <img
                                src={rc.receiptScreenshot}
                                alt="Receipt Proof"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 flex items-center justify-center text-white">
                                <Icon className="material-symbols-outlined text-[14px]">zoom_in</Icon>
                              </div>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-bold italic">
                              {isAmharic ? 'ምንም ፎቶ የለም' : 'No Proof'}
                            </span>
                          )}
                        </td>

                        {/* Entered By Clerk */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200">
                            {rc.enteredBy}
                          </span>
                        </td>

                        {/* Actions: Open Reconciliation Drawer or Delete */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setReconcileReceipt(rc)}
                              className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-black hover:bg-slate-800 dark:hover:bg-white transition-all flex items-center gap-1 cursor-pointer"
                              title={isAmharic ? 'የባንክ ማስታረቂያ' : 'Reconcile Bank Reference'}
                            >
                              <Icon className="material-symbols-outlined text-[15px]">compare_arrows</Icon>
                              <span>{isAmharic ? 'አስታርቅ' : 'Reconcile'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(rc.id)}
                              className="p-1.5 rounded-md text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all cursor-pointer"
                              title={isAmharic ? 'ሰርዝ' : 'Delete'}
                            >
                              <Icon className="material-symbols-outlined text-[18px]">delete</Icon>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARD VIEW (< md) WITH DUAL-CALENDAR TIMELINES */}
          <div className="block md:hidden divide-y divide-slate-200 dark:divide-slate-800">
            {filteredReceipts.length === 0 ? (
              <div className="p-8 text-center text-slate-700 dark:text-slate-300 space-y-1.5">
                <Icon className="material-symbols-outlined text-[36px] text-slate-500 mx-auto block">find_in_page</Icon>
                <p className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  {isAmharic ? 'ምንም የተመዘገበ የክፍያ ደረሰኝ አልተገኘም።' : 'No payment receipts found matching criteria.'}
                </p>
              </div>
            ) : (
              filteredReceipts.map((rc) => {
                const { status, daysRemaining } = getPaymentReceiptStatus(rc.expirationDate);

                return (
                  <div
                    key={rc.id}
                    className="p-3.5 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors space-y-3"
                  >
                    {/* Top Header Row: Receipt # & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-mono font-black text-xs">
                          <Icon className="material-symbols-outlined text-[14px]">receipt</Icon>
                          <span>{rc.receiptNumber}</span>
                        </span>
                        {rc.verifiedByCheki && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400"
                            title={`Verified on Bank System via Cheki (${rc.chekiBank || 'Bank'})`}
                          >
                            <Icon className="material-symbols-outlined text-[10px]">verified</Icon>
                            <span>Cheki</span>
                          </span>
                        )}
                      </div>

                      <div>
                        {status === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400">
                            <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                            <span>
                              {isAmharic ? 'ህጋዊ' : 'Active'} ({daysRemaining} {isAmharic ? 'ቀን' : 'd'})
                            </span>
                          </span>
                        )}
                        {status === 'expiring_soon' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-400">
                            <Icon className="material-symbols-outlined text-[12px]">alarm</Icon>
                            <span>
                              {isAmharic ? 'ሊያልቅ ነው' : 'Due Soon'} ({daysRemaining} {isAmharic ? 'ቀን' : 'd'})
                            </span>
                          </span>
                        )}
                        {status === 'expired' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-400">
                            <Icon className="material-symbols-outlined text-[12px]">error</Icon>
                            <span>{isAmharic ? 'ጊዜው አልፏል' : 'Expired'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Owner & Plate Information */}
                    <div>
                      <h4 className="font-black text-sm text-slate-950 dark:text-white">
                        {rc.ownerName}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                        {rc.plateNumber && (
                          <span className="font-mono font-black bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                            {rc.plateNumber}
                          </span>
                        )}
                        {rc.phone && <span className="font-mono">{rc.phone}</span>}
                      </div>
                    </div>

                    {/* Details Grid: Ethiopian Calendar Primary */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700">
                      <div>
                        <span className="block text-[10px] uppercase font-extrabold text-slate-700 dark:text-slate-300">
                          {isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}
                        </span>
                        <span className="font-black text-slate-950 dark:text-white text-xs block">
                          {formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}
                        </span>
                        <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300">
                          GC: {rc.paymentDate}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-extrabold text-slate-700 dark:text-slate-300">
                          {isAmharic ? 'የ1 ወር ማብቂያ' : 'Expiration Date'}
                        </span>
                        <span className="font-black text-emerald-800 dark:text-emerald-300 text-xs block">
                          {formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}
                        </span>
                        <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300">
                          GC: {rc.expirationDate}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-extrabold text-slate-700 dark:text-slate-300">
                          {isAmharic ? 'መጠን' : 'Amount'}
                        </span>
                        <span className="font-black text-slate-950 dark:text-white font-mono">
                          {rc.amount || '500 ETB'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-extrabold text-slate-700 dark:text-slate-300">
                          {isAmharic ? 'መዝጋቢ' : 'Clerk'}
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {rc.enteredBy}
                        </span>
                      </div>
                    </div>

                    {/* Actions & Reconciliation Drawer Trigger */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setReconcileReceipt(rc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-black hover:bg-slate-800 cursor-pointer shadow-xs"
                      >
                        <Icon className="material-symbols-outlined text-[16px]">compare_arrows</Icon>
                        <span>{isAmharic ? 'አስታርቅ / ማረጋገጫ' : 'Reconcile & Proof'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(rc.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 text-xs font-bold hover:bg-rose-100 cursor-pointer flex items-center gap-1"
                      >
                        <Icon className="material-symbols-outlined text-[15px]">delete</Icon>
                        <span>{isAmharic ? 'ሰርዝ' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
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
                  <Icon className="material-symbols-outlined text-emerald-400 text-[22px]">
                    compare_arrows
                  </Icon>
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wide">
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
                    <Icon className="material-symbols-outlined text-slate-900 dark:text-slate-100 text-[18px]">
                      account_balance
                    </Icon>
                    <span className="font-black text-slate-950 dark:text-white uppercase">
                      {isAmharic ? 'የባንክ ማጣቀሻ ማረጋገጫ' : 'Bank Reference Verification'}
                    </span>
                  </div>
                  {reconcileReceipt.verifiedByCheki && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-400 flex items-center gap-1">
                      <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                      <span>Cheki Verified ({reconcileReceipt.chekiBank || 'Bank'})</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Bank Reference ID with Quick Copy */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">
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
                      <span className="block text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">
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
                          : 'REFERENCE MATCH VERIFIED! Transaction successfully reconciled with bank ledger.'}
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
                  <Icon className="material-symbols-outlined text-slate-900 dark:text-slate-100 text-[18px]">
                    calendar_month
                  </Icon>
                  <span className="font-black text-slate-950 dark:text-white uppercase">
                    {isAmharic ? 'የቀን አቆጣጠር ማጠቃለያ' : 'Dual-Calendar Timeline & Term Status'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="block text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">
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
                    <span className="block text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">
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
                    {formatEthiopianDateTime(reconcileReceipt.enteredAt || reconcileReceipt.createdAt, isAmharic ? 'am' : 'en')} {!isAmharic && `(GC: ${new Date(reconcileReceipt.enteredAt || reconcileReceipt.createdAt).toLocaleString()})`}
                  </div>
                )}
              </div>

              {/* HIGH-RES PROOF SCREENSHOT VIEWER */}
              <div className="space-y-2">
                <span className="block text-xs font-black text-slate-950 dark:text-white uppercase">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <Icon className="material-symbols-outlined text-[28px]">warning</Icon>
              <h3 className="text-base font-black uppercase tracking-wide">
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
