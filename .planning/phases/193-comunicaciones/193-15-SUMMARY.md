---
phase: 193-comunicaciones
plan: 15
subsystem: app
tags:
  [
    communications,
    avisos,
    tarjetas,
    mi-templo,
    carousel,
    pinia,
    vue,
    dry,
    referidos,
  ]

# Dependency graph
requires:
  - phase: 193-05
    provides: "GET /me/tarjetas (prompt-service.ts listTarjetas, D-15b) — ordenadas por sortOrder,id"
  - phase: 193-12
    provides: "useAvisosStore.ts (patrón evaluate/reportEvent), AvisoPromptDialog.vue (patrón de navegación whatsapp_sales/app_section)"
  - phase: 193-14
    provides: "TarjetasTab.vue admin — el orden que arma el staff en sortOrder es el que consume este plan tal cual"
provides:
  - "El carrusel premium de Mi Templo pasa a contenido del servidor: las 4 tarjetas fijas (mejoras/referidos/upsell/programa) muestran copy editable con fallback literal; las tarjetas libres del admin se suman después, midiendo clics (D-19)"
  - "useAvisosStore: tarjetas/loadTarjetas()/tarjetaByCode(code)/tarjetasLibres — segunda responsabilidad del store, sin frecuencia (D-15b) y sin reportar shown (D-19: solo clics)"
  - "AvisoCard.vue: tarjeta genérica del carrusel para avisos libres, clon estructural de ImprovementCtaCard.vue"
  - "aviso-navigation.ts: navigateToAvisoDestination — helper DRY para el switch whatsapp_sales/app_section, reusado en 5 puntos nuevos"
  - "API: GET /me/tarjetas (y /me/prompt) ahora expone `code` por fila — imprescindible para que la app mapee las 4 fijas (deviation, ver abajo)"
affects: [193-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fallback literal por computed: cada tarjeta fija usa `avisosStore.tarjetaByCode('card_*')?.campo ?? FALLBACK_CAMPO`, con las mismas constantes que hoy están hardcodeadas en cada componente — nunca un título/botón vacío si el servidor no responde"
    - "navigateToAvisoDestination(router, destination) centraliza el switch whatsapp_sales (→ /contacto-ventas?text=) / app_section (→ destination.route), mismo criterio que AvisoPromptDialog.vue (plan 12) pero extraído a util porque este plan sumó 5 puntos de llamada nuevos"
    - "Saltos de línea de copy editable (`\\n` real) se interpolan con {{ }} + `white-space: pre-line` en vez de <br/> hardcodeado — mismo mecanismo sirve para el fallback y para el copy del servidor, sin markup crudo"
    - "D-19 (tarjetas miden solo clics): loadTarjetas() NUNCA reporta 'shown', a diferencia de evaluate() (plan 12) que sí lo hace para los pop-ups"

key-files:
  created:
    - el-templo-app/src/modules/progression/components/AvisoCard.vue
    - el-templo-app/src/utils/aviso-navigation.ts
    - el-templo-app/src/utils/__tests__/aviso-navigation.test.ts
  modified:
    - el-templo-app/src/stores/useAvisosStore.ts
    - el-templo-app/src/stores/__tests__/avisos-store.test.ts
    - el-templo-app/src/modules/progression/components/ImprovementCtaCard.vue
    - el-templo-app/src/modules/progression/components/ReferralCtaCard.vue
    - el-templo-app/src/modules/progression/components/UpsellBadge.vue
    - el-templo-app/src/modules/programs/components/ProgramCtaCard.vue
    - el-templo-app/src/utils/ab-variant.ts
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-api/src/modules/communications/prompt-service.ts
    - el-templo-api/src/modules/communications/schemas.ts
    - el-templo-api/test/communications/prompt-endpoint.test.ts

key-decisions:
  - "Deviation (Rule 3 - blocking, ver abajo): se agregó `code: string | null` a PromptAviso (API y store) porque el contrato de plan 193-05 (GET /me/tarjetas) no lo exponía — sin ese campo, tarjetaByCode(code) era imposible de implementar tal como el plan lo pide."
  - "navigateToAvisoDestination extraído a util nuevo (fuera del <files> literal del plan) porque el mismo switch de 2 ramas se repetía 5 veces (AvisoCard + 4 fijas) — CLAUDE.md pide marcar la repetición agresivamente; el precedente del plan 12 (no extraer para 2 sitios) ya no aplicaba a esta escala."
  - "UpsellBadge/ProgramCtaCard: cuando el aviso de sistema existe, el clic navega a /contacto-ventas (mismo patrón D-03 que AvisoPromptDialog) en vez del window.open(buildWhatsAppUrl) de siempre; el window.open queda SOLO como fallback si el store no tiene la fila. Es un cambio de mecanismo de navegación (nueva pestaña → pantalla interna) condicionado a que el copy sea editable — documentado para el UAT del plan 17."
  - "ReferralCtaCard: el test A/B de copy (referralCopyVariant) se retira de la app; fallback = variante A literal (la que el seed de system-avisos.ts fija como copy base). El helper ab-variant.ts (app) queda en su archivo con comentario 'sin uso desde la fase 193 (D-15)' en vez de borrarse, tal como pide el plan — el backend (el-templo-api/.../referrals/ab-variant.ts, archivo DISTINTO) sigue calculando y persistiendo la variante para el registro de clics de referidos, que este plan no toca."
  - "ProgramCtaCard: título con \\n real (system-avisos.ts) + `white-space: pre-line` en vez del <br/> hardcodeado — mismo mecanismo de render para fallback y copy del servidor, sin introducir markup crudo."

patterns-established:
  - "aviso-navigation.ts queda disponible para cualquier futuro consumidor de avisos que necesite el mismo switch de destino (popup o tarjeta)."

requirements-completed: [COM-03]

# Metrics
duration: ~100min
completed: 2026-09-02
---

# Phase 193 Plan 15: Carrusel premium de Mi Templo como contenido del servidor Summary

**Las 4 tarjetas fijas del carrusel de Mi Templo (mejoras/referidos/upsell/programa) leen su copy de `GET /me/tarjetas` con fallback literal seguro; las tarjetas libres del admin se suman después, midiendo solo clics (D-19); el test A/B de copy de referidos queda retirado de la app.**

## Performance

- **Duration:** ~100 min
- **Tasks:** 3/3 (+ 1 fix previo de contrato de API)
- **Files modified:** 11 (3 nuevos + 8 modificados)

## Accomplishments

- **Fix previo (deviation, Rule 3):** `GET /me/tarjetas`/`GET /me/prompt` no exponían `code` — se agregó a `PromptAviso` (API), al schema JSON y a los tests (`prompt-endpoint.test.ts`, 13/13 verdes, `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0). Sin este fix, `tarjetaByCode(code)` (pedido explícito del plan) era irrealizable.
- `useAvisosStore.ts`: `tarjetas`/`loadTarjetas()`/`tarjetaByCode(code)`/`tarjetasLibres` — mismo criterio "una vez por apertura" que `evaluate()` (marca `tarjetasLoaded` ANTES del primer `await`), fail-open en error de red (deja `tarjetas: []`), y **nunca reporta `shown`** (D-19: las tarjetas miden solo clics, a diferencia de los pop-ups). `reset()` también limpia `tarjetas`/`tarjetasLoaded` para no arrastrar datos del socio anterior entre sesiones.
- `AvisoCard.vue` (nuevo): tarjeta genérica del carrusel para avisos libres, clon estructural 1:1 de las clases `exp-card-*` de `ImprovementCtaCard.vue`, badge "Aviso" (mismo texto que usa `AvisoPreview.vue` del admin), reporta `clicked` antes de navegar, sin `v-html`.
- `aviso-navigation.ts` (nuevo, DRY): `navigateToAvisoDestination(router, destination)` centraliza el switch `whatsapp_sales`(→ `/contacto-ventas?text=`)/`app_section`(→ ruta) — mismo patrón que `AvisoPromptDialog.vue` (plan 12), extraído porque este plan sumó 5 puntos de llamada nuevos.
- Las 4 tarjetas fijas (`ImprovementCtaCard`/`ReferralCtaCard`/`UpsellBadge`/`ProgramCtaCard`) leen título/subtítulo/botón de `avisosStore.tarjetaByCode('card_*')` con fallback al literal de hoy; reportan `clicked` y navegan al destino del servidor cuando la fila existe.
- `ReferralCtaCard.vue`: retira el test A/B de copy (`referralCopyVariant`) — fallback fijo a la variante A. `ab-variant.ts` (app) queda con comentario "sin uso desde la fase 193 (D-15)"; el backend (`el-templo-api/.../referrals/ab-variant.ts`, archivo distinto) sigue calculando la variante para `/members/referrals/cta-click`, intacto.
- `MiTemplo.vue`: `avisosStore.loadTarjetas()` en `onMounted` sin bloquear; `v-for` de `tarjetasLibres` DESPUÉS del slide de `showProgramCta` (D-15b); `premiumSlideCount` suma `tarjetasLibres.length`.
- Verificación: `pnpm -C el-templo-app lint` 0 errores (2 warnings preexistentes ajenos) tras cada task; `pnpm -C el-templo-app test` 167/169 (2 fallos preexistentes de `test/level-display.test.ts`, nivel `kairos`, sin relación); `pnpm -C el-templo-app build` (`quasar build`) OK, `dist/` no se agregó al commit.
- `grep -rn "referralCopyVariant" src` → 2 (comentario en `ReferralCtaCard.vue` + su propia definición en `ab-variant.ts`; cero imports/consumidores). `git diff` no toca `showUpsellBadge`/`showProgramCta` en ninguna task. `grep v-html`/`innerHTML` en todos los archivos nuevos/modificados de la app → vacío.

## Task Commits

Cada task se commiteó atómicamente en `feat/193-comunicaciones`, worktree `~/projects/et-193`:

0. **Fix previo (deviation, Rule 3): `code` en GET /me/tarjetas** - `79dce24f` (fix)
1. **Task 1: Carga de tarjetas en el store + tarjeta genérica** - `37bcd67c` (feat)
2. **Task 2: Las 4 fijas leen el copy del servidor** - `1db71b17` (feat)
3. **Task 3: Tarjetas libres en el carrusel** - `e63c161e` (feat)

**Plan metadata:** este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-app/src/stores/useAvisosStore.ts` - `tarjetas`/`loadTarjetas`/`tarjetaByCode`/`tarjetasLibres`, `code` sumado a `PromptAviso`
- `el-templo-app/src/stores/__tests__/avisos-store.test.ts` - +10 casos de tarjetas
- `el-templo-app/src/modules/progression/components/AvisoCard.vue` (nuevo) - tarjeta genérica de aviso libre
- `el-templo-app/src/utils/aviso-navigation.ts` (nuevo) - `navigateToAvisoDestination`
- `el-templo-app/src/utils/__tests__/aviso-navigation.test.ts` (nuevo) - 3 casos
- `el-templo-app/src/modules/progression/components/ImprovementCtaCard.vue` - copy editable + fallback
- `el-templo-app/src/modules/progression/components/ReferralCtaCard.vue` - copy editable, retira test A/B
- `el-templo-app/src/modules/progression/components/UpsellBadge.vue` - copy editable + fallback
- `el-templo-app/src/modules/programs/components/ProgramCtaCard.vue` - copy editable + fallback, `\n` vía `pre-line`
- `el-templo-app/src/utils/ab-variant.ts` - comentario "sin uso desde la fase 193 (D-15)"
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` - `loadTarjetas()` + `v-for` de libres + `premiumSlideCount`
- `el-templo-api/src/modules/communications/prompt-service.ts` - `code` en `PromptAviso`/`buildPromptAviso`
- `el-templo-api/src/modules/communications/schemas.ts` - `code` en `promptAvisoResponseProperties`
- `el-templo-api/test/communications/prompt-endpoint.test.ts` - test de `code` por fila

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: fix de contrato de API previo a las 3 tasks (deviation Rule 3, `code` faltante); `navigateToAvisoDestination` extraído a util nuevo por escala de repetición (DRY, 5 puntos); `UpsellBadge`/`ProgramCtaCard` cambian de mecanismo de navegación (window.open → /contacto-ventas) SOLO cuando el aviso de sistema existe; `ReferralCtaCard` retira el test A/B con fallback a variante A; `ProgramCtaCard` usa `\n` + `pre-line` en vez de `<br/>` hardcodeado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `GET /me/tarjetas` no exponía `code`, imprescindible para `tarjetaByCode(code)`**

- **Found during:** Antes de Task 1, al leer el contrato exacto de `prompt-service.ts`/`schemas.ts` (paso obligatorio de `<read_first>`/regla dura #6 del prompt de ejecución).
- **Issue:** El plan pide explícitamente que el store resuelva las tarjetas fijas por `avisosStore.tarjetaByCode('<code>')`. `PromptAviso` (interfaz de `prompt-service.ts`, plan 193-05) y `promptAvisoResponseProperties` (schema JSON) NO incluían `code` — la fila de DB sí lo tiene (`avisos.code`), pero `buildPromptAviso` nunca lo proyectaba a la respuesta. Sin este campo, distinguir las 4 fijas de las libres en la app era imposible salvo por heurísticas fràgiles (orden, título), que el propio plan descarta implícitamente al pedir `tarjetaByCode`.
- **Fix:** `code: string | null` sumado a la interfaz `PromptAviso`, a `buildPromptAviso` (toma `row.code`, ya seleccionado por el `.select()` existente, sin query extra) y al schema `promptAvisoResponseProperties` — afecta tanto `/me/tarjetas` como `/me/prompt` (comparten el mismo builder/schema), consistente con el resto del contrato.
- **Files modified:** `el-templo-api/src/modules/communications/prompt-service.ts`, `el-templo-api/src/modules/communications/schemas.ts`, `el-templo-api/test/communications/prompt-endpoint.test.ts`
- **Verification:** `tsc --noEmit` 0; `pnpm lint:tenant` DISCREPANCIAS 0; `timeout 580 pnpm exec vitest run --no-file-parallelism --hookTimeout=300000 test/communications/prompt-endpoint.test.ts` 13/13 verdes (11 preexistentes + 2 nuevas: `code` de sistema en las 4 fijas, `code: null` en la libre).
- **Committed in:** `79dce24f` (commit separado, antes de la Task 1 — es un fix de contrato, no una de las 3 tasks del plan).

**Total deviations:** 1 auto-fijada (Rule 3, bug de contrato de API que hubiera bloqueado la implementación literal del plan). Sin impacto negativo: el campo es puramente aditivo (`code: string | null`), no rompe ningún consumidor existente de `/me/prompt` (los 4 diálogos globales del plan 12 no leen `code`, confirmado por grep).

## Issues Encountered

Ninguno bloqueante. Los 3 gates de la API (tsc, lint:tenant, vitest del archivo específico) corrieron en foreground con `timeout: 600000` de la herramienta Bash, dentro de lo esperado (~117s la corrida de vitest). `pnpm -C el-templo-app build` corrió en foreground con `timeout: 600000` (~40-60s reales), `dist/` no quedó trackeado (gitignored, confirmado por `git status --short`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness — puntos para el UAT del plan 193-17

1. **Retiro del test A/B de copy de referidos:** `ReferralCtaCard.vue` ya no elige título por paridad de `user.id` — siempre muestra el copy editable del servidor (o el fallback = variante A histórica). Confirmar con Franco si el test A/B queda formalmente cerrado (y si conviene borrar `el-templo-app/src/utils/ab-variant.ts` en un plan futuro) o si hay intención de reactivar variantes de copy más adelante vía el editor de avisos del admin (que ya permite editar el título libremente, aunque sin lógica de bucketing).
2. **Cambio de mecanismo de navegación en UpsellBadge/ProgramCtaCard:** cuando el aviso de sistema `card_upsell`/`card_program` existe (que es el caso normal en cualquier tenant migrado, migración 0217), el clic ahora navega a la pantalla interna `/contacto-ventas` (con salto automático a WhatsApp, D-03) en vez de abrir WhatsApp directo en una pestaña nueva (`window.open`). Confirmar en el UAT que el salto automático funciona bien en los dispositivos de prueba — el fallback `window.open` solo se ve si el admin borra/pausa esas 2 tarjetas de sistema.
3. **Copy inicial:** el copy que verá el socio hoy es idéntico al hardcodeado de siempre (migración 0217 sembró el literal exacto verificado en el plan 193-03) — cambiar el título de una tarjeta desde `TarjetasTab.vue` (admin) debería reflejarse en la app sin build ni deploy (criterio de éxito del plan). Vale la pena que el UAT pruebe explícitamente ese caso (editar una tarjeta en el admin → verificar en la app).
4. **Tarjetas libres:** no hay ninguna sembrada por ahora (solo las 4 de sistema); el UAT debería crear una tarjeta libre de prueba desde el admin y verificar que aparece DESPUÉS de las fijas visibles en el carrusel, con los dots contando bien.

Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 4 commits nuevos (1 fix + 3 tasks) sobre `690c4529` (HEAD de la 14).

---

## Self-Check: PASSED

- `el-templo-app/src/stores/useAvisosStore.ts` — FOUND (con `loadTarjetas`/`tarjetaByCode`/`tarjetasLibres`)
- `el-templo-app/src/modules/progression/components/AvisoCard.vue` — FOUND
- `el-templo-app/src/utils/aviso-navigation.ts` — FOUND
- `el-templo-app/src/modules/progression/components/ImprovementCtaCard.vue` — FOUND (copy editable)
- `el-templo-app/src/modules/progression/components/ReferralCtaCard.vue` — FOUND (sin `referralCopyVariant` importado)
- `el-templo-app/src/modules/progression/components/UpsellBadge.vue` — FOUND (copy editable)
- `el-templo-app/src/modules/programs/components/ProgramCtaCard.vue` — FOUND (copy editable)
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` — FOUND (con `tarjetasLibres` en el carrusel)
- `el-templo-api/src/modules/communications/prompt-service.ts` — FOUND (con `code`)
- Commit `79dce24f` — FOUND
- Commit `37bcd67c` — FOUND
- Commit `1db71b17` — FOUND
- Commit `e63c161e` — FOUND
- `.planning/phases/193-comunicaciones/193-15-SUMMARY.md` — FOUND (este archivo)

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
