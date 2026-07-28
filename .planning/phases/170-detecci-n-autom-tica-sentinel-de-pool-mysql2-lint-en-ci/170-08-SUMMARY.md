---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 08
subsystem: database
tags:
  [
    multi-tenancy,
    tenant-id,
    sentinel,
    inventario,
    lint,
    allowlist,
    ratchet,
    staging,
    ci,
  ]

# Dependency graph
requires:
  - phase: 170-06
    provides: "el sentinel cableado al pool de la app + el flag SENTINEL_INVENTORY (D-08)"
  - phase: 170-07
    provides: "el baseline de la allowlist y el step bloqueante de CI, que este plan cruza contra el inventario"
provides:
  - "170-INVENTORY.md: la foto deterministica de la deuda que ve el sentinel (1.852 statements, 86 tablas, cero throws)"
  - "Evidencia en vivo de que el suite completo termina SOLA con el sentinel activo (Pitfall 4 descartado)"
  - "El punto ciego del lint CON-06 cerrado: los imports profundos de db/schema entran al analisis (18 archivos)"
  - "Allowlist re-baselineada a 423 entradas: la lente estatica llega a las 87 tablas gym-owned con deuda"
affects: [171-fixtures-2-tenant, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inventario de runtime como AUDITORIA de la lente estatica: cuando las dos lentes discrepan, la diferencia es un agujero en el gate"
    - "Agregacion de un handle por-proceso con sonda temporal revertida sin commitear (mismo idioma one-shot que D-16)"

key-files:
  created:
    - .planning/phases/170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci/170-INVENTORY.md
  modified:
    - el-templo-api/src/db/scripts/lint-tenant.ts
    - el-templo-api/tenant-lint-allowlist.json
    - el-templo-api/test/tenancy/con-06-lint.test.ts

key-decisions:
  - "La allowlist CRECE 34 entradas y esta bien: no es deuda nueva ni una salida del ratchet, es deuda que ya estaba y que el gate no veia. Aprobado por Franco en el checkpoint (opcion b: arreglar antes de pushear)"
  - "El fix del punto ciego NO se hizo de oficio: agrandar la allowlist es exactamente lo que D-14 declara build rojo, o sea es tocar el contrato de un gate recien shippeado (regla 4, decision del usuario)"
  - "--hookTimeout=900000 por linea de comandos y no tocando vitest.config.ts: el limite es del MySQL local, no del repo"
  - "El total con repeticiones se reporta como PISO y no como total: solo 7 de 209 procesos de vitest alcanzan a correr el handler de exit"

patterns-established:
  - "Cruce sentinel (runtime) vs lint (estatica) como control de cobertura del gate"

requirements-completed: []

# Metrics
duration: 2h10m
completed: 2026-07-28
---

# Phase 170 Plan 08: Inventario del sentinel y cierre del punto ciego del lint Summary

**El sentinel corrió sobre el suite entero sin romper nada —1.852 statements violadores distintos sobre 86 tablas, cero throws— y ese inventario destapó que el lint de CON-06 era ciego a 18 archivos, incluido `auth/routes.ts`: se arregló, se re-baselineó la allowlist a 423 entradas y las dos lentes ahora coinciden.**

## Estado del plan: INCOMPLETO — bloqueado en el push a staging

De las 3 tareas del plan, **1 está completa** y las otras dos siguen abiertas por causas
distintas:

| Task | Estado | Motivo |
| --- | --- | --- |
| 1 — Inventario determinístico | ✅ Completa | — |
| 2 — Push a staging + CI | ⛔ **Bloqueada** | Franco aprobó el push, pero `origin/staging` está **31 commits adelante** de la base de esta rama: `git push origin feat/170-sentinel-lint:staging` sale **rejected (non-fast-forward)**. Por instrucción explícita: no se fuerza nada, se reporta |
| 3 — Ventana de observación en staging | ⏸ Pendiente | Depende del Task 2. La sección esqueleto ya está escrita en `170-INVENTORY.md` |

## Performance

- **Duración:** ~2 h 10 min (incluye 2 corridas del suite completo: 23 min la buena)
- **Tareas:** 1/3 (+ 1 fix aprobado fuera del plan)
- **Commits:** 5
- **Archivos:** 1 creado, 3 modificados

## Accomplishments

- **El suite completo corrió con el sentinel activo, en verde y terminando sola.** 231
  archivos passed, 3006 tests, exit 0, 23 min. **Pitfall 4 descartado en vivo**: el
  `setInterval` del resumen no colgó el proceso (el `.unref()` del plan 04 hace su trabajo).
- **Cero `TenantSentinelError` en toda la corrida**, que es el resultado que la fase buscaba:
  el sentinel ya está montado sobre todo el SQL de la aplicación y no rompe ningún camino,
  porque `TENANT_STRICT_MODULES` arranca vacía. El día que la 172 agregue la primera entrada,
  esas violaciones dejan de ser silencio.
- **Inventario escrito y explicado línea por línea:** 1.852 statements violadores distintos,
  86 tablas gym-owned, tabla completa por tabla con SQL representativo, separación entre el
  arnés de tests (95 `DELETE FROM x` sin `WHERE`, 80 tablas) y el código de la aplicación.
- **Cero falsos positivos del parser**, con los tres patrones sospechosos explicados y
  descartados uno por uno (ver más abajo).
- **Las exenciones de la 169 aparecen como violación, exactamente como predijo D-17.** 2 de
  las 3 de call site (`wellhub_events`, `notification_templates`); las 7 file-level no
  aparecen por una razón estructural: no usan el pool de la aplicación.
- **Punto ciego del lint CON-06 encontrado y cerrado.** El cruce de las dos lentes (86 tablas
  en runtime vs 78 en la estática) destapó que `isSchemaModule()` solo aceptaba el barrel:
  18 archivos con import profundo quedaban **enteros** fuera del gate.

## Task Commits

1. **Task 1: Inventario determinístico con `SENTINEL_INVENTORY=1`** — `41b3f7d1` (docs)
2. **Corrección del conteo de exenciones (10, no 9)** — `accb4780` (docs)
3. **Fix del punto ciego + re-baseline + `it` de regresión** — `d8fa4986` (fix) — _fuera del
   plan original, aprobado por Franco en el checkpoint_
4. **Hallazgo marcado como resuelto en el inventario** — `11518972` (docs)
5. **Este SUMMARY** — (docs)

## El inventario en números

| Métrica                                            | Valor                                    |
| -------------------------------------------------- | ---------------------------------------- |
| Statements violadores distintos                    | **1.852**                                |
| Tablas gym-owned distintas                         | **86** (de 87)                           |
| Registros "statement × app que lo emitió"          | 18.232                                   |
| Violaciones con repeticiones (**piso**)            | ≥ 3.683                                  |
| Throws en toda la corrida                          | **0**                                    |
| Por verbo                                          | select 1.351 · update 253 · delete 212 · insert 35 |
| Del arnés de tests (`DELETE FROM x` sin `WHERE`)   | 95 statements, 80 tablas                 |

## Candidatos a falso positivo: ninguno

Los tres patrones que podrían parecerlo y por qué no lo son:

1. **155 statements que mencionan `tenant_id` y aun así son violación** — todos `SELECT`
   (verificado: 0 de los 155 es otra cosa). Es el recorte de la proyección funcionando:
   Drizzle expande el `select` a todas las columnas, `tenant_id` incluida, así que buscar el
   literal en el string entero daría "cumple" para el scan completo sin `where`, que es la
   fuga más grave que existe (mitigación de T-170-01).
2. **1 statement que arranca con comentarios `--`** — el backfill de la migración "reactivate
   `cancelado` future bookings", ejecutado por un test de `test/migrations/` a través del pool
   de la app. El parser extrae bien las 4 tablas pese al prólogo. En producción ese camino no
   existe: las migraciones corren por `run-migrations.ts`, con su propia conexión.
3. **95 `DELETE FROM x` sin `WHERE`** — `cleanAllTestData()` de `test/helpers.ts`. Violación
   real desde la definición del sentinel, deuda de `test/` y no del producto.

## Deviations from Plan

### 1. [Rule 3 - Bloqueante] El `pnpm test` del plan se cae con 208 archivos rojos

- **Encontrado en:** Task 1, primera corrida.
- **Síntoma:** `Table 'eltemplo_test_2.wellhub_bookings' doesn't exist` en 208 de 232 archivos.
- **Causa:** el `beforeAll` de `test/setup.ts` provisiona la base del worker aplicando las
  ~196 migraciones, y con 4 workers en paralelo contra el MySQL local eso pasa los **120 s de
  `hookTimeout`**. El hook se corta a mitad y las bases quedan migradas hasta la **0153**.
- **Descartado que fuera una migración rota:** se replicó el loop de provisioning contra una
  base limpia, en serie: las ~196 aplican **sin un solo error no tolerado**.
- **Fix:** repetir la corrida con `--hookTimeout=900000` **por línea de comandos**.
  `vitest.config.ts` **no se tocó**: el límite es del entorno local (WSL2 + MySQL compartido),
  no del repo, y en CI el suite corre verde con los 120 s.

### 2. [Rule 3 - Bloqueante] El `report()` del sentinel no puede ver más que su propia app

- **Encontrado en:** Task 1.
- **Problema:** el handle es **por pool** y cada archivo de test construye su propia app, así
  que `report()` de un handle ve solo las violaciones de esa app. El plan asumía que
  `SENTINEL_INVENTORY=1 pnpm test` escupía el agregado.
- **Fix:** sonda temporal en `installSentinel` que vuelca a disco (JSONL por statement nuevo +
  snapshot al `exit`), corrida del suite, agregación offline, y **la sonda revertida sin
  commitear**. `git diff HEAD -- el-templo-api/` quedó vacío antes del commit del inventario.
- **Aprendizaje que quedó escrito:** de los 209 procesos, solo **7** llegaron a correr el
  handler de `exit` — vitest termina la mayoría de sus workers sin pasar por ahí. Por eso los
  statements distintos son un número completo y el total con repeticiones es un **piso**.

### 3. [Rule 1 - Bug, escalado a decisión del usuario] El lint era ciego a 18 archivos

- **Encontrado en:** Task 1, cruzando el inventario contra la allowlist.
- **Problema:** `isSchemaModule()` reconocía `…/schema` y `…/schema/index` pero **no**
  `…/schema/<archivo>`. Un archivo que importa así queda con `SchemaBindings` vacío y **todos
  sus accesos son invisibles**: no aparecen como violación, no entran a la allowlist, y un
  acceso NUEVO sin `tenant_id` **no pone el build en rojo**. El peor caso:
  `src/modules/auth/routes.ts`, que importa solo en profundidad y toca `users`, `branches`,
  `member_profiles`, `promo_plans` y `referrals`.
- **Por qué se escaló en vez de arreglarlo de oficio:** el fix agranda la allowlist, y
  agrandarla es exactamente lo que el ratchet de D-14 declara build rojo. Es tocar el contrato
  de un gate recién shippeado, contra una D-16 que dice que la lista se pobló one-shot y sin
  regenerador. Regla 4 → checkpoint.
- **Decisión de Franco:** opción (b), arreglarlo **antes** de pushear a staging.
- **Fix (`d8fa4986`):** `isSchemaModule()` acepta el segmento suelto vía `SCHEMA_SPECIFIER`,
  re-baseline one-shot con snippet descartable en el scratchpad, y un `it` de regresión.

| Lente estática             | Antes | Después |
| -------------------------- | ----- | ------- |
| Entradas `(archivo,tabla)` | 389   | **423** |
| Accesos violadores         | 1.597 | **1.727** |
| Archivos con deuda         | 108   | **120** |
| Tablas gym-owned con deuda | 78    | **87**  |
| Entradas perdidas          | —     | **0**   |

Las 34 entradas nuevas caen sobre 17 archivos (7 `import-turnos.ts`, 5 `auth/routes.ts`, 3
`import-members.ts`, 3 `blog/service.ts`, …). **No son deuda nueva**: son deuda que ya estaba
y que el gate no veía.

## Verificación

| Chequeo                                             | Resultado |
| --------------------------------------------------- | --------- |
| `pnpm exec tsc --noEmit`                            | ✅ exit 0 |
| `pnpm lint:tenant`                                  | ✅ exit 0, 0 discrepancias, 423 entradas |
| `pnpm lint:tenant --base=origin/staging`            | ✅ exit 0 (gate D-14 salteado con warning: la allowlist no existe en la base — el caso previsto para el commit que la introduce) |
| `vitest run test/tenancy/con-06-lint.test.ts`       | ✅ 37/37 |
| Suite completa con `SENTINEL_INVENTORY=1`           | ✅ 231 passed / 1 skipped, exit 0, termina sola |
| Migraciones tocadas                                 | ✅ 0 |
| Dependencias nuevas                                 | ✅ 0 (`pnpm-lock.yaml` intacto; `package.json` solo suma el script `lint:tenant` del plan 05) |
| Árbol limpio y commiteado                           | ✅ |

## Bloqueante: el push a staging no es fast-forward

Franco **aprobó** el push a staging. No se ejecutó porque el comando del plan no es aplicable
al estado actual del remoto:

```
$ git push --dry-run origin feat/170-sentinel-lint:staging
 ! [rejected]  feat/170-sentinel-lint -> staging (non-fast-forward)
```

- La rama sale de `origin/master` (`a70ee297`), que es el merge-base con staging.
- `origin/staging` = master + **31 commits** de otros trabajos (fases 166-169, fixes de Aura,
  Wellhub, TV, caja, referidos…). `git rev-list --left-right --count origin/master...origin/staging`
  da `0 31`: staging contiene todo master y 31 commits más.
- Empujar la rama **sobre** staging borraría esos 31 commits. Por instrucción explícita no se
  fuerza nada y no se decide la estrategia de merge por cuenta propia.

**Camino que sugiere la historia del repo** (los commits de staging son merges, no
fast-forwards): hacer el merge de `feat/170-sentinel-lint` **dentro de** staging y pushear
staging —el idioma de `merge: fase 169 … a staging` (`7c15f428`)—. Eso necesita un checkout de
staging; el checkout principal está ocupado por otro workstream, así que va en un worktree
descartable. **Requiere OK de Franco**: es una operación distinta de la que aprobó.

## Pendientes (verificación humana)

- **Push a staging** — bloqueado arriba, esperando decisión sobre la estrategia de merge.
- **CI de staging** — no verificable desde acá (`gh` no está instalado). Cuando el push
  ocurra hay que confirmar el step **`Tenant lint (CON-06)` en verde** y el job `api-test`.
  Ojo con la trampa de `paths-filter` (`event.before`) si el push anterior murió en CI.
- **Task 3 — ventana de observación (2-3 días)** — la sección esqueleto con las tres preguntas
  ya está escrita en `170-INVENTORY.md`; se completa con fechas, totales observados y veredicto
  de cierre después de leer los logs de pm2 de staging (requiere OK para SSHear).
- **Cero migraciones**: el deploy de staging no debe aplicar ninguna. Si el runner reporta una
  migración nueva, algo salió mal — parar.

## Notas para las fases siguientes

- **Fase 171 (fixtures 2-tenant):** los 95 `DELETE FROM x` sin `WHERE` de `cleanAllTestData()`
  tocan 80 tablas y van a tener que tenantizarse. Están inventariados en `170-INVENTORY.md`.
- **Fase 172 (adopción):** el inventario ya dice qué statements y qué tablas hay que atacar
  primero (`users` 484, `branches` 396, `subscriptions` 303). Al migrar un módulo hay que
  **borrar sus entradas de la allowlist en el mismo PR**: dejarlas stale también es rojo.
- **El worktree del plan quedó en `/home/franco/projects/et-170-sentinel`**, rama
  `feat/170-sentinel-lint`, con los 44 archivos de la fase. No borrarlo hasta después del UAT.

## Self-Check: PASSED

- `170-INVENTORY.md` existe (386 líneas) — ✅
- Commits `41b3f7d1`, `accb4780`, `d8fa4986`, `11518972` presentes en la rama — ✅
- `git status --porcelain` vacío antes de este commit — ✅
- `src/db/sentinel/install.ts` idéntico a lo que dejó el plan 06 (sonda revertida) — ✅
