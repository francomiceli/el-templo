-- Fase 167 (COL-01) -- tanda C1 del doc 06 §1: tenant_id en las 27 tablas del CORE OPERATIVO.
--
-- Grupo: socios/staff/acceso (user_branches, member_profiles, member_notes, member_logins,
-- user_status_history, refresh_tokens, user_sepa_details, audit_log), scheduling (activities,
-- schedules, schedule_exceptions, bookings, attendance, holidays, class_coach_assignments,
-- coach_ratings), suscripciones (subscription_plans, subscriptions, subscription_schedules,
-- subscription_schedule_changes, promo_plans) y finanzas (financial_transactions,
-- transaction_links, balances, debt_management, cash_registers, cost_centers).
--
-- Son las tablas de los módulos que las fases 172 (finance) y 173 (members) adoptan primero,
-- y el grupo con más tráfico de escritura del sistema. La FK apunta a `tenants`, creada en la
-- tanda A (migración 0190) con El Templo sembrado como id=1 -- por eso el backfill de este
-- archivo escribe literalmente 1. Las dos anclas (`users`, `branches`) YA recibieron la
-- columna en la 0191 y NO se vuelven a tocar acá.
--
-- Ciclo por tabla (4 statements): ADD COLUMN nullable CON DEFAULT -> backfill -> MODIFY
-- NOT NULL -> FK nombrada. Nunca se pasa por un estado en que un binario viejo (que no manda
-- tenant_id) no pueda insertar.
--
-- POR QUÉ LA COLUMNA NACE CON DEFAULT 1 (y acá difiere de la 0191): el review de la fase 166
-- (WR-01) encontró que `ADD COLUMN ... NULL` SIN default deja una ventana de carrera durante
-- el rolling deploy. El pipeline corre las migraciones con el binario viejo todavía sirviendo
-- tráfico, así que un INSERT concurrente entre el backfill y el MODIFY escribe tenant_id NULL
-- y hace fallar el MODIFY en strict mode (o la FK en non-strict, con NULL coercido a 0). En
-- las anclas el riesgo era casi teórico. Sobre bookings, attendance y financial_transactions
-- deja de serlo. Declarando el DEFAULT desde el ADD COLUMN, los inserts concurrentes resuelven
-- a 1 desde el instante cero y la ventana desaparece.
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
-- ADD COLUMN va SIN cláusula de posicionamiento: agregar la columna al final de la tabla es la
-- forma garantizada INSTANT en MySQL 8. El orden físico no importa -- Drizzle nombra siempre
-- las columnas y nunca hace SELECT estrella.
--
-- SIN índice explícito sobre tenant_id: InnoDB crea automáticamente el índice de la FK con el
-- nombre del constraint (fk_<tabla>_tenant). La normalización de índices y de las uniques
-- compuestas es trabajo de la fase 168 (CON-02).
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su journal
-- desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0190, 0191).
--
-- Idempotencia: la fila de _migrations previene el replay por el runner, los UPDATE están
-- guardados por el estado PREVIO (tenant_id IS NULL) y los ADD COLUMN duplicados caen en la
-- heurística de "Duplicate column name" del runner. CUIDADO igual: en un archivo de 108
-- statements esa heurística silencia TODOS los errores posteriores al primer duplicado, así
-- que un re-run tras una falla parcial se debe verificar contra information_schema, no contra
-- _migrations.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que ninguna
-- línea de comentario de este archivo puede contener ese caracter.

-- activities
ALTER TABLE activities ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE activities SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE activities MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE activities ADD CONSTRAINT fk_activities_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- attendance
ALTER TABLE attendance ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE attendance SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE attendance MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE attendance ADD CONSTRAINT fk_attendance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- audit_log
ALTER TABLE audit_log ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE audit_log SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE audit_log MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_log_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- balances
ALTER TABLE balances ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE balances SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE balances MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE balances ADD CONSTRAINT fk_balances_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- bookings
ALTER TABLE bookings ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE bookings SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE bookings MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- cash_registers
ALTER TABLE cash_registers ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE cash_registers SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE cash_registers MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE cash_registers ADD CONSTRAINT fk_cash_registers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- class_coach_assignments
ALTER TABLE class_coach_assignments ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE class_coach_assignments SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE class_coach_assignments MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE class_coach_assignments ADD CONSTRAINT fk_class_coach_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- coach_ratings
ALTER TABLE coach_ratings ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE coach_ratings SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE coach_ratings MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE coach_ratings ADD CONSTRAINT fk_coach_ratings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- cost_centers
ALTER TABLE cost_centers ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE cost_centers SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE cost_centers MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE cost_centers ADD CONSTRAINT fk_cost_centers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- debt_management
ALTER TABLE debt_management ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE debt_management SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE debt_management MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE debt_management ADD CONSTRAINT fk_debt_management_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- financial_transactions
ALTER TABLE financial_transactions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE financial_transactions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE financial_transactions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE financial_transactions ADD CONSTRAINT fk_financial_transactions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- holidays
ALTER TABLE holidays ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE holidays SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE holidays MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE holidays ADD CONSTRAINT fk_holidays_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- member_logins
ALTER TABLE member_logins ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE member_logins SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE member_logins MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE member_logins ADD CONSTRAINT fk_member_logins_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- member_notes
ALTER TABLE member_notes ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE member_notes SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE member_notes MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE member_notes ADD CONSTRAINT fk_member_notes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- member_profiles
ALTER TABLE member_profiles ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE member_profiles SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE member_profiles MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE member_profiles ADD CONSTRAINT fk_member_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- promo_plans
ALTER TABLE promo_plans ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE promo_plans SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE promo_plans MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE promo_plans ADD CONSTRAINT fk_promo_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- refresh_tokens
ALTER TABLE refresh_tokens ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE refresh_tokens SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE refresh_tokens MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- schedule_exceptions
ALTER TABLE schedule_exceptions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE schedule_exceptions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE schedule_exceptions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE schedule_exceptions ADD CONSTRAINT fk_schedule_exceptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- schedules
ALTER TABLE schedules ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE schedules SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE schedules MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE schedules ADD CONSTRAINT fk_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- subscription_plans
ALTER TABLE subscription_plans ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE subscription_plans SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE subscription_plans MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE subscription_plans ADD CONSTRAINT fk_subscription_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- subscription_schedule_changes
ALTER TABLE subscription_schedule_changes ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE subscription_schedule_changes SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE subscription_schedule_changes MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE subscription_schedule_changes ADD CONSTRAINT fk_subscription_schedule_changes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- subscription_schedules
ALTER TABLE subscription_schedules ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE subscription_schedules SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE subscription_schedules MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE subscription_schedules ADD CONSTRAINT fk_subscription_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- subscriptions
ALTER TABLE subscriptions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE subscriptions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE subscriptions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- transaction_links
ALTER TABLE transaction_links ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE transaction_links SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE transaction_links MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE transaction_links ADD CONSTRAINT fk_transaction_links_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- user_branches
ALTER TABLE user_branches ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE user_branches SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE user_branches MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE user_branches ADD CONSTRAINT fk_user_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- user_sepa_details
ALTER TABLE user_sepa_details ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE user_sepa_details SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE user_sepa_details MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE user_sepa_details ADD CONSTRAINT fk_user_sepa_details_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- user_status_history
ALTER TABLE user_status_history ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE user_status_history SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE user_status_history MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE user_status_history ADD CONSTRAINT fk_user_status_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
