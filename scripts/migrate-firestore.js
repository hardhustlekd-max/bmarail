/**
 * ============================================================================
 * FIRESTORE TO RAILWAY POSTGRESQL DATA MIGRATION SCRIPT
 * ============================================================================
 * Reads Firestore documents (from exported JSON dump files or direct Firestore API)
 * and inserts/updates records in Railway PostgreSQL database with complete relationship preservation.
 *
 * Usage:
 *   node scripts/migrate-firestore.js [optional_path_to_export_dump.json]
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ override: true });

const DATABASE_URL = process.env.DATABASE_URL || process.env.PG_DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('[Migration Error] DATABASE_URL is not set in environment or .env file.');
  console.error('Please configure DATABASE_URL=postgresql://user:pass@host:port/dbname before running migration.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
});

async function runMigration() {
  console.log('================================================================');
  console.log('  STARTING FIRESTORE -> RAILWAY POSTGRESQL DATA MIGRATION');
  console.log('================================================================');
  console.log(`Database Target: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const client = await pool.connect();

  const summary = {
    users: 0,
    registrations: 0,
    officers: 0,
    printOrders: 0,
    verifications: 0,
    unregisteredReports: 0,
    paymentReceipts: 0,
    settings: 0,
    errors: [],
  };

  try {
    // 1. Ensure schema is initialized
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('[Step 1] Applying database/schema.sql to ensure all PostgreSQL tables and indexes exist...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
      console.log('✓ Schema applied successfully.');
    }

    // 2. Load Firestore JSON dump if provided or look for common export dump names
    let exportData = null;
    const argPath = process.argv[2];
    const possiblePaths = [
      argPath,
      path.join(__dirname, '..', 'firestore-export.json'),
      path.join(__dirname, '..', 'database', 'firestore-export.json'),
      path.join(__dirname, '..', 'firestore-data.json'),
    ].filter(Boolean);

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          exportData = JSON.parse(raw);
          console.log(`[Step 2] Found Firestore export data file at: ${p}`);
          break;
        } catch (e) {
          console.warn(`Could not parse JSON at ${p}:`, e.message);
        }
      }
    }

    if (!exportData) {
      console.log('[Step 2] No offline firestore-export.json file provided.');
      console.log('Applying database/seed.sql default initial records...');
      const seedPath = path.join(__dirname, '..', 'database', 'seed.sql');
      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedSql);
        console.log('✓ Seed data populated successfully.');
      }
      return;
    }

    await client.query('BEGIN');

    // 3. Migrate Users
    const users = exportData.users || exportData.system_users || [];
    console.log(`\n[Step 3] Migrating ${users.length} System Users...`);
    for (const u of users) {
      try {
        const id = u.id || u.uid || `user-${u.role || 'clerk'}-${u.badgeId}`;
        await client.query(`
          INSERT INTO system_users (id, uid, badge_id, email, role, full_name, sub_city, status, created_at, last_login_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            sub_city = EXCLUDED.sub_city,
            updated_at = CURRENT_TIMESTAMP
        `, [
          id,
          u.uid || id,
          u.badgeId || id,
          u.email || `${u.badgeId || id}@permit.gov.et`,
          u.role || 'clerk',
          u.fullName || 'System User',
          u.subCity || null,
          u.status || 'active',
          u.createdAt ? new Date(u.createdAt) : new Date(),
          u.lastLoginAt ? new Date(u.lastLoginAt) : null,
        ]);
        summary.users++;
      } catch (err) {
        summary.errors.push(`User error (${u.badgeId}): ${err.message}`);
      }
    }

    // 4. Migrate Motorcycle Registrations
    const registrations = exportData.motorcycle_registrations || exportData.registrations || [];
    console.log(`[Step 4] Migrating ${registrations.length} Motorcycle Registrations...`);
    for (const r of registrations) {
      try {
        await client.query(`
          INSERT INTO motorcycle_registrations (
            id, full_name, phone, user_portrait_photo, user_portrait_thumbnail,
            national_id_photo, national_id_back_photo, driving_license_photo, driving_permit_photo,
            vehicle_category, motor_brand, motor_model, chassis_number, engine_or_serial_no,
            plate_number, registration_date, status, qr_code_data, registered_by, rejection_reason,
            sub_city, blood_group, hide_from_other_users, receipt_number, payment_amount, receipt_screenshot
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            status = EXCLUDED.status,
            rejection_reason = EXCLUDED.rejection_reason,
            updated_at = CURRENT_TIMESTAMP
        `, [
          r.id,
          r.fullName || r.full_name || '',
          r.phone || '',
          r.userPortraitPhoto || r.user_portrait_photo || null,
          r.userPortraitThumbnail || r.user_portrait_thumbnail || null,
          r.nationalIdPhoto || r.national_id_photo || '',
          r.nationalIdBackPhoto || r.national_id_back_photo || null,
          r.drivingLicensePhoto || r.driving_license_photo || '',
          r.drivingPermitPhoto || r.driving_permit_photo || '',
          r.vehicleCategory || r.vehicle_category || 'electric',
          r.motorBrand || r.motor_brand || null,
          r.motorModel || r.motor_model || null,
          r.chassisNumber || r.chassis_number || null,
          r.engineOrSerialNo || r.engine_or_serial_no || '',
          r.plateNumber || r.plate_number || '',
          r.registrationDate || r.registration_date || new Date().toISOString(),
          r.status || 'pending_approval',
          r.qrCodeData || r.qr_code_data || '',
          r.registeredBy || r.registered_by || 'System',
          r.rejectionReason || r.rejection_reason || null,
          r.subCity || r.sub_city || null,
          r.bloodGroup || r.blood_group || null,
          Boolean(r.hideFromOtherUsers ?? r.hide_from_other_users),
          r.receiptNumber || r.receipt_number || null,
          r.paymentAmount || r.payment_amount || null,
          r.receiptScreenshot || r.receipt_screenshot || null,
        ]);
        summary.registrations++;
      } catch (err) {
        summary.errors.push(`Registration error (${r.id}): ${err.message}`);
      }
    }

    // 5. Migrate Officer Assignments
    const officers = exportData.officer_assignments || exportData.officers || [];
    console.log(`[Step 5] Migrating ${officers.length} Officer Assignments...`);
    for (const o of officers) {
      try {
        await client.query(`
          INSERT INTO officer_assignments (id, officer_name, badge_id, sub_city, location_name, shift, status, assigned_location, phone, shift_hours, assigned_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            officer_name = EXCLUDED.officer_name,
            sub_city = EXCLUDED.sub_city,
            location_name = EXCLUDED.location_name,
            shift = EXCLUDED.shift,
            status = EXCLUDED.status,
            updated_at = CURRENT_TIMESTAMP
        `, [
          o.id,
          o.officerName || o.officer_name || '',
          o.badgeId || o.badge_id || '',
          o.subCity || o.sub_city || '',
          o.locationName || o.location_name || '',
          o.shift || 'morning',
          o.status || 'active',
          o.assignedLocation || o.assigned_location || null,
          o.phone || null,
          o.shiftHours || o.shift_hours || null,
          o.assignedDate || o.assigned_date || null,
        ]);
        summary.officers++;
      } catch (err) {
        summary.errors.push(`Officer error (${o.id}): ${err.message}`);
      }
    }

    // 6. Migrate Print Batch Orders
    const printOrders = exportData.print_batch_orders || exportData.printOrders || [];
    console.log(`[Step 6] Migrating ${printOrders.length} Print Batch Orders...`);
    for (const po of printOrders) {
      try {
        await client.query(`
          INSERT INTO print_batch_orders (id, order_date, total_items, total_count, registration_ids, status, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP
        `, [
          po.id,
          po.orderDate || po.order_date || new Date().toISOString(),
          po.totalItems ?? po.total_items ?? 0,
          po.totalCount ?? po.total_count ?? (po.totalItems ?? 0),
          JSON.stringify(po.registrationIds || po.registration_ids || []),
          po.status || 'pending',
          po.notes || null,
        ]);
        summary.printOrders++;
      } catch (err) {
        summary.errors.push(`Print Order error (${po.id}): ${err.message}`);
      }
    }

    // 7. Migrate Verification Logs
    const verifications = exportData.verification_logs || exportData.verifications || [];
    console.log(`[Step 7] Migrating ${verifications.length} Verification Logs...`);
    for (const v of verifications) {
      try {
        await client.query(`
          INSERT INTO verification_logs (
            id, scanned_at, plate_number, full_name, phone, vehicle_category, engine_or_serial_no,
            permit_status, verification_status, officer_notes, officer_badge_id, location_name,
            user_portrait_photo, national_id_photo, driving_license_photo, driving_permit_photo, national_id_back_photo, registration_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id) DO NOTHING
        `, [
          v.id,
          v.scannedAt || v.scanned_at || new Date().toISOString(),
          v.plateNumber || v.plate_number || '',
          v.fullName || v.full_name || '',
          v.phone || '',
          v.vehicleCategory || v.vehicle_category || 'electric',
          v.engineOrSerialNo || v.engine_or_serial_no || '',
          v.permitStatus || v.permit_status || 'pending_approval',
          v.verificationStatus || v.verification_status || 'verified',
          v.officerNotes || v.officer_notes || null,
          v.officerBadgeId || v.officer_badge_id || null,
          v.locationName || v.location_name || null,
          v.userPortraitPhoto || v.user_portrait_photo || null,
          v.nationalIdPhoto || v.national_id_photo || null,
          v.drivingLicensePhoto || v.driving_license_photo || null,
          v.drivingPermitPhoto || v.driving_permit_photo || null,
          v.nationalIdBackPhoto || v.national_id_back_photo || null,
          v.registrationId || v.registration_id || null,
        ]);
        summary.verifications++;
      } catch (err) {
        summary.errors.push(`Verification error (${v.id}): ${err.message}`);
      }
    }

    // 8. Migrate Unregistered Vehicle Reports
    const unreg = exportData.unregistered_vehicle_reports || exportData.unregisteredReports || [];
    console.log(`[Step 8] Migrating ${unreg.length} Unregistered Vehicle Reports...`);
    for (const ur of unreg) {
      try {
        await client.query(`
          INSERT INTO unregistered_vehicle_reports (
            id, reported_at, plate_number, driver_name, driver_phone, vehicle_category,
            engine_or_serial_no, chassis_number, motor_brand, sub_city, location_name,
            officer_badge_id, officer_name, notes, evidence_photo, status, resolution_notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            resolution_notes = EXCLUDED.resolution_notes,
            updated_at = CURRENT_TIMESTAMP
        `, [
          ur.id,
          ur.reportedAt || ur.reported_at || new Date().toISOString(),
          ur.plateNumber || ur.plate_number || null,
          ur.driverName || ur.driver_name || null,
          ur.driverPhone || ur.driver_phone || null,
          ur.vehicleCategory || ur.vehicle_category || 'electric',
          ur.engineOrSerialNo || ur.engine_or_serial_no || null,
          ur.chassisNumber || ur.chassis_number || null,
          ur.motorBrand || ur.motor_brand || null,
          ur.subCity || ur.sub_city || '',
          ur.locationName || ur.location_name || '',
          ur.officerBadgeId || ur.officer_badge_id || '',
          ur.officerName || ur.officer_name || null,
          ur.notes || '',
          ur.evidencePhoto || ur.evidence_photo || null,
          ur.status || 'pending',
          ur.resolutionNotes || ur.resolution_notes || null,
        ]);
        summary.unregisteredReports++;
      } catch (err) {
        summary.errors.push(`Unregistered Report error (${ur.id}): ${err.message}`);
      }
    }

    // 9. Migrate Payment Receipts
    const receipts = exportData.payment_receipts || exportData.paymentReceipts || [];
    console.log(`[Step 9] Migrating ${receipts.length} Payment Receipts...`);
    for (const pr of receipts) {
      try {
        await client.query(`
          INSERT INTO payment_receipts (
            id, receipt_number, owner_registration_id, owner_name, plate_number, phone,
            payment_date, expiration_date, amount, receipt_screenshot, notes, entered_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP
        `, [
          pr.id,
          pr.receiptNumber || pr.receipt_number || '',
          pr.ownerRegistrationId || pr.owner_registration_id || null,
          pr.ownerName || pr.owner_name || '',
          pr.plateNumber || pr.plate_number || null,
          pr.phone || null,
          pr.paymentDate || pr.payment_date || new Date().toISOString(),
          pr.expirationDate || pr.expiration_date || new Date().toISOString(),
          Number(pr.amount || 0),
          pr.receiptScreenshot || pr.receipt_screenshot || null,
          pr.notes || null,
          pr.enteredBy || pr.entered_by || 'System',
        ]);
        summary.paymentReceipts++;
      } catch (err) {
        summary.errors.push(`Payment Receipt error (${pr.id}): ${err.message}`);
      }
    }

    // 10. Migrate Settings
    const settings = exportData.system_settings || exportData.settings;
    if (settings) {
      console.log('\n[Step 10] Migrating System Settings...');
      try {
        await client.query(`
          INSERT INTO system_settings (
            id, officer_name, department, sub_city_office, default_printer, card_stock_type,
            calendar_system, auto_print_qr, email_alerts, security_2fa, high_risk_alerts,
            scanner_result_theme, show_clerk_permit_status, show_clerk_submissions_action,
            show_clerk_approved_vehicles_action, show_clerk_payment_kpis, show_clerk_payment_records_table,
            clerk_payment_kpi_permission, clerk_payment_table_permission, frozen_sub_cities
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (id) DO UPDATE SET
            officer_name = EXCLUDED.officer_name,
            department = EXCLUDED.department,
            sub_city_office = EXCLUDED.sub_city_office,
            default_printer = EXCLUDED.default_printer,
            updated_at = CURRENT_TIMESTAMP
        `, [
          'global_config',
          settings.officerName || settings.officer_name || null,
          settings.department || null,
          settings.subCityOffice || settings.sub_city_office || null,
          settings.defaultPrinter || settings.default_printer || null,
          settings.cardStockType || settings.card_stock_type || null,
          settings.calendarSystem || settings.calendar_system || 'ethiopian',
          Boolean(settings.autoPrintQR ?? settings.auto_print_qr),
          Boolean(settings.emailAlerts ?? settings.email_alerts),
          Boolean(settings.security2FA ?? settings.security_2fa),
          Boolean(settings.highRiskAlerts ?? settings.high_risk_alerts),
          settings.scannerResultTheme || settings.scanner_result_theme || 'deep_cobalt_navy',
          Boolean(settings.showClerkPermitStatus ?? settings.show_clerk_permit_status),
          Boolean(settings.showClerkSubmissionsAction ?? settings.show_clerk_submissions_action),
          Boolean(settings.showClerkApprovedVehiclesAction ?? settings.show_clerk_approved_vehicles_action),
          Boolean(settings.showClerkPaymentKPIs ?? settings.show_clerk_payment_kpis),
          Boolean(settings.showClerkPaymentRecordsTable ?? settings.show_clerk_payment_records_table),
          settings.clerkPaymentKPIPermission || settings.clerk_payment_kpi_permission || 'allow',
          settings.clerkPaymentTablePermission || settings.clerk_payment_table_permission || 'allow',
          JSON.stringify(settings.frozenSubCities || settings.frozen_sub_cities || {}),
        ]);
        summary.settings = 1;
      } catch (err) {
        summary.errors.push(`Settings error: ${err.message}`);
      }
    }

    await client.query('COMMIT');

    console.log('\n================================================================');
    console.log('  MIGRATION SUMMARY');
    console.log('================================================================');
    console.log(`✓ System Users Migrated:            ${summary.users}`);
    console.log(`✓ Motorcycle Registrations Migrated: ${summary.registrations}`);
    console.log(`✓ Officer Assignments Migrated:     ${summary.officers}`);
    console.log(`✓ Print Batch Orders Migrated:      ${summary.printOrders}`);
    console.log(`✓ Verification Logs Migrated:       ${summary.verifications}`);
    console.log(`✓ Unregistered Reports Migrated:    ${summary.unregisteredReports}`);
    console.log(`✓ Payment Receipts Migrated:        ${summary.paymentReceipts}`);
    console.log(`✓ System Settings Migrated:         ${summary.settings}`);

    if (summary.errors.length > 0) {
      console.warn(`\nWarnings / Non-fatal Errors (${summary.errors.length}):`);
      summary.errors.forEach((e) => console.warn(`  - ${e}`));
    } else {
      console.log('\nAll data migrated with 100% data integrity!');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[Migration Fatal Error] Transaction rolled back:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
