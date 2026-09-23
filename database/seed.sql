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
    frozen_sub_cities,
    role_permissions
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
    '{}'::jsonb,
    '{"role-secretary":{"1":"allow","2":"allow","3":"allow","4":"allow","5":"view_only","6":"view_only","7":"view_only","8":"view_only","9":"deny","10":"allow","17":"allow","16":"allow","11":"deny","12":"deny","13":"deny","14":"deny","15":"deny"},"role-officer":{"1":"deny","2":"deny","3":"view_only","4":"view_only","5":"allow","6":"allow","7":"allow","8":"allow","9":"deny","10":"deny","17":"deny","16":"deny","11":"deny","12":"deny","13":"deny","14":"deny","15":"deny"},"role-manager":{"1":"allow","2":"allow","3":"allow","4":"allow","5":"allow","6":"allow","7":"allow","8":"allow","9":"allow","10":"allow","17":"allow","16":"allow","11":"view_only","12":"view_only","13":"view_only","14":"deny","15":"view_only"},"role-it":{"1":"view_only","2":"view_only","3":"view_only","4":"view_only","5":"allow","6":"view_only","7":"view_only","8":"view_only","9":"allow","10":"allow","17":"allow","16":"allow","11":"allow","12":"allow","13":"allow","14":"allow","15":"allow"},"role-superadmin":{"1":"allow","2":"allow","3":"allow","4":"allow","5":"allow","6":"allow","7":"allow","8":"allow","9":"allow","10":"allow","17":"allow","16":"allow","11":"allow","12":"allow","13":"allow","14":"allow","15":"allow"}}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  scanner_result_theme = COALESCE(NULLIF(system_settings.scanner_result_theme, ''), 'warm_ivory_cream');

-- 3. Default Officer Assignments
INSERT INTO officer_assignments (id, officer_name, badge_id, sub_city, location_name, shift, status, assigned_location, phone, shift_hours, assigned_date)
VALUES
  ('officer-1', 'አበበ ደስታ (Abebe Desta)', 'OFFICER-442', 'በላይ ዘለቀ (Belay Zeleke)', 'ቀበሌ 04 መገንጠያ', 'morning', 'active', 'ቀበሌ 04 ኬላ', '0918123456', '08:00 - 16:00', '2026-09-01'),
  ('officer-2', 'ሰለሞን ግርማ (Solomon Girma)', 'OFFICER-8842', 'ፋሲሎ (Fasilo)', 'ጊዮርጊስ አደባባይ', 'afternoon', 'active', 'ዋናው አደባባይ ኬላ', '0918654321', '16:00 - 00:00', '2026-09-01'),
  ('officer-3', 'ዳዊት ታደሰ (Dawit Tadesse)', 'OFFICER-102', 'ጣና (Tana)', 'ዓባይ ማዶ መውጫ', 'morning', 'active', 'ድልድይ መነሻ', '0911987654', '08:00 - 16:00', '2026-09-01')
ON CONFLICT (id) DO NOTHING;

-- 4. Default Motorcycle Member Registrations
INSERT INTO motorcycle_registrations (
    id, full_name, phone, vehicle_category, motor_brand, motor_model,
    chassis_number, engine_or_serial_no, engine_number, plate_number,
    registration_date, status, qr_code_data, registered_by, sub_city,
    blood_group, receipt_number, payment_amount, national_id_photo, driving_license_photo, driving_permit_photo
)
VALUES
  (
    'BMA-2026-001', 'Abebe Kassahun Bekele', '0918123456', 'gas_under_110cc', 'TVS', 'HLX 125',
    'CHASSIS-TV-882190', 'ENG-TV-882190', 'ENG-TV-882190', '3-BD-10492',
    '2026-09-02', 'approved', 'QR-BMA-2026-001', 'CLERK-001', 'Belay Zeleke',
    'O+', 'REC-2026-001', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-002', 'Almaz Tadesse Worku', '0918765432', 'electric', 'Yadea', 'EM-2026',
    'CHASSIS-YD-992143', 'ENG-YD-992143', 'ENG-YD-992143', '3-BD-22341',
    '2026-09-04', 'approved', 'QR-BMA-2026-002', 'CLERK-001', 'Fasilo',
    'A+', 'REC-2026-002', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-003', 'Daniel Mengistu Haile', '0911223344', 'gas_under_110cc', 'Bajaj', 'Boxer BM150',
    'CHASSIS-BJ-112233', 'ENG-BJ-112233', 'ENG-BJ-112233', '3-BD-33984',
    '2026-08-25', 'approved', 'QR-BMA-2026-003', 'CLERK-001', 'Tana',
    'B+', 'REC-2026-003', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-004', 'Bethelhem Girma Fekadu', '0922334455', 'electric', 'Niu', 'NQi GTS',
    'CHASSIS-NU-445566', 'ENG-NU-445566', 'ENG-NU-445566', '3-BD-44120',
    '2026-07-15', 'approved', 'QR-BMA-2026-004', 'CLERK-001', 'Dagmawi Minilik',
    'AB+', 'REC-2026-004', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-005', 'Solomon Worku Desta', '0933445566', 'gas_under_110cc', 'Honda', 'Ace 110',
    'CHASSIS-HN-778899', 'ENG-HN-778899', 'ENG-HN-778899', '3-BD-55678',
    '2026-09-08', 'approved', 'QR-BMA-2026-005', 'CLERK-001', 'Atse Tewodros',
    'O-', 'REC-2026-005', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-006', 'Eyob Haile Wolde', '0944556677', 'gas_under_110cc', 'Lifan', 'LF110',
    'CHASSIS-LF-223344', 'ENG-LF-223344', 'ENG-LF-223344', '3-BD-66789',
    '2026-09-12', 'approved', 'QR-BMA-2026-006', 'CLERK-001', 'Gish Abay',
    'A-', 'REC-2026-006', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-007', 'Fikadu Kebede Mengesha', '0955667788', 'electric', 'Super Soco', 'TC Max',
    'CHASSIS-SS-556677', 'ENG-SS-556677', 'ENG-SS-556677', '3-BD-77890',
    '2026-08-28', 'approved', 'QR-BMA-2026-007', 'CLERK-001', 'Belay Zeleke',
    'O+', 'REC-2026-007', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-008', 'Hiwot Assefa Alemayehu', '0966778899', 'gas_under_110cc', 'Yamaha', 'Crux Rev',
    'CHASSIS-YM-889900', 'ENG-YM-889900', 'ENG-YM-889900', '3-BD-88901',
    '2026-09-15', 'approved', 'QR-BMA-2026-008', 'CLERK-001', 'Fasilo',
    'B+', 'REC-2026-008', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-009', 'Yonatan Melaku Belachew', '0977889900', 'gas_under_110cc', 'Suzuki', 'Hayate',
    'CHASSIS-SZ-334455', 'ENG-SZ-334455', 'ENG-SZ-334455', '3-BD-99012',
    '2026-07-10', 'approved', 'QR-BMA-2026-009', 'CLERK-001', 'Tana',
    'A+', 'REC-2026-009', '500 ETB', '', '', ''
  ),
  (
    'BMA-2026-010', 'Zerihun Desta Negash', '0988990011', 'electric', 'Yadea', 'G5 Pro',
    'CHASSIS-YD-667788', 'ENG-YD-667788', 'ENG-YD-667788', '3-BD-11223',
    '2026-09-18', 'approved', 'QR-BMA-2026-010', 'CLERK-001', 'Dagmawi Minilik',
    'O+', 'REC-2026-010', '500 ETB', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- 5. Default Payment Receipts
INSERT INTO payment_receipts (
    id, receipt_number, owner_registration_id, owner_name, plate_number,
    phone, payment_date, expiration_date, amount, entered_by, status
)
VALUES
  (
    'REC-2026-001', 'FT2609021001', 'BMA-2026-001', 'Abebe Kassahun Bekele', '3-BD-10492',
    '0918123456', '2026-09-02', '2026-10-02', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-002', 'CBE-982143002', 'BMA-2026-002', 'Almaz Tadesse Worku', '3-BD-22341',
    '0918765432', '2026-09-04', '2026-10-04', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-003', 'TELE-112233003', 'BMA-2026-003', 'Daniel Mengistu Haile', '3-BD-33984',
    '0911223344', '2026-08-25', '2026-09-25', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-004', 'AWASH-445566004', 'BMA-2026-004', 'Bethelhem Girma Fekadu', '3-BD-44120',
    '0922334455', '2026-07-15', '2026-08-15', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-005', 'FT2609081005', 'BMA-2026-005', 'Solomon Worku Desta', '3-BD-55678',
    '0933445566', '2026-09-08', '2026-10-08', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-006', 'DASHEN-223344006', 'BMA-2026-006', 'Eyob Haile Wolde', '3-BD-66789',
    '0944556677', '2026-09-12', '2026-10-12', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-007', 'FT2608281007', 'BMA-2026-007', 'Fikadu Kebede Mengesha', '3-BD-77890',
    '0955667788', '2026-08-28', '2026-09-28', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-008', 'TELE-889900008', 'BMA-2026-008', 'Hiwot Assefa Alemayehu', '3-BD-88901',
    '0966778899', '2026-09-15', '2026-10-15', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-009', 'CBE-334455009', 'BMA-2026-009', 'Yonatan Melaku Belachew', '3-BD-99012',
    '0977889900', '2026-07-10', '2026-08-10', 500, 'CLERK-001', 'valid'
  ),
  (
    'REC-2026-010', 'FT2609181010', 'BMA-2026-010', 'Zerihun Desta Negash', '3-BD-11223',
    '0988990011', '2026-09-18', '2026-10-18', 500, 'CLERK-001', 'valid'
  )
ON CONFLICT (id) DO NOTHING;
