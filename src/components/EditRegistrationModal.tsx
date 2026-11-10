import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { SectionCard, FieldLabel, ActionTriggerPrimary, ActionTriggerSecondary, SelectField } from './ui/StreamlinedUI';
import { motion } from 'motion/react';
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
} from '../services/dbService';
import { uploadDocumentPhoto } from '../services/storageService';
import { queryClient, queryKeys } from '../services/queryClient';
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
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const canEdit = isAdmin;

  // Wizard Step State (1: Personal, 2: Vehicle, 3: Documents, 4: Status & Finalize)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Owner Information
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [subCity, setSubCity] = useState('Fasilo');
  const [bloodGroup, setBloodGroup] = useState('A+');

  // Step 2: Vehicle Information
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('gas_under_110cc');
  const [plateNumber, setPlateNumber] = useState('');
  const [motorBrand, setMotorBrand] = useState('Haojue');
  const [customBrand, setCustomBrand] = useState('');
  const [motorModel, setMotorModel] = useState('');
  const [engineOrSerialNo, setEngineOrSerialNo] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');

  // Step 3: All 5 Attached Documents & Proof
  const [userPortraitPhoto, setUserPortraitPhoto] = useState('');
  const [nationalIdPhoto, setNationalIdPhoto] = useState('');
  const [nationalIdBackPhoto, setNationalIdBackPhoto] = useState('');
  const [drivingLicensePhoto, setDrivingLicensePhoto] = useState('');
  const [drivingPermitPhoto, setDrivingPermitPhoto] = useState('');
  const [receiptScreenshot, setReceiptScreenshot] = useState('');

  // Step 4: Approval Status & Admin Controls
  const [status, setStatus] = useState<'pending_approval' | 'approved' | 'rejected' | 'ordered_print' | 'printed'>('approved');
  const [rejectionReason, setRejectionReason] = useState('');
  const [hideFromOtherUsers, setHideFromOtherUsers] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
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
      const resolvedChassis = registration.chassisNumber || (registration.engineOrSerialNo && registration.engineOrSerialNo !== 'N/A' ? registration.engineOrSerialNo : '') || '';
      setEngineOrSerialNo(registration.engineOrSerialNo && registration.engineOrSerialNo !== 'N/A' ? registration.engineOrSerialNo : resolvedChassis);
      setChassisNumber(resolvedChassis);

      setUserPortraitPhoto(registration.userPortraitPhoto || (registration as any).user_portrait_photo || (registration as any).ownerPhoto || (registration as any).owner_photo || (registration as any).userPortraitThumbnail || (registration as any).user_portrait_thumbnail || '');
      setNationalIdPhoto(registration.nationalIdPhoto || (registration as any).national_id_photo || (registration as any).nationalId || '');
      setNationalIdBackPhoto(registration.nationalIdBackPhoto || (registration as any).national_id_back_photo || (registration as any).nationalIdBack || '');
      setDrivingLicensePhoto(registration.drivingLicensePhoto || (registration as any).driving_license_photo || (registration as any).driverLicensePhoto || '');
      setDrivingPermitPhoto(registration.drivingPermitPhoto || (registration as any).driving_permit_photo || (registration as any).policePermitPhoto || '');
      setReceiptScreenshot(registration.receiptScreenshot || (registration as any).receipt_screenshot || '');

      setStatus(registration.status || 'approved');
      setRejectionReason(registration.rejectionReason || '');
      setHideFromOtherUsers(!!registration.hideFromOtherUsers);

      setCurrentStep(1);
      setFormError(null);
      setUploadProgressText(null);
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
      setCurrentStep(1);
      return;
    }

    if (!phone.trim()) {
      setFormError(isAmharic ? 'እባክዎን የስልክ ቁጥር ያስገቡ' : 'Please provide a valid phone number');
      setCurrentStep(1);
      return;
    }

    if (!plateNumber.trim() && !chassisNumber.trim() && !engineOrSerialNo.trim()) {
      setFormError(isAmharic ? 'እባክዎን የሰሌዳ ቁጥር ወይም የቻሲስ ቁጥር ያስገቡ' : 'Please provide a plate number or Chasis number');
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setUploadProgressText(isAmharic ? 'ሰነዶችና ፎቶዎች እየተጫኑ ነው...' : 'Uploading documents and photos...');

    try {
      const regId = registration.id;

      // 1. Upload any newly selected/modified base64 or blob documents to storage
      const [
        upPortrait,
        upNatIdFront,
        upNatIdBack,
        upLicense,
        upPermit,
        upReceipt,
      ] = await Promise.all([
        userPortraitPhoto?.startsWith('data:') || userPortraitPhoto?.startsWith('blob:')
          ? uploadDocumentPhoto(userPortraitPhoto, 'permits/portraits', regId)
          : Promise.resolve(userPortraitPhoto || ''),
        nationalIdPhoto?.startsWith('data:') || nationalIdPhoto?.startsWith('blob:')
          ? uploadDocumentPhoto(nationalIdPhoto, 'permits/national_ids', regId)
          : Promise.resolve(nationalIdPhoto || ''),
        nationalIdBackPhoto?.startsWith('data:') || nationalIdBackPhoto?.startsWith('blob:')
          ? uploadDocumentPhoto(nationalIdBackPhoto, 'permits/national_ids', regId)
          : Promise.resolve(nationalIdBackPhoto || ''),
        drivingLicensePhoto?.startsWith('data:') || drivingLicensePhoto?.startsWith('blob:')
          ? uploadDocumentPhoto(drivingLicensePhoto, 'permits/licenses', regId)
          : Promise.resolve(drivingLicensePhoto || ''),
        drivingPermitPhoto?.startsWith('data:') || drivingPermitPhoto?.startsWith('blob:')
          ? uploadDocumentPhoto(drivingPermitPhoto, 'permits/police_permits', regId)
          : Promise.resolve(drivingPermitPhoto || ''),
        receiptScreenshot?.startsWith('data:') || receiptScreenshot?.startsWith('blob:')
          ? uploadDocumentPhoto(receiptScreenshot, 'permits/receipts', regId)
          : Promise.resolve(receiptScreenshot || ''),
      ]);

      setUploadProgressText(isAmharic ? 'ለውጦች በዳታቤዝ እየተመዘገቡ ነው...' : 'Saving updates to database...');

      const finalBrand = motorBrand === 'Other' ? customBrand.trim() || 'Other' : motorBrand;
      const finalChassis = chassisNumber.trim().toUpperCase() || engineOrSerialNo.trim().toUpperCase();

      const updates: Partial<MotorcycleRegistration> & Record<string, any> = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        subCity,
        bloodGroup,
        vehicleCategory,
        plateNumber: plateNumber.trim().toUpperCase(),
        motorBrand: finalBrand,
        motorModel: motorModel.trim(),
        engineOrSerialNo: finalChassis || 'N/A',
        chassisNumber: finalChassis,
        userPortraitPhoto: upPortrait,
        user_portrait_photo: upPortrait,
        userPortraitThumbnail: upPortrait,
        user_portrait_thumbnail: upPortrait,
        ownerPhoto: upPortrait,
        owner_photo: upPortrait,
        nationalIdPhoto: upNatIdFront,
        national_id_photo: upNatIdFront,
        nationalIdBackPhoto: upNatIdBack,
        national_id_back_photo: upNatIdBack,
        drivingLicensePhoto: upLicense,
        driving_license_photo: upLicense,
        drivingPermitPhoto: upPermit,
        driving_permit_photo: upPermit,
        receiptScreenshot: upReceipt,
        receipt_screenshot: upReceipt,
        status,
        rejectionReason: status === 'rejected' ? rejectionReason.trim() : '',
        hideFromOtherUsers: isSuperAdmin ? hideFromOtherUsers : registration.hideFromOtherUsers,
      };

      // 2. Persist update in Database and sync in-memory cache
      const savedRecord = await updateRegistrationInDb(registration.id, updates);

      // 3. Immediately update TanStack Query cache for instant UI reflection
      const fullUpdated: MotorcycleRegistration = {
        ...registration,
        ...updates,
        ...(savedRecord || {}),
        id: registration.id,
      };

      queryClient.setQueryData<MotorcycleRegistration[]>(queryKeys.registrations, (prev) => {
        if (!prev) return [fullUpdated];
        const idx = prev.findIndex((r) => r.id === registration.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = fullUpdated;
          return next;
        }
        return [fullUpdated, ...prev];
      });
      queryClient.setQueryData(queryKeys.registrationById(registration.id), fullUpdated);

      // 4. Audit Log
      await addAuditLogToDb({
        actorBadgeId: userBadgeId || (isSuperAdmin ? 'SUPER-ADMIN' : userRole.toUpperCase()),
        actorRole: userRole,
        action: 'REGISTRATION_UPDATED',
        details: `Updated member registration for ${fullName.trim()} (${plateNumber.trim() || registration.id})`,
        severity: 'info',
      });

      if (onShowToast) {
        onShowToast(
          isAmharic ? 'የአባል መረጃ በተሳካ ሁኔታ ተሻሽሏል' : 'Member record updated successfully',
          'success'
        );
      }

      if (onSaveSuccess) {
        onSaveSuccess(fullUpdated);
      }

      onClose();
    } catch (err: any) {
      console.error('Error updating registration:', err);
      setFormError(err?.message || (isAmharic ? 'መረጃውን ማስተካከል አልተቻለም' : 'Failed to update registration record'));
    } finally {
      setIsSubmitting(false);
      setUploadProgressText(null);
    }
  };

  return (
    <div
      id="edit-registration-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-2 sm:p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/60 bg-surface-container/30">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="edit_document" size={24} className="text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="font-black text-lg text-on-surface tracking-tight">
                {isAmharic ? 'የአባል መረጃ ማሻሻያ' : 'Edit Member Registration'}
              </h3>
              <p className="text-xs text-secondary font-mono mt-0.5 truncate">
                ID: {registration.id} • {registration.fullName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors cursor-pointer disabled:opacity-50"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        {/* RBAC Warning Banner if user is not authorized */}
        {!canEdit && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200">
            <Icon className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-400 shrink-0">lock</Icon>
            <div>
              <p className="font-black">
                {isAmharic ? 'የማስተካከል ፈቃድ አልተሰጠም' : 'Editing Disabled'}
              </p>
              <p className="text-[11px] mt-0.5 text-slate-600 dark:text-slate-400">
                {isAmharic
                  ? 'የአባላት መረጃን የማስተካከል ፈቃድ የለዎትም።'
                  : 'Editing is disabled for your user role.'}
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

        {/* In-Flight Upload Status Banner */}
        {uploadProgressText && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary font-bold flex items-center gap-2">
            <Icon className="material-symbols-outlined text-[18px] animate-spin">progress_activity</Icon>
            <span>{uploadProgressText}</span>
          </div>
        )}

        {/* 4-Step Stepper Navigation */}
        <div className="px-6 py-3.5 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border-b border-outline-variant/60">
          {[
            { step: 1, am: '1. የግል መረጃ', en: '1. Personal' },
            { step: 2, am: '2. የተሽከርካሪ', en: '2. Vehicle' },
            { step: 3, am: '3. 5ቱ ሰነዶች', en: '3. Documents (5)' },
            { step: 4, am: '4. ሁኔታና ማጠቃለያ', en: '4. Status' },
          ].map((item) => (
            <button
              key={item.step}
              type="button"
              disabled={isSubmitting}
              onClick={() => setCurrentStep(item.step as any)}
              className="flex flex-col items-center gap-1 cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                  currentStep === item.step
                    ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30'
                    : currentStep > item.step
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {currentStep > item.step ? (
                  <Icon className="material-symbols-outlined text-[16px]">check</Icon>
                ) : (
                  item.step
                )}
              </div>
              <span
                className={`text-[10px] sm:text-[11px] font-bold ${
                  currentStep === item.step
                    ? 'text-primary'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {isAmharic ? item.am : item.en}
              </span>
            </button>
          ))}
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* STEP 1: PERSONAL INFORMATION */}
          {currentStep === 1 && (
            <SectionCard className="space-y-4">
              <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-2">
                <Icon className="material-symbols-outlined text-[18px] text-primary">person</Icon>
                <span className="font-bold text-xs text-on-surface">
                  {isAmharic ? 'የባለቤት መረጃ' : 'Owner Information'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel required>{isAmharic ? 'የባለቤት ሙሉ ስም' : 'Owner Full Name'}</FieldLabel>
                  <input
                    type="text"
                    required
                    disabled={!canEdit || isSubmitting}
                    placeholder={isAmharic ? 'ምሳሌ፡ አበበ በቀለ ከበደ' : 'e.g. Abebe Bekele Kebede'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-medium focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>

                <div>
                  <FieldLabel required>{isAmharic ? 'ስልክ ቁጥር' : 'Phone Number'}</FieldLabel>
                  <input
                    type="tel"
                    required
                    disabled={!canEdit || isSubmitting}
                    placeholder="0911000000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-medium focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</FieldLabel>
                  <SelectField
                    value={subCity}
                    disabled={!canEdit || isSubmitting}
                    onChange={(e) => setSubCity(e.target.value)}
                    className="w-full"
                  >
                    {BAHIR_DAR_SUBCITIES.map((sc) => (
                      <option key={sc.en} value={sc.en}>
                        {isAmharic ? sc.am : sc.en}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div>
                  <FieldLabel>{isAmharic ? 'የደም ዓይነት' : 'Blood Group'}</FieldLabel>
                  <SelectField
                    value={bloodGroup}
                    disabled={!canEdit || isSubmitting}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full"
                  >
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>
            </SectionCard>
          )}

          {/* STEP 2: VEHICLE INFORMATION */}
          {currentStep === 2 && (
            <SectionCard className="space-y-4">
              <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-2">
                <Icon className="material-symbols-outlined text-[18px] text-primary">two_wheeler</Icon>
                <span className="font-bold text-xs text-on-surface">
                  {isAmharic ? 'የተሽከርካሪ መረጃ' : 'Vehicle Specifications'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel required>{isAmharic ? 'የተሽከርካሪ ምድብ' : 'Vehicle Category'}</FieldLabel>
                  <SelectField
                    value={vehicleCategory}
                    disabled={!canEdit || isSubmitting}
                    onChange={(e) => setVehicleCategory(e.target.value as VehicleCategory)}
                    className="w-full"
                  >
                    <option value="gas_under_110cc">{isAmharic ? 'ቤንዚን ከ 110ሲሲ በታች' : 'Gasoline (<110cc)'}</option>
                    <option value="gas_over_110cc">{isAmharic ? 'ቤንዚን ከ 110ሲሲ በላይ' : 'Gasoline (>110cc)'}</option>
                    <option value="electric_scooter">{isAmharic ? 'ኤሌክትሪክ ስኩተር' : 'Electric Scooter'}</option>
                    <option value="delivery_bike">{isAmharic ? 'የዴሊቨሪ ሞተር' : 'Delivery Bike'}</option>
                  </SelectField>
                </div>

                <div>
                  <FieldLabel required>{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</FieldLabel>
                  <input
                    type="text"
                    required
                    disabled={!canEdit || isSubmitting}
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    placeholder="3-12345"
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-mono font-bold focus:ring-2 focus:ring-primary/20 disabled:opacity-60 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>{isAmharic ? 'የሞተር ብስክሌት ብራንድ' : 'Motorcycle Brand'}</FieldLabel>
                  <SelectField
                    value={motorBrand}
                    disabled={!canEdit || isSubmitting}
                    onChange={(e) => setMotorBrand(e.target.value)}
                    className="w-full"
                  >
                    {ETHIOPIAN_MOTOR_BRANDS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </SelectField>
                  {motorBrand === 'Other' && (
                    <input
                      type="text"
                      disabled={!canEdit || isSubmitting}
                      value={customBrand}
                      onChange={(e) => setCustomBrand(e.target.value)}
                      placeholder={isAmharic ? 'የብራንድ ስም ያስገቡ' : 'Specify brand name'}
                      className="mt-2 w-full px-3 py-2 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface text-xs font-medium focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                    />
                  )}
                </div>

                <div>
                  <FieldLabel>{isAmharic ? 'የሞተር ሞዴል' : 'Motorcycle Model'}</FieldLabel>
                  <input
                    type="text"
                    disabled={!canEdit || isSubmitting}
                    value={motorModel}
                    onChange={(e) => setMotorModel(e.target.value)}
                    placeholder="e.g. HJ110-2"
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-medium focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>{isAmharic ? 'የቻሲስ ቁጥር (Chasis No)' : 'Chassis Number'}</FieldLabel>
                  <input
                    type="text"
                    disabled={!canEdit || isSubmitting}
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value)}
                    placeholder="e.g. LC6PC... / VIN"
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-mono font-bold focus:ring-2 focus:ring-primary/20 disabled:opacity-60 uppercase"
                  />
                </div>

                <div>
                  <FieldLabel>{isAmharic ? 'የሞተር/ሴሪያል ቁጥር' : 'Engine / Serial No'}</FieldLabel>
                  <input
                    type="text"
                    disabled={!canEdit || isSubmitting}
                    value={engineOrSerialNo}
                    onChange={(e) => setEngineOrSerialNo(e.target.value)}
                    placeholder="e.g. 152FMH..."
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-mono font-bold focus:ring-2 focus:ring-primary/20 disabled:opacity-60 uppercase"
                  />
                </div>
              </div>
            </SectionCard>
          )}

          {/* STEP 3: ALL 5 ATTACHED DOCUMENTS & PROOFS */}
          {currentStep === 3 && (
            <SectionCard className="space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-[18px] text-primary">attach_file</Icon>
                  <span className="font-bold text-xs text-on-surface">
                    {isAmharic ? 'የተያያዙ 5ቱ ሰነዶችና ፎቶዎች' : 'All 5 Attached Documents & Photos'}
                  </span>
                </div>
                <span className="text-[11px] text-secondary font-mono">5 Files</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Owner Passport Photo */}
                <DocumentUploadInput
                  id="edit-portrait-input"
                  label={isAmharic ? '1. ጉርድ ፎቶ (የባለቤት)' : '1. Passport Photo (Owner)'}
                  photoUrl={userPortraitPhoto}
                  onPhotoChange={setUserPortraitPhoto}
                  isAmharic={isAmharic}
                  folder="permits/portraits"
                />

                {/* 2. National ID (Front) */}
                <DocumentUploadInput
                  id="edit-national-id-front-input"
                  label={isAmharic ? '2. ብሔራዊ መታወቂያ (ፊት)' : '2. National ID (Front)'}
                  photoUrl={nationalIdPhoto}
                  onPhotoChange={setNationalIdPhoto}
                  isAmharic={isAmharic}
                  folder="permits/national_ids"
                />

                {/* 3. National ID (Back) */}
                <DocumentUploadInput
                  id="edit-national-id-back-input"
                  label={isAmharic ? '3. ብሔራዊ መታወቂያ (ጀርባ)' : '3. National ID (Back)'}
                  photoUrl={nationalIdBackPhoto}
                  onPhotoChange={setNationalIdBackPhoto}
                  isAmharic={isAmharic}
                  folder="permits/national_ids"
                />

                {/* 4. Driving License */}
                <DocumentUploadInput
                  id="edit-license-input"
                  label={isAmharic ? '4. መንጃ ፈቃድ' : '4. Driving License'}
                  photoUrl={drivingLicensePhoto}
                  onPhotoChange={setDrivingLicensePhoto}
                  isAmharic={isAmharic}
                  folder="permits/licenses"
                />

                {/* 5. Police Permit (Libre) */}
                <DocumentUploadInput
                  id="edit-permit-input"
                  label={isAmharic ? '5. የፖሊስ ፈቃድ (ሊብሬ)' : '5. Police Permit (Libre)'}
                  photoUrl={drivingPermitPhoto}
                  onPhotoChange={setDrivingPermitPhoto}
                  isAmharic={isAmharic}
                  folder="permits/police_permits"
                />

                {/* Payment Receipt Screenshot (Optional) */}
                <DocumentUploadInput
                  id="edit-receipt-input"
                  label={isAmharic ? 'የክፍያ ደረሰኝ (አማራጭ)' : 'Payment Receipt (Optional)'}
                  photoUrl={receiptScreenshot}
                  onPhotoChange={setReceiptScreenshot}
                  isAmharic={isAmharic}
                  folder="permits/receipts"
                />
              </div>
            </SectionCard>
          )}

          {/* STEP 4: PERMIT STATUS & FINAL REVIEWS */}
          {currentStep === 4 && (
            <SectionCard className="space-y-4">
              <div className="flex items-center gap-2 border-b border-outline-variant/60 pb-2">
                <Icon className="material-symbols-outlined text-[18px] text-primary">verified_user</Icon>
                <span className="font-bold text-xs text-on-surface">
                  {isAmharic ? 'የፈቃድ ሁኔታና ማጠቃለያ' : 'Permit Status & Review'}
                </span>
              </div>

              <div>
                <FieldLabel>{isAmharic ? 'የማመልከቻ ፈቃድ ሁኔታ' : 'Permit Approval Status'}</FieldLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {[
                    { id: 'approved', am: 'የተፈቀደ (Approved)', en: 'Approved' },
                    { id: 'pending_approval', am: 'የሚጠበቅ (Pending)', en: 'Pending' },
                    { id: 'rejected', am: 'ውድቅ (Rejected)', en: 'Rejected' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      disabled={!canEdit || isSubmitting}
                      onClick={() => setStatus(st.id as any)}
                      className={`p-2.5 rounded-lg border text-center font-bold text-xs transition-colors cursor-pointer ${
                        status === st.id
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-surface-container border-outline-variant text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {isAmharic ? st.am : st.en}
                    </button>
                  ))}
                </div>
              </div>

              {status === 'rejected' && (
                <div>
                  <FieldLabel required>{isAmharic ? 'ውድቅ የተደረገበት ምክንያት' : 'Rejection Reason'}</FieldLabel>
                  <textarea
                    rows={2}
                    disabled={!canEdit || isSubmitting}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder={isAmharic ? 'የውድቅ የተደረገበትን ምክንያት ያስገቡ...' : 'Explain why this registration was rejected...'}
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface text-xs focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
              )}

              {/* SuperAdmin Visibility Toggle */}
              {isSuperAdmin && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-outline-variant bg-surface-container/40">
                  <div>
                    <span className="font-bold text-xs text-on-surface block">
                      {isAmharic ? 'ከሌሎች ተጠቃሚዎች ደብቅ' : 'Hide from Other Users'}
                    </span>
                    <span className="text-[11px] text-secondary block mt-0.5">
                      {isAmharic
                        ? 'ለሱፐር አድሚን ብቻ የሚታይ ሚስጥራዊ ተሽከርካሪ መዝገብ'
                        : 'Confidential record visible only to SuperAdmin'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={isSubmitting}
                    checked={hideFromOtherUsers}
                    onChange={(e) => setHideFromOtherUsers(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                </div>
              )}

              {/* Review Summary Card */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-secondary">
                  <span>{isAmharic ? 'ባለቤት፡' : 'Owner:'}</span>
                  <span className="font-bold text-on-surface">{fullName || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-secondary">
                  <span>{isAmharic ? 'ሰሌዳ፡' : 'Plate:'}</span>
                  <span className="font-mono font-bold text-on-surface">{plateNumber || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-secondary">
                  <span>{isAmharic ? 'ክፍለ ከተማ፡' : 'Sub-City:'}</span>
                  <span className="font-bold text-on-surface">{subCity}</span>
                </div>
                <div className="flex items-center justify-between text-secondary">
                  <span>{isAmharic ? 'የተያያዙ ሰነዶች ብዛት፡' : 'Uploaded Files:'}</span>
                  <span className="font-bold text-primary">
                    {[userPortraitPhoto, nationalIdPhoto, nationalIdBackPhoto, drivingLicensePhoto, drivingPermitPhoto].filter(Boolean).length} / 5
                  </span>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between p-4 border-t border-outline-variant bg-surface-container/20">
          <ActionTriggerSecondary
            icon="arrow_back"
            label={isAmharic ? 'ተመለስ' : 'Back'}
            onClick={() => setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as any) : 1))}
            disabled={isSubmitting || currentStep === 1}
            className="text-xs"
          />

          {currentStep < 4 ? (
            <ActionTriggerPrimary
              icon="arrow_forward"
              label={isAmharic ? 'ቀጣይ' : 'Next'}
              onClick={() => setCurrentStep((prev) => (prev < 4 ? ((prev + 1) as any) : 4))}
              disabled={isSubmitting}
              className="text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !canEdit}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Icon className="material-symbols-outlined text-[16px] animate-spin">progress_activity</Icon>
                  <span>{isAmharic ? 'እየተቀመጠ ነው...' : 'Saving Changes...'}</span>
                </>
              ) : (
                <>
                  <Icon className="material-symbols-outlined text-[16px]">save</Icon>
                  <span>{isAmharic ? 'ማሻሻያዎችን አስቀምጥ' : 'Save Changes'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
