import React, { useState, useEffect } from 'react';
import { MotorcycleRegistration } from '../types';
import { asyncLoadRegistrations, getIndexedDb } from '../utils/indexedDbStorage';
import { saveRegistrationToDb } from '../services/dbService';

interface OfflineFetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAmharic: boolean;
  onRestoreSuccess?: (restoredCount: number) => void;
}

export const OfflineFetchModal: React.FC<OfflineFetchModalProps> = ({
  isOpen,
  onClose,
  isAmharic,
  onRestoreSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [offlineRecords, setOfflineRecords] = useState<MotorcycleRegistration[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const fetchOfflineRecords = async () => {
    setLoading(true);
    setRestoreMessage(null);
    try {
      // 1. Direct fetch from IndexedDB 'registrations' store
      const records = await asyncLoadRegistrations();
      
      // 2. Also check if raw DB has anything else
      if (records.length === 0) {
        try {
          const db = await getIndexedDb();
          if (db) {
            const raw = await db.getAll('registrations');
            if (Array.isArray(raw) && raw.length > 0) {
              setOfflineRecords(raw as MotorcycleRegistration[]);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn('Fallback direct raw IDB read notice:', e);
        }
      }

      setOfflineRecords(records);
    } catch (err: any) {
      console.error('Error fetching offline records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOfflineRecords();
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredRecords = offlineRecords.filter((r) => {
    const matchesSearch =
      !searchTerm ||
      r.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.plateNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.phone?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || r.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const handlePushToDatabase = async () => {
    const targetRecords = offlineRecords.filter((r) => selectedIds.has(r.id));
    if (targetRecords.length === 0) return;

    setIsRestoring(true);
    setRestoreMessage(null);
    let successCount = 0;
    let failCount = 0;

    for (const record of targetRecords) {
      try {
        const res = await saveRegistrationToDb(record);
        if (res.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    setIsRestoring(false);
    setRestoreMessage(
      isAmharic
        ? `${successCount} መዝገቦች ወደ ዳታቤዝ በተሳካ ሁኔታ ተላልፈዋል!${failCount > 0 ? ` (${failCount} አልተሳኩም)` : ''}`
        : `${successCount} records successfully synced to DB!${failCount > 0 ? ` (${failCount} failed)` : ''}`
    );

    if (successCount > 0) {
      onRestoreSuccess?.(successCount);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[#1C2434] dark:text-[#DEE4EE]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between bg-[#F7F9FC] dark:bg-[#24303F]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">download_for_offline</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1C2434] dark:text-white flex items-center gap-2">
                {isAmharic ? 'የከመስመር ውጭ ዳታቤዝ መዝገቦች (bma_offline_db)' : 'Offline IndexedDB Records (bma_offline_db)'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono font-bold">
                  {offlineRecords.length}
                </span>
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#8A99AD]">
                {isAmharic
                  ? 'በዚህ ብሮውዘር ውስጥ በ IndexedDB የተከማቹ የምዝገባ መዝገቦች ዝርዝር'
                  : 'Registrations found in local browser storage ready for recovery & sync'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-sm hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            title={isAmharic ? 'ዝጋ' : 'Close'}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAmharic ? 'በስም፣ ሰሌዳ፣ ወይም መለያ ቁጥር ፈልግ...' : 'Search by name, plate, ID...'}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm text-[#1C2434] dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-1.5 px-2 bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm text-[#1C2434] dark:text-white"
            >
              <option value="all">{isAmharic ? 'ሁሉም ሁኔታ' : 'All Statuses'}</option>
              <option value="pending_approval">{isAmharic ? 'በመጠባበቅ ላይ (Pending)' : 'Pending Approval'}</option>
              <option value="approved">{isAmharic ? 'የጸደቁ (Approved)' : 'Approved'}</option>
              <option value="rejected">{isAmharic ? 'ውድቅ የተደረጉ (Rejected)' : 'Rejected'}</option>
              <option value="printed">{isAmharic ? 'የታተሙ (Printed)' : 'Printed'}</option>
            </select>

            <button
              type="button"
              onClick={fetchOfflineRecords}
              disabled={loading}
              className="px-2.5 py-1.5 text-xs bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              title={isAmharic ? 'እንደገና ጫን' : 'Refresh'}
            >
              <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>{isAmharic ? 'አድስ' : 'Refresh'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePushToDatabase}
              disabled={selectedIds.size === 0 || isRestoring}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedIds.size > 0 && !isRestoring
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
              <span>
                {isRestoring
                  ? (isAmharic ? 'እየተላለፈ ነው...' : 'Syncing...')
                  : isAmharic
                  ? `የተመረጡትን ወደ ዳታቤዝ ላክ (${selectedIds.size})`
                  : `Sync Selected to DB (${selectedIds.size})`}
              </span>
            </button>
          </div>
        </div>

        {/* Status message */}
        {restoreMessage && (
          <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <span>{restoreMessage}</span>
            <button
              type="button"
              onClick={() => setRestoreMessage(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-3xl animate-spin text-blue-500">progress_activity</span>
              <p className="text-xs">{isAmharic ? 'ከ IndexedDB መረጃዎችን እያነበበ ነው...' : 'Reading from IndexedDB...'}</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">inbox</span>
              <p className="text-sm font-semibold">{isAmharic ? 'ምንም ከመስመር ውጭ መዝገብ አልተገኘም' : 'No offline records found'}</p>
              <p className="text-xs text-slate-500">
                {isAmharic
                  ? 'በዚህ ብሮውዘር IndexedDB ማከማቻ ውስጥ ምንም የተቀመጠ ምዝገባ የለም።'
                  : 'There are no registrations cached in this browser’s IndexedDB.'}
              </p>
            </div>
          ) : (
            <div className="border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                        onChange={handleSelectAll}
                        className="rounded cursor-pointer"
                      />
                    </th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'መለያ ቁጥር' : 'ID'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ሙሉ ስም' : 'Full Name'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ስልክ ቁጥር' : 'Phone'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'የተመዘገበበት ቀን' : 'Created At'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] bg-white dark:bg-[#1C2434]">
                  {filteredRecords.map((r) => {
                    const isSelected = selectedIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => handleToggleSelect(r.id)}
                        className={`hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(r.id)}
                            className="rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {r.id}
                        </td>
                        <td className="p-2.5 font-medium text-slate-900 dark:text-white">
                          {r.fullName || '-'}
                        </td>
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-100">
                          {r.plateNumber || '-'}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600 dark:text-slate-300">
                          {r.phone || '-'}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">
                          {r.subCity || '-'}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              r.status === 'approved'
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                : r.status === 'pending_approval'
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : r.status === 'rejected'
                                ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {r.status || 'unknown'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                          {r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {isAmharic
              ? `አጠቃላይ የተገኙ፡ ${offlineRecords.length} | የተመረጡ፡ ${selectedIds.size}`
              : `Total found: ${offlineRecords.length} | Selected: ${selectedIds.size}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-sm bg-[#E2E8F0] hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-semibold transition-colors cursor-pointer"
          >
            {isAmharic ? 'ዝጋ' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
