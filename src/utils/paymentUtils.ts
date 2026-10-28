import { toEthiopianDate, ethiopianToGregorian, normalizeToGregorianDateStr } from './ethiopianCalendar';

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
  vehicleCategory?: string;
  status?: string;
  verifiedByCheki?: boolean;
  chekiBank?: string;
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

export interface ProRatedPaymentCalc {
  registrationDate: string;
  monthlyFee: number;
  daysInMonth: number;
  dayOfMonth: number;
  remainingDays: number;
  dailyRate: number;
  proRatedFee: number;
  advanceMonths: number;
  advanceFee: number;
  totalAmount: number;
  expirationDate: string;
  isFullMonth: boolean;
}

/**
 * Calculates exact daily pro-rated payment for the registration month
 * plus optional advance months (0 to 12).
 */
export function calculateRegistrationPayment(
  registrationDateStr: string,
  monthlyFee: number = 500,
  advanceMonths: number = 0
): ProRatedPaymentCalc {
  const defaultFee = typeof monthlyFee === 'number' && monthlyFee > 0 ? monthlyFee : 500;
  const adv = Math.max(0, Math.floor(advanceMonths || 0));

  let dayOfMonth = 1;
  let daysInMonth = 30;

  if (registrationDateStr) {
    try {
      const eth = toEthiopianDate(registrationDateStr);
      if (eth && eth.day && eth.month) {
        dayOfMonth = eth.day;
        daysInMonth = eth.month === 13 ? (eth.isPagume ? 5 : 6) : 30;
      } else {
        const dateObj = new Date(registrationDateStr);
        if (!isNaN(dateObj.getTime())) {
          dayOfMonth = dateObj.getDate();
          const yr = dateObj.getFullYear();
          const mo = dateObj.getMonth() + 1;
          daysInMonth = new Date(yr, mo, 0).getDate();
        }
      }
    } catch {
      // default 1 and 30
    }
  }

  // Ensure dayOfMonth within bounds
  if (dayOfMonth < 1) dayOfMonth = 1;
  if (dayOfMonth > daysInMonth) dayOfMonth = daysInMonth;

  const isFullMonth = dayOfMonth === 1;
  const remainingDays = daysInMonth - dayOfMonth + 1; // inclusive of registration day
  const dailyRate = defaultFee / daysInMonth;
  const proRatedFee = isFullMonth ? defaultFee : Math.round(remainingDays * dailyRate);
  const advanceFee = adv * defaultFee;
  const totalAmount = proRatedFee + advanceFee;

  // Expiration calculation:
  // Current month coverage + advanceMonths full months
  const expirationDate = calculateNMonthsExpiration(registrationDateStr, 1 + adv);

  return {
    registrationDate: registrationDateStr,
    monthlyFee: defaultFee,
    daysInMonth,
    dayOfMonth,
    remainingDays,
    dailyRate,
    proRatedFee,
    advanceMonths: adv,
    advanceFee,
    totalAmount,
    expirationDate,
    isFullMonth,
  };
}

/**
 * Calculates expiration date N Ethiopian months from payment date in standard Ethiopian calendar (YYYY-MM-DD).
 */
export function calculateNMonthsExpiration(startDateStr: string, monthsCount: number = 1): string {
  if (!startDateStr) return '';
  const count = Math.max(1, monthsCount);
  try {
    const eth = toEthiopianDate(startDateStr);
    if (eth && eth.year && eth.month) {
      let nextYear = eth.year;
      let nextMonth = eth.month + count;
      while (nextMonth > 12) {
        nextMonth -= 12;
        nextYear += 1;
      }
      const nextDay = Math.min(eth.day, 30);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${nextYear}-${pad(nextMonth)}-${pad(nextDay)}`;
    }
  } catch (err) {
    // Fallback below
  }

  const dateObj = new Date(startDateStr);
  if (isNaN(dateObj.getTime())) return startDateStr;
  dateObj.setMonth(dateObj.getMonth() + count);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates expiration date 1 Ethiopian month (30 days) from payment date in standard Ethiopian calendar (YYYY-MM-DD).
 */
export function calculateOneMonthExpiration(paymentDateStr: string): string {
  return calculateNMonthsExpiration(paymentDateStr, 1);
}

/**
 * Derives payment status and days remaining relative to today, robust to both Ethiopian and Gregorian date strings.
 */
export function getPaymentReceiptStatus(expirationDateStr: string): PaymentStatusInfo {
  if (!expirationDateStr) {
    return { status: 'expired', daysRemaining: 0 };
  }

  // Ensure date string is converted to Gregorian for accurate epoch comparison against today
  const gregExpStr = normalizeToGregorianDateStr(expirationDateStr);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(gregExpStr);
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

