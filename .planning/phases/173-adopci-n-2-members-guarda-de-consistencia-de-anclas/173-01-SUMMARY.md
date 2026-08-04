---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 01
subsystem: infra
tags: [tenancy, worktree, backmerge, typescript, tsconfig, ratchet, ci-gate]

# Dependency graph
requires:
  - phase: 172-adopci-n-1-piloto-finance
    provides: "las 5 capas de tenancy con finance ya adoptado, TENANT_STRICT_MODULES con su primera entrada, allowlist en 450, manifiesto de 372 rutas y la receta .docs/saas-multitenancy/07-receta-adopcion.md"
provides:
  - "gate D-16 cerrado: origin/master es ancestro de origin/staging (61 0)"
  - "worktree /home/franco/projects/et-173 en feat/173-adopcion-members desde origin/staging, sin upstream, node_modules propio"
  - "los 5 baselines de PATTERNS §0.3 medidos, no supuestos"
  - "el-templo-api/tsconfig.test-check.json: el programa que SI incluye test/ (253 archivos)"
  - "pnpm typecheck:tests: ratchet fail-closed de la deuda de tipos de test/, con TS2554 en baseline 0"
affects:
  [173-02, 173-03, "todos los planes de la 173 que cambien firmas", 174, 175]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ratchet de deuda con baseline versionado + gate fail-closed en dos direcciones (copiado de lint-tenant.ts + tenant-lint-allowlist.json)"

key-files:
  created:
    - el-templo-api/tsconfig.test-check.json
    - el-templo-api/src/db/scripts/test-check.ts
    - el-templo-api/test-check-baseline.json
  modified:
    - el-templo-api/package.json

key-decisions:
  - "El backmerge D-16 resulto ser un empalme de historia puro: los 4 commits de master ya estaban en staging como cherry-picks y el arbol mergeado es identico byte a byte a origin/staging"
  - "El unico conflicto (advanced-finance.test.ts, 1 linea) se resolvio con el lado de staging, que es el unico que compila con el TenantContext de la 172 adentro"
  - "DESVIACION Rule 3: tsconfig.test-check.json no puede salir 0 solo (185 errores de tipos preexistentes en test/), asi que se le agrego un ratchet con baseline versionado en vez de dejar un gate decorativo"
  - "El baseline agrupa por (archivo, codigo) y no por linea, para que agregar lineas a un test no mueva el baseline pero un error nuevo si"

patterns-established:
  - "Ratchet de tipos: pnpm typecheck:tests es rojo ante deuda nueva, deuda empeorada Y entradas obsoletas del baseline — un baseline que envejece miente igual que uno inflado"
  - "TS2554 con baseline 0: el drift de firma es nuevo por construccion y sale destacado como DRIFT DE FIRMA"

requirements-completed: []

# Metrics
duration: ~75min
completed: 2026-08-04
---

# Phase 173 Plan 01: Base de ejecución y gate de secuencia — Summary

**El backmerge D-16 resultó ser un empalme de historia puro (árbol idéntico a staging, cero líneas cambiadas), el worktree `et-173` arranca verde sobre esa base, y `test/` pasó a tener un typecheck que puede salir rojo — que era justo lo que no tenía.**

## Performance

- **Duration:** ~75 min (incluye el gate humano bloqueante del Task 1)
- **Tasks:** 3/3
- **Files modified:** 4 versionados (3 nuevos + `package.json`)

## Task Commits

1. **Task 1: Gate D-16 — backmerge `origin/master` → `origin/staging`** — merge `395243a4`, pusheado a `origin/staging` con autorización explícita de Franco
2. **Task 2: Worktree `et-173` + baselines** — sin commit (ningún archivo versionado, por diseño del plan)
3. **Task 3: `tsconfig.test-check.json`** — `46aa08d3` (chore) + `12c3083f` (chore, la desviación)

---

## Task 1 — el gate D-16

### Punto de partida

`git rev-list --left-right --count origin/staging...origin/master` → **`60 4`**, exactamente lo que predijo el mapeo de la fase.

### El hallazgo: no había UN gemelo, había CUATRO

El plan preveía el gemelo de `f77e05b4`/`e1952606`. Medido con `git patch-id --stable`, los **cuatro** commits de master ya estaban en staging como cherry-picks:

| master                                      | staging    | patch-id                 |
| ------------------------------------------- | ---------- | ------------------------ |
| `6724f46e` replay de refresh                | `d5d9bb75` | **IDÉNTICO**             |
| `0661f987` mes ancla del ARPU               | `5a443f89` | difiere solo en contexto |
| `a36b759d` primer pago acotado al gimnasio  | `c88c20fe` | **IDÉNTICO**             |
| `f77e05b4` asignar referidor desde la ficha | `e1952606` | difiere solo en contexto |

Los dos que "difieren" difieren en **líneas de contexto de la fase 172**, no en contenido:

- `f77e05b4` **agrega** `import { assertTenant } from "../shared/tenant";` en `members/routes.ts`; en staging esa línea ya existe (la puso la 172), así que aparece como contexto. Es el reverso exacto de la trampa que MEMORY anota ("el cherry-pick staging→master dejó `assertTenant` sin importar").
- `0661f987`: la línea de contexto es `svc.getAdvancedFinance(CTX, {})` en staging vs. `svc.getAdvancedFinance({})` en master, porque master no tiene el `TenantContext`.

### El merge

Hecho en un worktree scratch aislado (`/home/franco/projects/et-173-backmerge`, rama `backmerge-173-master-into-staging` desde `origin/staging`, sin upstream), **nunca en el checkout principal**.

```
Auto-merging el-templo-api/src/modules/members/routes.ts
Auto-merging el-templo-api/test/analytics/advanced-finance.test.ts
CONFLICT (content): Merge conflict in el-templo-api/test/analytics/advanced-finance.test.ts
```

**`members/routes.ts` —el archivo que el plan marcaba como el riesgo— auto-mergeó limpio y sin duplicar nada.** Verificado a mano: 1 `import { assertTenant }`, 1 definición de `assertReferralTargetInScope`, 1 `GET /:userId/referrals` (`:1727`), 1 `POST /:userId/referrals` (`:1753`).

**Conflicto único: 1 hunk, 1 línea**, en `test/analytics/advanced-finance.test.ts:431`. Resuelto con el lado de **staging** (`getAdvancedFinance(CTX, {})`), que es el único que compila con la 172 adentro.

### La prueba fuerte de que la resolución fue correcta

```
git diff --stat origin/staging   →   (vacío)
```

**El árbol mergeado es idéntico byte a byte a `origin/staging`.** El backmerge no cambia una sola línea de código: solo registra que los 4 commits de master son ancestros. Eso es lo que garantiza que ningún merge posterior de la fase 173 pueda traer sorpresas sobre `members/routes.ts`.

### `a36b759d` leído contra PATTERNS §5

5 líneas en `src/modules/referrals/service.ts`: agrega `tenantWhere(subscriptions, { tenantId })` como **primer término del `and(...)`** en el SELECT de "¿ya pagó?" de `assignReferrerToMember`, con el `tenantId` que ya venía de `assertTenant(request.scope)`. Respeta la convención lockeada.

**Colisión con D-13/D-15: ninguna.** D-13 (`getMemberSubscription:919`, `assignPlan` insert `:1592`) y D-15/WR-02 (guard `SUB_HAS_ACTIVE_TRANSACTIONS:2859`) viven los dos en `subscriptions/service.ts`; `a36b759d` toca `referrals/service.ts`. Cero solapamiento de archivo, método o query.

### Verificación post-merge y push

- `pnpm exec tsc --noEmit` → **exit 0** (`pnpm install --frozen-lockfile`, lockfile sin modificar)
- `pnpm lint:tenant` → **exit 0**, `DISCREPANCIAS: 0`
- Push autorizado explícitamente por Franco: `d5d9bb75..395243a4 → staging`
- **`git rev-list --left-right --count origin/staging...origin/master` → `61 0`** y `git merge-base --is-ancestor origin/master origin/staging` → exit 0. **D-16 CERRADO.**
- Sin migraciones: staging sigue en 0197, prod en 0196, la 173 reserva desde 0198.
- Worktree scratch y su rama borrados.

**SHA del merge del backmerge: `395243a4`.**

---

## Task 2 — worktree y baselines

`/home/franco/projects/et-173`, rama `feat/173-adopcion-members` desde `origin/staging` (`395243a4`), **sin upstream** (`@{u}` falla), `.env` y `.env.development` copiados de `et-172`, `pnpm install --frozen-lockfile` en 3 s.

**Lockfile md5 `5f468b7517d6fef8c5e014a7353ede61` — byte-idéntico al que registró la 172. Cero dependencias nuevas o actualizadas.**

### Los 5 baselines de PATTERNS §0.3, medidos

**(a) Allowlist:** **450** entradas. `pnpm lint:tenant` exit 0 con los 4 gates en cero (`unlistedViolations` 0, `staleMissingFile` 0, `staleNoLongerViolating` 0, `strictWithAllowlist` 0).

**(b) Manifiesto:** **372 rutas — 224 `tenant-scoped` · 141 `templo-module` · 7 `global`.**

⚠️ **El header quedó stale, confirmado:** `test/tenant-manifest.ts:32` y `:141` siguen diciendo "223 `tenant-scoped` · 8 `global`". Lo corrige el 173-02.

⚠️ **Y hay un número del CONTEXT que cambió con el backmerge:** las rutas `tenant-scoped` del prefijo del módulo (D-09, la batería ISO-03) son **30**, no 29 — `/api/admin/members` **24** (no 23) + `/api/admin/users` 5 + `/api/admin/leads` 1. La de más es `POST /api/admin/members/:userId/referrals`, que entró con `e1952606`. **El gate de cobertura del plan que arme la batería tiene que contar 30.**

**(c) `TENANT_STRICT_MODULES`:** **1 entrada** — `finance`, 6 tablas (`balances`, `cash_registers`, `cost_centers`, `debt_management`, `financial_transactions`, `transaction_links`).

**(d) Exenciones `tenant-safe` heredadas: 10** (inventario D-12 del propio lint, que es la fuente autoritativa), **ninguna en `src/modules/members/`**:

| Alcance | Sitio                                         | Motivo                                                  |
| ------- | --------------------------------------------- | ------------------------------------------------------- |
| ARCHIVO | `src/db/run-migrations.ts:10`                 | herramienta de plataforma, aplica DDL                   |
| ARCHIVO | `src/db/scripts/lint-tenant.ts:167`           | tooling, analiza por AST y no ejecuta queries           |
| ARCHIVO | `src/db/scripts/verify-tenant-backfill.ts:58` | verificador, escanea todos los tenants                  |
| ARCHIVO | `src/db/scripts/verify-tenant-uniques.ts:61`  | verificador, escanea todos los tenants                  |
| ARCHIVO | `src/db/seed-spom.ts:1`                       | provisioning, construye la base desde cero (25 accesos) |
| ARCHIVO | `src/db/seed.ts:1`                            | provisioning, construye la base desde cero (6 accesos)  |
| sitio   | `src/jobs/notification-cron.ts:754`           | seed de templates global hasta la fase 175              |
| sitio   | `src/modules/tv/pairing.ts:145`               | pairing pre-claim                                       |
| sitio   | `src/modules/wellhub/service.ts:135`          | idempotencia global previa a derivar el tenant (M8)     |
| ARCHIVO | `scripts/wellhub-sandbox.ts:27`               | no toca la DB                                           |

Nota de método: un `grep -rn '/\* tenant-safe:' src/ scripts/` devuelve **12** hits, no 10. Los 2 extra son **prosa, no exenciones**: `src/db/schema/tv.ts:81` (un comentario de la mina M7 que cita el literal) y `src/db/scripts/lint-tenant.ts:1424` (el mensaje de ayuda del propio linter). **La cuenta buena es la del inventario del lint, no la del grep** — si al cerrar la fase alguien mide con grep va a contar de más.

**(e) Entradas de allowlist a borrar: 90** (verificado con el script exacto del criterio de aceptación) — **79 por tabla + 11 por archivo**, repartidas en **52 archivos**:

| Tabla                  | Entradas |
| ---------------------- | -------- |
| `users`                | 50       |
| `member_profiles`      | 13       |
| `user_status_history`  | 7        |
| `user_branches`        | 4        |
| `member_notes`         | 2        |
| `user_sepa_details`    | 1        |
| `member_logins`        | 1        |
| `audit_log`            | 1        |
| **subtotal por tabla** | **79**   |

Las 11 restantes son entradas bajo `src/modules/members/` cuya tabla **no** es del módulo (se van porque el criterio es por archivo):

```
members/routes.ts  | bookings, branches
members/service.ts | attendance, bookings, branches, completed_sessions, referrals,
                     schedules, subscription_plans, subscription_schedules, subscriptions
```

⚠️ **90 es PISO, no techo.** El piloto planeó 47 y fueron 51: las 4 de diferencia eran tablas **joineadas** que el lint cuenta como accesos propios. El plan del switch tiene que correr el lint y listar las stale REALES antes de borrar.

### Baseline verde antes de tocar una línea

`pnpm exec tsc --noEmit` exit 0 · `pnpm lint:tenant` exit 0 con `DISCREPANCIAS: 0`.

**Checkout principal intacto:** los 5 modificados y 3 untracked bajo `el-templo-api/` que muestra `git status` son preexistentes de otras sesiones (mtimes 2026-07-11 y 2026-07-22, verificados). No se tocó ni un archivo ahí fuera de `.planning/`.

---

## Task 3 — `tsconfig.test-check.json` y el ratchet

### El modo de falla, reproducido antes de escribir el archivo

Con el `rootDir: "./src"` heredado y el `include` extendido a `test/`:

```
246 error TS6059
  0 error TS2554
```

El compilador tira `TS6059` ("is not under rootDir") por cada archivo de test, **los expulsa del programa** y devuelve un **`TS2554: 0` falso**: verde por no haber mirado. Ese es exactamente el modo de falla que este archivo existe para matar.

Con `rootDir: "."` entran **253 archivos de `test/`** al programa (criterio: >100).

### El rojo provocado a mano

Call site roto: `test/finance/cash-balances.test.ts:140`, un argumento de más en `tenantValues` (acepta 2, se le pasaron 3).

`tsc` crudo:

```
test/finance/cash-balances.test.ts(140,44): error TS2554: Expected 2 arguments, but got 3.
TSC EXIT: 2
```

El gate:

```
--- test-check (tsconfig.test-check.json) ---
Errores totales:                 187
Deuda conocida (baseline):       185
Errores NUEVOS:                  1
Errores EMPEORADOS:              1
Entradas del baseline OBSOLETAS: 0
TS2554 (aridad — baseline 0):    1  <== DRIFT DE FIRMA

Deuda NUEVA (el gate la rechaza):
  test/finance/cash-balances.test.ts|TS2554  (1) — ej: Expected 2 arguments, but got 3.

Deuda que EMPEORO (el gate la rechaza):
  test/finance/cash-balances.test.ts|TS2769  2 -> 3 — ej: No overload matches this call.

DISCREPANCIAS: 2
GATE EXIT: 1
```

**Reversión verificada por md5:** `95d2c0980c949c3d7db2f0e3df1482ea` antes y después. Gate post-reversión: `DISCREPANCIAS: 0`, exit 0.

---

## Deviations from Plan

### **[Rule 3 - Blocking] El criterio "`tsc -p tsconfig.test-check.json --noEmit` sale 0" es falso sobre la rama limpia**

- **Found during:** Task 3
- **Issue:** El árbol de tests arrastra **185 errores de tipos preexistentes** — 58 `TS2769`, 33 `TS2835`, 32 `TS2352`, 31 `TS2345`, 17 `TS7006`, 7 `TS2834`, 6 sueltos. **Ninguno en `src/`** (el `tsc --noEmit` de build sigue en 0) y **ninguno `TS2554`**. Es la misma deuda que STATE.md venía anotando desde el 172-08 como "182 errores de tipos preexistentes, ruido de fondo" (ahora 185). El plan asumió un árbol limpio.
- **Por qué no se podía dejar así:** el `<done>` del Task 3 dice "todos los planes siguientes que cambien firmas lo usan como verificación". Un gate cuyo exit code nunca puede ser 0 obliga a leer 185 líneas de ruido a ojo, y la adaptación natural de los 30 planes que quedan (más la 174 y la 175) es ignorar el exit code — que mata justo la garantía por la que el archivo se creó.
- **Alternativas descartadas:** (a) filtrar solo `TS2554` — pierde señal, porque un cambio de tipo de parámetro da `TS2345` y hay 31 preexistentes; (b) `exclude` de los archivos ruidosos — esconde drift real en archivos que esta misma fase reescribe, como `test/members/members.test.ts`; (c) arreglar los 185 — fuera de alcance y toca archivos de otros planes.
- **Fix:** ratchet con baseline versionado, copiando el idioma que el repo ya usa para exactamente esto (`lint-tenant.ts` + `tenant-lint-allowlist.json`, fase 170 D-14): `el-templo-api/src/db/scripts/test-check.ts` + `el-templo-api/test-check-baseline.json` + script `pnpm typecheck:tests`. Agrupa por `(archivo, código)`, es **fail-closed en las dos direcciones** (deuda nueva, deuda empeorada **y** entradas obsoletas del baseline — misma regla que `staleNoLongerViolating`), y destaca `TS2554` porque su baseline es 0 y por lo tanto cualquier aparición es nueva por construcción.
- **Files:** `el-templo-api/src/db/scripts/test-check.ts`, `el-templo-api/test-check-baseline.json`, `el-templo-api/package.json`
- **Commit:** `12c3083f`
- **Cero dependencias nuevas.** `tsc --noEmit` de build y `pnpm lint:tenant` siguen en exit 0 con el script nuevo dentro de `src/`.

### **[Nota, no desviación] El gemelo era cuádruple, no simple**

El plan preveía resolver a mano el gemelo `f77e05b4`/`e1952606`. Los 4 commits estaban cherry-pickeados y el merge salió con **un solo conflicto de una línea**. No hizo falta ninguna resolución manual sobre `members/routes.ts`.

---

## Para los planes siguientes de la fase

1. **La batería ISO-03 son 30 rutas, no 29** — `e1952606` agregó `POST /api/admin/members/:userId/referrals` al manifiesto. El gate de cobertura tiene que derivar 30 del prefijo.
2. **El header del manifiesto está stale** (`:32` y `:141` dicen 223/8, la realidad es 224/7). Lo corrige el 173-02.
3. **Las 90 entradas de allowlist son un piso.** Correr el lint y listar las stale reales antes de borrar.
4. **Verificación de firmas: `pnpm typecheck:tests`**, no `tsc --noEmit` a secas. Si aparece `DRIFT DE FIRMA` con `TS2554`, hay call sites de test sin actualizar. Si arreglás deuda vieja, regenerá el baseline en el **mismo commit** con `pnpm typecheck:tests -- --update`.
5. **Las exenciones `tenant-safe` se cuentan con el inventario del lint (10), no con grep (12).**
6. **`test-check` NO está cableado a CI.** Si se quiere que el drift de firmas sea rojo en CI y no solo local, hay que agregar el step — decisión abierta, no la tomé.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. El plan no agrega superficie de red, auth, acceso a archivos ni esquema. `test-check.ts` es tooling local que ejecuta `node_modules/typescript/bin/tsc` con argumentos fijos y no toca la base ni la red.

## Self-Check: PASSED

- `el-templo-api/tsconfig.test-check.json` — FOUND
- `el-templo-api/src/db/scripts/test-check.ts` — FOUND
- `el-templo-api/test-check-baseline.json` — FOUND
- `/home/franco/projects/et-173/el-templo-api/.env` — FOUND
- Commit `46aa08d3` — FOUND
- Commit `12c3083f` — FOUND
- Merge `395243a4` — FOUND en `origin/staging`
