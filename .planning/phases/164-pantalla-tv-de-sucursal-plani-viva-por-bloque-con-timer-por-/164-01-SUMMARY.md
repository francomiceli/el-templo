---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 01
subsystem: database
tags: [drizzle, mysql, migrations, tv, device-code, timestamp-fsp, vitest]

# Dependency graph
requires:
  - phase: 116-refresh-tokens-auth
    provides: "Patron de secreto opaco + sha256 persistido (refresh_tokens.token_hash), replicado aca para token_hash y device_code_hash"
provides:
  - "Tabla tv_devices: televisores vinculados por sede, con revocacion por fila (is_active + revoked_at) y sin expiracion (D-03)"
  - "Tabla tv_pairings: flujo device-code RFC 8628 (user_code publico / device_code_hash secreto), sede elegida al reclamar (D-01)"
  - "Tabla tv_class_state: estado de clase UNICO por sede que espejan N televisores (D-04), con timer de precision de milisegundos"
  - "Migracion 0189_tv_screen.sql aplicada limpia en local, siguiente numero libre en master Y staging"
  - "TABLES_TO_CLEAN cubre las 3 tablas nuevas — no se filtran entre archivos de test"
  - "test/tv/tv-schema.test.ts: round-trip de ms + unicidad por sede + unicidad de token"
affects:
  [
    164-02,
    164-03,
    164-05,
    164-08,
    164-10,
    "cualquier plan que escriba queries contra tv_devices / tv_pairings / tv_class_state",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "timestamp con fsp: 3 (primer uso del repo) para sellos de timer"
    - "varchar con semantica de enum en vez de mysqlEnum, para no pisar la trampa C-07"
    - "device-code pairing (RFC 8628) con solo el sha256 del secreto persistido"

key-files:
  created:
    - el-templo-api/src/db/schema/tv.ts
    - el-templo-api/src/db/migrations/0189_tv_screen.sql
    - el-templo-api/test/tv/tv-schema.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/test/helpers.ts

key-decisions:
  - "La fase 164 se ejecuta en el worktree aislado /home/franco/projects/et-164-tv (rama feat/164-tv-sucursal, base origin/master 39568562): el checkout principal estaba 135 commits atras y con WIP sin commitear de otra sesion"
  - "0189 confirmado como siguiente numero libre en origin/master Y origin/staging (ambos en 0188) antes de escribir el archivo"
  - "block_role, level, timer_status y screen se declaran varchar y no mysqlEnum: el primer argumento de mysqlEnum es el nombre fisico de la columna y su lista de valores debe coincidir byte a byte con el SQL (trampa C-07, incidentes 0138/0139)"
  - "timer_started_at y paused_at en timestamp(3): sin milisegundos MySQL redondea y el timer arranca hasta 1s adelantado — 5% de error sobre un tabata de 20s"
  - "tv_devices no lleva columna de expiracion (D-03): la revocacion es por fila con is_active + revoked_at"
  - "Task 2 y Task 3 comparten un unico commit porque la regla dura del skill de migraciones exige el .sql en el mismo commit que el cambio de schema"

patterns-established:
  - "Precision de milisegundos en DB: timestamp(3) declarado en Drizzle con { fsp: 3 } y en el SQL como timestamp(3), verificado por un test de round-trip"
  - "Aserciones de unicidad en tests: Drizzle envuelve el error de mysql2, hay que asertar sobre err.cause (ER_DUP_ENTRY), no sobre el message externo"
  - "Invariante de cardinalidad impuesto por la DB (uniqueIndex) y no por el codigo de aplicacion"

requirements-completed: [D-02, D-03, D-04, D-05, D-07, D-08, D-17, D-19]

# Metrics
duration: ~25min
completed: 2026-07-24
---

# Phase 164 Plan 01: Fundacion de datos del TV de sucursal Summary

**Tres tablas Drizzle (tv_devices / tv_pairings / tv_class_state) con migracion hand-written 0189, timer de precision de milisegundos (timestamp(3), primer uso del repo) y estado de clase unico por sede impuesto por la DB.**

## Performance

- **Duration:** ~25 min (incluye un checkpoint bloqueante resuelto por el orquestador)
- **Started:** 2026-07-24T20:36Z aprox
- **Completed:** 2026-07-24T21:00:01Z
- **Tasks:** 3
- **Files modified:** 5 (3 creados, 2 modificados)

## Accomplishments

- **Las 3 tablas existen en la DB local** con los nombres fisicos exactos del bloque `<interfaces>` del plan. El cross-check de nombres de columna entre `tv.ts` y `0189_tv_screen.sql` da diff vacio: 27 columnas, coincidencia byte a byte.
- **`timer_started_at` conserva milisegundos.** `SHOW COLUMNS` reporta `timestamp(3)` y el test de round-trip inserta un sello con `.123` y lo relee identico. Sin esto, el timer del TV arranca hasta 1s adelantado respecto del profe.
- **El estado de clase es unico por sede a nivel DB** (`uq_tv_class_state_branch`): el invariante D-04 lo impone MySQL, no el codigo. Un segundo insert para la misma sede es rechazado con `ER_DUP_ENTRY`.
- **0189 es el numero correcto** — verificado contra `origin/master` y `origin/staging` (ambos en `0188_bookings_trial_date_index.sql`) antes de escribir el archivo, no contra el checkout local (que estaba en 0181).
- **Cero `;` en comentarios SQL.** La migracion parsea con el mismo splitter que usa la provision de la DB de tests: `pnpm db:migrate` reporta "3 statements" y el archivo de test corre verde, lo que prueba que la migracion no rompe la suite.
- **Las tablas nuevas se vacian entre archivos de test** (`TABLES_TO_CLEAN`), critico porque `tv_class_state` es UNIQUE por `branch_id`: una fila huerfana de otro archivo haria fallar el insert del siguiente.

## Task Commits

1. **Task 1: Verificar base de rama y numero de migracion libre** — sin commit (verificacion de estado de git, no toca archivos). Resuelto via checkpoint + worktree preparado por el orquestador.
2. **Task 2: Schema Drizzle tv.ts + barrel** — `20ceb74c` (feat) _[commit compartido con Task 3, ver Deviations]_
3. **Task 3: Migracion 0189 + TABLES_TO_CLEAN + test de round-trip** — `20ceb74c` (feat)

**Plan metadata:** ver commit `docs(164-01)` a continuacion.

## Files Created/Modified

- `el-templo-api/src/db/schema/tv.ts` — Definicion Drizzle de las 3 tablas + sus `relations()`. Docblock que explica por que solo se persiste el sha256 de los secretos, por que no hay columna de expiracion (D-03) y por que los sellos del timer llevan precision fraccional 3.
- `el-templo-api/src/db/migrations/0189_tv_screen.sql` — DDL hand-written de `tv_devices` -> `tv_pairings` -> `tv_class_state` (ese orden por la FK `device_id`). Header narrativo con la justificacion de numeracion y de `timestamp(3)`, sin un solo `;` adentro.
- `el-templo-api/src/db/schema/index.ts` — `export * from "./tv"` al final del barrel. Sin esto `schema.tvDevices` es `undefined` en runtime aunque tsc pase.
- `el-templo-api/test/helpers.ts` — Las 3 tablas agregadas a `TABLES_TO_CLEAN` antes del bloque "Core entity tables", en orden `tvClassState` -> `tvPairings` -> `tvDevices`.
- `el-templo-api/test/tv/tv-schema.test.ts` — 3 tests de integracion contra MySQL real.

## Decisions Made

- **varchar en vez de mysqlEnum** para `block_role`, `level`, `timer_status` y `screen`, tal como propone el RESEARCH. El primer argumento de `mysqlEnum` es el nombre fisico de la columna y su lista de valores debe coincidir byte a byte con el SQL — esa desalineacion ya rompio CI dos veces (migraciones 0138/0139) sin que `tsc` se entere. Con varchar la validacion de valores vive en la capa de aplicacion (planes 03/05).
- **Ejecucion en worktree aislado.** Ver Issues Encountered.
- **Un solo commit para Tasks 2 y 3.** Ver Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - CLAUDE.md / skill enforcement] Task 2 y Task 3 comparten un unico commit**

- **Found during:** Task 2 (al momento de commitear el schema)
- **Issue:** El protocolo de commit atomico por tarea habria dejado `tv.ts` en un commit y `0189_tv_screen.sql` en otro. La regla dura #3 del skill `el-templo-db-migrations` (y la sub-regla de la seccion 1 de `el-templo-change-control`) exige que el `.sql` viaje en el MISMO commit que el cambio de schema — es historicamente el miss mas frecuente del repo y fue la causa del incidente de la fase 78 (`/auth/me` roto en prod por una migracion sin commitear). El propio criterio de aceptacion de Task 3 lo pide explicitamente.
- **Fix:** Se difirio el commit de Task 2 y se commitearon juntos schema + barrel + migracion + helpers + test.
- **Files modified:** ninguno adicional
- **Verification:** `git show --stat 20ceb74c` lista los 5 archivos en un unico commit
- **Committed in:** `20ceb74c`

**2. [Rule 3 - Blocking] Faltaban las variables de entorno de DB en el worktree**

- **Found during:** Task 3 (antes de `pnpm db:migrate`)
- **Issue:** El worktree recien creado no tenia `.env.development` / `.env`, asi que el runner habria intentado conectar con los defaults (`root` sin password) y fallado.
- **Fix:** Se copiaron `.env.development` y `.env` desde `el-templo-api/` del checkout principal (lectura, no modificacion). `el-templo-api/.gitignore` ignora `.env*` salvo `.env.example`, asi que no son commiteables ni aparecen en `git status`.
- **Files modified:** ninguno versionado
- **Verification:** `git status --porcelain` no muestra archivos de env; `pnpm db:migrate` conecta y aplica
- **Committed in:** n/a (archivos ignorados)

**3. [Rule 1 - Bug] Las aserciones de unicidad del test daban falso rojo**

- **Found during:** Task 3 (primera corrida de vitest: 1 verde, 2 rojos)
- **Issue:** Los tests aserttaban `.rejects.toThrow(/Duplicate entry/i)`, pero Drizzle envuelve el error de mysql2: el `message` externo es solo `"Failed query: insert into tv_devices..."` y el `ER_DUP_ENTRY` real vive en `err.cause`. Peor que un falso rojo, la forma original tambien habria dado falso VERDE ante cualquier otro fallo de query.
- **Fix:** Helper `expectDuplicateEntry()` que captura el error, navega a `cause` con narrowing sobre `unknown` (sin `any`, per CLAUDE.md) y asserta sobre el `code` (`ER_DUP_ENTRY`) o el message de la causa.
- **Files modified:** `el-templo-api/test/tv/tv-schema.test.ts`
- **Verification:** `pnpm vitest run test/tv/tv-schema.test.ts` -> 3 verdes
- **Committed in:** `20ceb74c`

**4. [Rule 1 - Bug] Menciones incidentales rompian los gates de grep de Task 2**

- **Found during:** Task 2 (verificacion de acceptance criteria)
- **Issue:** Los criterios exigen `grep -c 'fsp: 3'` = 2, `grep -c 'expires_at'` = 0 y `grep -c 'mysqlEnum'` = 0 sobre `tv.ts`. Los comentarios explicativos mencionaban esas cadenas en prosa, dando 3 / 1 / 2. El gate es correcto: sirve para que un futuro lector que grepee `mysqlEnum` no crea que este archivo lo usa.
- **Fix:** Reformulados los comentarios ("precision fraccional 3", "no lleva ninguna columna de expiracion", "no un enum de MySQL") sin perder la explicacion.
- **Files modified:** `el-templo-api/src/db/schema/tv.ts`
- **Verification:** los 6 greps del criterio dan 1 / 2 / 1 / 0 / 0 y `tsc --noEmit` limpio, re-verificados DESPUES de que prettier reescribiera el archivo en el pre-commit
- **Committed in:** `20ceb74c`

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking, 1 enforcement de CLAUDE.md/skill)
**Impact on plan:** Ninguna amplia el alcance. La #1 es la unica que cambia la forma del output (2 tareas, 1 commit) y lo hace para cumplir una regla dura del repo que el propio plan pedia.

## Issues Encountered

- **[BLOQUEANTE, resuelto] El checkout principal no servia como base.** Task 1 detecto que `/home/franco/projects/el-templo` estaba 135 commits detras de `origin/master` (maxima migracion local: 0181) y ademas tenia WIP sin commitear de otra sesion (la tarea CR-CAJA, en `modules/{auth,finance,subscriptions}`, `el-templo-admin` y `el-templo-app`). El `git checkout -b ... origin/master` que pedia el plan habria fallado igual: 6 de esos 9 archivos difieren entre `HEAD` y `origin/master`. Se escalo al usuario en vez de stashear o descartar (regla de `el-templo-change-control`: el checkout principal es compartido). **Resolucion:** el orquestador creo el worktree aislado `/home/franco/projects/et-164-tv` sobre `feat/164-tv-sucursal` (base `origin/master` = `39568562`), cherry-pickeo los 8 commits `docs(164)` e instalo dependencias desde lockfile. El checkout principal quedo intacto.
- **La DB local estaba en 0186** (tenia la 0186 de Wellhub, que es staging-only). `pnpm db:migrate` aplico 0187, 0188 y 0189 en la misma corrida, todas limpias. Idempotencia verificada: la segunda corrida reporta "No new migrations to apply".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Listo para 164-02 en adelante.** Los planes 03/05/08/10 pueden escribir queries contra los nombres fisicos del bloque `<interfaces>` sin re-verificarlos: el cross-check schema/SQL da diff vacio.
- **Importante para el resto de la fase:** todo el trabajo vive en el worktree `/home/franco/projects/et-164-tv` (rama `feat/164-tv-sucursal`), NO en el checkout principal. Los ejecutores siguientes tienen que arrancar con ese cwd.
- **Sin push.** La rama es local (staging-first estricto). El merge a `staging` requiere OK explicito del usuario.
- **Nada pendiente de este plan.** Sin stubs, sin TODOs, sin criterios saltados.

## Self-Check: PASSED

- `el-templo-api/src/db/schema/tv.ts` — FOUND
- `el-templo-api/src/db/migrations/0189_tv_screen.sql` — FOUND
- `el-templo-api/test/tv/tv-schema.test.ts` — FOUND
- Commit `20ceb74c` — FOUND en `git log --all`

Verificacion a nivel plan re-corrida despues del commit (post-prettier):

- `npx tsc --noEmit` en el-templo-api: limpio
- `pnpm db:migrate` idempotente: 2da corrida -> "No new migrations to apply"
- `pnpm vitest run test/tv/tv-schema.test.ts`: 3/3 verdes
- `tv.ts` y `0189_tv_screen.sql` en el mismo commit: si

## Known Stubs

Ninguno.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
