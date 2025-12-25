-- Reset password for inputpip@gmail.com and owner@aquvit.id
-- Password: password (bcrypt hash)
UPDATE profiles
SET password_hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    password_changed_at = NOW()
WHERE email = 'inputpip@gmail.com';

UPDATE profiles
SET password_hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    password_changed_at = NOW()
WHERE email = 'owner@aquvit.id';
