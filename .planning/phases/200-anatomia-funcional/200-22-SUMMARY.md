---
phase: 200-anatomia-funcional
plan: 22
subsystem: api
tags: [anatomia, contenido, fichas, BRIDGE, SIDE-PCK, PIKE, AF]
requires: ["200-21"]
provides:
  - "fichaProfe y fichaAlumno completas (borrador) de BRIDGE, SIDE PCK, PIKE y AF"
  - "pendientes H/N/fuente explícitos por ruta"
  - "las 30 rutas de RUTAS con fichaProfe y fichaAlumno no nulas"
affects: []
tech-stack:
  added: []
  patterns:
    - "Ficha destilada del §2 corregido: marca por afirmación, c: [] cuando la celda no trae ninguna"
    - "AF (sin tabla articular por ruta): una fila de articulaciones por posición de D1, D2 para progresión, compensaciones, cues y banderas"
    - "Bloque ausente en la sección = Pendiente quien fuente (siente en SIDE PCK y AF, escalones en PIKE y AF)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/BRIDGE.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SIDE-PCK.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PIKE.ts
    - el-templo-api/src/modules/anatomy/content/rutas/AF.ts
key-decisions:
  - "BRIDGE: escalones { fuente: 'ficha' } con la escalera explícita de C2 bloque 3 (table, shoulder, low, mid, full)"
  - "SIDE PCK: escalones { fuente: 'mapa' } (ruta token: BENT, STRAIGHT, OVERHEAD); siente Pendiente (fuente) en profe y alumno porque C3 no trae bloque de dónde se siente"
  - "PIKE y AF: escalones Pendiente (fuente): C4 lista variables de progresión (no una escalera) y D2 dice que AF no tiene progresión lineal fija"
  - "PIKE: siente tomado de la propia cue de C4 ('Sentí tensión en la parte posterior del muslo, no en la lumbar', marca C)"
  - "El texto visible al profe no usa rótulos clínicos (espondilólisis, muñeca del gimnasta): se describen en palabras"
requirements-completed: [D5, D11, D15, P2, P4, R5, SC1]
duration: ~30min
completed: 2026-10-21
---

# Phase 200 Plan 22: Fichas BRIDGE, SIDE PCK, PIKE, AF Summary

**Cuatro rutas de movilidad y flow con ficha de profe y de alumno completas, destiladas del §2 corregido con sus marcas; lo que la investigación no dice quedó como Pendiente explícito y las relaciones no se tocaron. Con este plan las 30 rutas tienen ambas fichas.**

## Task Commits

1. **Task 1: BRIDGE, SIDE PCK** - `0bf89d3ed` (content)
2. **Task 2: PIKE, AF** - `4e9d62ab2` (content)

## Qué quedó en cada ruta

Común: `estado: "borrador"`, relaciones intactas, banderas consolidadas heredadas del catálogo (acá solo `banderasRuta`), ficha de alumno sin códigos, latín ni banderas.

| Ruta     | Secciones usadas            | Pendientes H                                                                          | Pendientes N                                                               | Pendientes fuente                                                                                                                                                                              | escalones       |
| -------- | --------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| BRIDGE   | C2 + §1.3 + §6.3            | hiperlaxitud o luxación previa en spagat y bridge (H7); menores y bridge, muñeca (H8) | ninguno                                                                    | estudios de rueda/bridge con carga lumbar; mecanismo de compensaciones (hombros cerrados, muñecas, glúteo)                                                                                     | ficha (5 pasos) |
| SIDE PCK | C3 + C0 + §1.3 + B.2 (R3-3) | validar roles del lado contrario (H2, R3-3)                                           | ninguno (el nombre oficial ya lo fijó D1)                                  | dónde se siente (bloque ausente, `siente` Pendiente en profe y alumno); qué limita el rango específico; evidencia específica y mecanismo de compensaciones                                     | mapa            |
| PIKE     | C4 + C0 + §1.3              | jefferson con carga y pike con peso (H12)                                             | qué gestos reconoce Nacho en PIKE (heterogénea: 4 categorías; §5.4 método) | escalones (solo variables); rol de glúteo mayor e isquios en pelvis (la tabla dice Ant/Al sin separar); mecanismo de compensaciones                                                            | Pendiente       |
| AF       | TI-D (D1 + D2) + §1.3       | ninguno (D1/D2 no marcan ⚑H)                                                          | qué gestos reconoce Nacho en AF y si la ruta es acumulación histórica      | sin tabla articular por ruta (solo posiciones D1); sin estudios de Animal Flow; grados de muñeca en beast y crow sin verificar; `siente` y escalones (el catálogo no define progresión lineal) | Pendiente       |

Notas de contenido:

- **BRIDGE**: las marcas de cada fila vienen de la tabla (L1 en hombro y torácica); "qué limita" lleva `C` + `L1` como declara la sección; la evidencia reúne [103], [31], [102] y [96] (banderas rojas con poca exactitud diagnóstica). Las 5 banderas de C2 bloque 6 van en `banderasRuta` (todas `derivar`; la de mareo/hormigueo con la cabeza colgando dice "cortar el ejercicio", como en el catálogo b20). El bloque "mareo" lleva marca C.
- **SIDE PCK**: la mecánica de R3-3 está en el resumen, la fase de inclinación, la fase de retorno y la fila de columna (marca R): oblicuos y cuadrado del lado CONTRARIO frenan en excéntrico, sostienen y vuelven en concéntrico; el lado de la inclinación solo en la versión activa. Se agregó el marco común de movilidad (C0) como un ítem de `progresa`.
- **PIKE**: `siente` sale de la cue de C4 (marca C), no de un bloque propio; se indica acá por si el orquestador prefiere dejarlo Pendiente. El jefferson se menciona solo en el pendiente H12 y en evidencia (sin estudios directos, modelos in vitro [97][98]).
- **AF**: 9 filas de `articulaciones`, una por posición de D1 (beast, beast/bear walk, crab, ape, scorpion, frogger, crow, cossack, wave unload); la nota del crab (pies apoyados, no es el reverse planche libre) va en la fila del crab. Las 4 banderas de D2 van en `banderasRuta`.

## Errores o huecos de relaciones detectados (NO corregidos, para el orquestador)

- **PIKE (nota del orquestador)**: la ruta hoy pinta en la TV solo el cuádriceps. Causa: `projection.ts` usa `motor ∪ sinergista` y solo cae a `estabilizador ∪ estira` si queda vacío; los motores son psoas (profundo, sin zona) y recto femoral (zona del cuádriceps), así que los isquios (`estira`) nunca se pintan. ¿Lo respalda la investigación? **C4 respalda pintar los isquios** para la versión pasiva: la tabla pone "isquios, glúteo mayor, fascia posterior alargados" como el tejido principal de la fila de cadera, "qué limita" es "rigidez/tolerancia de isquios", TI-H los marca "PIKE, Al" y la cue pide sentir tensión atrás del muslo. Los flexores de cadera son motores solo "para activos" (L-sit leg lifts, pike activo). Es la misma estructura de SPAGAT, que sí cae a `estira` porque no tiene motores. Decisión de relaciones/proyección para un plan de corrección (junto con `diferencias-aprobadas.ts` y tests), fuera de este plan.
- **PIKE**: la fila de pelvis marca glúteo e isquios "Ant/Al" (C4); `PIKE.ts` los tomó como `estira` (ya documentado en el comentario del archivo como interpretación a confirmar con H). Queda como Pendiente fuente en la ficha.
- **SIDE PCK**: la fila de hombro de C3 dice "Deltoides, manguito Est"; `SIDE-PCK.ts` solo incluye `manguito` como estabilizador (falta `delt-ant` si "deltoides" se lee como anterior; el deltoides medio no tiene id). Menor. Además los isquios mediales son "alargados" (cadera) y "Ant" (rodilla): quedó `antagonista`, ya documentado.
- **BRIDGE**: sin errores de rol contra C2 (extensores de muñeca, pectoral menor y coracobraquial no tienen id, ya documentado).
- **AF**: sin errores contra D1; D1 y TI-H difieren (glúteo mayor, cuádriceps, flexores de muñeca) y el archivo ya documenta que manda D1.
- Observación de datos (no de relaciones): §1.6 A14 dice que HT y BRIDGE contienen ambos un "LOW BRIDGE" (mismo nombre, rutas distintas); no afecta las fichas.

## Verificación

- Task 1 `<automated>`: `OK BRIDGE.ts`, `OK SIDE-PCK.ts`. Task 2 `<automated>`: `OK PIKE.ts`, `OK AF.ts` (borrador, fichas no nulas, escalones mapa solo en la ruta token, sin `[n]` pegado en textos de profe, sin tecnicismos ni códigos de ruta en textos de alumno, afirmaciones bien formadas).
- `git diff HEAD` por tarea: 0 líneas `m: "` cambiadas.
- Higiene `console.` / `any` / `as any`: sin hallazgos.
- `tsc --noEmit --strict` autocontenido (`types.ts` + `content/*.ts` + `content/rutas/*.ts`): `TSC-OK` tras cada tarea.
- Smoke extra (scratchpad, fuera del repo): `validate.ts` compilado a CJS con el tsc absoluto; `validarContenido()` devuelve `[]` (incluye `validarMarcas` contra `CITAS` y `textoAlumnoProblemas`).
- Conteo de nulls sobre `RUTAS` (script en scratchpad): antes de la tarea 2 = 2 (PIKE, AF); **después: total 30, nulls 0** (`fichaProfe` y `fichaAlumno`).
- `prettier --write` aplicado a los archivos de cada tarea antes del commit. Sin borrados de archivos.
- Paridad (plan 06) no afectada: relaciones y `diferencias-aprobadas.ts` sin cambios.

## Deviations from Plan

None - el plan se ejecutó tal cual. Decisiones de criterio (no desvíos): escalones Pendiente en PIKE y AF (variables, no escalera), lista propia en BRIDGE (C2 da la escalera), `siente` Pendiente en SIDE PCK y AF, `siente` de PIKE desde su cue; H7/H8 (BRIDGE), H2 (SIDE PCK) y H12 (PIKE) cargados desde §6.3 / B.2 aunque la sección de la ruta no los marca con ⚑H; los pendientes N de PIKE y AF salen de las preguntas de método de §5.4.

## Known Stubs

Escalones de PIKE y AF, `siente` de SIDE PCK (profe y alumno) y de AF (profe y alumno), y los "porqué" de compensaciones sin mecanismo son Pendiente intencional: la investigación no tiene el dato. No bloquean el objetivo (P2: nada inventado). Ojo para el plan 23: la ficha de alumno de SIDE PCK y AF tiene `siente` como Pendiente (precedente REVERSE HYPER).

## Threat Flags

None.

## Self-Check: PASSED

- Archivos: `BRIDGE.ts`, `SIDE-PCK.ts`, `PIKE.ts`, `AF.ts` presentes con `fichaProfe: {`.
- Commits `0bf89d3ed` y `4e9d62ab2` presentes en `feat/200-anatomia`.
