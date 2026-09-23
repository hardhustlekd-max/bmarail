export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
  monthNameAm: string;
  monthNameEn: string;
  weekdayAm: string;
  weekdayEn: string;
  formattedAm: string;
  formattedEn: string;
  timeAm: string;
  timeEn: string;
  traditionalTimeAm: string;
  traditionalTimeEn: string;
  isPagume: boolean;
}

export const ETHIOPIAN_MONTHS = [
  { id: 1, am: 'መስከረም', en: 'Meskerem', shortAm: 'መስ', shortEn: 'Mes' },
  { id: 2, am: 'ጥቅምት', en: 'Tikimt', shortAm: 'ጥቅ', shortEn: 'Tik' },
  { id: 3, am: 'ኅዳር', en: 'Hidar', shortAm: 'ኅዳ', shortEn: 'Hid' },
  { id: 4, am: 'ታኅሣሥ', en: 'Tahsas', shortAm: 'ታኅ', shortEn: 'Tah' },
  { id: 5, am: 'ጥር', en: 'Tir', shortAm: 'ጥር', shortEn: 'Tir' },
  { id: 6, am: 'የካቲት', en: 'Yekatit', shortAm: 'የካ', shortEn: 'Yek' },
  { id: 7, am: 'መጋቢት', en: 'Megabit', shortAm: 'መጋ', shortEn: 'Meg' },
  { id: 8, am: 'ሚያዝያ', en: 'Miyazya', shortAm: 'ሚያ', shortEn: 'Miy' },
  { id: 9, am: 'ግንቦት', en: 'Ginbot', shortAm: 'ግን', shortEn: 'Gin' },
  { id: 10, am: 'ሰኔ', en: 'Sene', shortAm: 'ሰኔ', shortEn: 'Sen' },
  { id: 11, am: 'ሐምሌ', en: 'Hamle', shortAm: 'ሐም', shortEn: 'Ham' },
  { id: 12, am: 'ነሐሴ', en: 'Nehase', shortAm: 'ነሐ', shortEn: 'Neh' },
  { id: 13, am: 'ጳጉሜ', en: 'Pagume', shortAm: 'ጳጉ', shortEn: 'Pag' },
] as const;

export const ETHIOPIAN_WEEKDAYS = [
  { id: 0, am: 'እሑድ', en: 'Sunday' },
  { id: 1, am: 'ሰኞ', en: 'Monday' },
  { id: 2, am: 'ማክሰኞ', en: 'Tuesday' },
  { id: 3, am: 'ረቡዕ', en: 'Wednesday' },
  { id: 4, am: 'ሐሙስ', en: 'Thursday' },
  { id: 5, am: 'ዓርብ', en: 'Friday' },
  { id: 6, am: 'ቅዳሜ', en: 'Saturday' },
] as const;

/**
 * Parses any date input and converts to GMT+3 (East Africa Time) components
 */
function getEATDateComponents(input?: Date | string | number | null) {
  let baseDate: Date;
  if (!input) {
    baseDate = new Date();
  } else if (input instanceof Date) {
    baseDate = isNaN(input.getTime()) ? new Date() : input;
  } else if (typeof input === 'number') {
    baseDate = new Date(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      baseDate = new Date();
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      baseDate = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    } else {
      const d = new Date(trimmed);
      baseDate = isNaN(d.getTime()) ? new Date() : d;
    }
  } else {
    baseDate = new Date();
  }

  // Shift timestamp to East Africa Time (UTC+3 / GMT+3)
  const utcMs = baseDate.getTime();
  const eatMs = utcMs + 3 * 3600 * 1000;
  const eatDate = new Date(eatMs);

  return {
    gYear: eatDate.getUTCFullYear(),
    gMonth: eatDate.getUTCMonth() + 1,
    gDay: eatDate.getUTCDate(),
    dayOfWeek: eatDate.getUTCDay(),
    hours: eatDate.getUTCHours(),
    minutes: eatDate.getUTCMinutes(),
    seconds: eatDate.getUTCSeconds(),
  };
}

/**
 * Accurate Gregorian to Ethiopian Date algorithm (strictly bound to GMT+3)
 */
export function toEthiopianDate(gregorianDateInput?: Date | string | number | null): EthiopianDate {
  const { gYear, gMonth, gDay, dayOfWeek, hours, minutes, seconds } = getEATDateComponents(gregorianDateInput);

  // JDN (Julian Day Number)
  const a = Math.floor((14 - gMonth) / 12);
  const y = gYear + 4800 - a;
  const m = gMonth + 12 * a - 3;
  const jdn =
    gDay +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  // JDN to Ethiopian
  const ethJdnOffset = 1723856;
  const daysSinceEpoch = jdn - ethJdnOffset;
  const ethEra = Math.floor(daysSinceEpoch / 1461);
  const remDaysInEra = daysSinceEpoch % 1461;
  const ethYearInEra = Math.min(Math.floor(remDaysInEra / 365), 3);
  const dayOfYear = remDaysInEra - ethYearInEra * 365;

  const ethYear = ethEra * 4 + ethYearInEra;
  const ethMonth = Math.floor(dayOfYear / 30) + 1;
  const ethDay = (dayOfYear % 30) + 1;

  const monthObj = ETHIOPIAN_MONTHS[ethMonth - 1] || ETHIOPIAN_MONTHS[0];
  const weekdayObj = ETHIOPIAN_WEEKDAYS[dayOfWeek] || ETHIOPIAN_WEEKDAYS[0];

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  // Traditional Ethiopian 12-hour Clock System (shifted by 6 hours in GMT+3)
  // 6:00 AM (Sunrise) is 12:00 morning, 7:00 AM is 1:00 ጠዋት, 1:00 PM is 7:00 ከሰዓት, 6:00 PM is 12:00 ምሽት, 7:00 PM is 1:00 ምሽት, 12:00 AM is 6:00 ሌሊት
  const ethHour = (hours + 6) % 12 || 12;
  let ethPeriodAm = 'ጠዋት';
  let ethPeriodEn = 'Morning';

  if (hours >= 6 && hours < 12) {
    ethPeriodAm = 'ጠዋት';
    ethPeriodEn = 'Morning';
  } else if (hours >= 12 && hours < 18) {
    ethPeriodAm = 'ከሰዓት';
    ethPeriodEn = 'Afternoon';
  } else if (hours >= 18 && hours < 24) {
    ethPeriodAm = 'ምሽት';
    ethPeriodEn = 'Evening';
  } else {
    ethPeriodAm = 'ሌሊት';
    ethPeriodEn = 'Night';
  }

  const timeAm = `${ethHour}:${pad(minutes)}:${pad(seconds)} ${ethPeriodAm}`;
  const timeEn = `${ethHour}:${pad(minutes)}:${pad(seconds)} ${ethPeriodEn}`;

  const traditionalTimeAm = `${ethHour}:${pad(minutes)} ${ethPeriodAm}`;
  const traditionalTimeEn = `${ethHour}:${pad(minutes)} ${ethPeriodEn}`;

  return {
    year: ethYear,
    month: ethMonth,
    day: ethDay,
    monthNameAm: monthObj.am,
    monthNameEn: monthObj.en,
    weekdayAm: weekdayObj.am,
    weekdayEn: weekdayObj.en,
    formattedAm: `${monthObj.am} ${ethDay}, ${ethYear} ዓ.ም`,
    formattedEn: `${monthObj.en} ${ethDay}, ${ethYear} E.C.`,
    timeAm,
    timeEn,
    traditionalTimeAm,
    traditionalTimeEn,
    isPagume: ethMonth === 13,
  };
}

/**
 * Converts Ethiopian Calendar Date (Year, Month 1-13, Day 1-30) to Gregorian Date object and ISO date string
 */
export function ethiopianToGregorian(ethYear: number, ethMonth: number, ethDay: number): { gYear: number; gMonth: number; gDay: number; dateStr: string } {
  const dayOfYear = (ethMonth - 1) * 30 + (ethDay - 1);
  const ethEra = Math.floor(ethYear / 4);
  const ethYearInEra = ethYear % 4;
  const daysSinceEpoch = ethEra * 1461 + ethYearInEra * 365 + dayOfYear;
  const jdn = daysSinceEpoch + 1723856;

  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l1 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l1 + 1)) / 1461001);
  const l2 = l1 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l2) / 2447);
  const gDay = l2 - Math.floor((2447 * j) / 80);
  const l3 = Math.floor(j / 11);
  const gMonth = j + 2 - 12 * l3;
  const gYear = 100 * (n - 49) + i + l3;
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    gYear,
    gMonth,
    gDay,
    dateStr: `${gYear}-${pad(gMonth)}-${pad(gDay)}`,
  };
}

export function formatEthiopianHeaderDate(date: Date = new Date(), lang: 'am' | 'en' = 'am'): string {
  const eth = toEthiopianDate(date);
  if (lang === 'am') {
    return `${eth.monthNameAm} ${eth.day}, ${eth.year} ዓ.ም`;
  }
  return `${eth.monthNameEn} ${eth.day}, ${eth.year} E.C.`;
}

/**
 * Returns formatted Ethiopian Date only (e.g. "መስከረም 13, 2019 ዓ.ም" / "Meskerem 13, 2019 E.C.")
 */
export function formatEthiopianDate(dateInput?: Date | string | number | null, lang: 'am' | 'en' = 'am'): string {
  if (!dateInput) return '—';
  const eth = toEthiopianDate(dateInput);
  return lang === 'am' ? eth.formattedAm : eth.formattedEn;
}

/**
 * Returns formatted Ethiopian Time only in Ethiopian 12-hour traditional time (e.g. "1:45 ከሰዓት" / "1:45 Afternoon")
 */
export function formatEthiopianTime(dateInput?: Date | string | number | null, lang: 'am' | 'en' = 'am'): string {
  if (!dateInput) return '—';
  const eth = toEthiopianDate(dateInput);
  return lang === 'am' ? eth.traditionalTimeAm : eth.traditionalTimeEn;
}

/**
 * Returns full formatted Ethiopian Date and Ethiopian Time (e.g. "መስከረም 13, 2019 ዓ.ም (1:45 ከሰዓት)" / "Meskerem 13, 2019 E.C. (1:45 Afternoon)")
 */
export function formatEthiopianDateTime(dateInput?: Date | string | number | null, lang: 'am' | 'en' = 'am'): string {
  if (!dateInput) return '—';
  const eth = toEthiopianDate(dateInput);
  if (lang === 'am') {
    return `${eth.formattedAm} (${eth.traditionalTimeAm})`;
  }
  return `${eth.formattedEn} (${eth.traditionalTimeEn})`;
}
