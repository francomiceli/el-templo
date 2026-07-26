---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 04
subsystem: infra
tags: [tv, kiosk, esbuild, es2015, build-pipeline, self-hosted-assets, admin]

# Dependency graph
requires:
  - phase: 164-02
    provides: "timer-vectors.json (los 6 vectores dorados que el build copia a /tv/)"
provides:
  - "public/tv/: pagina estatica autocontenida generada en build (index.html con CSS+JS inline, version.txt, fuentes, marmol, logo, timer-vectors.json)"
  - "scripts/build-tv.mjs: pipeline fail-fast typecheck -> bundle -> assets -> inline -> version"
  - "src/tv/tsconfig.tv.json: el linter de compatibilidad del kiosco (target es2015 / lib es2015+dom)"
  - "src/tv/: arbol de modulos del kiosco (main dispatcher, logger con buffer, stubs de scale/diag/selftest/boot)"
  - "window.__TV_VERSION__ + /tv/version.txt: el par que habilita el auto-reload (D-22)"
affects: [164-05, 164-06, 164-07, 164-09, 164-11, 164-12, 164-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kiosco fuera del SPA: artefacto estatico propio compilado a ES2015, sin Vue/Quasar/Sentry"
    - "tsconfig con lib acotada usado como linter de compatibilidad de runtime"
    - "CSS y JS inline en el HTML para esquivar el cache immutable de 1 año del nginx"
    - "Assets self-hosted decodificados en build del base64 que ya usa el PDF (fuente unica de la estetica)"
    - "Escritura idempotente con mtime heredada del origen (patron de copy-ffmpeg.mjs) para no re-rsyncar en el deploy"

key-files:
  created:
    - el-templo-admin/scripts/build-tv.mjs
    - el-templo-admin/src/tv/tsconfig.tv.json
    - el-templo-admin/src/tv/index.html
    - el-templo-admin/src/tv/styles.css
    - el-templo-admin/src/tv/main.ts
    - el-templo-admin/src/tv/logger.ts
    - el-templo-admin/src/tv/scale.ts
    - el-templo-admin/src/tv/diag.ts
    - el-templo-admin/src/tv/selftest.ts
    - el-templo-admin/src/tv/boot.ts
  modified:
    - el-templo-admin/package.json
    - el-templo-admin/.gitignore

key-decisions:
  - "Task 1 (extraer QUOTES) ya estaba hecho en master por un commit anterior no relacionado: quotes.ts existe y session-pdf-builder.ts lo importa — no se toco nada"
  - "El kiosco consume el tipo `SessionQuote` que quotes.ts ya exporta en vez de agregar un alias `TvQuote` (seria un segundo nombre para la misma forma)"
  - "Las QUOTES se importan SOLO en main.ts y bajan por parametro a boot(quotes): un unico punto de entrada de las frases al bundle"
  - "Las pantallas pairing/reposo/cierre son overlays absolutos del marco 16:9: tapan la pantalla de clase entera, el render no tiene que ocultarla aparte"
  - "El CSS de la botonera de demo del mockup no se copio: sin markup que lo use seria CSS muerto viajando inline a cada TV"
  - "build-tv.mjs escribe solo lo que cambio; un rebuild identico deja public/tv/ intacto (mtimes incluidas) para que rsync no lo reenvie"

patterns-established:
  - "Todo modulo de src/tv/ se escribe sin padStart, Object.entries, ?., ??, spread de objetos, ResizeObserver ni AbortController — el tsconfig del kiosco lo rechaza en compilacion, no en la sede"
  - "logger.ts es el UNICO lugar de src/ donde se llama a console, y su docblock explica por que no reusa createLogger del SPA"
  - "Cualquier asset nuevo del kiosco sale del base64 de pdf-assets.ts, nunca de un CDN ni de un archivo binario commiteado"

requirements-completed: [D-06, D-08, D-20, D-22, D-24]

# Metrics
duration: 11min
completed: 2026-07-24
---

# Phase 164 Plan 04: Andamiaje del kiosco /tv Summary

**Pipeline `build-tv.mjs` que produce un `/tv/index.html` de 13.6 KB autocontenido (CSS y JS inline, fuentes/marmol/logo self-hosted, `version.txt`) a partir de un arbol `src/tv/` que compila bajo un tsconfig ES2015 que rechaza en build cualquier built-in posterior a Chromium 53.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-24T21:36:40Z
- **Completed:** 2026-07-24T21:47:30Z
- **Tasks:** 3 (1 sin cambios — ya estaba hecho en master)
- **Files created:** 10 · **modified:** 2

## Accomplishments

- **El gate de compatibilidad existe y muerde.** `src/tv/tsconfig.tv.json` compila con `target es2015` + `lib ["es2015","dom"]` y `types: []`. Probado en vivo: un archivo con `String.padStart` y `Object.entries` rompe el build con TS2550 ("Try changing the 'lib' compiler option to 'es2017' or later"). El error aparece en la maquina del que programa, no en el televisor de Mogotes.
- **`/tv/` es un artefacto separado del SPA.** `scripts/build-tv.mjs` corre typecheck → bundle IIFE es2015 con esbuild → decodifica los assets → copia los vectores → inlinea todo en `index.html`. 13.6 KB de HTML con cero requests a `.js`/`.css`: el cache `immutable` de 1 año del nginx del admin no puede congelar un TV en una version vieja (Pitfall 7).
- **Cero dependencias nuevas.** esbuild se resuelve del `node_modules` que ya trae vite (0.25.12) con un `await import` en try/catch, y si faltara el script muere con un mensaje que dice explicitamente que agregarlo requiere aprobacion humana (C-08). Las fuentes, el marmol y el logo se decodifican del base64 de `pdf-assets.ts` que ya alimenta el PDF: sin CDN (C-12) y sin binarios nuevos en git.
- **El build es idempotente y no ensucia el deploy.** Solo escribe los archivos cuyo contenido cambio, y les hereda la mtime del origen (patron de `copy-ffmpeg.mjs`). Una segunda corrida deja `public/tv/` byte a byte igual, con las mtimes intactas → rsync no reenvia los ~500 KB de fuentes en cada deploy.
- **El contrato interno para las waves siguientes quedo fijado:** `main.ts` despacha `?selftest=1` / `?diag=1` / kiosco y llama `scaleTv()` en el arranque y en cada `resize`; `logger.ts` expone `createTvLogger` + `getTvLogBuffer()` (50 entradas) para `?diag=1` y `POST /api/tv/client-log`; `scale/diag/selftest/boot` son stubs con el TODO del plan que los rellena.

## Task Commits

1. **Task 1: Extraer QUOTES del PDF a un modulo propio** — sin commit (ya hecho en master: `116a0d44` + `60f8a38e`)
2. **Task 2: Esqueleto de src/tv** — `498cb257` (feat)
3. **Task 3: build-tv.mjs** — `71431dd3` (feat)

## Files Created/Modified

- `el-templo-admin/scripts/build-tv.mjs` — Pipeline del kiosco en 7 pasos, todos fail-fast con `process.exit(1)` para que CI lo vea.
- `el-templo-admin/src/tv/tsconfig.tv.json` — El linter de compatibilidad. No extiende el tsconfig del admin a proposito y el docblock explica por que.
- `el-templo-admin/src/tv/index.html` — Plantilla del kiosco: el `<body>` del mockup v8 sin la botonera de demo, con los marcadores `<!--__STYLE__-->` / `<!--__SCRIPT__-->`, todos los `id` que consume el render del plan 164-11 y los tres contenedores `pantallaPairing` / `pantallaReposo` / `pantallaCierre`.
- `el-templo-admin/src/tv/styles.css` — CSS del mockup tal cual (todavia con `cqw`, `grid` y `aspect-ratio`: la conversion de compatibilidad es el plan 164-06), con las `@font-face` apuntando a `fonts/*.ttf` y el fondo a `marble.jpg`.
- `el-templo-admin/src/tv/main.ts` — Entry unico: dispatcher por query string, `scaleTv()` + listener de `resize`, import de `QUOTES` y declaracion de `window.__TV_VERSION__`.
- `el-templo-admin/src/tv/logger.ts` — `createTvLogger(context)` (`debug/info/warn/error` con prefijo `[tv:context]`) + buffer circular de 50 entradas.
- `el-templo-admin/src/tv/scale.ts`, `diag.ts`, `selftest.ts`, `boot.ts` — Stubs cableados, con el TODO del plan que los implementa (164-06 / 164-07 / 164-11).
- `el-templo-admin/package.json` — `build` encadena `node scripts/build-tv.mjs && quasar build`; nuevo `build:tv`. `postinstall` sin tocar.
- `el-templo-admin/.gitignore` — `/public/tv` ignorado: se genera, no se commitea.

## Decisions Made

- **`SessionQuote` en vez de un `TvQuote` nuevo.** El plan pedia exportar un tipo `{text, goldText, author}` para el kiosco, pero `quotes.ts` ya exporta exactamente esa interfaz con el nombre `SessionQuote`. Agregar un alias seria un segundo nombre para la misma forma; el kiosco importa el que ya existe.
- **Las QUOTES entran al bundle por `main.ts` y bajan a `boot(quotes)`.** Es el key_link que pedia el plan y ademas evita que cada modulo del kiosco importe `../utils/pdf/quotes` por su cuenta. **El plan 164-11 debe tomar las frases del parametro de `boot`, no reimportarlas** en `render.ts`.
- **Las tres pantallas nuevas son overlays absolutos dentro de `#tv`** (`position:absolute` + `left/top/right/bottom:0`, ocultas con `.pantalla` / visibles con `.pantalla.visible`). Tapan la pantalla de clase completa, asi que el render no necesita un cuarto contenedor ni ocultar `topbar`/`cabecera`/`stage` por separado.
- **El CSS de `.demo` no se copio.** El plan mandaba sacar la botonera del mockup del HTML; dejar sus ~45 lineas de estilo seria CSS muerto viajando inline hasta cada televisor. Lo mismo con `.demoNota` (el cartel de la maqueta sobre el video).
- **El marcador de version se escribe como `window.__TV_VERSION__ = "<hash>";`** dentro del mismo `<script>` inline, y `version.txt` lleva el mismo valor sin newline: el chequeo de version del plan 164-11 compara uno contra otro.
- **Guardas de inyeccion en el inline:** el build aborta si el bundle contiene `</script>` o el CSS contiene `</style>`, que son las dos unicas formas de que el inlineado rompa el documento.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 ya estaba hecho en master**

- **Found during:** Task 1
- **Issue:** El plan mandaba mover el array `QUOTES` de `session-pdf-builder.ts` a `quotes.ts`. Ese movimiento ya lo hizo un commit anterior no relacionado con la fase (`116a0d44`, renovacion de las 10 frases, + `60f8a38e`): `src/utils/pdf/quotes.ts` existe con `export const QUOTES`, `session-pdf-builder.ts:30` lo importa y ya no declara el array (`grep -c "const QUOTES" session-pdf-builder.ts` = 0).
- **Fix:** No se toco nada — reescribir el archivo solo para "cumplir la tarea" habria arriesgado justo lo que el plan queria evitar (cambios invisibles en el texto de las frases, que no tienen tests). Se verifico el estado y se siguio.
- **Files modified:** ninguno
- **Verification:** `grep -c "export const QUOTES" src/utils/pdf/quotes.ts` → 1; `grep -c "const QUOTES" src/utils/pdf/session-pdf-builder.ts` → 0; `tsc -p tsconfig.json --noEmit` sin errores nuevos.
- **Committed in:** n/a

**2. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** Tasks 1-3
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-admin`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase.
- **Fix:** Se corrieron los mismos comandos en `/home/franco/projects/et-164-tv/el-templo-admin`. Ningun cambio de codigo. (Misma correccion que ya se documento en el plan 164-02.)
- **Files modified:** ninguno
- **Verification:** build, typechecks y greps verdes en el worktree; `git status --porcelain` limpio.
- **Committed in:** n/a

**3. [Rule 3 - Blocking] `vue-tsc` no esta instalado en el admin**

- **Found during:** Task 1 (verificacion)
- **Issue:** El plan verifica con `npx vue-tsc --noEmit`, pero `vue-tsc` no esta en `node_modules` del admin (llega solo via `vite-plugin-checker` en tiempo de build). `npx` lo habria bajado de la red = instalar una dependencia sin permiso (C-08).
- **Fix:** Se uso el `tsc` local (`node_modules/.bin/tsc -p tsconfig.json --noEmit`), capturando el baseline ANTES de tocar nada (32 lineas de errores preexistentes en tests y .vue) y comparandolo despues: `diff` vacio.
- **Files modified:** ninguno
- **Verification:** `diff tsc-baseline.txt tsc-after.txt` → sin diferencias. Ademas `eslint` y `prettier --check` limpios sobre `src/tv/`.
- **Committed in:** n/a

**4. [Rule 1 - Bug] El marco 16:9 restaba los 90 px de la botonera de demo**

- **Found during:** Task 2
- **Issue:** El mockup calculaba `width: min(100%, calc((100vh - 2vh - 90px) * 16 / 9))` y `body { grid-template-rows: 1fr auto }` porque abajo vivia la tira de demo. Copiado tal cual al kiosco (que no tiene esa tira) el TV quedaba 90 px mas chico de lo que da la pantalla, con banda negra de regalo.
- **Fix:** Se quitaron los `90px` y la fila extra del body. Se agrego `cursor: none` (es un kiosco: no hay mouse) y `.cabecera .dots` como clase en vez del `style="display:inline-flex;gap:0.4cqw"` inline del mockup.
- **Files modified:** `el-templo-admin/src/tv/styles.css`, `el-templo-admin/src/tv/index.html`
- **Verification:** el CSS entra al `index.html` generado; la geometria definitiva la fija el plan 164-06 (que reemplaza este bloque por el escalado en JS).
- **Committed in:** `498cb257`

**5. [Rule 2 - Missing Critical] Guardas de inyeccion en el inlineado**

- **Found during:** Task 3
- **Issue:** El inlineado de CSS/JS dentro del HTML rompe el documento si el contenido trae `</script>` o `</style>` (T-164-16: lo que el TV ejecuta se decide en build time). El plan no pedia el chequeo.
- **Fix:** El build aborta con exit 1 si el bundle contiene `</script>` o el CSS contiene `</style>`. Ademas valida que los dos marcadores existan en la plantilla y que cada asset decodifique a mas de 0 bytes.
- **Files modified:** `el-templo-admin/scripts/build-tv.mjs`
- **Verification:** corrida normal verde; `TV_BUILD_OK` con los 9 archivos y sin placeholders sin reemplazar.
- **Committed in:** `71431dd3`

---

**Total deviations:** 5 auto-fixed (3 blocking de procedimiento, 1 bug de layout, 1 missing critical)
**Impact on plan:** Ninguna amplia el alcance. Tres son de procedimiento (rutas del worktree, herramienta ausente, tarea ya hecha), una arregla un artefacto de la maqueta que se colaba al producto y la ultima endurece el paso de inlineado que el propio `<threat_model>` (T-164-16) asigna a este archivo.

## Issues Encountered

- **`vue-tsc` no existe en el admin** y no se puede instalar sin permiso. El `tsc` local typechequea los `.ts` (que es lo que agrega este plan) pero **no** los `.vue`: para los planes de esta fase que toquen componentes Vue (164-08, 164-12) el typecheck local va a ser parcial. Coincide con lo que ya sabia el proyecto: CI tampoco typechequea los frontends.
- El `index.html` generado pesa 13.6 KB; los assets (fuentes + marmol + logo) suman ~512 KB, que es exactamente el motivo por el que `/public/tv` esta gitignoreado y por el que el build preserva mtimes.

## Known Stubs

Cuatro, todos intencionales y con TODO del plan que los rellena — son el andamiaje que esta fase declara construir:

| Archivo              | Stub            | Lo implementa |
| -------------------- | --------------- | ------------- |
| `src/tv/scale.ts`    | `scaleTv()`     | Plan 164-06   |
| `src/tv/diag.ts`     | `renderDiag()`  | Plan 164-06   |
| `src/tv/selftest.ts` | `runSelfTest()` | Plan 164-07   |
| `src/tv/boot.ts`     | `boot(quotes)`  | Plan 164-11   |

Consecuencia visible: hoy `/tv/` carga, aplica el CSS y loguea una linea; no dibuja nada dinamico. Es lo esperado para un plan de andamiaje.

## Threat Flags

Ninguno. El plan no agrega endpoints ni acceso a datos. Las mitigaciones del `<threat_model>` quedaron verificadas: sin CDN ni `<script src=` externo (T-164-16), CSS/JS inline + `version.txt` fuera del regex de cache del nginx (T-164-17), cero paquetes instalados y mensaje explicito si esbuild faltara (T-164-18 / T-164-SC), y el build aborta si `timer-vectors.json` no esta (T-164-19).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Wave 3 desbloqueada:** los planes 164-06 (CSS compatible + `scale.ts` + `diag.ts`) y 164-07 (`timer.ts` + `selftest.ts`) tienen el arbol de modulos, el tsconfig y el pipeline listos. Ambos deberian correr `pnpm build:tv` como verificacion.
- **Para el plan 164-11:** `boot(quotes: SessionQuote[])` recibe las frases por parametro — no reimportar `../utils/pdf/quotes` en `render.ts`. Los ids del HTML y los tres overlays (`pantallaPairing`/`pantallaReposo`/`pantallaCierre`) ya estan en la plantilla. `window.__TV_VERSION__` y `/tv/version.txt` llevan el mismo hash de 8 chars para el chequeo de D-22.
- **Para el plan de deploy (164-13):** `public/tv/` esta gitignoreado y lo genera `pnpm build` (encadenado antes de `quasar build`), asi que llega a `dist/spa/tv/` sin tocar el pipeline. Falta confirmar en staging que el nginx sirve `/tv/` sin caer en el fallback del SPA (assumption A1 del RESEARCH).
- **Pendiente de UAT en hardware:** el CSS todavia es el del mockup (container queries, `aspect-ratio`, `gap` en flex). Nadie deberia abrir `/tv/` en un TV de sede hasta que el plan 164-06 lo convierta.

## Self-Check: PASSED

- 10/10 archivos declarados como creados existen en disco; 2/2 modificados verificados por `grep`.
- 2/2 commits de task encontrados en `git log` (`498cb257`, `71431dd3`).
- `node scripts/build-tv.mjs` → exit 0, los 9 archivos de `public/tv/` presentes, `TV_BUILD_OK 13876 309054f9`, sin placeholders sin reemplazar y sin `<script src=` ni `<link rel="stylesheet">`.
- `tsc -p src/tv/tsconfig.tv.json --noEmit` → exit 0; con una sonda `padStart`/`Object.entries` → TS2550 (el gate funciona).
- `tsc -p tsconfig.json --noEmit` → identico al baseline previo al plan (sin errores nuevos). `eslint` y `prettier --check` limpios sobre `src/tv/`.
- `git status --porcelain el-templo-admin/public/tv | wc -l` → 0 (ignorado); `git status --porcelain` → limpio.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
