export const APP_LOGO = '/logo.png';
export const APP_FLAG = '/flag.jpg';
export const APP_TITLE_AM = 'ባህር ዳር ሞተረኞች ማህበር';
export const APP_TITLE_EN = 'BAHIRDAR MOTORIST ASSOCIATION';

export const BAHIR_DAR_SUBCITIES = [
  { en: 'Fasilo', am: 'ፋሲሎ' },
  { en: 'Dagmawi Minilik', am: 'ዳግማዊ ሚኒሊክ' },
  { en: 'Belay Zeleke', am: 'በላይ ዘለቀ' },
  { en: 'Atse Tewodros', am: 'አጼ ቴወድሮስ' },
  { en: 'Gish Abay', am: 'ግሽ አባይ' },
  { en: 'Tana', am: 'ጣና' },
] as const;

export type UserRole = 'clerk' | 'admin' | 'officer' | 'superadmin';

export type Language = 'am' | 'en';

export type VehicleCategory = 'electric' | 'gas_under_110cc';

export type TermStatus = 'CURRENT' | 'DUE' | 'DELINQUENT';

export interface MotorcycleRegistration {
  id: string;
  fullName: string;
  phone: string;
  userPortraitPhoto?: string;
  userPortraitThumbnail?: string;
  ownerPhoto?: string;
  nationalIdPhoto: string;
  nationalIdBackPhoto?: string;
  drivingLicensePhoto: string;
  drivingPermitPhoto: string;
  vehicleCategory: VehicleCategory;
  serviceCategory?: string;
  motorBrand?: string;
  motorModel?: string;
  chassisNumber?: string;
  engineOrSerialNo: string;
  engineNumber?: string;
  plateNumber: string;
  registrationDate: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'ordered_print' | 'printed';
  qrCodeData: string;
  registeredBy: string;
  rejectionReason?: string;
  lastRejectionReason?: string;
  isCorrection?: boolean;
  subCity?: string;
  bloodGroup?: string;
  hideFromOtherUsers?: boolean;
  receiptNumber?: string;
  paymentAmount?: string;
  receiptScreenshot?: string;
  termStatus?: TermStatus;
  activeTermExpirationDate?: string;
  lastPaymentDate?: string;
  lastReceiptNumber?: string;
  lastPaymentAmount?: string | number;
}

export interface OfficerAssignment {
  id: string;
  officerName: string;
  badgeId: string;
  subCity: string;
  locationName: string;
  shift: 'morning' | 'afternoon' | 'night';
  status: 'active' | 'off_duty' | 'inactive';
  assignedLocation?: string;
  assignedZone?: string;
  assignedSubcity?: string;
  phone?: string;
  shiftHours?: string;
  assignedDate?: string;
}

export interface PrintBatchOrder {
  id: string;
  orderDate: string;
  totalItems: number;
  totalCount?: number;
  registrationIds: string[];
  status: 'pending' | 'in_printing' | 'completed';
  notes: string;
  updatedAt: string;
}

export interface VerificationLog {
  id: string;
  scannedAt: string;
  timestamp?: string;
  plateNumber: string;
  fullName: string;
  driverName?: string;
  phone: string;
  badgeId?: string;
  notes?: string;
  vehicleCategory: VehicleCategory;
  engineOrSerialNo: string;
  permitStatus: 'pending_approval' | 'approved' | 'rejected' | 'ordered_print' | 'printed';
  verificationStatus: 'verified' | 'warning' | 'flagged';
  officerNotes?: string;
  officerBadgeId?: string;
  locationName?: string;
  userPortraitPhoto?: string;
  nationalIdPhoto?: string;
  drivingLicensePhoto?: string;
  drivingPermitPhoto?: string;
  nationalIdBackPhoto?: string;
  registrationId?: string;
}

export interface UnregisteredVehicleReport {
  id: string;
  reportedAt: string;
  plateNumber?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleCategory: VehicleCategory;
  engineOrSerialNo?: string;
  chassisNumber?: string;
  motorBrand?: string;
  subCity: string;
  locationName: string;
  officerBadgeId: string;
  officerName?: string;
  notes: string;
  evidencePhoto?: string;
  status: 'pending' | 'under_investigation' | 'resolved' | 'registered';
  resolutionNotes?: string;
}

export interface SystemUser {
  id?: string;
  uid: string;
  badgeId: string;
  email: string;
  role: UserRole;
  fullName: string;
  subCity?: string;
  status?: 'active' | 'disabled';
  createdAt?: string;
  lastLoginAt?: string;
}

export interface SystemAuditLog {
  id: string;
  timestamp: string;
  actorBadgeId: string;
  actorRole: UserRole;
  action: string;
  details: string;
  ipAddress?: string;
  severity: 'info' | 'warning' | 'critical';
}

export type ScannerResultTheme =
  | 'deep_cobalt_navy'
  | 'warm_ivory_cream'
  | 'soft_ice_blue'
  | 'classic_blue'
  | 'emerald_law'
  | 'tactical_dark'
  | 'imperial_gold'
  | 'modern_clean';

export interface SystemSettings {
  officerName?: string;
  department?: string;
  subCityOffice?: string;
  defaultPrinter?: string;
  cardStockType?: string;
  calendarSystem?: 'ethiopian' | 'gregorian';
  autoPrintQR?: boolean;
  emailAlerts?: boolean;
  security2FA?: boolean;
  highRiskAlerts?: boolean;
  themeMode?: 'light' | 'dark';
  registrationFreeze?: boolean;
  maintenanceMode?: boolean;
  scannerResultTheme?: ScannerResultTheme;
  updatedAt?: string;
  showClerkPermitStatus?: boolean;
  showClerkSubmissionsAction?: boolean;
  showClerkApprovedVehiclesAction?: boolean;
  showClerkNewRegistrationAction?: boolean;
  showClerkEditSubmissionAction?: boolean;
  showClerkQrScanAction?: boolean;
  showClerkPaymentReceiptsAction?: boolean;
  showClerkPaymentKPIs?: boolean;
  showClerkPaymentRecordsTable?: boolean;
  clerkPaymentKPIPermission?: 'allow' | 'view_only' | 'deny';
  clerkPaymentTablePermission?: 'allow' | 'view_only' | 'deny';
  frozenSubCities?: Record<string, boolean>;
  systemResetEpoch?: number;
  lastSystemResetAt?: string;
}

export interface PaymentReceipt {
  id: string;
  receiptNumber: string;
  ownerRegistrationId?: string;
  ownerName: string;
  plateNumber?: string;
  phone?: string;
  paymentDate: string;
  expirationDate: string;
  amount?: number | string;
  receiptScreenshot?: string;
  notes?: string;
  enteredBy: string;
  createdAt: string;
  enteredAt?: string;
  updatedAt?: string;
  status?: string;
  verifiedByCheki?: boolean;
  chekiBank?: string;
}

