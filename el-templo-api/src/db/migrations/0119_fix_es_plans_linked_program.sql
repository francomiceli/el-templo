-- Corrige seed bug en planes ES: estaban linkeados a programa 3 (Piernas y Gluteos)
-- en lugar de programa 2 (Foundation — Cuerpo Completo), que es el onboarding genérico
-- usado por los planes equivalentes en AR.
--
-- Origen: migración 0091 (multi-currency-and-country-scope) seedeó los planes ES
-- copiando los de AR pero apuntando al program_id equivocado.
--
-- Afecta:
-- - 8 planes ES (Flex, Flex+, Foundation, Foundation+, Performance, Sesión de Prueba,
--   30 Días Online, Foundation Online).
-- - 33 enrollments plan_linked actualmente activos en Piernas y Gluteos para miembros
--   BCN (branch_id=14). Se cancelan y se re-inscriben en Foundation Cuerpo Completo
--   con current_week=1.
--
-- NO toca:
-- - Enrollments admin_addon (4: Naomi, Marco, Jaime, Gerónimo) — asignaciones intencionales.
-- - Enrollments plan_bundle (1: usuario "auro test" en Templo Online).
-- - Plan Piernas y Glúteos ES (id=114) — sigue apuntando a programa 4 (su programa propio).
-- - Miembros AR — sus planes ya están bien.
--
-- Idempotente: re-correr no duplica enrollments (paso 3 tiene NOT EXISTS guard).

-- Paso 1: corregir el seed de planes ES base.
UPDATE subscription_plans
SET linked_program_id = 2
WHERE country = 'ES' AND linked_program_id = 3;

-- Paso 2: cancelar plan_linked enrollments actuales de miembros ES en Piernas y Gluteos.
-- Usa LEFT JOIN para incluir casos con subscription_id NULL (e.g., Leandro Scarponi —
-- enrollment plan_linked huérfano cuyo sub se desvinculó).
UPDATE program_enrollments pe
JOIN users u ON u.id = pe.user_id
LEFT JOIN subscriptions s ON s.id = pe.subscription_id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
SET pe.status = 'cancelled',
    pe.cancelled_at = NOW(),
    pe.notes = TRIM(CONCAT(
      COALESCE(pe.notes, ''),
      '\n[migración 0119] cancelada por seed-fix: plan ES apuntaba a Piernas y Gluteos por error'
    ))
WHERE pe.program_id = 3
  AND pe.status = 'active'
  AND pe.source = 'plan_linked'
  AND (sp.country = 'ES' OR u.branch_id = 14);

-- Paso 3: re-inscribir a esos miembros en Foundation Cuerpo Completo (programa 2),
-- preservando subscription_id cuando existe. NOT EXISTS guard evita duplicados si
-- el usuario ya tiene un enrollment activo en programa 2 de otra fuente
-- (ej: Leandro y Lea ya tenían Foundation Cuerpo Completo activo en paralelo).
INSERT INTO program_enrollments
  (user_id, program_id, status, current_week, sessions_completed_this_week,
   source, subscription_id, enrolled_at, notes)
SELECT pe.user_id, 2, 'active', 1, 0, 'plan_linked', pe.subscription_id, NOW(),
       '[migración 0119] re-inscripto en Foundation Cuerpo Completo tras seed-fix de planes ES'
FROM program_enrollments pe
JOIN users u ON u.id = pe.user_id
WHERE pe.program_id = 3
  AND pe.status = 'cancelled'
  AND pe.source = 'plan_linked'
  AND pe.notes LIKE '%[migración 0119]%'
  AND u.branch_id = 14
  AND NOT EXISTS (
    SELECT 1 FROM program_enrollments pe2
    WHERE pe2.user_id = pe.user_id
      AND pe2.program_id = 2
      AND pe2.status = 'active'
  );
