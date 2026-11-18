import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { WorkspaceDrawerSection, FieldLabel, ActionTriggerPrimary, ActionTriggerSecondary, SelectField, Stepper } from './ui/StreamlinedUI';
import { motion, AnimatePresence } from 'motion/react';
import {
  BACKDROP_VARIANTS,
  MODAL_CONTENT_VARIANTS,
  POPOVER_TRANSITION,
  STEP_TRANSITION,
  TACTILE_SPRING,
  TAP_SCALE,
} from '../utils/motionPresets';
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

      setStatus(registration.status || 'approved');
      setRejectionReason(registration.rejectionReason || '');
      setHideFromOtherUsers(!!registration.hideFromOtherUsers);

      setCurrentStep(1);
      setFormError(null);
      setUploadProgressText(null);
    }
  }, [registration]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !registration) return null;

  const inputFieldClass =
    'w-full min-h-[38px] px-3 py-1.5 border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg bg-[#F7F9FC] dark:bg-[#24303F] text-xs sm:text-sm text-[#1C2434] dark:text-white font-semibold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-60';

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
    <motion.div
      id="edit-registration-modal-backdrop"
      role="dialog"
      aria-modal="true"
      variants={BACKDROP_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={POPOVER_TRANSITION}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/65 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 overflow-hidden"
    >
      <motion.div
        variants={MODAL_CONTENT_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={TACTILE_SPRING}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#1C2434] border-0 sm:border border-[#E2E8F0] dark:border-[#2E3A47] rounded-none sm:rounded-xl max-w-3xl w-full h-full h-[100dvh] sm:h-[88vh] max-h-full max-h-[100dvh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Harmonized Sticky Header matching Information Drawer */}
        <header className="px-4 sm:px-6 py-3.5 bg-white dark:bg-[#1C2434] border-b border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="edit_document" size={22} className="text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-[#1C2434] dark:text-white truncate">
                {isAmharic ? 'የአባል መረጃ ማሻሻያ' : 'Edit Member Registration'}
              </h3>
              <p className="mt-0.5 text-xs text-[#64748B] dark:text-[#8A99AD] font-medium font-mono truncate">
                ID: {registration.id} · {registration.fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={isAmharic ? 'ዝጋ' : 'Close'}
            title={isAmharic ? 'ዝጋ' : 'Close'}
            className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-[#24303F] text-[#64748B] hover:text-[#1C2434] dark:text-[#8A99AD] dark:hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        {/* 4-Step Flush Stepper Navigation */}
        <Stepper<1 | 2 | 3 | 4>
          steps={[
            { id: 1, label: isAmharic ? 'የግል መረጃ' : 'Personal' },
            { id: 2, label: isAmharic ? 'ተሽከርካሪ' : 'Vehicle' },
            { id: 3, label: isAmharic ? 'ሰነዶች (5)' : 'Documents (5)' },
            { id: 4, label: isAmharic ? 'ሁኔታ' : 'Status' },
          ]}
          currentStep={currentStep}
          onStepClick={(stepId) => setCurrentStep(stepId)}
          disabled={isSubmitting}
          ariaLabel={isAmharic ? 'የማስተካከያ ደረጃዎች' : 'Edit registration steps'}
        />

        {/* Scrollable Body matching WorkspaceSideDrawer */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5 overscroll-contain min-h-0 touch-scroll">
          {/* RBAC Warning Banner if user is not authorized */}
          {!canEdit && (
            <div className="p-3 bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg flex items-start gap-2.5 text-xs text-[#1C2434] dark:text-[#DEE4EE]">
              <Icon className="material-symbols-outlined text-icon-md text-[#64748B] dark:text-[#8A99AD] shrink-0">lock</Icon>
              <div>
                <p className="font-bold">
                  {isAmharic ? 'የማስተካከል ፈቃድ አልተሰጠም' : 'Editing Disabled'}
                </p>
                <p className="text-11 mt-0.5 text-[#64748B] dark:text-[#8A99AD]">
                  {isAmharic
                    ? 'የአባላት መረጃን የማስተካከል ፈቃድ የለዎትም።'
                    : 'Editing is disabled for your user role.'}
                </p>
              </div>
            </div>
          )}

          {/* Form Error Banner */}
          {formError && (
            <div className="p-3 bg-[#FB5454]/10 border border-[#FB5454]/30 rounded-lg text-xs text-[#FB5454] flex items-center gap-2">
              <Icon className="material-symbols-outlined text-icon-md shrink-0">error</Icon>
              <span className="font-semibold text-[#1C2434] dark:text-[#DEE4EE]">{formError}</span>
            </div>
          )}

          {/* In-Flight Upload Status Banner */}
          {uploadProgressText && (
            <div className="p-3 bg-white dark:bg-[#1C2434] border border-primary/30 rounded-lg text-xs text-primary font-bold flex items-center gap-2">
              <Icon className="material-symbols-outlined text-icon-md animate-spin shrink-0">progress_activity</Icon>
              <span>{uploadProgressText}</span>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {/* STEP 1: PERSONAL INFORMATION */}
            {currentStep === 1 && (
              <motion.div
                key="edit-step-1"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={STEP_TRANSITION}
              >
                <WorkspaceDrawerSection
                  icon="person"
                  title={isAmharic ? 'የባለቤት መረጃ' : 'Owner & Member Identity'}
                >
                  <div className="space-y-3.5">
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
                          className={inputFieldClass}
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
                          className={`${inputFieldClass} font-mono`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <FieldLabel htmlFor="edit-subcity-select">{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</FieldLabel>
                        <SelectField
                          id="edit-subcity-select"
                          value={subCity}
                          disabled={!canEdit || isSubmitting}
                          onChange={(e) => setSubCity(e.target.value)}
                          className="w-full [&>select]:min-h-[38px] [&>select]:bg-[#F7F9FC] dark:[&>select]:bg-[#24303F] [&>select]:font-semibold"
                        >
                          {BAHIR_DAR_SUBCITIES.map((sc) => (
                            <option key={sc.en} value={sc.en}>
                              {isAmharic ? sc.am : sc.en}
                            </option>
                          ))}
                        </SelectField>
                      </div>

                      <div>
                        <FieldLabel htmlFor="edit-bloodgroup-select">{isAmharic ? 'የደም ዓይነት' : 'Blood Group'}</FieldLabel>
                        <SelectField
                          id="edit-bloodgroup-select"
                          value={bloodGroup}
                          disabled={!canEdit || isSubmitting}
                          onChange={(e) => setBloodGroup(e.target.value)}
                          className="w-full [&>select]:min-h-[38px] [&>select]:bg-[#F7F9FC] dark:[&>select]:bg-[#24303F] [&>select]:font-semibold"
                        >
                          {BLOOD_GROUPS.map((bg) => (
                            <option key={bg} value={bg}>
                              {bg}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                    </div>
                  </div>
                </WorkspaceDrawerSection>
              </motion.div>
            )}

            {/* STEP 2: VEHICLE INFORMATION */}
            {currentStep === 2 && (
              <motion.div
                key="edit-step-2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={STEP_TRANSITION}
              >
                <WorkspaceDrawerSection
                  icon="two_wheeler"
                  title={isAmharic ? 'የተሽከርካሪ መረጃ' : 'Vehicle Specifications'}
                >
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <FieldLabel htmlFor="edit-vehicle-category-select" required>{isAmharic ? 'የተሽከርካሪ ምድብ' : 'Vehicle Category'}</FieldLabel>
                        <SelectField
                          id="edit-vehicle-category-select"
                          value={vehicleCategory}
                          disabled={!canEdit || isSubmitting}
                          onChange={(e) => setVehicleCategory(e.target.value as VehicleCategory)}
                          className="w-full [&>select]:min-h-[38px] [&>select]:bg-[#F7F9FC] dark:[&>select]:bg-[#24303F] [&>select]:font-semibold"
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
                          className={`${inputFieldClass} font-mono font-bold uppercase`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <FieldLabel htmlFor="edit-motor-brand-select">{isAmharic ? 'የሞተር ብስክሌት ብራንድ' : 'Motorcycle Brand'}</FieldLabel>
                        <SelectField
                          id="edit-motor-brand-select"
                          value={motorBrand}
                          disabled={!canEdit || isSubmitting}
                          onChange={(e) => setMotorBrand(e.target.value)}
                          className="w-full [&>select]:min-h-[38px] [&>select]:bg-[#F7F9FC] dark:[&>select]:bg-[#24303F] [&>select]:font-semibold"
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
                            className={`mt-2 ${inputFieldClass}`}
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
                          className={inputFieldClass}
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
                          className={`${inputFieldClass} font-mono font-bold uppercase`}
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
                          className={`${inputFieldClass} font-mono font-bold uppercase`}
                        />
                      </div>
                    </div>
                  </div>
                </WorkspaceDrawerSection>
              </motion.div>
            )}

            {/* STEP 3: ALL 5 ATTACHED DOCUMENTS & PROOFS */}
            {currentStep === 3 && (
              <motion.div
                key="edit-step-3"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={STEP_TRANSITION}
              >
                <WorkspaceDrawerSection
                  icon="folder_open"
                  title={isAmharic ? 'የተያያዙ 5ቱ ሰነዶችና ፎቶዎች' : 'Attached Documents & Photos'}
                  rightSlot={
                    <span className="text-11 text-[#64748B] dark:text-[#8A99AD] font-mono tabular-nums">
                      {[userPortraitPhoto, nationalIdPhoto, nationalIdBackPhoto, drivingLicensePhoto, drivingPermitPhoto].filter(Boolean).length} / 5
                    </span>
                  }
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                  </div>
                </WorkspaceDrawerSection>
              </motion.div>
            )}

            {/* STEP 4: PERMIT STATUS & FINAL REVIEWS */}
            {currentStep === 4 && (
              <motion.div
                key="edit-step-4"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={STEP_TRANSITION}
              >
                <WorkspaceDrawerSection
                  icon="verified_user"
                  title={isAmharic ? 'የፈቃድ ሁኔታና ማጠቃለያ' : 'Permit Status & Review'}
                >
                  <div className="space-y-3.5">
                    <div>
                      <FieldLabel>{isAmharic ? 'የማመልከቻ ፈቃድ ሁኔታ' : 'Permit Approval Status'}</FieldLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                        {[
                          { id: 'approved', am: 'የተፈቀደ (Approved)', en: 'Approved' },
                          { id: 'pending_approval', am: 'የሚጠበቅ (Pending)', en: 'Pending' },
                          { id: 'rejected', am: 'ውድቅ (Rejected)', en: 'Rejected' },
                        ].map((st) => (
                          <motion.button
                            key={st.id}
                            type="button"
                            data-motion-control="true"
                            whileTap={TAP_SCALE}
                            transition={TACTILE_SPRING}
                            disabled={!canEdit || isSubmitting}
                            onClick={() => setStatus(st.id as any)}
                            className={`min-h-[40px] p-2.5 rounded-lg border text-center font-bold text-xs transition-colors cursor-pointer touch-manipulation ${
                              status === st.id
                                ? 'bg-primary text-on-primary border-primary shadow-2xs'
                                : 'bg-[#F7F9FC] dark:bg-[#24303F] border-[#E2E8F0] dark:border-[#2E3A47] text-[#1C2434] dark:text-[#DEE4EE] hover:border-primary/50'
                            }`}
                          >
                            {isAmharic ? st.am : st.en}
                          </motion.button>
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
                          className="w-full px-3 py-2 border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </div>
                    )}

                    {/* SuperAdmin Visibility Toggle */}
                    {isSuperAdmin && (
                      <label className="flex items-center justify-between gap-3 p-3 min-h-[44px] rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] cursor-pointer touch-manipulation">
                        <div>
                          <span className="font-bold text-xs text-[#1C2434] dark:text-white block">
                            {isAmharic ? 'ከሌሎች ተጠቃሚዎች ደብቅ' : 'Hide from Other Users'}
                          </span>
                          <span className="text-11 text-[#64748B] dark:text-[#8A99AD] block mt-0.5">
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
                          className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer shrink-0"
                        />
                      </label>
                    )}

                    {/* Review Summary Grid matching refactored Information Drawer */}
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 pt-3.5 border-t border-[#E2E8F0] dark:border-[#2E3A47]">
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-[#64748B] dark:text-[#8A99AD] block">
                          {isAmharic ? 'ባለቤት' : 'Owner'}
                        </span>
                        <span className="text-xs sm:text-[13px] font-bold text-[#1C2434] dark:text-white block truncate mt-0.5">
                          {fullName || '—'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-[#64748B] dark:text-[#8A99AD] block">
                          {isAmharic ? 'ሰሌዳ' : 'Plate'}
                        </span>
                        <span className="text-xs sm:text-[13px] font-mono font-extrabold text-[#1C2434] dark:text-white block truncate mt-0.5 tabular-nums">
                          {plateNumber || '—'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-[#64748B] dark:text-[#8A99AD] block">
                          {isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}
                        </span>
                        <span className="text-xs sm:text-[13px] font-bold text-[#1C2434] dark:text-white block truncate mt-0.5">
                          {subCity}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-[#64748B] dark:text-[#8A99AD] block">
                          {isAmharic ? 'የተያያዙ ሰነዶች' : 'Uploaded Files'}
                        </span>
                        <span className="text-xs sm:text-[13px] font-mono font-bold text-primary block truncate mt-0.5 tabular-nums">
                          {[userPortraitPhoto, nationalIdPhoto, nationalIdBackPhoto, drivingLicensePhoto, drivingPermitPhoto].filter(Boolean).length} / 5
                        </span>
                      </div>
                    </div>
                  </div>
                </WorkspaceDrawerSection>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sticky Footer matching WorkspaceSideDrawer */}
        <footer className="px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))] bg-white dark:bg-[#1C2434] border-t border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-between gap-2 shrink-0">
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
            <ActionTriggerPrimary
              icon={isSubmitting ? 'progress_activity' : 'save'}
              label={
                isSubmitting
                  ? isAmharic ? 'እየተቀመጠ ነው...' : 'Saving Changes...'
                  : isAmharic ? 'ማሻሻያዎችን አስቀምጥ' : 'Save Changes'
              }
              onClick={handleSave as any}
              disabled={isSubmitting || !canEdit}
              className="text-xs"
            />
          )}
        </footer>
      </motion.div>
    </motion.div>
  );
};
