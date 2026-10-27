---
phase: 204-usuarios-wellhub
verified: 2026-10-27T00:00:00Z
status: human_needed
score: 6/6 roadmap success criteria verified by code reading (nothing executed)
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
human_verification:
  - test: "CI completo sobre la rama (typecheck API, lint, tests de integracion, build) y `vue-tsc` LOCAL del admin"
    expected: "Verde. Nada de la fase se corrio: ni tests, ni tsc, ni lint, ni build. CI no typechequea el admin, asi que un error de tipos en un .vue solo lo caza `vue-tsc` local"
    why_human: "Politica del usuario: los tests corren en CI; el worktree no tiene node_modules"
  - test: "Staging: abrir Alumnos y mirar el badge del visitante Wellhub, de un ex-alumno vinculado (Palladino, user 4053 si ya esta) y de un socio activo vinculado"
    expected: "Visitante = 'Wellhub' (color Clay/secondary), ex-alumno = 'Inactivo · Wellhub', socio activo = solo 'Activo'. Toggle 'Solo Wellhub' junto a 'Solo deudores' filtra bien y se combina con Estado"
    why_human: "Apariencia, color en la paleta de marca y datos reales"
  - test: "Staging: Horarios de una clase de hoy y de una futura con reserva Wellhub"
    expected: "Chip 'Wellhub' desde la reserva (antes del check-in). Eliminar reserva deshabilitado con tooltip 'Se gestiona desde la app de Wellhub'. 'Marcar asistencia' habilitado. Marcar a mano deja 'Wellhub (a mano)'. Deshacer la a mano funciona. Deshacer una validada esta deshabilitado"
    why_human: "Flujo de UI en vivo, tooltips sobre botones deshabilitados"
  - test: "Staging: flujo a mano -> webhook. Marcar presente a mano una reserva Wellhub y despues disparar el check-in real/sandbox del usuario en la app de Wellhub"
    expected: "La fila pasa de 'wellhub_manual' a 'wellhub' sin duplicarse y el reporte mueve la visita del item 2 al item 1"
    why_human: "Integracion externa con Wellhub (validate real)"
  - test: "Staging: ficha del Wellhub -> 'Asociar al templo' -> cargar plan -> aceptar '¿Enviarle el acceso a la app?'"
    expected: "Se crea una fila en wellhub_conversions (kind nuevo o ex_alumno), el estado pasa a activo, llega el mail con la contrasena temporal y el alumno puede entrar a la app. Para un alumno que ya tenia cuenta, el confirm avisa del reseteo"
    why_human: "Flujo end to end con proveedor de mail (Resend) y la app movil"
  - test: "Staging: 'Unir con alumno existente' sobre un duplicado Wellhub puro"
    expected: "Se mueven gympass_id, reservas, visitas, wellhub_bookings y notas; el duplicado queda dado de baja; hay fila de auditoria wellhub_member_merged; rechazos con mensaje en espanol (otro ID de Wellhub, choque de reserva, no es puro); solo admin/owner ve el boton"
    why_human: "Operacion destructiva sin deshacer: mirarla una vez con datos reales"
  - test: "Staging: Reportes > Wellhub (mes y sede) contra la liquidacion de Wellhub; Reportes > Accesos con filtro 'Wellhub' y su xlsx"
    expected: "Validadas coinciden con lo que factura Wellhub, a mano aparte, conteo de personas/reservas/no-shows/conversiones razonable, fronteras de mes por tz de sede. Fuente muestra 'Wellhub' / 'Wellhub (a mano)' en pantalla y en el xlsx"
    why_human: "Cotejo con datos externos y lectura visual de la pestana"
  - test: "Staging: Cobros busca un Wellhub (visitante y ex-alumno), y abre la ficha con ?asociar=1"
    expected: "Badge Wellhub en el buscador; al seleccionarlo sale el aviso y 'Ir a la ficha' abre el CTA 'Asociar al templo'. Como admin_sede, una persona Wellhub de OTRA sede lleva a un 404 (ver defecto W2)"
    why_human: "UX del aviso y del caso admin_sede"
  - test: "Staging/prod comparten host MySQL: confirmar que la migracion 0300 corre limpia (enum append + tabla nueva) en el deploy"
    expected: "_migrations registra 0300, attendance_source termina en wellhub_manual, existe wellhub_conversions con FK. Las 0298/0299 de feat/201-conquer entran despues sin problema (el runner aplica por nombre, no por orden)"
    why_human: "Deploy real sobre base compartida"
---

# Phase 204: Usuarios Wellhub — Verification Report

**Phase Goal:** El staff distingue a quien viene por Wellhub (visitante nuevo, ex-alumno o socio activo vinculado por email) en el admin y en Horarios, las métricas separan la actividad Wellhub de la de socios, y una reserva o visita Wellhub nunca afecta el plan de un socio.
**Verified:** 2026-10-27
**Status:** human_needed
**Re-verification:** No, verificación inicial.

**Alcance de la verificación:** lectura de código (66 commits, 113 archivos) contra ROADMAP, CONTEXT (D-01..D-28), los 16 PLAN/SUMMARY y EXECUTOR-RULES. **No se ejecutó nada** (sin tests, typecheck, lint ni build; sin `node_modules`). Para compensar se hicieron chequeos mecánicos propios: (a) cada `import { X }` relativo o `src/` de los 113 archivos tocados (API src+test, admin) contra el export real: 0 problemas; (b) imports sin usar en archivos tocados: 0 introducidos por la fase; (c) `console.*`, `any`, `TODO/FIXME/XXX/TBD/HACK` en las líneas agregadas: 0; (d) cada acceso nuevo a tablas gym-owned contra el lint de tenancy (`tenantWhere`/`tenantValues`/`tenant_id` en el mismo statement): todos cumplen; (e) campos nuevos contra los schemas de respuesta de Fastify: todos declarados.

## Goal Achievement

### Roadmap success criteria

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Admin: estado `wellhub` con label, color y filtro propios; etiqueta permanente desde `gympass_id` | VERIFICADO (en código) | `useStatusBadge.ts` + `utils/wellhub-label.ts` (`wellhub: 'Wellhub'`, color `secondary`); `UserStatus` incluye `wellhub` en `types/member.ts:106`; API acepta `status=wellhub` (`members/schemas.ts` listMembers/export/updateLead enum) y el toggle `wellhubOnly` (`members/service.ts` `wellhubOnlySql`, `AlumnosPage.vue:96-105,877,919`); export con columna Estado "Wellhub" / "Inactivo · Wellhub" (`members/service.ts` ~2642); etiqueta = `users.gympass_id IS NOT NULL AND estado efectivo <> 'activo'` (`wellhubLabelVisibleSql`), un único fragmento para filtro y proyección |
| 2 | Ex-alumnos y socios activos vinculados se ven como tales + Wellhub; ex-alumnos salen de la campaña `bajas` | VERIFICADO (en código) | Ex-alumno: "Inactivo · Wellhub" vía `showWellhubLabel`. Socio activo: solo "Activo" por D-03 (decisión que acota la redacción del SC), y aparece en el toggle si tuvo reserva/visita en 30 días (`recentWellhubActivitySql`). `audience-service.ts:139-141` agrega `isNull(u.gympassId)` a `bajasConditions` (usado también por el conteo) |
| 3 | Horarios: el roster marca reservas/asistencias Wellhub antes y después del check-in | VERIFICADO (en código) | Roster de hoy: `attendance/service.ts` suma `bookingSource` y `isWellhub = isWellhubBookingSource(b.bookingSource)` (o por asistencia `wellhub`/`wellhub_manual`), declarado en `attendance/schemas.ts` `slotAttendanceItemSchema`. Detalle futuro: `scheduling/service.ts:~599,~662` devuelve `source`, declarado en `bookingRecordSchema`. `SlotDetailDialog.vue` pinta el chip en ambas vistas, deshabilita borrar con tooltip y deja "Marcar asistencia" |
| 4 | Métricas de asistencia, no-show, embudo y log de accesos separan Wellhub de socios; reporte Wellhub por sede | VERIFICADO con nota (ver W1) | Log de accesos: filtro `source=wellhub` (expande a `wellhub`+`wellhub_manual`) y etiquetas `QR/Manual/Wellhub/Wellhub (a mano)` en JSON, xlsx y pantalla. Embudo: `entryOrigin='wellhub'` (`funnel-service.ts getWellhubFunnel`). Reporte: `reports/wellhub-report-service.ts` + ruta `GET /api/admin/reports/wellhub` + pestaña `WellhubReport.vue` (validadas, a mano, personas, reservas, no-shows, conversiones y tasa). Las métricas de número único (check-ins diarios, heatmap, no-show rate) siguen como total que incluye Wellhub, por D-13/D-14 |
| 5 | Un no-show o visita Wellhub no descuenta clases ni consume el límite diario/semanal de un socio activo | VERIFICADO (en código) | Las 11 fugas de `204-RESEARCH.md` están cerradas con los helpers NULL-safe de `shared/wellhub-sources.ts`: (1) `mark-no-shows.ts:205-207`; (2) `attendance/service.ts` QR `notWellhubBookingSql`; (3) guards diario fast-path e in-tx; (4) `countWeeklyAttendance`; (5) `coachCheckIn`; (6) `removeCheckIn`; (7-9) `booking-service.ts` regla del día, semanal, presupuesto, bonus; (10-11) webhook (lado Wellhub separado y `isWellhubBookingSql()` en la reserva del día). Extras: uso semanal de la SubscriptionCard y bloqueo de editar fecha de inicio/compensar días (`subscriptions/service.ts`). Ningún sitio usa `source <> 'wellhub'` pelado |
| 6 | Tests de integración cubren los tres casos (visitante nuevo, ex-alumno, socio activo) | VERIFICADO (existen; no ejecutados) | `test/fixtures/wellhub-personas.ts` define las tres personas; 12 archivos nuevos en `test/wellhub/` y `test/reports/wellhub-report.test.ts`, `test/migrations/0300-...test.ts`, ISO-03 de las tres rutas nuevas. Imports y helpers resuelven (chequeo mecánico). Su resultado real depende de CI |

**Score:** 6/6 criterios verificados por lectura. Estado final `human_needed` porque nada se ejecutó y hay verificación visual/externa pendiente.

### Decisiones D-01..D-28

| D | Estado | Dónde |
|---|--------|-------|
| D-01/D-02/D-03 etiqueta permanente, visible si no es socio activo | OK | `wellhubLabelVisibleSql`; `memberStatusLabel` (`wellhub-label.ts`); card muestra última visita |
| D-04 conversión registrada como evento | OK | `wellhub/conversion.ts`, llamado desde `recomputeUserStatus` en `subscriptions/service.ts:~7905` (envuelto en try/catch, no voltea el cobro) |
| D-05/D-21 unir duplicado | OK | `MemberWellhubService.mergeInto` (una `db.transaction`, `isPureWellhub`, solo `ADMIN_ROLES`, `softDeleteMemberTx`, `auditLog.write` `wellhub_member_merged`, 409 si destino tiene otro gympass_id) |
| D-06 visitante sin plan no entra a la app | OK | sin cambios en login; `app-access` es acción explícita |
| D-07 toggle Solo Wellhub, (a) etiqueta visible + (b) socios activos 30 días, no finance-gated | OK | `wellhubOnlySql`; `AlumnosPage.vue` toggle fuera del `v-if="!financeBlind"` |
| D-08 export xlsx | OK | sufijo " · Wellhub" |
| D-09 Cobros: badge + aviso a la ficha | OK | `CobrosPage.vue` (`isWellhub`, `redirectWellhubToFicha`, dedup por DNI, deep link `?memberId=`) |
| D-10 chip desde la reserva | OK | ver SC3 |
| D-11 staff no cancela reserva Wellhub (UI + API) | OK | `booking-service.ts adminRemoveBooking` → 409 `WELLHUB_BOOKING_MANAGED_MSG`; botón deshabilitado |
| D-12 `bajas` excluye ex-alumno con gympass_id | OK | `audience-service.ts` |
| D-13/D-14 Wellhub suma al total, categoría donde hay categorías, sin toggles | OK | único desglose por fuente existente = log de accesos; no se agregaron switches en Analíticas |
| D-15/D-22 Wellhub como origen del embudo, sin UI nueva | OK | `entryOrigin='wellhub'`; el embudo clásico no se toca (ver I1) |
| D-16 reporte único por sede y mes | OK | cuatro ítems presentes |
| D-17/D-26 asociar reusa AssignPlanDialog + `POST app-access` | OK | `AlumnoDetailPage.vue` `showAssignFromWellhub`, `WellhubCard`, `members/routes.ts` `/:userId/app-access` |
| D-18 socio activo que usa Wellhub, separado del plan | OK | ver SC5 |
| D-19 presente a mano → `wellhub_manual`, sin tocar plan, upgrade por webhook | OK | `coachCheckInWellhub`, `removeCheckIn`, `wellhub/service.ts` (`upgradedManual`) |
| D-20 card Wellhub en la ficha | OK | `WellhubCard.vue`; campos de API y tipos del admin coinciden uno a uno |
| D-23 definición de conversión (primer plan real tras actividad Wellhub, nunca prueba) | OK | `hasWellhubActivitySinceLeftActivo` + `findNewestMembership` con `is_trial = 0` |
| D-24 el socio tampoco cancela su reserva Wellhub | OK | `booking-service.ts:~566` |
| D-25 baja/ciclo del plan no cancelan reservas Wellhub | OK | `notWellhubBookingSql()` en las 6 cancelaciones masivas atadas al socio; cierre de clase sigue cancelando (diferido, igual que CONTEXT) |
| D-27 helper compartido | OK | `shared/wellhub-sources.ts` |
| D-28 una migración 0300 + 5 conteos de tenancy | OK | `0300_wellhub_usuarios.sql` sin `;` en comentarios; `GYM_OWNED_TABLES` 105, módulo estricto `wellhub`, `TABLES_TO_CLEAN`, manifiesto 482, ISO-03 38 |

## Required Artifacts

| Artifact | Estado | Detalle |
|----------|--------|---------|
| `el-templo-api/src/db/migrations/0300_wellhub_usuarios.sql` | OK | enum byte-idéntico al schema Drizzle (`qr,manual,wellhub,wellhub_manual`), tabla con `tenant_id` + FK + unique que arranca por tenant |
| `el-templo-api/src/modules/shared/wellhub-sources.ts` | OK, cableado en 12 módulos | NULL-safe en bookings, ambos valores en attendance |
| `el-templo-api/src/modules/wellhub/conversion.ts` | OK, cableado | firma `(tx, ctx, userId, statusBefore, statusAfter, log)` coincide con el llamador y con `conversion.test.ts` |
| `el-templo-api/src/modules/wellhub/member-wellhub-service.ts` | OK, cableado | `isPureWellhub(ctx, userId, executor)` coincide en card y merge; tipo `DbInstance \| TxHandle` según la lección del plan 09 |
| `el-templo-api/src/modules/reports/wellhub-report-service.ts` | OK, cableado | tenant inline en cada tabla; schema de respuesta coincide con `types/wellhub.ts` del admin |
| `el-templo-admin/src/components/members/WellhubCard.vue` / `WellhubMergeDialog.vue` | OK, cableados | props/emits coinciden con `AlumnoDetailPage.vue` (`canMergeRole`, `merge(gympassId)`, `merged(targetId)`, `reload(): Promise<WellhubCard \| null>` expuesto) |
| `el-templo-admin/src/components/reports/WellhubReport.vue` | OK, cableado | `KpiCard` props correctas; `branchOptions`/`branchId` que pasa `ReportesPage.vue` existen |
| `el-templo-admin/src/composables/useWellhubApi.ts` | OK | rutas y payloads coinciden con la API |

## Key Link Verification

| De | A | Vía | Estado |
|----|---|-----|--------|
| `subscriptions/service.ts recomputeUserStatus` | `recordWellhubConversion` | llamada tras el insert de `user_status_history`, solo con `ctx` | WIRED |
| `members/routes.ts` | `MemberWellhubService` (getCard/sendAppAccess/mergeInto) | 3 rutas, manifiesto ISO-01 y casos ISO-03 | WIRED |
| `AlumnoDetailPage.vue` | `WellhubCard` → `AssignPlanDialog` → `onWellhubAssigned` → `reload()` → `sendAppAccess` | evento `associate`, props del diálogo idénticas al uso existente | WIRED |
| `CobrosPage.vue` | ficha `/alumnos/:id?asociar=1` | `redirectWellhubToFicha` → `openAssociateFromQuery` | WIRED |
| `ReportesPage.vue` | `WellhubReport` | tab `wellhub` en `VALID_TABS`, panel y import | WIRED |
| `webhook checkin` | upgrade `wellhub_manual` → `wellhub` | guard y re-check dentro de la tx | WIRED |

## Data-Flow Trace (Nivel 4)

| Artefacto | Variable | Fuente | Datos reales | Estado |
|-----------|----------|--------|--------------|--------|
| Badge en lista/ficha | `showWellhubLabel` | SQL sobre `users.gympass_id` + estado efectivo | Sí | FLOWING |
| `SlotDetailDialog` chip (hoy) | `member.isWellhub` | `bookings.source` / `attendance.source` | Sí | FLOWING |
| `SlotDetailDialog` chip (futuro) | `booking.source` | `getSlotDetail` | Sí | FLOWING |
| `WellhubCard` | `card` | `GET /members/:id/wellhub` (agregados sobre attendance/bookings/wellhub_bookings) | Sí | FLOWING |
| `WellhubReport` | `report` | `GET /reports/wellhub` (SQL crudo con tenant) | Sí | FLOWING |

## Behavioral Spot-Checks

Step 7b: SKIPPED. No hay entry points ejecutables sin `node_modules`, y la consigna prohíbe correr tests/typecheck/build.

## Probe Execution

Step 7c: no hay probes declarados en los PLAN ni `scripts/*/tests/probe-*.sh` aplicables.

## Requirements Coverage

El ROADMAP declara "inventario `204-INVENTARIO.md`; decisiones a tomar en discuss-phase": no hay IDs en `REQUIREMENTS.md` para esta fase. No hay requisitos huérfanos.

## Anti-Patterns Found

Ninguno bloqueante. Sin marcadores de deuda (`TBD/FIXME/XXX`), sin `console.*`, sin `any`, sin stubs que lleguen a pantalla.

## Defectos y observaciones (ninguno bloquea el objetivo)

| ID | Sev. | Dónde | Hallazgo | Arreglo sugerido |
|----|------|-------|----------|------------------|
| W1 | WARNING (decisión humana) | `ROADMAP.md` SC4 vs `204-CONTEXT.md` D-13/D-14 | El SC4 dice que las métricas de asistencia y no-show "separan" Wellhub. Por D-13/D-14 (Franco) esas métricas quedan como total que incluye Wellhub y solo se separa donde ya había categorías (log de accesos), el embudo (origen) y el reporte Wellhub. El código cumple CONTEXT, no la lectura literal del SC | Confirmar con Franco que CONTEXT manda y ajustar la redacción del SC4 en ROADMAP |
| W2 | WARNING | `CobrosPage.vue:2054` (`isWellhub: m.showWellhubLabel === true`), `:2216 onMemberSelected` | Para `admin_sede`, una persona Wellhub de OTRA sede llega con `showWellhubLabel` en la proyección mínima, Cobros la manda a su ficha y esa ruta da 404 a un admin_sede: callejón sin salida (ya anotado en SUMMARY 13/14) | Para `isOtherBranch` mostrar el aviso sin botón "Ir a la ficha" (o con texto "pedile a la sede de origen") |
| W3 | WARNING | `CobrosPage.vue:2216-2220` | Cualquier persona con la marca visible (incluye un ex-alumno inactivo Wellhub) queda bloqueada en Cobros, también para cobrar una deuda vieja que no es un plan nuevo. Es lo que pide D-09, pero deja sin camino el cobro de deuda de ese perfil desde Cobros | Decisión de Franco: aceptar, o permitir el cobro de conceptos pendientes y bloquear solo la alta de plan |
| W4 | WARNING | `AlumnoDetailPage.vue:368` | La card Wellhub vive dentro de `v-if="memberProfile.status !== 'prueba'"`. Un lead en `prueba` con `gympass_id` ve el sufijo en el badge pero no la card | Mover la card fuera de ese `v-if` (o mostrarla también en `prueba`) |
| I1 | INFO | `analytics/funnel-service.ts:~154` (`getFunnel`) | El embudo clásico (`all/directo/freemium`) sigue tomando como cohorte a todo `users`, incluidos los visitantes Wellhub, lo que baja sus porcentajes. No hay pantalla que lo muestre (los embudos visibles son de pruebas) y D-22 pidió no tocarlo | Si algún día se muestra, excluir `status='wellhub'` de la cohorte |
| I2 | INFO | `wellhub/member-wellhub-service.ts:~577-596` | Al resolver un choque de reservas con una reserva muerta se hace `DELETE` de `bookings`. `trial_followups.booking_id` no tiene `ON DELETE`: si esa reserva fuera una sesión de prueba con followup, la unión falla con 500 y hace rollback limpio (caso muy raro) | Mapear ese error a 409 con mensaje, o saltear el borrado si hay followup |
| I3 | INFO | `wellhub/service.ts` (guards de check-in) | Cambio de comportamiento aceptado (decisión A1 del plan 03): un socio con QR propio + visita Wellhub el mismo día registra las dos y la de Wellhub se valida y se factura. Antes la segunda se ignoraba | Avisar a Franco; revertir los dos `isWellhubAttendanceSql()` si prefiere lo anterior |
| I4 | INFO | `reports/wellhub-report-service.ts` | La tasa Wellhub → socio es conversiones del mes ÷ personas únicas del mes (no cohorte): puede superar 100%. Mes por defecto con tz por defecto del gimnasio, no la de la sede | Aceptado en SUMMARY 11 |
| I5 | INFO | `SlotDetailDialog.vue` | El buscador para agregar alumno a un horario no muestra el chip Wellhub en las opciones (el plan solo pedía el roster) | Opcional |
| I6 | INFO | `.planning/ROADMAP.md` | Los 16 planes siguen con `[ ]` y STATE sin actualizar | Lo cierra el orquestador al terminar |
| I7 | INFO | admin `types/analytics` (`FunnelEntryOrigin`) | El tipo del admin no incluye `wellhub`; no hay UI que lo use | Sin acción |

No se encontró ningún error de TypeScript, import roto, firma desalineada entre planes (`isPureWellhub`, `recordWellhubConversion`, `softDeleteMemberTx`, `WELLHUB_BOOKING_MANAGED_MSG`, helpers de `wellhub-sources.ts` coinciden en definición y en todos los llamadores), campo stripeado por schema de Fastify, desajuste de props/emits entre componentes del admin, ni SQL sin filtro de tenant. Esto es por lectura: lo que solo caza un compilador (por ejemplo, la unión `MySql2Database | TxHandle` en `softDeleteMemberTx`, o la tipificación de `InstanceType<typeof WellhubCard>`) queda para CI y `vue-tsc`.

## Human Verification Required

Ver el frontmatter `human_verification` (9 ítems). Los dos obligatorios antes de mergear: (1) CI completo + `vue-tsc` local del admin; (2) UAT en staging de los flujos con Wellhub real (asociar → mail → login, unir fichas, a mano → webhook, reporte vs liquidación).

## Gaps Summary

Sin gaps bloqueantes: los 6 criterios del ROADMAP y las 28 decisiones tienen implementación real, conectada y con datos reales detrás (no hay stubs ni props huecas). El estado es `human_needed` por dos motivos: nada se ejecutó (la corrección de los 12 archivos de tests y del tipado depende de CI) y varios criterios son visuales o dependen del sandbox/producción de Wellhub. Las cuatro observaciones W1-W4 son decisiones de producto o pulidos menores, no fallas del objetivo.

---

_Verified: 2026-10-27_
_Verifier: Claude (gsd-verifier)_
