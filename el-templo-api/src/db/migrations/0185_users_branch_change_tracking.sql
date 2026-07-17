-- Tracking de cambios de sede del miembro para el cron de recategorizacion
-- multisucursal (2026-07). branch_updated_at = cuando cambio branch_id por
-- ultima vez. branch_source = quien lo cambio (manual = staff o alta, auto =
-- el cron). El cron respeta una reasignacion manual reciente (ventana de 45
-- dias) sin pisarla. Filas previas quedan en NULL/NULL (no protegidas hasta
-- su proximo cambio), que es el comportamiento buscado en el bootstrap.
ALTER TABLE users
  ADD COLUMN branch_updated_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN branch_source ENUM('manual', 'auto') NULL DEFAULT NULL;
