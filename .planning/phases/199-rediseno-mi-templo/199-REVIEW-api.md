# Fase 199 - Code review de la API

**Revisado:** 2026-10-16
**Alcance:** `git diff de257ec705..HEAD -- el-templo-api` en `/home/franco/projects/et-199-mi-templo` (rama `feat/199-mi-templo-rediseno`). Fuente de la migración 0279, módulo `sponsors`, `plan-status`, ajustes de novedades y prompts, `my-bookings`, `branchTimezone` en auth y tests.
**Profundidad:** deep (lectura completa del módulo `sponsors`, de la migración, de los diffs de comunicaciones, scheduling, subscriptions y auth, de los gates de tenancy y de los títulos de los tests).
**Restricciones respetadas:** solo lectura, sin tests de API, sin commits.

## Resumen

- BLOCKER: 0
- WARNING: 4
- INFO: 6

No encontré fugas entre gimnasios, ni IDOR, ni inyección. La tenancy está bien resuelta:

- `sponsor_views` usa `tenantWhere` y `tenantValues` en cada acceso.
- `sponsor_brands` está declarada como tabla exenta, y las 9 rutas nuevas están en el manifiesto.
- Los 5 conteos de la tabla nueva están actualizados (103 gym-owned, 5 exentas, 108 tablas, `MODULOS_DECLARADOS`, 0192-0195 y 0196).
- `ENTRADAS_BASELINE` pasa de 463 a 473 y el caso ISO-03 de `plan-status` está agregado (`CASOS_BASELINE` 72).

También verifiqué los siguientes puntos:

- Los guards de admin (`isTemploPlatformAdmin`, 403 antes de 503) y el `userId` siempre tomado del token.
- La migración: sin `;` en los comentarios, con `--> statement-breakpoint`, e `benefit` varchar(12) coherente en SQL, schema Drizzle y JSON Schema.
- La unique `uq_sponsor_views_user_brand` con `user_id` primero y su entrada en el allowlist.
- La regla de plan activo de `hasActivePlan` y `getMemberPlanStatus`, que coincide con `autoExpireSubscriptions` (UTC).

Los hallazgos son de integración y de bordes, no de aislamiento.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Con `R2_PUBLIC_URL` con barra final, ningún logo subido pasa la validación

**File:** `el-templo-api/src/modules/sponsors/service.ts:550-556` y `el-templo-api/src/modules/blog/image-service.ts:59-61`
**Issue:**

- `assertOwnLogoUrl` normaliza la base quitando las barras finales (`replace(/\/+$/, "")`) y exige `${base}/sponsors/logos/`.
- `BlogImageService.generateUploadUrl` arma `publicUrl` con la variable cruda: `` `${r2PublicUrl}/${key}` ``.
- Si el entorno tiene `R2_PUBLIC_URL=https://cdn.x/` (el caso que el propio validador dice tolerar), el editor recibe `https://cdn.x//sponsors/logos/...`.
- Al guardar la marca, esa URL no empieza por `https://cdn.x/sponsors/logos/` y el server responde 400 "El logo tiene que subirse desde el editor".
- El flujo oficial de subida queda roto para cualquier logo.
- El test `R2_PUBLIC_URL con barra final también acepta el prefijo propio` (`test/sponsors/sponsors-admin.test.ts:924`) enmascara el problema: arma el `logoUrl` a mano con una sola barra, no con lo que devuelve `/logo-upload-url`.
- `.env.example` no lleva barra final, así que depende de cómo esté cargada la variable en prod.

**Fix:** normalizar en un único lugar, dentro de `generateUploadUrl`:

```ts
const r2PublicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
```

Después, agregar un test que use `publicUrl` devuelto por `/logo-upload-url` (con R2 simulado y barra final) como `logoUrl` del alta.

### WR-02: El feed oculta marcas activas cuando se baja el límite, pero el admin las sigue mostrando como activas

**File:** `el-templo-api/src/modules/sponsors/service.ts:366-372` (comentario del contrato en `:24-26`, test en `test/sponsors/sponsors-member.test.ts:442`)
**Issue:**

- El contrato D-24 dice "bajar el límite no desactiva nada".
- `listForMember` aplica `.limit(limit)` con el límite vigente. Si hay 5 activas en AR y el admin baja el límite a 3, los socios ven solo las 3 primeras por `sortOrder`.
- Las otras 2 siguen `is_active = true` en el listado de admin y no figuran como ocultas. Siguen consumiendo cupo en `assertWithinLimit`.
- Para el admin, "activa" y "visible" divergen sin ninguna señal.
- Además, `recordEvent` sí acepta eventos de las marcas ocultas, porque `visibleForCountry` no aplica el límite. Las métricas pueden registrar vistas de algo que no se muestra.
- El test del feed fija este comportamiento como correcto.

**Fix:** elegir una de dos.

- Quitar el `.limit(limit)` del feed. El límite ya acota las altas, y el comentario "defensivo" no debería ocultar contenido.
- Dejar el recorte y exponer en el listado de admin un campo `hiddenByLimit` o equivalente, y aplicar el mismo recorte en `recordEvent`. Documentar la excepción en el contrato D-24.

### WR-03: La migración `0279_sponsors.sql` colisiona de número con `0279_conquer_body_checks.sql` de la rama 196

**File:** `el-templo-api/src/db/migrations/0279_sponsors.sql:28`
**Issue:**

- El header afirma "Numeracion: 0279 porque la fase 196 reserva hasta la 0278".
- La rama `feat/196-personalizados` ya contiene `0276_conquer_plan_model.sql`, `0277_conquer_log_model.sql`, `0278_personalized_interest_conquer.sql` y también `0279_conquer_body_checks.sql`.
- El runner se rige por nombre de archivo y los nombres difieren, así que ambas migraciones aplicarían.
- El orden entre las dos 0279 es alfabético, no por intención. El invariante "un número = una migración" que usa el equipo (y que las skills de migraciones dan por supuesto) se rompe en cuanto se integren las ramas.
- El comentario del header queda falso.

**Fix:** renumerar una de las dos antes de integrar. Lo más barato: `0280_sponsors.sql` (renombrar archivo y header) mientras 199 no está en staging. Actualizar el comentario y los textos de tests que citan "0279" (`tenant-tables.test.ts`, `0192-0195`, `0196-*`, `second-tenant.ts`, `helpers.ts`).

### WR-04: `sortOrder` sin tope máximo devuelve 500 con valores fuera del rango de `int`

**File:** `el-templo-api/src/modules/sponsors/schemas.ts:55`
**Issue:**

- `sortOrder: { type: "integer", minimum: 0 }` no tiene `maximum`.
- La columna es `int` de 32 bits. Un body con `"sortOrder": 99999999999` pasa el JSON Schema y la validación del service.
- El INSERT o UPDATE falla en MySQL con "Out of range value" y la ruta responde 500 en lugar de 400.
- Ningún test cubre este camino.
- `create` también calcula `max(sortOrder) + 1`, así que un valor cercano al tope haría fallar los altas siguientes.

**Fix:**

```ts
sortOrder: { type: "integer", minimum: 0, maximum: 1000000 },
```

Y agregar un caso 400 en `sponsors-admin.test.ts` (alta y edición).

## Info

### IN-01: `/weekly` ahora paga el costo del `innerJoin branches` y la consulta de asistencia, pero descarta los campos nuevos

**File:** `el-templo-api/src/modules/scheduling/routes.ts:1274` y `el-templo-api/src/modules/scheduling/schemas.ts:928`
**Issue:**

- `getMyBookings` es compartido por `/my-bookings` y `/weekly`.
- El schema de `/weekly` sigue declarando `myBookings: items: bookingRecordSchema`, así que `fast-json-stringify` recorta `branchId`, `branchName`, `branchTimezone` y `checkedInAt`.
- La app (`useSchedulingApi.ts`, `useTodayBookingStore.ts`) usa solo `/my-bookings` para esos datos, por lo que no hay bug funcional.
- `/weekly` ejecuta de más el join a `branches` y la query de `attendance`.
- El join `branches` es `inner` con `tenantWhere`: una sede mal cargada en otro tenant haría desaparecer la reserva de `/weekly`.

**Fix:** o bien usar `myBookingRecordSchema` también en `/weekly` (el contrato queda uniforme), o bien separar un método liviano para `/weekly`.

### IN-02: `my-bookings.branchName` viaja sin el shim `appBranchName`

**File:** `el-templo-api/src/modules/scheduling/routes.ts:1523-1530` y `booking-service.ts:699`
**Issue:**

- La regla documentada en `shared/app-branch-name.ts` es aplicar el shim a nivel handler en toda respuesta member-facing.
- `/weekly` lo aplica a `slots`; `/my-bookings` devuelve el nombre corto crudo ("Alberti").
- Hoy no rompe nada: la app nueva recorta el prefijo con `shortBranchName`. Pero un build viejo con el regex `^El Templo\s+` mostraría el nombre pelado, y el contrato queda inconsistente entre dos rutas del mismo plugin.

**Fix:** mapear `branchName: appBranchName(b.branchName, ctx.tenantId)` en el handler de `/my-bookings`, o documentar en `MyBookingRecord` que viaja en forma corta.

### IN-03: La regla de "plan activo" está duplicada en dos implementaciones

**File:** `el-templo-api/src/modules/sponsors/service.ts:699-725` y `el-templo-api/src/modules/subscriptions/service.ts:1459-1520`
**Issue:**

- Ambos comentarios dicen "para que canje y card nunca diverjan", pero la regla (paused, o active con `endDate` nula o `>= hoy` UTC) está escrita dos veces: una en SQL y otra en JS.
- Hoy coinciden (verificado contra `autoExpireSubscriptions`, `service.ts:6404`).
- Un cambio futuro en una de las dos rompe la promesa sin que ningún test lo detecte, porque cada test cubre su mitad.

**Fix:** que `SponsorsService.hasActivePlan` consuma `SubscriptionService.getMemberPlanStatus(...).hasActivePlan` (o exportar un predicado SQL compartido).

### IN-04: Los espejos de avisos usan fecha en zona AR para todos los socios y títulos de hasta 200 caracteres

**File:** `el-templo-api/src/modules/communications/prompt-service.ts:198` y `novedades-service.ts:~690`
**Issue:**

- `listPopupAvisosForFeed` valida vigencia con `todayInTz(AR_TIMEZONE)` aunque el socio sea de una sede ES. Es el mismo criterio del pop-up existente, pero ahora se replica en el feed, mientras que patrocinadores sí usa la zona de la sede (`sponsors/service.ts:364`). Hay dos criterios de "hoy" dentro de la misma pantalla.
- El espejo usa `text = aviso.title`. Los avisos admiten hasta 200 caracteres (`communications/schemas.ts:51`) y las novedades se limitan a 80 porque "caben en 2 líneas". Un título largo puede desbordar la card.

**Fix:** pasar la zona de la sede del socio a `avisoWithinVigencia` si se quiere unificar (decisión de producto). Recortar o clampar el texto del espejo a `NOVEDAD_TEXT_MAX_LENGTH` en `toAvisoMirrorItem`, o asegurar el clamp en la app.

### IN-05: El conteo del límite incluye marcas vencidas por fecha

**File:** `el-templo-api/src/modules/sponsors/service.ts:629-667`
**Issue:**

- `assertWithinLimit` cuenta `is_active` sin mirar vigencia (documentado). Una marca con `endsOn` pasada que nadie desactivó sigue ocupando un cupo.
- El admin recibe "Ya hay 6 patrocinadores activos en Argentina" sin que haya 6 visibles.

**Fix:** mostrar en el listado de admin un estado "vencida" (derivado de `endsOn`) para que sea evidente cuál desactivar, o contar solo las vigentes si el negocio lo prefiere.

### IN-06: Detalles menores

**File:** `el-templo-api/src/modules/settings/service.ts:146`, `sponsors/service.ts:548-561`
**Issue:**

- `setStringValue` loguea siempre "store url setting updated", también para `sponsors.max_active_per_country`. Es un mensaje engañoso en los logs (base compartida con las URLs de tienda).
- `assertOwnLogoUrl` valida solo con `startsWith`. Una URL como `https://base/sponsors/logos/../../otro` pasa la validación y el navegador la normaliza fuera del prefijo, dentro del mismo bucket. Solo lo puede enviar un admin de El Templo, así que el impacto es nulo en la práctica.

**Fix:** parametrizar el mensaje del log con la clave. Rechazar `..` y `?`/`#` en `logoUrl`, o parsear con `new URL` y comparar `origin` más `pathname` normalizado.

---

_Revisado: 2026-10-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
