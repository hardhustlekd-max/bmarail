import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './Icon';
import { POPOVER_TRANSITION } from '../../utils/motionPresets';
import {
  ETHIOPIAN_MONTHS,
  ETHIOPIAN_WEEKDAYS,
  toEthiopianDate,
  ethiopianToGregorian,
  getEthiopianMonthDetails,
  formatEthiopianDate,
} from '../../utils/ethiopianCalendar';

interface EthiopianDatePickerPopoverProps {
  value?: string; // Gregorian ISO string 'YYYY-MM-DD'
  onChange: (gregorianDateStr: string) => void;
  lang?: 'am' | 'en';
  label?: string;
  placeholder?: string;
  minDate?: string; // Gregorian ISO
  maxDate?: string; // Gregorian ISO
  disabled?: boolean;
  className?: string;
}

export const EthiopianDatePickerPopover: React.FC<EthiopianDatePickerPopoverProps> = ({
  value,
  onChange,
  lang = 'am',
  label,
  placeholder,
  disabled = false,
  className = '',
}) => {
  const isAmharic = lang === 'am';
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive initial Ethiopian view from current value or today
  const currentEthDate = useMemo(() => {
    return toEthiopianDate(value || new Date());
  }, [value]);

  const todayEth = useMemo(() => toEthiopianDate(new Date()), []);

  const [viewYear, setViewYear] = useState<number>(() => currentEthDate.year);
  const [viewMonth, setViewMonth] = useState<number>(() => currentEthDate.month);

  // Sync view when value changes
  useEffect(() => {
    if (value) {
      try {
        const eth = toEthiopianDate(value);
        setViewYear(eth.year);
        setViewMonth(eth.month);
      } catch {}
    }
  }, [value]);

  // Click outside to close popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const popoverWidth = Math.min(304, viewportWidth - 24);

      let left = rect.left;
      if (left + popoverWidth > viewportWidth - 12) {
        left = Math.max(12, viewportWidth - popoverWidth - 12);
      }

      let top = rect.bottom + 6;
      const popoverHeight = 376;
      if (top + popoverHeight > viewportHeight - 12) {
        top = Math.max(12, rect.top - popoverHeight - 6);
      }

      setPopoverStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${popoverWidth}px`,
        zIndex: 99999,
      });
    }
  }, [isOpen, viewYear, viewMonth]);

  const monthDetails = useMemo(() => {
    return getEthiopianMonthDetails(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

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

  const handleSelectDay = (day: number) => {
    const gResult = ethiopianToGregorian(viewYear, viewMonth, day);
    onChange(gResult.dateStr);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const todayG = new Date().toISOString().split('T')[0];
    onChange(todayG);
    setViewYear(todayEth.year);
    setViewMonth(todayEth.month);
    setIsOpen(false);
  };

  const formattedDisplay = useMemo(() => {
    if (!value) return placeholder || (isAmharic ? 'ቀን ይምረጡ' : 'Select Date');
    return formatEthiopianDate(value, lang);
  }, [value, lang, isAmharic, placeholder]);

  // Available year options (e.g. current year +- 6 years)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    const base = todayEth.year;
    for (let y = base - 6; y <= base + 6; y++) {
      years.push(y);
    }
    return years;
  }, [todayEth.year]);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button displaying Ethiopian date */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex items-center justify-between gap-2 px-3 min-h-[44px] sm:min-h-[38px] bg-white dark:bg-[#1C2434] border rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer ${
          isOpen
            ? 'border-primary ring-2 ring-primary/20 text-primary'
            : 'border-[#E2E8F0] dark:border-[#2E3A47] text-[#1C2434] dark:text-white hover:border-primary/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Icon className="material-symbols-outlined text-[15px] text-primary shrink-0">
            calendar_month
          </Icon>
          <span className="truncate">{formattedDisplay}</span>
        </span>
        <Icon className={`material-symbols-outlined text-[15px] text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </Icon>
      </button>

      {/* Ethiopian Calendar Popover Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            style={popoverStyle}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={POPOVER_TRANSITION}
            className="p-3 bg-white dark:bg-[#24303F] rounded-xl border border-[#E2E8F0] dark:border-[#2E3A47] shadow-2xl ring-1 ring-black/10 origin-top"
          >
            {/* Header Controls: Month dropdown, Year dropdown, Navigation */}
            <div className="flex items-center justify-between gap-1 mb-2.5 pb-2 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-[#1C2434] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
                title={isAmharic ? 'ያለፈው ወር' : 'Previous Month'}
              >
                <Icon className="material-symbols-outlined text-[18px]">chevron_left</Icon>
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                {/* Month Dropdown */}
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="text-xs font-black bg-slate-100 dark:bg-[#1C2434] text-[#1C2434] dark:text-white rounded-md px-2 py-1 border border-[#E2E8F0] dark:border-[#2E3A47] outline-none cursor-pointer"
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
                  className="text-xs font-black bg-slate-100 dark:bg-[#1C2434] text-[#1C2434] dark:text-white rounded-md px-2 py-1 border border-[#E2E8F0] dark:border-[#2E3A47] outline-none cursor-pointer"
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
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-[#1C2434] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
                title={isAmharic ? 'ቀጣይ ወር' : 'Next Month'}
              >
                <Icon className="material-symbols-outlined text-[18px]">chevron_right</Icon>
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {ETHIOPIAN_WEEKDAYS.map((w) => (
                <span
                  key={w.id}
                  className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight"
                  title={isAmharic ? w.am : w.en}
                >
                  {isAmharic ? w.am.slice(0, 2) : w.en.slice(0, 2)}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 place-items-center">
              {/* Blank offset placeholders */}
              {Array.from({ length: monthDetails.startDayOfWeek }).map((_, i) => (
                <div key={`blank-${i}`} className="h-9 w-9 sm:h-8 sm:w-8" />
              ))}

              {/* Day buttons */}
              {Array.from({ length: monthDetails.daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected =
                  currentEthDate &&
                  currentEthDate.year === viewYear &&
                  currentEthDate.month === viewMonth &&
                  currentEthDate.day === day &&
                  Boolean(value);

                const isToday =
                  todayEth.year === viewYear &&
                  todayEth.month === viewMonth &&
                  todayEth.day === day;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`h-9 w-9 sm:h-8 sm:w-8 text-xs font-bold rounded-lg flex items-center justify-center transition-colors cursor-pointer select-none relative ${
                      isSelected
                        ? 'bg-primary text-on-primary font-black shadow-sm ring-2 ring-primary/30'
                        : isToday
                        ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 font-extrabold border border-primary/30'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2434]'
                    }`}
                  >
                    {day}
                    {isToday && !isSelected && (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Footer Action: Jump to Today */}
            <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={handleSelectToday}
                className="text-primary hover:underline flex items-center gap-1 min-h-[36px] px-2 rounded-md hover:bg-primary/5 cursor-pointer font-bold"
              >
                <Icon className="material-symbols-outlined text-[14px]">today</Icon>
                <span>{isAmharic ? 'ዛሬ (E.C.)' : 'Today (E.C.)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold cursor-pointer min-h-[36px] px-2.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C2434]"
              >
                {isAmharic ? 'ዝጋ' : 'Close'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
