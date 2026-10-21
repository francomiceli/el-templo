---
phase: 200-anatomia-funcional
plan: 08
subsystem: api-tests
tags: [anatomia, tests, tv, weekly, zone-hits, canasta]
requires: ["200-07"]
provides:
  - "Tests de integracion de canasta, /weekly y TV esperan zonas por RUTA del modelo (Pitfall 5)"
  - "zoneHits de /weekly y /daily fijado por test de integracion (D17, SC5)"
  - "La TV no recibe tibialis aunque la ruta lo pinte (QC) y respeta el orden ZONAS_TV (T20)"
affects: [200-11, 200-12]
tech-stack:
  added: []
  patterns:
    - "Expectativas de cableado calculadas con zonasDeRuta/soloTv/zoneHitsDeRutas; 1+ invariante literal por archivo"
key-files:
  created: []
  modified:
    - el-templo-api/test/sessions/_free-blocks-fixtures.ts
    - el-templo-api/test/sessions/free-blocks-list.test.ts
    - el-templo-api/test/sessions/free-blocks-invariants.test.ts
    - el-templo-api/test/sessions/weekly-zones.test.ts
    - el-templo-api/test/tv/tv-recorrido-inicio.test.ts
    - el-templo-api/test/tv/tv-recorrido-screen.test.ts
key-decisions:
  - "tv-class-day.test.ts NO se toca: el caso ROM (l.230) solo mira el roster/roles, no zonas"
  - "En /weekly se suman bloques al fixture (INITIUM sin ruta, ATHLOS con AF, EPIKOS con FL) en vez de cambiar la semantica de DEUTEROS_1"
requirements-completed: [D17, D18, D20, SC2, SC5]
duration: ~35min
completed: 2026-10-21
---

# Phase 200 Plan 08: Tests de integracion de zonas por ruta Summary

**Canasta, /weekly y TV pasan a esperar zonas por ruta del modelo, y `zoneHits` + el filtro de tibialis de la TV quedan fijados por tests de integracion (corren en CI).**

## Task Commits

1. **Task 1: fixtures y canasta por ruta** - `ca3e817ec` (test)
2. **Task 2: /weekly con zonas del modelo y zoneHits** - `9564ebdf8` (test)
3. **Task 3: TV por ruta, sin tibialis** - `817c3ce57` (test)

## Que cambio

- `_free-blocks-fixtures.ts`: `seedExercise` con `route` default `""` (antes `"AF"`); comentario actualizado (la secundaria ya no afecta zonas).
- `free-blocks-list.test.ts`: helper `ex({ route?, category? })`; rutas elegidas `RUTA_EMPUJE = HD/ID` (pecho), `RUTA_TRACCION = OAR` (espalda/hombros/brazos, sin pecho ni piernas ni core), `RUTA_PIERNA = L` (cuadriceps, gluteos, isquios, aductores). Cada caso trae una guarda previa con `zonasDeRuta`/`gruposDeZonas` (si el modelo cambia y la ruta ya no separa los grupos, el test lo dice). `todayZones` se compara con `zonasDeRuta("L")`.
- `free-blocks-invariants.test.ts`: mismo helper (las zonas no importan para los contadores; se siembra HD/ID para que los bloques tengan zonas reales).
- `weekly-zones.test.ts`: NUCLEUS = union `OAP` + `SS` en `ZONAS_ORDEN` (invariantes literales: `quadriceps` y `upper-back`; sin `deltoids`/`triceps` de la movilidad HD/ID); DEUTEROS sin ruta sigue `[]`; nuevo bloque ATHLOS con ruta AF = `zonasDeRuta("AF")` (ya no `[]`); `it` nuevo "cada bloque trae zoneHits": NUCLEUS = `zoneHitsDeRutas(["OAP","SS"])` con `dorsal` en `upper-back`, INITIUM y DEUTEROS sin ruta = `{}`, ROM_CORE = exactamente las claves de su `zones` con `movilidad: true`, EPIKOS (FL, que tiene antagonistas `trap-sup`/`erectores`) no envia ningun antagonista. `/daily` tambien compara `zoneHits`.
- `tv-recorrido-inicio.test.ts`: expectativas por `soloTv(zonasDeRuta("HSPU"))`; `it` nuevo "QC no manda tibialis y orden ZONAS_TV" (QC solo = `["quadriceps"]`; alfa HSPU + delta QC = union sin tibialis y ordenada como `ZONAS_TV`); `it` nuevo Full Body = `[...ZONAS_TV]` (15).
- `tv-recorrido-screen.test.ts`: todas las expectativas de `zonas` pasan a `zonasTvDeRutas(...)` (helper local sobre `zonasDeRuta` + `soloTv`); KINESIS compara contra TTB; Full Body contra `ZONAS_TV`.
- `tv-class-day.test.ts`: sin cambios (verificado a ojo: el caso ROM solo valida roster y niveles).

## Verificacion

- Los tres `<automated>` imprimen `OK`. `git grep -n "muscle-zones" -- el-templo-api` vacio. Higiene (`console`, `any`) limpia. `prettier --write` antes de cada commit. `git status --porcelain` vacio.
- Chequeo extra (scratchpad, no commiteado): `projection.ts`/`zone-hits.ts` compilados con `tsc --strict` a un dir fuera del repo y ejecutados para confirmar: zonas de las 30 rutas, OAP+SS = chest, biceps, forearm, trapezius, upper-back, quadriceps; ROM_CORE = lower-back, abs, obliques; AF = 11 zonas; `zoneHitsDeRutas(["OAP","SS"])` trae `dorsal` en `upper-back` y no trae `triceps`; FL tiene antagonistas `trap-sup` y `erectores`; INITIUM = `{}`.
- Typecheck parcial con el `tsc` del checkout principal: ningun error nuevo en los 6 tests (solo los TS2307/TS7006 por falta de `node_modules`, preexistentes).
- Los tests NO se corrieron (CI).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El plan decia "SS incluye glúteos" en la canasta, pero SS solo da `quadriceps`**

- **Found during:** Task 1
- **Issue:** el caso "ya lo trabajaste hoy" usaba SS y esperaba `quadriceps` + `gluteal` (y cruce de 2 zonas). Con el modelo, `zonasDeRuta("SS") = ["quadriceps"]`.
- **Fix:** el ejercicio usa la ruta `L` (4 zonas de piernas), con guarda explicita.
- **Commit:** `ca3e817ec`

**2. [Rule 1 - Bug] El plan listaba `tv-recorrido-screen.test.ts` l.120-135, pero tiene ~10 expectativas de zonas**

- **Found during:** Task 3
- **Issue:** (1), (1b), (1d), (1f), (1g), (1g-bis) esperaban zonas por categoria; ademas (1g) afirmaba que KINESIS (ejercicio TTB) no tenia `upper-back`, pero TTB si lo trae.
- **Fix:** todas pasan a `zonasTvDeRutas(...)`; en (1g) las negaciones usan `deltoids`/`biceps` (exclusivos de HSPU/OAP frente a TTB).
- **Commit:** `817c3ce57`

**3. [Formato] Prettier reformateo un bloque `dayModes` preexistente** en `free-blocks-list.test.ts` y `free-blocks-invariants.test.ts` (lo que haria husky).

## Notas para planes siguientes

- **`zoneHits` trae mas claves que `zones`**: `zones` = motor U sinergista, pero `zoneHits` tambien incluye zonas de estabilizadores/estira (p. ej. OAP+SS trae `deltoids`, `lower-back`, `abs`, `obliques`, `gluteal`, `calves` con `sostiene`). Es lo diseñado (zoneHitsDeRutas), el test fija `zones` ⊆ claves de `zoneHits`. Los planes del app (chip/hoja de "Hoy en tu clase") deben marcar con `zones` y mostrar el detalle con `zoneHits`; no pintar como "trabajada" toda clave de `zoneHits`.
- **Antagonistas**: OAP y SS no tienen antagonistas en el modelo; solo HS, FL, HR y SIDE PCK. Por eso el test de D14 usa FL.
- **Deploy**: este plan toca SOLO tests, pero el push incluye los cambios de produccion del plan 07 (API + comentario del admin), asi que el `paths-filter` del deploy dispara igual. Si algun dia se pushea 08 solo, hay que tocar codigo del API.
- CI sigue sin poder confirmarse hasta el push: los valores se razonaron contra el modelo y se verificaron ejecutando la proyeccion fuera del repo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-200-18 mitigado (invariantes literales: SS/OAP, dorsal, tibialis fuera de la TV, FB = 15), T-200-19 mitigado (`it` de orden ZONAS_TV y exclusion de tibialis).

## Self-Check: PASSED

Commits `ca3e817ec`, `9564ebdf8` y `817c3ce57` presentes en `feat/200-anatomia`; `git status --porcelain` vacio antes del SUMMARY.
