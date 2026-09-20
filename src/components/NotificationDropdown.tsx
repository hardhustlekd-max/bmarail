import React, { useState } from 'react';
import { Icon } from './ui/Icon';
import { ActiveHomePage } from './HomePage';

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time?: string;
  type: 'pending_approval' | 'unregistered_alert' | 'flagged_inspection' | 'pending_payment' | 'print_order' | 'info';
  icon: string;
  iconBg: string;
  badgeLabel: string;
  badgeBg: string;
  badgeText: string;
  actionPage?: ActiveHomePage;
  actionTab?: string;
}

interface NotificationDropdownProps {
  notifications: NotificationItem[];
  readIds: Set<string>;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onSelectNotification: (item: NotificationItem) => void;
  onQuickAction?: (item: NotificationItem) => void;
  onClose: () => void;
  isAmharic: boolean;
  isMobile?: boolean;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  readIds,
  onMarkAllAsRead,
  onClearAll,
  onSelectNotification,
  onQuickAction,
  onClose,
  isAmharic,
  isMobile = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'unread') {
      return !readIds.has(item.id);
    }
    return true;
  });

  return (
    <div
      className="flex flex-col bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-[#DEE4EE] select-none rounded-sm shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-slate-50/80 dark:bg-[#24303F]/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#3C50E0]/10 text-[#3C50E0] dark:bg-[#3C50E0]/20 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Icon className="material-symbols-outlined text-[18px]">notifications_active</Icon>
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-xs sm:text-sm tracking-tight truncate text-[#1C2434] dark:text-white">
              {isAmharic ? 'የስርዓት ማሳወቂያዎች' : 'System Notifications'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate">
              {unreadCount > 0
                ? isAmharic
                  ? `${unreadCount} ያልተነበቡ ማሳወቂያዎች`
                  : `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : isAmharic
                ? 'ሁሉም ተነበዋል'
                : 'All notifications caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkAllAsRead();
              }}
              className="px-2 py-1 rounded-sm text-[11px] font-bold text-[#3C50E0] dark:text-blue-400 hover:bg-[#3C50E0]/10 transition-colors flex items-center gap-1 cursor-pointer"
              title={isAmharic ? 'ሁሉንም አንብብ' : 'Mark all as read'}
            >
              <Icon className="material-symbols-outlined text-[15px]">done_all</Icon>
              <span className="hidden sm:inline">{isAmharic ? 'ሁሉንም አንብብ' : 'Mark read'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-7 h-7 rounded-sm text-slate-400 hover:text-[#1C2434] dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#2E3A47] transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <Icon className="material-symbols-outlined text-[18px]">close</Icon>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div 
        className="flex items-center gap-1 px-4 py-1.5 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-slate-100/60 dark:bg-[#1C2434] text-xs shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFilter('all');
          }}
          className={`px-3 py-1 rounded-sm font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
            filter === 'all'
              ? 'bg-[#3C50E0] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-[#1C2434] dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#2E3A47]'
          }`}
        >
          <span>{isAmharic ? 'ሁሉም' : 'All'}</span>
          <span className={`px-1.5 rounded-full text-[9px] ${filter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-[#2E3A47] text-slate-600 dark:text-slate-300'}`}>
            {notifications.length}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFilter('unread');
          }}
          className={`px-3 py-1 rounded-sm font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-[#3C50E0] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-[#1C2434] dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#2E3A47]'
          }`}
        >
          <span>{isAmharic ? 'ያልተነበቡ' : 'Unread'}</span>
          {unreadCount > 0 && (
            <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification List Body */}
      <div className="overflow-y-auto max-h-[360px] sm:max-h-[400px] divide-y divide-[#E2E8F0]/70 dark:divide-[#2E3A47]/70">
        {filteredNotifications.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-[#24303F] flex items-center justify-center text-slate-400 dark:text-slate-500">
              <Icon className="material-symbols-outlined text-[24px]">notifications_off</Icon>
            </div>
            <p className="text-xs font-extrabold text-[#1C2434] dark:text-white">
              {filter === 'unread'
                ? isAmharic
                  ? 'ምንም ያልተነበበ ማሳወቂያ የለም'
                  : 'No unread notifications'
                : isAmharic
                ? 'ምንም ማሳወቂያ የለም'
                : 'No notifications available'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              {isAmharic
                ? 'አዳዲስ ምዝገባዎች፣ የፍተሻ ማንቂያዎች ወይም ሪፖርቶች ሲኖሩ እዚህ ይዘረዘራሉ።'
                : 'New applications, inspection alerts, and reports will appear here.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => {
            const isRead = readIds.has(item.id);
            return (
              <div
                key={item.id}
                onClick={() => onSelectNotification(item)}
                className={`p-3 sm:p-3.5 flex items-start gap-3 transition-colors cursor-pointer group ${
                  isRead
                    ? 'hover:bg-slate-50 dark:hover:bg-[#24303F]/50 opacity-80 hover:opacity-100'
                    : 'bg-[#3C50E0]/5 dark:bg-[#3C50E0]/10 hover:bg-[#3C50E0]/10 dark:hover:bg-[#3C50E0]/15 border-l-4 border-[#3C50E0]'
                }`}
              >
                {/* Category Icon */}
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 shadow-2xs ${item.iconBg}`}
                >
                  <Icon className="material-symbols-outlined text-[20px]">{item.icon}</Icon>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-wider ${item.badgeBg} ${item.badgeText}`}>
                      {item.badgeLabel}
                    </span>
                    {item.time && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                        {item.time}
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-extrabold text-[#1C2434] dark:text-white group-hover:text-[#3C50E0] dark:group-hover:text-blue-400 transition-colors leading-tight line-clamp-1">
                    {item.title}
                  </h4>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal line-clamp-2">
                    {item.description}
                  </p>

                  {item.actionPage && (
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-[#3C50E0] dark:text-blue-400 opacity-90 group-hover:opacity-100">
                        <span>{isAmharic ? 'ለመመልከት ይጫኑ' : 'Click to view'}</span>
                        <Icon className="material-symbols-outlined text-[13px]">arrow_forward</Icon>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onQuickAction) {
                            onQuickAction(item);
                          } else {
                            onSelectNotification(item);
                          }
                        }}
                        className="px-2.5 py-1 rounded-sm text-[10px] font-bold bg-[#3C50E0] text-white hover:bg-blue-700 shadow-2xs transition-all cursor-pointer"
                      >
                        {isAmharic ? 'ክፈት' : 'Open'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Unread Indicator Dot */}
                {!isRead && (
                  <div className="w-2 h-2 rounded-full bg-[#3C50E0] shrink-0 mt-2 shadow-xs" title="Unread" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-2.5 bg-slate-50 dark:bg-[#24303F] border-t border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between shrink-0 text-xs">
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 px-2 py-1 rounded-sm hover:bg-rose-500/10"
          >
            <Icon className="material-symbols-outlined text-[14px]">delete_sweep</Icon>
            <span>{isAmharic ? 'ሁሉንም አጽዳ' : 'Clear all'}</span>
          </button>

          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
            {isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር' : 'Bahirdar Motorist Association'}
          </span>
        </div>
      )}
    </div>
  );
};
