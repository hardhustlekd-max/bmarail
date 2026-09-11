import React, { ReactNode } from 'react';
import { Icon } from './ui/Icon';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon: string;
  action?: ReactNode;
  actions?: ReactNode;
  className?: string;
  badge?: ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  actions,
  className = '',
  badge,
}) => {
  const finalAction = action || actions;
  return (
    <section className={`ref-section-title rounded-[10px] justify-between ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="ref-section-icon">
          <Icon className="material-symbols-outlined text-[20px]">{icon}</Icon>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="ref-h1 truncate">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="ref-subtitle truncate">{subtitle}</p>}
        </div>
      </div>
      {finalAction && <div className="shrink-0 flex items-center gap-2">{finalAction}</div>}
    </section>
  );
};
