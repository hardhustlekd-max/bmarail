import React, { useState, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { Language, UserRole, MotorcycleRegistration, PaymentReceipt } from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus } from '../utils/paymentUtils';
import { SmartImage } from './SmartImage';
import { getPermissionState, savePaymentReceiptToDb, deletePaymentReceiptFromDb } from '../services/dbService';
import { formatEthiopianDate } from '../utils/ethiopianCalendar';
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
  isLoading = false,
}) => {
  const isAmharic = lang === 'am';

  if (isLoading) {
    return null;
  }

  // RBAC Permission checks for KPIs and Table
  const canViewKPIs = getPermissionState(userRole, 15) !== 'deny';
  const canViewTable = getPermissionState(userRole, 16) !== 'deny';

  // Toggle state for new receipt entry modal (Default to OPEN for clerk role)
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

        // Auto-apply verified amount if present
        if (data.amount !== undefined && data.amount !== null) {
          const numAmount = String(data.amount).replace(/[^0-9.]/g, '');
          if (numAmount) {
            setAmount(numAmount);
          }
        }

        // Auto-apply verified payment date if present
        if (data.date) {
          try {
            const dt = new Date(data.date);
            if (!isNaN(dt.getTime())) {
              setPaymentDate(dt.toISOString().split('T')[0]);
            }
          } catch {}
        }

        // Add verification note
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

    // Find previous payment receipts for this owner registration ID or plate number
    const prevReceipts = paymentReceipts.filter(
      (rc) =>
        (rc.ownerRegistrationId && rc.ownerRegistrationId === found.id) ||
        (rc.plateNumber && found.plateNumber && rc.plateNumber.toLowerCase() === found.plateNumber.toLowerCase()) ||
        rc.ownerName.toLowerCase() === found.fullName.toLowerCase()
    );

    // Sort by expirationDate descending
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
      // No previous payment receipt on file
      expirationStatusType = 'none';
      unpaidDebtAmount = 500; // standard single term fee due
    }

    return {
      registration: found,
      latestReceipt,
      expirationStatusType,
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

  // Modal viewer state for full receipt screenshot inspection
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceipt | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

    // Lookup in database registrations by Registration ID, Plate Number, or Engine/Serial Number
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
      alert(
        isAmharic
          ? 'የምስሉ መጠን ከ 8MB መብለጥ የለበትም።'
          : 'File size exceeds 8MB. Please choose a smaller image.'
      );
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
      setSubmitError(
        isAmharic
          ? 'እባክዎን የደረሰኝ ቁጥር ያስገቡ!'
          : 'Please enter a valid receipt number!'
      );
      return;
    }

    const finalOwnerName =
      ownerName.trim() || selectedRegInfo?.registration?.fullName?.trim() || '';
    if (!finalOwnerName) {
      setSubmitError(
        isAmharic
          ? 'እባክዎን የምዝገባ ቁጥር በማስገባት የተመዘገበ ባለቤት ይምረጡ!'
          : 'Please enter a valid Registration Number to select the vehicle owner!'
      );
      return;
    }

    // Check if owner already paid and current status is active
    if (selectedRegInfo && selectedRegInfo.expirationStatusType === 'active') {
      setSubmitError(
        isAmharic
          ? 'ይህ ባለቤት ክፍያ አስቀድሞ ፈፅሟል! የክፍያ ጊዜው ንቁ በመሆኑ ድጋሚ ክፍያ መፈፀም አይቻልም።'
          : 'This owner has already paid! Active payment term is valid. Re-payment is prevented.'
      );
      return;
    }

    // Check for duplicate receipt number
    const isDuplicateReceipt = paymentReceipts.some(
      (rc) => rc.receiptNumber.trim().toLowerCase() === receiptNumber.trim().toLowerCase()
    );
    if (isDuplicateReceipt) {
      setSubmitError(
        isAmharic
          ? 'ይህ የደረሰኝ ቁጥር አስቀድሞ ተመዝግቧል! እባክዎን ሌላ የደረሰኝ ቁጥር ያስገቡ።'
          : 'This receipt number has already been registered! Please enter a unique receipt number.'
      );
      return;
    }

    const effectivePaymentDate = paymentDate || new Date().toISOString().split('T')[0];

    setIsSubmitting(true);

    try {
      const expDate = calculateOneMonthExpiration(effectivePaymentDate);
      const newReceipt: PaymentReceipt = {
        id: `PAY-${Date.now().toString().slice(-6)}`,
        receiptNumber: receiptNumber.trim(),
        ownerRegistrationId: selectedRegId || selectedRegInfo?.registration?.id || undefined,
        ownerName: finalOwnerName,
        plateNumber: plateNumber.trim() || selectedRegInfo?.registration?.plateNumber?.trim() || undefined,
        phone: phone.trim() || selectedRegInfo?.registration?.phone?.trim() || undefined,
        paymentDate: effectivePaymentDate,
        expirationDate: expDate,
        amount: amount ? `${amount} ETB` : undefined,
        receiptScreenshot: receiptScreenshot || undefined,
        notes: notes.trim() || undefined,
        enteredBy: userBadgeId || 'Clerk',
        createdAt: new Date().toISOString(),
        verifiedByCheki: isReceiptChekiVerified,
        chekiBank: isReceiptChekiVerified ? (chekiVerifiedBankName || formChekiResult?.bank || undefined) : undefined,
      };

      const saveFn = onSaveReceipt || onAddPaymentReceipt;
      if (typeof saveFn === 'function') {
        await saveFn(newReceipt);
      } else {
        await savePaymentReceiptToDb(newReceipt);
      }

      setSubmitSuccess(
        isAmharic
          ? 'የክፍያ ደረሰኝ በተሳካ ሁኔታ ተመዝግቧል!'
          : 'Payment receipt entered and saved successfully!'
      );

      // Reset form
      setReceiptNumber('');
      setRegNumber('');
      setSelectedRegId('');
      setOwnerName('');
      setPlateNumber('');
      setPhone('');
      setIsAutoFilled(false);
      setAmount('500');
      setReceiptScreenshot('');
      setNotes('');
      setFormChekiResult(null);
      setFormChekiError('');
      setIsReceiptChekiVerified(false);
      setChekiVerifiedBankName('');
      setIsFormOpen(false);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save payment receipt.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate Expiration Metrics across all recorded payment receipts
  const metrics = useMemo(() => {
    let total = paymentReceipts.length;
    let activeCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;

    paymentReceipts.forEach((rc) => {
      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      if (status === 'active') activeCount++;
      else if (status === 'expiring_soon') expiringSoonCount++;
      else if (status === 'expired') expiredCount++;
    });

    return { total, activeCount, expiringSoonCount, expiredCount };
  }, [paymentReceipts]);

  // Filtered payment receipts list for the main table
  const filteredReceipts = useMemo(() => {
    return paymentReceipts.filter((rc) => {
      // Status filter
      const { status } = getPaymentReceiptStatus(rc.expirationDate);
      if (statusFilter !== 'all' && status !== statusFilter) {
        return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        rc.receiptNumber.toLowerCase().includes(q) ||
        rc.ownerName.toLowerCase().includes(q) ||
        (rc.plateNumber && rc.plateNumber.toLowerCase().includes(q)) ||
        (rc.phone && rc.phone.includes(q)) ||
        (rc.notes && rc.notes.toLowerCase().includes(q)) ||
        (rc.enteredBy && rc.enteredBy.toLowerCase().includes(q))
      );
    });
  }, [paymentReceipts, statusFilter, searchQuery]);

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmId) return;
    try {
      const delFn = onDeleteReceipt || onDeletePaymentReceipt;
      if (typeof delFn === 'function') {
        await delFn(deleteConfirmId);
      } else {
        await deletePaymentReceiptFromDb(deleteConfirmId);
      }
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete receipt:', err);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-12">
      {/* INTEGRATED HEADER CONTAINER (MATCHING TABLES PAGE PATTERN) */}
      <div className="bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-lg shadow-xs overflow-hidden">
        <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Icon className="material-symbols-outlined text-[22px] text-primary shrink-0">receipt_long</Icon>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-on-surface dark:text-white">
                {isAmharic ? 'የክፍያ ደረሰኞች' : 'Payment Receipts'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsFormOpen(!isFormOpen);
              setSubmitError('');
              setSubmitSuccess('');
            }}
            className="px-3.5 py-1.5 rounded-md bg-primary hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
          >
            <Icon className="material-symbols-outlined text-[16px]">
              {isFormOpen ? 'close' : 'add_circle'}
            </Icon>
            <span>
              {isFormOpen
                ? isAmharic
                  ? 'ፎርሙን ዝጋ'
                  : 'Close Form'
                : isAmharic
                ? 'አዲስ ደረሰኝ መዝግብ'
                : 'New Payment Receipt'}
            </span>
          </button>
        </div>
      </div>

      {/* Global Success Banner */}
      {submitSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Icon className="material-symbols-outlined text-emerald-600 text-[22px]">check_circle</Icon>
            <span>{submitSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmitSuccess('')}
            className="text-emerald-700 dark:text-emerald-400 hover:opacity-80 font-bold"
          >
            ✕
          </button>
        </div>
      )}



      {/* PAYMENT RECEIPT ENTRY FORM CARD */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmitForm}
          className="bg-surface-container-lowest border-2 border-[#0f172a]/40 rounded-xl p-4 sm:p-6 shadow-md space-y-5 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <div className="flex items-center gap-2">
              <Icon className="material-symbols-outlined text-[#0f172a] text-[22px]">post_add</Icon>
              <h2 className="text-sm font-black text-on-surface uppercase tracking-wider">
                {isAmharic ? 'አዲስ የክፍያ ደረሰኝ መመዝገቢያ ፎርም' : 'New Payment Receipt Entry Form'}
              </h2>
            </div>
            <span className="text-[11px] font-extrabold text-slate-500">
              {isAmharic ? 'መዝጋቢ፦ ' : 'Clerk: '}
              <span className="text-[#0f172a] font-black">{userBadgeId}</span>
            </span>
          </div>

          {submitError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold flex items-center gap-2">
              <Icon className="material-symbols-outlined text-[18px]">error</Icon>
              <span>{submitError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Receipt Number (Required) with Integrated Cheki Verifier */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-on-surface uppercase tracking-wide flex items-center gap-1.5">
                  <span>{isAmharic ? 'የደረሰኝ / ባንክ ቁጥር *' : 'Receipt / Bank Ref Number *'}</span>
                  {isReceiptChekiVerified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                      <span>{isAmharic ? 'በባንክ የተረጋገጠ' : 'Bank Verified'}</span>
                    </span>
                  )}
                </label>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                  <Icon className="material-symbols-outlined text-[12px]">verified_user</Icon>
                  <span>Cheki API</span>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    required
                    value={receiptNumber}
                    onChange={(e) => {
                      setReceiptNumber(e.target.value);
                      if (isReceiptChekiVerified) {
                        setIsReceiptChekiVerified(false);
                        setFormChekiResult(null);
                      }
                    }}
                    placeholder={isAmharic ? 'ምሳሌ፦ FT24083091122 ወይም ሊንክ' : 'e.g. FT24083091122 or receipt URL'}
                    className={`w-full pl-9 pr-3 py-2 bg-surface-container/50 border rounded-lg text-xs font-mono font-bold text-on-surface focus:outline-none focus:ring-2 ${
                      isReceiptChekiVerified
                        ? 'border-emerald-500/60 focus:ring-emerald-600 bg-emerald-500/5'
                        : 'border-outline-variant focus:ring-emerald-600'
                    }`}
                  />
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-secondary">
                    <Icon className="material-symbols-outlined text-[18px]">
                      receipt
                    </Icon>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={formChekiBank}
                    onChange={(e) => setFormChekiBank(e.target.value)}
                    className="px-2 py-2 bg-surface-container/50 border border-outline-variant rounded-lg text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-emerald-600 max-w-[125px] text-ellipsis"
                    title={isAmharic ? 'ባንክ ይምረጡ' : 'Select Bank'}
                  >
                    <option value="">{isAmharic ? 'ራስ-ሰር ፈልግ' : 'Auto Bank'}</option>
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
                    className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer disabled:cursor-not-allowed active:scale-95"
                    title={isAmharic ? 'በቼኪ API ደረሰኙን አረጋግጥ' : 'Verify receipt on bank system via Cheki API'}
                  >
                    {formChekiLoading ? (
                      <>
                        <Icon className="material-symbols-outlined text-[15px] animate-spin">progress_activity</Icon>
                        <span className="hidden sm:inline">{isAmharic ? 'በማጣራት...' : 'Checking...'}</span>
                      </>
                    ) : (
                      <>
                        <Icon className="material-symbols-outlined text-[15px]">verified</Icon>
                        <span>{isAmharic ? 'አረጋግጥ' : 'Verify'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Inline Cheki Notice or Error */}
              {formChekiError && (
                <div className="p-2 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-lg text-[11px] font-bold flex items-center justify-between gap-2 animate-in fade-in duration-150">
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

              {/* Inline Cheki Verification Result Card inside Form */}
              {formChekiResult && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-2 animate-in fade-in duration-200 ${
                    formChekiResult.verified
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-100'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-950 dark:text-amber-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-black uppercase text-[11px]">
                      <Icon className="material-symbols-outlined text-[17px] text-emerald-600 dark:text-emerald-400">
                        {formChekiResult.verified ? 'check_circle' : 'warning'}
                      </Icon>
                      <span>
                        {formChekiResult.verified
                          ? isAmharic
                            ? 'በባንክ የተረጋገጠ ደረሰኝ (Cheki API)'
                            : 'Verified on Bank System (Cheki API)'
                          : isAmharic
                          ? 'ደረሰኙ በባንክ አልተረጋገጠም (Unverified)'
                          : 'Receipt Not Found on Bank System'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase opacity-80">
                      {formChekiResult.bank || formChekiBank || 'Bank'}
                    </span>
                  </div>

                  {formChekiResult.verified && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                      <div className="bg-surface-container-lowest/90 dark:bg-slate-900/80 p-2 rounded border border-emerald-500/20">
                        <span className="text-[9px] text-secondary block uppercase font-bold">
                          {isAmharic ? 'የተረጋገጠ መጠን' : 'Verified Amount'}
                        </span>
                        <span className="font-black text-emerald-700 dark:text-emerald-300 font-mono">
                          {formChekiResult.amount ? `${formChekiResult.amount}` : `${amount} ETB`}
                        </span>
                      </div>

                      <div className="bg-surface-container-lowest/90 dark:bg-slate-900/80 p-2 rounded border border-emerald-500/20">
                        <span className="text-[9px] text-secondary block uppercase font-bold">
                          {isAmharic ? 'ባንክ' : 'Bank'}
                        </span>
                        <span className="font-bold text-on-surface truncate block">
                          {formChekiResult.bank || 'Commercial Bank of Ethiopia'}
                        </span>
                      </div>

                      <div className="bg-surface-container-lowest/90 dark:bg-slate-900/80 p-2 rounded border border-emerald-500/20 col-span-2 sm:col-span-1">
                        <span className="text-[9px] text-secondary block uppercase font-bold">
                          {isAmharic ? 'ቀን / ሰዓት' : 'Date / Time'}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-on-surface truncate block">
                          {formChekiResult.date || formChekiResult.transactionDate || (isAmharic ? 'ተረጋግጧል' : 'Confirmed')}
                        </span>
                      </div>
                    </div>
                  )}

                  {formChekiResult.receiverAccount && (
                    <div className="text-[10px] font-mono bg-surface-container-lowest/80 dark:bg-slate-900/70 px-2 py-1 rounded text-secondary border border-outline-variant/30">
                      <strong>To:</strong> {formChekiResult.receiverAccount}{' '}
                      {formChekiResult.receiverName ? `(${formChekiResult.receiverName})` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Registration Number Input Field (Replaces Link Registered Owner dropdown) */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-on-surface uppercase tracking-wide flex items-center justify-between">
                <span>{isAmharic ? 'የምዝገባ ቁጥር' : 'Registration Number'}</span>
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
                  className="w-full pl-9 pr-3 py-2 bg-surface-container/50 border border-outline-variant rounded-lg text-xs font-mono font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-[#0f172a]"
                />
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-secondary">
                  <Icon className="material-symbols-outlined text-[18px]">
                    badge
                  </Icon>
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
            </div>
          </div>

          {/* FETCHED OWNER INFORMATION & AUTO-CALCULATED FINANCIAL / EXPIRATION STATUS */}
          <div className="bg-surface-container/30 border border-outline-variant/70 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
              <div className="flex items-center gap-2">
                <Icon className="material-symbols-outlined text-[#0f172a] text-[20px]">person_pin</Icon>
                <h3 className="text-xs font-black text-on-surface uppercase tracking-wider">
                  {isAmharic ? 'ከማህደር የተወጣጣ የባለቤት መረጃ & የክፍያ ሁኔታ' : 'Fetched Owner Info & Expiration Status'}
                </h3>
              </div>
              {selectedRegInfo ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                  <span>{isAmharic ? 'ተገኝቷል' : 'Fetched from DB'}</span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-bold italic">
                  {isAmharic ? 'ምዝገባ ቁጥር ያስገቡ' : 'Enter Reg ID above'}
                </span>
              )}
            </div>

            {selectedRegInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-1">
                {/* Fetched Owner Full Name */}
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60">
                  <span className="block text-[10px] font-bold text-secondary uppercase">
                    {isAmharic ? 'የባለቤቱ ሙሉ ስም (ከDB የተወሰደ)' : 'Owner Full Name (Fetched)'}
                  </span>
                  <div className="text-xs font-black text-on-surface mt-1 flex items-center gap-2">
                    <Icon className="material-symbols-outlined text-[16px] text-slate-700">person</Icon>
                    <span>{selectedRegInfo.registration.fullName}</span>
                  </div>
                </div>

                {/* Fetched Plate Number */}
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60">
                  <span className="block text-[10px] font-bold text-secondary uppercase">
                    {isAmharic ? 'የሰሌዳ ቁጥር (ከDB የተወሰደ)' : 'Plate Number (Fetched)'}
                  </span>
                  <div className="text-xs font-mono font-black text-on-surface mt-1 flex items-center gap-2">
                    <Icon className="material-symbols-outlined text-[16px] text-slate-700">numbers</Icon>
                    <span>{selectedRegInfo.registration.plateNumber || (isAmharic ? 'ሰሌዳ የለውም' : 'No Plate')}</span>
                  </div>
                </div>

                {/* Fetched Phone Number */}
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60">
                  <span className="block text-[10px] font-bold text-secondary uppercase">
                    {isAmharic ? 'የስልክ ቁጥር (ከDB የተወሰደ)' : 'Phone Number (Fetched)'}
                  </span>
                  <div className="text-xs font-mono font-black text-on-surface mt-1 flex items-center gap-2">
                    <Icon className="material-symbols-outlined text-[16px] text-slate-700">call</Icon>
                    <span>{selectedRegInfo.registration.phone || (isAmharic ? 'ስልክ የለም' : 'No Phone')}</span>
                  </div>
                </div>

                {/* Auto-Calculated Last Payment Expiration Status */}
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60">
                  <span className="block text-[10px] font-bold text-secondary uppercase">
                    {isAmharic ? 'የመጨረሻ ክፍያ ማብቂያ ሁኔታ' : 'Last Payment Expiration Status'}
                  </span>
                  <div className="mt-1">
                    {selectedRegInfo.expirationStatusType === 'active' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <Icon className="material-symbols-outlined text-[14px]">check_circle</Icon>
                        <span>
                          {isAmharic ? 'ህጋዊ' : 'Active'} ({selectedRegInfo.daysRemaining} {isAmharic ? 'ቀን ይቀራል' : 'days left'})
                        </span>
                      </span>
                    )}
                    {selectedRegInfo.expirationStatusType === 'expiring_soon' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                        <Icon className="material-symbols-outlined text-[14px]">alarm</Icon>
                        <span>
                          {isAmharic ? 'ሊያልቅ ነው' : 'Expiring Soon'} ({selectedRegInfo.daysRemaining} {isAmharic ? 'ቀን' : 'days'})
                        </span>
                      </span>
                    )}
                    {selectedRegInfo.expirationStatusType === 'expired' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        <Icon className="material-symbols-outlined text-[14px]">error</Icon>
                        <span>
                          {isAmharic ? 'ጊዜው አልፏል' : 'Expired'} ({Math.abs(selectedRegInfo.daysRemaining)} {isAmharic ? 'ቀን አልፏል' : 'days ago'})
                        </span>
                      </span>
                    )}
                    {selectedRegInfo.expirationStatusType === 'none' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-black uppercase bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                        <Icon className="material-symbols-outlined text-[14px]">info</Icon>
                        <span>{isAmharic ? 'ቀደመ ክፍያ የለም' : 'No Previous Payment Recorded'}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Auto-Calculated Unpaid Debt */}
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/60 sm:col-span-2 md:col-span-2">
                  <span className="block text-[10px] font-bold text-secondary uppercase">
                    {isAmharic ? 'ያልተከፈለ ዕዳ (በስሌት የተገኘ)' : 'Auto-Calculated Unpaid Debt'}
                  </span>
                  <div className="mt-1">
                    {selectedRegInfo.unpaidDebtAmount > 0 ? (
                      selectedRegInfo.overdueMonths > 0 ? (
                        <div className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center gap-1.5 bg-rose-500/10 px-2.5 py-1 rounded border border-rose-500/30">
                          <Icon className="material-symbols-outlined text-[16px]">warning</Icon>
                          <span>
                            {selectedRegInfo.unpaidDebtAmount} ETB ({selectedRegInfo.overdueMonths} {isAmharic ? 'ወር ያለፈበት' : 'Month(s) Overdue'})
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/30">
                          <Icon className="material-symbols-outlined text-[16px]">schedule</Icon>
                          <span>{selectedRegInfo.unpaidDebtAmount} ETB ({isAmharic ? 'አዲስ ክፍያ' : 'Current Term Due'})</span>
                        </div>
                      )
                    ) : (
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/30">
                        <Icon className="material-symbols-outlined text-[16px]">check_circle</Icon>
                        <span>0 ETB ({isAmharic ? 'ዕዳ የለበትም' : 'Payment Up to Date'})</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500 space-y-1">
                <Icon className="material-symbols-outlined text-[28px] text-slate-300 dark:text-slate-600">search_hands_free</Icon>
                <p className="text-xs font-bold">
                  {isAmharic
                    ? 'ከላይ የምዝገባ ቁጥር ሲያስገቡ የባለቤቱ ስም፣ ሰሌዳ፣ የክፍያ ማብቂያ ሁኔታ እና ዕዳ በራስ-ሰር ይታያል።'
                    : 'Enter or select a Registration ID above to auto-fetch Owner Name, Plate Number, Expiration Status, and Unpaid Debt.'}
                </p>
              </div>
            )}

            {/* Already Paid Warning Alert Box */}
            {selectedRegInfo && selectedRegInfo.expirationStatusType === 'active' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2.5 text-amber-900 dark:text-amber-200 animate-fadeIn">
                <Icon className="material-symbols-outlined text-amber-600 text-[22px] shrink-0 mt-0.5">verified_user</Icon>
                <div className="space-y-0.5 text-xs">
                  <span className="font-extrabold block">
                    {isAmharic ? 'ባለቤቱ አስቀድሞ ክፍያ ፈፅሟል (Already Paid!)' : 'Owner Has Already Paid!'}
                  </span>
                  <p className="text-[11px] font-medium leading-relaxed">
                    {isAmharic
                      ? `የዚህ ባለቤት ክፍያ በንቃት ላይ ይገኛል (ቀሪ ቀን፦ ${selectedRegInfo.daysRemaining} ቀን)። የክፍያ ጊዜው ስላላለቀ ድጋሚ ክፍያ መክፈል አይቻልም።`
                      : `This owner's payment term is currently active (${selectedRegInfo.daysRemaining} days remaining). Re-payment is avoided.`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Amount */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-on-surface uppercase tracking-wide">
                {isAmharic ? 'የተከፈለው መጠን (ብር)' : 'Amount Paid (ETB)'}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2 bg-surface-container/50 border border-outline-variant rounded-lg text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-[#0f172a]"
              />
            </div>

            {/* CALCULATED EXPIRATION DATE DISPLAY (1 MONTH TERM) */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                <Icon className="material-symbols-outlined text-[16px]">event_available</Icon>
                <span>{isAmharic ? 'የ1 ወር ማብቂያ ቀን (በስሌት የተገኘ)' : 'Calculated 1 Month Expiry'}</span>
              </label>
              <div className="w-full px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center justify-between shadow-2xs">
                <span className="font-mono text-sm">{formatEthiopianDate(calculatedExpirationDate, isAmharic ? 'am' : 'en')}</span>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-extrabold bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100">
                  +1 {isAmharic ? 'ወር' : 'Month'}
                </span>
              </div>
            </div>
          </div>

          {/* Screenshot Upload Dropzone */}
          <div className="space-y-2 pt-2 border-t border-outline-variant/60">
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wide">
              {isAmharic ? 'የደረሰኝ ስክሪንሾት / ፎቶ (Receipt Screenshot Upload)' : 'Receipt Screenshot Upload'}
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-surface-container/40 p-3 rounded-lg border border-dashed border-outline-variant">
              {receiptScreenshot ? (
                <div className="relative w-32 h-24 rounded-lg overflow-hidden border border-outline-variant shadow-xs shrink-0 bg-black">
                  <img
                    src={receiptScreenshot}
                    alt="Receipt Screenshot"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReceiptScreenshot('')}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow-md cursor-pointer hover:bg-red-700"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="w-32 h-24 rounded-lg border border-outline-variant bg-surface-container flex flex-col items-center justify-center text-secondary shrink-0">
                  <Icon className="material-symbols-outlined text-[28px]">receipt</Icon>
                  <span className="text-[10px] font-bold mt-1">
                    {isAmharic ? 'ስክሪንሾት የለም' : 'No Screenshot'}
                  </span>
                </div>
              )}

              <div className="space-y-1.5 text-center sm:text-left">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotUpload}
                  id="receipt-screenshot-upload"
                  className="hidden"
                />
                <label
                  htmlFor="receipt-screenshot-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
                >
                  <Icon className="material-symbols-outlined text-[18px]">cloud_upload</Icon>
                  <span>{isAmharic ? 'ስክሪንሾት / ደረሰኝ ፎቶ ስቀል' : 'Upload Receipt Screenshot'}</span>
                </label>
                <p className="text-[11px] text-secondary">
                  {isAmharic
                    ? 'የቴሌብር/የባንክ ማረጋገጫ ስክሪንሾት ወይም የወረቀት ደረሰኙን ፎቶ ያያይዙ።'
                    : 'Upload Telebirr, CBE, or physical paper treasury receipt screenshot.'}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wide">
              {isAmharic ? 'ተጨማሪ ማብራሪያ' : 'Notes & Remarks'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAmharic ? 'ተጨማሪ መረጃ ካለ ያስገቡ...' : 'Add optional clerk notes...'}
              className="w-full px-3 py-2 bg-surface-container/50 border border-outline-variant rounded-lg text-xs font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-[#0f172a]"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold transition-all cursor-pointer"
            >
              {isAmharic ? 'ሰርዝ' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedRegInfo?.expirationStatusType === 'active'}
              className="px-5 py-2.5 rounded-lg bg-[#0f172a] hover:bg-slate-800 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white text-xs font-black transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-75"
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

      {/* TABLE SECTION CONTAINED IN UNIFIED CARD PATTERN */}
      {canViewTable && (
        <div className="bg-surface-container-lowest dark:bg-slate-900 border border-outline-variant dark:border-slate-800 rounded-lg shadow-xs overflow-hidden divide-y divide-outline-variant/60 dark:divide-slate-800">
          {/* SEARCH & STATUS FILTER TOOLBAR */}
          <div className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-outline-variant/40 dark:border-slate-800">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-0 max-w-md">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
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
                className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <Icon className="material-symbols-outlined text-[15px]">close</Icon>
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {[
                {
                  id: 'all' as const,
                  label: isAmharic ? 'ሁሉም' : 'All',
                  count: metrics.total,
                },
                {
                  id: 'active' as const,
                  label: isAmharic ? 'ትክክለኛ' : 'Active',
                  count: metrics.activeCount,
                },
                {
                  id: 'expiring_soon' as const,
                  label: isAmharic ? 'ሊያልቅ የደረሰ' : 'Expiring Soon',
                  count: metrics.expiringSoonCount,
                },
                {
                  id: 'expired' as const,
                  label: isAmharic ? 'ጊዜው ያለፈበት' : 'Expired',
                  count: metrics.expiredCount,
                },
              ].map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-all duration-200 active:scale-105 cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-yellow-500 text-[#1e293b] shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                        isActive
                          ? 'bg-[#1e293b]/20 text-[#1e293b]'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DESKTOP TABLE VIEW (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wider font-extrabold border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3.5 text-center w-12">#</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የደረሰኝ ቁጥር' : 'Receipt #'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የባለቤት ስም & ሰሌዳ' : 'Owner & Vehicle'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'የ1 ወር ማብቂያ ቀን & ሁኔታ' : 'Expiration & Status'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'መጠን (ብር)' : 'Amount'}</th>
                  <th className="px-4 py-3.5 text-center">{isAmharic ? 'ማረጋገጫ ፎቶ' : 'Proof'}</th>
                  <th className="px-4 py-3.5">{isAmharic ? 'መዝጋቢ' : 'Clerk'}</th>
                  <th className="px-4 py-3.5 text-right">{isAmharic ? 'ተግባራት' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Icon className="material-symbols-outlined text-[36px] text-slate-400">
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
                        <td className="px-4 py-3 text-center font-mono font-bold text-slate-400">
                          {idx + 1}
                        </td>

                        {/* Receipt Number */}
                        <td className="px-4 py-3 font-mono font-black text-on-surface">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-slate-800 dark:text-blue-300 border border-blue-500/20 font-bold">
                              <Icon className="material-symbols-outlined text-[14px]">receipt</Icon>
                              <span>{rc.receiptNumber}</span>
                            </span>
                            {rc.verifiedByCheki && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
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
                          <div className="font-black text-slate-900 dark:text-white">{rc.ownerName}</div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {rc.plateNumber && (
                              <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                                {rc.plateNumber}
                              </span>
                            )}
                            {rc.phone && <span>{rc.phone}</span>}
                          </div>
                        </td>

                        {/* Payment Date */}
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}
                          </div>
                        </td>

                        {/* Expiration Date & Status Badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}
                          </div>
                          <div className="mt-1">
                            {status === 'active' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                                <span>
                                  {isAmharic ? 'ህጋዊ' : 'Active'} ({daysRemaining} {isAmharic ? 'ቀን ይቀራል' : 'd left'})
                                </span>
                              </span>
                            )}
                            {status === 'expiring_soon' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                                <Icon className="material-symbols-outlined text-[12px]">alarm</Icon>
                                <span>
                                  {isAmharic ? 'ሊያልቅ ነው' : 'Expiring Soon'} ({daysRemaining} {isAmharic ? 'ቀን' : 'd'})
                                </span>
                              </span>
                            )}
                            {status === 'expired' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                <Icon className="material-symbols-outlined text-[12px]">error</Icon>
                                <span>{isAmharic ? 'ጊዜው አልፏል' : 'Expired'}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 font-black whitespace-nowrap text-slate-900 dark:text-white">
                          {rc.amount || '500 ETB'}
                        </td>

                        {/* Proof Screenshot Thumbnail */}
                        <td className="px-4 py-3 text-center">
                          {rc.receiptScreenshot ? (
                            <button
                              type="button"
                              onClick={() => setPreviewReceipt(rc)}
                              className="inline-block relative w-10 h-10 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-2xs hover:scale-105 transition-transform cursor-pointer group bg-black"
                              title={isAmharic ? 'ስክሪንሾት በትልቅ መጠን ይመልከቱ' : 'View screenshot'}
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
                            <span className="text-[10px] text-slate-400 font-bold italic">
                              {isAmharic ? 'ምንም ፎቶ የለም' : 'No Proof'}
                            </span>
                          )}
                        </td>

                        {/* Entered By Clerk */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            {rc.enteredBy}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {rc.receiptScreenshot && (
                              <button
                                type="button"
                                onClick={() => setPreviewReceipt(rc)}
                                className="p-1.5 rounded-md text-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-all cursor-pointer"
                                title={isAmharic ? 'እይታ' : 'View Proof'}
                              >
                                <Icon className="material-symbols-outlined text-[18px]">visibility</Icon>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(rc.id)}
                              className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all cursor-pointer"
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

          {/* MOBILE CARD VIEW (< md) */}
          <div className="block md:hidden divide-y divide-slate-200 dark:divide-slate-800">
            {filteredReceipts.length === 0 ? (
              <div className="p-10 text-center text-slate-500 dark:text-slate-400 space-y-1.5">
                <Icon className="material-symbols-outlined text-[36px] text-slate-400 dark:text-slate-600 mx-auto block">find_in_page</Icon>
                <p className="font-bold text-xs text-slate-700 dark:text-slate-200">
                  {isAmharic ? 'ምንም የተመዘገበ የክፍያ ደረሰኝ አልተገኘም።' : 'No payment receipts found matching criteria.'}
                </p>
              </div>
            ) : (
              filteredReceipts.map((rc) => {
                const { status, daysRemaining } = getPaymentReceiptStatus(rc.expirationDate);

                return (
                  <div
                    key={rc.id}
                    className="p-3.5 sm:p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors space-y-3"
                  >
                    {/* Top Header Row: Receipt # & Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/10 text-slate-800 dark:text-blue-300 border border-blue-500/20 font-mono font-black text-xs">
                          <Icon className="material-symbols-outlined text-[14px]">receipt</Icon>
                          <span>{rc.receiptNumber}</span>
                        </span>
                        {rc.verifiedByCheki && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            title={`Verified on Bank System via Cheki (${rc.chekiBank || 'Bank'})`}
                          >
                            <Icon className="material-symbols-outlined text-[10px]">verified</Icon>
                            <span>Cheki</span>
                          </span>
                        )}
                      </div>

                      <div>
                        {status === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                            <span>
                              {isAmharic ? 'ህጋዊ' : 'Active'} ({daysRemaining} {isAmharic ? 'ቀን' : 'd'})
                            </span>
                          </span>
                        )}
                        {status === 'expiring_soon' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                            <Icon className="material-symbols-outlined text-[12px]">alarm</Icon>
                            <span>
                              {isAmharic ? 'ሊያልቅ ነው' : 'Expiring Soon'} ({daysRemaining} {isAmharic ? 'ቀን' : 'd'})
                            </span>
                          </span>
                        )}
                        {status === 'expired' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            <Icon className="material-symbols-outlined text-[12px]">error</Icon>
                            <span>{isAmharic ? 'ጊዜው አልፏል' : 'Expired'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Owner & Plate Information */}
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">
                        {rc.ownerName}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {rc.plateNumber && (
                          <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                            {rc.plateNumber}
                          </span>
                        )}
                        {rc.phone && <span>{rc.phone}</span>}
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg text-xs border border-slate-200/60 dark:border-slate-700/60">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">
                          {isAmharic ? 'የተከፈለበት ቀን' : 'Payment Date'}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatEthiopianDate(rc.paymentDate, isAmharic ? 'am' : 'en')}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">
                          {isAmharic ? 'የ1 ወር ማብቂያ' : 'Expiration Date'}
                        </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatEthiopianDate(rc.expirationDate, isAmharic ? 'am' : 'en')}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">
                          {isAmharic ? 'መጠን' : 'Amount'}
                        </span>
                        <span className="font-black text-slate-900 dark:text-white">
                          {rc.amount || '500 ETB'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">
                          {isAmharic ? 'መዝጋቢ' : 'Clerk'}
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {rc.enteredBy}
                        </span>
                      </div>
                    </div>

                    {/* Actions & Proof Preview Footer */}
                    <div className="flex items-center justify-between pt-1">
                      {rc.receiptScreenshot ? (
                        <button
                          type="button"
                          onClick={() => setPreviewReceipt(rc)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-slate-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold hover:bg-blue-100 cursor-pointer"
                        >
                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                          <span>{isAmharic ? 'ማረጋገጫ ፎቶ እይ' : 'View Proof Image'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {isAmharic ? 'ምንም ፎቶ የለም' : 'No Proof Image'}
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(rc.id)}
                          className="px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold hover:bg-rose-100 cursor-pointer flex items-center gap-1"
                        >
                          <Icon className="material-symbols-outlined text-[15px]">delete</Icon>
                          <span>{isAmharic ? 'ሰርዝ' : 'Delete'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* FULLSCREEN RECEIPT PROOF INSPECTOR MODAL */}
      {previewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <div>
                <h3 className="text-base font-black text-on-surface uppercase tracking-wide flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-slate-700 text-[22px]">receipt</Icon>
                  <span>{isAmharic ? 'የክፍያ ደረሰኝ ስክሪንሾት' : 'Payment Receipt Screenshot'}</span>
                  {previewReceipt.verifiedByCheki && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      <Icon className="material-symbols-outlined text-[12px]">verified</Icon>
                      <span>Cheki Verified ({previewReceipt.chekiBank || 'Bank'})</span>
                    </span>
                  )}
                </h3>
                <p className="text-xs text-secondary font-mono mt-0.5">
                  #{previewReceipt.receiptNumber} — {previewReceipt.ownerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Proof Screenshot Image */}
            <div className="max-h-[60vh] overflow-auto rounded-xl bg-black/90 flex items-center justify-center p-2 border border-outline-variant">
              {previewReceipt.receiptScreenshot ? (
                <img
                  src={previewReceipt.receiptScreenshot}
                  alt="Full Receipt Proof"
                  className="max-h-[55vh] w-auto object-contain rounded-lg"
                />
              ) : (
                <div className="p-12 text-center text-slate-400">
                  {isAmharic ? 'ምንም ስክሪንሾት አልተያያዘም።' : 'No screenshot attached.'}
                </div>
              )}
            </div>

            {/* Receipt Summary Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-surface-container/50 p-3 rounded-xl text-xs">
              <div>
                <span className="block text-[10px] text-secondary font-bold uppercase">{isAmharic ? 'የክፍያ ቀን' : 'Payment Date'}</span>
                <span className="font-extrabold text-on-surface">{previewReceipt.paymentDate}</span>
              </div>
              <div>
                <span className="block text-[10px] text-secondary font-bold uppercase">{isAmharic ? 'የ1 ወር ማብቂያ' : 'Expiration Date'}</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{previewReceipt.expirationDate}</span>
              </div>
              <div>
                <span className="block text-[10px] text-secondary font-bold uppercase">{isAmharic ? 'መጠን' : 'Amount'}</span>
                <span className="font-extrabold text-on-surface">{previewReceipt.amount || '500 ETB'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-secondary font-bold uppercase">{isAmharic ? 'መዝጋቢ' : 'Clerk'}</span>
                <span className="font-extrabold text-on-surface">{previewReceipt.enteredBy}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="px-5 py-2 rounded-lg bg-[#0f172a] text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
              >
                {isAmharic ? 'ዝጋ' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <Icon className="material-symbols-outlined text-[28px]">warning</Icon>
              <h3 className="text-base font-black uppercase tracking-wide">
                {isAmharic ? 'የክፍያ ደረሰኝ ሰርዝ?' : 'Delete Payment Receipt?'}
              </h3>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              {isAmharic
                ? 'ይህንን የተመዘገበ የክፍያ ደረሰኝ ከሲስተሙ ለመሰረዝ እርግጠኛ ነዎት? ይህ ተግባር አይመለስም።'
                : 'Are you sure you want to delete this registered payment receipt? This action cannot be undone.'}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold transition-all cursor-pointer"
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
