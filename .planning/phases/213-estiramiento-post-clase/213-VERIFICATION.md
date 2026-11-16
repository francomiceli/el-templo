---
phase: 213-estiramiento-post-clase
verified: 2026-11-11T17:45:00Z
status: human_needed
score: 9/9 must-haves verified en código (SC-5 y SC-6 con tramo físico pendiente de UAT; SC-9 depende de CI)
overrides_applied: 0
gaps: []
human_verification:
  - test: "CI verde en el push de la fase (stretch-today, stretch-complete, iso-03-stretch, stretch-push-timing, stretch-push-decisions, 0340-stretch, 0342-aura-source-stretch, iso-01-manifiesto, conteos de tenancy, custom-rules, destinations*)"
    expected: "Todos los tests de integración pasan contra MySQL real"
    why_human: "No hay MySQL local; los corre CI. SC-9 depende de esto."
  - test: "Tocar el push con la app cerrada, con y sin sesión, en iOS y en Android (213-UAT.md grupo 6, casos 1 a 5)"
    expected: "Abre el player (tras el login si hace falta); vencida el día siguiente avisa y vuelve a Mi Templo"
    why_human: "Depende del plugin nativo y del arranque en frío en teléfono real (SC-6)."
  - test: "Prender stretch_followup en Comunicaciones de staging y recibir el push real en un teléfono (grupo 6)"
    expected: "Sale a fin + 30/60 con tope 21:30, con el texto editado, y la plantilla nace apagada"
    why_human: "FCM/APNs reales y estado de plantilla en base (SC-5)."
  - test: "Un profe hace la rutina completa en el teléfono (grupo 5) y se lee el reloj con las manos ocupadas (grupo 4)"
    expected: "Los estiramientos son suaves, los lados son correctos y el reloj se lee a distancia"
    why_human: "Juicio humano sobre la lista curada sin kinesiólogo y sobre la usabilidad del reloj."
  - test: "Abrir sketch-reloj/index.html y confirmar la opción B o pedir la A (grupo 2)"
    expected: "Franco confirma el reloj por ejercicio"
    why_human: "Decisión de diseño; el ejecutor no tenía navegador."
  - test: "Decisiones de Franco del grupo 11 de 213-UAT.md (desvío de D-12 con sección curada estirar, plantilla apagada de origen, pill sin minutos/RPE, 'terminar igual', started fire-and-forget)"
    expected: "Franco confirma o pide otra cosa"
    why_human: "Decisiones de producto."
  - test: "Libre sin regresión con FREE_BLOCKS_ENABLED=true en un build local (grupo 8)"
    expected: "Libre se comporta igual que antes del refactor"
    why_human: "FreeBlockPlayer.vue (la página) no tiene test propio; los tests de caracterización cubren las capas de abajo (SC-4)."
---

# Fase 213: Estiramiento post-clase. Informe de verificación

**Objetivo:** Después de la clase presencial, el alumno puede hacer desde Mi Templo una sesión de estiramiento de 5 a 8 minutos armada con la movilidad de la sesión de ese día, y un push lo invita y lo lleva directo al player.
**Rama:** `feat/estiramiento-post-clase` (worktree `et-estiramiento`), HEAD `cb0f533d8`, 71 archivos de código/tests contra `origin/master`.
**Estado:** human_needed. Sin gaps reales: el código existe, está cableado y los tests que se pueden correr localmente pasan. Lo que queda es CI, teléfono y decisiones de Franco (todo ya listado en `213-UAT.md`).
**Re-verificación:** No, verificación inicial.

## Corridas propias (no se confía en los SUMMARY)

| Comprobación | Comando | Resultado |
|---|---|---|
| Regla de selección | vitest (config pura) `test/sessions/stretch-selection.test.ts` | 43/43 verdes |
| Reglas de tiempo/grupo/tope | vitest (config de timing) `test/sessions/stretch-timing.test.ts` | 71/71 verdes |
| Gates de tenancy y destinos (puros) | `test/db/tenant-tables.test.ts` + `test/communications/destinations-sync.test.ts` | 24/24 verdes |
| Typecheck API | `npx tsc --noEmit` | solo los 3 errores preexistentes de `src/app.ts` (rate-limit, `_request`, `context`) |
| App: training, store, card, boot | `npx vitest run src/modules/training src/stores/__tests__/stretch-store.test.ts src/modules/progression/utils/__tests__/today-card.test.ts src/boot/__tests__` | 34 archivos, 662 tests verdes |
| Marcadores de deuda (TBD/FIXME/XXX/TODO/HACK), `console.*`, `any` en archivos de código tocados | grep | 0 hallazgos (las coincidencias de "TODOS" son texto en castellano) |
| Bump de versión / archivos fuera de las 3 apps | `git diff --name-only` | ninguno |

No corrieron (requieren MySQL): `stretch-today`, `stretch-complete`, `iso-03-stretch`, `stretch-push-timing`, `stretch-push-decisions`, `0340-stretch`, `0342-aura-source-stretch`. Se verificaron leyendo test y código.

## Verdad por success criterion

### SC-1: regla pura, determinística, tabla de referencia, solo `stretch_catalog` — VERIFICADO

- Función pura sin DB, sin reloj, sin azar: `el-templo-api/src/modules/sessions/stretch-selection.ts:155` (`seleccionarEstiramientos`), recibe `catalogo` por parámetro; no copia entradas.
- El servicio arma el catálogo SOLO desde `stretch_catalog` activo y con `tenantWhere`: `stretch-service.ts:405-423`, y lo pasa en `:447`. Catálogo vacío devuelve null (sin oferta).
- La tabla de referencia del SPEC §4.1 (11 sesiones + sábado ROM) está transcrita y asertada: `test/sessions/stretch-selection.test.ts:242-363` (esperado) y `:418-440` (`it.each` sobre ejercicios, orden, lados, duración y familias). Comparé las 11 filas con `213-SPEC.md` líneas 332-345: coinciden (6:50/6:05/5:20/7:35).
- Casos extra del §5.2: sin familias `:517`, recorte a 8 min `:687`, completado a 5 min `:696`, catálogo agotado sin repetir `:704`, determinismo `:721`, ROM `:485`.
- La lista curada: 20 filas, ids y nombres iguales al SPEC, en `src/db/migrations/0341_stretch_catalog_seed.sql` (con guarda `id AND nombre` en cada INSERT).

### SC-2: card muestra "Estirar" solo tras la clase, nunca en ROM — VERIFICADO (tramo en teléfono en UAT grupo 3)

- Servidor (fuente de verdad): `stretch-service.ts:187-248` `findEligibleAttendance` exige asistencia con `schedule_id`, actividad General no especial (`:236`, `isGenericClassActivity`) y `classEndAt <= now` (`:242`, hora de la sede vía `buildClassDateTime`). ROM: `modoOfreceEstiramiento` en `:339` (`stretch-selection.ts:127`) devuelve null, sin fila.
- Card: `el-templo-app/src/modules/progression/utils/today-card.ts:554-571` (`withStretch`) pone "Estirar" como principal solo con asistencia registrada, `windowState` distinto de before/open y kind `presencial-turno`/`completada`; el principal anterior baja a `secondary`; `done` cambia a "Clase y estiramiento hechos". `resolveTodayCard` lo aplica último.
- Cableado: `MiTemplo.vue` pasa `stretchStore.cardInput` a la card y llama `stretchStore.load()` sin await; `MainLayout.vue` refresca al registrar asistencia, al volver a primer plano y al cambiar de zona. El store es fail-open y descarta datos de otro día (`useStretchStore.ts:56-83`).
- Tests: today-card `:1975` (Estirar principal), `:2018`, `:2032` (nunca antes ni durante), `:2044` (sin asistencia), `:2230` (matriz + alto fijo); API `stretch-today.test.ts` (b) durante la clase, (c) reserva sin check-in, (d) Wellhub, (e1/e2) Open Gym/Yoga, (f) ROM, (n) Madrid.

### SC-3: el player reproduce la rutina; completar no toca `completed_sessions`/racha/RPE y da +5 AURA una vez por día — VERIFICADO

- Player: `StretchPlayer.vue` carga la oferta de `GET /sessions/stretch/today` (`useStretchStore.ts:64`), arma la Session sintética (`utils/stretchSession.ts`) y la reproduce con `StretchClock` + `BlockProgressionView`; ruta `training/estirar` en `modules/training/routes.ts` (sin flag de build).
- Cierre en `POST /sessions/stretch/complete` (`useStretchCompletion.ts:63`), nunca `/sessions/complete`. En el servidor, `stretch-service.ts:651-790`: la duración sale de `started_at` y `now` del servidor (`:692-696`), el AURA exige todos los ejercicios marcados y `>= 180 s` (`:79`, `:736-737`), y se acredita con `awardOncePerLocalDay` fuente `stretch` (`:739`). Las únicas escrituras son a `stretch_offers` y al ledger de AURA.
- Fuente AURA nueva: `aura/types.ts` + `migrations/0342_aura_source_stretch.sql` + `db/schema/aura-config.ts`/`aura-transactions.ts`.
- Tests (CI): `stretch-complete.test.ts` (b) invariantes (cuenta `completed_sessions`, racha 3/5 y `post_session_soreness` antes y después), (a) +5, (c) 2 min sin AURA, (d) un ejercicio sin marcar sin AURA, (e) segundo complete idempotente, (f) reabrir y completar no acredita otra, (g) oferta de ayer da 410.

### SC-4: `FreeBlockPlayer` y el player de estiramiento comparten abstracción; Libre igual (caracterización) — VERIFICADO (UAT grupo 8 para la página)

- Abstracción: `modules/training/composables/useSingleBlockPlayer.ts:60`; la usan `FreeBlockPlayer.vue:168` y `StretchPlayer.vue:179` (únicos consumidores).
- La extracción es real: el diff de `FreeBlockPlayer.vue` borra 147 líneas de mecánica (stage, createPlayer, beginBlock, completeBlock, restart, leaveWithoutSaving) y las delega, conservando los diálogos, el guardado en `/sessions/free-blocks/complete` y los textos. Revisé el diff completo: la lógica de "Reiniciar", "Seguir entrenando", reintento con reloj y guard de salida se conserva.
- Orden TDD correcto: los tests de caracterización (`1e292b4a3`: `useSessionPlayer.freeBlock.test.ts` y `useFreeBlockCompletion.test.ts`) preceden a la extracción (`b1ac9ae52`, `f054d2196`). Además `useSingleBlockPlayer.test.ts` (16 tests). Todos pasan hoy.
- Observación (warning bajo): el archivo de la página `FreeBlockPlayer.vue` no tiene test propio (ya no lo tenía antes); la equivalencia de la página se apoya en el diff revisado más los tests de las capas inferiores. Por eso queda el grupo 8 del UAT.

### SC-5: push "¿Estiraste?" con momento, tope, "ya empezó" y texto editable — VERIFICADO (envío real en UAT grupo 6)

- Momento: `stretch-timing.ts:81-112` `computeStretchPushAt` (fin + 30/60, tope 21:30 hora de la sede, adelanto solo con 15 min de margen, nunca al día siguiente, 08:00 para clases muy tempranas); `:114` ventana `fin <= ahora < fin + 120`; `:70` grupos por crc32 (`stretch-v1:`).
- Tope de frecuencia: `:126` `decideFrequencyBlock` (3 en 7 días y pausa de 14 días tras 4 sin abrir).
- Orquestación y motivos: `stretch-push.ts:336` `runStretchPushForTenant`: control, `fuera_de_horario`, `ya_empezo` (`:452`), `plantilla_apagada`, `sin_token`, `categoria_apagada`, tope/pausa, reclamo atómico, encolado SIN `titleOverride`/`bodyOverride` ni `booking_id` (`:509-513`), reconciliación contra la cola antes de la purga.
- Cron: paso dentro del tick existente `notification-cron.ts` (sin `cron.schedule` nuevo), aislado con try/catch.
- Plantilla: `notifications/types.ts:339` `stretch_followup` (categoría `entrenamiento`, texto de D-12, `enabledAtSeed: false`); `service.ts` permite nacer apagada. El PUT de plantillas deriva `route` del destino (`notifications/routes.ts:715-731`), por eso el desvío a sección curada `estirar` sobrevive a la edición (desvío documentado en UAT §11).
- Admin: texto del disparador y audiencia de `stretch_followup` (`rule-triggers.ts`, `system-audiences.ts`).
- Tests (CI): `stretch-push-timing.test.ts` casos 1-16 (20:00-21:00 a las 21:30 y nunca a las 22:00, 21-22 sin push, Madrid/Buenos Aires, no_show/cancelado, Wellhub, +40 min, +3 h, dos clases, ROM, técnica, combos, Open Gym, `class_reminder` previo, dos ticks, control); `stretch-push-decisions.test.ts` casos 1-10 (sin token, categoría apagada, ya empezó/completó, plantilla apagada, texto editado `(4b)`, tope y pausa, reconciliación, segundo gimnasio).

### SC-6: tocar el push abre el player con la app cerrada, también pasando por login — VERIFICADO en código; FÍSICO = UAT

- `boot/push-notifications.ts:76` `applyTapNavigation`/`decideTapNavigation`: sin sesión guarda el destino (`setPendingRoute`) y va al login; con sesión navega directo; si un guard termina en login, guarda el destino. Invocada en `:167` con `useAuthStore().isAuthenticated`. `MiTemplo.vue:604` consume el destino pendiente tras el login. El boot `auth` corre antes que `push-notifications` (`quasar.config.ts`).
- Destino `estirar` en los 3 espejos (API `communications/destinations.ts`, app `config/destinations.ts`, admin `config/destinations.ts`; `destinations-sync` pasa) y `appSectionForRoute('/training/estirar?from=push') = 'estirar'`.
- Tests: `boot/__tests__/push-tap.test.ts` (13) y `push-destination.test.ts` pasan.
- No verificable sin teléfono: que el plugin nativo retenga el toque en arranque en frío y lo entregue al listener (iOS y Android). Está en UAT grupo 6 (casos 1-3).

### SC-7: grupo fijo por alumno y `stretch_offers` con el embudo completo — VERIFICADO

- Grupo: `stretchArm(userId)` (`stretch-timing.ts:70`), fijado al crear la fila (`stretch-service.ts:498-512`, control nace con `push_decision = 'control'`). Test `stretch-today (a2)`.
- Embudo por alumno y día: `0340_stretch_tables.sql` (unique `(tenant_id, user_id, local_date)`; columnas `arm`, `card_seen_at`, `push_decision`, `push_queued_at`, `pending_notification_id`, `push_sent_at`, `push_opened_at`, `started_at`, `started_from`, `completed_at`, `duration_seconds`, `exercises_completed`, `aura_awarded`). Eventos idempotentes en `stretch-service.ts:556+` y `POST /stretch/events` (`stretch-routes.ts`); `card_seen` y `started` los manda la app (`useStretchStore.ts:94`, `StretchPlayer.vue` onMounted); `push_opened` viaja con `?from=push`.
- Medición: `consultas/20_medicion_4_semanas.sql` (UAT grupo 10).

### SC-8: gimnasio sin `templo-training` no recibe ofertas, filas ni pushes — VERIFICADO (CI para la ejecución)

- Rutas: `stretchRoutes` se registra dentro de `sessionRoutes` (`sessions/routes.ts:75`), y `sessionsPlugin` va envuelto en `moduleScope(app, "templo-training", …)` (`app.ts:~210`). Las 3 rutas están en `TENANT_MANIFEST` con categoría `templo-module` (`test/tenant-manifest.ts`).
- Job: `stretch-push.ts:345` sale primero si `isModuleEnabled(ctx.tenantId, "templo-training", db)` es falso.
- Tests (CI): `iso-03-stretch.test.ts` (404 del guard en today, complete y events con el módulo apagado; aislamiento entre gimnasios en ambos sentidos); `stretch-push-decisions (8)` (ni filas ni pushes). Tablas con tenant desde el día 1 (`tenant-tables.ts`, `TENANT_STRICT_MODULES.stretch`); todas las consultas con `tenantWhere`.

### SC-9: tests de integración con reloj fijo cubren los casos del SPEC §5.2 — VERIFICADO por lectura; ejecución = CI

Mapeo de los 21 casos de la tabla del §5.2:

| Caso del SPEC | Test |
|---|---|
| Clase 20-21, push a las 21:30 y no a las 22:00 | push-timing (1), (2) |
| Clase 21-22: sin push, card sí ofrece | push-timing (3) |
| Toque después de medianoche: oferta vencida, no se crea otra | complete (g), (l); today (l) |
| Barcelona y Argentina en el mismo tick | push-timing (4) |
| `no_show`/`cancelado` sin asistencia | push-timing (5); today (c) |
| Wellhub sin `schedule_id` | push-timing (6); today (d) |
| Manual +40 min: push; +3 h: sin push, card sí | push-timing (7), (8) |
| Sin token / categoría apagada | decisions (1), (2) |
| Ya empezó o completó | decisions (3a), (3b) |
| Cuarta asistencia en 7 días | decisions (5), (5b), (5c), (6a), (6b) |
| Dos clases el mismo día | push-timing (9); today (i) |
| ROM / técnica / combos | push-timing (10), (11), (12); today (f), (g), (h) |
| Open Gym | push-timing (13); today (e1) |
| Plantilla apagada | decisions (4) |
| Segundo gimnasio sin módulo | decisions (8); iso-03 |
| `class_reminder` ya encolado | push-timing (14) |
| Completar: sin `completed_sessions`, racha, soreness; AURA una vez | complete (b), (e), (f) |

Los tests usan reloj relativo (`avanzar`, saltos relativos) y no ids de `users` fijos; no hay `console.*` ni `any`. No pude correrlos: hay que esperar CI.

## Decisiones D-01..D-16

Todas reflejadas en el código: D-01/D-02 (lista curada en tabla, `0341`), D-03/D-04 (rutas TS y PL→FL en `stretch-selection.ts`), D-05 (dosis fija, constantes), D-06 (`modoOfreceEstiramiento`: regular/combos/técnica sí, ROM no), D-07 (abstracción compartida), D-08 (+5 AURA, ≥3 min, duración del servidor), D-09 (`withStretch`, sin `kind` nuevo), D-10/D-11 (timing y motivos), D-12 (plantilla en `TEMPLATE_SEEDS` sin overrides; desvío aceptado y documentado: sección `estirar` en vez de solo `route`), D-13 (sin flag, módulo por scope), D-14 (paso en el tick existente), D-15/D-16 (una tabla, crc32). Fuera de alcance respetado: `DayPlayer`, `completed_sessions`, `POST /sessions/complete` y `GoalPlanSession` no tocados; sin bump de versión.

## Artefactos y cableado (niveles 1-4)

| Artefacto | Estado | Detalle |
|---|---|---|
| `stretch-selection.ts`, `stretch-timing.ts` | VERIFICADO | Puros, testeados, usados por servicio y job |
| `stretch-service.ts`, `stretch-routes.ts`, `stretch-schemas.ts` | VERIFICADO | Registrados en `sessions/routes.ts:75`, manifiesto actualizado, datos reales (consultas reales con `tenantWhere`) |
| `stretch-push.ts` | VERIFICADO | Llamado desde `notification-cron.ts`, consultas reales |
| Migraciones 0340/0341/0342 | VERIFICADO | Master está en 0330; sin colisión (re-chequear al mezclar, UAT §11) |
| `useStretchStore`, `useStretchCompletion` | VERIFICADO | Pegan a endpoints reales; store fail-open |
| `StretchPlayer`, `StretchClock`, `StretchDone` | VERIFICADO | Ruta registrada, textos propios vía prop `copy` opcional |
| Card (`today-card.ts`, `MiTemplo.vue`, `MainLayout.vue`) | VERIFICADO | Datos fluyen del endpoint al store a la card |
| Deep link (`push-notifications.ts`, destinos x3) | VERIFICADO en código | Falta prueba en dispositivo |

## Anti-patrones

Ninguno bloqueante. Sin TBD/FIXME/XXX, sin `console.*`, sin `any`, sin retornos vacíos que lleguen a pantalla.

## Gaps

Ninguno que exija otro plan. Observaciones menores, no bloqueantes:

1. `.planning/ROADMAP.md` sección 213 dice "Plans: 10/13 plans executed" aunque los 13 están tildados (texto desactualizado).
2. La equivalencia de la página `FreeBlockPlayer.vue` tras el refactor se apoya en tests de las capas inferiores y en revisión del diff; la página no tiene test propio (grupo 8 del UAT).
3. El evento `started` es fire-and-forget: si falla la red, el estiramiento se completa sin AURA (documentado en UAT grupo 4 para que Franco lo acepte).

## Resumen

El objetivo está logrado en el código: la regla pura produce exactamente la tabla de referencia, el servidor ofrece la rutina solo tras la clase y fuera de ROM, el player la reproduce sin tocar racha ni `completed_sessions`, la AURA se acredita una vez por día con duración medida en servidor, el push vive en el tick existente con todos los motivos, el tope y el texto editable, el deep link cubre arranque sin sesión, y el módulo `templo-training` lo gobierna todo. Falta, por naturaleza, CI (tests de integración con MySQL), prueba en teléfono (SC-6, envío real de SC-5), la rutina de un profe, el sketch del reloj y las decisiones del grupo 11: por eso `human_needed`.

---

_Verificado: 2026-11-11_
_Verificador: Claude (gsd-verifier)_
