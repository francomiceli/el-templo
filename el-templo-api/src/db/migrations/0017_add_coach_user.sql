-- Data migration: only runs when branch_id 1 exists (production/staging, not test DB)
INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id, level)
SELECT
  'Scaine7@hotmail.com',
  '$argon2id$v=19$m=65536,t=3,p=4$LxZZR9KfgAovD0f/Twiq8Q$KfQluwFVNv8I6Ngpgit6AYtkqv/kOdZapKbBcafmdcY',
  'Fran',
  'Scaine',
  'coach',
  1,
  'alfa'
FROM dual
WHERE EXISTS (SELECT 1 FROM branches WHERE id = 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'Scaine7@hotmail.com');
