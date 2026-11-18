---
phase: 214-comunidad-anotados-aura
verified: 2026-11-18T02:00:00Z
status: human_needed
score: 8/10 criterios verificados en código (los criterios 9 y 10 y partes de 4 y 7 dependen de verificación humana)
overrides_applied: 0
gaps: []
human_verification:
  - test: "Suite de integración en CI (profile-photo, profile-photo-admin, attendees, earned-aura, member-aura-movements, attendance-day-cap, complete-aura-rule, 0344, repaso, ISO-01/ISO-03, conteos de tenancy 0192-0195/0196, CON-04)"
    expected: "Verde. Ninguno de estos tests corrió nunca (no corren en local)"
    why_human: "Solo corre en CI al pushear a staging, con OK de Franco"
  - test: "Prueba en teléfono real iPhone y Android a 360/390/412 px: encabezado, hoja Quiénes van, foto (cámara y galería), Perfil, detalle de Aura, celebración, selector de nivel"
    expected: "Lo descrito en 214-UAT.md secciones 2 a 8; sin desborde; reduced-motion; cámara en español"
    why_human: "Render y comportamiento nativo no verificables por grep (criterio 10)"
  - test: "Copia de la foto de ficha al bucket privado (job cada 15 min, CopyObject entre buckets de R2)"
    expected: "A los 15-30 min la URL de la lista no contiene members/photos/; quitar la foto borra también el objeto público"
    why_human: "Depende de R2 real; si falla, las fotos de ficha salen sin imagen"
  - test: "EXIF/GPS de la foto subida (UAT 9)"
    expected: "La imagen descargada de la URL firmada no trae EXIF ni GPS (el servidor no recodifica; lo garantiza el recorte por canvas de la app)"
    why_human: "Requiere dispositivo real y exiftool"
  - test: "Consultas a producción: 05 (conciliación, bloques 0 y 1 antes del merge, 4 y 6 después del repaso = 0), 04 (fecha real de 367 importados), 06, 07 (línea de base 4 semanas), 08 (calibración del 80 %)"
    expected: "Conciliación 2.898/2.898 tras la 0344 y el repaso; línea de base guardada; ratio 0,8 y SECONDS_PER_REP=3 / MIN_BLOCK_SECONDS=60 razonables con sesiones reales"
    why_human: "Requiere acceso a producción (D-68); los criterios 4 (en datos reales) y 9 dependen de esto"
  - test: "Segundo deploy del repaso de D-49 (deploy-2/README.md), anuncio previo publicado, builds de tiendas con permiso de cámara, textos de .docs/TIENDAS-fase214-apple-google.md"
    expected: "Repaso aplicado después del reinicio de la API; anuncio publicado antes de mostrar las pantallas"
    why_human: "Operaciones de deploy y de tiendas, fuera de lo que puede hacer un ejecutor"
---

# Fase 214: Comunidad, anotados en la clase y Aura visible. Informe de verificación

**Objetivo:** el alumno ve quiénes están anotados en la clase y su Aura deja de ser invisible (puntos y movimientos propios, puntos al lado de cada anotado, encabezado de Mi Templo con nombre, foto, antigüedad y Aura, foto subida por él mismo), con los valores de Aura reacomodados antes de mostrarlos.
**Worktree:** `/home/franco/projects/et-comunidad`, rama `feat/comunidad-anotados-aura`.
**Re-verificación:** no, verificación inicial.
**Estado:** `human_needed`. No encontré gaps bloqueantes en el código. Todo el cableado de punta a punta existe y es alcanzable. Lo que queda no se puede probar en local.

Método: se leyó el código real (no los SUMMARY), se cruzaron rutas registradas, schemas de respuesta, clientes de la app y componentes montados, y se corrieron typecheck y tests unitarios.

## Criterios de éxito del ROADMAP

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Lista de anotados: nombre de pila, inicial, foto aprobada o iniciales, puntos; orden de reserva; sin apellido, teléfono, trial, cancelados ni espera | VERIFICADO (CI pendiente) | `el-templo-api/src/modules/scheduling/attendees-service.ts`: `LEFT(lastName,1)`, `isTrial=false`, status en `reservado/qr_escaneado/confirmado`, `deletedAt IS NULL`, `orderBy(bookedAt, id)`. Ruta `GET /slots/:scheduleId/:date/attendees` en `scheduling/routes.ts:1488`. Schema `slotAttendeesSchema` (`schemas.ts:1084`, `additionalProperties:false`, sin rol ni origen: D-52). Cliente `useCommunityApi.ts:11`, hoja `AttendeesSheet.vue` montada en `ReservasPage.vue:1069`, abierta por la fila "N anotados" (`ReservasPage.vue:797`). Entrada de manifiesto en `test/tenant-manifest.ts:1306`. Test `test/scheduling/attendees.test.ts` existe |
| 2 | Oculto cuenta en el número, "y otros N más", deja de ver la lista; menores y no-AR ocultos por defecto | VERIFICADO | `community-visibility.ts:18-79`: `effectiveVisible` (menor <18 o país ≠ AR = oculto, sin fecha = adulto), `listAccess` devuelve `oculto` si el que mira está oculto. `hiddenCount = total - attendees.length` (`attendees-service.ts`). Toggle `PUT /attendees/visibility` (`routes.ts:1433`), `/me` devuelve `communityVisible` y `communityNoticeSeen` (`auth/routes.ts:1207`). App: `AttendeesSheet.vue:164-170` (celda "+N más", aria "y otros N más"), sección Comunidad `ProfilePage.vue:119`. Unit `community-visibility.test.ts` 18/18 |
| 3 | Cada usuario ve sus puntos y, en detalle privado, sus últimos movimientos; nadie lee los de otro; staff igual | VERIFICADO | `GET /api/members/aura/movements` (`aura/member-routes.ts:35`) usa solo `request.user.userId` (sin parámetro de usuario), filtra `amount != 0` y pagina por `before`. Registrada vía `module.ts` con prefijo `/api/members/aura`. `/me.auraEarned` sin distinción por rol (`auth/routes.ts:1151`). App: `useAuraApi.ts:13` y `AuraDetailSheet.vue`, montado en `MiTemploHeader.vue` y `ProfilePage.vue`. Schema `member-schemas.ts` declara `earned/movements/nextBefore`, coincide con el tipo de la app. Unit `aura-movement-labels.test.ts` 7/7 |
| 4 | Valores nuevos en todas las fuentes, historial re-valorizado, puntos mostrados = suma del ledger | VERIFICADO EN CÓDIGO; conciliación en datos reales PENDIENTE | `aura/amounts.ts` (clase 5, onboarding 5, 15/25/50, 5/10/15/25/50, app y plan a medida 3, bloque libre 2, estirar 1, foto 5). Todos los sitios leen `AURA_AMOUNTS`/`AURA_STREAK`/`tenureAuraFor` (attendance, onboarding, stretch, free-blocks, sessions, goal-plans, programs, streak-reward, tenure-milestones, profile-photo-service:845); no quedan montos viejos hardcodeados. Migración `0344_aura_revaluation.sql` (backup, UPDATEs por fuente, defaults de programas, `aura_config`, puesta a 0 de filas app del mismo día de asistencia, recálculo de `aura_balances`). `aura/earned.ts` suma el ledger sin canjes (D-02). Repaso D-49 preparado en `deploy-2/` a propósito. Unit `aura-amounts.test.ts` 6/6. Conciliación sobre producción: ver verificación humana |
| 5 | Entrenar en app da Aura solo con 80 % del tiempo y todos los bloques; no suma el día de asistencia (tope 5) | VERIFICADO (CI pendiente) | `sessions/proposed-time.ts` (`AURA_TIME_RATIO=0.8`, `evaluateTrainingAura`), usado en `sessions/routes.ts:576-615` y `goal-plans/routes.ts:451-482`, con `attendanceAuraOnLocalDay`/`appAuraOnLocalDay`. Tope D-64 en `aura/day-cap.ts` (`attendanceAuraAmountFor` paga la diferencia hasta 5; `attendanceAuraCredited` para la reversa), usado en los 3 puntos de asistencia (`attendance/service.ts:392, 572, 1058`) y en la reversa (`:1330`). D-48 (inicio mal enviado al retomar) corregido en `GoalPlanSession.vue:303, 401`. Unit `proposed-time.test.ts` 30/30. La regla condiciona solo el Aura (el `try/catch` no rompe el cierre) |
| 6 | El admin ya no ofrece el descuento por Aura | VERIFICADO | `el-templo-admin/src/components/AssignPlanDialog.vue:380-385`: selector retirado y `auraSpend` siempre `null`. Ningún otro componente del admin lo ofrece (`SubscriptionCard.vue` solo muestra descuentos históricos). La API lo sigue aceptando por decisión (ver Observaciones) |
| 7 | Foto propia: pendiente hasta aprobación del staff, staff puede quitarla, nunca se rechaza por pesada | VERIFICADO (CI y R2 pendientes) | Servidor: `members/profile-photo-routes.ts` (`upload-url`, `confirm`, `DELETE`, `report`), registrado en `app.ts:288`. Admin: `GET /admin/members/profile-photos` (`members/routes.ts:245`), `approve` (`:2086`), `reject` (`:2116`), `DELETE /:userId/profile-photo` (`:2137`), con manifiesto en `tenant-manifest.ts`. Aura +5 una vez (`profile-photo-service.ts:845`, referencia = userId, duplicado absorbido). La app reduce la foto por canvas (`avatar-image.ts`, usado en `useProfilePhoto.ts`); el tope de 8 MB del servidor es solo red de seguridad con mensaje accionable (`profile-photo-service.ts:232-245`, D-33). Cliente de admin `useProfilePhotosApi.ts` y página `FotosPerfilPage.vue` con ruta `alumnos/fotos` (`router/routes.ts:146`) y pelotita en `AdminLayout`/`useAdminStore.ts:98`. Schemas de cola y respuestas coinciden con los tipos del admin y de la app. `/me` entrega `photoUrl` y `photo` (sin response schema, no se recorta). Job `startFichaPhotoMirrorJob(app)` registrado en `index.ts:76` |
| 8 | Encabezado de Mi Templo único (escritorio y celular), sin "Hola", fecha ni contador; selector de nivel a la barra, solo en Entrenar | VERIFICADO (render pendiente) | `MiTemploHeader.vue` montado una vez por variante en `MainLayout.vue:53` y `:105`. No hay "Hola", fecha ni contador de sesiones en el componente. Selector: `MainLayout.vue:37` con `showLevelSelector` = `route.name==='training'` (la ruta existe en `modules/training/routes.ts:7`), y en escritorio `EntrenarView.vue:5`. Sello sin dorado (`VeteranSeal.vue`), antigüedad en `utils/tenure.ts` |
| 9 | Línea de base de 4 semanas antes de lanzar y misma medición después | NECESITA VERIFICACIÓN HUMANA | La consulta `consultas/07-linea-de-base.sql` existe y es de solo lectura; nadie la corrió (requiere producción) |
| 10 | Funciona en teléfono real, iOS incluido | NECESITA VERIFICACIÓN HUMANA | `Info.plist` actualizado (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`), `@capacitor/camera` ya estaba instalado y no se tocó ningún `package.json`. El resto es UAT |

## Piezas huérfanas y datos cruzados (búsqueda explícita)

| Pieza | Resultado |
|-------|-----------|
| Los 11 componentes y 8 utilidades nuevas de la app | Todos importados y montados. Cadena: `MiTemploHeader` -> `MainLayout`; `AttendeesSheet`/`AttendeePhotoDialog` -> `ReservasPage`; `CheckInCelebration` -> `CheckInPage`; `ProfilePhotoSheet`/`PhotoRulesDialog`/`AuraDetailSheet` -> `ProfilePage`/`MiTemploHeader`. Ningún huérfano |
| Rutas del servidor sin cliente | Ninguna: attendees, visibility, notice-seen, report, upload-url, confirm, DELETE foto, aura/movements, y las 4 rutas de admin tienen cliente |
| Campos que la app lee y el servidor no manda | Ninguno. `auraAwarded/auraTotal` del check-in (`attendance/routes.ts:237-278`, declarados en `attendance/schemas.ts:45`, usados en `CheckInPage.vue:155`) |
| Campos que el servidor manda y la app no usa | Ninguno relevante |
| Schemas de respuesta (fast-json-stringify) | Declarados para attendees, movements, cola de fotos y check-in. `/me` no tiene response schema, así que `photo`, `photoUrl`, `auraEarned`, `communityVisible` pasan |
| Gates de tenancy | `member_photos` registrada en `tenant-tables.ts`; las 11 rutas nuevas están en `tenant-manifest.ts` |
| Entregable D-67 (lista de cambios Apple y Google) | Existe: `/home/franco/projects/el-templo/.docs/TIENDAS-fase214-apple-google.md` |

## Verificaciones ejecutadas

| Chequeo | Resultado |
|---------|-----------|
| `npx tsc --noEmit` (API) | exit 0, 0 errores |
| `vue-tsc` app | 20 errores (línea de base 21): sin errores nuevos |
| `vue-tsc` admin | 36 errores (línea de base 36): sin cambios |
| Unit: `aura-amounts`, `aura-movement-labels`, `community-visibility`, `proposed-time` | 61/61 pasan |
| `gsd-sdk verify.artifacts` en los 32 planes | Todos pasan (76 artefactos existen y son sustantivos) |
| `gsd-sdk verify.key-links` en los 32 planes | 9 planes marcan "Pattern not found". Revisé cada uno y son patrones obsoletos de los planes (por ejemplo el plan 05 apunta a `stretch-routes.ts`, que no existe: el monto vive en `stretch-service.ts`; el plan 02 apuntaba a `AURA_AMOUNTS.attendance` en `attendance/service.ts`, que pasó a `day-cap.ts` por D-64). El cableado real está verificado arriba. Ninguno es un gap |
| Anti-patrones (TBD/FIXME/XXX, `console.*`, `any`) en los archivos de la rama | Cero hallazgos |
| Migraciones 0344-0347 | Sin `;` en comentarios SQL, sin colisión de número con `origin/master` (última 0343). Enum de `profile_photo` coincide con el schema Drizzle y `AuraSourceType` |

## Gaps

No hay gaps bloqueantes (BLOCKER) ni de cableado.

## Observaciones (no bloquean, severidad advertencia o informativa)

1. **WARNING, suite de integración sin correr.** Los tests de integración nuevos (planes 04 a 31) nunca corrieron. La fase queda verificada solo con typecheck, lint de tenencia y tests unitarios. Es el riesgo principal de regresión.
2. **WARNING, `pnpm typecheck:tests` en rojo.** 18 discrepancias contra su baseline propio (ya en rojo desde el plan 02). Ninguna es de archivos de test nuevos de la fase, pero conviene que el CI lo compare contra su baseline antes de confiar en él.
3. **WARNING, orden de despliegue.** El repaso de D-49 queda fuera de `src/db/migrations/` a propósito (`deploy-2/`). Hasta que corra, entre la 0344 y el reinicio la API vieja puede acreditar con montos viejos. No mostrar puntos en pantallas hasta que los bloques 4 y 6 de la consulta 05 den 0.
4. **INFO, texto literal de "y otros N más".** El ROADMAP dice "y otros N más"; la pantalla muestra una celda "+N más" y reserva "y otros N más" para el lector de pantalla. Es la decisión aprobada del UI-SPEC, no una desviación.
5. **INFO, `auraSpend` sigue aceptado por la API.** D-22 apaga el descuento en el admin; el servidor mantiene el soporte (decisión registrada en el plan 07). Un cliente de admin viejo en caché todavía podría enviarlo.
6. **INFO, tipo de la app.** `Attendee.lastInitial` es `string` en `types/community.ts`, pero el servidor puede mandar `null`; `attendees-view.ts` ya lo maneja con `?.`, así que no rompe.
7. **INFO, deudas conocidas ya anotadas:** check-in forzado de noche guarda fecha en UTC y puede no cruzar con el tope diario; foto de ficha nueva aparece hasta 15-30 minutos después; push de rechazo no llega si el alumno apagó "anuncios" (queda el estado en Perfil).

## Resumen

El código de la fase está completo, conectado de punta a punta y sin piezas huérfanas. Los criterios 1, 2, 3, 5, 6 y 8 se verificaron por lectura del código y tests unitarios. Los criterios 4 y 7 están implementados y verificados en lo local, pero quedan sujetos a CI, a R2 y a la conciliación sobre datos reales. Los criterios 9 y 10 solo se pueden cerrar con producción y teléfonos reales. Estado: `human_needed`.

---

_Verificado: 2026-11-18_
_Verificador: Claude (gsd-verifier)_
