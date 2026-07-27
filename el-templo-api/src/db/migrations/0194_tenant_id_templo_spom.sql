-- Fase 167 (COL-01) -- tanda C3 del doc 06 §1: tenant_id en las 22 tablas del MOTOR SPOM.
--
-- Grupo: reglas y catálogos de la metodología (routes, spom_rules, intensity_rules,
-- contraction_rules, weekly_rotator, formats, format_compatibility, spom_config, day_modes),
-- árbol de ejercicios (exercises, exercise_dimension_proposals, exercise_milestone_proposals,
-- exercise_progressions, exercise_adjustments) y sesiones (sessions, session_blocks,
-- session_prescriptions, session_traces, session_edit_logs, completed_sessions, saved_blocks,
-- evaluation_requests).
--
-- Son las 22 tablas TEMPLO-MODULO del doc 05 §2.1-2.3. LA DENORMALIZACIÓN ES UNIVERSAL: reciben
-- la columna igual que las tablas core, aunque su scoping real lo gobierne el mecanismo de
-- módulos de la fase 176 y no un filtro por tenant en cada query. Sin la columna, el sentinel
-- de pool de la fase 170 no podría tratarlas como gym-owned y el módulo Templo quedaría fuera
-- del modelo de tenancy -- que es exactamente el agujero que v6.0 viene a cerrar.
--
-- La mayoría de este grupo es [SIN-ANCLA]: catálogos de metodología sin ninguna FK a `users` ni
-- a `branches`, o sea que no hay de dónde derivar el tenant. El backfill es DIRECTO a 1, no
-- derivado, y con un solo tenant vivo eso es correcto por construcción. El script de
-- verificación del plan 167-06 las lista aparte como caso legítimo, no como faltante.
--
-- La FK apunta a `tenants`, creada en la tanda A (migración 0190) con El Templo sembrado como
-- id=1 -- por eso el backfill de este archivo escribe literalmente 1. Las dos anclas (`users`,
-- `branches`) ya recibieron la columna en la 0191 y NO se vuelven a tocar acá.
--
-- Ciclo por tabla (4 statements): ADD COLUMN nullable CON DEFAULT -> backfill -> MODIFY
-- NOT NULL -> FK nombrada. Nunca se pasa por un estado en que un binario viejo (que no manda
-- tenant_id) no pueda insertar.
--
-- POR QUÉ LA COLUMNA NACE CON DEFAULT 1 (mismo fix WR-01 que la 0192 y la 0193): un
-- `ADD COLUMN ... NULL` SIN default deja una ventana de carrera durante el rolling deploy,
-- porque el pipeline corre las migraciones con el binario viejo todavía sirviendo tráfico. Un
-- INSERT concurrente entre el backfill y el MODIFY escribiría tenant_id NULL y haría fallar el
-- MODIFY en strict mode. En este grupo el escritor concurrente concreto es el GENERADOR DE
-- SESIONES (T-167-21), que inserta en sessions, session_blocks y session_prescriptions fuera de
-- un request y sin coordinación con el deploy, más los check-in de socios escribiendo
-- completed_sessions y exercise_adjustments. Con el DEFAULT desde el ADD COLUMN, esos inserts
-- resuelven a 1 desde el instante cero y la ventana desaparece.
--
-- El DEFAULT 1 se REPITE en el MODIFY a propósito: MySQL lo pierde si no se declara en el
-- MODIFY COLUMN (verificado en producción en la fase 166).
--
-- Además del rolling deploy, el DEFAULT es requisito de la suite: `test/setup.ts` inserta filas
-- con INSERT IGNORE sin tenant_id, y sin default esas filas no entrarían (INSERT IGNORE degrada
-- el error a warning) provocando una cascada de fallos crípticos. El DEFAULT se re-evalúa
-- cuando exista un tenant 2, fuera de v6.0.
--
-- POR QUÉ EL UPDATE NORMALMENTE AFECTA 0 FILAS, y está bien: con INSTANT ADD COLUMN, MySQL 8 no
-- reescribe las filas preexistentes y devuelve el valor por default al leerlas, así que ya nacen
-- en 1. El UPDATE queda igual como red para motores o rutas que no tomen el camino instant, y
-- guardado por IS NULL para que un replay manual sea un no-op.
--
-- ADD COLUMN va SIN cláusula de posicionamiento: agregar la columna al final de la tabla es la
-- forma garantizada INSTANT en MySQL 8. El orden físico no importa -- Drizzle nombra siempre las
-- columnas y nunca hace SELECT estrella.
--
-- spom_config CONSERVA SU CHECK DE FILA ÚNICA (mina M1, doc 05 §6). El CHECK obliga a que la
-- tabla tenga a lo sumo una fila para TODO el sistema, o sea que `current_week` es global y no
-- por gimnasio. Agregar una columna NO lo toca y este archivo NO lo modifica ni lo elimina. Con
-- un solo tenant corriendo SPOM el invariante sigue siendo cierto. El día que un tenant distinto
-- de 1 use el motor, ese CHECK migra a un unique por tenant_id -- decisión de otra fase.
--
-- UNIQUES GLOBALES QUE ESTE ARCHIVO NO TOCA (deuda consciente, doc 06 §1-D): sessions.day_id
-- (mina M5, viaja denormalizado como varchar a completed_sessions.day_id y
-- exercise_adjustments.day_id), formats.name, day_modes.day_of_week, routes.code y los uniques
-- de catálogo del árbol. Convertirlos en uniques compuestas (tenant_id, ...) es trabajo de la
-- fase 168 (CON-02).
--
-- FK LÓGICA SIN CONSTRAINT (mina M9): session_prescriptions.exercise_id apunta a exercises.id
-- sin FK real, así que la DB no puede garantizar que ambas filas compartan tenant. Esa arista la
-- verifica `src/db/scripts/verify-tenant-backfill.ts` con un join manual en el plan 167-06.
--
-- SIN índice explícito sobre tenant_id: InnoDB crea automáticamente el índice de la FK con el
-- nombre del constraint (fk_<tabla>_tenant). La normalización de índices y de las uniques
-- compuestas es trabajo de la fase 168 (CON-02).
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su journal
-- desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0190, 0191, 0192, 0193).
--
-- Idempotencia: la fila de _migrations previene el replay por el runner, los UPDATE están
-- guardados por el estado PREVIO (tenant_id IS NULL) y los ADD COLUMN duplicados caen en la
-- heurística de "Duplicate column name" del runner. CUIDADO igual: en un archivo de 88
-- statements esa heurística silencia TODOS los errores posteriores al primer duplicado, así que
-- un re-run tras una falla parcial se debe verificar contra information_schema, no contra
-- _migrations.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que ninguna
-- línea de comentario de este archivo puede contener ese caracter.

-- completed_sessions
ALTER TABLE completed_sessions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE completed_sessions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE completed_sessions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE completed_sessions ADD CONSTRAINT fk_completed_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- contraction_rules
ALTER TABLE contraction_rules ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE contraction_rules SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE contraction_rules MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE contraction_rules ADD CONSTRAINT fk_contraction_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- day_modes
ALTER TABLE day_modes ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE day_modes SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE day_modes MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE day_modes ADD CONSTRAINT fk_day_modes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- evaluation_requests
ALTER TABLE evaluation_requests ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE evaluation_requests SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE evaluation_requests MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE evaluation_requests ADD CONSTRAINT fk_evaluation_requests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- exercise_adjustments
ALTER TABLE exercise_adjustments ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE exercise_adjustments SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE exercise_adjustments MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE exercise_adjustments ADD CONSTRAINT fk_exercise_adjustments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- exercise_dimension_proposals
ALTER TABLE exercise_dimension_proposals ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE exercise_dimension_proposals SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE exercise_dimension_proposals MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE exercise_dimension_proposals ADD CONSTRAINT fk_exercise_dimension_proposals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- exercise_milestone_proposals
ALTER TABLE exercise_milestone_proposals ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE exercise_milestone_proposals SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE exercise_milestone_proposals MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE exercise_milestone_proposals ADD CONSTRAINT fk_exercise_milestone_proposals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- exercise_progressions
ALTER TABLE exercise_progressions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE exercise_progressions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE exercise_progressions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE exercise_progressions ADD CONSTRAINT fk_exercise_progressions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- exercises
ALTER TABLE exercises ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE exercises SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE exercises MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE exercises ADD CONSTRAINT fk_exercises_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- format_compatibility
ALTER TABLE format_compatibility ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE format_compatibility SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE format_compatibility MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE format_compatibility ADD CONSTRAINT fk_format_compatibility_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- formats
ALTER TABLE formats ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE formats SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE formats MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE formats ADD CONSTRAINT fk_formats_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- intensity_rules
ALTER TABLE intensity_rules ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE intensity_rules SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE intensity_rules MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE intensity_rules ADD CONSTRAINT fk_intensity_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- routes
ALTER TABLE routes ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE routes SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE routes MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE routes ADD CONSTRAINT fk_routes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- saved_blocks
ALTER TABLE saved_blocks ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE saved_blocks SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE saved_blocks MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE saved_blocks ADD CONSTRAINT fk_saved_blocks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- session_blocks
ALTER TABLE session_blocks ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE session_blocks SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE session_blocks MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE session_blocks ADD CONSTRAINT fk_session_blocks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- session_edit_logs
ALTER TABLE session_edit_logs ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE session_edit_logs SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE session_edit_logs MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE session_edit_logs ADD CONSTRAINT fk_session_edit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- session_prescriptions
ALTER TABLE session_prescriptions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE session_prescriptions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE session_prescriptions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE session_prescriptions ADD CONSTRAINT fk_session_prescriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- session_traces
ALTER TABLE session_traces ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE session_traces SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE session_traces MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE session_traces ADD CONSTRAINT fk_session_traces_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- sessions
ALTER TABLE sessions ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE sessions SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE sessions MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- spom_config
ALTER TABLE spom_config ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE spom_config SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE spom_config MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE spom_config ADD CONSTRAINT fk_spom_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- spom_rules
ALTER TABLE spom_rules ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE spom_rules SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE spom_rules MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE spom_rules ADD CONSTRAINT fk_spom_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- weekly_rotator
ALTER TABLE weekly_rotator ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE weekly_rotator SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE weekly_rotator MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE weekly_rotator ADD CONSTRAINT fk_weekly_rotator_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
