---
phase: 200-anatomia-funcional
plan: 17
subsystem: api
tags: [anatomia, contenido, fichas, pull, FLR, OAP, OAR, MU, TTB]
requires: ["200-16"]
provides:
  - "fichaProfe y fichaAlumno completas (borrador) de FLR, OAP, OAR, MU y TTB"
  - "pendientes H/N/fuente explícitos por ruta"
affects: []
tech-stack:
  added: []
  patterns:
    - "Ficha destilada del §2 corregido: marca por afirmación, marca declarada por la sección para celdas sin marca, c: [] cuando no hay ninguna"
    - "Sección sin fuente = Pendiente quien fuente (siente en las 5 rutas)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/FLR.ts
    - el-templo-api/src/modules/anatomy/content/rutas/OAP.ts
    - el-templo-api/src/modules/anatomy/content/rutas/OAR.ts
    - el-templo-api/src/modules/anatomy/content/rutas/MU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/TTB.ts
key-decisions:
  - "Ninguna de las 5 secciones (S3.2, S2.3, S3.4, S2.2, S2.4) trae un bloque 'dónde se siente': siente (profe y alumno) queda Pendiente quien fuente en las 5, sin inferirlo de los motores de la tabla"
  - "Compensaciones sin 'porqué' en la fuente: se escribe 'La sección la lista como compensación y no da el porqué' con c: [] en vez de inventar; solo se completa donde la propia sección, la tabla o la palanca de FL (FLR, complemento S3.1) lo dan"
  - "Marcas por defecto: OAP = 2, 3, L1 (declarado en S2.3); MU = L1, L3 (declarado en S2.2); FLR, OAR y TTB sin declaración global: c: [] salvo la celda o frase fuente"
requirements-completed: [D5, D11, D15, P2, P4, R5, SC1]
duration: ~25min
completed: 2026-10-21
---

# Phase 200 Plan 17: Fichas FLR, OAP, OAR, MU, TTB Summary

**Cinco rutas PULL con ficha de profe y de alumno completas, destiladas del §2 corregido con sus marcas de evidencia; lo que la investigación no dice quedó como Pendiente explícito y las relaciones no se tocaron.**

## Task Commits

1. **Task 1: FLR, OAP, OAR** - `06b712939` (content)
2. **Task 2: MU, TTB** - `36c3fc6c2` (content)

## Qué quedó en cada ruta

Común a las 5: `escalones: { fuente: "mapa" }` (todas `strategy: token`), `siente` Pendiente (profe y alumno), `estado: "borrador"`, relaciones intactas.

| Ruta | Secciones usadas                                               | Pendientes H                                                                                     | Pendientes N                                                                                | Pendientes fuente                                                                                                                            |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FLR  | S3.2 + S3.1 (palanca, compensaciones, banderas "igual que FL") | umbral ~2 semanas (bandera copiada de FL)                                                        | nombre oficial de FLR (§5.4 método)                                                         | cadera ausente en la tabla de FLR pese a "misma palanca de FL"; siente; porqué de cuello adelantado, codos que se abren e impulso de piernas |
| OAP  | S2.3 + S2.1 (colgado pasivo/activo, 3 banderas "al colgarse")  | colgado pasivo prolongado en hombros laxos o con luxación (H18/H7)                               | qué son OAC y L SIT PL.UP (§5.4 #25)                                                        | siente; porqué de cuello adelantado y codo que cae                                                                                           |
| OAR  | S3.4                                                           | ninguno (la sección no marca ⚑H)                                                                 | ninguno (la sección no marca ⚑N)                                                            | siente; porqué de hombro encogido, cadera que cae y codo que se abre; glúteos sin distinguir mayor/medio                                     |
| MU   | S2.2                                                           | posición de muñeca y desviación cubital en el falso agarre (H10, marca `H` en la fila de muñeca) | ninguno                                                                                     | siente; porqué de la pérdida del falso agarre                                                                                                |
| TTB  | S2.4 + S6.1 (compensaciones, cuello, banderas)                 | ninguno (la sección no marca ⚑H)                                                                 | "hinge" (§5.4 #18); ATW (§5.4 #26); qué gestos reconoce el método dentro de TTB (§5.4/§6.4) | siente; porqué de cuello flexionado                                                                                                          |

Notas de contenido:

- Mecánica de palancas: ninguna de estas 5 rutas depende de la orientación boca arriba/abajo salvo FLR (misma palanca de FL, boca arriba). No se agregó el sostén de piernas a FLR porque la tabla de S3.2 no lo dice (queda como pendiente `fuente`).
- MU respeta las correcciones R2-6 (transición = extensión máxima + rotación interna; empuje = flexión desde hiperextensión) y R2-16 (cue del punto bajo).
- TTB respeta R2-19 (el estudio [29] es de adultos sanos, no midió pacientes) y R2-32 (el dorsal empuja la barra hacia las caderas).
- Rótulos clínicos fuera del texto visible (regla 4): no aparecen "pinzamiento", "infraespinoso" como causa de dolor ni "tendón distal del bíceps"; de [1] se conserva solo el dato observable.
- Fichas de alumno: sin códigos, sin latín, sin banderas; la única derivación es "avisale a tu profe" (MU, chicken wing).

## Errores o huecos de relaciones detectados (NO corregidos, para el orquestador)

- **FLR** (`FLR.ts`, S3.2 + S3.1 l.540-578): S3.2 dice "la misma palanca de FL (S3.1)" pero sus relaciones no incluyen `psoas`/`recto-fem` (en FL: motor, isométrico) ni los estabilizadores de FL (`manguito`, `serrato`). La tabla de S3.2 no los nombra, así que la omisión sigue la letra de la tabla; decidir si se amplía por la frase "misma palanca". Ya anotado en el SUMMARY del plan 03.
- **MU** (`MU.ts`, S2.2 fila columna/cadera l.466): la fila nombra glúteo/isquiotibiales, iliopsoas/recto femoral + abdomen y RA/OE, pero no asigna rol por músculo y las relaciones no las incluyen (ya registrado en el plan 03). Hoy la ficha de profe los menciona en el texto de la fila, no en las relaciones.
- **OAP** (`OAP.ts`): `delt-post` figura como estabilizador solo por S8 (`+`, anatomía); la tabla articular de S2.3 no lo nombra. Coherente con la regla 6 (tabla manda y se une con S8), solo se deja constancia.
- **OAR** (`OAR.ts`): `gluteo-mayor` con `c: []` y `gluteo-medio` con `L1` salen de "Glúteos = Est" de la tabla (sin distinción) y de S8; sin error, ya anotado en el plan 03.
- Ningún error de rol (motor vs estabilizador) contra la tabla corregida de las 5 secciones.

## Verificación

- Task 1 `<automated>`: `OK FLR.ts`, `OK OAP.ts`, `OK OAR.ts` (estado borrador, fichas no nulas, escalones mapa solo token, sin `[n]` en profe, sin tecnicismos ni códigos en alumno, afirmaciones bien formadas). `git diff HEAD` sin líneas `m: "` cambiadas; greps de `console.`/`any` sin hallazgos; `tsc --noEmit` autocontenido (`types.ts` + `content/**`): `TSC-OK`.
- Task 2 `<automated>`: `OK MU.ts`, `OK TTB.ts`; mismo resultado en diff de relaciones, higiene y `tsc`.
- Smoke extra (scratchpad, sin commit): `validate.ts` compilado a CJS con el tsc absoluto; `validarContenido()` devuelve `[]` tras cada tarea (incluye `validarMarcas` contra `CITAS` y `textoAlumnoProblemas`).
- `prettier --write` aplicado a los 5 archivos antes de cada commit.
- El test de paridad (plan 06) no se ve afectado: relaciones y `diferencias-aprobadas.ts` sin cambios.

## Deviations from Plan

None - el plan se ejecutó tal cual. Decisión de criterio (no desvío): `siente` y los "porqué" faltantes quedaron Pendiente en vez de inferirse (regla 1).

## Known Stubs

Los `siente` Pendiente (5 rutas, profe y alumno) son intencionales: la investigación no tiene el bloque. No bloquean el objetivo del plan (P2: nada inventado). Los resuelve una ronda con la fuente o el kinesiólogo humano, fuera de esta fase.

## Threat Flags

None.

## Self-Check: PASSED

- Archivos: `FLR.ts`, `OAP.ts`, `OAR.ts`, `MU.ts`, `TTB.ts` presentes con `fichaProfe: {`.
- Commits `06b712939` y `36c3fc6c2` presentes en `feat/200-anatomia`.
