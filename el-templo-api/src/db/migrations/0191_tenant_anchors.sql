-- Fase 166 (FUND-02) -- tanda B del doc 06 §1: tenant_id en las dos anclas del modelo.
--
-- `branches` y `users` son las anclas de tenancy: el resto de las ~85 tablas gym-owned
-- cuelga de ellas (directa o transitivamente) en la fase 167, y `scope.tenantId` de la
-- capa 1 se resuelve leyendo `users.tenant_id`. La FK apunta a `tenants`, creada en la
-- tanda A (migración 0190) con El Templo sembrado como id=1 -- por eso el backfill de
-- este archivo escribe literalmente 1.
--
-- Ciclo incremental por tabla (D-04, compatibilidad con código viejo durante el rolling
-- deploy): ADD COLUMN nullable -> backfill -> MODIFY NOT NULL -> índice -> FK. Nunca se
-- pasa por un estado en que un binario viejo (que no manda tenant_id) no pueda insertar.
--
-- La columna es NOT NULL DEFAULT 1, no NOT NULL a secas (PATTERNS §0.3, camino A). Razón
-- dura, no estética: `test/setup.ts` inserta branches y users con INSERT IGNORE sin
-- tenant_id (sin DEFAULT esas filas NO se insertan -- INSERT IGNORE degrada el error a
-- warning -- y se convierte en una cascada de fallos crípticos en toda la suite), y el
-- código viejo del rolling deploy tampoco manda la columna. Precedente de NOT NULL con
-- DEFAULT en estas mismas anclas: branches.country y branches.timezone. El DEFAULT se
-- re-evalúa cuando exista un tenant 2, fuera de v6.0.
--
-- El DEFAULT 1 se REPITE en el MODIFY a propósito: MySQL lo pierde si no se declara en
-- el MODIFY COLUMN.
--
-- ADD COLUMN va SIN cláusula de posicionamiento: agregar la columna al final de la tabla
-- es la forma garantizada INSTANT en MySQL 8 (posicionarla detrás de otra columna recién
-- es instant desde 8.0.29). El orden físico no importa -- Drizzle nombra siempre las
-- columnas y nunca hace SELECT estrella. El gate del plan grepea el token de esa cláusula
-- y debe dar 0, así que este comentario no lo escribe.
--
-- Hand-written: db:generate está roto por el drift de sessions.goal_plan_type y su
-- journal desincronizado mis-numeraría el archivo (precedente 0176, 0181, 0162, 0190).
--
-- Idempotencia: el _migrations row de este archivo previene el replay por el runner, y
-- los UPDATE están guardados por el estado PREVIO (tenant_id IS NULL), así que un replay
-- manual fuera del runner es un no-op de 0 filas.
--
-- run-migrations.ts splitea por punto y coma ANTES de stripear comentarios, así que este
-- archivo NO puede tener ese caracter dentro de una línea de comentario.

-- Paso 1 — branches: columna nullable primero, para que el backfill del paso 2 pueda
-- poblar todas las filas antes de apretar a NOT NULL.
ALTER TABLE branches ADD COLUMN tenant_id INT NULL;

-- Paso 2 — branches: backfill al tenant 1 (El Templo). Guardado por IS NULL.
UPDATE branches SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Paso 3 — branches: apretar a NOT NULL conservando el DEFAULT 1.
ALTER TABLE branches MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;

-- Paso 4 — branches: índice (toda query gym-owned filtra por tenant_id).
ALTER TABLE branches ADD INDEX idx_branches_tenant_id (tenant_id);

-- Paso 5 — branches: integridad referencial contra tenants.
ALTER TABLE branches ADD CONSTRAINT fk_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Paso 6 — users: mismo ciclo, columna nullable primero.
ALTER TABLE users ADD COLUMN tenant_id INT NULL;

-- Paso 7 — users: backfill al tenant 1 (El Templo). Guardado por IS NULL.
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Paso 8 — users: apretar a NOT NULL conservando el DEFAULT 1.
ALTER TABLE users MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;

-- Paso 9 — users: índice (toda query gym-owned filtra por tenant_id).
ALTER TABLE users ADD INDEX idx_users_tenant_id (tenant_id);

-- Paso 10 — users: integridad referencial contra tenants.
ALTER TABLE users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
