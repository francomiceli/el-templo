---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 03
subsystem: backend
tags:
  [
    multi-tenancy,
    crons,
    sweep-por-tenant,
    extraccion-de-funcion-pura,
    notificaciones,
    tenant-safe,
    logging-estructurado,
  ]

# Dependency graph
requires:
  - plan: 169-01
    provides: "forEachActiveTenant + TenantContext en src/modules/shared/tenant.ts"
  - plan: 169-02
    provides: "El patrón de adopción (cuerpo `…ForTenant` privado + `runX` público que acumula por closure conservando su tipo de retorno) y el precedente del anidamiento tenant × timezone de mark-no-shows"
provides:
  - "Los 3 crons restantes de D-01 barriendo por tenant ACTIVO: auto-approve, auto-resume-pauses y los 4 schedules de notification-cron — con esto los 7 jobs de D-01 están cubiertos"
  - "Funciones puras exportadas donde no había ninguna: runAutoApprove(db), runAutoResumePauses(db), runNotificationQueueTick(db) y runBatchSegmentRecalculation(db) — los 4 caminos eran intesteables porque su lógica vivía dentro del cron.schedule"
  - "La primera anotación de exención sembrada por la fase: `/* tenant-safe: seed de templates global hasta la adopción de notifications (fase 175) */` en la llamada a seedTemplates()"
affects:
  - "169-04 (el gate de cobertura de los 7 jobs y el test del criterio 3 ya pueden ejercitar estos 4 caminos: antes no existía función pura que invocar)"
  - "170 (el sentinel de pool lee las anotaciones `/* tenant-safe: … */`; esta es la primera que la fase deja escrita)"
  - "175 (adopción de notifications: cuando NotificationService reciba el ctx, seedTemplates entra al sweep y la anotación se retira)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El sweep va DENTRO de la función `runX` extraída, nunca en el callback del `cron.schedule`: los 4 schedules quedan reducidos a llamada + catch y el sweep se prueba llamando a la función pura"
    - "`jobName` distinto por camino en un archivo con varios schedules (`notification-queue`, `notification-segments`, `notification-morning-energy`, `notification-weekly-summary`) para que el log diga CUÁL falló"
    - "El try/catch externo que envolvía el cuerpo dentro del cron.schedule se ELIMINA al extraer: ese rol pasa al catch por iteración de forEachActiveTenant, que además atribuye el error a un tenant"
    - "Los services se construyen dentro del cuerpo por tenant (no en la función de scheduling) para que cada vuelta arranque limpia y para que la adopción 172-175 sea un cambio local"
    - "Doble nivel de contención declarado por escrito cuando el cuerpo ya traga sus errores (auto-resume-pauses): el catch del sweep casi nunca se dispara y eso es correcto"

key-files:
  created: []
  modified:
    - el-templo-api/src/jobs/auto-approve.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts
    - el-templo-api/src/jobs/notification-cron.ts

key-decisions:
  - "Los schedules 1 y 2 de notification-cron NO loguean un total agregado: sus contadores ya se loguean por gimnasio dentro del cuerpo, y repetirlos arriba sería la misma línea sin atribución de tenant (mismo criterio que el summary de wellhub-sync, deviation 1 del 169-02). Es además el comportamiento previo exacto: esos dos schedules nunca tuvieron un log agregado"
  - "El try/catch externo del cuerpo del schedule 2 no se replicó dentro de runBatchSegmentRecalculationForTenant: lo reemplaza el catch por iteración del sweep, que loguea con tenantId y sigue con el gimnasio siguiente (D-03). Los try/catch por perfil y por bloque de renovación quedaron intactos"
  - "runAutoApprove y runAutoResumePauses conservan el mensaje y la forma de los logs agregados del scheduler original, para que el diff operativo sea nulo con un solo tenant"
  - "seedTemplates queda fuera del sweep con anotación grepeable Y un comentario de 9 líneas que explica el riesgo concreto (N inserts globales duplicando las filas del tenant 1) y la fase que lo cierra"

metrics:
  duration: "~22min"
  completed: 2026-07-28
---

# Phase 169 Plan 03: Crons B — extracción de `runX` y sweep en los 3 jobs asimétricos Summary

Los 3 crons que no tenían función pura exportada ahora la tienen y barren por gimnasio activo: `auto-approve`, `auto-resume-pauses` y los 4 schedules de `notification-cron`. Con estos, los **7 jobs de D-01 están completos** — y la única excepción del archivo (`seedTemplates`) quedó exenta con anotación grepeable y motivo escrito.

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Files:** 3 modificados (todos en `src/jobs/`)
- **Tests:** 6 verdes (`test/notification-plan-renewal.test.ts`, 96,4 s), archivo de test **sin tocar**

## Tasks Completed

| Task | Nombre                                                      | Commit     | Archivos                                                     |
| ---- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| 1    | Extracción + sweep en `auto-approve` y `auto-resume-pauses` | `dbb89644` | `src/jobs/auto-approve.ts`, `src/jobs/auto-resume-pauses.ts` |
| 2    | Sweep en los 4 schedules de `notification-cron` + exención  | `f3036876` | `src/jobs/notification-cron.ts`                              |

## Forma final de los 3 jobs

| Job / camino                            | Cuerpo por tenant (privado)              | Público (NUEVO — antes no existía)                             | `jobName` del sweep           |
| --------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- | ----------------------------- |
| `auto-approve`                          | `runAutoApproveForTenant(db, ctx)`       | `runAutoApprove(db)` → `{ approved }`                          | `auto-approve`                |
| `auto-resume-pauses`                    | `runAutoResumePausesForTenant(db, ctx)`  | `runAutoResumePauses(db)` → `{ resumed, activated, expired }`  | `auto-resume-pauses`          |
| `notification-cron` #1 (cola, `*/15`)   | `runNotificationQueueTickForTenant`      | `runNotificationQueueTick(db)` → `{ sent, failed, purged }`    | `notification-queue`          |
| `notification-cron` #2 (segmentos, 03h) | `runBatchSegmentRecalculationForTenant`  | `runBatchSegmentRecalculation(db)` → `{ transitionsFound, … }` | `notification-segments`       |
| `notification-cron` #3 (energía, 08h)   | `runMorningEnergyForTenantTz(db,ctx,tz)` | `runMorningEnergyForTz(db, tz)` (firma y retorno intactos)     | `notification-morning-energy` |
| `notification-cron` #4 (semanal, sáb)   | `runWeeklySummaryForTenantTz(db,ctx,tz)` | `runWeeklySummaryForTz(db, tz)` (firma y retorno intactos)     | `notification-weekly-summary` |

Los 3 archivos llevan el bloque de comentario obligatorio citando **D-01** (barrido por gimnasio activo, lista resuelta en cada corrida y no en el boot), **D-02** (el `ctx` NO baja a los services; sus firmas cambian en 172-175) y la **advertencia de vencimiento** (mientras el cuerpo siga siendo global, N tenants activos repetirían el barrido N veces — en `notification-cron` eso significa **mandar los mismos pushes N veces**, por eso el gate del milestone es que el tenant 2 no se onboardea hasta ISO-03 verde, fase 171).

### `auto-resume-pauses` — el doble nivel de contención, escrito para que nadie lo "arregle"

Los 3 `try/catch` originales quedaron **intactos** (que un barrido falle no puede impedir los otros dos; el que rompió devuelve 0). Como ya tragan sus propios errores, el `catch` por iteración de `forEachActiveTenant` casi nunca se va a disparar en este job: solo lo haría si fallara algo fuera de los tres bloques (la construcción de un service, por ejemplo). Está declarado por escrito en el docblock del archivo, con esa justificación, para que una "simplificación" futura no borre uno de los dos niveles.

Los 6 services (`AuraService`, `BalanceService`, `CashRegisterService`, `TransactionService`, `EnrollmentService`, `SubscriptionService`) se movieron de `startAutoResumePausesJob` al cuerpo por tenant. Mismo criterio en `auto-approve` con `AdminSessionService`.

### `notification-cron` — una sola forma del sweep, no cuatro copias

El envoltorio vive **dentro** de cada `runX`, nunca en el callback del `cron.schedule`. Consecuencias verificadas:

- Siguen existiendo **exactamente 4** `cron.schedule` y ninguno contiene lógica de negocio (llamada a la función pura + `catch (err: unknown)` + `log.error`).
- `runPlanRenewalWarnings` **no** recibió sweep propio: se la llama desde el cuerpo por tenant de `runBatchSegmentRecalculation`, así que ya corre una vez por gimnasio. Un comentario en su call site explica que agregarle uno anidaría dos barridos y la haría correr N². Su firma `(db, notificationService)` quedó intacta — es la que consume el test existente.
- Los dos caminos con timezone llevan el tenant **por fuera** de la dimensión de tz, mismo criterio que `mark-no-shows` en el 169-02.

### La exención: `seedTemplates()`

```ts
/* tenant-safe: seed de templates global hasta la adopción de notifications (fase 175) */
seedService.seedTemplates().catch(…)
```

Con un comentario arriba que explica el riesgo concreto: `notification_templates` es gym-owned (CON-01) y su unique ya es compuesta `(tenant_id, template_key)` desde la 168, **pero el service sigue insertando global** y estampa el DEFAULT 1. Envolverlo en el sweep no sembraría los templates de cada gimnasio — correría el MISMO insert global una vez por gimnasio activo, **duplicando las filas del tenant 1**. Sale del sweep hasta que el service reciba el `TenantContext` (fase 175).

## Deviations from Plan

**1. [Rule 3 — Blocking] Los schedules 1 y 2 de `notification-cron` no loguean un total agregado**

- **Encontrado en:** Task 2.
- **Problema:** el plan pide que los 4 `cron.schedule` queden reducidos a "llamar a su función pura, **loguear el resultado** y `catch`". Para los schedules 1 y 2 eso agregaría un log que **nunca existió**: en el código original esos dos no tenían log agregado a nivel scheduler — sus contadores se logueaban adentro del cuerpo (`"Notification queue processed"`, `"Batch segment recalculation complete"`), y ese cuerpo ahora corre POR GIMNASIO. Duplicar la línea arriba repetiría los mismos números sin atribución de tenant.
- **Fix:** los schedules 1 y 2 quedan con llamada + `catch`, y un comentario en el archivo explica por qué (mismo criterio que el summary de `wellhub-sync`, deviation 1 del plan 169-02). Los schedules 3 y 4 **sí** conservan su log agregado por timezone, porque ya lo tenían.
- **Commit:** `f3036876`.

**2. [Rule 3 — Blocking] El `try/catch` externo del cuerpo del schedule 2 no se replicó en la función extraída**

- **Encontrado en:** Task 2.
- **Problema:** el cuerpo del schedule 2 estaba envuelto en un `try/catch` que logueaba `"Batch segment recalculation cron failed"`. Replicarlo dentro de `runBatchSegmentRecalculationForTenant` haría que el `catch` por iteración de `forEachActiveTenant` **nunca** se dispare para este job, anulando la atribución del error a un gimnasio (D-03) y el conteo `failed` del `TenantSweepResult`.
- **Fix:** el `try/catch` externo se movió al scheduler (donde envuelve al sweep completo, conservando el mismo mensaje de log) y el cuerpo por tenant queda sin él: los errores de un gimnasio los atrapa y atribuye el sweep. Los `try/catch` **por perfil** y los de los dos bloques de renovación quedaron intactos. El motivo está escrito en el docblock de la función.
- **Commit:** `f3036876`.

**Sin desviaciones de alcance:** ninguna firma de service cambió (D-02), cero dependencias nuevas, ningún archivo de test editado, ninguna migración, y `src/index.ts` no aparece en el diff (los tres `startXJob(db)` conservan su firma).

## Verificación

| Verificación                                                                      | Resultado                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npx tsc --noEmit`                                                                | **exit 0** (después de cada task)                              |
| `npx vitest run test/notification-plan-renewal.test.ts --no-file-parallelism`     | **6 passed** (96,4 s / 102,2 s total), archivo **sin tocar**   |
| `export async function runAutoApprove` / `runAutoResumePauses`                    | presentes                                                      |
| `export async function runNotificationQueueTick` / `runBatchSegmentRecalculation` | presentes                                                      |
| `forEachActiveTenant` fuera de comentarios en `notification-cron.ts`              | **5** (import + 4 llamadas, una por camino), ≥ 4 exigido       |
| `cron.schedule` fuera de comentarios                                              | **1** en `auto-approve`, **4** en `notification-cron` (exacto) |
| `catch` fuera de comentarios en `auto-resume-pauses.ts`                           | **4** (3 internos + el del scheduler), ≥ 3 exigido             |
| `tenant-safe: seed de templates` grepeable                                        | **1** ocurrencia, con motivo escrito                           |
| Cero `any` explícito / cero `console.*` en los 3 archivos                         | OK                                                             |
| `git diff --stat` — `src/index.ts` ausente                                        | OK (solo los 3 archivos de `src/jobs/`)                        |
| `git diff --diff-filter=D` post-commit                                            | sin borrados                                                   |

**Evidencia de la corrida del test** (los 6 casos de `runPlanRenewalWarnings` pasan con la función llamada ahora desde el cuerpo por tenant, sin haber cambiado su firma):

```
✓ queues plan_renewal_warning_7d for a member covered until today+7
✓ queues plan_renewal_warning_3d for a member covered until today+3
✓ queues plan_renewal_warning_expired for a member covered until today
✓ suppresses the push when a scheduled successor extends coverage (D-05)
✓ suppresses the push when the member silenced the Planes category
✓ does not queue anything for a member outside all bands (today+5)
```

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-169-12 | Los 4 caminos de notificaciones salen de `listActiveTenants` (comparación positiva contra `'active'`, 169-01): un gimnasio suspendido no entra al sweep y no recibe pushes.                                |
| T-169-13 | `seedTemplates` deliberadamente fuera del sweep, con anotación grepeable + motivo + comentario que nombra el riesgo (N inserts globales) y la fase que lo cierra (175).                                    |
| T-169-14 | `forEachActiveTenant` contiene por iteración; además los `try/catch` por perfil de `runBatchSegmentRecalculation` y los 3 de `auto-resume-pauses` siguen intactos.                                         |
| T-169-15 | Las 4 expresiones cron (`*/15 * * * *`, `0 3 * * *`, `0 8 * * *`, `0 15 * * 6`) y sus timezones se conservan literales, igual que `59 23 * * *` y `5 0 * * *`; el conteo se verificó y el test pasó.       |
| T-169-16 | **accept** — con un solo tenant activo el resultado es idéntico. Anotado como advertencia de vencimiento en los 3 archivos (en `notification-cron`, explicitando que N tenants = N pushes repetidos).      |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit. Prettier se resolvió del `node_modules` symlinkeado. |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 6 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de`, `bb85aa64` — plan 169-02
- `dbb89644` — `feat(169-03): extraer runAutoApprove/runAutoResumePauses y barrer por tenant`
- `f3036876` — `feat(169-03): sweep por tenant en los 4 schedules de notification-cron`

Nada pusheado (staging-first: el rollout es del plan 169-09). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-04 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-04]` y **no se marcó completo**. Con este plan los 7 crons de D-01 están cubiertos, pero CON-04 abarca todos los caminos sin request: falta el webhook de Wellhub (169-05), `tv_pairings` (169-06), los scripts CLI (169-07) y el gate de cobertura que lo prueba (169-04). Marcarlo ahora sería un falso positivo que el verificador de fase tendría que revertir. Lo cierra el último plan de la fase, igual que decidieron el 169-01 y el 169-02.

## Self-Check: PASSED

- Archivos modificados presentes en el worktree: los 3 de `src/jobs/`.
- Commits presentes en `git log --all`: `dbb89644`, `f3036876`.
- `git status` del worktree: limpio (symlink de `node_modules` borrado).
