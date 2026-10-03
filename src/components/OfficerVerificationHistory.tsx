import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { formatEthiopianDateTime, getTodayEthiopianDateTimeIso } from '../utils/ethiopianCalendar';
import jsQR from 'jsqr';
import { Language, MotorcycleRegistration, UserRole, VerificationLog } from '../types';
import { QRCodeCard } from './QRCodeCard';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { SharedScannerModal } from './SharedScannerModal';
import { SmartImage } from './SmartImage';
import { SelectField } from './ui/StreamlinedUI';

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

  // Filter logs: verification logs for hidden registrations remain invisible except for privileged roles
  const filteredLogs = useMemo(() => {
    return verificationLogs.filter((log) => {
      const isHidden = registrations.some((r) => r.hideFromOtherUsers && (
        (r.plateNumber && r.plateNumber.trim() !== '' && r.plateNumber.toLowerCase() === log.plateNumber?.toLowerCase()) ||
        (r.engineOrSerialNo && r.engineOrSerialNo.trim() !== '' && r.engineOrSerialNo.toLowerCase() === log.engineOrSerialNo?.toLowerCase())
      ));

      if (isHidden && userRole !== 'superadmin' && (userRole as string) !== 'super_admin' && userRole !== 'officer' && userRole !== 'admin') {
        return false;
      }

      const matchesSearch =
        (log.plateNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.phone || '').includes(searchTerm) ||
        (log.engineOrSerialNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.locationName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.officerBadgeId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.officerNotes && log.officerNotes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' ? true : log.verificationStatus === statusFilter;
      const matchesCategory =
        categoryFilter === 'all'
          ? true
          : categoryFilter === 'gasoline' || categoryFilter === 'gas_under_110cc'
          ? log.vehicleCategory === 'gas_under_110cc' || (log.vehicleCategory as string) === 'gasoline'
          : log.vehicleCategory === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [verificationLogs, registrations, userRole, searchTerm, statusFilter, categoryFilter]);

  // Tab counts
  const statusCounts = useMemo(() => {
    return {
      all: verificationLogs.length,
      verified: verificationLogs.filter((l) => l.verificationStatus === 'verified').length,
      warning: verificationLogs.filter((l) => l.verificationStatus === 'warning').length,
      flagged: verificationLogs.filter((l) => l.verificationStatus === 'flagged').length,
    };
  }, [verificationLogs]);

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
            <Icon className="material-symbols-outlined text-[14px] text-emerald-700 dark:text-emerald-300 shrink-0">verified</Icon>
            <span>{isAmharic ? 'የተረጋገጠ' : 'Verified'}</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[14px] text-amber-700 dark:text-amber-300 shrink-0">priority_high</Icon>
            <span>{isAmharic ? 'ማስጠንቀቂያ' : 'Warning'}</span>
          </span>
        );
      case 'flagged':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[14px] text-rose-700 dark:text-rose-300 shrink-0">cancel</Icon>
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-600 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">check_circle</Icon>
            <span>{isAmharic ? 'የተፈቀደ' : 'Approved'}</span>
          </span>
        );
      case 'printed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">print</Icon>
            <span>{isAmharic ? 'የታተመ' : 'Printed'}</span>
          </span>
        );
      case 'ordered_print':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-600 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">local_printshop</Icon>
            <span>{isAmharic ? 'በሕትመት' : 'In Print'}</span>
          </span>
        );
      case 'rejected':
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-600 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">cancel</Icon>
            <span>{status === 'expired' ? (isAmharic ? 'ያለፈበት' : 'Expired') : (isAmharic ? 'ውድቅ' : 'Rejected')}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-600 shadow-2xs whitespace-nowrap">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">schedule</Icon>
            <span>{isAmharic ? 'የሚጠበቅ' : 'Pending'}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 pb-12 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* HEADER SECTION: Matching other tables in the app */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-[#1C2434] py-2.5 px-3.5 sm:px-4 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] shadow-2xs w-full max-w-full min-w-0">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-[#1C2434] dark:text-white tracking-tight flex items-center gap-2">
            <Icon className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-400 shrink-0">
              analytics
            </Icon>
            <span>{isAmharic ? 'የትራፊክ ፍተሻና የመስክ ቁጥጥር ሪፖርት' : 'Traffic Enforcement Inspection Report'}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!showInlineScanner && (
            <button
              type="button"
              onClick={() => setShowInlineScanner(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <Icon className="material-symbols-outlined text-[16px]">qr_code_scanner</Icon>
              <span>{isAmharic ? 'ፍተሻ ጀምር' : 'Launch Scanner'}</span>
            </button>
          )}
        </div>
      </div>

      {/* INLINE LIVE SCANNER CONTAINER */}
      {showInlineScanner && (
        <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm p-4 shadow-default space-y-3 animate-in slide-in-from-top-4 duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
            <div className="flex items-center gap-2">
              <Icon className="material-symbols-outlined text-primary text-[20px]">qr_code_scanner</Icon>
              <h3 className="font-bold text-sm text-[#1C2434] dark:text-white">
                {isAmharic ? 'የቀጥታ ማረጋገጫ ፍተሻ ካሜራ' : 'Live Checkpoint Verification Scanner'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowInlineScanner(false)}
              className="text-[#64748B] hover:text-[#1C2434] dark:text-[#8A99AD] dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#24303F] text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Icon className="material-symbols-outlined text-[18px]">close</Icon>
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
        </div>
      )}

      {/* MAIN DATA TABLE CARD (MATCHING TABLES PAGE & TODAY SUBMISSIONS DESIGN) */}
      <div className="rounded-sm border border-[#E2E8F0] bg-white shadow-default dark:border-[#2E3A47] dark:bg-[#1C2434] overflow-hidden w-full max-w-full min-w-0">
        {/* SEARCH & STATUS FILTER TOOLBAR (TAILADMIN STANDARD) */}
        <div className="p-3 sm:p-4 md:px-6 bg-[#F7F9FC] dark:bg-[#24303F] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47] w-full max-w-full min-w-0">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0 max-w-md w-full">
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
              placeholder={isAmharic ? 'በሰሌዳ፣ በስም፣ በስልክ፣ ወይም በማስታወሻ ፈልግ...' : 'Search plate, owner name, phone, notes...'}
              className="w-full rounded-sm border border-[#E2E8F0] bg-white py-2 pl-9 pr-8 text-xs text-[#1C2434] outline-none transition focus:border-primary active:border-primary dark:border-[#2E3A47] dark:bg-[#1C2434] dark:text-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute inset-y-0 right-2.5 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer font-bold text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Vehicle Category & Status Filter Tabs */}
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto flex-nowrap scrollbar-none">
            {/* Category Dropdown */}
            <div className="shrink-0">
              <SelectField
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">{isAmharic ? 'ሁሉም አይነቶች' : 'All Vehicle Types'}</option>
                <option value="electric">{isAmharic ? 'ኤሌክትሪክ (EV)' : 'Electric (EV)'}</option>
                <option value="gasoline">{isAmharic ? 'ቤንዚን (Gas)' : 'Gasoline'}</option>
              </SelectField>
            </div>

            {/* Status Filter Tabs with Counts */}
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none flex-nowrap shrink-0 max-w-full -mb-[1px]">
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
                    className={`group relative flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 select-none ${
                      isActive
                        ? 'border-primary text-primary dark:text-primary dark:border-primary font-bold'
                        : 'border-transparent text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white hover:border-[#CBD5E1] dark:hover:border-[#334155]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold transition-colors ${
                        isActive
                          ? 'bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary'
                          : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* TABLE CONTENT / EMPTY STATE */}
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <Icon className="material-symbols-outlined text-[#64748B] dark:text-[#8A99AD] text-[44px]">manage_search</Icon>
            <p className="font-bold text-sm text-[#1C2434] dark:text-white">
              {isAmharic ? 'ምንም የፍተሻ ታሪክ መዝገብ አልተገኘም' : 'No verification history records found.'}
            </p>
            <p className="hidden sm:block text-xs text-[#64748B] dark:text-[#8A99AD]">
              {isAmharic ? 'በካሜራ ስካነር አዲስ QR በመቃኘት የቀጥታ ፍተሻ ማረጋገጫ ያስመዝግቡ።' : 'Scan a vehicle permit QR code to generate a new field verification log.'}
            </p>
          </div>
        ) : (
          <>
            {/* 1. DESKTOP STRUCTURED DATA TABLE (MATCHING TABLES PAGE PATTERN) */}
            <div className="hidden md:block overflow-x-auto w-full max-w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F]">
                    <th className="py-3 px-3 text-center text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono w-12">
                      {isAmharic ? 'ተ.ቁ' : '#'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
                      {isAmharic ? 'ባለቤት / ነጂ' : 'Owner / Driver'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono">
                      {isAmharic ? 'ስልክ ቁጥር' : 'Phone'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono">
                      {isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate #'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
                      {isAmharic ? 'ዓይነት' : 'Category'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
                      {isAmharic ? 'የፍተሻ ጣቢያ / ቦታ' : 'Checkpoint Location'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono">
                      {isAmharic ? 'የተፈተሸበት ቀንና ሰዓት' : 'Scanned At'}
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE] font-mono">
                      {isAmharic ? 'የተቆጣጣሪው ባጅ' : 'Officer'}
                    </th>
                    <th className="py-3 px-3 text-center text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
                      {isAmharic ? 'የፍተሻ ውጤት' : 'Inspection Result'}
                    </th>
                    <th className="py-3 px-3 text-center text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
                      {isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}
                    </th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-[#1C2434] dark:text-[#DEE4EE]">
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
                        className="hover:bg-slate-50 dark:hover:bg-[#24303F]/60 transition-colors cursor-pointer select-none"
                      >
                        {/* 1. Row Index */}
                        <td className="py-3.5 px-3 text-center text-xs font-mono font-medium text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                          {rowNumber}
                        </td>

                        {/* 2. Owner / Driver Name */}
                        <td className="py-3.5 px-3 text-xs font-medium text-[#1C2434] dark:text-white whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogForDetails(log);
                            }}
                            className="font-semibold text-xs text-[#1C2434] dark:text-white hover:text-primary dark:hover:text-primary transition-colors text-left flex items-center gap-1.5 cursor-pointer max-w-[170px]"
                          >
                            <span className="truncate">{log.fullName || '—'}</span>
                          </button>
                        </td>

                        {/* 3. Phone Number */}
                        <td className="py-3.5 px-3 text-xs font-mono font-medium text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                          {log.phone || '—'}
                        </td>

                        {/* 4. Plate Number */}
                        <td className="py-3.5 px-3 text-xs font-mono font-bold text-[#1C2434] dark:text-white whitespace-nowrap">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-primary font-bold">
                            {log.plateNumber || '—'}
                          </span>
                        </td>

                        {/* 5. Category (EV / Gas) */}
                        <td className="py-3.5 px-3 text-xs font-medium text-[#1C2434] dark:text-[#DEE4EE] whitespace-nowrap">
                          {log.vehicleCategory === 'electric'
                            ? (isAmharic ? 'ኤሌክትሪክ' : 'Electric')
                            : (isAmharic ? 'ቤንዚን' : 'Gasoline')}
                        </td>

                        {/* 6. Checkpoint Location */}
                        <td className="py-3.5 px-3 text-xs font-medium text-[#1C2434] dark:text-[#DEE4EE] whitespace-nowrap">
                          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                            <Icon className="material-symbols-outlined text-[15px] text-slate-400">location_on</Icon>
                            <span className="truncate max-w-[150px]">{log.locationName || 'Sub-City Checkpoint'}</span>
                          </div>
                        </td>

                        {/* 7. Scanned Date & Time */}
                        <td className="py-3.5 px-3 text-xs font-mono text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                          {log.scannedAt ? formatEthiopianDateTime(log.scannedAt, isAmharic ? 'am' : 'en') : '—'}
                        </td>

                        {/* 8. Inspector Officer Badge */}
                        <td className="py-3.5 px-3 text-xs font-mono text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-bold">
                            {log.officerBadgeId || userBadgeId || 'OFF-8842'}
                          </span>
                        </td>

                        {/* 9. Verification Status Badge */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          {renderVerificationBadge(log.verificationStatus)}
                        </td>

                        {/* 10. Permit Status Badge */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          {renderPermitBadge(log.permitStatus)}
                        </td>

                        {/* 11. Actions */}
                        <td
                          className="py-3.5 px-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedLogForDetails(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-semibold transition-all shadow-2xs border border-[#E2E8F0] dark:border-[#2E3A47] text-[#1C2434] dark:text-white bg-white dark:bg-[#1C2434] hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] cursor-pointer active:scale-95"
                            title={isAmharic ? 'ሙሉ መረጃ እይ' : 'View Details'}
                          >
                            <Icon className="material-symbols-outlined text-[15px] text-primary">visibility</Icon>
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
                          <Icon className="material-symbols-outlined text-[18px]">
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
                            <span className="font-bold text-xs text-[#1C2434] dark:text-white truncate max-w-[130px]">
                              {log.fullName || '—'}
                            </span>
                            <span className="text-[10px] text-[#64748B] dark:text-[#8A99AD]">
                              ({log.vehicleCategory === 'electric' ? 'EV' : 'Gas'})
                            </span>
                          </div>
                          <div className="text-[10px] text-[#64748B] dark:text-[#8A99AD] flex items-center gap-1.5">
                            <span>{log.scannedAt ? formatEthiopianDateTime(log.scannedAt, isAmharic ? 'am' : 'en') : '—'}</span>
                            <span>•</span>
                            <span className="truncate">{log.locationName || 'Checkpoint'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Expand Chevron */}
                      <button
                        type="button"
                        className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0"
                      >
                        <Icon className="material-symbols-outlined text-[18px]">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </Icon>
                      </button>
                    </div>

                    {/* Expandable Card Body */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[#E2E8F0] dark:border-[#2E3A47] space-y-2 text-xs animate-in fade-in duration-150">
                        <div className="grid grid-cols-2 gap-2 bg-[#F7F9FC] dark:bg-[#1C2434] p-2.5 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47]">
                          <div>
                            <span className="text-[10px] text-[#64748B] dark:text-[#8A99AD] font-semibold block">{isAmharic ? 'ስልክ ቁጥር' : 'Phone'}</span>
                            <span className="font-mono text-xs text-[#1C2434] dark:text-white font-bold">{log.phone || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#64748B] dark:text-[#8A99AD] font-semibold block">{isAmharic ? 'የተቆጣጣሪው ባጅ' : 'Officer Badge'}</span>
                            <span className="font-mono text-xs text-[#1C2434] dark:text-white font-bold">{log.officerBadgeId || userBadgeId || 'OFF-8842'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] text-[#64748B] dark:text-[#8A99AD] font-semibold block">{isAmharic ? 'የፍተሻ ማስታወሻ' : 'Officer Notes'}</span>
                            <span className="text-xs text-slate-800 dark:text-slate-200 italic">{log.officerNotes || (isAmharic ? 'ምንም ተጨማሪ ማስታወሻ አልተያያዘም' : 'No officer notes recorded.')}</span>
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-[10px] text-[#64748B] dark:text-[#8A99AD] font-semibold">{isAmharic ? 'የፍተሻ ውጤት:' : 'Result:'}</span>
                            {renderVerificationBadge(log.verificationStatus)}
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-[10px] text-[#64748B] dark:text-[#8A99AD] font-semibold">{isAmharic ? 'ፈቃድ:' : 'Permit:'}</span>
                            {renderPermitBadge(log.permitStatus)}
                          </div>
                        </div>

                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogForDetails(log);
                            }}
                            className="w-full py-2 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          >
                            <Icon className="material-symbols-outlined text-[16px]">visibility</Icon>
                            <span>{isAmharic ? 'ሙሉ የተፈተሸ ተሽከርካሪ መረጃ እይ' : 'View Scanned Vehicle'}</span>
                          </button>
                        </div>
                      </div>
                    )}
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
                  className="px-3 py-1.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-white hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Icon className="material-symbols-outlined text-[16px]">chevron_left</Icon>
                  <span>{isAmharic ? 'ቀዳሚ' : 'Prev'}</span>
                </button>

                <span className="px-3 py-1.5 font-bold font-mono text-[#1C2434] dark:text-white bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm">
                  {activePageNum} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={activePageNum >= totalPages}
                  onClick={() => handlePageChange(activePageNum + 1)}
                  className="px-3 py-1.5 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-white hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                  <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: DETAILED SCANNED VEHICLE INSPECTION (MATCHING MEMBER DETAILS DRAWER) */}
      {selectedLogForDetails && selectedRegForCard && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedLogForDetails(null)}
            className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 transition-opacity"
          />

          {/* Side-Sheet Drawer Content */}
          <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-300 dark:border-slate-800 shadow-2xl z-10 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 text-primary">
                  <Icon name="analytics" size={24} />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h3 className="text-sm sm:text-base font-black tracking-wide truncate flex items-center gap-2">
                    <span>{isAmharic ? 'የተፈተሸ ተሽከርካሪ ማረጋገጫ ዝርዝር' : 'Scanned Inspection Audit'}</span>
                  </h3>
                  <p className="text-xs text-slate-300 font-medium truncate">
                    {selectedLogForDetails.fullName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedLogForDetails.plateNumber && (
                  <span className="hidden sm:inline-block px-2.5 py-1 rounded bg-slate-800 border border-slate-700 font-mono font-bold text-xs text-amber-400">
                    {selectedLogForDetails.plateNumber}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLogForDetails(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body: Scrollable */}
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Officer Audit Badge */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-[#1C2434] dark:text-white flex items-center gap-1.5">
                      <Icon className="material-symbols-outlined text-[16px] text-primary">location_on</Icon>
                      <span>{selectedLogForDetails.locationName || 'Checkpoint Station'}</span>
                    </p>
                    <p className="text-[#64748B] dark:text-[#8A99AD] text-[11px]">
                      {isAmharic ? 'የተፈተሸበት ቀን፡' : 'Scanned At:'} <span className="font-mono font-bold">{formatEthiopianDateTime(selectedLogForDetails.scannedAt, isAmharic ? 'am' : 'en')}</span>
                    </p>
                  </div>
                  <div>
                    {renderVerificationBadge(selectedLogForDetails.verificationStatus)}
                  </div>
                </div>

                {/* Driver Portrait Photo & ID Banner */}
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3.5">
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
                    className="relative w-16 h-20 rounded-md overflow-hidden border-2 border-primary/40 shadow-xs shrink-0 bg-slate-200 dark:bg-slate-700 cursor-pointer group hover:opacity-90 transition-all"
                    title={isAmharic ? 'ለማጉላት ይጫኑ' : 'Click to Zoom Photo'}
                  >
                    <SmartImage
                      src={selectedLogForDetails.userPortraitPhoto || selectedLogForDetails.nationalIdPhoto}
                      alt={selectedLogForDetails.fullName}
                      fallbackIcon="person"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Icon className="material-symbols-outlined text-[18px]">zoom_in</Icon>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs min-w-0">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded-md">
                      <Icon className="material-symbols-outlined text-[14px]">badge</Icon>
                      <span>{isAmharic ? 'የባለቤት መታወቂያ ፎቶ' : 'Driver / Owner ID Portrait'}</span>
                    </span>
                    <h4 className="font-extrabold text-sm text-[#1C2434] dark:text-white leading-tight truncate">
                      {selectedLogForDetails.fullName}
                    </h4>
                    <p className="text-[11px] text-[#64748B] dark:text-[#8A99AD] font-medium">
                      {isAmharic ? 'ሰሌዳ:' : 'Plate:'} <span className="font-mono font-bold text-primary">{selectedLogForDetails.plateNumber}</span> • {selectedLogForDetails.phone}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-[#8A99AD] font-medium">
                      {isAmharic ? 'የተቆጣጣሪው ባጅ:' : 'Inspector Officer:'} <span className="font-mono font-bold">{selectedLogForDetails.officerBadgeId || userBadgeId || 'OFF-8842'}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Digital Permit QR Badge Preview */}
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

              {/* Officer Notes */}
              {selectedLogForDetails.officerNotes && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1 border border-slate-200 dark:border-slate-700">
                  <p className="font-bold text-[#1C2434] dark:text-white">{isAmharic ? 'የተቆጣጣሪው ማረጋገጫ ማስታወሻ:' : 'Officer Field Verification Notes:'}</p>
                  <p className="text-[#64748B] dark:text-[#8A99AD] italic">"{selectedLogForDetails.officerNotes}"</p>
                </div>
              )}

              {/* Drawer Footer Close Action */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedLogForDetails(null)}
                  className="w-full bg-primary text-white font-bold py-2.5 rounded-lg text-xs cursor-pointer hover:bg-primary-hover transition-colors shadow-xs"
                >
                  {isAmharic ? 'ዝጋ' : 'Close Details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL FOR EXPANDED DOCUMENT INSPECTION */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-2 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
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
        </div>
      )}
    </div>
  );
};
