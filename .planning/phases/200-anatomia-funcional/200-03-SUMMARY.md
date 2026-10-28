---
phase: 200-anatomia-funcional
plan: 03
subsystem: api
tags: [anatomia, contenido-tipado, rutas-pull, relaciones, ficha-fl]
requires: ["200-02"]
provides:
  - "Relaciones por rol (R2) de las 7 rutas PULL: FL, FLR, MN/RP, OAR, MU, OAP, TTB, con marcas de evidencia"
  - "FL con fichaProfe completa (escalones del mapa, fases, tabla articular, banderas de ruta, pendientes H/N) y fichaAlumno corta"
affects: [200-04, 200-05, 200-09, 200-17, 200-22]
tech-stack:
  added: []
  patterns:
    - "Archivo de ruta: `export const <ID> = {...} as const satisfies RutaContenido`, solo `import type`"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/content/rutas/FL.ts
    - el-templo-api/src/modules/anatomy/content/rutas/FLR.ts
    - el-templo-api/src/modules/anatomy/content/rutas/MN-RP.ts
    - el-templo-api/src/modules/anatomy/content/rutas/OAR.ts
    - el-templo-api/src/modules/anatomy/content/rutas/MU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/OAP.ts
    - el-templo-api/src/modules/anatomy/content/rutas/TTB.ts
  modified: []
key-decisions:
  - "Conflicto tabla articular vs S8: manda la tabla de la ruta (regla 6); las discrepancias quedan listadas abajo"
  - "Filas de S8 con varios músculos juntos (glúteo mayor / isquios; iliopsoas / recto femoral / aductores) solo aportan los músculos que la tabla de la ruta nombra"
  - "Celdas sin marca: marca declarada por la sección (FL: L1+L3; MU: L1+L3; OAP: 2, 3 y L1); sin declaración ni S8, c: []"
requirements-completed: [D5, D11, P2, R2, R5, SC1]
duration: ~45min
completed: 2026-10-21
---

# Phase 200 Plan 03: Relaciones PULL y ficha completa de FL Summary

**Relaciones ruta-músculo-rol de las 7 rutas PULL destiladas de la tabla articular del §2 + S8 (FL con mecánica boca arriba corregida, MN/RP con abdomen y flexores de cadera) y FL con ficha de profe completa y ficha corta de alumno portadas del sketch 019/020 y verificadas contra S3.1.**

## Task Commits

1. **Task 1: FL, relaciones + ficha completa** - `dfaa09bcc` (content)
2. **Task 2: FLR, MN/RP, OAR, MU, OAP, TTB** - `2fa4c4cbb` (content)

## Relaciones por rol

| Ruta  | motor                                                                                                               | sinergista | estabilizador                                                       | antagonista         |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- | ------------------- |
| FL    | dorsal, redondo, pectoral, delt-post, triceps, trap-inf, romboides, recto-abd, oblicuos, psoas, recto-fem           | -          | manguito, serrato, biceps, braquial, gluteo-mayor                   | trap-sup, erectores |
| FLR   | dorsal, redondo, delt-post, triceps, romboides, trap-inf, biceps, braquial, recto-abd, oblicuos                     | -          | -                                                                   | -                   |
| MN/RP | trap-inf, romboides, serrato, dorsal, redondo, delt-post, triceps, psoas, recto-fem, aductores, recto-abd, oblicuos | pectoral   | biceps, braquial, antebrazo, gluteo-mayor, erectores                | -                   |
| OAR   | romboides, trap-inf, dorsal, redondo, delt-post, biceps, braquial                                                   | -          | manguito, oblicuos, cuadrado, erectores, gluteo-mayor, gluteo-medio | -                   |
| MU    | trap-inf, romboides, serrato, dorsal, redondo, pectoral, delt-post, delt-ant, triceps, biceps, braquial, antebrazo  | -          | trap-sup, manguito                                                  | -                   |
| OAP   | dorsal, trap-inf, romboides, redondo, pectoral, biceps, braquial, antebrazo                                         | -          | serrato, manguito, oblicuos, cuadrado, erectores, delt-post         | -                   |
| TTB   | psoas, recto-fem, recto-abd, oblicuos, dorsal, redondo, trap-inf, antebrazo                                         | aductores  | biceps, braquial, triceps                                           | -                   |

`estira` está vacío en las 7: ninguna tabla PULL del §2 marca músculos "Al" salvo el pectoral de MN/RP, que la tabla da como "Ant/S" (ver abajo).

## Verificación (estática; los tests corren en CI)

- Task 1: verify automatizado imprime `OK FL` (estado borrador, motor con dorsal/psoas/recto-fem, erectores antagonista, escalones `mapa`, ninguna marca `[n]` pegada en un texto, sin músculos repetidos). `tsc --noEmit --strict` sobre `types.ts` + `content/**`: `OK`.
- Task 2: verify automatizado imprime `OK` para FLR (10 relaciones), MN/RP (18), OAR (13), MU (14), OAP (14) y TTB (12); MN/RP con recto-abd y psoas. `tsc --noEmit` autocontenido: `OK`.
- Higiene (`console.`, `any`) sin salidas. `prettier --write` aplicado a los 7 archivos antes de cada commit.
- Adicional (script de scratchpad, no commiteado): `validate.ts` compilado a CJS; `validarMarcas` sobre las marcas de las 7 rutas y de las 25 afirmaciones de `fichaProfe` de FL, ids de músculo contra los 28 de `MUSCULOS` y `textoAlumnoProblemas` sobre la ficha de alumno de FL: `SMOKE OK`.
- NO se corrió vitest (no hay `node_modules`; `validarRutas` llega en el plan 04).

## Deviations from Plan

**1. [Regla 1 del ejecutor - nunca inventar] Gesto "press to 90" de FL**

- El plan lista "FL press / press to 90". "press to 90" no aparece en el §2 ni en §1.3 (solo "FL PRESS ≈24" y, en S2.1, la retracción "to 90"). El gesto quedó como `"FL press (≈24)"`; la retracción "to 90" va como pendiente `N` (el catálogo no la define).

**2. Ficha de FL: correcciones del port del sketch contra S3.1**

- `tipo`/`brazo` salen de §1.3 ("Mixta (30 % isométrica)", "SAS 89 / BAS 28"), no del sketch ("Mixta: sostén isométrico + press y rows" no está en la investigación).
- El `resumen` del sketch omitía los flexores de cadera; se agregaron (corrección R2-2).
- Las marcas del sketch en banderas (`C` en codo/hormigueo) no están en S3.1: esas banderas llevan la marca declarada de la sección (L1+L3). La de surco del bíceps lleva 18 y 19 (S3.1) y la de ~2 semanas lleva `H`.
- La marca `4` del sketch para el codo se pasó a la FILA articular (el [4] de S3.1 describe el planche, no el rol); los roles bíceps/braquial llevan L1+L3 (BS4: anatomía + coaching).
- `siente` lleva `C` (S3.1 lo marca [C]). `progresa` lleva `M` (derivación mecánica) y la ruta paralela BAS, L1+L3.
- Se sumó un 5.º punto de `progresa` (FL WIDE, "sin evidencia", `c: []`), que está en S3.1 y el sketch omitía.

**3. Pendientes de FL agregados (reglas 3 y 4)**: H (umbral ~2 semanas, redacción boca arriba H1, colgado pasivo en hombros laxos H18) y N (definición de DP, ICM, Yewkies, Elbow Victorian, Boat y confirmación de DF; retracción "to 90").

## Discrepancias tabla articular vs S8 (para el orquestador y los planes de fichas)

Se aplicó la tabla de la ruta; S8 dice otra cosa en:

- FL: pectoral mayor y tríceps S8 = sinergista (+), tabla = motor; romboides S8 = estabilizador, tabla = M/S (motor); recto abdominal y oblicuos S8 = estabilizador, tabla = M/Est (motor).
- MN/RP: redondo mayor S8 = estabilizador (+), tabla = motor; trapecio inferior S8 = estabilizador, tabla = M/Est (motor); tríceps S8 = estabilizador isométrico, tabla = M isométrico (motor).
- MU: deltoides anterior S8 = estabilizador, tabla = motor (empuje); serrato S8 = estabilizador, tabla = M/S (motor).
- OAP: flexores de antebrazo S8 = estabilizador, tabla = M (motor); romboides S8 = estabilizador, tabla = M/S (motor).
- TTB: dorsal S8 = estabilizador (depresión), tabla = M/Est (motor); flexores de antebrazo S8 = estabilizador (agarre), tabla = M (motor).
- Si el kinesiólogo o Nacho prefieren la lectura S8, es un cambio en estos archivos + `diferencias-aprobadas.ts` (plan 06) + tests, no en las fichas.

## Dudas de contenido (no inventadas, quedan afuera de las relaciones)

- MN/RP: pectoral mayor esternal es "Ant/S" en la tabla; por la regla "el rol más alto" quedó como **sinergista** con nota "se estira en el rango final". Mecánicamente podría leerse como antagonista/estira: confirmar con H.
- MU: la fila columna/cadera (kipping, hollow) no asigna rol por músculo (solo "glúteo/isquios, iliopsoas/recto femoral + abdomen, RA/OE") y S8 no lista MU en esas filas: no se volcó.
- FLR: la tabla no nombra flexores de cadera aunque S3.2 dice "la misma palanca de FL"; no se agregaron. Pendiente `fuente` si se quiere que FLR los tenga.
- FL no lleva flexores de muñeca/antebrazo: ni S3.1 ni S8 los asignan a FL.
- OAR: "glúteos = Est" se volcó como gluteo-mayor (c: []) y gluteo-medio (L1 de S8, "Est unilateral").

## Notas para los planes siguientes

- Plan 04 (`RUTAS` + `validarRutas`): los 7 exports se llaman `FL, FLR, MN_RP, OAR, MU, OAP, TTB`; `MN-RP.ts` exporta `MN_RP` con `code: "MN/RP"`. Las notas de relación (`nota`) son texto corto para el profe, sin marcas.
- `fichaAlumno.errores` de FL usa `{ error, texto }` (la forma de `ErrorComun`), no el par de arrays del sketch.
- Los textos de alumno de FL pasan `textoAlumnoProblemas`. "hollow" aparece solo en la ficha de profe.
- Los archivos de ruta cargan con `node --experimental-strip-types` (solo `import type`).

## Known Stubs

Las 6 rutas sin ficha (`fichaProfe: null`, `fichaAlumno: null`) son el estado "ficha en preparación" previsto por el plan; los planes 17-22 las completan.

## Threat Flags

Ninguno (contenido estático, sin endpoints ni schema). T-200-07 mitigado con invariantes de FL y MN/RP verificadas; `validarRutas` llega en el plan 04. T-200-08 verificado con `textoAlumnoProblemas` sobre la ficha de alumno de FL. T-200-09 aceptado (todo `borrador`).

## Self-Check: PASSED

Los 7 archivos de `content/rutas/` existen; los commits `dfaa09bcc` y `2fa4c4cbb` están en `feat/200-anatomia`.
