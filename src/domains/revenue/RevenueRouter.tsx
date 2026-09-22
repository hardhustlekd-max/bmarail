import React from 'react';
import { UserRole } from '../../types';
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
