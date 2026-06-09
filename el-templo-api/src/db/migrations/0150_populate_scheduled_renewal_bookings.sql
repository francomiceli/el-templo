-- Completa las 3 renovaciones reprogramadas por 0148 (Lecatsas 7079,
-- Lorenzino 7088, Pandolfo 7089) con lo que una renovacion normal hubiera
-- creado y la correccion in-place no pudo: los turnos fijos copiados de la
-- suscripcion vigente y las reservas del periodo nuevo.
--
-- Replica generateFixedBookings: una reserva 'reservado' por cada fecha del
-- periodo [start_date, end_date] cuyo dia coincide con el turno, salteando
-- feriados del pais (tabla holidays, AR). El cupo no se chequea -- la
-- asignacion fija del admin pisa el limite del slot, mismo criterio que
-- populateBookings y la migracion 0122. Las fechas de empalme que ya tienen
-- reserva de la vigente se saltean via NOT EXISTS sobre el indice unico
-- (member_id, schedule_id, booking_date). No hay filas 'cancelado' futuras
-- para estos miembros (verificado), asi que no hace falta reactivacion.
-- Guardas estrictas por id + estado para ser no-op fuera de produccion.

-- 1. Copiar los turnos fijos de la vigente a la renovacion programada
INSERT INTO subscription_schedules (subscription_id, schedule_id)
SELECT nueva.id, ss.schedule_id
FROM subscriptions nueva
JOIN subscriptions vigente ON vigente.id = nueva.previous_subscription_id
JOIN subscription_schedules ss ON ss.subscription_id = vigente.id
WHERE nueva.id IN (7079, 7088, 7089)
  AND nueva.subscription_status = 'scheduled'
  AND vigente.subscription_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM subscription_schedules x
    WHERE x.subscription_id = nueva.id AND x.schedule_id = ss.schedule_id
  );

-- 2. Generar las reservas del periodo nuevo para esos turnos
INSERT INTO bookings (member_id, schedule_id, booking_date, booking_status)
WITH RECURSIVE fechas AS (
  SELECT DATE('2026-09-01') AS d
  UNION ALL
  SELECT d + INTERVAL 1 DAY FROM fechas WHERE d < '2027-03-10'
)
SELECT s.user_id, ss.schedule_id, f.d, 'reservado'
FROM subscriptions s
JOIN subscription_schedules ss ON ss.subscription_id = s.id
JOIN schedules sch ON sch.id = ss.schedule_id AND sch.is_active = 1
JOIN fechas f ON WEEKDAY(f.d) + 1 = sch.day_of_week
  AND f.d >= s.start_date AND f.d <= s.end_date
WHERE s.id IN (7079, 7088, 7089)
  AND s.subscription_status = 'scheduled'
  AND NOT EXISTS (
    SELECT 1 FROM holidays h WHERE h.date = f.d AND h.country = 'AR'
  )
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.member_id = s.user_id
      AND b.schedule_id = ss.schedule_id
      AND b.booking_date = f.d
  );
