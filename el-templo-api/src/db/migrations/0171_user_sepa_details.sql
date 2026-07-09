-- Domiciliación bancaria (SEPA) para socios de sedes de España
-- Hand-written: drizzle-kit generate sigue roto por el drift de goal_plan_type
-- Tabla 1:1 con users (mismo patrón que member_profiles) porque estos campos
-- solo aplican a sucursales ES y no deben ensuciar la ficha de Argentina
CREATE TABLE IF NOT EXISTS `user_sepa_details` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `debtor_name` varchar(150),
  `address` varchar(255),
  `postal_code` varchar(10),
  `city` varchar(100),
  `country` varchar(2) NOT NULL DEFAULT 'ES',
  `nif` varchar(20),
  `iban` varchar(34),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_sepa_details_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_sepa_details_user_id_unique` UNIQUE(`user_id`),
  CONSTRAINT `user_sepa_details_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
