-- ============================================================================
-- RAILWAY / POSTGRESQL PRODUCTION DATABASE SCHEMA
-- Application: Bahir Dar Municipal Motorcycle Permit & BMA Authority System
-- Supports: Direct Cloud SQL / PostgreSQL, Docker / Railway Deployments & Local Sync
-- ============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. SYSTEM USERS & AUTHENTICATION
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_users (
    id VARCHAR(128) PRIMARY KEY,
    uid VARCHAR(128) UNIQUE NOT NULL,
    badge_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL CHECK (role IN ('clerk', 'admin', 'officer', 'superadmin')),
    full_name VARCHAR(255) NOT NULL,
    sub_city VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_users_badge_id ON system_users(badge_id);
CREATE INDEX IF NOT EXISTS idx_system_users_email ON system_users(email);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users(role);

-- ----------------------------------------------------------------------------
-- 2. MOTORCYCLE PERMIT REGISTRATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motorcycle_registrations (
    id VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    user_portrait_photo TEXT,
    user_portrait_thumbnail TEXT,
    owner_photo TEXT,
    national_id_photo TEXT NOT NULL,
    national_id_back_photo TEXT,
    driving_license_photo TEXT NOT NULL,
    driving_permit_photo TEXT NOT NULL,
    vehicle_category VARCHAR(50) NOT NULL DEFAULT 'electric' CHECK (vehicle_category IN ('electric', 'gas_under_110cc')),
    service_category VARCHAR(100),
    motor_brand VARCHAR(100),
    motor_model VARCHAR(100),
    chassis_number VARCHAR(100),
    engine_or_serial_no VARCHAR(100) NOT NULL,
    engine_number VARCHAR(100),
    plate_number VARCHAR(50) NOT NULL,
    registration_date VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'ordered_print', 'printed')),
    qr_code_data TEXT NOT NULL,
    registered_by VARCHAR(100) NOT NULL,
    rejection_reason TEXT,
    sub_city VARCHAR(100),
    blood_group VARCHAR(20),
    hide_from_other_users BOOLEAN DEFAULT FALSE,
    receipt_number VARCHAR(100),
    payment_amount VARCHAR(50),
    receipt_screenshot TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registrations_plate_number ON motorcycle_registrations(plate_number);
CREATE INDEX IF NOT EXISTS idx_registrations_engine_no ON motorcycle_registrations(engine_or_serial_no);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON motorcycle_registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_sub_city ON motorcycle_registrations(sub_city);
CREATE INDEX IF NOT EXISTS idx_registrations_registered_by ON motorcycle_registrations(registered_by);
CREATE INDEX IF NOT EXISTS idx_registrations_registration_date ON motorcycle_registrations(registration_date);
CREATE INDEX IF NOT EXISTS idx_registrations_receipt_number ON motorcycle_registrations(receipt_number);

-- ----------------------------------------------------------------------------
-- 3. OFFICER ASSIGNMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS officer_assignments (
    id VARCHAR(128) PRIMARY KEY,
    officer_name VARCHAR(255) NOT NULL,
    badge_id VARCHAR(100) NOT NULL,
    sub_city VARCHAR(100) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    shift VARCHAR(50) NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning', 'afternoon', 'night')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'off_duty', 'inactive')),
    assigned_location VARCHAR(255),
    assigned_zone VARCHAR(100),
    assigned_subcity VARCHAR(100),
    phone VARCHAR(50),
    shift_hours VARCHAR(100),
    assigned_date VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_officer_assignments_badge_id ON officer_assignments(badge_id);
CREATE INDEX IF NOT EXISTS idx_officer_assignments_sub_city ON officer_assignments(sub_city);
CREATE INDEX IF NOT EXISTS idx_officer_assignments_status ON officer_assignments(status);

-- ----------------------------------------------------------------------------
-- 4. PRINT BATCH ORDERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS print_batch_orders (
    id VARCHAR(128) PRIMARY KEY,
    order_date VARCHAR(50) NOT NULL,
    total_items INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    registration_ids JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_printing', 'completed')),
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_print_batch_orders_status ON print_batch_orders(status);
CREATE INDEX IF NOT EXISTS idx_print_batch_orders_order_date ON print_batch_orders(order_date);

-- ----------------------------------------------------------------------------
-- 5. VERIFICATION LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_logs (
    id VARCHAR(128) PRIMARY KEY,
    scanned_at VARCHAR(50) NOT NULL,
    timestamp VARCHAR(50),
    plate_number VARCHAR(50) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    driver_name VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    badge_id VARCHAR(100),
    notes TEXT,
    vehicle_category VARCHAR(50) NOT NULL DEFAULT 'electric',
    engine_or_serial_no VARCHAR(100) NOT NULL,
    permit_status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',
    verification_status VARCHAR(50) NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'warning', 'flagged')),
    officer_notes TEXT,
    officer_badge_id VARCHAR(100),
    location_name VARCHAR(255),
    user_portrait_photo TEXT,
    national_id_photo TEXT,
    driving_license_photo TEXT,
    driving_permit_photo TEXT,
    national_id_back_photo TEXT,
    registration_id VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_logs_plate_number ON verification_logs(plate_number);
CREATE INDEX IF NOT EXISTS idx_verification_logs_officer_badge ON verification_logs(officer_badge_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_scanned_at ON verification_logs(scanned_at);
CREATE INDEX IF NOT EXISTS idx_verification_logs_status ON verification_logs(verification_status);
CREATE INDEX IF NOT EXISTS idx_verification_logs_registration_id ON verification_logs(registration_id);

-- ----------------------------------------------------------------------------
-- 6. UNREGISTERED VEHICLE REPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unregistered_vehicle_reports (
    id VARCHAR(128) PRIMARY KEY,
    reported_at VARCHAR(50) NOT NULL,
    plate_number VARCHAR(50),
    driver_name VARCHAR(255),
    driver_phone VARCHAR(50),
    vehicle_category VARCHAR(50) NOT NULL DEFAULT 'electric',
    engine_or_serial_no VARCHAR(100),
    chassis_number VARCHAR(100),
    motor_brand VARCHAR(100),
    sub_city VARCHAR(100) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    officer_badge_id VARCHAR(100) NOT NULL,
    officer_name VARCHAR(255),
    notes TEXT,
    evidence_photo TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_investigation', 'resolved', 'registered')),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unreg_reports_sub_city ON unregistered_vehicle_reports(sub_city);
CREATE INDEX IF NOT EXISTS idx_unreg_reports_status ON unregistered_vehicle_reports(status);
CREATE INDEX IF NOT EXISTS idx_unreg_reports_officer ON unregistered_vehicle_reports(officer_badge_id);

-- ----------------------------------------------------------------------------
-- 7. PAYMENT RECEIPTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_receipts (
    id VARCHAR(128) PRIMARY KEY,
    receipt_number VARCHAR(100) NOT NULL,
    owner_registration_id VARCHAR(128),
    owner_name VARCHAR(255) NOT NULL,
    plate_number VARCHAR(50),
    phone VARCHAR(50),
    payment_date VARCHAR(50) NOT NULL,
    expiration_date VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) DEFAULT 0,
    receipt_screenshot TEXT,
    notes TEXT,
    entered_by VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'valid',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_receipt_number ON payment_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_plate_number ON payment_receipts(plate_number);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_date ON payment_receipts(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_owner_reg ON payment_receipts(owner_registration_id);

-- ----------------------------------------------------------------------------
-- 8. SYSTEM GLOBAL CONFIGURATION & SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'global_config',
    officer_name VARCHAR(255),
    department VARCHAR(255),
    sub_city_office VARCHAR(255),
    default_printer VARCHAR(255),
    card_stock_type VARCHAR(255),
    calendar_system VARCHAR(50) DEFAULT 'ethiopian',
    auto_print_qr BOOLEAN DEFAULT TRUE,
    email_alerts BOOLEAN DEFAULT TRUE,
    security_2fa BOOLEAN DEFAULT TRUE,
    high_risk_alerts BOOLEAN DEFAULT TRUE,
    theme_mode VARCHAR(50) DEFAULT 'light',
    registration_freeze BOOLEAN DEFAULT FALSE,
    maintenance_mode BOOLEAN DEFAULT FALSE,
    scanner_result_theme VARCHAR(100) DEFAULT 'warm_ivory_cream',
    show_clerk_permit_status BOOLEAN DEFAULT FALSE,
    show_clerk_submissions_action BOOLEAN DEFAULT FALSE,
    show_clerk_approved_vehicles_action BOOLEAN DEFAULT FALSE,
    show_clerk_payment_kpis BOOLEAN DEFAULT FALSE,
    show_clerk_payment_records_table BOOLEAN DEFAULT FALSE,
    clerk_payment_kpi_permission VARCHAR(50) DEFAULT 'allow',
    clerk_payment_table_permission VARCHAR(50) DEFAULT 'allow',
    frozen_sub_cities JSONB DEFAULT '{}'::jsonb,
    system_reset_epoch BIGINT,
    last_system_reset_at VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGS & ACTION TRACKING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    timestamp VARCHAR(50) NOT NULL,
    actor_badge_id VARCHAR(100) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT NOT NULL,
    ip_address VARCHAR(100),
    severity VARCHAR(50) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON system_audit_logs(actor_badge_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON system_audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON system_audit_logs(created_at);

-- ----------------------------------------------------------------------------
-- 10. NOTIFICATION STATES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_states (
    user_scope_id VARCHAR(128) PRIMARY KEY,
    read_ids JSONB DEFAULT '[]'::jsonb,
    last_read_at VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 11. FILE & DOCUMENT STORAGE METADATA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_uploads (
    id VARCHAR(128) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_key VARCHAR(512) NOT NULL UNIQUE,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_type VARCHAR(50) DEFAULT 's3',
    public_url TEXT NOT NULL,
    folder VARCHAR(100) DEFAULT 'general',
    uploaded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_folder ON file_uploads(folder);
CREATE INDEX IF NOT EXISTS idx_file_uploads_key ON file_uploads(file_key);

