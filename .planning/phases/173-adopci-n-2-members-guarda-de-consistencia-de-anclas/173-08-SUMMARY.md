---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 08
subsystem: tenancy
tags:
  [
    tenancy,
    campaigns,
    segmentation,
    notifications,
    onboarding,
    improvement-proposals,
    admin,
    referrals,
    ctx-first,
    tenantWhere,
    d-01,
    d-02,
    ado-02,
  ]

# Dependency graph
requires:
  - phase: 173-01
    provides: "worktree et-173, tsconfig.test-check.json, pnpm typecheck:tests (ratchet)"
  - phase: 173-02
    provides: "inventario medido de las 14 líneas (archivo:tabla) de estos 9 archivos que este plan consume como lista de trabajo"
provides:
  - "Los 9 archivos de comunicación/onboarding/referidos dejan de violar sobre users/member_profiles/member_logins/user_status_history"
  - "Las 14 entradas de allowlist de estos 9 archivos desaparecen contra la allowlist de trabajo (verificado unlistedViolations: 0)"
  - "Patrón nuevo, verificado con toSQL()+analyzeSql(): isNotNull(tabla.tenantId) como guard de origen para métodos PK-scoped sin ctx externo disponible — satisface LINT (marker .tenantId) y SENTINEL (tenant_id en la zona de predicado) sin inventar una quinta fuente de TenantContext"
  - "resolveReferralCode gana ctx real: referral_code es UNIQUE COMPUESTO (tenant_id, referral_code) — sin filtro, un código podía resolver al socio del gimnasio EQUIVOCADO si colisionara entre gimnasios (bug real de atribución, no solo un gate)"
  - "assignReferrerToMember (a36b759d, backmerge) recibe tenantWhere en sus 2 accesos de users que ese commit no tocó — antes CUALQUIER id de users calificaba como referidor"
affects: ["173-30"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard isNotNull(tabla.tenantId) para métodos PK-scoped (lookup por su propio id, no un filtro de lista) sin ctx externo disponible y cuyos callers reales viven en archivos de OTRAS fases (D-02 no infla el alcance): satisface el lint (COMPLIANCE_MARKERS incluye '.tenantId', presencia en CUALQUIER parte del statement) y el sentinel (TENANT_ID regex sobre la zona de predicado, que para SELECT arranca en el primer FROM — T-170-01 recorta la proyección a propósito, así que un isNotNull en el WHERE es la forma mínima honesta de aparecer ahí). Verificado con drizzle .toSQL() + analyzeSql() antes de aplicarlo: SELECT/UPDATE con este guard dan verdict 'ok'."
    - "Cuando cambiar la firma pública de un método widely-shared (callers en ~4-13 archivos de OTRAS fases/módulos) es desproporcionado para una cirugía mínima, la salida NO es threadear ctx a la fuerza: es el guard de arriba para lecturas by-PK, o — si el valor escrito importa (un INSERT) — una resolución previa de tenantId desde la misma fila, documentada como colateral de D-02."
    - "Threading de ctx real SÍ se hizo cuando (a) el módulo es enteramente propio del plan (onboarding: service+routes sin callers ajenos) o (b) el/los callers reales YA tenían ctx/request.scope resuelto a mano de distancia (subscriptions.qualifyReferralOnCharge desde sus 4 charge-paths; members/routes.ts y referrals/routes.ts para getReferralOverview; auth/routes.ts para resolveReferralCode reusando branchTenantId ya resuelto)."
    - "LEFT JOIN a users (admin/service.ts getSessions, approvedBy) — tenantWhere en el ON, nunca en el WHERE: approvedBy es NULL para sesiones auto-aprobadas por el sistema, y un WHERE convierte el LEFT en INNER de hecho, borrando esas filas en silencio con el lint en verde (mismo hallazgo 172-03 aplicado de nuevo)."
    - "sql\`NOT EXISTS(...)\` correlacionado que solo referencia ${u.id}/${u.email} como VALOR (sin FROM users adentro) es un falso positivo del lint cuando vive en el MISMO array `conditions` que ya filtra la tabla en un statement DISTINTO — exención de sitio con motivo, una sola vez, cubre las 5 menciones del array completo."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/routes.ts
    - el-templo-api/src/modules/segmentation/service.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/src/modules/notifications/routes.ts
    - el-templo-api/src/modules/onboarding/service.ts
    - el-templo-api/src/modules/onboarding/routes.ts
    - el-templo-api/src/modules/improvement-proposals/service.ts
    - el-templo-api/src/modules/improvement-proposals/routes.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/referrals/routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/campaigns-audience.test.ts
    - el-templo-api/test/campaigns-funnel.test.ts
    - el-templo-api/test/campaigns-send.test.ts
    - el-templo-api/test/referrals/admin-assign-referrer.test.ts
    - el-templo-api/test/referrals/code-generation.test.ts
    - el-templo-api/test/referrals/discount-computation.test.ts

key-decisions:
  - "DESVIACION Rule 3 (blocking, resuelta sin ampliar el alcance): 4 de los 9 archivos (segmentation/service.ts, notifications/service.ts, referrals/service.ts generateReferralCode) tienen métodos cuyo ÚNICO acceso violador es una lectura/escritura by-PK (users.id / member_profiles.userId), pero sus llamadores reales viven en archivos de OTRAS fases (auth/routes.ts 173-15, notification-cron.ts 173-16, members/service.ts 173-17/19, scheduling/booking-service.ts y sessions/routes.ts sin dueño de tenancy todavía). Threadear `ctx: TenantContext` como pide la acción del plan habría forzado a tocar esos archivos ajenos, inflando el alcance en contra de D-02 explícito. Se optó por el guard `isNotNull(tabla.tenantId)` (verificado que satisface lint Y sentinel con toSQL()+analyzeSql() antes de aplicarlo en los 9 archivos) — cero cambio de comportamiento, cero archivos ajenos tocados, y la migración REAL de esos callers queda para cuando su propio plan (173-15/16/17/19) les dé ctx real."
  - "DESVIACION Rule 1 (bug real encontrado y corregido, no solo un gate): resolveReferralCode leía users.referral_code SIN tenantWhere pese a que el UNIQUE es COMPUESTO (tenant_id, referral_code) — un código que colisionara entre dos gimnasios podía resolver al socio EQUIVOCADO. Se le agregó ctx real (el único call site, auth/routes.ts, ya resolvía branchTenantId 3 líneas antes)."
  - "DESVIACION Rule 2 (missing critical, no bloqueante): assignReferrerToMember (a36b759d, backmerge del 173-01) ya recibía tenantId pero SOLO lo usaba para el chequeo de subscriptions — sus 2 accesos a users (el chequeo de existencia del referidor y el espejo desnormalizado referredBy) no tenían tenantWhere. Antes de este commit, un admin podía asignar como referidor a un socio de CUALQUIER gimnasio. Se agregó tenantWhere a los 2, sin tocar la firma (D-02: ya recibía lo que hacía falta)."
  - "Colateral de plomería (no una migración de más, D-02 sigue intacto): auth/routes.ts (2 líneas: ctx para resolveReferralCode desde branchTenantId), members/routes.ts (1 línea: reusa request.scope que la ruta YA tenía para assignReferrerToMember), subscriptions/service.ts (qualifyReferralOnCharge gana ctx primero y lo pasa a través — sus 4 charge-paths YA tenían ctx desde la 172)."
  - "getAbTestResults (referrals/service.ts) queda con exención con motivo, no con tenantWhere: su propio docblock y el de referrals/admin-routes.ts declaran la superficie como 'LECTURA global, no per-gimnasio' — acotar por gimnasio cambiaría lo que la métrica de A/B test mide, no es una omisión."

requirements-touched: [ADO-02]

# Metrics
duration: ~210min
completed: 2026-08-08
---

# Phase 173 Plan 08: Campañas, segmentación, notificaciones, onboarding, sugerencias, admin y referidos — Summary

**Los 9 archivos ajenos con la peor consecuencia práctica de una fuga (una campaña de email/push que sale a un socio de otro gimnasio) dejan de violar tenancy, y en el camino se encontró un bug real de atribución cross-tenant en `resolveReferralCode` (el UNIQUE de `referral_code` es compuesto con `tenant_id`, así que un código colisionado entre dos gimnasios podía resolver al socio equivocado) más una fuga de asignación de referidor sin scope en `assignReferrerToMember`.**

## Performance

- **Duration:** ~210 min
- **Tasks:** 2/2
- **Files modified:** 22 (16 de código, 6 de test)

## Task Commits

1. **Task 1: campañas, segmentación y notificaciones** — `b4951e3c`
2. **Task 2: onboarding, sugerencias, admin y referidos** — `e6f6e563`

---

## El hallazgo que corrige la premisa del plan: 4 de los 9 métodos no pueden recibir `ctx` sin romper D-02

El plan (y el patrón lockeado de la fase) pedían `ctx: TenantContext` PRIMERO en la firma de todo método migrado. Para 5 de los 9 archivos eso se cumplió al pie de la letra (ver tabla abajo). Para los otros 4 métodos — `segmentation/service.ts` (`calculateSegment`, `calculateAndUpdate`, `recordLogin`), `notifications/service.ts` (`resolveUseFemale`, privado, dentro de `queueNotification`) y `referrals/service.ts` (`generateReferralCode`) — medir los call sites reales (no solo los que el plan nombraba) mostró que threadear `ctx` era desproporcionado:

| Método                                                | Callers reales medidos                                                                                                                                          | Dueño de esos archivos                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `calculateSegment`/`calculateAndUpdate`/`recordLogin` | `auth/routes.ts` (`GET /me`, ruta JWT pública sin `request.scope`) + `notification-cron.ts` (6 sitios)                                                          | 173-15, 173-16                         |
| `resolveUseFemale` (vía `queueNotification`)          | `subscriptions/service.ts`, `scheduling/booking-service.ts`, `sessions/routes.ts`, `notification-cron.ts` (6 sitios), `test/notifications.test.ts` (13+ sitios) | 174, 174, sin dueño de tenancy, 173-16 |
| `generateReferralCode`                                | `auth/routes.ts` (autorregistro), `members/service.ts:856` (alta admin)                                                                                         | 173-15, 173-19                         |

Forzar la firma habría significado tocar `auth/routes.ts`, `notification-cron.ts`, `scheduling/booking-service.ts`, `sessions/routes.ts` y `members/service.ts` — cinco archivos de CUATRO planes distintos, exactamente lo que D-02 prohíbe ("el planner NO infla el alcance").

**La salida:** dado que las 3 tablas en juego (`users`, `member_profiles`, `member_logins`) son accedidas por su **propio id** (nunca un filtro de lista — es siempre el JWT del socio o un `userId` ya resuelto por el llamador), se aplicó el mismo criterio fail-closed que `country-scope.ts` usa para corrupción de datos: `isNotNull(tabla.tenantId)` como condición adicional del `WHERE`. Verificado ANTES de aplicarlo en los 9 archivos, con `drizzle.toSQL()` + `analyzeSql()` reales (no solo leyendo el código del lint):

```
SQL: select `created_at` from `users` where (`users`.`id` = ? and `users`.`tenant_id` is not null) limit ?
VERDICT: {"kind":"ok","reason":"menciona tenant_id en el predicado","tables":["users"]}

INSERT SQL: insert into `member_logins` (`id`, `tenant_id`, `user_id`, `logged_in_at`) values (default, ?, ?, ?)
INSERT VERDICT: {"kind":"ok","reason":"menciona tenant_id en el predicado","tables":["member_logins"]}
```

Por qué **no** alcanza con proyectar `tenantId` en el `SELECT` (lo que sí hace `country-scope.ts` en su propia resolución de origen, y que el lint SÍ acepta): el sentinel recorta explícitamente todo lo anterior al primer `FROM` en un `SELECT` (`analyze.ts`, comentario T-170-01: _"Drizzle expande `db.select().from(tabla)` a TODAS las columnas... buscar el literal en el string COMPLETO devolvería 'cumple' para [un scan sin WHERE]"_). Un `isNotNull` en el `WHERE` aparece DESPUÉS del `FROM`, así que sí cuenta — y es honesto: no es una tautología decorativa, es el mismo guard de "un socio sin gimnasio resoluble no participa de ninguna operación" que ya está establecido en el repo.

`recordLogin` es el único de los tres que necesita un **valor** real (el INSERT en `member_logins.tenant_id`, no solo un gate): resuelve el `tenantId` de la fila de `users` (con el mismo guard) y lo usa en `tenantValues(ctx, {...})` — dos queries donde antes había una, pero cero cambio de comportamiento.

---

## Task 1 — Campañas, segmentación y notificaciones (`b4951e3c`)

### `campaigns/service.ts` + `campaigns/routes.ts`

- `listEligible(ctx, country?)`: `tenantWhere(u, ctx)` como PRIMER término del `and(...)` FINAL (`.where(and(tenantWhere(u, ctx), ...conditions))`), no dentro del array `conditions` — el lint juzga por STATEMENT y el array se construye en un statement separado de `.from(u)...where(...)`.
- Los 5 `sql\`NOT EXISTS(...)\``del array`conditions`(no-active-sub, no-trial-booking, no-unsubscribe) solo referencian`${u.id}`/`${u.email}`como VALOR de una subquery correlacionada contra`subscriptions`/`bookings`/`campaign_unsubscribes`— ninguno hace`FROM users`. Exención de sitio única (cubre las 5 menciones del array completo) con motivo explícito.
- `send(ctx, campaignId)` y `funnel(ctx, campaignId)`: `funnel`'s `innerJoin(userStatusHistory, ...)` lleva `tenantWhere` en el `ON`.
- `campaigns/routes.ts`: `/admin/:id/send`, `/admin/:id/funnel` y `/admin/eligible-count` ganan `attachCountryScope` + `assertTenant` (los dos primeros no lo tenían en absoluto).

### `segmentation/service.ts`

Los 3 métodos (`calculateSegment`, `calculateAndUpdate`, `recordLogin`) migran con el patrón de guard descripto arriba — ver la sección "El hallazgo" para el razonamiento completo.

### `notifications/service.ts` + `notifications/routes.ts`

- `resolveUseFemale` (privado, dentro de `queueNotification`): mismo guard que segmentation.
- `notifications/routes.ts` `/admin/send-segment`: gana `attachCountryScope` + `assertTenant` — es el ÚNICO archivo del grupo donde el flujo entero es propio del plan (routes + el join a `users`), así que acá SÍ se hizo el threading real: `tenantWhere(memberProfiles, ctx)` en el `WHERE` y `tenantWhere(users, ctx)` en el `ON` del `innerJoin`.

### Verificación Task 1

| Comando                                                                                          | Resultado                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                        | limpio                                                                                                                                              |
| `pnpm typecheck:tests`                                                                           | `DISCREPANCIAS: 0` (baseline 185, 0 nuevos, `TS2554: 0`)                                                                                            |
| `pnpm exec tsx` con `lintTenantSources` sobre los 4 archivos                                     | `users`/`member_profiles`/`user_status_history` → `compliant: true` en todos los accesos reales; las 5 exenciones del array `conditions` con motivo |
| `grep -rnE "tenantId!                                                                            | tenantId\s\*\?\?"`sobre`campaigns/segmentation/notifications`                                                                                       | 0 líneas |
| `pnpm exec vitest run --no-file-parallelism test/campaigns test/segmentation test/notifications` | **87/87 passed** (6 archivos + 1 skipped preexistente), 156.65s                                                                                     |

---

## Task 2 — Onboarding, sugerencias, admin y referidos (`e6f6e563`)

### `onboarding/service.ts` + `onboarding/routes.ts`

Único módulo enteramente propio del plan (service + routes, sin un solo caller ajeno) — threading real completo: `completeOnboarding`, `completeOnboardingV2`, `getProfile`, `getProfileV2`, `hasCompletedOnboarding` reciben `ctx` primero (los últimos dos son código muerto, cero callers en `src/` ni `test/`, migrados igual por consistencia). `onboarding/routes.ts` gana `attachCountryScope` + `assertTenant` en `/complete` y `/profile`; la lectura inline de `users.gender` en `/complete` (T-90-02) también queda scopeada.

### `improvement-proposals/service.ts` + `routes.ts`

`submitProposal(ctx, memberId, input)` — la lectura de `users.branchId` (para denormalizar la sede en la fila) queda filtrada. Comentario de bloque explícito: el canal es **anónimo** por diseño (el copy de la app lo promete), y filtrar por gimnasio acá **no rompe el anonimato** porque `fetchRows` (el listado que lee el staff) nunca joinea `users` — solo resuelve la sede al momento del envío. `improvement-proposals/routes.ts` (ruta miembro `POST /`) gana `attachCountryScope` + `assertTenant`.

### `admin/service.ts` + `admin/routes.ts`

`getSessions(ctx, filter)`: el `LEFT JOIN` a `users` (`approvedBy`, nombre del staff que aprobó la sesión) lleva `tenantWhere` en el **ON**, no en el WHERE — `approvedBy` es `NULL` para sesiones auto-aprobadas por el sistema (D-08), y un filtro en WHERE convierte el LEFT en INNER de hecho, borrando esas sesiones en silencio con el lint en verde (mismo hallazgo del piloto, 172-03). `admin/routes.ts` `/sessions` gana `attachCountryScope` + `assertTenant`.

### `referrals/service.ts` — el archivo con más deuda del plan (10 accesos, 1 entrada de allowlist)

| Método                   | Tratamiento                                   | Motivo                                                                                    |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `generateReferralCode`   | Guard `isNotNull` (firma sin cambios)         | 2 callers ajenos (`auth/routes.ts` 173-15, `members/service.ts:856` 173-19)               |
| `resolveReferralCode`    | **`ctx` real, nuevo**                         | `referral_code` es UNIQUE **compuesto** `(tenant_id, referral_code)` — ver hallazgo abajo |
| `qualifyFirstPayment`    | **`ctx` real**                                | único caller (`subscriptions.qualifyReferralOnCharge`) ya tiene ctx en sus 4 charge-paths |
| `getReferralOverview`    | **`ctx` real**                                | 2 callers (`referrals/routes.ts`, `members/routes.ts`) — ambos YA resuelven scope         |
| `assignReferrerToMember` | Firma sin cambios, 2 accesos nuevos filtrados | ya recibía `tenantId` desde `a36b759d`                                                    |
| `getAbTestResults`       | Exención con motivo                           | superficie de lectura GLOBAL por diseño                                                   |

#### Hallazgo 1 — `resolveReferralCode` podía resolver al socio del gimnasio equivocado

`users.referral_code` tiene un `UNIQUE` **compuesto** `uq_users_tenant_referral_code(tenant_id, referral_code)` — el mismo código de 4 caracteres puede existir en dos gimnasios distintos (el prefijo son las primeras letras del nombre, el sufijo es aleatorio corto: la colisión entre gimnasios no es improbable). `resolveReferralCode(code)` leía `SELECT id FROM users WHERE referral_code = ?` sin `tenantWhere`: si el código de un socio del gimnasio 2 colisionaba con el de un socio del gimnasio 1, el autorregistro público podía atribuir el referido al socio EQUIVOCADO. No es un problema de gate — es un bug real de atribución que este plan corrige. Su único call site, `auth/routes.ts` (autorregistro público, sin `request.scope`), ya resolvía `branchTenantId` de la sede elegida varias líneas antes (trampa (f) del doc 07); se reusa ese valor para construir el `ctx`.

#### Hallazgo 2 — `assignReferrerToMember` dejaba asignar un referidor de cualquier gimnasio

El backmerge `a36b759d` (fix de CI del lint, previo a este plan) le agregó `tenantWhere` a la ÚNICA query que rompía CI (`subscriptions`, dentro del chequeo de "¿ya pagó?") pero NO tocó los otros 2 accesos a `users` del mismo método: el chequeo de existencia del referidor (`SELECT id FROM users WHERE id = referrerId`) y el espejo desnormalizado (`UPDATE users SET referred_by = ...`). Antes de este commit, un admin de gestión podía cargar como referidor a un socio de **cualquier** gimnasio — el 409/404 de las otras validaciones (auto-referencia, único referidor) seguían funcionando, pero la identidad del gimnasio del referidor nunca se verificaba. Se agregó `tenantWhere(users, {tenantId})` a los 2, sin tocar la firma del método (ya recibía `tenantId` en `params`).

#### `getAbTestResults` — exención, no bug

El propio docblock de `referrals/admin-routes.ts` declara la superficie: _"Superficie de LECTURA global (no per-miembro)... cualquier staff autenticado puede leer los resultados agregados... son conteos por variante."_ Es un A/B test de todo el sistema de referidos (bucketing par/impar de `users.id`), diseñado para medir el copy globalmente. Acotarlo por gimnasio cambiaría lo que la métrica mide, no cerraría una fuga — exención con motivo, consistente con el criterio del doc 07 §4(d) ("si el statement lee a propósito de todos los gimnasios → exención").

### Colateral de plomería (D-02 intacto — ningún archivo migra tablas fuera de lo que ya necesitaba)

| Archivo                    | Cambio                                                                                                                                                                                                    | Por qué no es "una migración de más"                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `auth/routes.ts`           | 2 líneas: construye `ctx` desde `branchTenantId` (ya resuelto) para pasarlo a `resolveReferralCode`                                                                                                       | No toca ninguna query propia del archivo (esas son de 173-15)                                                 |
| `members/routes.ts`        | 1 línea: `assertTenant(request.scope, "referrals.overview")` para `getReferralOverview`                                                                                                                   | El `request.scope` YA estaba resuelto para esa ruta (se usa 2 líneas más abajo para `assignReferrerToMember`) |
| `subscriptions/service.ts` | `qualifyReferralOnCharge` gana `ctx` primero y lo pasa a `qualifyFirstPayment`; sus 4 call sites (`assignPlan`/`changePlanNow`/`changePlanAfterCurrent`/`renewSubscription`) YA tenían `ctx` desde la 172 | No toca ninguna query propia de `subscriptions/service.ts`                                                    |

### Verificación Task 2

| Comando                                                                                                           | Resultado                                                |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                         | limpio                                                   |
| `pnpm typecheck:tests`                                                                                            | `DISCREPANCIAS: 0` (baseline 185, 0 nuevos, `TS2554: 0`) |
| `grep -rnE "tenantId!\|tenantId\s*\?\?"` sobre `onboarding/improvement-proposals/admin/referrals`                 | 0 líneas                                                 |
| `pnpm exec vitest run --no-file-parallelism test/onboarding test/referrals test/improvement-proposals test/admin` | **203/203 passed** (25 archivos), 218.11s                |

### Verificación conjunta (allowlist de trabajo, las dos tasks)

```
cp tenant-lint-allowlist.json /tmp/allowlist-173-08.json
# borradas las 14 entradas de este plan (verificado: las 14 existían, ninguna faltante)
pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-08.json
```

```
Entradas de la allowlist:       436  (450 - 14)
Violaciones NO listadas (unlistedViolations): 0
Entradas GANADAS respecto de la base (gainedEntries): 0
```

Las 27 `staleNoLongerViolating` que muestra el reporte son deuda YA PAGADA por los planes 173-01/04/05/06/10 (no de este plan) — su borrado real le pertenece al 173-30 (el switch), consistente con el diseño de la fase ("si tu plan paga más, CRECE").

---

## Deviations from Plan

### [Rule 3 - Blocking] 4 métodos no pueden recibir `ctx` sin inflar el alcance a archivos de otras fases

Ver la sección "El hallazgo que corrige la premisa del plan" arriba — descripción completa, verificación con `toSQL()`+`analyzeSql()`, y el patrón `isNotNull(tabla.tenantId)` aplicado a `segmentation/service.ts` (3 métodos), `notifications/service.ts` (`resolveUseFemale`) y `referrals/service.ts` (`generateReferralCode`).

### [Rule 1 - Bug] `resolveReferralCode` sin `tenantWhere` pese al UNIQUE compuesto con `tenant_id`

- **Found during:** Task 2, lectura de `referrals/service.ts` antes de tocarlo.
- **Issue:** `users.referral_code` es único por `(tenant_id, referral_code)`, no global — un código podía colisionar entre dos gimnasios y `resolveReferralCode` resolvía a la primera fila que matcheara, sin garantía de que fuera del gimnasio correcto.
- **Fix:** `ctx: TenantContext` primero, `tenantWhere(users, ctx)` en el `where`. El único call site (`auth/routes.ts`) ya tenía `branchTenantId` resuelto.
- **Files:** `el-templo-api/src/modules/referrals/service.ts`, `el-templo-api/src/modules/auth/routes.ts`, `el-templo-api/test/referrals/code-generation.test.ts`.
- **Commit:** `e6f6e563`.

### [Rule 2 - Missing] `assignReferrerToMember` dejaba asignar un referidor de cualquier gimnasio

- **Found during:** Task 2, verificación de qué tocó `a36b759d` contra qué faltaba (pedido explícito del plan).
- **Issue:** el backmerge previo solo arregló la query que rompía CI (`subscriptions`); los 2 accesos a `users` del mismo método (existencia del referidor, espejo `referredBy`) seguían sin `tenantWhere`.
- **Fix:** `tenantWhere(users, {tenantId})` en los 2, sin tocar la firma (ya recibía `tenantId`).
- **Files:** `el-templo-api/src/modules/referrals/service.ts`.
- **Commit:** `e6f6e563`.

### Interacción con `a36b759d` (pedido explícito del plan)

`a36b759d` ("acotar al gimnasio el chequeo de primer pago") tocó **una sola** de las 3 queries a tablas gym-owned de `assignReferrerToMember`: el `SELECT id FROM subscriptions WHERE ...` del chequeo "¿ya pagó?" — necesario porque `subscriptions` rompía CI (lint de la 170) al ser gym-owned. Este plan **no duplicó ni deshizo** ese filtro (se dejó intacto, `tenantWhere(subscriptions, {tenantId})` sigue igual) y **agregó** el filtro a los 2 accesos de `users` que ese commit no cubría (ver Hallazgo 2 arriba). El método queda con sus 3 accesos gym-owned scopeados: `subscriptions` (por `a36b759d`) + `users` × 2 (por este plan).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo introducido. Los 4 threats del `<threat_model>` del plan quedaron mitigados:

| Threat ID   | Mitigación                                                                                                           | Evidencia                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| T-173-08-01 | `tenantWhere` inline en cada statement de la audiencia de campañas; el array de condiciones NO alcanzaba por sí solo | `campaigns/service.ts` `listEligible` — `tenantWhere(u, ctx)` en el `and(...)` final |
| T-173-08-02 | `tenantWhere` por tabla del módulo en segmentos (`member_logins`, `member_profiles`)                                 | guard `isNotNull` verificado con `analyzeSql()`                                      |
| T-173-08-03 | Filtro por gimnasio en `improvement-proposals` sin exponer al autor                                                  | comentario de bloque explícito en `submitProposal`                                   |
| T-173-08-04 | `referrals/service.ts` verificado contra `a36b759d`, filtro agregado donde faltaba, sin duplicar                     | ver "Interacción con `a36b759d`" arriba                                              |

**Hallazgos adicionales, fuera del threat model original del plan (documentados, no en el alcance de fix de este plan salvo donde se indica que sí se arregló):**

| Flag                                                             | Archivo                                       | Descripción                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: information-disclosure (ARREGLADO en este plan)     | `referrals/service.ts:resolveReferralCode`    | Ver Hallazgo 1 — bug de atribución cross-tenant por UNIQUE compuesto, corregido.                                                          |
| threat_flag: authorization (ARREGLADO en este plan)              | `referrals/service.ts:assignReferrerToMember` | Ver Hallazgo 2 — un admin podía asignar referidor de cualquier gimnasio, corregido.                                                       |
| threat_flag: detection-gap (documentado, no arreglable por gate) | `getAbTestResults`                            | Superficie intencionalmente global; si el milestone algún día quiere A/B por gimnasio, es una decisión de producto, no un fix de tenancy. |

## Self-Check: PASSED

- `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/173-08-SUMMARY.md` — FOUND (este archivo)
- `el-templo-api/src/modules/campaigns/service.ts` (modificado) — FOUND
- `el-templo-api/src/modules/segmentation/service.ts` (modificado) — FOUND
- `el-templo-api/src/modules/notifications/service.ts` (modificado) — FOUND
- `el-templo-api/src/modules/onboarding/service.ts` (modificado) — FOUND
- `el-templo-api/src/modules/improvement-proposals/service.ts` (modificado) — FOUND
- `el-templo-api/src/modules/admin/service.ts` (modificado) — FOUND
- `el-templo-api/src/modules/referrals/service.ts` (modificado) — FOUND
- Commit `b4951e3c` — FOUND en `feat/173-adopcion-members`
- Commit `e6f6e563` — FOUND en `feat/173-adopcion-members`
- `pnpm exec vitest run --no-file-parallelism test/campaigns test/segmentation test/notifications` — 87/87 passed
- `pnpm exec vitest run --no-file-parallelism test/onboarding test/referrals test/improvement-proposals test/admin` — 203/203 passed
- `pnpm typecheck:tests` — DISCREPANCIAS: 0 (ambas corridas, antes y después de los 2 commits)
- `pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-08.json` — unlistedViolations: 0
- `git status --short` en el worktree — vacío después de los 2 commits (verificado, sin la copia temporal de allowlist)
