---
phase: 200-anatomia-funcional
plan: 20
subsystem: api
tags: [anatomia, contenido, fichas, L, QC, SS, SU, DS]
requires: ["200-19"]
provides:
  - "fichaProfe y fichaAlumno completas (borrador) de L, QC, SS, SU y DS"
  - "pendientes H/N/fuente explícitos por ruta"
affects: []
tech-stack:
  added: []
  patterns:
    - "Ficha destilada del §2 corregido: marca por afirmación, c: [] cuando la celda no trae ninguna"
    - "Bloque de la sección ausente = Pendiente quien fuente (escalones en las 5 rutas, siente en QC, SU y DS)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/L.ts
    - el-templo-api/src/modules/anatomy/content/rutas/QC.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/DS.ts
key-decisions:
  - "Escalones Pendiente (fuente) en las 5 rutas: los bloques 3 listan variables de progresión (rango, asistencia, carga, salto...), no una escalera de pasos única. Mismo criterio que HR en el plan 19"
  - "SS y QC respetan R3-1/R3-2: los flexores de cadera (recto femoral e iliopsoas) sostienen la cadera en isométrico con el cuerpo reclinado; el glúteo mayor solo co-contrae y los abdominales estabilizan. Quedan como pendiente H (H2)"
  - "QC y DS: la definición del ejercicio es inferencia sin fuente; el resumen y la evidencia lo dicen y la definición queda como pendiente N (§5.4 #24, #1)"
  - "Rodilla (umbral 2 a 3 semanas, meniscos/rótula) y menores (saltos, sissy, seiza) quedan como pendiente H tal como los redacta la investigación (H5, H8, H15, H14)"
  - "Banderas propias de la ruta como nivel derivar: ninguna de las 5 secciones marca urgencia en su bloque 6"
requirements-completed: [D5, D11, D15, P2, P4, R5, SC1]
duration: ~30min
completed: 2026-10-21
---

# Phase 200 Plan 20: Fichas L, QC, SS, SU, DS Summary

**Cinco rutas de rodilla dominante y Dragon Squat con ficha de profe y de alumno completas, destiladas del §2 corregido con sus marcas; lo que la investigación no dice quedó como Pendiente explícito y las relaciones no se tocaron.**

## Task Commits

1. **Task 1: L, QC, SS** - `f3a659a9c` (content)
2. **Task 2: SU, DS** - `f1eea288a` (content)

## Qué quedó en cada ruta

Común: `estado: "borrador"`, relaciones intactas, `tipo` "Sin dato (inferido: dinámica), cadena cerrada" (§1.3; QC con "excéntrico"), `brazo: null`, `escalones` Pendiente fuente, banderas propias en `banderasRuta` como `derivar` (las consolidadas se heredan del catálogo: L, PS, QC, SS, SU, DS ya figuran en b13, b14 y b18).

| Ruta | Secciones usadas         | Pendientes H                                                                                                                          | Pendientes N                                                                                           | Pendientes fuente                                                                 |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| L    | A1 + BI1-BI6 + §1.3      | umbral 2-3 semanas de rodilla (H5); edad y carga de saltos (H8)                                                                       | significado de "LS" y "shuffle" (§5.4 #26)                                                             | porqué de pelvis que rota y pasos que cruzan; escalones                           |
| QC   | A3 + B-PSS + R3-2 + §1.3 | corrección de roles de cadera (H2); seiza/QC con antecedente de menisco o dolor rotuliano (H15); menores (H8); umbral de rodilla (H5) | definición de QC, seiza y quad box (§5.4 #24; la sección dice "confirmar con Nacho antes de publicar") | siente; escalones; mecanismo de hiperextensión lumbar, valgo y tobillos dolorosos |
| SS   | A4 + BI2 + R3-1 + §1.3   | corrección de roles (H2); sissy con meniscos/rótula (H15); menores (H8); umbral de rodilla (H5)                                       | ninguno (la sección no marca ⚑N)                                                                       | datos de seguridad y mecanismo de 4 compensaciones; escalones                     |
| SU   | A5 + B-PSS + §1.3        | umbral de rodilla (H5); edad y carga de saltos (H8)                                                                                   | PQ y PSU (§5.4 #2, #3); "shuffle" y "speed skater" (§5.4 #26)                                          | siente; escalones; mecanismo de compensaciones salvo valgo                        |
| DS   | B-DS + §1.3              | cadera con dolor articular profundo o hiperlaxa (H14); umbral de rodilla (H5); edad y carga de saltos (H8)                            | descripción del dragon squat y de "DP"/Dragon HT (§5.4 #24, #1)                                        | siente; escalones; mecanismo de compensaciones salvo rotación pélvica             |

Notas de contenido:

- **L**: marcas de filas `["L1","L2"]` (la tabla las declara para todos los roles), `68` en la fila de cadera delantera y `C` en la cadera trasera (el "más aún en búlgara" es [C]). `evidencia` junta los datos de A1 con la nota de BI4: rodilla/cadera dominante es etiqueta de patrón, no cinética medida.
- **QC**: sección declarada como razonamiento a partir de BI2 y [L1]; el resumen y `evidencia` lo dicen. Reverse nordic [53] y arrodillarse [108] (extrapolación débil). Tibial anterior solo es motor en "tibiales pared" (dicho en la fila de tobillo).
- **SS**: sin estudio de sissy squat; cifras de LCA/LCP/rótula con [40][41][45][46][56]. `siente` sale de la fila de cadera (recto femoral en los dos extremos), marca R.
- **SU**: la tabla no trae marcas, por eso las filas llevan `c: []`; la evidencia lleva [50][25][40]. PSU/PQ como "unilateralidad extrema" va como hipótesis sin confirmar.
- **DS**: toda la sección es inferencia [C] (declarada), por eso fases, filas y progresión llevan `C`; la rodilla agrega [45] y `evidencia` agrega [40][51][52]. Se agregó a `progresa` la advertencia de la cadera de apoyo (flexión + aducción + rotación interna) con marca C.
- Fichas de alumno: sin códigos, sin latín, sin banderas ni derivaciones clínicas. `siente` Pendiente en QC, SU y DS (la sección no tiene bloque "dónde se siente"). Los errores sin consecuencia en la fuente dicen "tu profe te ayuda a corregirlo/a".

## Errores o huecos de relaciones detectados (NO corregidos, para el orquestador)

- Ningún error de rol contra A1, A3, A4, A5 y B-DS con las correcciones R3-1/R3-2 aplicadas.
- **L** (`L.ts`): el gastrocnemio no figura en relaciones; A1 dice "sóleo y gastrocnemio EXC controlan" (tobillo delantero) sin darle un rol. Ya estaba anotado en el comentario del archivo.
- **QC** (`QC.ts`): `tibial` está como motor, pero la tabla (A3, tobillo) lo hace motor solo en "tibiales pared" y en seiza se estira. Es una decisión ya documentada en el archivo; la ficha lo aclara.
- **DS** (`DS.ts`): sóleo del tobillo de apoyo ("EXC / CON" sin rol en la tabla), tensor de la fascia lata y rotadores (sin id) quedan fuera de relaciones; ya documentado. Los aductores de la pierna libre (Est-ISO) quedan como sinergista por el rol más alto (aductor mayor, cadera de apoyo).
- **SU** (`SU.ts`): "cuádriceps" sin más en la tabla queda como `vastos`; el recto femoral no se nombra en A5. Ya documentado.

## Verificación

- Task 1 y Task 2 `<automated>` (corridos con las 5 rutas juntas): `OK L.ts`, `OK QC.ts`, `OK SS.ts`, `OK SU.ts`, `OK DS.ts` (borrador, fichas no nulas, sin escalones mapa en rutas linear, sin `[n]` pegado en textos de profe, sin tecnicismos ni códigos de ruta en textos de alumno, afirmaciones bien formadas).
- `git diff HEAD` sobre `content/rutas/`: 0 líneas `m: "` cambiadas (los 10 `-` son las líneas `fichaProfe: null`/`fichaAlumno: null`).
- Higiene `console.` / `any` / `as any`: sin hallazgos.
- `tsc --noEmit --strict` autocontenido (`types.ts` + `content/*.ts` + `content/rutas/*.ts`): `TSC-OK`.
- Smoke extra (scratchpad, sin commit): `validate.ts` compilado a CJS con el tsc absoluto; `validarContenido()` devuelve `[]` (incluye `validarMarcas` contra `CITAS` y `textoAlumnoProblemas`).
- `prettier --write` aplicado a los 5 archivos antes de los commits. Sin borrados de archivos en los commits.
- El test de paridad (plan 06) no se ve afectado: relaciones y `diferencias-aprobadas.ts` sin cambios.

## Deviations from Plan

None - el plan se ejecutó tal cual. Decisiones de criterio (no desvíos): escalones Pendiente en las 5 rutas y `siente` Pendiente en QC, SU y DS en vez de inferirse (regla 1); los pendientes N de L y SU sobre "LS", "shuffle" y "speed skater" salen de §5.4 #26 aunque la sección de la ruta no los marque con ⚑N.

## Known Stubs

Los escalones (5 rutas), el `siente` de QC, SU y DS (profe y alumno) y los "porqué" de compensaciones sin mecanismo son Pendiente intencional: la investigación no tiene el dato. No bloquean el objetivo del plan (P2: nada inventado). Los resuelve una ronda con la fuente, Nacho o el kinesiólogo humano, fuera de esta fase.

## Threat Flags

None.

## Self-Check: PASSED

- Archivos: `L.ts`, `QC.ts`, `SS.ts`, `SU.ts`, `DS.ts` presentes con `fichaProfe: {`.
- Commits `f3a659a9c` y `f1eea288a` presentes en `feat/200-anatomia`.
