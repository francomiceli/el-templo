---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 13
subsystem: app-semana
tags: [semana, chips, figura, d-03, d-07, d-18]
requires: ["197-12"]
provides:
  - BlockChipStack (chips de bloque apilados)
  - BlockExercisesCard (lista de ejercicios del bloque elegido)
  - Área de bloques + figura de 220 px dentro de SemanaTab
affects: [197-19]
key-files:
  created:
    - el-templo-app/src/modules/training/components/semana/BlockChipStack.vue
    - el-templo-app/src/modules/training/components/semana/BlockExercisesCard.vue
  modified:
    - el-templo-app/src/modules/training/components/semana/SemanaTab.vue
requirements: [D-03, D-07, D-18]
---

# Fase 197 Plan 13: Semana, mitad de abajo — Summary

La tab Semana quedó completa como componente presentacional: chips de bloque apilados a la izquierda, figura frente/espalda de 220 px a la derecha y la card con los ejercicios del bloque elegido debajo.

## Qué se hizo

1. **`BlockChipStack`**: columna `gap 6`; botones de alto mínimo 44 con rol (`pd-role-label`, `ROLE_LABELS`) y `blockDisplayName` en una línea con `…`. El elegido va en tinta con el rol en `$pd-cream-2`. `aria-pressed`; tocar el elegido emite igual. Con `interactive=false` no emite.
2. **`BlockExercisesCard`**: `pd-surface-light`; encabezado con rol, nombre (Montserrat 700 16), meta (`blockMetaLine(..., { withEstimate: false })`) y botón 44x44 `help_outline` hacia la Guía solo si `getGuiaLinkForRole` devuelve algo. Filas de 52 px con miniatura 40x40 (degradé `$fig-skin -> $fig-muscle`, `play_arrow` terracota si hay `videoUrl`, si no `fitness_center`), nombre 13 px y dosis `formatDose`. Sin cruz, sin `v-html`, sin reproducir video (T-197-33).
3. **`SemanaTab`**: dentro del hero, si el día tiene sesión: grilla `minmax(0,1fr) auto` con chips + `BodyFigure` (`height` 220, `gender`, `tone` salvia si el día está completado, `lit`/`lit2` de `figureZones`) con halo radial decorativo `aria-hidden`, y debajo la card. NUCLEUS por defecto (`defaultBlockIndex`), bloques por `sortOrder`, sin el resumen "bloques · duración · ejercicios".

## Commits

- `56724ab62` feat(197-13): chips de bloque y lista de ejercicios de Semana
- `53a7b0aa2` feat(197-13): Semana — chips apilados con figura y ejercicios (D-03)

## Verificación (estática)

Los dos `<verify>` del plan imprimen `OK`. Greps de higiene (console, any, `color: rgba`, mezcla `??` con `||`/`&&`) sin salida; ninguna línea pasa de 100 columnas. Sin `node_modules`: typecheck, lint y build quedan para CI.

## Desvíos/decisiones

- **El bloque elegido se guarda por `blockId`** (`pickedBlockId`), no por índice: sobrevive a una recarga de la semana y vuelve a NUCLEUS (null) al cambiar `selectedDate`. El índice efectivo es computed, así que siempre hay uno elegido.
- **Se quitó el slot por defecto de `SemanaTab`** (`{ day, gender }`, de 197-12): el área de bloques ahora vive adentro del componente. El slot de `SemanaHero` se conserva y es el que se usa. Nadie más consumía el slot de `SemanaTab` (el componente todavía no está montado).
- **Halo**: el `::before` del sketch pasó a un `<span aria-hidden>` con `isolation: isolate` en el contenedor, para que `z-index: -1` no lo mande detrás de la página.
- **Ejercicios ordenados por `sortOrder`** en la card (copia, sin mutar la prop).
- **Rol en la card en 11 px** (mixin `pd-role-label`), no 10.5 del sketch, por la escala D-18.
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador

- `BlockExercisesCard` usa `useRouter()`: en los tests de componente o en la vidriera (D-06, `interactive=false`) hay que montar con router; con `inert` el botón de Guía no es tocable.
- La figura se monta con `v-if` (visible), como pide 197-10.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 2 archivos creados existen y los commits `56724ab62` y `53a7b0aa2` están en `feat/197-entrenar`.
