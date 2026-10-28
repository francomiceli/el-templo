---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 11
subsystem: app-utils
tags: [puro, presentacion, d-03, d-04, d-09, d-11]
requires: ["197-10"]
provides:
  - blockMeta.ts (nombre, título, formato/minutos, estimación, meta, figura)
  - semanaCta.ts (resolveSemanaCta, 6 estados de D-03)
  - weekLabels.ts (rango, kicker, chip, aritmética de fechas, navegación)
  - libre.ts (sugerencia de complemento, conteo, vacío)
affects: [197-12, 197-13, 197-14, 197-15, 197-16, 197-17, 197-18]
key-files:
  created:
    - el-templo-app/src/modules/training/utils/blockMeta.ts
    - el-templo-app/src/modules/training/utils/semanaCta.ts
    - el-templo-app/src/modules/training/utils/weekLabels.ts
    - el-templo-app/src/modules/training/utils/libre.ts
    - el-templo-app/src/modules/training/utils/__tests__/blockMeta.test.ts
    - el-templo-app/src/modules/training/utils/__tests__/semanaCta.test.ts
    - el-templo-app/src/modules/training/utils/__tests__/weekLabels.test.ts
    - el-templo-app/src/modules/training/utils/__tests__/libre.test.ts
requirements: [D-03, D-04, D-09, D-11]
---

# Fase 197 Plan 11: Lógica de presentación de Semana y Libre — Summary

Toda la lógica de copy/fechas/CTA de Semana y Libre quedó como funciones puras con tests, sin Vue ni stores y sin leer el reloj del teléfono (todo recibe `today` como string de la sede).

## Qué se hizo

1. **`weekLabels.ts`**: fechas por `Date.UTC` + `Intl` en `timeZone: 'UTC'`. `weekRangeLabel` ("12 al 18 de octubre", cruce de mes y de año), `dayKicker`, `dayChip` (tres letras desde el nombre largo: "MIÉ", "SÁB", sin punto), `availableLabel`, `mondayOfDate` (domingo -> lunes anterior), `addDays`, `weekDatesFrom`, `canGoPrevWeek` (no antes de `2026-02-23`), `canGoNextWeek` (hasta +1 semana).
2. **`libre.ts`**: `complementSuggestion` (grupo sugerido si tiene menos de la mitad de sus zonas en la base; base = hoy, o la semana si no hay plani), `basketCountLabel`, `emptyBasketText`.
3. **`blockMeta.ts`**: los 8 exports del contrato. `formatLabel` da "AMRAP · 10' · 3 rondas" (D-11) y "EMOM · 3'"; `estimatedMinutes` = Σ (`seconds` o `reps × 3`) + `rest`, × rondas, mínimo 1; `blockMetaLine` con `≈N'` solo si hay `withEstimate` y el formato no declara minutos.
4. **`semanaCta.ts`**: `resolveSemanaCta` con los 6 estados de D-03 (+ variantes de hoy con progreso y pasado completado).

## Commits

- `e24f183b5` feat(197-11): rótulos de semana y sugerencia de Libre
- `91726b25a` feat(197-11): utilidades puras de bloque y CTA de Semana

## Verificación (estática)

Los dos `<verify>` del plan imprimen `OK`; greps de higiene (console, any, mezcla `??` con `||`/`&&`, `new Date(string)`) sin salida; ningún archivo nuevo pasa de 100 columnas. Sin `node_modules`: tests, typecheck y lint quedan para CI.

**Los tests del app no corren en CI**: el job `app-check` solo hace lint + build. Estos 4 archivos de test (y los de 197-10) se escribieron pero nadie los ejecuta automáticamente; conviene correrlos una vez con `pnpm test` en un checkout con dependencias antes del push.

## Desvíos/decisiones

- **Orden de commits invertido** (Task 2 antes que Task 1): `semanaCta.ts` importa `availableLabel` de `weekLabels.ts`; así ningún commit intermedio tiene un import roto. El contenido de cada tarea es el del plan.
- **`weekLabels.ts` se completó en el segundo commit** (solo un comentario acortado a 100 columnas).
- **Copy "Disponible el {día}"** vive en `weekLabels.availableLabel` (contrato del plan); `semanaCta.ts` lo importa y lo documenta en un comentario.
- **`complementSuggestion` con `todayZones` vacío (`[]`)**: se trata como "sin información de hoy" y cae a lo trabajado en la semana (con su label). Una sesión sin zonas cargadas sugeriría los 6 grupos como "complemento de hoy", que es ruido.
- **`blockMetaLine` sin `groups` en el payload**: deriva los grupos de `zones` con `groupsOfZones`; si tampoco hay zonas se omiten.
- **`declaredMinutes`** solo reconoce los tipos con parámetros confirmados en el corpus (`amrap_series`, `amrap`, `open_style` -> `minutes`; `emom` -> `totalMinutes`; `for_time` -> `timeCapMinutes`). El resto devuelve `null` (reloj libre / `≈N'`). Tipos del corpus propuestos pero sin ejemplo de parámetros (`time_cap`, `tabata`, ...) no se adivinan.
- **`resolveSemanaCta`, caso extremo**: día futuro completado (no debería ocurrir) se trata como "Ver resumen" sin link. Sin plani gana sobre futuro (lleva a Libre), como el sketch.
- **`sessionTitle`** usa `getRouteLabel` (lo que `getRouteName` de `DayCard` delega); mismo resultado.
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador

- Los hints de sin-plani: domingo "Domingo sin plani. Si querés moverte, elegí un bloque libre."; otro día "Todavía no está la plani de este día. Si querés moverte, elegí un bloque libre." (el plan solo daba el arranque; el resto sale del sketch).
- El texto del link "¿Te quedaste con ganas? Sumá un bloque libre" y del chip "Hecha" lo pone el componente (`showLibreLink` / `showDoneChip` son banderas).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 8 archivos creados existen y los commits `e24f183b5` y `91726b25a` están en `feat/197-entrenar`.
