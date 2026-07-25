---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 12
subsystem: admin
tags: [tv, control, admin, quasar, ux, idempotencia, smoke]

# Dependency graph
requires:
  - phase: 164-09
    provides: "useTvApi + TV_CONTROL_ROLES + la prohibicion de una ruta 'tv' en el SPA"
  - phase: 164-10
    provides: "GET /control/context, POST /control/state (absoluto e idempotente), POST /control/end-class"
  - phase: 164-08
    provides: "GET /api/tv/state — el poll contra el que se verifico que lo escrito llega al televisor"
provides:
  - "TvControlPage: la botonera del profe (BLOQUES / NIVELES / EJERCICIO / TIMER) para el celular"
  - "useTvApi.getControlContext / writeState / endClass: el wrapper unico de las tres rutas de control"
  - "Contrato del control tipado en el admin (TvControlContext/Block/State, TvStateWrite, TvScreen, TvTimerStatus, TvClassMode)"
  - "describeControlError(): el 409 traducido a 'la sesion de hoy no esta aprobada'"
  - "Ruta /tv/control + item de menu 'Control TV'"
  - "Smoke end-to-end del circuito completo contra la API local (23/23 pasos)"
affects: [164-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cada tap manda un estado ABSOLUTO y reemplaza el contexto local con la respuesta: el clamp del servidor se ve en la botonera sin re-consultar"
    - "busy=true mientras la request esta en vuelo: el doble tap se corta del lado del cliente ademas de ser inofensivo del lado del API"
    - "El refresco periodico se saltea si hay una escritura en vuelo (una respuesta vieja no puede pisar el resultado de un tap)"
    - "Un error de escritura relee el contexto: los botones nunca quedan describiendo un estado que ya no existe"
    - "Smoke end-to-end con setup reversible en la DB de desarrollo (finally con pasos aislados, cada uno a prueba de fallo del anterior)"

key-files:
  created:
    - el-templo-admin/src/pages/TvControlPage.vue
  modified:
    - el-templo-admin/src/composables/useTvApi.ts
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts

key-decisions:
  - "El boton de cierre es un TOGGLE (PANTALLA DE CIERRE / VOLVER A LA CLASE): con una botonera ciega, un tap equivocado sin vuelta atras obliga a terminar la clase entera para recuperarse"
  - "Las etiquetas de nivel (α Δ Σ ☉ vs BASICO/AVANZADO) viven en la pagina, no en el composable: son diseño del UI-SPEC, no contrato del API"
  - "El item de menu va ANTES de 'Televisores': el control se usa en cada clase, vincular un TV pasa una vez"
  - "El refresco de 30 s no corre si hay una escritura en vuelo — sin esa guarda, un refresco lento puede aterrizar despues de un tap y volver la botonera al estado anterior"
  - "describeControlError vive en el composable (junto a describeClaimError): la traduccion del 409 la necesita cualquier superficie que escriba, no solo esta pagina"

requirements-completed:
  [D-07, D-08, D-10, D-11, D-12, D-13, D-15, D-16, D-17, D-18, D-19, D-23]

# Metrics
duration: 38min
completed: 2026-07-24
---

# Phase 164 Plan 12: El control remoto del profe Summary

**La botonera del celular — cuatro secciones de botones de 64 px que el profe maneja con una mano en el medio de un bloque — cableada contra las tres rutas de control, con el circuito completo (vincular un TV → iniciar clase → bloque/nivel/ejercicio → timer → sonido → pantalla de cierre → terminar) verificado de punta a punta contra la API local: 23/23 pasos verdes, cada cambio reflejado en el poll del televisor.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-07-25T02:35:00Z
- **Completed:** 2026-07-25T03:13:00Z
- **Tasks:** 3
- **Files:** 1 creado, 3 modificados

## Accomplishments

- **El profe ya puede manejar el televisor sin mirar la pantalla del celular.** Cuatro secciones tipográficas (BLOQUES / NIVELES / EJERCICIO / TIMER), todos los botones con `min-height: 64px` y área táctil generosa, el actual siempre resaltado en sólido y el resto en outline. Es el pedido literal de D-13 ("botones grandes, necesito agilidad en el medio de una clase") sin ningún campo de texto ni control fino en el camino.
- **El control se auto-corrige solo, sin espejo.** Cada tap manda el valor destino absoluto (el `blockRole`, el `exerciseIndex`) y reemplaza el contexto local con la respuesta ya clampeada del servidor. En el smoke se mandó `exerciseIndex: 99` y la botonera quedó mostrando "3 / 3": el clamp del API es visible sin ninguna lógica de corrección del lado del cliente.
- **El doble tap está cortado en las dos puntas.** Del lado del cliente los botones se deshabilitan mientras la request está en vuelo (`busy`); del lado del API los comandos ya eran idempotentes. El smoke lo verifica en el peor caso: dos PAUSAR seguidos dejan el mismo `pausedAt` (si el segundo lo reescribiera, al reanudar se perderían los milisegundos del medio).
- **La sesión no aprobada se explica, no se sufre.** Banner explícito ("La sesión de hoy todavía no está aprobada") + todos los controles deshabilitados (D-10), que es el espejo del reposo silencioso que ve el socio en la pared (D-09). Y si alguien desaprueba la sesión con la pantalla abierta, el 409 del API se traduce a un mensaje operativo y la página relee el contexto.
- **Los sábados el selector cambia solo.** Los niveles salen SIEMPRE de `context.levels` y las etiquetas dependen de `context.mode`: en `rom` los dos tiers se rotulan BÁSICO / AVANZADO (D-23); el resto de la semana son los símbolos del UI-SPEC (α Δ Σ ☉). No hay ninguna lista fija de niveles en la página.
- **El circuito completo funciona en local, medido paso a paso.** 23 verificaciones contra la API real: vincular un TV desde cero (pairing → claim → device token), reposo, INICIAR CLASE, cambio de bloque (resetea ejercicio y timer, conserva el nivel), cambio de nivel (no mueve el bloque), ejercicio, clamp, timer start/pause/doble pause/resume/reset, SONIDO ON llegando al poll del televisor, pantalla de cierre (el TV deja de mostrar la clase) y TERMINAR CLASE (el TV vuelve a reposo, idempotente).
- **El kiosco estático sigue intacto.** La ruta es `tv/control` y el chequeo de node del plan vuelve a confirmar que no existe ningún `path: 'tv'` en el SPA — lo único que rompería la resolución de nginx sobre `public/tv/index.html` (D-24).

## Task Commits

1. **Task 1: Métodos de control en useTvApi** — `d4daec63` (feat)
2. **Task 2: TvControlPage.vue — la botonera grande** — `faed8d2a` (feat)
3. **Task 3: Ruta, menú y smoke end-to-end local** — `feb8348c` (feat)

## Files Created/Modified

- `el-templo-admin/src/composables/useTvApi.ts` — Contrato del control copiado del API (`TvScreen`, `TvTimerStatus`, `TvClassMode`, `TvControlBlock`, `TvControlState`, `TvControlContext`, `TvStateWrite`, cada uno con el D-XX que lo justifica) + `getControlContext` / `writeState` / `endClass` con el mismo patrón `loading`/`error`/`try`/`catch (err: unknown)`/`finally` de los métodos existentes, y `describeControlError` para el 409. `cleanup()` intacto, sin hooks de Vue, sin `any`.
- `el-templo-admin/src/pages/TvControlPage.vue` — La botonera. Selector de sede con default en la del profe (D-11, sedes virtuales filtradas), banner de sesión no aprobada, botón único "INICIAR CLASE" cuando no hay clase iniciada, y las cuatro secciones. Timer con exactamente cuatro acciones (INICIAR, PAUSAR/REANUDAR según `timerStatus`, RESET, SONIDO ON/OFF). Abajo: PANTALLA DE CIERRE (toggle) y TERMINAR CLASE con diálogo de confirmación. Refresco cada 30 s con `clearInterval` + `tvApi.cleanup()` en el `onUnmounted` de la página.
- `el-templo-admin/src/router/routes.ts` — Ruta hija `tv/control` con `meta.allowedRoles: TV_CONTROL_ROLES` y el recordatorio de por qué el path no puede ser `tv`.
- `el-templo-admin/src/config/templo-config.ts` — Ítem "Control TV" (`settings_remote`, `templo: true`) en Gestión, antes de "Televisores", con el mismo set de roles.

## Decisions Made

- **El botón de cierre es un toggle.** El plan pedía un botón "PANTALLA DE CIERRE" (`screen: "closing"`). Sin vuelta atrás, un tap equivocado en una botonera que se usa sin mirar deja el televisor en la pantalla de cierre en el medio de la clase, y la única salida sería TERMINAR CLASE + volver a empezar desde el primer bloque. Como la escritura es absoluta, mandar `screen: "class"` es exactamente el mismo endpoint y el mismo costo: el botón se rotula "VOLVER A LA CLASE" cuando `screen === "closing"`. No agrega superficie: `screen` ya aceptaba los dos valores (`idle` no, para eso está `endClass`).
- **Las etiquetas de nivel viven en la página.** El API ya rotula para el televisor (`levelLabel` en `service.ts`), pero eso es el string del kiosco, no el del control: acá el botón muestra el símbolo solo (α) porque es un chip de 64 px que se lee de reojo. Duplicar el mapa en la página es preferible a inflar el composable (que es contrato de transporte) o a agregar un campo al payload solo para pintar cuatro botones.
- **El refresco de 30 s no corre con una escritura en vuelo.** Sin la guarda, la secuencia "tap → refresco disparado antes → respuesta del refresco llega después" devuelve la botonera al estado anterior y el profe ve el botón rebotar. La guarda es una línea (`if (busy.value) return`) y elimina toda la clase de carrera local; la concurrencia real entre profes sigue siendo D-12 (última escritura gana, sin avisos).
- **Los errores de escritura releen el contexto.** Un 409 (sesión desaprobada en el medio) o un 403 (sede cambiada) significan que la botonera está describiendo un estado que ya no existe. Se notifica y se relee: al toque siguiente el profe ya ve el banner correcto en vez de seguir apretando botones sin efecto.
- **El ítem de menú va antes de "Televisores".** Vincular un TV pasa una vez por aparato; el control se abre en cada clase. En una lista de navegación el orden ES la frecuencia de uso.

## Smoke end-to-end local (Task 3)

Corrido contra la API local (`tsx src/index.ts` sobre la DB de desarrollo `eltemplo`) con un JWT de owner firmado con el `JWT_SECRET` local. La DB de desarrollo **no tiene sesiones para la semana en curso** (hoy = W22 viernes; la data seedeada llega hasta W8), así que el setup movió temporalmente la columna `week` de las 5 sesiones ya aprobadas de W6-viernes a W22 y las devolvió a W6 al terminar. **No se creó, aprobó ni borró ninguna sesión.**

| #   | Paso                                                 | Resultado                                                               |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| 0   | Contexto con la sesión del día sin aprobar           | OK — `sessionApproved: false` (es el caso que dispara el banner D-10)   |
| 0b  | Escribir en ese estado                               | OK — 409, no se creó fila                                               |
| 1   | Setup: sesión del día disponible                     | OK — 5 bloques, niveles alfa/delta/sigma/omega/spartan                  |
| 2   | El kiosco pide su código (`POST /api/tv/pair/start`) | OK — `userCode` de 6 caracteres                                         |
| 3   | El staff lo vincula (lo que hace `/tv/devices`)      | OK — 200                                                                |
| 4   | El kiosco recibe su device token                     | OK — `status: paired`                                                   |
| 5   | Antes de iniciar, el TV está en reposo               | OK — `screen: idle`                                                     |
| 6   | INICIAR CLASE                                        | OK — bloque INITIUM, nivel alfa, `screen: class`                        |
| 6b  | El televisor lo refleja                              | OK — el poll muestra "PYROS · HIIT - 45s/15s x 8 rondas"                |
| 7   | Cambiar de bloque                                    | OK — NUCLEUS, ejercicio 0, timer idle (D-15)                            |
| 8   | Cambiar de nivel                                     | OK — delta, el bloque no se movió                                       |
| 9   | Ejercicio siguiente                                  | OK — 2/3                                                                |
| 9b  | `exerciseIndex: 99`                                  | OK — clampeado a 3/3 por el server                                      |
| 10  | INICIAR timer                                        | OK — `running`, sello del server                                        |
| 11  | PAUSAR                                               | OK — `paused`, el arranque no se movió                                  |
| 11b | Doble tap de PAUSAR                                  | OK — NO-OP, mismo `pausedAt`                                            |
| 12  | REANUDAR                                             | OK — `running` con `pausedAccumMs > 0` (D-17)                           |
| 13  | RESET                                                | OK — `idle`, sin sello                                                  |
| 14  | SONIDO ON                                            | OK — llega al poll del televisor (D-19)                                 |
| 15  | PANTALLA DE CIERRE                                   | OK — el TV pasa a `closing` y deja de publicar la clase (D-08)          |
| 15b | VOLVER A LA CLASE                                    | OK — `screen: class`                                                    |
| 16  | TERMINAR CLASE                                       | OK — el TV vuelve a `idle` y el contexto queda con `state: null` (D-07) |
| 16b | Terminar dos veces                                   | OK — 200, idempotente                                                   |

**23/23 pasos verdes.** Limpieza verificada al final: `tv_devices`, `tv_pairings` y `tv_class_state` en 0 filas, y las 5 sesiones de vuelta en W6 (`SELECT week, COUNT(*) ... GROUP BY week` idéntico al estado previo: 5 filas por semana, W1..W8).

**Lo que este smoke NO cubre** (y queda para el UAT humano): el render real de la pantalla en un celular (tamaño de los botones en la mano del profe), y el kiosco pintando la clase en un televisor. Los dos requieren ojos: acá se ejercitó el circuito de datos completo, no la percepción.

Detalle de data local observado: la sesión de W6-viernes trae `omega` y `spartan` además de alfa/delta/sigma. La página no tiene ninguna lista fija de niveles (los toma de `context.levels`), así que dibujó los cinco chips sin quejarse — que es exactamente el comportamiento buscado para el sábado ROM.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-admin`, que es el checkout principal (con WIP de otra sesión), no el worktree de la fase. Misma desviación ya documentada en 164-02/03/04/05/08/09/10.
- **Fix:** Se corrieron los mismos comandos en `/home/franco/projects/et-164-tv/el-templo-admin`. Ningún cambio de código.
- **Files modified:** ninguno
- **Committed in:** n/a (corrección de procedimiento)

**2. [Rule 3 - Blocking] `vue-tsc` no está instalado (y `npx` lo bajaría de la red)**

- **Found during:** Tasks 1-3 (verificación)
- **Issue:** El plan verifica con `npx vue-tsc --noEmit`, que no está en `node_modules` del admin — `npx` lo descargaría, o sea instalar una dependencia sin permiso (C-08).
- **Fix:** El mismo tríptico del plan 164-09: (a) `tsc -p tsconfig.json --noEmit` con baseline capturado ANTES de tocar nada (32 líneas preexistentes) y `diff` vacío después de cada task; (b) extracción del `<script setup>` del `.vue` a un `.ts` temporal dentro de `src/` (borrado enseguida) → 0 errores propios; (c) `quasar build` completo, que compila el SFC de verdad (template incluido) y corre eslint sobre `src/` vía `vite-plugin-checker`.
- **Files modified:** ninguno
- **Verification:** diff vacío en los 3 tasks; **Build succeeded** con `TvControlPage-CrXx5GKy.js` + `TvControlPage-rGczC-oj.css` emitidos.
- **Committed in:** n/a

**3. [Rule 2 - Missing Critical] Vuelta atrás de la pantalla de cierre**

- **Found during:** Task 2
- **Issue:** El plan define PANTALLA DE CIERRE como una acción de una sola dirección. En una botonera que se usa sin mirar, un tap equivocado dejaría el televisor en la pantalla de cierre en el medio de un bloque, sin más salida que terminar la clase y volver a arrancar desde el primer bloque con el timer en cero.
- **Fix:** El botón es un toggle — cuando `screen === "closing"` dice "VOLVER A LA CLASE" y manda `screen: "class"`. Cero superficie nueva: el schema del API ya aceptaba los dos valores.
- **Files modified:** `el-templo-admin/src/pages/TvControlPage.vue`
- **Verification:** pasos 15 y 15b del smoke (cierre → el TV deja de publicar la clase → volver → `screen: class`).
- **Committed in:** `faed8d2a`

**4. [Rule 2 - Missing Critical] El refresco periódico podía pisar un tap en vuelo**

- **Found during:** Task 2
- **Issue:** El plan pide refrescar el contexto cada 30 s. Un refresco disparado justo antes de un tap puede responder DESPUÉS de la escritura y devolver la botonera al estado anterior — el profe ve el botón rebatir solo, y en una pantalla ciega eso es indistinguible de "el tap no funcionó".
- **Fix:** `fetchContext` corta si hay una escritura en vuelo (`if (busy.value) return`), y toda escritura fallida relee el contexto explícitamente.
- **Files modified:** `el-templo-admin/src/pages/TvControlPage.vue`
- **Verification:** revisión de código (la carrera necesita latencia controlada para reproducirse); el resto del comportamiento concurrente es D-12 y queda como está.
- **Committed in:** `faed8d2a`

---

**Total deviations:** 4 auto-fixed (2 de procedimiento ya conocidas de la fase, 2 de robustez de la botonera)
**Impact on plan:** Ninguna amplía el alcance. Las dos funcionales usan endpoints y campos que ya existían.

## Issues Encountered

- **El smoke tropezó dos veces con contratos del propio módulo antes de quedar verde**, y las dos valen como nota para quien escriba el kiosco o un cliente nuevo: (1) el pairing devuelve el campo `deviceToken`, no `token`; (2) el televisor se autentica con **`Authorization: Device <token>`**, no `Bearer` — es un token opaco de dispositivo, no un JWT, y `device-auth.ts` rechaza cualquier otro prefijo con 401.
- **La primera corrida del smoke murió en la limpieza por una FK** (`tv_pairings.device_id` → `tv_devices.id`) y dejó las sesiones movidas de semana. Se restauraron a mano de inmediato (verificado por conteo) y el script se reescribió con la limpieza en orden inverso a la creación y cada paso aislado en un `try` propio, para que un fallo no arrastre a los siguientes. **Regla para el próximo smoke con setup en la DB: lo primero que se restaura tiene que ser lo que más duele perder.**
- **El typecheck de `.vue` sigue siendo parcial en esta máquina** (extracción del `<script setup>` + `quasar build`): las expresiones del `<template>` no las typechequea nadie. Mismo agujero que 164-04/09 y `reference_ci_no_typecheck_frontends.md`; se mitigó manteniendo el template sin lógica (todo derivado en `computed`) y con el build, que sí falla ante un error de compilación de template.
- **El pre-commit (lint-staged) reformatea con prettier**, así que los gates de grep y el typecheck se re-corrieron después de los tres commits.

## Known Stubs

Ninguno. Los 12 controles de la página escriben contra rutas reales y el smoke ejercitó todos: iniciar clase, bloque anterior/siguiente, chip de bloque, chips de nivel, ejercicio anterior/siguiente, iniciar/pausar/reanudar/resetear timer, sonido, pantalla de cierre y terminar clase. No hay datos mockeados ni botones sin acción.

## Threat Flags

Ninguno. El plan no agrega superficie: consume las tres rutas que 164-10 modeló y verificó. Las mitigaciones que el `<threat_model>` asignaba a estos archivos quedaron cubiertas:

| Threat   | Estado                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| T-164-51 | El selector lista solo sedes del scope (y filtra las virtuales); la autoridad es `requireBranchAccess` en cada llamada, lectura y escritura. |
| T-164-52 | `busy` deshabilita la botonera mientras la request está en vuelo; el smoke confirma además que el doble tap del timer es NO-OP en el server. |
| T-164-53 | `updated_by` lo sella el API desde el JWT (164-10). La página no manda ningún identificador de autor.                                        |
| T-164-54 | `setInterval` en `onMounted`, `clearInterval` + `tvApi.cleanup()` en `onUnmounted` de la página (1 `clearInterval`, verificado por grep).    |
| T-164-SC | Cero paquetes instalados. `vue-tsc` ausente se resolvió con herramientas locales, sin `npx`.                                                 |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Queda el plan 164-13** (último de la fase): runbook del kiosco (D-21) y cierre.
- **Para el UAT humano**, el circuito ya es operable de punta a punta en local: `/tv/devices` para vincular, `/tv/index.html` para el kiosco, `/tv/control` para manejarlo. Falta ejercitarlo con ojos: tamaño real de los botones en un celular y el kiosco en un televisor.
- **Nota de datos para quien pruebe en local:** la DB de desarrollo no tiene sesiones para la semana en curso, así que el control va a mostrar "la sesión de hoy todavía no está aprobada" hasta que exista una sesión aprobada de la semana y día actuales (`sessions.week` + `sessions.day`, sin `goal_plan_type`).
- **Sin push.** La rama `feat/164-tv-sucursal` sigue siendo local (staging-first estricto).

## Self-Check: PASSED

- 1/1 archivo creado existe en disco; 3/3 modificados verificados por grep (`TvControlPage` en `routes.ts` = 1, `'Control TV'` en `templo-config.ts` = 1, `getControlContext`/`writeState`/`endClass` exportados por el composable).
- 3/3 commits de task encontrados en `git log` (`d4daec63`, `faed8d2a`, `feb8348c`).
- Verificación a nivel plan, re-corrida DESPUÉS de los commits (post-prettier):
  - `tsc -p tsconfig.json --noEmit` → idéntico al baseline previo al plan (diff vacío).
  - `<script setup>` de `TvControlPage.vue` extraído a un `.ts` temporal → 0 errores; archivo borrado.
  - `eslint -c ./eslint.config.js` limpio en los 4 archivos; `prettier --check` limpio.
  - `quasar build` → **Build succeeded**, chunks `TvControlPage-CrXx5GKy.js` y `TvControlPage-rGczC-oj.css` emitidos.
  - Chequeos de node del `<verify>`: `CONTROL_OK` (las cuatro secciones presentes, ningún control de rondas manuales) y `ROUTES_OK` (no existe `path: 'tv'` ni `'/tv'` en `routes.ts`).
  - Gates de grep: `console.` en la página 0; `min-height: 64px` presente; `: any` 0 en página y composable; `onUnmounted` en el composable 0; `clearInterval` en la página 1.
  - Smoke end-to-end contra la API local: **23/23 pasos**, con la DB de desarrollo restaurada y verificada.
  - `git status --porcelain` → limpio.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
