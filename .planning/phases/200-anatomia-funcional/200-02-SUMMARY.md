---
phase: 200-anatomia-funcional
plan: 02
subsystem: api
tags: [anatomia, contenido-tipado, banderas, citas, validador, vitest]
requires: ["200-01"]
provides:
  - "BANDERAS: 34 banderas de derivación (a1-a7, b1-b21, c1-c6) con rutas, fuente y nota interna separada"
  - "CITAS: 109 citas numeradas + L1-L5 y LEYENDA_MARCAS (C, M, R, H, N) para el tooltip de las marcas"
  - "validarCitas, validarBanderas y validarMarcas contra CITAS, todo dentro de validarContenido()"
affects: [200-03, 200-04, 200-05, 200-09, 200-17, 200-22]
tech-stack:
  added: []
  patterns:
    - "Catálogos transversales como `as const satisfies` con solo `import type`"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/content/banderas.ts
    - el-templo-api/src/modules/anatomy/content/citas.ts
  modified:
    - el-templo-api/src/modules/anatomy/validate.ts
    - el-templo-api/test/anatomy/content-schema.test.ts
key-decisions:
  - "b17 queda con rutas [] (aplicaba solo a PLYO y CARDIO, descartadas por D2); el validador admite lista vacía solo para b17"
  - "Las marcas [n] y los ⚑H se sacan de senal/accion: las citas van a notaInterna ('Evidencia: [31]') y el ⚑H a umbralH + notaInterna"
  - "c1 sigue el plan (NC, HR, PIKE) aunque §3.2 también lista REVERSE HYPER y BRIDGE en ese bloque"
requirements-completed: [D5, D11, P2, P4, SC1]
duration: ~40min
completed: 2026-10-21
---

# Phase 200 Plan 02: Banderas, citas y leyenda de marcas Summary

**34 banderas de derivación con rutas derivadas de §3.1+§3.2, 114 citas del Apéndice A con su lectura, leyenda de marcas y validadores que rechazan marcas huérfanas, rutas fuera de las 30 y rótulos clínicos en el texto visible.**

## Task Commits

1. **Task 1: banderas** - `90d8c5d31` (feat)
2. **Task 2: citas + leyenda** - `104231dea` (feat)
3. **Task 3: validación + tests** - `75b811346` (test)

## Verificación (estática; los tests corren en CI)

- Task 1: carga con `node --experimental-strip-types`: 34 banderas en orden a1..c6, señal/acción/fuente no vacías, sin rótulos clínicos visibles. `OK`.
- Task 2: 114 citas (1..109 + L1..L5), `texto`/`lectura` no vacíos, `LEYENDA_MARCAS` = C,H,M,N,R. `grep PMID` fuera de comentarios: sin resultados. `tsc --noEmit --strict` sobre `types.ts` + `content/*.ts`: sin errores.
- Task 3: greps del plan (funciones, `CITAS`, `BANDERAS`, `999`, `PLYO`, `escafoides`) OK; higiene (`console.`, `any`) sin salidas; `prettier --check` OK en los 4 archivos.
- Adicional: `validate.ts` compilado a CJS con `tsc` en el scratchpad y un script de humo (no commiteado) ejecutó la lógica de los casos nuevos: `validarContenido()` devuelve `[]` y todos los casos negativos muerden (marca 999, ruta PLYO, rótulo clínico en señal/acción, nivel incoherente, ids mal formados/duplicados, rutas repetidas/vacías, citas duplicadas o vacías). `SMOKE OK`, 0 FAIL.
- NO se corrió vitest (no hay `node_modules`); `content-schema.test.ts` no se pudo typechequear localmente (importa `vitest`).

## Deviations from Plan

**1. [Rule 2 - correctitud] b17 sin rutas y validador con excepción**

- El plan pide `rutas` = "todas" o lista no vacía, pero b17 (tibia, plyo) solo aplicaba a PLYO y CARDIO, que D2 descarta; §3.2 solo la menciona en "Gemelos, PLYO, CARDIO". Usar `"todas"` mostraría una bandera de tibia en las 30 rutas, falso. Quedó `rutas: []` con nota interna que lo explica, y `validarBanderas` admite lista vacía solo para el id `b17` (`BANDERAS_SIN_RUTAS_V1`); el resto con `[]` da error (testeado).
- Commits `90d8c5d31`, `75b811346`.

**2. [Regla 4 de EXECUTOR-RULES] Citas `[n]` y `⚑H` sacadas de `senal`/`accion`**

- `BanderaDef` no tiene campo de marcas. Para no dejar `[31]` ni `⚑H` en el texto visible: la cita pasó a `notaInterna` ("Evidencia: [31]"), el `⚑H` quedó en `umbralH: true` y en la nota. Por eso b8, b10, b11, b19, b21, c1 y c5 tienen `notaInterna` no nula aunque la tabla no traía "nota interna". b5/a7/c4 perdieron el "⚑H" del texto de acción (c4: "Dosis inicial segura: a definir").
- Moví los rótulos de b7 ("escafoides") y b14 ("Nota interna: ...") a `notaInterna`, como pide el plan.

**3. Citas: `lectura` conserva la nota de la revisión entre paréntesis y se quitaron PMID/PMC/doi**

- Las citas se generaron con un script del scratchpad (no commiteado) a partir del Apéndice A y se revisaron a mano. Se retocó la nota de [31] (tenía PMC/PMID) y la duplicación de [87]. Las entradas [37]-[39] tienen `lectura` larga (el apéndice las describe así).
- `validarCitas` sumó un chequeo de rango (1..109 / L1..L5) no pedido.

**4. Test extra**: sumé a `content-schema.test.ts` casos de leyenda, conteos por nivel (7/21/6), rutas "todas" de las transversales y b17 vacía, además de los 4 negativos pedidos.

## Rutas por bandera (decisiones para quien revise)

- Las traducciones siguen la tabla del plan. Casos que el plan no cubría explícitamente y resolví uniendo "Dónde aplica" con §3.2: a1 incluye MN/RP (§3.2 "MN/RP y TTB: a1"); a3 incluye L, PS, SU, DS, HT; b11 incluye PIKE y NC; b14 incluye L, QC, SS, SU; b16 solo NC; b18 incluye L, PS, DS; b21 incluye FLR, MU, OAP, OAR, TTB (de los grupos de §3.2).
- **c1** quedó en NC, HR, PIKE según el plan; §3.2 además lista REVERSE HYPER y BRIDGE en ese grupo de c1. Para el orquestador: si se prefiere la unión literal, sumarlas en `banderas.ts` (no rompe nada).
- Ninguna otra bandera necesitó el fallback `"todas"` por falta de texto. Se usa `"todas"` solo en a2, a6, b1-b8 y c6.
- Las rutas descartadas (PLYO, CARDIO, KL) no aparecen en ninguna bandera.

## Notas para los planes siguientes

- La ficha de cada ruta debe derivar "Cuándo derivar" filtrando `BANDERAS` por `rutas.includes(code) || rutas === "todas"`; `notaInterna` no debe salir del API (plan 09).
- `ROTULOS_CLINICOS` está exportado desde `validate.ts` por si el serializador quiere reutilizarlo.
- `citas.ts` y `banderas.ts` solo tienen `import type`: cargan con `node --experimental-strip-types`. `validate.ts` sigue necesitando compilación a CJS para probarse localmente.
- Prettier ya aplicado a los 4 archivos con el binario del checkout principal.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-200-04 (rótulos clínicos solo en `notaInterna`) y T-200-05 (marcas validadas contra `CITAS`) mitigados en `validarBanderas`/`validarMarcas`; T-200-06 aceptado (`umbralH` marca lo pendiente de validar).

## Self-Check: PASSED

`banderas.ts` y `citas.ts` existen; commits `90d8c5d31`, `104231dea` y `75b811346` están en `feat/200-anatomia`.
