import React from 'react';
import { UserRole } from '../../types';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PaymentReceiptsPage } from '../../components/PaymentReceiptsPage';

interface RevenueRouterProps {
  activePage: string;
  setActivePage: (page: string) => void;
  lang: 'am' | 'en';
  userRole: UserRole;
  userBadgeId: string;
}

export const RevenueRouter: React.FC<RevenueRouterProps> = ({
  activePage,
  lang,
  userRole,
  userBadgeId,
}) => {
  const {
    paymentReceipts,
    registrations,
    addPaymentReceipt,
    deletePaymentReceipt,
    isLoading,
  } = useData();

  const { addToast } = useToast();

  if (activePage === 'payment_receipts') {
    const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';
    if (!isSuperAdmin) {
      return (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs max-w-lg mx-auto mt-12 space-y-3">
          <p className="text-base font-bold text-on-surface">
            {lang === 'am' ? 'ይህንን ገፅ ለማየት ፈቃድ የለዎትም። ለዋና አስተዳዳሪ ብቻ የተፈቀደ ነው።' : 'Access Restricted. The Revenue Ledger is exclusively visible to Super Admin.'}
          </p>
        </div>
      );
    }

    return (
      <PaymentReceiptsPage
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        paymentReceipts={paymentReceipts}
        registrations={registrations}
        onSaveReceipt={addPaymentReceipt}
        onAddPaymentReceipt={addPaymentReceipt}
        onDeleteReceipt={deletePaymentReceipt}
        onDeletePaymentReceipt={deletePaymentReceipt}
        onShowToast={(msg, type) => addToast(msg, (type as string) === 'warning' ? 'error' : type)}
        isLoading={isLoading}
      />
    );
  }

  return null;
};
