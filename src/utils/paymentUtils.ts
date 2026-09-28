import { toEthiopianDate, ethiopianToGregorian } from './ethiopianCalendar';

export interface PaymentReceipt {
  id: string;
  receiptNumber: string;
  ownerRegistrationId?: string;
  ownerName: string;
  plateNumber?: string;
  phone?: string;
  paymentDate: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  expirationDate: string; // YYYY-MM-DD (1 month from paymentDate)
  amount?: number | string;
  receiptScreenshot?: string;
  notes?: string;
  enteredBy: string; // clerk badgeId or name
  createdAt: string;
}

export type PaymentStatusType = 'active' | 'expiring_soon' | 'expired';

export type TermStatus = 'CURRENT' | 'DUE' | 'DELINQUENT';

export interface PaymentStatusInfo {
  status: PaymentStatusType;
  daysRemaining: number;
}

/**
 * Calculates authoritative financial status for a registration:
 * CURRENT: Active paid term with > 5 days remaining.
 * DUE: Expiring soon (within 5 days or today).
 * DELINQUENT: Past expiration date or missing payment.
 */
export function calculateTermStatus(expirationDateStr?: string): TermStatus {
  if (!expirationDateStr) {
    return 'DELINQUENT';
  }
  const statusInfo = getPaymentReceiptStatus(expirationDateStr);
  if (statusInfo.status === 'active') {
    return 'CURRENT';
  } else if (statusInfo.status === 'expiring_soon') {
    return 'DUE';
  } else {
    return 'DELINQUENT';
  }
}

/**
 * Calculates expiration date 1 Ethiopian month (30 days) from payment date.
 */
export function calculateOneMonthExpiration(paymentDateStr: string): string {
  if (!paymentDateStr) return '';

  // 1. Calculate strictly according to the Ethiopian calendar (30 days per month)
  try {
    const eth = toEthiopianDate(paymentDateStr);
    if (eth && eth.year && eth.month) {
      let nextYear = eth.year;
      let nextMonth = eth.month + 1;
      if (nextMonth > 13) {
        nextMonth = 1;
        nextYear += 1;
      } else if (nextMonth === 13) {
        // Month 13 is Pagume (5 or 6 days). In Ethiopian monthly billing, 1 month after Nehase is Meskerem of next year
        nextMonth = 1;
        nextYear += 1;
      }
      const nextDay = Math.min(eth.day, 30);
      const greg = ethiopianToGregorian(nextYear, nextMonth, nextDay);
      if (greg && greg.dateStr) {
        return greg.dateStr;
      }
    }
  } catch (err) {
    // Fallback below
  }

  // 2. Gregorian fallback
  const dateObj = new Date(paymentDateStr);
  if (isNaN(dateObj.getTime())) return paymentDateStr;

  const targetMonth = dateObj.getMonth() + 1;
  dateObj.setMonth(targetMonth);

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Derives payment status and days remaining relative to today.
 */
export function getPaymentReceiptStatus(expirationDateStr: string): PaymentStatusInfo {
  if (!expirationDateStr) {
    return { status: 'expired', daysRemaining: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(expirationDateStr);
  expDate.setHours(23, 59, 59, 999);

  if (isNaN(expDate.getTime())) {
    return { status: 'expired', daysRemaining: 0 };
  }

  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'expired', daysRemaining: diffDays };
  } else if (diffDays <= 5) {
    return { status: 'expiring_soon', daysRemaining: diffDays };
  } else {
    return { status: 'active', daysRemaining: diffDays };
  }
}
