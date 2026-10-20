import { useState, useEffect } from 'react';
import {
  applySseToTanStackCache,
  invalidateAllCoreQueries,
  SsePayloadEvent,
} from './queryClient';
import { getCurrentUser } from './authService';
import {
  getInMemoryState,
  notifyRegistrations,
  notifyPaymentReceipts,
  notifyOfficers,
  notifyPrintOrders,
  notifyVerifications,
  notifyUnregisteredReports,
  notifySettings,
  mapSettingsFromDb,
  mergeRegistrationsPreservingPhotos,
  mergeById,
  saveStateToLocalStorage,
  checkAndApplySystemResetIfNewer,
} from './dbService';

export type SyncConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'offline' | 'dormant';

export interface RealtimeSyncState {
  status: SyncConnectionStatus;
  isConnected: boolean;
  isDormant: boolean;
  activeDevices: number;
  lastSyncTime: Date | null;
  latencyMs: number;
  deviceId: string;
}

// Generate or retrieve persistent unique Device ID
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'bma_device_uid';
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 8);
      const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
      id = `device_${isMobile ? 'mobile' : 'station'}_${rand}`;
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `device_temp_${Math.random().toString(36).substring(2, 8)}`;
  }
}

// Module-level state
let eventSourceInstance: EventSource | null = null;
let currentStatus: SyncConnectionStatus = 'connecting';
let activeDevicesCount = 1;
let lastSyncTimestamp: Date | null = null;
let currentLatencyMs = 0;
let lastPingTimestamp = 0;
let lastReceivedEventId = 0;
let reconnectAttempt = 0;
let reconnectTimer: any = null;
let watchdogInterval: any = null;
let visibilitySleepTimer: any = null;
let userInactivityCheckInterval: any = null;
let lastUserInteractionTimestamp = Date.now();

const listeners = new Set<(state: RealtimeSyncState) => void>();

function notifyStatusChange() {
  const state: RealtimeSyncState = {
    status: currentStatus,
    isConnected: currentStatus === 'connected',
    isDormant: currentStatus === 'dormant',
    activeDevices: activeDevicesCount,
    lastSyncTime: lastSyncTimestamp,
    latencyMs: currentLatencyMs,
    deviceId: getOrCreateDeviceId(),
  };

  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (e) {
      console.error('[RealtimeSync] Listener error:', e);
    }
  });
}

/**
 * Handle incoming SSE events: updates TanStack Query cache, local inMemory state,
 * and notifies all UI subscribers simultaneously.
 */
function handleDatabaseChange(rawEvent: MessageEvent) {
  try {
    const payload: SsePayloadEvent = JSON.parse(rawEvent.data);
    if (!payload || !payload.collection) return;

    if (payload.eventId) {
      lastReceivedEventId = Math.max(lastReceivedEventId, payload.eventId);
    }

    lastSyncTimestamp = new Date();

    // 1. Update TanStack Query Cache
    applySseToTanStackCache(payload);

    // 2. Update inMemory state & trigger legacy subscribers
    const inMemory = getInMemoryState();
    const { collection, action, docId, data } = payload;

    if (collection === 'motorcycle_registrations') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        const idx = inMemory.registrations.findIndex((r) => r.id === targetId);
        if (idx >= 0) {
          inMemory.registrations[idx] = { ...inMemory.registrations[idx], ...data };
        } else {
          inMemory.registrations.unshift(data);
        }
        notifyRegistrations();
      } else if (action === 'delete' && docId) {
        inMemory.registrations = inMemory.registrations.filter((r) => r.id !== docId);
        notifyRegistrations();
      }
      saveStateToLocalStorage();
    } else if (collection === 'payment_receipts') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        const idx = inMemory.paymentReceipts.findIndex((rc) => rc.id === targetId);
        if (idx >= 0) {
          inMemory.paymentReceipts[idx] = { ...inMemory.paymentReceipts[idx], ...data };
        } else {
          inMemory.paymentReceipts.unshift(data);
        }
        notifyPaymentReceipts();
      } else if (action === 'delete' && docId) {
        inMemory.paymentReceipts = inMemory.paymentReceipts.filter((rc) => rc.id !== docId);
        notifyPaymentReceipts();
      }
      saveStateToLocalStorage();
    } else if (collection === 'officer_assignments') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        const idx = inMemory.officers.findIndex((o) => o.id === targetId);
        if (idx >= 0) {
          inMemory.officers[idx] = { ...inMemory.officers[idx], ...data };
        } else {
          inMemory.officers.unshift(data);
        }
        notifyOfficers();
      } else if (action === 'delete' && docId) {
        inMemory.officers = inMemory.officers.filter((o) => o.id !== docId);
        notifyOfficers();
      }
      saveStateToLocalStorage();
    } else if (collection === 'print_batch_orders') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        const idx = inMemory.printOrders.findIndex((po) => po.id === targetId);
        if (idx >= 0) {
          inMemory.printOrders[idx] = { ...inMemory.printOrders[idx], ...data };
        } else {
          inMemory.printOrders.unshift(data);
        }
        notifyPrintOrders();
      }
      saveStateToLocalStorage();
    } else if (collection === 'verification_logs') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        const idx = inMemory.verifications.findIndex((v) => v.id === targetId);
        if (idx >= 0) {
          inMemory.verifications[idx] = { ...inMemory.verifications[idx], ...data };
        } else {
          inMemory.verifications.unshift(data);
        }
        notifyVerifications();
      }
      saveStateToLocalStorage();
    } else if (collection === 'unregistered_vehicle_reports') {
      if (action === 'upsert' && data && (data.id || docId)) {
        const targetId = data.id || docId;
        const idx = inMemory.unregisteredReports.findIndex((u) => u.id === targetId);
        if (idx >= 0) {
          inMemory.unregisteredReports[idx] = { ...inMemory.unregisteredReports[idx], ...data };
        } else {
          inMemory.unregisteredReports.unshift(data);
        }
        notifyUnregisteredReports();
      }
      saveStateToLocalStorage();
    } else if (collection === 'system_settings') {
      if (data) {
        inMemory.settings = mapSettingsFromDb(data, inMemory.settings);
        notifySettings();
        saveStateToLocalStorage();
      }
    } else if (collection === 'system_reset') {
      if (payload.data?.systemResetEpoch) {
        checkAndApplySystemResetIfNewer(payload.data);
      }
    }

    notifyStatusChange();
  } catch (err) {
    console.warn('[RealtimeSync] Error parsing SSE payload:', err);
  }
}

/**
 * Initializes and manages the resilient SSE stream connection.
 * Includes serverless cost-saving hibernation for inactive or hidden tabs.
 */
export function initRealtimeSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const deviceId = getOrCreateDeviceId();

  const connect = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      currentStatus = 'offline';
      notifyStatusChange();
      return;
    }

    if (eventSourceInstance) {
      eventSourceInstance.close();
      eventSourceInstance = null;
    }

    currentStatus = reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    notifyStatusChange();

    try {
      const params = new URLSearchParams();
      params.set('deviceId', deviceId);
      if (lastReceivedEventId > 0) {
        params.set('lastEventId', String(lastReceivedEventId));
      }

      try {
        const user = getCurrentUser();
        if (user) {
          if (user.role) params.set('role', user.role);
          if (user.badgeId) params.set('badgeId', user.badgeId);
          if (user.subCity) params.set('subCity', user.subCity);
        }
      } catch {}

      const sseUrl = `/api/realtime/events?${params.toString()}`;
      const es = new EventSource(sseUrl);
      eventSourceInstance = es;

      es.onopen = () => {
        currentStatus = 'connected';
        reconnectAttempt = 0;
        lastPingTimestamp = Date.now();
        lastSyncTimestamp = new Date();
        notifyStatusChange();
      };

      es.addEventListener('sse_init', (ev: MessageEvent) => {
        try {
          const initData = JSON.parse(ev.data);
          if (initData.activeDevices) {
            activeDevicesCount = initData.activeDevices;
          }
          if (initData.latestEventId) {
            lastReceivedEventId = Math.max(lastReceivedEventId, initData.latestEventId);
          }
          currentStatus = 'connected';
          lastSyncTimestamp = new Date();
          notifyStatusChange();
        } catch {}
      });

      es.addEventListener('peer_presence', (ev: MessageEvent) => {
        try {
          const presence = JSON.parse(ev.data);
          if (presence.activeDevices !== undefined) {
            activeDevicesCount = presence.activeDevices;
            notifyStatusChange();
          }
        } catch {}
      });

      es.addEventListener('ping', (ev: MessageEvent) => {
        try {
          const pingData = JSON.parse(ev.data);
          if (pingData.time) {
            currentLatencyMs = Math.max(5, Math.min(999, Date.now() - pingData.time));
          }
          if (pingData.activeDevices !== undefined) {
            activeDevicesCount = pingData.activeDevices;
          }
          lastPingTimestamp = Date.now();
          currentStatus = 'connected';
          notifyStatusChange();
        } catch {}
      });

      es.addEventListener('database_change', (ev: MessageEvent) => {
        handleDatabaseChange(ev);
      });

      es.onmessage = (ev: MessageEvent) => {
        handleDatabaseChange(ev);
      };

      es.onerror = () => {
        if (eventSourceInstance) {
          eventSourceInstance.close();
          eventSourceInstance = null;
        }

        const isOnline = typeof navigator === 'undefined' || navigator.onLine;
        currentStatus = isOnline ? 'reconnecting' : 'offline';
        notifyStatusChange();

        // Exponential backoff with jitter: 2s -> 4s -> max 12s
        reconnectAttempt++;
        const backoffMs = Math.min(12000, 2000 * Math.pow(1.5, reconnectAttempt)) + Math.random() * 800;

        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (currentStatus !== 'dormant' && (!document.hidden || Date.now() - lastUserInteractionTimestamp < 600000)) {
            connect();
          }
        }, backoffMs);
      };
    } catch (e) {
      currentStatus = 'offline';
      notifyStatusChange();
    }
  };

  // Serverless Eco Mode: Enter dormant sleep when tab is hidden or idle
  const enterDormantSleep = () => {
    if (eventSourceInstance) {
      eventSourceInstance.close();
      eventSourceInstance = null;
    }
    currentStatus = 'dormant';
    notifyStatusChange();
  };

  const wakeUpFromSleep = () => {
    if (visibilitySleepTimer) {
      clearTimeout(visibilitySleepTimer);
      visibilitySleepTimer = null;
    }
    if (currentStatus === 'dormant' || !eventSourceInstance) {
      connect();
      invalidateAllCoreQueries();
    }
  };

  // Watchdog: Check if connection went dead without onerror
  // With 45s server heartbeats, a 75s threshold avoids false reconnects
  watchdogInterval = setInterval(() => {
    if (currentStatus === 'dormant') return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (currentStatus !== 'offline') {
        currentStatus = 'offline';
        notifyStatusChange();
      }
      return;
    }

    if (currentStatus === 'connected' && lastPingTimestamp > 0) {
      const timeSinceLastPing = Date.now() - lastPingTimestamp;
      if (timeSinceLastPing > 75000) {
        console.warn('[RealtimeSync Watchdog] Stale connection (>75s), recycling SSE connection...');
        connect();
      }
    }
  }, 15000);

  // Inactivity Check: If user is inactive for > 10 minutes, enter dormant sleep to stop burning Railway credits
  userInactivityCheckInterval = setInterval(() => {
    const idleMs = Date.now() - lastUserInteractionTimestamp;
    if (idleMs > 10 * 60 * 1000 && currentStatus === 'connected') {
      enterDormantSleep();
    }
  }, 30000);

  // Record user interaction to keep connection active or wake up
  const recordUserActivity = () => {
    lastUserInteractionTimestamp = Date.now();
    if (currentStatus === 'dormant') {
      wakeUpFromSleep();
    }
  };

  // Visibility Change: If tab is hidden for > 45s, sleep. When tab becomes visible, wake instantly!
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(visibilitySleepTimer);
      visibilitySleepTimer = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          enterDormantSleep();
        }
      }, 45000);
    } else {
      wakeUpFromSleep();
    }
  };

  // Network online/offline hooks
  const handleOnline = () => {
    reconnectAttempt = 0;
    connect();
    invalidateAllCoreQueries();
  };

  const handleOffline = () => {
    currentStatus = 'offline';
    notifyStatusChange();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pointerdown', recordUserActivity, { passive: true });
  window.addEventListener('keydown', recordUserActivity, { passive: true });
  window.addEventListener('touchstart', recordUserActivity, { passive: true });

  // Initial connection
  connect();

  return () => {
    clearTimeout(reconnectTimer);
    clearTimeout(visibilitySleepTimer);
    clearInterval(watchdogInterval);
    clearInterval(userInactivityCheckInterval);
    if (eventSourceInstance) {
      eventSourceInstance.close();
      eventSourceInstance = null;
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pointerdown', recordUserActivity);
    window.removeEventListener('keydown', recordUserActivity);
    window.removeEventListener('touchstart', recordUserActivity);
  };
}

/**
 * Trigger immediate manual sync refetch across all queries and wake from sleep if dormant
 */
export async function forceSyncNow(): Promise<void> {
  lastUserInteractionTimestamp = Date.now();
  lastSyncTimestamp = new Date();
  notifyStatusChange();
  invalidateAllCoreQueries();
}

/**
 * React hook to observe multi-device real-time sync status
 */
export function useRealtimeSyncStatus(): RealtimeSyncState & { forceSyncNow: () => Promise<void> } {
  const [state, setState] = useState<RealtimeSyncState>(() => ({
    status: currentStatus,
    isConnected: currentStatus === 'connected',
    isDormant: currentStatus === 'dormant',
    activeDevices: activeDevicesCount,
    lastSyncTime: lastSyncTimestamp,
    latencyMs: currentLatencyMs,
    deviceId: getOrCreateDeviceId(),
  }));

  useEffect(() => {
    const handler = (nextState: RealtimeSyncState) => {
      setState(nextState);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    ...state,
    forceSyncNow,
  };
}
