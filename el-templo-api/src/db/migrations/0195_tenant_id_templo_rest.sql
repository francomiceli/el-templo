-- Fase 167 (COL-01) -- tanda C4 del doc 06 §1: tenant_id en las 20 tablas restantes de los
-- MÓDULOS TEMPLO.
--
-- Grupo: gamificación AURA (aura_balances, aura_transactions, aura_config), wellness y
-- onboarding (check_in_responses, onboarding_analytics), programs (programs,
-- program_content_blocks, program_enrollments, plan_programs), marketing y marca (blog_posts,
-- blog_tags, blog_post_tags, academy_inquiries, app_waitlist, franchise_applications,
-- gladius_products, gladius_inquiries) y TV de sucursal (tv_devices, tv_pairings,
-- tv_class_state).
--
-- CON ESTE ARCHIVO SE COMPLETAN LAS 85 TABLAS DE LA TANDA C: 27 en la 0192 (core operativo),
-- 16 en la 0193 (comunicación y crecimiento), 22 en la 0194 (motor SPOM) y estas 20. Sumadas
-- las 2 anclas de la fase 166 (`users`, `branches`, migración 0191, que NO se vuelven a tocar
-- acá), quedan las 87 tablas gym-owned de `src/db/tenant-tables.ts` con la columna. Las 2
-- exclusiones de diseño siguen SIN la columna a propósito: `system_settings` (mina M2, se
-- deprecia gradualmente hacia `tenant_settings` y no la recibe en todo v6.0) y
-- `labs_inquiries` (leads del propio SaaS, global por definición, doc 05 §4).
--
-- La FK apunta a `tenants`, creada en la tanda A (migración 0190) con El Templo sembrado como
-- id=1 -- por eso el backfill de este archivo escribe literalmente 1.
--
-- Ciclo por tabla (4 statements): ADD COLUMN nullable CON DEFAULT -> backfill -> MODIFY
-- NOT NULL -> FK nombrada. Nunca se pasa por un estado en que un binario viejo (que no manda
-- tenant_id) no pueda insertar.
--
-- POR QUÉ LA COLUMNA NACE CON DEFAULT 1 (fix WR-01 del review de la fase 166): `ADD COLUMN
-- ... NULL` SIN default deja una ventana de carrera durante el rolling deploy. El pipeline
-- corre las migraciones con el binario viejo todavía sirviendo tráfico, así que un INSERT
-- concurrente entre el backfill y el MODIFY escribiría tenant_id NULL y haría fallar el MODIFY
-- en strict mode (o la FK en non-strict, con NULL coercido a 0). En ESTE grupo los escritores
-- concurrentes concretos son públicos y anónimos: los formularios del sitio institucional
-- (academy_inquiries, app_waitlist, franchise_applications, gladius_inquiries) insertan sin
-- ninguna noción de tenant, y el TV de sucursal hace poll y pairing sin sesión de staff. Con
-- el DEFAULT declarado desde el ADD COLUMN, esos inserts resuelven a 1 desde el instante cero
-- y la ventana desaparece (T-167-23).
--
-- El DEFAULT 1 se REPITE en el MODIFY a propósito: MySQL lo pierde si no se declara en el
-- MODIFY COLUMN (verificado en producción en la fase 166).
--
-- Además del rolling deploy, el DEFAULT es requisito de la suite: `test/setup.ts` inserta
-- filas con INSERT IGNORE sin tenant_id, y sin default esas filas no entrarían (INSERT IGNORE
-- degrada el error a warning) provocando una cascada de fallos crípticos. El DEFAULT se
-- re-evalúa cuando exista un tenant 2, fuera de v6.0.
--
-- POR QUÉ EL UPDATE NORMALMENTE AFECTA 0 FILAS, y está bien: con INSTANT ADD COLUMN, MySQL 8
-- no reescribe las filas preexistentes y devuelve el valor por default al leerlas, así que ya
-- nacen en 1. El UPDATE queda igual como red para motores o rutas que no tomen el camino
-- instant, y guardado por IS NULL para que un replay manual sea un no-op.
--
-- tv_pairings ES PRE-TENANT POR DISEÑO (mina M7) y recibe la columna igual. La fila nace
-- cuando un televisor sin dueño muestra su código en pantalla: `branch_id` es NULL hasta que
-- el staff lo reclama, y los dos códigos del pairing quedan GLOBALES a propósito y para
-- siempre (lista M8 aprobada), porque el claim tiene que resolverlos SIN scope. La columna
-- entra con DEFAULT 1 y el claim la va a estampar con el scope del staff en la fase 169
-- (CON-04) -- con un solo tenant el riesgo residual de hoy es nulo (T-167-22).
--
-- blog_post_tags apunta a blog_posts y blog_tags con FKs LÓGICAS, sin constraint real (mina
-- M9): la DB no puede garantizar que las tres filas compartan tenant. Esa arista la verifica
-- `src/db/scripts/verify-tenant-backfill.ts` con joins manuales en el plan 167-06.
--
-- plan_programs es un acople core->Templo (une subscription_plans con programs) y recibe la
-- columna como cualquier otra tabla del grupo.
--
-- ADD COLUMN va SIN cláusula de posicionamiento: agregar la columna al final de la tabla es la
-- forma garantizada INSTANT en MySQL 8. El orden físico no importa -- Drizzle nombra siempre
-- las columnas y nunca hace SELECT estrella.
--
-- SIN índice explícito sobre tenant_id: InnoDB crea automáticamente el índice de la FK con el
-- nombre del constraint (fk_<tabla>_tenant). La normalización de índices y de las uniques
-- compuestas es trabajo de la fase 168 (CON-02). Este archivo NO toca ninguna unique global
-- existente: ni las de las URLs de blog_posts / blog_tags / gladius_products, ni
-- aura_config.source_type, ni el hash de token de tv_devices, ni los dos códigos de
-- tv_pairings.
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su journal
-- desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0190, 0191, 0192-0194).
--
-- Idempotencia: la fila de _migrations previene el replay por el runner, los UPDATE están
-- guardados por el estado PREVIO (tenant_id IS NULL) y los ADD COLUMN duplicados caen en la
-- heurística de "Duplicate column name" del runner. CUIDADO igual: en un archivo de 80
-- statements esa heurística silencia TODOS los errores posteriores al primer duplicado, así
-- que un re-run tras una falla parcial se debe verificar contra information_schema, no contra
-- _migrations.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que ninguna
-- línea de comentario de este archivo puede contener ese caracter.

-- academy_inquiries
ALTER TABLE academy_inquiries ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE academy_inquiries SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE academy_inquiries MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE academy_inquiries ADD CONSTRAINT fk_academy_inquiries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- app_waitlist
ALTER TABLE app_waitlist ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE app_waitlist SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE app_waitlist MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE app_waitlist ADD CONSTRAINT fk_app_waitlist_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- aura_balances
ALTER TABLE aura_balances ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE aura_balances SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE aura_balances MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE aura_balances ADD CONSTRAINT fk_aura_balances_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- aura_config
ALTER TABLE aura_config ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE aura_config SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE aura_config MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE aura_config ADD CONSTRAINT fk_aura_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- aura_transactions
ALTER TABLE aura_transactions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE aura_transactions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE aura_transactions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE aura_transactions ADD CONSTRAINT fk_aura_transactions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- blog_post_tags
ALTER TABLE blog_post_tags ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE blog_post_tags SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE blog_post_tags MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE blog_post_tags ADD CONSTRAINT fk_blog_post_tags_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- blog_posts
ALTER TABLE blog_posts ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE blog_posts SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE blog_posts MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE blog_posts ADD CONSTRAINT fk_blog_posts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- blog_tags
ALTER TABLE blog_tags ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE blog_tags SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE blog_tags MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE blog_tags ADD CONSTRAINT fk_blog_tags_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- check_in_responses
ALTER TABLE check_in_responses ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE check_in_responses SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE check_in_responses MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE check_in_responses ADD CONSTRAINT fk_check_in_responses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- franchise_applications
ALTER TABLE franchise_applications ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE franchise_applications SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE franchise_applications MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE franchise_applications ADD CONSTRAINT fk_franchise_applications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- gladius_inquiries
ALTER TABLE gladius_inquiries ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE gladius_inquiries SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE gladius_inquiries MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE gladius_inquiries ADD CONSTRAINT fk_gladius_inquiries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- gladius_products
ALTER TABLE gladius_products ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE gladius_products SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE gladius_products MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE gladius_products ADD CONSTRAINT fk_gladius_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- onboarding_analytics
ALTER TABLE onboarding_analytics ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE onboarding_analytics SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE onboarding_analytics MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE onboarding_analytics ADD CONSTRAINT fk_onboarding_analytics_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- plan_programs
ALTER TABLE plan_programs ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE plan_programs SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE plan_programs MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE plan_programs ADD CONSTRAINT fk_plan_programs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- program_content_blocks
ALTER TABLE program_content_blocks ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE program_content_blocks SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE program_content_blocks MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE program_content_blocks ADD CONSTRAINT fk_program_content_blocks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- program_enrollments
ALTER TABLE program_enrollments ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE program_enrollments SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE program_enrollments MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE program_enrollments ADD CONSTRAINT fk_program_enrollments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- programs
ALTER TABLE programs ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE programs SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE programs MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE programs ADD CONSTRAINT fk_programs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- tv_class_state
ALTER TABLE tv_class_state ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE tv_class_state SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE tv_class_state MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE tv_class_state ADD CONSTRAINT fk_tv_class_state_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- tv_devices
ALTER TABLE tv_devices ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE tv_devices SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE tv_devices MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE tv_devices ADD CONSTRAINT fk_tv_devices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- tv_pairings
ALTER TABLE tv_pairings ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE tv_pairings SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE tv_pairings MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE tv_pairings ADD CONSTRAINT fk_tv_pairings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
