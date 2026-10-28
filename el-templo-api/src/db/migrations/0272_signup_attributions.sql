-- 0272_signup_attributions.sql
-- Fase 195 (Web SEO local + AEO + atribucion), plan 07, D-18/D-21.1/D-24.
-- Atribucion propia de altas: de donde vino cada alumno nuevo.
--
-- Una tabla:
--   signup_attributions -- UNA fila por usuario dado de alta (user_id UNIQUE
--   por tenant). La llenan dos caminos: el registro autoservicio
--   (captured_via 'register', web/Android/iOS) y el alta de Sesion de Prueba
--   del admin (captured_via 'admin_trial', origen cargado a mano por
--   recepcion). Guarda lo CRUDO que mando el cliente (utm, promo, ref,
--   referrer, landing, click ids) mas el canal ya clasificado: el clasificador
--   es una funcion pura del server (modules/marketing/channel.ts) y se puede
--   re-clasificar con lo crudo.
--
--   platform ('web','android','ios','admin','unknown') lo declara el cliente:
--   Meta CAPI (plan 195-08) excluye 'ios' (Apple ATT, D-24) y 'unknown'.
--   client_ip y user_agent son PII temporal que solo CAPI necesita: el job de
--   195-08 los purga (pii_purged_at) a mas tardar a los 7 dias.
--
--   Nace tenant-scoped y STRICT (src/db/tenant-tables.ts
--   TENANT_STRICT_MODULES["marketing"]) como renewal_followups (0237) y
--   trial_followups (0241): modulo nuevo, sin deuda previa que tolerar.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type. NUNCA drizzle-kit push/migrate -- la tabla
-- _migrations es la unica fuente de verdad, local y prod.
--
-- Numeracion: bloque reservado 0270-0279 de la fase 195 (D-28).
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `signup_attributions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `branch_id` int NULL,
  `channel` varchar(32) NOT NULL,
  `utm_source` varchar(150) NULL,
  `utm_medium` varchar(150) NULL,
  `utm_campaign` varchar(150) NULL,
  `utm_content` varchar(150) NULL,
  `utm_term` varchar(150) NULL,
  `promo_code` varchar(50) NULL,
  `ref_code` varchar(32) NULL,
  `manual_origin` varchar(32) NULL,
  `referrer_host` varchar(255) NULL,
  `landing_path` varchar(500) NULL,
  `fbclid` varchar(255) NULL,
  `fbc` varchar(300) NULL,
  `fbp` varchar(100) NULL,
  `gclid` varchar(255) NULL,
  `platform` varchar(16) NOT NULL,
  `captured_via` varchar(16) NOT NULL,
  `first_touch_at` timestamp NULL,
  `client_ip` varchar(45) NULL,
  `user_agent` varchar(512) NULL,
  `pii_purged_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_signup_attributions_tenant_user` (`tenant_id`, `user_id`),
  KEY `idx_signup_attributions_tenant_created` (`tenant_id`, `created_at`),
  KEY `idx_signup_attributions_tenant_campaign` (`tenant_id`, `utm_campaign`),
  CONSTRAINT `fk_signup_attributions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `signup_attributions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `signup_attributions_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL
);
