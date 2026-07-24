---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 05
subsystem: api
tags: [tv, roster, timezone, drizzle, vitest, expire-on-read, dry]

# Dependency graph
requires:
  - phase: 164-01
    provides: "tv_class_state (class_date, block_role, level, timers fsp 3) + tv_devices"
  - phase: 164-02
    provides: "Contrato TvPollResponse/TvControlState + toTimerSpec"
  - phase: 164-03
    provides: "Scope autenticado por device donde el plan 164-08 cuelga el poll"
provides:
  - "shared/week-dates.ts: dateToWeekNumber / dateToDayName compartidos (una sola copia en el backend)"
  - "tv/roster.ts: orden canonico REGULAR_ROLES / ROM_ROLES, INITIUM determinista, findBlock con alias ATHLOS, titulos de bloque"
  - "tv/class-day.ts: resolveClassDay(db, branch, now?) -> sesion del dia en la TZ de la sede, modo ROM y niveles"
  - "tv/service.ts: TvService.buildPollPayload / readState (expire-on-read) / clampState"
  - "28 tests nuevos (9 unitarios + 19 de integracion) sobre roster, dia y servicio"
affects: [164-06, 164-07, 164-08, 164-10, 164-11, 164-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 4: expire-on-read del estado de clase por class_date en la TZ de la sede (sin cron)"
    - "Pattern 6: serverNow en todos los polls + utcOffsetMinutes y dateLabel preformateados (el TV no usa Intl con timeZone)"
    - "Duplicacion cross-app declarada con comentario espejo en los DOS extremos"
    - "Identidad de bloque por ROL canonico; blockIndex siempre derivado, nunca persistido"

key-files:
  created:
    - el-templo-api/src/modules/shared/week-dates.ts
    - el-templo-api/src/modules/tv/roster.ts
    - el-templo-api/src/modules/tv/class-day.ts
    - el-templo-api/src/modules/tv/service.ts
    - el-templo-api/test/tv/tv-roster.test.ts
    - el-templo-api/test/tv/tv-class-day.test.ts
    - el-templo-api/test/tv/tv-service.test.ts
  modified:
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/db/schema/tv.ts
    - el-templo-admin/src/utils/pdf/session-data-transformer.ts

key-decisions:
  - "El port del orden canonico de bloques al API ACEPTA la duplicacion cross-app; ambos archivos llevan comentario espejo apuntando al otro"
  - "tv_class_state.class_date pasa a mode string (convencion del repo): sin eso el expire-on-read obligaba a reformatear un Date, que es justo el bug que D-07 evita"
  - "El titulo de un bloque ATHLOS conserva su nombre real aunque su rol canonico sea EPIKOS (igual que el PDF)"
  - "levels nunca queda vacio mientras approved sea true: los niveles fuera del orden canonico se agregan al final en vez de descartarse"
  - "Los formatos que dictan reps/segundos (tabata/interval/hiit/on_the_x/death_by) no muestran volumen: el TV no puede inventar una prescripcion en una pared"
  - "Los tiers ROM se rotulan BASICO/AVANZADO con acento (BÁSICO), coherente con el resto de la UI en castellano"

patterns-established:
  - "Toda funcion del modulo tv que dependa del tiempo recibe `now` inyectable y no llama a new Date() adentro"
  - "El payload del TV se testea tambien por lo que NO contiene (barrido de PII sobre el JSON serializado)"

requirements-completed: [D-06, D-07, D-08, D-09, D-14, D-15, D-23]

# Metrics
duration: 24min
completed: 2026-07-24
---

# Phase 164 Plan 05: El cerebro del TV del lado del servidor Summary

**El API ya sabe, para una sede y un instante, que sesion mostrar (TZ de la sede, solo aprobadas, ROM los sabados), en que orden van los bloques (rol canonico con alias ATHLOS) y como se arma el payload completo del poll con expire-on-read y clamp — 28 tests nuevos, incluida la caducidad del estado verificada con Europe/Madrid.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-24T21:50:44Z
- **Completed:** 2026-07-24T22:14:41Z
- **Tasks:** 3
- **Files modified:** 10 (7 creados, 3 modificados)

## Accomplishments

- **El TV nunca calcula el dia.** `resolveClassDay` resuelve fecha, semana SPOM, modo y niveles contra la TZ de la SEDE. Un test lo prueba de la unica forma que vale: dos sedes con el MISMO instante (23:30 UTC) resuelven martes en Mar del Plata y miercoles en Barcelona, y cada una levanta SU sesion (roster distinto).
- **El estado de clase caduca solo, sin cron.** `readState` compara `class_date` contra la fecha de hoy en la TZ de la sede y devuelve `null` si es de otro dia — sin borrar la fila. Cubierto con Barcelona (T-164-23), que es el caso donde un calculo en UTC habria limpiado el estado a la hora argentina.
- **Cambiar de nivel no puede romper el bloque.** `clampState` valida el rol contra el roster vigente y clampea el indice de ejercicio contra la lista del (rol, nivel) actual. El test lo prueba con niveles de largo distinto: el indice 4 vive en delta (5 ejercicios) y se clampa a 1 en alfa (2 ejercicios).
- **El reposo es indistinguible de "no hay clase" (D-09).** Sin sesion aprobada o sin clase iniciada el payload es `screen: "idle"` y sus claves son exactamente `serverNow / branch / screen / class` — el test asserta el conjunto de claves, no solo la ausencia de un campo `error` puntual.
- **Cero datos de socio en el payload (T-164-21).** Verificado por barrido sobre el JSON serializado (`email`, `dni`, `phone`, `firstname`, `lastname`, `userid`, `member`), no por revision visual del `.select()`.
- **Un TV no puede leer otra sucursal (T-164-20).** La sede sale de la fila del dispositivo: un test inicia clase en Barcelona y el televisor de Mogotes sigue en reposo.
- **Se elimino una duplicacion y se declaro la otra.** El ancla de semana dejo de estar duplicada dentro del backend (`sessions/routes.ts` ahora importa de `shared/week-dates.ts`, movimiento mecanico verificado por la regresion de `/sessions/daily`), y la duplicacion cross-app inevitable (orden canonico de bloques, que corre en el browser del admin) quedo documentada con comentario espejo en LOS DOS archivos.

## Task Commits

1. **Task 1: week-dates (DRY) + roster.ts + test unitario** — `826db691` (feat)
2. **Task 2: class-day.ts — que sesion es "hoy" para esta sede** — `aa4fadc3` (feat)
3. **Task 3: TvService — expire-on-read, clamp y payload del poll** — `9f986d18` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/shared/week-dates.ts` — `dateToWeekNumber` / `dateToDayName` con el ancla `2026-02-23` conservada byte a byte.
- `el-templo-api/src/modules/sessions/routes.ts` — Deja de definir las helpers y las importa. Sin cambios de logica (`sessions-gating.test.ts` verde).
- `el-templo-api/src/modules/tv/roster.ts` — `REGULAR_ROLES` / `ROM_ROLES` / `INITIUM_SOURCE_ORDER`, `findBlock` (alias EPIKOS↔ATHLOS), `findInitiumBlock` determinista, `buildRoster` con titulo `ETIQUETA · FORMATO` y `shared` solo en INITIUM. Docblock con la advertencia de espejo.
- `el-templo-api/src/modules/tv/class-day.ts` — `resolveClassDay`: TZ de la sede, `day_modes` para el modo, solo `status = approved` con `goal_plan_type IS NULL`, batch de 3 queries (sesiones → bloques → prescripciones con leftJoin a `exercises`), `levels` en orden canonico.
- `el-templo-api/src/modules/tv/service.ts` — `TvService`: `readState` (expire-on-read), `clampState`, `buildPollPayload` (sede de la fila del device, `serverNow`, `utcOffsetMinutes`, `dateLabel`, `levelLabel`, `listHeader`, `mobilityLine`, `rx` como el PDF, `videoUrl` via `assembleVideoUrl`, timer como spec + sello).
- `el-templo-api/src/db/schema/tv.ts` — `class_date` pasa a `{ mode: "string" }` (ver Deviations). Sin migracion.
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — Solo comentario: espejo hacia `modules/tv/roster.ts`.
- `el-templo-api/test/tv/tv-roster.test.ts` — 9 tests unitarios puros.
- `el-templo-api/test/tv/tv-class-day.test.ts` — 6 tests de integracion.
- `el-templo-api/test/tv/tv-service.test.ts` — 13 tests de integracion.

## Decisions Made

- **La duplicacion cross-app se acepta y se declara en los dos extremos.** El plan ya lo decidia; lo que se agrego es la simetria: el comentario del admin nombra el archivo del API y el docblock del API nombra el del admin, y el test unitario del roster dice explicitamente que es la red de ese espejo. Un cambio unilateral rompe tests, no solo la vista.
- **`class_date` como string.** Ver Deviations #1: es la decision con mas consecuencias del plan porque toca schema.
- **ATHLOS conserva su nombre en el titulo.** El `role` del roster (lo que se persiste en `tv_class_state`) es siempre el canonico `EPIKOS`, pero la etiqueta visible usa el nombre real del bloque, igual que hace el PDF. Sin esto el TV rotularia EPIKOS un bloque que el profe llama ATHLOS.
- **`levels` no puede quedar vacio con `approved: true`.** Un nivel fuera del orden canonico (dato viejo) se agrega al final en vez de descartarse. Descartarlo dejaba al clamp sin nivel al que caer: sesion aprobada + lista en blanco en la pared.
- **`BÁSICO` con acento.** El plan escribia `BASICO` (el documento entero va sin tildes), pero es texto que se proyecta en un televisor y el resto de la UI del producto esta acentuada (`MIÉRCOLES`, `SÁBADO` en el mismo archivo). Se dejo `BÁSICO` / `AVANZADO`. El plan 164-11 (kiosco) debe leer la etiqueta del payload, no reconstruirla.
- **`listHeader` usa el codigo de ruta crudo** (`NIVEL α | OAP 70%`), no la etiqueta larga. El diccionario `ROUTE_LABELS` vive duplicado en el admin y en la app de socios; traerlo al API seria una tercera copia para ganar una palabra en pantalla. El plan pedia literalmente `<route>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tv_class_state.class_date` estaba declarada sin `mode: "string"`**

- **Found during:** Task 3 (al escribir `readState`)
- **Issue:** La fase 164-01 declaro `date("class_date")` sin config, asi que el driver devuelve un `Date`. El expire-on-read tiene que comparar contra `todayInTz(branch.timezone)`, que es un string `"YYYY-MM-DD"` — con un `Date` habia que reformatearlo, y la unica helper del repo (`toDateString`) usa getters UTC, que para una fecha de MySQL parseada como medianoche local corre un dia hacia atras en offsets negativos. O sea: el unico camino disponible reintroducia exactamente el bug que D-07 existe para evitar (y `toISOString` esta prohibido por criterio de aceptacion, con razon). Ademas el test de la fase 01 ya insertaba un string en esa columna, cosa que TS no detecto porque `tsconfig.json` solo incluye `src/**/*`.
- **Fix:** `date("class_date", { mode: "string" })`, que es la convencion del repo (`subscriptions.start_date`, `bookings.booking_date`). Es solo mapeo del driver: la columna SQL no cambia y NO hace falta migracion.
- **Files modified:** `el-templo-api/src/db/schema/tv.ts`
- **Verification:** `tv-service.test.ts` escribe y relee la fecha (round-trip string) y el test de expire-on-read distingue hoy de ayer; `tsc --noEmit` limpio.
- **Committed in:** `9f986d18`

**2. [Rule 2 - Missing Critical] Se agrego `test/tv/tv-service.test.ts` (13 tests)**

- **Found during:** Task 3
- **Issue:** La Task 3 no listaba archivo de test y sus criterios de aceptacion eran solo greps + `tsc`. Pero el `<threat_model>` del propio plan asigna `mitigate` a T-164-21 (fuga de PII), T-164-22 (reposo silencioso) y T-164-23 (estado viejo mostrado como de hoy, "cubierto por tests con `Europe/Madrid`"). Sin ejercitar el servicio, esas tres mitigaciones quedaban afirmadas y no verificadas, y el clamp — la unica red contra Pitfall 1 — sin una sola prueba hasta el plan 164-08.
- **Fix:** Archivo de integracion con 13 casos: expire-on-read (hoy / ayer / sin fila / borde con Barcelona), clamp (rol, nivel, indice alto, indice negativo), reposo con y sin sesion aprobada, payload completo, INITIUM compartido, barrido de PII y aislamiento entre sedes.
- **Files modified:** `el-templo-api/test/tv/tv-service.test.ts` (nuevo)
- **Verification:** 13/13 verdes.
- **Committed in:** `9f986d18`

**3. [Rule 2 - Missing Critical] Supresion del volumen en formatos que dictan reps/segundos**

- **Found during:** Task 3
- **Issue:** El plan pedia el `rx` "formateado igual que el PDF". El PDF suprime reps/segundos cuando el formato los dicta (tabata, interval, hiit, on_the_x, death_by): el editor ni siquiera muestra esos inputs, asi que el valor guardado es basura de default. Sin la supresion, un tabata mostraria en una pared un "8-10" que ningun profe prescribio.
- **Fix:** `FORMAT_DICTATED_TYPES` en `service.ts`, discriminando por `formatParams.type` (mas robusto que el chequeo por nombre del admin), con comentario apuntando al original.
- **Files modified:** `el-templo-api/src/modules/tv/service.ts`
- **Verification:** test "INITIUM es lista compartida" asserta `rx === "CON."` en un bloque tabata, contra `"8-10 CON."` en el AMRAP del mismo dia.
- **Committed in:** `9f986d18`

**4. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-api`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase. Identico a la desviacion #1 del plan 164-02 y a la #4 del 164-03.
- **Fix:** Se corrieron los mismos comandos contra `/home/franco/projects/et-164-tv/el-templo-api`. Ningun cambio de codigo.
- **Files modified:** ninguno
- **Verification:** `tsc` y `vitest` verdes en el worktree; el checkout principal intacto.
- **Committed in:** n/a (correccion de procedimiento)

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 missing critical)
**Impact on plan:** Ninguna amplia el alcance funcional. Las dos de Rule 2 verifican o completan mitigaciones que el propio `<threat_model>` del plan asignaba a estos archivos; la #1 corrige una declaracion de schema de la fase 01 sin tocar SQL ni migraciones.

## Issues Encountered

- **Corrida en paralelo de 8 archivos de test: falso rojo de infraestructura.** Correr `vitest run test/tv/ test/sessions/sessions-gating.test.ts` (4 workers) fallo con `Table 'eltemplo_test_1.user_sepa_details' doesn't exist`: el `globalSetup` dropea las DBs por worker y las 4 re-provisiones concurrentes contra el mismo MySQL quedaron a medio migrar (70-74 tablas en vez del set completo). **No es del codigo de este plan** — se verifico con una corrida de control de dos archivos ajenos (`rbac-sets` + `outstanding-balances`), que paso y dejo las DBs sanas. Con `MAX_TEST_WORKERS=1` los tres archivos del TV corren verdes juntos. Vale como nota para quien corra tests local: serializar workers o correr de a un archivo (en CI el runner tiene su propia DB limpia).
- **`tsconfig.json` del API solo incluye `src/**/*`:** los archivos de `test/` NO se typechequean con `npx tsc --noEmit` (vitest los transpila sin chequear). Es lo que dejo pasar el string en una columna `Date` de la fase 01. Fuera de alcance, pero conviene saberlo antes de confiar en un `tsc` limpio como prueba de que los tests tipan.
- Los tests del modulo tardan ~60 s por el provisioning de MySQL del setup global, no por los casos (que suman ~1 s cada uno).

## Deferred Issues

Ver `deferred-items.md` en este directorio: `SpomService.getCurrentWeek()` es una cuarta copia del ancla de semana, no unificada porque su firma parte de un `Date` y reusar `dateToWeekNumber` obligaria a decidir en que TZ se resuelve "la semana actual" del SPOM (cambio de comportamiento fuera del TV).

## Known Stubs

Ninguno. Las cuatro funciones publicas (`resolveClassDay`, `buildRoster`, `readState`/`clampState`/`buildPollPayload`) estan completas y ejercitadas. Lo que falta son sus consumidores: la ruta `GET /api/tv/state` la monta el plan 164-08 sobre el scope autenticado por device que dejo el 164-03, y el kiosco que pinta el payload es el 164-11.

## Threat Flags

Ninguno. El plan no agrega rutas ni superficie de red: son tres modulos de logica. Las mitigaciones asignadas (T-164-20/21/22/23) quedaron cubiertas por tests, y T-164-24 (crecimiento del payload) sigue **aceptado** — el payload esta acotado por bloque. Cero paquetes nuevos (T-164-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **El plan 164-08 (control del profe) tiene todo lo que necesita:** `TvService` construido por DI (`db`, `log`), `buildPollPayload(device)` para colgar `GET /api/tv/state` dentro del `register` anidado del 164-03, y `clampState` reutilizable para validar lo que escribe el celular.
- **El plan 164-11 (kiosco) tiene el payload cerrado y preformateado:** `dateLabel`, `levelLabel`, `listHeader`, `title`, `mobilityLine` y `rx` vienen listos para pintar — el TV no arma ni una cadena, y no necesita `Intl` con `timeZone` (usa `utcOffsetMinutes`).
- **Pendiente de waves siguientes:** el calculo de `elapsedMs` a partir de `startedAt`/`pausedAt`/`pausedAccumMs` (D-17) sigue siendo del consumidor; este plan publica los tres campos pero no los interpreta.
- **Sin push.** La rama `feat/164-tv-sucursal` sigue local (staging-first estricto).

## Self-Check: PASSED

- 7/7 archivos declarados como creados existen en disco; 3/3 modificados verificados.
- 3/3 commits de task encontrados en `git log` (`826db691`, `aa4fadc3`, `9f986d18`).
- Verificacion a nivel plan re-corrida DESPUES de los commits (post-prettier):
  - `npx tsc --noEmit` en `el-templo-api`: limpio.
  - `MAX_TEST_WORKERS=1 pnpm vitest run test/tv/tv-class-day.test.ts test/tv/tv-roster.test.ts test/tv/tv-service.test.ts`: **28/28 verdes**.
  - `pnpm vitest run test/sessions/sessions-gating.test.ts`: **8/8 verdes** (regresion de la extraccion DRY).
  - Gates de grep: `WEEK_ONE_MONDAY` en `sessions/routes.ts` = 0; `ATHLOS` en `roster.ts` = 6; `CALENTAMIENTO` en `roster.ts` = 0; espejo `modules/tv/roster` en el transformer del admin = 1; `dayModes` = 3, `todayInTz` = 2, `new Date()` = 0, `throw` = 0 en `class-day.ts`; `assembleVideoUrl` = 2, `todayInTz` = 3, `toISOString` = 0, `serverNow` = 2, `schema.users` = 0 en `service.ts`; `: any` y `console.` en todo `src/modules/tv/` = 0.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
