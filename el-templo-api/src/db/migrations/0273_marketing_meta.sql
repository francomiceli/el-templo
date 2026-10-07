-- 0273_marketing_meta.sql
-- Fase 195 (Web SEO local + AEO + atribucion), plan 08, D-19/D-20/D-24/D-25.
-- Meta del lado servidor: CAPI como outbox derivado por job y gasto diario.
--
-- Dos tablas:
--   meta_capi_events -- OUTBOX de Meta Conversions API. Un job (cada 10
--   minutos) DERIVA los eventos del estado de la base (registro, reserva de
--   prueba, primer pago) sin hooks en los caminos de pago, los inserta con un
--   event_id determinista (reg-userId, trial-bookingId, purchase-subscriptionId)
--   y los manda por lotes. La unique (tenant_id, event_id) es la idempotencia:
--   correr el barrido dos veces no duplica ni reenvia. El status registra el
--   motivo de cada exclusion (skipped_es por D-25, skipped_ios y
--   skipped_no_origin por D-24, skipped_window por la ventana de Meta) para
--   que quede auditable por que un evento nunca viajo.
--
--   ad_spend_daily -- gasto por campaña y dia traido de la Marketing API de
--   Meta (Insights). El job diario re-trae los ultimos 7 dias porque Meta
--   ajusta el gasto, y hace upsert por la unique. La moneda se guarda tal cual
--   la informa la cuenta publicitaria: NUNCA se convierte.
--
--   Las dos nacen tenant-scoped y STRICT en el modulo marketing
--   (src/db/tenant-tables.ts TENANT_STRICT_MODULES["marketing"]).
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

CREATE TABLE `meta_capi_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `event_id` varchar(64) NOT NULL,
  `event_name` varchar(40) NOT NULL,
  `user_id` int NOT NULL,
  `entity_type` varchar(20) NOT NULL,
  `entity_id` int NOT NULL,
  `action_source` varchar(20) NOT NULL,
  `event_time` timestamp NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `last_error` varchar(500) NULL,
  `sent_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_meta_capi_events_tenant_event` (`tenant_id`, `event_id`),
  KEY `idx_meta_capi_events_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_meta_capi_events_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `meta_capi_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE `ad_spend_daily` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `platform` varchar(16) NOT NULL DEFAULT 'meta',
  `account_id` varchar(40) NOT NULL,
  `campaign_id` varchar(40) NOT NULL,
  `campaign_name` varchar(255) NOT NULL,
  `spend_date` date NOT NULL,
  `spend` decimal(14,2) NOT NULL,
  `currency` char(3) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ad_spend_daily_tenant_campaign_date` (`tenant_id`, `platform`, `campaign_id`, `spend_date`),
  KEY `idx_ad_spend_daily_tenant_date` (`tenant_id`, `spend_date`),
  CONSTRAINT `fk_ad_spend_daily_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
