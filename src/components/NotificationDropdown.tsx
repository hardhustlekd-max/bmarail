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
      className="flex flex-col bg-surface-container-lowest text-on-surface select-none"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-3 border-b border-outline-variant/70 bg-surface-container/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="material-symbols-outlined text-[18px]">notifications</Icon>
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-xs sm:text-sm tracking-tight truncate">
              {isAmharic ? 'የስርዓት ማሳወቂያዎች' : 'System Notifications'}
            </h3>
            <p className="text-[10px] text-secondary font-medium truncate">
              {unreadCount > 0
                ? isAmharic
                  ? `${unreadCount} ያልተነበቡ ማሳወቂያዎች`
                  : `${unreadCount} unread notifications`
                : isAmharic
                ? 'ሁሉም ተነበዋል'
                : 'All caught up'}
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
              className="px-2 py-1 rounded-md text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 cursor-pointer"
              title={isAmharic ? 'ሁሉንም አንብብ' : 'Mark all as read'}
            >
              <Icon className="material-symbols-outlined text-[15px]">done_all</Icon>
              <span className="hidden sm:inline">{isAmharic ? 'ሁሉንም አንብብ' : 'Mark all read'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-7 h-7 rounded-md text-secondary hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <Icon className="material-symbols-outlined text-[18px]">close</Icon>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div 
        className="flex items-center gap-1 px-3.5 sm:px-4 py-1.5 border-b border-outline-variant/40 bg-surface-container-low/50 text-xs shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFilter('all');
          }}
          className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
            filter === 'all'
              ? 'bg-primary text-white shadow-2xs'
              : 'text-secondary hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span>{isAmharic ? 'ሁሉም' : 'All'}</span>
          <span className={`px-1 rounded-full text-[9px] ${filter === 'all' ? 'bg-white/25 text-white' : 'bg-surface-container-high text-secondary'}`}>
            {notifications.length}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFilter('unread');
          }}
          className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-primary text-white shadow-2xs'
              : 'text-secondary hover:text-on-surface hover:bg-surface-container'
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
      <div className="overflow-y-auto max-h-[360px] sm:max-h-[400px] divide-y divide-outline-variant/40">
        {filteredNotifications.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-surface-container flex items-center justify-center text-secondary">
              <Icon className="material-symbols-outlined text-[24px]">notifications_off</Icon>
            </div>
            <p className="text-xs font-bold text-on-surface">
              {filter === 'unread'
                ? isAmharic
                  ? 'ምንም ያልተነበበ ማሳወቂያ የለም'
                  : 'No unread notifications'
                : isAmharic
                ? 'ምንም ማሳወቂያ የለም'
                : 'No notifications available'}
            </p>
            <p className="text-[11px] text-secondary max-w-xs mx-auto">
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
                    ? 'hover:bg-surface-container/50 opacity-80 hover:opacity-100'
                    : 'bg-primary/5 hover:bg-primary/10 border-l-3 border-primary'
                }`}
              >
                {/* Category Icon */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${item.iconBg}`}
                >
                  <Icon className="material-symbols-outlined text-[20px]">{item.icon}</Icon>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${item.badgeBg} ${item.badgeText}`}>
                      {item.badgeLabel}
                    </span>
                    {item.time && (
                      <span className="text-[10px] text-secondary font-mono shrink-0">
                        {item.time}
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-extrabold text-on-surface group-hover:text-primary transition-colors leading-tight line-clamp-1">
                    {item.title}
                  </h4>

                  <p className="text-[11px] text-secondary leading-normal line-clamp-2">
                    {item.description}
                  </p>

                  {item.actionPage && (
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-primary opacity-90 group-hover:opacity-100">
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
                        className="px-2 py-0.5 rounded text-[10px] font-black bg-primary text-white hover:bg-primary/90 shadow-2xs transition-all cursor-pointer"
                      >
                        {isAmharic ? 'ክፈት' : 'Open'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Unread Indicator Dot */}
                {!isRead && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2 shadow-xs" title="Unread" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-2.5 bg-surface-container-low/60 border-t border-outline-variant/60 flex items-center justify-between shrink-0 text-xs">
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-bold text-secondary hover:text-rose-600 transition-colors cursor-pointer flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-500/10"
          >
            <Icon className="material-symbols-outlined text-[14px]">delete_sweep</Icon>
            <span>{isAmharic ? 'ሁሉንም አጽዳ' : 'Clear all'}</span>
          </button>

          <span className="text-[10px] text-secondary font-medium">
            {isAmharic ? 'የባህር ዳር ማዘጋጃ ቤት' : 'Bahir Dar Municipality'}
          </span>
        </div>
      )}
    </div>
  );
};
