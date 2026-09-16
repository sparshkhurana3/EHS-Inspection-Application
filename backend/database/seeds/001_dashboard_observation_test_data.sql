BEGIN;

DO $$
DECLARE
    required_username TEXT;
    missing_usernames TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH required_username IN ARRAY ARRAY[
        'test.auditor',
        'test.auditee',
        'test.ehs.officer',
        'test.hod',
        'test.plant.head'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM users
            WHERE username = required_username
        ) THEN
            missing_usernames := ARRAY_APPEND(
                missing_usernames,
                required_username
            );
        END IF;
    END LOOP;

    IF ARRAY_LENGTH(missing_usernames, 1) IS NOT NULL THEN
        RAISE EXCEPTION
            'Required test users are missing: %',
            ARRAY_TO_STRING(missing_usernames, ', ');
    END IF;
END
$$;

/* Ensure all required roles exist. */
INSERT INTO roles (code, name)
VALUES
    ('USER', 'Application User'),
    ('AUDITOR', 'Safety Auditor'),
    ('AUDITEE', 'Audit Responsible Person'),
    ('EHS_OFFICER', 'EHS Officer'),
    ('HOD', 'Head of Department'),
    ('PLANT_HEAD', 'Plant Head'),
    ('ADMIN', 'System Administrator')
ON CONFLICT (code) DO NOTHING;

/* Assign USER role to all test accounts. */
INSERT INTO user_roles (user_id, role_id)
SELECT test_user.id, application_role.id
FROM users AS test_user
CROSS JOIN roles AS application_role
WHERE test_user.username IN (
    'test.auditor',
    'test.auditee',
    'test.ehs.officer',
    'test.hod',
    'test.plant.head'
)
AND application_role.code = 'USER'
ON CONFLICT (user_id, role_id) DO NOTHING;

/* Assign functional roles. */
INSERT INTO user_roles (user_id, role_id)
SELECT test_user.id, application_role.id
FROM users AS test_user
CROSS JOIN roles AS application_role
WHERE test_user.username = 'test.auditor'
  AND application_role.code = 'AUDITOR'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT test_user.id, application_role.id
FROM users AS test_user
CROSS JOIN roles AS application_role
WHERE test_user.username = 'test.auditee'
  AND application_role.code = 'AUDITEE'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT test_user.id, application_role.id
FROM users AS test_user
CROSS JOIN roles AS application_role
WHERE test_user.username = 'test.ehs.officer'
  AND application_role.code = 'EHS_OFFICER'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT test_user.id, application_role.id
FROM users AS test_user
CROSS JOIN roles AS application_role
WHERE test_user.username = 'test.hod'
  AND application_role.code = 'HOD'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT test_user.id, application_role.id
FROM users AS test_user
CROSS JOIN roles AS application_role
WHERE test_user.username = 'test.plant.head'
  AND application_role.code = 'PLANT_HEAD'
ON CONFLICT (user_id, role_id) DO NOTHING;

/* Create plant master data. */
INSERT INTO plants (name, code, is_active)
VALUES
    ('Gurugram', 'TEST-GGM', TRUE),
    ('Pune', 'TEST-PUN', TRUE),
    ('Chennai', 'TEST-CHE', TRUE),
    ('Manesar', 'TEST-MAN', TRUE),
    ('China', 'TEST-CHN', TRUE)
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;

/* Create Gurugram test units. */
INSERT INTO units (plant_id, name, code, unit_number, is_active)
SELECT
    plant.id,
    test_unit.name,
    test_unit.code,
    test_unit.unit_number,
    TRUE
FROM plants AS plant
CROSS JOIN (
    VALUES
        ('Test Unit 1', 'TEST-UNIT-1', '1'),
        ('Test Unit 2', 'TEST-UNIT-2', '2')
) AS test_unit (name, code, unit_number)
WHERE plant.code = 'TEST-GGM'
ON CONFLICT (plant_id, code)
DO UPDATE SET
    name = EXCLUDED.name,
    unit_number = EXCLUDED.unit_number,
    is_active = EXCLUDED.is_active;

/* Create test zones. */
INSERT INTO zones (
    unit_id,
    name,
    code,
    zone_number,
    area_detail,
    is_active
)
SELECT
    test_unit.id,
    test_zone.name,
    test_zone.code,
    test_zone.zone_number,
    test_zone.area_detail,
    TRUE
FROM units AS test_unit
JOIN (
    VALUES
        ('TEST-UNIT-1', 'Test Zone 1', 'TEST-ZONE-1', '1',
         'Assembly line and material movement area'),
        ('TEST-UNIT-1', 'Test Zone 2', 'TEST-ZONE-2', '2',
         'Utility area and electrical panel section'),
        ('TEST-UNIT-1', 'Test Zone 3', 'TEST-ZONE-3', '3',
         'Warehouse and dispatch area'),
        ('TEST-UNIT-2', 'Test Zone 4', 'TEST-ZONE-4', '4',
         'ETP and chemical storage area')
) AS test_zone (
    unit_code,
    name,
    code,
    zone_number,
    area_detail
)
    ON test_zone.unit_code = test_unit.code
WHERE test_unit.code LIKE 'TEST-UNIT-%'
ON CONFLICT (unit_id, code)
DO UPDATE SET
    name = EXCLUDED.name,
    zone_number = EXCLUDED.zone_number,
    area_detail = EXCLUDED.area_detail,
    is_active = EXCLUDED.is_active;

/* Remove previously generated TEST workflow data. */
DELETE FROM closure_requests
WHERE patrol_id IN (
    SELECT patrol.id
    FROM patrols AS patrol
    JOIN zones AS zone ON zone.id = patrol.zone_id
    WHERE zone.code LIKE 'TEST-ZONE-%'
);

DELETE FROM observation_reports
WHERE patrol_id IN (
    SELECT patrol.id
    FROM patrols AS patrol
    JOIN zones AS zone ON zone.id = patrol.zone_id
    WHERE zone.code LIKE 'TEST-ZONE-%'
);

DELETE FROM patrols
WHERE zone_id IN (
    SELECT id
    FROM zones
    WHERE code LIKE 'TEST-ZONE-%'
);

/* Historical Zone 1 patrols for sequential week-number testing. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    historical_date.scheduled_date::DATE,
    'COMPLETED',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
CROSS JOIN (
    VALUES
        (CURRENT_DATE - 28),
        (CURRENT_DATE - 21),
        (CURRENT_DATE - 14),
        (CURRENT_DATE - 7)
) AS historical_date (scheduled_date)
WHERE test_unit.code = 'TEST-UNIT-1'
  AND test_zone.code = 'TEST-ZONE-1'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* Current-week pending auditor patrol, with no observation report. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    DATE_TRUNC('week', CURRENT_DATE)::DATE + 2,
    'SCHEDULED',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
WHERE test_unit.code = 'TEST-UNIT-1'
  AND test_zone.code = 'TEST-ZONE-1'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* Current-week patrol with an in-progress observation report. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    DATE_TRUNC('week', CURRENT_DATE)::DATE + 3,
    'PENDING_AUDITEE_ACTION',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
WHERE test_unit.code = 'TEST-UNIT-1'
  AND test_zone.code = 'TEST-ZONE-2'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* Current-week completed patrol with an approved closure. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    DATE_TRUNC('week', CURRENT_DATE)::DATE + 4,
    'COMPLETED',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
WHERE test_unit.code = 'TEST-UNIT-1'
  AND test_zone.code = 'TEST-ZONE-3'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* Current-week Zone 4 audit for management combined-card testing. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    DATE_TRUNC('week', CURRENT_DATE)::DATE + 5,
    'SCHEDULED',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
WHERE test_unit.code = 'TEST-UNIT-2'
  AND test_zone.code = 'TEST-ZONE-4'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* Future patrol for calendar month navigation. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    CURRENT_DATE + 21,
    'SCHEDULED',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
WHERE test_unit.code = 'TEST-UNIT-2'
  AND test_zone.code = 'TEST-ZONE-4'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* In-progress observation for Zone 2. */
INSERT INTO observation_reports (
    patrol_id,
    submitted_by,
    submitted_to,
    status,
    report_number,
    finding_date,
    plant_location,
    observation_location,
    category,
    photograph_path,
    photograph_original_name,
    photograph_mime_type,
    photograph_size,
    description,
    risk_category,
    submitted_at,
    updated_at
)
SELECT
    patrol.id,
    auditor.id,
    auditee.id,
    'PENDING_AUDITEE_ACTION',
    'TEST-POR-IN-PROGRESS',
    patrol.scheduled_date,
    'Gurugram',
    zone.area_detail,
    'UC',
    'uploads/observations/test-in-progress.png',
    'test-in-progress.png',
    'image/png',
    1024,
    'Temporary material was stored in front of the emergency electrical panel, reducing safe access to the panel.',
    'HIGH',
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '1 hour'
FROM patrols AS patrol
JOIN zones AS zone ON zone.id = patrol.zone_id
JOIN users AS auditor ON auditor.id = patrol.auditor_id
JOIN users AS auditee ON auditee.id = patrol.auditee_id
WHERE zone.code = 'TEST-ZONE-2'
  AND patrol.scheduled_date >= DATE_TRUNC('week', CURRENT_DATE)::DATE
  AND patrol.scheduled_date <
      (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days')::DATE
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
ON CONFLICT (patrol_id) DO NOTHING;

/* Closed observation for Zone 3. */
INSERT INTO observation_reports (
    patrol_id,
    submitted_by,
    submitted_to,
    status,
    report_number,
    finding_date,
    plant_location,
    observation_location,
    category,
    photograph_path,
    photograph_original_name,
    photograph_mime_type,
    photograph_size,
    description,
    risk_category,
    submitted_at,
    updated_at,
    closed_at
)
SELECT
    patrol.id,
    auditor.id,
    auditee.id,
    'CLOSED',
    'TEST-POR-CLOSED',
    patrol.scheduled_date,
    'Gurugram',
    zone.area_detail,
    'UA',
    'uploads/observations/test-closed.jpg',
    'test-closed.jpg',
    'image/jpeg',
    2048,
    'An employee entered the material movement lane without using the designated pedestrian crossing.',
    'MEDIUM',
    NOW() - INTERVAL '2 days',
    NOW(),
    NOW()
FROM patrols AS patrol
JOIN zones AS zone ON zone.id = patrol.zone_id
JOIN users AS auditor ON auditor.id = patrol.auditor_id
JOIN users AS auditee ON auditee.id = patrol.auditee_id
WHERE zone.code = 'TEST-ZONE-3'
  AND patrol.scheduled_date >= DATE_TRUNC('week', CURRENT_DATE)::DATE
  AND patrol.scheduled_date <
      (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days')::DATE
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
ON CONFLICT (patrol_id) DO NOTHING;

/* Pending closure request for Zone 2. */
INSERT INTO closure_requests (
    observation_report_id,
    patrol_id,
    requested_by,
    proposed_closure_date,
    action_plan,
    status,
    requested_at,
    created_at,
    updated_at
)
SELECT
    report.id,
    report.patrol_id,
    auditee.id,
    CURRENT_DATE + 7,
    'Relocate stored material and mark the required clearance area in front of the electrical panel.',
    'REQUESTED',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes'
FROM observation_reports AS report
JOIN patrols AS patrol ON patrol.id = report.patrol_id
JOIN zones AS zone ON zone.id = patrol.zone_id
JOIN users AS auditee ON auditee.id = patrol.auditee_id
WHERE report.report_number = 'TEST-POR-IN-PROGRESS'
  AND zone.code = 'TEST-ZONE-2'
  AND auditee.username = 'test.auditee'
  AND NOT EXISTS (
      SELECT 1
      FROM closure_requests AS existing_request
      WHERE existing_request.observation_report_id = report.id
  );

/* Approved closure for Zone 3. */
INSERT INTO closure_requests (
    observation_report_id,
    patrol_id,
    requested_by,
    proposed_closure_date,
    action_plan,
    status,
    requested_at,
    reviewed_by,
    reviewed_at,
    review_comments,
    closed_at,
    created_at,
    updated_at
)
SELECT
    report.id,
    report.patrol_id,
    auditee.id,
    CURRENT_DATE,
    'Install additional pedestrian crossing signs and conduct a documented safety briefing for the work area.',
    'APPROVED',
    NOW() - INTERVAL '2 days',
    ehs_officer.id,
    NOW() - INTERVAL '1 day',
    'Corrective action verified and accepted.',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
FROM observation_reports AS report
JOIN patrols AS patrol ON patrol.id = report.patrol_id
JOIN zones AS zone ON zone.id = patrol.zone_id
JOIN users AS auditee ON auditee.id = patrol.auditee_id
CROSS JOIN users AS ehs_officer
WHERE report.report_number = 'TEST-POR-CLOSED'
  AND zone.code = 'TEST-ZONE-3'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer'
  AND NOT EXISTS (
      SELECT 1
      FROM closure_requests AS existing_request
      WHERE existing_request.observation_report_id = report.id
  );

/* Earlier current-year completed patrols for annual metrics. */
INSERT INTO patrols (
    unit_id,
    zone_id,
    auditor_id,
    auditee_id,
    ehs_officer_id,
    scheduled_date,
    status,
    created_by
)
SELECT
    test_unit.id,
    test_zone.id,
    auditor.id,
    auditee.id,
    ehs_officer.id,
    annual_date.scheduled_date,
    'COMPLETED',
    ehs_officer.id
FROM units AS test_unit
JOIN zones AS test_zone ON test_zone.unit_id = test_unit.id
CROSS JOIN users AS auditor
CROSS JOIN users AS auditee
CROSS JOIN users AS ehs_officer
CROSS JOIN (
    VALUES
        (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 2, 7)),
        (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 3, 7)),
        (MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 4, 7))
) AS annual_date (scheduled_date)
WHERE test_unit.code = 'TEST-UNIT-2'
  AND test_zone.code = 'TEST-ZONE-4'
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
  AND ehs_officer.username = 'test.ehs.officer';

/* Matching observation reports for earlier annual patrols. */
INSERT INTO observation_reports (
    patrol_id,
    submitted_by,
    submitted_to,
    status,
    report_number,
    finding_date,
    plant_location,
    observation_location,
    category,
    photograph_path,
    photograph_original_name,
    photograph_mime_type,
    photograph_size,
    description,
    risk_category,
    submitted_at,
    updated_at,
    closed_at
)
SELECT
    patrol.id,
    auditor.id,
    auditee.id,
    'CLOSED',
    'TEST-POR-ANNUAL-' || patrol.id,
    patrol.scheduled_date,
    'Gurugram',
    zone.area_detail,
    'UC',
    'uploads/observations/test-annual.png',
    'test-annual.png',
    'image/png',
    1024,
    'Test observation report used for current-year dashboard metrics.',
    'LOW',
    patrol.scheduled_date::TIMESTAMP + INTERVAL '2 hours',
    patrol.scheduled_date::TIMESTAMP + INTERVAL '2 days',
    patrol.scheduled_date::TIMESTAMP + INTERVAL '2 days'
FROM patrols AS patrol
JOIN zones AS zone ON zone.id = patrol.zone_id
JOIN users AS auditor ON auditor.id = patrol.auditor_id
JOIN users AS auditee ON auditee.id = patrol.auditee_id
WHERE zone.code = 'TEST-ZONE-4'
  AND patrol.status = 'COMPLETED'
  AND patrol.scheduled_date >= DATE_TRUNC('year', CURRENT_DATE)::DATE
  AND patrol.scheduled_date <
      (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year')::DATE
  AND patrol.scheduled_date < DATE_TRUNC('week', CURRENT_DATE)::DATE
  AND auditor.username = 'test.auditor'
  AND auditee.username = 'test.auditee'
ON CONFLICT (patrol_id) DO NOTHING;

COMMIT;
