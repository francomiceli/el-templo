-- 0216_communications.sql
-- Fase 193 (D-11, D-12, D-13, D-14, D-15, D-24, D-25): cimiento de datos de
-- Comunicaciones. Crea `avisos`, `aviso_events` y `tv_avisos` -- las tres
-- tablas nacen con tenant_id desde el arranque (mismo criterio que
-- `referral_partners`, migracion 0215), y agrega `tv_aviso_id` a
-- `tv_class_state` para que el estado de TV pueda referenciar el aviso que
-- se esta mostrando (D-25).
--
-- Unicidades:
--   uq_avisos_tenant_code (tenant_id, code) -- compuesta: `code` identifica
--     un aviso de sistema (kind='system', ej. "rating_prompt") dentro de un
--     tenant -- los avisos custom dejan `code` NULL y MySQL permite N filas
--     NULL bajo esta misma unique. `code` NO deriva de ninguna FK scopeada,
--     asi que NO va al allowlist de tenant-tables.ts (necesita tenant_id
--     explicito en la unique, ya lo tiene).
--   uq_aviso_events_aviso_user_type (aviso_id, user_id, event_type) -- un
--     evento por aviso, socio y tipo (D-11). Derivada de FK scopeada: el
--     primer campo `aviso_id` apunta a `avisos`, tabla gym-owned -> SI va al
--     allowlist de tenant-tables.ts, sin tenant_id explicito en la unique.
--
-- NO se toca la columna `screen` de `tv_class_state` (varchar(10) ya acepta
-- el valor 'aviso' sin ALTER de tipo, ver docblock de tv.ts) -- solo se
-- agrega la columna `tv_aviso_id`, y el ALTER va DESPUES del CREATE de
-- `tv_avisos` (nunca antes, por la FK).
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202/0215). NUNCA
-- drizzle-kit push/migrate -- la tabla _migrations es la unica fuente de
-- verdad, local y prod.
--
-- Numeracion: verificado 2026-09-02 con `git ls-tree --name-only
-- origin/master el-templo-api/src/db/migrations/` y lo mismo contra
-- origin/staging -- ambas ramas topean en 0215_referral_partners.sql. 0216
-- es el siguiente libre real en ambas. Nota (worktree et-193, v6.1 aparte):
-- la base local `eltemplo` de este checkout ya tiene aplicadas
-- `0216_platform_core.sql` y `0217_gym_catalog.sql` de la rama v6.1
-- (`et-182`/`et-185`, fuera de este worktree) -- son archivos de OTRO
-- checkout, con OTRO nombre, y no colisionan con este (`_migrations`
-- trackea por nombre de archivo). No se tocan ni se renumeran.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `avisos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `kind` enum('system','custom') NOT NULL DEFAULT 'custom',
  `code` varchar(60) NULL,
  `placement` enum('popup','tarjeta') NOT NULL DEFAULT 'popup',
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `button_text` varchar(60) NOT NULL,
  `destination_type` enum('app_section','whatsapp_sales') NOT NULL DEFAULT 'app_section',
  `destination_section` varchar(40) NULL,
  `whatsapp_text` varchar(300) NULL,
  `frequency_type` enum('once','every_n_days','every_open') NOT NULL DEFAULT 'every_n_days',
  `frequency_days` int NULL,
  `status` enum('draft','active','paused') NOT NULL DEFAULT 'draft',
  `starts_on` date NULL,
  `ends_on` date NULL,
  `scope_branch_ids` json NULL,
  `scope_countries` json NULL,
  `scope_segments` json NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_avisos_tenant_code` (`tenant_id`, `code`),
  KEY `idx_avisos_tenant_placement_status` (`tenant_id`, `placement`, `status`),
  CONSTRAINT `fk_avisos_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
--> statement-breakpoint

CREATE TABLE `aviso_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `aviso_id` int NOT NULL,
  `user_id` int NOT NULL,
  `event_type` enum('shown','dismissed','clicked') NOT NULL,
  `event_count` int NOT NULL DEFAULT 1,
  `first_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aviso_events_aviso_user_type` (`aviso_id`, `user_id`, `event_type`),
  KEY `idx_aviso_events_user` (`user_id`),
  CONSTRAINT `fk_aviso_events_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `aviso_events_aviso_id_avisos_id_fk` FOREIGN KEY (`aviso_id`) REFERENCES `avisos` (`id`),
  CONSTRAINT `aviso_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
);
--> statement-breakpoint

CREATE TABLE `tv_avisos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `title` varchar(120) NOT NULL,
  `body` text NOT NULL,
  `mode` enum('manual','flex_inicio','flex_final') NOT NULL DEFAULT 'manual',
  `is_active` boolean NOT NULL DEFAULT false,
  `scope_branch_ids` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tv_avisos_tenant_active` (`tenant_id`, `is_active`),
  CONSTRAINT `fk_tv_avisos_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
--> statement-breakpoint

ALTER TABLE `tv_class_state` ADD COLUMN `tv_aviso_id` int NULL;
--> statement-breakpoint
ALTER TABLE `tv_class_state` ADD CONSTRAINT `fk_tv_class_state_aviso` FOREIGN KEY (`tv_aviso_id`) REFERENCES `tv_avisos` (`id`);
