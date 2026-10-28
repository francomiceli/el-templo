---
phase: 199-rediseno-mi-templo
plan: 29
subsystem: contraste-reservas
tags: [contraste, wcag, d-15, d-16, gap-closure, uat-d10]
requires: [199-28]
gap_closure: true
gaps: ["UAT D10 (Reservas: re-medir)"]
key-files:
  modified:
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/src/components/BranchPickerDialog.vue
    - el-templo-app/src/components/TurnoHeader.vue
status: COMPLETO (0 fallas en los 3 estados de Reservas, 2 iteraciones de 3)
completed: 2026-10-16
---

# Phase 199 Plan 29: Contraste de Reservas (re-medido) Summary

Reservas se re-midió en el estado real de cada socio (con plan, modo prueba con el selector de sede abierto, modo prueba con la sede elegida). Quedó en 0 fallas en los tres estados, incluido "Cómo llegar" del selector (2.19 a 7.64). La medición de 199-21 (44 textos / 16 fallas) se había hecho contra el modal oscuro y no valía.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- `9e25e1eeb` fix(199-29): contraste de Reservas y del selector de sede con texto sólido (UAT D10)
- `9b71ae607` fix(199-29): encabezado de turno de Reservas con texto sólido (UAT D10)

Worktree limpio, sin push. `dist/spa` no se commitea. En el checkout principal solo se escribió este SUMMARY y `.docs/` (gitignoreado); no se commiteó nada ahí.

## Herramientas (en `.docs/mi-templo-rediseno/herramientas/`, gitignoreadas; originales en `*.pre29.*`)

- `mkmocks.cjs`: `members/scheduling/partner-benefit` = `{ eligible: false, reason: 'sin_beneficio' }` en todos los estados. `members/scheduling/trial-eligibility`: `eligible: false` en A, B, C, E, F, H, I; `eligible: true` en D, G, `R-prueba-selector` y `R-prueba-sede`. Estados nuevos `R-prueba-selector` y `R-prueba-sede` (= D). Los mocks se escriben con `JSON.stringify(v, null, 1)` para que el verify del plan (`"eligible": false`) encuentre el texto con espacio.
- `contrast.py`: la regla de G (`startswith('G')`) se reemplazó por una general: si algún texto del reporte tiene `inDialog`, se miden solo los textos con `inDialog`.
- `capture.cjs`: `CAPTURE_PICK_BRANCH=1` toca el nombre de la primera sede del selector y espera a que el diálogo cierre.
- `run29.sh` (nuevo): corre los 3 estados de Reservas con las redirecciones del plan (`capture.log`, `contrast.txt`).
- G re-medido en `despues-29/G-popup-entrada/` (no se tocó `despues/` de 199-21): 4 textos de diálogo, 0 fallas, mismos valores que 199-21 (12.21 / 9.25 / 5.55 / 7.85), tanto antes como después de los fixes.

## Antes / después

"199-21" = lo que se midió entonces contra el modal oscuro (baseline de 199-27: 44 medidos / 16 fallan). "Re-medido antes" = `antes-gap/reservas-remedido/`.

### Reservas (página)

| Estado                          | 199-21 (contra el modal) | Re-medido antes       | Después                  |
| ------------------------------- | ------------------------ | --------------------- | ------------------------ |
| A socio con plan (sin modal)    | 44 / 16 fallan           | 35 medidos, 15 fallan | 35 medidos, **0 fallan** |
| R-prueba-sede (banner + grilla) | no medido                | 48 medidos, 24 fallan | 48 medidos, **0 fallan** |

### Modal de sede (diálogo, solo textos del diálogo)

| Estado            | 199-21        | Re-medido antes      | Después                  |
| ----------------- | ------------- | -------------------- | ------------------------ |
| R-prueba-selector | no era válido | 21 medidos, 7 fallan | 21 medidos, **0 fallan** |

## Cambios (color viejo -> nuevo, fondo medido, ratio p10)

### Página (`ReservasPage.vue`)

| Texto                                                                                          | Antes                                               | Ahora                                                                 | Fondo                 | Ratio                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- | --------------------- | -------------------------------- |
| "Tu sesión de prueba gratis" (`trial-banner__heading`)                                         | `$primary`                                          | `#2c2318`                                                             | `#e5d9c8`             | 3.99 -> 11.09                    |
| "Elegí una sede y un horario…" (`trial-banner__body`)                                          | `#8a8472`                                           | `#2c2318`                                                             | `#e5d9c8`             | 2.68 -> 11.09                    |
| "Alem" (`branch-label`)                                                                        | `$primary`                                          | `#2c2318`                                                             | `#e7e1d9`             | 4.23 -> 11.77                    |
| "Cómo llegar" (`branch-maps-link`)                                                             | `color="primary"`                                   | `#2c2318 !important` (subrayado se mantiene)                          | `#eae4db`             | 4.35 -> 12.10                    |
| "12 al 16 de Octubre" (`day-strip__week-label`)                                                | `rgba($primary, .6)`                                | `#2c2318`                                                             | `#eae4db`             | 2.23 -> 11.77                    |
| "Próxima clase" (`next-class-card__label`)                                                     | `rgba($primary, .5)`                                | `#6b6459`                                                             | `#ffffff`             | 2.12 -> 5.85                     |
| "Elegí un horario…" (`next-class-card__activity-empty`)                                        | `$grey-6`                                           | `#6b6459`                                                             | `#ffffff`             | 2.68 -> 5.85                     |
| Dirección de la card (`next-class-card__address`)                                              | `#8a8472`                                           | `#6b6459` (corregido por patrón, no aparece en A)                     | `#ffffff`             | n/a                              |
| Días Lun/Mar/Mié/Vie, abreviatura (`day-pill__abbrev`)                                         | `rgba($primary, .5)` (+ opacity .5 del pill pasado) | `#6b6459`                                                             | `#f4f1ed` / `#ffffff` | 1.39 -> 5.19 / 2.12 -> 5.85      |
| Fechas 12/13/14 (`day-pill__date`, pasados)                                                    | `$primary` + opacity .5 del pill                    | `#6b6459`; el pill pasado queda con fondo `#f4f1ed`                   | `#f4f1ed`             | 2.03 -> 5.19                     |
| "Vie 16" fecha / "Jue 15" seleccionado                                                         | sin cambio (pasaban)                                | sin cambio                                                            | `#ffffff` / `#96593a` | 5.55                             |
| `event_busy` (4 usos + el muro de 64px)                                                        | `grey-4` / `grey-5`                                 | `color="info"` `#6b6459`                                              | `#ebe5dc`             | 1.03 -> 4.54 (icono, umbral 3.0) |
| "No hay horarios este día" / "Elegí una sede…" (`day-slots__empty`)                            | `$grey-6`                                           | `#2c2318`                                                             | `#e9e3da`             | 2.04 -> 11.77                    |
| Política "Podés reservar desde hoy…" (`reservas__policy`)                                      | `$grey-6`                                           | `#2c2318`                                                             | `#e7e1d9`             | 2.01 -> 11.56                    |
| "Tu actividad esta semana" (`week-summary__header`) + `history`                                | `$primary`                                          | `#2c2318`                                                             | `#e6e0d8`             | 4.15 -> 11.56                    |
| "¿Primera vez? Qué esperar" (`first-timer-card__header`) + `help_outline`                      | `$primary`                                          | `#2c2318`                                                             | `#ebe5dd`             | 4.35 -> 12.11                    |
| `unfold_more` y `arrow_drop_down` del `q-select`                                               | `grey-6` a=.5 / `opacity: .5` en `.q-icon`          | `color="info"` / `color: $info`, sin opacity                          | `#ffffff`             | 1.57 / 1.94 -> 5.85              |
| Horarios y feriados pasados (`slot-card--past`/`--holiday`): "7:00".."10:00", "General", profe | `opacity` .4/.5 sobre toda la card                  | card con fondo `#f0ece7`, hora/actividad/profe `#6b6459`, sin opacity | `#f0ece7`             | 1.60-1.72 -> 4.97                |
| `slot-card__coach` (profe propio)                                                              | `$grey-6`                                           | `#6b6459`                                                             | blanca                | corregido por patrón             |

### Encabezado de turno (`TurnoHeader.vue`)

| Texto                    | Antes               | Ahora     | Fondo                 | Ratio                        |
| ------------------------ | ------------------- | --------- | --------------------- | ---------------------------- |
| "Turno Mañana" / "Tarde" | `rgba($accent, .4)` | `#2c2318` | `#e8e2da` / `#ece6dd` | 2.05 / 2.08 -> 11.55 / 12.11 |

### Selector de sede (`BranchPickerDialog.vue`, modal oscuro `#2e2a26` / filas `#393530`)

| Texto                      | Antes                          | Ahora                            | Fondo     | Ratio                |
| -------------------------- | ------------------------------ | -------------------------------- | --------- | -------------------- |
| Ícono `location_on` (40px) | `$terracotta`                  | `#e3c9a8` (kick-dark)            | `#2e2a26` | 2.57 -> 8.94 (icono) |
| "Cómo llegar" (x6)         | `$terracotta !important`       | `#e3c9a8 !important`             | `#393530` | 2.19 -> 7.64         |
| Direcciones (x6)           | `rgba($cream, .7)`             | `#b9b1a4` sólido (mismo aspecto) | `#393530` | 6.02 -> 5.73         |
| "Ahora no"                 | `rgba($cream, .55) !important` | `#b9b1a4 !important`             | `#2e2a26` | 4.80 -> 6.70         |

Título y nombres de sede (`$cream`) ya pasaban (12.21 / 10.44) y no se tocaron. `grep -cE 'color:\s*rgba\(\$cream' BranchPickerDialog.vue` = 0.

## overflowX (despues-pantallas, build final)

| Estado            | 360   | 390   | 412   |
| ----------------- | ----- | ----- | ----- |
| A-presencial-hoy  | false | false | false |
| R-prueba-selector | false | false | false |
| R-prueba-sede     | false | false | false |
| G (Mi Templo)     | false | false | false |

## Verificación

- 2 builds (`npx quasar build`, `VITE_API_URL` staging) y 2 mediciones completas; la segunda deja 0 fallas en los 3 estados. `capture.log`, `contrast.txt` y `contrast.json` en `despues-pantallas/{A-presencial-hoy,R-prueba-selector,R-prueba-sede}-reservas/` y `despues-29/G-popup-entrada/`; baseline "antes real" en `antes-gap/reservas-remedido/`.
- A (socio con plan): sin modal y sin "Tu sesión de prueba gratis" en su `report.json` (0 coincidencias); `R-prueba-sede` sí muestra el banner (1) y la sede elegida (captura w390 revisada a ojo).
- `npx vue-tsc --noEmit` = 18 errores (límite 18, preexistentes). `pnpm lint` = 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- Staging solo lectura: en los 3 estados de Reservas "escrituras bloqueadas localmente: 0" (elegir sede no dispara ninguna escritura). En G se bloquearon 11 POST de eventos (`avisos/8/event`, `sponsors/*/event`), ninguno llegó a staging.
- Tests no corridos: los 3 archivos tocados solo cambiaron estilos y atributos de color y ninguno tiene test propio.

## Deviations from Plan

1. **[Menor] Pasados/feriados sin `opacity`.** Los días pasados del strip y los horarios pasados/feriados usaban `opacity` .4-.5 sobre toda la card (texto incluido). Se reemplazó por un fondo atenuado (`#f4f1ed` / `#f0ece7`) y texto sólido `#6b6459` en vez de dejarlos como "inactivos exentos"; sigue distinguiéndose de los activos por el fondo, pero ya no es el mismo gris translúcido. Revisar a ojo en el UAT.
2. **[Menor] `TurnoHeader.vue` (fuera de la lista `files_modified` del plan).** "Turno Mañana/Tarde" fallaba (2.05) y vive en un componente propio. El comentario del archivo dice que "el bold + contraste pleno de la 1.7.9 se revirtió a pedido de Franco": se mantuvo el peso 600 (no se volvió al bold) y solo se pasó el color a `#2c2318` por el UAT D10 (gap más reciente). Si Franco prefiere algo más suave, `#5a5347` mide 5.7-5.9 sobre la página.
3. **[Menor] Mocks con `JSON.stringify(v, null, 1)`** (no compacto) para que el verify literal `"eligible": false` del plan pase.
4. **[Menor] Colores de la página sobre fondo variable.** `event_busy` queda en 4.54 (umbral 3.0 por ser ícono), pero el texto de las direcciones del selector (`#b9b1a4`) es un valor sólido nuevo equivalente al `rgba($cream,.7)` compuesto, no un token de la fase (regla 3 del plan: sin rgba en texto).
5. **[Menor] Iteraciones usadas: 2 de 3.** La primera dejó 2 fallas ("Turno Mañana/Tarde", componente que no estaba en la lista de causas esperables); la segunda quedó en 0.

## Notas

- En el estado A la cuenta real de staging devuelve la grilla de Alem vacía ("No hay horarios este día"), por eso los slots (`slot-card`) se midieron solo en `R-prueba-sede` (sede Alberti). Los slots disponibles (blancos) ya pasaban (5.55); los estados `--booked`/`--attended`/`--full` y los pills `--muted/--locked/--trial` no aparecen en ninguna de las 3 capturas y no se tocaron (`--trial` usa `$primary` sobre `rgba($primary,.1)`: revisar en el UAT si aparece en una cuenta con clase de prueba disponible).
- No se midieron los estados "prueba reservada" (`alreadyBooked`) ni "semana de regalo" (partner): el segundo comparte las clases `.trial-banner*` ya corregidas; el botón "Cómo llegar" de la confirmación (`:37`) usa la misma clase `.branch-maps-link` (ahora `#2c2318`).
- Márgenes más justos que pasan: `event_busy` 4.54 (ícono, umbral 3.0), tab bar 4.76-5.65, "0 personas anotadas" 4.56 (`#2e7d32` sobre `#e8f5e9`, no tocado).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-199-55 mitigado (todo no-GET bloqueado localmente; 0 escrituras en las capturas de Reservas; `CAPTURE_PICK_BRANCH` solo toca estado local). T-199-56 aceptado.

## Dudas

Ninguna bloqueante. Decisión menor para Franco: el tono de "Turno Mañana/Tarde" (ver desviación 2).

## Self-Check: PASSED

- Commits `9e25e1eeb` y `9b71ae607` existen en el worktree; `git status` limpio.
- `despues-pantallas/{A-presencial-hoy,R-prueba-selector,R-prueba-sede}-reservas/{contrast.json,contrast.txt,capture.log}` existen; suma de `fail` = 0. `despues-29/G-popup-entrada/` con 4 textos / 0 fallas.
