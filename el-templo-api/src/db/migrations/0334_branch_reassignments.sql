-- 0334_branch_reassignments.sql
-- Historico mensual de recategorizaciones multisucursal (Reportes, pestana
-- Recategorizacion).
--
-- Hasta hoy el cron jobs/reassign-multibranch.ts cambia users.branch_id (mas
-- branch_updated_at y branch_source auto) sin registrar el evento. Esta
-- migracion hace dos cosas:
--   1. Crea branch_reassignments, una fila por cambio real de sede. Nace
--      tenant-scoped y STRICT (src/db/tenant-tables.ts, modulo
--      branch-reassignments). El cron la escribe desde ahora con source cron.
--   2. Backfill de las corridas pasadas desde users, con source backfill.
--
-- REGLAS DEL BACKFILL (decision del dueno)
--   - Eventos = users con branch_source auto, branch_updated_at en el dia 1 a
--     las 07 hs UTC (04:00 AR, la hora del cron) y a mas de 60 segundos de
--     users.created_at. Lo ultimo excluye las altas de Wellhub, que tambien
--     escriben auto en branch_source pero en el mismo instante del alta. En prod
--     son 76 eventos al momento de escribir esto (32 el 1/8, 7 el 1/9, 17 el
--     1/10 y 20 el 1/11).
--   - LIMITE CONOCIDO: users solo guarda el ULTIMO cambio automatico de cada
--     alumno. Si un alumno fue movido en dos corridas, la primera quedo pisada
--     y no se puede reconstruir. El historico de meses viejos es un piso, no el
--     total real.
--   - Las horas y fechas se leen en la zona horaria de la sesion MySQL, que en
--     prod y en el runner es UTC. Es el mismo supuesto de la regla de las 07 hs.
--   - to_branch_id es users.branch_id y reassigned_at es users.branch_updated_at.
--   - from_branch_id se reconstruye con el ULTIMO COBRO del alumno anterior al
--     evento. Es el branch_id de su ultimo financial_transactions con direction
--     inflow, sin anular, con sede cargada, ordenado por created_at e id
--     descendente. Si no hay ninguno o coincide con la sede destino queda NULL,
--     que la UI muestra como sin dato. Es una inferencia y no un dato real.
--   - to_branch_attendances y total_attendances se recuentan con los mismos
--     filtros del job. Son filas de attendance del alumno en sedes del propio
--     gimnasio con session_date desde 30 dias antes del evento. El job no pone
--     tope superior porque corre en el momento, aca se acota al dia del evento
--     para no contar asistencias posteriores. El primero cuenta solo la sede
--     destino y el segundo todas.
--
-- Idempotente: el NOT EXISTS evita duplicar filas si el runner reintenta el
-- archivo desde el principio. Una DB vacia (CI y test) inserta cero filas.
--
-- Hand-written: nunca drizzle-kit push, migrate o generate. La tabla
-- _migrations es la unica fuente de verdad, local y prod.
--
-- Un comentario SQL NUNCA debe contener el separador de statements. El
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE IF NOT EXISTS `branch_reassignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `member_id` int NOT NULL,
  `from_branch_id` int NULL,
  `to_branch_id` int NOT NULL,
  `to_branch_attendances` int NOT NULL,
  `total_attendances` int NOT NULL,
  `source` enum('cron','backfill') NOT NULL,
  `reassigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_branch_reassignments_tenant_at` (`tenant_id`, `reassigned_at`),
  KEY `idx_branch_reassignments_member` (`member_id`),
  CONSTRAINT `fk_branch_reassignments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_branch_reassignments_member` FOREIGN KEY (`member_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_branch_reassignments_from_branch` FOREIGN KEY (`from_branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_branch_reassignments_to_branch` FOREIGN KEY (`to_branch_id`) REFERENCES `branches` (`id`)
);
--> statement-breakpoint
INSERT INTO `branch_reassignments`
  (`tenant_id`, `member_id`, `from_branch_id`, `to_branch_id`, `to_branch_attendances`, `total_attendances`, `source`, `reassigned_at`)
SELECT
  u.`tenant_id`,
  u.`id`,
  NULLIF(
    (SELECT ft.`branch_id`
       FROM `financial_transactions` ft
      WHERE ft.`tenant_id` = u.`tenant_id`
        AND ft.`member_id` = u.`id`
        AND ft.`voided_at` IS NULL
        AND ft.`direction` = 'inflow'
        AND ft.`branch_id` IS NOT NULL
        AND ft.`created_at` < u.`branch_updated_at`
      ORDER BY ft.`created_at` DESC, ft.`id` DESC
      LIMIT 1),
    u.`branch_id`
  ),
  u.`branch_id`,
  (SELECT COUNT(*)
     FROM `attendance` a
    INNER JOIN `branches` b ON b.`id` = a.`branch_id` AND b.`tenant_id` = u.`tenant_id`
    WHERE a.`tenant_id` = u.`tenant_id`
      AND a.`member_id` = u.`id`
      AND a.`branch_id` = u.`branch_id`
      AND a.`session_date` >= DATE(u.`branch_updated_at` - INTERVAL 30 DAY)
      AND a.`session_date` <= DATE(u.`branch_updated_at`)),
  (SELECT COUNT(*)
     FROM `attendance` a
    INNER JOIN `branches` b ON b.`id` = a.`branch_id` AND b.`tenant_id` = u.`tenant_id`
    WHERE a.`tenant_id` = u.`tenant_id`
      AND a.`member_id` = u.`id`
      AND a.`session_date` >= DATE(u.`branch_updated_at` - INTERVAL 30 DAY)
      AND a.`session_date` <= DATE(u.`branch_updated_at`)),
  'backfill',
  u.`branch_updated_at`
FROM `users` u
WHERE u.`branch_source` = 'auto'
  AND u.`branch_updated_at` IS NOT NULL
  AND DAY(u.`branch_updated_at`) = 1
  AND HOUR(u.`branch_updated_at`) = 7
  AND ABS(TIMESTAMPDIFF(SECOND, u.`created_at`, u.`branch_updated_at`)) > 60
  AND NOT EXISTS (
    SELECT 1
      FROM `branch_reassignments` r
     WHERE r.`tenant_id` = u.`tenant_id`
       AND r.`member_id` = u.`id`
       AND r.`source` = 'backfill'
       AND r.`reassigned_at` = u.`branch_updated_at`
  );
