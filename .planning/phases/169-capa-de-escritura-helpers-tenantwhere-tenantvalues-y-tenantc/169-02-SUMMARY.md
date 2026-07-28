---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 02
subsystem: backend
tags:
  [
    multi-tenancy,
    crons,
    sweep-por-tenant,
    aislamiento-de-errores,
    logging-estructurado,
    pino,
  ]

# Dependency graph
requires:
  - plan: 169-01
    provides: "forEachActiveTenant + TenantContext + TenantLogger en src/modules/shared/tenant.ts (y la verificación por typecheck de que pino() satisface TenantLogger sin adaptador)"
provides:
  - "4 de los 7 crons barriendo por tenant ACTIVO: expire-lost-leads, wellhub-sync, mark-no-shows y reassign-multibranch"
  - "El patrón de adopción para el plan 169-03 (los 3 crons restantes): cuerpo `…ForTenant` privado + `runX` público que acumula por closure y conserva su tipo de retorno"
  - "Precedente del anidamiento tenant × timezone (mark-no-shows): el tenant va POR FUERA, con el motivo escrito en el archivo"
affects:
  - "169-03 (auto-approve, auto-resume-pauses y notification-cron copian este patrón; los dos primeros necesitan la extracción del runX que estos 4 ya tenían)"
  - "169-04 (el test de cobertura CON-04 de los 7 jobs se apoya en los nombres `…ForTenant…` grepeables que deja este plan)"
  - "173 (cuando `branches` se scopee, la dimensión de timezone de mark-no-shows pasa a depender del tenant: el anidamiento elegido hace que ese cambio sea local)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cuerpo por tenant PRIVADO (`…ForTenant`) + acumulador PÚBLICO con el tipo de retorno intacto: el sweep no aparece en la superficie pública del job, así que los tests existentes no cambian de expectativa"
    - "Acumulación por closure sobre el callback `(ctx) => Promise<void>` de forEachActiveTenant, igual que runMarkNoShows acumula sobre el loop de timezones"
    - "En un job con dos dimensiones, el sweep se pone en la función que USA EL SCHEDULER (runMarkNoShowsForTz), no en el acumulador de tests: una sola implementación cubre los dos caminos"
    - "Log de una línea por vuelta A LA ENTRADA del cuerpo cuando el cuerpo tiene early return (evita duplicar el statement de log en cada salida)"
    - "El guard barato (config de Wellhub) va antes del sweep y su función se coloca PRIMERA en el archivo, para que el orden de lectura refleje el orden de ejecución"

key-files:
  created: []
  modified:
    - el-templo-api/src/jobs/expire-lost-leads.ts
    - el-templo-api/src/jobs/wellhub-sync.ts
    - el-templo-api/src/jobs/mark-no-shows.ts
    - el-templo-api/src/jobs/reassign-multibranch.ts

key-decisions:
  - "El log del summary de wellhub-sync se MOVIÓ del scheduler al cuerpo por tenant: el tipo de retorno público está lockeado (`WellhubSyncSummary | null`) y no lleva el tenantId hasta startWellhubSyncJob, así que loguearlo arriba atribuiría el summary del último gimnasio a todos"
  - "runWellhubSync se declaró ANTES de runWellhubSyncForTenant en el archivo para que el `return null` del guard de config preceda en TEXTO a la primera LLAMADA a forEachActiveTenant (el import y el docblock siguen arriba, inevitablemente)"
  - "El log por vuelta va a la entrada del cuerpo en mark-no-shows y reassign-multibranch (los dos tienen early return) y a la salida en expire-lost-leads (que no lo tiene): un solo statement de log por archivo, sin duplicación"
  - "El ctx se USA en el cuerpo (en el log) en los 4 jobs, en vez de quedar como parámetro muerto: hace visible que el contexto llegó hasta el cuerpo (D-02) y evita un `void ctx` decorativo"

metrics:
  duration: "~14min"
  completed: 2026-07-28
---

# Phase 169 Plan 02: Sweep por tenant en los 4 crons con `runX`/`startXJob` Summary

Los 4 crons que ya tenían la separación `runX(db)` / `startXJob(db)` corren su barrido dentro de `forEachActiveTenant`, con el `tenantId` como campo estructurado en cada vuelta y aislamiento de errores por gimnasio — sin cambiar una sola firma pública ni una sola expectativa de los tests existentes.

## Performance

- **Duration:** ~14 min
- **Tasks:** 2
- **Files:** 4 modificados (todos en `src/jobs/`)
- **Tests:** 22 verdes en 3 archivos (7 + 10 + 5), ninguno editado

## Tasks Completed

| Task | Nombre                                            | Commit     | Archivos                                                        |
| ---- | ------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| 1    | Sweep en `expire-lost-leads` y `wellhub-sync`     | `0426d4de` | `src/jobs/expire-lost-leads.ts`, `src/jobs/wellhub-sync.ts`     |
| 2    | Sweep en `mark-no-shows` y `reassign-multibranch` | `bb85aa64` | `src/jobs/mark-no-shows.ts`, `src/jobs/reassign-multibranch.ts` |

## Forma final de los 4 jobs

| Job                    | Cuerpo por tenant (privado)                      | Público (sin cambios de firma ni de tipo)                      | Acumulación                                           |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------- |
| `expire-lost-leads`    | `runExpireLostLeadsForTenant(db, ctx)`           | `runExpireLostLeads(db)` → `{ expired, skippedManual }`        | dos contadores por closure                            |
| `wellhub-sync`         | `runWellhubSyncForTenant(db, ctx, config)`       | `runWellhubSync(db)` → `WellhubSyncSummary \| null`            | último summary en un holder `{ last }`                |
| `mark-no-shows`        | `runMarkNoShowsForTenantTz(db, ctx, tz)`         | `runMarkNoShowsForTz(db, tz)` (privada) y `runMarkNoShows(db)` | `{ updated, decremented }` por closure                |
| `reassign-multibranch` | `runReassignMultibranchForTenant(db, ctx, opts)` | `runReassignMultibranch(db, opts)` → `ReassignResult`          | `candidates` sumado; `changes`/`skipped` concatenados |

Los 4 llevan el bloque de comentario obligatorio citando **D-01** (barrido por gimnasio activo, lista resuelta en cada corrida), **D-02** (el ctx NO baja a los services; sus firmas cambian en 172-175) y la **advertencia de vencimiento** (mientras el cuerpo siga siendo global, N tenants activos repetirían el mismo barrido N veces → el gate del milestone es que el tenant 2 no se onboardea hasta ISO-03 verde, fase 171).

### `mark-no-shows` — por qué el tenant va por fuera del timezone

El sweep se puso en `runMarkNoShowsForTz(db, tz)` y **no** en `runMarkNoShows(db)`, por dos motivos escritos en el archivo:

1. **Cobertura del camino real:** `startMarkNoShowsJob` programa un `cron.schedule` por timezone y llama derecho a `runMarkNoShowsForTz`. En producción `runMarkNoShows` no se ejecuta nunca (es el entrypoint de tests e invocación manual). Envolviendo en `…ForTz` los dos caminos quedan cubiertos con **una sola** implementación del sweep.
2. **Anidamiento correcto para lo que viene:** la lista de timezones sale de `branches`, hoy una consulta global. Cuando `branches` se scopee (fase 173), la dimensión de tz pasa a depender del gimnasio; con el tenant por fuera ese cambio es local (mover el descubrimiento de tz adentro del loop) y no da vuelta el archivo.

### `wellhub-sync` — el guard antes del sweep (T-169-11)

`const config = getWellhubConfig(); if (!config) return null;` sigue siendo lo primero: un despliegue sin Wellhub configurado es un no-op absoluto y **no consulta la tabla `tenants`**. Para que el orden de lectura refleje el de ejecución, `runWellhubSync` se declaró **antes** que `runWellhubSyncForTenant` en el archivo (las funciones se hoistean). Nota para el verificador: en el texto del archivo, `forEachActiveTenant` aparece antes del `return null` **solo** en el `import` (línea 30) y en una línea de docblock (línea 47) — la primera **llamada** (línea 74) está después del guard (línea 68), que es lo que el criterio protege. Un import no puede ir después del código.

## Deviations from Plan

**1. [Rule 3 — Blocking] El `tenantId` del summary de Wellhub no puede loguearse en `startWellhubSyncJob`**

- **Encontrado en:** Task 1.
- **Problema:** el plan pide "agregar `tenantId` al `log.info` del summary en `startWellhubSyncJob` solo si el summary existe". Imposible: el tipo de retorno público de `runWellhubSync` está lockeado en `WellhubSyncSummary | null` y no transporta el `tenantId` hasta el scheduler. Además, con más de un gimnasio activo el summary devuelto es el del ÚLTIMO, así que loguearlo arriba se lo atribuiría a todos.
- **Fix:** el `log.info` del summary se movió al cuerpo por tenant — `log.info({ tenantId: ctx.tenantId, ...summary }, "Sincronización Wellhub completada para un gimnasio")` — y el del scheduler se eliminó para no duplicar la línea. El motivo quedó escrito en los dos lugares. El `catch` + `log.error` del scheduler no se tocó.
- **Commit:** `0426d4de`.

**2. [Rule 2 — Funcionalidad crítica ausente] `expire-lost-leads` no tenía ningún `log.info` en el cuerpo para "sumarle" el `tenantId`**

- **Encontrado en:** Task 1.
- **Problema:** el plan dice "el `log.info` existente suma `tenantId: ctx.tenantId`", pero el cuerpo de `runExpireLostLeads` no logueaba nada (el único `log.info` vivía en el scheduler, con los totales). Sin un log en el cuerpo, el must-have "cada job loguea el tenantId como campo estructurado en cada vuelta" no se cumplía.
- **Fix:** se agregó `log.info({ tenantId, windowDays, expired, skippedManual }, "Barrido de leads perdidos completado para un gimnasio")` al final del cuerpo. El log agregado del scheduler se conservó intacto.
- **Commit:** `0426d4de`.

**3. [Rule 3 — Blocking] Log a la ENTRADA del cuerpo en los dos jobs con early return**

- **Encontrado en:** Task 2.
- **Problema:** `runMarkNoShowsForTenantTz` (`toMark.length === 0`) y `runReassignMultibranchForTenant` (`candidateIds.length === 0`) tienen un early return. Loguear el resultado a la salida obligaba a **duplicar el statement de log** en las dos salidas de cada función (CLAUDE.md: DRY agresivo).
- **Fix:** en esos dos el log de una línea por vuelta va a la ENTRADA (`{ tenantId, tz }` / `{ tenantId, dryRun }`); el resultado agregado lo sigue logueando el scheduler, como hoy. En `expire-lost-leads`, que no tiene early return, el log va a la salida y lleva los contadores. El motivo quedó escrito en cada archivo.
- **Commit:** `bb85aa64`.

**Sin desviaciones de alcance:** no se tocó ninguna firma de service (D-02), no se agregó ninguna dependencia, no se editó ningún archivo de test y no hay migraciones.

## Verificación

| Verificación                                                                     | Resultado                                                       |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `npx tsc --noEmit`                                                               | **exit 0** (después de cada task)                               |
| `npx vitest run test/expire-lost-leads.test.ts --no-file-parallelism`            | **7 passed** (100 s), archivo de test sin tocar                 |
| `npx vitest run test/jobs/reassign-multibranch.test.ts --no-file-parallelism`    | **10 passed** (99 s), archivo de test sin tocar                 |
| `npx vitest run test/attendance/especial-consumption.test.ts` (extra, no pedida) | **5 passed** (108 s) — es el test que ejercita `runMarkNoShows` |
| `forEachActiveTenant` fuera de comentarios en los 4 archivos                     | OK                                                              |
| `…ForTenant…` definido en los 4 archivos                                         | OK                                                              |
| Cero `any` explícito / cero `console.*` en los 4                                 | OK                                                              |
| `git diff --stat` sin archivos fuera de `src/jobs/`                              | OK (2 archivos por commit)                                      |

**Verificación adicional no pedida por el plan:** `mark-no-shows` no tiene test propio y el plan no pedía correr ninguno para él, pero es el cambio más riesgoso de los 4 (función renombrada + doble dimensión). Se corrió `test/attendance/especial-consumption.test.ts`, cuyo caso (4) ejercita el decremento del no-show por `runMarkNoShows` sobre una especial: **verde**. `test/scheduling/scheduling.test.ts` (2 casos más de `runMarkNoShows`) y `test/wellhub/webhook-booking.test.ts` (5 llamadas a `runWellhubSync`) usan las mismas firmas y tipos de retorno; quedan para CI.

**Evidencia del `tenantId` estructurado** (salida real de las corridas, `tenantId` como propiedad y NO interpolado en el mensaje):

```json
{"level":30,"name":"expire-lost-leads","tenantId":1,"windowDays":14,"expired":1,"skippedManual":0,"msg":"Barrido de leads perdidos completado para un gimnasio"}
{"level":30,"name":"reassign-multibranch","tenantId":1,"dryRun":false,"msg":"Recategorización multisucursal para un gimnasio"}
```

Esa salida también prueba, contra MySQL real, que `cleanAllTestData` **no borra la fila del tenant 1**: si la borrara, el sweep habría encontrado la lista vacía y los dos tests habrían dado 0 en todo.

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-169-07 | Los 4 sweeps salen de `listActiveTenants` (comparación positiva contra `'active'`, 169-01). El test de cobertura de los 7 jobs es del plan 169-04.                                |
| T-169-08 | El `try/catch` por iteración vive en `forEachActiveTenant` (169-01): ningún job re-lanza ni corta el barrido. Los 4 pasan su `pino()` directo como `TenantLogger`, sin adaptador. |
| T-169-09 | Los 4 tipos de retorno públicos son idénticos (verificado por `tsc` sobre los call sites) y los 3 archivos de test que los invocan corrieron verdes **sin editarlos**.            |
| T-169-10 | **accept** — con un solo tenant activo el resultado es idéntico. El riesgo quedó escrito como advertencia de vencimiento en los 4 archivos, apuntando al gate de ISO-03.          |
| T-169-11 | El guard `if (!config) return null` precede al sweep en ejecución y ahora también en orden de lectura (`runWellhubSync` se declara antes del cuerpo).                             |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit.                             |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 4 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de` — `feat(169-02): barrido por tenant activo en expire-lost-leads y wellhub-sync`
- `bb85aa64` — `feat(169-02): barrido por tenant en mark-no-shows (tenant x tz) y reassign-multibranch`

Nada pusheado (staging-first: el rollout es de un plan posterior). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-04 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-04]`, pero **no se marcó completo**. CON-04 cubre los caminos sin request enteros: faltan los 3 crons del plan 169-03, el webhook de Wellhub (169-05), los scripts CLI (169-06) y `tv_pairings` (169-07). Marcarlo ahora sería un falso positivo que el verificador de fase tendría que revertir. Lo cierra el último plan de la fase, igual que decidió el 169-01.

## Self-Check: PASSED

- Archivos modificados presentes en el worktree: los 4 de `src/jobs/`.
- Commits presentes en `git log --all`: `0426d4de`, `bb85aa64`.
- `git status` del worktree: limpio (symlink de `node_modules` borrado).
  </content>
  </invoke>
