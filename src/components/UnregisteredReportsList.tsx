import React, { useState } from 'react';
import { Icon } from './ui/Icon';
import { formatEthiopianDateTime } from '../utils/ethiopianCalendar';
import {
  Language,
  UserRole,
  UnregisteredVehicleReport,
  BAHIR_DAR_SUBCITIES,
} from '../types';
import { SmartImage } from './SmartImage';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { DataField } from './ui/StreamlinedUI';
import { LoadingSpinner } from './ui/Skeleton';

interface UnregisteredReportsListProps {
  lang: Language;
  userRole: UserRole;
  userBadgeId?: string;
  unregisteredReports: UnregisteredVehicleReport[];
  onUpdateStatus?: (id: string, status: UnregisteredVehicleReport['status'], resolutionNotes?: string) => Promise<void>;
  onNewReportClick?: () => void;
  onOpenRegisterForm?: (report: UnregisteredVehicleReport) => void;
  isLoading?: boolean;
}

export const UnregisteredReportsList: React.FC<UnregisteredReportsListProps> = ({
  lang,
  userRole,
  userBadgeId,
  unregisteredReports,
  onUpdateStatus,
  onNewReportClick,
  onOpenRegisterForm,
  isLoading = false,
}) => {
  const isAmharic = lang === 'am';

  if (isLoading) {
    return null;
  }

  const [searchTerm, setSearchTerm] = useState('');
  const [subCityFilter, setSubCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_investigation' | 'resolved' | 'registered'>('all');
  const [selectedReport, setSelectedReport] = useState<UnregisteredVehicleReport | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  const [resolutionInput, setResolutionInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Collapsible state for mobile
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});

  const toggleReportExpand = (id: string) => {
    setExpandedReportIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Status Counts
  const pendingCount = unregisteredReports.filter((r) => r.status === 'pending').length;
  const investigationCount = unregisteredReports.filter((r) => r.status === 'under_investigation').length;
  const resolvedCount = unregisteredReports.filter((r) => r.status === 'resolved').length;
  const registeredCount = unregisteredReports.filter((r) => r.status === 'registered').length;

  // Filtered list computation
  const filteredReports = unregisteredReports.filter((rep) => {
    const matchesSearch =
      (rep.plateNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.engineOrSerialNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.driverName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.driverPhone || '').includes(searchTerm) ||
      (rep.officerBadgeId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.officerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.locationName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.notes || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rep.id || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSubCity = subCityFilter === 'all' || rep.subCity === subCityFilter;
    const matchesStatus = statusFilter === 'all' || rep.status === statusFilter;

    return matchesSearch && matchesSubCity && matchesStatus;
  });

  // Calculate pagination slices
  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const paginatedReports = filteredReports.slice(startIndex, startIndex + pageSize);

  const handleStatusChange = async (newStatus: UnregisteredVehicleReport['status']) => {
    if (!selectedReport || !onUpdateStatus) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(selectedReport.id, newStatus, resolutionInput);
      setSelectedReport((prev) => prev ? { ...prev, status: newStatus, resolutionNotes: resolutionInput } : null);
      setResolutionInput('');
    } catch (err) {
      console.error('Failed to update report status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: UnregisteredVehicleReport['status']) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px]">check_circle</Icon>
            <span>{isAmharic ? 'ተፈቷል' : 'Resolved'}</span>
          </span>
        );
      case 'registered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-[#3C50E0]/10 text-[#3C50E0] border border-[#3C50E0]/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px]">how_to_reg</Icon>
            <span>{isAmharic ? 'ተመዝግቧል' : 'Registered'}</span>
          </span>
        );
      case 'under_investigation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-[#3C50E0]/10 text-[#3C50E0] border border-[#3C50E0]/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px]">search</Icon>
            <span>{isAmharic ? 'በምርመራ' : 'Investigating'}</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px]">report_problem</Icon>
            <span>{isAmharic ? 'አዲስ' : 'Pending'}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* SINGLE UNIFIED CONTAINER (TAILADMIN DESIGN) */}
      <div className="rounded-sm border border-[#E2E8F0] bg-white shadow-default dark:border-[#2E3A47] dark:bg-[#1C2434] overflow-hidden">
        {/* CONTAINER SECTION HEADER (TAILADMIN DESIGN) */}
        <div className="p-4 md:px-6 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1C2434] border-b border-[#E2E8F0] dark:border-[#2E3A47]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-sm bg-[#FB5454]/10 text-[#FB5454] flex items-center justify-center border border-[#FB5454]/20 shrink-0">
              <Icon className="material-symbols-outlined text-[20px]">policy</Icon>
            </div>
            <div>
              <h3 className="font-semibold text-base text-[#1C2434] dark:text-white">
                {isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry'}
              </h3>
            </div>
          </div>

          {onNewReportClick && (
            <button
              type="button"
              onClick={onNewReportClick}
              className="hidden sm:flex px-4 py-2 rounded-sm bg-[#3C50E0] hover:bg-opacity-90 text-white text-xs font-medium transition-all shadow-xs items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Icon className="material-symbols-outlined text-[16px]">add_alert</Icon>
              <span>{isAmharic ? 'አዲስ ሪፖርት ጨምር' : 'New Incident Report'}</span>
            </button>
          )}
        </div>

        {/* Sub-Filter Toolbar Container (TailAdmin Design) */}
        <div className="p-4 md:px-6 bg-[#F7F9FC] dark:bg-[#24303F] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 w-full max-w-full overflow-hidden border-b border-[#E2E8F0] dark:border-[#2E3A47]">
          {/* Live Search Input */}
          <div className="relative w-full lg:w-auto lg:flex-1 min-w-0 max-w-full lg:max-w-md">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#64748B] dark:text-[#8A99AD]">
              <Icon className="material-symbols-outlined text-[18px]">search</Icon>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={
                isAmharic
                  ? 'በሰሌዳ፣ አሽከርካሪ፣ ቦታ፣ ኦፊሰር ወይም መታወቂያ ፈልግ...'
                  : 'Search plate, driver, location, officer, ID...'
              }
              className="w-full rounded-sm border border-[#E2E8F0] bg-white py-2 pl-9 pr-8 text-xs text-[#1C2434] outline-none transition focus:border-[#3C50E0] active:border-[#3C50E0] dark:border-[#2E3A47] dark:bg-[#1C2434] dark:text-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute inset-y-0 right-2.5 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[16px]">close</Icon>
              </button>
            )}
          </div>

          {/* Status Filter Tabs & Sub-City Dropdown */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto max-w-full shrink-0">
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none max-w-full shrink-0">
              {[
                {
                  id: 'all' as const,
                  label: isAmharic ? 'ሁሉም' : 'All',
                  count: unregisteredReports.length,
                },
                {
                  id: 'pending' as const,
                  label: isAmharic ? 'አዲስ' : 'Pending',
                  count: pendingCount,
                },
                {
                  id: 'under_investigation' as const,
                  label: isAmharic ? 'በምርመራ' : 'Investigation',
                  count: investigationCount,
                },
                {
                  id: 'resolved' as const,
                  label: isAmharic ? 'የተፈታ' : 'Resolved',
                  count: resolvedCount,
                },
                {
                  id: 'registered' as const,
                  label: isAmharic ? 'የተመዘገበ' : 'Registered',
                  count: registeredCount,
                },
              ].map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-[#3C50E0] text-white shadow-xs'
                        : 'bg-white dark:bg-[#1C2434] text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white border border-[#E2E8F0] dark:border-[#2E3A47]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sub-City Filter Dropdown */}
            <select
              value={subCityFilter}
              onChange={(e) => {
                setSubCityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="py-1.5 px-3 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-white text-xs focus:border-[#3C50E0] outline-none cursor-pointer"
            >
              <option value="all">{isAmharic ? 'ሁሉም ክፍለ ከተሞች' : 'All Sub-Cities'}</option>
              {BAHIR_DAR_SUBCITIES.map((sc) => (
                <option key={sc.en} value={sc.en}>
                  {isAmharic ? sc.am : sc.en}
                </option>
              ))}
            </select>

            {/* Reset filter button if filtered */}
            {(searchTerm || statusFilter !== 'all' || subCityFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setSubCityFilter('all');
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-sm text-xs font-medium text-[#FB5454] hover:bg-[#FB5454]/10 transition-colors flex items-center gap-1 cursor-pointer border border-[#FB5454]/20"
              >
                <Icon className="material-symbols-outlined text-[16px]">restart_alt</Icon>
                <span>{isAmharic ? 'አጽዳ' : 'Reset'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Reports Data Table & Card Container */}
        <div>
        {filteredReports.length === 0 ? (
          <div className="p-16 text-center text-[#64748B] dark:text-[#8A99AD] space-y-3">
            <Icon className="material-symbols-outlined text-[48px] text-[#8A99AD]">report_off</Icon>
            <p className="font-semibold text-sm text-[#1C2434] dark:text-white">
              {isAmharic ? 'ምንም ያልተመዘገቡ ተሽከርካሪ ሪፖርቶች አልተገኙም' : 'No unregistered vehicle reports found.'}
            </p>
            <p className="text-xs text-[#64748B] dark:text-[#8A99AD] max-w-sm mx-auto">
              {isAmharic
                ? 'በቀረቡት ማጣሪያዎች መሠረት ምንም ሪፖርት አልተገኘም። እባክዎን ማጣሪያዎቹን ይቀይሩ።'
                : 'No incident reports match your current search criteria or status filters.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Data Table (TailAdmin Design with Standalone Columns) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-auto text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs uppercase font-semibold border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                    <th className="py-4 px-3 text-center w-12 font-medium">#</th>
                    <th className="py-4 px-3 text-center font-medium">{isAmharic ? 'ፎቶ' : 'Photo'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'የሪፖርት #' : 'Report ID'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'የተዘገበበት ቀን' : 'Reported Date'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</th>
                    <th className="py-4 px-4 font-medium">{isAmharic ? 'አሽከርካሪ / ተጠርጣሪ' : 'Driver / Suspect'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'ዝርዝር ቦታ' : 'Location'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'የኦፊሰር ባጅ' : 'Officer Badge'}</th>
                    <th className="py-4 px-3 font-medium">{isAmharic ? 'የኦፊሰር ስም' : 'Officer Name'}</th>
                    <th className="py-4 px-3 text-center font-medium">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                    <th className="py-4 px-4 text-right font-medium">{isAmharic ? 'ተግባር' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">
                  {paginatedReports.map((rep, idx) => (
                    <tr key={rep.id} className="hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/50 transition-colors border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                      {/* 1. Standalone Index */}
                      <td className="py-4 px-3 text-center font-mono font-medium text-[#64748B] dark:text-[#8A99AD] text-xs">
                        {startIndex + idx + 1}
                      </td>

                      {/* 2. Standalone Evidence Photo */}
                      <td className="py-4 px-3 text-center">
                        <div
                          onClick={() => rep.evidencePhoto && setZoomedImage({ url: rep.evidencePhoto, title: rep.id })}
                          className="w-10 h-10 rounded-sm overflow-hidden border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] shrink-0 cursor-pointer group relative shadow-2xs mx-auto"
                        >
                          <SmartImage
                            src={rep.evidencePhoto}
                            alt="Evidence"
                            fallbackIcon="two_wheeler"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                        </div>
                      </td>

                      {/* 3. Standalone Report ID */}
                      <td className="py-4 px-3 font-mono font-medium text-[#3C50E0] whitespace-nowrap">
                        {rep.id}
                      </td>

                      {/* 4. Standalone Reported Date */}
                      <td className="py-4 px-3 whitespace-nowrap text-xs text-[#1C2434] dark:text-white">
                        {rep.reportedAt ? formatEthiopianDateTime(rep.reportedAt, isAmharic ? 'am' : 'en') : '—'}
                      </td>

                      {/* 5. Standalone Plate Number */}
                      <td className="py-4 px-3 whitespace-nowrap">
                        {rep.plateNumber ? (
                          <span className="font-mono font-semibold text-xs px-2.5 py-1 rounded-sm bg-[#3C50E0]/10 text-[#3C50E0] border border-[#3C50E0]/20 inline-block shadow-2xs">
                            {rep.plateNumber}
                          </span>
                        ) : (
                          <span className="text-[#FB5454] font-medium text-xs">[ሰሌዳ የለውም]</span>
                        )}
                      </td>

                      {/* 6. Standalone Driver / Suspect */}
                      <td className="py-4 px-4">
                        <div className="font-semibold text-[#1C2434] dark:text-white">
                          {rep.driverName || '—'}
                        </div>
                        {rep.driverPhone && (
                          <div className="text-[11px] font-mono text-[#64748B] dark:text-[#8A99AD]">
                            {rep.driverPhone}
                          </div>
                        )}
                      </td>

                      {/* 7. Standalone Sub-City */}
                      <td className="py-4 px-3 whitespace-nowrap font-medium text-[#1C2434] dark:text-white">
                        {rep.subCity}
                      </td>

                      {/* 8. Standalone Location */}
                      <td className="py-4 px-3 text-xs text-[#64748B] dark:text-[#8A99AD] max-w-[140px] truncate">
                        {rep.locationName}
                      </td>

                      {/* 9. Standalone Officer Badge */}
                      <td className="py-4 px-3 font-mono font-medium text-xs text-[#1C2434] dark:text-white whitespace-nowrap">
                        {rep.officerBadgeId}
                      </td>

                      {/* 10. Standalone Officer Name */}
                      <td className="py-4 px-3 text-xs text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                        {rep.officerName || 'Patrol Officer'}
                      </td>

                      {/* 11. Standalone Status */}
                      <td className="py-4 px-3 text-center whitespace-nowrap">{getStatusBadge(rep.status)}</td>

                      {/* 12. Standalone Actions */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedReport(rep)}
                          className="px-3 py-1.5 rounded-sm bg-[#3C50E0] hover:bg-opacity-90 text-white text-xs font-medium transition-all cursor-pointer shadow-xs inline-flex items-center gap-1"
                        >
                          <Icon className="material-symbols-outlined text-[16px]">visibility</Icon>
                          <span>{isAmharic ? 'ዝርዝር' : 'View Details'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (shown on screens < md) */}
            <div className="block md:hidden divide-y divide-outline-variant">
              {paginatedReports.map((rep) => {
                const isExpanded = !!expandedReportIds[rep.id];
                return (
                  <div key={rep.id} className="p-4 hover:bg-surface-container-low/50 transition-colors space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          onClick={() => rep.evidencePhoto && setZoomedImage({ url: rep.evidencePhoto, title: rep.id })}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-outline-variant bg-surface-container shrink-0 cursor-pointer relative shadow-2xs"
                        >
                          <SmartImage
                            src={rep.evidencePhoto}
                            alt="Evidence"
                            fallbackIcon="two_wheeler"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-mono font-black text-xs text-on-surface">{rep.plateNumber || '[ሰሌዳ የለውም]'}</p>
                          <p className="font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400">{rep.id}</p>
                          <p className="text-[10px] text-secondary">{rep.reportedAt}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {getStatusBadge(rep.status)}
                        <button
                          type="button"
                          onClick={() => toggleReportExpand(rep.id)}
                          className="p-1 rounded-md text-secondary hover:text-on-surface cursor-pointer"
                        >
                          <Icon className="material-symbols-outlined text-[20px]">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </Icon>
                        </button>
                      </div>
                    </div>

                    {/* Expanded Mobile Details */}
                    <div className={`${isExpanded ? 'block' : 'hidden'} pt-2 border-t border-outline-variant/50 space-y-2 text-xs`}>
                      <div className="grid grid-cols-2 gap-2">
                        <DataField label={isAmharic ? 'አሽከርካሪ:' : 'Driver:'} value={rep.driverName || '—'} />
                        <DataField label={isAmharic ? 'ስልክ:' : 'Phone:'} value={rep.driverPhone || '—'} isMono />
                        <DataField label={isAmharic ? 'ክፍለ ከተማ:' : 'Sub-City:'} value={rep.subCity} />
                        <DataField label={isAmharic ? 'ቦታ:' : 'Location:'} value={rep.locationName} />
                      </div>

                      {rep.notes && (
                        <div className="p-2.5 bg-surface-container-low rounded-lg">
                          <span className="text-[10px] font-bold text-secondary uppercase block mb-0.5">
                            {isAmharic ? 'ማስታወሻ:' : 'Notes:'}
                          </span>
                          <p className="text-xs text-on-surface leading-relaxed">{rep.notes}</p>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedReport(rep)}
                          className="w-full py-2 rounded-lg bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Icon className="material-symbols-outlined text-[16px]">visibility</Icon>
                          <span>{isAmharic ? 'ሙሉ ዝርዝር ይመልከቱ' : 'View Full Details'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls Bar (TailAdmin Design) */}
            <div className="bg-white dark:bg-[#1C2434] px-4 sm:px-6 py-4 flex flex-row items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#8A99AD] border-t border-[#E2E8F0] dark:border-[#2E3A47]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#1C2434] dark:text-white">{isAmharic ? 'በአንድ ገጽ:' : 'Rows per page:'}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs focus:border-[#3C50E0] outline-none cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="hidden sm:inline font-medium text-[#64748B] dark:text-[#8A99AD]">
                  {isAmharic
                    ? `${startIndex + 1}-${Math.min(startIndex + pageSize, totalItems)} ከ ${totalItems} መዝገቦች`
                    : `Showing ${startIndex + 1}–${Math.min(startIndex + pageSize, totalItems)} of ${totalItems} entries`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={activePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Icon className="material-symbols-outlined text-[16px]">chevron_left</Icon>
                  <span>{isAmharic ? 'ቀዳሚ' : 'Previous'}</span>
                </button>

                <span className="px-3 py-1.5 bg-[#3C50E0] text-white rounded-sm font-semibold font-mono text-xs shadow-xs">
                  {activePage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={activePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                  <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                </button>
              </div>
            </div>
          </>
        )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <div className="flex items-center gap-2.5">
                <Icon className="material-symbols-outlined text-amber-600 text-[24px]">report_problem</Icon>
                <div>
                  <h3 className="font-black text-sm text-on-surface uppercase tracking-wider">
                    {isAmharic ? 'የባልተመዘገበ ተሽከርካሪ ሪፖርት ዝርዝር' : 'Unregistered Vehicle Report Details'}
                  </h3>
                  <p className="text-[11px] text-secondary font-mono">{selectedReport.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                <p className="text-[10px] font-bold text-secondary uppercase">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</p>
                <p className="font-mono font-black text-sm text-on-surface">{selectedReport.plateNumber || 'Unplated'}</p>
              </div>

              <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                <p className="text-[10px] font-bold text-secondary uppercase">{isAmharic ? 'የቻሲስ ቁጥር' : 'Chasis'}</p>
                <p className="font-mono font-black text-sm text-on-surface">{selectedReport.chassisNumber || (selectedReport.engineOrSerialNo && selectedReport.engineOrSerialNo !== 'N/A' ? selectedReport.engineOrSerialNo : '') || selectedReport.engineOrSerialNo || '—'}</p>
              </div>

              <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                <p className="text-[10px] font-bold text-secondary uppercase">{isAmharic ? 'አሽከርካሪ / ስልክ' : 'Driver / Phone'}</p>
                <p className="font-bold text-on-surface">{selectedReport.driverName || '—'}</p>
                <p className="text-secondary">{selectedReport.driverPhone || '—'}</p>
              </div>

              <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                <p className="text-[10px] font-bold text-secondary uppercase">{isAmharic ? 'ክፍለ ከተማ / ቦታ' : 'Sub-City & Location'}</p>
                <p className="font-bold text-on-surface">{selectedReport.subCity}</p>
                <p className="text-secondary">{selectedReport.locationName}</p>
              </div>
            </div>

            {/* Notes & Evidence Photo */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-secondary uppercase">{isAmharic ? 'የኦፊሰር ማብራሪያ' : 'Officer Field Notes'}</p>
              <p className="p-3 rounded-lg bg-surface-container-low text-on-surface text-xs leading-relaxed font-medium border border-outline-variant/50">
                {selectedReport.notes}
              </p>
            </div>

            {selectedReport.evidencePhoto && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-secondary uppercase">{isAmharic ? 'የማስረጃ ፎቶ' : 'Evidence Photo'}</p>
                <div
                  onClick={() => setZoomedImage({ url: selectedReport.evidencePhoto!, title: selectedReport.id })}
                  className="h-44 rounded-lg overflow-hidden border border-outline-variant bg-surface-container cursor-pointer group relative shadow-2xs"
                >
                  <img src={selectedReport.evidencePhoto} alt="Evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Icon className="material-symbols-outlined text-[24px]">zoom_in</Icon>
                  </div>
                </div>
              </div>
            )}

            {/* Status Update Actions */}
            {onUpdateStatus && (
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3 pt-3">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-300">
                  {isAmharic ? 'የሪፖርቱን ሁኔታ ይለውጡ' : 'Update Incident Status'}
                </p>

                <input
                  type="text"
                  value={resolutionInput}
                  onChange={(e) => setResolutionInput(e.target.value)}
                  placeholder={
                    isAmharic
                      ? 'የማስተካከያ/የመፍትሔ ማስታወሻ ያስገቡ...'
                      : 'Add resolution notes or permit registration reference...'
                  }
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-on-surface text-xs outline-none"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleStatusChange('under_investigation')}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-all disabled:opacity-50 shadow-2xs"
                  >
                    {isAmharic ? 'በምርመራ ላይ አድርግ' : 'Mark Under Investigation'}
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleStatusChange('resolved')}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-all disabled:opacity-50 shadow-2xs"
                  >
                    {isAmharic ? 'ተፈቷል በል' : 'Mark Resolved'}
                  </button>

                  {onOpenRegisterForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReport(null);
                        onOpenRegisterForm(selectedReport);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Icon className="material-symbols-outlined text-[16px]">how_to_reg</Icon>
                      <span>{isAmharic ? 'ወደ ምዝገባ ቀይር' : 'Convert to Registration'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setZoomedImage(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl">
            <ZoomableDocumentContainer
              lang={lang}
              title={zoomedImage.title}
              onClose={() => setZoomedImage(null)}
              requireClerkRequest={false}
            >
              <img
                src={zoomedImage.url}
                alt={zoomedImage.title}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </ZoomableDocumentContainer>
          </div>
        </div>
      )}
    </div>
  );
};

