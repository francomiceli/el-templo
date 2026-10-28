---
phase: 200-anatomia-funcional
plan: 10
subsystem: api
tags: [anatomia, migraciones, route-labels, nombres-d1, sissy-ss]
requires: ["200-09"]
provides:
  - "Migracion 0287: routes.display_name D1 (HR, HD/ID, SIDE PCK, MN/RP, FLR) por codigo + tenant"
  - "Migracion 0288: los 5 SISSY SQ OL sin ruta pasan a SS por nombre + ruta vacia + categoria + tenant"
  - "ROUTE_LABELS con nombres D1 en las tres copias (API, app, admin), identicas"
  - "Tests: guard estatico del SQL y sincronia de route-labels x3"
affects: [200-11, 200-14]
tech-stack:
  added: []
  patterns:
    - "Guard estatico de migraciones de datos (texto del SQL, sin DB) porque routes la vacian otras suites"
    - "Espejo de route-labels verificado por regex contra los archivos del front, mismo patron que destinations-sync"
key-files:
  created:
    - el-templo-api/src/db/migrations/0287_route_display_names_d1.sql
    - el-templo-api/src/db/migrations/0288_sissy_sq_ol_to_ss.sql
    - el-templo-api/test/migrations/0287-0288-anatomia.test.ts
    - el-templo-api/test/anatomy/sync-front.test.ts
  modified:
    - el-templo-api/src/modules/tv/route-labels.ts
    - el-templo-app/src/constants/route-labels.ts
    - el-templo-admin/src/constants/route-labels.ts
key-decisions:
  - "0287/0288 son solo datos, idempotentes, con tenant_id = 1 y sin ids; HT/NC/QC no se tocan (R4)"
  - "El archivo del API conserva comillas simples (estilo del espejo): no se corrio prettier --write sobre route-labels.ts del API porque lo pasaria a comillas dobles y rompe el espejo textual"
requirements-completed: [D1, D2, R3, R4, SC6]
duration: ~25min
completed: 2026-10-21
---

# Phase 200 Plan 10: Nombres D1 y SISSY SQ OL a SS Summary

**Migraciones 0287 (cinco nombres oficiales de ruta) y 0288 (5 SISSY SQ OL a SS) mas `route-labels.ts` x3 con los nombres D1, fijado por dos tests de CI.**

## Task Commits

1. **Task 1: migraciones 0287 y 0288** - `7b5abe958` (feat)
2. **Task 2: route-labels x3** - `fd17d0fc5` (feat)
3. **Task 3: tests de SQL y sincronia** - `58642da2b` (test)

## Chequeo de numeracion

`git fetch origin` en primer plano, luego se listaron las migraciones 0284-0299 en cada ref:

| Ref                            | Resultado                                |
| ------------------------------ | ---------------------------------------- |
| worktree (`feat/200-anatomia`) | ultima 0286, 0287/0288 no existen        |
| `origin/master`                | llega a 0283 (con saltos), sin 0284-0289 |
| `origin/staging`               | 0285 y 0286, sin 0287/0288               |
| `feat/196-personalizados`      | sin 0284-0299                            |
| `feat/201-conquer`             | sin 0284-0299                            |

Ninguna ref tiene 0287 ni 0288: numeracion libre. La 0284 queda reservada para la 196. Nota para el orquestador: la memoria menciona migs Conquer 0281/0282 y mig 0284 para la 196, pero en estas refs la 196 todavia no tiene 0284 commiteada, asi que no hay colision hoy. Reverificar al integrar.

## Efecto en el generador (Pitfall 9, A2) - para decirle a Franco

- **Entran al pool de produccion sin rebuild.** La eleccion de ejercicios filtra por `exercises.route` con igualdad (`el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts:104`, `eq(schema.exercises.route, route)`, mas rango de `dificultad_lineal` y nivel en l.105-110). En cuanto 0288 corre, los 5 SISSY SQ OL (categoria KNEE DOMINANT) entran al pool de SS segun su `dificultad_lineal` y nivel (omega/spartan, linear 9-11 segun el plan). Esto es el arreglo pedido (D2), pero cambia lo que el generador puede sortear en SS desde el deploy.
- **El grafo de progresiones NO se actualiza solo.** Las aristas `exercise_progressions` se escriben solo con el CLI `el-templo-api/rebuild-progression-graph.ts` (`npx tsx rebuild-progression-graph.ts`, columna de cadena por `(ruta x esfuerzo)`, solo aristas `source='auto'`, preserva las `manual`). Sin rebuild, los 5 SISSY no tienen aristas: `getNeighbor` devuelve `null` para ellos (`el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts`, rama `edges.length === 0`, "End of chain / off-graph"). Consecuencia: el ajuste dentro de la sesion (subir/bajar un escalon) no encuentra vecino para esos 5 y el arbol de fuerza de SS no los muestra hasta el rebuild. No hace falta para que se generen sesiones.
- **Recomendacion:** correr el rebuild despues del deploy de la 0288 (decision de Franco, ya que el rebuild toca produccion). No se ejecuto ni se escribio ningun script aqui.
- Condiciones del grafo (`backbone-scope.ts`): canonico, esfuerzo CON/EXC/ISO, sin habilidad, sin hito, ruta no excluida del arbol. Si alguno de los 5 SISSY tiene `milestone_exercise_id` o `habilidad`, quedaria fuera del backbone igual despues del rebuild (no verificable sin DB).

## Verificacion

- Task 1 `<automated>` (corrido como script del scratchpad por el guard del worktree, mismo contenido): sin `;` en comentarios, 5 nombres D1, 5 `tenant_id = 1`, sin HT/NC/QC, 0288 con `SET route = 'SS'`, `TRIM(route) = ''`, `LIKE 'SISSY SQ OL%'`, sin WHERE por id, las dos ultimas migraciones: **OK**.
- Task 2 `<automated>`: los 5 nombres en las tres copias, sin "Ham Raise"/"L-Sit'"/"Hefesto"/"Front Lever Pull Ups", diff vacio de pares clave-valor app/API y app/admin: **OK**.
- Task 3 `<automated>` (los tokens exigidos presentes) e higiene (`console.*`, `any`): **sin hallazgos**.
- Chequeo extra: el regex de extraccion del test, corrido en Node contra las tres copias, devuelve 32 pares iguales en las tres (30 rutas + `games` + `FB`).
- `prettier --write` aplicado a los dos tests. En los `route-labels.ts` el app y el admin pasan `prettier --check`. El del API no (comillas simples, pre-existente y pedido por el plan conservarlo): no se reformateo.
- Los tests NO se corrieron (CI). `git status --porcelain` limpio al cerrar (despues del commit del SUMMARY).

## Deviations from Plan

Ninguno: plan ejecutado tal cual. Dos notas de implementacion:

- `sync-front.test.ts` importa `RUTAS` de `src/modules/anatomy/content/rutas` (existe desde el plan 200-0x) para exigir etiqueta de las 30 rutas.
- Se reviso si algun test fija los nombres viejos: `blockMeta.test.ts` (app) usa 'Front Lever Pull Ups' solo como cadena de prueba de `keepHyphenWords`, no el mapa de etiquetas, asi que no se toca. `serializers.test.ts` compara `nombre` contra `getRouteLabel("MN/RP")`, que sigue valido.

## Items abiertos / notas para el orquestador

- **Builds nativos:** los telefonos con app 1.8.x siguen mostrando los nombres viejos (bundle con `route-labels.ts` embebido) hasta el proximo build nativo. Las pantallas que leen `routes.display_name` desde el API ya muestran los nuevos al correr 0287.
- **Deploy:** el plan toca codigo de produccion del API (`route-labels.ts`) ademas de migraciones, asi que el `paths-filter` dispara. Las migraciones correran contra prod al mergear (staging y prod comparten host): son updates dirigidos por codigo/nombre + tenant.
- Rebuild del grafo de progresiones: decision de Franco (ver arriba).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model (T-200-26 y T-200-27 mitigados con WHERE por codigo/nombre + tenant, idempotencia y guard estatico; T-200-28 aceptado y documentado arriba).

## Self-Check: PASSED

Archivos presentes (`0287_route_display_names_d1.sql`, `0288_sissy_sq_ol_to_ss.sql`, los dos tests, las tres copias de route-labels) y commits `7b5abe958`, `fd17d0fc5`, `58642da2b` en `feat/200-anatomia`.
