---
phase: 200-anatomia-funcional
plan: 05
subsystem: api
tags:
  [
    anatomia,
    contenido-tipado,
    rutas-lower,
    movilidad,
    flow,
    relaciones,
    cobertura,
  ]
requires: ["200-04"]
provides:
  - "Relaciones por rol (R2) de las 14 rutas L, PS, QC, SS, SU, DS, HT, NC, SPAGAT, BRIDGE, SIDE PCK, PIKE, REVERSE HYPER y AF, con marcas de evidencia"
  - "Ficha de profe y de alumno completas de PS (port de los sketches 019/020 verificado contra A2)"
  - "RUTAS con las 30 rutas de ROUTE_PROGRESSION_MAP (sin PLYO, CARDIO ni KL) y tests de cobertura exacta"
affects: [200-06, 200-09, 200-17, 200-22]
tech-stack:
  added: []
  patterns:
    - "Archivo de ruta: `export const <ID> = {...} as const satisfies RutaContenido`, solo `import type`"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/content/rutas/L.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/QC.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/DS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HT.ts
    - el-templo-api/src/modules/anatomy/content/rutas/NC.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SPAGAT.ts
    - el-templo-api/src/modules/anatomy/content/rutas/BRIDGE.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SIDE-PCK.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PIKE.ts
    - el-templo-api/src/modules/anatomy/content/rutas/REVERSE-HYPER.ts
    - el-templo-api/src/modules/anatomy/content/rutas/AF.ts
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/index.ts
    - el-templo-api/test/anatomy/content-schema.test.ts
    - el-templo-api/test/anatomy/content-coverage.test.ts
key-decisions:
  - "Tabla articular de la ruta manda sobre S8 y TI-H (R2); TI-H aporta los músculos que la tabla no nombra"
  - "Celda con dos roles: gana el más alto, salvo tres lecturas explícitas (SPAGAT activo vs pasivo, PIKE 'Ant/Al'), listadas abajo para H"
  - "SS sin glúteo ni aductores en motor/sinergista; DS con vastos; NC con gemelo y sóleo motor (calf raises); QC con tibial motor (tibiales pared); PS con sóleo motor"
  - "PS escalones 'ficha': Parcial, A caja baja, Asistida, Heel up, Completa, Salto (se descartó 'Con peso (W)': A2 no lo nombra)"
requirements-completed: [D2, D5, D11, P2, R2, R5, SC1]
duration: ~75min
completed: 2026-10-21
---

# Phase 200 Plan 05: Relaciones LOWER, movilidad y flow, ficha de PS y cobertura de 30 rutas Summary

**Relaciones ruta-músculo-rol de las 14 rutas de tren inferior, movilidad y flow destiladas de A1-A5, B-DS/HT/NC, C1-C5 y TI-D D1 + TI-H, ficha completa de PS (profe + alumno) y `RUTAS` con las 30 rutas, cobertura exacta contra `ROUTE_PROGRESSION_MAP` en CI.**

## Task Commits

1. **Task 1: relaciones de las 8 rutas LOWER + ficha de PS** - `0580deff5` (content)
2. **Task 2: relaciones de las 6 rutas de movilidad y flow** - `8ce51c559` (content)
3. **Task 3: RUTAS con las 30 + tests de cobertura** - `91e16c79a` (test)

## Relaciones por rol (ids de músculo)

| Ruta          | motor                                                                                                          | sinergista                               | estabilizador                                                          | antagonista | estira                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| L             | gluteo-mayor, vastos, recto-fem                                                                                | aductores, isquios                       | gluteo-medio, tibial, soleo, erectores, oblicuos, cuadrado             | —           | psoas                                                             |
| PS            | gluteo-mayor, vastos, recto-fem, psoas, soleo                                                                  | aductores, isquios                       | gluteo-medio, gemelo, tibial, erectores, oblicuos, recto-abd, cuadrado | —           | —                                                                 |
| QC            | vastos, recto-fem, psoas, tibial                                                                               | —                                        | gluteo-mayor, recto-abd, oblicuos                                      | —           | —                                                                 |
| SS            | vastos, recto-fem, psoas                                                                                       | —                                        | gluteo-mayor, gemelo, soleo, recto-abd, oblicuos, erectores            | —           | —                                                                 |
| SU            | gluteo-mayor, vastos                                                                                           | aductores, isquios, soleo, gemelo, psoas | gluteo-medio                                                           | —           | —                                                                 |
| DS            | gluteo-mayor, vastos                                                                                           | aductores, isquios                       | gluteo-medio, oblicuos, erectores, cuadrado                            | —           | —                                                                 |
| HT            | gluteo-mayor                                                                                                   | isquios, aductores                       | gluteo-medio, oblicuos, recto-abd, erectores, vastos, soleo, gemelo    | —           | —                                                                 |
| NC            | isquios, gluteo-mayor, gemelo, soleo                                                                           | aductores                                | erectores, recto-abd, oblicuos, vastos, gluteo-medio                   | —           | —                                                                 |
| SPAGAT        | —                                                                                                              | —                                        | gluteo-mayor, vastos, gluteo-medio, oblicuos, erectores, recto-abd     | —           | isquios, psoas, recto-fem, aductores, gemelo                      |
| BRIDGE        | delt-ant, serrato, trap-sup, trap-inf, triceps, gluteo-mayor, isquios, vastos                                  | erectores, cuadrado                      | soleo                                                                  | —           | dorsal, pectoral, redondo, antebrazo, recto-abd, psoas, recto-fem |
| SIDE PCK      | oblicuos, cuadrado                                                                                             | —                                        | vastos, gluteo-medio, manguito                                         | isquios     | aductores                                                         |
| PIKE          | psoas, recto-fem                                                                                               | —                                        | recto-abd, vastos                                                      | —           | isquios, gluteo-mayor, erectores, gemelo                          |
| REVERSE HYPER | gluteo-mayor, isquios                                                                                          | erectores                                | recto-abd, vastos                                                      | —           | —                                                                 |
| AF            | gluteo-mayor, isquios, vastos, gemelo, oblicuos, erectores, recto-abd, triceps, delt-post, trap-inf, romboides | —                                        | serrato, pectoral, delt-ant, gluteo-medio, soleo, antebrazo            | —           | aductores                                                         |

Correcciones obligatorias verificadas (verify + `content-schema.test.ts`): SS con vastos motor y glúteo mayor estabilizador (glúteo medio y aductores fuera); DS con vastos; NC con gemelo y sóleo; QC con tibial; PS con sóleo motor y gemelo/tibial estabilizadores; SIDE PCK con oblicuos y cuadrado motor.

## Verificación (estática; los tests corren en CI)

- Task 1: verify automatizado imprime `OK` x8 (sin músculos repetidos, >=3 relaciones) y `OK correcciones`. `tsc --noEmit --strict` sobre `types.ts` + las 8 rutas: `TSC_OK`. Higiene (`console.`, `any`): sin salidas.
- Task 2: verify automatizado imprime `OK` x6 y `OK A9` (SIDE PCK con oblicuos motor). `tsc` y higiene limpios.
- Task 3: `IMPORTS30` (30 imports en `index.ts`), `NOSUMA`, `TESTGREP` (ROUTE_PROGRESSION_MAP y PLYO/CARDIO en el test), 30 archivos de ruta además del índice; `tsc --noEmit --strict` autocontenido de `types.ts` + `content/*.ts` + `content/rutas/*.ts`: `TSC_OK`.
- Adicional (scratchpad, no commiteado): `validate.ts` compilado a CJS con `tsc --strict`; con ese build `validarContenido()` devuelve `[]` (incluye `validarRutas` sobre la ficha de PS y su `textoAlumnoProblemas`), `RUTAS` = 30, `RUTAS_POR_CODIGO` = 30 y el conjunto de códigos es IGUAL al de `ROUTE_PROGRESSION_MAP`. Los 14 códigos nuevos están en `ROUTE_LABELS`. Los dos archivos de test pasan `tsc --noEmit --strict` con un stub de tipos de vitest (los únicos errores fueron del stub, `expect.arrayContaining`).
- NO se corrió vitest (no hay `node_modules`): corre en CI.
- `prettier --write` aplicado antes de cada commit (reformateó PS, SU, HT, NC, BRIDGE, PIKE, REVERSE-HYPER, AF).

## Deviations from Plan

None - el plan se ejecutó como estaba escrito. Decisiones de contenido (no desvíos de proceso) abajo.

### Lecturas que NO son "el rol más alto" (para H / orquestador)

1. **SPAGAT, motor "para elevar activamente" / "para sostener".** La tabla de C1 marca flexores de cadera M y glúteo mayor M solo como variante de flexibilidad activa (columna "Tipo"). Para el ejercicio base (elongación pasiva) se tomó: psoas y recto femoral = estira (cadera trasera alargada), glúteo mayor = estabilizador (TI-H: "SPAGAT trasera, Est"). La variante activa va en la `nota`. Alternativa estricta "rol más alto": psoas, recto-fem y gluteo-mayor pasan a motor y SPAGAT deja de tener "se estira en" para los flexores. Consistente con la expectativa del plan ("SPAGAT, PIKE y AF mayormente estira/estabilizador").
2. **PIKE, glúteo mayor e isquios "Ant/Al".** La fila de cadera dice "alargados" sin ambigüedad (y TI-H: glúteo mayor "PIKE, Al"); la de pelvis dice "Ant/Al". Se tomó estira. Alternativa estricta: antagonista (el alumno no lo vería).
3. **SIDE PCK, isquios.** La fila de rodilla los marca "Ant" sin ambigüedad (la de cadera dice alargados): aplicando la regla quedaron antagonista. Si H prefiere la lectura de estiramiento, pasan a estira (cambio de una línea en `SIDE-PCK.ts` + `diferencias-aprobadas.ts` del plan 06 + test).
4. **REVERSE HYPER, erectores "Est-S".** Gana sinergista; TI-H los lista como motor ("E alto").

### Discrepancias tabla articular de la ruta vs S8 / TI-H (la tabla gana, R2)

- DS: TI-H no lista cuádriceps; la tabla de B-DS lo marca M. Quedó motor (la corrección que pedía R2).
- SU: TI-H sóleo = Est; la tabla "S-CON al subir, Est-EXC al bajar". Sinergista (gana el más alto), igual que el gemelo.
- QC: TI-H no lista glúteo mayor en QC; la tabla lo da como co-contracción. Estabilizador.
- NC: TI-H gastrocnemio = S (nordic) y sóleo con rodilla flexionada; calf raises (B-NC-4) los hace motor, gana motor. Isquios: TI-H "NC-bisagra M", la tabla de bisagra los da S y la del nordic M-EXC: motor.
- BRIDGE: TI-H lista pectoral como M ("empuje") y a la vez "alargado"; la tabla de C2 lo da alargado: estira. TI-H cuádriceps S/Est; la tabla de C2 "Cuádriceps M": motor.
- AF (D1 vs TI-H): glúteo mayor TI-H Est vs D1 M (crab, ape, scorpion); cuádriceps TI-H Est vs D1 M; flexores de muñeca TI-H M vs D1 Est (crow); serrato TI-H M vs D1 Est; triceps/delt-post/trap-inf/romboides D1 "Est/M" en crab, quedaron motor. Manda D1.
- AF: el plan decía "mayormente estira/estabilizador"; D1 (rol más alto entre posiciones) da 11 motores y 1 estira. Si el plan 06 quiere una proyección más fina para AF, el dato por posición está en las `nota`.

### Fuera de las relaciones (sin id o sin rol en la fuente), pendiente de fuente

- L: gemelo (la tabla dice "sóleo y gastrocnemio EXC controlan" sin rol; TI-H solo lista sóleo).
- DS: sóleo del tobillo de apoyo ("EXC / CON" sin rol); TFL y rotadores.
- SIDE PCK: deltoides (sin id), dorsal y pectoral del windmill (TI-H sin rol), intertransversos.
- SU: recto femoral (la tabla dice solo "cuádriceps": quedó vastos).
- Sin id en todas: TFL, rotadores, pectoral menor, coracobraquial, extensores de muñeca, piriforme, transverso.

## Ficha de PS (D11): qué cambió respecto del sketch

Port de `FICHAS.PS` (019) y `RUTA_ALUMNO.PS` (020) verificado frase por frase contra A2 (bloques 1-6) y B-PSS:

- **Escalones:** `fuente: "ficha"` con Parcial, A caja baja, Asistida, Heel up, Completa, Salto. Se sacó "Con peso (W)": A2 bloque 3 no lo nombra (viene del catálogo, no de la investigación).
- **Fases:** 5 (Inicio, Descenso, Fondo, Ascenso, Bloqueo): A2 trae F5 bloqueo y el sketch tenía 4.
- **Marcas:** solo las de la celda de A2 (fila de cadera de apoyo `L1`, control frontal `49`/`50`, cadera libre `L1`+`R`, `53` en el progresa y la evidencia). El sketch ponía `L1` en tobillo y tronco y `53` en rodilla, que A2 no marca en esas filas: quedaron `c: []`.
- **Compensaciones:** 7 (A2 lista 7; el sketch tenía 4). Las tres sin mecanismo en la fuente (pie colapsado, pierna libre que apoya, tronco que se desploma) dicen "La investigación lo lista como compensación típica sin dar el mecanismo" y hay un pendiente `fuente`.
- **Valgo:** el sketch decía "Falta control del glúteo medio"; A2 solo cita BI5 (hipótesis de control proximal y distal [59]) y asocia el glúteo medio a la caída de la pelvis libre [58]. Se separaron así.
- **Alumno:** `siente` suma la pantorrilla (sóleo en dorsiflexión extrema, A2 bloque 4); "Rodilla hacia adentro" ya no dice "llevala en línea con el pie" (no está en A2) sino "Se pierde el control de la cadera y la pelvis"; "Talón que se levanta" y "Pierna libre que toca el piso" derivan al profe (A2 bloque 3: elevación de talón y pierna libre apoyada) sin inventar la regresión del sketch ("caja más alta").
- **Pendientes de PS:** H (pistol con cadera con dolor profundo o hiperlaxa, H14; umbral de 2 a 3 semanas de rodilla, H5; saltos en menores, H8) y `fuente` (mecanismo de tres compensaciones). A2 no tiene ⚑N propios.
- **Tipo/brazo:** "Sin dato (inferido: dinámica), cadena cerrada" y `brazo: null` (§1.3).
- Las otras 13 rutas siguen con `fichaProfe` y `fichaAlumno` en `null`.

## Notas para los planes siguientes

- Plan 06 (proyección): usar `RUTAS_POR_CODIGO`; SPAGAT no tiene motor ni sinergista, PIKE solo flexores de cadera (psoas no tiene zona) y SIDE PCK dos motores: caen en el fallback de Pitfall 4. Las diferencias contra `muscle-zones.ts` que hay que documentar en `diferencias-aprobadas.ts`: SS (cuádriceps sin glúteo/aductores), NC (gemelos), QC (tibial), PS (sóleo/gemelos), DS (vastos), SIDE PCK (oblicuos, cuadrado; sin glúteo/isquios motor), BRIDGE/AF/HT/REVERSE HYPER según la tabla de arriba.
- Plan 10 (nombres D1): `ROUTE_LABELS` sigue con los nombres viejos para HR, MN/RP, HD/ID, SIDE PCK; los 14 códigos de este plan están todos en `ROUTE_LABELS` (el test de cobertura lo exige).
- Plan 17-22 (fichas): `relaciones` ya está cerrado para las 30 rutas; los planes de fichas no lo tocan. Cualquier error contra el §2 va al SUMMARY con la cita.
- Cambia código de producción (`content/rutas/*`), así que el push dispara el deploy del componente API (no es un fix solo de tests).

## Known Stubs

13 rutas de este plan quedan con `fichaProfe: null` y `fichaAlumno: null` ("ficha en preparación", estado real previsto): L, QC, SS, SU, DS, HT, NC, SPAGAT, BRIDGE, SIDE PCK, PIKE, REVERSE HYPER y AF. Las completan los planes 17-22. En total 28 de las 30 rutas están sin ficha (solo FL y PS tienen).

## Threat Flags

Ninguno (contenido estático, sin endpoints ni schema). T-200-10 mitigado: invariantes de §1.7.2 (SS, DS, NC, QC, PS, SIDE PCK) en el verify y en `content-schema.test.ts`, más `validarRutas` dentro de `validarContenido` (0 errores en el build de prueba). T-200-11 mitigado: igualdad de conjuntos de códigos con `ROUTE_PROGRESSION_MAP` en `content-coverage.test.ts` (una ruta nueva sin contenido rompe el test).

## Self-Check: PASSED

Los 14 archivos de ruta y `index.ts` existen; los commits `0580deff5`, `8ce51c559` y `91e16c79a` están en `feat/200-anatomia`.
