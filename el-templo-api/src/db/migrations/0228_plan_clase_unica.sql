-- Clase única (pedido 2026-09-15): plan presencial de UNA clase con precio
-- acordado al cobrar. Hand-written (patron 0207, matriz de paquetes).
--
-- Semantica:
--   duration_days=1 -- vence al dia siguiente del alta (end_date = alta + 1,
--     misma formula que cualquier plan). Con classes_per_week=1 el saldo
--     nace en 1 (ceil(1/7)*1) y se descuenta en el check-in.
--   plan_category='presencial', plan_tier='flex', booking_mode='flexible' --
--     reserva como un flex comun, limite semanal 1, sin turnos fijos.
--   linked_program_id NULL -- NO inscribe en Foundation (a diferencia del
--     default del formulario del admin para presenciales).
--   price_regular=price_zero=20000 -- precio de REFERENCIA. El precio real se
--     carga como "precio acordado" (price_override_amount + motivo) al asignar.
--   Solo AR/ARS por ahora. Los recordatorios de vencimiento (push
--     plan_renewal_warning_*, pop-up plan_expiry, regla plan_expires_in_days)
--     ignoran planes con duration_days < 7 -- ver
--     deriveReminderCoveredUntilBatch en subscriptions/service.ts.
--   tenant_id NO se especifica (cae al DEFAULT 1, patron 0179/0207). INSERT
--     IGNORE + indice unico ux_subscription_plans_tenant_name_country (0196)
--     hacen la migracion idempotente.
-- Regla dura (skill el-templo-db-migrations): NUNCA un punto-y-coma dentro de
--   un comentario, el runner splitea por ese caracter.

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
