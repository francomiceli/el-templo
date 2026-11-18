---
phase: 214-comunidad-anotados-aura
reviewed: 2026-11-18T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - el-templo-api/src/modules/scheduling/community-visibility.ts
  - el-templo-api/src/modules/scheduling/community-service.ts
  - el-templo-api/src/modules/scheduling/attendees-service.ts
  - el-templo-api/src/modules/scheduling/routes.ts
  - el-templo-api/src/modules/scheduling/schemas.ts
  - el-templo-api/src/modules/aura/amounts.ts
  - el-templo-api/src/modules/aura/earned.ts
  - el-templo-api/src/modules/aura/day-cap.ts
  - el-templo-api/src/modules/aura/member-routes.ts
  - el-templo-api/src/modules/aura/member-schemas.ts
  - el-templo-api/src/modules/aura/movement-labels.ts
  - el-templo-api/src/modules/aura/daily-award.ts
  - el-templo-api/src/modules/attendance/service.ts
  - el-templo-api/src/modules/sessions/proposed-time.ts
  - el-templo-api/src/modules/sessions/routes.ts
  - el-templo-api/src/modules/goal-plans/routes.ts
  - el-templo-api/src/modules/members/profile-photo-routes.ts
  - el-templo-api/src/modules/members/profile-photo-service.ts
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/src/modules/conquer/private-media.ts
  - el-templo-api/src/db/migrations/0344_aura_revaluation.sql
  - el-templo-api/src/db/migrations/0345_aura_source_profile_photo.sql
  - el-templo-api/src/db/migrations/0346_member_photos.sql
  - el-templo-api/src/db/migrations/0347_member_profiles_community.sql
  - .planning/phases/214-comunidad-anotados-aura/deploy-2/aura_revaluation_repaso.sql
  - el-templo-app/src/utils/avatar-image.ts
  - el-templo-app/src/composables/useProfilePhoto.ts
  - el-templo-app/src/components/AttendeesSheet.vue
  - el-templo-app/src/components/CheckInCelebration.vue
findings:
  critical: 0
  high: 1
  medium: 5
  low: 6
  total: 12
status: fixes_applied
---

# Fase 214: Informe de revisión de código

**Revisado:** 2026-11-18
**Profundidad:** standard (priorizada por riesgo; no se cubrieron los 159 archivos)
**Estado:** issues_found

## Alcance real de la lectura

**Leídos completos (sin comentarios de cabecera):** `community-visibility.ts`, `community-service.ts`,
`attendees-service.ts`, `aura/{amounts,earned,day-cap,member-routes,member-schemas,daily-award}.ts`,
`sessions/proposed-time.ts`, `profile-photo-routes.ts`, `avatar-image.ts`, `useProfilePhoto.ts`,
migraciones 0344, 0345, 0346 y 0347, y el repaso `deploy-2/aura_revaluation_repaso.sql`.

**Leídos por tramos (las funciones que importan):** `profile-photo-service.ts` (solicitud de subida, confirmación,
quitar, reportar, resolver fotos, cola de revisión, aprobar, estado propio; NO leí `rejectProfilePhoto` ni
`ficha-photo-mirror`), `attendance/service.ts` (diff + `removeCheckIn`), `sessions/routes.ts` y
`goal-plans/routes.ts` (solo el cierre y el Aura), `members/routes.ts` (diff de las rutas de fotos),
`scheduling/routes.ts` y `schemas.ts` (diff), `private-media.ts` (claves de avatar), `AttendeesSheet.vue`
(lógica) y `CheckInCelebration.vue` (timers).

**Solo muestreados con grep (listeners/timers/reduced-motion):** `AuraDetailSheet.vue`, `ProfilePhotoSheet.vue`,
`AttendeePhotoDialog.vue`, `MemberAvatar.vue`, `MiTemploHeader.vue`, `FotosPerfilPage.vue` (admin).

**No leídos:** `ReservasPage.vue`, `ProfilePage.vue`, `MainLayout.vue`, `useUserStore.ts`, `useProfilePhotosApi.ts`,
rutas/servicios de admin fuera de fotos, `free-blocks-service.ts`, `stretch-service.ts`, `streak-reward.ts`,
`ficha-photo-mirror.ts`, y los tests (salvo la verificación de abajo).

**Verificaciones corridas:** `npx tsc --noEmit` en `el-templo-api` sin errores; tests unitarios
(`vitest.config.unit.ts`) 49 archivos / 1460 tests en verde. No se corrieron tests de integración.

**Lo que sí está bien (probado leyendo):** el schema de anotados declara solo los campos permitidos con
`additionalProperties: false` (ni ids de usuario ni roles); `/aura/movements` filtra siempre por
`request.user.userId` sin aceptar id en query; las fotos de la comunidad salen solo con `status = 'aprobada'`;
quien está oculto o sin plan recibe `attendees: []` y solo `total`; las rutas de aprobar/rechazar/quitar del admin
quedan bajo `enforceMemberBranchScope` (404 si el alumno es de otra sede); las claves de avatar llevan HMAC y no el
id del usuario; ninguna de las migraciones tiene `;` dentro de comentarios.

## Hallazgos altos

### HI-01: Aprobar/rechazar una foto actúa sobre la foto vigente, no sobre la que el staff vio (TOCTOU de moderación)

**Estado: corregido** (`a8ae81c22`). Aprobar y rechazar exigen `photoId`; si la foto vista ya no es la vigente responde 409 `FOTO_PERFIL_CAMBIO` y no toca nada. El admin refresca la cola ante el 409. Tests de integración agregados (corren en CI).

**Archivo:** `el-templo-api/src/modules/members/profile-photo-service.ts:760` (`approveProfilePhoto`), rutas en
`el-templo-api/src/modules/members/routes.ts:2086` y `:2116`, esquema `profile-photo-schemas.ts:168` (`photoApproveSchema`
solo recibe `:userId`).
**Escenario:** el alumno sube la foto A (pendiente). El admin abre la cola de revisión y mira A (la cola devuelve
`photoId`). Antes de que el admin pulse "Aprobar", el alumno sube la foto B: `confirmProfilePhoto` marca A como
`reemplazada` e inserta B como `pendiente`. El admin pulsa "Aprobar" sobre la fila de A; el endpoint no recibe
`photoId`, toma la última `pendiente` del usuario (B), la aprueba y entrega 5 de Aura. B pasa a verse en las listas de
anotados sin que nadie la haya mirado. Lo mismo ocurre si el alumno tiene una foto aprobada reportada y sube una nueva:
"revisar el reporte" aprueba la nueva sin verla. El rechazo tiene el mismo diseño (ruta sin `photoId`).
**Corrección:** exigir `photoId` en el body de `approve` y `reject` (la cola ya lo devuelve) y, dentro de la transacción
con `FOR UPDATE`, operar solo si esa fila sigue en el estado esperado; si no, responder 409 con un código
(`FOTO_PERFIL_CAMBIO`) para que el admin recargue la cola:
```ts
const target = rows.find((r) => r.id === photoId);
if (!target || (target.status !== "pendiente" && target.status !== "aprobada")) {
  throw new AppError("La foto cambió, recargá la cola", 409, "FOTO_PERFIL_CAMBIO");
}
```

## Hallazgos medios

### ME-01: El tope del día de la asistencia forzada usa la fecha UTC y el de la app la fecha local de la sede

**Estado: corregido** (`6da3723dc`). El tope del día de la asistencia forzada usa el día local de la sede; la fila sigue guardando la fecha UTC. Test nocturno agregado (corre en CI).

**Archivo:** `el-templo-api/src/modules/attendance/service.ts:556-575` (`todayStr = new Date().toISOString()...`, pasado
a `attendanceAuraAmountFor` en `:572`) contra `el-templo-api/src/modules/aura/day-cap.ts:83-117` y
`sessions/routes.ts:566` (usan `localDateForBranch`).
**Escenario:** en Argentina (UTC-3), un alumno completa su entrenamiento en la app a las 22:00 del martes (se
acredita 3 con clave `martes`). A las 22:30 el staff le fuerza la asistencia: `todayStr` ya es miércoles (UTC), así que
`appAuraOnLocalDay` mira el miércoles, ve 0 y acredita 5. Ese día suma 8, por encima del tope de 5 (D-64). Pasa en el
tramo de 21:00 a 24:00 hora local.
**Corrección:** calcular `sessionDate` con `todayInTz(branchTz)` en la asistencia forzada (como ya hace el check-in por
QR en `:134`), o al menos pasarle a `attendanceAuraAmountFor` la fecha local de la sede.

### ME-02: La regla del 80 % del tiempo se apoya en un `startedAt` que manda el cliente

**Estado: aceptado.** El dueño eligió "solo tiempo total, cambio solo en el servidor" sabiendo que un cliente manipulado puede burlar la regla (D-20). No se cambia.

**Archivo:** `el-templo-api/src/modules/sessions/routes.ts:482` y `goal-plans/routes.ts:359` (`new Date(startedAt)`),
evaluado en `sessions/proposed-time.ts` (`evaluateTrainingAura`: solo valida que `startedAt` no sea futuro y que no
tenga más de 12 h).
**Escenario:** un cliente (o un script) completa la sesión en 5 segundos enviando `startedAt = ahora - proposedSec`
y `blocksCompleted` con todos los roles: `durationSec >= 0.8 * proposedSec`, se acredita el Aura. Con las puntos ahora
visibles para todos los anotados, inflar Aura tiene incentivo social. Los comentarios dicen "duración medida por el
servidor", pero el servidor solo mide el final.
**Corrección:** registrar el inicio en el servidor (por ejemplo al abrir la sesión, en una tabla o en `completed_sessions`
al iniciar) y medir desde ahí; si no se quiere eso en esta fase, corregir el comentario y documentar la regla como
"disuasiva, no antifraude".

### ME-03: Subida de foto sin límite de tamaño real ni limpieza de objetos rechazados o sin confirmar

**Estado: corregido parcialmente** (`11f69805b`). El tamaño real del objeto ya se validaba en `confirm` (`PHOTO_MAX_BYTES`, HEAD); ahora el objeto rechazado se borra del bucket y `upload-url` y `confirm` tienen rate limit por IP y por usuario. **Sin resolver:** el `PUT` firmado sigue sin tope de tamaño durante la subida (exige firmar `ContentLength` con cambio en la app, o presigned POST) y falta la regla de ciclo de vida del bucket para `private/avatars/` (infraestructura, decisión del dueño).

**Archivo:** `el-templo-api/src/modules/members/profile-photo-service.ts:177-208` (presign solo fija `Content-Type`) y
`:228-241` (`head` rechaza por tamaño o tipo pero no borra el objeto); `profile-photo-routes.ts` (ruta `upload-url` sin
`config.rateLimit`).
**Escenario:** un alumno con la app modificada pide `upload-url` y sube con `PUT` un archivo de varios GB (o N
archivos, una URL nueva por petición) con `Content-Type: image/jpeg`. `confirm` responde 400 por tamaño pero el objeto
queda en el bucket privado, ya que ninguna fila lo referencia y nadie lo borra. Lo mismo pasa con subidas cuyo `confirm`
nunca llegó (corte de red entre `PUT` y `confirm`).
**Corrección:** en el rechazo por `head` llamar a `removeBestEffort(store, key)` antes de lanzar el error; usar un
presigned POST con `content-length-range` (o `ContentLength` firmado), poner `config: { rateLimit }` a `upload-url`, y
una regla de ciclo de vida del bucket para `private/avatars/` con objetos sin confirmar.

### ME-04: El servidor no re-codifica ni valida la foto: el recorte por canvas (sin EXIF) es solo del lado del cliente

**Estado: aceptado como pendiente del dueño.** Re-codificar la foto en el servidor exige una librería de imágenes nueva (`sharp`) y no se instalan dependencias sin el OK del dueño.

**Archivo:** `el-templo-api/src/modules/members/profile-photo-service.ts:209-245` (solo valida tamaño y `Content-Type`
del objeto); `el-templo-app/src/utils/avatar-image.ts` (la re-codificación vive en la app).
**Escenario:** quien suba directo a la URL presignada (o una versión vieja de la app) puede subir un JPEG con GPS/EXIF o
un archivo que no es una imagen. El admin lo aprueba (lo ve renderizado) y las URLs presignadas lo sirven a toda la
lista de anotados con los metadatos de ubicación intactos. El cliente cumple lo prometido; el servidor no lo garantiza.
**Corrección:** al confirmar, descargar el objeto, verificar firma JPEG (`FF D8 FF`), re-codificar con `sharp`
(`.rotate().resize(480, 480, { fit: 'cover' }).jpeg()`, sin `withMetadata`) y reemplazar el objeto antes de crear la fila.

### ME-05: La 0344 y el repaso recalculan `aura_balances` con una suma global mientras la API vieja sigue acreditando

**Estado: corregido** (`a68024c25`). El repaso ya terminaba recalculando `aura_balances` desde el ledger; se documentó en `deploy-2/README.md` que ese recálculo (con la API vieja ya apagada) corrige los saldos pisados en la ventana 0344-reinicio, y se agregó la consulta de conciliación. La 0344 no se editó.

**Archivo:** `el-templo-api/src/db/migrations/0344_aura_revaluation.sql` (último `UPDATE aura_balances ... SET
b.balance = COALESCE(x.s, 0)`) y el mismo bloque en `deploy-2/aura_revaluation_repaso.sql`.
**Escenario:** la propia README del deploy-2 dice que entre la 0344 y el reinicio la API vieja sigue acreditando.
`AuraService.award` hace insert en el ledger + `UPDATE aura_balances` en su transacción; el `UPDATE ... JOIN (SELECT
SUM)` de la migración lee el ledger en un instante y escribe el saldo después: un `award` confirmado entre medio deja el
saldo sin esa fila (se pisa con la suma vieja). Ventana de segundos, pero silenciosa y sin forma de detectarla (no hay
re-ejecución posible de la 0344 porque la tabla de backup ya existe).
**Corrección:** correr la recomputación de saldos como último paso del repaso (cuando ya no hay API vieja) y quitarla de
la 0344, o bloquear con `LOCK TABLES aura_balances WRITE, aura_transactions READ` durante ese `UPDATE`. Además, en la
consulta de control agregar la conciliación `balance = SUM(ledger)` para detectarlo.

## Hallazgos bajos

### LO-01: Dos asistencias el mismo día con Aura parcial de la app pagan 5 completo a la segunda

**Estado: sin tocar, decisión de producto.** D-64: dos asistencias en categorías distintas el mismo día siguen sumando cada una. Es comportamiento pretendido.

**Archivo:** `el-templo-api/src/modules/aura/day-cap.ts:136-142`.
**Escenario:** app paga 3, la asistencia A acredita 2 (la diferencia) y la asistencia B (otra actividad) ve `earlier = 2
> 0` y acredita 5. Total del día 10, por encima del tope de 5. Si la regla D-64 admite "una asistencia + app" es un
comportamiento pretendido (el comentario del archivo lo describe), pero conviene confirmarlo con Franco porque los dos
casos del test no cubren "A parcial, luego B".
**Corrección:** si el tope es absoluto, calcular `max(0, 5 - (appAura + attendanceAuraDelDía))` también con `earlier`.

### LO-02: Carreras sin atomicidad en el tope del día

**Estado: sin tocar.** Serializar con `SELECT ... FOR UPDATE` sobre `aura_balances` cambia la transacción de acreditación en tres módulos y no es un cambio chico ni seguro; el riesgo es improbable (mismo alumno, mismo segundo). Queda aceptado y documentado.

**Archivo:** `el-templo-api/src/modules/aura/day-cap.ts` + `sessions/routes.ts:566-598`, `goal-plans/routes.ts:440-480`,
`attendance/service.ts:392`.
**Escenario:** el cierre de sesión (3) y el check-in (hasta 5) leen "lo que ya cobró el día" antes de insertar; si se
ejecutan a la vez, los dos ven 0 y el día suma 8. Igual para `training_completion` y `goal_plan_completion` simultáneas.
La clave única `(user, source, ref)` solo evita duplicar la misma fuente. Es improbable (mismo alumno, mismo segundo).
**Corrección:** aceptarlo documentado, o serializar con un `SELECT ... FOR UPDATE` sobre la fila de `aura_balances`
del usuario dentro de la transacción de la acreditación.

### LO-03: `aprobar` pierde el Aura si la acreditación falla de forma transitoria y no hay reintento

**Estado: sin tocar.** Acreditar dentro de la transacción de aprobación o agregar un reintento/conciliación requiere que `AuraService.award` acepte una transacción externa o un job nuevo: diseño, no un arreglo chico.

**Archivo:** `el-templo-api/src/modules/members/profile-photo-service.ts:838-862`.
**Escenario:** la foto queda `aprobada`, `award` falla por un error de base (no duplicado): se loguea un `warn` y se
devuelve `auraAwarded: false`. Reintentar la aprobación responde 404 "No hay foto para revisar", así que esos 5 puntos
no se pueden acreditar desde la UI.
**Corrección:** acreditar dentro de la transacción de aprobación, o dejar un job/retry que reconcilie fotos aprobadas
sin fila `profile_photo` en el ledger.

### LO-04: Cualquier alumno puede reportar cualquier `photoId` aprobado del gimnasio, incluso de alumnos ocultos

**Estado: corregido parcialmente** (`321a36196`). Reportar la foto propia ya no suma. **Sin resolver:** validar que quien reporta pueda ver la foto (plan vigente, no oculto, mismo país) para no filtrar qué `photoId` existen; requiere reutilizar la lógica de visibilidad y decidir qué responder, queda pendiente.

**Archivo:** `el-templo-api/src/modules/members/profile-photo-service.ts:427-470` (`reportProfilePhoto`).
**Escenario:** no se verifica que quien reporta pueda ver esa foto (plan vigente, no oculto, mismo país) ni que no sea la
propia. Probando ids consecutivos, `204` vs `404` revela qué `photoId` existen y están aprobados, incluidas fotos de
alumnos que eligieron no aparecer en listas. Además un alumno puede reportar su propia foto o inflar `report_count` con
cuentas de prueba.
**Corrección:** reutilizar `listAccess`/`effectiveVisible` del dueño de la foto antes de aceptar el reporte y rechazar
`photo.userId === reporterId`; responder siempre 204 para fotos no reportables.

### LO-05: La 0344 no es re-ejecutable tras un fallo parcial y el repaso queda mudo si el nombre en `_migrations` cambia

**Estado: sin tocar en la 0344 (no se edita); mitigado en el repaso por documentación** (`a68024c25`). El README de `deploy-2/` pide verificar la fila `0344_aura_revaluation.sql` en `_migrations` antes de correr el repaso. No hay guarda en el SQL porque un `SELECT 1/0` no falla de forma confiable en MySQL.

**Archivo:** `el-templo-api/src/db/migrations/0344_aura_revaluation.sql` (`CREATE TABLE aura_transactions_backup_0344`
sin `IF NOT EXISTS`) y `deploy-2/aura_revaluation_repaso.sql` (subconsulta sobre `_migrations.name`).
**Escenario:** MySQL no revierte DDL; si la 0344 falla a mitad (por ejemplo en un `UPDATE` con deadlock), las tablas de
backup ya existen y el reintento falla de entrada con "Table already exists", dejando la migración sin registrar y a
medias. En el repaso, si `0344_aura_revaluation.sql` no está en `_migrations` (o se renombró) el `created_at < NULL`
no actualiza ninguna fila de topes del día y el runner igual lo marca como aplicada, sin ruido.
**Corrección:** `CREATE TABLE IF NOT EXISTS ... AS SELECT` no rellena si ya existe, así que usar
`DROP TABLE IF EXISTS` + `CREATE` solo si se acepta perder el backup anterior, o dividir en pasos idempotentes;
en el repaso agregar una guarda `SELECT 1/0`-style o un `INSERT ... SELECT` que falle si la fila de la 0344 no existe.

### LO-06: `removeCheckIn` traga cualquier error del descuento, no solo saldo insuficiente

**Estado: corregido** (`0327fdcfd`). `removeCheckIn` captura `err: unknown`: `InsufficientBalanceError` va a `warn`, cualquier otro error a `error`.

**Archivo:** `el-templo-api/src/modules/attendance/service.ts:1349` (`} catch {` sin `err: unknown`), mensaje "insufficient
balance".
**Escenario:** un error de base o de red en `attendanceAuraCredited`/`spend` se registra como "insufficient balance" y la
reversa se omite; el alumno conserva puntos de una asistencia deshecha (que ahora es visible en listas). La regla del repo
pide `catch (err: unknown)`.
**Corrección:** capturar `err: unknown`, distinguir `InsufficientBalanceError` (warn) del resto (`this.log.error({ err })`).

---

_Revisado: 2026-11-18_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidad: standard_
