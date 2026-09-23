import React from 'react';
import { EthiopianDatePickerPopover } from './ui/EthiopianDatePickerPopover';

interface EthiopianDatePickerInputProps {
  value: string; // Gregorian ISO 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  lang?: 'am' | 'en';
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const EthiopianDatePickerInput: React.FC<EthiopianDatePickerInputProps> = ({
  value,
  onChange,
  lang = 'am',
  label,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wide">
          {label}
        </label>
      )}
      <EthiopianDatePickerPopover
        value={value}
        onChange={onChange}
        lang={lang}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
};
