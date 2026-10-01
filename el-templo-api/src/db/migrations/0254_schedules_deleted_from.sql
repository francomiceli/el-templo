-- Horario eliminado distinto de cancelado (2026-10-01).
--
-- Hasta ahora "Eliminar horario" y "Cancelar clase - todas las semanas"
-- guardaban lo mismo (is_active=0), y la grilla de admin mostraba el horario
-- eliminado como CANCELADA en todas las semanas, incluso las pasadas.
--
-- schedules.deleted_from = primera fecha en que el horario deja de existir.
-- NULL = no eliminado. La grilla de admin lo oculta desde esa fecha y la API
-- no permite reactivarlo.
--
-- Backfill: los horarios eliminados antes de este cambio quedaron con
-- inactive_reason = 'Eliminado desde YYYY-MM-DD' (texto fijo del endpoint
-- delete-from-date). Se recupera la fecha de ahi, solo para los que siguen
-- inactivos (si alguien los reactivo, el motivo ya se borro).
-- Columna nullable al final (INSTANT ADD COLUMN en MySQL 8).

ALTER TABLE `schedules`
  ADD COLUMN `deleted_from` date DEFAULT NULL;
--> statement-breakpoint
UPDATE `schedules`
  SET `deleted_from` = SUBSTRING(`inactive_reason`, 17, 10)
  WHERE `is_active` = 0
    AND `deleted_from` IS NULL
    AND `inactive_reason` REGEXP '^Eliminado desde [0-9]{4}-[0-9]{2}-[0-9]{2}$';
