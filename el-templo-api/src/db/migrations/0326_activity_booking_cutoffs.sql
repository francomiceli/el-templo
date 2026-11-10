-- Cortes de reserva y cancelacion por actividad (pedido 2026-11-10).
--
-- Hasta ahora los dos cortes eran constantes globales en booking-service:
-- reservar hasta 5 min antes de la clase y cancelar hasta 20 min antes.
-- Dos columnas nuevas en activities, ambas NULL = default global (cero cambio
-- de comportamiento para las actividades existentes):
--   booking_close_minutes  minutos antes del inicio en que cierra la reserva
--   cancel_close_minutes   minutos antes del inicio en que cierra la cancelacion
--
-- Dato de prod: las clases de yoga (linea de pase 'Yoga', creadas por la 0243)
-- cierran la reserva 30 min antes. Se identifican por special_line y no por
-- nombre, asi cubre tambien yogas creados despues desde el admin. En una DB
-- sin yoga (tests, otros tenants) el UPDATE es un no-op.
--
-- Escrita a mano (db:generate sigue roto por el drift de goal_plan_type).

ALTER TABLE activities ADD COLUMN booking_close_minutes INT NULL AFTER wellhub_enabled;

ALTER TABLE activities ADD COLUMN cancel_close_minutes INT NULL AFTER booking_close_minutes;

UPDATE activities
  SET booking_close_minutes = 30
  WHERE tenant_id = 1 AND is_special = 1 AND special_line = 'Yoga'
    AND booking_close_minutes IS NULL;
