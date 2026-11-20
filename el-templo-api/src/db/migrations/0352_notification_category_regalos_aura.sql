-- Migration 0352: categoria de notificacion 'regalos_aura'
-- Fase 215 (ajustes, #30): interruptor "Regalos de Aura" en Perfil. Apagado, no
-- se manda la push del regalo recibido, pero el aviso queda igual en la bandeja
-- y la Aura se acredita.
--
-- Agrega el valor 'regalos_aura' AL FINAL del enum en las dos tablas que lo
-- comparten (el enum de Drizzle es uno solo): los seis valores existentes
-- conservan su orden byte a byte. El nombre fisico de la columna es
-- notification_category en ambas tablas (1er argumento de mysqlEnum).
--
-- Sin backfill: getUserPreferences devuelve true para toda categoria sin fila
-- propia, asi que el interruptor nace encendido para todos.
--
-- Hand-written: nunca drizzle-kit push/migrate, la tabla _migrations es la
-- unica fuente de verdad. Cero datos de prueba (staging y prod comparten
-- servidor MySQL). Un comentario SQL nunca debe contener el separador de
-- statements: el runner parte los statements crudos antes de borrar comentarios.

ALTER TABLE `notification_templates`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes','referidos','regalos_aura')
  NOT NULL;
--> statement-breakpoint

ALTER TABLE `notification_preferences`
  MODIFY COLUMN `notification_category`
  enum('entrenamiento','programas','motivacion','anuncios','planes','referidos','regalos_aura')
  NOT NULL;
