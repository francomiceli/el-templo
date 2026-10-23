-- 0297_novedades_push.sql
-- Novedades con notificacion push opcional (pedido de Franco, 2026-10-23). Un
-- admin puede pedir que, ademas de aparecer en el feed de Mi Templo, la novedad
-- salga como push a los socios activos de las sedes elegidas.
--
-- 1. push_requested: el admin pidio la push. Default 0 (apagada).
-- 2. push_title: titulo de la push (hasta 50). NULL = al enviar se usa el nombre
--    del gimnasio (tenants.name).
-- 3. push_queued_at: instante en que el cron de notificaciones reclamo la
--    novedad y encolo las push. NULL = todavia no se encolo. Es el candado de
--    idempotencia (UPDATE condicional) y tambien lo que bloquea editar o
--    reenviar una push ya encolada.
--
-- El indice acelera la busqueda de novedades vencidas del tick de 5 minutos.
-- Columnas nullable o con default al final de la tabla, cero datos en la
-- migracion. Las filas existentes quedan con push_requested = 0, asi que
-- ninguna novedad vieja dispara una push.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente.
-- Los statements van separados con el marcador de breakpoint de drizzle, asi el
-- runner no parte el archivo por el separador de statements.

ALTER TABLE `novedades`
  ADD COLUMN `push_requested` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `push_title` varchar(50) DEFAULT NULL,
  ADD COLUMN `push_queued_at` datetime DEFAULT NULL;
--> statement-breakpoint
CREATE INDEX `idx_novedades_tenant_push` ON `novedades` (`tenant_id`, `push_requested`, `push_queued_at`);
