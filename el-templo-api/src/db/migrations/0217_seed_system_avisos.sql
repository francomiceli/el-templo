-- 0217_seed_system_avisos.sql
-- Fase 193 (D-08, D-09, D-10, D-15a, D-22): siembra los 7 avisos de sistema
-- para CADA tenant que ya existe hoy -- calificacion de clase
-- (rating_prompt), propuesta de mejora (improvement_prompt), vencimiento de
-- plan (plan_expiry) y las 4 tarjetas fijas del carrusel de Mi Templo
-- (card_improvement, card_referral, card_upsell, card_program). El copy es
-- LITERAL el que hoy esta hardcodeado en los componentes de la app -- tiene
-- que coincidir byte a byte con `SYSTEM_AVISOS` de
-- `el-templo-api/src/modules/communications/system-avisos.ts`.
--
-- ES UNA MIGRACION DE DATOS, NO UN SEED DE TEST/DEV -- va en migracion y no
-- en un script aparte porque staging y prod comparten el mismo servidor
-- MySQL (regla 4 del skill el-templo-db-migrations): un seed de datos de
-- PROD tiene que quedar en `_migrations` con el mismo audit trail que un
-- DDL, y aplicarse exactamente una vez por ambiente cuando el tren de
-- despliegue corre `pnpm db:migrate`.
--
-- CERO IDS DE TENANT HARDCODEADOS (D-22): cada INSERT resuelve el tenant con
-- un `SELECT t.id` sobre la tabla `tenants` (alias `t`), asi que siembra
-- para TODOS los gimnasios existentes -- el de hoy y cualquiera que se haya
-- dado de alta
-- ANTES de que este archivo corra. Los tenants dados de alta DESPUES (fase
-- 182, wizard, v6.1) no pasan por aca: los siembra `seedSystemAvisos` en el
-- flujo de alta (D-22, segundo camino).
--
-- IDEMPOTENTE: cada INSERT lleva su propia subquery correlacionada de
-- exclusion por `(tenant_id, code)` -- la MISMA pareja que protege la unique
-- `uq_avisos_tenant_code` (migracion 0216) -- asi que re-correr este archivo
-- (o una fila que ya exista por otro camino) no duplica ni pisa un `title`
-- que el admin haya editado despues (T-193-08). La subquery de exclusion es
-- lo que garantiza la idempotencia -- la unique es solo la red de
-- contencion si algun dia esa condicion tuviera un bug.
--
-- `kind='system'`, sin vigencia (`starts_on`/`ends_on` NULL) y sin alcance
-- (`scope_branch_ids`/`scope_countries`/`scope_segments` NULL = todos): las
-- columnas quedan afuera del INSERT y toman su default NULL de la migracion
-- 0216.
--
-- Numeracion: verificado 2026-09-02 con `git ls-tree --name-only
-- origin/master el-templo-api/src/db/migrations/` y lo mismo contra
-- origin/staging -- ambas ramas topean en 0216_communications.sql (la
-- migracion anterior de esta misma fase). 0217 es el siguiente libre real
-- en ambas. Nota (worktree et-193, v6.1 aparte): la base local `eltemplo`
-- de este checkout ya tiene aplicada `0217_gym_catalog.sql` de la rama v6.1
-- (`et-182`/`et-185`, fuera de este worktree) -- otro archivo, otro
-- checkout, `_migrations` trackea por nombre y no colisiona.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'rating_prompt', 'popup',
  '¿Cómo estuvo tu clase?',
  'Tu opinión es anónima y nos ayuda a mejorar las clases.',
  'Puntuar', 'app_section', 'mi_templo', NULL,
  'every_n_days', 7, 'active', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'rating_prompt'
);
--> statement-breakpoint

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'improvement_prompt', 'popup',
  '¿Qué mejorarías de El Templo?',
  'El equipo está escuchando: contanos qué te gustaría para darte la mejor experiencia.',
  'Enviar sugerencia', 'app_section', 'proponer_mejora', NULL,
  'every_n_days', 30, 'active', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'improvement_prompt'
);
--> statement-breakpoint

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'plan_expiry', 'popup',
  'Tu membresía está por vencer',
  'Te quedan {dias} de acceso. Renovala por WhatsApp para no perder tu lugar en las clases.',
  'Renovar por WhatsApp', 'whatsapp_sales', NULL, 'Hola, quiero renovar mi membresía 💪',
  'every_n_days', 1, 'active', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'plan_expiry'
);
--> statement-breakpoint

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'card_improvement', 'tarjeta',
  '¿Qué mejorarías de El Templo?',
  'El equipo está escuchando: contanos qué te gustaría para darte la mejor experiencia.',
  'Enviar sugerencia', 'app_section', 'proponer_mejora', NULL,
  'every_open', NULL, 'active', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'card_improvement'
);
--> statement-breakpoint

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'card_referral', 'tarjeta',
  'Vos decidís cuánto bajás tu cuota',
  'Invitá a entrenar: cada persona que traigas suma descuento a tu cuota.',
  'Compartir código', 'app_section', 'referidos', NULL,
  'every_open', NULL, 'active', 2
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'card_referral'
);
--> statement-breakpoint

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'card_upsell', 'tarjeta',
  'Llevalo al siguiente nivel',
  'Visitá nuestras sedes y entrená junto a nuestros entrenadores',
  'Más info', 'whatsapp_sales', NULL, 'Hola, me interesa entrenar de forma presencial',
  'every_open', NULL, 'active', 3
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'card_upsell'
);
--> statement-breakpoint

INSERT INTO avisos
  (`tenant_id`, `kind`, `code`, `placement`, `title`, `body`, `button_text`,
   `destination_type`, `destination_section`, `whatsapp_text`,
   `frequency_type`, `frequency_days`, `status`, `sort_order`)
SELECT t.id, 'system', 'card_program', 'tarjeta',
  'Entrená con un plan\ndiseñado para vos',
  'Creamos programas enfocados en tus objetivos, con seguimiento personalizado',
  'Mi Plan', 'whatsapp_sales', NULL, 'Hola! Quiero saber más sobre mi plan personalizado 💪',
  'every_open', NULL, 'active', 4
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM avisos a WHERE a.tenant_id = t.id AND a.code = 'card_program'
);
