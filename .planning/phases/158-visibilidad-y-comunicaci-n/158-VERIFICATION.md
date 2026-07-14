---
phase: 158-visibilidad-y-comunicaci-n
verified: 2026-07-11T14:45:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "Los links 'ir a la ficha' dentro de la sección Referidos del admin navegan correctamente a los datos frescos del miembro destino (fix 68aa3661)"
    - "El endpoint GET /admin/members/:userId/referrals valida existencia del alumno y respeta el country-scope del actor (fix 4f3ce105)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Abrir la app como socio → Mi perfil → 'Mis referidos'. Verificar los 3 bloques según UI-SPEC S1: código prominente con botón 'Compartir mi código', descuento con desglose pedagógico (o headline 0%), y vínculos con chips Pendiente/Activo/Suspendido."
    expected: "Pantalla renderiza según el contrato visual aprobado (cards dark de ProfilePage, terracotta, copy es-AR); el bloque código+share visible SIEMPRE, incluso con cero vínculos."
    why_human: "Apariencia visual, jerarquía tipográfica y copy — no verificables por grep. Franco todavía no vio la UI nueva."
  - test: "En un dispositivo (Android o iOS), tocar 'Compartir mi código'. En web/desktop, provocar el fallback (o probar donde Share no está disponible)."
    expected: "En dispositivo abre el share sheet nativo con el link https://app.eltemplo.org/register?ref=CODE; donde falla, copia el link al portapapeles y muestra el notify warning con el copy de UI-SPEC."
    why_human: "Comportamiento nativo de Capacitor Share depende del runtime del dispositivo; el fallback es un catch en tiempo de ejecución."
  - test: "En staging: crear un vínculo pending (alta con '¿Quién lo trajo?') y cobrar el primer plan del referido. El referidor debe tener la app instalada con device token."
    expected: "El referidor recibe UN push '¡Tu referido pagó!' con el nombre del referido en el cuerpo; al tocarlo la app navega a /mis-referidos. El referido no recibe push."
    why_human: "Push real end-to-end (FCM + deep-link de la notificación) no se puede verificar por lectura de código; los tests de integración solo asertan la fila en pending_notifications."
  - test: "En el admin: abrir la ficha de un alumno con referidos → tab 'Referidos' → clickear el nombre en 'Lo trajo' o 'Trajo a'."
    expected: "La URL cambia a la ficha del otro alumno Y toda la ficha (perfil, suscripción, finanzas, referidos) muestra los datos del alumno destino, no los del anterior. Verificación visual del fix 68aa3661."
    why_human: "El fix del watcher está verificado por código, pero la corrección de la conducta de navegación (datos frescos en todos los tabs) merece confirmación visual — es el bug más riesgoso de la fase."
  - test: "Login en el admin con un usuario rol 'gestion' (o coach/recepción) → ficha de cualquier alumno → tab 'Referidos'."
    expected: "DECISIÓN DE NEGOCIO PENDIENTE (WR-05 del REVIEW): hoy el tab es visible para todos los roles que entran a la ficha, pero el endpoint responde 403 a todo lo que no sea admin/owner → gestión ve el tab y recibe el toast de error. Confirmar con Nacho/negocio si gestión debe ver referidos (cambiar guard a MEMBER_LIFECYCLE_ROLES) o si el tab debe ocultarse para roles sin acceso."
    why_human: "Es una decisión de producto (qué rol ve qué), no un defecto verificable — el código hace exactamente lo que el plan pidió, pero plan y comentario del código se contradicen."
---

# Phase 158: Visibilidad y comunicación Verification Report

**Phase Goal:** El socio entiende y siente el beneficio: ve el estado de sus referidos y el descuento vigente, y es avisado cuando un vínculo se activa. End state: pantalla "Mis referidos" operativa en la app, notificación al activarse un vínculo, y (opcional) listado de referidos para gestión.
**Verified:** 2026-07-11T14:45:00Z (re-verificación tras cierre de gaps)
**Status:** human_needed (todos los checks automáticos pasan; queda UAT visual/dispositivo)
**Re-verification:** Sí — verificación inicial 2026-07-11T14:22Z encontró 2 gaps en VIS-03; ambos corregidos y re-verificados por lectura del código commiteado.

## Gap Closure (Re-verificación)

### Gap 1 — Guard T-106-02 en el endpoint admin: CERRADO (commit `4f3ce105`)

Verificado leyendo el diff completo y el archivo resultante (`el-templo-api/src/modules/members/routes.ts:1656-1717`):

- **Existencia + soft-delete:** SELECT del target con JOIN a `branches`; `!target || target.deletedAt` → 404 "Miembro no encontrado". El 500 por id inexistente desaparece (el request ya no llega a `generateReferralCode`).
- **Country-scope:** `!request.scope.isOwner && !target.branchIsVirtual && target.branchCountry !== request.scope.country` → 404 (no 403, anti info-leak) — réplica exacta del patrón de `/:userId/outstanding-concepts` y `/:userId/financial-history`. `request.scope` está poblado por `attachCountryScope` en el hook del módulo (routes.ts:110).
- **Error handling:** todo el handler envuelto en try/catch con `handleServiceError` (línea 1715), armonizado con las rutas hermanas; los cuerpos de error ahora incluyen `{ error, message }` (también cierra la parte sustancial de WR-06).
- **Tests:** 4 casos nuevos en `admin-referrals-endpoint.test.ts` (total 7): 404 inexistente, 404 soft-deleted, 404 cross-country para admin ES no-owner (con `createStaffUser` — helper verificado en `test/helpers.ts:424` — y branch ES creada en el `beforeAll`), 200 owner cross-country. Cubren exactamente los escenarios que la verificación inicial marcó como faltantes. Los tests NO se corrieron localmente (regla del proyecto: corren en CI); estructura y asserts verificados por lectura.
- `tsc --noEmit` de la API: exit 0.

### Gap 2 — Recarga de la ficha al navegar entre fichas: CERRADO (commit `68aa3661`)

Verificado leyendo el diff completo y los archivos resultantes:

- **`AlumnoDetailPage.vue`:** `watch(userId, (newId, oldId) => { if (newId !== oldId && Number.isInteger(newId)) void loadAll(); })` al final del script. `userId` es el computed `Number(route.params.userId)`, así que al salir de la ruta da `NaN` y el guard `Number.isInteger` evita el disparo espurio. `loadAll()` → `loadMemberProfile()` usa `userId.value` (verificado en línea 1224: `membersApi.getMember(userId.value)`), por lo que la recarga trae los datos del alumno NUEVO, y dispara en cascada suscripción/finanzas/entrenamiento.
- **`MemberReferralsTab.vue`:** `watch(() => props.userId, () => { overview.value = null; void load(); })` — resetea el overview (el template vuelve al spinner por el `v-if="loading"`/`v-else-if="overview"`) y recarga con el id nuevo.
- `vue-tsc` del admin: mismos 23 errores pre-existentes de la base (conteo verificado: 23), cero nuevos en los archivos tocados.

Nota menor (no gap): `loadAll()` no resetea `memberProfile` antes de recargar, así que durante el fetch se ven los datos anteriores bajo el `pageLoading`. Los datos SÍ se reemplazan al completar — correcto funcionalmente, solo un detalle cosmético de transición.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                            | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Mis referidos" (app) muestra el estado de cada vínculo (pendiente/activo/suspendido) y el descuento vigente, con código+share siempre visible y números leídos del server (VIS-01, roadmap SC1) | ✓ VERIFIED                  | `MisReferidosPage.vue` (416 líneas) fetchea `GET /members/referrals`, renderiza los 3 bloques de UI-SPEC S1; `activeCount`/`perLinkPercent`/`capPercent` leídos de la respuesta; `shareUrl` solo con el código público; ruta `/mis-referidos` + entrada en `ProfilePage.vue` confirmadas; eslint limpio                                       |
| 2   | El referidor recibe notificación al activarse el vínculo; el referido no; el re-cobro no duplica; un fallo nunca rompe el cobro (VIS-02, roadmap SC2)                                            | ✓ VERIFIED                  | `qualifyFirstPayment` devuelve el flip (service.ts:307-344); hook best-effort en `qualifyReferralOnCharge` (subscriptions/service.ts:405-434) con try/catch + log.warn; migración 0177 aplicada en DB local (`_migrations` id 183, enum confirmado con SHOW COLUMNS); 3/3 tests de `activation-notification.test.ts` cubren las 4 propiedades |
| 3   | `getReferralOverview` reusa D-30 (`computeReferralDiscountPercent`) y D-28 (`deriveCoveredUntil`) sin reimplementar; endpoint member IDOR-safe                                                   | ✓ VERIFIED                  | service.ts:207-293 — percent por llamada directa (sin `Math.min` propio); revoked excluidos; `referrals/routes.ts` deriva userId del token; test IDOR + test de paridad presentes                                                                                                                                                             |
| 4   | Admin ve la sección "Referidos" en la ficha con "Lo trajo"/"Trajo a", chips derivados, nota vacía y toast de error (VIS-03, roadmap SC3)                                                         | ✓ VERIFIED                  | `MemberReferralsTab.vue` + tab en `AlumnoDetailPage.vue` + `getReferrals` en `useMembersApi.ts`; chips info/positive/warning; empty note; vue-tsc sin errores nuevos                                                                                                                                                                          |
| 5   | Los links "Lo trajo"/"Trajo a" navegan a los datos frescos del miembro destino                                                                                                                   | ✓ VERIFIED (fix `68aa3661`) | Watchers en `AlumnoDetailPage.vue` (route param, con guard `Number.isInteger`) y `MemberReferralsTab.vue` (`props.userId`, reset + reload). Detalle en "Gap Closure"                                                                                                                                                                          |
| 6   | El endpoint `GET /admin/members/:userId/referrals` valida existencia y respeta country-scope, como sus rutas hermanas                                                                            | ✓ VERIFIED (fix `4f3ce105`) | Guard T-106-02 completo + `handleServiceError` + 4 tests nuevos (404 inexistente / soft-deleted / cross-country no-owner, 200 owner). Detalle en "Gap Closure"                                                                                                                                                                                |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                                                                   | Expected                                 | Status     | Details                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------- | ---------- | ---------------------------------------------------------- |
| `el-templo-api/src/modules/referrals/service.ts` `getReferralOverview`     | composición pura sobre las piezas de 157 | ✓ VERIFIED | Reuso D-30/D-28 confirmado, sin fórmula duplicada          |
| `el-templo-api/src/modules/referrals/routes.ts`                            | `GET /members/referrals` member-scoped   | ✓ VERIFIED | `request.user.userId`, registrado en `app.ts:186`          |
| `el-templo-api/src/modules/members/routes.ts` (`/:userId/referrals`)       | ruta admin con guards de rol + acceso    | ✓ VERIFIED | ADMIN_ROLES 403 + guard T-106-02 completo (fix `4f3ce105`) |
| `el-templo-api/test/referrals/member-endpoint.test.ts`                     | cobertura lazy/estados/config/IDOR       | ✓ VERIFIED | 6 casos, incluye paridad D-30 e IDOR                       |
| `el-templo-api/test/referrals/admin-referrals-endpoint.test.ts`            | cobertura 200/403/401/404 x3/owner       | ✓ VERIFIED | 7 casos tras el fix                                        |
| `el-templo-api/src/db/migrations/0177_referidos_notification_category.sql` | ALTER enum x2 + backfill NOT EXISTS      | ✓ VERIFIED | Aplicada local, cero `;` en comentarios                    |
| `el-templo-api/src/modules/notifications/types.ts`                         | union + categorías + seed                | ✓ VERIFIED | `referral_link_activated` con route `/mis-referidos`       |
| `el-templo-api/src/modules/subscriptions/service.ts`                       | hook best-effort                         | ✓ VERIFIED | try/catch + log.warn, 4 call-sites intactos                |
| `el-templo-app/src/pages/MisReferidosPage.vue`                             | pantalla completa                        | ✓ VERIFIED | 416 líneas, fetch+share+desglose+chips                     |
| `el-templo-app/src/router/routes.ts`                                       | ruta `/mis-referidos`                    | ✓ VERIFIED | Hija de MainLayout                                         |
| `el-templo-app/src/pages/ProfilePage.vue`                                  | item de entrada                          | ✓ VERIFIED | `card_giftcard` + push a `/mis-referidos`                  |
| `el-templo-admin/src/components/MemberReferralsTab.vue`                    | sección Referidos                        | ✓ VERIFIED | Incluye watcher de `props.userId` (fix `68aa3661`)         |
| `el-templo-admin/src/composables/useMembersApi.ts` `getReferrals`          | consumo del endpoint admin               | ✓ VERIFIED | Clon de `getNotes`, expuesto en el return                  |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` (tab Referidos)           | tab wireado + recarga por param          | ✓ VERIFIED | Tab + watcher del route param (fix `68aa3661`)             |

### Key Link Verification

| From                            | To                               | Via                                      | Status                 |
| ------------------------------- | -------------------------------- | ---------------------------------------- | ---------------------- |
| `app.ts`                        | `referralMemberRoutes`           | register prefix `/api/members/referrals` | WIRED                  |
| `getReferralOverview`           | `computeReferralDiscountPercent` | reuso directo D-30                       | WIRED                  |
| `getReferralOverview`           | `deriveCoveredUntil`             | estado por vínculo                       | WIRED                  |
| `qualifyReferralOnCharge`       | `queueNotification`              | encolado al referrerId tras el flip      | WIRED                  |
| `qualifyFirstPayment`           | hook de notificación             | retorno del vínculo flippeado            | WIRED                  |
| `ProfilePage.vue`               | `/mis-referidos`                 | router.push en item clickable            | WIRED                  |
| `MisReferidosPage.vue`          | `/members/referrals`             | api.get en fetch inicial                 | WIRED                  |
| `AlumnoDetailPage.vue`          | `MemberReferralsTab.vue`         | q-tab-panel name=referidos               | WIRED                  |
| `useMembersApi.getReferrals`    | `/admin/members/:id/referrals`   | api.get                                  | WIRED                  |
| `MemberReferralsTab.goToMember` | ficha del otro alumno            | router.push + watchers de recarga        | WIRED (fix `68aa3661`) |

### Requirements Coverage

| Requirement       | Source Plan    | Description                                                                                                       | Status      | Evidence                                                                                            |
| ----------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| VIS-01            | 158-01, 158-03 | Socio ve "Mis referidos" con estado + descuento                                                                   | ✓ SATISFIED | Backend y frontend verificados end-to-end                                                           |
| VIS-02            | 158-02         | Notificación al activarse un vínculo                                                                              | ✓ SATISFIED | Hook + migración + tests verificados; "descuento por caerse" opcional queda diferido explícitamente |
| VIS-03 (opcional) | 158-01, 158-04 | Panel/listado de referidos en el admin (implementado como sección en ficha, D-34; dashboard global diferido D-35) | ✓ SATISFIED | Sección completa + guards + navegación entre fichas corregida                                       |

No hay requirements orphaned.

### Anti-Patterns Found

| File                                                 | Line                      | Pattern                                                                                                                                                | Severity   | Impact                                                                                                    |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/members/routes.ts`        | guard de rol de referrals | Tab admin visible para roles que reciben 403 del endpoint (`gestion`/coach/recepción); comentario dice "Gestión consulta..." pero guard es ADMIN_ROLES | ⚠️ Warning | WR-05 del REVIEW — decisión de negocio pendiente, incluida en la lista de verificación humana             |
| `el-templo-api/src/modules/subscriptions/service.ts` | ~1377                     | Notificación encolada antes de la confirmación total del cobro en algunos charge-paths                                                                 | ⚠️ Warning | WR-01 — ventana de falso-positivo si el cobro falla después del flip (herencia del flip prematuro de 157) |
| `el-templo-api/src/modules/referrals/service.ts`     | 307-344                   | SELECT+UPDATE no atómicos en `qualifyFirstPayment`                                                                                                     | ⚠️ Warning | WR-02 — TOCTOU de baja probabilidad, doble-push en cobros concurrentes                                    |
| `el-templo-api/src/modules/referrals/service.ts`     | 90-107                    | `generateReferralCode` UPDATE sin guard `IS NULL`                                                                                                      | ⚠️ Warning | WR-03 — código puede pisarse en requests concurrentes                                                     |

Sin `TBD`/`FIXME`/`XXX` sin referencia en los archivos de la fase. Las 4 warnings restantes provienen del REVIEW (advisory) y no bloquean el goal de la fase: son races de baja probabilidad o decisiones de producto, documentadas para triage en el UAT / plan de hardening posterior.

### Human Verification Required

Ver frontmatter `human_verification` — 5 ítems:

1. **Pantalla "Mis referidos" (visual)** — recorrer los 3 bloques de UI-SPEC S1 desde Mi perfil; apariencia y copy.
2. **Share nativo + fallback** — share sheet en dispositivo; copia al portapapeles con notify donde el share no esté disponible.
3. **Push de activación end-to-end en staging** — primer pago de un referido → push al referidor con el nombre; tap navega a `/mis-referidos`.
4. **Navegación entre fichas del admin (verificación visual del fix `68aa3661`)** — click en "Lo trajo"/"Trajo a" debe refrescar TODA la ficha con el alumno destino.
5. **Decisión de rol para el tab Referidos (WR-05)** — gestión/coach ven el tab pero reciben 403; decidir con negocio si se amplía el guard o se oculta el tab.

### Gaps Summary

Sin gaps de código pendientes. Los 2 gaps de la verificación inicial (guard T-106-02 del endpoint admin, recarga de la ficha al navegar entre fichas) fueron corregidos en `4f3ce105` y `68aa3661` respectivamente, y re-verificados por lectura del código commiteado, no por narrativa. Los checks automáticos (tsc API, vue-tsc admin sin errores nuevos, greps de wiring, migración aplicada, estructura de tests) pasan todos. El status queda en `human_needed` porque la fase introduce UI nueva en app y admin que Franco todavía no vio, más comportamiento de dispositivo (share nativo, push FCM) que solo se valida a mano.

---

_Verified: 2026-07-11T14:45:00Z (re-verificación)_
_Verifier: Claude (gsd-verifier)_
