---
phase: 199-rediseno-mi-templo
plan: 27
subsystem: contraste-perfil-planes
tags: [contraste, wcag, d-15, d-16, gap-closure, uat-d10]
requires: [199-26]
gap_closure: true
gaps: ["UAT D10 (Perfil, Planes)"]
key-files:
  modified:
    - el-templo-app/src/pages/ProfilePage.vue
    - el-templo-app/src/modules/plan/pages/PlanesPage.vue
status: COMPLETO (0 fallas en Perfil y Planes en la primera iteración)
completed: 2026-10-16
---

# Phase 199 Plan 27: Contraste de Perfil y Planes Summary

Perfil (`/profile`) y Planes (`/planes`) pasan de 15 y 8 textos fallando a 0 y 0 (estado A, 390 px, sobre el fondo real medido con `contrast.py`). Solo se cambió color de texto/ícono/badge con los tokens de la fase; no se tocó layout ni tamaños. Se usó 1 de las 3 iteraciones permitidas.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- `e834ffbd3` fix(199-27): contraste de Perfil y Planes con los tokens de la fase, texto sólido (UAT D10)

Worktree limpio, sin push. `dist/spa` no se commitea. Nada commiteado ni tocado en el checkout principal salvo este SUMMARY (sin commitear).

## Antes / después (textos medidos / fallas)

Baseline guardado en `.docs/mi-templo-rediseno/herramientas/antes-gap/` (5 carpetas, copiadas de `despues-pantallas/` de 199-21; ya tenían `contrast.txt`). Primera línea de cada `contrast.txt` del baseline (insumo también para 199-28 y 199-29):

| Página (estado A, 390) | Antes (antes-gap)     | Después                   |
| ---------------------- | --------------------- | ------------------------- |
| Perfil                 | 47 medidos, 15 fallan | 47 medidos, **0 fallan**  |
| Planes                 | 202 medidos, 8 fallan | 202 medidos, **0 fallan** |
| Reservas (199-29)      | 44 medidos, 16 fallan | no tocada                 |
| Entrenar (199-28)      | 30 medidos, 7 fallan  | no tocada                 |
| Guía (199-28)          | 24 medidos, 2 fallan  | no tocada                 |

## Cambios (color viejo -> nuevo, fondo medido, ratio nuevo)

### Perfil (`ProfilePage.vue`)

| Texto                                             | Antes                      | Ahora                                | Fondo medido | Ratio (antes -> ahora)          |
| ------------------------------------------------- | -------------------------- | ------------------------------------ | ------------ | ------------------------------- |
| Email del header (sobre la página)                | `$grey-7` `#757575`        | `#2c2318`                            | `#f0eae0`    | 3.55 -> 11.88                   |
| "Ajustes" `section-title` (sobre la página)       | `rgba($primary,.6)`        | `#2c2318`                            | `#e7e1d9`    | 2.2 -> 11.53                    |
| "Sucursal" `info-card__label`                     | `rgba($primary,.5)`        | `#6b6459`                            | `#ffffff`    | 2.12 -> 5.85                    |
| "Inicio / Vencimiento / Días restantes"           | `rgba($accent,.5)`         | `#6b6459`                            | `#ffffff`    | 2.76 -> 5.85                    |
| "Notificaciones" `settings-card__section-label`   | `$grey-6` `#9e9e9e`        | `#6b6459`                            | `#ffffff`    | 2.68 -> 5.85                    |
| Captions de notificaciones (3)                    | `text-grey-6`              | `.settings-card__caption` `#6b6459`  | `#ffffff`    | 2.68 -> 5.85                    |
| Íconos `chevron_right` (4: 3 + Eliminar cuenta)   | `color="grey-5"` `#bdbdbd` | `color="info"` `#6b6459`             | `#ffffff`    | 1.88 -> 5.85                    |
| Ícono `notifications`                             | `color="grey-6"`           | `color="info"`                       | `#ffffff`    | 2.68 -> 5.85                    |
| "Sin suscripcion activa" (no aparece en estado A) | `text-grey-5`              | `.info-card__value--muted` `#6b6459` | `#ffffff`    | corregido por patrón, no medido |

### Planes (`PlanesPage.vue`)

| Texto                                                          | Antes                            | Ahora                                                   | Fondo medido             | Ratio (antes -> ahora)                                                   |
| -------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| "Planes Por Objetivos" / "Planes Regulares" / "Tu plan actual" | `$primary` `#96593a`             | `#2c2318`                                               | `#f3ece3` / `#e6e0d8`    | 4.23 / 4.14 -> 11.77 / 11.53                                             |
| Subtítulo "Planes diseñados a tu medida…"                      | `text-body2 text-grey-7`         | `.planes-subtitle` `#2c2318` (se mantiene `text-body2`) | `#eee8df`                | 3.58 -> 11.99                                                            |
| Badge "Proximamente" (5)                                       | `q-badge color="grey"` `#9e9e9e` | fondo `#6b6459`, texto blanco                           | `#6b6459`                | 2.68 -> 5.85                                                             |
| Vacío "No hay planes disponibles"                              | `text-grey-6`                    | `.planes-empty` `#2c2318`                               | página (no aparece en A) | corregido por patrón                                                     |
| Badges `outline color="grey-7"` (duración, clases/sem)         | `grey-7` `#616161`               | `color="info"` `#6b6459`                                | `#ffffff`                | pasaban; se migraron para cumplir el criterio de 0 clases/colores `grey` |

Márgenes más justos que quedan (todos aprobados): en Planes las descripciones de card (`plan-card__desc`, `$grey-7` `#757575` sobre `#ffffff`) miden 4.61 (umbral 4.5) y el pie del tab bar (`#f2ede5` sobre `#935a3b`) 4.76. No se tocaron (pasaban).

## overflowX (ambas páginas, sin overflow)

| Página | 360   | 390   | 412   |
| ------ | ----- | ----- | ----- |
| Perfil | false | false | false |
| Planes | false | false | false |

## Iteraciones

1 de 3. Fallas restantes: ninguna.

## Verificación

- `npx quasar build` OK (VITE_API_URL staging), `capture.cjs` con `CAPTURE_DIST`/`CAPTURE_PATH`, `contrast.txt` y `capture.log` generados en cada carpeta de `despues-pantallas/A-presencial-hoy-{profile,planes}/`.
- `npx vue-tsc --noEmit` = 18 errores (límite 18, preexistentes). `pnpm lint` = 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- `grep 'color: rgba(' ProfilePage.vue` = 0; `text-grey-[567]|color="grey` en ambos archivos = 0; `#9e9e9e` en PlanesPage = 0.
- No se corrieron tests (cambio solo de CSS/atributos de color; ninguno de los dos archivos tiene test propio).
- Staging: solo lecturas; la herramienta sigue bloqueando todo método no-GET (no se modificó).

## Deviations from Plan

1. **[Menor] Badges `outline color="grey-7"` migrados a `color="info"`** en Planes. Pasaban contraste, pero el criterio de aceptación pide 0 coincidencias de `color="grey`. `$info` = `#6b6459`, mismo token de ícono/secundario de la fase.
2. **[Menor] El baseline `antes-gap/` ya tenía `contrast.txt`** en las 5 carpetas, no hizo falta regenerarlo.
3. Las carpetas `despues-pantallas/` de 199-21 no tenían `capture.log`; ahora lo tienen las dos re-medidas.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-199-55 mitigado (herramienta intacta, solo GET). T-199-56 aceptado (credenciales solo en la herramienta gitignoreada, no copiadas).

## Dudas

Ninguna bloqueante. `plan-card__desc` en `$grey-7` mide 4.61: pasa por poco; si Franco quiere más margen es un cambio de una línea a `#6b6459` (5.85).

## Self-Check: PASSED

- Commit `e834ffbd3` existe en el worktree; `git status` limpio.
- `antes-gap/` (5 carpetas) y `despues-pantallas/A-presencial-hoy-{profile,planes}/{contrast.json,contrast.txt,capture.log}` existen; 0 filas `fail`.
