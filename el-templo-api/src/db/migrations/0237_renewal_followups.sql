-- 0237_renewal_followups.sql
-- Modulo de Renovaciones (brief Nacho, 2026-09-24): pantalla operativa que
-- reemplaza el Excel semanal de vencimientos. Nace con tenant_id desde el
-- arranque (mismo criterio que avisos/referral_partners/staff_shifts,
-- migraciones 0216/0215/0223) -- el modulo entero nace strict en
-- TENANT_STRICT_MODULES, sin deuda de allowlist previa.
--
-- Tres tablas:
--   renewal_reasons -- motivos configurables de "No renovo" (brief S7).
--   renewal_message_templates -- las 4 plantillas de WhatsApp (pasos 1-4).
--   renewal_followups -- lo MANUAL de cada fila (mensaje, no_renovo+motivo,
--     quien/cuando). Renovo / Volvio tarde / Pausada se DERIVAN en cada
--     lectura desde subscriptions y NUNCA se persisten acá (ver SPEC
--     "derivado vs. persistido").
--
-- Seeds (idempotentes por NOT EXISTS, para TODOS los tenants existentes via
-- INSERT ... SELECT FROM tenants, cero ids hardcodeados):
--   renewal_reasons: Lesion, Viaje, Precio, Se muda, Cambio de gimnasio, Otro.
--   renewal_message_templates: 4 textos neutros (no asumen "El Templo" como
--     nombre del gimnasio -- se usa {gimnasio} resuelto por tenants.name en
--     el propio INSERT), con placeholders {nombre}/{plan}/{vencimiento}.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202/0215/0216/0223).
-- NUNCA drizzle-kit push/migrate -- la tabla _migrations es la unica fuente
-- de verdad, local y prod.
--
-- Numeracion: 0236 es la mas alta en el arbol al momento de escribir esta
-- migracion (verificado con `ls src/db/migrations/*.sql | sort | tail`).
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `renewal_reasons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `label` varchar(80) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_renewal_reasons_tenant_label` (`tenant_id`, `label`),
  CONSTRAINT `fk_renewal_reasons_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
--> statement-breakpoint

CREATE TABLE `renewal_message_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `step` tinyint NOT NULL,
  `body` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_renewal_message_templates_tenant_step` (`tenant_id`, `step`),
  CONSTRAINT `fk_renewal_message_templates_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
--> statement-breakpoint

CREATE TABLE `renewal_followups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `subscription_id` int NOT NULL,
  `user_id` int NOT NULL,
  `message_count` tinyint NOT NULL DEFAULT 0,
  `last_message_at` timestamp NULL,
  `manual_status` enum('en_proceso','no_renovo') NOT NULL DEFAULT 'en_proceso',
  `reason_id` int NULL,
  `reason_note` varchar(500) NULL,
  `updated_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_renewal_followups_tenant_subscription` (`tenant_id`, `subscription_id`),
  KEY `idx_renewal_followups_tenant_user` (`tenant_id`, `user_id`),
  CONSTRAINT `fk_renewal_followups_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `renewal_followups_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`),
  CONSTRAINT `renewal_followups_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `renewal_followups_reason_id_renewal_reasons_id_fk` FOREIGN KEY (`reason_id`) REFERENCES `renewal_reasons` (`id`),
  CONSTRAINT `renewal_followups_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
);
--> statement-breakpoint

INSERT INTO renewal_reasons (`tenant_id`, `label`, `sort_order`)
SELECT t.id, 'Lesión', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_reasons r WHERE r.tenant_id = t.id AND r.label = 'Lesión'
);
--> statement-breakpoint

INSERT INTO renewal_reasons (`tenant_id`, `label`, `sort_order`)
SELECT t.id, 'Viaje', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_reasons r WHERE r.tenant_id = t.id AND r.label = 'Viaje'
);
--> statement-breakpoint

INSERT INTO renewal_reasons (`tenant_id`, `label`, `sort_order`)
SELECT t.id, 'Precio', 2
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_reasons r WHERE r.tenant_id = t.id AND r.label = 'Precio'
);
--> statement-breakpoint

INSERT INTO renewal_reasons (`tenant_id`, `label`, `sort_order`)
SELECT t.id, 'Se muda', 3
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_reasons r WHERE r.tenant_id = t.id AND r.label = 'Se muda'
);
--> statement-breakpoint

INSERT INTO renewal_reasons (`tenant_id`, `label`, `sort_order`)
SELECT t.id, 'Cambió de gimnasio', 4
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_reasons r WHERE r.tenant_id = t.id AND r.label = 'Cambió de gimnasio'
);
--> statement-breakpoint

INSERT INTO renewal_reasons (`tenant_id`, `label`, `sort_order`)
SELECT t.id, 'Otro', 5
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_reasons r WHERE r.tenant_id = t.id AND r.label = 'Otro'
);
--> statement-breakpoint

INSERT INTO renewal_message_templates (`tenant_id`, `step`, `body`)
SELECT t.id, 1,
  CONCAT('Hola {nombre}! Te escribimos de ', t.name, ': tu plan {plan} vence el {vencimiento}. ¿Querés que te lo renovemos?')
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_message_templates m WHERE m.tenant_id = t.id AND m.step = 1
);
--> statement-breakpoint

INSERT INTO renewal_message_templates (`tenant_id`, `step`, `body`)
SELECT t.id, 2,
  'Hola {nombre}! Te recordamos que tu plan {plan} vence el {vencimiento}. Cualquier consulta para renovarlo, escribinos.'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_message_templates m WHERE m.tenant_id = t.id AND m.step = 2
);
--> statement-breakpoint

INSERT INTO renewal_message_templates (`tenant_id`, `step`, `body`)
SELECT t.id, 3,
  'Hola {nombre}! Tu plan {plan} vence hoy ({vencimiento}) o ya venció. ¿Te ayudamos a renovarlo para que no pierdas tu lugar?'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_message_templates m WHERE m.tenant_id = t.id AND m.step = 3
);
--> statement-breakpoint

INSERT INTO renewal_message_templates (`tenant_id`, `step`, `body`)
SELECT t.id, 4,
  'Hola {nombre}! Seguimos a tu disposición para renovar tu plan {plan} (venció el {vencimiento}). Contanos si te podemos ayudar en algo.'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM renewal_message_templates m WHERE m.tenant_id = t.id AND m.step = 4
);
