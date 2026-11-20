-- 0350_member_notifications.sql
-- Fase 215 Regalar Aura (D-17, D-18).
--
-- Bandeja de avisos de cada persona: una fila por aviso que la app le manda
-- (regalo de Aura recibido y, de ahora en mas, el resto de los avisos). Guarda
-- una copia del titulo, el cuerpo y el destino (route, destination_type,
-- destination_section, whatsapp_text), la categoria del aviso (kind, por ejemplo
-- aura_gift), la referencia al regalo (ref_id), el momento desde el que se ve
-- (shown_at, el envio o la hora programada para quien no tiene push) y la marca
-- de leido (read_at). Retencion de 90 dias.
--
-- Nace strict en el modulo `notifications`. No se reusa pending_notifications
-- porque esa cola se purga a las 24 horas.
--
-- Sin FK a pending_notifications a proposito: la cola se purga a las 24 horas y
-- la bandeja tiene que sobrevivirle. pending_notification_id es solo la clave
-- de idempotencia del barrido.
--
-- Dos candados en la base. uq_member_notifications_tenant_pending evita duplicar
-- un aviso si el barrido de la cola reintenta. uq_member_notifications_tenant_user_dedupe
-- evita duplicar el aviso de quien no tiene push (no tiene fila en la cola) si un
-- job vuelve a pedirlo, con la clave que arma inboxDedupeKey. Los NULL no chocan:
-- las filas que vienen de la cola dejan dedupe_key en NULL.
--
-- Lleva tenant_id NOT NULL DEFAULT 1 y su FK a tenants desde el primer dia.
-- Los timestamps NULL llevan NULL DEFAULT NULL explicito para que MySQL no
-- auto-pueble el primer TIMESTAMP de la tabla.
--
-- Cero datos: staging y prod comparten servidor MySQL, todo DDL commiteado
-- corre contra prod.
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `member_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `pending_notification_id` int NULL,
  `dedupe_key` varchar(160) NULL,
  `kind` varchar(32) NOT NULL,
  `ref_id` int NULL,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `route` varchar(200) NULL,
  `destination_type` varchar(20) NOT NULL DEFAULT 'app_section',
  `destination_section` varchar(40) NULL,
  `whatsapp_text` varchar(300) NULL,
  `shown_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_member_notifications_tenant_pending` (`tenant_id`, `pending_notification_id`),
  UNIQUE KEY `uq_member_notifications_tenant_user_dedupe` (`tenant_id`, `user_id`, `dedupe_key`),
  KEY `idx_member_notifications_tenant_user_shown` (`tenant_id`, `user_id`, `shown_at`),
  KEY `idx_member_notifications_tenant_user_read` (`tenant_id`, `user_id`, `read_at`),
  KEY `idx_member_notifications_shown` (`shown_at`),
  CONSTRAINT `fk_member_notifications_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_member_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
