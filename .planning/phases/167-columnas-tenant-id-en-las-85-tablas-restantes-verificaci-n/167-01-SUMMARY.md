---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 01
subsystem: database
tags: [drizzle, mysql, multi-tenancy, migrations, git-worktree, saas, dry]

# Dependency graph
requires:
  - "166-01/166-02 (tabla tenants con El Templo id=1 + anclas users/branches con tenant_id INT NOT NULL DEFAULT 1, migraciones 0190/0191 aplicadas en local, staging y prod)"
provides:
  - "Worktree aislado /home/franco/projects/et-167-columnas (rama feat/167-tenant-columns, base origin/master e6cab5f6) donde corre TODA la fase 167"
  - "Bloque de numeracion de la tanda C reservado: 0192, 0193, 0194 y 0195 (maximo real confirmado 0191 en las 4 fuentes)"
  - "tenantIdColumn(): definicion UNICA de la columna tenant_id, reutilizable por las 85 tablas de la tanda C"
  - "GYM_OWNED_TABLES (87 nombres fisicos) / TENANT_EXEMPT_TABLES (4) / isGymOwnedTable() — clasificacion canonica"
  - "Gate fail-closed test/db/tenant-tables.test.ts: cruza la clasificacion contra las 91 tablas reales del schema Drizzle"
affects:
  - "167-02 a 167-05 (las 4 migraciones de la tanda C: nombres de archivo 0192-0195 y la linea `tenantId: tenantIdColumn(),` en cada schema)"
  - "167-06 (verificacion de las 87 tablas)"
  - "168 (CON-02: indices y uniques compuestas sobre la misma lista)"
  - "169 (helpers de escritura tenantWhere/tenantValues)"
  - "170 (ISO: sentinel de pool mysql2 + lint en CI)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper de columna Drizzle reutilizable como FUNCION (no objeto esparcido): devuelve un builder nuevo por llamada, evita compartir un builder mutable entre tablas"
    - "Clasificacion de tablas como metadata fuera de schema/ (src/db/tenant-tables.ts): no es una tabla, es modelo del modelo"
    - "Gate fail-closed por introspeccion de objetos Drizzle (is(value, MySqlTable) + getTableName) en vez de lista hardcodeada duplicada en el test"
    - "getTableName se importa de 'drizzle-orm', NO de 'drizzle-orm/mysql-core' (ahi no existe)"

key-files:
  created:
    - el-templo-api/src/db/schema/tenant-column.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
  modified: []

key-decisions:
  - "Migraciones reservadas: 0192, 0193, 0194, 0195. Maximo real 0191_tenant_anchors.sql confirmado en las 4 fuentes exigidas por T-167-01"
  - "NO se activo el fallback tenantIdColumns: el build con declaration:true emite limpio, asi que los planes 167-02 a 167-05 insertan `tenantId: tenantIdColumn(),`"
  - "El helper NO entra al barrel src/db/schema/index.ts (no es un modulo de tabla): cada schema lo importa directo desde ./tenant-column"
  - "Los 87 nombres del plan coinciden byte a byte con la enumeracion real del schema Drizzle (91 tablas, diff vacio) — la lista no se corrigio"
  - "Todo el codigo vive en el worktree et-167-columnas; el checkout principal quedo intacto (git status identico antes y despues, md5 b9fd594b / 99 entradas)"

patterns-established:
  - "Verificacion de numeracion de migraciones en 4 fuentes antes de escribir un numero (arbol del worktree, _migrations local, origin/staging, TODAS las refs locales y remotas incluida et-164-tv)"
  - "Prueba negativa del gate ejercitada de verdad: se agrega un nombre inventado, se confirma el rojo, se revierte y se confirma el verde"
  - "Los comentarios no repiten el literal de codigo que documentan (mantiene verificable el criterio 'una sola definicion' por grep)"

# COL-01 NO se marca completo todavia: este plan solo publica el contrato, las
# 85 tablas reciben la columna en 167-02..167-05 (ver Deviations, punto 3).
requirements-completed: []
requirements-progressed: [COL-01]

# Metrics
duration: 9min
completed: 2026-07-27
---

# Phase 167 Plan 01: Base de trabajo + contrato compartido de la tanda C Summary

**Worktree limpio sobre `origin/master` post-166 con los numeros 0192-0195 reservados contra el maximo real, mas el contrato que consumen los 5 planes siguientes: `tenantIdColumn()` como unica definicion de la columna `tenant_id` y la clasificacion canonica 87 gym-owned / 4 exentas protegida por un gate fail-closed contra las 91 tablas reales del schema Drizzle.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 3
- **Files:** 3 creados, 0 modificados
- **Commits:** 1 de codigo (worktree) + 1 de planning (checkout principal)

## Base de trabajo (Task 1)

| Item                 | Valor                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Worktree             | `/home/franco/projects/et-167-columnas`                                                                                                         |
| Rama                 | `feat/167-tenant-columns`                                                                                                                       |
| Base                 | `origin/master` = `e6cab5f6` (post-166)                                                                                                         |
| Divergencia al crear | `git rev-list --left-right --count origin/master...HEAD` -> `0	0`                                                                                |
| Entorno              | `.env` + `.env.development` copiados del checkout principal, `pnpm install --frozen-lockfile` (cero paquetes nuevos, sin `pnpm approve-builds`) |

Worktrees ajenos intactos: `/home/franco/projects/et-166-tenancy` y `/home/franco/projects/et-164-tv` siguen listados en `git worktree list`. El checkout principal `/home/franco/projects/el-templo` (rama `fix/referral-preview-y-refresh-ficha`, cambios de otra sesion) quedo byte a byte igual: `git status --porcelain` con md5 `b9fd594bb9215491ef67fba3f60e330d` y 99 entradas antes y despues del plan.

### Numeracion reservada: 0192, 0193, 0194, 0195

Maximo real observado en las **4 fuentes** exigidas por la mitigacion T-167-01 (todas coinciden en `0191_tenant_anchors.sql`):

| #   | Fuente                                                                                    | Valor observado                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Arbol de migraciones del worktree recien creado                                           | `0190_tenants_core.sql`, `0191_tenant_anchors.sql`                                                                                                                                                                                                                                                       |
| b   | `SELECT name FROM _migrations ORDER BY name DESC` en la DB local `eltemplo`               | `0191_tenant_anchors.sql`, `0190_tenants_core.sql`, `0189_tv_screen.sql`, `0188_bookings_trial_date_index.sql`                                                                                                                                                                                           |
| c   | `git ls-tree origin/staging el-templo-api/src/db/migrations/`                             | `0191_tenant_anchors.sql`                                                                                                                                                                                                                                                                                |
| d   | Worktree `et-164-tv` + barrido de TODAS las refs (`for-each-ref refs/heads refs/remotes`) | `et-164-tv` = `0189_tv_screen.sql`; maximo global = `0191_tenant_anchors.sql` (en `origin/master`, `origin/staging`, `origin/feat/166-tenancy-fundacion` y las ramas locales de la 166/167). Ninguna rama viva supera 0191 — `feature/wellhub-integration` tiene 0186, las ramas de la 164 llegan a 0189 |

**Nombres reservados para los planes 167-02 a 167-05** (sin ajuste respecto del plan):
`0192_tenant_id_core_ops.sql`, `0193_tenant_id_core_comms.sql`, `0194_tenant_id_templo_spom.sql`, `0195_tenant_id_templo_rest.sql`.

### Precondicion de la fase verificada en la DB local (`eltemplo`)

- `SELECT id, slug, status FROM tenants` -> exactamente una fila: `1 / el-templo / active`. No hizo falta correr `pnpm db:migrate`: 0190 y 0191 ya estaban aplicadas.
- `users.tenant_id` y `branches.tenant_id` existen, ambas `int NOT NULL DEFAULT 1`.

## Contrato publicado (Tasks 2 y 3)

### `src/db/schema/tenant-column.ts` — `tenantIdColumn()`

Funcion sin argumentos que devuelve un builder NUEVO por llamada, equivalente exacto a lo que las anclas de la fase 166 declaran a mano: `int("tenant_id").notNull().default(1).references(() => tenants.id)`. Importa solo `int` de `drizzle-orm/mysql-core` y `tenants` de `./tenants` (sin triangulo con `users`/`branches`). No esta en el barrel.

**El fallback `tenantIdColumns` NO se activo.** `npx tsc --noEmit` y `pnpm run build` (que es el que ejerce la emision de `.d.ts` con `declaration: true`) salieron limpios: no hubo TS2742 ni TS4023. El tipo emitido es nombrable —

```
export declare function tenantIdColumn(): import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm/mysql-core").MySqlIntBuilderInitial<"tenant_id">>>;
```

**Consecuencia para los planes 167-02 a 167-05:** la linea a insertar en cada tabla es

```ts
    // Fase 167 (COL-01): columna de tenancy.
    tenantId: tenantIdColumn(),
```

con `import { tenantIdColumn } from "./tenant-column";` en la cabecera del schema.

### `src/db/tenant-tables.ts` — clasificacion canonica

- `GYM_OWNED_TABLES`: 87 nombres fisicos `as const`, orden alfabetico (85 de la tanda C + las 2 anclas ya migradas).
- `TENANT_EXEMPT_TABLES`: 4 `as const` — `tenants` y `tenant_settings` (raiz/plataforma), `system_settings` (mina M2, deprecacion gradual hacia `tenant_settings`, no recibe columna en todo v6.0), `labs_inquiries` (leads del propio SaaS, GLOBAL, doc 05 §4). El motivo de cada una esta escrito en el archivo.
- `isGymOwnedTable(name: string): boolean` sobre un `Set` (O(1)). Acepta `string` a proposito: los consumidores de 168-170 clasifican nombres que salen de INFORMATION_SCHEMA, `getTableName()` o el AST del linter.
- Tipos auxiliares exportados de yapa: `GymOwnedTable` y `TenantExemptTable`.

**La lista del plan resulto exacta.** Se enumeraron las tablas reales del schema Drizzle y se hizo `diff` contra los 87 + 4 del plan: **identico, 91 = 91, cero correcciones**.

### `test/db/tenant-tables.test.ts` — gate fail-closed

5 tests, todos verdes (`npx vitest run test/db/tenant-tables.test.ts` -> `5 passed`, ~64 s por el provisioning de la DB del worker; el test en si no toca la DB):

1. Toda tabla del schema esta clasificada — el mensaje de error imprime los nombres sin clasificar.
2. Ninguna tabla esta en las dos listas.
3. Todo nombre clasificado existe en el schema (atrapa typos y renames).
4. Conteos exactos 87 / 4 / 91, sin duplicados dentro de cada lista.
5. `isGymOwnedTable` sobre las anclas (`users`, `branches` -> `true`) y las exentas (-> `false`).

**Prueba negativa ejercitada de verdad:** se agrego temporalmente `"tabla_inventada_para_probar_el_gate"` a `GYM_OWNED_TABLES`; la tercera asercion se puso en ROJO con el mensaje esperado (`Nombres en src/db/tenant-tables.ts que NO existen en el schema Drizzle ... tabla_inventada_para_probar_el_gate`) y la cuarta tambien (`expected 88 to be 87`). Se revirtio desde backup, se re-verifico `grep -c 'tabla_inventada' = 0`, `tsc --noEmit` limpio y los 5 tests de nuevo en verde antes de commitear.

## Deviations from Plan

### Ajustes automaticos

**1. [Rule 3 - Blocking] `getTableName` no se exporta desde `drizzle-orm/mysql-core`**

- **Encontrado en:** Task 3 (enumeracion de tablas del schema).
- **Problema:** el plan indicaba `getTableName` "de `drizzle-orm` + `drizzle-orm/mysql-core`". Importarlo del subpath `mysql-core` compila pero revienta en runtime con `TypeError: getTableName is not a function`.
- **Fix:** `import { is, getTableName } from "drizzle-orm";` + `import { MySqlTable } from "drizzle-orm/mysql-core";`. Queda anotado como patron para las fases 168-170, que van a enumerar tablas igual.
- **Archivos:** `el-templo-api/test/db/tenant-tables.test.ts`.

**2. [Rule 3 - Blocking] Los comentarios repetian el literal de codigo y rompian los criterios de grep**

- **Encontrado en:** Task 2 (verificacion de aceptacion).
- **Problema:** el bloque de comentarios y el JSDoc citaban textualmente `int("tenant_id")`, `.notNull()`, `.default(1)` y `references(() => tenants.id)`, asi que los `grep -c` del criterio devolvian 2/2/3/2 en vez de 1/1/1/1 — el criterio "una sola definicion" dejaba de ser verificable por grep.
- **Fix:** se reescribieron esas dos frases del comentario en prosa ("declarar el DEFAULT en el builder de Drizzle...", "entero NOT NULL con DEFAULT 1 y FK a `tenants.id`"), conservando intacto el contenido que el plan exige explicar. Todos los greps quedaron en 1.
- **Archivos:** `el-templo-api/src/db/schema/tenant-column.ts`.

**3. [Rule 1 - Correctitud del registro] COL-01 NO se marca completo en este plan**

- **Encontrado en:** cierre del plan (`requirements.mark-complete COL-01`).
- **Problema:** los 7 planes de la fase declaran `requirements: [COL-01]`, asi que el handler marco COL-01 como `Complete` en `REQUIREMENTS.md` despues del plan 01. El texto del requisito dice literalmente que "las 85 tablas gym-owned restantes tienen `tenant_id NOT NULL` + FK, backfill `=1`" — hoy eso es **falso**: no se escribio ni una sola migracion todavia. Un verifier leyendo el registro se llevaria una foto mentirosa.
- **Fix:** se revirtio `REQUIREMENTS.md` a `Pending`. No se pierde nada: los planes 167-02 a 167-07 tambien declaran COL-01 y lo van a marcar cuando la tanda C exista de verdad.
- **Archivos:** ninguno (revert de `.planning/REQUIREMENTS.md`).

### Observacion operativa (no es desviacion)

Los hooks de pre-commit **no corren en este worktree**: `core.hooksPath` apunta a `.husky/_`, que esta gitignoreado y no existe en un worktree recien creado (tampoco hay `node_modules` ni `pnpm-lock.yaml` en la raiz). No se copio el lockfile del checkout principal porque no hizo falta — en su lugar se corrio manualmente `npx prettier --check` sobre los 3 archivos (todos ya con el estilo del repo). `el-templo-api` no tiene script `lint` ni `eslint.config.*`, asi que no hay lint propio del backend que correr. **Los planes 167-02 a 167-05 tienen que repetir el `prettier --check` a mano**, porque el hook no los va a formatear.

## Verificacion

| Check                                                                                           | Resultado                                                  |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `git rev-parse --abbrev-ref HEAD` en el worktree                                                | `feat/167-tenant-columns`                                  |
| `git rev-list --left-right --count origin/master...HEAD` (al crear)                             | `0	0`                                                       |
| `npx tsc --noEmit`                                                                              | limpio                                                     |
| `pnpm run build` (emision de `.d.ts`)                                                           | limpio                                                     |
| `npx vitest run test/db/tenant-tables.test.ts`                                                  | 5/5 verdes                                                 |
| Prueba negativa del gate                                                                        | rojo con el nombre inventado, verde tras revertir          |
| `grep -c` de `int("tenant_id")` / `.notNull()` / `.default(1)` / `references(() => tenants.id)` | 1 / 1 / 1 / 1                                              |
| `grep -c 'tenant-column' src/db/schema/index.ts`                                                | 0 (helper fuera del barrel)                                |
| `grep -nE ':\s*any\b'` en los 3 archivos                                                        | sin resultados                                             |
| `isGymOwnedTable`: `users` / `branches` / `system_settings` / `labs_inquiries`                  | `true` / `true` / `false` / `false`                        |
| `GYM_OWNED_TABLES.length` / `TENANT_EXEMPT_TABLES.length`                                       | 87 / 4                                                     |
| `npx prettier --check` sobre los 3 archivos                                                     | "All matched files use Prettier code style!"               |
| Deleciones en el commit                                                                         | ninguna                                                    |
| `git status --porcelain` del worktree post-commit                                               | vacio                                                      |
| `git status --porcelain` del checkout principal                                                 | identico al estado previo (md5 `b9fd594b...`, 99 entradas) |

## Commits

| Commit     | Repo/Rama                                     | Contenido                                                                                                              |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `5bfa5f66` | `et-167-columnas` @ `feat/167-tenant-columns` | `feat(167): helper tenantIdColumn + clasificacion canonica de tablas gym-owned (COL-01)` — 3 archivos, 336 inserciones |

## Next Phase Readiness

Los planes 167-02 a 167-05 pueden arrancar ya:

- Worktree y entorno listos en `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`).
- Numeros de archivo: **0192 / 0193 / 0194 / 0195** con los nombres del contrato del plan.
- Linea a insertar en cada schema: `tenantId: tenantIdColumn(),` (el fallback NO se activo).
- La lista de que tabla toca cada tanda sale de `GYM_OWNED_TABLES` menos las 2 anclas (`users`, `branches`), que ya la tienen desde 0191 y **no deben recibir un segundo ALTER**.
- Recordatorio operativo: correr `npx prettier --check` a mano antes de cada commit (no hay hook en el worktree) y nunca `git add -A`.

## Self-Check: PASSED

Los 3 archivos de codigo declarados existen en el worktree, el SUMMARY existe en el checkout principal y el commit `5bfa5f66` esta en el historial de `feat/167-tenant-columns`.
