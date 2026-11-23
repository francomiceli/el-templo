-- 0357_pase_especial_sin_programa.sql
-- Hotfix de datos (2026-11-23): un pase especial NUNCA otorga programas.
-- El form de planes del admin precargaba "Foundation - Cuerpo Completo" al
-- abrirse en presencial y no lo limpiaba al pasar el plan a especial (y con la
-- categoria especial el campo queda oculto, asi que no se podia sacar). Asignar
-- un pase asi cancelaba la inscripcion del socio a Foundation y le creaba una
-- nueva desde la semana 1 (enrollment-service enrollFromPlan).
-- Desde este hotfix el servidor descarta los programas de un plan especial al
-- crear y al editar. Esta migracion limpia los que ya estaban guardados.
-- Visto en prod el 2026-11-23: "Flexi - 8 clases" (ES) con Foundation y cero
-- ventas. Los 4 pases de la masterclass de verticales ya se limpiaron a mano.
-- Todos los tenants (es un invariante del modelo). Idempotente.
-- Hand-written, NUNCA drizzle-kit push o migrate.
UPDATE subscription_plans
   SET linked_program_id = NULL,
       grants_all_programs = 0
 WHERE plan_category = 'especial'
   AND (linked_program_id IS NOT NULL OR grants_all_programs = 1);

DELETE pp
  FROM plan_programs pp
  JOIN subscription_plans p ON p.id = pp.subscription_plan_id
 WHERE p.plan_category = 'especial';
