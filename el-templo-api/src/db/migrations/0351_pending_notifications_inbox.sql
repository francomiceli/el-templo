-- 0351_pending_notifications_inbox.sql
-- Fase 215 Regalar Aura (D-17, D-18).
--
-- pending_notifications suma 2 columnas al final para que el barrido de la cola
-- sepa que tipo de aviso es y a que regalo apunta cuando lo copia a la bandeja
-- (member_notifications, mig 0350):
--   inbox_kind     categoria del aviso, por ejemplo aura_gift
--   inbox_ref_id   id del regalo cuando inbox_kind es aura_gift
--
-- Las dos arrancan NULL para toda fila existente: los avisos viejos no tienen
-- tipo ni referencia. La tabla es chica porque se purga a las 24 horas, y las
-- columnas NULL al final no reescriben datos. Cero datos.
-- Ver src/db/schema/notifications.ts y src/db/schema/member-notifications.ts.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

ALTER TABLE `pending_notifications`
  ADD COLUMN `inbox_kind` varchar(32) NULL DEFAULT NULL,
  ADD COLUMN `inbox_ref_id` int NULL DEFAULT NULL;
