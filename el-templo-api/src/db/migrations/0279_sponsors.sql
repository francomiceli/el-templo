-- 0279_sponsors.sql
-- Fase 199 (Rediseno de Mi Templo + patrocinadores), D-17 / D-18 / D-19 / D-25.
-- Crea `sponsor_brands` y `sponsor_views`. Un patrocinador NO es un Partner
-- (fase 179): la marca da beneficios a nuestros socios, no nos trae socios con
-- comision (D-17).
--
-- `sponsor_brands` es de PLATAFORMA (D-18): no tiene tenant_id y se declara en
-- TENANT_EXEMPT_TABLES. Los gimnasios no tienen publicidad propia.
--
-- `sponsor_views` es gym-owned (D-25): metricas por socio y marca con el
-- tenant_id del socio. Nace strict (TENANT_STRICT_MODULES["sponsors"]).
--
-- Unicidades:
--   uq_sponsor_views_user_brand (user_id, brand_id) -- una fila por socio y
--     marca. `user_id` va PRIMERO porque `brand_id` apunta a una tabla exenta
--     (sponsor_brands) y el verificador deriva el scope de tenant del primer
--     campo si es FK a una tabla gym-owned. Va al allowlist de tenant-tables.ts.
--
-- Fechas: `first_seen_at`, `tapped_at` y `redeem_at` son DATETIME en UTC
-- (Drizzle las escribe y lee como UTC).
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: nunca drizzle-kit push/migrate, la tabla _migrations es la
-- unica fuente de verdad.
--
-- Numeracion: 0279 porque la fase 196 reserva hasta la 0278.
--
-- benefit varchar(12): decision UAT D6 de Franco (2026-10-16), editada antes de
-- cualquier push.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `sponsor_brands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `category` varchar(60) NOT NULL,
  `logo_url` varchar(500) NULL,
  `icon` varchar(40) NULL,
  `bg_color` varchar(7) NOT NULL,
  `text_color` varchar(7) NOT NULL,
  `benefit` varchar(12) NOT NULL,
  `detail` varchar(80) NOT NULL,
  `conditions` text NULL,
  `redeem_type` enum('code','carnet') NOT NULL,
  `redeem_code` varchar(40) NULL,
  `country_ar` boolean NOT NULL DEFAULT false,
  `country_es` boolean NOT NULL DEFAULT false,
  `starts_on` date NULL,
  `ends_on` date NULL,
  `is_active` boolean NOT NULL DEFAULT false,
  `sort_order` int NOT NULL DEFAULT 0,
  `partner_id` int NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sponsor_brands_active_sort` (`is_active`, `sort_order`),
  CONSTRAINT `sponsor_brands_partner_id_referral_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `referral_partners` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sponsor_brands_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE `sponsor_views` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `brand_id` int NOT NULL,
  `user_id` int NOT NULL,
  `first_seen_at` datetime NOT NULL,
  `tapped_at` datetime NULL,
  `redeem_at` datetime NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sponsor_views_user_brand` (`user_id`, `brand_id`),
  KEY `idx_sponsor_views_brand` (`brand_id`),
  CONSTRAINT `fk_sponsor_views_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `sponsor_views_brand_id_sponsor_brands_id_fk` FOREIGN KEY (`brand_id`) REFERENCES `sponsor_brands` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sponsor_views_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
