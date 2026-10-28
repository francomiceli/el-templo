---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 20
subsystem: app-training
tags: [contraste, wcag, d-16, d-18, player, guia]
requires: ["197-19"]
provides:
  - Textos del player, resumen y Guía en color sólido (sin rgba ni opacity en `color`, sin grises de Quasar)
  - Tokens `$pd-sage-on-dark` y `$pd-aged-gold-on-dark` en `_premium-card.scss`
affects: [197-22]
key-files:
  modified:
    - el-templo-app/src/css/_premium-card.scss
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/training/components/BlockCard.vue
    - el-templo-app/src/modules/training/components/player/StoryExerciseCard.vue
    - el-templo-app/src/modules/training/components/player/CompactExerciseList.vue
    - el-templo-app/src/modules/training/components/player/BlockChoice.vue
    - el-templo-app/src/modules/training/components/player/SplashScreen.vue
    - el-templo-app/src/modules/training/components/player/TransitionScreen.vue
    - el-templo-app/src/modules/training/components/player/CelebrationScreen.vue
    - el-templo-app/src/modules/training/components/player/SessionSummary.vue
    - el-templo-app/src/modules/training/components/player/RpeContextualMessage.vue
    - el-templo-app/src/modules/training/components/player/RpeSlider.vue
    - el-templo-app/src/modules/training/pages/GuiaPage.vue
requirements: [D-16, D-18]
---

# Fase 197 Plan 20: Contraste del player, resumen y Guía (D-16) Summary

Todo texto con transparencia o gris de Quasar en el player (sesión completa incluida), el resumen y la Guía pasa a un color sólido del rework; sin cambios de estructura, props ni lógica. GoalPlanSession no se tocó (`git diff fd0aefe4b -- el-templo-app/src/modules/goal-plan` vacío).

## Commits

- `80e386cb5` fix(197-20): contraste del player en curso (D-16)
- `6dd8cc4ed` fix(197-20): contraste de overlays, resumen y Guía (D-16)

## Antes -> después por texto

Ratios "antes" = p10 medido el 2026-10-20 (`antes/RESUMEN.md`). Ratios "después" = cálculo WCAG sobre el fondo medido (no hubo medición real: eso es 197-22).

| Texto (archivo) | Antes (color / medido) | Ahora | Esperado |
|---|---|---|---|
| Ruta del bloque en el header (BlockProgressionView) | blanco .7 sobre oscuro (sin medir, sobre video) | `$pd-cream-2` #e3c9a8 | >= 7:1 sobre oscuro |
| Parámetros del formato "· 3 rondas" | negro .5 / 3.86 | `$pd-ink-2` #5f584d | 6.0 sobre #f2ede5 |
| Descripción del formato | negro .45 / 3.27 | `$pd-ink-2` | 6.0 |
| "Objetivo" del ajuste (criterion) | secondary .65 / ~2.6 | `$pd-ink-2` | 5.2 sobre #e6ddd4 |
| "Ver bloques anteriores" | negro .4 / 2.79 | `$pd-ink-2` | 6.0 |
| Chips Pyros / Nucleus / Deuteros 1 y su flecha | negro .4 / 2.79 | `$pd-ink-2` (chip completado `$pd-ink`) | 6.0 / 14 |
| Borde del chip completado | `rgba($secondary,.3)` | `mix($secondary, $cream, 30%)` (sólido, mismo tono) | borde, sin cambio visual |
| "DESCANSO ACTIVO" en la lista (CompactExerciseList) | negro .4 / 2.79 | `$pd-ink-2` | 6.0 |
| Dosis "12 REPS" | negro .55 / 4.41 | `$pd-ink-2` | 5.2 sobre #e6ddd4 |
| Botón "Indicaciones" | negro .4 / 2.74 | `$pd-ink-2` | 5.2 |
| Subtítulo de bloque completo (StoryExerciseCard) | blanco .7 sobre oscuro | `$pd-cream-2` | >= 7:1 |
| Check de bloque completo (StoryExerciseCard, ícono 48 px) | `$positive` #3b7249 / 2.60 | `$pd-sage-on-dark` #8fc79a (token nuevo) | 7.7 |
| "Elegí tu bloque Deuteros" (BlockChoice) | primary .6 / 2.35 | `$pd-kicker-ink` #7e4529 | 6.5 sobre #f2ede5 |
| "Elegí según si querés..." | negro .5 / 3.86 | `$pd-ink-2` | 6.0 |
| "3 ejercicios - amrap-8 min" | grey-7 #757575 / 3.95 | `$pd-ink-2` | 6.0 |
| Ruta sobre encabezado terracota/arcilla ("Planche", "Front Lever") | blanco .7 / 3.62 y 3.87 | `#fff` | 5.1+ |
| Radio sin marcar (ícono) | grey-5 #bdbdbd / 1.61 | `$pd-light-edge` #8c806f | 3.3 |
| Label y cita del splash | blanco .65 y .7 | `$pd-cream-2` | 7.3 sobre #3e3732 |
| Autor de la cita (splash, transición, celebración) | blanco .5 / 4.23 | `$pd-cream-3` #c9bba6 | 6.2 |
| "DESCANSO ACTIVO" (TransitionScreen) | blanco .5 / 4.23 | `$pd-cream-3` | 6.2 |
| Remate dorado de la cita (3 overlays) | #b89b5e / 4.39 | `$pd-aged-gold-on-dark` #c7aa6b (token nuevo) | 5.2 |
| Check del badge de transición (ícono) | `$positive` / 2.05 | `$pd-sage-on-dark` | 6.0 sobre #3e3732 |
| "Resumen de sesión" (SessionSummary) | primary .6 / 2.24-2.35 | `$pd-kicker-ink` | 5.7 sobre #eae6df |
| Fecha "jueves, 15 de octubre" | `$grey-7` / 3.55-3.95 | `$pd-ink-2` | 5.3 |
| "esta semana" / "dias totales" | text-grey-7 / 3.37-3.88 | `.days-stat__label` con `$pd-ink-2` | 5.2 |
| "Repetir Sesión" (q-btn) | color="grey-7" / 3.55 | clase `--ink` con `$pd-ink-2` | 5.3 |
| Notas guardadas (completion-card) | `$grey-7` | `$pd-ink-2` | 6.0 |
| Contador "0 / 500" | rgba(0,0,0,.54) de Quasar / 4.30 | `$pd-ink-2` (deep `.q-field__bottom`) | 5.3 |
| "Esfuerzo Percibido (RPE)" | `$primary` / 4.01 | `$pd-kicker-ink` | 5.7 sobre #e4dfd6 |
| "Desliza para indicar tu esfuerzo" | grey-6 #9e9e9e / 1.94 | `.rpe-slider__hint` `$pd-ink-2` | 5.3 |
| "- Facil a moderado" | grey-7 / 3.34 | `.rpe-slider__hint` | 5.3 |
| Mensaje del RPE ("Podrías subir...") | primary .8 / 2.91 | `$pd-kicker-ink` | 5.6 |
| Chip de formato "pyramid / amrap-8 min / circuito-3 rondas / series-4x6" (BlockCard) | secondary -5% (108,81,57) / 3.88-4.49 | #2c2318 (la tinta, ya usada en el archivo) | > 8 |
| Flecha de expandir (BlockCard) | #757575 de Quasar / 2.73 | #2c2318 | > 8 |
| Guía `$story-dark-muted` | `rgba($cream,.9)` | `$pd-cream-2` | >= 7 |
| Guía `$story-light-muted` | `rgba($accent,.88)` | `$pd-ink-2` | >= 5 sobre el velo claro |
| Guía footnote / desc de bloques / frase de niveles | `opacity: .9 / .95` | sin opacity (hereda el color sólido del tema) | igual o mejor |

Fuera de alcance de este plan: los textos de `E1-semana-hoy` (carrusel viejo, eliminado en 197-19), el botón deshabilitado "Selecciona una opcion" (control inactivo, exento por 1.4.3), la burbuja del slider "5"/"3" y el check del Deuteros elegido (artefactos de medición según RESUMEN) y los textos sobre video (sin medición real).

## Desvíos / decisiones

1. **[Rule 2] Dos tokens nuevos en `_premium-card.scss`** (D-18 permite crearlos si faltan): `$pd-sage-on-dark` (#8fc79a) para los íconos "hecho" sobre oscuro y `$pd-aged-gold-on-dark` (#c7aa6b) para el remate dorado de las citas (el #b89b5e de marca daba 4.39). El plan no listaba el archivo; solo se agregaron variables (el archivo se importa con `@import` y sus mixins no emiten CSS).
2. **[Rule 2] `BlockCard.vue` tocado** (no estaba en `files_modified`): el chip de formato y la flecha de expandir del resumen estaban entre las 7 fallas reales de `E5-resumen` y las 56 de `E4`. Solo color.
3. Se usó `$pd-ink-2` (#5f584d) en lugar de #6b6459 de D-16, como indica el plan (más oscuro, ya es el token del rework).
4. Los íconos `check_circle` verdes dejaron de usar `color="positive"` por una clase propia con el token; el selector de Deuteros elegido (`check_circle` primary) no se tocó (artefacto de medición).
5. El borde del chip completado `rgba($secondary,.3)` se reemplazó por `mix($secondary, $cream, 30%)` para que el gate de `color:\s*rgba(` quede limpio; mismo tono sobre crema.
6. Los comentarios `// Fase 197 D-16: ... (antes ...)` evitan las palabras que el grep de gate detecta (`text-grey-N`, `color="grey-N"`, `opacity`).
7. No se corrió ningún test/typecheck/lint (regla de la fase). Verificación estática: los dos `<verify>` del plan imprimen OK en sus condiciones (greps vacíos, GoalPlanSession sin cambios).

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Commits `80e386cb5` y `6dd8cc4ed` presentes en `feat/197-entrenar`.
- Greps de higiene (console, any, `color: rgba`, `$grey`) vacíos en los 12 archivos tocados.
