---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 09
subsystem: campaigns
tags: [campaigns, email, mjml, maps, vitest]
status: completed

# Dependency graph
requires:
  - phase: 180-08
    provides: "send() firma tokens purpose:'login' y usa el segmento persistido; deepLinkForToken resuelve el destino por segmento en /track/click"
  - phase: 180-02
    provides: "buildMapsUrl (shared/maps.ts) — fuente única de construcción del link de Maps en la API"
provides:
  - "CampaignService.loadSedes() incluye mapsUrl por sede (mismo buildMapsUrl que usa la app), listo para el template"
  - "templates.ts documenta explícitamente (D-06/D-07/D-10/T-180-43) que hay un solo CTA primario y la tabla de sedes es informativa"
  - "test/campaigns-template.test.ts — 8 tests reales reemplazando el RED scaffold (it.todo) de la fase 119"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bulletproofButton() emite un href DUPLICADO por diseño (VML <v:roundrect> para Outlook + <a> real para el resto) — el conteo semánticamente correcto de 'un solo CTA' es sobre el <a href> real, no sobre el string crudo del href (que da 2)"
    - "Tests de render de email deben re-aplicar el mismo esc() de contexto-atributo del template al construir el href esperado (una URL con & en el query string, como un mapsUrl de Google Maps, sale como &amp; en el HTML)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/templates.ts
    - el-templo-api/test/campaigns-template.test.ts

key-decisions:
  - "El código de templates.ts YA cumplía D-06 antes de este plan (un solo botón primario vía bulletproofButton para el magic link, WhatsApp como único secundario, sedeRow() sin link de reserva por fila) — no hubo que eliminar nada. El único cabo suelto real era que loadSedes() nunca poblaba mapsUrl (Task 1); Task 2 se limitó a documentar el diseño existente con comentarios ancorados a D-06/D-07/T-180-43 para que un plan futuro no reintroduzca un CTA por sede"
  - "El acceptance criteria del plan pedía 'grep -c r/trial == 0' — mi primer borrador del comentario de Task 2 mencionaba '/r/trial-style reservation link' y rompía ese grep; se corrigió la redacción del comentario antes de commitear (ver Deviations)"
  - "El acceptance criteria de Task 3 pedía 'UNA sola ocurrencia del href del CTA primario (conteo exacto)' pero bulletproofButton() estructuralmente emite el mismo href DOS veces (VML fallback + <a> real) — la aserción se hizo sobre el <a href> real (el único que renderiza un cliente no-Outlook), que da exactamente 1; documentado en el docblock del test"

requirements-completed: [ML-01, RES-01]

# Metrics
duration: ~55min
completed: 2026-08-23
---

# Fase 180 Plan 09: CTA único + sedes informativas en el email de campaña Summary

**`loadSedes()` ahora provee `mapsUrl` por sede vía `buildMapsUrl` (mismo helper que la app), el template queda documentado como cumpliendo D-06 (un solo CTA primario, WhatsApp secundario, sedes sin link de reserva) y el RED scaffold de tests de Phase 119 se reemplaza por 8 tests reales sobre el HTML renderizado.**

## Performance

- **Duration:** ~55 min (3 tasks)
- **Completed:** 2026-08-23
- **Tasks:** 3/3 ejecutados
- **Files modified:** 3 (0 nuevos, 3 modificados)

## Accomplishments

- `CampaignService.loadSedes()` deriva `mapsUrl` con `buildMapsUrl(r.address)` (el MISMO helper de `shared/maps.ts` que usa el endpoint de branches de la app) en vez de construir la URL a mano; se omite la key `mapsUrl` (nunca se escribe `undefined` explícito) cuando `buildMapsUrl` devuelve `null` — mismo patrón de spread condicional que `CreateCampaignInput.segment` del plan 180-08.
- `templates.ts` recibe 3 comentarios de documentación (docblock del módulo, `sedeRow()`, y el armado de `primaryCta`) ancorando explícitamente el diseño existente a D-06/D-07/D-10 y T-180-43 — el código YA tenía un solo CTA primario y `sedeRow()` YA renderizaba solo nombre+dirección+"Cómo llegar" sin link de reserva por fila; sin cambio de comportamiento.
- `test/campaigns-template.test.ts` reemplaza el RED scaffold de 4 `it.todo` de la fase 119 por 8 tests reales sobre `trialCampaignHtml()`: un solo `<a href>` para el CTA primario (conteo exacto), WhatsApp secundario presente, una fila por sede con su `mapsUrl`, una sede sin dirección sin link de Maps, ningún link de reserva por fila, escapado de `<script>`/`&`/comillas en headline/subheadline/body, escapado de la dirección de sede, y el fallback VML para Outlook (D-16).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: `loadSedes` provee dirección y link de Maps** - `a0348b00` (feat)
2. **Task 2: CTA único en el template + tabla de sedes informativa** - `46ea2a08` (feat)
3. **Task 3: Test de render del template** - `57289759` (test)

## Files Created/Modified

- `el-templo-api/src/modules/campaigns/service.ts` - `loadSedes()` importa `buildMapsUrl` de `shared/maps.ts` y lo usa para derivar `mapsUrl` por sede
- `el-templo-api/src/modules/campaigns/templates.ts` - comentarios de documentación (D-06/D-07/D-10/T-180-43) en el docblock del módulo, `sedeRow()` y el armado del `primaryCta`; sin cambios de comportamiento
- `el-templo-api/test/campaigns-template.test.ts` - reescrito completo: de RED scaffold (4 `it.todo`) a 8 tests reales sobre `trialCampaignHtml()`

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: el template YA cumplía D-06 antes de este plan (fue construido así desde su origen en la fase 119/180-06), así que Task 2 no tuvo trabajo de código real — se documentó el diseño existente para fijarlo como contrato explícito.

## Deviations from Plan

**1. [Rule 1 - bug propio, corregido antes de commitear] El primer borrador del comentario de Task 2 rompía el acceptance criteria `grep -c "r/trial" == 0`**

- **Found during:** Task 2, verificación de criterios de aceptación tras editar `templates.ts`
- **Issue:** el docblock que agregué sobre `sedeRow()` mencionaba textualmente `` `/r/trial`-style reservation link `` para explicar qué NO se renderiza — el propio comentario introducía el string `r/trial` que el acceptance criteria exige en cero apariciones (verificando que no quedó ningún link de reserva legacy)
- **Fix:** se reformuló el comentario a "per-row booking/reservation link" (mismo significado, sin el literal `r/trial`)
- **Files modified:** `el-templo-api/src/modules/campaigns/templates.ts`
- **Verificación:** `grep -c "r/trial" el-templo-api/src/modules/campaigns/templates.ts` → 0 (antes de commitear)
- **Commit:** incluido en `46ea2a08` (corregido antes de commitear, no generó un commit adicional)

**2. [Rule 1 - interpretación del acceptance criteria de Task 3, no del código] "UNA sola ocurrencia del href" se verificó sobre el `<a href>` real, no sobre el string crudo**

- **Found during:** Task 3, al construir el test que debía afirmar "UNA sola ocurrencia del href del CTA primario (conteo exacto, no toContain)"
- **Issue:** `bulletproofButton()` (D-16, patrón bulletproof-button estándar para email) emite el MISMO href DOS veces por diseño: un `<v:roundrect href="...">` envuelto en `<!--[if mso]>...<![endif]-->` para el fallback de Outlook, y un `<a href="...">` real para el resto de los clientes. Contar el string crudo del href en el HTML compilado da 2, no 1 — verificado con un script ad-hoc (`node --experimental-strip-types`) antes de escribir el test, no es un bug de `templates.ts`, es la naturaleza del patrón VML+HTML.
- **Fix:** el test cuenta específicamente ocurrencias de `<a href="...">` (el anchor real, el único que un cliente no-Outlook renderiza), que da exactamente 1 — semánticamente esto es "un solo CTA primario", que es lo que D-06/T-180-43 exigen; el fallback VML de Outlook no es un segundo CTA, es la MISMA acción con dos renderizados posibles según el cliente
- **Files modified:** `el-templo-api/test/campaigns-template.test.ts` (docblock explica la razón)
- **Verificación:** `pnpm exec vitest run --no-file-parallelism test/campaigns-template.test.ts` → 8/8 verde
- **Commit:** incluido en `57289759` (Task 3)

**3. [Rule 1 - bug propio de test, corregido antes de commitear] `mapsUrl` con `&` en el query string no matcheaba el href crudo esperado**

- **Found during:** Task 3, primera corrida del test "renders exactly one row per sede provided"
- **Issue:** los `mapsUrl` de prueba (URLs de Google Maps del tipo `?api=1&query=...`) contienen un `&` literal — `sedeRow()` los interpola con el mismo `esc()` de contexto-atributo del template, que convierte `&` → `&amp;` antes de entrar al HTML. Mi helper `countAnchorHref` buscaba el href SIN escapar, así que 0 matches en vez de 1
- **Fix:** se agregó `htmlAttrEscape()` en el test (réplica local del `esc()` del template) y se aplica al href esperado antes de construir el regex de búsqueda
- **Files modified:** `el-templo-api/test/campaigns-template.test.ts`
- **Verificación:** `pnpm exec vitest run --no-file-parallelism test/campaigns-template.test.ts` pasó de 7/8 a 8/8 verde
- **Commit:** incluido en `57289759` (Task 3, corregido antes de commitear)

---

**Total deviations:** 3, todas menores y de infraestructura de verificación (redacción de comentario, semántica del acceptance criteria, escaping en el test). Ninguna tocó comportamiento de producto. Ninguna requirió decisión arquitectural (Rule 4).

## Issues Encountered

Ninguno bloqueante fuera de lo documentado en Deviations.

## Verification

- `pnpm exec tsc --noEmit` → exit 0 (corrido después de cada task).
- `pnpm lint:tenant` → **DISCREPANCIAS: 0** (corrido después de Task 1 y al cierre del plan; `tenant-lint-allowlist.json` nunca se tocó).
- `pnpm exec vitest run --no-file-parallelism test/campaigns-template.test.ts` → **8/8 tests verdes** (Task 3).
- `pnpm exec vitest run --no-file-parallelism test/campaigns-template.test.ts test/campaigns-send.test.ts` → **20/20 tests verdes** (`<verification>` completa del plan).
- Acceptance criteria de las 3 tasks verificados con los greps/comandos exactos que pide el plan: `buildMapsUrl` en `service.ts` (3 apariciones) y `maps/search` (0); `bulletproofButton`/`esc(`/`mapsUrl` en `templates.ts` (3/12/3) y `r/trial` (0); `campaigns-template.test.ts` con 8 tests, uno con "esc" en el nombre afirmando que `<script>` no sale crudo, uno afirmando conteo exacto (`toBe(1)`, no `toContain`) del href del CTA primario.
- `git status --short` vacío tras cada commit; solo 3 commits creados, todos con `git add` por ruta explícita; sin deletions inesperadas en ningún commit.

## User Setup Required

None — no se instaló ningún paquete (MJML v5 ya estaba, aprobado en la 119), no hay variables de entorno nuevas, no hay migración nueva.

## Next Phase Readiness

- El pipeline de render del email de campaña queda completo y fijado por tests: `loadSedes()` provee `mapsUrl` idéntico al de la app, el template tiene un único CTA primario documentado, y la tabla de sedes es puramente informativa.
- El render real en clientes de correo queda pendiente del checkpoint del plan 180-16 ("Enviar email de prueba" del admin), tal como indica el `<verification>` del plan — no es responsabilidad de este plan.
- Sin bloqueos. El worktree `et-180` sigue con `node_modules`/`.env` local operativos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/campaigns/service.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/templates.ts (worktree et-180)
- FOUND: el-templo-api/test/campaigns-template.test.ts (worktree et-180)
- FOUND: commit a0348b00 (feat, Task 1)
- FOUND: commit 46ea2a08 (feat, Task 2)
- FOUND: commit 57289759 (test, Task 3)
- FOUND: este SUMMARY.md en el checkout principal (NO commiteado, per instrucciones)
