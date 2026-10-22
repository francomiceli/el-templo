---
phase: 200-anatomia-funcional
plan: 19
subsystem: api
tags: [anatomia, contenido, fichas, PLPU, HS, HSPU, PHS, HR]
requires: ["200-18"]
provides:
  - "fichaProfe y fichaAlumno completas (borrador) de PLPU, HS, HSPU, PHS y HR"
  - "pendientes H/N/fuente explícitos por ruta"
affects: []
tech-stack:
  added: []
  patterns:
    - "Ficha destilada del §2 corregido: marca por afirmación, c: [] cuando la sección no trae ninguna"
    - "Bloque de la sección ausente = Pendiente quien fuente (siente en PLPU, HSPU, PHS; escalones en HR)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/PLPU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HSPU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PHS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HR.ts
key-decisions:
  - "Mecánica de palancas respetada: PLPU boca abajo = glúteo, isquiotibiales y erectores sostienen, el abdomen evita el arco (BS5, R2-14); trasladado por coherencia con el planche y marcado como pendiente H1"
  - "HS: la precaución previa a las inversiones y la señal durante la vertical se cargaron como banderasRuta con marcas R y H y la leyenda 'a validar por un médico o kinesiólogo humano; es una consulta médica, no kinesiológica'. El nivel 'precaucion' no existe en BanderaRuta: el tamizaje va como derivar (al médico) y la señal durante como urgencia"
  - "HS escalones fuente ficha con la secuencia del catálogo que cita el bloque 3 (wall belly, wall back, free, one-arm free HS)"
  - "HR: escalones Pendiente (fuente): la sección da variables, no una escalera única, y la ruta mezcla espinales y planchas laterales"
  - "PLPU, HSPU y PHS: siente Pendiente (fuente) porque sus secciones no tienen bloque 'dónde se siente'. El de S4.4 es del planche y no se trasladó"
requirements-completed: [D5, D11, D15, P2, P4, R5, SC1]
duration: ~35min
completed: 2026-10-21
---

# Phase 200 Plan 19: Fichas PLPU, HS, HSPU, PHS, HR Summary

**Cinco rutas (planche push-up, inversiones y core espinal/lateral) con ficha de profe y de alumno completas, destiladas del §2 corregido con sus marcas; lo que la investigación no dice quedó como Pendiente explícito y las relaciones no se tocaron.**

## Task Commits

1. **Task 1: PLPU, HS, HSPU** - `1f6c65c7e` (content)
2. **Task 2: PHS, HR** - `2cc02e864` (content)

## Qué quedó en cada ruta

Común: `estado: "borrador"`, relaciones intactas, `escalones: { fuente: "mapa" }` en las 3 rutas `token` (PLPU, HSPU, PHS).

| Ruta | Secciones usadas                                       | Pendientes H                                                                                        | Pendientes N                                                                                          | Pendientes fuente                                                                                                                |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PLPU | S4.5 + S4.4 (progresa del planche, ST/GH) + BS5 + §1.3 | redacción boca abajo aplicada a PLPU por coherencia (H1)                                            | "caseta" (§5.4 #11)                                                                                   | siente; porqué de las 4 compensaciones                                                                                           |
| HS   | S5.1 + BS3 + §1.3                                      | tamizaje médico previo a inversiones y señales durante (H9); codos hiperextendidos (H11)            | ninguno (la sección no marca ⚑N)                                                                      | músculos de cabeza y cuello                                                                                                      |
| HSPU | S5.2 + §1.3                                            | ninguno (la sección no marca ⚑H)                                                                    | ninguno                                                                                               | siente; porqué de las compensaciones (salvo arco lumbar, que la sección explica: para llegar a la pared)                         |
| PHS  | S5.3 + §1.3                                            | ninguno                                                                                             | ninguno                                                                                               | siente; porqué de las compensaciones (salvo "cadera que no sube": falta de lean); rol de glúteo e isquios en la alineación final |
| HR   | S6.2 + S6.3 + §1.3 + §5.4 #17 y #22                    | composición de bote espinal, cajón, 360 y A 1 (H3, compartido con Nacho); Jefferson con carga (H12) | definición de bote espinal, cajón, 360, A 1 y torsión (§5.4 #22); expansión de la sigla HR (§5.4 #17) | escalones; siente en planchas laterales; porqué de las compensaciones                                                            |

Notas de contenido:

- PLPU: la sección declara que no hay EMG de planche push-up y se deduce de [4] + push-up; se dijo así en `resumen` y `evidencia`. Se conserva la corrección R2-14 (tronco/cadera igual que PL) y se aclara en la fila que es por coherencia.
- HS: se conservan las cifras de [6] siempre con "contribución relativa, no %MVIC" (R2-45) y los datos de [5] (adultos con 19,1 % menos de tríceps y 17,6 % menos de deltoides anterior; barras/anillas bajan el EMG de flexores de muñeca). "Codos hiperextendidos" lleva marca H y queda como pendiente H11.
- HS inversiones: tamizaje y señales durante cargados con el texto de la investigación (presión alta no controlada, glaucoma/retina/cirugía de ojos, embarazo, desmayos; consulta con el médico). Nada de esto aparece en la ficha de alumno.
- HSPU: sin EMG revisado por pares; la bandera de cuello/cabeza al piso y el cue de cabeza neutra llevan la marca 39 (preprint no revisado por pares).
- PHS: el único dato empírico es [35] (serrato anterior, 41 gimnastas, diferencia de hasta 63 % entre chicos que lo logran y los que no); la premisa "control más que fuerza" va como premisa de los autores (R2-20).
- HR: junta dos secciones. Se agregó la fila de flexión-relajación [R] y el creep lumbar con la recomendación de [32]; el arch hold lleva marca N por el ⚑N de la definición. `cues` y `compensa` de las planchas laterales llevan el prefijo "Plancha lateral:" para distinguirlas.
- Fichas de alumno: sin códigos, sin latín, sin banderas, sin derivaciones clínicas; `siente` Pendiente en PLPU, HSPU y PHS; "codos hiperextendidos" de HS no pasó al alumno por ser discutible.

## Errores o huecos de relaciones detectados (NO corregidos, para el orquestador)

- Ningún error de rol contra las tablas corregidas de S4.5, S5.1, S5.2, S5.3, S6.2 y S6.3.
- **PLPU** (`PLPU.ts`): la fila ST de S4.5 dice solo "trapecio = Est [9][13]" sin porción; ya estaba anotado en el comentario del archivo y no se volcó a relaciones. `dorsal` (estabilizador, `c: []`) sale de S8, no de la tabla de S4.5.
- **HSPU** (`HSPU.ts`): `serrato` motor con `c: [6]` y `trap-inf` estabilizador con `c: [6]`: el [6] de la celda ST de S5.2 respalda las contribuciones relativas del handstand completo, no el rol en HSPU. Sin error de rol, solo la marca es amplia.
- **PHS** (`PHS.ts`): glúteo e isquiotibiales (alineación final de la cadera) no figuran en relaciones porque la tabla no les da rol; ya documentado en el comentario del archivo.
- **HR** (`HR.ts`): el deltoides del brazo de apoyo y el supraespinoso (S6.3) no tienen id propio (supraespinoso va en `manguito`, ya cargado). Sin error.
- Inversiones: el tamizaje (c2) y la señal durante (a7) están en el catálogo de banderas con `rutas: ["HS","HSPU","PHS"]`, pero solo S5.1 los trae en el bloque 6. En HSPU y PHS no se duplicaron en `banderasRuta`; los hereda el catálogo.

## Verificación

- Task 1 `<automated>`: `OK PLPU.ts`, `OK HS.ts`, `OK HSPU.ts` (borrador, fichas no nulas, escalones mapa solo en token, sin `[n]` en profe, sin tecnicismos ni códigos en alumno, afirmaciones bien formadas). `git diff HEAD` sin líneas `m: "` cambiadas; greps de `console.`/`any` sin hallazgos; `tsc --noEmit` autocontenido (`types.ts` + `content/**`): `TSC-OK`.
- Task 2 `<automated>`: `OK PHS.ts`, `OK HR.ts`; diff de las dos rutas solo retira las 4 líneas `fichaProfe: null`/`fichaAlumno: null` (0 líneas `m: "` tocadas); mismo resultado en higiene y `tsc`.
- Smoke extra (scratchpad, sin commit): `validate.ts` compilado a CJS con el tsc absoluto; `validarContenido()` devuelve `[]` (incluye `validarMarcas` contra `CITAS` y `textoAlumnoProblemas`) sobre las 5 rutas nuevas.
- `prettier --write` aplicado a los 5 archivos antes de los commits.
- El test de paridad (plan 06) no se ve afectado: relaciones y `diferencias-aprobadas.ts` sin cambios.

## Deviations from Plan

None - el plan se ejecutó tal cual. Decisiones de criterio (no desvíos): `siente`, los "porqué" faltantes y los escalones de HR quedaron Pendiente en vez de inferirse (regla 1); las dos banderas de inversión de HS se cargaron como `derivar` y `urgencia` porque `BanderaRuta` no tiene nivel `precaucion`.

## Known Stubs

Los `siente` Pendiente (PLPU, HSPU, PHS; profe y alumno), los escalones de HR y los "porqué" de compensaciones son intencionales: la investigación no tiene el dato. No bloquean el objetivo del plan (P2: nada inventado). Los resuelve una ronda con la fuente, Nacho o el kinesiólogo humano, fuera de esta fase.

## Threat Flags

None.

## Self-Check: PASSED

- Archivos: `PLPU.ts`, `HS.ts`, `HSPU.ts`, `PHS.ts`, `HR.ts` presentes con `fichaProfe: {`.
- Commits `1f6c65c7e` y `2cc02e864` presentes en `feat/200-anatomia`.
