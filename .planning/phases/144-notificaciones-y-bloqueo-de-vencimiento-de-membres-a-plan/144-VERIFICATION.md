---
phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
verified: 2026-06-25T22:49:09Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir la app con una membresía que vence en ≤3 días (simular seteando la end_date manualmente o con un socio real de prueba)"
    expected: "PlanExpiryDialog aparece una vez al día con el copy correcto según N (singular '1 día', 'vence hoy' para N=0, variante plurar para N=2-3). Botón 'Ahora no' cierra el diálogo. Al día siguiente, reaparece. Si la membresía tiene >3 días de cobertura, no aparece."
    why_human: "La lógica de 'una vez por día' via Capacitor Preferences y el gate daysRemaining >= 0 && <= 3 requieren un dispositivo/emulador real para verificar el ciclo completo. El copy condicional (singular/plural/vence-hoy) solo se puede validar visualmente."
  - test: "Tocar 'Renovar por WhatsApp' en PlanExpiryDialog"
    expected: "Se abre WhatsApp con el texto 'Hola, quiero renovar mi membresía 💪' pre-cargado al número correspondiente al país del branch (AR o ES)."
    why_human: "Apertura de WhatsApp via window.open solo se puede verificar en dispositivo/browser real."
  - test: "Intentar reservar una clase presencial con fecha posterior al vencimiento de la membresía"
    expected: "La API devuelve 400 con body.code === 'COVERAGE_EXPIRED'. ReservasPage muestra el diálogo de bloqueo (fondo charcoal, acento terracota, NO el notify negativo genérico). Botón 'Renovar por WhatsApp' abre WhatsApp con texto 'Hola, quiero renovar mi membresía para reservar una clase 💪'. Botón 'Entendido' cierra."
    why_human: "La discriminación del error en el UI y la apertura de WhatsApp requieren prueba en browser. La apariencia visual del diálogo (clases CSS .coverage-dialog__*, colores de brand, max-width) no se puede confirmar por grep."
  - test: "Reservar una clase con fecha dentro de la cobertura (membresía activa)"
    expected: "La reserva se completa normalmente (201). No aparece ningún diálogo de renovación. El notify existente de éxito/error genérico sigue funcionando para otros errores de reserva (regresión)."
    why_human: "Verificación de regresión del flujo happy-path de reserva y del path de errores genéricos requiere prueba en el flujo de UI completo."
---

# Phase 144: Notificaciones y Bloqueo de Vencimiento — Reporte de Verificación

**Phase Goal:** Avisar al miembro que su membresía/plan está por vencer y empujarlo a renovar por WhatsApp, e impedir que reserve clases presenciales cuya fecha cae después de la cobertura. Tres entregables: (1) push de vencimiento 7d/3d/día-de-vencimiento bajo categoría nueva `planes`; (2) pop-up in-app a ≤3 días (y ≥0), salteable, 1/día, CTA WhatsApp; (3) bloqueo de reserva presencial post-cobertura con error distinguible + diálogo de renovación.
**Verified:** 2026-06-25T22:49:09Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                          | Status       | Evidence                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `notificationCategoryEnum` contiene `'planes'` con nombre de columna `notification_category`; el miembro puede silenciarlo independientemente                                                  | ✓ VERIFICADO | `notifications.ts:21` — `"planes"` en el array del enum; columna `notification_category` (arg 1 correcto)                                                                                                                    |
| 2   | Tres templates `plan_renewal_warning_7d/_3d/_expired` bajo `category: "planes"`, ruta `/reservas`, con variantes female                                                                        | ✓ VERIFICADO | `types.ts:191-222` — tres entradas TEMPLATE_SEEDS, `category: "planes"`, `route: "/reservas"`                                                                                                                                |
| 3   | `deriveCoveredUntil(db, userId)` es UNA sola función exportada compartida por cron, endpoint y booking-service (no duplicada)                                                                  | ✓ VERIFICADO | `service.ts:166-183` — standalone export con `MAX(end_date)` filtrado a `status IN ('active','scheduled')` AND `end_date IS NOT NULL`; `getCoveredUntil` en `:605` delega sin re-derivar                                     |
| 4   | Migration 0158 altera el enum en AMBAS tablas (`notification_templates` Y `notification_preferences`) sobre la columna `notification_category`, con backfill idempotente                       | ✓ VERIFICADO | `0158_planes_notification_category.sql`: dos ALTER TABLE MODIFY COLUMN sobre `notification_category`, INSERT con NOT EXISTS guard; sin `;` en comentarios `--`                                                               |
| 5   | Cron diario 03:00 AR `runPlanRenewalWarnings` encola push Planes en bandas 7d/3d/hoy con D-05 supresión y sin columna de tracking                                                              | ✓ VERIFICADO | `notification-cron.ts:213-265` — tres umbrales, SQL `DATE_ADD(CURDATE(), INTERVAL N DAY)`, supresión `deriveCoveredUntil === candidate.target`, wiring en cron 03:00 AR (`notification-cron.ts:492`) con try/catch defensivo |
| 6   | Test de cron siembra los 3 templates antes de invocar `runPlanRenewalWarnings` (sin seed → queueNotification no-op)                                                                            | ✓ VERIFICADO | `notification-plan-renewal.test.ts:45` — `await notificationService.seedTemplates()` en `beforeEach`; 6 casos (7d/3d/expiry/supresión-scheduled/opt-out/fuera-de-banda)                                                      |
| 7   | `GET /api/members/subscription/coverage` existe en `member-routes.ts` (no en `routes.ts` que es admin-gated), IDOR-safe (userId derivado del servidor)                                         | ✓ VERIFICADO | `member-routes.ts:126-134` — `request.user.userId` (sin userId en input); registrado en `app.ts:179-180` bajo prefix `/api/members/subscription`; devuelve `{ coveredUntil, daysRemaining }`                                 |
| 8   | `PlanExpiryDialog.vue` gate es `daysRemaining >= 0 && daysRemaining <= 3` (negativos excluidos), una vez/día vía `plan_expiry_shown_v1`, CTA WhatsApp desde `userStore.profile?.branchCountry` | ✓ VERIFICADO | `PlanExpiryDialog.vue:97-105` — gate `days === null \|\| days < 0 \|\| days > 3` → return false; Preferences key `plan_expiry_shown_v1`; `buildWhatsAppUrl(userStore.profile?.branchCountry, WHATSAPP_TEXT)` en `:122`       |
| 9   | `PlanExpiryDialog` montado en `MainLayout.vue` sin props (auto-trigger vía watcher con `{ immediate: true }`)                                                                                  | ✓ VERIFICADO | `MainLayout.vue:141,154` — `<PlanExpiryDialog />` e import; watcher en `PlanExpiryDialog.vue:135,139` con `immediate: true`                                                                                                  |
| 10  | `AppError` tiene `code?` opcional; `CoverageExpiredError` emite `COVERAGE_EXPIRED` via rama dedicada en routing ANTES de `handleServiceError`                                                  | ✓ VERIFICADO | `errors.ts:16,50` — `readonly code?: string` en AppError; `CoverageExpiredError.code = "COVERAGE_EXPIRED"`; `routes.ts:734-740` — rama `instanceof CoverageExpiredError` antes de `handleServiceError`                       |
| 11  | `reserve()` bloquea cuando `date > coveredUntil` (nunca con NULL); permite fecha dentro de scheduled successor (D-13); covered-until computado en servidor                                     | ✓ VERIFICADO | `booking-service.ts:96-99` — `getCoveredUntil(memberId)` del servidor, `coveredUntil !== null && date > coveredUntil`; MAX incluye 'scheduled' (D-13); null → skip (D-14)                                                    |
| 12  | `ReservasPage.vue` abre diálogo de renovación SOLO en `COVERAGE_EXPIRED`; el resto de errores de reserva sigue el path genérico `$q.notify`                                                    | ✓ VERIFICADO | `ReservasPage.vue:1247-1252` — `axios.isAxiosError(err) && err.response?.data?.code === 'COVERAGE_EXPIRED'` → `showCoverageDialog.value = true` + return; otros errores sin cambio; `import axios` agregado en `:645`        |

**Score:** 12/12 truths verificadas

### Artifacts Requeridos

| Artifact                                                                | Descripción esperada                            | Status       | Notas                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ------------ | ----------------------------------------- |
| `el-templo-api/src/db/schema/notifications.ts`                          | `planes` en enum                                | ✓ VERIFICADO | Línea 21                                  |
| `el-templo-api/src/modules/notifications/types.ts`                      | categoría `planes` + 3 templates                | ✓ VERIFICADO | Líneas 8,19,191-222                       |
| `el-templo-api/src/modules/subscriptions/service.ts`                    | `deriveCoveredUntil` + `getCoveredUntil`        | ✓ VERIFICADO | Líneas 166-183, 605-606                   |
| `el-templo-api/src/db/migrations/0158_planes_notification_category.sql` | Migración enum + backfill                       | ✓ VERIFICADO | Archivo de 32 líneas, correcto            |
| `el-templo-api/src/jobs/notification-cron.ts`                           | `runPlanRenewalWarnings` wired en cron 03:00 AR | ✓ VERIFICADO | Líneas 213, 492                           |
| `el-templo-api/test/notification-plan-renewal.test.ts`                  | 6 casos con seedTemplates                       | ✓ VERIFICADO | Archivo creado, seed en beforeEach        |
| `el-templo-api/src/modules/subscriptions/member-routes.ts`              | GET /coverage IDOR-safe                         | ✓ VERIFICADO | Desviación documentada de routes.ts       |
| `el-templo-api/test/subscriptions/coverage-endpoint.test.ts`            | Test del endpoint                               | ✓ VERIFICADO | Archivo creado                            |
| `el-templo-app/src/components/PlanExpiryDialog.vue`                     | Dialog salteable, una vez/día                   | ✓ VERIFICADO | >100 líneas, gate correcto, no persistent |
| `el-templo-app/src/layouts/MainLayout.vue`                              | Mount point de PlanExpiryDialog                 | ✓ VERIFICADO | Líneas 141, 154                           |
| `el-templo-api/src/modules/shared/errors.ts`                            | `CoverageExpiredError` con `COVERAGE_EXPIRED`   | ✓ VERIFICADO | Líneas 16, 49-50                          |
| `el-templo-api/src/modules/scheduling/booking-service.ts`               | Coverage check en reserve()                     | ✓ VERIFICADO | Líneas 96-99                              |
| `el-templo-api/src/modules/scheduling/routes.ts`                        | Rama estructurada COVERAGE_EXPIRED              | ✓ VERIFICADO | Líneas 734-740                            |
| `el-templo-app/src/pages/ReservasPage.vue`                              | Dialog de renovación en catch                   | ✓ VERIFICADO | Líneas 608-634, 1247-1252                 |
| `el-templo-api/test/scheduling-reserve-coverage.test.ts`                | 5 casos incluyendo D-13/D-14                    | ✓ VERIFICADO | Archivo creado, cubre todos los casos     |

### Key Link Verification

| From                                    | To                                      | Via                                                     | Status  | Notas                                                             |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| `notification-cron.ts`                  | `deriveCoveredUntil` (service.ts)       | import directo + check por candidato                    | ✓ WIRED | `notification-cron.ts:24,241`                                     |
| `runPlanRenewalWarnings`                | `notificationService.queueNotification` | cada candidato con templateKey                          | ✓ WIRED | `notification-cron.ts:249` — con gate de preferencia de categoría |
| `PlanExpiryDialog.vue`                  | `GET /members/subscription/coverage`    | `api.get('/members/subscription/coverage')`             | ✓ WIRED | `PlanExpiryDialog.vue:94`                                         |
| `PlanExpiryDialog.vue`                  | `buildWhatsAppUrl`                      | CTA primario                                            | ✓ WIRED | `PlanExpiryDialog.vue:40,122`                                     |
| `booking-service.ts reserve()`          | `getCoveredUntil`                       | llamada después del membership gate                     | ✓ WIRED | `booking-service.ts:96-99`                                        |
| `scheduling/routes.ts /reserve catch`   | `{ code: COVERAGE_EXPIRED }`            | rama `instanceof CoverageExpiredError`                  | ✓ WIRED | `routes.ts:734-739`                                               |
| `ReservasPage.vue confirmReserve catch` | `showCoverageDialog`                    | `axios.isAxiosError + data.code === 'COVERAGE_EXPIRED'` | ✓ WIRED | `ReservasPage.vue:1250-1252`                                      |

### Desviación Documentada — Ruta Coverage

El plan 03 listaba `routes.ts` como artifact para el endpoint de cobertura. La implementación correctamente aterrizó en `member-routes.ts` (plugin con prefix `/api/members/subscription`, auth-only). La desviación está documentada en `144-03-SUMMARY.md` con justificación técnica válida: `routes.ts` tiene `onRequest` que exige rol admin/coach/owner — una ruta de miembro allí devolvería 403 a todos los miembros. La URL final `GET /api/members/subscription/coverage` satisface la verdad "el miembro puede leer su propia cobertura" y el IDOR mitigation.

### Anti-Patterns Encontrados

| Archivo | Línea | Patrón | Severidad | Impacto            |
| ------- | ----- | ------ | --------- | ------------------ |
| —       | —     | —      | —         | Ninguno encontrado |

Sin marcadores TBD/FIXME/XXX en ninguno de los 14 archivos modificados. Sin `console.log`. Sin dependencias nuevas instaladas.

### Verificación Human Requerida

Las siguientes verificaciones requieren dispositivo o browser real:

#### 1. PlanExpiryDialog — ciclo diario y copy condicional

**Test:** Simular un socio con `end_date = hoy + N` para N en {0, 1, 2, 3} y abrir la app.
**Expected:** El diálogo aparece con copy correcto: `vence hoy` para N=0, `1 día` (singular) para N=1, `2 días`/`3 días` para los demás. Botón `Ahora no` cierra. El siguiente día calendario, reaparece. Con N=4+ o membresía ya renovada (scheduled successor), no aparece.
**Por qué human:** Lógica de Capacitor Preferences `plan_expiry_shown_v1` (YYYY-MM-DD) y gate `daysRemaining >= 0 && <= 3` solo se verifican en ejecución real en dispositivo.

#### 2. CTA WhatsApp de PlanExpiryDialog

**Test:** Tocar `Renovar por WhatsApp` en el diálogo de vencimiento.
**Expected:** Se abre WhatsApp (o wa.me en browser) con el texto `Hola, quiero renovar mi membresía 💪` y el número del país del branch (AR o ES).
**Por qué human:** `window.open` y deep-link a WhatsApp solo verificable en dispositivo.

#### 3. ReservasPage — diálogo de bloqueo (COVERAGE_EXPIRED)

**Test:** Con membresía vencida (o simulando `end_date` pasado), intentar reservar una clase cuya fecha sea posterior a `coveredUntil`.
**Expected:** La API responde 400 con `body.code === 'COVERAGE_EXPIRED'`. ReservasPage muestra el diálogo de renovación (no el notify negativo genérico). Estética: fondo charcoal `#2e2a26`, acento terracota en el botón primario. Botón `Renovar por WhatsApp` abre WhatsApp con texto `Hola, quiero renovar mi membresía para reservar una clase 💪`. Botón `Entendido` cierra sin enviar.
**Por qué human:** Discriminación UI de `COVERAGE_EXPIRED` vs otros errores, apariencia visual del diálogo (clases `.coverage-dialog__*` heredadas), apertura real de WhatsApp.

#### 4. Regresión del flujo de reserva normal

**Test:** Reservar una clase presencial con membresía activa y fecha dentro de la cobertura. Luego intentar una reserva que falle por otro motivo (ej. capacidad llena).
**Expected:** La reserva dentro de cobertura: 201, sin diálogo de renovación. El error de capacidad: el notify negativo genérico existente (sin diálogo COVERAGE_EXPIRED).
**Por qué human:** Verificación de que el path de error genérico no fue alterado y que el happy-path de reserva sigue funcionando.

---

_Verificado: 2026-06-25T22:49:09Z_
_Verifier: Claude (gsd-verifier)_
