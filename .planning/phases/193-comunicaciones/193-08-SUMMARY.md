---
phase: 193-comunicaciones
plan: 08
subsystem: admin
tags: [communications, admin, vue, quasar, destino, whatsapp, dry]

# Dependency graph
requires:
  - phase: 193-01
    provides: "APP_SECTIONS/Destination/DEFAULT_WHATSAPP_TEXT espejados en el-templo-admin/src/config/destinations.ts"
  - phase: 193-04
    provides: "CommunicationsService/communicationsRoutes en /api/communications/admin/* (avisos, número de ventas)"
  - phase: 193-06
    provides: "destination { type, section, whatsappText } en PUT /notifications/admin/templates/:id y POST /notifications/admin/send-segment"
provides:
  - "ComunicacionesPage.vue: contenedor con q-tabs sincronizado a ?tab=, pestaña Push montada (planes 11/14/16 le suman las suyas)"
  - "DestinoSelector.vue: q-select reusable (APP_SECTIONS + WhatsApp de ventas) para push/avisos/tarjetas"
  - "useCommunicationsApi.ts: composable con las 10 operaciones de avisos+plantillas push (listAvisos/createAviso/updateAviso/deleteAviso/listAvisoClickers/getSalesNumbers/setSalesNumbers/listTemplates/updateTemplate/sendSegment)"
  - "el-templo-admin/src/utils/whatsapp.ts: whatsappUrl/whatsappUrlWithText, fuente única de link wa.me en el admin"
  - "Ruta /comunicaciones (allowedRoles admin/owner) + redirect /notificaciones → /comunicaciones + entrada de menú 'Comunicaciones' en Configuración"
affects: [193-11, 193-14, 193-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useCommunicationsApi agrega DOS módulos de backend (/communications/admin/* y /notifications/admin/*) bajo un solo composable de UI, nombrado por la sección del admin, no 1:1 con un módulo del API"
    - "DestinoSelector colapsa 'sección de app' + 'WhatsApp de ventas' en un único q-select (value = AppSectionKey o sentinel 'whatsapp_sales'), evitando dos controles separados"
    - "Tab activo del contenedor viaje en ?tab= con router.replace (mismo criterio que FeedbackPage.vue) para que el redirect y los deep links funcionen"

key-files:
  created:
    - el-templo-admin/src/composables/useCommunicationsApi.ts
    - el-templo-admin/src/components/comunicaciones/DestinoSelector.vue
    - el-templo-admin/src/components/comunicaciones/PushTab.vue
    - el-templo-admin/src/pages/ComunicacionesPage.vue
    - el-templo-admin/src/utils/whatsapp.ts
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/components/reports/TrialSessionsReport.vue
    - el-templo-admin/src/pages/PartnersPage.vue
    - el-templo-api/src/modules/notifications/routes.ts
    - el-templo-api/test/notifications-destination.test.ts
  deleted:
    - el-templo-admin/src/pages/NotificacionesPage.vue

key-decisions:
  - "El redirect '/notificaciones' → '/comunicaciones' NO lleva meta.allowedRoles propio — el guard de router/index.ts evalúa `to.meta` DESPUÉS de que Vue Router resuelve el redirect (mismo patrón ya probado por puntuaciones/propuestas → /feedback), así que el allowedRoles de la ruta destino rige igual."
  - "DestinoSelector usa un único q-select (no dos controles separados de 'tipo' + 'sección') para que sea imposible en la UI construir un estado inconsistente (ej. type=app_section con section=null)."

patterns-established:
  - "useCommunicationsApi.ts es el punto único de acceso admin → módulo Comunicaciones (avisos + push); los planes 11/14/16 extienden el mismo archivo en vez de crear composables paralelos."

requirements-completed: [COM-01]

# Metrics
duration: ~75min
completed: 2026-09-02
---

# Phase 193 Plan 08: Sección Comunicaciones del admin (contenedor + Push + DRY WhatsApp) Summary

**`/comunicaciones` reemplaza a `/notificaciones` en el menú (D-30/D-31) con redirect fail-safe; la pestaña de notificaciones push quedó migrada con un selector de destino curado (D-01/D-02/D-05) en vez del input de ruta libre, y las 2 copias byte-idénticas del helper `whatsappUrl` se consolidaron en un único util (D-18).**

## Performance

- **Duration:** ~75 min
- **Tasks:** 3/3
- **Files modified:** 12 (5 nuevos + 6 modificados + 1 borrado)

## Accomplishments

- `useCommunicationsApi.ts`: composable con `loading`/`error`/`cleanup` (mismo patrón que `useTvApi.ts`) y las 10 funciones tipadas de avisos + plantillas push (`listAvisos`, `createAviso`, `updateAviso`, `deleteAviso`, `listAvisoClickers`, `getSalesNumbers`, `setSalesNumbers`, `listTemplates`, `updateTemplate`, `sendSegment`). Sin `any`, sin `console.*`.
- `DestinoSelector.vue`: `q-select` único (secciones curadas de `APP_SECTIONS` + "WhatsApp de ventas"), con `q-input` de texto (maxlength 300, counter, placeholder = `DEFAULT_WHATSAPP_TEXT`) cuando el tipo es `whatsapp_sales` (D-02). Emite `Destination` completo — imposible construir un destino inconsistente desde la UI.
- `PushTab.vue`: contenido de la vieja página de Notificaciones (tabla de plantillas con contadores, diálogo de edición, envío a segmento) con los dos `q-input` de ruta reemplazados por `DestinoSelector`; ambas llamadas (`updateTemplate`, `sendSegment`) mandan `destination` siempre (L1).
- `ComunicacionesPage.vue`: contenedor `q-tabs`/`q-tab-panels` con la pestaña Push, tab sincronizado a `?tab=` con `router.replace` (mismo criterio que `FeedbackPage.vue`).
- Menú: `templo-config.ts` cambió la entrada "Notificaciones" por "Comunicaciones" (icon `campaign`), mismo lugar en Configuración, mismos `DUENO_ROLES`. Router: `/comunicaciones` con `allowedRoles: ['admin','owner']`, `/notificaciones` redirige sin meta propio.
- `whatsapp.ts`: `whatsappUrl`/`whatsappUrlWithText` únicos, migradas las 2 copias byte-idénticas (`TrialSessionsReport.vue`, `PartnersPage.vue`); las 5 copias con normalización distinta se dejaron intactas (ver Deviations).
- Verificación: `pnpm lint` (0 errores) tras cada task; `pnpm build` (`quasar build`) exitoso al final del plan, sin artefactos de `dist/` en `git status`.

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Composable de API + selector de destino + página con la pestaña Push** - `233ce17d` (feat)
2. **Task 2: Ruta, menú y redirect (y retiro de NotificacionesPage)** - `f67cf013` (feat)
3. **Task 3: Util compartido de link a WhatsApp en el admin (DRY)** - `2c5c257e` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-admin/src/composables/useCommunicationsApi.ts` - composable de API (avisos + push)
- `el-templo-admin/src/components/comunicaciones/DestinoSelector.vue` - selector de destino reusable
- `el-templo-admin/src/components/comunicaciones/PushTab.vue` - pestaña Push (migrada, con DestinoSelector)
- `el-templo-admin/src/pages/ComunicacionesPage.vue` - contenedor con tabs sincronizados a `?tab=`
- `el-templo-admin/src/utils/whatsapp.ts` - helper único `wa.me` del admin
- `el-templo-admin/src/config/templo-config.ts` - entrada de menú "Comunicaciones"
- `el-templo-admin/src/router/routes.ts` - ruta `/comunicaciones` + redirect `/notificaciones`
- `el-templo-admin/src/components/reports/TrialSessionsReport.vue` - migrado a `whatsappUrl` del util
- `el-templo-admin/src/pages/PartnersPage.vue` - migrado a `whatsappUrl` del util
- `el-templo-api/src/modules/notifications/routes.ts` - GET/PUT de templates devuelven destino (deviation)
- `el-templo-api/test/notifications-destination.test.ts` - 1 test nuevo + 2 asserts (deviation)
- `el-templo-admin/src/pages/NotificacionesPage.vue` - **borrado** (contenido vive en `PushTab.vue`)

## Decisions Made

Ver `key-decisions` en el frontmatter: redirect sin `meta.allowedRoles` propio (el guard evalúa la ruta ya resuelta), y `DestinoSelector` como un único `q-select` para evitar estados inconsistentes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] `GET /admin/templates` y `PUT /admin/templates/:id` no devolvían el destino curado**

- **Found during:** Task 1, al diseñar `openEdit()` de `PushTab.vue` — para pre-cargar `DestinoSelector` con el destino ACTUAL de una plantilla al abrir el diálogo de edición, hace falta `destinationType`/`destinationSection`/`whatsappText`.
- **Issue:** El plan 06 agregó esas 3 columnas a `notification_templates` (migración 0218) y las usa para VALIDAR y ESCRIBIR el destino, pero ni el `GET /admin/templates` (listado) ni la respuesta del `PUT /admin/templates/:id` las devolvían — solo `route` (la ruta de fallback, D-04). Con solo `route` es imposible reconstruir el destino real: `route: '/planes'` es ambiguo entre las secciones `programas` y `mi_plan` (L2), y para `whatsapp_sales` `route` siempre vale `/mi-templo` sin dar ninguna pista del `whatsappText` guardado. Sin este fix, el diálogo de edición de una plantilla con destino WhatsApp mostraría siempre "Mi Templo" y el texto vacío, silenciosamente incorrecto.
- **Fix:** Se agregaron `destinationType`, `destinationSection`, `whatsappText` al `map()` del GET y al objeto de respuesta del PUT en `el-templo-api/src/modules/notifications/routes.ts`. Ninguna de las dos rutas tiene `schema.response` declarado (Fastify no filtra los campos extra), así que el cambio es aditivo puro — no rompe contratos existentes.
- **Files modified:** `el-templo-api/src/modules/notifications/routes.ts`, `el-templo-api/test/notifications-destination.test.ts`
- **Verification:** `notifications-destination.test.ts` 15/15 verde (agregado 1 test nuevo — GET devuelve los 3 campos tras un PUT — y 2 asserts sobre el `body` de la respuesta del PUT, antes solo se afirmaba contra la fila de DB); `notifications.test.ts` (no tocado, no-regresión) 37/37 verde. `pnpm build` del admin compila con `TemplateRow` incluyendo los 3 campos.
- **Committed in:** `233ce17d` (Task 1 commit)

**2. [Scope, no bug] 5 de las 7 copias de `whatsappUrl` no se migraron al util (Task 3)**

- **Found during:** Task 3, al comparar el comportamiento exacto de las 7 copias existentes.
- **Issue:** Solo `TrialSessionsReport.vue` y `PartnersPage.vue` tenían la función `whatsappUrl` byte-idéntica (digits-only + prefijo `549` para móviles de 10 dígitos sin país). Las otras 5 (`ReportesPage.contactMember`, `AlumnoDetailPage.openWhatsapp`, `SesionesDePruebaDialog.openWhatsapp`, `FranchiseDetailPage.openWhatsApp`, `MiembrosTab.vue` con dos funciones — `openWhatsApp` y `contactMember`) normalizan distinto: ninguna agrega el prefijo `549`, así que un número de exactamente 10 dígitos abriría un chat DIFERENTE si se migrara a `whatsappUrl` (le agregaría el código de país que hoy no tiene). El plan prohíbe explícitamente cambiar a quién se le escribe.
- **Fix:** No se tocaron esas 5 copias. Quedan documentadas acá como la excepción que el propio `acceptance_criteria` del plan contempla ("si alguna copia se conservó por comportamiento distinto, el SUMMARY nombra cada excepción con su motivo").
- **Files NOT modified (intencional):** `el-templo-admin/src/pages/ReportesPage.vue`, `el-templo-admin/src/pages/AlumnoDetailPage.vue`, `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue`, `el-templo-admin/src/pages/FranchiseDetailPage.vue`, `el-templo-admin/src/components/analytics/MiembrosTab.vue`
- **Nota:** `grep -rn "function whatsappUrl" el-templo-admin/src` devuelve 2 (no 1) — ambas líneas están en el MISMO archivo (`whatsapp.ts`: `whatsappUrl` y `whatsappUrlWithText`, el patrón matchea por substring). Sigue siendo "un solo archivo, una sola fuente de verdad" — no hay copias fuera de `whatsapp.ts`.

---

**Total deviations:** 1 auto-fijada (Rule 2, necesaria para que D-02 funcione end-to-end al editar) + 1 de alcance documentada (5 copias con comportamiento distinto, dejadas intactas por diseño del propio plan).
**Impact on plan:** Sin impacto negativo. El fix de Rule 2 es estrictamente necesario para que el editor de plantillas muestre el destino real al abrir "editar" — sin él, D-02 ("editable por notificación... con default global si se deja vacío") quedaría roto silenciosamente para cualquier plantilla ya configurada con WhatsApp de ventas.

## Issues Encountered

Ninguno bloqueante. Los 2 archivos de test de `el-templo-api` corridos en foreground (`npx vitest run <archivo>`) superaron los 120s del harness de Bash y quedaron corriendo en background automáticamente (mismo patrón ya documentado en los SUMMARYs 01/04/06 de esta fase); se recuperó el resultado leyendo el output persistido tras la notificación, sin pérdida ni reintento.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Cómo se enchufa una pestaña nueva en `/comunicaciones` (planes 11, 14, 16):**

1. Crear el componente de la pestaña en `el-templo-admin/src/components/comunicaciones/` (ej. `AvisosTab.vue`, `TarjetasTab.vue`, `AvisosTvTab.vue`), mismo patrón que `PushTab.vue` — recibe sus propios datos vía `useCommunicationsApi()` (ya expone `listAvisos`/`createAviso`/`updateAviso`/`deleteAviso`/`listAvisoClickers`/`getSalesNumbers`/`setSalesNumbers`, sin usar todavía).
2. En `ComunicacionesPage.vue`: agregar `<q-tab name="avisos" label="Avisos en la app" />` (o el nombre que corresponda) dentro de `<q-tabs>`, y su `<q-tab-panel name="avisos"><AvisosTab /></q-tab-panel>` dentro de `<q-tab-panels>`. Agregar el `name` a la constante `VALID_TABS` del `<script setup>` para que el deep link `?tab=avisos` sea válido.
3. Si la pestaña necesita destino curado (avisos, tarjetas), reusar `<DestinoSelector v-model="...">` — no crear un selector nuevo.
4. D-23 (avisos en TV gateados por `templo-training`): el gating de MÓDULO es responsabilidad del backend (`el-templo-api/src/modules/tv-avisos/routes.ts`, plan 07, `moduleScope(app, 'templo-training', ...)`) — la pestaña de TV en el admin puede necesitar ocultarse si el tenant no tiene el módulo (revisar cómo otras páginas gateadas por módulo lo resuelven client-side, ej. `canAccessTraining` en `router/index.ts`).

- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 3 commits nuevos sobre `7b6d34cb` (HEAD de la 07).
- Deuda anotada (no bloqueante): la pestaña Push no muestra las métricas de las OTRAS pestañas (avisos/tarjetas) porque no existen todavía — correcto, las agregan los planes 11/14. El bloque "Ajustes" (número de WhatsApp de ventas por país, D-20) tampoco tiene UI todavía — `getSalesNumbers`/`setSalesNumbers` ya están en el composable, listos para el plan que decida dónde exponerlos (según CONTEXT.md, "Claude's Discretion": pestaña de avisos o bloque "Ajustes" aparte).

---

## Self-Check: PASSED

- `el-templo-admin/src/composables/useCommunicationsApi.ts` — FOUND
- `el-templo-admin/src/components/comunicaciones/DestinoSelector.vue` — FOUND
- `el-templo-admin/src/components/comunicaciones/PushTab.vue` — FOUND
- `el-templo-admin/src/pages/ComunicacionesPage.vue` — FOUND
- `el-templo-admin/src/utils/whatsapp.ts` — FOUND
- `el-templo-admin/src/pages/NotificacionesPage.vue` — CONFIRMED DELETED
- Commit `233ce17d` — FOUND
- Commit `f67cf013` — FOUND
- Commit `2c5c257e` — FOUND
- `.planning/phases/193-comunicaciones/193-08-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
