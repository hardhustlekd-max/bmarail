import { useState, useEffect } from 'react';
import { loadUserNotificationStateFromDb, saveUserNotificationStateToDb } from '../services/dbService';

export function useNotifications(userBadgeId: string, userRole: string) {
  const userNotificationScope = `bahirdar_notif_${userBadgeId || 'badge'}_${userRole || 'role'}`;
  const readStorageKey = `${userNotificationScope}_read`;
  const clearedStorageKey = `${userNotificationScope}_cleared`;

  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [clearedNotificationIds, setClearedNotificationIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let isMounted = true;
    loadUserNotificationStateFromDb(userNotificationScope).then((data) => {
      if (!isMounted) return;
      if (data) {
        setReadNotificationIds(new Set(data.readIds));
        setClearedNotificationIds(new Set(data.clearedIds));
      } else {
        try {
          const savedRead = localStorage.getItem(readStorageKey);
          const savedCleared = localStorage.getItem(clearedStorageKey);
          setReadNotificationIds(savedRead ? new Set(JSON.parse(savedRead)) : new Set());
          setClearedNotificationIds(savedCleared ? new Set(JSON.parse(savedCleared)) : new Set());
        } catch {}
      }
    });

    return () => {
      isMounted = false;
    };
  }, [userNotificationScope, readStorageKey, clearedStorageKey]);

  const markNotificationAsRead = async (id: string) => {
    const nextRead = new Set(readNotificationIds);
    nextRead.add(id);
    setReadNotificationIds(nextRead);
    const readArr = Array.from(nextRead);
    const clearedArr = Array.from(clearedNotificationIds);
    try {
      localStorage.setItem(readStorageKey, JSON.stringify(readArr));
    } catch {}
    await saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
  };

  const clearNotification = async (id: string) => {
    const nextCleared = new Set(clearedNotificationIds);
    nextCleared.add(id);
    setClearedNotificationIds(nextCleared);
    const readArr = Array.from(readNotificationIds);
    const clearedArr = Array.from(nextCleared);
    try {
      localStorage.setItem(clearedStorageKey, JSON.stringify(clearedArr));
    } catch {}
    await saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
  };

  const markAllAsRead = async (allIds: string[]) => {
    const nextRead = new Set(readNotificationIds);
    allIds.forEach((id) => nextRead.add(id));
    setReadNotificationIds(nextRead);
    const readArr = Array.from(nextRead);
    const clearedArr = Array.from(clearedNotificationIds);
    try {
      localStorage.setItem(readStorageKey, JSON.stringify(readArr));
    } catch {}
    await saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
  };

  const clearAll = async (allIds: string[]) => {
    const nextCleared = new Set(clearedNotificationIds);
    allIds.forEach((id) => nextCleared.add(id));
    setClearedNotificationIds(nextCleared);
    const readArr = Array.from(readNotificationIds);
    const clearedArr = Array.from(nextCleared);
    try {
      localStorage.setItem(clearedStorageKey, JSON.stringify(clearedArr));
    } catch {}
    await saveUserNotificationStateToDb(userNotificationScope, readArr, clearedArr);
  };

  return {
    readNotificationIds,
    clearedNotificationIds,
    setReadNotificationIds,
    setClearedNotificationIds,
    markNotificationAsRead,
    clearNotification,
    markAllAsRead,
    clearAll,
    userNotificationScope,
    readStorageKey,
    clearedStorageKey,
  };
}
