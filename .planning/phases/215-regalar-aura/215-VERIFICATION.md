---
phase: 215-regalar-aura
verified: 2026-11-18T08:30:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification: false
gaps: []
human_verification:
  - test: "Correr la suite de integración de la fase en CI (unos 155 `it` nuevos: gifts-member, gifts-coach, gifts-void, gifts-admin-list, gifts-push, inbox-queue, inbox-routes, migraciones 0349-0351, conteos de tenancy 138/143/138/601)"
    expected: "Todo en verde. Nunca corrió en local (se cuelga) ni en CI: es la única prueba de que las reglas funcionan contra MySQL real"
    why_human: "Regla dura de la fase: sin tests de integración en local, sin push. Requiere OK de Franco para subir a staging"
  - test: "Aplicar las migraciones 0349, 0350 y 0351 en staging y correr `consultas/02-conciliacion-con-regalos.sql` tras un regalo de alumno, uno de profe, una anulación y un deshacer asistencia"
    expected: "Todos los bloques en 0 filas (criterio 8 sobre datos reales)"
    why_human: "Las migraciones no se aplicaron en la base local por regla de la fase; las consultas son de solo lectura y las corre Franco"
  - test: "Ver renderizadas a 360, 390 y 412 px: barra de arriba (perfil, campana, salir; Entrenar con SPARTAN), card de hoy con regalo, hoja Dar Aura, pantalla Notificaciones, panel de asistencia del admin y página Regalos de Aura"
    expected: "Sin desborde ni recorte; pie de la hoja respeta el área segura del iPhone; tocables de 44 px"
    why_human: "Ninguna pantalla se vio renderizada: solo hay revisión estática del código"
  - test: "Push real en iPhone y Android: regalo de alumno y de profe con la app cerrada, en segundo plano y abierta; tocar la push"
    expected: "Llega 'Sofía M. te dio Aura' / 'Tu profe Fran te dio Aura' con 'Motivo: ...'; tocarla abre Mi Templo con el detalle de Aura; con la app abierta sube el número de la campana"
    why_human: "FCM y el comportamiento nativo de Capacitor no se pueden comprobar sin dispositivo"
  - test: "Revisar las decisiones autónomas (215-DECISIONES-AUTONOMAS.md) y los textos [BORRADOR] del UI-SPEC"
    expected: "Franco las acepta o las cambia. Las que más pesan: 'profe' = cualquier profe de la sede donde asistió el alumno (no se exige que sea el titular de la clase), tope semanal que solo cuenta regalos no anulados, categoría 'Motivación' sin interruptor en Perfil (los regalos no se pueden silenciar)"
    why_human: "Son decisiones de producto tomadas sin supervisión, no verificables contra el código"
---

# Fase 215: Regalar Aura. Informe de verificación

**Objetivo de la fase:** una persona le da Aura a otra como reconocimiento (alumnos a un compañero de su clase, profes a sus alumnos del día) y quien recibe se entera por push y por una bandeja de notificaciones nueva.
**Verificado:** 2026-11-18, rama `feat/regalar-aura` (HEAD `b99da905c`), contra el código y no contra los SUMMARY.
**Estado:** human_needed. No hay gaps bloqueantes; el código del objetivo existe, está conectado de punta a punta y los chequeos estáticos y unitarios pasan. Lo que falta es solo lo que por regla de la fase no se pudo correr (integración, migraciones en una base real, pantallas renderizadas, push real).
**Re-verificación:** No, verificación inicial.

## Cumplimiento de los criterios del ROADMAP

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | El alumno da 1 punto a un solo compañero que también asistió, desde Mi Templo, con motivo de una lista, hasta el final del día siguiente | VERIFICADO | `gift-service.ts` `giveMemberGift`: transacción con `FOR UPDATE` sobre el dador, `assertGiveable` (asistencia propia, plazo `isWithinGiftWindow` hoy o ayer, un regalo por asistencia, clase terminada), receptor tiene que estar en `listEligibleClassmates` (asistencia misma clase y fecha), motivo validado con `isGiftReason` (4 motivos en `gift-rules.ts`). UNIQUE `(tenant, giver_attendance_id)` en mig 0349 como última barrera. Monto `AURA_AMOUNTS.giftMember = 1`. Cableado: `TodayCard.vue` (`open-gift`) a `MiTemplo.vue` a `GiveAuraSheet.vue` a `useAuraGiftsApi` a `POST /members/aura/gifts` (`gift-member-routes.ts`, registrada en `temploGamificationModule`) |
| 2 | Máximo 2 regalos por semana a la misma persona, y no al profe | VERIFICADO | `GIFT_WEEKLY_CAP = 2`, `weeklyGiftCountsByReceiver` (lunes a domingo por fecha de clase, solo `vigente`) se revalida dentro de la transacción (409 `REGALO_TOPE_SEMANAL`); la hoja muestra la cara apagada con `blockedReason`. El profe no aparece: `listEligibleClassmates` excluye `ALL_STAFF_ROLES` |
| 3 | El profe da 2 puntos (editable) una vez por día a cada alumno de ese día desde el panel de asistencia | VERIFICADO | `giveCoachGift`: rol `isCoachLikeRole`, sede asignada, ventana hoy o ayer, receptor elegible, UNIQUE `(tenant, profe, receptor, coach_gift_date)` con 409 `REGALO_YA_DADO`. Valor en `gift-settings.ts` (`aura.gift_coach_amount`, 1 a 10, por gimnasio, default 2); `PUT /gift-settings` solo owner y admin. UI: `SlotAttendancePanel.vue` botón y chip, `CoachGiftDialog.vue`, y el esquema de respuesta de `slotAttendanceSchema` declara `gift` y `coachGiftAmount` (sin eso fast-json-stringify los descartaría). Valor editable en `RegalosAuraPage.vue` (`saveAmount`) |
| 4 | Regalar no descuenta al que regala; lo recibido aparece en el detalle privado de quien recibe | VERIFICADO | Solo se acredita al receptor (`awardInTransaction`, fuente `social`, `reference_type aura_gift`); el dador no recibe fila. `member-routes.ts` arma el texto con dador y motivo en una consulta por página; `movement-labels.ts` cubre regalo, regalo de profe y "Regalo anulado". `social` no es una fuente del tope diario (`DAY_CAP_APP_SOURCES` solo tiene entrenamiento y plan a medida), coherente con D-13 |
| 5 | Quien se ocultó no regala ni recibe | VERIFICADO | Dador: `giverAccess` usa `getViewerCommunityState` + `listAccess` (`canSeeList` y no staff). Receptor: `listEligibleClassmates` filtra con `effectiveVisible` (preferencia, edad, país) y excluye clases de prueba. Vale también para el profe (misma función). Wellhub sin plan no regala (sin `hasPlanInEffect`) |
| 6 | Push al receptor y bandeja en la barra de arriba con marca de sin leer | VERIFICADO | `gift-push.ts` encola después del commit (error solo se loguea) con categoría `motivacion`, `inboxKind aura_gift`, `inboxRefId` y ruta `/mi-templo?aura=detalle`. `NotificationService`: `recordFromQueue` antes de mirar dispositivos (idempotente por UNIQUE), `recordDirect` para quien no tiene push (clave anti-duplicado), `recordOpened` marca leído, purga a 90 días enganchada en `notification-cron.ts`. Novedades etiquetadas `anuncios`. Rutas `/api/members/notifications` (lista paginada, unread-count, read, read-all) registradas en `app.ts`, filtradas por tenant y userId. App: `NotificationBell` en `MainLayout.vue` entre perfil y salir (y riel de escritorio), `NotificationsPage.vue` en la ruta `notificaciones`, store con `refreshCount` al iniciar sesión, al volver a primer plano y al llegar una push, y `MiTemploHeader.vue` abre el detalle con `?aura=detalle` |
| 7 | El staff anula un regalo y el punto se descuenta | VERIFICADO | `gift-void.ts` `voidGift`: CAS `vigente` a `anulado` (doble anulación da 409), reversa exacta `-amount` con referencia `aura_gift_void`; `POST /admin/aura/gifts/:id/void` (owner, admin, admin_sede acotado a sus sedes, 404 fuera de ellas). `removeCheckIn` (ambas ramas) llama a `voidGiftsForAttendance` antes de borrar la asistencia. UI en `RegalosAuraPage.vue` (`openVoid`/`confirmVoid`), ruta y menú del admin cableados |
| 8 | Los puntos mostrados coinciden con la suma del ledger por usuario | VERIFICADO (por construcción) | `earnedRowsFilter()` no excluye `social`, así que regalo y reversa entran en la suma que ve la persona; `awardInTransaction` escribe ledger y `aura_balances` en la misma transacción (rollback conjunto). Existe `consultas/02-conciliacion-con-regalos.sql`. La prueba contra datos reales queda pendiente (ver humano) |

**Puntaje:** 8/8 criterios verificados contra el código. D-21 (medición de 4 semanas) también existe: `weeklyGiftUsage` más la tabla "Cómo se está usando" y `consultas/01-medicion-regalos.sql`.

## Artefactos y cableado (niveles 1 a 4)

| Artefacto | Estado | Detalle |
|-----------|--------|---------|
| Migraciones 0349, 0350, 0351 y esquemas Drizzle | VERIFICADO | SQL y esquema coinciden columna por columna; sin `;` en comentarios; numeración libre (0348 reservada); tablas registradas en `tenant-tables.ts` (`aura_gifts`, `member_notifications`) |
| API del regalo (`aura/gift-*.ts`) | VERIFICADO | Sustantivo (servicio de 906 líneas, reglas, errores con código, esquemas de respuesta con `additionalProperties: false`), registrado en el manifiesto del módulo, sin piezas huérfanas |
| API de la bandeja (`notifications/inbox-*.ts`) | VERIFICADO | Servicio, reglas, rutas y esquemas conectados a `NotificationService` y `app.ts` |
| App: `GiveAuraSheet`, `NotificationBell`, `NotificationCountBadge`, `NotificationsPage`, stores y composables | VERIFICADO | Todos importados y usados (MainLayout, MiTemplo, TodayCard, router). Las URLs del cliente coinciden con las rutas de la API |
| Admin: `CoachGiftDialog`, `SlotAttendancePanel`, `RegalosAuraPage`, `useAuraGiftsApi` | VERIFICADO | Ruta `alumnos/regalos` antes de `alumnos/:userId`, ítem de menú por rol, endpoints coinciden |
| Flujo de datos (nivel 4) | FLUYE | Todas las listas salen de consultas reales a `attendance`, `aura_gifts` y `member_notifications`; no hay retornos estáticos ni props vacíos |

## Chequeos ejecutados en esta verificación

| Chequeo | Resultado |
|---------|-----------|
| `cd el-templo-api && npx tsc --noEmit` | exit 0, 0 errores |
| `pnpm lint:tenant` | 0 discrepancias (306 accesos cubiertos por exención) |
| Unitarios API (`vitest.config.unit.ts`: gift-rules, gift-errors, movement-labels, amounts, inbox-rules) | 87 de 87 |
| Unitarios app (gift-view, notifications-view) | 61 de 61 |
| `vue-tsc` app | 20 errores, todos de archivos que la fase no tocó (axios, sentry, logger, `#q-app/wrappers`, etc.); ninguno en regalo, bandeja, campana ni Mi Templo |
| `vue-tsc` admin | ningún error en `RegalosAuraPage`, `CoachGiftDialog`, `SlotAttendancePanel`, rutas ni composables de regalo |
| Marcadores `TBD/FIXME/XXX/TODO`, `console.*`, `any` en archivos de la fase | ninguno |

Los tests de integración NO se corrieron (regla de la fase).

## Anti-patrones y observaciones (sin bloqueantes)

| Nivel | Observación |
|-------|-------------|
| Info | "Probar en tu teléfono" (`sendTestNotification`) inserta la fila ya como `sent` y no pasa por la bandeja. Es un envío de prueba del admin a su propia cuenta; coherente con D-18 en la práctica |
| Info | "Profe de la clase" se resolvió como cualquier profe con la sede asignada (cubre suplencias); un profe no titular de esa clase puede regalar a sus asistentes. Decisión autónoma documentada, a confirmar con Franco |
| Info | Las pushes de regalo usan la categoría `motivacion`, que no tiene interruptor en Perfil: hoy no se pueden silenciar. Documentado en las decisiones |
| Info | Tope semanal cuenta solo regalos `vigente` y por fecha de clase (no de creación). Documentado |
| Info | Los 20 errores de `vue-tsc` de la app y los 18 de `typecheck:tests` de la API son deuda previa de la 214, no de esta fase |

## Resumen de gaps

Ninguno. Todos los criterios del ROADMAP tienen implementación real, conectada de punta a punta y sin stubs. Lo que impide marcar `passed` es verificación que por diseño de la fase solo puede hacer una persona o CI: integración contra MySQL, migraciones aplicadas, render a 360/390/412 px y push en dispositivos. El `215-UAT.md` ya lista esos pasos.

---

_Verificado: 2026-11-18_
_Verificador: Claude (gsd-verifier)_
