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
      'bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-semibold shadow-xs hover:shadow-sm focus:ring-2 focus:ring-[#2563eb]/40',
    secondary:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold focus:ring-2 focus:ring-slate-400/30',
    danger:
      'bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white font-semibold shadow-xs focus:ring-2 focus:ring-[#ef4444]/40',
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
      bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/40',
      dot: 'bg-emerald-500',
    },
    success: {
      bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/40',
      dot: 'bg-emerald-500',
    },
    overdue: {
      bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/40',
      dot: 'bg-rose-500',
    },
    danger: {
      bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/40',
      dot: 'bg-rose-500',
    },
    pending: {
      bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/40',
      dot: 'bg-amber-500',
    },
    warning: {
      bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/40',
      dot: 'bg-amber-500',
    },
    info: {
      bg: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300/40',
      dot: 'bg-sky-500',
    },
    neutral: {
      bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300/40',
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
    paid: 'bg-[#22c55e]',
    active: 'bg-[#22c55e]',
    unpaid: 'bg-[#ef4444]',
    inactive: 'bg-[#ef4444]',
    pending: 'bg-[#f59e0b]',
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
          : 'border-slate-300 dark:border-slate-700 focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]'
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
      className="w-full pl-10 pr-9 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] placeholder-slate-400 transition-colors"
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
            : 'border-slate-300 dark:border-slate-700 focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]'
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
    success: 'text-[#16a34a] dark:text-[#22c55e]',
    danger: 'text-[#dc2626] dark:text-[#ef4444]',
    warning: 'text-[#d97706] dark:text-[#f59e0b]',
    accent: 'text-[#2563eb] dark:text-[#3b82f6]',
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
  periods: Record<string, 'paid' | 'unpaid' | 'pending' | 'muted'>;
}

export interface MonthlyMatrixLedgerProps {
  columns: Array<{ key: string; label: string; title?: string }>;
  rows: MatrixRowItem[];
  onRowClick?: (row: MatrixRowItem) => void;
  className?: string;
  memberHeaderLabel?: string;
  emptyMessage?: string;
}

export const MonthlyMatrixLedger: React.FC<MonthlyMatrixLedgerProps> = ({
  columns,
  rows,
  onRowClick,
  className = '',
  memberHeaderLabel = 'Member / Entity',
  emptyMessage = 'No ledger records available.',
}) => (
  <table className={`w-full border-collapse text-left ${className}`}>
    <thead>
      <tr className="border-b border-slate-200 dark:border-slate-800">
        <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 text-left">
          {memberHeaderLabel}
        </th>
        {columns.map((col) => (
          <th
            key={col.key}
            title={col.title}
            className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 text-center whitespace-nowrap"
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {rows.map((row) => (
        <tr
          key={row.id}
          onClick={() => onRowClick && onRowClick(row)}
          className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
            onRowClick ? 'cursor-pointer' : ''
          }`}
        >
          <td className="py-3.5 px-4 text-sm font-medium text-slate-900 dark:text-slate-100">
            <div className="font-semibold text-slate-800 dark:text-slate-100">{row.title}</div>
            {row.subtitle && (
              <div className="text-xs text-slate-400 dark:text-slate-500">{row.subtitle}</div>
            )}
          </td>
          {columns.map((col) => {
            const status = row.periods[col.key] || 'muted';
            return (
              <td key={col.key} className="py-3.5 px-4 text-center">
                <StatusDot
                  status={status}
                  size={12}
                  title={`${row.title} - ${col.label}: ${status}`}
                />
              </td>
            );
          })}
        </tr>
      ))}
      {rows.length === 0 && (
        <tr>
          <td
            colSpan={columns.length + 1}
            className="py-8 text-center text-sm text-slate-400 dark:text-slate-500"
          >
            {emptyMessage}
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

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
    ? 'text-[#16a34a] dark:text-[#22c55e]'
    : isFailed
    ? 'text-[#dc2626] dark:text-[#ef4444]'
    : isPending
    ? 'text-[#d97706] dark:text-[#f59e0b]'
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity"
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
                    ? 'bg-blue-50/60 dark:bg-blue-950/30 border-l-2 border-[#2563eb]'
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

