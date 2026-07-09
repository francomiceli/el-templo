-- Hotfix trial-sessions (2026-07-08) -- "Plan comprado" + estado Ganado/Perdido/En seguimiento
-- Hand-written (db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift, same as 0154/0158/0161/0162, and meta/_journal.json is stale). Numbered 0170
-- porque la rama v5.4 (feat/roster-effective-dated) ya ocupa 0165-0169 -- este hotfix
-- llega a prod ANTES que v5.4, el runner aplica por nombre de archivo pendiente asi
-- que el orden cruzado no rompe nada (ni 0170 depende de 0165-0169 ni al reves).
-- NEVER drizzle-kit push/migrate -- the _migrations table is the source of truth.
--
-- A SQL comment must never contain a statement separator char -- the runner splits
-- raw statements first and only then strips line comments.
--
-- Qué hace:
--   1. Backup de las columnas de lead en users_lead_backup_0170 (todo user con
--      lead_status seteado, converted_at seteado o lead_notes cargadas) para poder
--      auditar/revertir la reclasificación.
--   2. Nueva columna users.purchased_plan_id (FK subscription_plans, SET NULL).
--   3. Ensancha el enum lead_status para aceptar 'ganado' junto a 'cerrado'.
--   4. Datos históricos:
--      a. Leads convertidos -> purchased_plan_id = plan de su primera suscripción.
--      b. Filas cuyo lead_notes es EXACTAMENTE un nombre de plan (trim, case-insensitive)
--         -> purchased_plan_id por nombre y se vacía el comentario. Match exacto a
--         propósito -- un comentario libre que solo menciona un plan no se toca.
--      c. Todo lead con plan comprado o conversión -> lead_status = 'ganado'.
--      d. 'cerrado' restante (sin compra) -> 'perdido'.
--      e. 'en_seguimiento' (o NULL) cuya sesión de prueba representativa ya pasó,
--         sin asistencia y sin plan -> 'perdido'.
--   5. Achica el enum a ('en_seguimiento','ganado','perdido').

CREATE TABLE users_lead_backup_0170 AS
SELECT id, status, lead_status, lead_notes, converted_at, updated_at
FROM users
WHERE lead_status IS NOT NULL
   OR converted_at IS NOT NULL
   OR (lead_notes IS NOT NULL AND lead_notes <> '');

ALTER TABLE `users`
  ADD COLUMN `purchased_plan_id` int NULL AFTER `lead_notes`;

ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_purchased_plan`
  FOREIGN KEY (`purchased_plan_id`) REFERENCES `subscription_plans`(`id`)
  ON DELETE SET NULL;

ALTER TABLE `users`
  MODIFY COLUMN `lead_status` enum('en_seguimiento','cerrado','ganado','perdido') NULL;

-- 4a. Leads convertidos: plan comprado = plan de la PRIMERA suscripción del user.
-- MIN(id) y no MAX -- lo que compró al convertir, no su plan actual.
UPDATE users u
JOIN (
  SELECT user_id, MIN(id) AS first_sub_id
  FROM subscriptions
  GROUP BY user_id
) fs ON fs.user_id = u.id
JOIN subscriptions s ON s.id = fs.first_sub_id
SET u.purchased_plan_id = s.plan_id
WHERE u.converted_at IS NOT NULL
  AND u.purchased_plan_id IS NULL;

-- 4b-i. Comentario que es exactamente un nombre de plan y todavía no hay plan
-- seteado: mover a purchased_plan_id. MIN(sp.id) desambigua nombres duplicados
-- entre países -- para el reporte solo importa el nombre mostrado.
UPDATE users u
JOIN (
  SELECT LOWER(TRIM(name)) AS lname, MIN(id) AS plan_id
  FROM subscription_plans
  GROUP BY LOWER(TRIM(name))
) sp ON LOWER(TRIM(u.lead_notes)) = sp.lname
SET u.purchased_plan_id = sp.plan_id
WHERE u.purchased_plan_id IS NULL;

-- 4b-ii. Vaciar el comentario en TODA fila donde es exactamente un nombre de plan
-- (incluye las que ya recibieron plan por suscripción en 4a -- el hook viejo
-- prefillaba el nombre del plan en lead_notes al convertir).
UPDATE users u
JOIN (
  SELECT DISTINCT LOWER(TRIM(name)) AS lname
  FROM subscription_plans
) sp ON LOWER(TRIM(u.lead_notes)) = sp.lname
SET u.lead_notes = NULL;

-- 4c. Compró (plan cargado o conversión registrada) -> Ganado. purchased_plan_id
-- solo pudo setearse en 4a/4b sobre filas de lead, así que no toca staff/members
-- ajenos al funnel.
UPDATE users
SET lead_status = 'ganado'
WHERE purchased_plan_id IS NOT NULL
   OR converted_at IS NOT NULL;

-- 4d. 'cerrado' restante = cerrado sin compra -> Perdido.
UPDATE users
SET lead_status = 'perdido'
WHERE lead_status = 'cerrado';

-- 4e. En seguimiento (explícito o NULL derivado) cuya sesión de prueba
-- representativa (última booking is_trial no cancelada -- misma derivación que
-- el reporte) ya pasó, sin asistencia confirmada y sin plan -> Perdido.
UPDATE users u
JOIN (
  SELECT b2.member_id, MAX(b2.id) AS booking_id
  FROM bookings b2
  WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
  GROUP BY b2.member_id
) lt ON lt.member_id = u.id
JOIN bookings b ON b.id = lt.booking_id
LEFT JOIN attendance a
  ON a.member_id = b.member_id
 AND a.schedule_id = b.schedule_id
 AND a.session_date = b.booking_date
 AND a.attendance_status = 'confirmado'
SET u.lead_status = 'perdido'
WHERE (u.lead_status = 'en_seguimiento' OR u.lead_status IS NULL)
  AND u.converted_at IS NULL
  AND u.purchased_plan_id IS NULL
  AND u.deleted_at IS NULL
  AND (u.status IS NULL OR u.status IN ('prueba','freemium'))
  AND b.booking_date < CURDATE()
  AND a.id IS NULL;

ALTER TABLE `users`
  MODIFY COLUMN `lead_status` enum('en_seguimiento','ganado','perdido') NULL;
