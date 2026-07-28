---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 05
subsystem: backend
tags:
  [
    multi-tenancy,
    wellhub,
    webhook,
    fail-closed,
    derivacion-server-side,
    vitest,
    mysql,
  ]

# Dependency graph
requires:
  - plan: 169-01
    provides: "TenantContext (contrato { tenantId } plano) en src/modules/shared/tenant.ts y el criterio de comparación positiva contra 'active'"
  - plan: 169-04
    provides: "dependencia OPERATIVA (worktree único + tests MySQL-backed serializados), no lógica"
provides:
  - "Derivación server-side del tenant en el webhook público de Wellhub: gym.id → branches.wellhub_gym_id → branches.tenant_id → tenants.status"
  - "WellhubService.resolverTenant: única implementación de la tabla de corte, compartida por handleCheckin y handleBookingRequested"
  - "WebhookHandleResult.tenantId + estampado condicional de wellhub_events en el UPDATE de cierre de handleEvent"
  - "test/wellhub/webhook-tenant-derivation.test.ts: 7 tests verdes con un segundo tenant ad-hoc (id 90469)"
affects:
  - "169-06..169-09 (queda cerrado el camino sin request más riesgoso; falta CLI y tv_pairings para CON-04)"
  - "171 (ISO-03: el webhook ya tiene su corte por estado; las fixtures 2-tenant formales pueden reemplazar el sembrado ad-hoc de este archivo)"
  - "172-175 (cuando bookingService y los demás services reciban el ctx, el punto de derivación ya existe y sólo hay que pasarlo hacia adentro)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unión discriminada TenantGate ({ ok: true, ctx } | { ok: false, corte }) para que no exista forma de seguir procesando 'olvidándose' de mirar el corte"
    - "leftJoin a tenants en el lookup que ya trae la sede: el corte no cuesta una segunda query, y el LEFT evita que un problema de datos disfrace la fila de 'no encontrada'"
    - "El corte devuelve el WebhookHandleResult YA ARMADO en vez de un booleano: la política (HTTP 200 + outcome + detail + log) vive en un solo lugar"
    - "El resultado del dispatch transporta el tenantId derivado hacia arriba para que handleEvent estampe la fila de idempotencia que nació antes de la derivación"
    - "Los caminos que cortan ANTES de derivar no devuelven tenantId: la columna conserva su DEFAULT en vez de registrar un dueño inventado"

key-files:
  created:
    - el-templo-api/test/wellhub/webhook-tenant-derivation.test.ts
  modified:
    - el-templo-api/src/modules/wellhub/service.ts
    - el-templo-api/src/db/schema/wellhub.ts

key-decisions:
  - "El corte por tenant_no_resoluble NO devuelve tenantId: branches.tenant_id apuntaría a una fila de tenants que no existe, así que estamparlo en wellhub_events sería registrar un dueño falso y además chocaría con la FK de la columna"
  - "handleBookingRequested corta SIN mandarle el PATCH de rechazo a Wellhub: la ventana dura de 15 minutos auto-rechaza la solicitud, y un PATCH desde un gimnasio suspendido sería operar en su nombre"
  - "El caso tenant_no_resoluble NO se simula en el test: exige una branches.tenant_id huérfana y la FK fk_branches_tenant lo vuelve imposible de sembrar sin apagar los FK checks globalmente (efecto colateral sobre archivos vecinos del mismo worker)"
  - "El archivo de test NO usa cleanAllTestData ni deja la base vacía: cada caso usa su propio unique_token y su propio event_id sintetizado, así que todas las aserciones son scopeadas y la limpieza del afterAll es local y explícita"
  - "El tenantId se sumó también a los log.info de éxito (visita registrada, reserva confirmada/rechazada) como campo estructurado: el webhook es el único camino sin sesión y sin eso el log no dice de qué gimnasio era lo que se creó"

metrics:
  duration: "~18min"
  completed: 2026-07-28
---

# Phase 169 Plan 05: Derivación del tenant en el webhook de Wellhub Summary

La mina M6 queda cerrada: el único camino de escritura que entra sin sesión ya sabe de qué gimnasio es lo que crea — lo deriva de `payload.gym.id` contra nuestra propia tabla de sedes, corta fail-closed si ese gimnasio no está activo **antes** de dar de alta un usuario, y estampa la fila de `wellhub_events` con el tenant derivado.

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files:** 1 creado, 2 modificados
- **Tests:** 7 verdes en el archivo nuevo (102,6 s) + 12 verdes en `webhook-checkin.test.ts` (96,6 s, sin tocarlo)

## Tasks Completed

| Task | Nombre                                             | Commit     | Archivos                                                             |
| ---- | -------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| 1    | Derivación + corte + estampado de `wellhub_events` | `58b4ea84` | `src/modules/wellhub/service.ts`, `src/db/schema/wellhub.ts`         |
| 2    | Test de D-04, D-05 y del estampado                 | `e2d7793f` | `test/wellhub/webhook-tenant-derivation.test.ts` (nuevo, 525 líneas) |

## Task 1 — el webhook resuelve su propio tenant

**La cadena, entera y server-side.** `event_data.gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id` → `tenants.status`. Ningún campo del payload participa de la derivación: Wellhub no manda un gimnasio nuestro, manda **su** `gym.id`, y el mapeo vive en nuestra DB (T-169-21). El docblock de cabecera del archivo lo dice explícitamente, incluida la instrucción de ignorar un `tenant_id` si algún día apareciera en el payload.

**Los dos lookups extendidos.** `findBranchByGymId` y `findPublishedSlot` seleccionan ahora `schema.branches.tenantId` y `schema.tenants.status` con `leftJoin(schema.tenants, eq(schema.branches.tenantId, schema.tenants.id))`. El **LEFT es la decisión, no un detalle**, y en cada uno quedó escrito por qué con su consecuencia concreta:

- en `findBranchByGymId`, un join estricto haría que una sede con gimnasio no resoluble caiga en el camino `gym_sin_sede` — un mensaje **falso** (la sede existe) que esconde una corrupción de datos detrás de un log rutinario;
- en `findPublishedSlot`, haría que el slot se trate como "no publicado", camino que **además le manda un PATCH de rechazo a Wellhub**.

Mismo criterio que `country-scope.ts:143-149`, citado en los dos.

**Un solo lugar donde vive la política.** `resolverTenant` es privado, se llama desde los dos caminos que crean datos y devuelve una unión discriminada:

```ts
type TenantGate =
  | { ok: true; ctx: TenantContext }
  | { ok: false; corte: WebhookHandleResult };
```

Devuelve el `WebhookHandleResult` **ya armado** (no un booleano), así que el HTTP, el `outcome`, el `detail` y el log de cada corte existen una sola vez:

| Caso                        | HTTP | outcome   | detail                | Log                                                     |
| --------------------------- | ---- | --------- | --------------------- | ------------------------------------------------------- |
| `tenantStatus == null`      | 200  | `skipped` | `tenant_no_resoluble` | `log.error({ gymId, branchId })`                        |
| `tenantStatus !== "active"` | 200  | `skipped` | `tenant_no_activo`    | `log.warn({ gymId, branchId, tenantId, tenantStatus })` |

La comparación `!== "active"` aparece **una sola vez fuera de comentarios** en todo el archivo (verificado por grep): un estado que se agregue al enum de `tenants.status` queda denegado por default en vez de colarse.

**D-04 intacto.** El camino `gym_sin_sede` conserva literalmente su `httpStatus: 200`, su `outcome: "skipped"`, su `detail: "gym_sin_sede"` y su mensaje de log. No se tocó una línea de ese bloque. El motivo (un 4xx haría que Wellhub reintente eternamente un gym que jamás va a mapear) quedó escrito en el docblock de `resolverTenant`.

**Dónde está el corte, exactamente.** En `handleCheckin`, inmediatamente después del `if (!branch)` y **antes** de `findOrCreateVisitor` (línea 321 vs. 330) — o sea, antes de crear el usuario y antes de la llamada facturable a Wellhub. En `handleBookingRequested`, inmediatamente después del `if (!slot)` y antes de `findOrCreateVisitor` (518 vs. 561) y de todo `validateBooking` alcanzable con el slot ya encontrado.

**`handleBookingCanceled` no corta, con el motivo escrito** (T-169-26): una cancelación libera el cupo de una reserva que **ya existe**; bloquearla dejaría cupo fantasma en la grilla y la lista de espera nunca correría. El criterio general quedó redactado en el docblock: _el corte comercial aplica a lo que CREA datos, no a lo que los libera_.

**El estampado del evento.** `WebhookHandleResult` sumó `tenantId?: number`; todo camino que derivó el tenant lo devuelve —incluido el corte por `tenant_no_activo`, que igual sabe de quién era el evento— y el `UPDATE` de cierre de `handleEvent` construye el `.set()` condicionalmente:

```ts
...(result.tenantId !== undefined ? { tenantId: result.tenantId } : {}),
```

El INSERT previo lleva la anotación pedida más un comentario que explica el orden:

```
/* tenant-safe: idempotencia global previa a la derivacion del tenant (M8) */
```

**`src/db/schema/wellhub.ts` dejó de mentir.** El comentario que decía que la derivación "es trabajo de la fase 169" ahora dice dónde vive (`service.ts`, `findBranchByGymId`/`findPublishedSlot` + `resolverTenant`), por qué el `DEFAULT 1` de la columna sobrevive igual (la fila nace antes de la derivación, por la idempotencia global M8) y qué eventos quedan con el DEFAULT a propósito.

## Task 2 — 7 tests contra MySQL real (tenant `90469`)

| Test | Qué afirma                                                                  | Aserción fuerte                                                        |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | gym sin sede → 200 `skipped` / `gym_sin_sede` (D-04)                        | cero usuarios, cero llamadas al validate, evento `skipped`             |
| 2    | sede de un gimnasio `suspended` → `tenant_no_activo` (D-05)                 | cero usuarios, cero asistencias en esa sede, cero validate             |
| 3    | lo mismo con `archived`                                                     | ídem — los **dos** estados no activos del enum, no sólo el feliz       |
| 4    | sede del tenant 1 activo → procesa como siempre                             | `wellhub_events.tenant_id = 1`, 1 asistencia, 1 validate               |
| 5    | sede de un gimnasio ACTIVO **distinto de 1**                                | `wellhub_events.tenant_id = 90469` y la asistencia en la sede correcta |
| 6    | el mismo gym, suspendido y reactivado, cambia de resultado sin tocar código | el corte es del ESTADO, no de la sede: dos eventos, dos resultados     |
| 7    | higiene                                                                     | el tenant de prueba fue una fila real y el tenant 1 sigue en pie       |

**El test 5 es el que prueba de verdad el estampado**, y así está declarado en un comentario del archivo: los cuatro anteriores pasarían en verde con un `tenantId: 1` hardcodeado en el `UPDATE` de cierre, o **incluso sin `UPDATE`**, porque la columna tiene `DEFAULT 1` desde la fase 167. Con el evento del gimnasio 90469 esa aserción se cae si el service estampara 1 o dejara el default.

**Las dos trampas, mitigadas y escritas en la cabecera:**

- **(a) DEFAULT 1 (T-168-15):** las **dos** sedes se siembran con `tenantId` explícito, incluida la del tenant 1. Una sede del "segundo gimnasio" sembrada sin `tenantId` sería en realidad una sede de El Templo y los tests de corte pasarían probando nada.
- **(b) aserción débil:** cada corte afirma la **exclusión** (cero usuarios con ese `gympass_id`, cero asistencias en la sede, cero llamadas al endpoint facturable), no sólo el código HTTP. Un webhook que creara el usuario y después devolviera 200 no pasa (T-169-22).

**Higiene del worker.** `beforeEach` y `afterEach` **incondicionales** devuelven los dos gimnasios a `active` y desestubean `fetch`: sin eso, un test que deje el tenant 1 suspendido rompe todos los archivos siguientes del mismo worker (`isolate: false`). El `afterAll` borra en orden seguro de FKs (attendance → user_status_history → users → wellhub_events → branches → tenants), scopeado por los tokens y `event_id` que el propio archivo emitió. `webhook-checkin.test.ts` **no se modificó** (`git diff --numstat` no lo lista).

**Residuo verificado por SQL después de la corrida**, en la base del worker (`eltemplo_test_1`):

```
tenant_90469     0
tenant_1_status  active
branches_wh      0
```

## Deviations from Plan

**1. [Rule 3 — Blocking] El caso `tenant_no_resoluble` no se prueba por comportamiento**

- **Encontrado en:** Task 2.
- **Problema:** el plan enumera tres filas de la tabla de corte y pide "un test por cada fila", pero `tenant_no_resoluble` exige una fila de `branches` cuyo `tenant_id` apunte a un `tenants.id` inexistente. La FK `fk_branches_tenant` lo impide, y sembrarlo obligaría a apagar `FOREIGN_KEY_CHECKS` a nivel sesión sobre una base que comparten todos los archivos del worker — un efecto colateral peor que el hueco de cobertura.
- **Fix:** el archivo prueba las tres filas ALCANZABLES (`gym_sin_sede`, `tenant_no_activo` con `suspended` y con `archived`) y la cabecera declara explícitamente por qué la cuarta no se simula. El camino existe, tiene su `log.error` y está cubierto por typecheck.
- **Commit:** `e2d7793f`.

**2. [Rule 2 — Funcionalidad crítica ausente] `tenantId` estructurado en los `log.info` de éxito**

- **Encontrado en:** Task 1.
- **Problema:** el plan pide el `tenantId` en los logs de los CORTES. Los logs de éxito —"Visita Wellhub registrada", "Reserva Wellhub confirmada", "Reserva Wellhub rechazada"— seguían sin decir de qué gimnasio era lo que se acababa de crear. En el único camino de escritura sin sesión, eso es exactamente lo que hay que poder responder cuando algo aparece en la sede equivocada.
- **Fix:** los tres suman `tenantId: ctx.tenantId` como campo estructurado (jamás interpolado en el mensaje), igual que hicieron los 7 crons en 169-02/169-03.
- **Commit:** `58b4ea84`.

**Precisión sobre el criterio "antes de todo `validateBooking`":** en `handleBookingRequested` hay un `validateBooking` que TEXTUALMENTE precede al corte (línea 495 vs. 518), pero está dentro del bloque `if (!slot)`, que hace `return` — es el camino `slot_desconocido`, anterior a la derivación y que el plan ordena conservar. No hay ningún `validateBooking` alcanzable con el slot ya encontrado que no haya pasado por el corte, que es lo que el criterio protege.

**Nota sobre el orden TDD:** los dos tasks están marcados `tdd="true"` y el plan ordena implementación (Task 1) antes de tests (Task 2); así se ejecutó, sin gate RED previo. Mismo registro que dejaron los planes 169-01 y 169-04.

**Sin desviaciones de alcance:** ninguna firma de service ajeno cambió (D-02), no se tocó `src/modules/wellhub/routes.ts` ni el constructor de `WellhubService`, cero dependencias nuevas, cero migraciones.

## Verificación

| Verificación                                                                          | Resultado                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `npx tsc --noEmit`                                                                    | **exit 0** (después de cada task)          |
| `npx vitest run test/wellhub/webhook-tenant-derivation.test.ts --no-file-parallelism` | **7 passed** (102,6 s)                     |
| `npx vitest run test/wellhub/webhook-checkin.test.ts --no-file-parallelism`           | **12 passed** (96,6 s), archivo sin tocar  |
| `tenant_no_activo` / `tenant_no_resoluble` / `gym_sin_sede` fuera de comentarios      | 1 / 1 / 1                                  |
| `schema.branches.tenantId` fuera de comentarios                                       | 2 (los dos lookups)                        |
| `tenant-safe: idempotencia global` en `service.ts`                                    | 1                                          |
| `!== "active"` fuera de comentarios                                                   | **1** (helper único)                       |
| Cero `any` explícito / cero `console.*` en los archivos tocados                       | OK                                         |
| `SELECT COUNT(*) FROM tenants WHERE id = 90469` en `eltemplo_test_1`                  | **0** (y el tenant 1 en `active`)          |
| `git diff --diff-filter=D` post-commit                                                | sin borrados en ninguno de los dos         |
| `git status` del worktree tras cada commit                                            | limpio (symlink de `node_modules` borrado) |

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-169-21 | El tenant sale exclusivamente de `branches.tenant_id`; ningún campo del payload se lee para eso. El test 5 (tenant 90469) detecta cualquier valor hardcodeado o el DEFAULT. |
| T-169-22 | Corte por `tenantStatus !== "active"` ANTES de `findOrCreateVisitor` en los dos caminos, con aserción de exclusión en los tests 2 y 3 (cero usuarios, cero asistencias).    |
| T-169-23 | Camino explícito `tenant_no_resoluble` con `log.error` y 200 `skipped`, y los dos `leftJoin` comentados con la consecuencia concreta de haberlos hecho estrictos.           |
| T-169-24 | **accept** — D-04 conserva el 200 `skipped` para el gym sin mapear, verificado literalmente por el test 1.                                                                  |
| T-169-25 | `WebhookHandleResult.tenantId` estampa la fila en el `UPDATE` de cierre; el INSERT previo lleva `/* tenant-safe: … */` con el motivo M8.                                    |
| T-169-26 | **accept** — `handleBookingCanceled` no corta, con el motivo redactado en su docblock.                                                                                      |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit.                       |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 10 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de`, `bb85aa64` — plan 169-02
- `dbb89644`, `f3036876` — plan 169-03
- `3f69a1fe`, `d79d5569` — plan 169-04
- `58b4ea84` — `feat(169-05): derivar el tenant en el webhook de Wellhub y cortar por estado`
- `e2d7793f` — `test(169-05): D-04, D-05 y el estampado del evento contra MySQL real`

Nada pusheado (staging-first: el rollout es del plan 169-09). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-04 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-04]` y **no se marcó completo**. Con este plan los 7 crons y el webhook están cubiertos y probados, pero CON-04 abarca todos los caminos sin request: faltan los scripts CLI (169-06) y `tv_pairings` (169-07). Marcarlo ahora sería un falso positivo que el verificador de fase tendría que revertir. Lo cierra el último plan de la fase, igual que decidieron los planes 01 a 04.

## Known Stubs

Ninguno. El único hueco declarado es el caso `tenant_no_resoluble` sin test de comportamiento, documentado arriba como desviación con su motivo — no es un placeholder ni un TODO.

## Self-Check: PASSED

- `el-templo-api/src/modules/wellhub/service.ts` y `el-templo-api/src/db/schema/wellhub.ts` presentes y modificados en el worktree.
- `el-templo-api/test/wellhub/webhook-tenant-derivation.test.ts` presente (525 líneas).
- Commits presentes en `git log --all`: `58b4ea84`, `e2d7793f`.
- `git status` del worktree: limpio.
