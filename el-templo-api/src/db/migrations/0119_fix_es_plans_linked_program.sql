-- Corrige bug sistemático off-by-one en linked_program_id de planes ES + migra
-- enrollments plan_linked existentes al programa correcto.
--
-- Origen: migración 0091 (multi-currency-and-country-scope) seedeó TODOS los
-- planes ES con linked_program_id incrementado en +1 respecto a sus pares AR.
-- El bug se hizo visible recién con el lanzamiento de BCN (los miembros nuevos
-- entraban a "Piernas y Gluteos" en lugar de "Foundation Cuerpo Completo").
--
-- Mapeo plan ES → corrección (todos -1):
--   105 Flex             : 3 (P&G)            → 2 (Foundation Cuerpo Completo)
--   106 Flex+            : 3 (P&G)            → 2
--   107 Foundation       : 3 (P&G)            → 2
--   108 Foundation+      : 3 (P&G)            → 2
--   109 Performance      : 3 (P&G)            → 2
--   110 Sesion Prueba    : 3 (P&G)            → 2
--   111 30 Dias Online   : 2 (Foundation CC)  → 1 (Desafio 30 Dias)
--   112 Cero a Atleta    : 5 (Tu Primer FL)   → 4 (Cero a Atleta)
--   113 Foundation Online: 3 (P&G)            → 2
--   114 Piernas y Glúteos: 4 (Cero a Atleta)  → 3 (Piernas y Gluteos)
--   116 Tu Primer FL     : 6 (Calistenia)     → 5 (Tu Primer Front Lever)
--   115 Promo Gratuito   : NULL → NULL (sin cambio)
--
-- Enrollments afectados:
-- - 33 plan_linked activos en programa 3 (P&G) de miembros BCN, vienen de
--   planes base (Flex, Flex+, Foundation, etc.) con seed buggy.
-- - Otros plan_linked en programas 4/5/6 si surgieran de planes online ES
--   (no se conocen casos hoy, pero la migración los maneja).
-- - Caso huérfano: enrollment plan_linked con subscription_id=NULL (Leandro
--   Scarponi en BCN) — se re-inscribe en Foundation Cuerpo Completo por default.
--
-- Idempotente: cada UPDATE incluye el valor de origen en el WHERE; los pasos
-- 2/3 sobre enrollments son naturalmente idempotentes (re-run no encuentra
-- mismatches después del primer apply).
--
-- NO toca: enrollments admin_addon (4) ni plan_bundle (1) ni miembros AR.

-- ---------------------------------------------------------------------------
-- Paso 1: corregir linked_program_id por plan, idempotente con WHERE explícito.
-- ---------------------------------------------------------------------------
UPDATE subscription_plans SET linked_program_id = 2
  WHERE id IN (105, 106, 107, 108, 109, 110, 113) AND linked_program_id = 3;

UPDATE subscription_plans SET linked_program_id = 1
  WHERE id = 111 AND linked_program_id = 2;

UPDATE subscription_plans SET linked_program_id = 4
  WHERE id = 112 AND linked_program_id = 5;

UPDATE subscription_plans SET linked_program_id = 3
  WHERE id = 114 AND linked_program_id = 4;

UPDATE subscription_plans SET linked_program_id = 5
  WHERE id = 116 AND linked_program_id = 6;

-- ---------------------------------------------------------------------------
-- Paso 2: cancelar enrollments plan_linked activos cuyo program_id NO coincide
-- con el linked_program_id actual del plan (post-fix). Estos son los que se
-- crearon bajo el seed buggy.
-- ---------------------------------------------------------------------------
UPDATE program_enrollments pe
JOIN subscriptions s ON s.id = pe.subscription_id
JOIN subscription_plans sp ON sp.id = s.plan_id
SET pe.status = 'cancelled',
    pe.cancelled_at = NOW(),
    pe.notes = TRIM(CONCAT(
      COALESCE(pe.notes, ''),
      '\n[migración 0119] cancelada por seed-fix: plan ES apuntaba al programa equivocado'
    ))
WHERE pe.source = 'plan_linked'
  AND pe.status = 'active'
  AND sp.country = 'ES'
  AND sp.linked_program_id IS NOT NULL
  AND pe.program_id != sp.linked_program_id;

-- Paso 2b: cancelar enrollments plan_linked huérfanos (subscription_id NULL)
-- de miembros BCN apuntando a programa 3. Caso conocido: Leandro Scarponi.
UPDATE program_enrollments pe
JOIN users u ON u.id = pe.user_id
SET pe.status = 'cancelled',
    pe.cancelled_at = NOW(),
    pe.notes = TRIM(CONCAT(
      COALESCE(pe.notes, ''),
      '\n[migración 0119] cancelada por seed-fix: enrollment plan_linked huérfano BCN'
    ))
WHERE pe.source = 'plan_linked'
  AND pe.status = 'active'
  AND pe.program_id = 3
  AND pe.subscription_id IS NULL
  AND u.branch_id = 14;

-- ---------------------------------------------------------------------------
-- Paso 3: re-inscribir cancelados en el programa correcto del plan, current_week=1.
-- NOT EXISTS guard evita duplicar si el usuario ya tiene un enrollment activo
-- en el programa destino (e.g., Leandro y Lea ya tenían Foundation Cuerpo
-- Completo activo en paralelo desde otra fuente).
-- ---------------------------------------------------------------------------
INSERT INTO program_enrollments
  (user_id, program_id, status, current_week, sessions_completed_this_week,
   source, subscription_id, enrolled_at, notes)
SELECT pe.user_id, sp.linked_program_id, 'active', 1, 0, 'plan_linked',
       pe.subscription_id, NOW(),
       '[migración 0119] re-inscripto en programa correcto tras seed-fix de planes ES'
FROM program_enrollments pe
JOIN subscriptions s ON s.id = pe.subscription_id
JOIN subscription_plans sp ON sp.id = s.plan_id
WHERE pe.source = 'plan_linked'
  AND pe.status = 'cancelled'
  AND pe.notes LIKE '%[migración 0119]%'
  AND pe.notes NOT LIKE '%huérfano%'
  AND sp.country = 'ES'
  AND sp.linked_program_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM program_enrollments pe2
    WHERE pe2.user_id = pe.user_id
      AND pe2.program_id = sp.linked_program_id
      AND pe2.status = 'active'
  );

-- Paso 3b: re-inscribir huérfanos BCN en Foundation Cuerpo Completo (default).
INSERT INTO program_enrollments
  (user_id, program_id, status, current_week, sessions_completed_this_week,
   source, subscription_id, enrolled_at, notes)
SELECT pe.user_id, 2, 'active', 1, 0, 'plan_linked',
       NULL, NOW(),
       '[migración 0119] re-inscripto en Foundation Cuerpo Completo tras seed-fix (huérfano BCN)'
FROM program_enrollments pe
JOIN users u ON u.id = pe.user_id
WHERE pe.source = 'plan_linked'
  AND pe.status = 'cancelled'
  AND pe.notes LIKE '%[migración 0119]%huérfano%'
  AND u.branch_id = 14
  AND NOT EXISTS (
    SELECT 1 FROM program_enrollments pe2
    WHERE pe2.user_id = pe.user_id
      AND pe2.program_id = 2
      AND pe2.status = 'active'
  );
