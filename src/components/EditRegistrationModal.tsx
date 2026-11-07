import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { SectionCard, FieldLabel, ActionTriggerPrimary, ActionTriggerSecondary, SelectField } from './ui/StreamlinedUI';
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
import { formatEthiopianDate } from '../utils/ethiopianCalendar';

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
  // Edit permission is strictly for Admin / SuperAdmin
  const canEdit = isAdmin;

  // Form State
  // Form State
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
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
      const resolvedChassis = registration.chassisNumber || (registration.engineOrSerialNo && registration.engineOrSerialNo !== 'N/A' ? registration.engineOrSerialNo : '') || '';
      setEngineOrSerialNo(registration.engineOrSerialNo && registration.engineOrSerialNo !== 'N/A' ? registration.engineOrSerialNo : resolvedChassis);
      setChassisNumber(resolvedChassis);

      setUserPortraitPhoto(registration.userPortraitPhoto || (registration as any).ownerPhoto || '');
      setNationalIdPhoto(registration.nationalIdPhoto || '');
      setNationalIdBackPhoto(registration.nationalIdBackPhoto || '');
      setDrivingLicensePhoto(registration.drivingLicensePhoto || '');
      setDrivingPermitPhoto(registration.drivingPermitPhoto || '');
      setReceiptScreenshot(registration.receiptScreenshot || '');

      setStatus(registration.status || 'approved');
      setRejectionReason(registration.rejectionReason || '');
      setHideFromOtherUsers(!!registration.hideFromOtherUsers);

      setCurrentStep(1);
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

    try {
      const finalBrand = motorBrand === 'Other' ? customBrand.trim() || 'Other' : motorBrand;
      const finalChassis = chassisNumber.trim().toUpperCase() || engineOrSerialNo.trim().toUpperCase();

      const updates: Partial<MotorcycleRegistration> = {
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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-6 sm:pt-10 md:pt-14 pb-8 p-2 sm:p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/60 bg-surface-container/30">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="edit_document" size={24} className="text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="font-black text-lg text-on-surface tracking-tight">
                {isAmharic ? 'የአባል መረጃ ማሻሻያ' : 'Edit Member Registration'}
              </h3>
              <p className="text-xs text-secondary font-mono mt-0.5">
                ID: {registration.id} • {registration.fullName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors cursor-pointer"
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

        {/* Wizard Stepper */}
        <div className="px-6 py-4 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${currentStep >= step ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'}`}>
                {step}
              </div>
              <span className={`text-[10px] font-bold ${currentStep >= step ? 'text-primary' : 'text-slate-500'}`}>Step {step}</span>
            </div>
          ))}
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {currentStep === 1 && (
            <SectionCard className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel required>{isAmharic ? 'የባለቤት ሙሉ ስም' : 'Owner Full Name'}</FieldLabel>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
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
                    disabled={!canEdit}
                    placeholder="0911234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-mono font-bold focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>{isAmharic ? 'ክፍለ ከተማ' : 'Sub-City'}</FieldLabel>
                  <SelectField value={subCity} onChange={(e) => setSubCity(e.target.value)} className="w-full">
                    {BAHIR_DAR_SUBCITIES.map((sc) => (
                      <option key={sc.en} value={sc.en}>
                        {isAmharic ? sc.am : sc.en}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div>
                  <FieldLabel>{isAmharic ? 'የደም አይነት' : 'Blood Group'}</FieldLabel>
                  <SelectField value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className="w-full">
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
          {currentStep === 2 && (
            <SectionCard className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>{isAmharic ? 'የተሽከርካሪ አይነት' : 'Vehicle Category'}</FieldLabel>
                  <SelectField value={vehicleCategory} onChange={(e) => setVehicleCategory(e.target.value as any)} className="w-full">
                    <option value="gas_under_110cc">{isAmharic ? 'ቤንዚን' : 'Gasoline'}</option>
                    <option value="electric">{isAmharic ? 'ኤሌክትሪክ' : 'Electric'}</option>
                  </SelectField>
                </div>
                <div>
                  <FieldLabel required>{isAmharic ? 'የሰሌዳ ቁጥር' : 'Plate Number'}</FieldLabel>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-mono font-bold focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>{isAmharic ? 'የሞተር ብስክሌት ብራንድ' : 'Motorcycle Brand'}</FieldLabel>
                  <SelectField value={motorBrand} onChange={(e) => setMotorBrand(e.target.value)} className="w-full">
                    {ETHIOPIAN_MOTOR_BRANDS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <FieldLabel>{isAmharic ? 'የሞተር ሞዴል' : 'Motorcycle Model'}</FieldLabel>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={motorModel}
                    onChange={(e) => setMotorModel(e.target.value)}
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-lg bg-surface-container/70 text-on-surface font-medium focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
              </div>
            </SectionCard>
          )}
          {currentStep === 3 && (
            <SectionCard className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DocumentUploadInput id="edit-portrait-input" label={isAmharic ? 'የባለቤት ፎቶ' : 'Owner Photo'} photoUrl={userPortraitPhoto} onPhotoChange={setUserPortraitPhoto} isAmharic={isAmharic} />
                <DocumentUploadInput id="edit-national-id-input" label={isAmharic ? 'ብሔራዊ መታወቂያ (ፊት)' : 'National ID (Front)'} photoUrl={nationalIdPhoto} onPhotoChange={setNationalIdPhoto} isAmharic={isAmharic} />
              </div>
            </SectionCard>
          )}
          {currentStep === 4 && (
            <SectionCard className="space-y-4">
              <FieldLabel>{isAmharic ? 'የማመልከቻ ፈቃድ ሁኔታ' : 'Permit Approval Status'}</FieldLabel>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'approved', am: 'የተፈቀደ', en: 'Approved' },
                  { id: 'pending_approval', am: 'የሚጠበቅ', en: 'Pending' },
                  { id: 'rejected', am: 'ውድቅ', en: 'Rejected' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatus(st.id as any)}
                    className={`p-2.5 rounded-lg border text-center font-bold text-xs ${status === st.id ? 'bg-primary text-white' : 'bg-surface-container border-outline-variant text-on-surface'}`}
                  >
                    {isAmharic ? st.am : st.en}
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between p-4 border-t border-outline-variant">
          <ActionTriggerSecondary icon="arrow_back" label={isAmharic ? 'ተመለስ' : 'Back'} onClick={() => setCurrentStep((prev) => (prev > 1 ? (prev - 1) as any : 1))} className="text-xs" />
          {currentStep < 4 ? (
            <ActionTriggerPrimary icon="arrow_forward" label={isAmharic ? 'ቀጣይ' : 'Next'} onClick={() => setCurrentStep((prev) => (prev < 4 ? (prev + 1) as any : 4))} className="text-xs" />
          ) : (
            <ActionTriggerPrimary icon="save" label={isAmharic ? 'ማሻሻያዎችን አስቀምጥ' : 'Save Changes'} onClick={handleSave} className="text-xs" />
          )}
        </div>
      </motion.div>
    </div>
  );
};
