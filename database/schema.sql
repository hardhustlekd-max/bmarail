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
    phone VARCHAR(50),
    email VARCHAR(255),
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
CREATE INDEX IF NOT EXISTS idx_system_users_phone ON system_users(phone);
CREATE INDEX IF NOT EXISTS idx_system_users_email ON system_users(email);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users(role);

-- ----------------------------------------------------------------------------
-- 2. MOTORCYCLE PERMIT REGISTRATIONS
-- All registration_date, last_payment_date, and active_term_expiration_date fields
-- default strictly to the Ethiopian Calendar (YYYY-MM-DD, e.g., 2019-01-22).
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
    registration_date VARCHAR(50) NOT NULL, -- Ethiopian Calendar Date (YYYY-MM-DD)
    status VARCHAR(50) NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'ordered_print', 'printed')),
    qr_code_data TEXT NOT NULL,
    registered_by VARCHAR(100) NOT NULL,
    rejection_reason TEXT,
    last_rejection_reason TEXT,
    is_correction BOOLEAN DEFAULT FALSE,
    sub_city VARCHAR(100),
    email VARCHAR(255),
    blood_group VARCHAR(20),
    hide_from_other_users BOOLEAN DEFAULT FALSE,
    receipt_number VARCHAR(100),
    payment_amount VARCHAR(50),
    receipt_screenshot TEXT,
    term_status VARCHAR(50) DEFAULT 'CURRENT',
    active_term_expiration_date VARCHAR(50), -- Ethiopian Calendar Date (YYYY-MM-DD)
    last_payment_date VARCHAR(50), -- Ethiopian Calendar Date (YYYY-MM-DD)
    last_receipt_number VARCHAR(100),
    last_payment_amount VARCHAR(50),
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
-- 5. VERIFICATION LOGS (scanned_at and timestamp default to Ethiopian datetime)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_logs (
    id VARCHAR(128) PRIMARY KEY,
    scanned_at VARCHAR(50) NOT NULL, -- Ethiopian Datetime (YYYY-MM-DD HH:mm:ss)
    timestamp VARCHAR(50), -- Ethiopian Datetime (YYYY-MM-DD HH:mm:ss)
    plateNumber VARCHAR(50),
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
-- 6. UNREGISTERED VEHICLE REPORTS (reported_at defaults to Ethiopian datetime)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unregistered_vehicle_reports (
    id VARCHAR(128) PRIMARY KEY,
    reported_at VARCHAR(50) NOT NULL, -- Ethiopian Datetime (YYYY-MM-DD HH:mm:ss)
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
-- 7. PAYMENT RECEIPTS (payment_date & expiration_date default to Ethiopian calendar)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_receipts (
    id VARCHAR(128) PRIMARY KEY,
    receipt_number VARCHAR(100) NOT NULL,
    owner_registration_id VARCHAR(128),
    owner_name VARCHAR(255) NOT NULL,
    plate_number VARCHAR(50),
    phone VARCHAR(50),
    payment_date VARCHAR(50) NOT NULL, -- Ethiopian Calendar Date (YYYY-MM-DD)
    expiration_date VARCHAR(50) NOT NULL, -- Ethiopian Calendar Date (YYYY-MM-DD)
    amount NUMERIC(12, 2) DEFAULT 0,
    vehicle_category VARCHAR(50) DEFAULT 'electric',
    receipt_screenshot TEXT,
    notes TEXT,
    entered_by VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'valid',
    verified_by_cheki BOOLEAN DEFAULT FALSE,
    cheki_bank VARCHAR(100),
    entered_at VARCHAR(50), -- Ethiopian Datetime (YYYY-MM-DD HH:mm:ss)
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
    show_clerk_new_registration_action BOOLEAN DEFAULT TRUE,
    show_clerk_edit_submission_action BOOLEAN DEFAULT TRUE,
    show_clerk_qr_scan_action BOOLEAN DEFAULT TRUE,
    show_clerk_payment_receipts_action BOOLEAN DEFAULT TRUE,
    show_clerk_payment_kpis BOOLEAN DEFAULT FALSE,
    show_clerk_payment_records_table BOOLEAN DEFAULT FALSE,
    clerk_payment_kpi_permission VARCHAR(50) DEFAULT 'allow',
    clerk_payment_table_permission VARCHAR(50) DEFAULT 'allow',
    frozen_sub_cities JSONB DEFAULT '{}'::jsonb,
    system_reset_epoch BIGINT,
    last_system_reset_at VARCHAR(50),
    role_permissions JSONB DEFAULT '{}'::jsonb,
    role_definitions JSONB DEFAULT '[]'::jsonb,
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
    id VARCHAR(128) PRIMARY KEY,
    user_scope_id VARCHAR(128),
    read_ids JSONB DEFAULT '[]'::jsonb,
    cleared_ids JSONB DEFAULT '[]'::jsonb,
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

-- ----------------------------------------------------------------------------
-- 12. WRITE-SIDE ACTIONS & EVENT LOG (HYBRID EVENT-DRIVEN ARCHITECTURE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actions (
    id VARCHAR(128) PRIMARY KEY,
    action_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    actor_id VARCHAR(100),
    actor_badge_id VARCHAR(100),
    actor_role VARCHAR(50),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_actions_action_type ON actions(action_type);
CREATE INDEX IF NOT EXISTS idx_actions_entity_id ON actions(entity_id);
CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at);

-- ----------------------------------------------------------------------------
-- 13. MATERIALIZED KPI METRICS (PRE-AGGREGATED WRITE-SIDE VIEW)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_metrics (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'system_summary',
    total_users INTEGER DEFAULT 0,
    admin_users INTEGER DEFAULT 0,
    disabled_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    total_permits INTEGER DEFAULT 0,
    pending_permits INTEGER DEFAULT 0,
    approved_permits INTEGER DEFAULT 0,
    printed_permits INTEGER DEFAULT 0,
    rejected_permits INTEGER DEFAULT 0,
    today_submissions INTEGER DEFAULT 0,
    total_revenue NUMERIC(14, 2) DEFAULT 0,
    total_receipts INTEGER DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ETB',
    total_verifications INTEGER DEFAULT 0,
    verified_logs INTEGER DEFAULT 0,
    warning_verifications INTEGER DEFAULT 0,
    illegal_verifications INTEGER DEFAULT 0,
    total_unregistered INTEGER DEFAULT 0,
    pending_unregistered INTEGER DEFAULT 0,
    resolved_unregistered INTEGER DEFAULT 0,
    active_officers INTEGER DEFAULT 0,
    last_action_id VARCHAR(128),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 14. MATERIALIZED NOTIFICATIONS (EVENT-DRIVEN NOTIFICATION VIEW)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materialized_notifications (
    id VARCHAR(128) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    title_am VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NOT NULL,
    description_am TEXT,
    description_en TEXT,
    action_page VARCHAR(100),
    action_tab VARCHAR(100),
    entity_id VARCHAR(128),
    icon VARCHAR(50) DEFAULT 'notifications',
    icon_bg VARCHAR(100),
    badge_label_am VARCHAR(100),
    badge_label_en VARCHAR(100),
    badge_bg VARCHAR(100),
    badge_text VARCHAR(100),
    target_role VARCHAR(50) DEFAULT 'all',
    target_subcity VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_materialized_notif_active ON materialized_notifications(is_active);
CREATE INDEX IF NOT EXISTS idx_materialized_notif_type ON materialized_notifications(type);
CREATE INDEX IF NOT EXISTS idx_materialized_notif_target_role ON materialized_notifications(target_role);

-- ----------------------------------------------------------------------------
-- 15. DATABASE TRIGGER: AUTO-UPDATE KPI TABLE ON ACTION INSERT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_action_kpi_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_amount NUMERIC(14, 2);
    v_prev_status TEXT;
    v_new_status TEXT;
    v_verif_status TEXT;
    v_role TEXT;
    v_user_status TEXT;
BEGIN
    -- Ensure system_summary row exists in kpi_metrics
    INSERT INTO kpi_metrics (id) 
    VALUES ('system_summary') 
    ON CONFLICT (id) DO NOTHING;

    -- Extract common payload values safely
    v_prev_status := NEW.payload->>'previous_status';
    v_new_status := NEW.payload->>'new_status';
    v_verif_status := NEW.payload->>'verification_status';
    v_role := NEW.payload->>'role';
    v_user_status := NEW.payload->>'status';
    
    IF NEW.payload ? 'amount' THEN
        BEGIN
            v_amount := (NEW.payload->>'amount')::NUMERIC(14, 2);
        EXCEPTION WHEN OTHERS THEN
            v_amount := 0;
        END;
    ELSE
        v_amount := 0;
    END IF;

    -- Update KPI metrics table based on action_type
    IF NEW.action_type = 'REGISTRATION_CREATED' THEN
        UPDATE kpi_metrics
        SET total_permits = total_permits + 1,
            pending_permits = pending_permits + 1,
            today_submissions = today_submissions + 1,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

        -- Materialize notification for pending approval
        INSERT INTO materialized_notifications (
            id, type, title_am, title_en, description_am, description_en,
            action_page, action_tab, entity_id, icon, icon_bg,
            badge_label_am, badge_label_en, badge_bg, badge_text, target_role, is_active
        ) VALUES (
            'notif-reg-' || NEW.entity_id,
            'pending_approval',
            'አዲስ ማመልከቻ: ' || COALESCE(NEW.payload->>'full_name', NEW.entity_id),
            'New Submission: ' || COALESCE(NEW.payload->>'full_name', NEW.entity_id),
            'ማመልከቻው የስራ አስኪያጅ ውሳኔ በመጠባበቅ ላይ ይገኛል።',
            'Application awaiting manager review.',
            'tables', 'pending', NEW.entity_id, 'how_to_reg',
            'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
            'ማፅደቂያ', 'Approval Needed', 'bg-slate-200 dark:bg-slate-700',
            'text-slate-800 dark:text-slate-200', 'admin', TRUE
        ) ON CONFLICT (id) DO UPDATE SET
            is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

    ELSIF NEW.action_type = 'REGISTRATION_STATUS_CHANGED' THEN
        UPDATE kpi_metrics
        SET pending_permits = GREATEST(0, pending_permits - CASE WHEN v_prev_status = 'pending_approval' THEN 1 ELSE 0 END)
                              + CASE WHEN v_new_status = 'pending_approval' THEN 1 ELSE 0 END,
            approved_permits = GREATEST(0, approved_permits - CASE WHEN v_prev_status IN ('approved', 'ordered_print', 'printed') THEN 1 ELSE 0 END)
                               + CASE WHEN v_new_status IN ('approved', 'ordered_print', 'printed') THEN 1 ELSE 0 END,
            printed_permits = GREATEST(0, printed_permits - CASE WHEN v_prev_status = 'printed' THEN 1 ELSE 0 END)
                              + CASE WHEN v_new_status = 'printed' THEN 1 ELSE 0 END,
            rejected_permits = GREATEST(0, rejected_permits - CASE WHEN v_prev_status = 'rejected' THEN 1 ELSE 0 END)
                               + CASE WHEN v_new_status = 'rejected' THEN 1 ELSE 0 END,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

        IF v_new_status IN ('approved', 'rejected', 'printed', 'ordered_print') THEN
            UPDATE materialized_notifications
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE entity_id = NEW.entity_id AND type = 'pending_approval';
        END IF;

    ELSIF NEW.action_type = 'REGISTRATION_DELETED' THEN
        UPDATE kpi_metrics
        SET total_permits = GREATEST(0, total_permits - 1),
            pending_permits = GREATEST(0, pending_permits - CASE WHEN v_prev_status = 'pending_approval' THEN 1 ELSE 0 END),
            approved_permits = GREATEST(0, approved_permits - CASE WHEN v_prev_status IN ('approved', 'ordered_print', 'printed') THEN 1 ELSE 0 END),
            rejected_permits = GREATEST(0, rejected_permits - CASE WHEN v_prev_status = 'rejected' THEN 1 ELSE 0 END),
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

        UPDATE materialized_notifications
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE entity_id = NEW.entity_id;

    ELSIF NEW.action_type = 'PAYMENT_RECEIVED' THEN
        UPDATE kpi_metrics
        SET total_receipts = total_receipts + 1,
            total_revenue = total_revenue + COALESCE(v_amount, 0),
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

    ELSIF NEW.action_type = 'PAYMENT_DELETED' THEN
        UPDATE kpi_metrics
        SET total_receipts = GREATEST(0, total_receipts - 1),
            total_revenue = GREATEST(0, total_revenue - COALESCE(v_amount, 0)),
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

    ELSIF NEW.action_type = 'VERIFICATION_LOGGED' THEN
        UPDATE kpi_metrics
        SET total_verifications = total_verifications + 1,
            verified_logs = verified_logs + CASE WHEN v_verif_status = 'verified' THEN 1 ELSE 0 END,
            warning_verifications = warning_verifications + CASE WHEN v_verif_status = 'warning' THEN 1 ELSE 0 END,
            illegal_verifications = illegal_verifications + CASE WHEN v_verif_status IN ('flagged', 'illegal', 'unregistered') THEN 1 ELSE 0 END,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

        IF v_verif_status IN ('flagged', 'warning') THEN
            INSERT INTO materialized_notifications (
                id, type, title_am, title_en, description_am, description_en,
                action_page, action_tab, entity_id, icon, icon_bg,
                badge_label_am, badge_label_en, badge_bg, badge_text, target_role, is_active
            ) VALUES (
                'notif-verif-' || NEW.entity_id,
                'flagged_inspection',
                'የፍተሻ ጥሰት ሪፖርት: ' || COALESCE(NEW.payload->>'plate_number', NEW.entity_id),
                'Inspection Violation: ' || COALESCE(NEW.payload->>'plate_number', NEW.entity_id),
                'በኦፊሰር የተመዘገበ ጥሰት: ' || COALESCE(NEW.payload->>'notes', 'የሰነድ ጉድለት'),
                'Patrol violation reported: ' || COALESCE(NEW.payload->>'notes', 'Violation found'),
                'inspection_report', 'history', NEW.entity_id, 'warning',
                'bg-rose-500/15 text-rose-600 dark:text-rose-400',
                'የጥሰት ሪፖርት', 'Violation Report', 'bg-rose-500/20',
                'text-rose-700 dark:text-rose-300', 'all', TRUE
            ) ON CONFLICT (id) DO UPDATE SET
                is_active = TRUE, updated_at = CURRENT_TIMESTAMP;
        END IF;

    ELSIF NEW.action_type = 'UNREGISTERED_REPORT_FILED' THEN
        UPDATE kpi_metrics
        SET total_unregistered = total_unregistered + 1,
            pending_unregistered = pending_unregistered + 1,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

        INSERT INTO materialized_notifications (
            id, type, title_am, title_en, description_am, description_en,
            action_page, action_tab, entity_id, icon, icon_bg,
            badge_label_am, badge_label_en, badge_bg, badge_text, target_role, is_active
        ) VALUES (
            'notif-unreg-' || NEW.entity_id,
            'unregistered_alert',
            'ያልተመዘገበ ሞተር ጥቆማ: ' || COALESCE(NEW.payload->>'driver_name', 'ያልታወቀ'),
            'Unregistered Motor Report: ' || COALESCE(NEW.payload->>'driver_name', 'Unknown'),
            'የቻሲስ ቁጥር: ' || COALESCE(NEW.payload->>'chassis_number', 'N/A'),
            'Chassis No: ' || COALESCE(NEW.payload->>'chassis_number', 'N/A'),
            'unregistered_list', 'list', NEW.entity_id, 'no_crash',
            'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            'ያልተመዘገበ', 'Unregistered Alert', 'bg-amber-500/20',
            'text-amber-800 dark:text-amber-300', 'all', TRUE
        ) ON CONFLICT (id) DO UPDATE SET
            is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

    ELSIF NEW.action_type = 'UNREGISTERED_REPORT_RESOLVED' THEN
        UPDATE kpi_metrics
        SET pending_unregistered = GREATEST(0, pending_unregistered - 1),
            resolved_unregistered = resolved_unregistered + 1,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

        UPDATE materialized_notifications
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE entity_id = NEW.entity_id AND type = 'unregistered_alert';

    ELSIF NEW.action_type = 'USER_CREATED' THEN
        UPDATE kpi_metrics
        SET total_users = total_users + 1,
            admin_users = admin_users + CASE WHEN v_role IN ('admin', 'superadmin') THEN 1 ELSE 0 END,
            active_users = active_users + 1,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

    ELSIF NEW.action_type = 'USER_STATUS_CHANGED' THEN
        UPDATE kpi_metrics
        SET disabled_users = GREATEST(0, disabled_users - CASE WHEN v_prev_status = 'disabled' THEN 1 ELSE 0 END)
                             + CASE WHEN v_user_status = 'disabled' THEN 1 ELSE 0 END,
            active_users = GREATEST(0, active_users - CASE WHEN v_prev_status = 'active' THEN 1 ELSE 0 END)
                           + CASE WHEN v_user_status = 'active' THEN 1 ELSE 0 END,
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

    ELSIF NEW.action_type = 'USER_DELETED' THEN
        UPDATE kpi_metrics
        SET total_users = GREATEST(0, total_users - 1),
            admin_users = GREATEST(0, admin_users - CASE WHEN v_role IN ('admin', 'superadmin') THEN 1 ELSE 0 END),
            active_users = GREATEST(0, active_users - CASE WHEN v_user_status = 'active' THEN 1 ELSE 0 END),
            disabled_users = GREATEST(0, disabled_users - CASE WHEN v_user_status = 'disabled' THEN 1 ELSE 0 END),
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';

    ELSIF NEW.action_type = 'OFFICER_STATUS_CHANGED' THEN
        UPDATE kpi_metrics
        SET active_officers = (SELECT COUNT(*) FROM officer_assignments WHERE status = 'active'),
            last_action_id = NEW.id,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'system_summary';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actions_insert ON actions;
CREATE TRIGGER trg_actions_insert
AFTER INSERT ON actions
FOR EACH ROW
EXECUTE FUNCTION process_action_kpi_trigger();

-- ============================================================================
-- SCHEMA UPDATES FOR EXISTING DATABASES (SAFE MIGRATIONS)
-- ============================================================================
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS scanner_result_theme VARCHAR(100) DEFAULT 'warm_ivory_cream';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_permit_status BOOLEAN DEFAULT FALSE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_submissions_action BOOLEAN DEFAULT FALSE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_approved_vehicles_action BOOLEAN DEFAULT FALSE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_new_registration_action BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_edit_submission_action BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_qr_scan_action BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_payment_receipts_action BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_payment_kpis BOOLEAN DEFAULT FALSE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_payment_records_table BOOLEAN DEFAULT FALSE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS clerk_payment_kpi_permission VARCHAR(50) DEFAULT 'allow';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS clerk_payment_table_permission VARCHAR(50) DEFAULT 'allow';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS frozen_sub_cities JSONB DEFAULT '{}'::jsonb;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS system_reset_epoch BIGINT;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS last_system_reset_at VARCHAR(50);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS role_permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS role_definitions JSONB DEFAULT '[]'::jsonb;

ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(100);
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS payment_amount VARCHAR(50);
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS receipt_screenshot TEXT;
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS hide_from_other_users BOOLEAN DEFAULT FALSE;
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_rejection_reason TEXT;
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS is_correction BOOLEAN DEFAULT FALSE;
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS term_status VARCHAR(50) DEFAULT 'CURRENT';
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS active_term_expiration_date VARCHAR(50);
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_payment_date VARCHAR(50);
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_receipt_number VARCHAR(100);
ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_payment_amount VARCHAR(50);

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS verified_by_cheki BOOLEAN DEFAULT FALSE;
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS cheki_bank VARCHAR(100);
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS entered_at VARCHAR(50);
ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(50) DEFAULT 'electric';

ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS id VARCHAR(128);
UPDATE notification_states SET id = user_scope_id WHERE id IS NULL OR id = '';
ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS cleared_ids JSONB DEFAULT '[]'::jsonb;


