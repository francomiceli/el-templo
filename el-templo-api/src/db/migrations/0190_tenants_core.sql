-- Fase 166 (FUND-01) -- tanda A del doc 06 §1: raíz de la jerarquía multi-tenant.
--
-- Crea `tenants` + `tenant_settings` y siembra El Templo como tenant id=1. Es la
-- tabla a la que apunta la FK de las anclas (`users`, `branches`) en la tanda B
-- (migración 0191) y la que consulta el hook de scope para el estado del tenant.
--
-- status: 'active' operativo -- 'suspended' palanca comercial reversible (falta de
-- pago): datos INTACTOS, todo lo autenticado del tenant responde 403 -- 'archived'
-- baja lógica, NUNCA DELETE físico de un tenant.
--
-- `tenant_settings` nace VACÍA (D-05): coexistencia gradual con `system_settings`,
-- que NO recibe tenant_id en todo el milestone.
--
-- El enum status espeja byte a byte el mysqlEnum de src/db/schema/tenants.ts
-- (mismo nombre de columna física, mismos valores, mismo orden) -- Hard Rule 6 del
-- skill el-templo-db-migrations, incidentes 0138/0139.
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su
-- journal desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0162).
--
-- Idempotencia: CREATE TABLE IF NOT EXISTS + INSERT ... SELECT ... WHERE NOT EXISTS.
-- El id=1 va EXPLÍCITO porque el backfill de la tanda B escribe literalmente 1. Un
-- replay manual fuera del runner es un no-op de 0 filas.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que
-- este archivo NO puede tener ese caracter dentro de una línea de comentario.

CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  status ENUM('active','suspended','archived') NOT NULL DEFAULT 'active',
  default_country VARCHAR(2) NOT NULL DEFAULT 'AR',
  default_currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  default_timezone VARCHAR(50) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY tenants_slug_unique (slug)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_setting (tenant_id, setting_key),
  CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

INSERT INTO tenants (id, name, slug, status, default_country, default_currency, default_timezone)
SELECT 1, 'El Templo', 'el-templo', 'active', 'AR', 'ARS', 'America/Argentina/Buenos_Aires'
WHERE NOT EXISTS (
  SELECT 1 FROM tenants WHERE id = 1
);
