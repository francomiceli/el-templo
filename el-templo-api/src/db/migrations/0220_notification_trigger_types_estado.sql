-- 0220_notification_trigger_types_estado.sql
-- Pedido de Franco (2026-09-04): 4 disparadores de ESTADO para las reglas
-- de notificaciones propias (motor de rules.ts, migracion 0219). A
-- diferencia de los 5 originales, no llevan trigger_value ni
-- trigger_segment: el socio califica mientras el estado se mantenga, y la
-- cadencia (cooldown_days) evita reenvios diarios.
--   has_active_program: tiene una inscripcion a programa en estado active.
--   no_active_program: socio activo SIN inscripcion active (upsell).
--   has_booking_today: tiene una reserva vigente para hoy (no cancelada,
--     no en lista de espera, no ausente).
--   branch_is_virtual: su sede tiene is_virtual = 1 (Templo Online).
-- Hand-written (db:generate sigue roto por drift). Valores nuevos
-- APPENDED al final, el orden de los 5 existentes se preserva. Sin punto
-- y coma en comentarios de doble guion.

ALTER TABLE `notification_templates`
  MODIFY COLUMN `trigger_type` enum('plan_expires_in_days','plan_expired_days_ago','days_without_attendance','member_since_days','segment_is','has_active_program','no_active_program','has_booking_today','branch_is_virtual') NULL;
