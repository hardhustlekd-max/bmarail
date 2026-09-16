import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  MotorcycleRegistration,
  OfficerAssignment,
  PrintBatchOrder,
  VerificationLog,
  UnregisteredVehicleReport,
  PaymentReceipt,
  SystemSettings,
} from '../types';
import {
  subscribeRegistrations,
  subscribeOfficers,
  subscribePrintOrders,
  subscribeVerificationLogs,
  subscribeUnregisteredReports,
  subscribePaymentReceipts,
  subscribeSettings,
  saveRegistrationToDb,
  updateRegistrationStatusInDb,
  saveOfficerToDb,
  savePrintOrderToDb,
  updatePrintOrderStatusInDb,
  saveVerificationLogToDb,
  saveUnregisteredReportToDb,
  updateUnregisteredReportStatusInDb,
  savePaymentReceiptToDb,
  deletePaymentReceiptFromDb,
  syncAllCollectionsWithDb,
  syncCriticalStartup,
  DEFAULT_SETTINGS,
} from '../services/dbService';
import { useToast } from './ToastContext';

interface DataContextType {
  registrations: MotorcycleRegistration[];
  officers: OfficerAssignment[];
  printOrders: PrintBatchOrder[];
  verificationLogs: VerificationLog[];
  unregisteredReports: UnregisteredVehicleReport[];
  paymentReceipts: PaymentReceipt[];
  settings: SystemSettings;
  isLoading: boolean;
  refreshData: () => Promise<void>;

  // Domain Actions
  saveRegistration: (newReg: MotorcycleRegistration, options?: any) => Promise<{ success: boolean; error?: string }>;
  approveRegistration: (id: string) => Promise<void>;
  rejectRegistration: (id: string, reason: string) => Promise<void>;
  addPaymentReceipt: (receipt: PaymentReceipt) => Promise<void>;
  deletePaymentReceipt: (id: string) => Promise<void>;
  addVerificationLog: (log: VerificationLog) => Promise<void>;
  saveOfficerAssignment: (assignment: OfficerAssignment) => Promise<void>;
  createPrintOrder: (registrationIds: string[], notes: string) => Promise<void>;
  updatePrintOrderStatus: (orderId: string, status: 'pending' | 'in_printing' | 'completed') => Promise<void>;
  saveUnregisteredReport: (report: UnregisteredVehicleReport) => Promise<void>;
  updateUnregisteredReportStatus: (id: string, status: any, resolutionNotes?: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode; lang?: 'am' | 'en' }> = ({ children, lang = 'am' }) => {
  const { addToast } = useToast();
  const isAmharic = lang === 'am';

  const [registrations, setRegistrations] = useState<MotorcycleRegistration[]>([]);
  const [officers, setOfficers] = useState<OfficerAssignment[]>([]);
  const [printOrders, setPrintOrders] = useState<PrintBatchOrder[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [unregisteredReports, setUnregisteredReports] = useState<UnregisteredVehicleReport[]>([]);
  const [paymentReceipts, setPaymentReceipts] = useState<PaymentReceipt[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Real-time subscriptions
  useEffect(() => {
    syncCriticalStartup().catch(() => {});

    const unsubRegs = subscribeRegistrations(setRegistrations);
    const unsubOffs = subscribeOfficers(setOfficers);
    const unsubPrints = subscribePrintOrders(setPrintOrders);
    const unsubLogs = subscribeVerificationLogs(setVerificationLogs);
    const unsubUnregistered = subscribeUnregisteredReports(setUnregisteredReports);
    const unsubPayments = subscribePaymentReceipts(setPaymentReceipts);
    const unsubSettings = subscribeSettings((data) => {
      if (data) setSettings(data);
    });

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);

    return () => {
      clearTimeout(timer);
      unsubRegs();
      unsubOffs();
      unsubPrints();
      unsubLogs();
      unsubUnregistered();
      unsubPayments();
      unsubSettings();
    };
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      await syncAllCollectionsWithDb();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Atomic and validated actions
  const saveRegistration = useCallback(
    async (newReg: MotorcycleRegistration, options?: any) => {
      try {
        const res = await saveRegistrationToDb(newReg, options);
        if (res.success) {
          addToast(
            isAmharic
              ? `የ ${newReg.fullName} ምዝገባ በተሳካ ሁኔታ ተቀምጧል!`
              : `Registration for ${newReg.fullName} stored successfully!`,
            'success'
          );
        } else {
          addToast(
            isAmharic ? 'የዳታቤዝ ማስቀመጥ አልተሳካም!' : 'Database save failed!',
            'error'
          );
        }
        return res;
      } catch (err: any) {
        addToast(
          isAmharic ? 'ምዝገባውን ማስቀመጥ አልተሳካም!' : 'Failed to store registration!',
          'error'
        );
        return { success: false, error: err?.message || 'Save failed' };
      }
    },
    [addToast, isAmharic]
  );

  const approveRegistration = useCallback(
    async (id: string) => {
      try {
        await updateRegistrationStatusInDb(id, 'approved');
        addToast(
          isAmharic
            ? `የምዝገባ መለያ ${id} በዳታቤዝ ውስጥ ጸድቋል!`
            : `Registration ${id} approved successfully!`,
          'success'
        );
      } catch (err) {
        addToast(isAmharic ? 'ማጽደቅ አልተሳካም!' : 'Failed to approve registration!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  const rejectRegistration = useCallback(
    async (id: string, reason: string) => {
      try {
        await updateRegistrationStatusInDb(id, 'rejected', reason);
        addToast(
          isAmharic
            ? `የምዝገባ መለያ ${id} ውድቅ ተደርጓል!`
            : `Registration ${id} rejected in database!`,
          'info'
        );
      } catch (err) {
        addToast(isAmharic ? 'ውድቅ ማድረግ አልተሳካም!' : 'Failed to reject registration!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  const addPaymentReceipt = useCallback(
    async (receipt: PaymentReceipt) => {
      try {
        await savePaymentReceiptToDb(receipt);
        addToast(
          isAmharic
            ? `የክፍያ ደረሰኝ ቁጥር ${receipt.receiptNumber} በተሳካ ሁኔታ ተመዝግቧል!`
            : `Payment receipt #${receipt.receiptNumber} registered successfully!`,
          'success'
        );
      } catch (err) {
        addToast(
          isAmharic ? 'ደረሰኙን መመዝገብ አልተሳካም!' : 'Failed to register payment receipt!',
          'error'
        );
      }
    },
    [addToast, isAmharic]
  );

  const deletePaymentReceipt = useCallback(
    async (id: string) => {
      try {
        await deletePaymentReceiptFromDb(id);
        addToast(
          isAmharic ? 'የክፍያ ደረሰኙ ተሰርዟል!' : 'Payment receipt deleted successfully!',
          'info'
        );
      } catch (err) {
        addToast(
          isAmharic ? 'ደረሰኙን መሰረዝ አልተሳካም!' : 'Failed to delete payment receipt!',
          'error'
        );
      }
    },
    [addToast, isAmharic]
  );

  const addVerificationLog = useCallback(
    async (log: VerificationLog) => {
      try {
        await saveVerificationLogToDb(log);
        // Silent automated background logging without disruptive toast notification
      } catch (err) {
        console.error('Failed to save verification log:', err);
      }
    },
    []
  );

  const saveOfficerAssignment = useCallback(
    async (assignment: OfficerAssignment) => {
      try {
        await saveOfficerToDb(assignment);
        addToast(
          isAmharic
            ? `ኦፊሰር ${assignment.officerName} በተሳካ ሁኔታ ተመድቧል!`
            : `Officer ${assignment.officerName} successfully assigned!`,
          'success'
        );
      } catch (err) {
        addToast(isAmharic ? 'ምደባውን ማስቀመጥ አልተሳካም!' : 'Failed to save assignment!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  const createPrintOrder = useCallback(
    async (registrationIds: string[], notes: string) => {
      try {
        const newOrder: PrintBatchOrder = {
          id: `BATCH-PRINT-${Math.floor(900 + Math.random() * 99)}`,
          orderDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
          registrationIds,
          status: 'pending',
          notes,
          totalItems: registrationIds.length,
          totalCount: registrationIds.length,
          updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
        };
        await savePrintOrderToDb(newOrder);
        addToast(
          isAmharic
            ? 'የሕትመት ትእዛዝ በተሳካ ሁኔታ ተፈጥሯል!'
            : 'Batch print order created successfully!',
          'success'
        );
      } catch (err) {
        addToast(isAmharic ? 'የሕትመት ትእዛዝ መፍጠር አልተሳካም!' : 'Failed to create print order!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  const updatePrintOrderStatus = useCallback(
    async (orderId: string, status: 'pending' | 'in_printing' | 'completed') => {
      try {
        await updatePrintOrderStatusInDb(orderId, status);
        addToast(
          isAmharic ? 'የትዕዛዝ ሁኔታ ተሻሽሏል!' : 'Order status updated successfully!',
          'info'
        );
      } catch (err) {
        addToast(isAmharic ? 'የትዕዛዝ ሁኔታ ማሻሻል አልተሳካም!' : 'Failed to update order status!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  const saveUnregisteredReport = useCallback(
    async (report: UnregisteredVehicleReport) => {
      try {
        await saveUnregisteredReportToDb(report);
        addToast(
          isAmharic
            ? 'ያልተመዘገበ ተሽከርካሪ ጥቆማ በተሳካ ሁኔታ ተልኳል!'
            : 'Unregistered vehicle report logged successfully!',
          'success'
        );
      } catch (err) {
        addToast(isAmharic ? 'ሪፖርቱን ማስቀመጥ አልተሳካም!' : 'Failed to log report!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  const updateUnregisteredReportStatus = useCallback(
    async (id: string, status: any, resolutionNotes?: string) => {
      try {
        await updateUnregisteredReportStatusInDb(id, status, resolutionNotes);
        addToast(
          isAmharic ? 'የሪፖርቱ ሁኔታ ተዘምኗል!' : 'Report status updated successfully!',
          'info'
        );
      } catch (err) {
        addToast(isAmharic ? 'ሪፖርት ማሻሻል አልተሳካም!' : 'Failed to update report!', 'error');
      }
    },
    [addToast, isAmharic]
  );

  return (
    <DataContext.Provider
      value={{
        registrations,
        officers,
        printOrders,
        verificationLogs,
        unregisteredReports,
        paymentReceipts,
        settings,
        isLoading,
        refreshData,
        saveRegistration,
        approveRegistration,
        rejectRegistration,
        addPaymentReceipt,
        deletePaymentReceipt,
        addVerificationLog,
        saveOfficerAssignment,
        createPrintOrder,
        updatePrintOrderStatus,
        saveUnregisteredReport,
        updateUnregisteredReportStatus,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
