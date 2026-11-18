# Fase 214 — Reglas y lecciones para los ejecutores

Lectura obligatoria antes de ejecutar cualquier plan de la fase. El orquestador la actualiza con las
lecciones de cada plan.

## Dónde se trabaja

- Solo en `/home/franco/projects/et-comunidad` (rama `feat/comunidad-anotados-aura`).
- Nunca se edita ni se commitea en `/home/franco/projects/el-templo` ni en otros worktrees. De ellos solo
  se usan los `node_modules` ya enlazados por symlink (plan 01).

## Reglas duras

- No instalar ni actualizar dependencias (`pnpm add`, `pnpm install`, `npm install`, ni `npx` de un
  paquete que no esté ya en `node_modules`).
- Sin push, sin SSH, sin tocar producción. Las consultas de `consultas/` no se corren.
- Sin bump de versión. Sin `any`. Logging con Pino (API) o `createLogger()` (app y admin).
- `git add` siempre por ruta explícita, nunca `-A` ni `.`. En la carpeta de la fase hay un `.tsv` sin
  trackear que NO se agrega nunca (`consultas/02-aura-por-fuente-anonimo.resultado-2026-11-17.tsv`).
- Si lint-staged falla, se arregla y se hace un commit NUEVO. Nunca amend.
- Migraciones a mano, con el número libre verificado contra `origin/master` y `origin/staging` en el
  momento (`git fetch` antes), el `.sql` en el mismo commit que el schema, sin `;` dentro de comentarios
  SQL y sin datos de prueba. Nunca `drizzle-kit push` ni `drizzle-kit migrate`.
- Tests y typecheck SOLO en foreground y con timeout amplio. Prohibido `run_in_background` y los loops de
  espera con `pgrep` o `sleep`. Nunca dos vitest a la vez.
- La suite de integración corre en CI, no en local. En local: typecheck, lint y como máximo el archivo de
  test angosto que pide el plan.
- Si aparece una decisión de producto que el plan no resuelve: se toma la opción más conservadora, se
  sigue, y se informa en la respuesta final. No se frena a preguntar (D-68).

## Typecheck: el criterio es "cero errores nuevos"

Línea de base registrada por el plan 01 en `TYPECHECK-BASELINE.md`:

| App | Comando (desde la carpeta de la app) | Errores de base |
|---|---|---|
| API | `npx tsc --noEmit` | 0 |
| App | `/home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json` | 21 |
| Admin | el mismo `vue-tsc` por ruta absoluta | 36 |

- Donde un plan diga "`tsc` da 0" para la app o el admin, vale "no hay errores nuevos respecto de la
  línea de base". En la API sí tiene que dar 0.
- `vue-tsc` se invoca por la ruta absoluta de arriba, no con `npx` (lo descargaría).
- Si se redirige la salida de un comando a un archivo, que sea fuera del repo.

## Notas por plan (del verificador de planes)

- **Plan 08 y consulta 08:** `completed_sessions.duration` está en SEGUNDOS (lo guarda
  `sessions/routes.ts:480-485`), aunque el comentario del schema diga minutos.
- **Plan 13, tarea del job de copia de la foto de ficha:** `users.photo_url` se guarda al generar la URL
  de subida, antes de que el archivo exista. El job tiene que ignorar las URLs con menos de 15 minutos
  (el timestamp va en el nombre del archivo) para no marcar como fallida una foto que todavía se está
  subiendo.
- **Plan 23, sello de antigüedad:** `VeteranSeal.vue` hoy NO respeta `prefers-reduced-motion`. Hay que
  agregarlo, no darlo por hecho.
- **Planes 21 y 27:** el texto "Motivo: {etiqueta}." del rechazo de foto es un supuesto registrado en
  `214-DECISIONES-AUTONOMAS.md` §5. Se usa tal cual.

## Respuesta final de cada ejecutor (máximo 12 líneas, en español)

1. Estado: COMPLETO / PARCIAL / BLOQUEADO.
2. Commits (hash corto y asunto).
3. Typecheck y lint: resultado contra la línea de base.
4. Desvíos respecto del plan y por qué.
5. Decisiones que tomó por su cuenta.
6. Lecciones para los ejecutores siguientes.

## Lecciones acumuladas

- (plan 01) Los `.env` de la API están enlazados y apuntan a `DB_HOST=localhost`.
- (plan 01) Ningún worktree con este lockfile tiene `vitest` en el admin: los tests del admin no se
  pueden correr en local.
- (plan 02) **Tests unitarios puros: correrlos con la config unitaria**, que no usa base de datos y tarda
  menos de un segundo: desde `el-templo-api`, `npx vitest run --config vitest.config.unit.ts
  test/unit/<archivo>.test.ts`. Solo incluye `test/unit/**`. Verificado: `test/unit/aura-amounts.test.ts`
  da 6 de 6 en verde.
- (plan 02) **No correr tests con la config por defecto** (`npx vitest run <archivo>` a secas): su
  `test/setup.ts` se cuelga 120 segundos provisionando la base de pruebas y deja los tests "skipped". Los
  tests de integración se escriben y se dejan para CI. Si un plan pide correr uno, se informa "queda para
  CI" y se sigue.
- (plan 02) `pnpm typecheck:tests` ya viene en rojo en este entorno (175 errores de base, en archivos
  ajenos). Se compara solo por los archivos tocados, no por el total.
- (plan 02) lint-staged no siempre reformatea: correr `npx prettier --write <archivos tocados>` antes de
  commitear.
- (plan 02) Los tests de integración que afirman montos viejos quedan rotos hasta el plan 03.
  `milestoneAura` mantiene su firma y devuelve 15 / 25 / 50. Los montos viven en
  `el-templo-api/src/modules/aura/amounts.ts`.
- (plan 03) `pnpm typecheck:tests` imprime mucho: filtrarlo con `grep` por los nombres de los archivos
  tocados. `attendance.test.ts` ya traía un TS2300 por un import duplicado: es previo, no se arregla.
- (plan 03) Quedan rotos a propósito hasta el plan 09 los tests `*-aura-cap`, `session-complete-streak` y
  las aserciones de `training_completion` en `streak-service`.
- (orquestador) **No aplicar migraciones en la base local** (`pnpm db:migrate`, `db:push`): la base local
  de Franco tiene datos de pruebas en curso. Las migraciones se escriben y se verifican por lectura y por
  su test, que corre en CI.
- (plan 04) La migración de re-valorización es la `0344_aura_revaluation.sql`. La numeración sigue desde
  la 0345 (planes 12 y 16), siempre verificando con `git fetch` que el número esté libre.
- (plan 04) En tests de integración, para sembrar `attendance` y `completed_sessions` sirve
  `app.dbPool.query` directo. `splitSqlStatements` ya saca los comentarios.
- (plan 04) El runner de migraciones saltea las sentencias que fallan con "already exists" y trata la
  migración como ya aplicada: por eso los `CREATE TABLE` de respaldo van primero.

- (plan 05) `auraAmount` se arma en `StretchCompleteView` (`stretch-service.ts`, cubre cierre nuevo y `alreadyCompleted`) y en el handler de `free-blocks-routes.ts` (schema de respuesta en `sessions/schemas.ts`). Es el monto que paga la fuente.
- (plan 06) La app debe mostrar `auraAmount` solo si `auraAwarded` es true. El estiramiento lo devuelve en `POST /sessions/stretch/complete`; `StretchTodayView` NO lo trae.
- (plan 06) En `FreeBlockPlayer.vue` el monto del resumen vive en el ref `awardedAmount`, junto a `awardedInRun`. `lastResult` es solo el último cierre y puede no haber acreditado: no sirve para la línea "Sumaste N AURA" tras "Seguir entrenando". La celebración sí usa `lastResult?.auraAmount`.
- (plan 06) Las props `auraAmount` de la app son `number | null`: sin monto del servidor no se muestra el bloque dorado, nunca un número inventado. Quedan sin tocar `onboarding/mockup.html` y `ONBOARDING_NARRATIVE_REDESIGN.md` (documentos con "+50 AURA") y `playerCuerpo.ts` (su "+5" es un músculo).
- (plan 06) El barrido de textos con `grep '\+5\b'` trae falsos positivos ajenos a Aura: revisar cada hallazgo. La rama de la 213 (app 1.9.6) sigue diciendo "+5 AURA" y habrá que alinearla al mergear.
- (plan 07) La línea de base real de `vue-tsc` del admin es 36 errores (el plan 07 citaba ~21): usar siempre la de este archivo. Control posterior del plan 07: API 0, admin 36.
- (plan 07) El selector "Descuento AURA" de `AssignPlanDialog.vue` quedó reemplazado por un comentario D-22 (con instrucciones para restaurarlo). Los envíos de `auraSpend` y sus resets a `null` siguen en el código y la API sigue aceptando el campo: no hay que tocarlos.
- (plan 07) Los defaults del asistente `ProgramWizardDialog.vue` son `auraWeeklyBonus: 8` y `auraCompletionBonus: 50` (estado inicial y reset).
- (plan 08) Funciones puras de la regla de D-20 en `sessions/proposed-time.ts` (`evaluateTrainingAura`, `proposedSecondsForSession`) y lecturas del tope del día en `aura/day-cap.ts` (`attendanceAuraOnLocalDay` con `excludeAttendanceId`, `appAuraOnLocalDay`): el plan 10 debe reusar `day-cap.ts`, no escribir otra consulta.
- (plan 08) La API no tiene script `pnpm lint`: el gate es `pnpm lint:tenant` (más prettier). `goal-plans/routes.ts` ya tenía `sessionGeneratorService`, no instanciar otro.
- (plan 08) Los tests de integración de cierre que afirman Aura con duración corta quedan rotos hasta el plan 09 (esperado). Control posterior del plan 08: API 0.
- (plan 08) La consulta 08 de calibración no se corrió: si hay muchas sesiones reales bajo el 80 %, ajustar `SECONDS_PER_REP` o `MIN_BLOCK_SECONDS` en `proposed-time.ts`.
- (plan 09) Fixture compartido `el-templo-api/test/_aura-session-fixtures.ts` (`seedSessionWithBlocks`, devuelve `proposedSec` y `proposedSecFor(roles)`; limpia con `cleanupFixtureExercises`): cualquier test que espere Aura por `/sessions/complete` o `/goal-plans/complete` necesita bloques sembrados con él y `startedAt` al 80 % del `proposedSec`.
- (plan 09) Test nuevo `complete-aura-rule.test.ts` (11 casos) nunca corrió: `test/setup.ts` se cuelga en local. Si falla en CI, mirar primero el fixture (inserts a `exercises`, `session_blocks`, `session_prescriptions`) y la creación del catálogo del plan a medida en `beforeAll`. El caso del 79 % deja 5 s de margen y depende de la latencia de `inject`.
- (plan 09) En `streak-service` y `session-complete-streak` se quitó solo la fila `training_completion` de la siembra de `aura_config` (`streak_bonus` se mantiene). `GoalPlanSession.vue` ahora usa `Date.now() - elapsedSeconds * 1000` como `startedAt` al retomar (`mode === 'resume'`).
- (plan 10) `day-cap.ts` ahora exporta también `attendanceAuraAmountFor` y `attendanceAuraCredited`. Si la asistencia no acreditó nada, `removeCheckIn` no llama a `spend`; la reversa de `spend` queda con `source_type = manual_adjustment`, por eso `attendanceAuraCredited` no la cuenta. `AURA_AMOUNTS.attendanceReversal` sigue exportado solo como referencia histórica (lo usa `test/unit/aura-amounts.test.ts`).
- (plan 10) Para el plan 11: `auraAwarded` de la asistencia puede salir 2, o 0 si no se escribe fila. Deshacer una asistencia que absorbió la app no devuelve los puntos a la app (D-68).
- (plan 10) Test nuevo `test/attendance/attendance-day-cap.test.ts` nunca corrió local (`test/setup.ts` se cuelga): si falla en CI, mirar primero el check-in forzado (sin regla de una por día) y la siembra de Aura con `AuraService.award`. `activities` no tiene `branchId` (TS2769 igual que `attendance.test.ts`). `typecheck:tests` sigue rojo por deuda ajena (264 errores).
- (plan 10) Deuda: el check-in forzado guarda la fecha en UTC y de noche puede caer en otro día que el de la app (el tope usa día local de la sede).
- (plan 11) `GET /auth/me` y el check-in ya devuelven la Aura ganada; los planes 17 y 18 deben reusar `earnedRowsFilter()` y `earnedAuraByUsers` (`el-templo-api/src/modules/aura/earned.ts`) con `tenantWhere(schema.auraTransactions, ctx)` como primer término, y `auraAwardedForReference` (tipa `sourceType` como `AuraSourceType`).
- (plan 11) Un fragmento SQL suelto que nombra columnas de una tabla gym-owned dispara `lint:tenant`: hace falta una exención de bloque `/* tenant-safe: ... */` (así quedó `earnedRowsFilter`), sin tocar `tenant-lint-allowlist.json`.
- (plan 11) Tests nuevos `test/aura/earned-aura.test.ts` y los casos agregados a `test/attendance/attendance.test.ts` nunca corrieron local (`test/setup.ts` se cuelga). Si fallan en CI, mirar primero el reloj fijo (`TODAY_REF_ID = 20260311`), `createStaffUser` con `user_branches` y `setModuleFlag` del gimnasio 2. `typecheck:tests` sigue rojo por deuda ajena (18 discrepancias de base). Control posterior del plan 11: API 0.
- (plan 12) Migraciones 0345 (`profile_photo` al final de los dos enums de Aura y fila de `aura_config` en 5) y 0346 (tabla `member_photos`, 3 FK nombradas, 2 índices, sin UNIQUE). Tipos exportados por `member-photos.ts`: `MemberPhotoOrigin`, `PhotoRejectionReason`, `MemberPhotoStatus`, `MemberPhotoRow`, `NewMemberPhotoRow`. El otorgamiento usa `AURA_AMOUNTS.profilePhoto` (5), no la fila de `aura_config`.
- (plan 12) Para el plan 14: la invariante de una `pendiente` y una `aprobada` por persona y origen no tiene UNIQUE, hay que imponerla en el servicio con `SELECT ... FOR UPDATE`; el segundo reporte de la misma persona se rechaza mirando `reporter_ids`.
- (plan 12) `member_photos` es gym-owned strict (`GYM_OWNED_TABLES` 136, `schemaTables.size` 141, `gymOwnedChecked` 136 en los tests 0192-0195 y 0196). Si CI falla en tenancy, mirar primero esos conteos y el orden de borrado en `test/helpers.ts` y `limpiarSegundoGimnasio` (`memberPhotos` antes de `users`).
- (plan 12) El test `0345-0346-profile-photo.test.ts` valida la fila `profile_photo` con un guard estático sobre el SQL, no contra la fila viva (otros tests borran `aura_config`). Nunca corrió local. Control posterior del plan 12: API 0, `lint:tenant` 0 discrepancias.
- (plan 13) Tienda privada: `AVATAR_KEY_PREFIX`, `privateAvatarKey`, `isOwnAvatarKey`, `fichaMirrorKey`, `publicKeyFromFichaUrl`, `stableHourlySigningDate` y `presignGet(key, exp, { stableHourly: true })` en `conquer/private-media.ts`; `PrivateMediaStore` suma `copyFromPublic` y `removePublic` (el doble `mockPrivateMedia` ya los trae). Las claves y `isOwnAvatarKey` exigen `JWT_SECRET` (en tests unitarios, `vi.stubEnv`).
- (plan 13) El espejo vive en `members/ficha-photo-mirror.ts` (`mirrorFichaPhotos(fastify, ctx, { limit, now })`) y el job en `jobs/ficha-photo-mirror.ts` (`startFichaPhotoMirrorJob(app)`, recibe `app` y no `app.db`). Ignora `photo_url` de menos de 15 min (cuenta `skipped`, sin fila). Nuevo job = actualizar la lista y el título "N jobs" de CON-04. Tests `ficha-photo-mirror.test.ts` y CON-04 nunca corrieron local; control posterior del plan 13: API 0, `lint:tenant` 0.
- (plan 13) Para firmar cualquier avatar (plan 14 en adelante) usar `presignGet(key, exp, { stableHourly: true })`: así la URL no cambia dentro de la hora y el caché del navegador sirve. Sin tenant ni `ctx` no se puede derivar la clave: `JWT_SECRET` es obligatorio.
- (plan 13) Sin verificar que R2 admita `CopyObject` entre el bucket público y el privado: si en staging todas las fotos de ficha quedan `fallida`, mirar primero `copyFromPublic`. Una `photo_url` sin timestamp legible no se trata como nueva: se procesa y queda `fallida`.
- (plan 14) Foto propia: `members/profile-photo-service.ts`, `profile-photo-routes.ts`, `profile-photo-schemas.ts` (ruta registrada en `app.ts`, tope de reportes en `shared/rate-limits.ts`). Para el plan 15: `removeCommunityPhoto(..., removedBy | null)` y `resolveCommunityPhotos(..., { expiresSec })` que devuelve `Map<userId, { url, photoId }>`; sin storage devuelve Map vacío con un solo warn. Errores con `code` (`FOTO_PERFIL_NO_DISPONIBLE`, `FOTO_PERFIL_YA_PROCESADA` 409) salen por `sendPhotoError` local, porque `handleServiceError` descarta el `code`.
- (plan 14) El servidor NO recodifica el JPEG (EXIF/GPS, D-39): la app debe recodificarlo por canvas antes de subir. `ENTRADAS_BASELINE` del manifiesto pasó de 577 a 581 (conteo real: 576 claves `METODO /` más `OPTIONS *`); cada ruta nueva lo mueve.
- (plan 14) `profile-photo.test.ts` (30 `it`) nunca corrió local. Barre el id con `ALTER TABLE users AUTO_INCREMENT = 54321` vía `app.dbPool.query`: si el sentinel de tenancy lo objeta en CI, sembrar un id grande a mano. `pnpm typecheck:tests` está en rojo por deuda ajena: comparar por archivos tocados, no por total. Control posterior del plan 14: API 0, `lint:tenant` 0.
- (plan 15) Revisión por el staff: cola en `GET /api/admin/members/profile-photos` (`items[].url` firmada 2 h, `counts.pending` y `counts.reported` sobre el conjunto completo, no el tope de 100); aprobar y rechazar resuelven el socio vivo dentro del servicio (`assertLiveMember`), solo `DELETE` lo hace en el handler. `sendPhotoError` se exporta desde `profile-photo-routes.ts`; helpers de test compartidos en `test/members/_profile-photo-helpers.ts`; `removeCommunityPhoto` usa un `tryResolveStore` común.
- (plan 15) `/me` devuelve `photo.rejectionReason` como código (`sin_cara`, `no_es_propia`, `contenido`, `otro`): las apps arman "Motivo: {etiqueta}." (planes 21 y 27). En `/me`, `pendiente` gana sobre todo y `rechazada` gana si la fila `alumno` más reciente lo está. Cola vacía responde 200 sin tocar el storage; con filas y sin R2, 503.
- (plan 15) Trampa de tenancy: `lint:tenant` exige `tenantWhere` literal dentro de cada `.where(...)`; una variable `scope` compartida no cuenta (dio 5 discrepancias). El push de rechazo necesita token de dispositivo (`NotificationService.registerToken`) y la categoría `anuncios` activa. `ENTRADAS_BASELINE` 585 y `CASOS_BASELINE` de members 42.
- (plan 15) Tests `profile-photo-admin.test.ts` (22 `it`) e ISO-03 (8 `it` nuevos) nunca corrieron local. El test de `admin_sede` deja la sede B sembrada, igual que `admin-sede-scope.test.ts`. Control posterior del plan 15: API 0, `lint:tenant` 0.
- (plan 16) Migración 0347 (`community_visible` y `community_notice_seen_at` en `member_profiles`); la siguiente libre es la **0348**. Reglas puras en `scheduling/community-visibility.ts` (`isMinor`, `effectiveVisible`); `getViewerCommunityState` devuelve también `preference`, `branchId` y `branchCountry`. Para el plan 17: `listAccess({ isStaff, hasPlanInEffect, viewerVisible: state.visible })`; para filtrar a los demás anotados aplicar `effectiveVisible` con el `dateOfBirth`, el país y la zona de la sede de cada uno.
- (plan 16) Baselines que se mueven con cada ruta: `ENTRADAS_BASELINE` 585 a 587 y `CASOS_BASELINE` (subs+sched) 74 a 76; hay que cambiar también el título del `it` "las 76 rutas".
- (plan 16) Fastify usa `removeAdditional` por defecto: `additionalProperties: false` NO devuelve 400, descarta el campo y responde 200 (los tests deben afirmar que el campo extra se ignora). `branches` no se limpia en `cleanAllTestData`: los tests que crean una sede la borran en `afterAll`.
- (plan 16) `npx prettier --write` sobre una carpeta entera reformatea archivos ajenos: pasarle solo las rutas tocadas. Tests de integración y migración 0347 nunca corrieron local. Control posterior del plan 16: API 0, `lint:tenant` 0.
- (plan 17) Anotados del horario: `countSlotBookings` y `vigentSlotBookingCondition` (en el servicio de anotados) son la única definición de "reserva vigente" para los números; el helper lleva exención `/* tenant-safe */` y NO `tenantWhere`: cada sitio lo escribe literal en su `.where()`. Plan 18: reusar `earnedRowsFilter`/`earnedAuraByUsers`.
- (plan 17) Tope por usuario con `preHandler: fastify.rateLimit({... keyGenerator })` (`@fastify/rate-limit` 11.2.0 lo expone) y tope por IP en `config`. `ENTRADAS_BASELINE` 587 a 588 y `CASOS_BASELINE` 76 a 77.
- (plan 17) `attendees.test.ts` (26 `it`) e ISO-03 (2 `it`) nunca corrieron local. Si CI falla, mirar primero la siembra: plan creado en `beforeEach` tras `cleanAllTestData`, horario de hoy con `dowInTz` de la sede, y el caso de ids con `ALTER TABLE users AUTO_INCREMENT = 54321`. `firstName` es nullable en `users` y la salida lo normaliza a `""`. Control posterior del plan 17: API 0, `lint:tenant` 0.
- (plan 18) Detalle privado de Aura: ruta `GET /api/members/aura/movements` (`aura/member-routes.ts`, esquemas en `member-schemas.ts`, textos fijos en `aura/movement-labels.ts`, registrada en `aura/module.ts`). Respuesta `{ earned, movements[{id, amount, label, createdAt}], nextBefore }`; "Ver más" repite con `?before=<nextBefore>`. `ENTRADAS_BASELINE` 588 a 589.
- (plan 18) Si `/me` trae `auraEarned: null`, la app NO debe llamar a la ruta: con el módulo apagado devuelve el 404 del guard. `?userId=` se ignora (Fastify descarta el campo, responde 200 con el detalle del propio token).
- (plan 18) Los textos fijos van en un `Map` (una fuente llamada `constructor` no devuelve una función). Tests de integración (11 `it` + 2 de MOD-01) nunca corrieron local; ids de test sembrados con `INSERT` directo vía `tenantValues`. Control posterior del plan 18: API 0, `lint:tenant` 0.
- (plan 19) App: los formateadores puros (`formatTenure`, `formatAura` con miles "1.240" por regex, fecha de movimientos con tablas propias de días y meses) tienen tests `tenure.test.ts` y `aura-format.test.ts`; los planes 20 y 21 los importan en vez de usar `Intl`. Las fechas de movimientos usan `profile.branchTimezone ?? DEFAULT_BRANCH_TZ`.
- (plan 19) Store de auth: `fetchProfile()` privado es la única llamada a `/auth/me` (la usan `retryProfileLoad` y `refreshProfile`). Las acciones nuevas (`setPhotoState`, etc.) solo actúan si ya hay perfil; `setPhotoState` mantiene `photoUrl` igual a `photo.url`. `auraVisible` es false con `auraEarned` null o undefined: no llamar a `getMovements` en ese caso.
- (plan 19) Tests puros de la app: `timeout 300 pnpm exec vitest run <archivo>` (menos de 1 s). Control posterior del plan 19: API 0, app 21 (igual a la base), sin cambios en dependencias.
- (plan 20) App, foto: `utils/avatar-image.ts` (recorte cuadrado, errores con código `DECODE`/`PERMISSION`/`PUT`), `utils/photo-messages.ts` (textos) y `composables/useProfilePhoto.ts`. La hoja del plan 21 usa `isNative`, `previewUrl`, `error`, `discard()` y `cleanup()`; los `pickFrom*` devuelven `true` si hay foto preparada y `false` si se canceló sin error. El plan 27 arma "Motivo: {etiqueta}." con `rejectionReasonLabel`.
- (plan 20) Trampa: los verify buscan `CameraSource.Prompt` con `grep`, ni los comentarios pueden nombrarlo. `upload()` fija un estado `pendiente` provisional y luego llama a `refreshProfile()`; el PUT tiene timeout de 90 s y `cleanup()` lo aborta.
- (plan 20) Se tocó `Info.plist` de iOS: exige binario nuevo (D-35), no se generó build. La prueba de EXIF y GPS en iOS queda para el UAT (plan 32). Control posterior del plan 20: API 0, app 21 (igual a la base), sin cambios en dependencias.
- (plan 21) App, componentes nuevos: `MemberAvatar.vue` (no es botón: el plan 23 y el 27 lo envuelven en un `<button>` con `aria-label` y escuchan `image-error` para volver a pedir `/me` una vez), `PhotoRulesDialog.vue` y `ProfilePhotoSheet.vue` (se abre con `v-model`, limpia su propio estado al cerrarse). Tokens de Aura en `css/_premium-card.scss`.
- (plan 21) Uso: `ring="gold"` solo en la ficha de Aura; la insignia `camera` solo en Perfil. El mixin `pd-aura-frame` es un degradé decorativo: va en el borde, nunca detrás de un texto. El aro blanco de `MemberAvatar` tiene valores inventados (el UI-SPEC no los da): revisar en el plan 23.
- (plan 21) La hoja emite `cancel` al cerrar las normas con cualquier cosa distinta de "Acepto, elegir foto"; "Elegir otra" reabre las normas con la última fuente usada (cada subida pasa por D-50). Errores de subida por notify negative; no se enganchó el botón "atrás" de Android.
- (plan 21) Prettier reformatea los archivos nuevos tras escribirlos: correrlo antes de commitear. Control posterior del plan 21: API 0, app 21 (igual a la base), sin cambios en dependencias.
- (plan 22) App: `components/AuraDetailSheet.vue`, se usa `<AuraDetailSheet v-model="open" />` (pide la primera página al abrir y reinicia su estado). Los planes 23 y 27 la abren solo cuando `/me` trae `auraEarned` distinto de null. Un 404 del módulo cierra la hoja sin mensaje (detección con `axios.isAxiosError`, como `ReservasPage`).
- (plan 22) Trampas de estilo: `mt-block-title` está en `css/_brand.scss`, no en `_premium-card.scss`: importar los dos. El borde `#f1eadf` de las filas y el `#d9cfc1` de la agarradera son literales del UI-SPEC, no tokens. Prettier reformatea el archivo tras escribirlo: correrlo antes de commitear.
- (plan 22) Engancha el botón "atrás" de Android con `useBackButtonClose` (como `SponsorSheet`); un contador `requestSeq` descarta respuestas tardías. El componente nunca se compiló ni se probó renderizado (sin SCSS compilado). Control posterior del plan 22: API 0, app 21 (igual a la base), sin cambios en dependencias.
- (plan 23) App: `MiTemploHeader.vue` ya compone `MemberAvatar`, `ProfilePhotoSheet` y `AuraDetailSheet` con `v-model` (el plan 27 copia ese patrón); el contenedor de escritorio es `.mi-templo-header-wrap` y el degradé lo pone `.mth`. `HeaderLevelDropdown.vue` ya no se importa en ningún lado y usa clases `header-greeting__*` que ya no existen: el plan 24 debe reimportarlo y darle estilo propio.
- (plan 23) Trampas: el marcador azul de staging en `css/app.scss` ahora apunta a `.mth` (antes `.header-greeting`). `VeteranSeal.vue` pinta el logo terracota con `logo.webp` como máscara CSS y ya respeta `prefers-reduced-motion`. El nombre es `firstName ?? "Atleta"` (sin fallback a `displayName`). Prettier también reformatea `app.scss`: correrlo solo sobre las rutas tocadas.
- (plan 23) Pendiente para el UAT del plan 32: verificar el desborde del encabezado a 360, 390 y 412 px (no se vio renderizado). Control posterior del plan 23: API 0, app 20 (base 21, sin errores nuevos), sin cambios en dependencias.
- (plan 24) App: `HeaderLevelDropdown variant="bar" | "light"` (default `bar`), clases propias `level-trigger*`; `pd-hit-44` es un MIXIN (`@include`), no una clase. Se muestra con `route.name === 'training'` (barra de celular, `MainLayout`) y en escritorio en `EntrenarView` (`isDesktop` = ancho >= 768). Con selector visible y < 420 px el título se oculta y el logo es `router-link` a Mi Templo.
- (plan 24) Pendiente para el UAT del plan 32: ver la barra a 360 y 390 px (no se vio renderizada) y que la pastilla no tape la vidriera de quien no tiene plan. Control posterior del plan 24: API 0, app 20 (base 21, sin errores nuevos), sin cambios en dependencias.
- (plan 24) Trampa: Quasar solo abre `q-menu` con clic, así que para que Enter y Espacio abran el selector de nivel hace falta el ref (`menuRef.toggle()`); el glifo no fija `font-family`. Redirigir salidas de comandos siempre al scratchpad, nunca al home ni al repo; el `.tsv` de `consultas/` sigue sin trackear y sin commitear.
