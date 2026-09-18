import React, { useState } from 'react';
import { Icon } from './ui/Icon';
import { motion } from 'motion/react';
import { formatEthiopianDate } from '../utils/ethiopianCalendar';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  VehicleCategory,
  BAHIR_DAR_SUBCITIES,
} from '../types';
import {
  saveRegistrationToDb,
  addAuditLogToDb,
  getPermissionState,
} from '../services/dbService';
import { SmartImage } from './SmartImage';
import { ZoomableDocumentContainer } from './ZoomableDocumentContainer';
import { QRCodeCard } from './QRCodeCard';
import { triggerDocumentPrint } from '../utils/printUtils';
import {
  FullscreenDocumentCarouselModal,
  buildRegistrationDocumentList,
  DocumentViewerItem,
} from './FullscreenDocumentCarouselModal';
import { checkDuplicateRegistration } from '../utils/validation';
import { LoadingSpinner } from './ui/Skeleton';

interface TodaySubmissionsPageProps {
  lang: Language;
  userRole: UserRole;
  userBadgeId: string;
  registrations: MotorcycleRegistration[];
  onNavigateToNewRegistration?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isLoading?: boolean;
}

export const TodaySubmissionsPage: React.FC<TodaySubmissionsPageProps> = ({
  lang,
  userRole,
  userBadgeId,
  registrations,
  onNavigateToNewRegistration,
  onShowToast,
  isLoading = false,
}) => {
  const isAmharic = lang === 'am';

  if (isLoading) {
    return null;
  }

  const isReadOnly = getPermissionState(userRole, 2) === 'view_only';

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'all'>('today');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals & Inspection State
  const [editingReg, setEditingReg] = useState<MotorcycleRegistration | null>(null);
  const [inspectReg, setInspectReg] = useState<MotorcycleRegistration | null>(null);
  const [carouselModal, setCarouselModal] = useState<{
    items: DocumentViewerItem[];
    initialIndex: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile collapsed card states
  const [expandedRegs, setExpandedRegs] = useState<Record<string, boolean>>({});
  const toggleRegExpand = (id: string) => {
    setExpandedRegs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Form State for Editing
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPlateNumber, setEditPlateNumber] = useState('');
  const [editEngineNo, setEditEngineNo] = useState('');
  const [editVehicleCategory, setEditVehicleCategory] = useState<VehicleCategory>('gas_under_110cc');
  const [editMotorBrand, setEditMotorBrand] = useState('');
  const [editMotorModel, setEditMotorModel] = useState('');
  const [editSubCity, setEditSubCity] = useState('Fasilo');
  const [editBloodGroup, setEditBloodGroup] = useState('A+');
  const [editUserPortrait, setEditUserPortrait] = useState('');
  const [editNationalIdPhoto, setEditNationalIdPhoto] = useState('');
  const [editNationalIdBackPhoto, setEditNationalIdBackPhoto] = useState('');
  const [editDrivingLicensePhoto, setEditDrivingLicensePhoto] = useState('');
  const [editDrivingPermitPhoto, setEditDrivingPermitPhoto] = useState('');
  const [editReSubmitPending, setEditReSubmitPending] = useState(true);

  // Today's date string (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split('T')[0];

  // Open Edit Modal with selected registration values
  const handleOpenEdit = (reg: MotorcycleRegistration) => {
    setEditingReg(reg);
    setEditFullName(reg.fullName || '');
    setEditPhone(reg.phone || '');
    setEditPlateNumber(reg.plateNumber || '');
    setEditEngineNo(reg.engineOrSerialNo || '');
    setEditVehicleCategory(reg.vehicleCategory || 'gas_under_110cc');
    setEditMotorBrand(reg.motorBrand || '');
    setEditMotorModel(reg.motorModel || '');
    setEditSubCity(reg.subCity || 'Fasilo');
    setEditBloodGroup(reg.bloodGroup || 'A+');
    setEditUserPortrait(reg.userPortraitPhoto || '');
    setEditNationalIdPhoto(reg.nationalIdPhoto || '');
    setEditNationalIdBackPhoto(reg.nationalIdBackPhoto || '');
    setEditDrivingLicensePhoto(reg.drivingLicensePhoto || '');
    setEditDrivingPermitPhoto(reg.drivingPermitPhoto || '');
    setEditReSubmitPending(reg.status === 'rejected');
  };

  // Handle Photo File Upload
  const handlePhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          setter(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Save / Update Registration
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReg) return;

    if (isReadOnly) {
      if (onShowToast) {
        onShowToast(
          isAmharic
            ? 'ተነባቢ ብቻ ሁነታ ተተግብሯል፡ ማሻሻያዎችን ማስቀመጥ አይፈቀድም።'
            : 'Read-only mode active: Saving changes is disabled.',
          'error'
        );
      }
      return;
    }

    if (!editFullName.trim() || !editPlateNumber.trim() || !editPhone.trim()) {
      if (onShowToast) {
        onShowToast(
          isAmharic ? 'እባክዎን ባለቤት ስም፣ ስልክና የታርጋ ቁጥር ያስገቡ' : 'Please fill all required fields',
          'error'
        );
      }
      return;
    }

    // Duplicate check: Full Name and Phone Number must not be registered more than once
    const dupCheck = checkDuplicateRegistration(
      editFullName.trim(),
      editPhone.trim(),
      registrations,
      editingReg.id,
      isAmharic
    );
    if (dupCheck.hasDuplicate) {
      if (onShowToast) {
        onShowToast(dupCheck.message, 'error');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const newStatus =
        editReSubmitPending && editingReg.status === 'rejected'
          ? 'pending_approval'
          : editingReg.status;

      const updatedRecord: MotorcycleRegistration = {
        ...editingReg,
        fullName: editFullName.trim(),
        phone: editPhone.trim(),
        plateNumber: editPlateNumber.trim().toUpperCase(),
        engineOrSerialNo: editEngineNo.trim().toUpperCase(),
        vehicleCategory: editVehicleCategory,
        motorBrand: editMotorBrand.trim(),
        motorModel: editMotorModel.trim(),
        subCity: editSubCity,
        bloodGroup: editBloodGroup,
        userPortraitPhoto: editUserPortrait || editingReg.userPortraitPhoto,
        nationalIdPhoto: editNationalIdPhoto || editingReg.nationalIdPhoto,
        nationalIdBackPhoto: editNationalIdBackPhoto || editingReg.nationalIdBackPhoto,
        drivingLicensePhoto: editDrivingLicensePhoto || editingReg.drivingLicensePhoto,
        drivingPermitPhoto: editDrivingPermitPhoto || editingReg.drivingPermitPhoto,
        status: newStatus,
        rejectionReason:
          newStatus === 'pending_approval' && editingReg.status === 'rejected'
            ? undefined
            : editingReg.rejectionReason,
      };

      await saveRegistrationToDb(updatedRecord);
      await addAuditLogToDb({
        actorBadgeId: userBadgeId || 'CLERK-01',
        actorRole: userRole,
        action: 'SUBMISSION_ADJUSTED',
        details: `Clerk updated application details for Plate ${updatedRecord.plateNumber} (${updatedRecord.fullName})`,
        severity: 'info',
      });

      if (onShowToast) {
        onShowToast(
          isAmharic
            ? `የማመልከቻ ቁጥር ${updatedRecord.plateNumber} መረጃ በተሳካ ሁኔታ ተስተካክሎ ቀርቧል!`
            : `Application ${updatedRecord.plateNumber} updated & submitted successfully!`,
          'success'
        );
      }

      setEditingReg(null);
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(
          isAmharic ? 'ማስተካከያውን ማስቀመጥ አልተሳካም' : 'Failed to save application adjustment',
          'error'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Fullscreen Document Carousel
  const openDocumentCarousel = (targetUrl: string, reg: MotorcycleRegistration) => {
    if (!targetUrl) return;
    const docs = buildRegistrationDocumentList(reg, lang);
    const foundIdx = docs.findIndex((d) => d.url === targetUrl);
    setCarouselModal({
      items: docs,
      initialIndex: foundIdx >= 0 ? foundIdx : 0,
    });
  };

  // Render Status Badge matching TailAdmin theme
  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 shadow-2xs">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">check_circle</Icon>
            <span>{isAmharic ? 'የተፈቀደ' : 'Approved'}</span>
          </span>
        );
      case 'printed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#3C50E0]/10 text-[#3C50E0] border border-[#3C50E0]/20 shadow-2xs">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">print</Icon>
            <span>{isAmharic ? 'የታተመ' : 'Printed'}</span>
          </span>
        );
      case 'ordered_print':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20 shadow-2xs">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">layers</Icon>
            <span>{isAmharic ? 'በሕትመት' : 'In Print'}</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FB5454]/10 text-[#FB5454] border border-[#FB5454]/20 shadow-2xs">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">cancel</Icon>
            <span>{isAmharic ? 'ውድቅ' : 'Rejected'}</span>
          </span>
        );
      case 'pending_approval':
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 shadow-2xs">
            <Icon className="material-symbols-outlined text-[13px] shrink-0">schedule</Icon>
            <span>{isAmharic ? 'የሚጠበቅ' : 'Pending'}</span>
          </span>
        );
    }
  };

  // 1. Role-specific filtering (clerk only sees their own submissions; hides hidden records for non-superadmin)
  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';
  const roleFilteredRegs = registrations.filter((reg) => {
    if (!isSuperAdmin && reg.hideFromOtherUsers) {
      return false;
    }
    if (userRole === 'clerk') {
      const clerkBadge = (userBadgeId || '').trim().toLowerCase();
      const regBy = (reg.registeredBy || '').trim().toLowerCase();
      return regBy === clerkBadge || (clerkBadge && regBy.includes(clerkBadge)) || (!reg.registeredBy && clerkBadge === 'clerk-001');
    }
    return true;
  });

  // 2. Filter by Date (Today vs All)
  const dateFilteredRegs = roleFilteredRegs.filter((reg) => {
    if (dateFilter === 'today') {
      const regDate = (reg.registrationDate || '').split(' ')[0];
      return !regDate || regDate === todayStr;
    }
    return true;
  });

  // Calculate Status Counts based on Date Filter
  const pendingCount = dateFilteredRegs.filter(
    (r) => r.status === 'pending_approval' || (r.status as string) === 'pending'
  ).length;

  const approvedCount = dateFilteredRegs.filter(
    (r) => r.status === 'approved' || r.status === 'printed' || r.status === 'ordered_print'
  ).length;

  const rejectedCount = dateFilteredRegs.filter(
    (r) => r.status === 'rejected'
  ).length;

  // 2. Filter by Status and Search
  const finalFilteredRegs = dateFilteredRegs.filter((reg) => {
    // Status Filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending_approval' && reg.status !== 'pending_approval' && (reg.status as string) !== 'pending') {
        return false;
      }
      if (statusFilter === 'approved' && reg.status !== 'approved' && reg.status !== 'printed' && reg.status !== 'ordered_print') {
        return false;
      }
      if (statusFilter === 'rejected' && reg.status !== 'rejected') {
        return false;
      }
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        (reg.fullName || '').toLowerCase().includes(q) ||
        (reg.plateNumber || '').toLowerCase().includes(q) ||
        (reg.phone || '').toLowerCase().includes(q) ||
        (reg.engineOrSerialNo || '').toLowerCase().includes(q) ||
        (reg.subCity || '').toLowerCase().includes(q) ||
        (reg.motorBrand || '').toLowerCase().includes(q) ||
        (reg.motorModel || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  // Pagination
  const totalRegs = finalFilteredRegs.length;
  const totalPages = Math.ceil(totalRegs / pageSize) || 1;
  const activePage = Math.min(page, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const paginatedRegistrations = finalFilteredRegs.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-4">
      {/* SINGLE UNIFIED TABLE CONTAINER (TAILADMIN DESIGN) */}
      <div className="rounded-sm border border-[#E2E8F0] bg-white shadow-default dark:border-[#2E3A47] dark:bg-[#1C2434] overflow-hidden">

        {/* CONTAINER SECTION HEADER (TAILADMIN DESIGN) */}
        <div className="py-4 px-4 md:px-6 xl:px-7.5 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-[#3C50E0]/10 flex items-center justify-center text-[#3C50E0]">
              <Icon className="material-symbols-outlined text-[20px]">edit_note</Icon>
            </div>
            <div>
              <h3 className="font-semibold text-base text-[#1C2434] dark:text-white">
                {isAmharic ? 'ማመልከቻ ማስተካከያ' : 'Submission Correction'}
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#8A99AD]">
                {isAmharic ? 'የተመዘገቡ የሞተር ብስክሌቶች ማመልከቻዎች ዝርዝር' : 'Review, inspect and update vehicle registration submissions'}
              </p>
            </div>
          </div>

          {onNavigateToNewRegistration && (
            <button
              type="button"
              onClick={onNavigateToNewRegistration}
              className="hidden sm:inline-flex items-center justify-center gap-2 rounded-sm bg-[#3C50E0] py-2 px-5 text-center font-medium text-white hover:bg-opacity-90 cursor-pointer text-xs shadow-xs"
            >
              <Icon className="material-symbols-outlined text-[16px]">add_circle</Icon>
              <span>{isAmharic ? 'አዲስ ምዝገባ' : 'New Registration'}</span>
            </button>
          )}
        </div>

        {/* SUB-FILTER SLIDE BAR (SEARCH, DATE TOGGLE & STATUS SLIDE PILLS - TAILADMIN DESIGN) */}
        <div className="p-4 md:px-6 bg-[#F7F9FC] dark:bg-[#24303F] flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
          {/* Live Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#64748B] dark:text-[#8A99AD]">
              <Icon className="material-symbols-outlined text-[18px]">search</Icon>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder={isAmharic ? 'በስም፣ ሰሌዳ፣ ስልክ ወይም ቻሲስ ፈልግ...' : 'Search by name, plate, phone, chassis...'}
              className="w-full rounded-sm border border-[#E2E8F0] bg-white py-2 pl-9 pr-8 text-xs text-[#1C2434] outline-none transition focus:border-[#3C50E0] active:border-[#3C50E0] dark:border-[#2E3A47] dark:bg-[#1C2434] dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-2.5 flex items-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[15px]">close</Icon>
              </button>
            )}
          </div>

          {/* Status & Date Filter Segmented Slide Pills */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Date Pill Toggle */}
            <div className="inline-flex items-center p-1 rounded-sm bg-[#E2E8F0] dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47]">
              <button
                type="button"
                onClick={() => {
                  setDateFilter('today');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                  dateFilter === 'today'
                    ? 'bg-[#3C50E0] text-white shadow-xs'
                    : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white'
                }`}
              >
                {isAmharic ? 'የዛሬ ብቻ' : "Today's Only"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFilter('all');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                  dateFilter === 'all'
                    ? 'bg-[#3C50E0] text-white shadow-xs'
                    : 'text-[#64748B] dark:text-[#8A99AD] hover:text-[#1C2434] dark:hover:text-white'
                }`}
              >
                {isAmharic ? 'ሁሉንም ቀናት' : 'All Dates'}
              </button>
            </div>

            {/* Status Filter Tabs in TailAdmin Pill Style */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {[
                {
                  id: 'all',
                  label: isAmharic ? 'ሁሉም' : 'All',
                  count: dateFilteredRegs.length,
                  badgeColor: 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]',
                },
                {
                  id: 'pending_approval',
                  label: isAmharic ? 'የሚጠበቁ' : 'Pending',
                  count: pendingCount,
                  badgeColor:
                    pendingCount > 0
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                      : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]',
                },
                {
                  id: 'approved',
                  label: isAmharic ? 'የፀደቁ' : 'Approved',
                  count: approvedCount,
                  badgeColor: 'bg-[#10B981]/20 text-[#10B981]',
                },
                {
                  id: 'rejected',
                  label: isAmharic ? 'ውድቅ' : 'Rejected',
                  count: rejectedCount,
                  badgeColor:
                    rejectedCount > 0
                      ? 'bg-[#FB5454]/20 text-[#FB5454]'
                      : 'bg-[#E2E8F0] dark:bg-[#2E3A47] text-[#64748B] dark:text-[#8A99AD]',
                },
              ].map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap rounded-sm ${
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
                          : tab.badgeColor
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Reset filter button if filtered */}
            {(searchQuery || statusFilter !== 'all' || dateFilter !== 'today') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setDateFilter('today');
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-sm text-xs font-medium text-[#FB5454] hover:bg-[#FB5454]/10 transition-colors flex items-center gap-1 cursor-pointer"
                title={isAmharic ? 'ማጣሪያዎችን አጽዳ' : 'Reset Filters'}
              >
                <span>{isAmharic ? 'አጽዳ' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        {/* --- REGISTRATIONS DATA TABLE (TAILADMIN DATATABLE DESIGN) --- */}
        <div className="min-h-[500px] flex flex-col justify-between">
          {/* Desktop Data Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full table-auto text-left border-collapse">
              <thead>
                <tr className="bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs uppercase font-semibold border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                  <th className="py-4 px-3 text-center w-12 font-medium">#</th>
                  <th className="py-4 px-4 font-medium">{isAmharic ? 'የባለቤት ስም' : 'Owner Name'}</th>
                  <th className="py-4 px-3 font-medium">{isAmharic ? 'ስልክ ቁጥር' : 'Phone Number'}</th>
                  <th className="py-4 px-4 font-medium">{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</th>
                  <th className="py-4 px-3 font-medium">{isAmharic ? 'አይነት' : 'Category'}</th>
                  <th className="py-4 px-4 font-medium">{isAmharic ? 'ሴሪያል / ቻሲስ ቁጥር' : 'Chassis / Serial'}</th>
                  <th className="py-4 px-3 font-medium">{isAmharic ? 'ብራንድ / ሞዴል' : 'Brand & Model'}</th>
                  <th className="py-4 px-3 font-medium">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</th>
                  <th className="py-4 px-3 font-medium">{isAmharic ? 'የተመዘገበበት ቀን' : 'Registered Date'}</th>
                  <th className="py-4 px-4 text-center font-medium">{isAmharic ? 'የፈቃድ ሁኔታ' : 'Permit Status'}</th>
                  <th className="py-4 px-4 text-right font-medium">{isAmharic ? 'እርምጃዎች' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#2E3A47] text-xs">
                {registrations.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 px-4 text-center text-[#64748B] dark:text-[#8A99AD]">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <Icon className="material-symbols-outlined text-[36px] text-[#8A99AD]">inbox</Icon>
                        <span className="font-semibold text-sm text-[#1C2434] dark:text-white">
                          {isAmharic ? 'ምንም የተመዘገቡ መረጃዎች የሉም' : 'No Vehicle Submissions Found'}
                        </span>
                        <span className="text-xs text-[#64748B] dark:text-[#8A99AD]">
                          {isAmharic
                            ? 'አዲስ የሞተር ብስክሌት መረጃዎች ሲመዘገቡ በዚህ ሰንጠረዥ ውስጥ ይዘረዘራሉ።'
                            : 'Submissions will appear in this table once registered.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : finalFilteredRegs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-14 px-4 text-center text-[#64748B] dark:text-[#8A99AD]">
                      <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <Icon className="material-symbols-outlined text-[32px] text-[#8A99AD]">search_off</Icon>
                        <span className="font-semibold text-sm text-[#1C2434] dark:text-white">
                          {isAmharic ? 'ምንም የሚመሳሰል ማመልከቻ አልተገኘም' : 'No matching applications found.'}
                        </span>
                        {dateFilter === 'today' && (
                          <button
                            type="button"
                            onClick={() => {
                              setDateFilter('all');
                              setPage(1);
                            }}
                            className="mt-2 px-4 py-2 bg-[#3C50E0] text-white font-medium text-xs rounded-sm hover:bg-opacity-90 cursor-pointer shadow-xs"
                          >
                            {isAmharic ? 'ሁሉንም ቀናት አሳይ' : 'Show All Dates'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRegistrations.map((reg, index) => {
                    const isExpanded = !!expandedRegs[reg.id];
                    return (
                      <React.Fragment key={reg.id}>
                        <tr className="hover:bg-[#F7F9FC] dark:hover:bg-[#24303F]/50 transition-colors border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                          {/* 1. Index & Expand */}
                          <td className="py-4 px-3 text-center align-middle font-mono font-medium text-[#64748B] dark:text-[#8A99AD]">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleRegExpand(reg.id)}
                                className={`w-6 h-6 rounded-sm flex items-center justify-center transition-colors cursor-pointer ${
                                  isExpanded
                                    ? 'bg-[#3C50E0] text-white shadow-xs'
                                    : 'text-[#64748B] dark:text-[#8A99AD] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47]'
                                }`}
                                title={isExpanded ? (isAmharic ? 'አጣጥፍ' : 'Collapse') : (isAmharic ? 'ሰነዶችን እና ዝርዝር አሳይ' : 'Expand Documents & Details')}
                              >
                                <Icon className="material-symbols-outlined text-[16px]">
                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                </Icon>
                              </button>
                              <span>{startIndex + index + 1}</span>
                            </div>
                          </td>

                          {/* 2. Standalone Owner Name */}
                          <td className="py-4 px-4 align-middle">
                            <span className="font-semibold text-xs text-[#1C2434] dark:text-white block truncate max-w-[160px]">
                              {reg.fullName || '—'}
                            </span>
                          </td>

                          {/* 3. Standalone Phone Number */}
                          <td className="py-4 px-3 align-middle font-mono text-xs text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                            {reg.phone || '—'}
                          </td>

                          {/* 4. Standalone Plate Number */}
                          <td className="py-4 px-4 align-middle whitespace-nowrap">
                            <span className="font-mono font-semibold text-xs px-2.5 py-1 rounded-sm bg-[#3C50E0]/10 text-[#3C50E0] border border-[#3C50E0]/20 inline-block shadow-2xs">
                              {reg.plateNumber || '—'}
                            </span>
                          </td>

                          {/* 5. Standalone Category */}
                          <td className="py-4 px-3 align-middle text-xs whitespace-nowrap">
                            {reg.vehicleCategory === 'electric' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                                <Icon className="material-symbols-outlined text-[13px]">electric_bolt</Icon>
                                <span>{isAmharic ? 'ኤሌክትሪክ' : 'Electric'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#3C50E0]/10 text-[#3C50E0] border border-[#3C50E0]/20">
                                <Icon className="material-symbols-outlined text-[13px]">local_gas_station</Icon>
                                <span>{isAmharic ? 'ቤንዚን' : 'Gasoline'}</span>
                              </span>
                            )}
                          </td>

                          {/* 6. Standalone Chassis / Serial */}
                          <td className="py-4 px-4 align-middle font-mono text-xs text-[#64748B] dark:text-[#8A99AD] max-w-[140px] truncate" title={reg.engineOrSerialNo || reg.chassisNumber || ''}>
                            {reg.engineOrSerialNo || reg.chassisNumber || '—'}
                          </td>

                          {/* 7. Standalone Brand & Model */}
                          <td className="py-4 px-3 align-middle text-xs text-[#1C2434] dark:text-white whitespace-nowrap">
                            {reg.motorBrand || ''} {reg.motorModel || (reg.motorBrand ? '' : '—')}
                          </td>

                          {/* 8. Standalone Sub-City */}
                          <td className="py-4 px-3 align-middle text-xs text-[#1C2434] dark:text-white whitespace-nowrap">
                            {reg.subCity || '—'}
                          </td>

                          {/* 9. Standalone Registered Date */}
                          <td className="py-4 px-3 align-middle font-mono text-xs text-[#64748B] dark:text-[#8A99AD] whitespace-nowrap">
                            {reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—'}
                          </td>

                          {/* 10. Status Badge */}
                          <td className="py-4 px-4 align-middle text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center gap-1">
                              {renderStatusBadge(reg.status)}
                              {reg.status === 'rejected' && reg.rejectionReason && (
                                <span className="text-[10px] text-[#FB5454] max-w-[120px] truncate" title={reg.rejectionReason}>
                                  {reg.rejectionReason}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 11. Actions */}
                          <td className="py-4 px-4 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Hide edit button for approved/printed records */}
                              {reg.status !== 'approved' && reg.status !== 'printed' && reg.status !== 'ordered_print' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(reg)}
                                  className="px-2.5 py-1.5 bg-[#3C50E0]/10 hover:bg-[#3C50E0] text-[#3C50E0] hover:text-white rounded-sm text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                                  title={isAmharic ? 'ማመልከቻውን አስተካክል' : 'Edit application'}
                                >
                                  <Icon className="material-symbols-outlined text-[15px]">edit</Icon>
                                  <span>{isAmharic ? 'አስተካክል' : 'Edit'}</span>
                                </button>
                              )}

                              {userRole !== 'clerk' && (
                                <button
                                  type="button"
                                  onClick={() => setInspectReg(reg)}
                                  className="p-1.5 text-[#64748B] hover:text-[#3C50E0] hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] rounded-sm transition-colors cursor-pointer border border-transparent hover:border-[#E2E8F0] dark:hover:border-[#2E3A47]"
                                  title={isAmharic ? 'ፈቃድ እይ' : 'Inspect permit card'}
                                >
                                  <Icon className="material-symbols-outlined text-[18px]">badge</Icon>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleRegExpand(reg.id)}
                                className={`p-1.5 rounded-sm transition-colors cursor-pointer ${
                                  isExpanded
                                    ? 'bg-[#3C50E0] text-white shadow-xs'
                                    : 'border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-[#3C50E0] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD]'
                                }`}
                                title={isExpanded ? (isAmharic ? 'ሰነዶችን ደብቅ' : 'Hide Documents') : (isAmharic ? 'ሰነዶችን ዘርጋ' : 'Expand Documents')}
                              >
                                <Icon className="material-symbols-outlined text-[18px]">
                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                </Icon>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Desktop Collapsible Attached Documents Sub-row */}
                        {isExpanded && (
                          <tr className="bg-[#F7F9FC]/80 dark:bg-[#24303F]/60 border-b border-[#E2E8F0] dark:border-[#2E3A47]">
                            <td colSpan={11} className="px-6 py-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <Icon className="material-symbols-outlined text-[16px] text-yellow-600 dark:text-yellow-400">photo_library</Icon>
                                    <span>{isAmharic ? 'የተያያዙ ሰነዶች (ለማጉላት ተጫን):' : 'Attached Documents (Click to Zoom):'}</span>
                                  </span>
                                  {userRole !== 'clerk' && (
                                    <button
                                      type="button"
                                      onClick={() => setInspectReg(reg)}
                                      className="text-xs font-extrabold text-slate-700 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>{isAmharic ? 'ሙሉ ፈቃድ መርምር' : 'Inspect Full Permit'}</span>
                                      <Icon className="material-symbols-outlined text-[14px]">arrow_forward</Icon>
                                    </button>
                                  )}
                                </div>

                                {(reg.userPortraitPhoto || reg.ownerPhoto || reg.nationalIdPhoto || reg.nationalIdBackPhoto || reg.drivingLicensePhoto || reg.drivingPermitPhoto) ? (
                                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                                    {(reg.userPortraitPhoto || reg.ownerPhoto) && (
                                      <div
                                        onClick={() => openDocumentCarousel((reg.userPortraitPhoto || reg.ownerPhoto)!, reg)}
                                        className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                        title={isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}
                                      >
                                        <SmartImage src={reg.userPortraitPhoto || reg.ownerPhoto} alt="Portrait" fallbackIcon="person" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                        </div>
                                      </div>
                                    )}
                                    {reg.nationalIdPhoto && (
                                      <div
                                        onClick={() => openDocumentCarousel(reg.nationalIdPhoto!, reg)}
                                        className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                        title={isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}
                                      >
                                        <SmartImage src={reg.nationalIdPhoto} alt="National ID" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                        </div>
                                      </div>
                                    )}
                                    {reg.nationalIdBackPhoto && (
                                      <div
                                        onClick={() => openDocumentCarousel(reg.nationalIdBackPhoto!, reg)}
                                        className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                        title={isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}
                                      >
                                        <SmartImage src={reg.nationalIdBackPhoto} alt="National ID Back" fallbackIcon="badge" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                        </div>
                                      </div>
                                    )}
                                    {reg.drivingLicensePhoto && (
                                      <div
                                        onClick={() => openDocumentCarousel(reg.drivingLicensePhoto!, reg)}
                                        className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                        title={isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                                      >
                                        <SmartImage src={reg.drivingLicensePhoto} alt="License" fallbackIcon="card_membership" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                        </div>
                                      </div>
                                    )}
                                    {reg.drivingPermitPhoto && (
                                      <div
                                        onClick={() => openDocumentCarousel(reg.drivingPermitPhoto!, reg)}
                                        className="w-14 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer relative group shadow-2xs"
                                        title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}
                                      >
                                        <SmartImage src={reg.drivingPermitPhoto} alt="Permit" fallbackIcon="menu_book" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                          <Icon className="material-symbols-outlined text-[16px]">zoom_in</Icon>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 italic">{isAmharic ? 'ምንም የተያያዘ ሰነድ የለም' : 'No attached documents uploaded.'}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List (< md) */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {finalFilteredRegs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <Icon className="material-symbols-outlined text-[32px] text-slate-400">search_off</Icon>
                <p className="font-bold text-xs mt-1">{isAmharic ? 'ምንም ማመልከቻ አልተገኘም' : 'No applications found'}</p>
              </div>
            ) : (
              paginatedRegistrations.map((reg, index) => {
                const isExpanded = !!expandedRegs[reg.id];
                return (
                  <div key={reg.id} className="p-3.5 bg-surface-container-lowest dark:bg-slate-900 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-black text-xs text-slate-900 dark:text-white truncate">{reg.fullName || '—'}</p>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{reg.phone || '—'}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {renderStatusBadge(reg.status)}
                        <button
                          type="button"
                          onClick={() => toggleRegExpand(reg.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md cursor-pointer"
                        >
                          <Icon className="material-symbols-outlined text-[18px]">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </Icon>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/60 text-yellow-900 dark:text-yellow-200 border border-yellow-300/80">
                          {reg.plateNumber || '—'}
                        </span>
                        <span className="text-[11px] text-slate-500">{reg.subCity || '—'}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Hide edit button for approved/printed records */}
                        {reg.status !== 'approved' && reg.status !== 'printed' && reg.status !== 'ordered_print' && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(reg)}
                            className="px-2.5 py-1 bg-blue-50 text-slate-800 dark:bg-blue-950/60 dark:text-blue-200 rounded-lg text-xs font-bold flex items-center gap-1"
                          >
                            <Icon className="material-symbols-outlined text-[14px]">edit</Icon>
                            <span>{isAmharic ? 'አስተካክል' : 'Edit'}</span>
                          </button>
                        )}
                        {userRole !== 'clerk' && (
                          <button
                            type="button"
                            onClick={() => setInspectReg(reg)}
                            className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg"
                          >
                            <Icon className="material-symbols-outlined text-[16px]">badge</Icon>
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-md space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        <p><span className="font-bold">{isAmharic ? 'ሞተር/ቻሲስ:' : 'Chassis/Engine:'}</span> {reg.engineOrSerialNo || '—'}</p>
                        <p><span className="font-bold">{isAmharic ? 'የሞተር ምርት/ሞዴል:' : 'Brand/Model:'}</span> {reg.motorBrand || ''} {reg.motorModel || ''}</p>
                        <p><span className="font-bold">{isAmharic ? 'የምዝገባ ቀን:' : 'Registered:'}</span> {reg.registrationDate ? formatEthiopianDate(reg.registrationDate, isAmharic ? 'am' : 'en') : '—'}</p>
                        {reg.status === 'rejected' && reg.rejectionReason && (
                          <p className="text-rose-600 font-semibold"><span className="font-bold">{isAmharic ? 'የውድቅ ምክንያት:' : 'Rejection Reason:'}</span> {reg.rejectionReason}</p>
                        )}

                        {/* On-Demand Attached Documents Preview */}
                        {(reg.userPortraitPhoto || reg.ownerPhoto || reg.nationalIdPhoto || reg.nationalIdBackPhoto || reg.drivingLicensePhoto || reg.drivingPermitPhoto) && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                              {isAmharic ? 'የተያያዙ ሰነዶች (ለማጉላት ይጫኑ):' : 'Attached Documents (Click to Zoom):'}
                            </span>
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                              {(reg.userPortraitPhoto || reg.ownerPhoto) && (
                                <div
                                  onClick={() => openDocumentCarousel((reg.userPortraitPhoto || reg.ownerPhoto)!, reg)}
                                  className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer shadow-2xs"
                                  title={isAmharic ? 'የባለቤት ፎቶ' : 'Owner Portrait'}
                                >
                                  <SmartImage src={reg.userPortraitPhoto || reg.ownerPhoto} alt="Portrait" fallbackIcon="person" className="w-full h-full object-cover" />
                                </div>
                              )}
                              {reg.nationalIdPhoto && (
                                <div
                                  onClick={() => openDocumentCarousel(reg.nationalIdPhoto!, reg)}
                                  className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer shadow-2xs"
                                  title={isAmharic ? 'ብሔራዊ መታወቂያ' : 'National ID'}
                                >
                                  <SmartImage src={reg.nationalIdPhoto} alt="National ID" fallbackIcon="badge" className="w-full h-full object-cover" />
                                </div>
                              )}
                              {reg.nationalIdBackPhoto && (
                                <div
                                  onClick={() => openDocumentCarousel(reg.nationalIdBackPhoto!, reg)}
                                  className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer shadow-2xs"
                                  title={isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}
                                >
                                  <SmartImage src={reg.nationalIdBackPhoto} alt="National ID Back" fallbackIcon="badge" className="w-full h-full object-cover" />
                                </div>
                              )}
                              {reg.drivingLicensePhoto && (
                                <div
                                  onClick={() => openDocumentCarousel(reg.drivingLicensePhoto!, reg)}
                                  className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer shadow-2xs"
                                  title={isAmharic ? 'የመንጃ ፍቃድ' : 'Driving License'}
                                >
                                  <SmartImage src={reg.drivingLicensePhoto} alt="License" fallbackIcon="card_membership" className="w-full h-full object-cover" />
                                </div>
                              )}
                              {reg.drivingPermitPhoto && (
                                <div
                                  onClick={() => openDocumentCarousel(reg.drivingPermitPhoto!, reg)}
                                  className="w-12 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 cursor-pointer shadow-2xs"
                                  title={isAmharic ? 'የመንቀሳቀሻ ፍቃድ' : 'Permit / Libre'}
                                >
                                  <SmartImage src={reg.drivingPermitPhoto} alt="Permit" fallbackIcon="menu_book" className="w-full h-full object-cover" />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* PAGINATION BAR (TAILADMIN DESIGN) */}
          {totalPages > 1 && (
            <div className="bg-white dark:bg-[#1C2434] px-4 sm:px-6 py-4 flex flex-row items-center justify-between gap-3 text-xs text-[#64748B] dark:text-[#8A99AD] border-t border-[#E2E8F0] dark:border-[#2E3A47] shrink-0">
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-[#1C2434] dark:text-white">{isAmharic ? 'በአንድ ገጽ:' : 'Rows per page:'}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="py-1 px-2 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs focus:border-[#3C50E0] focus:outline-none cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="hidden sm:inline font-medium text-[#64748B] dark:text-[#8A99AD]">
                  {isAmharic
                    ? `${startIndex + 1}-${Math.min(startIndex + pageSize, totalRegs)} ከ ${totalRegs} መዝገቦች`
                    : `Showing ${startIndex + 1}–${Math.min(startIndex + pageSize, totalRegs)} of ${totalRegs} entries`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={activePage <= 1}
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
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={activePage >= totalPages}
                  className="px-3 py-1.5 bg-[#F7F9FC] dark:bg-[#24303F] hover:bg-[#E2E8F0] dark:hover:bg-[#2E3A47] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] rounded-sm disabled:opacity-40 disabled:cursor-not-allowed font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <span>{isAmharic ? 'ቀጣይ' : 'Next'}</span>
                  <Icon className="material-symbols-outlined text-[16px]">chevron_right</Icon>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== MODAL: CLERK EDIT & RE-SUBMIT APPLICATION ==================== */}
      {editingReg && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-surface-container-lowest dark:bg-slate-900 w-full max-w-2xl rounded-lg border border-outline-variant dark:border-slate-700 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-outline-variant dark:border-slate-800 flex items-center justify-between bg-surface-container/30 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-md bg-slate-700 text-white flex items-center justify-center shadow-xs">
                  <Icon className="material-symbols-outlined text-[20px]">edit_note</Icon>
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-on-surface dark:text-white">
                    {isAmharic ? 'የማመልከቻ መረጃ ማስተካከያና ማቅረቢያ' : 'Edit & Re-Submit Application'}
                  </h3>
                  <p className="text-[11px] text-secondary font-mono">
                    {isAmharic ? 'የታርጋ ቁጥር: ' : 'Plate No: '}
                    <span className="font-bold text-slate-700 dark:text-blue-400">{editingReg.plateNumber}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingReg(null)}
                className="text-secondary hover:text-on-surface p-1.5 rounded-lg hover:bg-surface-container dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Icon className="material-symbols-outlined text-[20px]">close</Icon>
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {isReadOnly && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-[18px]">warning</Icon>
                  <span>
                    {isAmharic ? 'ተነባቢ ብቻ ሁነታ ተተግብሯል፡ ማስተካከል እና ማስቀመጥ አይፈቀድም።' : 'Read-Only Mode Active: Form editing and saving is disabled.'}
                  </span>
                </div>
              )}
              <fieldset disabled={isReadOnly} className="space-y-4">
                {/* If Rejected Banner */}
                {editingReg.status === 'rejected' && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md space-y-1.5">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-200 font-bold text-xs">
                    <Icon className="material-symbols-outlined text-[18px]">error</Icon>
                    <span>{isAmharic ? 'ውድቅ የተደረገበት ምክንያት:' : 'Rejection Reason from Manager:'}</span>
                  </div>
                  <p className="text-xs text-red-700 dark:text-red-300 pl-6">
                    {editingReg.rejectionReason || (isAmharic ? 'ተጨማሪ ማብራሪያ አልተሰጠም' : 'No rejection note specified.')}
                  </p>
                  <label className="flex items-center gap-2 pt-1 pl-6 text-xs font-bold text-on-surface dark:text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editReSubmitPending}
                      onChange={(e) => setEditReSubmitPending(e.target.checked)}
                      className="w-4 h-4 rounded text-slate-700 accent-blue-600"
                    />
                    <span>{isAmharic ? 'መረጃውን አስተካክለህ እንደገና ለማፅደቂያ አቅርብ (Re-submit for Review)' : 'Re-submit as Pending Approval'}</span>
                  </label>
                </div>
              )}

              {/* Section 1: Owner Info */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-on-surface dark:text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-outline-variant/60 dark:border-slate-800 pb-1.5">
                  <Icon className="material-symbols-outlined text-[16px] text-slate-700">person</Icon>
                  <span>{isAmharic ? '1. የባለቤት መረጃ' : '1. Owner Information'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'ሙሉ ስም *' : 'Full Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3.5 py-2 text-xs font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'ስልክ ቁጥር *' : 'Phone Number *'}
                    </label>
                    <input
                      type="tel"
                      required
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3.5 py-2 text-xs font-mono font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}
                    </label>
                    <select
                      value={editSubCity}
                      onChange={(e) => setEditSubCity(e.target.value)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3 py-2 text-xs font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
                    >
                      {BAHIR_DAR_SUBCITIES.map((sc) => (
                        <option key={sc.en} value={sc.en}>
                          {isAmharic ? sc.am : sc.en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'የደም አይነት' : 'Blood Group'}
                    </label>
                    <select
                      value={editBloodGroup}
                      onChange={(e) => setEditBloodGroup(e.target.value)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3 py-2 text-xs font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
                    >
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Vehicle Info */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black text-on-surface dark:text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-outline-variant/60 dark:border-slate-800 pb-1.5">
                  <Icon className="material-symbols-outlined text-[16px] text-slate-700">two_wheeler</Icon>
                  <span>{isAmharic ? '2. የተሽከርካሪ መረጃ' : '2. Vehicle Information'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'የታርጋ ቁጥር *' : 'Plate Number *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={editPlateNumber}
                      onChange={(e) => setEditPlateNumber(e.target.value)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3.5 py-2 text-xs font-mono font-bold text-on-surface dark:text-white uppercase focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'የሞተር / ሻንሲ ቁጥር *' : 'Engine / Chassis No *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={editEngineNo}
                      onChange={(e) => setEditEngineNo(e.target.value)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3.5 py-2 text-xs font-mono font-bold text-on-surface dark:text-white uppercase focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'የተሽከርካሪ ዓይነት' : 'Vehicle Category'}
                    </label>
                    <select
                      value={editVehicleCategory}
                      onChange={(e) => setEditVehicleCategory(e.target.value as VehicleCategory)}
                      className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3 py-2 text-xs font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
                    >
                      <option value="gas_under_110cc">{isAmharic ? 'ቤንዚን ሞተር (እስከ 110cc)' : 'Gasoline Under 110cc'}</option>
                      <option value="electric">{isAmharic ? 'የኤሌክትሪክ ሞተር (EV)' : 'Electric Motorcycle (EV)'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface dark:text-slate-300 mb-1">
                      {isAmharic ? 'የሞተር ምርት / ሞዴል' : 'Brand & Model'}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Brand (e.g. Haojue)"
                        value={editMotorBrand}
                        onChange={(e) => setEditMotorBrand(e.target.value)}
                        className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3 py-2 text-xs font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Model (e.g. HJ-125)"
                        value={editMotorModel}
                        onChange={(e) => setEditMotorModel(e.target.value)}
                        className="w-full bg-surface-container/70 dark:bg-slate-800 border border-outline-variant dark:border-slate-700 rounded-md px-3 py-2 text-xs font-bold text-on-surface dark:text-white focus:outline-hidden focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Document Attachments Preview & Upload */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black text-on-surface dark:text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-outline-variant/60 dark:border-slate-800 pb-1.5">
                  <Icon className="material-symbols-outlined text-[16px] text-slate-700">attachment</Icon>
                  <span>{isAmharic ? '3. ሰነዶችና ፎቶዎች' : '3. Documents & Photos'}</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Portrait */}
                  <div className="p-2 bg-surface-container/50 dark:bg-slate-800/60 border border-outline-variant dark:border-slate-700 rounded-md space-y-1.5 text-center">
                    <p className="text-[10px] font-bold text-on-surface dark:text-slate-300 truncate">
                      {isAmharic ? 'የባለቤት ፎቶ' : 'Driver Portrait'}
                    </p>
                    <div className="w-14 h-16 mx-auto rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-surface-container dark:bg-slate-800">
                      <SmartImage src={editUserPortrait} alt="Portrait" fallbackIcon="person" className="w-full h-full object-cover" />
                    </div>
                    <label className="block cursor-pointer">
                      <span className="text-[10px] font-bold text-slate-700 dark:text-blue-400 hover:underline">
                        {isAmharic ? 'ቀይር' : 'Change'}
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setEditUserPortrait)} />
                    </label>
                  </div>

                  {/* National ID Front */}
                  <div className="p-2 bg-surface-container/50 dark:bg-slate-800/60 border border-outline-variant dark:border-slate-700 rounded-md space-y-1.5 text-center">
                    <p className="text-[10px] font-bold text-on-surface dark:text-slate-300 truncate">
                      {isAmharic ? 'መታወቂያ ፊት' : 'National ID Front'}
                    </p>
                    <div className="w-14 h-16 mx-auto rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-surface-container dark:bg-slate-800">
                      <SmartImage src={editNationalIdPhoto} alt="ID Front" fallbackIcon="badge" className="w-full h-full object-cover" />
                    </div>
                    <label className="block cursor-pointer">
                      <span className="text-[10px] font-bold text-slate-700 dark:text-blue-400 hover:underline">
                        {isAmharic ? 'ቀይር' : 'Change'}
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setEditNationalIdPhoto)} />
                    </label>
                  </div>

                  {/* National ID Back */}
                  <div className="p-2 bg-surface-container/50 dark:bg-slate-800/60 border border-outline-variant dark:border-slate-700 rounded-md space-y-1.5 text-center">
                    <p className="text-[10px] font-bold text-on-surface dark:text-slate-300 truncate">
                      {isAmharic ? 'መታወቂያ ጀርባ' : 'National ID Back'}
                    </p>
                    <div className="w-14 h-16 mx-auto rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-surface-container dark:bg-slate-800">
                      <SmartImage src={editNationalIdBackPhoto} alt="ID Back" fallbackIcon="badge" className="w-full h-full object-cover" />
                    </div>
                    <label className="block cursor-pointer">
                      <span className="text-[10px] font-bold text-slate-700 dark:text-blue-400 hover:underline">
                        {isAmharic ? 'ቀይር' : 'Change'}
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setEditNationalIdBackPhoto)} />
                    </label>
                  </div>

                  {/* Driving License */}
                  <div className="p-2 bg-surface-container/50 dark:bg-slate-800/60 border border-outline-variant dark:border-slate-700 rounded-md space-y-1.5 text-center">
                    <p className="text-[10px] font-bold text-on-surface dark:text-slate-300 truncate">
                      {isAmharic ? 'መንጃ ፍቃድ' : 'License'}
                    </p>
                    <div className="w-14 h-16 mx-auto rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-surface-container dark:bg-slate-800">
                      <SmartImage src={editDrivingLicensePhoto} alt="License" fallbackIcon="card_membership" className="w-full h-full object-cover" />
                    </div>
                    <label className="block cursor-pointer">
                      <span className="text-[10px] font-bold text-slate-700 dark:text-blue-400 hover:underline">
                        {isAmharic ? 'ቀይር' : 'Change'}
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setEditDrivingLicensePhoto)} />
                    </label>
                  </div>
                </div>
              </div>

              </fieldset>

              {/* Modal Action Buttons */}
              <div className="pt-4 border-t border-outline-variant dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingReg(null)}
                  className="px-4 py-2 rounded-md text-xs font-bold text-secondary hover:text-on-surface dark:hover:text-white hover:bg-surface-container dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {isReadOnly ? (isAmharic ? 'ዝጋ' : 'Close') : (isAmharic ? 'ይቅር' : 'Cancel')}
                </button>

                {!isReadOnly && (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-[#1e293b] text-xs font-black rounded-md shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    {isSubmitting ? (
                      <Icon className="material-symbols-outlined text-[18px] animate-spin">refresh</Icon>
                    ) : (
                      <Icon className="material-symbols-outlined text-[18px]">cloud_upload</Icon>
                    )}
                    <span>
                      {editReSubmitPending && editingReg.status === 'rejected'
                        ? (isAmharic ? 'አስተካክለህ እንደገና አቅርብ' : 'Save & Re-Submit')
                        : (isAmharic ? 'አስቀምጥና አቅርብ' : 'Save & Submit')}
                    </span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== INSPECT PERMIT CARD MODAL ==================== */}
      {inspectReg && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <ZoomableDocumentContainer
            lang={lang}
            userRole={userRole}
            title={isAmharic ? 'ባህር ዳር ሞተረኞች ማህበር መታወቂያ' : 'Bahirdar Motorist Association ID'}
            onClose={() => setInspectReg(null)}
            onPrint={() => triggerDocumentPrint('id-card')}
          >
            <QRCodeCard registration={inspectReg} lang={lang} />
          </ZoomableDocumentContainer>
        </div>
      )}

      {/* ==================== FULLSCREEN DOCUMENT CAROUSEL ==================== */}
      {carouselModal && (
        <FullscreenDocumentCarouselModal
          items={carouselModal.items}
          initialIndex={carouselModal.initialIndex}
          onClose={() => setCarouselModal(null)}
          lang={lang}
        />
      )}
    </div>
  );
};
