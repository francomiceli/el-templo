---
phase: 213-estiramiento-post-clase
reviewed: 2026-11-11T00:00:00Z
depth: deep
files_reviewed: 71
files_reviewed_list:
  - el-templo-api/src/modules/sessions/stretch-service.ts
  - el-templo-api/src/modules/sessions/stretch-push.ts
  - el-templo-api/src/modules/sessions/stretch-routes.ts
  - el-templo-api/src/modules/sessions/stretch-schemas.ts
  - el-templo-api/src/modules/sessions/stretch-timing.ts
  - el-templo-api/src/modules/sessions/stretch-selection.ts
  - el-templo-api/src/jobs/notification-cron.ts
  - el-templo-api/src/db/schema/stretch.ts
  - el-templo-api/src/db/migrations/0340_stretch_tables.sql
  - el-templo-api/src/db/migrations/0341_stretch_catalog_seed.sql
  - el-templo-api/src/db/migrations/0342_aura_source_stretch.sql
  - el-templo-api/src/modules/notifications/service.ts
  - el-templo-api/src/modules/notifications/types.ts
  - el-templo-api/src/modules/communications/destinations.ts
  - el-templo-api/test/sessions/_stretch-fixtures.ts
  - el-templo-api/test/sessions/stretch-complete.test.ts
  - el-templo-api/test/sessions/stretch-today.test.ts
  - el-templo-api/test/sessions/stretch-selection.test.ts
  - el-templo-api/test/sessions/stretch-timing.test.ts
  - el-templo-api/test/notifications/stretch-push-decisions.test.ts
  - el-templo-api/test/notifications/stretch-push-timing.test.ts
  - el-templo-api/test/tenancy/iso-03-stretch.test.ts
  - el-templo-api/test/migrations/0340-stretch.test.ts
  - el-templo-api/test/migrations/0342-aura-source-stretch.test.ts
  - el-templo-app/src/boot/push-notifications.ts
  - el-templo-app/src/modules/progression/utils/today-card.ts
  - el-templo-app/src/modules/training/pages/StretchPlayer.vue
  - el-templo-app/src/modules/training/pages/FreeBlockPlayer.vue
  - el-templo-app/src/modules/training/components/player/StretchClock.vue
  - el-templo-app/src/modules/training/components/player/StretchDone.vue
  - el-templo-app/src/modules/training/composables/useSingleBlockPlayer.ts
  - el-templo-app/src/modules/training/composables/useStretchCompletion.ts
  - el-templo-app/src/modules/training/utils/stretchSession.ts
  - el-templo-app/src/stores/useStretchStore.ts
  - el-templo-app/src/layouts/MainLayout.vue
  - el-templo-app/src/modules/progression/pages/MiTemplo.vue
  - el-templo-admin/src/config/destinations.ts
  - (resto del rango bc231c4de..HEAD: tests de app, tests de gates de tenancy, fixtures)
findings:
  critical: 0
  high: 1
  medium: 4
  low: 6
  total: 11
status: issues_found
---

# Fase 213: Code Review Report

**Reviewed:** 2026-11-11
**Depth:** deep
**Files Reviewed:** 71 (rango `bc231c4de..HEAD`, sin `.planning/`)
**Status:** issues_found

## Summary

Se revisó la API del estiramiento (servicio, push, timing, selección, rutas, esquemas, migraciones 0340-0342), el paso del cron, los tests de integración nuevos y la app (player, store, card, boot de push).

**Verificación mecánica hecha en este checkout (sin MySQL):**

- `tsc --noEmit` de la API: solo el error de entorno `@fastify/rate-limit` (módulo ausente), nada en archivos de la fase.
- `pnpm lint:tenant` (CON-06): 0 discrepancias. `typecheck:tests`: ningún error en archivos `stretch`/`iso-03`/`0340`/`0342`.
- `vitest` de `stretch-selection.test.ts` y `stretch-timing.test.ts` (puros): 114/114 pasan (corridos con un config sin `setupFiles`).
- App: `eslint` limpio sobre los archivos de la fase, `vue-tsc` sin errores en archivos de la fase, 32 archivos / 640 tests de `training`, `push-tap`, `push-destination`, `today-card` y `stretch-store` pasan.

**Lo que está bien (verificado leyendo el código):** toda consulta del servicio y del job lleva `tenantWhere`; `complete` filtra por `userId` del JWT (una oferta ajena da 404); la zona es la de la sede en todo el camino (job y servicio), sin UTC-3 asumido; el reclamo del push es un `UPDATE ... WHERE push_decision IS NULL` (con ese WHERE `affectedRows` = filas cambiadas, sin trampa de FOUND_ROWS) y el encolado queda fuera de `processQueue`, así que no hay pushes duplicados; el paso del cron está envuelto en try/catch y un candidato que falla no frena a los demás; los enums de Drizzle usan el nombre físico de columna y el `MODIFY COLUMN` de 0342 conserva todos los valores previos.

**Hallazgo principal:** un test de integración (`stretch-complete` caso (m)) afirma un comportamiento de Fastify que no existe y va a fallar en el primer CI. El resto son defectos de robustez del cierre (duración y AURA) y deuda de tests.

## High

### HI-01: El test (m) de `stretch-complete` espera 400 por propiedad extra, pero Fastify la poda (`removeAdditional: true`) y el test falla en CI

**Estado: FIXED** (commit `f8670b951`).

**File:** `el-templo-api/test/sessions/stretch-complete.test.ts:606-627` (y la premisa en `el-templo-api/src/modules/sessions/stretch-schemas.ts:7-9`, `:75-85`, `:107-121`)

**Issue:** el caso (m) manda `{ type: "card_seen", tenantId: 2 }` a `/stretch/events` y `{ offerId, exercisesCompleted, startedAt }` a `/stretch/complete` y espera `400` en ambos (`:614`, `:622`). Fastify 5.7.4 corre con el AJV por defecto (`removeAdditional: true`, no hay `customOptions` en `app.ts`): `additionalProperties: false` PODA la clave en vez de rechazarla. El propio repo lo documenta en `test/campaigns-magic-link.test.ts:342-358`, `test/scheduling-reserve-trial.test.ts:343`, `test/tree-editor/milestone-review.test.ts:1169`, `test/subscriptions/mass-assignment.test.ts:5-7`. Resultado: `tenantId` y `startedAt` se descartan, los dos requests devuelven 200, `expect(evento.status).toBe(400)` falla en la primera aserción, y de haber seguido, `expect(row.completedAt).toBeNull()` (`:625`) tampoco se cumpliría porque el complete sí se ejecutó. Es un rojo seguro, no una flakiness.

El código de producción es correcto (el cliente no puede inyectar `startedAt` ni `tenantId`: llegan podados al handler), pero el comentario del esquema ("cerrados, T-213-15") promete un rechazo que no ocurre.

**Fix:** cambiar la aserción a lo que realmente garantiza el contrato (el campo se descarta y no tiene efecto) y corregir el comentario:

```ts
it("(m) propiedades fuera del contrato se podan: startedAt no cambia la duración y tenantId no se persiste", async () => {
  const { member } = await arrange();
  const { offerId, ids } = await crearOferta(member.token);

  expect((await postEvent(member.token, { type: "card_seen", tenantId: 2 })).status).toBe(200);
  expect((await offerRow(offerId)).tenantId).toBe(CTX_TEMPLO.tenantId);

  // startedAt falso de hace 10 min: se poda; sin `started` previo la duración es null.
  const cierre = await postComplete(member.token, {
    offerId,
    exercisesCompleted: ids,
    startedAt: new Date(Date.now() - 10 * MIN).toISOString(),
  });
  expect(cierre.status).toBe(200);
  expect(cierre.body.durationSeconds).toBeNull();
  expect(cierre.body.auraAwarded).toBe(false);
});
```

Y en `stretch-schemas.ts:7-9` reemplazar "el cliente no manda tiempos" por "las claves ajenas se podan (`removeAdditional`), no se rechazan".

## Medium

### ME-01: `started_at` es el PRIMER ingreso al player: la duración y los "minutos" de la pantalla final pueden ser absurdos y el piso de 3 min se evade

**Estado: FIXED** (commit `bbb47d88f`).

**File:** `el-templo-api/src/modules/sessions/stretch-service.ts:583-597` (`isNull(startedAt)`), `:692-697`, `:785-790`; `el-templo-app/src/modules/training/pages/StretchPlayer.vue:316`

**Issue:** `StretchPlayer.onMounted` manda `started` cada vez que se abre la página y el servidor conserva solo el primero (`... IS NULL`; el test (k) lo fija como diseño). Escenario concreto: el alumno toca "Estirar" a las 19:05, lo interrumpe (llamada, sale por el diálogo "Salir") y vuelve a las 21:00. Termina la rutina en 6 min: `durationSeconds = 6300`, `minutesFor` devuelve `105` y `StretchDone` muestra "Listo. 105 minutos de estiramiento"; `duration_seconds` (la métrica del SPEC §5.4) queda corrupta. Además, el piso D-08 de 3 min reales deja de medir tiempo en el player: alguien que entra, sale y vuelve a entrar y marca los 5 ejercicios en 20 s cobra los +5 AURA.

**Fix:** que `started` reinicie la marca mientras la oferta no esté completada (último arranque gana), conservando `started_from` del primero si se quiere el embudo:

```ts
.set({ startedAt: now, startedFrom: sql`COALESCE(${schema.stretchOffers.startedFrom}, ${from ?? "card"})` })
.where(and(tenantWhere(...), eq(id, offer.id), isNull(schema.stretchOffers.completedAt)))
```

(el job usa `startedAt !== null` solo para `ya_empezo`, no cambia). Alternativa mínima: acotar `minutes` a `plannedSeconds` en `minutesFor` y actualizar el test (k).

### ME-02: El AURA se pierde para siempre si el premio falla después de marcar el completado (sin reintento ni `log.error`)

**Estado: FIXED** (commit `b91f60598`).

**File:** `el-templo-api/src/modules/sessions/stretch-service.ts:705-770`; `el-templo-api/src/modules/aura/daily-award.ts:36-57`

**Issue:** `complete` escribe `completed_at` primero (`:705-718`) y recién después llama a `awardOncePerLocalDay`, que atrapa cualquier error no duplicado, hace `log.warn` y devuelve `false`. Un deadlock/timeout en la transacción de `AuraService.award`, o la fila `stretch` ausente de `aura_config` (si la 0342 no sembró), deja la oferta `done` sin AURA; un reintento del cliente cae en `row.completedAt` → `alreadyCompleted: true, auraAwarded: false` (`:681-683`). No hay forma de recuperarlo y en el log solo queda un `warn`.

**Fix:** si el premio falla por un motivo que no es duplicado, no consolidar el completado (revertir `completedAt` a NULL para que el reintento del cliente vuelva a intentar) o, como mínimo, distinguir el caso y loguear `error`. Ejemplo: tras `awardOncePerLocalDay` devolver un resultado tipado (`"awarded" | "duplicate" | "failed"`) y en `"failed"` hacer `UPDATE ... SET completed_at = NULL, duration_seconds = NULL WHERE id = ? AND aura_awarded = 0` y responder 503.

### ME-03: El evento `started` es fire-and-forget; si falla, el cierre queda sin duración ni AURA y no se puede rehacer

**Estado: abierto** (decisión: anotado para el UAT, no se arregla en esta pasada).

**File:** `el-templo-app/src/modules/training/composables/useStretchCompletion.ts:80-93`, `el-templo-app/src/modules/training/pages/StretchPlayer.vue:316`; `el-templo-api/src/modules/sessions/stretch-service.ts:692-704` (test (i) lo fija)

**Issue:** `sendEvent` traga cualquier error. En una red móvil intermitente, si el POST de `started` falla al cargar la página, el alumno hace los 6 minutos de la rutina, `complete` guarda `started_at = null` → `durationSeconds = null` → sin AURA, y la oferta pasa a `done` (la card dice "Clase y estiramiento hechos" y el player responde "Ya estiraste hoy"). El alumno ve la pantalla final sin el "+5" y no tiene forma de reintentar.

**Fix:** en `StretchPlayer` recordar si `started` salió bien (`sendEvent` devuelve boolean) y reenviarlo justo antes de `complete` si no; el servidor debe tener `started_at` antes del cierre. Alternativa servidor: en `complete` sin `started_at`, responder 409 `{ error: "falta started" }` en vez de consolidar el completado.

### ME-04: Los tests de integración dejan `day_modes` en un estado no default para el resto del worker

**Estado: FIXED** (commit `cb5173774`).

**File:** `el-templo-api/test/sessions/_stretch-fixtures.ts:595-612` (`arrangeStretchScenario`), `el-templo-api/test/sessions/stretch-today.test.ts:61-77` (afterAll solo restaura la zona), `stretch-today.test.ts:252` y `:265`

**Issue:** `arrangeStretchScenario` borra e inserta la fila de `day_modes` del día y nunca la restaura (el propio comentario lo admite: "day_modes no se limpia entre archivos"). `stretch-today` termina con martes = `combos` y jueves = `tecnica` (default de la migración 0080: lunes a viernes `regular`, sábado `rom`). Con `isolate: false`, cualquier archivo posterior del mismo worker que dependa del default del día real en que corre (etiqueta "Combos"/"Técnica" de `deriveActivityLabel` en listas de reservas, TV, `/sessions/daily`) falla solo los martes/jueves y según el reparto de archivos por worker: el patrón típico de rojo intermitente en CI.

**Fix:** en `afterAll` de `stretch-today` y `stretch-push-timing`, restaurar los 6 días a su default (`regular` lunes a viernes, `rom` sábado) como ya hace con `branches.timezone`; mejor, exponer `restoreDayModes(app)` en `_stretch-fixtures.ts` y llamarlo también desde `iso-03-stretch`.

## Low

### LO-01: La zona del "hoy" del alumno es la de su sede de origen; la oferta y el push usan la de la sede de la asistencia

**Estado: abierto** (anotado para el UAT).

**File:** `el-templo-api/src/modules/sessions/stretch-service.ts:167-180` (`resolveToday`) vs `:187-255` (`findEligibleAttendance`, tz de `attendance.branchId`) y `el-templo-api/src/modules/sessions/stretch-push.ts:285`

**Issue:** `getToday`, `recordEvent` y `complete` calculan el día con `users.branchId`; el job y la oferta usan el de la sede de la clase. Si un socio con sede de origen en una zona asiste a una sede en otra (Mar del Plata vs Madrid), pueden divergir de día cerca de medianoche: `complete` responde 410 a una oferta vigente o `getToday` no ve la fila. Es un borde (solo sedes en husos distintos) pero la decisión "nunca asumir zona" no queda cerrada de punta a punta.

**Fix:** resolver el día de `getToday`/`complete` desde la oferta (`row.localDate` ya es el día de la sede de la clase) y comparar contra `todayInTz(zona de row.branchId)` en lugar de la del usuario.

### LO-02: `stretch_followup` nace apagada: las ofertas de los grupos push quedan marcadas `plantilla_apagada` y distorsionan el denominador del experimento

**Estado: abierto** (anotado para el UAT).

**File:** `el-templo-api/src/modules/notifications/types.ts:333-346`, `el-templo-api/src/modules/sessions/stretch-push.ts:457-461`

**Issue:** decisión consciente del planificador (documentada), pero tiene un costo medible: hasta que Franco la prenda, cada asistencia elegible de los grupos `push_30`/`push_60` genera una fila con `push_decision = 'plantilla_apagada'` y el D-16 las cuenta como "grupo push" en las completados cada 100 asistencias. La comparación con `control` queda sesgada hacia abajo en ese período.

**Fix:** anotar en el checklist de UAT/medición (y en la consulta de las 4 semanas) que el período se mide desde la fecha de encendido (`MIN(push_queued_at)`), o excluir `push_decision = 'plantilla_apagada'` del numerador y denominador de los grupos push.

### LO-03: El único síntoma de un catálogo vacío o parcial es un `warn` por candidato y por tick

**Estado: abierto** (anotado para el UAT).

**File:** `el-templo-api/src/db/migrations/0341_stretch_catalog_seed.sql:24-27` (diseño), `el-templo-api/src/modules/sessions/stretch-service.ts:425-431`

**Issue:** 0341 inserta solo si `id` Y nombre coinciden y no verifica cuántas filas quedaron. En un entorno cuya `exercises` difiere de prod (staging con una copia vieja, ids 4180-5090 recientes), la migración "tiene éxito" con 0 a 19 filas; con 0 filas no hay oferta para nadie y el log recibe un `warn` por cada asistente en ventana cada 5 min. Nadie se entera por un canal que importe.

**Fix:** loguear una sola vez al boot (o en el primer tick del día) `SELECT COUNT(*) FROM stretch_catalog WHERE tenant_id = 1 AND is_active` con `warn` si es < 20, y chequearlo en el checklist de UAT de staging antes de probar.

### LO-04: Las filas `fallo_envio` cuentan como "encoladas sin abrir" para el tope y la pausa

**Estado: abierto** (anotado para el UAT).

**File:** `el-templo-api/src/modules/sessions/stretch-timing.ts:135-156`, `el-templo-api/src/modules/sessions/stretch-push.ts:199-211`

**Issue:** `reconcileSent` pasa una fila a `fallo_envio` pero deja `push_queued_at`. `decideFrequencyBlock` la cuenta en los 3 por 7 días y en la racha de 4 sin abrir: un socio con token inválido (FCM `unregistered`) entra en `pausa_sin_abrir` por pushes que nunca recibió.

**Fix:** excluir `push_decision = 'fallo_envio'` en `loadHistory` (agregar `ne(schema.stretchOffers.pushDecision, 'fallo_envio')`) o dejar `push_queued_at = NULL` al reconciliar el fallo.

### LO-05: "+5" fijo en la pantalla final aunque el monto vive en `aura_config`

**Estado: abierto** (anotado para el UAT).

**File:** `el-templo-app/src/modules/training/components/player/StretchDone.vue:14`

**Issue:** el servidor acredita `aura_config.default_amount` (hoy 5, editable); la pantalla muestra siempre "+5". Si se cambia el monto la UI miente.

**Fix:** devolver el monto en `StretchCompleteView` (`auraAmount`) y mostrarlo.

### LO-06: Formato y detalles menores

**Estado: FIXED parcial** (commit `69ceff5c3`): tilde de "Tocá" en `bodyFemale` y formato prettier de `types.ts`. Queda abierto por decisión: `_now` sin uso en `ensureOffer` y la constante del label en `MiTemplo.vue`.

**File:** `el-templo-api/src/modules/notifications/types.ts:344-345` (prettier rompe esa línea; el pre-commit no corrió), `el-templo-api/src/modules/notifications/types.ts:343-345` (`bodyFemale` dice "Toca y arrancamos." sin tilde mientras el resto del copy usa voseo "Tocá"; el default masculino sí dice "Tocá"), `el-templo-api/src/modules/sessions/stretch-service.ts:490` (`_now` sin uso en `ensureOffer`), `el-templo-app/src/modules/progression/pages/MiTemplo.vue:557-562` (el watch compara el texto del botón `'Estirar'`: si cambia el label, `card_seen` deja de salir en silencio).

**Fix:** `pnpm prettier --write` sobre `types.ts`; cambiar `Toca` por `Tocá`; quitar el parámetro `_now`; exponer una constante `STRETCH_ACTION_LABEL` en `today-card.ts` y usarla en el watch.

---

_Reviewed: 2026-11-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
