-- 0199: membership_kind en subscriptions — etiqueta 'bonificada'/'staff' para
-- que analytics de membresía pueda excluir membresías internas (2026-08-07).
-- Hand-written (db:generate sigue roto por el drift de goal_plan_type).
-- Enum idéntico byte a byte al mysqlEnum de src/db/schema/subscriptions.ts.
-- Backfill: solo subs con override a $0 cuya razón identifica claramente
-- staff o bonificación. Los casos ambiguos (test, prueba, cambio de plan,
-- apodos) quedan 'paga' para revisión manual desde el admin.
-- El UPDATE de staff corre primero: "bonificado staff 100%off" es staff.
ALTER TABLE subscriptions ADD COLUMN membership_kind ENUM('paga','bonificada','staff') NOT NULL DEFAULT 'paga';
--> statement-breakpoint
UPDATE subscriptions
SET membership_kind = 'staff'
WHERE price_override_amount = 0
  AND (
    LOWER(price_override_reason) LIKE '%profe%'
    OR LOWER(price_override_reason) LIKE '%gerencia%'
    OR LOWER(price_override_reason) LIKE '%staff%'
  );
--> statement-breakpoint
UPDATE subscriptions
SET membership_kind = 'bonificada'
WHERE membership_kind = 'paga'
  AND price_override_amount = 0
  AND (
    LOWER(price_override_reason) LIKE '%bonif%'
    OR LOWER(price_override_reason) LIKE '%nonif%'
    OR LOWER(price_override_reason) LIKE '%sorteo%'
    OR LOWER(price_override_reason) LIKE '%regalo%'
    OR LOWER(price_override_reason) LIKE '%premio%'
    OR LOWER(price_override_reason) LIKE '%influe%'
    OR LOWER(price_override_reason) LIKE '%canje%'
    OR LOWER(price_override_reason) LIKE '%murales%'
  );
