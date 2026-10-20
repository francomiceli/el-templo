---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 07
subsystem: api-sessions
tags: [canasta, rutas, tenancy, manifiesto, bloque-libre]
requires: ["197-06"]
provides:
  - GET /api/sessions/free-blocks (lista paginada con filtro de grupo)
  - GET /api/sessions/free-blocks/:blockId (bloque suelto)
  - getFreeBlocksSchema, getFreeBlockSchema, freeBlocksListResponse, freeBlockResponse
affects: [197-08, 197-14]
key-files:
  created:
    - el-templo-api/src/modules/sessions/free-blocks-routes.ts
    - el-templo-api/test/sessions/free-blocks-list.test.ts
  modified:
    - el-templo-api/src/modules/sessions/schemas.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
requirements: [D-04, D-08, D-09, D-10, D-14]
---

# Fase 197 Plan 07: Rutas de la canasta — Summary

La canasta queda disponible por HTTP: `GET /api/sessions/free-blocks` (lista paginada, filtro `group`, `level` opcional) y `GET /api/sessions/free-blocks/:blockId`, dentro de `sessionRoutes` (guard `templo-training`), en el manifiesto ISO-01 (473 -> 475) y con una batería de integración de 12 casos para CI.

## Qué se hizo

1. **Rutas** (`free-blocks-routes.ts`): plugin `freeBlocksRoutes` con `{ sessionService, formatDescriptions }`; instancia `FreeBlocksService`; ambas rutas con `fastify.authenticate`, `attachCountryScope` + `assertTenant(request.scope, "sessions.free-blocks")`, `resolveMember` (deny propagado con su status y `{ error }`), y 404 `{ error: "Bloque no disponible" }` si `getOne` da `null`. Registro en `routes.ts` sin `prefix` y con path completo (`"/free-blocks"`, `"/free-blocks/:blockId"`).
2. **Schemas**: `group` enum de 6, `page` >= 1 (default 1), `limit` 1..100 (default 20), `level` enum de 6 niveles; `blockId` maxLength 100 + pattern; responses 200/403/404. Interfaces `GetFreeBlocksInput`, `GetFreeBlockParams` y `GetFreeBlockQuery`.
3. **Manifiesto**: 2 entradas `templo-module` / `templo-training`; `ENTRADAS_BASELINE` 475 con línea de historia; también el título del `it` ("las 475 entradas").
4. **Batería** `free-blocks-list.test.ts` (12 `it`): subnivel (sigma y kairos -> alfa), <= hoy, sin GP / pending_review, roles (incluye ROM_LOWER `-delta`, excluye INITIUM/TECNICA_I/STRETCHING/COMBOS_I/COMBOS_II_ALT), duplicados (mismo orden = 1 con `lastDate` reciente, otro orden = 2), orden sin filtro y con `group=pecho`, `workedToday` al final, paginación 23 -> 20 + 3 (`limit=101` y `page=0` -> 400), filtro (`core` vacío, `gemelos` -> 400), gate (mismo status/mensaje que `/weekly`, 401 sin token, online con programa -> 200), AURA (sin filas, ayer, hoy sin cobrar, hoy cobrada; otro socio no ve el cupo) y GET uno (200 con título "Ruta · Formato"; GP, mañana, INITIUM, inexistente -> 404; param mal formado -> 400).

## Commits

- `e219f1ebd` feat(197-07): GET /sessions/free-blocks y /free-blocks/:blockId (D-14) + manifiesto 475
- `5beb47fe4` test(197-07): integración de la canasta (D-08/D-09)

## Verificación (estática)

- Ambos scripts `<verify>` del plan: todos los símbolos presentes, higiene limpia (sin `console.`, `any`, fechas literales ni ids hardcodeados). `node --experimental-strip-types --check` sobre los 5 .ts tocados/creados: sin errores de sintaxis. Sin node_modules: no se corrió typecheck ni tests (CI).

## Desvíos/decisiones

- **Reloj acotado a la semana 51**: `dateToWeekNumber` clampa a 1-52 y `weekDayToDate(52, ...)` cae en febrero 2027; pasada esa fecha, "el último miércoles" real daría fechas que no coinciden con las del dayId. El test usa `min(último miércoles, weekDayToDate(51, "miercoles"))` (sin fechas literales), así sigue válido después de febrero 2027.
- **`day_modes` del miércoles se fuerza a `regular` en `beforeEach`** (la tabla no se limpia entre archivos y otros tests TV la dejan en `rom`), para que `todayZones` encuentre la sesión de hoy.
- **No se resembra `aura_config`**: estas rutas solo leen `extra_blocks_completed.aura_awarded`; no dependen de la fuente `extra_block`. 197-08 (cierre) sí tiene que resembrarla.
- **Duplicados en dos semanas**: se usan semana anterior y semana actual (no dos fechas de la misma semana) para que `lastDate` pruebe "la más reciente" de verdad.
- **`GetFreeBlockQuery`** agregada (el plan solo nombraba `GetFreeBlocksInput`/`GetFreeBlockParams`) para tipar `level` en la ruta de un bloque sin romper Prettier.
- `level` inválido ya no llega al servicio: el schema lo corta con 400 (el servicio igual lo ignora si no es nivel válido).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno en código previo.

## Para el orquestador / planes siguientes

- CI debería confirmar tres supuestos que no pude correr: (a) que `/sessions/weekly` de un socio sin plan responda 404/403 con `error` igual al de free-blocks (ambos pasan por `resolveSessionView`); (b) que `programs`/`program_enrollments` acepten el insert con `tenantValues` y `goalPlanType: null` (igual que `sessions-gating.test.ts`); (c) que `fastify.authenticate` devuelva 401 sin token.
- 197-08 puede reusar `seed`/`ex` del test como patrón; los fixtures de 197-04 alcanzan.
- La ruta `/free-blocks` convive con `GET /:id` (entero) de `sessionRoutes`: son segmentos distintos, find-my-way prioriza estáticos. Si CI muestra un 400 inesperado en `/free-blocks`, revisar ese orden.

## Self-Check: PASSED

Archivos creados presentes y commits `e219f1ebd` y `5beb47fe4` en el log de `feat/197-entrenar`.
