BEGIN;

/*
 * Creates the five EHS test users only when they do not already exist.
 * Temporary password for newly created users: ChangeMe123!
 *
 * pgcrypto generates bcrypt-compatible password hashes, so the existing
 * Node.js bcryptjs login flow can verify the generated passwords.
 */
CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* Ensure required roles exist before assigning them. */
INSERT INTO roles (code, name)
VALUES
    ('USER', 'Application User'),
    ('AUDITOR', 'Safety Auditor'),
    ('AUDITEE', 'Audit Responsible Person'),
    ('EHS_OFFICER', 'EHS Officer'),
    ('HOD', 'Head of Department'),
    ('PLANT_HEAD', 'Plant Head')
ON CONFLICT (code) DO NOTHING;

/* Create missing users. Existing users are left unchanged. */
INSERT INTO users (
    full_name,
    username,
    email,
    password_hash,
    authentication_source,
    is_active
)
VALUES
    (
        'Test Auditor',
        'test.auditor',
        'test.auditor@example.com',
        crypt('ChangeMe123!', gen_salt('bf', 12)),
        'LOCAL',
        TRUE
    ),
    (
        'Test Auditee',
        'test.auditee',
        'test.auditee@example.com',
        crypt('ChangeMe123!', gen_salt('bf', 12)),
        'LOCAL',
        TRUE
    ),
    (
        'Test EHS Officer',
        'test.ehs.officer',
        'test.ehs.officer@example.com',
        crypt('ChangeMe123!', gen_salt('bf', 12)),
        'LOCAL',
        TRUE
    ),
    (
        'Test HOD',
        'test.hod',
        'test.hod@example.com',
        crypt('ChangeMe123!', gen_salt('bf', 12)),
        'LOCAL',
        TRUE
    ),
    (
        'Test Plant Head',
        'test.plant.head',
        'test.plant.head@example.com',
        crypt('ChangeMe123!', gen_salt('bf', 12)),
        'LOCAL',
        TRUE
    )
ON CONFLICT DO NOTHING;

/* Every test account receives the base USER application role. */
INSERT INTO user_roles (user_id, role_id)
SELECT app_user.id, app_role.id
FROM users AS app_user
CROSS JOIN roles AS app_role
WHERE app_user.username IN (
    'test.auditor',
    'test.auditee',
    'test.ehs.officer',
    'test.hod',
    'test.plant.head'
)
AND app_role.code = 'USER'
ON CONFLICT (user_id, role_id) DO NOTHING;

/* Assign the functional role for each test account. */
WITH required_assignments (username, role_code) AS (
    VALUES
        ('test.auditor', 'AUDITOR'),
        ('test.auditee', 'AUDITEE'),
        ('test.ehs.officer', 'EHS_OFFICER'),
        ('test.hod', 'HOD'),
        ('test.plant.head', 'PLANT_HEAD')
)
INSERT INTO user_roles (user_id, role_id)
SELECT app_user.id, app_role.id
FROM required_assignments AS assignment
JOIN users AS app_user
    ON LOWER(app_user.username) = LOWER(assignment.username)
JOIN roles AS app_role
    ON app_role.code = assignment.role_code
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;

/* Verification output. */
SELECT
    app_user.id,
    app_user.full_name,
    app_user.username,
    app_user.email,
    app_user.authentication_source,
    app_user.is_active,
    ARRAY_AGG(app_role.code ORDER BY app_role.code) AS roles
FROM users AS app_user
JOIN user_roles AS user_role
    ON user_role.user_id = app_user.id
JOIN roles AS app_role
    ON app_role.id = user_role.role_id
WHERE app_user.username IN (
    'test.auditor',
    'test.auditee',
    'test.ehs.officer',
    'test.hod',
    'test.plant.head'
)
GROUP BY
    app_user.id,
    app_user.full_name,
    app_user.username,
    app_user.email,
    app_user.authentication_source,
    app_user.is_active
ORDER BY app_user.username;
