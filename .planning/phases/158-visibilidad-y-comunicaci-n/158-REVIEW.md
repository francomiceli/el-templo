---
phase: 158-visibilidad-y-comunicaci-n
reviewed: 2026-07-11T14:14:31Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - el-templo-admin/src/components/MemberReferralsTab.vue
  - el-templo-admin/src/composables/useMembersApi.ts
  - el-templo-admin/src/pages/AlumnoDetailPage.vue
  - el-templo-api/src/app.ts
  - el-templo-api/src/db/migrations/0177_referidos_notification_category.sql
  - el-templo-api/src/db/schema/notifications.ts
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/src/modules/notifications/service.ts
  - el-templo-api/src/modules/notifications/types.ts
  - el-templo-api/src/modules/referrals/routes.ts
  - el-templo-api/src/modules/referrals/service.ts
  - el-templo-api/src/modules/referrals/types.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/test/referrals/activation-notification.test.ts
  - el-templo-api/test/referrals/admin-referrals-endpoint.test.ts
  - el-templo-api/test/referrals/discount-computation.test.ts
  - el-templo-api/test/referrals/member-endpoint.test.ts
  - el-templo-app/src/pages/MisReferidosPage.vue
  - el-templo-app/src/pages/ProfilePage.vue
  - el-templo-app/src/router/routes.ts
findings:
  critical: 2
  warning: 6
  info: 6
  total: 14
status: issues_found
---

# Phase 158: Code Review Report

**Reviewed:** 2026-07-11T14:14:31Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Fase 158 (visibilidad de referidos): endpoint member `GET /api/members/referrals`, endpoint admin `GET /admin/members/:userId/referrals`, `getReferralOverview` en `ReferralService`, notificación `referral_link_activated` (hook en `qualifyReferralOnCharge` + migración 0177), pantalla "Mis referidos" en la app y sección Referidos en la ficha admin.

La composición del overview es sólida (reuso D-30 real de `computeReferralDiscountPercent`, estado derivado solo por `deriveCoveredUntil`, revoked excluidos) y los tests cubren bien la mecánica de estados, tope, bidireccionalidad e IDOR. Sin embargo: el endpoint admin **rompe el patrón de country-scope que TODAS las rutas hermanas per-member aplican** (fuga cross-country + 500 en id inexistente), y los cross-links `goToMember` de la ficha admin **no funcionan** porque `AlumnoDetailPage` nunca recarga al cambiar el param de ruta (la URL cambia pero se sigue mostrando el alumno anterior — datos del miembro equivocado). Hay además una ventana en la que se notifica "tu referido pagó" para un cobro que después falla, dos races en el service y un guard de rol que contradice la intención documentada (gestión recibe 403).

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `GET /admin/members/:userId/referrals` no aplica country-scope ni valida existencia — fuga cross-country y 500 en id inexistente

**File:** `el-templo-api/src/modules/members/routes.ts:1656-1670`
**Issue:** Todas las rutas hermanas per-member (`GET /:userId` línea 528, `DELETE /:userId` línea 1197, `/:userId/financial-history` línea 1541, `/:userId/outstanding-concepts` línea 1613) aplican el guard T-106-02: verificar que el target existe, no está soft-deleted, y que su sede pertenece al país del scope del actor (404 para no filtrar existencia). La ruta nueva de referidos no hace **ninguna** de esas verificaciones:

1. Un admin AR puede leer el overview de referidos de cualquier alumno ES (nombres de las contrapartes, código, descuento) — bypass del modelo de scope de fase 98/110.
2. Un `userId` inexistente llega a `getReferralOverview` → `generateReferralCode` lanza `Error("referral: user X not found")` genérico → 500 crudo en vez de 404.
3. Un alumno soft-deleted (o incluso una fila de staff) es un target válido: se le genera código de referido lazy como side effect.

Los tests del endpoint admin (`admin-referrals-endpoint.test.ts`) no cubren ni el id inexistente ni el cross-country, por eso nada lo detectó.
**Fix:** Replicar el bloque de guard de `financial-history` antes de llamar al service:

```typescript
const [target] = await fastify.db
  .select({
    id: schema.users.id,
    role: schema.users.role,
    deletedAt: schema.users.deletedAt,
    branchCountry: schema.branches.country,
    branchIsVirtual: schema.branches.isVirtual,
  })
  .from(schema.users)
  .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
  .where(eq(schema.users.id, targetId))
  .limit(1);

if (!target || target.deletedAt) {
  return reply
    .code(404)
    .send({ error: "No encontrado", message: "Miembro no encontrado" });
}
if (
  !request.scope.isOwner &&
  request.scope.country &&
  !target.branchIsVirtual &&
  target.branchCountry !== request.scope.country
) {
  return reply
    .code(404)
    .send({ error: "No encontrado", message: "Miembro no encontrado" });
}
```

Agregar tests: 404 para id inexistente, 404 para alumno de otro país con token admin scoped.

### CR-02: Los cross-links `goToMember` de la ficha muestran los datos del alumno ANTERIOR — `AlumnoDetailPage` nunca recarga al cambiar `:userId`

**File:** `el-templo-admin/src/components/MemberReferralsTab.vue:127-129`, `el-templo-admin/src/pages/AlumnoDetailPage.vue:1409-1411`
**Issue:** `MemberReferralsTab.goToMember` hace `router.push('/alumnos/${userId}')`. Es la misma ruta (`/alumnos/:userId`) con distinto param, así que Vue Router **reutiliza la instancia** de `AlumnoDetailPage`. La página solo carga datos en `onMounted` (`loadAll()`, línea 1409); no hay `watch(() => route.params.userId, ...)`, no hay `onBeforeRouteUpdate`, y los `<router-view />` de `App.vue` y `AdminLayout.vue` no tienen `:key`. `MemberReferralsTab` también carga solo en `onMounted` (línea 149) y no observa cambios de `props.userId`.

Resultado: el admin hace click en "Trajo a Juan" → la URL cambia a `/alumnos/7` pero **toda la ficha (perfil, suscripción, finanzas, referidos) sigue mostrando al alumno 5**. En un contexto donde desde la ficha se cobran planes, se resetean contraseñas y se eliminan alumnos, mostrar los datos de un miembro bajo la URL de otro es riesgo de acción sobre la persona equivocada. Este es el primer flujo del admin que navega alumno→alumno dentro de la misma ruta, y lo introduce esta fase.
**Fix:** En `AlumnoDetailPage.vue`, recargar al cambiar el param:

```typescript
watch(
  () => route.params.userId,
  (nuevo, viejo) => {
    if (nuevo !== viejo && nuevo !== undefined) {
      memberProfile.value = null; // reset estado visible
      void loadAll();
    }
  },
);
```

Y en `MemberReferralsTab.vue`, `watch(() => props.userId, () => void load())` (o key-ear el tab-panel con `:key="userId"`). Alternativa más simple y contundente: `<router-view :key="$route.fullPath" />` en `AdminLayout.vue` (evaluar impacto en el resto de las páginas).

## Warnings

### WR-01: Notificación "¡Tu referido pagó!" se encola antes de que el cobro esté confirmado — falso positivo si el assign falla después

**File:** `el-templo-api/src/modules/subscriptions/service.ts:405-435` (hook) y `~1377` (call site en `assignPlan`)
**Issue:** `qualifyReferralOnCharge` (flip pending→qualified + enqueue del push) corre en `assignPlan` ANTES de `assertScheduleSelectionForPlan` / `validateAnchorSet` (que lanzan `BadRequestError` por errores de input frecuentes: plan fijo sin turnos) y ANTES de la transacción que inserta la subscription y registra el cargo. Ninguna de las dos escrituras (flip del vínculo, fila en `pending_notifications`) participa de esa transacción. Si cualquier paso posterior falla: (a) el referidor recibe "X pagó su primer plan. Ya tenés tu descuento activo." por un pago que nunca ocurrió, y (b) el vínculo queda `qualified` sin pago (el flip prematuro es herencia de 157 congelada, pero la notificación —nueva en 158— lo hace visible al socio). En el reintento del admin ya no hay pending, así que el estado "se arregla solo" únicamente si el admin reintenta.
**Fix:** Capturar el resultado del flip y **diferir el enqueue** a después del commit del cargo (p. ej. `qualifyReferralOnCharge` devuelve `flipped` y el caller encola la notificación tras la tx exitosa), y/o mover la llamada a después de las validaciones de schedule. Mínimo: mover `await this.qualifyReferralOnCharge(...)` a después de `assertScheduleSelectionForPlan`/`validateAnchorSet`.

### WR-02: TOCTOU en `qualifyFirstPayment` — SELECT y UPDATE no atómicos pueden duplicar la notificación

**File:** `el-templo-api/src/modules/referrals/service.ts:307-344`
**Issue:** El método hace SELECT del pending y luego el UPDATE guardado, sin transacción ni lock. Dos cobros concurrentes del mismo payer (double-tap del profe en la PoS, retry de red — exactamente el escenario que el `idempotencyKey` de fase 140 reconoce como real) pueden ambos ver el pending en el SELECT antes de que cualquiera ejecute el UPDATE → ambos devuelven `flipped` no-null → dos push "tu referido pagó" al referidor. El comentario afirma "el hook de notificación dispara UNA sola vez, en el flip real", pero el código no lo garantiza.
**Fix:** Decidir el flip por `affectedRows` del UPDATE (atómico por sí solo), y solo entonces leer los datos para la notificación:

```typescript
const [result] = await this.db
  .update(referrals)
  .set({ status: "qualified", qualifiedAt: new Date() })
  .where(
    and(eq(referrals.referredId, payerUserId), eq(referrals.status, "pending")),
  );
if (result.affectedRows === 0) return null;
// SELECT del vínculo qualified + firstName del payer para la notificación
```

### WR-03: `generateReferralCode` puede sobrescribir un código ya emitido — UPDATE sin guard `referral_code IS NULL`

**File:** `el-templo-api/src/modules/referrals/service.ts:90-107`
**Issue:** El UPDATE es `SET referral_code = ? WHERE id = ?` sin condición `referral_code IS NULL`. Dos requests concurrentes del mismo usuario sin código (la app y el admin abren el overview a la vez — ambas superficies nuevas de 158 disparan la generación lazy) pasan ambas el check `if (row.code)` con null y ambas escriben: la segunda **pisa** el código de la primera. El código que la primera request devolvió (y que el socio pudo compartir en ese instante) deja de resolver (`resolveReferralCode` → null). Baja probabilidad pero pérdida silenciosa de un identificador compartible. Código de 157, pero esta fase agrega los dos call sites que lo disparan en paralelo.
**Fix:** Agregar el guard y re-leer si no afectó filas:

```typescript
const [result] = await this.db
  .update(users)
  .set({ referralCode: code })
  .where(and(eq(users.id, userId), isNull(users.referralCode)));
if (result.affectedRows === 0) {
  const [again] = await this.db
    .select({ code: users.referralCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (again?.code) return again.code; // otro request ganó
  continue; // colisión de UNIQUE con otro usuario: reintentar
}
return code;
```

### WR-04: Variante femenina del template se elige por el género del RECEPTOR pero la copy refiere al género del REFERIDO

**File:** `el-templo-api/src/modules/notifications/types.ts:222-230`, `el-templo-api/src/modules/notifications/service.ts:209-216, 283-291`
**Issue:** `resolveUseFemale` resuelve por el género del destinatario (el **referidor**), pero `titleFemale: "¡Tu referida pagó!"` habla del género del **referido**. Una referidora mujer cuyo referido es varón recibe "¡Tu referida pagó!" (incorrecto), y un referidor varón cuya referida es mujer recibe "¡Tu referido pagó!" (incorrecto). El mecanismo title/titleFemale del sistema está pensado para conjugar al receptor; acá se usó para conjugar a un tercero. Además, como el hook pasa `bodyOverride`, el `bodyFemale` del template es letra muerta.
**Fix:** La opción más simple y correcta: título neutro idéntico en ambas variantes (p. ej. `"¡Tu descuento se activó!"` / mismo en `titleFemale`), o pasar `titleOverride` desde `qualifyReferralOnCharge` conjugado según el género del referido (que el SELECT de `qualifyFirstPayment` puede traer junto al `firstName`).

### WR-05: La pestaña "Referidos" es visible para gestión/coach/recepción pero el endpoint les devuelve 403 — y el guard contradice la intención documentada

**File:** `el-templo-api/src/modules/members/routes.ts:1650-1662`, `el-templo-admin/src/pages/AlumnoDetailPage.vue:341, 390-392`
**Issue:** El comentario de la ruta dice "**Gestión** consulta quién lo trajo y a quiénes trajo" (D-34), pero el guard es `ADMIN_ROLES = ["admin", "owner"]` (`permissions.ts:23`), que **excluye `gestion`** (y coach/recepción). A la vez, la pestaña se agregó sin gate de rol en `AlumnoDetailPage` — cualquier rol que abre la ficha (MEMBER_ROLES: coach, recepción, gestión) ve el tab, lo clickea y recibe el toast "No se pudieron cargar los referidos" (403). O el guard está mal (debería ser `MEMBER_LIFECYCLE_ROLES = ["owner","admin","gestion"]` para honrar D-34) o el tab debe ocultarse para roles sin acceso. Hoy son inconsistentes entre sí.
**Fix:** Decidir el rol-set con negocio; si gestión debe ver referidos, cambiar el guard a `MEMBER_LIFECYCLE_ROLES` (con test para rol `gestion`). En cualquier caso, condicionar el `<q-tab name="referidos">` en `AlumnoDetailPage.vue` al rol del actor (patrón existente para tabs financieros).

### WR-06: `Number(request.params.userId)` sin schema — sin validación de rango, sin serialización, error-shape inconsistente

**File:** `el-templo-api/src/modules/members/routes.ts:1656-1669`
**Issue:** Es la única ruta del módulo sin `schema` de Fastify. `Number.isInteger` acepta `0`, negativos y `"12.0"`; no hay serialización de respuesta; y los cuerpos de error (`{ error: "Acceso denegado" }`, `{ error: "id inválido" }`) omiten el campo `message` que todas las rutas hermanas incluyen (el `extractError` del admin cae al fallback genérico). Con CR-01 resuelto el 500 desaparece, pero la validación sigue siendo del handler a mano.
**Fix:** Agregar un schema análogo a `getMemberSchema` (params: `userId` integer minimum 1) y armonizar los cuerpos de error a `{ error, message }`.

## Info

### IN-01: `referredFirstName ?? ""` produce un push que arranca con espacio y sin nombre

**File:** `el-templo-api/src/modules/referrals/service.ts:342`, `el-templo-api/src/modules/subscriptions/service.ts:424`
**Issue:** Si el referido tiene `firstName` null (filas legadas / altas mínimas), el body queda `" pagó su primer plan. …"`.
**Fix:** Fallback con contenido: `pending.referredFirstName ?? "Tu referido"`.

### IN-02: El placeholder `{Nombre}` del template nunca se interpola en el service — un envío manual del template lo entrega literal

**File:** `el-templo-api/src/modules/notifications/types.ts:226-228`
**Issue:** `queueNotification` no interpola placeholders; el hook lo salva con `bodyOverride`, pero cualquier otro emisor del template (envíos de prueba/admin por templateKey) entregaría "{Nombre} pagó su primer plan…" literal.
**Fix:** Comentario en el seed advirtiendo que el template requiere `bodyOverride`, o interpolación central de placeholders en `queueNotification`.

### IN-03: El GET admin tiene side effect de escritura — genera el código lazy del alumno consultado

**File:** `el-templo-api/src/modules/referrals/service.ts:208`
**Issue:** `getReferralOverview` siempre llama a `generateReferralCode` (UPDATE en `users`). Abrir la pestaña Referidos de un alumno le acuña código aunque nunca haya usado la app. La generación lazy es diseño (D-16/D-25) para el endpoint member; para la ficha admin (lectura pura, "LEE, no altera" según el propio docstring) es un write no evidente en un GET.
**Fix:** Para el path admin, leer `users.referralCode` tal cual (nullable en la respuesta) o aceptar el side effect documentándolo en la ruta.

### IN-04: La categoría 'referidos' no es desactivable desde la UI de la app

**File:** `el-templo-app/src/pages/ProfilePage.vue:184-208`, `el-templo-api/src/db/migrations/0177_referidos_notification_category.sql:26-32`
**Issue:** La migración siembra `enabled=true` para todos los usuarios, pero ProfilePage solo expone toggles para entrenamiento/programas/anuncios ('planes' y 'motivacion' tampoco están — patrón preexistente). El socio no puede optar por no recibir pushes de referidos.
**Fix:** Agregar la entrada 'referidos' al array de categorías de ProfilePage (o registrar la deuda explícitamente).

### IN-05: URL de share hardcodeada en el componente

**File:** `el-templo-app/src/pages/MisReferidosPage.vue:159-161`
**Issue:** `https://app.eltemplo.org/register?ref=` está literal en el componente. `RegisterPage` sí consume `route.query.ref` (verificado, línea 229), pero el dominio/base debería salir de config (env `VITE_*` o constante compartida con `deep-links.ts`) para no divergir entre entornos (staging apunta a prod).
**Fix:** Extraer la base a una constante compartida/env var.

### IN-06: Gaps de cobertura de tests del endpoint admin

**File:** `el-templo-api/test/referrals/admin-referrals-endpoint.test.ts`
**Issue:** No hay tests para: userId inexistente (hoy 500 — CR-01), alumno soft-deleted, alumno cross-country con admin scoped, ni rol `gestion` (WR-05). Tampoco hay test del doble-flip concurrente de WR-02 (aceptable omitirlo, pero los cuatro primeros son directos con la infraestructura existente).
**Fix:** Agregar los casos junto con los fixes de CR-01/WR-05.

---

_Reviewed: 2026-07-11T14:14:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
