import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { motion, AnimatePresence } from 'motion/react';
import {
  Language,
  UserRole,
  MotorcycleRegistration,
  VehicleCategory,
  BAHIR_DAR_SUBCITIES,
} from '../types';
import {
  updateRegistrationInDb,
  addAuditLogToDb,
  isTaskAllowed,
  getPermissionState,
} from '../services/dbService';
import { DocumentUploadInput } from './DocumentUploadInput';

interface EditRegistrationModalProps {
  isOpen: boolean;
  registration: MotorcycleRegistration | null;
  lang: Language;
  userRole: UserRole;
  userBadgeId?: string;
  onClose: () => void;
  onSaveSuccess?: (updated: MotorcycleRegistration) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const ETHIOPIAN_MOTOR_BRANDS = [
  'Haojue',
  'TVS',
  'Bajaj',
  'Lifan',
  'Loncin',
  'Dayun',
  'Yamaha',
  'Honda',
  'Zongshen',
  'KTM',
  'Hero',
  'Senke',
  'Other',
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const EditRegistrationModal: React.FC<EditRegistrationModalProps> = ({
  isOpen,
  registration,
  lang,
  userRole,
  userBadgeId,
  onClose,
  onSaveSuccess,
  onShowToast,
}) => {
  const isAmharic = lang === 'am';

  const isSuperAdmin = userRole === 'superadmin' || (userRole as string) === 'super_admin';
  const hasTaskEditPermission = isTaskAllowed(userRole, 2);
  const isReadOnly = !isSuperAdmin && getPermissionState(userRole, 2) === 'view_only';
  const canEdit = isSuperAdmin || (hasTaskEditPermission && !isReadOnly);

  // Form State
  const [activeTab, setActiveTab] = useState<'owner' | 'vehicle' | 'documents' | 'status'>('owner');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [subCity, setSubCity] = useState('Fasilo');
  const [bloodGroup, setBloodGroup] = useState('A+');

  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('gas_under_110cc');
  const [plateNumber, setPlateNumber] = useState('');
  const [motorBrand, setMotorBrand] = useState('Haojue');
  const [customBrand, setCustomBrand] = useState('');
  const [motorModel, setMotorModel] = useState('');
  const [engineOrSerialNo, setEngineOrSerialNo] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');

  // Documents
  const [userPortraitPhoto, setUserPortraitPhoto] = useState('');
  const [nationalIdPhoto, setNationalIdPhoto] = useState('');
  const [nationalIdBackPhoto, setNationalIdBackPhoto] = useState('');
  const [drivingLicensePhoto, setDrivingLicensePhoto] = useState('');
  const [drivingPermitPhoto, setDrivingPermitPhoto] = useState('');
  const [receiptScreenshot, setReceiptScreenshot] = useState('');

  // Admin / Status
  const [status, setStatus] = useState<'pending_approval' | 'approved' | 'rejected' | 'ordered_print' | 'printed'>('approved');
  const [rejectionReason, setRejectionReason] = useState('');
  const [hideFromOtherUsers, setHideFromOtherUsers] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize or reset form when registration prop changes
  useEffect(() => {
    if (registration) {
      setFullName(registration.fullName || '');
      setPhone(registration.phone || '');
      setSubCity(registration.subCity || 'Fasilo');
      setBloodGroup(registration.bloodGroup || 'A+');

      setVehicleCategory(registration.vehicleCategory || 'gas_under_110cc');
      setPlateNumber(registration.plateNumber || '');

      const brand = registration.motorBrand || '';
      if (ETHIOPIAN_MOTOR_BRANDS.includes(brand)) {
        setMotorBrand(brand);
        setCustomBrand('');
      } else if (brand) {
        setMotorBrand('Other');
        setCustomBrand(brand);
      } else {
        setMotorBrand('Haojue');
        setCustomBrand('');
      }

      setMotorModel(registration.motorModel || '');
      setEngineOrSerialNo(registration.engineOrSerialNo || '');
      setChassisNumber(registration.chassisNumber || '');

      setUserPortraitPhoto(registration.userPortraitPhoto || (registration as any).ownerPhoto || '');
      setNationalIdPhoto(registration.nationalIdPhoto || '');
      setNationalIdBackPhoto(registration.nationalIdBackPhoto || '');
      setDrivingLicensePhoto(registration.drivingLicensePhoto || '');
      setDrivingPermitPhoto(registration.drivingPermitPhoto || '');
      setReceiptScreenshot(registration.receiptScreenshot || '');

      setStatus(registration.status || 'approved');
      setRejectionReason(registration.rejectionReason || '');
      setHideFromOtherUsers(!!registration.hideFromOtherUsers);

      setActiveTab('owner');
      setFormError(null);
    }
  }, [registration]);

  if (!isOpen || !registration) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registration) return;

    if (!canEdit) {
      const msg = isAmharic
        ? 'የአባላትን መረጃ የማሻሻል ፈቃድ የለዎትም። እባክዎ አስተዳዳሪውን ያነጋግሩ።'
        : 'You do not have permission to edit member records. Please contact an administrator.';
      setFormError(msg);
      if (onShowToast) onShowToast(msg, 'error');
      return;
    }

    if (!fullName.trim()) {
      setFormError(isAmharic ? 'እባክዎን የባለቤቱን ሙሉ ስም ያስገቡ' : 'Please provide the owner full name');
      setActiveTab('owner');
      return;
    }

    if (!phone.trim()) {
      setFormError(isAmharic ? 'እባክዎን የስልክ ቁጥር ያስገቡ' : 'Please provide a valid phone number');
      setActiveTab('owner');
      return;
    }

    if (!plateNumber.trim() && !engineOrSerialNo.trim()) {
      setFormError(isAmharic ? 'እባክዎን የሰሌዳ ቁጥር ወይም የሞተር ሴሪያል ቁጥር ያስገቡ' : 'Please provide a plate number or serial number');
      setActiveTab('vehicle');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const finalBrand = motorBrand === 'Other' ? customBrand.trim() || 'Other' : motorBrand;

      const updates: Partial<MotorcycleRegistration> = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        subCity,
        bloodGroup,
        vehicleCategory,
        plateNumber: plateNumber.trim().toUpperCase(),
        motorBrand: finalBrand,
        motorModel: motorModel.trim(),
        engineOrSerialNo: engineOrSerialNo.trim().toUpperCase(),
        chassisNumber: chassisNumber.trim().toUpperCase(),
        userPortraitPhoto: userPortraitPhoto || undefined,
        nationalIdPhoto: nationalIdPhoto || undefined,
        nationalIdBackPhoto: nationalIdBackPhoto || undefined,
        drivingLicensePhoto: drivingLicensePhoto || undefined,
        drivingPermitPhoto: drivingPermitPhoto || undefined,
        receiptScreenshot: receiptScreenshot || undefined,
        status,
        rejectionReason: status === 'rejected' ? rejectionReason.trim() : undefined,
        hideFromOtherUsers: isSuperAdmin ? hideFromOtherUsers : registration.hideFromOtherUsers,
      };

      await updateRegistrationInDb(registration.id, updates);

      // Audit Log
      await addAuditLogToDb({
        actorBadgeId: userBadgeId || (isSuperAdmin ? 'SUPER-ADMIN' : userRole.toUpperCase()),
        actorRole: userRole,
        action: 'REGISTRATION_UPDATED',
        details: `Updated member registration for ${fullName.trim()} (${plateNumber.trim() || registration.id})`,
        severity: 'info',
      });

      const updatedFullRecord: MotorcycleRegistration = {
        ...registration,
        ...updates,
      };

      if (onShowToast) {
        onShowToast(
          isAmharic ? 'የአባል መረጃ በተሳካ ሁኔታ ተሻሽሏል' : 'Member record updated successfully',
          'success'
        );
      }

      if (onSaveSuccess) {
        onSaveSuccess(updatedFullRecord);
      }

      onClose();
    } catch (err: any) {
      console.error('Error updating registration:', err);
      setFormError(err?.message || (isAmharic ? 'መረጃውን ማስተካከል አልተቻለም' : 'Failed to update registration record'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="edit-registration-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-yellow-500 text-[#0B1E48] flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Icon className="material-symbols-outlined text-[24px]">edit_document</Icon>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  {isAmharic ? 'የአባል መረጃ ማሻሻያ (Edit Record)' : 'Edit Member Registration'}
                </h3>
                {isSuperAdmin ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    👑 {isAmharic ? 'ሱፐር አድሚን ፍቃድ' : 'Super Admin Mode'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {isAmharic ? 'የተጠቃሚ ሚና፡ ' : 'Role: '} {userRole}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                ID: {registration.id} • {registration.fullName} • {registration.plateNumber || registration.engineOrSerialNo}
              </p>
            </div>
          </div>

          <button
            id="close-edit-modal-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title={isAmharic ? 'ዝጋ' : 'Close'}
          >
            <Icon className="material-symbols-outlined text-[20px]">close</Icon>
          </button>
        </div>

        {/* RBAC Warning Banner if user is not authorized */}
        {!canEdit && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-lg flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <Icon className="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400 shrink-0">lock</Icon>
            <div>
              <p className="font-black">
                {isAmharic ? 'የማስተካከል ፈቃድ አልተሰጠም (RBAC Restricted)' : 'Access Restricted by Role Permissions'}
              </p>
              <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300">
                {isAmharic
                  ? 'የእርስዎ ሚና የአባላት መረጃን የማስተካከል ፈቃድ የለውም። መረጃዎችን መመልከት ብቻ ይችላሉ።'
                  : 'Your user role does not currently have permissions to edit registration records. Changes cannot be saved.'}
              </p>
            </div>
          </div>
        )}

        {/* Form Error Banner */}
        {formError && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 rounded-lg text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2">
            <Icon className="material-symbols-outlined text-[18px] text-rose-600 dark:text-rose-400 shrink-0">error</Icon>
            <span>{formError}</span>
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto bg-slate-50/40 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={() => setActiveTab('owner')}
            className={`px-3.5 py-2 text-xs font-black border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'owner'
                ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="material-symbols-outlined text-[18px]">person</Icon>
            <span>{isAmharic ? 'የባለቤት መረጃ' : 'Owner Info'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vehicle')}
            className={`px-3.5 py-2 text-xs font-black border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'vehicle'
                ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="material-symbols-outlined text-[18px]">two_wheeler</Icon>
            <span>{isAmharic ? 'የተሽከርካሪ መረጃ' : 'Vehicle Details'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`px-3.5 py-2 text-xs font-black border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'documents'
                ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="material-symbols-outlined text-[18px]">photo_library</Icon>
            <span>{isAmharic ? 'ሰነዶችና ፎቶዎች' : 'Documents & Photos'}</span>
          </button>

          {(isSuperAdmin || userRole === 'admin') && (
            <button
              type="button"
              onClick={() => setActiveTab('status')}
              className={`px-3.5 py-2 text-xs font-black border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'status'
                  ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="material-symbols-outlined text-[18px]">verified_user</Icon>
              <span>{isAmharic ? 'የፈቃድ ሁኔታ & ቁጥጥር' : 'Status & Admin'}</span>
            </button>
          )}
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {/* TAB 1: OWNER INFO */}
          {activeTab === 'owner' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የባለቤት ሙሉ ስም (የአያት ጨምሮ) *' : 'Owner Full Name (Three names) *'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    placeholder={isAmharic ? 'ምሳሌ፡ አበበ በቀለ ከበደ' : 'e.g. Abebe Bekele Kebede'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'ስልክ ቁጥር *' : 'Phone Number *'}
                  </label>
                  <input
                    type="tel"
                    required
                    disabled={!canEdit}
                    placeholder="0911234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'ክፍለ ከተማ (Sub-City)' : 'Sub-City'}
                  </label>
                  <select
                    disabled={!canEdit}
                    value={subCity}
                    onChange={(e) => setSubCity(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  >
                    {BAHIR_DAR_SUBCITIES.map((sc) => (
                      <option key={sc.en} value={sc.en}>
                        {isAmharic ? sc.am : sc.en} ({sc.en})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የደም አይነት (Blood Group)' : 'Blood Group'}
                  </label>
                  <select
                    disabled={!canEdit}
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  >
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Registration Meta Info */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block font-medium">{isAmharic ? 'የተመዘገበበት ቀን:' : 'Registration Date:'}</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{registration.registrationDate || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">{isAmharic ? 'የመዘገበው ተጠቃሚ:' : 'Registered By:'}</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{registration.registeredBy || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">{isAmharic ? 'የማህደር ቁጥር:' : 'Record ID:'}</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{registration.id}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VEHICLE DETAILS */}
          {activeTab === 'vehicle' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የተሽከርካሪ አይነት (Category)' : 'Vehicle Category'}
                  </label>
                  <select
                    disabled={!canEdit}
                    value={vehicleCategory}
                    onChange={(e) => setVehicleCategory(e.target.value as VehicleCategory)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  >
                    <option value="gas_under_110cc">
                      {isAmharic ? 'ቤንዚን ሞተር (ከ110cc በታች)' : 'Gasoline Engine (<= 110cc)'}
                    </option>
                    <option value="electric">
                      {isAmharic ? 'ኤሌክትሪክ ሞተር ብስክሌት (EV)' : 'Electric Motorcycle (EV)'}
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የሰሌዳ ቁጥር (Plate Number) *' : 'Plate Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    placeholder="e.g. 3-A12345 ወይም 2-54321"
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-yellow-400 font-mono font-black text-sm uppercase focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የሞተር ብስክሌት ብራንድ (Brand)' : 'Motorcycle Brand'}
                  </label>
                  <select
                    disabled={!canEdit}
                    value={motorBrand}
                    onChange={(e) => setMotorBrand(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  >
                    {ETHIOPIAN_MOTOR_BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  {motorBrand === 'Other' && (
                    <input
                      type="text"
                      disabled={!canEdit}
                      placeholder={isAmharic ? 'የብራንድ ስም ያስገቡ...' : 'Enter brand name...'}
                      value={customBrand}
                      onChange={(e) => setCustomBrand(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የሞተር ሞዴል (Model)' : 'Motorcycle Model'}
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    placeholder="e.g. HJ110-2, Boxer 100, HL110"
                    value={motorModel}
                    onChange={(e) => setMotorModel(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የሞተር / ሴሪያል ቁጥር (Engine/Serial No) *' : 'Engine / Serial Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    placeholder="e.g. 152FMH-1234567"
                    value={engineOrSerialNo}
                    onChange={(e) => setEngineOrSerialNo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold uppercase focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    {isAmharic ? 'የሻሲ ቁጥር (Chassis Number - አማራጭ)' : 'Chassis Number (Optional)'}
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    placeholder="e.g. LBB1001293847"
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold uppercase focus:ring-2 focus:ring-yellow-500/40 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DOCUMENTS & PHOTOS */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAmharic
                  ? 'የተያያዙ ፎቶዎችንና ሰነዶችን መተካት፣ ማጉላት ወይም አዲስ ፋይል ማያያዝ ይችላሉ።'
                  : 'Update or replace uploaded identity, driving permit, and vehicle document photos.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DocumentUploadInput
                  id="edit-portrait-input"
                  label={isAmharic ? 'የባለቤት ፎቶ (User Portrait)' : 'Owner Portrait Photo'}
                  photoUrl={userPortraitPhoto}
                  onPhotoChange={setUserPortraitPhoto}
                  isAmharic={isAmharic}
                />

                <DocumentUploadInput
                  id="edit-national-id-input"
                  label={isAmharic ? 'ብሔራዊ መታወቂያ (ፊት)' : 'National ID (Front)'}
                  photoUrl={nationalIdPhoto}
                  onPhotoChange={setNationalIdPhoto}
                  isAmharic={isAmharic}
                />

                <DocumentUploadInput
                  id="edit-national-id-back-input"
                  label={isAmharic ? 'ብሔራዊ መታወቂያ (ጀርባ)' : 'National ID (Back)'}
                  photoUrl={nationalIdBackPhoto}
                  onPhotoChange={setNationalIdBackPhoto}
                  isAmharic={isAmharic}
                />

                <DocumentUploadInput
                  id="edit-driving-license-input"
                  label={isAmharic ? 'የመንጃ ፈቃድ' : 'Driving License'}
                  photoUrl={drivingLicensePhoto}
                  onPhotoChange={setDrivingLicensePhoto}
                  isAmharic={isAmharic}
                />

                <DocumentUploadInput
                  id="edit-driving-permit-input"
                  label={isAmharic ? 'የመንቀሳቀሻ ፈቃድ (ሊብሬ)' : 'Driving Permit / Libre'}
                  photoUrl={drivingPermitPhoto}
                  onPhotoChange={setDrivingPermitPhoto}
                  isAmharic={isAmharic}
                />

                <DocumentUploadInput
                  id="edit-receipt-input"
                  label={isAmharic ? 'የባንክ ደረሰኝ' : 'Bank Receipt Slip'}
                  photoUrl={receiptScreenshot}
                  onPhotoChange={setReceiptScreenshot}
                  isAmharic={isAmharic}
                />
              </div>
            </div>
          )}

          {/* TAB 4: STATUS & ADMIN */}
          {(isSuperAdmin || userRole === 'admin') && activeTab === 'status' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Icon className="material-symbols-outlined text-[18px] text-yellow-600 dark:text-yellow-400">tune</Icon>
                  <span>{isAmharic ? 'የማመልከቻ ፈቃድ ሁኔታ (Permit Status)' : 'Permit Approval Status'}</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'approved', am: 'የተፈቀደ', en: 'Approved', color: 'border-emerald-500 text-emerald-700 dark:text-emerald-300' },
                    { id: 'pending_approval', am: 'የሚጠበቅ', en: 'Pending', color: 'border-amber-500 text-amber-700 dark:text-amber-300' },
                    { id: 'ordered_print', am: 'በሕትመት', en: 'In Print', color: 'border-indigo-500 text-indigo-700 dark:text-indigo-300' },
                    { id: 'printed', am: 'የታተመ', en: 'Printed', color: 'border-blue-500 text-blue-700 dark:text-blue-300' },
                    { id: 'rejected', am: 'ውድቅ', en: 'Rejected', color: 'border-rose-500 text-rose-700 dark:text-rose-300' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setStatus(st.id as any)}
                      className={`p-2.5 rounded-lg border text-center font-bold text-xs transition-all cursor-pointer ${
                        status === st.id
                          ? `bg-slate-900 text-white dark:bg-yellow-500 dark:text-[#0B1E48] ring-2 ring-yellow-500 font-black shadow-xs`
                          : `bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400`
                      }`}
                    >
                      {isAmharic ? st.am : st.en}
                    </button>
                  ))}
                </div>

                {status === 'rejected' && (
                  <div className="space-y-1 pt-2">
                    <label className="font-bold text-rose-700 dark:text-rose-300 block">
                      {isAmharic ? 'የተሰረዘበት / ውድቅ የተደረገበት ምክንያት *' : 'Rejection Reason *'}
                    </label>
                    <textarea
                      rows={2}
                      disabled={!canEdit}
                      placeholder={isAmharic ? 'ምክንያቱን ይግለጹ...' : 'Specify why this permit was rejected...'}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full px-3 py-2 border border-rose-300 dark:border-rose-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Super Admin Secret Visibility Toggle */}
              {isSuperAdmin && (
                <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {isAmharic ? '🔒 መረጃውን ከሌሎች ተጠቃሚዎች ደብቅ' : '🔒 Hide Owner Details From Other Users'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {isAmharic
                        ? 'ይህ ሲበራ ከሱፐር አድሚን ውጭ ያሉ ተጠቃሚዎች የባለቤቱን ስምና ስልክ ማየት አይችሉም።'
                        : 'When enabled, only Super Admins can see the true owner name and phone.'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={hideFromOtherUsers}
                    onChange={(e) => setHideFromOtherUsers(e.target.checked)}
                    className="w-5 h-5 accent-rose-600 rounded cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              id="cancel-edit-btn"
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-lg font-bold cursor-pointer transition-colors"
            >
              {isAmharic ? 'ይቅር / ተመለስ' : 'Cancel'}
            </button>

            <div className="flex items-center gap-2">
              <button
                id="save-edit-registration-btn"
                type="submit"
                disabled={isSubmitting || !canEdit}
                className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0B1E48] text-xs rounded-lg font-black cursor-pointer shadow-md flex items-center gap-1.5 transition-transform active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <Icon className="material-symbols-outlined text-[18px] animate-spin">progress_activity</Icon>
                    <span>{isAmharic ? 'በማስቀመጥ ላይ...' : 'Saving Changes...'}</span>
                  </>
                ) : (
                  <>
                    <Icon className="material-symbols-outlined text-[18px]">save</Icon>
                    <span>{isAmharic ? 'ማሻሻያዎችን አስቀምጥ' : 'Save Changes'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
