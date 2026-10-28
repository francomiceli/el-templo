---
phase: 193-comunicaciones
plan: 17
subsystem: release
tags:
  [
    communications,
    version-bump,
    verification,
    uat,
    checkpoint,
    tv,
    whatsapp,
    avisos,
  ]

# Dependency graph
requires:
  - phase: "193-01..193-16"
    provides: "Los 4 módulos de Comunicaciones completos (Push, Avisos en la app, Tarjetas de Mi Templo, Avisos en TV), destino común, número de ventas por país, TV con estado 'aviso'"
provides:
  - "App en 1.8.0 (package.json, version.txt, versionName default de build.gradle, 2 MARKETING_VERSION de project.pbxproj)"
  - "Verificación mecánica integral de la fase 193 (7 comandos: tsc, lint:tenant, 3 tandas de vitest de la API, lint+test de admin/app, db:migrate idempotente)"
  - "Tabla de cobertura D-01..D-31 con evidencia de código/test por decisión, y GAP explícito para D-22 (integración con el wizard de la fase 182 aún no ocurrida)"
  - "Checkpoint humano (Task 3) devuelto sin ejecutar — UAT de 14 pasos pendiente de veredicto de Franco"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - el-templo-app/package.json
    - el-templo-app/version.txt
    - el-templo-app/src-capacitor/android/app/build.gradle
    - el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj

key-decisions:
  - "El fix de tabs vs espacios en project.pbxproj: el archivo usa tabs literales (^I), el Edit tool con old_string copiado con espacios no matcheaba — se resolvió con sed -i sobre el patrón MARKETING_VERSION = 1\\.7\\.7; (2 ocurrencias), dejando CURRENT_PROJECT_VERSION intacto en ambos bloques."
  - "D-22 se marca GAP PARCIAL explícito en la tabla de cobertura: la siembra por migración para tenants existentes está completa y probada (plan 03), pero el wizard de alta de tenant de la fase 182 (rama v6.1, sin push) todavía no llama seedSystemAvisos — queda como trabajo de integración cuando v6.1 se mergee, documentado ya en el Next Phase Readiness del plan 03."

patterns-established: []

requirements-completed: [COM-01, COM-02, COM-03, COM-04]

# Metrics
duration: ~50min
completed: 2026-09-02
---

# Phase 193 Plan 17: Cierre de fase — bump 1.8.0 + verificación integral + checkpoint UAT Summary

**App bumpeada a 1.8.0 en los 4 lugares, los 7 comandos de verificación mecánica de la fase en verde (0 errores de tipos/lint/tenancy, 196 tests de la API sin regresión, 167/169 de la app con los 2 fallos preexistentes ya documentados, migraciones 0216/0217/0218 idempotentes), tabla de cobertura de las 31 decisiones del CONTEXT con un GAP parcial explícito en D-22 — y el checkpoint humano de 14 pasos queda pendiente, sin ejecutar.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2/3 (Task 3 es un checkpoint bloqueante, no ejecutado por diseño)
- **Files modified:** 4

## Accomplishments

- Bump minor `1.7.7 → 1.8.0`: `package.json`, `version.txt`, `versionName` default de `build.gradle`, las 2 `MARKETING_VERSION` de `project.pbxproj`. `versionCode`/`CURRENT_PROJECT_VERSION` intactos. Grep de `1.7.7` (excluyendo `node_modules`) = 0.
- Los 7 comandos de verificación de la Task 2, todos en verde (detalle abajo).
- Tabla de cobertura D-01..D-31 completa, con el plan que implementó cada decisión y el archivo/test que la evidencia.
- Deuda y hallazgos acumulados de los 16 planes consolidados en una sola sección.

## Task Commits

1. **Task 1: Bump minor de la app (1.7.7 → 1.8.0)** - `a69ff6d7` (chore)
2. **Task 2: Verificación integral y checklist de decisiones** - sin commit de código (el output vive en este SUMMARY, que se deja sin commitear en el checkout principal, según instrucción explícita del prompt de ejecución)
3. **Task 3: UAT humano — admin, app y TV real** - **NO ejecutada**. Checkpoint bloqueante devuelto al orquestador.

**Plan metadata:** Este SUMMARY se escribe en el checkout principal (`el-templo`) sin commitear — lo commitea el orquestador. Cero commits en el checkout principal. Worktree `et-193` limpio (`git status --short` vacío) al terminar, con un único commit nuevo (`a69ff6d7`) sobre el HEAD `0094dd3a` de los planes 01-16.

## Files Created/Modified

- `el-templo-app/package.json` - `"version": "1.8.0"`
- `el-templo-app/version.txt` - `1.8.0`
- `el-templo-app/src-capacitor/android/app/build.gradle` - `versionName = System.getenv("VERSION_NAME") ?: "1.8.0"`
- `el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj` - 2× `MARKETING_VERSION = 1.8.0;`

## Decisions Made

Ver `key-decisions` en el frontmatter: (1) `sed` en vez de `Edit` para el `.pbxproj` por el mismatch de tabs; (2) D-22 marcado GAP parcial explícito en la tabla de cobertura.

## Deviations from Plan

Ninguna Rule 1-4. Un detalle mecánico sin impacto: el `Edit` tool falló dos veces sobre `project.pbxproj` por diferencia de whitespace (el archivo usa tabs, el `old_string` armado a mano usaba espacios) — se resolvió con `sed -i` apuntando al mismo patrón exacto (`MARKETING_VERSION = 1\.7\.7;` → `1.8.0;`), verificado después con grep que `CURRENT_PROJECT_VERSION` no se tocó y que las 2 ocurrencias (Debug/Release) quedaron en 1.8.0.

## Resultado de los 7 comandos (Task 2)

| #   | Comando                                                                                                                                   | Resultado                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm exec tsc --noEmit` (API)                                                                                                            | 0 errores                                                                                                                                                                   |
| 2   | `pnpm lint:tenant` (API)                                                                                                                  | DISCREPANCIAS: 0 (483 archivos, 140 entradas de allowlist, 0 no listadas/stale/ganadas)                                                                                     |
| 3a  | `vitest test/communications/`                                                                                                             | 71/71 verdes (7 archivos)                                                                                                                                                   |
| 3b  | `vitest test/tv/`                                                                                                                         | 152/152 verdes (8 archivos, incluye `tv-aviso-screen.test.ts`)                                                                                                              |
| 3c  | `vitest test/tenancy/iso-01-manifiesto.test.ts test/tenancy/iso-03-communications.test.ts test/notifications-destination.test.ts`         | 43/43 verdes                                                                                                                                                                |
| 4   | `vitest test/ratings/ test/improvement-proposals/ test/subscriptions/coverage-endpoint.test.ts test/notifications.test.ts` (no-regresión) | 82/82 verdes, sin regresión                                                                                                                                                 |
| 5   | `pnpm -C el-templo-admin lint`                                                                                                            | 0 errores, 8 warnings preexistentes ajenos (`CobrosPage.vue`, `session-pdf-builder.ts`, `env.d.ts`)                                                                         |
| 6a  | `pnpm -C el-templo-app lint`                                                                                                              | 0 errores, 2 warnings preexistentes ajenos (`boot/axios.ts`, `useSessionPlayer.ts`)                                                                                         |
| 6b  | `pnpm -C el-templo-app test`                                                                                                              | 167/169 verdes — 2 fallos preexistentes en `test/level-display.test.ts` (nivel `kairos`, commit `a669156e`, documentado en `deferred-items.md`, sin relación con esta fase) |
| 7   | `pnpm db:migrate` (API)                                                                                                                   | "No new migrations to apply" — 0216/0217/0218 idempotentes                                                                                                                  |

Total API: 71+152+43+82 = **348 tests verdes** en los archivos tocados/relacionados con la fase, sin ninguna regresión sobre `ratings`/`improvement-proposals`/`coverage`/`notifications`.

## Tabla de cobertura D-01..D-31

| Decisión    | Resumen                                                                                                      | Plan(es)           | Evidencia (archivo/test)                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01        | Destino común: lista curada de secciones + WhatsApp de ventas, definida server-side                          | 01                 | `el-templo-api/src/modules/communications/destinations.ts` (`APP_SECTIONS`), `destinations.test.ts` (24 tests), espejos en admin/app + `destinations-sync.test.ts`                                                                                                                                                   |
| D-02        | Texto de WhatsApp editable por notificación/aviso/tarjeta, con default global                                | 01, 06, 08, 09, 11 | `validateWhatsAppText`/`DEFAULT_WHATSAPP_TEXT` (destinations.ts); `DestinoSelector.vue` (admin); `ContactoVentasPage.vue` cascada de texto (app)                                                                                                                                                                     |
| D-03        | Tap de push abre `/contacto-ventas` → salto directo a WhatsApp, con botón de respaldo                        | 09                 | `ContactoVentasPage.vue`, `resolveTapRoute` (`push-notifications.ts`), `push-destination.test.ts` (7 tests)                                                                                                                                                                                                          |
| D-04        | Compat app vieja: payload lleva ruta nueva + fallback, nunca 404                                             | 01, 06, 09         | `resolveDestinationRoute`/`fallbackRouteFor` (destinations.ts); `buildPushData` con `route` SIEMPRE presente (`notifications-destination.test.ts`); `resolveTapRoute` orden `whatsapp_sales > sección > route > /mi-templo`                                                                                          |
| D-05        | Input libre "Ruta de destino" desaparece; API rechaza rutas fuera de la lista                                | 06, 08             | `PUT /admin/templates/:id`/`POST /admin/send-segment` con `additionalProperties:false` (400 si body trae `route` viejo, T-193-21); `DestinoSelector.vue`                                                                                                                                                             |
| D-06        | Un solo pop-up por apertura, orden fijo `plan_expiry > aviso > rating > improvement`, advertido en el editor | 05, 11             | `PromptService.resolvePrompt` (cortocircuito por escalón), `prompt-endpoint.test.ts` caso de los 5 escalones; banner fijo en `AvisosTab.vue`                                                                                                                                                                         |
| D-07        | Endpoint único "qué pop-up toca hoy"                                                                         | 05, 12             | `GET /me/prompt`, `useAvisosStore.evaluate()` (una sola llamada por apertura, `avisos-store.test.ts`)                                                                                                                                                                                                                |
| D-08        | Calificación de clase = aviso de sistema, cadencia editable (default 7 días)                                 | 03, 05             | `SYSTEM_AVISOS.rating_prompt` (seed); `resolvePrompt` escalón rating vía `RatingsService.getPendingRating`; `status` editable sumado post-plan (nota orquestador, commit `9307acfc`)                                                                                                                                 |
| D-09        | Propuesta de mejora = aviso de sistema editable                                                              | 03, 05, 12         | `SYSTEM_AVISOS.improvement_prompt`; `ImprovementPromptDialog.vue` consume copy del servidor; `useImprovementProposalsApi.ts` reducido (decisores client-side retirados)                                                                                                                                              |
| D-10        | Vencimiento de plan = aviso de sistema, solo texto/botón editables, regla fija en código                     | 03, 04, 05, 12     | `SYSTEM_AVISOS.plan_expiry`; `SYSTEM_ALLOWED_PLAN_EXPIRY` (service.ts, frecuencia/alcance no editables); `resolvePlanExpiry` vía `SubscriptionService.getCoveredUntil`; `PlanExpiryDialog.vue`                                                                                                                       |
| D-11        | Frecuencias once/every_n_days/every_open, eventos server-side por socio, avisos de sistema no se borran      | 02, 04, 05, 12     | `aviso_events` (schema); `deleteAviso` → 400 en avisos de sistema (`avisos-admin.test.ts` caso 5); `frequencyAllows`; `recordEvent` idempotente                                                                                                                                                                      |
| D-12        | Solo texto en v1, sin imagen                                                                                 | 11                 | `AvisoEditorDialog.vue` (sin campo de imagen/upload)                                                                                                                                                                                                                                                                 |
| D-13        | Alcance por sede/país/segmento, vacío = todos                                                                | 02, 04, 05, 11     | columnas `scopeBranchIds`/`scopeCountries`/`scopeSegments`; `matchesScope` (`prompt-endpoint.test.ts`); bloque Alcance del editor                                                                                                                                                                                    |
| D-14        | Vigencia desde/hasta + estado (borrador/activo/pausado)                                                      | 02, 04, 11         | columnas `startsOn`/`endsOn`/`status`; validación en `createAviso`/`updateAviso`; bloque Vigencia del editor                                                                                                                                                                                                         |
| D-15a/D-15b | Tarjetas fijas (4) copy editable + tarjetas libres, orden fijas-primero                                      | 03, 14, 15         | seed `card_improvement`/`card_referral`/`card_upsell`/`card_program`; `TarjetasTab.vue` (admin); `MiTemplo.vue` `v-for` de `tarjetasLibres` después de las fijas                                                                                                                                                     |
| D-16        | Vista previa inline con el estilo real                                                                       | 11, 14, 16         | `AvisoPreview.vue` (popup/tarjeta), `TvAvisoPreview.vue` (placa TV)                                                                                                                                                                                                                                                  |
| D-17        | Métricas de socios únicos (alcanzados/cerraron/tocaron) como columnas                                        | 04, 11             | `listAvisos` con un solo `group by` (`avisos-admin.test.ts` caso 6); columnas de `AvisosTab.vue`                                                                                                                                                                                                                     |
| D-18        | Botón "ver socios" con link a WhatsApp                                                                       | 04, 11             | `listAvisoClickers` (`avisos-admin.test.ts` caso 7); `VerSociosDialog.vue`                                                                                                                                                                                                                                           |
| D-19        | Tarjetas miden solo clics                                                                                    | 14, 15             | columna Clics de `TarjetasTab.vue`; `loadTarjetas()` (app) nunca reporta `shown`, solo `reportClicked`                                                                                                                                                                                                               |
| D-20        | Número de WhatsApp de ventas por país en `tenant_settings`                                                   | 01, 04, 14         | `sales-number.ts` (`getSalesNumber`/`setSalesNumber`/`resolveSalesNumberForUser`), `sales-number.test.ts` (6 tests, aislamiento por tenant); `AjustesVentas.vue`                                                                                                                                                     |
| D-21        | App prefiere número del servidor, cae al hardcode AR/ES                                                      | 09                 | `setServerSalesNumber`/`getWhatsAppNumber` (`whatsapp.test.ts`, 6 tests)                                                                                                                                                                                                                                             |
| D-22        | Avisos de sistema nacen por migración (existentes) y wizard de alta (nuevos)                                 | 03                 | **GAP PARCIAL**: migración 0217 completa y probada (`system-avisos.test.ts`, 5 tests) para tenants existentes; `seedSystemAvisos` queda lista y documentada para que el wizard de la fase 182 (rama v6.1, sin push todavía) la llame — esa integración NO ocurrió en esta fase, es responsabilidad del merge de v6.1 |
| D-23        | Comunicaciones core para todos; solo Avisos en TV gateado por `templo-training`                              | 04, 07             | `communicationsRoutes` sin `moduleScope` (core); `moduleScope(app, "templo-training", tvAvisosRoutes)`; `tv-avisos.test.ts` caso 6 (módulo apagado → 404 en las 5 rutas)                                                                                                                                             |
| D-24        | Entidad `tv_avisos` aparte: título+cuerpo, sedes, activo/inactivo manual, modo                               | 02, 07             | schema `tv_avisos`; `TvAvisosService` (CRUD)                                                                                                                                                                                                                                                                         |
| D-25        | Modo manual: botón AVISO grande en la tira de bloques del control                                            | 07, 10             | `getActiveForBranch(mode:'manual')`; botón AVISO en `TvControlPage.vue`                                                                                                                                                                                                                                              |
| D-26        | Aviso en pantalla hasta que el profe avance, sin timer                                                       | 10                 | `writeState` limpia `tvAvisoId` al cambiar de bloque/pantalla (`tv-aviso-screen.test.ts` casos 2a/2b); rough edges de navegación saldados post-plan (nota orquestador, commit `3e6ee9d1`)                                                                                                                            |
| D-27        | Estilo cápsula/frase Cinzel/oro/velo, sin imagen, ES2015-safe                                                | 13                 | `pantallaAviso` (`TvScreenPage.vue`), `paintAviso` (`render.ts`)                                                                                                                                                                                                                                                     |
| D-28        | Modo reemplazo: el texto ocupa el lugar de la cápsula/frase en flex inicio/final                             | 13                 | `resolveReplacementAviso`, `buildPollPayload` ramas idle/closing (`tv-aviso-screen.test.ts` casos 6a-6d)                                                                                                                                                                                                             |
| D-29        | Permisos: admin crea/edita/activa; coach solo dispara                                                        | 07                 | `ADMIN_ROLES` en 4 rutas CRUD, `TV_CONTROL_ROLES` en `GET /control/tv-aviso-activo` (`tv-avisos.test.ts` caso 2)                                                                                                                                                                                                     |
| D-30        | Editan Comunicaciones dueño y admin (`DUENO_ROLES`)                                                          | 04, 08             | `ADMIN_ROLES` en `communicationsRoutes`; ruta `/comunicaciones` `allowedRoles:['admin','owner']`                                                                                                                                                                                                                     |
| D-31        | Entrada reemplaza "Notificaciones" en el menú, ruta `/comunicaciones` con redirect desde `/notificaciones`   | 08                 | `templo-config.ts` (entrada "Comunicaciones"); `router/routes.ts` (redirect sin `meta.allowedRoles` propio)                                                                                                                                                                                                          |

**GAPs:** 1 (D-22, parcial — ver arriba). Las otras 30 decisiones tienen evidencia de código y test directos.

## Deuda y hallazgos acumulados (consolidado de los 16 planes)

1. **`tvControlRoutes` (`/api/admin/tv/*`, control existente del profe) sigue SIN `moduleScope`** (planes 07/10/13/16, decisión explícita, fuera de alcance de la fase): un tenant con `templo-training` apagado pierde SOLO la pestaña "Avisos en TV" del admin (404), pero conserva el control de clase en vivo.
2. **5 de las 7 copias de `whatsappUrl` en el admin quedaron sin migrar al util compartido** (plan 08): `ReportesPage.contactMember`, `AlumnoDetailPage.openWhatsapp`, `SesionesDePruebaDialog.openWhatsapp`, `FranchiseDetailPage.openWhatsApp`, `MiembrosTab.vue` (2 funciones) — normalizan el número distinto (sin el prefijo `549` que sí aplica `whatsappUrl`), migrarlas cambiaría a quién se le escribe. Documentado como excepción intencional, no bug.
3. **Tamaño de `avisoCuerpo` en el TV real, sin verificar con texto largo** (plan 13, hasta 400 caracteres máximo del schema): el tamaño hereda `.quote` (3.85rem, pensado para frases cortas) — riesgo de desborde visual con un cuerpo largo. Debe verificarse en el paso 11 del UAT (placa a pantalla completa).
4. **2 tests preexistentes rojos en `test/level-display.test.ts`** (nivel `kairos`, commit `a669156e`, ajeno a la fase 193, documentado en `deferred-items.md` desde el plan 09): `TRAINING_LEVELS` trae 6 entradas, el test espera 5. Confirmados sin diff en ningún plan de esta fase.
5. **Retiro del test A/B de copy de la tarjeta de Referidos, pendiente de confirmación explícita de Franco** (plan 03 lo anotó, plan 15 lo ejecutó): `ReferralCtaCard.vue` ya no calcula variante por paridad de `user.id`; siempre muestra el copy editable del servidor (fallback = variante A histórica). Es el punto 14 del checkpoint de la Task 3.
6. **`el-templo-app/src/utils/ab-variant.ts` queda sin uso** (plan 15, consecuencia directa del punto anterior): se dejó con comentario "sin uso desde la fase 193 (D-15)" en vez de borrarse, tal como pedía el plan — decidir si se borra en un plan de seguimiento. El archivo homónimo de la API (`el-templo-api/.../referrals/ab-variant.ts`) es DISTINTO y sigue en uso para `/members/referrals/cta-click`.
7. **Cambio de mecanismo de navegación en `UpsellBadge`/`ProgramCtaCard`** (plan 15): cuando el aviso de sistema `card_upsell`/`card_program` existe (caso normal en cualquier tenant migrado), el clic ahora navega a `/contacto-ventas` (salto automático) en vez de `window.open` directo en pestaña nueva. El fallback `window.open` solo se ve si el admin borra/pausa esas 2 tarjetas. A verificar en el UAT (paso 8/9).
8. **`status` no editable para `rating_prompt`/`improvement_prompt` vía API** (encontrado en plan 05, contradecía D-11) — **saldado** en el commit `9307acfc` de `et-193` (nota del orquestador post-plan 05, `SYSTEM_ALLOWED_WITH_FREQUENCY` sumó `status`, 9/9 verde).
9. **Rough edges de navegación en `TvControlPage.vue` durante la pantalla de aviso** (mismo bloque no hacía nada, ANTERIOR/SIGUIENTE partían de 0) — **saldado** en el commit `3e6ee9d1` (nota del orquestador post-plan 10, `buttonMatchesRole` compartido).
10. **`tv_avisos`/`avisos`/`aviso_events` NO están en `TABLES_TO_CLEAN`** (decisión de diseño, plan 03): son dato semilla estable como `branches`/`activities`; cualquier test futuro que necesite partir de cero debe limpiar explícitamente o consultar el estado actual.

## UAT humano — PENDIENTE

La Task 3 (`type="checkpoint:human-verify"`, `gate="blocking"`) **NO se ejecutó**. Los 14 pasos del plan quedan tal cual, a la espera del veredicto de Franco (aprobado, o lista de pasos fallidos con su número). Ver el bloque de checkpoint estructurado al final de este mensaje para el detalle completo de los 14 pasos.

Estado: **esperando veredicto de Franco.**

## User Setup Required

Ninguno para las Tasks 1 y 2 (no requieren configuración externa). Tras el "aprobado" del UAT (Task 3), las acciones pendientes SON del usuario, fuera de este ejecutor:

1. **Push staging-first con OK explícito**: rama `feat/193-comunicaciones` → `staging`, con las migraciones **0216_communications, 0217_seed_system_avisos, 0218_notifications_destination** (recordar: v6.1, en otra rama sin push, renumera sus propios 0216/0217 locales — no hay colisión real, solo coincidencia de numeración local entre worktrees).
2. **Builds de tienda de la app 1.8.0** (Play Store / App Store) — necesarios para que el destino WhatsApp y el carrusel del servidor lleguen a los socios (app vieja cae al fallback `route`/hardcode, D-04/D-21, pero no tiene las funciones nuevas).
3. **Refrescar los TVs** de las sedes tras el deploy (la placa de aviso y el botón AVISO en el control son código nuevo del navegador del TV).
4. **Decisión del punto 14 del UAT**: confirmar el retiro del test A/B de copy de Referidos (ver "Deuda y hallazgos acumulados" #5).

## Next Phase Readiness

- Los 6 criterios de éxito del ROADMAP (fase 193) están implementados y verificados mecánicamente (tipos, lint de tenancy, 348 tests de API sin regresión, lint+build de admin/app). Falta el veredicto humano sobre admin/app/TV real (Task 3) antes de considerar la fase cerrada.
- App en 1.8.0 en los 4 lugares, commit `a69ff6d7` sobre `feat/193-comunicaciones`.
- Nada bloquea el cierre de la fase salvo el checkpoint humano: worktree `et-193` limpio, 1 commit nuevo sobre el HEAD `0094dd3a` de los planes 01-16.

---

## Self-Check: PASSED

- `el-templo-app/package.json` — FOUND (`"version": "1.8.0"`)
- `el-templo-app/version.txt` — FOUND (`1.8.0`)
- `el-templo-app/src-capacitor/android/app/build.gradle` — FOUND (`versionName ... "1.8.0"`)
- `el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj` — FOUND (2× `MARKETING_VERSION = 1.8.0;`)
- Commit `a69ff6d7` — FOUND (`git log --oneline -1` en `et-193`)
- `.planning/phases/193-comunicaciones/193-17-SUMMARY.md` — FOUND (este archivo)
- Worktree `et-193`: `git status --short` vacío — CONFIRMADO
- Checkout principal `el-templo`: cero commits nuevos — CONFIRMADO (este archivo queda sin commitear, a cargo del orquestador)

_Phase: 193-comunicaciones_
_Completed: 2026-09-02 (Tasks 1-2; Task 3 pendiente de UAT humano)_
