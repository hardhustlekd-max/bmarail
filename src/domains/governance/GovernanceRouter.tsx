import React from 'react';
import { UserRole } from '../../types';
import { useToast } from '../../context/ToastContext';
import { SuperAdminInterface } from '../../components/SuperAdminInterface';
import { SettingsPage } from '../../components/SettingsPage';

interface GovernanceRouterProps {
  activePage: string;
  setActivePage: (page: string) => void;
  lang: 'am' | 'en';
  userRole: UserRole;
  userBadgeId: string;
  currentTheme?: 'light' | 'dark';
  onToggleLang?: () => void;
  onToggleTheme?: () => void;
  onLogoutClick?: () => void;
}

export const GovernanceRouter: React.FC<GovernanceRouterProps> = ({
  activePage,
  lang,
  userRole,
  userBadgeId,
  currentTheme = 'light',
  onToggleLang,
  onToggleTheme,
  onLogoutClick,
}) => {
  const { addToast } = useToast();

  if (activePage.startsWith('superadmin') && userRole === 'superadmin') {
    const initialTab =
      activePage === 'superadmin_subcities'
        ? 'subcities'
        : activePage === 'superadmin_owners' || activePage === 'superadmin_permits'
        ? 'permits'
        : activePage === 'superadmin_maintenance'
        ? 'maintenance'
        : 'users';

    return (
      <SuperAdminInterface
        currentLang={lang}
        currentUserBadgeId={userBadgeId}
        initialTab={initialTab}
        onShowToast={(msg, type) => addToast(msg, (type as string) === 'warning' ? 'error' : type)}
      />
    );
  }

  if (activePage === 'settings') {
    return (
      <SettingsPage
        userBadgeId={userBadgeId}
        userRole={userRole}
        currentLang={lang}
        currentTheme={currentTheme}
        onToggleLang={onToggleLang}
        onToggleTheme={onToggleTheme}
        onLogoutClick={onLogoutClick}
      />
    );
  }

  return null;
};
