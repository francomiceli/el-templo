-- 0359_aura_retro_especiales.sql
-- Re-valorizacion retroactiva de la Aura por asistencia a actividades
-- especiales (pedido de Franco 2026-11-25).
-- Desde la 0358 una actividad especial sin Aura propia vale 10 por presente
-- (AURA_AMOUNTS.attendanceSpecial) en vez de 5. Esta migracion lleva el
-- historial del anio 2026 a esa escala, como si la regla hubiera existido
-- desde el principio.
--
-- Filas que toca: aura_transactions con source_type attendance y
-- reference_type attendance cuya asistencia (reference_id = attendance.id,
-- mismo socio) sigue existiendo, es de 2026 y es de un horario de una
-- actividad especial sin aura_amount propio. Una asistencia deshecha ya no
-- tiene fila en attendance, asi que su credito y su reversa quedan iguales.
--
-- Mapeo con valores literales (idempotente, el valor nuevo nunca cumple la
-- condicion de otra regla):
--   5 a 10   (presente completo)
--   2 a 7    (tope del dia D-64, la app ya habia cobrado 3 ese dia, el dia
--            pasa a valer 10 en vez de 5)
-- Cualquier otro monto queda intacto.
--
-- El saldo cacheado (aura_balances) se recalcula como la suma del ledger
-- SOLO para los socios con alguna asistencia especial acreditada en 2026.
--
-- Respaldo previo (los deploys no respaldan la base): las filas candidatas y
-- los saldos de esos socios, en tablas _backup_0359 sin tenant_id ni indices.
-- Van PRIMERO: si el runner vuelve a correr el archivo el CREATE falla con
-- already exists, el runner saltea los errores siguientes y los UPDATE son
-- idempotentes.
--
-- Las filas se actualizan en el lugar (mismo id), asi que la tarjeta de
-- celebracion de la app (aura_celebrated_until_id) no las muestra como nuevas.
--
-- Escrita a mano (db:generate sigue roto por el drift de goal_plan_type).
-- Un comentario SQL NUNCA debe contener el separador de statements.

CREATE TABLE aura_transactions_backup_0359 AS
SELECT t.id, t.user_id, t.amount
FROM aura_transactions t
JOIN attendance a ON a.id = t.reference_id AND a.member_id = t.user_id
JOIN schedules s ON s.id = a.schedule_id
JOIN activities act ON act.id = s.activity_id
WHERE t.source_type = 'attendance'
  AND t.reference_type = 'attendance'
  AND act.is_special = 1
  AND act.aura_amount IS NULL
  AND a.session_date >= '2026-01-01';

CREATE TABLE aura_balances_backup_0359 AS
SELECT b.user_id, b.balance
FROM aura_balances b
WHERE b.user_id IN (SELECT DISTINCT user_id FROM aura_transactions_backup_0359);

UPDATE aura_transactions t
JOIN attendance a ON a.id = t.reference_id AND a.member_id = t.user_id
JOIN schedules s ON s.id = a.schedule_id
JOIN activities act ON act.id = s.activity_id
SET t.amount = 10
WHERE t.source_type = 'attendance'
  AND t.reference_type = 'attendance'
  AND act.is_special = 1
  AND act.aura_amount IS NULL
  AND a.session_date >= '2026-01-01'
  AND t.amount = 5;

UPDATE aura_transactions t
JOIN attendance a ON a.id = t.reference_id AND a.member_id = t.user_id
JOIN schedules s ON s.id = a.schedule_id
JOIN activities act ON act.id = s.activity_id
SET t.amount = 7
WHERE t.source_type = 'attendance'
  AND t.reference_type = 'attendance'
  AND act.is_special = 1
  AND act.aura_amount IS NULL
  AND a.session_date >= '2026-01-01'
  AND t.amount = 2;

UPDATE aura_balances b
JOIN (
  SELECT x.user_id, SUM(x.amount) AS s
  FROM aura_transactions x
  WHERE x.user_id IN (
    SELECT t.user_id
    FROM aura_transactions t
    JOIN attendance a ON a.id = t.reference_id AND a.member_id = t.user_id
    JOIN schedules s ON s.id = a.schedule_id
    JOIN activities act ON act.id = s.activity_id
    WHERE t.source_type = 'attendance'
      AND t.reference_type = 'attendance'
      AND act.is_special = 1
      AND act.aura_amount IS NULL
      AND a.session_date >= '2026-01-01'
  )
  GROUP BY x.user_id
) d ON d.user_id = b.user_id
SET b.balance = d.s;
