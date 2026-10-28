---
phase: 193-comunicaciones
plan: 09
subsystem: app
tags:
  [communications, whatsapp, push, fcm, destination, vue-router, pinia, vitest]

# Dependency graph
requires:
  - phase: 193-01
    provides: "destinations.ts (APP_SECTIONS, resolveDestinationRoute, CONTACT_SALES_ROUTE, FALLBACK_ROUTE, DEFAULT_WHATSAPP_TEXT) — espejo tipado, no redeclarado"
  - phase: 193-05
    provides: "GET /me/config ({ salesWhatsappNumber, defaultWhatsappText })"
  - phase: 193-06
    provides: "payload FCM (route/notificationId/destination/destinationSection/whatsappText) armado por buildPushData"
provides:
  - "utils/whatsapp.ts: setServerSalesNumber/resetWhatsAppOverridesForTests — el número de ventas del servidor gana sobre el mapa hardcodeado AR/ES, sin tocar la firma de buildWhatsAppUrl ni sus 9 call sites (D-21)"
  - "useCommunicationsStore (Pinia setup): loadConfig() hidrata salesNumber/defaultWhatsappText desde GET /communications/me/config y alimenta setServerSalesNumber; fail-open al hardcode si falla"
  - "ContactoVentasPage.vue + ruta /contacto-ventas: salto automático a WhatsApp con botón de respaldo si window.open es bloqueado (D-03)"
  - "resolveTapRoute (push-notifications.ts, pura y exportada): resuelve el destino del tap de una push en el orden whatsapp_sales > app_section conocida > route > /mi-templo, nunca undefined/vacío (D-03/D-04)"
affects: [193-12, 193-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Estado de módulo (no reactive/store) para el override de número de WhatsApp: utils/whatsapp.ts es un util puro consumido por 9 call sites sin store — setServerSalesNumber muta una variable de módulo, mismo criterio de 'módulo puro compartido' de destinations.ts (fase 01/06)"
    - "watch(() => authStore.isAuthenticated, ..., { immediate: true }) en MainLayout.vue para loadConfig() — mismo patrón exacto que los 4 diálogos globales (PlanExpiryDialog, RatingPromptDialog, ImprovementPromptDialog), cubre boot con token persistido Y login/register recién hecho sin duplicar lógica en boot/auth.ts ni en useAuthStore"
    - "resolveTapRoute extraída como función pura exportada del boot file — mismo criterio que buildPushData en la API (fase 06): lógica de resolución testeable sin mockear Capacitor/router"

key-files:
  created:
    - el-templo-app/src/stores/useCommunicationsStore.ts
    - el-templo-app/src/pages/ContactoVentasPage.vue
    - el-templo-app/src/utils/__tests__/whatsapp.test.ts
    - el-templo-app/src/boot/__tests__/push-destination.test.ts
  modified:
    - el-templo-app/src/utils/whatsapp.ts
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/router/routes.ts
    - el-templo-app/src/boot/push-notifications.ts

key-decisions:
  - "loadConfig() se llama desde un watcher de authStore.isAuthenticated en MainLayout.vue (no desde boot/auth.ts ni useAuthStore.login()/register()) — MainLayout es el único punto siempre montado con sesión activa, cubre boot-con-token-persistido y login/register-recién-hecho en un solo lugar sin duplicar la llamada en los dos flujos de hidratación del perfil que ya existen por separado."
  - "resolveTapRoute vive en push-notifications.ts (no en config/destinations.ts) porque su regla 3 (fallback a data.route, no a FALLBACK_ROUTE directo) es específica del tap de push y distinta de resolveDestinationRoute (que siempre cae a FALLBACK_ROUTE). Reusa APP_SECTIONS/CONTACT_SALES_ROUTE/FALLBACK_ROUTE del espejo, no reimplementa la lista curada."
  - "ContactoVentasPage.vue resuelve el texto de WhatsApp con la cascada ?text= de la query > defaultWhatsappText del store > DEFAULT_WHATSAPP_TEXT del espejo — el store puede no haber terminado de hidratar (fetch async) cuando la página monta, así que el default del espejo es la red de seguridad final."

patterns-established:
  - "Pinia setup store 'communications': mismo shape que useNotificationStore (ref + acción async con try/catch fail-open), listo para que el plan 12 (pop-up único) y el 15 (carrusel) agreguen más state al mismo store en vez de crear uno nuevo — ver 'Next Phase Readiness'."

requirements-completed: [COM-01]

# Metrics
duration: ~55min
completed: 2026-09-02
---

# Phase 193 Plan 09: Destino común en la app (número de ventas + /contacto-ventas + tap de push) Summary

**La app de socios aprende el destino común: `setServerSalesNumber` hace que el número de ventas del servidor gane sobre el mapa hardcodeado AR/ES sin tocar los 9 consumidores de `buildWhatsAppUrl`; `/contacto-ventas` salta directo a WhatsApp con botón de respaldo si el pop-up se bloquea; `resolveTapRoute` resuelve el tap de una push en el orden whatsapp_sales > sección curada > route > `/mi-templo`, nunca un 404.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3
- **Files modified:** 8 (4 nuevos + 4 modificados)

## Accomplishments

- `utils/whatsapp.ts`: `setServerSalesNumber` (fail-closed, solo `^[0-9]{8,15}$`) y `resetWhatsAppOverridesForTests`; `getWhatsAppNumber` prefiere el override del servidor. `buildWhatsAppUrl` y sus 9 call sites (ReservasPage, VolverPage, PlanExpiryDialog, UpsellBadge, ProgramCtaCard, ProgramProgressCard, PlanesPage, OnboardingRecommendation, TrainingIndex) quedaron sin tocar — `git diff --name-only` de la Task 1 no los lista.
- `useCommunicationsStore.ts` (Pinia setup): `loadConfig()` consume `GET /communications/me/config` (`{ salesWhatsappNumber, defaultWhatsappText }`), cachea ambos valores y llama `setServerSalesNumber`; en error hace `createLogger().error` y deja el hardcode intacto (fail-open).
- `MainLayout.vue`: watcher `authStore.isAuthenticated` (idéntico al de `PlanExpiryDialog.vue`) dispara `loadConfig()` una vez por sesión — cubre tanto el boot con token persistido (`boot/auth.ts`) como el login/register recién hecho (`useAuthStore.login`/`register`) sin duplicar la llamada en esos dos módulos.
- `ContactoVentasPage.vue` + ruta `/contacto-ventas` (literal = `CONTACT_SALES_ROUTE`): al montar arma la URL (texto de `?text=` > `defaultWhatsappText` del store > default del espejo), intenta `window.open` y si devuelve `null` (pop-up bloqueado, típico en Android desde una push) muestra un botón de respaldo que reintenta; si el salto funcionó, `router.replace('/mi-templo')` para que "atrás" deje al socio en Mi Templo (D-03).
- `resolveTapRoute` (pura, exportada de `push-notifications.ts`): 1) `destination === 'whatsapp_sales'` → `/contacto-ventas?text=...` (whatsappText escapado); 2) `destination === 'app_section'` con `destinationSection` conocida → su ruta; 3) `data.route` (compat app vieja); 4) `/mi-templo`. `handleTapNavigation` pasa a recibir el `data` completo en vez de un `route` suelto; los dos call sites (Android/iOS) actualizados.
- 13 tests nuevos: 6 en `whatsapp.test.ts` (hardcode sin override, override activo, número inválido no pisa el fallback, `encodeURIComponent`, sin texto, con override + texto) + 7 en `push-destination.test.ts` (payload viejo con/sin route, sección conocida, sección inventada cae a `route`, whatsapp con/sin texto, `app_section` sin `destinationSection`).
- Verificación: `pnpm -C el-templo-app lint` 0 errores (2 warnings preexistentes ajenos a este plan, en `boot/axios.ts` y `useSessionPlayer.ts`, sin tocar). `pnpm -C el-templo-app build` (`quasar build`) exitoso — `ContactoVentasPage` compiló como chunk propio (`assets/ContactoVentasPage-*.js`, 9.12 KB).

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Número de ventas del servidor con fallback al hardcode** - `846ea807` (feat)
2. **Task 2: Ruta /contacto-ventas con salto automático y botón de respaldo** - `64531046` (feat)
3. **Task 3: handleTapNavigation con destino nuevo y fallback** - `3b7a5805` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-app/src/utils/whatsapp.ts` - `setServerSalesNumber`/`resetWhatsAppOverridesForTests`, `getWhatsAppNumber` con override del servidor
- `el-templo-app/src/stores/useCommunicationsStore.ts` (nuevo) - `salesNumber`/`defaultWhatsappText`/`loaded` + `loadConfig()`
- `el-templo-app/src/layouts/MainLayout.vue` - watcher `authStore.isAuthenticated` que llama `loadConfig()`
- `el-templo-app/src/utils/__tests__/whatsapp.test.ts` (nuevo) - 6 tests
- `el-templo-app/src/pages/ContactoVentasPage.vue` (nuevo) - salto automático + botón de respaldo
- `el-templo-app/src/router/routes.ts` - registra `/contacto-ventas` junto a `/volver`
- `el-templo-app/src/boot/push-notifications.ts` - `resolveTapRoute` exportada; `handleTapNavigation` recibe `data` completo
- `el-templo-app/src/boot/__tests__/push-destination.test.ts` (nuevo) - 7 tests

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: `loadConfig()` en `MainLayout.vue` (punto único de sesión activa), `resolveTapRoute` vive en `push-notifications.ts` (regla de fallback específica del tap, distinta de `resolveDestinationRoute`), cascada de texto de WhatsApp en `ContactoVentasPage.vue` con 3 niveles de fallback.

## Deviations from Plan

Ninguna Rule 1-4. Un archivo tocado fuera del `<files>` literal de la Task 1 (`MainLayout.vue`), pero explícitamente instruido por el propio texto de la Task 1 ("Llamar `loadConfig()` desde donde ya se hidrata el perfil autenticado (`MainLayout.vue` o el watcher de `authStore.isAuthenticated`...) — elegir el punto leyendo el código, y dejar el motivo en el SUMMARY"). No es una desviación de las reglas 1-4, es la instrucción explícita del plan.

## Issues Encountered

**Pre-existente, fuera de alcance (Scope Boundary — no corregido, ver `deferred-items.md`):** `pnpm -C el-templo-app test` (suite completa) corrió 155 tests, 153 verdes + **2 fallos en `test/level-display.test.ts`** (`TRAINING_LEVELS` trae 6 entradas incluyendo `kairos` contra un test que espera 5 sin `kairos`). Confirmado sin diff entre la base de este plan (`2c5c257e`) y el HEAD de la task en `level-display.ts`/`level-display.test.ts` — el origen es el commit `a669156e` (`feat(kairos)`), anterior y ajeno a este plan; ningún archivo de la 193-09 toca el nivel `kairos`. Documentado en `.planning/phases/193-comunicaciones/deferred-items.md`. Los 13 tests nuevos de este plan (`whatsapp.test.ts` + `push-destination.test.ts`) están 100% verdes, incluidos en esa corrida.

Ningún otro bloqueante. Los 3 comandos de vitest de este plan corrieron rápido (sin DB, unitarios) sin necesitar `timeout` extendido; `quasar build` corrió en foreground con `timeout: 600000` (~50s reales).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Para el plan 12 (pop-up único en la app, D-07):** `useCommunicationsStore` ya existe con el mismo shape (Pinia setup, `ref` + acción async fail-open) que `useNotificationStore` — el composable/acción que consuma `GET /me/prompt` puede vivir en el mismo store (agregar `pendingPrompt`/`fetchPrompt()`) en vez de crear uno nuevo, y reusar el patrón `watch(authStore.isAuthenticated, ..., { immediate: true })` de `MainLayout.vue` (mismo lugar donde hoy viven los 4 diálogos globales que este pop-up único reemplaza).
- **Para el plan 15 (carrusel del servidor):** `GET /me/tarjetas` puede consumirse desde el mismo `useCommunicationsStore`; `resolveDestinationRoute`/`APP_SECTIONS` de `config/destinations.ts` ya están probados end-to-end por este plan (usados por `resolveTapRoute`) para resolver el botón de cada tarjeta.
- `/contacto-ventas` y `resolveTapRoute` quedan disponibles para cualquier flujo que necesite el destino común (no solo push) — por ejemplo un botón de tarjeta o de aviso pop-up con `destination.type === 'whatsapp_sales'` puede navegar directo a `CONTACT_SALES_ROUTE` con el `?text=` correspondiente.
- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 3 commits nuevos sobre el HEAD `2c5c257e` de los planes 01-08.

---

## Self-Check: PASSED

- `el-templo-app/src/utils/whatsapp.ts` — FOUND
- `el-templo-app/src/stores/useCommunicationsStore.ts` — FOUND
- `el-templo-app/src/pages/ContactoVentasPage.vue` — FOUND
- `el-templo-app/src/boot/push-notifications.ts` — FOUND
- `el-templo-app/src/utils/__tests__/whatsapp.test.ts` — FOUND
- `el-templo-app/src/boot/__tests__/push-destination.test.ts` — FOUND
- Commit `846ea807` — FOUND
- Commit `64531046` — FOUND
- Commit `3b7a5805` — FOUND
- `.planning/phases/193-comunicaciones/193-09-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
