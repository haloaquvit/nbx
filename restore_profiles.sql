-- Restore profiles dari backup
DELETE FROM profiles;

INSERT INTO profiles (id, email, full_name, role, created_at, updated_at, password_hash, branch_id, username, phone, address, status, allowed_branches) VALUES
('b19ad129-cfce-43ad-908b-9b657af4c067', 'inputpip@gmail.com', 'Syahruddin Makki', 'owner', '2025-12-23 17:47:11.007772+07', '2025-12-24 06:03:46.912834+07', '$2a$10$5G.bTeibn0dcyS1SaaXQbe/qKs.ldbzRGlNYMaLGw2AaPV2vzFF5O', '00000000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'Aktif', '{}'),
('46a9ca73-0a19-418f-a248-46f521b4359f', 'zakytm3@gmail.com', 'Tes Supir', 'supir', '2025-12-24 14:56:14.48033+07', '2025-12-24 07:56:14.557062+07', '$2a$10$Bwg.rzyIyL3IPkLoRs3Vf.Nw4b8ANzA9wVCOnMlo1aw46Cne/jagC', '00000000-0000-0000-0000-000000000001', 'gomblo', '082139331883', 'Ruko AMD no. 3 Jl. Trikora Wosi', 'Aktif', '{}'),
('00000000-0000-0000-0000-000000000001', 'owner@aquvit.id', 'Owner Aquvit', 'owner', '2025-12-23 17:40:37.735457+07', '2025-12-24 13:25:07.929566+07', '$2a$10$BuShIuHFYmUiVgb5BXULF.zHw8URYi3YVfZ8pcCo0tC7QypoKuktu', '00000000-0000-0000-0000-000000000001', 'owner', NULL, NULL, 'active', '{}'),
('6b371010-250c-4987-8a7b-4954b22d5171', 'sales@aquvit.com', 'Jumria', 'sales', '2025-12-25 12:44:25.565052+07', '2025-12-25 09:54:36.518636+07', '$2a$10$E3J6Y8LIqUoSn3rY1GhwWO0Z/oWn907u1BSg3fOe2ElLDtHzJqoty', '00000000-0000-0000-0000-000000000001', 'jumria', '082139331883', 'Ruko AMD no. 3 Jl. Trikora Wosi', 'Aktif', '{}');

-- Update user_roles untuk semua user
DELETE FROM user_roles;

INSERT INTO user_roles (user_id, role_id)
SELECT p.id, r.id FROM profiles p JOIN roles r ON p.role = r.name;
