-- Reconciliación: subscriptions.branch_id desincronizado de users.branch_id.
--
-- Background. May 2026 — Mati reportó que al editar los turnos fijos de
-- Susana Bosch (cambio 10hs → 9hs en Alem) la API rechazaba todos los
-- horarios con "no pertenece a la sucursal de la suscripcion". Investigando
-- aparecieron 16 inconsistencias users.branch_id <> subscriptions.branch_id
-- en suscripciones live (active/scheduled/paused).
--
-- Análisis. De los 16 casos, 14 son seguros: o bien los schedules de la
-- sub apuntan a users.branch_id (ej. Susana, Sebastian, Jose Rossi —
-- toda su actividad operativa está en la sede del user, sólo la sub
-- quedó atrás), o bien no hay subscription_schedules ni bookings futuros
-- contradictorios. En esos casos sincronizar sub.branch_id = user.branch_id
-- es correcto.
--
-- 2 casos quedan excluidos para revisión humana:
--   - Carolina Giovannetti (sub 421): tiene 1 booking futuro suelto en
--     una sede distinta a Mogotes (la del user). Pendiente de decisión.
--   - María Emilia Meliton (sub 6118): TODA la actividad operativa está
--     en Chapadmalal pero users.branch_id=Mogotes. Posible que el valor
--     incorrecto sea users.branch_id, no la sub. Pendiente.
--
-- El fix forward (members/service.ts updateMember) previene futuros casos:
-- al cambiar la sede de un miembro propaga branch_id a sus subs y limpia
-- bookings/schedules salvo planes multi_branch.
--
-- Idempotency. _migrations tracker prevents double-run. WHERE clause is
-- defensive (only touches rows that still match the BEFORE state).
--
-- Note: SQL line comments must NOT contain inline semicolons because
-- run-migrations.ts splits the file on the semicolon BEFORE stripping
-- comments.

UPDATE subscriptions s
JOIN users u ON u.id = s.user_id
SET s.branch_id = u.branch_id
WHERE s.subscription_status IN ('active', 'scheduled', 'paused')
  AND s.branch_id <> u.branch_id
  AND s.id IN (
    241,   -- Geronimo Correa (Moreno)
    362,   -- Daniela Font (Moreno)
    738,   -- Mauro Pulisic (Mogotes)
    3600,  -- Andrea Mendez sub 3600 (Alem)
    5187,  -- Usuario eliminado (Jujuy)
    5227,  -- Maria Lucia Ravera (Moreno)
    5282,  -- Andrea Mendez sub 5282 Foundation+ (Alem)
    5283,  -- Jose Rossi (Alem)
    5913,  -- Leandro Scarponi (Barcelona)
    6037,  -- Susana Bosch (Alem)
    6038,  -- Sebastian Campoo Arcidiacono (Alem)
    6362,  -- Victoria Silvera (Templo Online)
    6403,  -- Matias Mamana (Jujuy)
    6408   -- Melina Garcia (Alem)
  );

INSERT INTO audit_log (actor_id, action, target_kind, target_id, payload_json, reason, created_at)
SELECT
  COALESCE(
    (SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1),
    1
  ),
  'reconciliation',
  'subscription',
  0,
  JSON_OBJECT(
    'subIds', JSON_ARRAY(241, 362, 738, 3600, 5187, 5227, 5282, 5283, 5913, 6037, 6038, 6362, 6403, 6408),
    'excluded', JSON_OBJECT(
      'sub_421_carolina_giovannetti', 'booking futuro en sede distinta — pendiente decision manual',
      'sub_6118_maria_emilia_meliton', 'actividad operativa en sede distinta a users.branch_id — pendiente decision manual'
    )
  ),
  'Sincronización subscriptions.branch_id con users.branch_id (Bosch case, may 2026)',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log
  WHERE action = 'reconciliation'
    AND target_kind = 'subscription'
    AND reason LIKE 'Sincronización subscriptions.branch_id con users.branch_id (Bosch case%'
);
