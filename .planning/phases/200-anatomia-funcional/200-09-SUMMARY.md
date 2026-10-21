---
phase: 200-anatomia-funcional
plan: 09
subsystem: api
tags: [anatomia, endpoints, serializadores, rbac, tenancy]
requires: ["200-08"]
provides:
  - "GET /api/admin/anatomy: vista de profe completa (ANATOMIA_STAFF_ROLES, R1) con ejercicios reales del catalogo por tenant"
  - "GET /api/anatomy: vista de alumno recortada en el server (cualquier autenticado)"
  - "serializers.ts: vistaProfe(ejerciciosPorRuta), vistaAlumno(), ejerciciosPorRutaDe(filas) y los tipos del payload"
  - "ANATOMIA_STAFF_ROLES en shared/permissions.ts"
affects: [200-10, 200-11, 200-12, 200-14]
tech-stack:
  added: []
  patterns:
    - "Recorte por audiencia en serializers.ts (puro, testeable sin DB); el endpoint solo lee exercises y delega"
    - "Ruta normalizada en SQL (UPPER(TRIM(route))) y en TS (normalizarCodigo): el CSV trae espacios y mayusculas mezcladas"
key-files:
  created:
    - el-templo-api/src/modules/anatomy/serializers.ts
    - el-templo-api/src/modules/anatomy/routes.ts
    - el-templo-api/src/modules/anatomy/index.ts
    - el-templo-api/test/anatomy/serializers.test.ts
    - el-templo-api/test/anatomy/anatomy-routes.test.ts
  modified:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/rbac-sets.test.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "notaInterna de las banderas no sale en ninguna vista (BanderaVista no tiene el campo; test en serializadores y en el endpoint, incluso sobre el body crudo)"
  - "El filtro de ruta del query compara UPPER(TRIM(route)) contra los 30 codigos: un ejercicio con route 'fl ' (CSV) igual cuenta en FL"
  - "Los errores del handler van por handleServiceError (AppError de assertTenant sale como 403), mismo patron que programs/routes.ts"
requirements-completed: [D3, D8, D9, D10, D11, D14, D15, P3, R1, R3, SC3, SC4]
duration: ~45min
completed: 2026-10-21
---

# Phase 200 Plan 09: Endpoints de anatomia y serializadores por audiencia Summary

**Dos GET de solo lectura: `/api/admin/anatomy` (profe completo, staff de piso) y `/api/anatomy` (alumno recortado en el server), con manifiesto de tenancy 478 y tests de integracion.**

## Task Commits

1. **Task 1: serializadores por audiencia + test unitario** - `f187f034b` (feat)
2. **Task 2: endpoints, rol y registro del modulo** - `70db8011f` (feat)
3. **Task 3: manifiesto, sets de roles y test de integracion** - `86906f545` (test)

## Contrato para los planes 11 (admin) y 14 (app)

Tipos exportados de `el-templo-api/src/modules/anatomy/serializers.ts` (los espejan admin y app). Forma exacta tal como se implemento (coincide con `<interfaces>` del plan salvo lo anotado en "Notas").

### `GET /api/admin/anatomy` -> `VistaProfe`

- 401 sin token. 403 `{ error: "Acceso denegado", message: "Acceso requerido" }` para todo rol fuera de `["admin","owner","coach","coach_actividad"]` (incluye member, gestion, recepcion, tv, admin_sede).
- `estado: "borrador"`.
- `regiones[16]`: `{ slug, nombre, vista, grupo, musculos: string[] }` (ids de musculos con esa zona, orden MUSCULOS; >1 = "esta zona es un grupo").
- `musculos[28]`: `{ id, nombre, zona: {slug, vista} | null, precision | null, nota: Afirmacion | null, roles: Record<Rol, string[]> }` (`roles` = CODIGOS de ruta por rol, orden RUTAS; los 5 roles siempre presentes aunque vacios).
- `rutas[30]` (`RutaProfe`): `{ code, nombre (getRouteLabel), slug, patron, categoria, estado, nEjercicios, ejercicios: string[], relaciones: Record<Rol, {m, nombre, c, nota|null}[]>, zonasFicha: {slug, vista, rol}[], sinDibujo: {m, nombre, rol}[], fichaProfe: FichaProfeVista | null }`.
  - `zonasFicha`: una entrada por (slug, vista), rol de mayor prioridad, orden de REGIONES. FL tiene `trapezius` dos veces (vista `back` motor y vista `both` antagonista) porque `trap-inf` y `trap-sup` tienen vistas distintas: es una entrada por (slug, vista), tal como pide el plan. El admin decide como pintar ambas.
  - `fichaProfe` = `FichaProfe` + `escalones: string[] | Pendiente` (FL: `["Tuck","Adv tuck","Super adv","Straddle","Half layout","Full"]`, PS: lista propia de la ficha) + `banderas: {id, nivel, senal, accion, fuente, umbralH}[]` (sin `notaInterna`). 28 de 30 rutas viajan hoy con `fichaProfe: null` ("en preparacion"); solo FL y PS tienen ficha.
- `glosario: { roles, contracciones, precision }`, `citas: CitaDef[]`, `leyenda: {C,M,R,H,N}`.

### `GET /api/anatomy` -> `VistaAlumno` (cualquier autenticado)

- `regiones[16]` igual que en profe.
- `musculos[28]`: `{ id, nombre, zona | null, queHace, grupos: { fuerte, sostiene, estira } }` con SLUGS de ruta (fuerte = motor + sinergista, sostiene = estabilizador, estira = estira; antagonista descartado).
- `rutas[30]`: `{ slug, nombre, patron, zonas: {slug, vista, grupo: "fuerte"|"sostiene"}[], fuerte: string[], sostiene: string[] (nombres de musculos), fichaCorta: {que, siente, tips, errores} | null }`. Cada seccion pendiente viaja como `null` ("Pronto"); `fichaCorta: null` si la ruta no tiene fichaAlumno (hoy 28 de 30).
- `grupos[3]`: `{ id, frase, definicion }`.
- Verificado por recorrido profundo: ninguna clave en `{code, antagonista, banderas, banderasRuta, fichaProfe, notaInterna, relaciones, c, pendientes}`, ningun string igual a un codigo de `ROUTE_PROGRESSION_MAP`, ningun string con problemas de `textoAlumnoProblemas`.
- `lower-back` no sale en las zonas de FL del alumno (el erector es antagonista ahi y nadie de mayor prioridad comparte la zona).

### Tamano de los payloads (A1 del RESEARCH), medido compilando fuera del repo

| Payload                                                      | Hoy (2 fichas de 30) | Estimado con las 30 fichas |
| ------------------------------------------------------------ | -------------------- | -------------------------- |
| Profe (`vistaProfe(new Map())`, sin ejercicios del catalogo) | 118 KB               | ~450-480 KB sin comprimir  |
| Alumno                                                       | 35 KB                | ~60-80 KB                  |

Desglose profe: ruta con ficha ~14 KB (FL y PS), ruta sin ficha ~1.9 KB, glosario + citas + leyenda ~29 KB. Cada ficha repite sus ~16 banderas heredadas (senal + accion), y eso es mas de la mitad de los 14 KB. Con las 30 fichas el payload de profe supera la estimacion A1 (150-250 KB). Con gzip del proxy deberia quedar en ~50-80 KB; ver "Items abiertos".

## Verificacion

- Task 1 `<automated>`: simbolos presentes (`vistaProfe`, `vistaAlumno`, tipos, `getRouteLabel`, `ROUTE_PROGRESSION_MAP`, `BANDERAS`), sin `notaInterna:` en el serializador, test con `notaInterna`/`antagonista`/`Adv tuck`, higiene sin `console`/`any`: OK.
- Task 2 `<automated>`: `ANATOMIA_STAFF_ROLES` con valor exacto (chequeo con `tr -d`), dos rutas, `tenantWhere(schema.exercises`, `assertTenant(request.scope, "anatomy.ejercicios")`, `moduleScope(app, "templo-training", anatomyRoutes, { prefix: "/api" })`: OK.
- Task 3 `<automated>`: manifiesto, `ENTRADAS_BASELINE = 478`, titulo "exactamente las 478 entradas", `ANATOMIA_STAFF_ROLES` en rbac-sets, tokens del test de integracion, sin ids fijos: OK.
- `serializers.ts` compila con `tsc --strict` (binario del checkout principal) sin errores.
- Smoke (scratchpad, no commiteado): `serializers.ts` + `validate.ts` compilados a CommonJS fuera del repo y ejecutados: 30 rutas / 28 musculos / 16 regiones en ambas vistas; recorrido profundo de alumno sin hallazgos; sin `notaInterna` en profe; FL escalones Sentence case; FL incluye b9 y b21, PS no incluye b9; `sinDibujo` de FL = psoas, manguito, serrato; `MN/RP` -> `getRouteLabel`; `dorsal.grupos.fuerte` incluye `dominadas`.
- Los tests NO se corrieron (CI). `routes.ts` no se pudo typechequear aca (el API no tiene `node_modules` en el worktree); se escribio imitando `programs/routes.ts` y `bar-challenge/routes.ts`.
- `prettier --write` aplicado antes de cada commit sobre los archivos tocados.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Robustez] Filtro de ruta normalizado en SQL**

- **Found during:** Task 2
- **Issue:** el plan pedia `inArray(schema.exercises.route, codigos)`. El CSV de ejercicios trae espacios finales y mayusculas mezcladas (documentado en `projection.ts`), y con una collation sin PAD SPACE un `'FL '` no matchearia.
- **Fix:** `inArray(sql\`UPPER(TRIM(route))\`, codigos)`+ agrupado en TS con`normalizarCodigo`. El test siembra un ejercicio con route `"fl "`y verifica que cuenta en FL. Sigue usando`tenantWhere(schema.exercises, ctx)`.
- **Files modified:** `el-templo-api/src/modules/anatomy/routes.ts`
- **Commit:** `70db8011f`

### Notas de implementacion (no son desvios)

- `ejerciciosPorRutaDe(filas)` (agrupar/ordenar/deduplicar) vive en `serializers.ts` y no inline en la ruta: es puro y queda testeado sin DB (`serializers.test.ts`).
- Se agrego el header de historial del manifiesto (`tenant-manifest.ts`) con el bloque "2026-10-21 - 478 rutas". El header ya estaba desactualizado desde la 431; solo se contabiliza esta unidad, como hacen los bloques anteriores.
- `rbac-sets.test.ts`: ademas del `it` nuevo, `ANATOMIA_STAFF_ROLES` se sumo a `NO_ENTRA` del bloque admin_sede y a `ENTRA` del bloque coach_actividad (los dos bloques recorren sets con `it.each`).
- Orden de `ejercicios`: `dificultad_lineal`, `progression_step` (NULL al final), nombre (`localeCompare("es")`).

## Items abiertos / notas para el orquestador

- **Tamano del payload de profe (A1):** proyectado ~450 KB con las 30 fichas. Opcion barata si molesta: sacar `banderas` de cada `fichaProfe` y mandar un catalogo `banderas` global + `banderaIds` por ruta (baja a ~200 KB). Cambia el contrato de `RutaProfe`, asi que hay que decidirlo antes del plan 11. No se toco porque `<interfaces>` lo fija asi. Confirmar que el proxy/Fastify comprime JSON (no se verifico).
- **Tests de aislamiento de tenant (T-200-23):** el test de integracion usa solo el gimnasio 1. No se sembro un ejercicio de un segundo gimnasio (requiere tenant 2 con sus usuarios). `lint:tenant` y `tenantWhere` cubren la mitigacion; si se quiere un caso de aislamiento explicito, es un agregado chico en CI.
- **Deploy:** este plan toca codigo de produccion del API (rutas, permisos, app.ts), asi que el `paths-filter` dispara.
- `ROUTE_LABELS` del API sigue con los nombres viejos hasta el plan 10; `nombre` en ambas vistas sale de `getRouteLabel` y cambiara solo.
- No se corrio `pnpm lint:tenant` ni la suite (sin `node_modules`); queda para CI.

## Known Stubs

Ninguno. Las 28 rutas con `fichaProfe: null` / `fichaAlumno: null` son un estado real del contenido ("en preparacion"), resuelto por los planes 17-22.

## Threat Flags

Ninguno fuera del threat model del plan. T-200-20 (guard de rol + moduleScope + test 401/403/200), T-200-21 (recorte en el server + recorrido profundo), T-200-22 (notaInterna nunca serializada, test en las dos vistas), T-200-23 (`tenantWhere` + `assertTenant`) mitigados.

## Self-Check: PASSED

Archivos creados presentes, commits `f187f034b`, `70db8011f` y `86906f545` en `feat/200-anatomia`.
