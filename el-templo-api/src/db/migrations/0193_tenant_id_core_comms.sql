-- Fase 167 (COL-01) -- tanda C2 del doc 06 §1: tenant_id en las 16 tablas de COMUNICACIÓN,
-- CRECIMIENTO e INTEGRACIONES.
--
-- Grupo: comunicación (campaigns, campaign_sends, campaign_events, campaign_unsubscribes,
-- device_tokens, notification_templates, notification_preferences, pending_notifications),
-- crecimiento y feedback (referrals, referral_credits, referral_cta_clicks,
-- improvement_proposals) e integración Wellhub (wellhub_classes, wellhub_slots,
-- wellhub_bookings, wellhub_events).
--
-- Es el grupo de los bordes: acá viven las dos superficies que escriben SIN un request de
-- socio adelante (el webhook de Wellhub y los crons de notificaciones y de campañas). La FK
-- apunta a `tenants`, creada en la tanda A (migración 0190) con El Templo sembrado como id=1
-- -- por eso el backfill de este archivo escribe literalmente 1. Las tablas del core
-- operativo ya recibieron la columna en la 0192 y NO se vuelven a tocar acá.
--
-- Ciclo por tabla (4 statements), idéntico al de la 0192: ADD COLUMN nullable CON DEFAULT ->
-- backfill -> MODIFY NOT NULL -> FK nombrada. Nunca se pasa por un estado en que un binario
-- viejo (que no manda tenant_id) no pueda insertar.
--
-- POR QUÉ LA COLUMNA NACE CON DEFAULT 1 (y acá difiere de la 0191): el review de la fase 166
-- (WR-01) encontró que `ADD COLUMN ... NULL` SIN default deja una ventana de carrera durante
-- el rolling deploy. El pipeline corre las migraciones con el binario viejo todavía sirviendo
-- tráfico, así que un INSERT concurrente entre el backfill y el MODIFY escribe tenant_id NULL
-- y hace fallar el MODIFY en strict mode. En este grupo el riesgo NO es teórico: el webhook
-- de Wellhub inserta en wellhub_events por cada evento entrante y no lo podemos pausar, y los
-- crons de notificaciones escriben pending_notifications sin coordinación con el deploy.
-- Declarando el DEFAULT desde el ADD COLUMN, esos inserts resuelven a 1 desde el instante
-- cero y la ventana desaparece.
--
-- El DEFAULT 1 se REPITE en el MODIFY a propósito: MySQL lo pierde si no se declara en el
-- MODIFY COLUMN (verificado en producción en la fase 166).
--
-- POR QUÉ EL UPDATE NORMALMENTE AFECTA 0 FILAS, y está bien: con INSTANT ADD COLUMN, MySQL 8
-- no reescribe las filas preexistentes y devuelve el valor por default al leerlas, así que ya
-- nacen en 1. El UPDATE queda igual como red para motores o rutas que no tomen el camino
-- instant, y guardado por IS NULL para que un replay manual sea un no-op.
--
-- ADD COLUMN va SIN cláusula de posicionamiento: agregar la columna al final de la tabla es la
-- forma garantizada INSTANT en MySQL 8. El orden físico no importa -- Drizzle nombra siempre
-- las columnas y nunca hace SELECT estrella.
--
-- SIN índice explícito sobre tenant_id: InnoDB crea automáticamente el índice de la FK con el
-- nombre del constraint (fk_<tabla>_tenant). La normalización de índices y de las uniques
-- compuestas es trabajo de la fase 168 (CON-02). Eso incluye la MINA M3: la unique global de
-- campaign_unsubscribes sobre `email` pasa a ser (tenant_id, email) recién ahí -- esta
-- migración solo aporta la columna que esa unique necesita.
--
-- MINA M6: wellhub_events es la única tabla del grupo sin ninguna FK a nuestro dominio, así
-- que su tenant no se puede derivar por join. La derivación real (payload.gym.id ->
-- branches.wellhub_gym_id -> branch.tenant_id) es CON-04, fase 169. Con un solo tenant el
-- backfill directo a 1 es correcto por construcción.
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su journal
-- desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0190, 0191, 0192).
--
-- Idempotencia: la fila de _migrations previene el replay por el runner, los UPDATE están
-- guardados por el estado PREVIO (tenant_id IS NULL) y los ADD COLUMN duplicados caen en la
-- heurística de "Duplicate column name" del runner. CUIDADO igual: en un archivo de 64
-- statements esa heurística silencia TODOS los errores posteriores al primer duplicado, así
-- que un re-run tras una falla parcial se debe verificar contra information_schema, no contra
-- _migrations.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que ninguna
-- línea de comentario de este archivo puede contener ese caracter.

-- campaign_events
ALTER TABLE campaign_events ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE campaign_events SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE campaign_events MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE campaign_events ADD CONSTRAINT fk_campaign_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- campaign_sends
ALTER TABLE campaign_sends ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE campaign_sends SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE campaign_sends MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE campaign_sends ADD CONSTRAINT fk_campaign_sends_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- campaign_unsubscribes
ALTER TABLE campaign_unsubscribes ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE campaign_unsubscribes SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE campaign_unsubscribes MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE campaign_unsubscribes ADD CONSTRAINT fk_campaign_unsubscribes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- campaigns
ALTER TABLE campaigns ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE campaigns SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE campaigns MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD CONSTRAINT fk_campaigns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- device_tokens
ALTER TABLE device_tokens ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE device_tokens SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE device_tokens MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE device_tokens ADD CONSTRAINT fk_device_tokens_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- improvement_proposals
ALTER TABLE improvement_proposals ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE improvement_proposals SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE improvement_proposals MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE improvement_proposals ADD CONSTRAINT fk_improvement_proposals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- notification_preferences
ALTER TABLE notification_preferences ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE notification_preferences SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE notification_preferences MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD CONSTRAINT fk_notification_preferences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- notification_templates
ALTER TABLE notification_templates ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE notification_templates SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE notification_templates MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE notification_templates ADD CONSTRAINT fk_notification_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- pending_notifications
ALTER TABLE pending_notifications ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE pending_notifications SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE pending_notifications MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE pending_notifications ADD CONSTRAINT fk_pending_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- referral_credits
ALTER TABLE referral_credits ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE referral_credits SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE referral_credits MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE referral_credits ADD CONSTRAINT fk_referral_credits_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- referral_cta_clicks
ALTER TABLE referral_cta_clicks ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE referral_cta_clicks SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE referral_cta_clicks MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE referral_cta_clicks ADD CONSTRAINT fk_referral_cta_clicks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- referrals
ALTER TABLE referrals ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE referrals SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE referrals MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE referrals ADD CONSTRAINT fk_referrals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- wellhub_bookings
ALTER TABLE wellhub_bookings ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE wellhub_bookings SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE wellhub_bookings MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE wellhub_bookings ADD CONSTRAINT fk_wellhub_bookings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- wellhub_classes
ALTER TABLE wellhub_classes ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE wellhub_classes SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE wellhub_classes MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE wellhub_classes ADD CONSTRAINT fk_wellhub_classes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- wellhub_events
ALTER TABLE wellhub_events ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE wellhub_events SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE wellhub_events MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE wellhub_events ADD CONSTRAINT fk_wellhub_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- wellhub_slots
ALTER TABLE wellhub_slots ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE wellhub_slots SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE wellhub_slots MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE wellhub_slots ADD CONSTRAINT fk_wellhub_slots_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
