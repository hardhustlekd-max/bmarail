-- ============================================================================
-- RAILWAY POSTGRESQL INITIAL SEED DATA
-- Application: Bahir Dar Municipal Motorcycle Permit & BMA Authority System
-- ============================================================================

-- 1. Default System Users (Passwords: ClerkPassword123!, OfficerPassword123!, AdminPassword123!, SuperAdminPassword123!)
-- Bcrypt Hash for "ClerkPassword123!": $2a$10$wQ9KkJW3k3oH3mN2s4gTeuX3I8z8lqX5M3s9q2j1V4z7y0n2p5r7u
-- Bcrypt Hash for "OfficerPassword123!": $2a$10$wQ9KkJW3k3oH3mN2s4gTeuX3I8z8lqX5M3s9q2j1V4z7y0n2p5r7u
-- Bcrypt Hash for "AdminPassword123!": $2a$10$wQ9KkJW3k3oH3mN2s4gTeuX3I8z8lqX5M3s9q2j1V4z7y0n2p5r7u
-- Bcrypt Hash for "SuperAdminPassword123!": $2a$10$wQ9KkJW3k3oH3mN2s4gTeuX3I8z8lqX5M3s9q2j1V4z7y0n2p5r7u

INSERT INTO system_users (id, uid, badge_id, email, password_hash, role, full_name, sub_city, status, created_at)
VALUES 
  (
    'user-clerk-CLERK-001',
    'user-clerk-CLERK-001',
    'CLERK-001',
    'clerk@permit.gov.et',
    '$2a$10$K7L1RKqK36zW7hM4iC.Eke9G.LqV8x3u8aH8Vb1vF5rN7x7Y2wQ8y',
    'clerk',
    'Abebe Bekele (Clerk)',
    'Belay Zeleke',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'user-officer-OFFICER-8842',
    'user-officer-OFFICER-8842',
    'OFFICER-8842',
    'officer@permit.gov.et',
    '$2a$10$K7L1RKqK36zW7hM4iC.Eke9G.LqV8x3u8aH8Vb1vF5rN7x7Y2wQ8y',
    'officer',
    'Officer Solomon Desta',
    'Fasilo',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'user-admin-ADMIN-PRO-1',
    'user-admin-ADMIN-PRO-1',
    'ADMIN-PRO-1',
    'admin@permit.gov.et',
    '$2a$10$K7L1RKqK36zW7hM4iC.Eke9G.LqV8x3u8aH8Vb1vF5rN7x7Y2wQ8y',
    'admin',
    'Tigist Alemu (System Admin)',
    'Dagmawi Minilik',
    'active',
    CURRENT_TIMESTAMP
  ),
  (
    'user-superadmin-SUPER-ADMIN-01',
    'user-superadmin-SUPER-ADMIN-01',
    'SUPER-ADMIN-01',
    'superadmin@permit.gov.et',
    '$2a$10$K7L1RKqK36zW7hM4iC.Eke9G.LqV8x3u8aH8Vb1vF5rN7x7Y2wQ8y',
    'superadmin',
    'Kaleb Tadesse (Chief Super Admin)',
    'Central Command',
    'active',
    CURRENT_TIMESTAMP
  )
ON CONFLICT (badge_id) DO NOTHING;

-- 2. Default System Global Settings
INSERT INTO system_settings (
    id,
    officer_name,
    department,
    sub_city_office,
    default_printer,
    card_stock_type,
    calendar_system,
    auto_print_qr,
    email_alerts,
    security_2fa,
    high_risk_alerts,
    theme_mode,
    registration_freeze,
    maintenance_mode,
    scanner_result_theme,
    show_clerk_permit_status,
    show_clerk_submissions_action,
    show_clerk_approved_vehicles_action,
    show_clerk_payment_kpis,
    show_clerk_payment_records_table,
    clerk_payment_kpi_permission,
    clerk_payment_table_permission,
    frozen_sub_cities
)
VALUES (
    'global_config',
    'አበበ ደስታ (Abebe Desta)',
    'የትራፊክ ማኔጅመንትና ህግ ማስከበሪያ (Traffic Mgmt & Enforcement)',
    'በላይ ዘለቀ ክፍለ ከተማ (Belay Zeleke)',
    'Zebra ZD621 Industrial PVC Card Printer',
    'CR80 Standard PVC Card (85.6 x 54 mm)',
    'ethiopian',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    'light',
    FALSE,
    FALSE,
    'warm_ivory_cream',
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    'allow',
    'allow',
    '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 3. Default Officer Assignments
INSERT INTO officer_assignments (id, officer_name, badge_id, sub_city, location_name, shift, status, assigned_location, phone, shift_hours, assigned_date)
VALUES
  ('officer-1', 'አበበ ደስታ (Abebe Desta)', 'OFFICER-442', 'በላይ ዘለቀ (Belay Zeleke)', 'ቀበሌ 04 መገንጠያ', 'morning', 'active', 'ቀበሌ 04 ኬላ', '0918123456', '08:00 - 16:00', '2026-09-01'),
  ('officer-2', 'ሰለሞን ግርማ (Solomon Girma)', 'OFFICER-8842', 'ፋሲሎ (Fasilo)', 'ጊዮርጊስ አደባባይ', 'afternoon', 'active', 'ዋናው አደባባይ ኬላ', '0918654321', '16:00 - 00:00', '2026-09-01'),
  ('officer-3', 'ዳዊት ታደሰ (Dawit Tadesse)', 'OFFICER-102', 'ጣና (Tana)', 'ዓባይ ማዶ መውጫ', 'morning', 'active', 'ድልድይ መነሻ', '0911987654', '08:00 - 16:00', '2026-09-01')
ON CONFLICT (id) DO NOTHING;
