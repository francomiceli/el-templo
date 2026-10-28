---
phase: 193-comunicaciones
plan: 10
subsystem: api+admin
tags:
  [communications, tv, avisos, fastify, drizzle, vitest, tenancy, vue, quasar]

# Dependency graph
requires:
  - phase: 193-02
    provides: "schema tv_avisos (gym-owned, mig 0216) + tv_class_state.tv_aviso_id"
  - phase: 193-07
    provides: "TvAvisosService.getActiveForBranch + GET /api/communications/tv/control/tv-aviso-activo (dueño+coach, requireBranchAccess)"
provides:
  - "screen 'aviso' en el contrato de tv/types.ts y tv/schemas.ts: TvScreen suma 'aviso', TvControlState/TvStateWrite suman tvAvisoId, GET /control/screen responde aviso {id,title,body}|null ya resuelto"
  - "TvService.writeState valida el tvAvisoId contra el tenant de la sede y su estado activo (400 si no); buildPollPayload degrada 'aviso' -> 'class'/'idle' sin 500 si el aviso desapareció o se desactivó (T-193-39)"
  - "D-26 server-side: escribir blockRole o cualquier screen distinto de 'aviso' limpia tvAvisoId y, si hacía falta, revierte screen a 'class' — sin tocar los handlers de bloques del admin"
  - "Botón AVISO en TvControlPage.vue (tira de bloques), visible solo con aviso activo en modo manual, sin confirmación (D-26), con el título mostrado para el control ciego"
  - "test/tv/tv-aviso-screen.test.ts: 9 casos de integración (escritura, poll, D-26, degradación x3, tampering x2 cross-tenant/inexistente, end-class)"
affects: [193-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Degradación server-side en el punto de lectura (buildPollPayload/resolveAviso) en vez de en la escritura: un aviso borrado/desactivado nunca deja el TV clavado, sin tocar la fila persistida"
    - "Auto-salida de un estado transitorio (aviso) resuelta enteramente en el service (writeState), para que el admin no necesite condicionales nuevos en sus handlers de bloque existentes"
    - "Selects que agregan la columna tenantId al leer una tabla gym-owned no-strict (branches) satisfacen el lint de tenancy en runtime (analyzeSql: presencia literal de tenant_id en el predicado/select) sin que la query filtre por ese tenant — dejó una entrada de tenant-lint-allowlist.json stale que hubo que borrar (D-14)"

key-files:
  created:
    - el-templo-api/test/tv/tv-aviso-screen.test.ts
  modified:
    - el-templo-api/src/modules/tv/types.ts
    - el-templo-api/src/modules/tv/schemas.ts
    - el-templo-api/src/modules/tv/service.ts
    - el-templo-api/tenant-lint-allowlist.json
    - el-templo-api/test/tv/tv-service.test.ts
    - el-templo-admin/src/tv/poll.ts
    - el-templo-admin/src/composables/useTvApi.ts
    - el-templo-admin/src/pages/TvControlPage.vue

key-decisions:
  - "TvStateWrite.screen se tipó como 'class'|'closing'|'aviso' literal (no Exclude<TvScreen,'idle'>) en ambos lados (API y admin), espejando exactamente el enum del JSON Schema del body."
  - "La salida del aviso al avanzar de bloque vive ÚNICAMENTE en TvService.writeState (si write.blockRole viene definido y el estado seguía en 'aviso' sin pantalla explícita, revierte a 'class' server-side) — el admin no toca requestBlockChange/sendBlockChange/onBlockStep, tal como pedía el plan."
  - "getTvAvisoActivo se agregó a useTvApi.ts (no a useCommunicationsApi.ts) siguiendo la instrucción literal del plan y su files_modified; no toca loading/error compartidos (mismo criterio que getCoachTodaySchedule) para no pisar el spinner/mensaje del contexto principal del control."
  - "isActiveButton también se apaga durante la pantalla de aviso (misma condición que isClosingScreen) — evita que un botón de bloque quede resaltado mientras el TV muestra la placa."

requirements-completed: [COM-04]

# Metrics
duration: ~90min
completed: 2026-09-02
---

# Phase 193 Plan 10: Estado 'aviso' del TV + botón AVISO en el control Summary

**`screen: 'aviso'` en el contrato de `tv_class_state` (escritura absoluta, degradación sin 500, salida automática al avanzar de bloque) y el botón AVISO en la tira de bloques del control del profe, que dispara el aviso de TV activo sin diálogo de confirmación.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 3/3
- **Files modified:** 9 (1 nuevo + 8 modificados)

## Accomplishments

- `tv/types.ts` + `tv/schemas.ts`: `TvScreen` suma `"aviso"`; `TvControlState`/`TvStateWrite` suman `tvAvisoId`; el body de `POST /control/state` acepta `screen:"aviso"` + `tvAvisoId`; la respuesta de `GET /control/screen` suma `aviso: {id,title,body}|null` ya resuelto (D-27: el kiosco es una página estática sin segundo fetch).
- `tv/service.ts`: `readState` deja de colapsar todo lo que no sea `"closing"` a `"class"` y devuelve `tvAvisoId`; `buildPollPayload` resuelve el aviso filtrando por `branch.tenantId` (T-193-38) y degrada a `"class"` (o `"idle"` si tampoco hay sesión aprobada) sin 500 cuando el aviso fue borrado o desactivado (T-193-39); `writeState` valida que el `tvAvisoId` sea del tenant de la sede y esté activo (400 `BadRequestError` si no, T-193-37) y limpia `tvAvisoId` — revirtiendo `screen` a `"class"` cuando hacía falta — en cualquier escritura que traiga `blockRole` o una pantalla distinta de `"aviso"` (D-26).
- `TvControlPage.vue`: botón AVISO en la tira de BLOQUES (después de "FLEXIBILIDAD - FINAL"), visible solo con `avisoActivo !== null` (cargado junto con el contexto, en `fetchContext`, que ya corre al elegir sede y en el refresco de 30 s), sin diálogo de confirmación, con el título del aviso mostrado debajo para el control ciego. `onAviso()` manda `send({screen:'aviso', tvAvisoId})`. Ni `onSelectBlock`, ni `requestBlockChange`, ni `sendBlockChange`, ni `onBlockStep` se tocaron — la salida del aviso al avanzar de bloque la resuelve el servicio.
- `test/tv/tv-aviso-screen.test.ts`: 9 casos — (1) escritura + poll con texto resuelto y `class:null`; (2a/2b) D-26 avanzar de bloque o ir a `closing` limpia `tvAvisoId` y revierte `screen`; (3a/3b/3c) degradación (desactivado, borrado con fila huérfana forzada, y sin sesión aprobada → `idle`), siempre sin 500; (4a/4b) `tvAvisoId` de otro tenant o inexistente → 400 sin tocar el estado; (5) `end-class` idempotente también desde `aviso`.
- Verificación: `tsc --noEmit` 0, `pnpm lint:tenant` DISCREPANCIAS: 0, `test/tv/` completo 148/148 (incluye el archivo nuevo), `pnpm -C el-templo-admin lint` 0 errores, `pnpm -C el-templo-admin build` OK.

## Task Commits

Cada task se commiteó atómicamente en `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: screen 'aviso' en el contrato de la API del TV** - `31238d24` (feat)
2. **Task 2: Botón AVISO en el control del profe** - `51d19ae3` (feat)
3. **Task 3: Test de integración del estado 'aviso'** - `97affc7b` (test)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/modules/tv/types.ts` - `TvScreen`/`TvControlState`/`TvStateWrite`/`TvPollResponse` suman aviso
- `el-templo-api/src/modules/tv/schemas.ts` - enum `screen` + `tvAvisoId` (body) + objeto `aviso` (respuesta)
- `el-templo-api/src/modules/tv/service.ts` - readState/buildPollPayload/writeState/persistState + `resolveAviso`
- `el-templo-api/tenant-lint-allowlist.json` - entrada `tv/service.ts`+`branches` stale, borrada (D-14)
- `el-templo-api/test/tv/tv-service.test.ts` - `baseState`/assert de keys del poll de reposo, compat con los campos nuevos
- `el-templo-api/test/tv/tv-aviso-screen.test.ts` - 9 tests de integración nuevos
- `el-templo-admin/src/tv/poll.ts` - `TvScreen`/`TvPollResponse` espejan `aviso`
- `el-templo-admin/src/composables/useTvApi.ts` - `TvScreen`/`TvControlState`/`TvStateWrite`/`getTvAvisoActivo`
- `el-templo-admin/src/pages/TvControlPage.vue` - botón AVISO, `avisoActivo`, `isAvisoScreen`, `onAviso`

## Decisions Made

Ver `key-decisions` en el frontmatter (tipado literal de `screen` en el write, salida del aviso resuelta 100% server-side, `getTvAvisoActivo` en `useTvApi.ts`, `isActiveButton` apagado durante aviso).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `test/tv/tv-service.test.ts` no compilaba/pasaba con los campos nuevos del contrato**

- **Found during:** Task 1, primera corrida de `tsc --noEmit` y de `test/tv/`
- **Issue:** `TvControlState` sumó el campo requerido `tvAvisoId` (pedido explícito del plan) y `TvPollResponse` sumó `aviso` — el literal `baseState: TvControlState` del archivo existente no compilaba sin `tvAvisoId`, y el test "sin sesion aprobada el payload es reposo SIN campo de error (D-09)" afirmaba la lista EXACTA de keys del payload de reposo (`Object.keys(payload).sort()`), que ahora incluye `"aviso"`.
- **Fix:** Se agregó `tvAvisoId: null` al `baseState` y `"aviso"` a la lista esperada de keys (más `expect(payload.aviso).toBeNull()`), sin cambiar ninguna aserción de comportamiento existente.
- **Files modified:** `el-templo-api/test/tv/tv-service.test.ts`
- **Verification:** `tsc --noEmit` 0; el archivo completo (29/29) y luego `test/tv/` completo (148/148) en verde.
- **Committed in:** `31238d24` (Task 1 commit)

**2. [Rule 1 - Mecánico] Entrada stale en `tenant-lint-allowlist.json` tras agregar `tenantId` al select de `branches`**

- **Found during:** Task 1, primera corrida de `pnpm lint:tenant`
- **Issue:** Para validar/resolver el aviso por tenant (T-193-37/T-193-38) hizo falta agregar `tenantId: schema.branches.tenantId` a los dos `select` de `branches` de `tv/service.ts` (`buildPollPayload`, `loadBranch`). Eso hizo que el lint de tenancy en runtime (que detecta la presencia literal de `tenant_id` en la zona de predicado/select, no que el filtro sea correcto) dejara de considerar esos dos accesos una violación — la entrada `tv/service.ts`+`branches` de la allowlist quedó "stale" (D-14: una entrada que ya no corresponde a ninguna violación viva también es rojo).
- **Fix:** Se borró la entrada `{"file": "el-templo-api/src/modules/tv/service.ts", "table": "branches"}` de `tenant-lint-allowlist.json`. La entrada hermana `tv/service.ts`+`tv_class_state` se dejó intacta (esas queries siguen sin filtrar por tenant, consistente con el resto del archivo — `tv_class_state` no es un módulo strict).
- **Files modified:** `el-templo-api/tenant-lint-allowlist.json`
- **Verification:** `pnpm lint:tenant` DISCREPANCIAS: 0 (antes: 1, `staleNoLongerViolating`).
- **Committed in:** `31238d24` (Task 1 commit)

---

**Total deviations:** 2, ambas auto-fijadas antes de commitear (no generaron commits extra). Ninguna tocó archivos fuera del alcance directo de los cambios del plan (ambas son consecuencia mecánica de sumar los campos/columnas que el propio plan pidió).
**Impact on plan:** Sin impacto negativo en el objetivo. Ambas son ajustes de compilación/gate causados directamente por el diseño del plan, no bugs de negocio ni cambios de comportamiento.

## Issues Encountered

Ninguno bloqueante. Los tests de `el-templo-api` (varios archivos, 100-200s cada uno por la provisión del DB de test) se corrieron en foreground con `timeout: 600000` en la herramienta Bash; dos corridas superaron los 120s del timeout por defecto del harness y quedaron corriendo en background automáticamente (mismo patrón documentado en SUMMARYs previos de la fase) — se recuperó el resultado leyendo el output persistido tras la notificación, sin pérdida ni reintento.

Nota de diseño verificada empíricamente: `writeState` degrada `screen: 'aviso'` a `'class'` server-side ÚNICAMENTE cuando el write trae `blockRole` sin `screen` explícito (el gesto real de "tocar un bloque" desde el admin, que nunca manda `screen` salvo que venga de cierre/inicio). Un cambio de nivel, ejercicio, timer o sonido mientras el TV muestra el aviso NO lo saca (D-26: "sin timer, sin confirmación") — verificado con los tests (2a)/(2b), no hay caso explícito de "cambiar de nivel durante el aviso" en la batería porque el plan no lo pedía, pero el comportamiento se deriva directamente de la condición `write.blockRole !== undefined || write.screen !== undefined` en `service.ts`.

Rough edge conocido, NO corregido (fuera de alcance explícito del plan — "No tocar los handlers de bloques, niveles ni timer"): con el TV mostrando el aviso, `isActiveButton` apaga el resaltado de TODOS los bloques (igual que en `closing`), así que tocar el bloque que ya estaba activo antes del aviso no hace nada (no hay rama en `requestBlockChange` para "mismo rol + isAvisoScreen", a diferencia de la que sí existe para `isClosingScreen`); y los botones ANTERIOR/SIGUIENTE (`onBlockStep`) navegan desde la posición 0 mientras se muestra el aviso (porque `seqIndex` depende de `buttonIndex`, que es `-1` con `isAvisoScreen`). El gesto principal — tocar CUALQUIER bloque distinto — funciona correctamente y saca del aviso (cubierto por el test 2a). Si se quiere pulir esto, es trabajo de un plan de seguimiento que sí toque esos handlers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Contrato exacto para el plan 13 (render de la placa en `TvScreenPage.vue`):**

- `GET /api/admin/tv/control/screen?branchId=NN` (el mismo poll de siempre, 750 ms) ahora puede devolver `screen: "aviso"` con `class: null` y `aviso: { id: number, title: string, body: string }` — el texto YA VIENE RESUELTO, sin necesidad de un segundo fetch (D-27: kiosco ES2015 estático).
- `poll.ts` (admin) ya declara `TvScreen` con `'aviso'` y `TvPollResponse.aviso: TvAvisoPollPayload | null` — el plan 13 solo necesita leer `payload.aviso` cuando `payload.screen === 'aviso'` y pintar la placa con la estética cápsula/frase (Cinzel, oro, velo crema/charcoal) que ya usan `render.ts` (`paintCapsula`/`paintQuote`).
- **Cómo se vuelve a `class`:** automático, sin acción del TV — el profe toca cualquier bloque (o `closing`) desde el control, y el PRÓXIMO poll (máximo 750 ms después) ya trae `screen: "class"` (o `"closing"`) con `aviso: null`. El plan 13 no necesita lógica de "salir del aviso": solo reaccionar al cambio de `screen` como ya hace con `idle`/`class`/`closing`.
- Degradación (T-193-39) ya cubierta server-side: si el admin borra/desactiva el aviso mientras el TV lo muestra, el próximo poll ya viene con `screen: "class"` (o `"idle"`) sin que el plan 13 tenga que manejar un `aviso: null` inesperado con `screen: "aviso"` (ese combo nunca ocurre — o hay aviso resuelto, o la pantalla ya cambió).
- Deuda anotada (no bloqueante, documentada arriba en "Issues Encountered"): rough edges de navegación (mismo-bloque-no-hace-nada, ANTERIOR/SIGUIENTE) durante la pantalla de aviso en el control — no afectan al render del plan 13, que solo consume el poll.

---

## Self-Check: PASSED

- `el-templo-api/src/modules/tv/types.ts` — FOUND
- `el-templo-api/src/modules/tv/schemas.ts` — FOUND
- `el-templo-api/src/modules/tv/service.ts` — FOUND
- `el-templo-api/test/tv/tv-aviso-screen.test.ts` — FOUND
- `el-templo-admin/src/tv/poll.ts` — FOUND
- `el-templo-admin/src/composables/useTvApi.ts` — FOUND
- `el-templo-admin/src/pages/TvControlPage.vue` — FOUND
- Commit `31238d24` — FOUND
- Commit `51d19ae3` — FOUND
- Commit `97affc7b` — FOUND
- `.planning/phases/193-comunicaciones/193-10-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_

## Nota del orquestador (post-plan)

Los dos "rough edges" (tocar el bloque en curso durante el aviso no volvía a la clase; ANTERIOR/SIGUIENTE partían de la posición 0) se saldaron en el commit `3e6ee9d1` de `et-193` (`buttonMatchesRole` compartido entre `isActiveButton` y `buttonIndex`; `requestBlockChange`/`sendBlockChange` tratan `aviso` como `closing`). Lint 0 errores, build admin OK.
