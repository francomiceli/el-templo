---
phase: 193-comunicaciones
plan: 13
subsystem: api+admin
tags: [communications, tv, avisos, fastify, drizzle, vitest, vue, dom, tenancy]

# Dependency graph
requires:
  - phase: 193-07
    provides: "TvAvisosService.getActiveForBranch (criterio de alcance por scopeBranchIds) + tv_avisos.mode (manual|flex_inicio|flex_final)"
  - phase: 193-10
    provides: "screen 'aviso' en el contrato de tv_class_state + GET /control/screen ya resolviendo aviso {id,title,body}|null en modo manual, botón AVISO en TvControlPage.vue"
provides:
  - "buildPollPayload agrega el aviso de reemplazo (flex_inicio en idle, flex_final en closing) al payload existente, manteniendo screen tal cual — D-28"
  - "TvService.resolveReplacementAviso: mismo criterio de scopeBranchIds que TvAvisosService.getActiveForBranch, sin depender de un TenantContext de request"
  - "pantallaAviso en TvScreenPage.vue: única de las tres pantallas de transición con velo dinámico (día/noche vía CSS puro, dos logos superpuestos)"
  - "paintAviso + avisoVeloFor en render.ts: despacho unificado para los tres modos (manual, reemplazo inicio, reemplazo final) sobre el MISMO componente"
affects: [193-16, 193-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Query de reemplazo con filtro literal por tenantId (sin tenantWhere/TenantContext) cuando el caller no tiene un request.scope a mano — mismo criterio que resolveAviso (plan 10), documentado inline para que lint:tenant y un lector futuro entiendan por qué no es tenantWhere(...)"
    - "Un solo componente DOM para 3 disparadores de UI distintos (manual + 2 modos de reemplazo): decisión de diseño documentada inline en renderState en vez de tres rutas de pintado divergentes — evita escribir texto libre dentro de nodos semánticamente tipados (capKicker/capEjercicio/capCue = 'NOTAS TÉCNICAS')"
    - "Detección de transición de CONTENIDO (no solo de `screen` literal) en un render de poll: un campo opcional (aviso) puede aparecer/desaparecer sin que el campo discriminante (screen) cambie — el guard de limpieza de timeouts se amplía a screenChanged || avisoToggled"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/tv/service.ts
    - el-templo-api/test/tv/tv-aviso-screen.test.ts
    - el-templo-admin/src/pages/TvScreenPage.vue
    - el-templo-admin/src/tv/render.ts

key-decisions:
  - "Modo reemplazo (D-28) implementado REUSANDO la MISMA pantallaAviso/paintAviso del modo manual (D-25), en vez de escribir el texto del aviso dentro de los nodos existentes de la cápsula técnica (capKicker/capEjercicio/capCue) o de la frase de cierre. Razón: esos nodos están semánticamente tipados ('NOTAS TÉCNICAS', ejercicio+cue+músculos) y forzar un aviso genérico ahí exigía además re-etiquetar o esconder el kicker — fuera del alcance explícito del plan. La placa dedicada ya resuelve exactamente D-28 ('el texto ocupa el lugar de la cápsula/frase': la pantalla sigue siendo idle/closing a nivel de datos — el `screen` del poll no cambia — pero visualmente la placa reemplaza por completo lo que se estaba mostrando) con un único código de pintado para los tres casos (DRY)."
  - "Velo día/noche de la placa: idle=día y closing=noche son deterministicos (no necesitan estado). El modo manual es el único ambiguo (el botón AVISO puede dispararse desde CUALQUIER punto de la tira del control, incluida la flexibilidad inicial) — resuelto con `lastNonAvisoScreen`, la última pantalla no-aviso vista, sin pedirle nada nuevo a la API."
  - "resolveReplacementAviso vive en TvService (no reusa TvAvisosService.getActiveForBranch) porque el poll no tiene un TenantContext de request: corre con branch.tenantId ya resuelto por buildPollPayload. Mismo criterio de alcance por sede (scopeBranchIds NULL/vacío = todas) reimplementado en 15 líneas, documentado inline, filtro literal por tenantId (mismo patrón que resolveAviso del plan 10, no tenantWhere)."
  - "Detección de transición ampliada (screenChanged || avisoToggled) en renderState: sin esto, un aviso de reemplazo que aparece o desaparece mientras `screen` sigue siendo 'idle'/'closing' quedaría hasta 250ms sin repintar (el guard original solo miraba `previo.screen !== payload.screen`)."

requirements-completed: [COM-04]

# Metrics
duration: ~70min
completed: 2026-09-02
---

# Phase 193 Plan 13: El aviso se ve en el televisor (D-25/D-27/D-28) Summary

**Placa de aviso a pantalla completa (Cinzel/oro/velo, mismo componente para los 3 modos) que el poll `GET /control/screen` alimenta tanto en modo manual (`screen:'aviso'`) como en modo reemplazo sobre `idle`/`closing` (D-28), con una sola query extra por poll y velo día/noche resuelto en CSS puro.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- `TvService.buildPollPayload`: la rama `idle` (sin sesión aprobada / sin clase iniciada) agrega el aviso activo `mode:'flex_inicio'` de la sede, y la rama `closing` agrega el `mode:'flex_final'`, sin tocar `screen` — el poll sigue devolviendo `idle`/`closing` tal cual, solo con `aviso` poblado. Una sola query extra, únicamente en esas dos ramas (la rama de clase no la ejecuta).
- `resolveReplacementAviso` (privado, `TvService`): mismo criterio de alcance por sede (`scopeBranchIds` NULL/vacío = todas las sedes) que `TvAvisosService.getActiveForBranch`, reimplementado porque el poll no tiene un `TenantContext` de request — filtro literal por `tenantId`, mismo patrón que `resolveAviso` (plan 10).
- 4 casos nuevos en `tv-aviso-screen.test.ts`: flex_inicio en idle, flex_final en closing, un aviso `manual` NO aparece como reemplazo, y un aviso con `scopeBranchIds` de otra sede no aparece. Se agregó `afterAll` con limpieza de `tv_avisos` — sin esto, un aviso activo creado por el último test del archivo hubiera quedado vivo para los archivos de `test/tv/` que corren después en el mismo proceso (`tv_avisos` no está en `TABLES_TO_CLEAN`, L3 de la fase) y hubiera roto sus aserciones `aviso: null`.
- `TvScreenPage.vue`: nodo `pantallaAviso` hermano de `pantallaReposo`/`pantallaCierre`, misma estructura (foto+velo, glow, marco frase|identidad) — la única de las tres con velo dinámico, resuelto con dos `<img>` superpuestos (`.transLogo--dia`/`--noche`) mostrados con CSS puro vía el mismo selector `.pantalla--dia` que ya alterna `render.ts`. `avisoTitulo` (derivado de `.cierreTitulo`) y `avisoCuerpo` (derivado de `.quote`), sin `white-space:nowrap` en el título (texto libre del admin, no una etiqueta fija).
- `render.ts`: `paintAviso` (texto plano vía `setText`, sin animación de encendido por palabra — el aviso no rota como la frase/cápsula) + `avisoVeloFor` (día si `idle`, noche si `closing`, `lastNonAvisoScreen` si `aviso` manual) + despacho en `renderState` (detecta transición de `screen` O de presencia de `aviso`, nunca deja convivir dos pantallas de transición) + rama nueva en `tickClock`.
- Verificación: `test/tv/` 152/152 (8 archivos), `tsc --noEmit` 0, `pnpm lint:tenant` DISCREPANCIAS: 0, `pnpm -C el-templo-admin lint` 0 errores (8 warnings preexistentes ajenos), `pnpm -C el-templo-admin build` OK, `grep innerHTML render.ts` sin coincidencias de código real.

## Task Commits

Cada task se commiteó atómicamente en `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Modo reemplazo en la API (flexibilidad inicial y final)** - `de9ac1c1` (feat)
2. **Task 2: Nodos y estilos de la placa de aviso** - `7e20aa3d` (feat)
3. **Task 3: paintAviso y despacho en render.ts** - `94010dd4` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/modules/tv/service.ts` - aviso de reemplazo en `buildPollPayload` (idle/closing) + `resolveReplacementAviso`
- `el-templo-api/test/tv/tv-aviso-screen.test.ts` - 4 tests nuevos (6a-6d) + `afterAll` cleanup
- `el-templo-admin/src/pages/TvScreenPage.vue` - `pantallaAviso` (nodos + CSS, velo dinámico)
- `el-templo-admin/src/tv/render.ts` - `paintAviso`, `avisoVeloFor`, despacho en `renderState`/`tickClock`

## Decisions Made

Ver `key-decisions` en el frontmatter: (1) modo reemplazo reusa la placa del modo manual en vez de escribir sobre los nodos de la cápsula técnica; (2) velo día/noche del modo manual resuelto con `lastNonAvisoScreen`; (3) `resolveReplacementAviso` vive en `TvService`, no reusa `TvAvisosService`; (4) detección de transición ampliada a `screenChanged || avisoToggled`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El comentario de `paintAviso` mencionaba literalmente "innerHTML", dando un falso positivo en el grep de verificación del plan**

- **Found during:** Task 3, verificación final (`grep -n "innerHTML" render.ts` del `<verification>` del plan)
- **Issue:** El docblock de `paintAviso` documentaba la mitigación de T-193-48 mencionando la palabra `innerHTML` (para explicar qué NO se usa) — el grep del plan busca esa cadena literal para confirmar que no se introdujo HTML crudo, y no distingue comentario de código. Mismo tipo de trampa que 193-11 (fix `aed7ed13`, "evitar falso positivo del grep de v-html en el comentario de AvisoPreview").
- **Fix:** Reescrito el comentario para decir "HTML crudo" en vez de nombrar la API `innerHTML` literalmente. El comportamiento del código no cambió (seguía sin usar `innerHTML` desde el principio).
- **Files modified:** `el-templo-admin/src/tv/render.ts`
- **Verification:** `grep -n "innerHTML" render.ts` sin coincidencias.
- **Committed in:** `94010dd4` (Task 3 commit — corregido antes de commitear, no generó un commit extra)

---

**Total deviations:** 1, auto-fijada antes de commitear (no generó un commit extra). No tocó archivos fuera del alcance del plan.
**Impact on plan:** Ninguno sobre el objetivo — ajuste cosmético de un comentario para no interferir con la verificación automatizada del propio plan.

## Issues Encountered

Ninguno bloqueante. `pnpm exec vitest run --no-file-parallelism --hookTimeout=300000 test/tv/` (8 archivos, 152 tests, ~185s por la provisión del DB de test) se movió a background automáticamente por exceder los 120s del timeout por defecto de la herramienta Bash (no se usó `run_in_background` explícitamente ni loops de espera con `pgrep`; se recuperó el resultado leyendo el output persistido tras la notificación del harness, mismo patrón documentado en SUMMARYs previos de la fase). El orden de ejecución de los 8 archivos de `test/tv/` NO fue alfabético en esta corrida (`tv-control` → `tv-service` → `tv-aviso-screen` → resto) — se agregó de todos modos la limpieza en `afterAll` de `tv-aviso-screen.test.ts` porque el orden de vitest no está garantizado entre corridas y `tv_avisos` no tiene limpieza automática (L3).

Nota de diseño verificada empíricamente: el contrato documentado por el plan 10 ("`aviso:null` con `screen:'aviso'` nunca ocurre") se sostiene también para las ramas nuevas — cuando `resolveReplacementAviso` no encuentra match, `aviso` queda `null` pero `screen` NUNCA se fuerza a `'aviso'` en esos casos (sigue siendo `idle`/`closing` con `aviso:null`, el combo que sí es válido y ya estaba cubierto por los tests del plan 10).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Contrato exacto para el plan 16 (tab admin "Avisos en TV" de Comunicaciones) — literales de `mode` y qué significa cada uno en pantalla:**

- **`"manual"`** — el aviso NO aparece solo. El coach lo dispara a mano desde el botón AVISO en la tira de bloques del control (`TvControlPage.vue`, plan 10) en cualquier momento durante la clase (o desde el extremo de flexibilidad inicial, si `sessionApproved` ya es true). En el TV se ve a **pantalla completa**, tapando lo que se estuviera mostrando (bloque en curso, capsula o frase), con el velo que corresponda al momento en que se disparó (crema si venía de la flexibilidad inicial / antes de que arranque la clase, charcoal en cualquier otro caso — clase en curso o cierre). Sale SOLO cuando el coach avanza a otro bloque o pantalla (D-26, sin timer, sin confirmación).
- **`"flex_inicio"`** — el aviso NO se dispara: aparece automáticamente cada vez que el TV está en la pantalla de **flexibilidad inicial** (antes de que arranque la clase, o cuando no hay sesión aprobada hoy — pantalla `idle`/reposo, velo crema). Ocupa el lugar exacto de la cápsula de técnica que rota normalmente ahí. Desaparece solo (vuelve a mostrarse la cápsula) en cuanto se desactiva el aviso o arranca la clase.
- **`"flex_final"`** — mismo mecanismo que `flex_inicio` pero para la pantalla de **cierre** (después de terminar la clase, velo charcoal, "SESIÓN COMPLETA"). Ocupa el lugar de la frase que rota ahí. Desaparece solo al desactivar el aviso o al terminar la clase (`end-class`, vuelve a reposo).
- Los tres modos son **mutuamente excluyentes por diseño de UI** (el editor del plan 16 debería dejarlo claro: un aviso tiene UN modo, no una combinación) — el mismo aviso no puede ser "manual y reemplazo" a la vez; si el admin quiere las dos cosas necesita dos avisos.
- **Alcance de sede** (`scopeBranchIds`, ya cubierto por el CRUD del plan 07): aplica igual en los tres modos — `NULL`/`[]` = todas las sedes del tenant, si no, solo las sedes listadas. Esto YA estaba resuelto por el plan 07/10 para el modo manual; este plan lo extendió a `flex_inicio`/`flex_final` con el mismo criterio (test 6d).
- **Sin lógica adicional pendiente para el plan 16**: el tab admin es puramente el CRUD (crear/editar/activar/desactivar/borrar) que ya expone el plan 07 — no necesita tocar `TvControlPage.vue` ni `TvScreenPage.vue`/`render.ts`, que ya están completos con este plan.

Deuda anotada (no bloqueante, fuera de alcance explícito): el UAT del plan 17 sobre el TV real debe verificar visualmente el tamaño de fuente de `avisoCuerpo` (heredado de `.quote`, 3.85rem) con un cuerpo de aviso largo (hasta 400 caracteres, el máximo del schema) — el plan pidió explícitamente reusar "mismos tamaños" que `.quote`, pensado para frases cortas; un aviso muy largo podría desbordar visualmente y necesitar un ajuste de tamaño en un plan de seguimiento (T-193-51 ya cubre la verificación en TV real como mitigación general).

---

## Self-Check: PASSED

- `el-templo-api/src/modules/tv/service.ts` — FOUND
- `el-templo-api/test/tv/tv-aviso-screen.test.ts` — FOUND
- `el-templo-admin/src/pages/TvScreenPage.vue` — FOUND
- `el-templo-admin/src/tv/render.ts` — FOUND
- Commit `de9ac1c1` — FOUND
- Commit `7e20aa3d` — FOUND
- Commit `94010dd4` — FOUND
- `.planning/phases/193-comunicaciones/193-13-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
