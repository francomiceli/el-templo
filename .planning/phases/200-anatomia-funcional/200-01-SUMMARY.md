---
phase: 200-anatomia-funcional
plan: 01
subsystem: api
tags: [anatomia, contenido-tipado, validador, vitest, fastify]
requires: []
provides:
  - "Contrato de tipos del modelo de anatomía (types.ts) para los planes 02-23"
  - "16 regiones del dibujo, 28 músculos, glosario y 3 grupos de alumno como datos"
  - "Validador puro validarContenido() y tests de esquema y de cobertura del dibujo"
affects: [200-02, 200-03, 200-04, 200-05, 200-06, 200-09]
tech-stack:
  added: []
  patterns:
    - "Contenido en .ts con `as const satisfies` y solo `import type` (cargable con node --experimental-strip-types)"
    - "Validador puro que devuelve string[] y un test que exige []"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/types.ts
    - el-templo-api/src/modules/anatomy/validate.ts
    - el-templo-api/src/modules/anatomy/content/regiones.ts
    - el-templo-api/src/modules/anatomy/content/musculos.ts
    - el-templo-api/src/modules/anatomy/content/glosario.ts
    - el-templo-api/src/modules/anatomy/content/grupos-alumno.ts
    - el-templo-api/test/anatomy/content-schema.test.ts
    - el-templo-api/test/anatomy/content-coverage.test.ts
  modified: []
key-decisions:
  - "validate.ts exporta además validarGruposAlumno (no pedido por el plan) y validarContenido lo incluye"
  - "Códigos de ruta bloqueados en texto de alumno con lookbehind/lookahead [A-Z0-9] (no \\b) para soportar MN/RP, REVERSE HYPER y SIDE PCK"
requirements-completed: [D3, D4, D5, D9, D14, P2, P3, SC1]
duration: ~35min
completed: 2026-10-21
---

# Phase 200 Plan 01: Contrato de tipos, regiones, músculos y validador Summary

**Fundación del modelo de anatomía en el API: contrato de tipos (RutaContenido, FichaProfe, Seccion/Pendiente, Marca), 16 regiones, 28 músculos, glosario, grupos de alumno y un validador puro con 21 tests de CI.**

## Task Commits

1. **Task 1: contrato + regiones + grupos de alumno + glosario** - `c761e1e03` (feat)
2. **Task 2: los 28 músculos** - `595a89cce` (feat)
3. **Task 3: validador + tests de esquema y cobertura** - `dd3f5ade0` (test)

## Verificación (todo estático; los tests corren en CI)

- Task 1: carga con `node --experimental-strip-types` de types/regiones/grupos-alumno/glosario imprime `OK carga`. Greps del contrato OK; 16 `slug:`, 16 `grupo:`, 1 `enTv: false`, `TvZonaSlug` exportado; sin imports de valor en `content/` ni en `types.ts`.
- Task 2: carga de `musculos.ts` imprime `OK` (28 músculos, ids únicos, null exacto en serrato/manguito/psoas, precisión null <=> zona null, `queHaceAlumno` no vacío). Sin arrays M/S/Est/Al/Ant. `MusculoId` exportado.
- Task 3: greps de las 7 funciones/constantes de `validate.ts` y de los tests OK; higiene (`console.`, `any`) sin salidas.
- `tsc --noEmit --strict` (binario del checkout principal) sobre `types.ts` + `content/*.ts`: sin errores (`TSC-CONTENT-OK`).
- Adicional: `tsc` compiló `validate.ts` (+ `route-progression-map.ts`) a CJS en el scratchpad y un script de humo (no commiteado) ejecutó la lógica de ambos tests: `validarContenido()` devuelve `[]`, 14 casos negativos muerden, JSON admin == app (byte a byte), cada región está en la figura que corresponde y las solo-front/solo-back no están en la vista opuesta. 65 chequeos OK, 0 FAIL.
- NO se corrieron los tests de vitest (no hay `node_modules` en el worktree; corren en CI). Los archivos `.test.ts` no se pudieron typechequear localmente por la misma razón (importan `vitest`).

## Deviations from Plan

### Auto-fixed / agregados

**1. [Rule 2 - cobertura] `validarGruposAlumno` exportada**
- El plan pedía que `validarContenido` validara los 3 grupos de alumno; lo hice con una función propia exportada (`validarGruposAlumno(grupos = GRUPOS_ALUMNO)`) para poder testear casos negativos. También verifica que cada rol del grupo coincida con `GRUPO_DE_ROL`.
- Commit `dd3f5ade0`.

**2. [Rule 1 - gate] Comentario de `regiones.ts` reescrito**
- El comentario mencionaba el literal `enTv: false`, que hacía fallar el gate `grep -c 'enTv: false' == 1`. Se reformuló ("flag enTv apagado"). Commit `c761e1e03`.

**3. Test extra de coherencia con la TV**
- `content-coverage.test.ts` compara además las regiones `enTv` contra `ZONAS_ORDEN` importado de `tv/muscle-zones.ts` (no solo contra la lista literal del plan), para que un cambio en la TV rompa el test.

### Desviaciones de proceso (para el orquestador)

- **STATE.md y ROADMAP.md NO se actualizaron ni commitearon.** Las reglas del ejecutor (`200-EXECUTOR-RULES.md` > Git) prohíben commitear docs fuera de `.planning/phases/200-anatomia-funcional/` y el criterio de éxito pide worktree limpio; lo resolví a favor de las reglas. El orquestador debe marcar `200-01-PLAN.md` en ROADMAP (línea 460) y actualizar STATE.
- No se ejecutó `gsd-sdk query state.*` por la misma razón.

## Notas para los planes siguientes

- `types.ts` no tiene un arreglo runtime de `MarcaLetra`; `validate.ts` define `MARCAS_LETRA` internamente (si el plan 02 necesita las letras como valor, importar/exportar desde ahí o duplicar con cuidado). El máximo de cita (109) es la constante `MAX_CITA` de `validate.ts`.
- `textoAlumnoProblemas` excluye el código `L` (ambiguo con la letra suelta) pero bloquea el resto de las claves de `ROUTE_PROGRESSION_MAP` en mayúscula (incluye `MN/RP`, `REVERSE HYPER`, `SIDE PCK`). Ojo con textos de alumno que usen siglas como "PS", "HS", "AF" aun como palabra común en mayúscula.
- `validate.ts` importa por valor `../exercises/route-progression-map`, por lo que NO se puede cargar con `node --experimental-strip-types` (import extensionless); para chequear localmente hay que compilar con `tsc --module commonjs --outDir <scratchpad>` (así lo hice).
- Los tests de la fase se cargan bajo `setupFiles` de vitest (provisiona DB por worker) aunque no usen DB: es el comportamiento estándar del repo.
- Formato Prettier hecho a mano (el pre-commit no corre en el worktree): conviene que el orquestador/CI confirme `prettier --check` sobre los 8 archivos nuevos.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno (sin endpoints, sin schema, sin input de usuario en runtime).

## Self-Check: PASSED

Los 8 archivos existen y los commits `c761e1e03`, `595a89cce`, `dd3f5ade0` están en `feat/200-anatomia`.
