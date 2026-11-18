import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './ui/Icon';
import { BaseModal } from './ui/BaseModal';
import {
  TACTILE_SPRING,
  TAP_SCALE,
  POPOVER_TRANSITION,
  BACKDROP_VARIANTS,
} from '../utils/motionPresets';
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
import { UnifiedWorkspaceCard, TabList } from './ui/AssocDesignSystem';

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

  const [searchTerm, setSearchTerm] = useState('');
  const [subCityFilter, setSubCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_investigation' | 'resolved' | 'registered'>('all');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [sortField, setSortField] = useState<'date' | 'plate' | 'driver'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const hasActiveSecondaryFilters = Boolean(subCityFilter !== 'all' || sortField !== 'date' || sortOrder !== 'desc' || searchTerm.trim());
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

  // Status Counts in a single fast pass
  const { pendingCount, investigationCount, resolvedCount, registeredCount } = useMemo(() => {
    let pending = 0;
    let investigation = 0;
    let resolved = 0;
    let registered = 0;
    unregisteredReports.forEach((r) => {
      if (r.status === 'pending') pending++;
      else if (r.status === 'under_investigation') investigation++;
      else if (r.status === 'resolved') resolved++;
      else if (r.status === 'registered') registered++;
    });
    return {
      pendingCount: pending,
      investigationCount: investigation,
      resolvedCount: resolved,
      registeredCount: registered,
    };
  }, [unregisteredReports]);

  // Filtered list computation
  const filteredReports = useMemo(() => {
    return unregisteredReports.filter((rep) => {
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
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = (a.reportedAt || '').localeCompare(b.reportedAt || '');
      } else if (sortField === 'plate') {
        comparison = (a.plateNumber || '').localeCompare(b.plateNumber || '');
      } else if (sortField === 'driver') {
        comparison = (a.driverName || '').localeCompare(b.driverName || '');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [unregisteredReports, searchTerm, subCityFilter, statusFilter, sortField, sortOrder]);

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
            <Icon className="material-symbols-outlined text-13">check_circle</Icon>
            <span>{isAmharic ? 'ተፈቷል' : 'Resolved'}</span>
          </span>
        );
      case 'registered':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13">how_to_reg</Icon>
            <span>{isAmharic ? 'ተመዝግቧል' : 'Registered'}</span>
          </span>
        );
      case 'under_investigation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13">search</Icon>
            <span>{isAmharic ? 'በምርመራ' : 'Investigating'}</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13">report_problem</Icon>
            <span>{isAmharic ? 'አዲስ' : 'Pending'}</span>
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 pb-3">
      <UnifiedWorkspaceCard
        header={
          <div className="flex flex-row items-center justify-between gap-2 bg-white dark:bg-[#1C2434] px-3 sm:px-5 py-2 sm:py-2.5 w-full max-w-full min-w-0">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-xs">
                <Icon className="material-symbols-outlined text-icon-lg shrink-0">policy</Icon>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-xs sm:text-base text-[#1C2434] dark:text-white tracking-tight leading-none mb-0.5 truncate">
                  {isAmharic ? 'የህገወጥ ሞተሮች ማህደር' : 'Unregistered Motors Registry'}
                </h3>
                <p className="text-11 text-[#64748B] dark:text-[#8A99AD] font-medium hidden sm:block truncate">
                  {isAmharic ? 'ከምዝገባ ውጭ የተገኙ ተሽከርካሪዎች እና የኦፊሰር ሪፖርቶች' : 'Ledger of unauthorized vehicles and officer incident reports'}
                </p>
              </div>
            </div>

            {onNewReportClick && (
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={onNewReportClick}
                className="inline-flex items-center justify-center min-h-[34px] sm:min-h-[var(--ui-control-h-sm)] gap-1 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold border-0 shadow-none hover:shadow-none transition-colors duration-150 cursor-pointer touch-manipulation whitespace-nowrap shrink-0"
                title={isAmharic ? 'አዲስ ሪፖርት' : 'New Report'}
              >
                <Icon className="material-symbols-outlined text-icon-sm shrink-0">add_alert</Icon>
                <span className="whitespace-nowrap shrink-0">{isAmharic ? 'አዲስ' : 'New'}</span>
              </motion.button>
            )}
          </div>
        }
        tabs={
          <TabList
            variant="flush"
            activeTab={statusFilter}
            onChange={(id) => {
              setStatusFilter(id as any);
              setCurrentPage(1);
            }}
            tabs={[
              {
                id: 'all',
                label: isAmharic ? 'ሁሉም' : 'All',
                count: unregisteredReports.length,
              },
              {
                id: 'pending',
                label: isAmharic ? 'አዲስ' : 'Pending',
                count: pendingCount,
              },
              {
                id: 'under_investigation',
                label: isAmharic ? 'በምርመራ' : 'Investigation',
                count: investigationCount,
              },
              {
                id: 'resolved',
                label: isAmharic ? 'የተፈታ' : 'Resolved',
                count: resolvedCount,
              },
              {
                id: 'registered',
                label: isAmharic ? 'የተመዘገበ' : 'Registered',
                count: registeredCount,
              },
            ]}
          />
        }
        toolbar={
          <div className="flex flex-col w-full bg-[#F7F9FC] dark:bg-[#24303F] border-b border-[#E2E8F0] dark:border-[#2E3A47]">
            {/* TIER 1: PRIMARY TOOLBAR */}
            <div className="px-2.5 sm:px-4 py-2 flex items-center justify-end gap-2 w-full max-w-full min-w-0">
              {/* Filter Drawer Toggle Button */}
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen((prev) => !prev)}
                className={`h-[34px] px-2.5 rounded-md border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap select-none ${
                  isFilterDrawerOpen || hasActiveSecondaryFilters
                    ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:border-primary'
                    : 'border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] text-[#64748B] dark:text-[#DEE4EE] hover:text-[#1C2434] dark:hover:text-white'
                }`}
                title={isAmharic ? 'ተጨማሪ ማጣሪያዎች' : 'Filter & Sort'}
              >
                <Icon className="material-symbols-outlined text-icon-sm shrink-0">tune</Icon>
                <span className="hidden xs:inline whitespace-nowrap">{isAmharic ? 'ማጣሪያ' : 'Filters'}</span>
                {hasActiveSecondaryFilters && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                )}
              </button>
            </div>

            {/* TIER 2: COLLAPSIBLE SECONDARY FILTER DRAWER */}
            <AnimatePresence>
              {isFilterDrawerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={POPOVER_TRANSITION}
                  className="px-3 sm:px-4 py-2.5 bg-[#F8FAFC] dark:bg-[#1A222C] border-t border-[#E2E8F0] dark:border-[#2E3A47] space-y-2.5 w-full max-w-full min-w-0"
                >
                  {/* Search Bar inside Expandable Filter Section */}
                  <div className="relative w-full max-w-md min-w-0">
                    <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-[#64748B] dark:text-[#8A99AD]">
                      <Icon className="material-symbols-outlined text-icon-sm">search</Icon>
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
                          ? 'በሰሌዳ፣ አሽከርካሪ፣ ቦታ ወይም ኦፊሰር ፈልግ...'
                          : 'Search plate, driver, location, officer...'
                      }
                      className="w-full h-[34px] pl-8 pr-8 bg-white dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md text-xs text-[#1C2434] dark:text-white placeholder-[#8A99AD] focus:border-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setCurrentPage(1);
                        }}
                        className="absolute inset-y-0 right-2 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
                        title={isAmharic ? 'ፍለጋውን አጽዳ' : 'Clear search'}
                      >
                        <Icon className="material-symbols-outlined text-icon-sm">close</Icon>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 text-xs w-full min-w-0">
                  {/* Sub-City Filter */}
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    <span className="text-[#64748B] dark:text-[#8A99AD] text-11 font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">
                      {isAmharic ? 'ክ/ከተማ:' : 'SubCity:'}
                    </span>
                    <select
                      value={subCityFilter}
                      onChange={(e) => {
                        setSubCityFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="h-[34px] py-1 px-2.5 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs font-semibold focus:border-primary outline-none cursor-pointer min-w-0 max-w-full flex-1 sm:flex-initial truncate"
                    >
                      <option value="all">{isAmharic ? 'ሁሉም ክፍለ ከተሞች' : 'All Sub-Cities'}</option>
                      {BAHIR_DAR_SUBCITIES.map((sc) => (
                        <option key={sc.en} value={sc.en}>
                          {isAmharic ? sc.am : sc.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sort Field */}
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    <span className="text-[#64748B] dark:text-[#8A99AD] text-11 font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">
                      {isAmharic ? 'ቅደም ተከተል:' : 'Sort:'}
                    </span>
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as any)}
                      className="h-[34px] py-1 px-2.5 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs font-semibold focus:outline-none focus:border-primary cursor-pointer min-w-0 max-w-full flex-1 sm:flex-initial truncate"
                    >
                      <option value="date">{isAmharic ? 'በሪፖርት ቀን' : 'Report Date'}</option>
                      <option value="plate">{isAmharic ? 'በሰሌዳ ቁጥር' : 'Plate No'}</option>
                      <option value="driver">{isAmharic ? 'በአሽከርካሪ ስም' : 'Driver Name'}</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="h-[34px] px-2 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                      title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      <Icon className="material-symbols-outlined text-15 shrink-0">
                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </Icon>
                    </button>
                  </div>

                  {/* Reset All Filters in Drawer */}
                  {(hasActiveSecondaryFilters || searchTerm || statusFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubCityFilter('all');
                        setSortField('date');
                        setSortOrder('desc');
                        setSearchTerm('');
                        setStatusFilter('all');
                        setCurrentPage(1);
                      }}
                      className="h-[34px] px-2.5 rounded-md text-xs font-bold text-[#FB5454] bg-[#FB5454]/10 hover:bg-[#FB5454]/20 transition-colors flex items-center gap-1 cursor-pointer border border-[#FB5454]/20 shadow-2xs shrink-0 whitespace-nowrap ms-auto"
                    >
                      <Icon className="material-symbols-outlined text-icon-xs shrink-0">restart_alt</Icon>
                      <span>{isAmharic ? 'ሁሉንም አጽዳ' : 'Reset All'}</span>
                    </button>
                  )}
                </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
      >

        {/* Reports Data Table & Card Container */}
        <div>
        {filteredReports.length === 0 ? (
          <div className="p-16 text-center text-[#64748B] dark:text-[#8A99AD] space-y-3">
            <Icon className="material-symbols-outlined text-[length:calc(48px*var(--ui-scale))] text-[#8A99AD]">report_off</Icon>
            <p className="font-semibold text-sm text-[#1C2434] dark:text-white">
              {isAmharic ? 'ምንም ያልተመዘገቡ ተሽከርካሪ ሪፖርቶች አልተገኙም' : 'No unregistered vehicle reports found.'}
            </p>
            <p className="text-xs text-[#64748B] dark:text-[#8A99AD] max-w-sm mx-auto">
              {isAmharic
                ? 'ምንም ሪፖርት አልተገኘም።'
                : 'No incident reports found for current filters.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col min-h-[calc(460px*var(--ui-scale))] justify-between">
            {/* Desktop Data Table (TailAdmin Design with Fixed Width & Core Columns) */}
            <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-[calc(420px*var(--ui-scale))] max-h-[calc(100vh-270px)] [scrollbar-gutter:stable] scrollbar-thin flex-1">
              <table className="w-full text-left border-collapse text-xs table-fixed">
                <thead>
                  <tr className="bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs font-semibold border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                    <th className="py-3 px-3 text-center w-12 font-medium">#</th>
                    <th className="py-3 px-2 text-center w-12 font-medium">{isAmharic ? 'ፎቶ' : 'Photo'}</th>
                    <th className="py-3 px-3 font-medium w-36 whitespace-nowrap">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</th>
                    <th className="py-3 px-3 font-medium min-w-[calc(180px*var(--ui-scale))]">{isAmharic ? 'አሽከርካሪ / ተጠርጣሪ' : 'Driver / Suspect'}</th>
                    <th className="py-3 px-3 font-medium w-40 truncate">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                    <th className="py-3 px-3 text-center w-32 font-medium whitespace-nowrap">{isAmharic ? 'ሁኔታ' : 'Status'}</th>
                    <th className="py-3 px-3 text-right w-32 font-medium whitespace-nowrap">{isAmharic ? 'ተግባር' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">
                  {paginatedReports.map((rep, idx) => (
                    <tr
                      key={rep.id}
                      onClick={() => setSelectedReport(rep)}
                      className="hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/50 transition-colors border-b border-[#E2E8F0] dark:border-[#2E3A47] cursor-pointer"
                    >
                      {/* Index */}
                      <td className="py-3 px-3 text-center font-mono font-medium text-[#64748B] dark:text-[#8A99AD] text-xs w-12">
                        {startIndex + idx + 1}
                      </td>

                      {/* Photo Thumbnail */}
                      <td className="py-3 px-2 text-center w-12" onClick={(e) => e.stopPropagation()}>
                        <div
                          onClick={() => rep.evidencePhoto && setZoomedImage({ url: rep.evidencePhoto, title: rep.id })}
                          className="w-9 h-9 rounded-sm overflow-hidden border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] shrink-0 cursor-pointer group relative shadow-2xs mx-auto"
                        >
                          <SmartImage
                            src={rep.evidencePhoto}
                            alt="Evidence"
                            fallbackIcon="two_wheeler"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                        </div>
                      </td>

                      {/* Plate Number / ID */}
                      <td className="py-3 px-3 whitespace-nowrap w-36">
                        {rep.plateNumber ? (
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 inline-block">
                            {rep.plateNumber}
                          </span>
                        ) : (
                          <span className="font-mono font-bold text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded">
                            {rep.id}
                          </span>
                        )}
                      </td>

                      {/* Driver Name & Phone */}
                      <td className="py-3 px-3 overflow-hidden min-w-[calc(180px*var(--ui-scale))]">
                        <div className="font-semibold text-[#1C2434] dark:text-white break-words leading-snug" title={rep.driverName || '—'}>
                          {rep.driverName || '—'}
                        </div>
                        {rep.driverPhone && (
                          <div className="text-11 font-mono text-[#64748B] dark:text-[#8A99AD] truncate">
                            {rep.driverPhone}
                          </div>
                        )}
                      </td>

                      {/* Sub-City & Location */}
                      <td className="py-3 px-3 text-xs text-[#1C2434] dark:text-white w-40 overflow-hidden">
                        <div className="font-medium truncate" title={`${rep.subCity || ''} ${rep.locationName || ''}`}>
                          {rep.subCity || '—'}
                        </div>
                        {rep.locationName && (
                          <div className="text-2xs text-[#64748B] dark:text-[#8A99AD] truncate">
                            {rep.locationName}
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 text-center w-32 whitespace-nowrap">{getStatusBadge(rep.status)}</td>

                      {/* Action Button */}
                      <td className="py-3 px-3 text-right w-32 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <motion.button
                          type="button"
                          data-motion-control="true"
                          whileTap={TAP_SCALE}
                          transition={TACTILE_SPRING}
                          onClick={() => setSelectedReport(rep)}
                          className="px-3 py-1.5 rounded-sm bg-primary hover:bg-primary-hover text-on-primary text-xs font-medium transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
                        >
                          <Icon className="material-symbols-outlined text-icon-sm">visibility</Icon>
                          <span>{isAmharic ? 'ዝርዝር' : 'Details'}</span>
                        </motion.button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (shown on screens < md) */}
            <div className="block md:hidden divide-y divide-outline-variant h-[calc(420px*var(--ui-scale))] overflow-y-auto [scrollbar-gutter:stable]">
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
                          <p className="font-mono text-2xs font-bold text-amber-700 dark:text-amber-400">{rep.id}</p>
                          <p className="text-2xs text-secondary">{rep.reportedAt}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => toggleReportExpand(rep.id)}
                          aria-label={isExpanded ? (isAmharic ? 'ዝጋ' : 'Collapse') : (isAmharic ? 'ዘርጋ' : 'Expand')}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-secondary hover:text-on-surface cursor-pointer touch-manipulation"
                        >
                          <Icon className="material-symbols-outlined text-icon-lg">
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
                          <span className="text-2xs font-bold text-secondary block mb-0.5">
                            {isAmharic ? 'ማስታወሻ:' : 'Notes:'}
                          </span>
                          <p className="text-xs text-on-surface leading-relaxed">{rep.notes}</p>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <motion.button
                          type="button"
                          data-motion-control="true"
                          whileTap={TAP_SCALE}
                          transition={TACTILE_SPRING}
                          onClick={() => setSelectedReport(rep)}
                          className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] py-2 rounded-lg bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs touch-manipulation"
                        >
                          <Icon className="material-symbols-outlined text-icon-sm">visibility</Icon>
                          <span>{isAmharic ? 'ሙሉ ዝርዝር ይመልከቱ' : 'View Full Details'}</span>
                        </motion.button>
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
                  className="py-1 px-2 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs focus:border-primary outline-none cursor-pointer"
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
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-xs)] px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm">chevron_left</Icon>
                  <span>{isAmharic ? 'ቀዳሚ' : 'Previous'}</span>
                </button>

                <span className="px-3 py-1.5 bg-primary text-on-primary rounded-sm font-semibold font-mono text-xs shadow-xs tabular-nums">
                  {activePage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={activePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-xs)] px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs touch-manipulation"
                >
                  <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                  <Icon className="material-symbols-outlined text-icon-sm">chevron_right</Icon>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </UnifiedWorkspaceCard>

      {/* Detail Modal (Adaptive Mobile Bottom Sheet & Desktop Modal) */}
      <BaseModal
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        className="max-w-2xl"
        mobileSheet={true}
      >
        {selectedReport && (
          <div className="flex flex-col max-h-[85dvh] sm:max-h-[88vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-outline-variant shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="material-symbols-outlined text-amber-600 text-icon-2xl shrink-0">report_problem</Icon>
                <div className="min-w-0">
                  <h3 className="font-black text-sm text-on-surface tracking-wider truncate">
                    {isAmharic ? 'የባልተመዘገበ ተሽከርካሪ ሪፖርት ዝርዝር' : 'Unregistered Vehicle Report Details'}
                  </h3>
                  <p className="text-11 text-secondary font-mono">{selectedReport.id}</p>
                </div>
              </div>
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={() => setSelectedReport(null)}
                aria-label={isAmharic ? 'ዝጋ' : 'Close'}
                className="w-11 h-11 sm:w-9 sm:h-9 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer shrink-0 touch-manipulation"
              >
                <Icon className="material-symbols-outlined text-icon-md">close</Icon>
              </motion.button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0 pb-[max(1.25rem,env(safe-area-inset-bottom,20px))]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                  <p className="text-2xs font-bold text-secondary">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</p>
                  <p className="font-mono font-black text-sm text-on-surface">{selectedReport.plateNumber || 'Unplated'}</p>
                </div>

                <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                  <p className="text-2xs font-bold text-secondary">{isAmharic ? 'የቻሲስ ቁጥር' : 'Chasis'}</p>
                  <p className="font-mono font-black text-sm text-on-surface">{selectedReport.chassisNumber || (selectedReport.engineOrSerialNo && selectedReport.engineOrSerialNo !== 'N/A' ? selectedReport.engineOrSerialNo : '') || selectedReport.engineOrSerialNo || '—'}</p>
                </div>

                <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                  <p className="text-2xs font-bold text-secondary">{isAmharic ? 'አሽከርካሪ / ስልክ' : 'Driver / Phone'}</p>
                  <p className="font-bold text-on-surface">{selectedReport.driverName || '—'}</p>
                  <p className="text-secondary">{selectedReport.driverPhone || '—'}</p>
                </div>

                <div className="p-3.5 bg-surface-container-low/50 rounded-lg space-y-1 border border-outline-variant/60">
                  <p className="text-2xs font-bold text-secondary">{isAmharic ? 'ክፍለ ከተማ / ቦታ' : 'Sub-City & Location'}</p>
                  <p className="font-bold text-on-surface">{selectedReport.subCity}</p>
                  <p className="text-secondary">{selectedReport.locationName}</p>
                </div>
              </div>

              {/* Notes & Evidence Photo */}
              <div className="space-y-2">
                <p className="text-2xs font-bold text-secondary">{isAmharic ? 'የኦፊሰር ማብራሪያ' : 'Officer Field Notes'}</p>
                <p className="p-3 rounded-lg bg-surface-container-low text-on-surface text-xs leading-relaxed font-medium border border-outline-variant/50">
                  {selectedReport.notes}
                </p>
              </div>

              {selectedReport.evidencePhoto && (
                <div className="space-y-1">
                  <p className="text-2xs font-bold text-secondary">{isAmharic ? 'የማስረጃ ፎቶ' : 'Evidence Photo'}</p>
                  <div
                    onClick={() => setZoomedImage({ url: selectedReport.evidencePhoto!, title: selectedReport.id })}
                    className="h-44 rounded-lg overflow-hidden border border-outline-variant bg-surface-container cursor-pointer group relative shadow-2xs"
                  >
                    <img src={selectedReport.evidencePhoto} alt="Evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Icon className="material-symbols-outlined text-icon-2xl">zoom_in</Icon>
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
                    <motion.button
                      type="button"
                      data-motion-control="true"
                      whileTap={isUpdating ? undefined : TAP_SCALE}
                      transition={TACTILE_SPRING}
                      disabled={isUpdating}
                      onClick={() => handleStatusChange('under_investigation')}
                      className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 shadow-2xs touch-manipulation"
                    >
                      {isAmharic ? 'በምርመራ ላይ አድርግ' : 'Mark Under Investigation'}
                    </motion.button>

                    <motion.button
                      type="button"
                      data-motion-control="true"
                      whileTap={isUpdating ? undefined : TAP_SCALE}
                      transition={TACTILE_SPRING}
                      disabled={isUpdating}
                      onClick={() => handleStatusChange('resolved')}
                      className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 shadow-2xs touch-manipulation"
                    >
                      {isAmharic ? 'ተፈቷል በል' : 'Mark Resolved'}
                    </motion.button>

                    {onOpenRegisterForm && (
                      <motion.button
                        type="button"
                        data-motion-control="true"
                        whileTap={TAP_SCALE}
                        transition={TACTILE_SPRING}
                        onClick={() => {
                          setSelectedReport(null);
                          onOpenRegisterForm(selectedReport);
                        }}
                        className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-2xs touch-manipulation"
                      >
                        <Icon className="material-symbols-outlined text-icon-sm">how_to_reg</Icon>
                        <span>{isAmharic ? 'ወደ ምዝገባ ቀይር' : 'Convert to Registration'}</span>
                      </motion.button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </BaseModal>

      {/* Image Zoom Modal */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div
            variants={BACKDROP_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={POPOVER_TRANSITION}
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-2 sm:p-4 overflow-y-auto"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

