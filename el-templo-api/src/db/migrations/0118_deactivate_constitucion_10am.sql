-- Soft delete del slot 10:00-11:00 de calistenia en El Templo Constitución
-- (branch_id=3, Lun-Vie). La sucursal cerró ese horario hace tiempo por
-- baja demanda y nunca se desactivó en la base.
--
-- Verificado en prod (2026-05-08): 0 suscripciones fijas apuntando a estos
-- slots, 0 attendance histórico, 0 reservas futuras. Soft delete preserva
-- el registro y permite revertir si hace falta.
--
-- Idempotente: solo afecta filas todavía activas con esos criterios.

UPDATE schedules
SET
  is_active = 0,
  inactive_reason = 'Cerrado por baja demanda',
  deactivated_at = NOW()
WHERE branch_id = 3
  AND start_time = '10:00'
  AND end_time = '11:00'
  AND day_of_week BETWEEN 1 AND 5
  AND is_active = 1;
