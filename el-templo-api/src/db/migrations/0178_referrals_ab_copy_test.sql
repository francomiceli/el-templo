-- 0178_referrals_ab_copy_test.sql
-- A/B test del copy de la card de referidos (v5.5, follow-up).
-- Hand-written: drizzle-kit generate sigue roto por el drift de goal_plan_type
-- y el meta/_journal.json esta desincronizado -- el _migrations table es la
-- fuente de verdad. NEVER drizzle-kit push/migrate.
-- Siguiente numero secuencial en esta rama es 0178 (ultimo 0177_referidos...).
-- (1) copy_variant en referrals: estampa que copy vio el REFERIDOR al crearse el
--     vinculo (atribucion robusta aunque despues cambie el bucketing). NULL para
--     los vinculos pre-experimento -- el reporte solo cuenta las variantes no NULL.
-- (2) referral_cta_clicks: un evento por tap en "Compartir codigo" de la card,
--     con la variante recomputada server-side desde el user id (par A / impar B).
-- Sin punto y coma dentro de estas lineas de comentario (el runner splittea por
-- punto y coma ANTES de stripear los guiones dobles).

ALTER TABLE `referrals`
  ADD COLUMN `copy_variant` enum('A','B') NULL;

CREATE TABLE IF NOT EXISTS `referral_cta_clicks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `variant` enum('A','B') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `referral_cta_clicks_id` PRIMARY KEY(`id`),
  CONSTRAINT `referral_cta_clicks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE INDEX `idx_referral_cta_clicks_variant_user` ON `referral_cta_clicks` (`variant`,`user_id`);
