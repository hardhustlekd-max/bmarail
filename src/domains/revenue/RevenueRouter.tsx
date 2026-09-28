import React from 'react';
import { UserRole, PaymentReceipt, MotorcycleRegistration } from '../../types';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PaymentReceiptsPage } from '../../components/PaymentReceiptsPage';
import { isTaskViewable } from '../../services/dbService';

interface RevenueRouterProps {
  activePage: string;
  setActivePage: (page: string) => void;
  lang: 'am' | 'en';
  userRole: UserRole;
  userBadgeId: string;
  paymentReceipts?: PaymentReceipt[];
  registrations?: MotorcycleRegistration[];
}

export const RevenueRouter: React.FC<RevenueRouterProps> = ({
  activePage,
  lang,
  userRole,
  userBadgeId,
  paymentReceipts: propPaymentReceipts,
  registrations: propRegistrations,
}) => {
  const {
    paymentReceipts: contextPaymentReceipts,
    registrations: contextRegistrations,
    addPaymentReceipt,
    deletePaymentReceipt,
    isLoading,
  } = useData();

  const effectiveReceipts =
    propPaymentReceipts && propPaymentReceipts.length > 0
      ? propPaymentReceipts
      : contextPaymentReceipts;

  const effectiveRegistrations =
    propRegistrations && propRegistrations.length > 0
      ? propRegistrations
      : contextRegistrations;

  const { addToast } = useToast();

  if (activePage === 'payment_receipts') {
    if (!isTaskViewable(userRole, 10) && !isTaskViewable(userRole, 16) && !isTaskViewable(userRole, 17)) {
      return (
        <div className="p-6 text-center">
          <p className="text-rose-500 font-bold">
            {lang === 'am' 
              ? 'ይህንን ገጽ ለመመልከት ፈቃድ የለዎትም።' 
              : 'You do not have permission to view this page.'}
          </p>
        </div>
      );
    }
    return (
      <PaymentReceiptsPage
        lang={lang}
        userRole={userRole}
        userBadgeId={userBadgeId}
        paymentReceipts={effectiveReceipts}
        registrations={effectiveRegistrations}
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
