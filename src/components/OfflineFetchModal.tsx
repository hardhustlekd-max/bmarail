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
  const [serverIds, setServerIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'pending'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const fetchOfflineAndServerRecords = async () => {
    setLoading(true);
    setRestoreMessage(null);
    try {
      // 1. Fetch current live server IDs to identify missing/deleted records
      let onlineIds = new Set<string>();
      try {
        const res = await fetch('/api/registrations');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.registrations)) {
            onlineIds = new Set(data.registrations.map((r: any) => r.id));
          }
        }
      } catch (e) {
        console.warn('Notice querying online server for comparison:', e);
      }
      setServerIds(onlineIds);

      // 2. Fetch all local records directly from IndexedDB
      let records = await asyncLoadRegistrations();
      if (records.length === 0) {
        try {
          const db = await getIndexedDb();
          if (db) {
            const raw = await db.getAll('registrations');
            if (Array.isArray(raw) && raw.length > 0) {
              records = raw as MotorcycleRegistration[];
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
      fetchOfflineAndServerRecords();
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const missingCount = offlineRecords.filter((r) => !serverIds.has(r.id)).length;
  const pendingCount = offlineRecords.filter((r) => r.status === 'pending_approval').length;

  const filteredRecords = offlineRecords.filter((r) => {
    const isMissingFromServer = !serverIds.has(r.id);

    if (filterMode === 'missing' && !isMissingFromServer) return false;
    if (filterMode === 'pending' && r.status !== 'pending_approval') return false;

    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      r.fullName?.toLowerCase().includes(s) ||
      r.plateNumber?.toLowerCase().includes(s) ||
      r.id?.toLowerCase().includes(s) ||
      r.phone?.toLowerCase().includes(s) ||
      r.subCity?.toLowerCase().includes(s)
    );
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

  // Upload single record to online DB
  const handleUploadSingleRecord = async (record: MotorcycleRegistration) => {
    setRestoringId(record.id);
    try {
      const res = await saveRegistrationToDb(record);
      if (res.success) {
        setServerIds((prev) => new Set([...prev, record.id]));
        setRestoreMessage(
          isAmharic
            ? `የ ${record.fullName} (${record.plateNumber}) መዝገብ በተሳካ ሁኔታ ወደ ኦንላይን ዳታቤዝ ተልኳል!`
            : `Record for ${record.fullName} (${record.plateNumber}) uploaded successfully to Online DB!`
        );
        onRestoreSuccess?.(1);
      } else {
        setRestoreMessage(
          isAmharic
            ? `መዝገቡን ወደ ኦንላይን ዳታቤዝ መላክ አልተሳካም፡ ${res.error || 'Error'}`
            : `Failed to upload record to Online DB: ${res.error || 'Error'}`
        );
      }
    } catch (err: any) {
      setRestoreMessage(err?.message || 'Upload failed');
    } finally {
      setRestoringId(null);
    }
  };

  // Upload selected or all missing records to online DB
  const handleBatchUploadToDatabase = async (uploadAllMissing: boolean = false) => {
    const targetRecords = uploadAllMissing
      ? offlineRecords.filter((r) => !serverIds.has(r.id))
      : offlineRecords.filter((r) => selectedIds.has(r.id));

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
          setServerIds((prev) => new Set([...prev, record.id]));
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
        ? `${successCount} መዝገቦች ወደ ኦንላይን ዳታቤዝ በተሳካ ሁኔታ ተላልፈዋል!${failCount > 0 ? ` (${failCount} አልተሳኩም)` : ''}`
        : `${successCount} records successfully uploaded to Online DB!${failCount > 0 ? ` (${failCount} failed)` : ''}`
    );

    if (successCount > 0) {
      onRestoreSuccess?.(successCount);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-[#1C2434] dark:text-[#DEE4EE]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between bg-[#F7F9FC] dark:bg-[#24303F]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">download_for_offline</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1C2434] dark:text-white">
                  {isAmharic ? 'የከመስመር ውጭ ዳታቤዝ መዝገቦች (bma_offline_db)' : 'Local Offline Cache (bma_offline_db)'}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono font-bold">
                  {offlineRecords.length} {isAmharic ? 'መዝገቦች' : 'records'}
                </span>
                {missingCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-bold flex items-center gap-1 animate-pulse">
                    <span className="material-symbols-outlined text-[13px]">cloud_off</span>
                    {missingCount} {isAmharic ? 'በኦንላይን DB የሌሉ' : 'missing from online DB'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#8A99AD] mt-0.5">
                {isAmharic
                  ? '100% ደህንነቱ የተጠበቀ፦ ምንም መዝገብ አይሰረዝም፤ በሌላ መሳሪያ ላይ የነበሩ መዝገቦችን ወደ ኦንላይን ዳታቤዝ በቀላሉ መላክ ይችላሉ'
                  : '100% Protected Zero-Wipe Cache: inspect and upload any local records back to the online database'}
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

        {/* Filter Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              filterMode === 'all'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">list</span>
            <span>{isAmharic ? 'ሁሉም የአካባቢ መዝገቦች' : 'All Local Records'} ({offlineRecords.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('missing')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              filterMode === 'missing'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">cloud_off</span>
            <span>{isAmharic ? 'በኦንላይን DB የሌሉ' : 'Missing from Online DB'} ({missingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('pending')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              filterMode === 'pending'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">pending_actions</span>
            <span>{isAmharic ? 'በመጠባበቅ ላይ (Pending)' : 'Pending Approval'} ({pendingCount})</span>
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 min-w-[240px] items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAmharic ? 'በስም፣ ሰሌዳ፣ ወይም መለያ ፈልግ...' : 'Search by name, plate, ID...'}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm text-[#1C2434] dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={fetchOfflineAndServerRecords}
              disabled={loading}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title={isAmharic ? 'እንደገና ጫን' : 'Refresh'}
            >
              <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>{isAmharic ? 'አድስ' : 'Refresh'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {missingCount > 0 && (
              <button
                type="button"
                onClick={() => handleBatchUploadToDatabase(true)}
                disabled={isRestoring}
                className="px-3.5 py-1.5 text-xs font-bold rounded-sm bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">cloud_sync</span>
                <span>
                  {isRestoring
                    ? (isAmharic ? 'እየተላከ ነው...' : 'Uploading...')
                    : isAmharic
                    ? `ሁሉንም የሌሉትን ወደ DB ላክ (${missingCount})`
                    : `Upload All Missing to Online DB (${missingCount})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleBatchUploadToDatabase(false)}
              disabled={selectedIds.size === 0 || isRestoring}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-sm flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedIds.size > 0 && !isRestoring
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:scale-95'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
              <span>
                {isRestoring
                  ? (isAmharic ? 'እየተላለፈ ነው...' : 'Uploading...')
                  : isAmharic
                  ? `የተመረጡትን ወደ DB ላክ (${selectedIds.size})`
                  : `Upload Selected to DB (${selectedIds.size})`}
              </span>
            </button>
          </div>
        </div>

        {/* Status / Alert Message */}
        {restoreMessage && (
          <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <span className="font-medium">{restoreMessage}</span>
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
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-3xl animate-spin text-blue-500">progress_activity</span>
              <p className="text-xs">{isAmharic ? 'ከ IndexedDB መረጃዎችን እያነበበ ነው...' : 'Reading from IndexedDB...'}</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">inbox</span>
              <p className="text-sm font-semibold">{isAmharic ? 'ምንም መዝገብ አልተገኘም' : 'No records match filter'}</p>
              <p className="text-xs text-slate-500">
                {isAmharic
                  ? 'በዚህ መስፈርት የተገኘ መዝገብ የለም።'
                  : 'No records found matching the active search or filter.'}
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
                    <th className="p-2.5 font-bold">{isAmharic ? 'የኦንላይን DB ሁኔታ' : 'Online DB State'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'መለያ ቁጥር' : 'ID'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ሙሉ ስም' : 'Full Name'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ስልክ' : 'Phone'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                    <th className="p-2.5 font-bold">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                    <th className="p-2.5 font-bold text-right">{isAmharic ? 'እርምጃ' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] bg-white dark:bg-[#1C2434]">
                  {filteredRecords.map((r) => {
                    const isSelected = selectedIds.has(r.id);
                    const isMissing = !serverIds.has(r.id);
                    const isThisRestoring = restoringId === r.id;

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
                        <td className="p-2.5">
                          {isMissing ? (
                            <span className="px-2 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <span className="material-symbols-outlined text-[13px]">cloud_off</span>
                              <span>{isAmharic ? 'በኦንላይን DB የለም' : 'Missing in DB'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              <span>{isAmharic ? 'በኦንላይን DB አለ' : 'Synced'}</span>
                            </span>
                          )}
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
                        <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleUploadSingleRecord(r)}
                            disabled={isThisRestoring || isRestoring}
                            className={`px-2.5 py-1 rounded-sm text-xs font-semibold flex items-center gap-1 ml-auto cursor-pointer transition-colors ${
                              isMissing
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-[#E2E8F0] dark:border-[#2E3A47]'
                            }`}
                            title={isAmharic ? 'ወደ ኦንላይን ዳታቤዝ ስቀል' : 'Upload to Online DB'}
                          >
                            <span className={`material-symbols-outlined text-[14px] ${isThisRestoring ? 'animate-spin' : ''}`}>
                              {isThisRestoring ? 'progress_activity' : 'cloud_upload'}
                            </span>
                            <span>{isAmharic ? 'ወደ DB ስቀል' : 'Upload to DB'}</span>
                          </button>
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
          <div className="flex items-center gap-3 text-slate-500">
            <span>
              {isAmharic
                ? `አጠቃላይ በአካባቢ የተገኙ፡ ${offlineRecords.length} | የተመረጡ፡ ${selectedIds.size}`
                : `Total Local Records: ${offlineRecords.length} | Selected: ${selectedIds.size}`}
            </span>
            {missingCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                ({missingCount} {isAmharic ? 'በኦንላይን DB የሉም' : 'missing on server'})
              </span>
            )}
          </div>
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
