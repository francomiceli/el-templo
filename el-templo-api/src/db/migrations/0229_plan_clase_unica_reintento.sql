-- Clase única, reintento (2026-09-15). La 0228 corrio y quedo registrada
-- pero su INSERT IGNORE no inserto nada: en prod y staging ya existian dos
-- planes ARCHIVADOS del import de marzo 2026 ("CLASE ÚNICA" id 72 con 13
-- suscripciones historicas y "CLASE SUELTA" id 74 con 3), y el indice unico
-- ux_subscription_plans_tenant_name_country compara con utf8mb4_0900_ai_ci
-- (sin distinguir mayusculas ni acentos), asi que "Clase única" colisiono con
-- "CLASE ÚNICA" y el IGNORE lo salteo en silencio.
--
-- Estrategia: NO reciclar el id 72 (sus suscripciones historicas seguirian
-- apuntando a un plan con otra configuracion). Se renombran los dos planes
-- archivados con un sufijo que libera el nombre y se repite el INSERT de la
-- 0228. Idempotente: el UPDATE matchea 0 filas en una segunda corrida y el
-- INSERT IGNORE se saltea si el plan ya existe.
-- Regla dura (skill el-templo-db-migrations): NUNCA un punto-y-coma dentro de
--   un comentario, el runner splitea por ese caracter.

UPDATE subscription_plans
  SET name = CONCAT(name, ' (archivado 2026-03)'), updated_at = NOW()
  WHERE tenant_id = 1
    AND country = 'AR'
    AND is_archived = 1
    AND name IN ('CLASE ÚNICA', 'CLASE SUELTA');

INSERT IGNORE INTO subscription_plans
  (name, description, plan_tier, booking_mode, plan_category, linked_program_id,
   price_regular, price_zero, price_credit_card,
   duration_days, classes_per_week, monthly_class_budget, requires_presencial,
   multi_branch, is_trial, is_group, group_max_members,
   is_active, is_archived, country, currency, grants_all_programs,
   created_at, updated_at)
VALUES
  ('Clase única', 'Una clase presencial suelta. Precio acordado al cobrar.',
   'flex', 'flexible', 'presencial', NULL,
   20000, 20000, NULL,
   1, 1, NULL, 0,
   0, 0, 0, NULL,
   1, 0, 'AR', 'ARS', 0,
   NOW(), NOW());
