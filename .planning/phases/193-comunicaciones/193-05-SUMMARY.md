---
phase: 193-comunicaciones
plan: 05
subsystem: api
tags:
  [
    communications,
    avisos,
    prompt-orchestration,
    fastify,
    drizzle,
    vitest,
    tenancy,
  ]

# Dependency graph
requires:
  - phase: 193-01
    provides: "destinations.ts (resolveDestinationRoute/DEFAULT_WHATSAPP_TEXT), sales-number.ts (resolveSalesNumberForUser)"
  - phase: 193-02
    provides: "schema avisos/aviso_events (mig 0216)"
  - phase: 193-03
    provides: "SYSTEM_AVISOS/seedSystemAvisos, migración 0217 (7 avisos de sistema por tenant)"
  - phase: 193-04
    provides: "CommunicationsService, communicationsRoutes (7 rutas admin), manifiesto 396 entradas"
  - phase: 143 (ratings)
    provides: "RatingsService.getPendingRating (D-P1..P4)"
  - phase: 144 (vencimiento)
    provides: "SubscriptionService.getCoveredUntil / deriveCoveredUntil (regla ≤3 días, supresión por cobertura)"
provides:
  - "PromptService (el-templo-api/src/modules/communications/prompt-service.ts): resolvePrompt orquesta D-06 (plan_expiry > aviso vigente > rating > improvement) sin reescribir las reglas de los módulos dueños; recordEvent (upsert idempotente D-11); listTarjetas (D-15b)"
  - "matchesScope (D-13) y frequencyAllows (D-11) exportados y testeables por separado"
  - "4 rutas member-facing bajo /api/communications/me: GET /prompt, POST /avisos/:id/event, GET /tarjetas, GET /config — userId SIEMPRE de request.user.userId (T-193-16)"
  - "Manifiesto fail-closed actualizado (396 -> 400 entradas)"
  - "12 tests de comportamiento (prioridad/frecuencia/alcance/vigencia/eventos/config/tarjetas) + 2 describe nuevos en la batería ISO-03 de aislamiento"
affects: [193-06, 193-08, 193-09, 193-11, 193-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orquestador de prioridad server-side: cada escalón corta en el primero que aplica (T-193-19), llamando a los servicios dueños de cada regla (RatingsService, ImprovementProposalsService, SubscriptionService) en vez de reimplementarlas"
    - "frequencyAllows/matchesScope como funciones puras exportadas (sin db), testeables por separado del orquestador async"
    - "whatsappNumber resuelto UNA vez por llamada (no por aviso) para evitar N+1 sobre tenant_settings cuando varias tarjetas son whatsapp_sales"
    - "userId SIEMPRE server-derived de request.user en rutas member-facing (mismo criterio que /coverage, T-193-16) — ninguna de las 4 rutas nuevas acepta userId por params/body/query"

key-files:
  created:
    - el-templo-api/src/modules/communications/prompt-service.ts
    - el-templo-api/test/communications/prompt-endpoint.test.ts
  modified:
    - el-templo-api/src/modules/communications/routes.ts
    - el-templo-api/src/modules/communications/schemas.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-communications.test.ts

key-decisions:
  - "wholeDaysUntil (subscriptions/member-routes.ts) se exportó — no estaba accesible desde otros módulos pese a que el plan pedía explícitamente reusarla; cambio de una palabra (Rule 3), sin tocar su lógica ni sus call sites existentes."
  - "SubscriptionService.getCoveredUntil (no deriveCoveredUntil standalone) es el import elegido para D-10 — coincide con el acceptance criteria del plan (grep de 'getCoveredUntil' en el archivo) y es el punto de entrada documentado como el 'módulo dueño' en subscriptions/service.ts."
  - "El status de rating_prompt/improvement_prompt/plan_expiry se revisa en cada escalón (if row.status !== 'active') aunque hoy allowedFieldsForSystemAviso (plan 04) no permite editar ese campo vía API para esos 3 codes — ver 'Issues Encontrados' más abajo, deuda de otro plan."
  - "whatsappNumber se resuelve UNA sola vez por request (no por aviso evaluado) para no multiplicar lecturas de tenant_settings — ver buildPromptAvisoWithNumber/listTarjetas."

patterns-established:
  - "toPromptAviso/buildPromptAviso: mapper puro de fila de avisos a la forma que consume la app, separado de la resolución de whatsappNumber (async, D-20) — reusable por cualquier futura superficie que necesite proyectar un aviso."

requirements-completed: [COM-02, COM-03]

# Metrics
duration: ~110min
completed: 2026-09-02
---

# Phase 193 Plan 05: Endpoint único "qué pop-up toca hoy" Summary

**PromptService orquesta D-06 (vencimiento > aviso > calificación > mejora) llamando a los 3 módulos dueños de cada regla sin reescribirlas, expuesto en 4 rutas member-facing (`/prompt`, `/avisos/:id/event`, `/tarjetas`, `/config`) con 12 tests de comportamiento y 2 casos nuevos de aislamiento cross-tenant, todos verdes.**

## Performance

- **Duration:** ~110 min
- **Tasks:** 3/3
- **Files modified:** 8 (2 nuevos + 6 modificados)

## Accomplishments

- `prompt-service.ts`: `PromptService.resolvePrompt` aplica el orden fijo D-06 con cortocircuito en el primer escalón que aplica, llamando `SubscriptionService.getCoveredUntil`, `RatingsService.getPendingRating` e `ImprovementProposalsService.getPromptStatus` — ninguna de las reglas de esos módulos se tocó ni se reimplementó
- `matchesScope` (D-13, AND de sede/país/segmento) y `frequencyAllows` (D-11, `once`/`every_n_days`/`every_open`) exportados como funciones puras, testeados directamente vía el endpoint
- `recordEvent` (D-11): upsert idempotente por `(aviso_id, user_id, event_type)`, 404 en aviso ajeno; `listTarjetas` (D-15b): tarjetas activas en vigencia y alcance, sin frecuencia
- 4 rutas nuevas en `routes.ts`: `GET /me/prompt`, `POST /me/avisos/:id/event`, `GET /me/tarjetas`, `GET /me/config` — todas con `userId` server-derived (T-193-16), manifiesto 396→400
- `prompt-endpoint.test.ts` (12/12): los 5 escalones de prioridad (incluido `null`), los 3 modos de frecuencia, `scopeBranchIds`/`scopeCountries`/`scopeSegments`, vigencia, idempotencia de eventos, `GET /me/config` y `GET /me/tarjetas`
- `iso-03-communications.test.ts` ampliado (+2 describe, 15/15): `GET /me/prompt` nunca cruza tenant, `POST /me/avisos/:id/event` con id ajeno → 404 sin escribir fila
- No-regresión: `ratings.test.ts` (18 tests), `improvement-proposals.test.ts` (16 tests) y `coverage-endpoint.test.ts` (5 tests) corren **sin modificar**, 45/45 verdes — D-08/D-09/D-10 intactos
- Verificación: `tsc --noEmit` 0, `pnpm lint:tenant` DISCREPANCIAS: 0 (en las 3 tasks), `iso-01-manifiesto.test.ts` 13/13 con `ENTRADAS_BASELINE` 400

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Orquestador de prioridad + matching de alcance, frecuencia y vigencia** - `f77b4fa7` (feat)
2. **Task 2: Rutas member-facing + manifiesto** - `c4559767` (feat)
3. **Task 3: Tests de prioridad, frecuencia y no-regresión de las reglas viejas** - `e50cd5cd` (test)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/modules/communications/prompt-service.ts` - `PromptService`: `resolvePrompt`/`recordEvent`/`listTarjetas` + `matchesScope`/`frequencyAllows` exportados
- `el-templo-api/src/modules/communications/routes.ts` - +4 rutas member-facing (`/me/prompt`, `/me/avisos/:id/event`, `/me/tarjetas`, `/me/config`)
- `el-templo-api/src/modules/communications/schemas.ts` - JSON Schemas de las 4 rutas nuevas
- `el-templo-api/src/modules/subscriptions/member-routes.ts` - exporta `wholeDaysUntil` (Rule 3, ver Deviations)
- `el-templo-api/test/tenant-manifest.ts` - +4 entradas `tenant-scoped` (246→250), contabilidad del header 396→400
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 396→400
- `el-templo-api/test/tenancy/iso-03-communications.test.ts` - +2 describe (aislamiento de `/me/prompt` y `/me/avisos/:id/event`)
- `el-templo-api/test/communications/prompt-endpoint.test.ts` - 12 tests de comportamiento (prioridad/frecuencia/alcance/vigencia/eventos/config/tarjetas)

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: `wholeDaysUntil` exportada (deviation Rule 3), `SubscriptionService.getCoveredUntil` elegido sobre `deriveCoveredUntil` standalone para cumplir el acceptance criteria literal del plan, `whatsappNumber` resuelto una sola vez por request para evitar N+1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `wholeDaysUntil` no estaba exportada desde `subscriptions/member-routes.ts`**

- **Found during:** Task 1, al armar `resolvePlanExpiry` — el plan pide explícitamente "calcula `daysRemaining` con `getCoveredUntil` + `wholeDaysUntil`... (importar, no re-implementar)", pero la función era `function wholeDaysUntil` (sin `export`), inaccesible desde `prompt-service.ts`.
- **Issue:** Sin exportarla, la única forma de cumplir el plan era reimplementar la misma cuenta de días en otro archivo — exactamente lo que la instrucción del plan prohíbe (duplicación de una regla ya resuelta, fase 144-03).
- **Fix:** Se agregó `export` a la declaración de la función en `member-routes.ts`, sin tocar su cuerpo ni sus call sites existentes (`/coverage` sigue funcionando idéntico).
- **Files modified:** `el-templo-api/src/modules/subscriptions/member-routes.ts`
- **Verification:** `tsc --noEmit` 0; `coverage-endpoint.test.ts` (dueño de esa función) sigue en 5/5 verde sin modificaciones; el test de prioridad de `prompt-endpoint.test.ts` verifica `daysRemaining: 2` para una cobertura que vence en 2 días.
- **Committed in:** `f77b4fa7` (Task 1 commit)

---

**Total deviations:** 1 auto-fijada (Rule 3, cambio de una palabra en un archivo fuera del `files_modified` literal de la Task 1, necesario para cumplir la instrucción explícita del propio plan de no reimplementar la regla)
**Impact on plan:** Sin impacto en el objetivo del plan ni en el comportamiento de `/coverage`. Sin el fix, la Task 1 hubiera tenido que elegir entre violar la regla dura "orquesta, no reescribe" o quedar bloqueada.

## Issues Encountered

**Deuda encontrada, NO corregida (fuera de alcance de este plan — Scope boundary):** `service.ts` (plan 04) define `allowedFieldsForSystemAviso` con `SYSTEM_ALLOWED_WITH_FREQUENCY` (usado por `rating_prompt`/`improvement_prompt`) SIN el campo `status` en el set editable. Esto contradice D-11 ("los avisos de sistema no se borran; pueden desactivarse (salvo vencimiento)") — según esa decisión, `rating_prompt`/`improvement_prompt` SÍ deberían poder pausarse vía `PUT /admin/avisos/:id`, pero hoy el service rechaza `status` como campo no editable para esos dos codes (`plan_expiry` correctamente lo excluye por D-10, pero el mismo set base se heredó también para rating/improvement, que no debería estar tan restringido). `prompt-service.ts` SÍ chequea `row.status !== 'active'` en los 3 escalones (defensivo, correcto de cara al futuro), pero ese chequeo es hoy inalcanzable vía API para `rating_prompt`/`improvement_prompt` — solo se podría activar con un UPDATE directo a la base. No se tocó `service.ts` porque no es un archivo de esta plan (`files_modified` de la 193-05 no lo incluye) y el bug es anterior (plan 04, Task 1). Se documenta acá para que un plan posterior de la fase (probablemente el que construye el editor admin, 193-08/09) lo resuelva: agregar `status` al set `SYSTEM_ALLOWED_WITH_FREQUENCY` de `service.ts`.

Ningún otro bloqueante. Los 5 comandos de test corrieron en foreground con `timeout: 580000` en la herramienta Bash y `--hookTimeout=300000` en vitest — cada corrida tardó entre 95s y 160s (provisión del DB de test), dentro de lo esperado según las reglas duras del prompt. Un primer intento del archivo nuevo se backgroundeó automáticamente al superar los 120s por defecto del harness (olvidé pasar el parámetro `timeout` de la herramienta Bash, solo pasé `timeout 580` de shell) — se recuperó esperando la notificación, sin pérdida de resultado.

Durante la primera corrida de `prompt-endpoint.test.ts` aparecieron 4 fallos por `TenantSentinelError` en queries de manipulación directa de DB del propio archivo de test (updates/selects sobre `avisoEvents`/`avisos` sin `tenantWhere`) — corregido agregando `tenantWhere(tabla, CTX_TEMPLO)` a esas 5 queries (no es una desviación del plan de producción, es un bug del test recién escrito, corregido antes de commitear).

Durante la primera corrida de la ampliación de `iso-03-communications.test.ts` apareció un fallo de aserción (esperaba el id del aviso recién creado, recibió el id del aviso preexistente del `beforeEach` de ese archivo — ambos avisos de El Templo, mismo `sortOrder`, gana el de id más chico por el criterio de desempate "sort_order, id" de D-06 escalón 2). No es un bug: el aviso ganador es igual de válido para probar aislamiento. Se corrigió la aserción para verificar "el ganador pertenece SIEMPRE al set de avisos del propio tenant" en vez de un id específico — más robusto y sigue probando exactamente lo que el caso pide (D-13/T-193-17).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PromptService` queda listo como la única fuente de verdad de "qué pop-up toca hoy" para que el plan que reemplace los 4 diálogos globales de `MainLayout.vue` (app) consuma `GET /me/prompt` en vez de decidir localmente (D-07); `GET /me/tarjetas` y `GET /me/config` quedan listos para el carrusel de Mi Templo (D-15b) y el salto a WhatsApp de ventas (D-20/D-21) respectivamente.
- Deuda anotada (no bloqueante, ver Issues Encountered): `service.ts` (plan 04) no permite pausar `rating_prompt`/`improvement_prompt` vía API pese a que D-11 lo permite — el plan que construya el editor admin de estos 2 avisos debería agregar `status` a `SYSTEM_ALLOWED_WITH_FREQUENCY`.
- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 16 commits nuevos sobre `origin/master` `7c273a15` (3+3+3+4 de los planes 01-04 + 3 de este).

---

## Self-Check: PASSED

- `el-templo-api/src/modules/communications/prompt-service.ts` — FOUND
- `el-templo-api/test/communications/prompt-endpoint.test.ts` — FOUND
- Commit `f77b4fa7` — FOUND
- Commit `c4559767` — FOUND
- Commit `e50cd5cd` — FOUND
- `.planning/phases/193-comunicaciones/193-05-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_

## Nota del orquestador (post-plan)

La deuda "`status` no editable para `rating_prompt`/`improvement_prompt`" se saldó en el commit `9307acfc` de `et-193` (`status` sumado a `SYSTEM_ALLOWED_WITH_FREQUENCY` + caso (4b) en `avisos-admin.test.ts`, 9/9 verde).
