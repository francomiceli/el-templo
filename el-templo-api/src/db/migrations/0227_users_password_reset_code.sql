-- 0227_users_password_reset_code.sql
-- Olvide mi contrasena por codigo de 6 digitos (2026-09-15). Hand-written
-- (db:generate roto).
--
-- Tres columnas nuevas en `users` para el flujo self-serve de recuperacion:
--   - password_reset_code_hash: HMAC-SHA256 (hex, 64 chars) del codigo de 6
--     digitos que se manda por mail. Nunca se guarda el codigo en claro.
--   - password_reset_expires_at: vencimiento del codigo (15 minutos).
--   - password_reset_attempts: intentos fallidos contra ese codigo. Al llegar
--     al maximo el codigo queda inutilizable y hay que pedir uno nuevo.
-- Las tres se limpian (NULL / 0) al consumir el codigo con exito.
--
-- Sin datos: staging y prod comparten MySQL, todo DDL corre contra prod.

ALTER TABLE users
  ADD COLUMN password_reset_code_hash VARCHAR(64) NULL,
  ADD COLUMN password_reset_expires_at TIMESTAMP NULL,
  ADD COLUMN password_reset_attempts INT NOT NULL DEFAULT 0;
