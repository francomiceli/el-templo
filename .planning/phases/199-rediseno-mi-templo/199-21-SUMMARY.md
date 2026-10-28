---
phase: 199-rediseno-mi-templo
plan: 21
subsystem: verificacion-final
tags: [capturas, contraste, fold, overflow, uat, d-15, d-16]
requires: [199-20]
provides:
  - Capturas "después" A-I x 360/390/412, medición de contraste, fold y overflow
  - Capturas antes/después de Entrenar, Reservas, Planes, Guía y Perfil
  - 1 fix de contraste (chevron de Novedades)
affects: []
key-files:
  modified:
    - el-templo-app/src/modules/progression/components/NovedadesCard.vue
status: PARCIAL — Task 1 completa, Task 2 (UAT humano de Franco) PENDIENTE (checkpoint bloqueante)
completed: 2026-10-15
---

# Phase 199 Plan 21: Verificación final Summary (PARCIAL)

Task 1 (auto) hecha: build local del worktree servido desde Playwright con la API de staging en solo lectura + mocks, 9 estados medidos (A-I). **0 fallas de contraste, card de hoy entera a 390 en los 9, sin overflow horizontal a 360/390/412 y FAB solo en la ventana (H).** Una falla real (chevron de Novedades, 1.9:1) se corrigió y re-midió. La Task 2 (UAT de Franco + velocidad del carrusel + decisiones de `paused` y descanso online) queda pendiente.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- `0dc7b8e3b` fix(199-21): chevron de Novedades con contraste de ícono (1.9:1 a 5.8:1). `$chevron` `#c7b9a6` -> `#6b6459` en `NovedadesCard.vue` (1 línea).

Nada más commiteado. Worktree limpio. `dist/spa` no se commitea. Nada commiteado ni tocado en el checkout principal salvo este SUMMARY (sin commitear).

## Resultados por estado (después, tras el fix; 1 iteración de las 3 permitidas)

| Estado                  | Textos medidos (390) | Fallas | Card de hoy entera a 390 (top-bottom) | overflowX 360 / 390 / 412 | FAB "Marcar asistencia"    |
| ----------------------- | -------------------- | ------ | ------------------------------------- | ------------------------- | -------------------------- |
| A presencial hoy        | 125                  | 0      | sí (136-319)                          | false / false / false     | no (0 textos)              |
| B presencial completada | 121                  | 0      | sí (136-336)                          | false / false / false     | no                         |
| C presencial descanso   | 124                  | 0      | sí (136-319)                          | false / false / false     | n/a                        |
| D presencial sin plan   | 114                  | 0      | sí (136-392)                          | false / false / false     | n/a                        |
| E online con plan       | 123                  | 0      | sí (136-337)                          | false / false / false     | n/a                        |
| F online sin plan       | 125                  | 0      | sí (136-293)                          | false / false / false     | n/a                        |
| G pop-up de entrada     | 4 (diálogo)          | 0      | sí (136-392)                          | false / false / false     | n/a                        |
| H presencial en ventana | 128                  | 0      | sí (136-359)                          | false / false / false     | **sí** (visible, 9 textos) |
| I presencial venció     | 120                  | 0      | sí (136-369)                          | false / false / false     | n/a                        |

- "Entera" = la card termina antes del borde superior del tab bar (788 px de 844). La más alta es D/G con 392.
- `consolidate.py despues`: 135 elementos únicos, 0 fallan.
- Antes del fix: A, B, C, E y H fallaban 1 elemento: `chevron_right` de `nov-card` (ícono 20 px, `#c7b9a6` sobre blanco = 1.92:1, umbral 3:1). Después: 5.8:1.
- Márgenes más justos aprobados (p10): `sp-name`/`sp-cat`/`sp-detail`/`sp-how` de Suple Lab (`#f6e8cf` sobre `#8a5a12`) = 4.89 (umbral 4.5); tab bar "Planes" 4.76 (4.5); íconos del tab bar 4.81+.
- Verificado: las pastillas de cards `carnet` dicen "Mostrá tu carnet" aun sin plan (diseño de `sponsorRedeemPill`: el candado está en la hoja y en las cards `code`), no es bug.

## Capturas y reportes

Raíz: `/home/franco/projects/el-templo/.docs/mi-templo-rediseno/despues/` (gitignoreada)

- `<estado>/w{360,390,412}-NN.png` (viewports), `full-w{360,390,412}.png` (página entera cosida), `w390-foryou1.png` y `w390-sponsors1..5.png` (slides de los rieles), `contrast.txt` / `contrast.json`, `capture.log`, para A-I.
- `fold.json`, `contrast-consolidated.json`.
- `pantallas-antes-despues.png`: collage antes/después de Entrenar, Reservas, Planes, Guía y Perfil.
- `antes-pantallas/A-presencial-hoy-<pantalla>/` (staging actual) y `despues-pantallas/A-presencial-hoy-<pantalla>/` (build local) para `training`, `reservas`, `planes`, `training-guia`, `profile` (360/390/412).
- Datos crudos (con las `-bg.png`) y herramientas: `/home/franco/projects/el-templo/.docs/mi-templo-rediseno/herramientas/` (`despues/`, `antes-pantallas/`, `despues-pantallas/`).

### Criterio 5 (fondo detrás, D-16), medido

Porcentaje de píxeles casi blancos (>= 245) en el primer viewport a 390, antes -> después: Planes 10.2 % -> 59.1 %, Perfil 10.7 % -> 60.0 %. La card "Sucursal" de Perfil pasa de mediana `rgb(245,244,243)` con 389 colores distintos (foto velando) a `rgb(255,255,255)` con 205 (opaca). En Entrenar y Reservas el cambio es visualmente mínimo (cards oscuras / traslúcidas por diseño); la foto se ve en los huecos en todas. Franco debe confirmarlo a ojo en el UAT (paso 17).

## Herramientas adaptadas (no se commitean)

- `capture.cjs` (original guardado como `capture.antes.cjs`): `CAPTURE_DIST` (sirve `dist/spa` en `http://app.local` con fallback a `index.html`), `CAPTURE_PATH`, `CAPTURE_OUT`, CORS para `app.local` (OPTIONS 204 y headers en mocks y en lo que pasa a staging), `reducedMotion: 'reduce'`, saltea `.sp-wm` (marca de agua) y contenedores `aria-hidden` que no sean ícono, espera a que no exista `.today-card--loading`, recorre los rieles `.for-you__rail` (`.for-you-card`), `.sp-track` (`.sp-card`) y `.premium-carousel__scroller`, etiqueta `inRail`.
- **Staging solo lectura reforzado**: en el navegador, TODO método distinto de GET/OPTIONS no mockeado se responde 200 local y se lista (`escrituras bloqueadas localmente`). Bloqueadas en las corridas: `POST` de eventos de `communications/me/novedades|avisos/*/event`, `members/sponsors/*/event` y `auth/me/intro-stories`. Ninguna escritura llegó a staging. El único tráfico a staging fue el login de la cuenta de prueba (el mismo del diagnóstico) y GETs.
- `mkmocks.cjs` (original `mkmocks.antes.cjs`): `branchTimezone` en `auth/me`, `source`/`key` en novedades, `plan-status`, `members/sponsors` (6 marcas del sketch 005), `my-bookings` (A reserva 19:00 `reservado`, B `qr_escaneado` 18:52 AR, C sin hoy y una el lunes 19, D/E/F/G/I vacías), `__clock` `2026-10-15T12:00-03:00` en A-G e I y `18:48-03:00` en H; estados nuevos H e I.
- `contrast.py`, `fold.py`, `consolidate.py`: aceptan la carpeta (`despues`), filtran slides por `inRail`, `fold.py` imprime "today-card a 390".

## Deviations from Plan

1. **[Rule 3] `python3 -I` ignora el user-site** donde viven `numpy`/`PIL` (`/home/franco/.local/lib/python3.10/site-packages`) y `contrast.py` fallaba con `ModuleNotFoundError`. Se mantuvo `-I` y se agregó una línea `sys.path.append(...)` al inicio de `contrast.py` y `fold.py`. No se instaló nada.
2. **[Menor] F ahora es un estado mockeado.** Antes era `{}` (cuenta real de staging tal cual); se mockearon `auth/me` (online), suscripción nula, stats, etc. para que la captura sea determinística y la card no dependa de staging. D, F, G e I mockean `plan-status` (A/B/C/E `hasActivePlan: true`).
3. **[Menor] Los estados A-G usan `__clock` fijo (jueves 15, 12:00 AR)** para que el FAB no aparezca por la hora real (el plan solo lo fijaba en H).
4. **[Rule 1 - contraste] `NovedadesCard` chevron** (arriba): componente de la fase (199-07/14), un solo token.
5. **[Menor] Medición informativa de las otras pantallas** (no pedida; criterio 1 del ROADMAP es Mi Templo). Con `contrast.py` sobre `despues-pantallas/` aparecen fallas, NO tocadas por estar fuera de alcance y ser preexistentes/otras fases (ver "Para el UAT").
6. El hook lint-staged hizo su backup interno con `git stash` en el commit (automático, no manual).

## Verificación

- `npx quasar build` (VITE_API_URL staging) OK, antes y después del fix.
- `npx vue-tsc --noEmit` = 18 errores (límite 18, preexistentes, ninguno en `NovedadesCard`). `pnpm lint` = 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- No se corrieron tests (cambio de un color SCSS).

## Fallas restantes en Mi Templo

Ninguna.

## Known Stubs

Ninguno.

## Para el UAT (Task 2, Franco)

- **Pendiente de Franco:** los 21 pasos de `how-to-verify` del plan, la velocidad del carrusel (2 s actual / 4 s, `SPONSOR_ADVANCE_MS`), si `paused` sigue habilitando el canje (paso 20) y si el descanso del online con programa se mantiene (paso 21). Nada de esto se ejecutó.
- Lo que el captura NO cubre (reduced-motion apaga el auto-avance y las animaciones): velocidad y pausa del carrusel, frase animada, transiciones del padding del FAB, hoja y carnet (la hoja/carnet no se capturaron), el flujo de escaneo del QR, y el admin entero.
- Revisar a ojo `despues/pantallas-antes-despues.png` (paso 17). Fondo opaco confirmado en Planes y Perfil por números.
- En H el botón "Marcar asistencia" se superpone a la card de patrocinadores (esperado, flota sobre el contenido; el espacio inferior reservado evita tapar el final de la página). Mirarlo en celular real.
- Fallas de contraste fuera de Mi Templo (informativas, sin tocar):
  - Perfil: `info-card__label` "Sucursal" 2.12 (alpha .5), `subscription-detail__label` 2.76, `section-title` "Ajustes" 2.2, notificaciones 2.68, email del header 3.55, `chevron_right` 1.88 (mismo patrón que el de Novedades).
  - Planes: "Proximamente" `#9e9e9e` 2.68, título/subtítulo de sección 3.6-4.2.
  - Entrenar: etiqueta de día "D" 1.67 (alpha .4, día deshabilitado), `block-meta__label` 2.08, títulos 4.0-4.4.
  - Reservas: la medición es contra el modal oscuro de selección de sede (2.2-2.6 en textos que quedan detrás del overlay; poco confiable); "Cómo llegar" 2.19 sobre `#393530` dentro del modal.
  - Guía: "Tocá para seguir" 2.65 sobre la foto del video.
    Si Franco las quiere en alcance, es un plan de gap closure aparte.
- Doble POST de `seen` se bloquea local en las capturas: no se midió el efecto sobre métricas reales.

## Threat Flags

Ninguno fuera del threat_model. T-199-55 mitigado: 0 escrituras llegaron a staging (todo método no-GET se responde local y se registra). T-199-56 aceptado: credenciales solo en la herramienta gitignoreada.

## Decisiones de Franco (checkpoint UAT, 2026-10-16) — insumo del gap closure

| #   | Tema                                                                   | Decisión                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Velocidad del carrusel de patrocinadores                               | **4 s** (`SPONSOR_ADVANCE_MS = 4000`)                                                                                                                                                                                                                                                                                                   |
| 2   | Plan `paused` y canje de patrocinadores                                | **Se mantiene**: pausado puede ver el código y abrir el carnet                                                                                                                                                                                                                                                                          |
| 3   | "Hoy descansás"                                                        | **Se elimina de todos lados**: la card nunca dice que descanses. Online (con o sin programa) → "Entrenar" todos los días. Presencial domingo / sin clase hoy → su **próxima clase** si tiene una reservada más adelante; si no, "Reservá tu clase" (sin opción "entrenar en casa"). Se revisa cuando lleguen desafíos y bloques sueltos |
| 4   | Plan vencido + plan programado                                         | **No mencionar cuándo arranca**: la card es la de reservar clase (que reserve en las fechas en que puede). Sin "Ver planes" ni "Arranca el…"                                                                                                                                                                                            |
| 5   | Clase de hoy ya pasada sin asistencia                                  | No se recuerda la clase perdida: la card pasa a la **próxima clase** o, si no hay, a "Reservá tu clase"                                                                                                                                                                                                                                 |
| 6   | Largo del beneficio del patrocinador                                   | **Bajar el límite a 12** caracteres (API + admin + tests)                                                                                                                                                                                                                                                                               |
| 7   | Orden de patrocinadores por país                                       | **Alcanza el orden global** actual                                                                                                                                                                                                                                                                                                      |
| 8   | `card_improvement` en Comunicaciones                                   | **Ocultarla del admin** (sin migración, el registro queda)                                                                                                                                                                                                                                                                              |
| 9   | Autor de la frase con punto final                                      | **Sacar el punto en la app** (adaptador); el TV no se toca                                                                                                                                                                                                                                                                              |
| 10  | Contraste fallando fuera de Mi Templo (Perfil, Planes, Entrenar, Guía) | **Gap closure dentro de la 199** (medir → corregir → re-medir)                                                                                                                                                                                                                                                                          |
| 11  | Vocabulario de la card de hoy                                          | Decir **"clase"** en vez de **"turno"** en todo lo que la card refiere ("Tu clase: 19:00 · Alem", "Tu próxima clase…", "Reservá tu clase", "Cambiar clase")                                                                                                                                                                             |

Pendiente: recorrido UAT de los 21 pasos en local (API :3000 + app :9000 levantadas desde el worktree) → hallazgos por número de paso → planificar el gap closure junto con estas 11 decisiones.
