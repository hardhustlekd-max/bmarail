import { QueryClient } from '@tanstack/react-query';
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
  safeJsonFetch,
  getInMemoryState,
  DEFAULT_SETTINGS,
  PreAggregatedKPIData,
} from './dbService';

export const queryKeys = {
  registrations: ['registrations'] as const,
  registrationById: (id: string) => ['registrations', id] as const,
  paymentReceipts: ['paymentReceipts'] as const,
  officers: ['officers'] as const,
  printOrders: ['printOrders'] as const,
  verificationLogs: ['verificationLogs'] as const,
  unregisteredReports: ['unregisteredReports'] as const,
  settings: ['settings'] as const,
  kpis: ['kpis'] as const,
  monthlyFeeStats: (subCity?: string) => ['monthlyFeeStats', subCity || 'all'] as const,
  realtimeStatus: ['realtimeStatus'] as const,
};

/**
 * Global TanStack Query Client configured for multi-device live sync
 * Features:
 * - 30s stale time with instant cache-while-revalidating
 * - 15m garbage collection
 * - Automatic background refetch on tab focus (when returning to device)
 * - Automatic background refetch on network reconnect
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 60 seconds (prevents redundant rapid network requests on free tier)
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1, // Minimize retry spam on transient serverless blips
    },
  },
});

// ============================================================================
// Core Fetchers with resilient fallback to local in-memory storage
// ============================================================================

export async function fetchRegistrationsQuery(): Promise<MotorcycleRegistration[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; registrations?: MotorcycleRegistration[] }>(
      '/api/registrations',
      undefined,
      10000
    );
    if (res && Array.isArray(res.registrations)) {
      return res.registrations;
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for registrations:', err);
  }
  return getInMemoryState().registrations;
}

export async function fetchPaymentReceiptsQuery(): Promise<PaymentReceipt[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; receipts?: PaymentReceipt[] }>(
      '/api/payment-receipts',
      undefined,
      10000
    );
    if (res && Array.isArray(res.receipts)) {
      return res.receipts;
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for payment receipts:', err);
  }
  return getInMemoryState().paymentReceipts;
}

export async function fetchOfficersQuery(): Promise<OfficerAssignment[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; officers?: OfficerAssignment[] }>(
      '/api/officers',
      undefined,
      8000
    );
    if (res && Array.isArray(res.officers)) {
      return res.officers;
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for officers:', err);
  }
  return getInMemoryState().officers;
}

export async function fetchPrintOrdersQuery(): Promise<PrintBatchOrder[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; printOrders?: PrintBatchOrder[] }>(
      '/api/print-orders',
      undefined,
      8000
    );
    if (res && Array.isArray(res.printOrders)) {
      return res.printOrders;
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for print orders:', err);
  }
  return getInMemoryState().printOrders;
}

export async function fetchVerificationLogsQuery(): Promise<VerificationLog[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; logs?: VerificationLog[] }>(
      '/api/verification-logs',
      undefined,
      8000
    );
    if (res && Array.isArray(res.logs)) {
      return res.logs;
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for verification logs:', err);
  }
  return getInMemoryState().verifications;
}

export async function fetchUnregisteredReportsQuery(): Promise<UnregisteredVehicleReport[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; reports?: UnregisteredVehicleReport[] }>(
      '/api/unregistered-reports',
      undefined,
      8000
    );
    if (res && Array.isArray(res.reports)) {
      return res.reports;
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for unregistered reports:', err);
  }
  return getInMemoryState().unregisteredReports;
}

export async function fetchSettingsQuery(): Promise<SystemSettings> {
  try {
    const res = await safeJsonFetch<{ success: boolean; settings?: SystemSettings }>(
      '/api/settings',
      undefined,
      6000
    );
    if (res && res.settings) {
      return { ...DEFAULT_SETTINGS, ...res.settings };
    }
  } catch (err) {
    console.warn('[TanStack Query] Fallback to local memory for settings:', err);
  }
  return getInMemoryState().settings || DEFAULT_SETTINGS;
}

export async function fetchKpisQuery(): Promise<PreAggregatedKPIData | null> {
  try {
    const res = await safeJsonFetch<{ success: boolean; data?: PreAggregatedKPIData }>(
      '/api/dashboard/kpis',
      undefined,
      8000
    );
    if (res && res.data) {
      return res.data;
    }
  } catch (err) {
    console.warn('[TanStack Query] KPI fetch notice:', err);
  }
  return null;
}

// ============================================================================
// Real-Time SSE to TanStack Query State Synchronizer
// ============================================================================

export interface SsePayloadEvent {
  collection: string;
  action: 'upsert' | 'delete' | 'clear';
  docId?: string;
  data?: any;
  timestamp?: number;
  eventId?: number;
}

/**
 * Reconciles incoming Server-Sent Event (SSE) directly into TanStack Query Cache.
 * This guarantees instantaneous, cross-device zero-latency UI updates without full page reloads.
 */
export function applySseToTanStackCache(event: SsePayloadEvent) {
  const { collection, action, docId, data } = event;

  try {
    if (collection === 'motorcycle_registrations') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        queryClient.setQueryData<MotorcycleRegistration[]>(queryKeys.registrations, (prev) => {
          const list = prev ? [...prev] : [...getInMemoryState().registrations];
          const idx = list.findIndex((r) => r.id === targetId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...data };
          } else {
            list.unshift(data);
          }
          return list;
        });
        queryClient.setQueryData(queryKeys.registrationById(targetId), data);
      } else if (action === 'delete' && docId) {
        queryClient.setQueryData<MotorcycleRegistration[]>(queryKeys.registrations, (prev) => {
          if (!prev) return [];
          return prev.filter((r) => r.id !== docId);
        });
        queryClient.removeQueries({ queryKey: queryKeys.registrationById(docId) });
      } else if (action === 'clear') {
        queryClient.setQueryData(queryKeys.registrations, []);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
    } else if (collection === 'payment_receipts') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        queryClient.setQueryData<PaymentReceipt[]>(queryKeys.paymentReceipts, (prev) => {
          const list = prev ? [...prev] : [...getInMemoryState().paymentReceipts];
          const idx = list.findIndex((p) => p.id === targetId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...data };
          } else {
            list.unshift(data);
          }
          return list;
        });
      } else if (action === 'delete' && docId) {
        queryClient.setQueryData<PaymentReceipt[]>(queryKeys.paymentReceipts, (prev) => {
          if (!prev) return [];
          return prev.filter((p) => p.id !== docId);
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
      queryClient.invalidateQueries({ queryKey: ['monthlyFeeStats'] });
    } else if (collection === 'officer_assignments') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        queryClient.setQueryData<OfficerAssignment[]>(queryKeys.officers, (prev) => {
          const list = prev ? [...prev] : [...getInMemoryState().officers];
          const idx = list.findIndex((o) => o.id === targetId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...data };
          } else {
            list.unshift(data);
          }
          return list;
        });
      } else if (action === 'delete' && docId) {
        queryClient.setQueryData<OfficerAssignment[]>(queryKeys.officers, (prev) => {
          if (!prev) return [];
          return prev.filter((o) => o.id !== docId);
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
    } else if (collection === 'print_batch_orders') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        queryClient.setQueryData<PrintBatchOrder[]>(queryKeys.printOrders, (prev) => {
          const list = prev ? [...prev] : [...getInMemoryState().printOrders];
          const idx = list.findIndex((po) => po.id === targetId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...data };
          } else {
            list.unshift(data);
          }
          return list;
        });
      }
    } else if (collection === 'verification_logs') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        queryClient.setQueryData<VerificationLog[]>(queryKeys.verificationLogs, (prev) => {
          const list = prev ? [...prev] : [...getInMemoryState().verifications];
          const idx = list.findIndex((v) => v.id === targetId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...data };
          } else {
            list.unshift(data);
          }
          return list;
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
    } else if (collection === 'unregistered_vehicle_reports') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        queryClient.setQueryData<UnregisteredVehicleReport[]>(queryKeys.unregisteredReports, (prev) => {
          const list = prev ? [...prev] : [...getInMemoryState().unregisteredReports];
          const idx = list.findIndex((u) => u.id === targetId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...data };
          } else {
            list.unshift(data);
          }
          return list;
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
    } else if (collection === 'system_settings') {
      if (data) {
        queryClient.setQueryData<SystemSettings>(queryKeys.settings, (prev) => {
          return { ...(prev || DEFAULT_SETTINGS), ...data };
        });
      }
    } else if (collection === 'system_reset') {
      // Invalidate everything on system reset
      invalidateAllCoreQueries();
    }
  } catch (cacheErr) {
    console.error('[TanStack Query] Error applying SSE event to cache:', cacheErr);
  }
}

/**
 * Invalidates all core queries to re-fetch freshest state from server
 */
export function invalidateAllCoreQueries() {
  queryClient.invalidateQueries({ queryKey: queryKeys.registrations });
  queryClient.invalidateQueries({ queryKey: queryKeys.paymentReceipts });
  queryClient.invalidateQueries({ queryKey: queryKeys.officers });
  queryClient.invalidateQueries({ queryKey: queryKeys.printOrders });
  queryClient.invalidateQueries({ queryKey: queryKeys.verificationLogs });
  queryClient.invalidateQueries({ queryKey: queryKeys.unregisteredReports });
  queryClient.invalidateQueries({ queryKey: queryKeys.settings });
  queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
}
