---
phase: 200-anatomia-funcional
plan: 06
subsystem: api
tags: [anatomia, proyeccion, zonas, zone-hits, paridad-tv]
requires: ["200-05"]
provides:
  - "anatomy/projection.ts: proyección ruta a zonas con las mismas firmas que el mapeo anterior por categoría (más zonaInputDe, soloTv, ZONAS_TV, GRUPOS_ZONA derivado de REGIONES)"
  - "anatomy/zone-hits.ts: hits fuerte/sostiene/estira por zona para 'Hoy en tu clase' (D17/D18)"
  - "content/diferencias-aprobadas.ts: 30 entradas quita/agrega/motivo contra la TV pre-200 (SC2)"
  - "Snapshot congelado de la pintura pre-200 y test de paridad (T16)"
affects: [200-07, 200-08, 200-11, 200-12]
tech-stack:
  added: []
  patterns:
    - "Índice ruta a zonas precalculado al cargar el módulo (30 rutas por 28 músculos)"
    - "diferencias-aprobadas.ts sin imports (carga con node --experimental-strip-types); projection.ts y zone-hits.ts importan por valor"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/projection.ts
    - el-templo-api/src/modules/anatomy/zone-hits.ts
    - el-templo-api/src/modules/anatomy/content/diferencias-aprobadas.ts
    - el-templo-api/test/anatomy/__fixtures__/zonas-tv-pre-200.ts
    - el-templo-api/test/anatomy/projection.test.ts
    - el-templo-api/test/anatomy/projection-parity.test.ts
    - el-templo-api/test/anatomy/zone-hits.test.ts
  modified: []
key-decisions:
  - "Fallback de zonasDeRuta: si motor y sinergista no dan ninguna ZONA (no solo ningún músculo), estabilizador y estira (SPAGAT, y PIKE ya no: recto femoral tiene zona)"
  - "zonasDeRuta y zonasDeEjercicio devuelven copias: mutar el resultado no contamina el índice"
  - "zoneHitsDelBloque completa con una entrada marcada cada zona que pinta zonasDelBloque y las rutas no cubren (ver Deviations)"
requirements-completed: [D4, D17, D18, D20, R2, P3, SC2, SC5]
duration: ~50min
completed: 2026-10-21
---

# Phase 200 Plan 06: Proyección a zonas, hits por zona y diferencias aprobadas Summary

**Reemplazo puro del mapeo anterior por categoría: `zonasDeRuta` (motor y sinergista, fallback estabilizador y estira), hits fuerte/sostiene/estira por zona en el server, snapshot congelado de la TV pre-200 y las 30 diferencias por ruta con su motivo, exigidas por un test de paridad.**

## Task Commits

1. **Task 1: projection.ts y zone-hits.ts** - `0dbaf4adb` (feat)
2. **Task 2: snapshot pre-200, diferencias aprobadas y test de paridad** - `d56cf8f6a` (test)
3. **Task 3: tests unitarios de proyección y hits** - `b6dbc0a89` (test)

## Qué hace cada pieza

- `projection.ts` exporta las piezas del contrato: `ZONAS_ORDEN` (16), `ZONAS_TV` (15), `soloTv`, `EjercicioZonaInput` (sin categoría secundaria), `zonaInputDe`, `normalizarCodigo`, `zonasDeRuta`, `ZONAS_SIN_RUTA`, `ROM_ROLE_ZONAS`, `zonasDeEjercicio`, `UMBRAL_DOMINANCIA`, `zonasDelGrupo`, `GrupoZona`, `GRUPOS_ORDEN`, `GRUPOS_ZONA` (derivado de `REGIONES[].grupo`, tibialis en piernas), `grupoDeZona`, `gruposDeZonas`, `zonasDelBloque`, `ejerciciosPorGrupo`.
- `zone-hits.ts` exporta `HitsZona` (con `movilidad?` y `sinDetalle?`), `rutasDistintas`, `zoneHitsDeRutas` y `zoneHitsDelBloque`. Antagonista y músculos sin zona nunca aparecen; zonas en el orden de `ZONAS_ORDEN`, ids en el de `MUSCULOS`; sin claves vacías.
- El archivo viejo del mapeo por categoría en `tv/` NO se tocó (lo borra el plan 07).

## Verificación

- Task 1: los 18 símbolos del contrato presentes; sin `categorySecondary`, tablas viejas, `console` ni `any`; el archivo viejo sigue existiendo. `tsc --noEmit --strict` (binario del checkout principal) sobre `projection.ts` y `zone-hits.ts`: OK.
- Task 2: verify automatizado imprime `OK 30` (fixture con 30 rutas, SS pre = gluteal, quadriceps, adductors; todo motivo con fuente; ninguna entrada vacía).
- Task 3: greps de términos requeridos OK; higiene limpia.
- Adicional (scratchpad, no commiteado): `projection.ts`/`zone-hits.ts` compilados a CJS más los 3 tests compilados con un shim mínimo de `vitest`: **95/95 verdes**. Mutación de control (sumar estabilizador a la regla de `zonasDeRuta`) hace fallar 33 tests, entre ellos la paridad de 30 rutas: la red funciona.
- NO se corrió vitest real (no hay `node_modules`): corre en CI.
- `prettier --write` aplicado antes de cada commit.

## Tabla completa de diferencias aprobadas (para la UAT de Franco, criterio 2)

"Pre-200" = lo que pintaba la TV con el mapeo anterior por categoría (`zonasDelGrupo` sobre todos los ejercicios de la ruta). "Nueva" = `zonasDeRuta`. `tibialis` no viaja a la TV (`soloTv`). Las 30 rutas tienen al menos una diferencia; ninguna coincide exacto.

| Ruta          | Pre-200                                               | Nueva                                                                                                       | Quita                               | Agrega                                                                                       | Motivo                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AF            | abs, obliques                                         | deltoids, triceps, trapezius, upper-back, lower-back, abs, obliques, gluteal, quadriceps, hamstring, calves | -                                   | deltoids, triceps, trapezius, upper-back, lower-back, gluteal, quadriceps, hamstring, calves | TI-D (D1): el flow de cuerpo entero tiene 11 motores entre cangrejo, mono, escorpión y crow; el mapeo anterior solo pintaba abdomen y oblicuos por la categoría genérica y ahora se pintan las zonas de todos los motores (rol más alto entre posiciones). |
| BL            | chest, deltoids, triceps, abs                         | chest, deltoids, biceps, lower-back, gluteal, hamstring                                                     | triceps, abs                        | biceps, lower-back, gluteal, hamstring                                                       | S4.1 + R2 (§1.7.2: BL ya no es igual a PL): el bíceps (cabeza larga) es motor en el hombro y glúteo mayor, isquios y erectores sostienen la palanca boca abajo (BS5); tríceps y abdomen pasan a estabilizadores.                                           |
| BRIDGE        | deltoids, lower-back, gluteal                         | deltoids, triceps, trapezius, lower-back, gluteal, quadriceps, hamstring                                    | -                                   | triceps, trapezius, quadriceps, hamstring                                                    | C2: la tabla articular del puente da tríceps, trapecio (superior e inferior), cuádriceps (vastos) e isquios como motores; los erectores son sinergistas y no cambian la pintura.                                                                           |
| DS            | lower-back, gluteal, hamstring                        | gluteal, quadriceps, hamstring, adductors                                                                   | lower-back                          | quadriceps, adductors                                                                        | B-DS (§1.7.2): la tabla de B-DS da cuádriceps como motor (el listado TI-H de DS no lo traía) y aductores como sinergistas; erectores y cuadrado lumbar pasan a estabilizadores.                                                                            |
| FL            | deltoids, biceps, trapezius, upper-back, abs          | chest, deltoids, triceps, trapezius, upper-back, abs, obliques, quadriceps                                  | biceps                              | chest, triceps, obliques, quadriceps                                                         | S3.1 + S6.1 (§1.7.2, C4): en FL el recto femoral sostiene las piernas (motor isométrico) y pectoral, tríceps y oblicuos son motores del press y el dragon flag; el bíceps pasa a estabilizador.                                                            |
| FLR           | deltoids, biceps, trapezius, upper-back               | deltoids, triceps, biceps, forearm, trapezius, upper-back, abs, obliques                                    | -                                   | triceps, forearm, abs, obliques                                                              | S3.2: los motores de la ruta incluyen tríceps, braquial y braquiorradial, recto abdominal y oblicuos, que la categoría de tracción no pintaba.                                                                                                             |
| HD/ID         | chest, deltoids, triceps                              | chest, deltoids, triceps, trapezius, upper-back                                                             | -                                   | trapezius, upper-back                                                                        | S4.2 (R2): la tabla articular de HD/ID da trapecio inferior (Est/M) y dorsal como motores, no estabilizadores como en S8; siglas abiertas para Nacho (D1).                                                                                                 |
| HR            | lower-back, abs, obliques, gluteal                    | lower-back, obliques, gluteal, hamstring                                                                    | abs                                 | hamstring                                                                                    | S6.2 + S6.3: el recto abdominal es antagonista en S6.2 (no se pinta) mientras los oblicuos son motores; los isquios figuran como motores.                                                                                                                  |
| HS            | deltoids, triceps, trapezius, abs                     | forearm, trapezius                                                                                          | deltoids, triceps, abs              | forearm                                                                                      | S5.1 (§1.7.2): en el handstand deltoides anterior y tríceps sostienen (estabilizadores) y el abdomen venía de 'STRAIGHT ARM' por 'contiene', un error de carga; los motores son trapecio y flexores de muñeca (agarre).                                    |
| HSPU          | deltoids, triceps, trapezius                          | chest, deltoids, triceps, trapezius                                                                         | -                                   | chest                                                                                        | S5.2: el pectoral es sinergista del press invertido.                                                                                                                                                                                                       |
| HT            | lower-back, gluteal, hamstring                        | gluteal, hamstring, adductors                                                                               | lower-back                          | adductors                                                                                    | B-HT: los erectores son estabilizadores del hip thrust y los aductores sinergistas.                                                                                                                                                                        |
| L             | gluteal, quadriceps, adductors                        | gluteal, quadriceps, hamstring, adductors                                                                   | -                                   | hamstring                                                                                    | A1: los isquiotibiales son sinergistas del lunge (extensión de cadera); glúteo, cuádriceps y aductores siguen igual.                                                                                                                                       |
| MN/RP         | deltoids, triceps, biceps, trapezius, upper-back, abs | chest, deltoids, triceps, trapezius, upper-back, abs, obliques, quadriceps, adductors                       | biceps                              | chest, obliques, quadriceps, adductors                                                       | S3.3 (C2 de §1.8): en el L-sit la compresión de cadera la hacen recto femoral, aductores y oblicuos (motores) y el pectoral es sinergista; el bíceps pasa a estabilizador. A confirmar con Nacho (⚑N).                                                     |
| MU            | biceps, forearm, upper-back                           | chest, deltoids, triceps, biceps, forearm, trapezius, upper-back                                            | -                                   | chest, deltoids, triceps, trapezius                                                          | S2.2: la fase de empuje del muscle-up suma pectoral, deltoides y tríceps, y el tirón suma el trapecio inferior, todos como motores.                                                                                                                        |
| NC            | lower-back, gluteal, hamstring                        | gluteal, hamstring, adductors, calves                                                                       | lower-back                          | adductors, calves                                                                            | §1.7.2 + B-NC-4: los calf raises hacen motores a gemelo y sóleo (la TV no tenía gemelos en piernas), los aductores son sinergistas y los erectores pasan a estabilizadores.                                                                                |
| OAP           | biceps, forearm, upper-back                           | chest, biceps, forearm, trapezius, upper-back                                                               | -                                   | chest, trapezius                                                                             | S2.3: pectoral y trapecio inferior son motores según la tabla articular del one arm pull-up.                                                                                                                                                               |
| OAPU          | chest, deltoids, triceps                              | chest, deltoids, triceps, lower-back, obliques, gluteal                                                     | -                                   | lower-back, obliques, gluteal                                                                | S4.3 (R2): oblicuos, cuadrado lumbar y glúteo medio son motores por anti-rotación (M/Est en la tabla de la ruta, Est en S8).                                                                                                                               |
| OAR           | deltoids, biceps, trapezius, upper-back               | deltoids, biceps, forearm, trapezius, upper-back                                                            | -                                   | forearm                                                                                      | S3.4: braquial y braquiorradial son motores según la tabla articular.                                                                                                                                                                                      |
| PHS           | deltoids, triceps, trapezius, abs                     | chest, deltoids, trapezius, abs, obliques, quadriceps, adductors                                            | triceps                             | chest, obliques, quadriceps, adductors                                                       | S5.3: la compresión de cadera suma recto femoral, aductores y oblicuos como motores, el pectoral es motor y el tríceps pasa a estabilizador.                                                                                                               |
| PIKE          | lower-back, abs, gluteal, hamstring                   | quadriceps                                                                                                  | lower-back, abs, gluteal, hamstring | quadriceps                                                                                   | C4 (§1.7.2): en el pike isquios, glúteo mayor y erectores se estiran (Al) y no se pintan como trabajo; el trabajo activo es de los flexores de cadera (recto femoral) y el abdomen estabiliza. A revisar con el kinesiólogo humano (⚑H).                   |
| PL            | chest, deltoids, triceps, abs                         | chest, deltoids, triceps, biceps, lower-back, gluteal, hamstring                                            | abs                                 | biceps, lower-back, gluteal, hamstring                                                       | S4.4 + BS5: la planche boca abajo se sostiene con glúteo mayor, isquios y erectores, el bíceps es motor y el abdomen pasa a estabilizador.                                                                                                                 |
| PLPU          | chest, deltoids, triceps                              | chest, deltoids, triceps, lower-back, gluteal, hamstring                                                    | -                                   | lower-back, gluteal, hamstring                                                               | S4.5 + BS5: misma cadena posterior que PL (glúteo mayor, isquios y erectores) como motores.                                                                                                                                                                |
| PS            | gluteal, quadriceps, adductors                        | gluteal, quadriceps, hamstring, adductors, calves                                                           | -                                   | hamstring, calves                                                                            | A2 (§1.7.2): isquios sinergistas, sóleo motor y gemelo estabilizador del pistol (dorsiflexión de tobillo).                                                                                                                                                 |
| QC            | gluteal, quadriceps, adductors                        | quadriceps, tibialis                                                                                        | gluteal, adductors                  | tibialis                                                                                     | A3 (§1.7.2): 'TIBIALES PARED' hace motor al tibial anterior; el glúteo pasa a estabilizador y A3 no lista aductores. Tibialis no viaja a la TV (soloTv).                                                                                                   |
| REVERSE HYPER | lower-back, gluteal                                   | lower-back, gluteal, hamstring                                                                              | -                                   | hamstring                                                                                    | C5: los isquios son motores junto al glúteo mayor.                                                                                                                                                                                                         |
| SIDE PCK      | abs, obliques, gluteal, hamstring                     | lower-back, obliques                                                                                        | abs, gluteal, hamstring             | lower-back                                                                                   | A9 + C3 (§1.7.2): abdomen, glúteo e isquios venían de la secundaria 'LOWER POSTERIOR' mal cargada; los motores son oblicuos y cuadrado lumbar, los isquios son antagonistas y el glúteo medio estabilizador.                                               |
| SPAGAT        | quadriceps, hamstring, adductors                      | lower-back, abs, obliques, gluteal, quadriceps, hamstring, adductors, calves                                | -                                   | lower-back, abs, obliques, gluteal, calves                                                   | C1: SPAGAT no tiene motores, rige el fallback estabilizador y estira (D20, Pitfall 4): erectores, abdomen, oblicuos y glúteos estabilizan y el gemelo se estira.                                                                                           |
| SS            | gluteal, quadriceps, adductors                        | quadriceps                                                                                                  | gluteal, adductors                  | -                                                                                            | A4 (§1.7.2): SS es foco cuádriceps (vastos, recto femoral y flexores de cadera); el glúteo co-contrae y solo estabiliza, y A4 no lista aductores.                                                                                                          |
| SU            | lower-back, gluteal, quadriceps, hamstring, adductors | gluteal, quadriceps, hamstring, adductors, calves                                                           | lower-back                          | calves                                                                                       | A5: sóleo y gemelo son sinergistas del step-up y A5 no lista erectores.                                                                                                                                                                                    |
| TTB           | biceps, forearm, upper-back, abs, obliques            | forearm, trapezius, upper-back, abs, obliques, quadriceps, adductors                                        | biceps                              | trapezius, quadriceps, adductors                                                             | S2.4 + S6.1 (§1.7.2): en toe to bar el recto femoral (flexores de cadera) y el trapecio inferior son motores y los aductores sinergistas; el bíceps pasa a estabilizador.                                                                                  |

### Para mirar con lupa en la UAT

- **PIKE** pasa a pintar solo cuádriceps (los isquios, glúteo y erectores se estiran). Es la diferencia más llamativa; sale de que `PIKE.ts` (plan 05) tiene motor psoas y recto femoral. Si H prefiere otra lectura, se cambia en `PIKE.ts` + `diferencias-aprobadas.ts` + el test de paridad (el test obliga).
- **AF** (12 de 15 zonas) y **SPAGAT** (8 zonas) pintan casi todo el cuerpo: AF por los 11 motores (rol más alto entre posiciones), SPAGAT por el fallback de estabilizadores. En la TV el bloque pasa por `zonasDelGrupo` (dominancia 0.4 sobre todos sus ejercicios), así que un bloque mixto atenúa esto, pero una clase solo de AF verá el cuerpo casi entero.
- **MN/RP** (L-sit) suma cuádriceps y aductores por compresión de cadera; ⚑N abierto.
- **BL y PL** ya no son idénticas (PL conserva tríceps).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Coherencia chip/cuerpo] `zoneHitsDelBloque` completa las zonas faltantes en vez de usar el fallback solo si el resultado es `{}`**

- **Found during:** Task 1
- **Issue:** El contrato decía "si da `{}` aplicá el fallback ROM / `sinDetalle`". Un bloque mixto (una ruta del modelo más un PLYO sin ruta) daría hits solo de la ruta, y `zonasDelBloque` pintaría además gluteal/quadriceps/calves del PLYO: el cuerpo pintaría una zona sin chip ni hoja (el desajuste que D18 quiere evitar).
- **Fix:** Para cada zona que pinta `zonasDelBloque` y que las rutas no cubren se agrega una entrada marcada (`movilidad: true` si es el fallback ROM por rol, `sinDetalle: true` si viene de ejercicios sin ruta). Para los casos del contrato (solo ROM, solo PLYO, INITIUM = `{}`) el resultado es idéntico; el test "mezcla" cubre el caso nuevo.
- **Files modified:** `el-templo-api/src/modules/anatomy/zone-hits.ts`
- **Commit:** `0dbaf4adb`

**2. [Detalle de contrato] `zonasDeEjercicio` ordena también el fallback `ZONAS_SIN_RUTA`**

- `LUNGE`/`KNEE DOMINANT` están declaradas como quadriceps, gluteal, adductors (orden del contrato) pero la salida va en el orden de `ZONAS_ORDEN` (gluteal, quadriceps, adductors), como exige "salida ordenada". Los tests usan el orden de salida.

## Notas para los planes siguientes

- **Plan 07 (consumidores):** cambiar los imports a `anatomy/projection`; usar `soloTv(...)` donde la TV arma el payload del poll (tibialis no viaja); quitar `categorySecondary` de los dos conversores (`zonaInputDe` los reemplaza). Quedan DOS menciones del archivo viejo en archivos de planes anteriores que el plan 07 debe limpiar: comentario en `content/regiones.ts:7` y el import de `ZONAS_ORDEN` desde ese archivo viejo en `test/anatomy/content-coverage.test.ts:16` (apuntarlo a `projection.ts`).
- **Plan 08/11/12 (app):** `HitsZona.movilidad` se muestra como "Trabaja la movilidad de esta zona" y `sinDetalle` como "Este bloque trabaja esta zona". Un músculo puede estar en `fuerte` de una zona por una ruta y en `sostiene` por otra de la misma clase (no se deduplica entre grupos).
- Cualquier cambio de `relaciones` de una ruta debe actualizar a la vez `diferencias-aprobadas.ts` y (si cambia la pintura) el test de paridad no pasa hasta que coincidan: está pensado así.
- Cambia código de producción (`projection.ts`, `zone-hits.ts`, `content/diferencias-aprobadas.ts`): el push dispara el deploy del API (no es un fix solo de tests).

## Known Stubs

Ninguno. Las 13 fichas en `null` de rutas son de planes anteriores (17-22).

## Threat Flags

Ninguno (módulos puros sin endpoints ni schema). T-200-12 mitigado: `GRUPOS_ZONA` derivado de `REGIONES[].grupo` y test de cobertura de las 16 zonas una sola vez, `grupoDeZona("tibialis") === "piernas"`. T-200-13 mitigado: paridad contra snapshot congelado (todo cambio de pintura exige entrada con motivo).

## Self-Check: PASSED

Los 7 archivos creados existen y los commits `0dbaf4adb`, `d56cf8f6a` y `b6dbc0a89` están en `feat/200-anatomia`.
