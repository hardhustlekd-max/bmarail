import React, { ReactNode, useState, useEffect } from 'react';
import { Icon } from './Icon';

// ============================================================================
// 1. ATOMS (Design Primitives, Controls, Badges, Dots)
// ============================================================================

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  children: ReactNode;
}

/**
 * Atomic Button Primitives adhering to the Association Design System:
 * - 8px border-radius
 * - 2x horizontal vs vertical padding
 * - Accessible focus rings & hover states
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-md min-h-[36px]',
    md: 'px-5 py-2.5 text-sm rounded-lg min-h-[44px]',
    lg: 'px-6 py-3 text-base rounded-lg min-h-[48px]',
  };

  const variantStyles = {
    primary:
      'bg-primary hover:bg-primary-hover text-white font-semibold shadow-xs hover:shadow-sm focus:ring-2 focus:ring-primary/40',
    secondary:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold focus:ring-2 focus:ring-slate-400/30',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold shadow-xs focus:ring-2 focus:ring-rose-500/40',
    ghost:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium focus:ring-2 focus:ring-slate-300',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 select-none outline-none disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        icon && iconPosition === 'left' && <Icon name={icon} size={18} className="shrink-0" />
      )}
      <span>{children}</span>
      {!isLoading && icon && iconPosition === 'right' && (
        <Icon name={icon} size={18} className="shrink-0" />
      )}
    </button>
  );
};

export const ButtonPrimary: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="primary" {...props} />
);

export const ButtonSecondary: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="secondary" {...props} />
);

export const ButtonDanger: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="danger" {...props} />
);

/**
 * Status Pill Badge Atom:
 * Fixes prototype inconsistency by tokenizing high-contrast accessible color pairs
 * for light and dark themes.
 */
export type StatusBadgeVariant = 'active' | 'overdue' | 'pending' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  className = '',
  showDot = false,
}) => {
  const variantStyles: Record<StatusBadgeVariant, { bg: string; dot: string }> = {
    active: {
      bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-500',
    },
    success: {
      bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-500',
    },
    overdue: {
      bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
      dot: 'bg-rose-500',
    },
    danger: {
      bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
      dot: 'bg-rose-500',
    },
    pending: {
      bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
      dot: 'bg-amber-500',
    },
    warning: {
      bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
      dot: 'bg-amber-500',
    },
    info: {
      bg: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
      dot: 'bg-sky-500',
    },
    neutral: {
      bg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
      dot: 'bg-slate-400',
    },
  };

  const current = variantStyles[variant] || variantStyles.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 leading-tight ${current.bg} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />}
      {label}
    </span>
  );
};

/**
 * Circular 12px Status Dot Atom for matrix grids and compact status indicators
 */
export interface StatusDotProps {
  status: 'paid' | 'unpaid' | 'pending' | 'active' | 'inactive' | 'muted';
  size?: number;
  pulse?: boolean;
  title?: string;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 12,
  pulse = false,
  title,
  className = '',
}) => {
  const colorMap: Record<string, string> = {
    paid: 'bg-emerald-500',
    active: 'bg-emerald-500',
    unpaid: 'bg-rose-500',
    inactive: 'bg-rose-500',
    pending: 'bg-amber-500',
    muted: 'bg-slate-300 dark:bg-slate-600/70',
  };

  const bg = colorMap[status] || 'bg-slate-300 dark:bg-slate-600/70';

  return (
    <span
      role="status"
      aria-label={title || status}
      title={title || status}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`inline-block rounded-full shrink-0 transition-transform ${bg} ${
        pulse ? 'animate-pulse' : ''
      } ${className}`}
    />
  );
};

// ============================================================================
// 2. FORM MOLECULES (Inputs, Groups, Search Bars, Selects)
// ============================================================================

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
}

export const FormInput: React.FC<FormInputProps> = ({
  id,
  label,
  required,
  helperText,
  error,
  className = '',
  ...props
}) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-rose-500 ml-1 font-bold">*</span>}
      </label>
    )}
    <input
      id={id}
      required={required}
      className={`w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border rounded-lg outline-none transition-colors ${
        error
          ? 'border-rose-500 focus:border-rose-600 focus:ring-1 focus:ring-rose-500'
          : 'border-slate-300 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary'
      } ${className}`}
      {...props}
    />
    {error ? (
      <p className="text-xs text-rose-500 font-medium">{error}</p>
    ) : helperText ? (
      <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
    ) : null}
  </div>
);

export interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  id = 'assoc-search-input',
}) => (
  <div className={`relative flex-1 flex items-center ${className}`}>
    <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
      <Icon name="search" size={18} />
    </div>
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-9 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-colors"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        aria-label="Clear search"
      >
        <Icon name="close" size={16} />
      </button>
    )}
  </div>
);

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  options?: Array<{ value: string; label: string }>;
  children?: ReactNode;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  label,
  required,
  helperText,
  error,
  options,
  children,
  className = '',
  ...props
}) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-rose-500 ml-1 font-bold">*</span>}
      </label>
    )}
    <div className="relative flex items-center">
      <select
        id={id}
        required={required}
        className={`w-full pl-3.5 pr-9 py-2.5 text-sm appearance-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border rounded-lg outline-none cursor-pointer transition-colors ${
          error
            ? 'border-rose-500 focus:border-rose-600'
            : 'border-slate-300 dark:border-slate-700 focus:border-primary focus:ring-1 focus:ring-primary'
        } ${className}`}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <div className="absolute right-3 pointer-events-none text-slate-400">
        <Icon name="keyboard_arrow_down" size={18} />
      </div>
    </div>
    {error ? (
      <p className="text-xs text-rose-500 font-medium">{error}</p>
    ) : helperText ? (
      <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
    ) : null}
  </div>
);

export interface RadioOptionItem {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  id: string;
  name: string;
  label?: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
  options: RadioOptionItem[];
  orientation?: 'horizontal' | 'vertical';
  error?: string;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  id,
  name,
  label,
  required,
  value,
  onChange,
  options,
  orientation = 'horizontal',
  error,
  className = '',
}) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {label && (
      <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-rose-500 ml-1 font-bold">*</span>}
      </label>
    )}
    <div
      className={`flex ${
        orientation === 'horizontal' ? 'flex-wrap items-center gap-4 sm:gap-6' : 'flex-col gap-2.5'
      }`}
    >
      {options.map((opt) => {
        const isChecked = value === opt.value;
        return (
          <label
            key={opt.value}
            htmlFor={`${id}-${opt.value}`}
            className={`inline-flex items-center gap-2 cursor-pointer select-none text-xs font-semibold transition-colors ${
              isChecked
                ? 'text-primary dark:text-primary font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              id={`${id}-${opt.value}`}
              name={name}
              value={opt.value}
              checked={isChecked}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className="w-4 h-4 text-primary focus:ring-primary accent-primary cursor-pointer"
            />
            <span>{opt.label}</span>
            {opt.description && (
              <span className="text-[10px] text-slate-400 ml-1">({opt.description})</span>
            )}
          </label>
        );
      })}
    </div>
    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
  </div>
);

export interface CheckboxFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  id,
  label,
  checked,
  onChange,
  error,
  className = '',
  disabled,
  ...props
}) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2 cursor-pointer select-none text-xs font-semibold ${
        checked ? 'text-primary dark:text-primary font-bold' : 'text-slate-700 dark:text-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
        {...props}
      />
      <span>{label}</span>
    </label>
    {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
  </div>
);

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  count?: number;
}

export interface TabListProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export const TabList = <T extends string>({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}: TabListProps<T>) => {
  if (variant === 'pill') {
    return (
      <div className={`flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg ${className}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                isActive
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.icon && <Icon name={tab.icon} size={16} />}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 sm:gap-6 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none -mb-[1px] ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`group relative flex items-center gap-1.5 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap select-none ${
              isActive
                ? 'border-primary text-primary dark:text-primary font-bold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {tab.icon && <Icon name={tab.icon} size={18} />}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// 3. KPI & SURFACE MOLECULES
// ============================================================================

export interface KpiCardProps {
  label: string;
  value: string | number;
  colorVariant?: 'default' | 'success' | 'danger' | 'warning' | 'accent';
  icon?: string;
  subtext?: string;
  className?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  colorVariant = 'default',
  icon,
  subtext,
  className = '',
  onClick,
}) => {
  const valueColors = {
    default: 'text-slate-900 dark:text-slate-100',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400',
    accent: 'text-primary dark:text-primary',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 sm:p-5 shadow-xs transition-all ${
        onClick ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[11px] sm:text-[13px] text-slate-500 dark:text-slate-400 font-bold truncate">{label}</p>
        {icon && <Icon name={icon} size={18} className="text-slate-400 shrink-0" />}
      </div>
      <h3 className={`text-base sm:text-2xl font-black tracking-tight mt-1 sm:mt-1.5 ${valueColors[colorVariant]}`}>
        {value}
      </h3>
      {subtext && (
        <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium mt-0.5 sm:mt-1 truncate">{subtext}</p>
      )}
    </div>
  );
};

export const KpiGrid: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
    {children}
  </div>
);

export const TableContainer: React.FC<{
  title?: string;
  action?: ReactNode;
  filterBar?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, action, filterBar, children, className = '' }) => (
  <div
    className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col gap-4 ${className}`}
  >
    {(title || action) && (
      <div className="flex items-center justify-between gap-4">
        {title && (
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        )}
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    {filterBar && <div className="flex items-center gap-3">{filterBar}</div>}
    <div className="w-full overflow-x-auto">{children}</div>
  </div>
);

// ============================================================================
// 4. ORGANISMS (Matrix Ledger, Responsive Master-Detail Table, Detail Pane, Modal)
// ============================================================================

export interface MatrixRowItem {
  id: string | number;
  title: string;
  subtitle?: string;
  plateNumber?: string;
  periods: Record<string, 'paid' | 'unpaid' | 'pending' | 'muted'>;
}

export interface MonthlyMatrixLedgerProps {
  columns: Array<{ key: string; label: string; title?: string }>;
  rows: MatrixRowItem[];
  onRowClick?: (row: MatrixRowItem) => void;
  className?: string;
  showNumbering?: boolean;
  numberHeaderLabel?: string;
  memberHeaderLabel?: string;
  plateHeaderLabel?: string;
  showPlateColumn?: boolean;
  emptyMessage?: string;
  isAmharic?: boolean;
  expandableMobile?: boolean;
}

export const MonthlyMatrixLedger: React.FC<MonthlyMatrixLedgerProps> = ({
  columns,
  rows,
  onRowClick,
  className = '',
  showNumbering = true,
  numberHeaderLabel = '#',
  memberHeaderLabel = 'Member / Entity',
  plateHeaderLabel = 'Plate Number',
  showPlateColumn = true,
  emptyMessage = 'No ledger records available.',
  isAmharic = true,
  expandableMobile = true,
}) => {
  const hasPlate = showPlateColumn || rows.some((r) => Boolean(r.plateNumber));
  const [expandedMobileRowIds, setExpandedMobileRowIds] = useState<Set<string | number>>(new Set());

  const toggleRow = (id: string | number) => {
    setExpandedMobileRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllMobile = () => {
    if (expandedMobileRowIds.size === rows.length) {
      setExpandedMobileRowIds(new Set());
    } else {
      setExpandedMobileRowIds(new Set(rows.map((r) => r.id)));
    }
  };

  const handleRowClick = (row: MatrixRowItem) => {
    // On desktop screens (>= 768px), click directly triggers onRowClick (no accordion expansion)
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      onRowClick?.(row);
    } else if (expandableMobile) {
      // On mobile viewports, toggle the mobile breakdown drawer
      toggleRow(row.id);
    } else {
      onRowClick?.(row);
    }
  };

  const totalCols = columns.length + (hasPlate ? 1 : 0) + (showNumbering ? 1 : 0) + 1 + (expandableMobile ? 1 : 0);

  return (
    <table className={`w-full border-collapse text-left ${className}`}>
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#24303F]">
          {showNumbering && (
            <th className="py-3 px-2.5 sm:px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 text-center whitespace-nowrap w-10 sm:w-12 font-mono">
              {numberHeaderLabel}
            </th>
          )}
          <th className="py-3 px-3 sm:px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 text-left whitespace-nowrap min-w-[130px] sm:min-w-[170px]">
            {memberHeaderLabel}
          </th>
          {hasPlate && (
            <th className="py-3 px-3 sm:px-4 text-xs font-semibold text-slate-700 dark:text-slate-300 text-left whitespace-nowrap font-mono min-w-[90px] sm:min-w-[110px]">
              {plateHeaderLabel}
            </th>
          )}
          {columns.map((col) => (
            <th
              key={col.key}
              title={col.title}
              className="hidden md:table-cell py-3 px-2 sm:px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300 text-center whitespace-nowrap min-w-[38px] sm:min-w-[46px]"
            >
              {col.label}
            </th>
          ))}
          {expandableMobile && (
            <th className="py-3 px-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 w-10 md:hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAllMobile();
                }}
                title={expandedMobileRowIds.size === rows.length ? (isAmharic ? 'ሁሉንም ሰብስብ' : 'Collapse All') : (isAmharic ? 'ሁሉንም ዘርጋ' : 'Expand All')}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors"
              >
                <Icon
                  name={expandedMobileRowIds.size === rows.length ? 'unfold_less' : 'unfold_more'}
                  size={18}
                />
              </button>
            </th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {rows.map((row, index) => {
          const isExpanded = expandedMobileRowIds.has(row.id);

          return (
            <React.Fragment key={row.id}>
              <tr
                onClick={() => handleRowClick(row)}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer select-none ${
                  isExpanded ? 'bg-slate-50/70 dark:bg-slate-800/40 md:bg-transparent md:dark:bg-transparent' : ''
                }`}
              >
                {showNumbering && (
                  <td className="py-3.5 px-2.5 sm:px-3 text-xs font-mono font-medium text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">
                    {index + 1}
                  </td>
                )}
                <td className="py-3.5 px-3 sm:px-4 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{row.title}</div>
                  {row.subtitle && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{row.subtitle}</div>
                  )}
                </td>
                {hasPlate && (
                  <td className="py-3.5 px-3 sm:px-4 text-xs font-mono font-medium whitespace-nowrap text-slate-800 dark:text-slate-200">
                    {row.plateNumber ? (
                      <span>{row.plateNumber}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-600 font-normal italic">—</span>
                    )}
                  </td>
                )}
                {columns.map((col) => {
                  const status = row.periods[col.key] || 'muted';
                  return (
                    <td key={col.key} className="hidden md:table-cell py-3.5 px-2 sm:px-3.5 text-center">
                      <StatusDot
                        status={status}
                        size={12}
                        title={`${row.title} ${row.plateNumber ? `(${row.plateNumber})` : ''} - ${col.label}: ${status}`}
                      />
                    </td>
                  );
                })}
                {expandableMobile && (
                  <td className="py-3.5 px-2 text-center w-10 md:hidden">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(row.id);
                      }}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition-colors"
                      title={isExpanded ? (isAmharic ? 'ሰብስብ' : 'Collapse') : (isAmharic ? 'ዘርጋ' : 'Expand')}
                    >
                      <Icon
                        name={isExpanded ? 'expand_less' : 'expand_more'}
                        size={20}
                        className="transition-transform"
                      />
                    </button>
                  </td>
                )}
              </tr>

              {/* Collapsible/Expandable Monthly Drawer - ONLY rendered in Mobile View Mode */}
              {expandableMobile && isExpanded && (
                <tr className="md:hidden bg-slate-50/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800">
                  <td colSpan={totalCols} className="p-3 sm:p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <Icon name="event_note" size={16} className="text-primary" />
                          <span>{isAmharic ? 'የወርሃዊ ክፍያዎች ዝርዝር' : 'Monthly Dues Breakdown'}</span>
                        </div>
                        {row.plateNumber && (
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">
                            {row.plateNumber}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {columns.map((col) => {
                          const status = row.periods[col.key] || 'muted';
                          const statusText =
                            status === 'paid'
                              ? isAmharic ? 'የተከፈለ' : 'Paid'
                              : status === 'pending'
                              ? isAmharic ? 'ሊያልቅ የደረሰ' : 'Due'
                              : status === 'unpaid'
                              ? isAmharic ? 'ያልተከፈለ' : 'Unpaid'
                              : isAmharic ? 'መረጃ የለም' : 'No Record';

                          const statusBadgeClass =
                            status === 'paid'
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : status === 'pending'
                              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : status === 'unpaid'
                              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400 border-slate-200 dark:border-slate-700';

                          return (
                            <div
                              key={col.key}
                              className={`flex items-center justify-between p-2 rounded-md border text-xs ${statusBadgeClass}`}
                            >
                              <span className="font-bold text-[11px] truncate">{col.label}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <StatusDot status={status} size={8} />
                                <span className="text-[10px] font-medium">{statusText}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Explicit Action to Open Member Full Information Drawer */}
                      {onRowClick && (
                        <div className="pt-2 flex items-center justify-end border-t border-slate-200 dark:border-slate-700/60">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowClick(row);
                            }}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-primary hover:bg-primary-hover active:scale-98 text-white shadow-xs transition-all cursor-pointer"
                          >
                            <Icon name="badge" size={16} />
                            <span>{isAmharic ? 'የአባል ሙሉ መረጃ' : 'Member Full Information'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={totalCols}
              className="py-8 text-center text-sm text-slate-400 dark:text-slate-500"
            >
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

export interface HistoryItemData {
  id: string | number;
  amount: string;
  date: string;
  status: 'Paid' | 'Unpaid' | 'Failed' | 'Pending';
  reference?: string;
}

export const HistoryItem: React.FC<{ item: HistoryItemData }> = ({ item }) => {
  const isPaid = item.status === 'Paid';
  const isFailed = item.status === 'Failed' || item.status === 'Unpaid';
  const isPending = item.status === 'Pending';

  const statusColor = isPaid
    ? 'text-emerald-600 dark:text-emerald-400'
    : isFailed
    ? 'text-rose-600 dark:text-rose-400'
    : isPending
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-600 dark:text-slate-300';

  return (
    <li className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
      <div className="min-w-0">
        <strong className="block font-semibold text-slate-900 dark:text-slate-100 truncate">
          {item.amount}
        </strong>
        <small className="text-xs text-slate-500 dark:text-slate-400">
          Period: {item.date} {item.reference && `• Ref: ${item.reference}`}
        </small>
      </div>
      <span className={`font-semibold text-xs shrink-0 ${statusColor}`}>{item.status}</span>
    </li>
  );
};

export interface DetailPaneProps {
  title: string;
  subtitle?: string;
  badge?: { label: string; variant: StatusBadgeVariant };
  historyTitle?: string;
  history: HistoryItemData[];
  onClose?: () => void;
  actions?: ReactNode;
  className?: string;
}

export const FocusDetailPane: React.FC<DetailPaneProps> = ({
  title,
  subtitle,
  badge,
  historyTitle = 'Transaction Ledger History',
  history,
  onClose,
  actions,
  className = '',
}) => (
  <div
    className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col gap-4 ${className}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {title}
          </h3>
          {badge && <StatusBadge label={badge.label} variant={badge.variant} />}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">{subtitle}</p>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>

    {actions && <div className="flex items-center gap-2 pt-1">{actions}</div>}

    <hr className="border-t border-slate-200 dark:border-slate-800" />

    <div>
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400  tracking-wider mb-2.5">
        {historyTitle}
      </h4>
      <ul className="flex flex-col gap-2">
        {history.map((pay) => (
          <HistoryItem key={pay.id} item={pay} />
        ))}
        {history.length === 0 && (
          <li className="text-xs text-slate-400 dark:text-slate-500 italic py-2">
            No transactions logged.
          </li>
        )}
      </ul>
    </div>
  </div>
);

/**
 * Modal Form Dialog Component:
 * Replaces hardcoded backdrop and non-accessible prototype modal with
 * accessible keyboard dismiss (Escape), backdrop click, and clean button action footer.
 */
export interface ModalFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  isSubmitting?: boolean;
}

export const ModalFormDialog: React.FC<ModalFormDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  onSubmit,
  primaryActionLabel = 'Save to Registry',
  secondaryActionLabel = 'Dismiss',
  isSubmitting = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-xl flex flex-col gap-5 text-slate-800 dark:text-slate-100 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">{children}</div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <ButtonSecondary type="button" onClick={onClose} disabled={isSubmitting}>
              {secondaryActionLabel}
            </ButtonSecondary>
            <ButtonPrimary type="submit" isLoading={isSubmitting}>
              {primaryActionLabel}
            </ButtonPrimary>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 5. RESPONSIVE MASTER-DETAIL TABLE (Mobile Accordion Drawer + Desktop Focus)
// ============================================================================

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  hideOnMobile?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ResponsiveMasterDetailTableProps<T extends { id: string | number }> {
  columns: TableColumn<T>[];
  data: T[];
  selectedId?: string | number;
  onSelectRow?: (item: T) => void;
  renderMobileExpandedContent?: (item: T) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function ResponsiveMasterDetailTable<T extends { id: string | number }>({
  columns,
  data,
  selectedId,
  onSelectRow,
  renderMobileExpandedContent,
  emptyMessage = 'No records found.',
  className = '',
}: ResponsiveMasterDetailTableProps<T>) {
  const [expandedMobileRowIds, setExpandedMobileRowIds] = useState<Set<string | number>>(new Set());

  const toggleMobileRow = (id: string | number) => {
    setExpandedMobileRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRowClick = (item: T) => {
    // Desktop: trigger external detail focus pane
    if (onSelectRow) {
      onSelectRow(item);
    }
    // Mobile: toggle inline accordion drawer
    toggleMobileRow(item.id);
  };

  return (
    <table className={`w-full border-collapse text-left ${className}`}>
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          {columns.map((col, idx) => (
            <th
              key={col.key}
              className={`py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 ${
                col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
              } ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}
            >
              {col.header}
            </th>
          ))}
          <th className="py-3 px-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 md:hidden w-8">
            <span className="sr-only">Toggle</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {data.map((item) => {
          const isSelected = selectedId === item.id;
          const isExpanded = expandedMobileRowIds.has(item.id);

          return (
            <React.Fragment key={item.id}>
              <tr
                onClick={() => handleRowClick(item)}
                className={`cursor-pointer transition-colors duration-150 select-none ${
                  isSelected
                    ? 'bg-blue-50/60 dark:bg-blue-950/30 border-l-2 border-primary'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`py-3.5 px-4 text-sm text-slate-800 dark:text-slate-200 ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                        ? 'text-right'
                        : 'text-left'
                    } ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${
                      idx === 0 ? 'font-medium' : ''
                    }`}
                  >
                    {col.render ? col.render(item) : (item as any)[col.key]}
                  </td>
                ))}
                <td className="py-3.5 px-3 text-right text-slate-400 md:hidden w-8">
                  <Icon
                    name={isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                    size={18}
                    className="transition-transform inline-block"
                  />
                </td>
              </tr>

              {/* Collapsible details drawer for mobile viewports */}
              {isExpanded && renderMobileExpandedContent && (
                <tr className="md:hidden bg-slate-50/80 dark:bg-slate-800/80">
                  <td colSpan={columns.length + 1} className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 animate-fadeIn">
                      {renderMobileExpandedContent(item)}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}

        {data.length === 0 && (
          <tr>
            <td
              colSpan={columns.length + 1}
              className="py-10 text-center text-sm text-slate-400 dark:text-slate-500"
            >
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

