-- Fase 168 (CON-01, CON-02) -- tanda D del doc 06 §1-D: las uniques globales pasan a ser
-- uniques compuestas por tenant, y se reponen los índices secundarios que la conversión saca.
--
-- QUÉ ARREGLA
-- -----------
-- Las fases 166 y 167 dejaron `tenant_id` en las 87 tablas gym-owned, pero la unicidad siguió
-- siendo GLOBAL. Con un segundo gimnasio en la misma base, once contratos colisionarían entre
-- tenants distintos: el email, el DNI y el código de referido del socio, el código de sede, el
-- nombre del centro de costo por país, el código promo, la baja de campañas por email, la clave
-- de template de notificación, el modo del día de la semana, el feriado por país y fecha, y el
-- nombre del formato. Ninguno de esos valores es global por naturaleza -- son de cada gimnasio.
-- Esta migración los vuelve `UNIQUE (tenant_id, ...)`, que es exactamente el contrato CON-01.
--
-- LO QUE NO TOCA -- la lista M8 queda GLOBAL a propósito
-- ------------------------------------------------------
-- Las uniques de la lista M8 (doc 06 §8) NO se convierten y este archivo no las menciona en
-- ningún ALTER. Son de dos clases:
--   a) ids de plataforma externa, que ya son únicos del lado de la plataforma y se resuelven
--      SIN scope -- gympass_id de users, wellhub_gym_id de branches y los cuatro ids de las
--      tablas wellhub_*.
--   b) secretos random cuyo lookup ocurre ANTES de conocer el tenant -- token_hash de
--      refresh_tokens, token de device_tokens, y los códigos de tv_devices y tv_pairings.
-- Convertirlas rompería el lookup pre-scope o duplicaría un id que la plataforma externa
-- garantiza único. Quedan globales para siempre, con el motivo escrito en el schema (D-13).
--
-- POR QUÉ NO HAY NI UN SOLO INDEX(tenant_id) ACÁ (D-07)
-- -----------------------------------------------------
-- CON-02 ya está cubierto por lo que hicieron las migraciones anteriores. Cada FK nombrada
-- `fk_<tabla>_tenant` de las migraciones 0192 a 0195 dejó su índice auto-creado por InnoDB sobre
-- `tenant_id`, y las dos anclas tienen además el índice explícito de la 0191
-- (idx_users_tenant_id, idx_branches_tenant_id). Crear otro sería un índice redundante por tabla
-- en 87 tablas. Encima, las once uniques compuestas de abajo arrancan TODAS con `tenant_id`, así
-- que también sirven de índice-prefijo para el filtro por tenant. Cero DDL nuevo para CON-02.
--
-- POR QUÉ VUELVEN CUATRO ÍNDICES NO-UNIQUE (D-05)
-- ------------------------------------------------
-- Al anteponer `tenant_id`, la unique deja de servir para buscar SOLO por el valor. Cuatro
-- lookups reales del código consultan por el valor pelado y quedarían sin índice:
--   users(email) -- login, src/modules/auth/routes.ts
--   users(dni) -- registro, src/modules/auth/routes.ts
--   users(referral_code) -- canje, src/modules/referrals/service.ts, resolveReferralCode
--   campaign_unsubscribes(email) -- filtro NOT EXISTS del envío de campañas
-- Los catálogos chicos (branches, cost_centers, promo_plans, notification_templates, day_modes,
-- holidays, formats) NO reciben índice secundario (D-06): son de decenas de filas y un scan les
-- sale más barato que mantener el índice. formats ya tenía formats_name_idx de antes y se deja
-- como está.
--
-- ATOMICIDAD DEL CAMBIO (D-08)
-- -----------------------------
-- El DROP del índice viejo y el ADD del nuevo van en el MISMO statement `ALTER TABLE`, uno por
-- tabla. Así la tabla se reescribe una sola vez y NUNCA existe una ventana sin contrato de
-- unicidad. Si alguna tabla hubiera necesitado statements separados por un errno 150 -- el índice
-- sosteniendo una FK -- el orden habría sido ADD primero y DROP después, para que la ventana
-- intermedia tenga DOS contratos y jamás cero. Verificado contra la base local antes de tocar
-- staging: ninguna FK depende de los once índices que se dropean, así que las nueve tablas
-- quedaron atómicas.
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su journal
-- desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0190, 0191, 0192-0195).
--
-- IDEMPOTENCIA Y CÓMO SE VERIFICA
-- --------------------------------
-- La fila de _migrations previene el replay por el runner. CUIDADO con la heurística
-- alreadyApplied de run-migrations.ts: en cuanto un statement tira "Can't DROP" o "Duplicate key
-- name", el runner saltea TODOS los errores posteriores del archivo y lo registra igual en
-- _migrations. Peor todavía, test/setup.ts tolera literalmente "Can't DROP", así que un DROP con
-- nombre equivocado pasaría en verde. Conclusión: la verificación de esta migración va SIEMPRE
-- contra INFORMATION_SCHEMA.STATISTICS filtrando por TABLE_SCHEMA = DATABASE(), nunca contra
-- _migrations. Los once nombres viejos salen verificados por grep sobre las migraciones que los
-- crearon y por introspección de la base local.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que ninguna línea
-- de comentario de este archivo puede contener ese caracter.

-- users -- email, DNI y código de referido pasan a ser únicos POR TENANT. Los tres índices
-- secundarios de D-05 entran en el mismo ALTER para tocar la tabla una sola vez.
ALTER TABLE users
  DROP INDEX users_email_unique,
  ADD UNIQUE INDEX uq_users_tenant_email (tenant_id, email),
  ADD INDEX idx_users_email (email),
  DROP INDEX users_dni_unique,
  ADD UNIQUE INDEX uq_users_tenant_dni (tenant_id, dni),
  ADD INDEX idx_users_dni (dni),
  DROP INDEX users_referral_code_unique,
  ADD UNIQUE INDEX uq_users_tenant_referral_code (tenant_id, referral_code),
  ADD INDEX idx_users_referral_code (referral_code);

-- branches -- el código de sede es único dentro del gimnasio, no del mundo.
ALTER TABLE branches
  DROP INDEX branches_code_unique,
  ADD UNIQUE INDEX uq_branches_tenant_code (tenant_id, code);

-- cost_centers -- el nombre del centro de costo es único por tenant y país (el país sigue en el
-- contrato, tal como lo dejó la 0165).
ALTER TABLE cost_centers
  DROP INDEX uq_cost_centers_name_country,
  ADD UNIQUE INDEX uq_cost_centers_tenant_name_country (tenant_id, name, country);

-- promo_plans -- dos gimnasios pueden tener el mismo código promo sin pisarse.
ALTER TABLE promo_plans
  DROP INDEX promo_plans_promo_code_unique,
  ADD UNIQUE INDEX uq_promo_plans_tenant_promo_code (tenant_id, promo_code);

-- campaign_unsubscribes -- mina M3 del doc 06 §8-Q5: hoy una baja en un gimnasio suprimiría los
-- envíos de todos. La unique pasa a ser por tenant y vuelve el índice sobre email para el filtro
-- NOT EXISTS del envío.
ALTER TABLE campaign_unsubscribes
  DROP INDEX uniq_campaign_unsubscribe_email,
  ADD UNIQUE INDEX uq_campaign_unsubscribes_tenant_email (tenant_id, email),
  ADD INDEX idx_campaign_unsubscribes_email (email);

-- notification_templates -- cada gimnasio tiene su propio juego de templates con las mismas claves.
ALTER TABLE notification_templates
  DROP INDEX notification_templates_template_key_unique,
  ADD UNIQUE INDEX uq_notification_templates_tenant_key (tenant_id, template_key);

-- day_modes -- un modo por día de la semana POR gimnasio.
ALTER TABLE day_modes
  DROP INDEX day_modes_day_of_week_unique,
  ADD UNIQUE INDEX uq_day_modes_tenant_day_of_week (tenant_id, day_of_week);

-- holidays -- el feriado sigue siendo uno por país y fecha, pero dentro del tenant. El índice
-- viejo se llamaba idx_ y era unique igual (0035_scheduling.sql), el nombre nuevo lo dice.
ALTER TABLE holidays
  DROP INDEX idx_holidays_country_date,
  ADD UNIQUE INDEX uq_holidays_tenant_country_date (tenant_id, country, date);

-- formats -- el nombre del formato es único dentro del gimnasio. Sin índice secundario: formats
-- ya tiene formats_name_idx sobre name desde la 0001 y D-06 no agrega nada a los catálogos.
ALTER TABLE formats
  DROP INDEX formats_name_unique,
  ADD UNIQUE INDEX uq_formats_tenant_name (tenant_id, name);
