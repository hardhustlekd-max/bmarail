import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from './ui/Icon';
import {
  ETHIOPIAN_MONTHS,
  ETHIOPIAN_WEEKDAYS,
  toEthiopianDate,
  ethiopianToGregorian,
  getEthiopianMonthDetails,
  formatEthiopianDate,
} from '../utils/ethiopianCalendar';

export type DateRangePreset = 'this_month' | 'all' | 'this_year' | 'custom';

export interface EthiopianDateRangePickerProps {
  startDate: string;
  endDate: string;
  preset: DateRangePreset;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onPresetChange: (preset: DateRangePreset) => void;
  lang?: 'am' | 'en';
  className?: string;
}

export function computeEthiopianPresetRange(preset: DateRangePreset): { start: string; end: string } {
  const now = new Date();
  if (preset === 'all') return { start: '', end: '' };
  const ethNow = toEthiopianDate(now);

  if (preset === 'this_month') {
    const ethStart = ethiopianToGregorian(ethNow.year, ethNow.month, 1);
    const lastEthDay = ethNow.isPagume ? 6 : 30;
    const ethEnd = ethiopianToGregorian(ethNow.year, ethNow.month, lastEthDay);
    return {
      start: ethStart.dateStr,
      end: ethEnd.dateStr,
    };
  }

  if (preset === 'this_year') {
    const ethStart = ethiopianToGregorian(ethNow.year, 1, 1);
    const ethEnd = ethiopianToGregorian(ethNow.year, 13, 6);
    return {
      start: ethStart.dateStr,
      end: ethEnd.dateStr,
    };
  }

  return { start: '', end: '' };
}

export const EthiopianDateRangePicker: React.FC<EthiopianDateRangePickerProps> = ({
  startDate,
  endDate,
  preset,
  onStartDateChange,
  onEndDateChange,
  onPresetChange,
  lang = 'am',
  className = '',
}) => {
  const isAmharic = lang === 'am';
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [alignment, setAlignment] = useState<'left' | 'right'>('left');
  const [activeDateTab, setActiveDateTab] = useState<'from' | 'to'>('from');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const todayEth = useMemo(() => toEthiopianDate(new Date()), []);

  // Temporary local state for custom range inside floating popover
  const [tempStart, setTempStart] = useState<string>(startDate);
  const [tempEnd, setTempEnd] = useState<string>(endDate);

  // Sync temp dates when props change
  useEffect(() => {
    setTempStart(startDate);
    setTempEnd(endDate);
  }, [startDate, endDate]);

  // Compute best alignment dynamically based on viewport edges
  useEffect(() => {
    if (!isCustomOpen || !dropdownRef.current) return;

    const computeOptimalAlignment = () => {
      if (!dropdownRef.current) return;
      const rect = dropdownRef.current.getBoundingClientRect();
      const popoverWidth = 315;
      const viewportWidth = window.innerWidth;

      const wouldOverflowRight = rect.left + popoverWidth > viewportWidth - 16;
      const wouldOverflowLeft = rect.right - popoverWidth < 16;

      if (wouldOverflowRight && !wouldOverflowLeft) {
        setAlignment('right');
      } else {
        setAlignment('left');
      }
    };

    computeOptimalAlignment();
    window.addEventListener('resize', computeOptimalAlignment);
    window.addEventListener('scroll', computeOptimalAlignment, true);
    return () => {
      window.removeEventListener('resize', computeOptimalAlignment);
      window.removeEventListener('scroll', computeOptimalAlignment, true);
    };
  }, [isCustomOpen]);

  // Click outside listener to dismiss floating dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCustomOpen(false);
      }
    };
    if (isCustomOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isCustomOpen]);

  // Derive calendar view for current active tab (from or to)
  const activeDateValue = activeDateTab === 'from' ? tempStart : tempEnd;
  const activeEthDate = useMemo(() => {
    return toEthiopianDate(activeDateValue || new Date());
  }, [activeDateValue]);

  const [viewYear, setViewYear] = useState<number>(() => activeEthDate.year);
  const [viewMonth, setViewMonth] = useState<number>(() => activeEthDate.month);

  // When switching activeDateTab (from vs to), sync viewYear and viewMonth
  useEffect(() => {
    const targetDate = activeDateTab === 'from' ? tempStart : tempEnd;
    if (targetDate) {
      try {
        const eth = toEthiopianDate(targetDate);
        setViewYear(eth.year);
        setViewMonth(eth.month);
      } catch {}
    }
  }, [activeDateTab]);

  const presetOptions: { key: DateRangePreset; label: string }[] = [
    { key: 'this_month', label: isAmharic ? 'ይህ ወር' : 'This Month' },
    { key: 'all', label: isAmharic ? 'ሁሉም ጊዜ' : 'All Time' },
    { key: 'this_year', label: isAmharic ? 'ይህ ዓመት' : 'This Year' },
  ];

  const handleSelectPreset = (p: DateRangePreset) => {
    if (p === 'custom') {
      onPresetChange('custom');
      setIsCustomOpen((prev) => !prev);
      return;
    }
    setIsCustomOpen(false);
    onPresetChange(p);
    const range = computeEthiopianPresetRange(p);
    onStartDateChange(range.start);
    onEndDateChange(range.end);
  };

  const handleDayClick = (day: number) => {
    const gResult = ethiopianToGregorian(viewYear, viewMonth, day);
    if (activeDateTab === 'from') {
      setTempStart(gResult.dateStr);
      if (!tempEnd || tempEnd < gResult.dateStr) {
        setTempEnd(gResult.dateStr);
      }
      setActiveDateTab('to');
    } else {
      setTempEnd(gResult.dateStr);
      if (tempStart && gResult.dateStr < tempStart) {
        setTempStart(gResult.dateStr);
      }
    }
  };

  const handleApplyCustom = () => {
    onStartDateChange(tempStart);
    onEndDateChange(tempEnd);
    onPresetChange('custom');
    setIsCustomOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(13);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 13) {
      setViewMonth(1);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const monthDetails = useMemo(() => {
    return getEthiopianMonthDetails(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  // Available year options (e.g. current year +- 6 years)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    const base = todayEth.year;
    for (let y = base - 6; y <= base + 6; y++) {
      years.push(y);
    }
    return years;
  }, [todayEth.year]);

  // Formatted Ethiopian Range Summary Display
  const ethRangeDisplay = useMemo(() => {
    if (!startDate && !endDate) {
      return isAmharic ? 'ሁሉም መረጃዎች' : 'All Records';
    }
    try {
      if (startDate && endDate) {
        const ethStart = toEthiopianDate(startDate);
        const ethEnd = toEthiopianDate(endDate);
        if (ethStart.month === ethEnd.month && ethStart.year === ethEnd.year) {
          return isAmharic
            ? `${ethStart.monthNameAm} ${ethStart.day} - ${ethEnd.day}, ${ethStart.year}`
            : `${ethStart.monthNameEn} ${ethStart.day} - ${ethEnd.day}, ${ethStart.year}`;
        }
        return isAmharic
          ? `${ethStart.monthNameAm} ${ethStart.day} — ${ethEnd.monthNameAm} ${ethEnd.day}፣ ${ethEnd.year}`
          : `${ethStart.monthNameEn} ${ethStart.day} — ${ethEnd.monthNameEn} ${ethEnd.day}, ${ethEnd.year}`;
      }
      if (startDate) {
        const eth = toEthiopianDate(startDate);
        return isAmharic ? `ከ ${eth.formattedAm}` : `From ${eth.formattedEn}`;
      }
      if (endDate) {
        const eth = toEthiopianDate(endDate);
        return isAmharic ? `እስከ ${eth.formattedAm}` : `Until ${eth.formattedEn}`;
      }
    } catch {}
    return '';
  }, [startDate, endDate, isAmharic]);

  return (
    <div className={`relative bg-[#F7F9FC] dark:bg-[#24303F] border-b border-[#E2E8F0] dark:border-[#2E3A47] ${className}`}>
      {/* Top Toolbar Row: Presets + Active Range Badge */}
      <div className="p-2 sm:p-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-2">
        {/* Preset Pills - Wrapping cleanly on mobile, zero overflow */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-[#E2E8F0]/70 dark:bg-[#1C2434]/80 border border-[#E2E8F0] dark:border-[#2E3A47]">
            {presetOptions.map((opt) => {
              const isActive = preset === opt.key && !isCustomOpen;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelectPreset(opt.key)}
                  className={`px-2 py-1 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-bold rounded-md transition-all whitespace-nowrap cursor-pointer select-none ${
                    isActive
                      ? 'bg-white dark:bg-[#3C50E0] text-[#3C50E0] dark:text-white shadow-2xs font-extrabold'
                      : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}

            {/* Custom Range Button triggering Floating Dropdown */}
            <div ref={dropdownRef} className="relative inline-block">
              <button
                type="button"
                onClick={() => {
                  onPresetChange('custom');
                  setIsCustomOpen((prev) => !prev);
                }}
                className={`px-2 py-1 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-bold rounded-md transition-all whitespace-nowrap cursor-pointer select-none flex items-center gap-1 ${
                  preset === 'custom' || isCustomOpen
                    ? 'bg-white dark:bg-[#3C50E0] text-[#3C50E0] dark:text-white shadow-2xs font-extrabold ring-1 ring-[#3C50E0]/30'
                    : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white'
                }`}
              >
                <Icon className="material-symbols-outlined text-[14px]">date_range</Icon>
                <span>{isAmharic ? 'ብጁ ቀን' : 'Custom'}</span>
                <Icon className={`material-symbols-outlined text-[13px] transition-transform duration-200 ${isCustomOpen ? 'rotate-180' : ''}`}>
                  expand_more
                </Icon>
              </button>

              {/* COMPACT FLOATING ETHIOPIAN DATE PICKER DROPDOWN (DYNAMIC AUTO-ALIGNMENT) */}
              {isCustomOpen && (
                <div
                  className={`absolute mt-1.5 z-50 w-[285px] xs:w-[305px] sm:w-[315px] p-2.5 sm:p-3 bg-white dark:bg-[#24303F] rounded-xl border border-[#E2E8F0] dark:border-[#2E3A47] shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100 ${
                    alignment === 'right' ? 'right-0' : 'left-0'
                  }`}
                  style={{ maxWidth: 'calc(100vw - 28px)' }}
                >
                  {/* From - To Compact Tab Switcher */}
                  <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-slate-100 dark:bg-[#1C2434] rounded-lg mb-2.5 border border-[#E2E8F0] dark:border-[#2E3A47]">
                    <button
                      type="button"
                      onClick={() => setActiveDateTab('from')}
                      className={`flex flex-col items-start px-2 py-1 rounded-md transition-all text-left cursor-pointer ${
                        activeDateTab === 'from'
                          ? 'bg-white dark:bg-[#3C50E0] text-[#3C50E0] dark:text-white shadow-2xs font-bold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className={`text-[9px] uppercase font-black tracking-wider ${activeDateTab === 'from' ? 'text-[#3C50E0] dark:text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>
                        {isAmharic ? 'የመነሻ ቀን (ከ)' : 'From Date'}
                      </span>
                      <span className="text-[11px] font-extrabold truncate max-w-full">
                        {tempStart ? formatEthiopianDate(tempStart, lang) : (isAmharic ? 'ይምረጡ' : 'Select')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveDateTab('to')}
                      className={`flex flex-col items-start px-2 py-1 rounded-md transition-all text-left cursor-pointer ${
                        activeDateTab === 'to'
                          ? 'bg-white dark:bg-[#3C50E0] text-[#3C50E0] dark:text-white shadow-2xs font-bold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className={`text-[9px] uppercase font-black tracking-wider ${activeDateTab === 'to' ? 'text-[#3C50E0] dark:text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>
                        {isAmharic ? 'የማብቂያ ቀን (እስከ)' : 'To Date'}
                      </span>
                      <span className="text-[11px] font-extrabold truncate max-w-full">
                        {tempEnd ? formatEthiopianDate(tempEnd, lang) : (isAmharic ? 'ይምረጡ' : 'Select')}
                      </span>
                    </button>
                  </div>

                  {/* Calendar Navigation: Compact Month dropdown, Year dropdown, Prev/Next */}
                  <div className="flex items-center justify-between gap-1 mb-2 pb-1.5 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C2434] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      title={isAmharic ? 'ያለፈው ወር' : 'Previous Month'}
                    >
                      <Icon className="material-symbols-outlined text-[16px]">chevron_left</Icon>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Month Dropdown */}
                      <select
                        value={viewMonth}
                        onChange={(e) => setViewMonth(Number(e.target.value))}
                        className="text-[11px] font-black bg-slate-100 dark:bg-[#1C2434] text-[#1C2434] dark:text-white rounded px-1.5 py-0.5 border border-[#E2E8F0] dark:border-[#2E3A47] outline-none cursor-pointer"
                      >
                        {ETHIOPIAN_MONTHS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {isAmharic ? m.am : m.en} ({m.id})
                          </option>
                        ))}
                      </select>

                      {/* Year Dropdown */}
                      <select
                        value={viewYear}
                        onChange={(e) => setViewYear(Number(e.target.value))}
                        className="text-[11px] font-black bg-slate-100 dark:bg-[#1C2434] text-[#1C2434] dark:text-white rounded px-1.5 py-0.5 border border-[#E2E8F0] dark:border-[#2E3A47] outline-none cursor-pointer"
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={y}>
                            {y} {isAmharic ? 'ዓ.ም' : 'E.C.'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C2434] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      title={isAmharic ? 'ቀጣይ ወር' : 'Next Month'}
                    >
                      <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                    </button>
                  </div>

                  {/* Weekday Headers */}
                  <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                    {ETHIOPIAN_WEEKDAYS.map((w) => (
                      <span
                        key={w.id}
                        className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight"
                        title={isAmharic ? w.am : w.en}
                      >
                        {isAmharic ? w.am.slice(0, 2) : w.en.slice(0, 2)}
                      </span>
                    ))}
                  </div>

                  {/* Compact Days Grid (Perfect 7-column scaling for mobile) */}
                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                    {Array.from({ length: monthDetails.startDayOfWeek }).map((_, i) => (
                      <div key={`blank-${i}`} className="h-6.5 w-6.5 sm:h-7 sm:w-7" />
                    ))}

                    {Array.from({ length: monthDetails.daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const gDayStr = ethiopianToGregorian(viewYear, viewMonth, day).dateStr;

                      const isStart = tempStart === gDayStr;
                      const isEnd = tempEnd === gDayStr;
                      const isInRange = tempStart && tempEnd && gDayStr > tempStart && gDayStr < tempEnd;
                      const isToday = todayEth.year === viewYear && todayEth.month === viewMonth && todayEth.day === day;

                      return (
                        <button
                          key={`day-${day}`}
                          type="button"
                          onClick={() => handleDayClick(day)}
                          className={`h-6.5 w-6.5 sm:h-7 sm:w-7 text-[11px] font-bold rounded-md flex items-center justify-center transition-all cursor-pointer select-none relative ${
                            isStart || isEnd
                              ? 'bg-[#3C50E0] text-white font-black shadow-xs ring-2 ring-[#3C50E0]/30 scale-105 z-10'
                              : isInRange
                              ? 'bg-[#3C50E0]/15 text-[#3C50E0] dark:bg-blue-400/20 dark:text-blue-200 rounded-none font-bold'
                              : isToday
                              ? 'bg-[#3C50E0]/10 text-[#3C50E0] dark:bg-blue-400/20 dark:text-blue-300 font-extrabold border border-[#3C50E0]/30'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2434]'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  {/* Footer Action Controls */}
                  <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTempStart('');
                        setTempEnd('');
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-500 transition-colors cursor-pointer px-1"
                    >
                      {isAmharic ? 'አጽዳ' : 'Clear'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsCustomOpen(false)}
                        className="px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C2434] rounded transition-colors cursor-pointer"
                      >
                        {isAmharic ? 'ዝጋ' : 'Close'}
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyCustom}
                        className="px-3 py-1 bg-[#3C50E0] hover:bg-[#3C50E0]/90 text-white text-[11px] font-black rounded shadow-xs transition-all cursor-pointer"
                      >
                        {isAmharic ? 'ተግብር' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Active Ethiopian Range Indicator Badge */}
        {ethRangeDisplay && (
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-bold bg-[#3C50E0]/10 text-[#3C50E0] dark:bg-blue-400/10 dark:text-blue-300 border border-[#3C50E0]/20">
              <Icon className="material-symbols-outlined text-[13px] sm:text-[14px]">calendar_today</Icon>
              <span>{ethRangeDisplay}</span>
            </span>

            {preset !== 'this_month' && (
              <button
                type="button"
                onClick={() => handleSelectPreset('this_month')}
                className="p-1 rounded-md text-slate-400 hover:text-[#3C50E0] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1C2434] transition-colors cursor-pointer"
                title={isAmharic ? 'ወደዚህ ወር መልስ' : 'Reset to this month'}
              >
                <Icon className="material-symbols-outlined text-[14px]">restart_alt</Icon>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
