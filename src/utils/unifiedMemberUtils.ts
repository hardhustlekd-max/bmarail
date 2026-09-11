import { MotorcycleRegistration, PaymentReceipt } from '../types';
import { calculateOneMonthExpiration, getPaymentReceiptStatus, PaymentStatusType } from './paymentUtils';

export interface UnifiedPaymentCompliance {
  status: PaymentStatusType | 'none';
  daysRemaining: number | null;
  labelAm: string;
  labelEn: string;
  badgeClass: string;
}

/**
 * Returns all payment receipts matching a registration record, sorted newest first.
 */
export function getReceiptsForRegistration(
  reg: MotorcycleRegistration,
  allReceipts: PaymentReceipt[] = []
): PaymentReceipt[] {
  if (!reg) return [];

  const regId = (reg.id || '').trim().toLowerCase();
  const regPlate = (reg.plateNumber || '').trim().toLowerCase();

  const matched = allReceipts.filter((rc) => {
    if (!rc) return false;
    const rcRegId = (rc.ownerRegistrationId || '').trim().toLowerCase();
    if (rcRegId && regId && rcRegId === regId) return true;

    const rcPlate = (rc.plateNumber || '').trim().toLowerCase();
    if (rcPlate && regPlate && rcPlate === regPlate) return true;

    return false;
  });

  // Sort descending by paymentDate or createdAt
  return matched.sort((a, b) => {
    const timeA = new Date(a.paymentDate || a.createdAt || 0).getTime();
    const timeB = new Date(b.paymentDate || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

/**
 * Returns the most recent payment receipt for a registration record.
 * Falls back to initial receipt info embedded in the registration document if available.
 */
export function getLatestReceiptForRegistration(
  reg: MotorcycleRegistration,
  allReceipts: PaymentReceipt[] = []
): PaymentReceipt | null {
  const receipts = getReceiptsForRegistration(reg, allReceipts);
  if (receipts.length > 0) {
    return receipts[0];
  }

  // Check if registration itself has initial receipt fields recorded during intake
  if (reg.receiptNumber || reg.paymentAmount || reg.receiptScreenshot) {
    const payDate = reg.registrationDate || new Date().toISOString().split('T')[0];
    return {
      id: `initial-${reg.id}`,
      receiptNumber: reg.receiptNumber || 'INITIAL',
      ownerRegistrationId: reg.id,
      ownerName: reg.fullName || '',
      plateNumber: reg.plateNumber,
      phone: reg.phone,
      paymentDate: payDate,
      expirationDate: calculateOneMonthExpiration(payDate),
      amount: reg.paymentAmount,
      receiptScreenshot: reg.receiptScreenshot,
      enteredBy: reg.registeredBy || '',
      createdAt: payDate,
    };
  }

  return null;
}

/**
 * Derives payment compliance standing for a registration record.
 */
export function getUnifiedPaymentCompliance(
  reg: MotorcycleRegistration,
  allReceipts: PaymentReceipt[] = []
): UnifiedPaymentCompliance {
  const latestReceipt = getLatestReceiptForRegistration(reg, allReceipts);

  if (!latestReceipt || !latestReceipt.expirationDate) {
    return {
      status: 'none',
      daysRemaining: null,
      labelAm: 'ክፍያ አልተመዘገበም',
      labelEn: 'No Receipt',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
    };
  }

  const { status, daysRemaining } = getPaymentReceiptStatus(latestReceipt.expirationDate);

  if (status === 'active') {
    return {
      status: 'active',
      daysRemaining,
      labelAm: `ህጋዊ (${daysRemaining} ቀናት)`,
      labelEn: `Active (${daysRemaining}d)`,
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    };
  } else if (status === 'expiring_soon') {
    return {
      status: 'expiring_soon',
      daysRemaining,
      labelAm: `ሊያልቅ የደረሰ (${daysRemaining} ቀናት)`,
      labelEn: `Expiring Soon (${daysRemaining}d)`,
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
    };
  } else {
    return {
      status: 'expired',
      daysRemaining,
      labelAm: 'ጊዜው ያለፈበት',
      labelEn: 'Expired',
      badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
    };
  }
}
