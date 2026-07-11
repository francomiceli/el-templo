---
phase: 158-visibilidad-y-comunicaci-n
verified: 2026-07-11T14:22:12Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Los links 'ir a la ficha' dentro de la sección Referidos del admin navegan correctamente a los datos frescos del miembro destino"
    status: failed
    reason: "AlumnoDetailPage.vue solo carga datos en onMounted (loadAll(), línea ~1409); no hay watch(() => route.params.userId, ...) ni onBeforeRouteUpdate, y MemberReferralsTab.vue tampoco observa cambios de props.userId (solo onMounted -> getReferrals). Como /alumnos/:userId es la misma ruta con distinto param, Vue Router reutiliza la instancia del componente: al clickear 'Lo trajo'/'Trajo a' la URL cambia pero la ficha completa (perfil, suscripción, finanzas, referidos) sigue mostrando al alumno anterior. Confirmado por lectura directa de código, no por REVIEW.md."
    artifacts:
      - path: "el-templo-admin/src/pages/AlumnoDetailPage.vue"
        issue: "Sin watch/onBeforeRouteUpdate sobre route.params.userId; loadAll() solo corre en onMounted (línea 1409-1411)"
      - path: "el-templo-admin/src/components/MemberReferralsTab.vue"
        issue: "goToMember hace router.push('/alumnos/${userId}') (líneas 127-129) pero no hay watch sobre props.userId para recargar tras la navegación"
    missing:
      - "watch(() => route.params.userId, ...) en AlumnoDetailPage.vue que resetee el estado y vuelva a llamar loadAll() cuando cambia el id"
      - 'watch(() => props.userId, ...) en MemberReferralsTab.vue (o key-ear el tab-panel con :key="userId") para recargar el overview al navegar entre fichas'
  - truth: "El endpoint GET /admin/members/:userId/referrals valida existencia del alumno y respeta el scope de país del actor, como sus rutas hermanas de guardia de acceso (financial-history, outstanding-concepts, GET/DELETE /:userId)"
    status: failed
    reason: "members/routes.ts:1650-1670 no aplica el guard T-106-02 (existencia + country-scope) que sí aplican las rutas hermanas per-member. Confirmado por lectura de código: (1) un userId inexistente llega directo a getReferralOverview -> generateReferralCode lanza Error genérico -> 500 crudo sin handleServiceError envolvente visible en ese bloque; (2) un admin con scope de país X puede leer el overview (nombres de contrapartes, código, descuento) de un alumno de país Y -> fuga cross-country del modelo de scope de fases 98/110; (3) un alumno soft-deleted es target válido y recibe código lazy generado como side-effect de un GET."
    artifacts:
      - path: "el-templo-api/src/modules/members/routes.ts"
        issue: "Ruta /:userId/referrals (líneas ~1650-1670) sin bloque de guard de existencia/país que sí tienen las rutas hermanas (ej. /:userId/outstanding-concepts, líneas 1600-1622 del mismo archivo)"
      - path: "el-templo-api/test/referrals/admin-referrals-endpoint.test.ts"
        issue: "Sin test para userId inexistente (hoy 500), alumno soft-deleted, ni cross-country con admin scoped"
    missing:
      - "Bloque de guard de existencia + country-scope antes de llamar a getReferralOverview, análogo al de /:userId/outstanding-concepts"
      - "Tests: 404 para id inexistente, 404 para alumno de otro país con token admin scoped"
human_verification: []
---

# Phase 158: Visibilidad y comunicación Verification Report

**Phase Goal:** El socio entiende y siente el beneficio: ve el estado de sus referidos y el descuento vigente, y es avisado cuando un vínculo se activa. End state: pantalla "Mis referidos" operativa en la app, notificación al activarse un vínculo, y (opcional) listado de referidos para gestión.
**Verified:** 2026-07-11T14:22:12Z
**Status:** gaps_found
**Re-verification:** No — verificación inicial

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                   | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Mis referidos" (app) muestra el estado de cada vínculo (pendiente/activo/suspendido) y el descuento vigente, con código+share siempre visible y números leídos del server (VIS-01, roadmap SC1)                        | ✓ VERIFIED | `MisReferidosPage.vue` (416 líneas) fetchea `GET /members/referrals`, renderiza los 3 bloques descritos en UI-SPEC S1; `activeCount`/`perLinkPercent`/`capPercent` leídos de la respuesta (grep confirma 6 usos); `shareUrl` = `https://app.eltemplo.org/register?ref=${referralCode}` (solo código público); ruta `/mis-referidos` registrada y entrada en `ProfilePage.vue` confirmadas; `vue-tsc`/`eslint` limpios sobre estos archivos                                                                                                                                                     |
| 2   | El referidor recibe notificación cuando su vínculo se activa (referido paga su primer plan); el referido no recibe push; el re-cobro no duplica; un fallo de la notificación nunca rompe el cobro (VIS-02, roadmap SC2) | ✓ VERIFIED | `qualifyFirstPayment` (referrals/service.ts:307-344) devuelve `{referrerId, referredFirstName} \| null` vía SELECT previo al UPDATE guardado (mecánica de 157 intacta); `qualifyReferralOnCharge` (subscriptions/service.ts:405-434) encola `referral_link_activated` al `referrerId` dentro de try/catch con `log.warn` best-effort; migración `0177` aplicada en DB local (confirmado por consulta directa a `_migrations` y `SHOW COLUMNS`); 3/3 tests de `activation-notification.test.ts` cubren exactamente estas 4 propiedades (leídos y verificados línea por línea, no solo contados) |
| 3   | Backend `getReferralOverview` compone el overview reusando D-30 (`computeReferralDiscountPercent`) y D-28 (`deriveCoveredUntil`) sin reimplementar mecánica; endpoint member es IDOR-safe (userId server-derived)       | ✓ VERIFIED | `service.ts:207-293` — `discount.percent = await this.computeReferralDiscountPercent(userId)` (sin `Math.min` propio); estado por vínculo derivado con `deriveCoveredUntil` de la contraparte; `revoked` excluido (`ne(referrals.status,"revoked")`); `referrals/routes.ts` lee `request.user.userId`, nunca de params/body; test IDOR explícito presente (`member-endpoint.test.ts:200`)                                                                                                                                                                                                      |
| 4   | Admin ve sección "Referidos" en la ficha con "Lo trajo"/"Trajo a", chips de estado derivado (mismo criterio que la app), y nota vacía + toast de error cuando corresponde (VIS-03, roadmap SC3, opcional)               | ✓ VERIFIED | `MemberReferralsTab.vue` renderiza ambas subsecciones condicionalmente, chips info/positive/warning mapeados correctamente, caption "se reactiva si vuelve" en suspended, nota "Este alumno no tiene referidos." cuando corresponde; tab `name="referidos"` wireado en `AlumnoDetailPage.vue` con `:user-id="userId"`; `getReferrals` en `useMembersApi.ts` clona el patrón `getNotes` con `extractError`; `vue-tsc` sin errores nuevos en estos archivos                                                                                                                                      |
| 5   | Los links "Lo trajo"/"Trajo a" de la ficha admin navegan correctamente a los datos frescos del miembro destino                                                                                                          | ✗ FAILED   | Ver `gaps` — `AlumnoDetailPage.vue` y `MemberReferralsTab.vue` no observan cambios de `route.params.userId`/`props.userId`; Vue Router reutiliza la instancia del componente en la misma ruta `/alumnos/:userId`, por lo que la ficha completa (perfil, suscripción, finanzas, referidos) sigue mostrando al alumno anterior tras el click. Confirmado leyendo el código, coincide con CR-02 de 158-REVIEW.md                                                                                                                                                                                  |
| 6   | El endpoint `GET /admin/members/:userId/referrals` valida existencia del alumno objetivo y respeta el country-scope del actor, igual que sus rutas hermanas per-member                                                  | ✗ FAILED   | Ver `gaps` — `members/routes.ts:1650-1670` no tiene el bloque de guard T-106-02 que sí tienen `/:userId/outstanding-concepts` (líneas 1600-1622 del mismo archivo), `/:userId/financial-history`, `GET/DELETE /:userId`. Un id inexistente produce 500 (Error genérico de `generateReferralCode`); un admin puede leer datos de un alumno de otro país. Coincide con CR-01 de 158-REVIEW.md                                                                                                                                                                                                    |

**Score:** 4/6 truths verified (los 2 fallos son de la superficie VIS-03/opcional, ambos verificados por lectura directa de código)

### Required Artifacts

| Artifact                                                                       | Expected                                 | Status                           | Details                                                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/referrals/service.ts` `getReferralOverview`         | composición pura sobre las piezas de 157 | ✓ VERIFIED                       | Reuso confirmado (D-30/D-28), sin fórmula duplicada                                                               |
| `el-templo-api/src/modules/referrals/routes.ts`                                | `GET /members/referrals` member-scoped   | ✓ VERIFIED                       | `request.user.userId`, registrado en `app.ts:186` con prefix `/api/members/referrals`                             |
| `el-templo-api/src/modules/members/routes.ts` (`/:userId/referrals`)           | ruta admin con guard `ADMIN_ROLES`       | ⚠️ VERIFIED con gap de seguridad | Guard de rol funciona (403 confirmado en test); guard de existencia/país ausente (gap #6)                         |
| `el-templo-api/test/referrals/member-endpoint.test.ts`                         | cobertura lazy/estados/config/IDOR       | ✓ VERIFIED                       | 6 casos, incluye paridad D-30 e IDOR                                                                              |
| `el-templo-api/test/referrals/admin-referrals-endpoint.test.ts`                | cobertura 200/403/401                    | ✓ VERIFIED (parcial)             | 3 casos; faltan id-inexistente/cross-country/soft-deleted (gap #6)                                                |
| `el-templo-api/src/db/migrations/0177_referidos_notification_category.sql`     | ALTER enum x2 + backfill NOT EXISTS      | ✓ VERIFIED                       | Aplicada en DB local (`_migrations` id 183); cero `;` en comentarios; enum termina en `referidos` en ambas tablas |
| `el-templo-api/src/modules/notifications/types.ts`                             | union + `NOTIFICATION_CATEGORIES` + seed | ✓ VERIFIED                       | `referral_link_activated` con `route: "/mis-referidos"`                                                           |
| `el-templo-api/src/modules/subscriptions/service.ts` `qualifyReferralOnCharge` | hook best-effort                         | ✓ VERIFIED                       | try/catch + `log.warn("... best-effort")`, 4 call-sites intactos                                                  |
| `el-templo-app/src/pages/MisReferidosPage.vue`                                 | pantalla completa                        | ✓ VERIFIED                       | 416 líneas, fetch+share+desglose+chips confirmados por grep y lectura                                             |
| `el-templo-app/src/router/routes.ts`                                           | ruta `/mis-referidos`                    | ✓ VERIFIED                       | Registrada como hija de MainLayout                                                                                |
| `el-templo-app/src/pages/ProfilePage.vue`                                      | item de entrada                          | ✓ VERIFIED                       | `settings-card__item` con `card_giftcard` + `router.push('/mis-referidos')`                                       |
| `el-templo-admin/src/components/MemberReferralsTab.vue`                        | sección Referidos                        | ⚠️ VERIFIED con gap de wiring    | Renderiza correctamente en carga inicial; no recarga al re-navegar entre fichas (gap #5)                          |
| `el-templo-admin/src/composables/useMembersApi.ts` `getReferrals`              | consumo del endpoint admin               | ✓ VERIFIED                       | Clon de `getNotes`, expuesto en el return del composable                                                          |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` (tab Referidos)               | tab wireado                              | ⚠️ VERIFIED con gap de wiring    | Tab renderiza `MemberReferralsTab` correctamente en carga inicial; comparte el gap #5                             |

### Key Link Verification

| From                              | To                                      | Via                                                | Status                        | Details                                                                                                            |
| --------------------------------- | --------------------------------------- | -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `app.ts`                          | `referralMemberRoutes`                  | `app.register` con prefix `/api/members/referrals` | WIRED                         | Confirmado línea 186                                                                                               |
| `getReferralOverview`             | `computeReferralDiscountPercent`        | reuso directo D-30                                 | WIRED                         | Sin `Math.min` propio en `getReferralOverview`                                                                     |
| `getReferralOverview`             | `deriveCoveredUntil`                    | estado por vínculo                                 | WIRED                         | Import desde `subscriptions/service`                                                                               |
| `qualifyReferralOnCharge`         | `NotificationService.queueNotification` | encolado al referrerId tras el flip                | WIRED                         | try/catch envolvente confirmado                                                                                    |
| `qualifyFirstPayment`             | hook de notificación                    | retorno del vínculo flippeado                      | WIRED                         | Firma nueva confirmada, `discount-computation.test.ts` alineado a `.resolves.toBeNull()`                           |
| `ProfilePage.vue`                 | `/mis-referidos`                        | `router.push` en item clickable                    | WIRED                         | Confirmado                                                                                                         |
| `MisReferidosPage.vue`            | `/members/referrals`                    | `api.get` en fetch inicial                         | WIRED                         | Confirmado                                                                                                         |
| `AlumnoDetailPage.vue`            | `MemberReferralsTab.vue`                | `q-tab-panel name=referidos`                       | WIRED (carga inicial)         | Funciona al entrar a la ficha; NO se re-wirea al navegar entre fichas (ver gap #5)                                 |
| `useMembersApi.getReferrals`      | `/admin/members/:id/referrals`          | `api.get`                                          | WIRED                         | Confirmado                                                                                                         |
| `MemberReferralsTab` `goToMember` | `/alumnos/:userId` (otra ficha)         | `router.push`                                      | **NOT_WIRED (efectivamente)** | El push cambia la URL pero ningún watcher recarga los datos — la ficha sigue mostrando al alumno anterior (gap #5) |

### Requirements Coverage

| Requirement       | Source Plan                               | Description                                       | Status                    | Evidence                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VIS-01            | 158-01 (backend), 158-03 (frontend)       | Socio ve "Mis referidos" con estado + descuento   | ✓ SATISFIED               | Backend y frontend verificados end-to-end                                                                                                                                                                                        |
| VIS-02            | 158-02                                    | Socio recibe notificación al activarse un vínculo | ✓ SATISFIED               | Hook + migración + tests verificados; "descuento por caerse" queda diferido explícitamente (documentado como opcional en el roadmap, no exigido)                                                                                 |
| VIS-03 (opcional) | 158-01 (backend), 158-04 (frontend admin) | Gestión ve panel/listado de referidos en el admin | ⚠️ SATISFIED PARCIALMENTE | La sección existe y renderiza correctamente en carga inicial; dos defectos verificados (CR-01 country-scope/500, CR-02 navegación entre fichas) degradan la funcionalidad prometida por el propio must-have ("link a esa ficha") |

No hay requirements orphaned: las 3 IDs (VIS-01/02/03) están declaradas en al menos un plan y todas tienen evidencia de implementación.

### Anti-Patterns Found

| File                                                                        | Line                | Pattern                                                                                                               | Severity   | Impact                                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-api/src/modules/members/routes.ts`                               | ~1650-1670          | Ruta admin sin guard de existencia/country-scope (T-106-02) presente en rutas hermanas                                | 🛑 Blocker | 500 en id inexistente; fuga cross-country de nombres/código/descuento                                                                                              |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` + `MemberReferralsTab.vue` | 1409-1411 / 127-129 | Ausencia de `watch` sobre el param de ruta / prop `userId`                                                            | 🛑 Blocker | Navegación entre fichas vía "Lo trajo"/"Trajo a" muestra datos del alumno equivocado — riesgo de acción (cobro, borrado) sobre la persona incorrecta               |
| `el-templo-api/src/modules/members/routes.ts` (ruta referrals)              | guard de rol        | `ADMIN_ROLES` (admin/owner) contradice el copy del comentario ("Gestión consulta...") y el tab admin no gatea por rol | ⚠️ Warning | Rol `gestion` ve el tab pero recibe 403 al abrirlo (WR-05 de 158-REVIEW.md, no verificado como blocker porque el roadmap no especifica el rol exacto de "gestión") |
| `el-templo-api/src/modules/subscriptions/service.ts`                        | ~1377 (call site)   | Notificación se encola antes de que el cobro esté 100% confirmado en algunos charge-paths                             | ⚠️ Warning | Ventana de falso-positivo si el cobro falla después del flip (WR-01 de 158-REVIEW.md)                                                                              |
| `el-templo-api/src/modules/referrals/service.ts`                            | 307-344             | SELECT + UPDATE no atómicos en `qualifyFirstPayment`                                                                  | ⚠️ Warning | TOCTOU de baja probabilidad, doble-notificación en cobros concurrentes (WR-02)                                                                                     |
| `el-templo-api/src/modules/referrals/service.ts`                            | 90-107              | `generateReferralCode` UPDATE sin guard `IS NULL`                                                                     | ⚠️ Warning | Colisión de dos requests concurrentes puede pisar un código ya compartido (WR-03)                                                                                  |

No se encontraron `TBD`/`FIXME`/`XXX` sin referencia en los archivos modificados por esta fase (los únicos matches de grep fueron falsos positivos: `PREFIJO-XXXX` como formato de string y la palabra española "TODOS").

### Human Verification Required

Ninguno — todos los truths son verificables por lectura de código y consulta directa a la base de datos local. Los defectos hallados (gaps #5 y #6) son deterministas y ya confirmados programáticamente, no requieren juicio humano para constatar su existencia.

### Gaps Summary

La fase entrega end-to-end VIS-01 (pantalla "Mis referidos" en la app) y VIS-02 (notificación de activación) sin defectos: leí el código de los 4 planes completo (no solo los SUMMARY) y confirmé backend, frontend, migración aplicada localmente, y tests que cubren cada comportamiento declarado en `must_haves`.

VIS-03 (explícitamente opcional en el roadmap) está construida y visualmente correcta en la carga inicial, pero tiene **dos defectos verificados por lectura directa de código** (no solo citados de 158-REVIEW.md — los confirmé independientemente):

1. **CR-02 (navegación rota):** clickear "Lo trajo"/"Trajo a" cambia la URL pero no recarga los datos de la ficha — el admin puede terminar operando (cobrando, editando, borrando) sobre el alumno equivocado creyendo que está en la ficha del alumno al que acaba de navegar. Este es el primer flujo de la aplicación admin que navega ficha→ficha dentro de la misma ruta, y lo introduce esta fase.
2. **CR-01 (guard de acceso incompleto):** la ruta admin nueva es la única entre sus hermanas per-member que no valida existencia del alumno ni respeta el country-scope del actor — produce 500 en ids inexistentes y permite leer datos de referidos de alumnos de otro país.

Ambos son agrupables bajo la misma causa raíz: el plan 158-04/158-01 no siguió el molde completo de sus rutas/páginas hermanas (usó `notes` — que tampoco tiene country-scope — como molde para el guard, en vez de `outstanding-concepts`/`financial-history`; y no replicó el patrón de recarga por cambio de param que ninguna otra pantalla del admin necesitaba hasta ahora porque ninguna otra tenía links ficha→ficha).

Dado que ambos son defectos de código verificados (no solo narrativa de REVIEW) que afectan la superficie VIS-03 entregada, mantengo el status en `gaps_found` pese a que VIS-03 es "(opcional)" en el roadmap — la superficie SÍ se construyó, y lo construido tiene bugs de seguridad/correctness reales que un plan de cierre debería resolver antes de dar la fase por buena, o bien Franco puede decidir aceptarlos explícitamente vía override (p.ej. si el volumen de tráfico cross-ficha es bajo y se prioriza shippear VIS-01/VIS-02 primero, dejando VIS-03 para un fix-plan corto).

**Esto luce intencional/priorizable.** Si Franco decide aceptar estos gaps de VIS-03 para no bloquear el push de VIS-01/VIS-02 a staging, puede agregar a este VERIFICATION.md:

```yaml
overrides:
  - must_have: "Los links 'ir a la ficha' navegan correctamente a los datos frescos del miembro destino"
    reason: "VIS-03 es opcional; se acepta el bug de navegación temporalmente, fix-plan corto post-158"
    accepted_by: "Franco"
    accepted_at: "2026-07-11T..."
  - must_have: "El endpoint admin valida existencia y country-scope del alumno objetivo"
    reason: "VIS-03 es opcional; se acepta el gap de seguridad temporalmente, fix-plan corto post-158"
    accepted_by: "Franco"
    accepted_at: "2026-07-11T..."
```

---

_Verified: 2026-07-11T14:22:12Z_
_Verifier: Claude (gsd-verifier)_
