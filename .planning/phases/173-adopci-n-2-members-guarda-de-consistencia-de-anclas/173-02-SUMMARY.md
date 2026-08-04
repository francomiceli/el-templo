---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 02
subsystem: tenancy
tags: [tenancy, inventario, lint, sentinel, manifiesto, members, test-hardening]

# Dependency graph
requires:
  - phase: 173
    plan: 01
    provides: "worktree et-173 sobre origin/staging, baselines medidos (allowlist 450, manifiesto, TENANT_STRICT_MODULES=1, exenciones 10), pnpm typecheck:tests"
provides:
  - "Inventario 1 (src, lente A): 364 accesos violadores en 90 pares (archivo,tabla) sobre 52 archivos, con archivo:línea:tabla"
  - "Inventario 2 (src, lente B en runtime): 31 violaciones / 21 statements distintos sobre el prefijo del módulo, medidos con SENTINEL_INVENTORY=1"
  - "Inventario 3 (test): 355 accesos Drizzle sin filtro en 119 archivos + 55 sitios de SQL crudo en 25 archivos + 11 sitios de tabla dinámica resueltos a mano"
  - "Inventario 4 (mocks posicionales): CERO sobre los 23 métodos de members/service.ts, verificado por 4 formas de mock distintas"
  - "Manifiesto sincronizado: 373 entradas = 224 tenant-scoped + 141 templo-module + 8 global"
  - "Las 30 rutas del prefijo del módulo, enumeradas: el CASOS_BASELINE del gate de cobertura del plan 173-29"
  - "HALLAZGO: las dos lentes comparten el punto ciego multi-tabla — 83 statements, 19 ya invisibles hoy"
  - "HUECO DE PLANIFICACIÓN: src/scripts/backfill-historical-payments.ts viola y no tiene plan dueño"
affects:
  [
    "173-04",
    "173-05",
    "173-06",
    "173-07",
    "173-08",
    "173-09",
    "173-10",
    "173-17",
    "173-18",
    "173-19",
    "173-20",
    "173-21",
    "173-22",
    "173-23",
    "173-24",
    "173-25",
    "173-29",
    "173-30",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lente B acotada: en vez de correr la suite entera (prohibido local), se monta un arnés desechable que hace buildApp() + app.inject() sobre el prefijo del módulo y vuelca app.dbSentinel.report()"
    - "Contabilizar la unidad ganada de un baseline numérico con una tabla de transición explícita, en vez de mover el número"

key-files:
  created: []
  modified:
    - el-templo-api/test/tenant-manifest.ts

key-decisions:
  - "DESVIACION Rule 1: el plan mandaba escribir '372 rutas / 7 global' en el header. Medido son 373 entradas / 8 global. Escribir el número del plan habría creado un header stale NUEVO, que es peor que el que se venía a arreglar."
  - "DESVIACION Rule 3: la lente B no se pudo correr como pedía el plan (suite entera con SENTINEL_INVENTORY=1, prohibido por el skill y por el prompt). Se midió con un arnés desechable acotado al prefijo del módulo, que da la lista de queries REALES del módulo — que es lo que el plan quería."
  - "El punto ciego multi-tabla NO lo cubren las dos lentes: las DOS juzgan por statement (lint via isCompliantText(enclosingStatement), sentinel via analyzeSql). La mitigación de T-173-02-01 no es cruzar lentes, es la lista de 83 statements para releer a mano."
  - "El grep de SQL crudo del plan buscaba backticks (15 sitios en el piloto). En este árbol el idioma dominante es sin backticks (sql`DELETE FROM audit_log`): 55 sitios totales, y el grep de backticks veía 3."

patterns-established:
  - "Antes de aceptar el número de un plan, medirlo: 3 de los números heredados (372 rutas, 7 global, 90 entradas como si fuera el trabajo) resultaron ser otra cosa"
  - "Cruzar la lista de archivos violadores contra los files_modified de TODOS los planes de la fase caza huecos de planificación antes de que los cace CI"

requirements-completed: [ADO-02]

# Metrics
duration: ~95min
completed: 2026-08-04
---

# Phase 173 Plan 02: Inventario con las dos lentes — Summary

**El trabajo real de la fase no son 90 entradas de allowlist: son 364 accesos en `src/` más 410 en `test/`, y las dos lentes que el plan mandaba cruzar comparten un punto ciego —el statement multi-tabla— que ninguna de las dos va a reportar jamás.**

## Performance

- **Duration:** ~95 min
- **Tasks:** 3/3
- **Files modified:** 1 versionado (`test/tenant-manifest.ts`)

## Task Commits

1. **Task 1: Inventario de `src/` con las dos lentes** — sin commit (solo lectura, por diseño del plan)
2. **Task 2: Inventario de `test/` + barrido de mocks** — sin commit (solo lectura, por diseño del plan)
3. **Task 3: Header del manifiesto** — `4d552b7d`

---

## Inventario 1 — `src/`, lente A (estática, por archivo+tabla)

Medido importando el **motor del propio lint** (`lintTenantSources` de `src/db/scripts/lint-tenant.ts`), no con grep: es la única forma de tener la línea de cada acceso, porque `tenant-lint-allowlist.json` guarda solo `file`+`table` (D-13 de la 170 prohíbe la línea en la allowlist).

### El número que importa

| Métrica                                            | Valor   |
| -------------------------------------------------- | ------- |
| Entradas de allowlist objetivo del switch          | **90**  |
| Pares (archivo, tabla) violadores                  | **90**  |
| **Accesos violadores individuales**                | **364** |
| Archivos                                           | **52**  |
| Accesos en alcance que ya cumplen                  | 44      |
| Accesos en alcance cubiertos por exención heredada | 4       |

⚠️ **90 es el número de ENTRADAS que se borran; 364 es el número de queries que hay que tocar.** El CONTEXT, PATTERNS §0.1 y el 173-01-SUMMARY venían hablando de "90" como si fuera el tamaño del trabajo. No lo es: es el tamaño del **diff de la allowlist**. La relación es 4:1.

### Accesos violadores por tabla

| Tabla                 | Accesos | Tabla                    | Accesos |
| --------------------- | ------- | ------------------------ | ------- |
| `users`               | **226** | `member_notes`           | 10      |
| `member_profiles`     | 42      | `subscription_plans`     | 10      |
| `branches`            | 18      | `bookings`               | 7       |
| `user_status_history` | 16      | `user_sepa_details`      | 3       |
| `subscriptions`       | 14      | `attendance`             | 1       |
| `user_branches`       | 11      | `schedules`              | 1       |
| `referrals`           | 1       | `subscription_schedules` | 1       |
| `completed_sessions`  | 1       | `member_logins`          | 1       |
| `audit_log`           | 1       |                          |         |

(Las tablas que no son del módulo entran por el criterio de **archivo**: son queries de `members/routes.ts` y `members/service.ts`. Ver PATTERNS §0.1.)

### Por archivo y por plan dueño

`archivo | tabla(cantidad): líneas`. Verificado que **cada archivo violador tiene exactamente un plan dueño, sin solapes** — salvo la excepción del final.

#### Plan 173-04 — helpers compartidos `audit-log` / `country-scope`

| Archivo                               | Tablas y líneas                           |
| ------------------------------------- | ----------------------------------------- |
| `src/modules/shared/audit-log.ts`     | `audit_log`(1): 57                        |
| `src/modules/shared/country-scope.ts` | `user_branches`(1): 228 · `users`(1): 270 |

#### Plan 173-05 — helpers `member-search` / `covered-until` + reports

| Archivo                               | Tablas y líneas                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/modules/shared/member-search.ts` | `users`(2): 33, 39                                                                          |
| `src/modules/shared/covered-until.ts` | `users`(1): 33                                                                              |
| `src/modules/reports/service.ts`      | `users`(14): 371, 384, 641, 706, 1482, 1654, 1694, 1731, 1774, 1879, 1931, 2132, 2657, 2719 |

#### Plan 173-06 — analytics

| Archivo                                             | Tablas y líneas                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/modules/analytics/service.ts`                  | `member_profiles`(2): 618, 678 · `users`(6): 262, 360, 361, 371, 618, 678       |
| `src/modules/analytics/engagement-service.ts`       | `member_profiles`(6): 84, 86, 103, 108, 160, 177 · `users`(4): 84, 87, 168, 177 |
| `src/modules/analytics/funnel-service.ts`           | `user_status_history`(4): 160, 165, 170, 172 · `users`(3): 128, 131, 132        |
| `src/modules/analytics/frequency-service.ts`        | `users`(4): 299, 316, 596, 604                                                  |
| `src/modules/analytics/member-flows-service.ts`     | `users`(2): 237, 372                                                            |
| `src/modules/analytics/advanced-finance-service.ts` | `users`(1): 393                                                                 |

#### Plan 173-07 — grilla, reservas, asistencia, check-ins, ratings

| Archivo                                     | Tablas y líneas                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/modules/attendance/service.ts`         | `member_profiles`(2): 533, 559 · `user_branches`(1): 364 · `users`(7): 79, 157, 533, 559, 951, 1031, 1077 |
| `src/modules/scheduling/service.ts`         | `member_profiles`(1): 364 · `users`(2): 364, 419                                                          |
| `src/modules/scheduling/trials-service.ts`  | `user_status_history`(2): 347, 601 · `users`(10): 223, 335, 415, 592, 653, 735, 858, 920, 1009, 1085      |
| `src/modules/scheduling/booking-service.ts` | `users`(4): 92, 535, 912, 2137                                                                            |
| `src/modules/scheduling/routes.ts`          | `users`(2): 807, 995                                                                                      |
| `src/modules/check-ins/admin-service.ts`    | `users`(4): 126, 164, 189, 213                                                                            |
| `src/modules/ratings/service.ts`            | `user_branches`(2): 64, 186 · `users`(5): 64, 103, 186, 583, 612                                          |

#### Plan 173-08 — campañas, segmentación, notificaciones, onboarding, referidos

| Archivo                                        | Tablas y líneas                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `src/modules/campaigns/service.ts`             | `user_status_history`(2): 571, 590 · `users`(6): 73, 75, 77, 83, 90, 100    |
| `src/modules/segmentation/service.ts`          | `member_logins`(1): 199 · `member_profiles`(2): 162, 183 · `users`(1): 62   |
| `src/modules/notifications/routes.ts`          | `member_profiles`(1): 417 · `users`(1): 417                                 |
| `src/modules/notifications/service.ts`         | `users`(1): 210                                                             |
| `src/modules/onboarding/service.ts`            | `member_profiles`(8): 30, 42, 88, 118, 123, 187, 221, 248 · `users`(1): 128 |
| `src/modules/onboarding/routes.ts`             | `users`(1): 156                                                             |
| `src/modules/improvement-proposals/service.ts` | `users`(1): 98                                                              |
| `src/modules/admin/service.ts`                 | `users`(1): 105                                                             |
| `src/modules/referrals/service.ts`             | `users`(10): 88, 105, 129, 289, 345, 421, 481, 556, 558, 563                |

#### Plan 173-09 — entrenamiento, progresión, gamificación

| Archivo                                      | Tablas y líneas                            |
| -------------------------------------------- | ------------------------------------------ |
| `src/modules/programs/service.ts`            | `users`(6): 438, 498, 600, 974, 1072, 1102 |
| `src/modules/programs/enrollment-service.ts` | `users`(1): 727                            |
| `src/modules/goal-plans/routes.ts`           | `users`(4): 263, 435, 443, 532             |
| `src/modules/goal-plans/service.ts`          | `users`(2): 171, 709                       |
| `src/modules/sessions/routes.ts`             | `users`(4): 239, 403, 512, 751             |
| `src/modules/progression/routes.ts`          | `member_profiles`(1): 120 · `users`(1): 34 |
| `src/modules/streaks/service.ts`             | `member_profiles`(2): 137, 225             |
| `src/modules/tree-progress/service.ts`       | `users`(1): 377                            |
| `src/modules/bar-challenge/service.ts`       | `users`(1): 37                             |

#### Plan 173-10 — scripts CLI

| Archivo                                  | Tablas y líneas                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/db/import-members.ts`               | `member_notes`(4): 916, 928, 940, 952 · `users`(7): 592, 758, 820, 845, 852, 899, 1073 |
| `src/db/import-fecha-ingreso.ts`         | `users`(2): 220, 280                                                                   |
| `src/db/import-turnos.ts`                | `users`(1): 376                                                                        |
| `src/db/import-vigentes.ts`              | `users`(3): 283, 515, 531                                                              |
| `src/db/seed-staging.ts`                 | `users`(4): 40, 65, 98, 113                                                            |
| `src/scripts/backfill-referral-codes.ts` | `users`(1): 70                                                                         |

#### Plan 173-13 — staff

| Archivo                        | Tablas y líneas                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/modules/users/service.ts` | `user_branches`(7): 109, 185, 210, 286, 323, 327, 359 · `users`(10): 82, 148, 169, 189, 239, 256, 313, 334, 398, 421 |

#### Plan 173-14 — deudas de la 172 en subscriptions

| Archivo                                | Tablas y líneas                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/subscriptions/service.ts` | `user_status_history`(1): 5860 · `users`(18): 1261, 1488, 1663, 2283, 3216, 3308, 3574, 3589, 3713, 3751, 3799, 4277, 4641, 4963, 4975, 5743, 5758, 5853 |

⚠️ 19 accesos en un archivo que D-02 declara "de la 174". Los planes 173-04, 173-05 y 173-14 se lo reparten. **Es el archivo con más riesgo de pisada entre planes de la fase** — el único con 3 dueños distintos.

#### Plan 173-15 — autorregistro y Wellhub

| Archivo                          | Tablas y líneas                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/modules/auth/routes.ts`     | `member_profiles`(3): 506, 728, 741 · `users`(13): 67, 83, 108, 113, **212**, 339, 433, 598, 664, 798, 826, 872, 909 |
| `src/modules/wellhub/service.ts` | `user_status_history`(1): 955 · `users`(5): 896, 905, 914, 940, 970                                                  |

(`auth/routes.ts:212` es el `insert(users)` de WR-01/D-12 — PATTERNS §0.2 lo listaba en `:218`, que es la línea del `branchUpdatedAt` dentro del mismo statement.)

#### Plan 173-16 — crons

| Archivo                            | Tablas y líneas                                                           |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `src/jobs/reassign-multibranch.ts` | `users`(2): 161, **290**                                                  |
| `src/jobs/notification-cron.ts`    | `member_profiles`(6): 178, 187, 255, 448, 475, 529 · `users`(2): 178, 255 |
| `src/jobs/expire-lost-leads.ts`    | `users`(2): 107, 119                                                      |

#### Planes 173-17 / 173-18 / 173-19 / 173-20 — el módulo

| Archivo                          | Accesos | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/members/service.ts` | **94**  | `users`(31): 131, 323, 329, 495, 532×2, 715, 855, 886, 966, 1051, 1114, 1192, 1271, 1280×2, 1328, 1427, 1475, 1608, 1625, 1652, 1668, 1690, 1746, 1751, 1797, 1836, 1933, 2016, 2065 · `subscriptions`(14) · `subscription_plans`(10) · `branches`(9) · `member_profiles`(7): 192, 204, 211, 287, 293, 1903, 1910 · `member_notes`(6): 2065, 2101, 2125, 2135, 2148, 2155 · `bookings`(5) · `user_status_history`(4): 757, 910, 989, 1126 · `user_sepa_details`(3): 619, 1572, 2016 · `attendance`(1): 580 · `completed_sessions`(1): 2186 · `referrals`(1): 784 · `schedules`(1): 580 · `subscription_schedules`(1): 1542 |
| `src/modules/members/routes.ts`  | **23**  | `branches`(9): 133, 545, 881, 914, 1194, 1377, 1539, 1612, 1698 · `users`(9): 638, 881, 1019, 1092, 1194, 1377, 1539, 1612, 1698 · `bookings`(2): 1310, 1320 · `user_status_history`(2): 1025, 1097 · `member_profiles`(1): 576                                                                                                                                                                                                                                                                                                                                                                                            |

`members/service.ts` con **94 accesos es el 26% del trabajo de `src/` en un archivo.** Los planes 173-17/18/19 lo parten en tres; verificar al empezar cada uno que la partición sigue siendo cierta contra estas líneas.

`src/modules/members/leads-routes.ts` **no tiene ningún acceso violador**: sus queries pasan por el service. Los planes 173-17 y 173-20 lo tocan solo por firmas.

### ⚠️ HUECO DE PLANIFICACIÓN — un archivo violador sin plan dueño

**`src/scripts/backfill-historical-payments.ts` — `users`(1): 386.**

Cruzando los 52 archivos violadores contra los `files_modified` de los 17 planes de migración (173-04…173-20), **este es el único que no aparece en ninguno**. Consecuencia si nadie lo toma: el plan 173-30 borra su entrada de la allowlist, el acceso sigue violando, y `unlistedViolations` deja el commit del switch en rojo — o, si se deja la entrada, la tumba el gate `strictWithAllowlist` (D-15).

Costo del fix: **una línea**. El archivo YA está migrado por el piloto (`requireTenant` en `:358`, `tenantWhere` en `:419` y `:438`); solo esta query quedó afuera:

```ts
// src/scripts/backfill-historical-payments.ts:386-389
const existingMembers = await db
  .select({ id: users.id })
  .from(users)
  .where(inArray(users.id, [...memberIds, ...recorderIds])); // ← falta tenantWhere(users, ctx)
```

**Dueño propuesto: plan 173-10** (es el plan de scripts CLI y el archivo es el ejemplar del que 173-10 copia la receta). Alternativa: 173-30 lo arregla como parte del switch, pero eso mete código nuevo en el commit que tiene que ser puramente de configuración.

### Barrido de `tenantId!` / `tenantId ?? 1`

```
grep -rnE "tenantId!|tenantId\s*\?\?" el-templo-api/src el-templo-api/scripts
→ src/modules/shared/country-scope.ts:167:  tenantId = row.tenantId ?? null;
```

**Único hit, y NO es una violación de la convención.** El patrón prohibido es `?? 1` (inventar el gimnasio de El Templo cuando no se sabe). Esto es `?? null`: normaliza `undefined` a `null` para propagar "no se pudo determinar", que es lo contrario. Se deja constancia porque un grep futuro lo va a volver a encontrar. **Cero `tenantId!` en todo el árbol.**

### Búsquedas por NOMBRE / email / DNI sin filtro — la query del piloto, cuatro veces

`src/modules/shared/member-search.ts` es **trampa (b) en estado puro**: `buildMemberNameSearchCondition()` devuelve un fragmento `SQL` sin ninguna referencia al gimnasio, y **9 call sites en 6 archivos** lo consumen. El filtro tiene que vivir en el llamador (o el helper pasa a recibir `ctx` y lo estampa — decisión del plan 173-05).

| Call site                                         | Plan dueño |
| ------------------------------------------------- | ---------- |
| `src/modules/members/service.ts:124`              | 173-19     |
| `src/modules/members/service.ts:449`              | 173-19     |
| `src/modules/members/service.ts:1830`             | 173-19     |
| `src/modules/goal-plans/routes.ts:428`            | 173-09     |
| `src/modules/finance/transaction-service.ts:2069` | 173-04/05  |
| `src/modules/coach/service.ts:67`                 | 173-05     |
| `src/modules/reports/service.ts:923`              | 173-05     |
| `src/modules/reports/service.ts:1472`             | 173-05     |

Y **cuatro búsquedas por identidad, directas, sin filtro, en `members/service.ts`** — ordenadas por daño:

| #   | Sitio                          | Método                       | Qué falta                                             | Qué pasa hoy con 2 gimnasios                                                                                                                                                                                                           |
| --- | ------------------------------ | ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `members/service.ts:1743-1766` | `checkDuplicates`            | `tenantWhere` en WHERE **y** en el `ON` de `branches` | **FUGA DE PII.** `GET /members/check-duplicates?dni=…` devuelve `firstName`, `lastName`, `dni`, `phone`, `branchName` y `status` de un socio de **otro gimnasio**. Es la "Templo Online" del piloto pero devolviendo datos personales. |
| 2   | `members/service.ts:1684-1698` | `checkDniUniqueness`         | `tenantWhere` en el `and(...)`                        | Fuga de nombre y apellido ajenos **+ bug funcional**: un DNI usado en el gimnasio 1 impide dar de alta a esa persona en el gimnasio 2.                                                                                                 |
| 3   | `members/service.ts:1427-1437` | `updateMember` (email clash) | `tenantWhere`                                         | No filtra datos (solo tira `ConflictError`) pero hace el email **globalmente único de hecho**, cuando el schema lo tiene único por gimnasio.                                                                                           |
| 4   | `members/service.ts:1797`      | `updatePhoto`                | `tenantWhere`                                         | `UPDATE users SET photo_url … WHERE id = ?` sin gimnasio: escritura cruzada si el id se filtra por otra vía.                                                                                                                           |

Los cuatro caen en **173-19** (lecturas) salvo el #4, que es **173-18** (escrituras). Los cuatro tienen que tener un caso en la batería ISO-03 del plan 173-29 — `check-duplicates` y `check-dni` son rutas del prefijo y ya están en las 30.

---

## Inventario 2 — `src/`, lente B (runtime, por QUERY)

### Cómo se midió (ver desviación abajo)

El plan pedía `SENTINEL_INVENTORY=1 pnpm test -- --no-file-parallelism`. Correr la suite entera local está prohibido (skill `el-templo-change-control` §10 y el prompt de ejecución) y con ~106 s por archivo son horas. Se midió con un **arnés desechable** (creado, corrido y borrado, nunca commiteado) que hace `buildApp()` + `app.inject()` sobre **18 endpoints del prefijo del módulo** y vuelca `app.dbSentinel.report()`. Es la app real, el pool real y el sentinel real — la única diferencia con la corrida de la suite es la cobertura, y a cambio la señal viene concentrada donde esta fase trabaja.

### El resultado

```
Modo: throw · inventario: sí (sin tope de statements)
Violaciones totales:        31
Statements distintos:       21
```

Por tabla: `users` 26 · `branches` 24 · `subscriptions` 6 · `subscription_plans` 5 · `member_profiles` 4 · `bookings` 3 · `formats` 1 · `user_sepa_details` 1 · `user_branches` 1.

**18 de los 21 statements tocan al menos una de las 8 tablas** (los 3 restantes son `formats` y dos de `branches` puro).

### Los hallazgos que SOLO da esta lente

**(a) La query más frecuente del módulo no está en `members/` — está en `country-scope.ts`, y corre 11 veces por barrido.**

```sql
select `branches`.`country` from `users`
  inner join `branches` on `users`.`branch_id` = `branches`.`id`
  where `users`.`id` = ?
```

Es 1 de las 90 entradas por lente A (`country-scope.ts` / `users`), indistinguible del resto. Por frecuencia real es **la número 1 del módulo**: corre en cada request admin. **Plan 173-04, prioridad máxima** — y es la que hay que usar para la demo del fail-closed en vivo (D del CONTEXT), porque cualquier test del admin la ejercita.

**(b) La dirección "el sentinel ve lo que el lint no": los dos statements de `cleanAllTestData`.**

```
DELETE FROM `users` WHERE NOT (email <=> 'admin@test.com')
UPDATE `users` SET boarding_pass_used = 0 WHERE email = 'admin@test.com'
```

Salen en el inventario del sentinel y **no existen para el lint** (`tenant-lint-allowlist.json` solo cubre `src/`). Son exactamente los dos que `test/helpers.ts:289-293` dejó sin anotar a propósito, con una nota dirigida a esta fase: _"`users` no es strict hoy… cuando llegue ese día, el que lo migre tiene que TOMAR esa decisión, no encontrarla ya tomada"_. **La toma el plan 173-21** (recomendación en el inventario 3).

**(c) El listado de socios es un statement de SEIS tablas.**

```
[subscriptions, subscription_plans, member_profiles, bookings, users, branches]
select `users`.`id`, `users`.`email`, … ( CASE WHEN EXISTS ( SELECT 1 FROM subscriptions s …
```

Un solo `tenantWhere` en cualquiera de las seis apaga el veredicto del sentinel para las otras cinco. Es el caso peor del punto ciego de abajo, en la query central del módulo.

**(d) Confirmación en runtime de las fugas de identidad.** Los tres statements de `checkDniUniqueness` y `checkDuplicates` aparecen en el inventario con su SQL literal, sin `tenant_id`:

```
select `id`, `first_name`, `last_name` from `users` where `users`.`dni` = ? limit ?
select `users`.`id`, `users`.`first_name`, … inner join `branches` … where (`users`.`dni` = ? …
select `users`.`id`, `users`.`first_name`, … where (RIGHT(REGEXP_REPLACE(`users`.`phone` …
```

**(e) `export-sepa` es el único camino que toca `user_sepa_details`** y lo hace joineado a `users`, `branches`, `subscriptions` y `subscription_plans` en un solo statement.

### Diferencias entre las dos lentes, en los dos sentidos

| Dirección                      | Caso medido                                                                                       | Por qué                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El sentinel ve, el lint no** | los 2 statements de `cleanAllTestData` + los 55 sitios de SQL crudo del inventario 3              | el lint solo escanea `src/` y `scripts/`; el sentinel envuelve el pool                                                                                  |
| **El lint ve, el sentinel no** | los 44 accesos "ya compliant" cuyo `tenantWhere` viene de un `const conditions` de otro statement | el lint mira el texto del `enclosingStatement`; el sentinel mira el SQL final. Es el reverso de "el gimnasio se nombra INLINE" (mordió 5× en el piloto) |
| **Ninguna de las dos ve**      | **83 statements multi-tabla** — ver abajo                                                         | las DOS juzgan por statement                                                                                                                            |
| **El sentinel ve de más**      | `select … from formats` en el inventario                                                          | el modo inventario acumula TODAS las violaciones, también las de tablas fuera del módulo                                                                |

---

## ⚠️ El hallazgo que corrige la premisa del plan: las dos lentes comparten el punto ciego

El plan asumía (threat T-173-02-01) que cruzar las dos lentes mitiga el statement multi-tabla, porque _"el sentinel evalúa por query mientras el lint evalúa por tabla"_. **Medido, eso no es cierto.**

- El sentinel: `analyzeSql()` extrae las tablas y después busca el literal `tenant_id` en **la zona de predicado del statement entero**. Si lo encuentra, devuelve `ok` con **todas** las tablas adentro (`src/db/sentinel/analyze.ts:240-247`).
- El lint: `compliant: isCompliantText(statement.getText(sourceFile))` — un `String.includes` sobre el **statement contenedor completo** (`src/db/scripts/lint-tenant.ts:911` + `:551-553`).

**Las dos juzgan por statement.** La "granularidad por tabla" del lint está solo en la **clave de la allowlist** (`file`+`table`), no en el veredicto: un `tenantWhere` sobre una tabla borra las entradas de todas las demás del mismo statement.

### El tamaño del punto ciego, medido

| Métrica                                                                       | Valor  |
| ----------------------------------------------------------------------------- | ------ |
| Statements que tocan ≥1 tabla del módulo                                      | 267    |
| De esos, **multi-tabla** (≥2 tablas gym-owned)                                | **83** |
| Multi-tabla que **hoy ya nombran el gimnasio** → invisibles para las 2 lentes | **19** |
| Multi-tabla que hoy no lo nombran (se vuelven invisibles al migrarlos mal)    | 64     |
| Multi-tabla que mezclan tabla del módulo con tabla de otro módulo             | 78     |

### Los 19 que hay que releer a mano — ninguna lente los va a nombrar nunca

| Sitio                                                   | Tablas del statement                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/members/service.ts:370`                    | `balances` + `branches` + `users`                                                                                         |
| `src/modules/reports/service.ts:1046`                   | `balances` + `branches` + `debt_management` + `financial_transactions` + `subscription_plans` + `subscriptions` + `users` |
| `src/modules/reports/service.ts:1239`                   | `balances` + `branches` + `debt_management` + `subscription_plans` + `subscriptions` + `users`                            |
| `src/modules/reports/service.ts:1288`                   | ídem                                                                                                                      |
| `src/modules/reports/service.ts:1355`                   | `balances` + `branches` + `debt_management` + `subscriptions` + `users`                                                   |
| `src/modules/finance/transaction-service.ts:1388`       | `branches` + `financial_transactions` + `users`                                                                           |
| `src/modules/finance/transaction-service.ts:1416`       | ídem                                                                                                                      |
| `src/modules/finance/transaction-service.ts:1633`       | + `cash_registers`                                                                                                        |
| `src/modules/finance/transaction-service.ts:1670`       | + `cash_registers`                                                                                                        |
| `src/modules/finance/transaction-service.ts:1881`       | + `cash_registers`                                                                                                        |
| `src/modules/finance/transaction-service.ts:1918`       | + `cash_registers` + `cost_centers`                                                                                       |
| `src/modules/finance/transaction-service.ts:2527`       | `branches` + `financial_transactions` + `users`                                                                           |
| `src/modules/finance/balance-service.ts:292`            | `balances` + `users`                                                                                                      |
| `src/modules/analytics/service.ts:1154, 1240, 1462`     | `branches` + `financial_transactions` + `users`                                                                           |
| `src/modules/analytics/advanced-finance-service.ts:221` | ídem                                                                                                                      |
| `src/modules/analytics/ltv-service.ts:324`              | ídem                                                                                                                      |
| `src/modules/coach/service.ts:75`                       | `balances` + `users`                                                                                                      |

**Verificados dos a mano, con resultados opuestos:**

`transaction-service.ts:1388` es el **modelo a copiar** — la 172 lo hizo bien, `tenantWhere` en el `ON` de cada tabla joineada, con el comentario `// TENANCY:` explicando por qué:

```ts
.innerJoin(schema.users, and(tenantWhere(schema.users, ctx), eq(schema.users.id, …)))
.innerJoin(schema.branches, and(tenantWhere(schema.branches, ctx), eq(…)))
```

`members/service.ts:370` es el **contraejemplo, y ya está en el árbol**:

```ts
.from(schema.balances)
.innerJoin(schema.users, eq(schema.users.id, schema.balances.memberId))      // ← sin tenantWhere
.innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))   // ← sin tenantWhere
.where(and(tenantWhere(schema.balances, ctx), …))
```

El lint lo marca `compliant` (por eso `users@371` sale en la lista de "ya cumple" y **no tiene entrada de allowlist**), y el sentinel lo va a marcar `ok`. **Va a atravesar la fase entera sin que nada lo señale.** Hoy no es una fuga —`users.id` es globalmente único, así que el join no puede traer una fila ajena— pero es exactamente la forma que la FK compuesta de D-05 viene a hacer imposible, y el día que alguien invierta el `from` sí lo es.

### Qué hacer con esto (recomendación, no ejecutado en este plan)

1. **Los 19 entran a la checklist de cierre del plan 173-30** como lectura manual obligatoria, con el nombre de quien los leyó. No hay gate automático posible.
2. Los 64 multi-tabla que hoy violan se migran en su plan; la regla de PATTERNS §2.3 (**el filtro va en el `ON`, también en INNER**) deja de ser cosmética: es lo único que hace verificable a ojo que cada tabla tiene el suyo.
3. Vale la pena que el doc 07 gane una trampa `(j)`: _"las dos lentes juzgan por statement; el multi-tabla no lo cubre ninguna"_.

---

## Inventario 3 — `test/`, por los tres canales

`tenant-lint-allowlist.json` **no mira `test/`**, así que acá no hay motor que reusar: se midió con un pase de AST propio (canal 1) y greps (canales 2 y 3).

### Canal 1 — Drizzle (`.from` / `.insert` / `.update` / `.delete` / joins)

| Métrica                     | Valor   |
| --------------------------- | ------- |
| Accesos a las 8 tablas      | **381** |
| **Sin nombrar el gimnasio** | **355** |
| Ya lo nombran               | 26      |
| Archivos                    | **119** |

Por tabla: `users` 314 · `member_profiles` 25 · `audit_log` 21 · `user_status_history` 12 · `user_branches` 5 · `user_sepa_details` 2 · `member_logins` 2.
Por método: `from` 231 · `insert` 76 · `update` 66 · `delete` 6 · `innerJoin` 2.

**El piloto acotó 34 sitios en un plan. Acá son 355 en 119 archivos: ~10×.** Es la medida más importante de este inventario para dimensionar los planes 173-21…173-25.

Los 10 archivos más cargados: `test/members/members.test.ts` 21 · `test/admin-leads-patch.test.ts` 18 · `test/convert-freemium-to-trial.test.ts` 13 · `test/branch-access.test.ts` 10 · `test/tenancy/con-01-uniques-cross-tenant.test.ts` 10 · `test/segmentation/segmentation.test.ts` 9 · `test/members/members-trial.test.ts` 8 · `test/notifications.test.ts` 8 · `test/self-service-trial-e2e.test.ts` 8 · `test/subscriptions/bundle-todos-los-programas.test.ts` 8.

### Canal 2 — SQL crudo

⚠️ **El grep del plan buscaba backticks y se perdía casi todo.** El piloto encontró 15 sitios con ``conn.query("DELETE FROM \`users\`")``; en este árbol solo **3** sitios usan backticks, y el idioma dominante es **sin** backticks: `` sql`DELETE FROM audit_log` ``.

| Métrica                                         | Valor  |
| ----------------------------------------------- | ------ |
| **Sitios de SQL crudo sobre las 8 tablas**      | **55** |
| Archivos                                        | **25** |
| Con backticks (lo que buscaba el grep del plan) | 3      |
| Ya nombran el gimnasio                          | 8      |
| **Ya anotados `tenant-safe`**                   | **0**  |
| `DELETE FROM audit_log` sin filtro ni anotación | **11** |

Los 11 `DELETE FROM audit_log` viven en `test/finance/` (5), `test/subscriptions/` (4), `test/shared/audit-log.test.ts` (1) y `test/finance/coach-load.test.ts` (1, el único con backticks). **Con `audit_log` strict, cada uno tira `TenantSentinelError` en su `beforeEach`.**

Reparto por archivo (los 25):

| Archivo                                             | Sitios | Plan |
| --------------------------------------------------- | ------ | ---- |
| `test/migrations/0109_reconcile_soledad.test.ts`    | 14     | 25   |
| `test/migrations/0100-user-status-backfill.test.ts` | 5      | 25   |
| `test/tenancy/con-01-uniques-cross-tenant.test.ts`  | 3      | 25   |
| `test/subscriptions/lifecycle.test.ts`              | 3      | 23   |
| `test/shared/tenant-scope.test.ts`                  | 3      | 22   |
| `test/referrals/backfill-codes.test.ts`             | 3      | 23   |
| `test/referrals/admin-assign-referrer.test.ts`      | 3      | 23   |
| `test/tenancy/iso-02-fixtures.test.ts`              | 2      | 25   |
| `test/helpers.ts`                                   | 2      | 21   |
| `test/fixtures/second-tenant.ts`                    | 2      | 21   |
| `test/setup.ts`                                     | 1      | 21   |
| `test/tv/tv-pairing-tenant.test.ts`                 | 1      | 25   |
| `test/subscriptions/assign-plan-validation.test.ts` | 1      | 23   |
| `test/shared/audit-log.test.ts`                     | 1      | 22   |
| `test/referrals/code-generation.test.ts`            | 1      | 23   |
| `test/referrals/admin-referrals-endpoint.test.ts`   | 1      | 23   |
| `test/referrals/ab-copy-test.test.ts`               | 1      | 23   |
| `test/notifications.test.ts`                        | 1      | 24   |
| `test/migrations/0190-0191-tenants.test.ts`         | 1      | 25   |
| `test/franchise/franchise-admin.test.ts`            | 1      | 25   |
| `test/finance/validation-state.test.ts`             | 1      | 23   |
| `test/finance/validation-regression.test.ts`        | 1      | 23   |
| `test/finance/validate-caja.test.ts`                | 1      | 23   |
| `test/finance/transaction-service.test.ts`          | 1      | 23   |
| `test/finance/coach-load.test.ts`                   | 1      | 23   |

**Total por plan: 21→5 · 22→4 · 23→18 · 24→1 · 25→27.** El bloque de SQL crudo lo carga el 173-25, no el 173-22.

### Canal 3 — nombre de tabla que NO está en el fuente, resuelto a mano

| Sitio                                                      | Qué tabla ejecuta (resuelto a mano)                                                                                 | Clasificación                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `test/helpers.ts:301` (`getTableName(t)` en el loop)       | las ~70 de `TABLES_TO_CLEAN`, incluidas las 8                                                                       | **ya exento** (`tenant-safe` embebido en el SQL). No tocar.                                               |
| `test/tenancy/iso-02-fixtures.test.ts:158`                 | `TABLAS_DEL_ESPEJO` = `branches`, **`users`**, **`user_branches`**, `activities`, `subscription_plans`, `schedules` | **exención** — leer el `tenant_id` de la fila ES la aserción. Hoy SIN anotar.                             |
| `test/tenancy/iso-02-fixtures.test.ts:172`                 | ídem                                                                                                                | **ya cumple** (`WHERE tenant_id = ?`)                                                                     |
| `test/tenancy/con-03-write-paths-tenant-id.test.ts:313`    | `TablaInspeccionada` = **`users`**, `financial_transactions`, `subscriptions`, `bookings`                           | **ya exento** (anotado por la 172)                                                                        |
| `test/fixtures/finance-gimnasio-dos.ts:244, 271`           | `TablaStrict` (las 6 de finance)                                                                                    | ya exento, fuera de alcance                                                                               |
| `test/backfill-lost-leads.test.ts:140`                     | el `UPDATE` literal de la migración **0183** sobre **`users`**                                                      | **exención** — replay literal de una migración. Hoy SIN anotar; receta: `sql.raw(MOTIVO_EXENCION + stmt)` |
| `test/migrations/0109_reconcile_soledad.test.ts:597`       | replay de 0109 (`users`, `audit_log`)                                                                               | **ya exento** (`MOTIVO_EXENCION`)                                                                         |
| `test/migrations/0192-0195-tenant-columns.test.ts:92`      | replay de 0192-0195                                                                                                 | **ya exento** (`MOTIVO_EXENCION`)                                                                         |
| `test/migrations/0196-tenant-unique-contracts.test.ts:230` | el verificador de únicos: barre `TENANT_GLOBAL_UNIQUES`, que incluye únicos de `users`                              | **exención** — verificador global por diseño. Hoy SIN anotar.                                             |
| `test/migrations/0111-…addon-columns.test.ts:503`          | replay de 0111 (`program_enrollments`)                                                                              | **no se anota** (tabla no strict)                                                                         |
| `test/subscriptions/bookings-reactivation.test.ts:321`     | replay de 0122 (`bookings`)                                                                                         | **no se anota** (tabla no strict)                                                                         |
| `test/tenancy/con-01-…test.ts:919`                         | lista literal, `users` NO está en ella                                                                              | **ya cumple** (`WHERE tenant_id = …`)                                                                     |

**Cuatro sitios de canal 3 necesitan decisión y hoy no la tienen:** `iso-02-fixtures:158`, `backfill-lost-leads:140`, `0196-…:230` y —el más importante— los dos statements sobre `users` de `cleanAllTestData`.

### La decisión que `test/helpers.ts` dejó escrita para esta fase

`test/helpers.ts:289-293`, textual:

> _"Los dos statements sobre `users` de más abajo NO se anotan a propósito — `users` no es strict hoy, y anotar de más apaga el tripwire justo el día que el módulo dueño de `users` se migre. Cuando llegue ese día, el que lo migre tiene que TOMAR esa decisión, no encontrarla ya tomada."_

**Ese día es el plan 173-21. Recomendación: exención, no filtro.** Motivo por la regla del doc 07 §4(d): el borrado es global **a propósito** (`isolate: false` ⇒ misma base por worker; acotarlo a El Templo dejaría vivas las filas del gimnasio 2 entre archivos y rompería vecinos), y el `UPDATE` es un reset del admin canónico, que es una fila sola y única. Motivo sugerido, en el mismo idioma que el `DELETE` del loop de arriba:

```
DELETE /* tenant-safe: limpieza global de la base de test (todos los gimnasios) */ FROM `users` WHERE NOT (email <=> 'admin@test.com')
UPDATE /* tenant-safe: reset del admin canónico de la base de test, fila única y global */ `users` SET boarding_pass_used = 0 WHERE email = 'admin@test.com'
```

### Cobertura de los 4 bloques de endurecimiento — sin solapes, un hueco de 1 archivo

Cruzando los 119 archivos del canal 1 contra los `files_modified` de 173-21…173-25:

| Plan       | Accesos Drizzle | Sitios de SQL crudo |
| ---------- | --------------- | ------------------- |
| **173-21** | 4               | 5                   |
| **173-22** | 120             | 4                   |
| **173-23** | 87              | 18                  |
| **173-24** | 83              | 1                   |
| **173-25** | 86              | 27                  |

**Solapes: 0.** Ningún archivo cae en dos planes.

**Hueco: `test/fixtures/finance-gimnasio-dos.ts` (1 acceso, `.from(schema.users)` en `:294`) no está asignado a ningún plan.** Es infraestructura de fixtures, hermana de `test/fixtures/second-tenant.ts` que sí está en 173-21. **Dueño propuesto: 173-21.**

---

## Inventario 4 — mocks posicionales: CERO, verificado por cuatro formas

El barrido que el plan pedía, más tres formas que el plan no cubría:

| Barrido                                                         | Resultado                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `\.<uno de los 23 métodos> = async` en `test/`                  | **0**                                                         |
| Genérico `\.[a-zA-Z]+ = async` en `test/`                       | **2**, ninguno del módulo (ver abajo)                         |
| `vi.spyOn(...)` sobre los 23 métodos / sobre `member*Service`   | **0** (hay 13 `vi.spyOn` en todo `test/`, ninguno de members) |
| `vi.mock(` del módulo `members` · patching de `MemberService`   | **0**                                                         |
| Mock por literal de objeto (`getMemberById: async …` / `vi.fn`) | **0**                                                         |

Los 2 hits del barrido genérico:

```
test/subscriptions/impute-advance-on-assign.test.ts:375:  failingBalance.applyDelta = async (ctx, tx, row, links, sign) => {
test/subscriptions/charge-on-assign.test.ts:371:      failingBalance.applyDelta = async () => {
```

Los dos son de `finance`, ya migrado por la 172, y el primero **ya tiene el `ctx` primero** — o sea que el modo de falla ya fue pagado ahí y quedó bien.

**Conclusión para el plan 173-17: `test/` nunca mockea el service de socios; siempre entra por HTTP.** El cambio de las 23 firmas no puede romper en silencio por esta vía. Lo que sí lo puede romper es un call site de test sin actualizar, y para eso el gate es `pnpm typecheck:tests` con su `TS2554` en baseline 0 (173-01).

---

## Task 3 — el header del manifiesto

### Lo que el plan pedía vs. lo medido

El plan mandaba escribir **"372 rutas / 224 tenant-scoped / 141 templo-module / 7 global"**. Medido parseando `TENANT_MANIFEST`:

```
entradas: 373
  global          8
  templo-module 141
  tenant-scoped 224
```

**373 = 224 + 141 + 8.** El "7 global" del plan (heredado del 173-01-SUMMARY y de PATTERNS §0.3) sale de forzar la suma a 372. **Los dos números conviven porque una de las 8 `global` es `OPTIONS *`, el preflight de CORS de `@fastify/cors`, que no es una ruta de negocio**: excluyéndola son 372 rutas, incluyéndola 373 entradas. `ENTRADAS_BASELINE` cuenta **entradas**.

Se escribió lo medido, no lo pedido (desviación Rule 1 abajo), y se dejó la aclaración en el archivo para que el próximo que mida no "corrija" un número correcto.

### `iso-01-manifiesto.test.ts` NO estaba stale

Verificado: `ENTRADAS_BASELINE = 373` (`:147`), con el docblock ya actualizado — _"Movido a 373 el 2026-08-04, esta vez por una ruta nueva"_ (`:131`) y el reparto correcto en `:137`. **`e1952606` actualizó el gate y se olvidó de los dos headers de `tenant-manifest.ts` (`:32` y `:166`).** Esta es la asimetría exacta que el plan sospechaba, al revés de como la sospechaba.

### La unidad ganada, contabilizada

Siguiendo la regla del doc 07 §6 (mover un número pelado está prohibido), el header nuevo lleva la tabla de transición:

```
tenant-scoped  223 → 224   (+1, la ruta nueva)
templo-module  141 → 141   (sin cambio)
global           8 →   8   (sin cambio)
─────────────────────────
TOTAL          372 → 373   (+1)
```

Con la explicación de por qué se mueven el total y **una sola** categoría (ruta nueva) frente al caso del 2026-07-29, donde se movieron **dos** categorías y el total no (recategorización).

### Las 30 rutas del prefijo — el `CASOS_BASELINE` del plan 173-29

`/api/admin/members` **24** + `/api/admin/users` **5** + `/api/admin/leads` **1** = **30**. Verificado que **no hay ninguna ruta bajo los 3 prefijos clasificada distinto de `tenant-scoped`** (el gate de cobertura puede derivar por prefijo sin excepciones).

**`/api/admin/members` (24)**

```
GET    /api/admin/members
GET    /api/admin/members/:userId
GET    /api/admin/members/:userId/financial-history
GET    /api/admin/members/:userId/notes
GET    /api/admin/members/:userId/outstanding-concepts
GET    /api/admin/members/:userId/referrals
GET    /api/admin/members/:userId/session-levels
GET    /api/admin/members/branches
GET    /api/admin/members/check-dni
GET    /api/admin/members/check-duplicates
GET    /api/admin/members/export
GET    /api/admin/members/export-sepa
GET    /api/admin/members/search
POST   /api/admin/members
POST   /api/admin/members/:userId/convert-to-trial
POST   /api/admin/members/:userId/notes
POST   /api/admin/members/:userId/photo/upload-url
POST   /api/admin/members/:userId/referrals      ← la que entró con e1952606
POST   /api/admin/members/trial
PUT    /api/admin/members/:userId
PUT    /api/admin/members/:userId/notes/:noteId
PUT    /api/admin/members/:userId/password
DELETE /api/admin/members/:userId
DELETE /api/admin/members/:userId/notes/:noteId
```

**`/api/admin/users` (5)**

```
GET    /api/admin/users
POST   /api/admin/users
POST   /api/admin/users/:userId/program-addons
PUT    /api/admin/users/:userId
PATCH  /api/admin/users/:userId/status
```

**`/api/admin/leads` (1)**

```
PATCH  /api/admin/leads/:userId
```

### Verificación

- `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-01-manifiesto.test.ts` → **11/11 passed**, exit 0 (114 s)
- Parseo de `TENANT_MANIFEST`: `tenant-scoped` = **224** ✓ · prefijos del módulo = **30** ✓
- Los 3 `223` que quedan en el archivo son contabilidad histórica (`:32` el registro del 2026-07-30, `:43` la explicación del stale, `:49` la fila de la tabla de transición). **Ninguno declara el conteo vigente** — la escape clause del criterio de aceptación.
- `pnpm exec tsc --noEmit` exit 0 · `pnpm typecheck:tests` `DISCREPANCIAS: 0` · `pnpm lint:tenant` `DISCREPANCIAS: 0`, allowlist en 450 (esta fase todavía no tocó `src/`)

---

## Deviations from Plan

### **[Rule 1 - Bug] El header que el plan mandaba escribir era incorrecto (372 rutas / 7 global)**

- **Found during:** Task 3
- **Issue:** El plan, PATTERNS §0.3 y el 173-01-SUMMARY declaran "372 rutas / 224 `tenant-scoped` / 141 `templo-module` / **7** `global`". Medido parseando el registro: **373 entradas / 224 / 141 / 8**. El "7" existe solo para que la suma dé 372.
- **Por qué no se podía escribir lo pedido:** el objetivo literal del Task 3 es matar un header stale. Escribir 372/7 habría dejado el archivo contradiciendo a `ENTRADAS_BASELINE = 373`, que es el gate que manda — o sea, un header stale **nuevo**, y encima uno que el siguiente lector "corregiría" en la dirección equivocada.
- **Fix:** se escribió 373/224/141/8, con la aclaración de que una de las 8 `global` es `OPTIONS *` (preflight de CORS, no es ruta de negocio) y que por eso 372 y 373 conviven, más el puntero a `ENTRADAS_BASELINE` como fuente de verdad.
- **Files:** `el-templo-api/test/tenant-manifest.ts`
- **Commit:** `4d552b7d`

### **[Rule 3 - Blocking] La lente B no se pudo medir como pedía el plan**

- **Found during:** Task 1
- **Issue:** El plan pedía `SENTINEL_INVENTORY=1 pnpm test -- --no-file-parallelism`. Correr suites amplias local está prohibido por el skill `el-templo-change-control` §10 y por el prompt de ejecución. Costo medido de un archivo solo: **~106 s**; con ~140 archivos, horas de máquina bloqueada.
- **Alternativas descartadas:** (a) no medir lente B — dejaba el `must_have` D-01 sin cumplir y el switch del 173-30 apoyado en una sola lente; (b) el snapshot de 173-03 — habla HTTP contra un server externo, el sentinel vive en el proceso del server y el script no ve su `report()`.
- **Fix:** arnés desechable (`test/zz-inventario-lente-b.test.ts`, creado → corrido → **borrado**, nunca commiteado): `createTestApp()` + `app.inject()` sobre 18 endpoints del prefijo del módulo + `app.dbSentinel.report()`. App real, pool real, sentinel real. Resultado: **31 violaciones / 21 statements distintos**, con los 5 hallazgos del Inventario 2 — incluidos los dos que la lente A no puede ver por construcción (los statements de `cleanAllTestData`).
- **Limitación declarada:** cubre el prefijo del módulo, no los 140 archivos de test. **No sustituye** al inventario completo de la suite. Si algún plan necesita la lista total de queries violadoras del sistema, el lugar donde sale gratis es **CI**, no local.
- **Files:** ninguno versionado.

### **[Rule 2 - Missing] El barrido de mocks del plan cubría una sola forma de mock**

- **Found during:** Task 2
- **Issue:** El plan especificaba `grep -rn "\.<metodo> = async" test/`. Esa forma es una de al menos cuatro: `vi.spyOn().mockImplementation()`, `vi.mock()` del módulo, y el mock por literal de objeto rompen igual de silenciosamente y el grep no las ve. Con 23 firmas cambiando, un falso negativo acá deja tests verdes probando nada — que es justo la amenaza T-173-02-03.
- **Fix:** se corrieron las cuatro formas. Resultado en las cuatro: **0**. El inventario 4 documenta los barridos para que el resultado sea auditable y no una afirmación.
- **Files:** ninguno.

### **[Nota, no desviación] El grep de SQL crudo del plan buscaba el idioma equivocado**

El plan (y PATTERNS §7.2) describen el canal 2 como _"SQL crudo con backticks"_, con los 15 sitios del piloto como referencia. En este árbol solo **3** de los **55** sitios usan backticks. El idioma dominante es `` sql`DELETE FROM audit_log` ``, sin backticks — invisible para el grep prescrito. Se barrió con y sin backticks. No es una desviación del plan (el plan pedía inventariar el canal, no usar un grep concreto), pero **la próxima adopción tiene que barrer las dos formas** o va a subestimar el canal 2 en un 94%.

---

## Para los planes siguientes de la fase

1. **90 es el diff de la allowlist; 364 es el trabajo de `src/` y 410 el de `test/`.** No planificar contra el 90.
2. **`src/scripts/backfill-historical-payments.ts:386` no tiene plan dueño** y deja el 173-30 en rojo. Fix de una línea. Dueño propuesto: **173-10**.
3. **`test/fixtures/finance-gimnasio-dos.ts` no tiene plan dueño** en el bloque de endurecimiento. Dueño propuesto: **173-21**.
4. **Los 19 statements multi-tabla ya `compliant` son invisibles para las dos lentes.** Lectura manual obligatoria en la checklist del 173-30. Empezar por `members/service.ts:370`, que ya está mal.
5. **La query más frecuente del módulo es la de `country-scope.ts` (11 de 31 violaciones en un solo barrido).** Es la mejor candidata para la demo del fail-closed en vivo: una sola tabla strict en el statement (`users`, con `branches` joineada) y la ejercita cualquier test del admin.
6. **`checkDuplicates` (`members/service.ts:1743`) es una fuga de PII cross-tenant, no una omisión formal.** Caso propio en la batería del 173-29, y el `tenantWhere` de `branches` va en el `ON`.
7. **`test/helpers.ts:289-293` dejó una decisión escrita a nombre de esta fase.** La toma el 173-21: recomendación **exención** con el motivo textual propuesto arriba.
8. **`audit_log` strict rompe 11 `beforeEach`** repartidos entre 173-23 (10) y 173-22 (1). Es el impacto más concentrado del bloque de tests.
9. **Los 4 sitios de canal 3 sin decisión**: `iso-02-fixtures:158`, `backfill-lost-leads:140`, `0196-tenant-unique-contracts:230` y los 2 de `cleanAllTestData`.
10. **`subscriptions/service.ts` tiene 3 planes dueños** (173-04, 173-05, 173-14) y 19 accesos. Es el mayor riesgo de pisada de la fase; correr `git log --oneline -- el-templo-api/src/modules/subscriptions/service.ts` antes de cada uno.

## Known Stubs

Ninguno. Este plan no escribe código de producto: 2 de sus 3 tareas son inventario y la tercera es un comentario.

## Threat Flags

Ninguno nuevo introducido por este plan. **Pero el inventario DESCUBRIÓ superficie preexistente** que no estaba en el `<threat_model>` y que los planes dueños tienen que tratar como mitigación, no como refactor:

| Flag                                | Archivo                               | Descripción                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: information-disclosure | `src/modules/members/service.ts:1743` | `checkDuplicates` devuelve nombre, apellido, DNI, teléfono y sede de socios de **otros gimnasios** ante un match de DNI o teléfono. Ruta expuesta: `GET /api/admin/members/check-duplicates`. |
| threat_flag: information-disclosure | `src/modules/members/service.ts:1684` | `checkDniUniqueness` devuelve nombre y apellido de un socio de otro gimnasio, y además bloquea el alta legítima en el gimnasio nuevo.                                                         |
| threat_flag: tampering              | `src/modules/members/service.ts:1797` | `updatePhoto` hace `UPDATE users … WHERE id = ?` sin gimnasio.                                                                                                                                |
| threat_flag: detection-gap          | 19 statements (tabla arriba)          | statements multi-tabla que las DOS capas de detección marcan `ok`. No hay gate automático posible: es lectura manual.                                                                         |

## Self-Check: PASSED

- `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/173-02-SUMMARY.md` — FOUND
- `el-templo-api/test/tenant-manifest.ts` (modificado, 373/224/141/8) — FOUND
- Commit `4d552b7d` — FOUND en `feat/173-adopcion-members`
- `test/zz-inventario-lente-b.test.ts` (arnés desechable) — **AUSENTE**, como corresponde: `git status --short` en el worktree devuelve vacío después del commit
- `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts` — 11/11 passed
- `pnpm lint:tenant` — `DISCREPANCIAS: 0`, allowlist 450
