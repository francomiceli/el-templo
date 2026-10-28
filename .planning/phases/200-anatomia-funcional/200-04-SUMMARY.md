---
phase: 200-anatomia-funcional
plan: 04
subsystem: api
tags:
  [
    anatomia,
    contenido-tipado,
    rutas-push,
    rutas-core,
    relaciones,
    validar-rutas,
  ]
requires: ["200-03"]
provides:
  - "Relaciones por rol (R2) de las 8 rutas PUSH (BL, HD/ID, OAPU, PL, PLPU, HS, HSPU, PHS) y de HR (core), con marcas de evidencia"
  - "Índice RUTAS (16 rutas) y RUTAS_POR_CODIGO en content/rutas/index.ts"
  - "validarRutas integrada en validarContenido, con casos negativos y cobertura contra ROUTE_PROGRESSION_MAP y ROUTE_LABELS"
affects: [200-05, 200-06, 200-09, 200-17, 200-22]
tech-stack:
  added: []
  patterns:
    - "Archivo de ruta: `export const <ID> = {...} as const satisfies RutaContenido`, solo `import type`"
    - "content/rutas/index.ts es la única excepción con imports de valor (junta los archivos de ruta)"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/content/rutas/BL.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HD-ID.ts
    - el-templo-api/src/modules/anatomy/content/rutas/OAPU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PL.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PLPU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HSPU.ts
    - el-templo-api/src/modules/anatomy/content/rutas/PHS.ts
    - el-templo-api/src/modules/anatomy/content/rutas/HR.ts
    - el-templo-api/src/modules/anatomy/content/rutas/index.ts
  modified:
    - el-templo-api/src/modules/anatomy/validate.ts
    - el-templo-api/test/anatomy/content-schema.test.ts
    - el-templo-api/test/anatomy/content-coverage.test.ts
key-decisions:
  - "Tabla articular de la ruta manda sobre S8 (R2); S8 aporta además los músculos con id que la tabla no nombra (marca de S8, o [] si S8 no trae)"
  - "Celda con dos roles: gana el más alto (motor > sinergista > estabilizador > antagonista > estira), también para 'Est/M' y 'Ant/Est'"
  - "Lo que la fuente no dice no se rellena: queda fuera de las relaciones y se lista abajo como pendiente de fuente"
requirements-completed: [D5, P2, R2, R3, SC1]
duration: ~50min
completed: 2026-10-21
---

# Phase 200 Plan 04: Relaciones PUSH y HR, índice RUTAS y validarRutas Summary

**Relaciones ruta-músculo-rol de las 8 rutas PUSH y de HR destiladas de la tabla articular del §2 + S8 (BL distinta de PL, HS con deltoides anterior, HR con oblicuos y cuadrado lumbar), índice `RUTAS` de 16 rutas y `validarRutas` en CI con 15 casos negativos.**

## Task Commits

1. **Task 1: relaciones de las rutas PUSH y de HR** - `efed8b553` (content)
2. **Task 2: índice RUTAS + validarRutas + tests** - `8f91849b2` (test)

## Relaciones por rol (cantidad por ruta)

| Ruta  | motor | sinergista | estabilizador | antagonista | estira |
| ----- | ----- | ---------- | ------------- | ----------- | ------ |
| BL    | 6     | 0          | 8             | 0           | 0      |
| HD/ID | 6     | 0          | 5             | 0           | 0      |
| OAPU  | 7     | 0          | 4             | 0           | 0      |
| PL    | 8     | 0          | 7             | 0           | 0      |
| PLPU  | 7     | 0          | 5             | 0           | 0      |
| HS    | 4     | 0          | 7             | 1           | 0      |
| HSPU  | 4     | 1          | 5             | 0           | 0      |
| PHS   | 8     | 2          | 4             | 0           | 0      |
| HR    | 6     | 0          | 3             | 1           | 0      |

Las 7 rutas del plan 03 (para el listado completo de `RUTAS`): FL 11/0/5/2/0, FLR 10/0/0/0/0, MN/RP 12/1/5/0/0, OAR 7/0/6/0/0, MU 12/0/2/0/0, OAP 8/0/6/0/0, TTB 8/1/3/0/0. `estira` está vacío en las 16 (ninguna tabla PUSH/HR del §2 marca músculos "Al").

Correcciones R2 verificadas con el verify automatizado: BL != PL (BL lleva bíceps cabeza larga como motor y glúteo mayor/isquios/erectores como motores boca abajo, abdomen y manguito como estabilizadores); HS lleva `delt-ant`; HR lleva `oblicuos`, `cuadrado`, `erectores` y `gluteo-mayor`.

## Verificación (estática; los tests corren en CI)

- Task 1: verify automatizado imprime `OK 9 rutas + R2` (estado borrador, sin músculos repetidos, >=3 relaciones, ninguna marca `[n]` pegada, BL != PL, HS con delt-ant, HR con oblicuos y erectores). `tsc --noEmit --strict` sobre `types.ts` + `content/**`: `OK`. Higiene (`console.`, `any`): sin salidas.
- Task 2: verify automatizado imprime `OK` (16 imports en `index.ts`, `RUTAS_POR_CODIGO`, `validarRutas` exportada y llamada, `deltoides-medio` en el test de esquema, `ROUTE_LABELS` en el de cobertura, sin `console`/`any`, `tsc` autocontenido incluido `rutas/index.ts`).
- Adicional (scratchpad, no commiteado): `validate.ts` compilado a CJS con `tsc --strict` (`COMPILED`, esto también tipa la importación de `RUTAS` y la `ROUTE_PROGRESSION_MAP`). Con ese build: `validarContenido()` devuelve `[]`, `RUTAS` tiene 16 y `RUTAS_POR_CODIGO` 16, y 14 casos sintéticos dan el error esperado (PLYO, `deltoides-medio`, músculo repetido, "antagonista" en la ficha de alumno, escalones `mapa` en PS linear, slug y código duplicados, solo antagonista, rol faltante, marca 999, `quien` inválido, afirmación vacía, patrón inválido) y `mapa` en BL (token) y la ruta base dan `[]`. Los dos archivos de test pasan `tsc --noEmit --strict --esModuleInterop` con un stub de tipos de vitest (scratchpad).
- NO se corrió vitest (no hay `node_modules` en el worktree): corre en CI.
- `prettier --write` aplicado antes de cada commit (HD-ID.ts se reformateó; el resto ya estaba en formato).

## Deviations from Plan

None - el plan se ejecutó como estaba escrito. Decisiones de contenido (no desvíos de proceso):

**1. Rol de las celdas con dos roles.** "Est/M" (trapecio inferior y serrato en HD/ID) pasó a motor y "Ant/Est" (bíceps en HD/ID) a estabilizador, aplicando "el rol más alto" de las reglas (mismo criterio que 200-03 usó para "Ant/S" de MN/RP). Si H prefiere leer el primer rol, cambian trap-inf y serrato de HD/ID a estabilizador y biceps a antagonista (coincide con S8).

**2. S8 como complemento.** Los músculos con id que S8 asigna a la ruta y la tabla no nombra se sumaron con la marca de S8 (`c: []` cuando S8 no trae): BL manguito y braquial; OAPU recto abdominal; PL dorsal y manguito; PLPU dorsal.

## Discrepancias tabla articular vs S8 (para el orquestador y los planes de fichas)

Se aplicó la tabla de la ruta (R2); S8 dice otra cosa en:

- BL: bíceps S8 = estabilizador (SAS), tabla = M/Est (motor). Dorsal S8 = antagonista; la tabla le da Ant (hombro) y Est (escápula, vía húmero) y gana estabilizador; la nota de la relación conserva el "antagonista en el hombro".
- HD/ID: deltoides anterior S8 = estabilizador, tabla = M/S (motor); trapecio inferior S8 = estabilizador, tabla = Est/M (motor); bíceps S8 = antagonista, tabla = Ant/Est (estabilizador).
- OAPU: oblicuos, cuadrado lumbar y glúteo medio S8 = estabilizador (anti-rotación), tabla = M/Est (motor).
- PL: tríceps S8 = estabilizador, tabla = M isométrico (motor); bíceps S8 = estabilizador, tabla = M/Est (motor).
- HS: trapecio inferior y serrato S8 = estabilizador, tabla = M/Est (motor).
- PHS: recto abdominal S8 = estabilizador, tabla = M/Est (motor).
- HSPU, PLPU y HR: sin discrepancias de rol.
- Total: 13 discrepancias de rol resueltas a favor de la tabla. Si el kinesiólogo o Nacho prefieren la lectura S8, es un cambio en estos archivos + `diferencias-aprobadas.ts` (plan 06) + tests.

## Dudas de contenido (no inventadas)

- BL, tríceps: la tabla dice "co-contracción (bloquea el codo)" sin rol; quedó como estabilizador con nota (interpretación, confirmar con H).
- PHS, fila de cadera: nombra "glúteo/isquios (alineación final)" sin asignarles rol y S8 no lista PHS para ellos: quedan FUERA de las relaciones (pendiente `fuente`). Iliopsoas, recto femoral y aductores sí entraron como motores (S8: "PHS compresión").
- PLPU, fila ST: "trapecio = Est" sin porción (PL dice inferior/medio): FUERA de las relaciones (pendiente `fuente`).
- HR, fila arch hold: "trapecio inferior/romboides si los brazos van adelante" sin rol explícito: FUERA (pendiente `fuente`). Deltoides de S6.3 sin id (deltoides medio): fuera por regla. Qué ejercicios componen bote espinal, espinal cajón, espinal 360 y espinal A 1 sigue en ⚑N.
- BL: la fila ST lleva ⚑H (posición escapular por escuela, R2-13): la marca `H` quedó en las relaciones de trap-inf, romboides y dorsal de BL. Cuando BL tenga ficha, va también a `fichaProfe.pendientes`.
- HS: deltoides anterior como estabilizador por S8 (la celda de S5.1 solo da "15 a 18 % de contribución relativa"); trapecio superior motor por S8 ("M elevación").
- HR: oblicuos son antagonistas en S6.2 ("abdominales = Ant") y M/Est en S6.3; gana motor. Recto abdominal quedó antagonista (S6.2).
- HD/ID: siglas abiertas para Nacho (⚑N, D1), anotado en el header del archivo.
- Etiquetas (R3): `ROUTE_LABELS['HR']` = "Ham Raise" (tren inferior), pero el contenido de HR de la investigación es "Espinales y planchas laterales" (core); y `ROUTE_LABELS['MN/RP']` = "L-Sit", `['HD/ID']` = "Hefesto / Impossible Dips". Como R3 manda usar `getRouteLabel`, la UI mostrará "Ham Raise" sobre una ficha de core espinal: el orquestador tiene que decidir si es correcto antes de la ficha de HR (planes 17-22).

## Notas para los planes siguientes

- Plan 05: sumar las 14 de LOWER, MOVILIDAD y FLOW a `RUTAS` (comentario ya puesto en `index.ts`). El test `las rutas cargadas incluyen las 16 ...` usa `arrayContaining`, así que no se rompe al pasar a 30. `validarRutas` ya acepta slugs con dígitos.
- Plan 06: las relaciones de los 16 archivos están listas para proyectar a zonas; usar `RUTAS_POR_CODIGO`.
- `validate.ts` ahora importa `content/rutas` por valor: smoke-test compilando a un directorio scratch (`tsc --module commonjs --outDir <scratch>`), como en 200-01. `index.ts` no carga con `node --experimental-strip-types` (imports sin extensión).
- `validarRutas` revisa fichas: `escalones.fuente === "mapa"` solo para `strategy: "token"`, toda afirmación con texto y marcas válidas, `quien` de pendientes, y `textoAlumnoProblemas` sobre cada string de `fichaAlumno`. Los planes de fichas lo corren en CI.
- Cambia código de producción (`validate.ts`), así que el push dispara el deploy del componente API (no es un fix solo de tests).

## Known Stubs

Las 15 rutas sin ficha (`fichaProfe: null`, `fichaAlumno: null`) son el estado "ficha en preparación" previsto; los planes 17-22 las completan. Solo FL tiene ficha.

## Threat Flags

Ninguno (contenido estático y validación, sin endpoints ni schema). T-200-07B mitigado: invariantes nombradas (BL != PL, HS con delt-ant, HR con oblicuos/cuadrado/erectores/glúteo) en el verify y en `content-schema.test.ts`, más `validarRutas` en `validarContenido`. T-200-08B mitigado: `textoAlumnoProblemas` sobre cada string de alumno dentro de `validarRutas`. T-200-09B mitigado: códigos de `RUTAS` contra `ROUTE_PROGRESSION_MAP` (validador y test) y `ROUTE_LABELS` (test).

## Self-Check: PASSED

Los 10 archivos de `content/rutas/` (9 de ruta + `index.ts`) existen; los commits `efed8b553` y `8f91849b2` están en `feat/200-anatomia`.
