---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 09
subsystem: admin
tags: [tv, admin, quasar, composable, pairing, rbac, nav, router]

# Dependency graph
requires:
  - phase: 164-03
    provides: "Rutas de staff /api/admin/tv (pair/claim, devices, devices/:id/revoke) + TV_CONTROL_ROLES"
  - phase: 164-04
    provides: "El kiosco vive en public/tv/ (artefacto estatico) — restringe que paths puede tomar el SPA"
provides:
  - "useTvApi(): unico wrapper del admin sobre /api/admin/tv (claimPairing / listDevices / revokeDevice + cleanup)"
  - "TvDeviceRow y TvClaimInput: tipos del modulo TV para el admin"
  - "normalizeUserCode / isValidUserCode / TV_USER_CODE_LENGTH: contrato del codigo de 6 chars espejado del API"
  - "describeClaimError(): traduccion unica de los 404/409 del claim a castellano operativo"
  - "TvDevicesPage: vincular + monitorear ('visto hace X') + revocar televisores"
  - "TV_CONTROL_ROLES (frontend) en templo-config.ts: alimenta nav y meta.allowedRoles"
  - "Ruta /tv/devices en el SPA (y la prohibicion explicita de una ruta 'tv')"
affects:
  [
    164-11 kiosco (el TV se vincula desde esta pantalla),
    164-12 botonera del profe,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable espejo de useFinanceLoadApi: refs loading/error, api de boot/axios, extractError, cleanup() sin hooks de Vue"
    - "El poll de UI lo registra y lo corta la PAGINA (setInterval + clearInterval en onUnmounted), nunca el composable"
    - "Un fallo del refresco automatico no vacia la tabla: banner de aviso arriba, filas conservadas"
    - "Sets de roles del frontend declarados en templo-config.ts y consumidos por nav Y router (una sola lista)"
    - "Typecheck de un .vue sin vue-tsc: extraccion del <script setup> a un .ts temporal + diff contra baseline, mas quasar build"

key-files:
  created:
    - el-templo-admin/src/composables/useTvApi.ts
    - el-templo-admin/src/pages/TvDevicesPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts

key-decisions:
  - "TV_CONTROL_ROLES se declara en templo-config.ts (no inline en la ruta): el nav y el meta.allowedRoles tienen que decir lo mismo, y el nombre lo ata visualmente al set del API"
  - "El selector de sede filtra las sedes virtuales (un televisor cuelga de una pared), mismo criterio que CobrosPage/AssignPlanDialog"
  - "El item de menu lleva templo: true — lo que el televisor pinta es la estetica del Templo (marmol, logo, frases), un white-label no hereda ese kiosco"
  - "La normalizacion y validacion del codigo viven en el composable (no en la pagina) para que el plan 164-12 y cualquier otra superficie las reusen"
  - "El listado se pide SIN branchId: el API ya lo acota al scope del usuario y el staff quiere ver todos sus televisores de una"
  - "La pagina mantiene su propio reloj (nowMs) para que el 'hace X' envejezca aunque el listado no cambie"

requirements-completed: [D-01, D-02, D-03, D-04, D-05]

# Metrics
duration: 10min
completed: 2026-07-24
---

# Phase 164 Plan 09: Superficie de staff del TV Summary

**`useTvApi` (wrapper tipado de las tres rutas de `/api/admin/tv`) y `TvDevicesPage` — la pantalla donde el Dueño o un coach tipea el código que muestra el televisor, elige la sede y despues ve "visto hace 12 s" o revoca el aparato — con la ruta `tv/devices` elegida para no pisar el kiosco estático de `/tv`.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-24T22:43:00Z
- **Completed:** 2026-07-24T22:53:00Z
- **Tasks:** 3
- **Files:** 2 creados, 2 modificados

## Accomplishments

- **Un TV ya se puede poner en producción sin tocar la base de datos.** El circuito operativo que hasta ahora existía solo del lado del API (plan 164-03) tiene superficie: código de 6 caracteres → sede → "Vincular", y el televisor se conecta solo en su siguiente poll. El mensaje de éxito lo dice explícitamente ("se conecta solo en unos segundos") para que nadie se quede mirando la pantalla esperando un cambio instantáneo.
- **Los dos errores esperables del claim tienen mensaje de sede, no de API.** 404 → "Ese código no existe. Revisá lo que muestra la pantalla del TV."; 409 → "Ese código ya fue usado. Reiniciá el TV para que muestre uno nuevo." Ambos salen de `describeClaimError`, un solo lugar, y ninguno de los dos ensucia Sentry (se filtran con `isExpectedClientError`).
- **El monitoreo pasivo de D-05 funciona sin sorpresas de reloj.** El "visto hace X" se calcula contra un `nowMs` propio de la página, así que envejece aunque el listado devuelva lo mismo; el refresco es cada 15 s y el `clearInterval` está en el `onUnmounted` **de la página** (el composable no engancha ningún hook, C-14 / CLAUDE.md).
- **El listado nunca se queda en blanco por un hipo de red.** Si el refresco automático falla con filas ya cargadas, aparece un banner de aviso arriba y las filas quedan; el estado de error a pantalla completa solo se usa cuando no hay nada que mostrar.
- **La ruta no puede comerse al kiosco.** El path es `tv/devices` y el `<verify>` del plan corre un chequeo de node que falla si alguna vez aparece un `path: 'tv'` o `'/tv'` en `routes.ts` — que es exactamente lo que rompería la resolución de nginx sobre `public/tv/index.html` (D-24). El comentario en el archivo explica el porqué para que nadie lo "simplifique" después.
- **Cero secretos en la superficie de staff.** `grep -ci "token"` sobre la página devuelve 0: el listado del API no lo entrega, la pantalla no lo pide y el corte de acceso se hace por revocación de fila (D-03).

## Task Commits

1. **Task 1: useTvApi.ts — composable del modulo TV** — `ff9d0093` (feat)
2. **Task 2: TvDevicesPage.vue — vincular, monitorear y revocar** — `2ca686a9` (feat)
3. **Task 3: Ruta y entrada de menu** — `c248ed4d` (feat)

## Files Created/Modified

- `el-templo-admin/src/composables/useTvApi.ts` — `claimPairing` / `listDevices` / `revokeDevice` / `cleanup` sobre `api` de `boot/axios`, con `loading`/`error` y `catch (err: unknown)` + `extractError`. Publica `TvDeviceRow` y `TvClaimInput` (con el comentario que cita D-05 para `lastSeenAt` y D-03 para `isActive`), más el contrato del código: `TV_USER_CODE_LENGTH`, el alfabeto sin I/O/0/1 espejado del API, `normalizeUserCode`, `isValidUserCode` y `describeClaimError`.
- `el-templo-admin/src/pages/TvDevicesPage.vue` — Cabecera + tarjeta de vinculación (código monoespaciado y en mayúsculas, `q-select` de sede con default en la del usuario logueado, nombre opcional) y tabla con los 4 estados: spinner, banner de error, vacío y `q-table`. Columnas Nombre / Sede / Estado (chip verde `Activo` o gris `Revocado`) / Visto hace / Vinculado el / Acciones. "Revocar" solo en filas activas, con `q-dialog` de confirmación que explica que hay que volver a vincular desde cero.
- `el-templo-admin/src/router/routes.ts` — Ruta hija `tv/devices` con `meta.allowedRoles: TV_CONTROL_ROLES` y el comentario CRÍTICO sobre por qué el path no puede ser `tv`.
- `el-templo-admin/src/config/templo-config.ts` — `TV_CONTROL_ROLES` (`['coach','admin','owner']`, espejo del set del API) e ítem "Televisores" (ícono `tv`, `templo: true`) en la categoría Gestión, después de Horarios.

## Decisions Made

- **`TV_CONTROL_ROLES` como constante compartida, no roles inline.** El plan pedía `['coach','admin','owner'] as AdminRole[]` en el `meta` y los mismos tres en el nav. Escribir la lista dos veces es la clase de repetición que CLAUDE.md manda marcar, y además es la que se desincroniza sola (el precedente exacto es `PAGOS_ROLES`, que ya se comparte entre ruta y nav). El nombre replica el del API para que un `grep TV_CONTROL_ROLES` cruce el monorepo entero.
- **Sedes virtuales fuera del selector.** `BranchOption.isVirtual` marca la sede "online"; un televisor es hardware colgado en una pared física. Cuatro call sites del admin ya filtran igual (`CobrosPage`, `AssignPlanDialog`, `MemberSubscriptionTab`, `AlumnoDetailPage`), así que se siguió el mismo criterio en vez de dejar elegir una sede donde el TV no puede existir.
- **`templo: true` en el ítem de menú.** La categoría Gestión no es Templo-only, pero lo que el kiosco pinta sí lo es (mármol, logo y frases del Templo, plan 164-04). Marcarlo mantiene la doctrina del propio `templo-config.ts`: un white-label sin la capa Templo no debería ver una entrada a una pantalla que solo sabe dibujar El Templo. Hoy no cambia nada (`TEMPLO_ENABLED = true`).
- **El código se normaliza en el composable, no en la página.** `normalizeUserCode` / `isValidUserCode` viven junto al request que los necesita, así que la botonera del profe (164-12) o cualquier otra superficie futura no reimplementan la regla — mismo criterio con el que el API derivó el `pattern` del `user_code` de una sola constante.
- **Reloj propio para el "visto hace X".** Sin él, el texto solo se actualizaría cuando el poll devolviera datos distintos: un TV que dejó de reportar se quedaría congelado en "hace 3 s" para siempre, que es justo el caso que D-05 quiere hacer visible.
- **Degradación del poll antes que estados exclusivos puros.** El analog (`AppWaitlistPage`) tiene 4 estados mutuamente excluyentes porque hace una sola carga. Acá hay un refresco cada 15 s, así que un error con filas ya en pantalla muestra un banner y conserva la tabla; el estado de error completo queda para cuando no hay nada cargado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** los 3 tasks
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-admin`, que es el checkout principal (con WIP de otra sesión), no el worktree de la fase. Idéntico a la desviación ya documentada en 164-02, 164-03 y 164-04.
- **Fix:** Se corrieron los mismos comandos en `/home/franco/projects/et-164-tv/el-templo-admin`. Ningún cambio de código.
- **Files modified:** ninguno
- **Verification:** eslint, prettier, tsc y `quasar build` verdes en el worktree; el checkout principal quedó intacto.
- **Committed in:** n/a (corrección de procedimiento)

**2. [Rule 3 - Blocking] `vue-tsc` no está instalado (y `npx` lo bajaría de la red)**

- **Found during:** Tasks 1-3 (verificación)
- **Issue:** El plan verifica con `npx vue-tsc --noEmit`. `vue-tsc` no está en `node_modules` del admin (ni siquiera transitivamente: `vite-plugin-checker` está instalado pero configurado **solo** con `eslint`, sin `vueTsc`), así que `npx` lo descargaría = instalar una dependencia sin permiso (C-08).
- **Fix:** Tres verificaciones que juntas cubren lo que el plan pedía: (a) `tsc -p tsconfig.json --noEmit` con baseline capturado ANTES de tocar nada (32 líneas de errores preexistentes) y `diff` vacío después de cada task; (b) para el `.vue`, extracción del bloque `<script setup>` a un `.ts` temporal dentro de `src/` (borrado inmediatamente después) → **0 errores propios** y ningún error nuevo en el resto; (c) `quasar build` completo, que compila el SFC de verdad y corre eslint sobre todo `src/` vía `vite-plugin-checker`.
- **Files modified:** ninguno
- **Verification:** `diff baseline after` vacío en los 3 tasks; build exitoso con el chunk `assets/TvDevicesPage-B2l_nViv.js` (8.77 KB) emitido.
- **Committed in:** n/a

**3. [Rule 1 - Bug] El docblock del composable rompía su propio gate de grep**

- **Found during:** Task 1
- **Issue:** El criterio exige `grep -c "console\." useTvApi.ts` = 0, y el docblock decía justamente "nada de `console.*`" → daba 1. Tercera vez que la fase tropieza con lo mismo (164-01 desviación #4, 164-03 desviación #3): el gate es correcto, la prosa que nombra lo prohibido lo dispara.
- **Fix:** Reformulado a "no escribe a la consola del navegador (eso lo hace `createLogger` en la página)", sin perder la explicación.
- **Files modified:** `el-templo-admin/src/composables/useTvApi.ts`
- **Verification:** `grep -c "console\." src/composables/useTvApi.ts` → 0.
- **Committed in:** `ff9d0093`

---

**Total deviations:** 3 auto-fixed (2 blocking de procedimiento, 1 bug de gate)
**Impact on plan:** Ninguna amplía el alcance funcional. Dos son de procedimiento (rutas del worktree, herramienta ausente) y la tercera es cosmética sobre un comentario.

## Issues Encountered

- **El typecheck de `.vue` sigue siendo parcial en esta máquina.** La extracción del `<script setup>` cubre el bloque de script (que es donde vive toda la lógica), pero **no** typechequea las expresiones del `<template>` — un `props.row.campoQueNoExiste` en un slot no lo detecta nadie hasta que alguien abre la pantalla. Es el mismo agujero que ya documentaron 164-04 y `reference_ci_no_typecheck_frontends.md`; se mitigó revisando los slots contra el tipo `TvDeviceDisplayRow` a mano.
- **El pre-commit (lint-staged) reescribe con prettier**, así que los greps de aceptación se re-verificaron después de commitear.
- **`quasar build` corre `build-tv.mjs` primero** (encadenado desde el plan 164-04): la corrida de verificación regeneró `public/tv/` y `dist/spa/tv/`, ambos gitignoreados. `git status` quedó limpio.

## Known Stubs

Ninguno. Las tres operaciones (vincular, listar, revocar) están cableadas contra rutas reales del API — no hay datos mockeados ni botones sin acción. Lo único que esta pantalla **no** hace es el control de la clase (bloques/niveles/ejercicio/timer): eso es el plan 164-12, que colgará sus métodos del mismo `useTvApi`.

## Threat Flags

Ninguno. El plan no agrega endpoints ni superficie de datos nueva: consume las tres rutas que 164-03 ya modeló (T-164-09..T-164-14). Las mitigaciones que el `<threat_model>` asignaba a estos archivos quedaron verificadas:

| Threat   | Estado                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| T-164-36 | Doble gate: `meta.allowedRoles: TV_CONTROL_ROLES` (UX) + `TV_CONTROL_ROLES` del API (autoridad). El nav solo oculta.                    |
| T-164-37 | `grep -ci "token"` sobre `TvDevicesPage.vue` → 0. El composable tampoco lo maneja (docblock explícito).                                 |
| T-164-38 | El selector arranca en la sede del usuario (D-11) y `requireBranchAccess({ from: "body.branchId" })` decide; las virtuales ni aparecen. |
| T-164-39 | `setInterval` en `onMounted` / `clearInterval` + `tvApi.cleanup()` en `onUnmounted` de la página.                                       |
| T-164-SC | Cero paquetes instalados. `vue-tsc` faltante se resolvió con herramientas locales, sin `npx`.                                           |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Wave 3 cerrada.** Sigue el plan 164-08 (wave 4): `GET /api/tv/state` + `client-log` + tests de integración del poll.
- **Para el plan 164-12 (botonera del profe):** agregar los métodos del control a `useTvApi.ts` (es el único wrapper del módulo) y la ruta `tv/control` — **nunca** `tv`. `TV_CONTROL_ROLES` ya está exportado en `templo-config.ts` para reusar en el `meta`.
- **Para el plan 164-11 (kiosco):** el circuito de vinculación está completo de punta a punta salvo el lado del televisor; en cuanto el kiosco muestre el `user_code` y polleé `/pair/status`, esta pantalla ya lo puede reclamar.
- **UAT pendiente (no automatizable acá):** el flujo manual contra la API local (start desde el kiosco → claim → aparece listado → revocar lo marca inactivo) requiere el API corriendo contra MySQL; se verificó todo el lado estático (build, tipos, lint, gates) pero nadie ejercitó todavía el ida y vuelta real.
- **Sin push.** La rama `feat/164-tv-sucursal` sigue siendo local (staging-first estricto).

## Self-Check: PASSED

- 2/2 archivos creados existen en disco; 2/2 modificados verificados por `grep` (`TvDevicesPage` en `routes.ts` = 1, "Televisores" en `templo-config.ts` = 3).
- 3/3 commits de task encontrados en `git log` (`ff9d0093`, `2ca686a9`, `c248ed4d`).
- Verificación a nivel plan (post-commit, post-prettier):
  - `tsc -p tsconfig.json --noEmit` → idéntico al baseline previo al plan (diff vacío).
  - `<script setup>` de `TvDevicesPage.vue` extraído a un `.ts` temporal → 0 errores; archivo borrado.
  - `eslint -c ./eslint.config.js` limpio en los 4 archivos; `prettier --check` limpio.
  - `quasar build` → **Build succeeded**, chunk `TvDevicesPage-B2l_nViv.js` (8.77 KB) emitido y `dist/spa/tv/` intacto (index.html, fonts, marble.jpg, logo.png, timer-vectors.json, version.txt).
  - Gates de grep: `onUnmounted` en el composable 0, `cleanup` 4, `: any` 0, `console.` 0; en la página `console.` 0, `createLogger` 2, `token` (case-insensitive) 0, `clearInterval` 1 dentro del `onUnmounted`.
  - Chequeo de node del `<verify>`: `ROUTES_OK` (no existe `path: 'tv'` ni `'/tv'` en `routes.ts`).
  - `git status --porcelain` → limpio.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
