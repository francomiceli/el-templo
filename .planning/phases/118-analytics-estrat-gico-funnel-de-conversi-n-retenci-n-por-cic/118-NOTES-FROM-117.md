# Notas de la Fase 117 para tener en cuenta en la 118

Escrito 2026-05-26 al cerrar la 117. Lectura obligatoria antes de planificar 118.

## 🗑️ TAREA DECIDIDA — borrar el display de engagement por segmento (decisión 2026-05-26)

El feature de "engagement por segmento" de 117 (D-12) mezcla poblaciones y muestra
números engañosos: los miembros **online** (`plan_category = online_*`) no hacen check-in
presencial → asistencia 0% → caen todos en "Digital" (por eso "Digital" salía como el
segmento más grande, ~232). El detalle del por qué está en la sección "Activos por
segmento" más abajo y en el análisis del clasificador.

**Decisión:** NO rediseñar la segmentación. En la 118, al traer métricas más honestas
(funnel + retención por cohortes + ARPU), **borrar del frontend** estas 2 cards de
`el-templo-admin/src/components/analytics/AsistenciaTab.vue`:

1. La card **"Activos por segmento de engagement"** (conteos por segmento).
2. La **worklist nominal en_riesgo/ghost** con botón WhatsApp.

**Alcance EXACTO de la baja (solo frontend):**

- Quitar las 2 cards del template de `AsistenciaTab.vue` + el código muerto que queda
  (`segmentCountCards`, `engagementColumns`, `formatMemberName`, `contactMember`,
  `segmentLabel`/`segmentColor`, e imports de `SEGMENT_*`/`EngagementMember`/`EngagementAnalytics`
  si quedan sin uso) + la prop `engagement`.
- En `ReportesPage.vue`: dejar de pedir `analyticsApi.getEngagement` en el `Promise.all`
  de `fetchAttendanceData`, quitar `engagementData` y la prop `:engagement`.

**Lo que NO se toca (se conserva):**

- Backend: endpoint `GET /api/admin/analytics/engagement`, `EngagementService`,
  `engagement.test.ts`, tipos. Se dejan para que 118 los reaproveche.
- El método `getEngagement` del composable `useAnalyticsApi` (cliente del backend).
- En la tab Asistencia se quedan: miembros únicos 7/14/30 (D-11), ratio de check-in por
  sede + warning <50% (D-13), no-show, asistencias/día, heatmap, ocupación.
- El módulo `segmentation` (lo usan AlumnosPage y NotificacionesPage).

**No se pierde capacidad:** lo operativo (a quién contactar) ya está cubierto por las tabs
**Inactivos** y **Vencimientos** de Reportes (plan-agnósticas, sin el sesgo del algoritmo).
Lo estratégico lo reemplaza la propia 118.

**Deuda no bloqueante:** la segmentación sigue mostrándose con el mismo sesgo en AlumnosPage
y Notificaciones (Digital inflado por online). Decidir más adelante si esos consumidores
necesitan un clasificador plan-aware; no bloquea la 118.

## 🔴 CRÍTICO — `user_status_history` NO captura todas las transiciones

El hook de 117 (D-10) vive **solo dentro de `SubscriptionService.recomputeUserStatus`**.
Ese método NO setea `prueba` ni varios `inactivo`. Las transiciones se setean en otros lados:

- `status='prueba'` → `members/service.ts:540/615/708` (conversión lead/sesión de prueba). **NO hookeado.**
- `status='inactivo'` → `members/routes.ts:814/862`. **NO hookeado.**
- `source='admin'` está **reservado pero NO cableado** — los cambios de status manuales del admin no se registran todavía.

**Implicancia para el funnel freemium→prueba→activo (PROPUESTAS #1):** la etapa intermedia
`prueba` hoy NO se registra en `user_status_history`, ni siquiera hacia adelante. El funnel
no se puede medir de punta a punta hasta que 118 **agregue hooks de registro en esos sitios**
(members/service.ts conversión a prueba, members/routes.ts inactivo, y los flips de admin).
Primera tarea de 118: cablear esos puntos o el funnel queda ciego en el medio.

## 🟠 El backfill (0129) es APROXIMADO y mínimo

Solo sintetiza 2 transiciones por miembro:

- `NULL→freemium` en `users.created_at`
- `freemium→activo` en `MIN(subscriptions.created_at)`

NO reconstruye `prueba`, ni `inactivo`, ni múltiples ciclos. Las transiciones **precisas**
solo existen desde 2026-05-26 (cuando entró el hook). Para retención por cohortes de ciclos
(PROPUESTAS #2) y el funnel, asumir: data histórica = aproximada/parcial; data confiable =
forward-only desde el deploy de 117. Considerar un período de ramp-up o caveat explícito.

## 🟢 Reutilizar de 117 (no reinventar)

- `activeMemberExists(userIdColumn)` en `shared/active-member.ts` — predicado canónico de "activo".
  Usar como denominador de ARPU (activos), NO `users.status`.
- `applyScope(query, filters)` en `analytics/scope.ts` — scope sede/país. Usar en toda query nueva.
- Patrón multi-moneda: `getOutstandingByCurrency` (analytics/service.ts) + tipos `RevenueByCurrency`/
  `MonetaryKpiByCurrency`. **NUNCA sumar ARS+EUR.** Caja vs devengado + ARPU van por moneda separada.
- Patrón de domain service nuevo (AttendanceMetricsService/EngagementService). NO splittear el
  monolito `analytics/service.ts` (eso es v4.9).

## 🟢 Autorización — los endpoints de 118 son SENSIBLES

117 abrió los endpoints operacionales (asistencia/engagement) a `ANALYTICS_OPERATIONAL_ROLES`
(gestion+admin+owner). **Los de 118 (caja, devengado, ARPU, retención, funnel financiero) son
sensibles → dejarlos en `ADMIN_ROLES` (admin/owner) con `requireAdminAnalytics` per-route.**
NO exponerlos al set operacional. Ver el patrón en `analytics/routes.ts`.

## Detalles útiles

- Schema `user-status-history.ts`: columnas `from_status` (nullable), `to_status`, `source`
  ('recompute'|'backfill'|'admin'), `changed_at`. Índice compuesto `(user_id, changed_at)`
  ya creado para queries de cohorte/retención.
- `subscription-plans.plan_category` enum → para retención por categoría de plan.
- Devengado prorrateado: `price_paid/duration_days × días-dentro-del-mes`. La migración 0127
  corrigió `duration_days` en planes legacy archivados, así que es más confiable — pero igual
  validar nulls/0 antes de dividir.
- Tests de integración limpian `financial_transactions`/`transaction_links`/`balances`.
