import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './Icon';

export const PageTitle = ({
  title,
  subtitle,
  icon,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] ${className}`}>
    <div className="flex items-center gap-3.5">
      {icon && <Icon name={icon} size={26} className="text-primary shrink-0" />}
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-[#1C2434] dark:text-white tracking-tight leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#8A99AD] font-medium mt-1 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && <div className="hidden sm:flex shrink-0 items-center gap-2">{action}</div>}
  </div>
);

export const SectionToggle = ({
  icon,
  title,
  isOpen,
  onClick,
  badgeText,
}: {
  icon: string;
  title: string;
  isOpen: boolean;
  onClick: () => void;
  badgeText?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[48px] flex items-center justify-between py-2 px-1 cursor-pointer text-left group transition-colors rounded-lg hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/60"
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon name={icon} size={20} className="text-primary shrink-0" />
      <h4 className="font-extrabold text-sm text-[#1C2434] dark:text-white flex items-center gap-2 truncate">
        <span>{title}</span>
      </h4>
      {badgeText && isOpen && (
        <span className="text-xs font-bold text-[#1C2434] dark:text-[#DEE4EE] px-2.5 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] whitespace-nowrap">
          {badgeText}
        </span>
      )}
    </div>
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] dark:text-[#8A99AD] group-hover:text-[#1C2434] dark:group-hover:text-white transition-colors">
      <Icon
        name={isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
        size={22}
      />
    </div>
  </button>
);

export const SectionContent = ({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: ReactNode;
}) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeInOut' }}
        className="overflow-hidden pt-2"
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

export const SectionCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl p-4 sm:p-6 shadow-xs space-y-4 ${className}`}>
    {children}
  </div>
);

export const DataField = ({
  label,
  value,
  isMono = false,
  isPrimary = false,
  className = '',
}: {
  label: string;
  value: ReactNode;
  isMono?: boolean;
  isPrimary?: boolean;
  className?: string;
}) => (
  <div className={`bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] p-3 rounded-lg flex flex-col justify-center min-h-[56px] ${className}`}>
    <span className="text-[#64748B] dark:text-[#8A99AD] block text-[11px] font-bold tracking-wider">{label}</span>
    <span
      className={`block mt-0.5 text-xs sm:text-sm truncate ${
        isMono ? 'font-mono font-extrabold tracking-wide tabular-nums' : 'font-bold'
      } ${isPrimary ? 'text-primary' : 'text-[#1C2434] dark:text-white'}`}
    >
      {value || '—'}
    </span>
  </div>
);

export const FieldLabel = ({
  children,
  required = false,
  htmlFor,
  className = '',
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}) => (
  <label
    htmlFor={htmlFor}
    className={`block text-xs font-bold text-[#1C2434] dark:text-[#DEE4EE] mb-1.5 tracking-wide ${className}`}
  >
    <span>{children}</span>
    {required && <span className="text-rose-600 dark:text-rose-400 ml-1 font-black">*</span>}
  </label>
);

export const HelperText = ({
  children,
  className = '',
  isError = false,
}: {
  children: ReactNode;
  className?: string;
  isError?: boolean;
}) => (
  <p
    className={`text-xs mt-1.5 leading-relaxed font-medium ${
      isError ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-[#64748B] dark:text-[#8A99AD]'
    } ${className}`}
  >
    {children}
  </p>
);

export const ActionTriggerPrimary = ({
  icon,
  label,
  onClick,
  className = '',
  id,
  disabled = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}) => (
  <button
    id={id}
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`min-h-[44px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 border-0 shadow-none hover:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    <Icon name={icon} size={20} />
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export const ActionTriggerSecondary = ({
  icon,
  label,
  onClick,
  className = '',
  disabled = false,
  id,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}) => (
  <button
    id={id}
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`min-h-[44px] px-5 py-2.5 rounded-lg bg-white dark:bg-[#1C2434] hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] text-[#1C2434] dark:text-[#DEE4EE] font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 border border-[#E2E8F0] dark:border-[#2E3A47] shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30 transition-colors duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    <Icon name={icon} size={20} />
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export const SelectField = ({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  id,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
}) => (
  <div className={`relative inline-flex items-center shrink-0 ${className}`}>
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={onChange}
      style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
      className="w-full min-h-[32px] sm:min-h-[34px] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#64748B] dark:hover:border-[#8A99AD] rounded-lg pl-2.5 pr-7 py-1 font-bold text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {children}
    </select>
    <div className="absolute right-1.5 inset-y-0 flex items-center justify-center pointer-events-none select-none text-[#64748B] dark:text-[#8A99AD]">
      <Icon
        name="keyboard_arrow_down"
        size={16}
      />
    </div>
  </div>
);

export const Badge = ({
  label,
  variant = 'neutral',
  className = '',
}: {
  label: string;
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}) => {
  const variantClasses = {
    neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-semibold',
    primary: 'bg-[#F1F5F9] dark:bg-[#24303F] text-[#0F172A] dark:text-[#F8FAFC] border-[#CBD5E1] dark:border-[#334155] font-bold',
    success: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60 font-bold',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-bold',
    error: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60 font-bold',
    info: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 font-semibold',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs border leading-tight shrink-0 whitespace-nowrap ${variantClasses[variant]} ${className}`}>
      {label}
    </span>
  );
};

export const EmptyStateView = ({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={`p-8 sm:p-12 text-center rounded-xl border border-dashed border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC]/60 dark:bg-[#24303F]/30 flex flex-col items-center justify-center space-y-3 ${className}`}>
    <div className="w-12 h-12 rounded-xl bg-[#F1F5F9] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-center text-[#64748B] dark:text-[#8A99AD] mb-1">
      <Icon name={icon} size={28} />
    </div>
    <h3 className="text-base sm:text-lg font-extrabold text-[#1C2434] dark:text-white">
      {title}
    </h3>
    {description && (
      <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#8A99AD] max-w-sm font-medium leading-relaxed">
        {description}
      </p>
    )}
    {action && <div className="pt-2">{action}</div>}
  </div>
);

// Re-export Association Design System atomic primitives and components
export * from './AssocDesignSystem';



