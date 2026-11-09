-- Tanda 2 seguridad (hallazgo #4): un socio solo puede tener UNA fila por dia de sesion
-- en completed_sessions. Hasta hoy el unique no existia y POST /sessions/complete hacia
-- SELECT y luego INSERT, sin candado: dos POST concurrentes duplicaban la fila.
-- Escrita a mano (drizzle-kit generate esta roto por drift). Sin punto y coma en comentarios.
-- aura_transactions.reference_type es varchar(50), los referenceType nuevos training_day
-- y goal_plan_day no requieren cambio de columna.

-- 1) Deduplicar conservando la fila mas reciente (id mayor) por (user_id, day_id).
DELETE c1 FROM completed_sessions c1
JOIN completed_sessions c2
  ON c1.user_id = c2.user_id AND c1.day_id = c2.day_id AND c1.id < c2.id;

-- 2) Unique que cierra la carrera.
ALTER TABLE completed_sessions
  ADD UNIQUE INDEX completed_sessions_user_day_uq (user_id, day_id);
