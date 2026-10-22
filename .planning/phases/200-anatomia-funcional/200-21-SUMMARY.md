---
phase: 200-anatomia-funcional
plan: 21
subsystem: api
tags: [anatomia, contenido, fichas, HT, NC, REVERSE-HYPER, SPAGAT]
requires: ["200-20"]
provides:
  - "fichaProfe y fichaAlumno completas (borrador) de HT, NC, REVERSE HYPER y SPAGAT"
  - "pendientes H/N/fuente explícitos por ruta"
affects: []
tech-stack:
  added: []
  patterns:
    - "Ficha destilada del §2 corregido: marca por afirmación, c: [] cuando la celda no trae ninguna"
    - "Ruta heterogénea (NC): gestos en texto con prefijo por gesto en fases, articulaciones, compensaciones y cues"
    - "Bloque de la sección ausente = Pendiente quien fuente (escalones en HT y NC, siente en REVERSE HYPER)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/anatomy/content/rutas/HT.ts
    - el-templo-api/src/modules/anatomy/content/rutas/NC.ts
    - el-templo-api/src/modules/anatomy/content/rutas/REVERSE-HYPER.ts
    - el-templo-api/src/modules/anatomy/content/rutas/SPAGAT.ts
key-decisions:
  - "HT y NC: escalones Pendiente (fuente); el bloque 3 lista variables de progresión, no una escalera de pasos. Mismo criterio que los planes 19 y 20"
  - "REVERSE HYPER: escalones { fuente: 'mapa' } (ruta token; ROUTE_PROGRESSION_MAP tiene TUCK, HALF STRADDLE, STRADDLE, FULL). siente Pendiente (fuente) en profe y alumno porque C5 no tiene bloque de dónde se siente"
  - "SPAGAT: escalones { fuente: 'ficha', pasos } porque C1 bloque 4 da una escalera explícita (asistido, pierna doblada, pierna extendida, altura/full). Sujeta a la definición de delta/omega (pendiente N #15)"
  - "NC: el jefferson con carga queda ⚑H (H12) como bandera propia (nivel derivar, marca R) y pendiente H; la primera dosis de nordic queda ⚑H (H16) como pendiente y como indicación de volumen bajo en progresa [71][72]"
  - "NC: banderas urgencia sin rótulos clínicos en el texto visible (orina oscura, dolor desproporcionado, 24 a 72 h tras sesión excéntrica nueva; patada o pedrada en pantorrilla). Umbral de Aquiles con marca H"
  - "La bandera c1 (flexión de columna cargada) queda solo en NC (como bandera propia del jefferson); no se agrega a REVERSE HYPER"
requirements-completed: [D5, D11, D15, P2, P4, R5, SC1]
duration: ~25min
completed: 2026-10-21
---

# Phase 200 Plan 21: Fichas HT, NC, REVERSE HYPER, SPAGAT Summary

**Cuatro rutas (cadena posterior, Reverse Hyper y Spagat) con ficha de profe y de alumno completas, destiladas del §2 corregido con sus marcas; lo que la investigación no dice quedó como Pendiente explícito y las relaciones no se tocaron.**

## Task Commits

1. **Task 1: HT, NC** - `ae429dab4` (content)
2. **Task 2: REVERSE HYPER, SPAGAT** - `149f4d66b` (content)

## Qué quedó en cada ruta

Común: `estado: "borrador"`, relaciones intactas, banderas consolidadas heredadas del catálogo (acá solo `banderasRuta`), ficha de alumno sin códigos, latín ni banderas.

| Ruta          | Secciones usadas | Pendientes H                                                                                                        | Pendientes N                                                   | Pendientes fuente                                                                                                                                                   | escalones       |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| HT            | B-HT + §1.3      | ninguno (la sección no marca ⚑H)                                                                                    | "L." en "HT L. ON BOX OL" (§5.4 #12)                           | escalones; mecanismo de rodillas que colapsan, caída de pelvis libre y cuello hiperextendido                                                                        | Pendiente       |
| NC            | B-NC-1..4 + §1.3 | Jefferson con carga (H12); primera dosis de nordic (H16); umbral de tiempo del Aquiles (H5, ⚑H explícito en B-NC-4) | "FR" en "NC BENT FR" (§5.4 #4); "GM" = good morning (§5.4 #26) | escalones; jefferson y gemelos sin fases/cues/tabla de roles; dónde se siente bisagra, jefferson y gemelos; mecanismo de las compensaciones de bisagra              | Pendiente       |
| REVERSE HYPER | C5 + §1.3        | ninguno                                                                                                             | ninguno                                                        | transferencia máquina a versión libre y resultados contradictorios; dónde se siente (bloque ausente); mecanismo de balanceo, rotación pélvica y flexión de rodillas | mapa            |
| SPAGAT        | C1 + C0 + §1.3   | hiperlaxitud o luxación previa en spagat (H7); pigeon/spagat con cadera dolorosa o hiperlaxa (H14)                  | delta/omega (§5.4 #15; H3 lo comparte)                         | evidencia específica de splits; mecanismo de rodilla trasera y de hiperextensión de rodilla delantera                                                               | ficha (4 pasos) |

Notas de contenido:

- **HT**: marcas de filas de la tabla vacías salvo la rodilla ([60]); evidencia en [60][61][62][63][68] con la "lectura honesta" de la sección. "Calambre de isquios" va en compensa como ajuste (R3-24), no como bandera.
- **NC**: cuatro grupos tratados por separado con prefijo ("Nordic ·", "Bisagra ·", etc.). Sin estudio de jefferson en las fuentes: el resumen y la evidencia lo dicen y la sección queda sin tabla propia. Banderas propias: 2 derivar de isquios, 1 urgencia (sesión excéntrica), 1 derivar de bisagra [96], 1 derivar del jefferson [R], 1 derivar del Aquiles (marca H), 1 urgencia de pantorrilla [R]. El texto de alumno cubre el nordic (tips, errores, siente) y nombra los otros tres grupos en `que`.
- **REVERSE HYPER**: marca [100] solo en la fase de piernas colgando (los 20° de lumbar); evidencia [99][100] y C (transferencia no verificada).
- **SPAGAT**: marcas de filas [104], L1, L1+R (pigeon). El paréntesis "para el kinesiólogo" de la bandera 7 no se cargó (rótulos clínicos fuera del texto visible).

## Errores o huecos de relaciones detectados (NO corregidos, para el orquestador)

- Ningún error de rol contra B-HT, B-NC-1..4, C5 y C1.
- **SPAGAT** (`SPAGAT.ts`): la tabla de C1 marca a los flexores de cadera como motor "para elevar activamente" (cadera delantera) y al glúteo mayor como motor "para sostener" (cadera trasera); las relaciones los dejan en `estira` (psoas) y `estabilizador` (glúteo mayor) como lectura pasiva. Ya está documentado en el comentario del archivo como interpretación pendiente de H. La ficha dice las dos lecturas en la fila de cadera. Además el glúteo mayor aparece alargado en la cadera delantera y en el pigeon (C1) pero solo figura como `estabilizador`.
- **REVERSE HYPER** (`REVERSE-HYPER.ts`): erectores quedan `sinergista` (Est-S de cadera) aunque la fila lumbar los marca Est-ISO (alto) y TI-H los pone como motor. Ya documentado.
- **NC** (`NC.ts`): `isquios`, `gluteo-mayor`, `gemelo` y `soleo` quedan `motor` por el rol más alto entre los cuatro gestos; en el nordic el glúteo mayor es estabilizador y el gastrocnemio sinergista. Las notas lo aclaran. Sin id: grácil, sartorio, extensores de muñeca no aplican.

## Verificación

- Task 1 y Task 2 `<automated>`: `OK HT.ts`, `OK NC.ts`, `OK REVERSE-HYPER.ts`, `OK SPAGAT.ts` (borrador, fichas no nulas, escalones mapa solo en la ruta token, sin `[n]` pegado en textos de profe, sin tecnicismos ni códigos de ruta en textos de alumno, afirmaciones bien formadas).
- `git diff HEAD` por tarea: 0 líneas `m: "` cambiadas.
- Higiene `console.` / `any` / `as any`: sin hallazgos.
- `tsc --noEmit --strict` autocontenido (`types.ts` + `content/*.ts` + `content/rutas/*.ts`): `TSC-OK` tras cada tarea.
- Smoke extra (scratchpad, fuera del repo): `validate.ts` compilado a CJS con el tsc absoluto; `validarContenido()` devuelve `[]` (incluye `validarMarcas` contra `CITAS` y `textoAlumnoProblemas`).
- `prettier --write` aplicado a los archivos de cada tarea antes del commit. Sin borrados de archivos.
- Paridad (plan 06) no afectada: relaciones y `diferencias-aprobadas.ts` sin cambios.

## Deviations from Plan

None - el plan se ejecutó tal cual. Decisiones de criterio (no desvíos): escalones Pendiente en HT y NC, lista propia en SPAGAT (C1 da escalera explícita), `siente` Pendiente en REVERSE HYPER; H12/H16/H7/H14 cargados desde §6.3 aunque la sección de la ruta no los marque con ⚑H; los pendientes N de NC (FR, GM) salen de §5.4 #4 y #26.

## Known Stubs

Escalones de HT y NC, `siente` de REVERSE HYPER (profe y alumno) y los "porqué" de compensaciones sin mecanismo son Pendiente intencional: la investigación no tiene el dato. No bloquean el objetivo (P2: nada inventado).

## Threat Flags

None.

## Self-Check: PASSED

- Archivos: `HT.ts`, `NC.ts`, `REVERSE-HYPER.ts`, `SPAGAT.ts` presentes con `fichaProfe: {`.
- Commits `ae429dab4` y `149f4d66b` presentes en `feat/200-anatomia`.
