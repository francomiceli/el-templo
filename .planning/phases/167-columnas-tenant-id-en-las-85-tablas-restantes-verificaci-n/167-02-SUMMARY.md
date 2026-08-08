---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 02
subsystem: database
tags:
  [drizzle, mysql, multi-tenancy, migrations, saas, rolling-deploy, core-ops]

# Dependency graph
requires:
  - "167-01 (worktree et-167-columnas, numeracion 0192-0195 reservada, helper tenantIdColumn(), clasificacion GYM_OWNED_TABLES)"
  - "166-01/166-02 (tabla tenants con El Templo id=1 + anclas users/branches, migraciones 0190/0191 en local, staging y prod)"
provides:
  - "tenant_id NOT NULL DEFAULT 1 + FK a tenants en las 27 tablas del core operativo (socios/staff/acceso, scheduling, suscripciones, finanzas), en schema Drizzle y en la DB local"
  - "Migracion 0192_tenant_id_core_ops.sql: 108 statements, patron de 4 pasos por tabla con el DEFAULT declarado desde el ADD COLUMN (fix WR-01)"
  - "Precedente verificado del ciclo corregido: aplicado, idempotente en doble corrida, y con la suite de integracion provisionando la DB de test con el mismo parser"
affects:
  - "167-03 a 167-05 (las 58 tablas restantes de la tanda C: mismo patron SQL, mismos numeros 0193-0195)"
  - "167-06 (verificacion de las 87 tablas: 29 de las 87 ya cumplen — 27 de acá + las 2 anclas)"
  - "168 (CON-02: indices y uniques compuestas sobre estas mismas 27)"
  - "172 (finance) y 173 (members): sus tablas ya tienen la columna que van a scopear"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ADD COLUMN tenant_id INT NULL DEFAULT 1 (no NULL a secas): cierra la ventana de carrera del rolling deploy desde el instante cero — reemplaza el ciclo de la 0191 como patron canonico de la tanda C"
    - "Sin clausula AFTER/FIRST y sin ADD INDEX explicito: INSTANT ADD COLUMN garantizado + el indice de la FK que InnoDB crea solo"
    - "Constraint nombrada fk_<tabla>_tenant sin abreviar (el mas largo del grupo: 39 chars de 64)"
    - "Verificar una migracion grande contra INFORMATION_SCHEMA, NUNCA contra _migrations (la heuristica alreadyApplied del runner puede escribir la fila con tablas sin columna)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0192_tenant_id_core_ops.sql
  modified:
    - el-templo-api/src/db/schema/activities.ts
    - el-templo-api/src/db/schema/attendance.ts
    - el-templo-api/src/db/schema/audit-log.ts
    - el-templo-api/src/db/schema/balances.ts
    - el-templo-api/src/db/schema/bookings.ts
    - el-templo-api/src/db/schema/cash-registers.ts
    - el-templo-api/src/db/schema/class-coach-assignments.ts
    - el-templo-api/src/db/schema/coach-ratings.ts
    - el-templo-api/src/db/schema/cost-centers.ts
    - el-templo-api/src/db/schema/debt-management.ts
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/db/schema/holidays.ts
    - el-templo-api/src/db/schema/member-logins.ts
    - el-templo-api/src/db/schema/member-notes.ts
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/src/db/schema/promo-plans.ts
    - el-templo-api/src/db/schema/refresh-tokens.ts
    - el-templo-api/src/db/schema/schedule-exceptions.ts
    - el-templo-api/src/db/schema/schedules.ts
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/db/schema/subscription-schedule-changes.ts
    - el-templo-api/src/db/schema/subscription-schedules.ts
    - el-templo-api/src/db/schema/subscriptions.ts
    - el-templo-api/src/db/schema/transaction-links.ts
    - el-templo-api/src/db/schema/user-branches.ts
    - el-templo-api/src/db/schema/user-sepa-details.ts
    - el-templo-api/src/db/schema/user-status-history.ts
    - el-templo-api/src/modules/finance/balance-service.ts

key-decisions:
  - "El ciclo de la tanda C declara el DEFAULT desde el ADD COLUMN (4 statements, no 5): difiere a proposito de la 0191 y aplica el fix WR-01 del review de la fase 166"
  - "Sin idx_<tabla>_tenant_id explicito en estas 27: el indice de la FK alcanza y los indices son la fase 168 — evita meter el tercer argumento de mysqlTable en 4 archivos que hoy no lo tienen"
  - "El grep de aceptacion `tenantIdColumn()` sobre src/db/schema/ da 29, no 27: el propio tenant-column.ts aporta 2 (la declaracion + el ejemplo del JSDoc). El conteo verificable es con --exclude=tenant-column.ts (ver Deviations)"
  - "balance-service.getRowsForTransaction suma tenantId a la proyeccion en vez de aflojar el tipo BalanceRow: 1 linea, cero cambios de firma, y el campo extra en la respuesta es aditivo"

patterns-established:
  - "Gate estatico del `;` en comentarios ANTES de correr el runner, no despues (en un archivo de 108 statements un split malformado es carisimo de diagnosticar)"
  - "Cerrar una migracion masiva con 4 evidencias independientes: INFORMATION_SCHEMA.COLUMNS, REFERENTIAL_CONSTRAINTS, conteo de filas backfilleadas por tabla, e insert empirico sin la columna nueva"
  - "Correr un test de integracion real despues de una migracion grande: provisionWorkerDB usa el MISMO splitSqlStatements que produccion, asi que un archivo mal parseado se ve ahi antes que en CI"

# COL-01 sigue Pending: este plan cubre 27 de las 85 tablas de la tanda C.
# Lo completan 167-03 a 167-05 (58 restantes) y lo verifica 167-06.
requirements-completed: []
requirements-progressed: [COL-01]

# Metrics
duration: ~15min
completed: 2026-07-27
---

# Phase 167 Plan 02: tenant_id en el core operativo (tanda C1) Summary

**Las 27 tablas del core operativo (socios/staff/acceso, scheduling, suscripciones y finanzas) tienen `tenant_id INT NOT NULL DEFAULT 1` con FK nombrada a `tenants` y el 100% de las filas en 1, via una migracion de 108 statements que corrige el ciclo de la 0191: la columna nace con el DEFAULT declarado, de modo que la ventana de carrera del rolling deploy (WR-01) se cierra desde el instante cero sobre justo las tablas de mayor trafico de escritura del sistema.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files:** 1 creado (la migracion), 28 modificados (27 schemas + 1 fix Rule 3)
- **Commits:** 1 de codigo (worktree) + 1 de planning (checkout principal)

## Task 1 — los 27 schemas Drizzle

Edicion identica en los 27 archivos, exactamente 3 lineas por archivo (`git diff --stat` = **27 files changed, 81 insertions(+)** antes del fix del Task 2):

```ts
import { tenantIdColumn } from "./tenant-column";
// ...
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
```

Los 27 archivos usan comillas dobles, asi que no hubo que mezclar estilos. 23 declaran la tabla con el tercer argumento de `mysqlTable` (indentacion 4) y 4 con el objeto de columnas al tope (`activities`, `user_sepa_details`, `subscription_plans`, `promo_plans`, indentacion 2). Ninguna tabla recibio indice, relacion a `tenants`, ni reordenamiento de columnas.

## Task 2 — migracion 0192

`el-templo-api/src/db/migrations/0192_tenant_id_core_ops.sql`, hand-written, **108 statements** = 27 tablas x 4 pasos, en orden alfabetico de tabla:

```sql
ALTER TABLE <t> ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE <t> MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE <t> ADD CONSTRAINT fk_<t>_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
```

El header explica los cinco "por que" que exigia el plan (fase/requisito, hand-written por el drift de `sessions.goal_plan_type`, DEFAULT desde el ADD COLUMN por WR-01, UPDATE de 0 filas por INSTANT ADD COLUMN, e idempotencia) **sin un solo `;` en ninguna linea de comentario** — el runner splitea por `;` antes de stripear comentarios.

### Aplicacion local

`pnpm db:migrate` -> `Applying: 0192_tenant_id_core_ops.sql (108 statements)` / `Applied successfully`, **sin una sola linea `Skipped`**: los 108 statements ejecutaron limpios de verdad, no por la heuristica `alreadyApplied`. No hizo falta el procedimiento de recuperacion de falla parcial.

## Verificacion

| Check                                                                              | Esperado         | Resultado                                                         |
| ---------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `npx tsc --noEmit`                                                                 | limpio           | limpio (tras el fix Rule 3)                                       |
| `pnpm run build` (emision de `.d.ts` con `declaration: true`)                      | limpio           | limpio — el helper no dispara TS2742/TS4023 con 27 consumidores   |
| `tenantIdColumn()` en los 27 archivos (`--exclude=tenant-column.ts`)               | 27               | **27**                                                            |
| Archivos con `import ... from "./tenant-column"` bajo `src/db/schema/`             | 27               | **27**                                                            |
| `git diff --name-only` bajo `src/db/schema/`                                       | 27 rutas         | 27, ninguna otra                                                  |
| Lineas agregadas por schema                                                        | <= 4             | 3 exactas (81/27)                                                 |
| `grep -nE ':\s*any\b'` en los archivos tocados                                     | vacio            | vacio                                                             |
| `index("idx_..._tenant_id")` en estas 27                                           | ninguno          | ninguno (los indices son la 168)                                  |
| Lineas del `.sql` con `--` y `;` a la vez                                          | 0                | **0**                                                             |
| `ADD COLUMN tenant_id INT NULL DEFAULT 1` (sin comentarios)                        | 27               | **27**                                                            |
| `MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1`                                   | 27               | **27**                                                            |
| `UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL`                             | 27               | **27**                                                            |
| `REFERENCES tenants(id)`                                                           | 27               | **27**                                                            |
| `AFTER ` (case-insensitive, sin comentarios)                                       | 0                | **0**                                                             |
| Constraint mas largo                                                               | <= 64 chars      | 39 (`fk_subscription_schedule_changes_tenant`)                    |
| Constraints que NO siguen `fk_<tabla>_tenant`                                      | 0                | **0** (query sobre `INFORMATION_SCHEMA`)                          |
| `INFORMATION_SCHEMA.COLUMNS`: `tenant_id` NOT NULL / DEFAULT '1' / `int` en las 27 | 27               | **27**                                                            |
| FKs a `tenants` de las 27 tablas de este plan                                      | 27               | **27**                                                            |
| FKs a `tenants` en toda la base                                                    | 30               | **30** (27 + `users` + `branches` + `tenant_settings`)            |
| Filas con `tenant_id <> 1 OR IS NULL` (suma de las 27)                             | 0                | **0** sobre 709 filas                                             |
| Insert en `activities` SIN `tenant_id` (codigo viejo)                              | queda en 1       | `tenant_id = 1`, fila de prueba borrada (`activities` vuelve a 3) |
| Segunda corrida de `pnpm db:migrate`                                               | sin cambios      | `No new migrations to apply`                                      |
| `SELECT COUNT(*) FROM _migrations WHERE name='0192_...'`                           | 1                | **1**                                                             |
| `npx vitest run test/shared/tenant-scope.test.ts`                                  | verde            | **8/8** en 71 s                                                   |
| DB de test provisionada por el worker (`eltemplo_test_1`)                          | 29 cols / 30 FKs | **29 / 30** (27 + las 2 anclas)                                   |
| `npx prettier --check` sobre los 28 `.ts`                                          | limpio           | "All matched files use Prettier code style!"                      |
| Deleciones en el commit                                                            | ninguna          | ninguna                                                           |
| `git status --porcelain` del worktree post-commit                                  | vacio            | vacio                                                             |

**El backstop del parser se ejercito de verdad:** `test/setup.ts` (`provisionWorkerDB`) aplica las migraciones con el MISMO `splitSqlStatements()` que produccion. Los 8 tests de `tenant-scope` pasaron y la base `eltemplo_test_1` quedo con las 29 columnas y las 30 FKs, o sea que el archivo de 108 statements parsea bien tambien por ese camino. Nada hubo que tocar en `test/setup.ts` ni en `test/helpers.ts`.

## Deviations from Plan

### Ajustes automaticos

**1. [Rule 3 - Blocking] `BalanceRow` es `$inferSelect` y una proyeccion explicita se quedo sin `tenantId`**

- **Encontrado en:** Task 1, al correr `npx tsc --noEmit`. Unico error de todo el repo.
- **Problema:** `src/modules/finance/types.ts:35` define `BalanceRow = typeof balances.$inferSelect`, asi que al sumar `tenantId` a `balances` el tipo pasa a exigirlo. `BalanceService.getRowsForTransaction` (`balance-service.ts:313`) devuelve `Promise<BalanceRow[]>` pero arma la fila con un `.select({...})` explicito de 8 columnas (necesario porque la query tiene dos INNER JOIN) — TS2322, `Property 'tenantId' is missing`. El plan preveia que ningun **insert** se rompiera (correcto, el `.default(1)` los deja opcionales) pero esta es la cara **select** del mismo cambio.
- **Fix:** una linea, `tenantId: schema.balances.tenantId,` en la proyeccion, con comentario que explica por que la proyeccion tiene que listar todas las columnas. Se descarto tipar el retorno como `Omit<BalanceRow, "tenantId">[]` porque el ripple llegaba hasta `affectedBalances: BalanceRow[]` (`types.ts:308`) y la superficie publica del modulo (`finance/index.ts`). El campo extra en la respuesta `affectedBalances` es **aditivo** (valor siempre 1 en v6.0) y no rompe al admin.
- **Consecuencia sobre un criterio del plan:** el commit lista **29** archivos, no los 28 declarados (`git diff --name-only` incluye una ruta fuera de `src/db/schema/`). Se prioriza `tsc --noEmit` limpio, que es requisito de `<verification>` y de los must_haves ("todos siguen compilando").
- **Archivos:** `el-templo-api/src/modules/finance/balance-service.ts`.
- **Commit:** `994b7d2f`.

**2. [Rule 1 - Correctitud del criterio] El grep de `tenantIdColumn()` da 29, no 27**

- **Encontrado en:** Task 1, verificacion de aceptacion.
- **Problema:** el criterio dice que `grep -rho 'tenantIdColumn()' src/db/schema/ | wc -l` debe devolver `27`. Devuelve `29` y **no puede devolver 27**: el helper que creo el plan 167-01 vive dentro de `src/db/schema/` y aporta 2 ocurrencias propias (linea 46, el ejemplo de uso del JSDoc, y linea 56, `export function tenantIdColumn() {`). No es un error de este plan.
- **Fix:** el conteo verificable equivalente es `grep -rho 'tenantIdColumn()' src/db/schema/ --exclude=tenant-column.ts | wc -l` -> **27**, confirmado. Ambos numeros quedan documentados para que el verifier no lea un falso rojo. **Los planes 167-03 a 167-05 tienen la misma trampa** (esperar `N + 2`).
- **Archivos:** ninguno.

### Observaciones operativas (no son desviaciones)

- **Task 1 no tiene commit propio a proposito.** Hard Rule 3 del skill `el-templo-db-migrations` exige que el `.sql` viaje en el mismo commit que el cambio de schema, y el plan lo pide explicitamente ("commitear el `.sql` JUNTO a los 27 `.ts`"). Un unico commit `994b7d2f` cubre los dos tasks.
- **Los hooks de pre-commit siguen sin correr en el worktree** (`core.hooksPath` -> `.husky/_`, inexistente ahi). Se corrio `npx prettier --check` a mano sobre los 28 `.ts` antes de commitear, como dejo anotado el 167-01. El `.sql` no necesita prettier: el `lint-staged` de la raiz solo matchea `**/*.{ts,vue,js,json,md}`.
- **El checkout principal no se toco para codigo.** Sigue en `fix/referral-preview-y-refresh-ficha` con el WIP ajeno intacto — todos los edits de codigo fueron bajo `/home/franco/projects/et-167-columnas`.
- **Volumen local vs prod:** las 27 tablas suman 709 filas en la DB de desarrollo (la mas grande es `member_logins` con 285). El ALTER tardo segundos. **Eso NO dice nada del costo en prod** — la medicion de volumen real antes del rollout es el plan 167-07 (mitigacion T-167-10).

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. La unica nota: `getRowsForTransaction` ahora devuelve `tenantId` al cliente del endpoint POST /transactions (`affectedBalances`). Es exposicion **de salida** de un valor constante (1) y no debilita nada — la regla dura del milestone es que el tenant nunca entra por el borde (payload/JWT/query), y eso sigue intacto: `tenant_id` no aparece en ningun schema de request.

## Next Phase Readiness

Los planes 167-03 a 167-05 arrancan sin bloqueos:

- Worktree `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`), HEAD `994b7d2f`, working tree limpio.
- Numeros libres: **0193 / 0194 / 0195**. `_migrations` local ya tiene `0192_tenant_id_core_ops.sql`.
- **Copiar el patron SQL de 0192, no el de 0191.** El de la 0191 (ADD COLUMN sin DEFAULT + `ADD INDEX` explicito) esta superado por WR-01.
- **Trampa nueva para los 3 planes siguientes:** cualquier `.select({...})` explicito cuyo retorno este tipado como `typeof <tabla>.$inferSelect` va a romper `tsc` al agregarle la columna a esa tabla. Buscar antes con `grep -rn "\$inferSelect" src/modules/` para saber que tablas tienen ese acoplamiento — en este grupo fue una sola (`balances`).
- **Trampa del grep de aceptacion:** `grep -rho 'tenantIdColumn()' src/db/schema/` incluye 2 ocurrencias del propio helper. Usar `--exclude=tenant-column.ts`.
- Recordatorios operativos vigentes: `npx prettier --check` a mano (no hay hook), nunca `git add -A`, y verificar la migracion contra `INFORMATION_SCHEMA` en vez de contra `_migrations`.
- Faltan **58** tablas de las 85 de la tanda C. Hoy hay 29 de las 87 gym-owned con la columna (27 de acá + `users` + `branches`).

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0192_tenant_id_core_ops.sql` existe en el worktree y esta en el commit.
- Los 28 `.ts` declarados (27 schemas + `balance-service.ts`) existen y estan en el commit.
- El commit `994b7d2f` esta en el historial de `feat/167-tenant-columns` con 29 archivos, 308 inserciones y 0 deleciones.
- Este SUMMARY existe en el checkout principal.
