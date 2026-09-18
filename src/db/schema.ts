import {
  MotorcycleRegistration,
  OfficerAssignment,
  PrintBatchOrder,
  VerificationLog,
  UnregisteredVehicleReport,
  PaymentReceipt,
  SystemUser,
  SystemAuditLog,
  SystemSettings,
} from '../types';

export const TABLES = {
  REGISTRATIONS: 'motorcycle_registrations',
  OFFICERS: 'officer_assignments',
  PRINT_ORDERS: 'print_batch_orders',
  VERIFICATIONS: 'verification_logs',
  UNREGISTERED_REPORTS: 'unregistered_vehicle_reports',
  PAYMENT_RECEIPTS: 'payment_receipts',
  USERS: 'system_users',
  AUDIT_LOGS: 'system_audit_logs',
  SETTINGS: 'system_settings',
} as const;

export function mapRegistrationToDb(reg: MotorcycleRegistration) {
  return {
    id: reg.id,
    fullName: reg.fullName,
    phone: reg.phone,
    userPortraitPhoto: reg.userPortraitPhoto || null,
    userPortraitThumbnail: reg.userPortraitThumbnail || null,
    ownerPhoto: reg.ownerPhoto || null,
    nationalIdPhoto: reg.nationalIdPhoto,
    nationalIdBackPhoto: reg.nationalIdBackPhoto || null,
    drivingLicensePhoto: reg.drivingLicensePhoto,
    drivingPermitPhoto: reg.drivingPermitPhoto,
    vehicleCategory: reg.vehicleCategory,
    serviceCategory: reg.serviceCategory || null,
    motorBrand: reg.motorBrand || null,
    motorModel: reg.motorModel || null,
    chassisNumber: reg.chassisNumber || (reg.engineOrSerialNo && reg.engineOrSerialNo !== 'N/A' ? reg.engineOrSerialNo : null),
    engineOrSerialNo: reg.engineOrSerialNo || reg.chassisNumber || 'N/A',
    engineNumber: reg.engineNumber || null,
    plateNumber: reg.plateNumber,
    registrationDate: reg.registrationDate,
    status: reg.status || 'pending_approval',
    qrCodeData: reg.qrCodeData,
    registeredBy: reg.registeredBy,
    rejectionReason: reg.rejectionReason || null,
    subCity: reg.subCity || null,
    bloodGroup: reg.bloodGroup || null,
    hideFromOtherUsers: Boolean(reg.hideFromOtherUsers),
    receiptNumber: reg.receiptNumber || null,
    paymentAmount: reg.paymentAmount || null,
    receiptScreenshot: reg.receiptScreenshot || null,
  };
}

export function mapRegistrationFromDb(row: any): MotorcycleRegistration {
  return {
    id: row.id,
    fullName: row.fullName || row.full_name || '',
    phone: row.phone || '',
    userPortraitPhoto: row.userPortraitPhoto || row.user_portrait_photo,
    userPortraitThumbnail: row.userPortraitThumbnail || row.user_portrait_thumbnail,
    ownerPhoto: row.ownerPhoto || row.owner_photo,
    nationalIdPhoto: row.nationalIdPhoto || row.national_id_photo || '',
    nationalIdBackPhoto: row.nationalIdBackPhoto || row.national_id_back_photo,
    drivingLicensePhoto: row.drivingLicensePhoto || row.driving_license_photo || '',
    drivingPermitPhoto: row.drivingPermitPhoto || row.driving_permit_photo || '',
    vehicleCategory: row.vehicleCategory || row.vehicle_category || 'electric',
    serviceCategory: row.serviceCategory || row.service_category,
    motorBrand: row.motorBrand || row.motor_brand,
    motorModel: row.motorModel || row.motor_model,
    chassisNumber: row.chassisNumber || row.chassis_number || row.chassisNo || row.chassis_no || (row.engineOrSerialNo && row.engineOrSerialNo !== 'N/A' ? row.engineOrSerialNo : (row.engine_or_serial_no && row.engine_or_serial_no !== 'N/A' ? row.engine_or_serial_no : undefined)),
    engineOrSerialNo: row.engineOrSerialNo || row.engine_or_serial_no || row.chassisNumber || row.chassis_number || '',
    engineNumber: row.engineNumber || row.engine_number,
    plateNumber: row.plateNumber || row.plate_number || '',
    registrationDate: row.registrationDate || row.registration_date || '',
    status: row.status || 'pending_approval',
    qrCodeData: row.qrCodeData || row.qr_code_data || '',
    registeredBy: row.registeredBy || row.registered_by || '',
    rejectionReason: row.rejectionReason || row.rejection_reason,
    subCity: row.subCity || row.sub_city,
    bloodGroup: row.bloodGroup || row.blood_group,
    hideFromOtherUsers: Boolean(row.hideFromOtherUsers ?? row.hide_from_other_users),
    receiptNumber: row.receiptNumber || row.receipt_number,
    paymentAmount: row.paymentAmount || row.payment_amount,
    receiptScreenshot: row.receiptScreenshot || row.receipt_screenshot,
  };
}

export function mapOfficerToDb(officer: OfficerAssignment) {
  return {
    id: officer.id,
    officerName: officer.officerName,
    badgeId: officer.badgeId,
    subCity: officer.subCity,
    locationName: officer.locationName,
    shift: officer.shift,
    status: officer.status || 'active',
    assignedLocation: officer.assignedLocation || null,
    assignedZone: officer.assignedZone || null,
    assignedSubcity: officer.assignedSubcity || null,
    phone: officer.phone || null,
    shiftHours: officer.shiftHours || null,
    assignedDate: officer.assignedDate || null,
  };
}

export function mapOfficerFromDb(row: any): OfficerAssignment {
  return {
    id: row.id,
    officerName: row.officerName || row.officer_name || '',
    badgeId: row.badgeId || row.badge_id || '',
    subCity: row.subCity || row.sub_city || '',
    locationName: row.locationName || row.location_name || '',
    shift: row.shift || 'morning',
    status: row.status || 'active',
    assignedLocation: row.assignedLocation || row.assigned_location,
    assignedZone: row.assignedZone || row.assigned_zone,
    assignedSubcity: row.assignedSubcity || row.assigned_subcity,
    phone: row.phone,
    shiftHours: row.shiftHours || row.shift_hours,
    assignedDate: row.assignedDate || row.assigned_date,
  };
}

export function mapPrintOrderToDb(order: PrintBatchOrder) {
  return {
    id: order.id,
    orderDate: order.orderDate,
    totalItems: order.totalItems || 0,
    totalCount: order.totalCount || order.totalItems || 0,
    registrationIds: order.registrationIds || [],
    status: order.status || 'pending',
    notes: order.notes || null,
    updatedAt: order.updatedAt || new Date().toISOString(),
  };
}

export function mapPrintOrderFromDb(row: any): PrintBatchOrder {
  return {
    id: row.id,
    orderDate: row.orderDate || row.order_date || '',
    totalItems: row.totalItems ?? row.total_items ?? 0,
    totalCount: row.totalCount ?? row.total_count,
    registrationIds: Array.isArray(row.registrationIds)
      ? row.registrationIds
      : Array.isArray(row.registration_ids)
      ? row.registration_ids
      : typeof row.registration_ids === 'string'
      ? JSON.parse(row.registration_ids || '[]')
      : [],
    status: row.status || 'pending',
    notes: row.notes || '',
    updatedAt: row.updatedAt || row.updated_at || '',
  };
}

export function mapVerificationToDb(log: VerificationLog) {
  return {
    id: log.id,
    scannedAt: log.scannedAt,
    timestamp: log.timestamp || log.scannedAt,
    plateNumber: log.plateNumber,
    fullName: log.fullName,
    driverName: log.driverName || log.fullName,
    phone: log.phone,
    badgeId: log.badgeId || log.officerBadgeId || null,
    notes: log.notes || log.officerNotes || null,
    vehicleCategory: log.vehicleCategory,
    engineOrSerialNo: log.engineOrSerialNo,
    permitStatus: log.permitStatus,
    verificationStatus: log.verificationStatus,
    officerNotes: log.officerNotes || log.notes || null,
    officerBadgeId: log.officerBadgeId || log.badgeId || null,
    locationName: log.locationName || null,
    userPortraitPhoto: log.userPortraitPhoto || null,
    nationalIdPhoto: log.nationalIdPhoto || null,
    drivingLicensePhoto: log.drivingLicensePhoto || null,
    drivingPermitPhoto: log.drivingPermitPhoto || null,
    nationalIdBackPhoto: log.nationalIdBackPhoto || null,
    registrationId: log.registrationId || null,
  };
}

export function mapVerificationFromDb(row: any): VerificationLog {
  return {
    id: row.id,
    scannedAt: row.scannedAt || row.scanned_at || '',
    timestamp: row.timestamp || row.scannedAt || row.scanned_at,
    plateNumber: row.plateNumber || row.plate_number || '',
    fullName: row.fullName || row.full_name || '',
    driverName: row.driverName || row.driver_name,
    phone: row.phone || '',
    badgeId: row.badgeId || row.badge_id || row.officer_badge_id,
    notes: row.notes || row.officer_notes,
    vehicleCategory: row.vehicleCategory || row.vehicle_category || 'electric',
    engineOrSerialNo: row.engineOrSerialNo || row.engine_or_serial_no || '',
    permitStatus: row.permitStatus || row.permit_status || 'pending_approval',
    verificationStatus: row.verificationStatus || row.verification_status || 'verified',
    officerNotes: row.officerNotes || row.officer_notes,
    officerBadgeId: row.officerBadgeId || row.officer_badge_id,
    locationName: row.locationName || row.location_name,
    userPortraitPhoto: row.userPortraitPhoto || row.user_portrait_photo,
    nationalIdPhoto: row.nationalIdPhoto || row.national_id_photo,
    drivingLicensePhoto: row.drivingLicensePhoto || row.driving_license_photo,
    drivingPermitPhoto: row.drivingPermitPhoto || row.driving_permit_photo,
    nationalIdBackPhoto: row.nationalIdBackPhoto || row.national_id_back_photo,
    registrationId: row.registrationId || row.registration_id,
  };
}

export function mapUnregisteredReportToDb(report: UnregisteredVehicleReport) {
  return {
    id: report.id,
    reportedAt: report.reportedAt,
    plateNumber: report.plateNumber || null,
    driverName: report.driverName || null,
    driverPhone: report.driverPhone || null,
    vehicleCategory: report.vehicleCategory,
    engineOrSerialNo: report.engineOrSerialNo || null,
    chassisNumber: report.chassisNumber || null,
    motorBrand: report.motorBrand || null,
    subCity: report.subCity,
    locationName: report.locationName,
    officerBadgeId: report.officerBadgeId,
    officerName: report.officerName || null,
    notes: report.notes,
    evidencePhoto: report.evidencePhoto || null,
    status: report.status || 'pending',
    resolutionNotes: report.resolutionNotes || null,
  };
}

export function mapUnregisteredReportFromDb(row: any): UnregisteredVehicleReport {
  return {
    id: row.id,
    reportedAt: row.reportedAt || row.reported_at || '',
    plateNumber: row.plateNumber || row.plate_number,
    driverName: row.driverName || row.driver_name,
    driverPhone: row.driverPhone || row.driver_phone,
    vehicleCategory: row.vehicleCategory || row.vehicle_category || 'electric',
    engineOrSerialNo: row.engineOrSerialNo || row.engine_or_serial_no,
    chassisNumber: row.chassisNumber || row.chassis_number,
    motorBrand: row.motorBrand || row.motor_brand,
    subCity: row.subCity || row.sub_city || '',
    locationName: row.locationName || row.location_name || '',
    officerBadgeId: row.officerBadgeId || row.officer_badge_id || '',
    officerName: row.officerName || row.officer_name,
    notes: row.notes || '',
    evidencePhoto: row.evidencePhoto || row.evidence_photo,
    status: row.status || 'pending',
    resolutionNotes: row.resolutionNotes || row.resolution_notes,
  };
}

export function mapPaymentReceiptToDb(receipt: PaymentReceipt) {
  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    ownerRegistrationId: receipt.ownerRegistrationId || null,
    ownerName: receipt.ownerName,
    plateNumber: receipt.plateNumber || null,
    phone: receipt.phone || null,
    paymentDate: receipt.paymentDate,
    expirationDate: receipt.expirationDate,
    amount: receipt.amount || 0,
    receiptScreenshot: receipt.receiptScreenshot || null,
    notes: receipt.notes || null,
    enteredBy: receipt.enteredBy,
    status: receipt.status || 'valid',
    createdAt: receipt.createdAt || new Date().toISOString(),
  };
}

export function mapPaymentReceiptFromDb(row: any): PaymentReceipt {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber || row.receipt_number || '',
    ownerRegistrationId: row.ownerRegistrationId || row.owner_registration_id,
    ownerName: row.ownerName || row.owner_name || '',
    plateNumber: row.plateNumber || row.plate_number,
    phone: row.phone,
    paymentDate: row.paymentDate || row.payment_date || '',
    expirationDate: row.expirationDate || row.expiration_date || '',
    amount: row.amount ?? 0,
    receiptScreenshot: row.receiptScreenshot || row.receipt_screenshot,
    notes: row.notes || '',
    enteredBy: row.enteredBy || row.entered_by || '',
    status: row.status || 'valid',
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

export function mapSettingsToDb(settings: SystemSettings) {
  return {
    id: 'global_config',
    officerName: settings.officerName || null,
    department: settings.department || null,
    subCityOffice: settings.subCityOffice || null,
    defaultPrinter: settings.defaultPrinter || null,
    cardStockType: settings.cardStockType || null,
    calendarSystem: settings.calendarSystem || null,
    autoPrintQR: Boolean(settings.autoPrintQR),
    emailAlerts: Boolean(settings.emailAlerts),
    security2FA: Boolean(settings.security2FA),
    highRiskAlerts: Boolean(settings.highRiskAlerts),
    themeMode: settings.themeMode || 'light',
    registrationFreeze: Boolean(settings.registrationFreeze),
    maintenanceMode: Boolean(settings.maintenanceMode),
    scannerResultTheme: settings.scannerResultTheme || 'warm_ivory_cream',
    showClerkPermitStatus: Boolean(settings.showClerkPermitStatus),
    showClerkSubmissionsAction: Boolean(settings.showClerkSubmissionsAction),
    showClerkApprovedVehiclesAction: Boolean(settings.showClerkApprovedVehiclesAction),
    showClerkNewRegistrationAction: settings.showClerkNewRegistrationAction !== undefined ? Boolean(settings.showClerkNewRegistrationAction) : true,
    showClerkEditSubmissionAction: settings.showClerkEditSubmissionAction !== undefined ? Boolean(settings.showClerkEditSubmissionAction) : true,
    showClerkQrScanAction: settings.showClerkQrScanAction !== undefined ? Boolean(settings.showClerkQrScanAction) : true,
    showClerkPaymentReceiptsAction: settings.showClerkPaymentReceiptsAction !== undefined ? Boolean(settings.showClerkPaymentReceiptsAction) : true,
    showClerkPaymentKPIs: Boolean(settings.showClerkPaymentKPIs),
    showClerkPaymentRecordsTable: Boolean(settings.showClerkPaymentRecordsTable),
    clerkPaymentKPIPermission: settings.clerkPaymentKPIPermission || 'allow',
    clerkPaymentTablePermission: settings.clerkPaymentTablePermission || 'allow',
    frozenSubCities: settings.frozenSubCities || {},
    systemResetEpoch: settings.systemResetEpoch ?? null,
    lastSystemResetAt: settings.lastSystemResetAt ?? null,
    updatedAt: settings.updatedAt || new Date().toISOString(),
  };
}

export function mapSettingsFromDb(row: any, defaultSettings: SystemSettings): SystemSettings {
  if (!row) return defaultSettings;
  return {
    officerName: row.officerName ?? row.officer_name ?? defaultSettings.officerName,
    department: row.department ?? defaultSettings.department,
    subCityOffice: row.subCityOffice ?? row.sub_city_office ?? defaultSettings.subCityOffice,
    defaultPrinter: row.defaultPrinter ?? row.default_printer ?? defaultSettings.defaultPrinter,
    cardStockType: row.cardStockType ?? row.card_stock_type ?? defaultSettings.cardStockType,
    calendarSystem: row.calendarSystem ?? row.calendar_system ?? defaultSettings.calendarSystem,
    autoPrintQR: row.autoPrintQR ?? row.auto_print_qr ?? defaultSettings.autoPrintQR,
    emailAlerts: row.emailAlerts ?? row.email_alerts ?? defaultSettings.emailAlerts,
    security2FA: row.security2FA ?? row.security_2fa ?? defaultSettings.security2FA,
    highRiskAlerts: row.highRiskAlerts ?? row.high_risk_alerts ?? defaultSettings.highRiskAlerts,
    themeMode: row.themeMode ?? row.theme_mode ?? defaultSettings.themeMode ?? 'light',
    registrationFreeze: row.registrationFreeze ?? row.registration_freeze ?? defaultSettings.registrationFreeze ?? false,
    maintenanceMode: row.maintenanceMode ?? row.maintenance_mode ?? defaultSettings.maintenanceMode ?? false,
    scannerResultTheme: row.scannerResultTheme ?? row.scanner_result_theme ?? defaultSettings.scannerResultTheme ?? 'warm_ivory_cream',
    showClerkPermitStatus: row.showClerkPermitStatus ?? row.show_clerk_permit_status ?? defaultSettings.showClerkPermitStatus ?? false,
    showClerkSubmissionsAction: row.showClerkSubmissionsAction ?? row.show_clerk_submissions_action ?? defaultSettings.showClerkSubmissionsAction ?? false,
    showClerkApprovedVehiclesAction: row.showClerkApprovedVehiclesAction ?? row.show_clerk_approved_vehicles_action ?? defaultSettings.showClerkApprovedVehiclesAction ?? false,
    showClerkNewRegistrationAction: row.showClerkNewRegistrationAction ?? row.show_clerk_new_registration_action ?? defaultSettings.showClerkNewRegistrationAction ?? true,
    showClerkEditSubmissionAction: row.showClerkEditSubmissionAction ?? row.show_clerk_edit_submission_action ?? defaultSettings.showClerkEditSubmissionAction ?? true,
    showClerkQrScanAction: row.showClerkQrScanAction ?? row.show_clerk_qr_scan_action ?? defaultSettings.showClerkQrScanAction ?? true,
    showClerkPaymentReceiptsAction: row.showClerkPaymentReceiptsAction ?? row.show_clerk_payment_receipts_action ?? defaultSettings.showClerkPaymentReceiptsAction ?? true,
    showClerkPaymentKPIs: row.showClerkPaymentKPIs ?? row.show_clerk_payment_kpis ?? defaultSettings.showClerkPaymentKPIs ?? false,
    showClerkPaymentRecordsTable: row.showClerkPaymentRecordsTable ?? row.show_clerk_payment_records_table ?? defaultSettings.showClerkPaymentRecordsTable ?? false,
    clerkPaymentKPIPermission: row.clerkPaymentKPIPermission ?? row.clerk_payment_kpi_permission ?? defaultSettings.clerkPaymentKPIPermission ?? 'allow',
    clerkPaymentTablePermission: row.clerkPaymentTablePermission ?? row.clerk_payment_table_permission ?? defaultSettings.clerkPaymentTablePermission ?? 'allow',
    frozenSubCities: (typeof row.frozenSubCities === 'object' && row.frozenSubCities !== null)
      ? row.frozenSubCities
      : (typeof row.frozen_sub_cities === 'object' && row.frozen_sub_cities !== null)
      ? row.frozen_sub_cities
      : typeof row.frozen_sub_cities === 'string'
      ? (() => { try { return JSON.parse(row.frozen_sub_cities); } catch { return {}; } })()
      : defaultSettings.frozenSubCities || {},
    systemResetEpoch: row.systemResetEpoch ?? row.system_reset_epoch ?? defaultSettings.systemResetEpoch,
    lastSystemResetAt: row.lastSystemResetAt ?? row.last_system_reset_at ?? defaultSettings.lastSystemResetAt,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

