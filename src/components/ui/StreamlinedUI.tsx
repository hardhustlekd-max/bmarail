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
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/60 ${className}`}>
    <div className="flex items-center gap-3.5">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs">
          <Icon name={icon} size={24} />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-on-surface tracking-tight leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-secondary font-medium mt-1 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
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
    className="w-full min-h-[48px] flex items-center justify-between py-2 px-1 cursor-pointer text-left group transition-colors rounded-lg hover:bg-surface-container/30"
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon name={icon} size={18} />
      </div>
      <h4 className="font-extrabold text-sm text-on-surface flex items-center gap-2 truncate">
        <span>{title}</span>
      </h4>
      {badgeText && isOpen && (
        <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 whitespace-nowrap">
          {badgeText}
        </span>
      )}
    </div>
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-secondary group-hover:text-on-surface transition-colors">
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
  <div className={`bg-surface-container-lowest border border-outline-variant/70 rounded-xl p-4 sm:p-6 shadow-2xs space-y-4 ${className}`}>
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
  <div className={`bg-surface-container/50 border border-outline-variant/50 p-3 rounded-lg flex flex-col justify-center min-h-[56px] ${className}`}>
    <span className="text-secondary block text-[11px] font-bold uppercase tracking-wider">{label}</span>
    <span
      className={`block mt-0.5 text-xs sm:text-sm truncate ${
        isMono ? 'font-mono font-extrabold tracking-wide' : 'font-bold'
      } ${isPrimary ? 'text-primary' : 'text-on-surface'}`}
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
    className={`block text-xs font-bold text-on-surface mb-1.5 uppercase tracking-wide ${className}`}
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
      isError ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-secondary'
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
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  id?: string;
}) => (
  <button
    id={id}
    type="button"
    onClick={onClick}
    className={`min-h-[48px] px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-sm hover:shadow-md active:scale-98 transition-all duration-200 cursor-pointer select-none ${className}`}
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
  id,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
  id?: string;
}) => (
  <button
    id={id}
    type="button"
    onClick={onClick}
    className={`min-h-[48px] px-5 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2.5 border border-outline-variant shadow-2xs hover:shadow-xs active:scale-98 transition-all duration-200 cursor-pointer select-none ${className}`}
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
  id,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) => (
  <div className={`relative inline-flex items-center shrink-0 min-h-[44px] ${className}`}>
    <select
      id={id}
      value={value}
      onChange={onChange}
      style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
      className="w-full min-h-[44px] bg-surface-container-lowest text-on-surface border border-outline-variant hover:border-outline rounded-lg pl-3.5 pr-9 py-2.5 font-bold text-xs sm:text-sm shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary/20 hover:shadow-xs transition-all cursor-pointer"
    >
      {children}
    </select>
    <div className="absolute right-2.5 inset-y-0 flex items-center justify-center pointer-events-none select-none text-secondary">
      <Icon
        name="keyboard_arrow_down"
        size={20}
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
    neutral: 'bg-surface-container text-secondary border-outline-variant font-bold',
    primary: 'bg-primary/10 text-primary border-primary/30 font-bold',
    success: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 font-extrabold',
    warning: 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/30 font-extrabold',
    error: 'bg-rose-500/15 text-rose-900 dark:text-rose-300 border-rose-500/30 font-extrabold',
    info: 'bg-blue-500/15 text-blue-900 dark:text-blue-300 border-blue-500/30 font-bold',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border leading-none shrink-0 whitespace-nowrap ${variantClasses[variant]} ${className}`}>
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
  <div className={`p-8 sm:p-12 text-center rounded-2xl border border-dashed border-outline-variant bg-surface-container/20 flex flex-col items-center justify-center space-y-3 ${className}`}>
    <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-secondary mb-1 shadow-2xs">
      <Icon name={icon} size={32} />
    </div>
    <h3 className="text-base sm:text-lg font-extrabold text-on-surface">
      {title}
    </h3>
    {description && (
      <p className="text-xs sm:text-sm text-secondary max-w-sm font-medium leading-relaxed">
        {description}
      </p>
    )}
    {action && <div className="pt-2">{action}</div>}
  </div>
);


