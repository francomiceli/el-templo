---
phase: 200-anatomia-funcional
plan: 18
subsystem: api
tags: [anatomia, contenido, fichas, MN-RP, BL, HD-ID, OAPU, PL]
requires: ["200-17"]
provides:
  - "fichaProfe y fichaAlumno completas (borrador) de MN/RP, BL, HD/ID, OAPU y PL"
  - "pendientes H/N/fuente explícitos por ruta"
affects: []
tech-stack:
  added: []
  patterns:
    - "Ficha destilada del §2 corregido: marca por afirmación, marca declarada por la sección para celdas sin marca, c: [] cuando no hay ninguna"
    - "Sección sin fuente = Pendiente quien fuente (siente en MN/RP, HD/ID y OAPU; escalones en HD/ID)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/MN-RP.ts
    - el-templo-api/src/modules/anatomy/content/rutas/BL.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HD-ID.ts
    - el-templo-api/src/modules/anatomy/content/rutas/OAPU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PL.ts
key-decisions:
  - "Mecánica de palancas respetada: MN/RP reverse planche (boca arriba) = abdomen + flexores de cadera, glúteo/erectores co-contraen; BL y PL (boca abajo) = glúteo, isquiotibiales y erectores sostienen, el abdomen evita el arco"
  - "HD/ID es linear y S4.2 lista variables, no una escalera ordenada: escalones = Pendiente quien fuente"
  - "MN/RP, HD/ID y OAPU no tienen bloque 'dónde se siente': siente Pendiente quien fuente (profe y alumno). BL y PL sí lo tienen y se cargó"
  - "Compensaciones sin 'porqué' en la fuente: 'La sección la lista como compensación y no da el porqué' con c: [] (precedente del plan 17)"
  - "Marcas por defecto: BL = L1, L3 (declarado en S4.1); MN/RP, HD/ID, OAPU y PL sin declaración global: c: [] salvo la celda o frase fuente"
  - "Bandera de pecho/axila de HD/ID (S4.2) cargada como nivel urgencia, con el rótulo clínico fuera del texto"
requirements-completed: [D5, D11, D15, P2, P4, R5, SC1]
duration: ~30min
completed: 2026-10-21
---

# Phase 200 Plan 18: Fichas MN/RP, BL, HD/ID, OAPU, PL Summary

**Cinco rutas PUSH/PULL con ficha de profe y de alumno completas, destiladas del §2 corregido con sus marcas de evidencia; lo que la investigación no dice quedó como Pendiente explícito y las relaciones no se tocaron.**

## Task Commits

1. **Task 1: MN/RP, BL, HD/ID** - `df235bac1` (content)
2. **Task 2: OAPU, PL** - `c0ced4108` (content)

## Qué quedó en cada ruta

Común: `estado: "borrador"`, relaciones intactas, `escalones: { fuente: "mapa" }` en las 4 rutas `token` (MN/RP, BL, OAPU, PL).

| Ruta  | Secciones usadas                             | Pendientes H                                                                                     | Pendientes N                                                                                                                                               | Pendientes fuente                                                                                                                |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| MN/RP | S3.3 + BS5 (palanca boca arriba) + §1.3/§1.4 | reverse planche = apoyo libre (H3); redacción boca arriba (H1); escápula en hiperextensión (H17) | definición del reverse planche (§5.4 #23); criterio PULL de la base y nombre oficial (§5.4 método)                                                         | siente; porqué de hombros elevados, flexión de codo, hiperextensión lumbar y muñecas desiguales                                  |
| BL    | S4.1 + BS5 (boca abajo) + §1.3/§1.4          | posición escapular en BL (H4); redacción boca abajo (H1)                                         | SUPINE/PRONE (§5.4 #20); Zanetti (#14); criterio PUSH de la base                                                                                           | porqué de cabeza hacia atrás y pecho hundido                                                                                     |
| HD/ID | S4.2 + §1.4 (siglas)                         | de qué ejercicios se compone cada variante de fondos (H3)                                        | expansión de HD/ID y nombre oficial (§5.4 #16 y método); Russian, Korean, Bulgarian, Hungarian, impossible, supine, protracted, Pelican, Hefesto (#9, #21) | escalones (la sección no da escalera ordenada); siente; porqué de hombros encogidos, codos, cuello adelantado y caderas colgando |
| OAPU  | S4.3                                         | ninguno (la sección no marca ⚑H)                                                                 | ninguno (la sección no marca ⚑N)                                                                                                                           | siente; porqué de cadera que cae/sube, hombro encogido y codo que se abre                                                        |
| PL    | S4.4 + BS5 (boca abajo) + §1.3/§1.4          | redacción boca abajo (H1)                                                                        | "caseta" (§5.4 #11)                                                                                                                                        | porqué de lumbar hiperextendido/cadera baja y de codos flexionados                                                               |

Notas de contenido:

- MN/RP: el reverse planche (apoyo libre) lo sostienen abdomen y flexores de cadera; glúteo y erectores solo co-contraen, y se aclara que no es la plancha invertida con talones en el piso. El L-sit/V-sit lleva flexores de cadera + recto abdominal (R2-3).
- BL y PL: mecánica boca abajo según BS5/R2-14; en BL el dorsal queda antagonista en el hombro (su acción extensora favorece la caída) y estabilizador en la escápula, igual que en las relaciones.
- HD/ID: se conserva la corrección R2-8 (el pico de tríceps fue menor en banco: 0,83 mV vs 1,04 y 1,05); sin nombrar qué cabeza (el abstract no lo dice). La bandera de lesión aguda de pectoral/axila (S4.2, caso [38]) va como `urgencia`; los rótulos clínicos (acromioclavicular, esternoclavicular, olécranon) se pasaron a lenguaje de señal observable.
- PL: se conserva el dato clave de [4] (diferencias grandes planche vs ejercicios preparatorios: las progresiones no entrenan lo mismo). La nota de menores (zona de crecimiento del radio distal) queda solo en el catálogo de banderas; en la ficha va la señal observable con la marca 31.
- OAPU: EMG unilateral inexistente; las notas de [15] y [17] van como extrapolación explícita.
- Fichas de alumno: sin códigos, sin latín, sin banderas; sin derivaciones clínicas.

## Errores o huecos de relaciones detectados (NO corregidos, para el orquestador)

- Ningún error de rol (motor vs estabilizador) contra las tablas corregidas de las 5 secciones.
- **PL** (`PL.ts`): `dorsal` (estabilizador, `c: []`) y `manguito` (estabilizador, `c: [4]`) no figuran con rol en la tabla articular de S4.4; salen de S8 y del listado de músculos registrados en [4]. Coherente con la regla 6; solo se deja constancia.
- **MN/RP** (`MN-RP.ts`): `triceps` motor con `c: ["L1"]` mientras la celda de codo de S3.3 no lleva marca (la marca L1 sale de S8). Sin error de rol.
- **BL** (`BL.ts`): `manguito` estabilizador (`c: ["L1"]`) viene de S8, no de la tabla de S4.1. Sin error de rol.
- **OAPU** (`OAPU.ts`): `recto-abd` estabilizador (anti-extensión) y `antebrazo` vienen de S8; la tabla de S4.3 solo nombra flexores de muñeca. Sin error.
- H6 (progresión de exposición SAS: BL, manna, planche) y H7 (hiperlaxitud: German hang, skin the cat) nombran estas rutas en §6.3 pero están marcados fuera de S3.3/S4.1/S4.4 (BS4, S2.1, §3.1 c3/c5); no se cargaron como pendientes de ruta, los cubre el catálogo global de banderas.

## Verificación

- Task 1 `<automated>`: `OK MN-RP.ts`, `OK BL.ts`, `OK HD-ID.ts` (borrador, fichas no nulas, escalones mapa solo en token, sin `[n]` en profe, sin tecnicismos ni códigos en alumno, afirmaciones bien formadas). `git diff HEAD` sin líneas `m: "` cambiadas; greps de `console.`/`any` sin hallazgos; `tsc --noEmit` autocontenido (`types.ts` + `content/**`): `TSC-OK`.
- Task 2 `<automated>`: `OK OAPU.ts`, `OK PL.ts`; mismo resultado en diff de relaciones, higiene y `tsc`.
- Smoke extra (scratchpad, sin commit): `validate.ts` compilado a CJS con el tsc absoluto; `validarContenido()` devuelve `[]` tras cada tarea (incluye `validarMarcas` contra `CITAS` y `textoAlumnoProblemas`).
- `prettier --write` aplicado a los 5 archivos antes de cada commit.
- El test de paridad (plan 06) no se ve afectado: relaciones y `diferencias-aprobadas.ts` sin cambios.

## Deviations from Plan

None - el plan se ejecutó tal cual. Decisión de criterio (no desvío): `siente`, los "porqué" faltantes y los escalones de HD/ID quedaron Pendiente en vez de inferirse (regla 1).

## Known Stubs

Los `siente` Pendiente (MN/RP, HD/ID, OAPU; profe y alumno) y los escalones de HD/ID son intencionales: la investigación no tiene el bloque. No bloquean el objetivo del plan (P2: nada inventado). Los resuelve una ronda con la fuente o el kinesiólogo humano, fuera de esta fase.

## Threat Flags

None.

## Self-Check: PASSED

- Archivos: `MN-RP.ts`, `BL.ts`, `HD-ID.ts`, `OAPU.ts`, `PL.ts` presentes con `fichaProfe: {`.
- Commits `df235bac1` y `c0ced4108` presentes en `feat/200-anatomia`.
