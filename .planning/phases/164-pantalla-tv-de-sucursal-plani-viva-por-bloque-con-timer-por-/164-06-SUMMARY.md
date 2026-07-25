---
phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-
plan: 06
subsystem: frontend
tags:
  [tv, kiosk, css, chromium-53, compatibilidad, escalado, diagnostico, admin]

# Dependency graph
requires:
  - phase: 164-04
    provides: "arbol src/tv/ (index.html, styles.css, main.ts, logger.ts, stubs) + build-tv.mjs + tsconfig es2015"
provides:
  - "styles.css del kiosco sin ninguna feature posterior a Chromium 53 (D-20): sin container queries, sin relacion de aspecto, sin rejilla, sin separacion automatica de flex"
  - "scaleTv() / tvWidth(): marco 16:9 en px + font-size raiz = ancho/100 (1rem == 1% del marco, la unidad del mockup v8)"
  - "pad2(): unico helper de relleno a dos digitos de src/tv/ (reemplaza el metodo nativo ES2017)"
  - "renderDiag(): pantalla /tv/?diag=1 con user agent, 12 feature-detects, version, latencia del API y las ultimas 20 lineas del log (D-24)"
  - "tvApiBase(): resolucion de la base del API (host actual + override ?api=) para que el poll de 164-11 no escriba una segunda"
  - "Esqueleto + estilos de las pantallas pairing / reposo / cierre"
affects: [164-07, 164-11, 164-12, 164-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Layout compatible escrito UNA sola vez (sin bloques condicionales): el camino que se ve en escritorio es el que corre en el TV"
    - "Escalado de kiosco por font-size raiz calculado en JS + medidas en rem (nunca em: no se componen en cascada)"
    - "Simbolos fuera del alfabeto latino con stack de fuentes de sistema; los que ni el sistema tiene, dibujados en CSS"
    - "Pantalla de diagnostico en la propia UI como sustituto de devtools inexistentes"

key-files:
  created: []
  modified:
    - el-templo-admin/src/tv/styles.css
    - el-templo-admin/src/tv/index.html
    - el-templo-admin/src/tv/scale.ts
    - el-templo-admin/src/tv/diag.ts
    - el-templo-admin/src/tv/logger.ts

key-decisions:
  - "El canal entre las columnas 45/55 es padding-right de la izquierda y no margin: con box-sizing border-box los dos flex-basis siguen sumando 100% exacto (con margin sumarian 100% + canal y la derecha se desbordaba)"
  - "html { font-size: 19.2px } como fallback pre-JS: si scaleTv() no llegara a correr, la pagina se ve con la proporcion del TV de referencia en vez de con 16px del browser"
  - "pad2() vive en scale.ts y logger.ts lo importa: habia dos copias del mismo helper de 1 linea (DRY, CLAUDE.md)"
  - "El triangulo del ejercicio en curso tambien usa el stack de sistema: NunitoSans no garantiza ese glifo mas que Cinzel el griego (generalizacion de Pitfall 6)"
  - "El diag separa 'REQUERIDO POR EL KIOSCO' (OK/FALTA) de 'MOTOR' (SI/NO): un NO en container queries es lo ESPERADO en un webOS 4.x y no debe leerse como falla"
  - "El diag manda el device token en la consulta de prueba (nunca lo pinta): asi distingue 'sin red' de 'token revocado', que es la pregunta real en la sede"
  - "tvApiBase() se exporta desde diag.ts con la nota de que 164-11 la reuse: dos criterios distintos para armar la URL del API es como se rompe un kiosco en una sede y no en la maquina del que programa"

patterns-established:
  - "Toda medida del mockup v8 expresada como 1% del ancho del marco se escribe en rem y la fija scale.ts"
  - "Ningun modulo de src/tv/ usa la propiedad de HTML crudo: solo createElement + textContent"

requirements-completed: [D-20, D-24]

# Metrics
duration: 18min
completed: 2026-07-24
---

# Phase 164 Plan 06: CSS compatible, escalado y diagnostico Summary

**El mockup v8 corre ahora en un motor de 2016: `cqw` → `rem` con el font-size raiz calculado por `scaleTv()`, rejilla → flex 45/55 sin separacion automatica, simbolos griegos con stack de sistema y el de kairos dibujado en CSS; y `/tv/?diag=1` imprime en la pantalla del televisor lo unico que se puede saber de un kiosco sin devtools.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-24T22:12:00Z
- **Completed:** 2026-07-24T22:30:00Z
- **Tasks:** 3 · **Files modified:** 5

## Accomplishments

- **El CSS ya no cruza ningun umbral de la matriz de motores.** Salieron las container queries (Chromium 105), la relacion de aspecto (88), la separacion automatica de flex (84 — la trampa: es MAS nueva que la rejilla) y la rejilla (57). Tambien salio el equilibrado de saltos de linea del titulo (114) y la funcion de comparacion del ancho (79), que el plan no listaba y venian del mockup. Piso real del archivo: **Chromium 53**, con `tabular-nums` (52) como la feature mas nueva que queda.
- **El escalado es exactamente el del mockup.** `scaleTv()` fija `#tv` en px (16:9 sobre el lado que limite) y `html { font-size: ancho/100 }`, asi que **1rem vale lo mismo que valia 1% del ancho del marco**: la conversion del CSS fue mecanica, medida por medida, y las proporciones se sostienen a cualquier tamaño de ventana. Verificado en un DOM stub: 1600x900 → marco 1600x900 y 16px por rem; al ensanchar a 3000x900 el marco se queda en 1600x900 (manda el alto).
- **Las dos columnas suman 100% exacto.** `flex: 0 0 45%` / `flex: 0 0 55%` + `min-width: 0`, y el canal de separacion es padding **dentro** del 45% (con `box-sizing: border-box` el flex-basis se mide sobre el border-box). Con margin, la fila habria sumado 100% + canal y la columna del video se habria desbordado — el tipo de bug que en un TV se ve como "el video quedo cortado" y nadie puede depurar.
- **Los simbolos no dependen de Cinzel.** `.glyph` fuerza el stack de sistema para α/Δ/Σ y `.glyph.kairos` **dibuja** el simbolo (circulo con borde + punto central por `::after`, ambos con `currentColor` para que herede el oro del header). El caracter U+2609 no aparece en ningun archivo: `grep` sobre `styles.css` da 0.
- **`/tv/?diag=1` es el instrumento de campo.** Imprime user agent completo, ventana + marco calculado + cuantos px vale un rem, version local contra `version.txt` (y si difieren avisa que falta recargar), 12 feature-detects, status y latencia de un `GET /api/tv/state`, y las ultimas 20 lineas del buffer del logger. Todo con `createElement`/`textContent` — cero HTML crudo — y el device token **truncado a sus ultimos 4 caracteres**, porque la pantalla es publica y fotografiable.
- **Probado en runtime, no solo compilado.** Como no hay browser ni televisor disponibles, se corrio el bundle generado dentro de un DOM stub en Node: `scaleTv()` escribe las tres medidas correctas, el `resize` re-escala, `renderDiag()` limpia el marco y dibuja, el user agent aparece y el token completo **no** aparece. Es la unica verificacion automatica posible de esta capa antes del UAT en hardware.

## Task Commits

1. **Task 1: Conversion de compatibilidad del CSS y del HTML** — `92f2706d` (feat)
2. **Task 2: scale.ts — marco 16:9 y escalado tipografico por JS** — `f70ae82f` (feat)
3. **Task 3: diag.ts — pantalla de diagnostico ?diag=1** — `cc4113ae` (feat)

## Files Created/Modified

- `el-templo-admin/src/tv/styles.css` — Reescrito. Encabezado con el contrato de compatibilidad (que esta prohibido y desde que version) para que nadie reintroduzca una feature moderna "porque en Chrome anda". Se agregaron `.glyph`/`.glyph.kairos` y los estilos de las tres pantallas alternativas.
- `el-templo-admin/src/tv/index.html` — Esqueleto de `#pantallaPairing` / `#pantallaReposo` / `#pantallaCierre` con sus ids, y nota de compatibilidad en la cabecera. Ningun id previo se toco.
- `el-templo-admin/src/tv/scale.ts` — `scaleTv()`, `tvWidth()` y `pad2()`. Guards: sin `#tv` o con la ventana reportando 0 (pasa en el arranque de algunos motores de TV) sale sin tirar.
- `el-templo-admin/src/tv/diag.ts` — `renderDiag()` y `tvApiBase()`.
- `el-templo-admin/src/tv/logger.ts` — Borra su copia privada de `pad2` y la importa de `scale.ts`.

## Decisions Made

- **El canal 45/55 va como padding, no como margin.** El plan pedia margenes explicitos en los hijos; para el canal entre columnas eso rompia la suma de los flex-basis. Los margenes si se usaron en todo el resto (dots, items de la lista, filas del timer, panel de lista contra panel de timer).
- **Fallback de `html { font-size: 19.2px }` (1920/100).** Cubre el instante previo al primer `scaleTv()` y el caso de que el JS muera: en vez de un layout con rem de 16px sobre un marco de 1920, se ve la proporcion correcta.
- **`#tv` conserva `width/height: 100%` en CSS** como estado previo al calculo. Si `scaleTv()` no corriera, se ve el marco entero deformado en vez de un div de 0 px (que es indistinguible de una pantalla en blanco).
- **El diag distingue "requerido" de "motor".** Cinco detects son requisitos reales del kiosco (fetch, Promise, localStorage, object-fit, custom properties) y se pintan OK/FALTA en verde/rojo; los siete restantes (relleno de string ES2017, utilidades de objeto, observer de redimension, container queries, relacion de aspecto, rejilla, AudioContext) se pintan SI/NO en gris: sirven para ubicar la antiguedad del motor, y un NO ahi es lo esperado.
- **El detect usa el nombre literal del metodo ES2017.** Es la unica aparicion de esa cadena en `src/tv/` y es una **clave de string en un `in`**, nunca una llamada. El criterio del task 2 (`grep -c padStart src/tv/*.ts` = 0) y el del task 3 (imprimir ese detect) son incompatibles entre si: se resolvio dejando la cadena solo en el detect y reescribiendo los comentarios de `scale.ts` y `logger.ts` que la mencionaban de paso.
- **`catch` sin binding.** Tres bloques descartan el error; el linter marcaba el parametro sin usar. Es sintaxis ES2019, pero esbuild la baja: se verifico que el bundle emitido solo contiene `catch(e)`/`catch(n)`/`catch(r)`, sin binding opcional.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dos features prohibidas que el plan no listaba sobrevivian del mockup**

- **Found during:** Task 1
- **Issue:** `text-wrap: balance` en el titulo del bloque (Chromium **114** — mas nueva que todo lo que el plan enumeraba) y `width: min(100%, calc(...))` en `#tv` (funcion de comparacion, Chromium **79**). El gate automatico del plan no las busca, asi que habrian pasado el verify y roto igual en la sede.
- **Fix:** El equilibrado de saltos se elimino (es cosmetico, degradaba a nada). El `min()` desaparecio solo al pasar la geometria a `scale.ts`.
- **Files modified:** `el-templo-admin/src/tv/styles.css`
- **Verification:** `grep -c "text-wrap" styles.css` → 0; `grep -c "min("` → 0. El encabezado del archivo ahora lista ambas entre las prohibidas para que el proximo que edite las vea.
- **Committed in:** `92f2706d`

**2. [Rule 2 - Missing Critical] El canal entre columnas con margin desbordaba la fila**

- **Found during:** Task 1
- **Issue:** El plan mandaba reemplazar toda separacion por `margin` en los hijos. Aplicado al canal de 1.2rem entre las columnas de 45% y 55%, la fila pasa a medir 100% + 1.2rem y la columna del video se desborda (o se comprime, segun el motor).
- **Fix:** El canal es `padding-right` de la columna izquierda; con `box-sizing: border-box` (ya global) entra dentro del 45% y la suma sigue siendo 100% exacto. El resto de las separaciones si son margenes, como pedia el plan.
- **Files modified:** `el-templo-admin/src/tv/styles.css`
- **Verification:** Un unico `flex: 0 0 45%` y un unico `flex: 0 0 55%`, sin margenes horizontales entre ellas.
- **Committed in:** `92f2706d`

**3. [Rule 2 - Missing Critical] El triangulo del ejercicio activo corria el mismo riesgo que los simbolos griegos**

- **Found during:** Task 1
- **Issue:** El plan cubre α Δ Σ (stack de sistema) y el de kairos (dibujado), pero deja `content: '▶  '` heredando NunitoSans, que tampoco garantiza ese glifo. Es el indicador de "que ejercicio estamos haciendo": si sale tofu, la pantalla pierde su funcion principal.
- **Fix:** El pseudo-elemento usa el mismo stack de sistema que `.glyph`. No se dibujo en CSS para no alterar el diseño cerrado (el triangulo con bordes cambia la alineacion de la linea base).
- **Files modified:** `el-templo-admin/src/tv/styles.css`
- **Verification:** `.listaCol .item.activo .ej::before` declara `font-family: var(--glyph)`.
- **Committed in:** `92f2706d`

**4. [Rule 2 - Missing Critical / CLAUDE.md DRY] `pad2` estaba duplicado**

- **Found during:** Task 2
- **Issue:** El plan pide que `scale.ts` exporte `pad2` "porque el helper tiene que existir en algun lado", pero `logger.ts` (plan 164-04) ya tenia una copia privada identica. Dos implementaciones del mismo helper de una linea, en el modulo que justamente prohibe el metodo nativo.
- **Fix:** `scale.ts` lo exporta y `logger.ts` lo importa. `logger.ts` esta fuera de los `files_modified` del plan, pero dejar la copia contradecia CLAUDE.md (DRY agresivo) y el proposito del helper.
- **Files modified:** `el-templo-admin/src/tv/scale.ts`, `el-templo-admin/src/tv/logger.ts`
- **Verification:** `tsc -p src/tv/tsconfig.tv.json --noEmit` limpio; el smoke test del bundle loguea con el timestamp bien formateado.
- **Committed in:** `f70ae82f`

**5. [Rule 2 - Missing Critical] El esqueleto de las tres pantallas**

- **Found during:** Task 1
- **Issue:** El plan pide estilos para pairing/reposo/cierre, pero el markup de esas tres pantallas estaba vacio (164-04 las dejo como divs sin hijos). Escribir CSS contra un markup que no existe deja el archivo con reglas muertas y, peor, sin contrato: el plan 164-11 tendria que adivinar los nombres de clase o generar nodos por tick (Pitfall 13).
- **Fix:** Se agrego el esqueleto (contenido centrado, logo, reloj, quote, autor, codigo de pairing) con ids explicitos. Los textos arrancan vacios: el render de 164-11 solo hace `textContent`.
- **Files modified:** `el-templo-admin/src/tv/index.html`
- **Verification:** El build inlinea el CSS y el HTML sin placeholders sin reemplazar; el gate de compatibilidad no encuentra nada prohibido en el HTML.
- **Committed in:** `92f2706d`

**6. [Rule 3 - Blocking] Los comandos `<verify>` del plan apuntaban al checkout compartido**

- **Found during:** Tasks 1-3
- **Issue:** Los bloques `<automated>` arrancan con `cd /home/franco/projects/el-templo/el-templo-admin`, que es el checkout principal (con WIP de otra sesion), no el worktree de la fase. Misma correccion ya documentada en 164-02 y 164-04.
- **Fix:** Los mismos comandos corridos en `/home/franco/projects/et-164-tv/el-templo-admin`. Ademas `npx tsc` se reemplazo por `./node_modules/.bin/tsc` para no arriesgar una descarga de red (C-08).
- **Files modified:** ninguno
- **Verification:** Gate, typechecks, build, lint y prettier verdes en el worktree.
- **Committed in:** n/a

---

**Total deviations:** 6 auto-fixed (1 bug de compatibilidad, 4 missing critical, 1 blocking de procedimiento)
**Impact on plan:** Ninguna amplia el alcance. Cuatro endurecen exactamente lo que el plan declara proteger (que nada posterior a Chromium 53 llegue al televisor y que ningun glifo salga tofu), una es DRY sobre un archivo vecino y la ultima es de procedimiento.

## Issues Encountered

- **El verify manual del plan ("abrir `public/tv/index.html` en un browser local y comprobar que el marco escala") no se pudo hacer:** no hay browser en este entorno. Se sustituyo por un smoke test del **bundle generado** dentro de un DOM stub en Node, que verifica las medidas que escribe `scaleTv()`, el re-escalado en `resize`, y que `renderDiag()` limpia el marco, imprime el user agent y **no** filtra el token. Eso cubre el runtime, **no** el pintado: que el layout se vea como el mockup sigue pendiente de ojo humano (checkpoint de UAT de la fase).
- **Los criterios de aceptacion de los tasks 2 y 3 se contradicen** en el grep del metodo de relleno ES2017 (ver Decisions). Estado final: 1 aparicion, en `diag.ts`, como clave de string de un feature-detect.
- **`vue-tsc` sigue sin estar instalado** (documentado en 164-04). Este plan no toca `.vue`, asi que el `tsc` local cubre todo lo que se modifico. El typecheck global del admin sigue en las mismas 32 lineas de errores preexistentes, ninguna en `src/tv/`.

## Known Stubs

Los dos que quedan son los que la fase asigno a otros planes, sin cambios:

| Archivo              | Stub            | Lo implementa |
| -------------------- | --------------- | ------------- |
| `src/tv/selftest.ts` | `runSelfTest()` | Plan 164-07   |
| `src/tv/boot.ts`     | `boot(quotes)`  | Plan 164-11   |

Los estilos y el markup de las pantallas pairing/reposo/cierre existen pero todavia nadie los muestra (`.visible` lo togglea el render de 164-11): es el contrato que este plan deja listo, no un stub sin dueño.

## Threat Flags

Ninguno nuevo. Las tres mitigaciones que el `<threat_model>` asigna a este plan quedaron implementadas y verificables:

- **T-164-25 (XSS):** `grep -c innerHTML src/tv/diag.ts` → 0. Todo el diag se dibuja con `createElement` + `textContent`, incluido el user agent.
- **T-164-26 (token en pantalla):** el diag imprime `····` + los ultimos 4 caracteres y la longitud; el smoke test falla si el token completo aparece en el DOM. El payload del poll nunca se pinta: del `GET /api/tv/state` solo salen status y milisegundos.
- **T-164-27 (pantalla en blanco):** layout compatible unico (sin bloques condicionales), gate automatico que rechaza las features prohibidas, y `?diag=1` como instrumento de campo.
- **T-164-SC:** cero paquetes instalados; `tsc`, `eslint` y `prettier` se corrieron desde `node_modules` local, sin `npx` que pudiera bajar nada.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Para el plan 164-07 (`timer.ts` / `selftest.ts`):** usar `pad2` de `scale.ts` para los digitos; el selftest puede dibujarse con el mismo patron del diag (`createElement` + `textContent`, fondo oscuro, medidas en rem).
- **Para el plan 164-11 (el kiosco):**
  - **Reusar `tvApiBase()`** de `diag.ts` (o promoverla a un modulo compartido) en vez de escribir una segunda resolucion de la base del API.
  - Los ids del esqueleto ya existen: `pairingCodigo`, `pairingInstruccion`, `reposoReloj`/`reposoFecha`/`reposoQuote`/`reposoAutor`, `cierreTitulo`/`cierreReloj`/`cierreQuote`/`cierreAutor`. Se muestran agregando `visible` a la clase de `.pantalla` y se actualizan con `textContent` (nunca recreando nodos: Pitfall 13).
  - Los simbolos de nivel se pintan como `<span class="glyph">Δ</span>` y el de kairos como `<span class="glyph kairos"></span>` (sin texto: el CSS lo dibuja).
  - La lista de ejercicios usa `.compacta` en la caja para listas de mas de 5 items, y `.activo` en el item en curso.
- **Para el UAT en hardware (D-20/D-24):** el paso 1 en la sede es abrir `https://admin-staging.eltemplo.org/tv/?diag=1` y fotografiar la pantalla. Si `REQUERIDO POR EL KIOSCO` tiene algun FALTA, ese es el diagnostico completo; si esta todo OK y la pantalla normal igual falla, el problema es de layout y no de motor.

## Self-Check: PASSED

- 5/5 archivos declarados como modificados existen en disco.
- 3/3 commits de task encontrados en `git log` (`92f2706d`, `f70ae82f`, `cc4113ae`).
- Gate de compatibilidad: `CSS_COMPAT_OK` (sin `cqw`, `cqh`, `container-type`, la at-rule de contenedor, relacion de aspecto, rejilla ni separacion automatica de flex, en CSS ni en HTML, con los comentarios removidos antes de buscar).
- Greps de aceptacion: `flex: 0 0 45%` = 1, `flex: 0 0 55%` = 1, `min-width: 0` = 3, `.glyph` = 4, simbolo de kairos = 0, `pantallaReposo`/`pantallaCierre`/`pantallaPairing` presentes, `ResizeObserver` en `scale.ts` = 0, `innerHTML` en `diag.ts` = 0, `slice(-4)` en `diag.ts` = 1.
- `tsc -p src/tv/tsconfig.tv.json --noEmit` → exit 0. `tsc -p tsconfig.json --noEmit` → 32 lineas, identico al baseline de 164-04, 0 en `src/tv/`.
- `node scripts/build-tv.mjs` → verde, `public/tv/index.html` 25.4 KB, `DIAG_OK` (el codigo del diag esta en el bundle).
- Smoke test del bundle en DOM stub → `SMOKE_OK` en modo kiosco y en `?diag=1` (marco 1600x900, 16px por rem, re-escalado en resize, marco limpiado, user agent presente, token truncado).
- `eslint` y `prettier --check` limpios sobre los archivos tocados. `git status --porcelain` limpio.

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Completed: 2026-07-24_
