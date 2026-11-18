import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './ui/Icon';
import {
  TACTILE_SPRING,
  SHEET_SPRING,
  TAP_SCALE,
  POPOVER_TRANSITION,
  BACKDROP_VARIANTS,
} from '../utils/motionPresets';
import { formatEthiopianDateTime, getTodayEthiopianDateTimeIso } from '../utils/ethiopianCalendar';
import jsQR from 'jsqr';
import { Language, MotorcycleRegistration, UserRole, VerificationLog } from '../types';
import { QRCodeCard } from './QRCodeCard';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SharedScannerModal } from './SharedScannerModal';
import { SmartImage } from './SmartImage';
import { SelectField } from './ui/StreamlinedUI';
import { WorkspaceSideDrawer, WorkspaceDrawerSection } from './ui/AssocDesignSystem';

interface OfficerVerificationHistoryProps {
  lang: Language;
  userRole: UserRole;
  userBadgeId?: string;
  registrations: MotorcycleRegistration[];
  verificationLogs: VerificationLog[];
  onAddVerificationLog?: (log: VerificationLog) => void;
  initialStatusFilter?: 'all' | 'verified' | 'warning' | 'flagged';
}

export const OfficerVerificationHistory: React.FC<OfficerVerificationHistoryProps> = ({
  lang,
  userRole,
  userBadgeId,
  registrations,
  verificationLogs,
  onAddVerificationLog,
  initialStatusFilter = 'all',
}) => {
  const isAmharic = lang === 'am';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'warning' | 'flagged'>(initialStatusFilter);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
      setCurrentPage(1);
    }
  }, [initialStatusFilter]);

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [sortField, setSortField] = useState<'date' | 'plate' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const hasActiveSecondaryFilters = Boolean(categoryFilter !== 'all' || sortField !== 'date' || sortOrder !== 'desc' || searchTerm.trim());
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<VerificationLog | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  // Collapsible state for mobile cards
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  const toggleLogExpand = (id: string) => {
    setExpandedLogIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Scanner modal state
  const [showInlineScanner, setShowInlineScanner] = useState(false);
  const [scanPlateInput, setScanPlateInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedRegResult, setScannedRegResult] = useState<MotorcycleRegistration | null>(null);
  const [scanOfficerNotes, setScanOfficerNotes] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showFullCardInModal, setShowFullCardInModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';

  // Filter logs: verification logs for hidden registrations remain strictly invisible except for superadmin
  const scopedLogs = useMemo(() => {
    if (isSuperAdmin) return verificationLogs;
    const hiddenPlates = new Set(
      registrations.filter((r) => r.hideFromOtherUsers).map((r) => (r.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase()).filter(Boolean)
    );
    const hiddenRegIds = new Set(
      registrations.filter((r) => r.hideFromOtherUsers).map((r) => (r.id || '').toLowerCase()).filter(Boolean)
    );
    return verificationLogs.filter((log) => {
      const p = (log.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase();
      const rId = ((log as any).registrationId || '').toLowerCase();
      if (p && hiddenPlates.has(p)) return false;
      if (rId && hiddenRegIds.has(rId)) return false;
      return true;
    });
  }, [verificationLogs, registrations, isSuperAdmin]);

  const filteredLogs = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();

    return scopedLogs.filter((log) => {
      const matchesSearch =
        !searchLower ||
        (log.plateNumber || '').toLowerCase().includes(searchLower) ||
        (log.fullName || '').toLowerCase().includes(searchLower) ||
        (log.phone || '').includes(searchLower) ||
        (log.engineOrSerialNo || '').toLowerCase().includes(searchLower) ||
        (log.locationName || '').toLowerCase().includes(searchLower) ||
        (log.officerBadgeId || '').toLowerCase().includes(searchLower) ||
        (log.officerNotes && log.officerNotes.toLowerCase().includes(searchLower));

      const matchesStatus = statusFilter === 'all' ? true : log.verificationStatus === statusFilter;
      const matchesCategory =
        categoryFilter === 'all'
          ? true
          : categoryFilter === 'gasoline' || categoryFilter === 'gas_under_110cc'
          ? log.vehicleCategory === 'gas_under_110cc' || (log.vehicleCategory as string) === 'gasoline'
          : log.vehicleCategory === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = (a.scannedAt || '').localeCompare(b.scannedAt || '');
      } else if (sortField === 'plate') {
        comparison = (a.plateNumber || '').localeCompare(b.plateNumber || '');
      } else if (sortField === 'name') {
        comparison = (a.fullName || '').localeCompare(b.fullName || '');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [scopedLogs, searchTerm, statusFilter, categoryFilter, sortField, sortOrder]);

  // Tab counts calculated in a single fast pass from scoped logs
  const statusCounts = useMemo(() => {
    let verified = 0;
    let warning = 0;
    let flagged = 0;
    scopedLogs.forEach((l) => {
      if (l.verificationStatus === 'verified') verified++;
      else if (l.verificationStatus === 'warning') warning++;
      else if (l.verificationStatus === 'flagged') flagged++;
    });
    return {
      all: scopedLogs.length,
      verified,
      warning,
      flagged,
    };
  }, [scopedLogs]);

  // Calculate pagination slices
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const activePageNum = Math.min(currentPage, totalPages);
  const startIndex = (activePageNum - 1) * pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleStartCameraScan = () => {
    setIsScanning(true);
    setScannedRegResult(null);
    setCameraError(null);
  };

  const processQRData = (qrData: string) => {
    const cleanData = qrData.trim();
    if (!cleanData) return;

    const cleanLower = cleanData.toLowerCase();

    const match = registrations.find((r) => {
      if (!r) return false;
      const q = typeof r.qrCodeData === 'string' ? r.qrCodeData.toLowerCase() : String(r.qrCodeData || '').toLowerCase();
      const p = String(r.plateNumber || '').toLowerCase();
      const id = String(r.id || '').toLowerCase();
      const e = String(r.engineOrSerialNo || '').toLowerCase();
      const name = String(r.fullName || '').toLowerCase();
      const phoneDigits = String(r.phone || '').replace(/\D/g, '');
      const inputDigits = cleanLower.replace(/\D/g, '');

      return (
        (q && (cleanLower.includes(q) || q.includes(cleanLower))) ||
        (p && (cleanLower.includes(p) || p.includes(cleanLower))) ||
        (id && (cleanLower.includes(id) || id.includes(cleanLower))) ||
        (e && (cleanLower.includes(e) || e.includes(cleanLower))) ||
        (name && cleanLower.includes(name)) ||
        (phoneDigits && phoneDigits.length > 5 && inputDigits.includes(phoneDigits))
      );
    });

    if (match) {
      setIsScanning(false);
      setScannedRegResult(match);
      setShowFullCardInModal(false);
    } else {
      alert(
        isAmharic
          ? `የተቃኘው QR ኮድ በሲስተሙ አልተገኘም! (${cleanData})`
          : `Scanned QR code not found in system! (${cleanData})`
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
          if (code) {
            processQRData(code.data);
          } else {
            alert(isAmharic ? 'ምንም QR ኮድ በምስሉ ላይ አልተገኘም!' : 'No QR code found in the image!');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleManualPlateSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanPlateInput.trim()) return;

    const query = scanPlateInput.trim().toLowerCase();
    const match = registrations.find(
      (r) =>
        (r.plateNumber && r.plateNumber.toLowerCase() === query) ||
        (r.engineOrSerialNo && r.engineOrSerialNo.toLowerCase() === query) ||
        (r.id && String(r.id).toLowerCase() === query) ||
        (r.phone && r.phone.replace(/\D/g, '') === query.replace(/\D/g, ''))
    );

    if (match) {
      setScannedRegResult(match);
      setShowFullCardInModal(false);
    } else {
      alert(
        isAmharic
          ? `የተፈለገው ሰሌዳ/ሞተር ቁጥር "${scanPlateInput}" በሲስተሙ አልተገኘም!`
          : `Plate or engine number "${scanPlateInput}" was not found in the database!`
      );
    }
  };

  const handleSaveVerification = (status: 'verified' | 'warning' | 'flagged') => {
    if (!scannedRegResult) return;

    const newLog: VerificationLog = {
      id: `VER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      officerBadgeId: userBadgeId || 'OFF-8842',
      locationName: 'Sub-City Checkpoint Station',
      scannedAt: getTodayEthiopianDateTimeIso(),
      verificationStatus: status,
      plateNumber: scannedRegResult.plateNumber || 'UNREGISTERED',
      fullName: scannedRegResult.fullName || 'Unknown Owner',
      phone: scannedRegResult.phone || '—',
      vehicleCategory: scannedRegResult.vehicleCategory || 'gas_under_110cc',
      engineOrSerialNo: scannedRegResult.engineOrSerialNo || '—',
      permitStatus: scannedRegResult.status || 'pending_approval',
      officerNotes: scanOfficerNotes.trim() || undefined,
      userPortraitPhoto: scannedRegResult.userPortraitPhoto || scannedRegResult.ownerPhoto,
      nationalIdPhoto: scannedRegResult.nationalIdPhoto,
      drivingLicensePhoto: scannedRegResult.drivingLicensePhoto,
      drivingPermitPhoto: scannedRegResult.drivingPermitPhoto,
    };

    if (onAddVerificationLog) {
      onAddVerificationLog(newLog);
    }

    setScannedRegResult(null);
    setScanOfficerNotes('');
    setScanPlateInput('');
  };

  // Match actual registration if present, otherwise construct fallback from log
  const actualReg = selectedLogForDetails
    ? registrations.find((r) =>
        (r.plateNumber && r.plateNumber.trim() !== '' && r.plateNumber.toLowerCase() === selectedLogForDetails.plateNumber?.toLowerCase()) ||
        (r.engineOrSerialNo && r.engineOrSerialNo.trim() !== '' && r.engineOrSerialNo.toLowerCase() === selectedLogForDetails.engineOrSerialNo?.toLowerCase()) ||
        r.id === selectedLogForDetails.id
      )
    : null;

  const selectedRegForCard: MotorcycleRegistration | null = selectedLogForDetails
    ? (actualReg
        ? {
            ...actualReg,
            status: selectedLogForDetails.permitStatus || actualReg.status,
            userPortraitPhoto: selectedLogForDetails.userPortraitPhoto || actualReg.userPortraitPhoto,
            nationalIdPhoto: selectedLogForDetails.nationalIdPhoto || actualReg.nationalIdPhoto,
            drivingLicensePhoto: selectedLogForDetails.drivingLicensePhoto || actualReg.drivingLicensePhoto,
            drivingPermitPhoto: selectedLogForDetails.drivingPermitPhoto || actualReg.drivingPermitPhoto,
          }
        : {
            id: selectedLogForDetails.id,
            fullName: selectedLogForDetails.fullName,
            phone: selectedLogForDetails.phone,
            vehicleCategory: selectedLogForDetails.vehicleCategory,
            engineOrSerialNo: selectedLogForDetails.engineOrSerialNo,
            plateNumber: selectedLogForDetails.plateNumber,
            registrationDate: selectedLogForDetails.scannedAt,
            status: selectedLogForDetails.permitStatus,
            qrCodeData: `PERMIT-${selectedLogForDetails.plateNumber}-${selectedLogForDetails.fullName}`,
            registeredBy: 'SYSTEM-OFFICER',
            nationalIdPhoto: selectedLogForDetails.nationalIdPhoto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
            drivingLicensePhoto: selectedLogForDetails.drivingLicensePhoto || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=300',
            drivingPermitPhoto: selectedLogForDetails.drivingPermitPhoto || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300',
            userPortraitPhoto: selectedLogForDetails.userPortraitPhoto,
          })
    : null;

  // Verification status badge renderer (high contrast design system standard)
  const renderVerificationBadge = (status: 'verified' | 'warning' | 'flagged') => {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-icon-xs text-emerald-700 dark:text-emerald-300 shrink-0">verified</Icon>
            <span>{isAmharic ? 'የተረጋገጠ' : 'Verified'}</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-icon-xs text-amber-700 dark:text-amber-400 shrink-0">priority_high</Icon>
            <span>{isAmharic ? 'ማስጠንቀቂያ' : 'Warning'}</span>
          </span>
        );
      case 'flagged':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-icon-xs text-rose-700 dark:text-rose-300 shrink-0">cancel</Icon>
            <span>{isAmharic ? 'የተከለከለ' : 'Flagged'}</span>
          </span>
        );
    }
  };

  // Permit status badge renderer (matching other tables)
  const renderPermitBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-emerald-50 dark:bg-[#10B981]/15 text-emerald-700 dark:text-[#6EE7B7] border border-emerald-200/80 dark:border-[#10B981]/30 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13 shrink-0">check_circle</Icon>
            <span>{isAmharic ? 'የተፈቀደ' : 'Approved'}</span>
          </span>
        );
      case 'printed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-primary/10 dark:bg-primary/15 text-primary border border-primary/25 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13 shrink-0">print</Icon>
            <span>{isAmharic ? 'የታተመ' : 'Printed'}</span>
          </span>
        );
      case 'ordered_print':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-primary/10 dark:bg-primary/15 text-primary border border-primary/25 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13 shrink-0">local_printshop</Icon>
            <span>{isAmharic ? 'በሕትመት' : 'In Print'}</span>
          </span>
        );
      case 'rejected':
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-rose-50 dark:bg-[#FB5454]/15 text-rose-700 dark:text-[#FDA4AF] border border-rose-200/80 dark:border-[#FB5454]/30 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13 shrink-0">cancel</Icon>
            <span>{status === 'expired' ? (isAmharic ? 'ያልተከፈለበት' : 'Over due') : (isAmharic ? 'ውድቅ' : 'Rejected')}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-[#F7F9FC] dark:bg-[#24303F] text-[#475569] dark:text-[#CBD5E1] border border-[#E2E8F0] dark:border-[#2E3A47] shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-13 shrink-0">schedule</Icon>
            <span>{isAmharic ? 'የሚጠበቅ' : 'Pending'}</span>
          </span>
        );
    }
  };

  return (
    <div className="pb-3 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* SINGLE UNIFIED WORKSPACE CARD SHELL */}
      <div className="rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] shadow-xs overflow-hidden divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] w-full max-w-full min-w-0">
        {/* 1. INTEGRATED TITLE BAR / HEADER */}
        <div className="flex flex-row items-center justify-between gap-2 bg-white dark:bg-[#1C2434] py-2 sm:py-2.5 px-3 sm:px-5 w-full max-w-full min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <Icon className="material-symbols-outlined text-icon-lg shrink-0">analytics</Icon>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs sm:text-base font-bold text-[#1C2434] dark:text-white tracking-tight truncate">
                {isAmharic ? 'የትራፊክ ፍተሻና የመስክ ቁጥጥር ሪፖርት' : 'Traffic Enforcement Inspection Report'}
              </h2>
              <p className="text-11 text-[#64748B] dark:text-[#8A99AD] font-medium hidden sm:block truncate">
                {isAmharic ? 'የመንገድ ላይ የፍተሻ ታሪክ እና የኦፊሰሮች ማረጋገጫ መዝገብ' : 'Roadside checkpoint inspection history & officer log'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!showInlineScanner && (
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={() => setShowInlineScanner(true)}
                className="inline-flex items-center justify-center min-h-[34px] sm:min-h-[var(--ui-control-h-sm)] gap-1 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold transition-colors shadow-2xs cursor-pointer touch-manipulation whitespace-nowrap shrink-0"
                title={isAmharic ? 'ፍተሻ ጀምር' : 'Launch Scanner'}
              >
                <Icon className="material-symbols-outlined text-icon-sm shrink-0">qr_code_scanner</Icon>
                <span className="whitespace-nowrap shrink-0">{isAmharic ? 'አዲስ' : 'New'}</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* 2. INLINE LIVE SCANNER CONTAINER (IF EXPANDED) */}
        <AnimatePresence>
          {showInlineScanner && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={POPOVER_TRANSITION}
              className="bg-white dark:bg-[#1C2434] p-4 space-y-3"
            >
              <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                <div className="flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-primary text-icon-lg">qr_code_scanner</Icon>
                  <h3 className="font-bold text-sm text-[#1C2434] dark:text-white">
                    {isAmharic ? 'የቀጥታ ማረጋገጫ ፍተሻ ካሜራ' : 'Live Checkpoint Verification Scanner'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInlineScanner(false)}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] text-[#64748B] hover:text-[#1C2434] dark:text-[#8A99AD] dark:hover:text-white px-2.5 py-1 rounded-lg hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-md">close</Icon>
                  <span>{isAmharic ? 'ዝጋ' : 'Close'}</span>
                </button>
              </div>
              <SharedScannerModal
                isOpen={true}
                onClose={() => setShowInlineScanner(false)}
                lang={lang}
                registrations={registrations}
                userBadgeId={userBadgeId || 'OFF-8842'}
                onAddVerificationLog={onAddVerificationLog || (() => {})}
                isPage={true}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. SEARCH & STATUS FILTER TOOLBAR WITH COLLAPSIBLE DRAWER */}
        <div className="flex flex-col w-full bg-[#F7F9FC] dark:bg-[#24303F] border-b border-[#E2E8F0] dark:border-[#2E3A47]">
          {/* TIER 1: PRIMARY TOOLBAR */}
          <div className="px-2.5 sm:px-4 py-2 flex flex-row items-center justify-between gap-2 w-full max-w-full min-w-0">
            {/* Left: Full-Width Scrollable Status Segmented Pill Tabs */}
            <div className="flex items-center min-w-0 max-w-full flex-1 overflow-x-auto scrollbar-none">
              <div className="flex min-w-full w-max items-center gap-0.5 p-0.5 rounded-md bg-[#E2E8F0]/70 dark:bg-[#1C2434]/80 border border-[#E2E8F0] dark:border-[#2E3A47] min-h-[34px] whitespace-nowrap">
                {[
                  { id: 'all' as const, label: isAmharic ? 'ሁሉም' : 'All', count: statusCounts.all },
                  { id: 'verified' as const, label: isAmharic ? 'የተረጋገጡ' : 'Verified', count: statusCounts.verified },
                  { id: 'warning' as const, label: isAmharic ? 'ማስጠንቀቂያ' : 'Warning', count: statusCounts.warning },
                  { id: 'flagged' as const, label: isAmharic ? 'የተከለከሉ' : 'Flagged', count: statusCounts.flagged },
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
                      className={`flex-1 h-7 px-2 sm:px-2.5 rounded text-11 font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 select-none ${
                        isActive
                          ? 'bg-white dark:bg-primary text-primary dark:text-on-primary shadow-2xs font-extrabold'
                          : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`text-2xs px-1.5 py-0.5 rounded-full font-mono font-bold tabular-nums leading-none ${
                          isActive
                            ? 'bg-primary/10 text-primary dark:bg-black/15 dark:text-on-primary'
                            : 'bg-[#E2E8F0]/80 dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Filter Drawer Toggle Button */}
            <div className="flex items-center gap-1.5 shrink-0">
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
                  <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-[#8A99AD]">
                    <Icon className="material-symbols-outlined text-icon-sm">search</Icon>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={isAmharic ? 'በሰሌዳ፣ በስም፣ በስልክ፣ ወይም በማስታወሻ ፈልግ...' : 'Search plate, owner name, phone, notes...'}
                    className="w-full h-[34px] pl-8 pr-8 bg-white dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md text-xs text-[#1C2434] dark:text-white placeholder-[#8A99AD] focus:border-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      className="absolute inset-y-0 right-2 flex items-center text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
                      title={isAmharic ? 'ፍለጋውን አጽዳ' : 'Clear search'}
                    >
                      <Icon className="material-symbols-outlined text-icon-sm">close</Icon>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-xs w-full min-w-0">
                {/* Category Dropdown */}
                <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                  <span className="text-[#64748B] dark:text-[#8A99AD] text-11 font-bold uppercase tracking-wider shrink-0 whitespace-nowrap">
                    {isAmharic ? 'የሞተር ዓይነት:' : 'Category:'}
                  </span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-[34px] py-1 px-2.5 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs font-semibold focus:border-primary outline-none cursor-pointer min-w-0 max-w-full flex-1 sm:flex-initial truncate"
                  >
                    <option value="all">{isAmharic ? 'ሁሉም አይነቶች' : 'All Vehicle Types'}</option>
                    <option value="electric">{isAmharic ? 'ኤሌክትሪክ (EV)' : 'Electric (EV)'}</option>
                    <option value="gasoline">{isAmharic ? 'ቤንዚን (Gas)' : 'Gasoline'}</option>
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
                    <option value="date">{isAmharic ? 'በፍተሻ ቀን' : 'Scan Date'}</option>
                    <option value="plate">{isAmharic ? 'በሰሌዳ ቁጥር' : 'Plate No'}</option>
                    <option value="name">{isAmharic ? 'በባለቤት ስም' : 'Owner Name'}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="h-[34px] px-2 rounded-md border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#24303F] text-[#1C2434] dark:text-white hover:bg-[#F7F9FC] dark:hover:bg-[#333A48] transition-colors cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
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
                      setCategoryFilter('all');
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

        {/* TABLE CONTENT / EMPTY STATE */}
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <Icon className="material-symbols-outlined text-[#64748B] dark:text-[#8A99AD] text-[length:calc(44px*var(--ui-scale))]">manage_search</Icon>
            <p className="font-bold text-sm text-[#1C2434] dark:text-white">
              {isAmharic ? 'ምንም የፍተሻ ታሪክ መዝገብ አልተገኘም' : 'No verification history records found.'}
            </p>
            <p className="hidden sm:block text-xs text-[#64748B] dark:text-[#8A99AD]">
              {isAmharic ? 'በካሜራ ስካነር አዲስ ፍተሻ ያረጋግጡ።' : 'Scan a permit QR code to log verifications.'}
            </p>
          </div>
        ) : (
          <>
            {/* 1. DESKTOP STRUCTURED DATA TABLE (FIXED WIDTH & CORE COLUMNS) */}
            <div className="hidden md:block overflow-x-auto w-full max-w-full">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F]">
                    <th className="py-3 px-3 text-center text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono w-12">
                      {isAmharic ? 'ተ.ቁ' : '#'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] truncate">
                      {isAmharic ? 'ባለቤት / ነጂ' : 'Owner / Driver'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono w-32 whitespace-nowrap">
                      {isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate #'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] w-28 whitespace-nowrap">
                      {isAmharic ? 'ዓይነት' : 'Category'}
                    </th>
                    <th className="py-3 px-3 text-center text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] w-36 whitespace-nowrap">
                      {isAmharic ? 'የፍተሻ ውጤት' : 'Inspection Result'}
                    </th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] w-32 whitespace-nowrap">
                      {isAmharic ? 'እርምጃዎች' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">
                  {paginatedLogs.map((log, index) => {
                    const rowNumber = startIndex + index + 1;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLogForDetails(log)}
                        className="hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/60 transition-colors cursor-pointer select-none"
                      >
                        {/* 1. Row Index */}
                        <td className="py-3.5 px-3 text-center text-xs font-mono font-medium text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap w-12">
                          {rowNumber}
                        </td>

                        {/* 2. Owner / Driver Name */}
                        <td className="py-3.5 px-3 text-xs font-medium text-[#1C2434] dark:text-white overflow-hidden">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogForDetails(log);
                            }}
                            className="font-semibold text-xs text-[#1C2434] dark:text-white hover:text-primary dark:hover:text-primary transition-colors text-left flex items-center gap-1.5 cursor-pointer w-full overflow-hidden"
                            title={log.fullName || '—'}
                          >
                            <span className="truncate block">{log.fullName || '—'}</span>
                          </button>
                        </td>

                        {/* 3. Plate Number */}
                        <td className="py-3.5 px-3 text-xs font-mono font-bold text-[#1C2434] dark:text-white w-32 whitespace-nowrap">
                          <span className="bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] px-2 py-0.5 rounded text-primary font-bold">
                            {log.plateNumber || '—'}
                          </span>
                        </td>

                        {/* 4. Category (EV / Gas) */}
                        <td className="py-3.5 px-3 text-xs font-medium text-[#1C2434] dark:text-[#DEE4EE] w-28 whitespace-nowrap">
                          {log.vehicleCategory === 'electric'
                            ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric')
                            : (isAmharic ? 'ቤንዚን' : 'Gasoline')}
                        </td>

                        {/* 5. Verification Status Badge */}
                        <td className="py-3.5 px-3 text-center w-36 whitespace-nowrap">
                          {renderVerificationBadge(log.verificationStatus)}
                        </td>

                        {/* 6. Actions */}
                        <td
                          className="py-3.5 px-3 text-right w-32 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedLogForDetails(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-semibold transition-all shadow-2xs border border-[#E2E8F0] dark:border-[#2E3A47] text-[#1C2434] dark:text-white bg-white dark:bg-[#1C2434] hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] cursor-pointer active:scale-95"
                            title={isAmharic ? 'ሙሉ መረጃ እይ' : 'View Details'}
                          >
                            <Icon className="material-symbols-outlined text-15 text-primary">visibility</Icon>
                            <span>{isAmharic ? 'ዝርዝር' : 'Details'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 2. MOBILE EXPANDABLE CARD ROSTER (MATCHING TABLES PAGE MOBILE PATTERN) */}
            <div className="md:hidden divide-y divide-[#E2E8F0] dark:divide-[#2E3A47]">
              {paginatedLogs.map((log, index) => {
                const rowNumber = startIndex + index + 1;
                const isExpanded = !!expandedLogIds[log.id];

                return (
                  <div key={log.id} className="p-3 sm:p-4 hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/40 transition-colors">
                    {/* Compact Card Header */}
                    <div
                      className="flex items-center justify-between gap-3 cursor-pointer select-none"
                      onClick={() => toggleLogExpand(log.id)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Number Index */}
                        <span className="w-6 text-center text-xs font-mono font-bold text-[#64748B] dark:text-[#8A99AD] shrink-0">
                          {rowNumber}
                        </span>

                        {/* Status Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold shrink-0 shadow-2xs ${
                          log.verificationStatus === 'verified'
                            ? 'bg-emerald-600'
                            : log.verificationStatus === 'warning'
                            ? 'bg-amber-600'
                            : 'bg-red-600'
                        }`}>
                          <Icon className="material-symbols-outlined text-icon-md">
                            {log.verificationStatus === 'verified'
                              ? 'verified'
                              : log.verificationStatus === 'warning'
                              ? 'priority_high'
                              : 'cancel'}
                          </Icon>
                        </div>

                        {/* Title & Plate */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 shrink-0">
                              {log.plateNumber || '—'}
                            </span>
                            <span className="font-bold text-xs text-[#1C2434] dark:text-white truncate max-w-[calc(130px*var(--ui-scale))]">
                              {log.fullName || '—'}
                            </span>
                            <span className="text-2xs text-[#64748B] dark:text-[#8A99AD]">
                              ({log.vehicleCategory === 'electric' ? 'EV' : 'Gas'})
                            </span>
                          </div>
                          <div className="text-2xs text-[#64748B] dark:text-[#8A99AD] flex items-center gap-1.5">
                            <span>{log.scannedAt ? formatEthiopianDateTime(log.scannedAt, isAmharic ? 'am' : 'en') : '—'}</span>
                            <span>•</span>
                            <span className="truncate">{log.locationName || 'Checkpoint'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Expand Chevron */}
                      <button
                        type="button"
                        aria-label={isExpanded ? (isAmharic ? 'ዝጋ' : 'Collapse') : (isAmharic ? 'ዘርጋ' : 'Expand')}
                        className="w-10 h-10 rounded-full bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-center text-[#64748B] dark:text-[#8A99AD] shrink-0 touch-manipulation"
                      >
                        <Icon className="material-symbols-outlined text-icon-md">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </Icon>
                      </button>
                    </div>

                    {/* Expandable Card Body */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={POPOVER_TRANSITION}
                          className="mt-3 pt-3 border-t border-[#E2E8F0] dark:border-[#2E3A47] space-y-2 text-xs"
                        >
                          <div className="grid grid-cols-2 gap-2 bg-[#F7F9FC] dark:bg-[#1C2434] p-2.5 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47]">
                            <div>
                              <span className="text-2xs text-[#64748B] dark:text-[#8A99AD] font-semibold block">{isAmharic ? 'ስልክ ቁጥር' : 'Phone'}</span>
                              <span className="font-mono text-xs text-[#1C2434] dark:text-white font-bold">{log.phone || '—'}</span>
                            </div>
                            <div>
                              <span className="text-2xs text-[#64748B] dark:text-[#8A99AD] font-semibold block">{isAmharic ? 'የተቆጣጣሪው ባጅ' : 'Officer Badge'}</span>
                              <span className="font-mono text-xs text-[#1C2434] dark:text-white font-bold">{log.officerBadgeId || userBadgeId || 'OFF-8842'}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-2xs text-[#64748B] dark:text-[#8A99AD] font-semibold block">{isAmharic ? 'የፍተሻ ማስታወሻ' : 'Officer Notes'}</span>
                              <span className="text-xs text-[#1C2434] dark:text-[#DEE4EE] italic">{log.officerNotes || (isAmharic ? 'ምንም ተጨማሪ ማስታወሻ አልተያያዘም' : 'No officer notes recorded.')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 pt-1">
                              <span className="text-2xs text-[#64748B] dark:text-[#8A99AD] font-semibold">{isAmharic ? 'የፍተሻ ውጤት:' : 'Result:'}</span>
                              {renderVerificationBadge(log.verificationStatus)}
                            </div>

                          </div>

                          <div className="pt-1 flex justify-end">
                            <motion.button
                              type="button"
                              data-motion-control="true"
                              whileTap={TAP_SCALE}
                              transition={TACTILE_SPRING}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLogForDetails(log);
                              }}
                              className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] py-2 bg-primary hover:bg-primary-hover text-on-primary font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer touch-manipulation"
                            >
                              <Icon className="material-symbols-outlined text-icon-sm">visibility</Icon>
                              <span>{isAmharic ? 'ሙሉ የተፈተሸ ተሽከርካሪ መረጃ እይ' : 'View Scanned Vehicle'}</span>
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* 3. TAILADMIN STANDARD PAGINATION FOOTER */}
            <div className="p-4 sm:p-5 border-t border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#64748B] dark:text-[#8A99AD] font-medium">{isAmharic ? 'በአንድ ገጽ:' : 'Per page:'}</span>
                <SelectField
                  value={String(pageSize)}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </SelectField>
                <span className="text-[#64748B] dark:text-[#8A99AD] font-medium">
                  {isAmharic
                    ? `${startIndex + 1}-${Math.min(startIndex + pageSize, totalItems)} ከ ${totalItems} መዝገቦች`
                    : `Showing ${startIndex + 1}-${Math.min(startIndex + pageSize, totalItems)} of ${totalItems} entries`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={activePageNum <= 1}
                  onClick={() => handlePageChange(activePageNum - 1)}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-xs)] px-3 py-1.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-white hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 cursor-pointer transition-colors touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm">chevron_left</Icon>
                  <span>{isAmharic ? 'ቀዳሚ' : 'Prev'}</span>
                </button>

                <span className="px-3 py-1.5 font-bold font-mono text-[#1C2434] dark:text-white bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm tabular-nums">
                  {activePageNum} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={activePageNum >= totalPages}
                  onClick={() => handlePageChange(activePageNum + 1)}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-xs)] px-3 py-1.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-white hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 cursor-pointer transition-colors touch-manipulation"
                >
                  <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                  <Icon className="material-symbols-outlined text-icon-sm">chevron_right</Icon>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: DETAILED SCANNED VEHICLE INSPECTION (WORKSPACE SIDE DRAWER) */}
      <WorkspaceSideDrawer
        isOpen={!!(selectedLogForDetails && selectedRegForCard)}
        onClose={() => setSelectedLogForDetails(null)}
        icon="analytics"
        closeLabel={isAmharic ? 'ዝጋ' : 'Close Details'}
        title={selectedLogForDetails?.fullName || '—'}
      >
        {selectedLogForDetails && selectedRegForCard && (
          <div className="space-y-5">
            {/* Officer Audit Badge */}
            <WorkspaceDrawerSection
              title={isAmharic ? 'የፍተሻ ጣቢያ እና ማረጋገጫ' : 'Station & Audit Status'}
              icon="location_on"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-bold text-[#1C2434] dark:text-white truncate">
                      {selectedLogForDetails.locationName || 'Checkpoint Station'}
                    </p>
                    <p className="text-[#64748B] dark:text-[#8A99AD] text-11">
                      {isAmharic ? 'የተፈተሸበት ቀን፡' : 'Scanned At:'}{' '}
                      <span className="font-mono font-semibold tabular-nums">
                        {formatEthiopianDateTime(selectedLogForDetails.scannedAt, isAmharic ? 'am' : 'en')}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0">
                    {renderVerificationBadge(selectedLogForDetails.verificationStatus)}
                  </div>
                </div>

                {/* Driver Portrait Photo & ID Summary */}
                <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#2E3A47] flex items-center gap-4">
                  <div
                    onClick={() => {
                      const imgUrl = selectedLogForDetails.userPortraitPhoto || selectedLogForDetails.nationalIdPhoto;
                      if (imgUrl) {
                        setZoomedImage({
                          url: imgUrl,
                          title: `${selectedLogForDetails.fullName} — ${isAmharic ? 'የባለቤት ፎቶ' : 'Driver Portrait'}`
                        });
                      }
                    }}
                    className="relative w-16 h-20 rounded-lg overflow-hidden shrink-0 bg-[#F1F5F9] dark:bg-[#24303F] cursor-pointer group transition-opacity"
                    title={isAmharic ? 'ለማጉላት ይጫኑ' : 'Click to Zoom Photo'}
                  >
                    <SmartImage
                      src={selectedLogForDetails.userPortraitPhoto || selectedLogForDetails.nationalIdPhoto}
                      alt={selectedLogForDetails.fullName}
                      fallbackIcon="person"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Icon className="material-symbols-outlined text-icon-md">zoom_in</Icon>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs min-w-0">
                    <span className="block text-[11px] font-medium text-[#64748B] dark:text-[#8A99AD]">
                      {isAmharic ? 'የባለቤት መታወቂያ ፎቶ' : 'Driver / Owner ID Portrait'}
                    </span>
                    <h4 className="font-extrabold text-sm text-[#1C2434] dark:text-white leading-tight truncate">
                      {selectedLogForDetails.fullName}
                    </h4>
                    <p className="text-11 text-[#64748B] dark:text-[#8A99AD] font-medium tabular-nums">
                      {isAmharic ? 'ሰሌዳ:' : 'Plate:'}{' '}
                      <span className="font-mono font-bold text-primary">{selectedLogForDetails.plateNumber}</span>
                      {' · '}
                      <span className="font-mono">{selectedLogForDetails.phone}</span>
                    </p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD] font-medium tabular-nums">
                      {isAmharic ? 'የተቆጣጣሪው ባጅ:' : 'Inspector:'}{' '}
                      <span className="font-mono font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
                        {selectedLogForDetails.officerBadgeId || userBadgeId || 'OFF-8842'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </WorkspaceDrawerSection>

            {/* Digital Permit QR Badge Preview */}
            <WorkspaceDrawerSection
              title={isAmharic ? 'የባለቤትነት QR መታወቂያ' : 'Official Digital Permit & QR Badge'}
              icon="qr_code_2"
            >
              <div className="w-full">
                <ZoomableDocumentContainer
                  lang={lang}
                  userRole={userRole}
                  title={isAmharic ? 'የባለቤትነት QR መታወቂያ' : 'Official Digital Permit & QR Badge'}
                  onClose={() => setSelectedLogForDetails(null)}
                >
                  <QRCodeCard registration={selectedRegForCard} lang={lang} />
                </ZoomableDocumentContainer>
              </div>
            </WorkspaceDrawerSection>

            {/* Officer Notes */}
            {selectedLogForDetails.officerNotes && (
              <WorkspaceDrawerSection
                title={isAmharic ? 'የተቆጣጣሪው ማረጋገጫ ማስታወሻ' : 'Officer Field Verification Notes'}
                icon="note"
              >
                <p className="text-[#64748B] dark:text-[#8A99AD] text-xs leading-relaxed">
                  {selectedLogForDetails.officerNotes}
                </p>
              </WorkspaceDrawerSection>
            )}
          </div>
        )}
      </WorkspaceSideDrawer>

      {/* LIGHTBOX MODAL FOR EXPANDED DOCUMENT INSPECTION */}
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
                  referrerPolicy="no-referrer"
                  className="max-h-[70vh] w-auto object-contain rounded-lg shadow-lg mx-auto"
                />
              </ZoomableDocumentContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
