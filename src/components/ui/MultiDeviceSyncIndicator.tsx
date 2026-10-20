import React, { useState, useRef, useEffect } from 'react';
import { useRealtimeSyncStatus } from '../../services/realtimeSync';

interface MultiDeviceSyncIndicatorProps {
  isAmharic?: boolean;
  compact?: boolean;
}

export const MultiDeviceSyncIndicator: React.FC<MultiDeviceSyncIndicatorProps> = ({
  isAmharic = true,
  compact = false,
}) => {
  const { status, isConnected, activeDevices, lastSyncTime, latencyMs, deviceId, forceSyncNow } =
    useRealtimeSyncStatus();

  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      await forceSyncNow();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return {
          bg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-500',
          ping: 'bg-emerald-400',
          label: isAmharic ? 'የቀጥታ ማመሳሰል' : 'Live Sync',
        };
      case 'connecting':
      case 'reconnecting':
        return {
          bg: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
          dot: 'bg-amber-500',
          ping: 'bg-amber-400',
          label: isAmharic ? 'በማገናኘት ላይ...' : 'Reconnecting...',
        };
      case 'dormant':
        return {
          bg: 'bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30',
          dot: 'bg-teal-400',
          ping: 'hidden',
          label: isAmharic ? 'ቆጣቢ እንቅልፍ' : 'Eco Sleep',
        };
      case 'offline':
      default:
        return {
          bg: 'bg-slate-500/10 dark:bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30',
          dot: 'bg-slate-400',
          ping: 'hidden',
          label: isAmharic ? 'ከመስመር ውጭ' : 'Offline Cache',
        };
    }
  };

  const cfg = getStatusColor();

  const formatLastSync = () => {
    if (!lastSyncTime) return isAmharic ? 'አሁን ተገናኝቷል' : 'Just connected';
    const secAgo = Math.max(0, Math.floor((Date.now() - lastSyncTime.getTime()) / 1000));
    if (secAgo < 5) return isAmharic ? 'አሁን' : 'Just now';
    if (secAgo < 60) return `${secAgo} ${isAmharic ? 'ሰከንዶች በፊት' : 's ago'}`;
    const minAgo = Math.floor(secAgo / 60);
    return `${minAgo} ${isAmharic ? 'ደቂቃ በፊት' : 'm ago'}`;
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer select-none active:scale-95 shadow-2xs ${cfg.bg}`}
        title={
          isAmharic
            ? `ባለብዙ-መሳሪያ ማመሳሰል፡ ${cfg.label} (${activeDevices} መሳሪያዎች)`
            : `Multi-Device Sync: ${cfg.label} (${activeDevices} active devices)`
        }
        aria-label="Multi-Device Sync Status"
      >
        {/* Animated Dot */}
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.ping}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
        </span>

        {/* Status text */}
        {!compact ? (
          <span className="truncate max-w-[130px] sm:max-w-none">
            {cfg.label}
            {isConnected && activeDevices > 1 && (
              <span className="ml-1 opacity-80 text-[10px]">
                ({activeDevices} {isAmharic ? 'መሳ.' : 'dev'})
              </span>
            )}
          </span>
        ) : (
          <span className="text-[10px] font-bold">
            {activeDevices > 1 ? `${activeDevices}D` : 'SSE'}
          </span>
        )}

        {/* Small chevron */}
        <span className="material-symbols-outlined text-[13px] opacity-70">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Popover Details Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-[#1C2434] border border-slate-200 dark:border-[#2E3A47] rounded-xl shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800 dark:text-[#DEE4EE]">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[19px]">devices</span>
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                {isAmharic ? 'ባለብዙ-መሳሪያ የቀጥታ ማመሳሰል' : 'Multi-Device Live Sync'}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg}`}
            >
              {cfg.label}
            </span>
          </div>

          {/* Stats Details Grid */}
          <div className="space-y-2 text-xs">
            {/* Active Devices */}
            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">group_work</span>
                {isAmharic ? 'የተገናኙ መሳሪያዎች' : 'Connected Devices'}
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100 font-mono">
                {activeDevices} {isAmharic ? 'መሳሪያዎች' : 'stations'}
              </span>
            </div>

            {/* Latency & Protocol */}
            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">speed</span>
                {isAmharic ? 'የግንኙነት ፍጥነት' : 'Stream Latency'}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-200 font-mono">
                {latencyMs > 0 ? `${latencyMs}ms (SSE)` : 'Active Stream'}
              </span>
            </div>

            {/* Last Synced */}
            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">update</span>
                {isAmharic ? 'የመጨረሻ ማመሳሰል' : 'Last Synced'}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {formatLastSync()}
              </span>
            </div>

            {/* Current Device ID */}
            <div className="py-1 px-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-[10.5px]">
              <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
                {isAmharic ? 'የዚህ መሳሪያ መለያ (Device ID)' : 'Current Device ID'}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300 truncate block select-all">
                {deviceId}
              </span>
            </div>

            {/* Serverless Free-Tier Eco Saver Notice */}
            <div className="py-1 px-2 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/40 text-[10px] text-teal-800 dark:text-teal-200 flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-teal-600 shrink-0 mt-0.5">eco</span>
              <span>
                {isAmharic
                  ? 'የሰርቨር ወጪ ቆጣቢ ሞድ፡ ታቡ ሲዘጋ ወይም ስራ ሲፈታ ሰርቨሩ እንዳይቃጠል ግንኙነቱ በራስ-ሰር ይተኛል። መስተጋብር ሲኖር ወዲያውኑ ይነሳል።'
                  : 'Railway Free-Tier Eco Mode: SSE hibernates during idle/hidden tabs to prevent burning compute credits. Resumes instantly on interaction.'}
              </span>
            </div>
          </div>

          {/* Quick Action: Force Refresh / Manual Sync */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              TanStack Query + SSE
            </span>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-[15px] ${
                  isRefreshing ? 'animate-spin' : ''
                }`}
              >
                refresh
              </span>
              <span>{isRefreshing ? (isAmharic ? 'በማመሳሰል ላይ...' : 'Syncing...') : (isAmharic ? 'አሁን አመሳስል' : 'Sync Now')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
