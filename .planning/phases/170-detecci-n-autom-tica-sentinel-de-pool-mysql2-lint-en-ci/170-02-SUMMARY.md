---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 02
subsystem: database
tags: [multi-tenancy, tenant-id, sentinel, parser, funcion-pura, vitest, drizzle, fail-closed]

# Dependency graph
requires:
  - phase: 167-columnas
    provides: "GYM_OWNED_TABLES (87 tablas) — el set contra el que se filtran las tablas extraídas del SQL"
  - phase: 170-01
    provides: "TENANT_STRICT_MODULES / strictTablesSet — lo consume el plan 04, no este; acá solo se respeta el contrato de inyección D-07"
provides:
  - "analyzeSql(sql, gymOwned?) — función pura que clasifica un statement SQL en ok / skip / exempt / violation"
  - "fingerprint(sql) — identidad estable de un statement para la dedup de D-01 y el agrupado del inventario D-08"
  - "SentinelVerdict / SentinelVerdictKind — el contrato que consumen los planes 03 y 04"
  - "32 tests unitarios que congelan la clasificación, incluido el trap de la proyección (T-170-01)"
affects: [170-03, 170-04, 170-05, 170-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decisión separada del mecanismo: el parser es una función pura testeable sin MySQL; el wrap del pool (plan 03) la monta encima"
    - "Recorte por indexOf en vez de regex con cuantificador anidado, cuando la función corre en el hot path"
    - "Un `it` por forma del enum (11 no-DML) en vez de un test con una lista adentro: borrar una forma deja SU test rojo"

key-files:
  created:
    - el-templo-api/src/db/sentinel/analyze.ts
    - el-templo-api/test/unit/sentinel-analyze.test.ts
  modified: []

key-decisions:
  - "La exención se recorta con indexOf hasta el cierre del comentario, no con una regex que capture el motivo: la regex del RESEARCH daba por válido el motivo vacío porque el `*` del cierre es `\\S`"
  - "El default gym-owned se materializa como ReadonlySet desde GYM_OWNED_TABLES (no vía el predicado isGymOwnedTable) porque el parámetro tiene que ser inyectable (D-07) y un Set es lo que el test puede construir a mano"
  - "El tag literal de exención no se escribe en los docblocks (un comentario de bloque no se puede anidar — hallazgo 169-07); se describe en prosa en vez de recurrir a caracteres invisibles"

patterns-established:
  - "Prueba negativa como criterio de aceptación explícito: sacar el recorte de proyección tiene que dejar rojo el `it` del trap, y el rojo se registra sin commitear el estado roto"
  - "Par de aserciones positiva/negativa en el test del trap, para que un parser siempre-pesimista no pase en verde"

requirements-completed: [CON-05]

# Metrics
duration: 20min
completed: 2026-07-28
---

# Phase 170 Plan 02: Parser puro del sentinel (analyzeSql + fingerprint) Summary

**El sentinel ya sabe decidir: `analyzeSql` clasifica cualquier statement SQL en `ok` / `skip` / `exempt` / `violation` sin abrir una conexión, y atrapa el falso negativo más grave —el scan completo de tabla que trae `tenant_id` en la proyección— con un test que se pone rojo si alguien saca la mitigación.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-28T19:31Z
- **Completed:** 2026-07-28T19:51Z
- **Tasks:** 2/2
- **Files created:** 2 (569 líneas, cero deleciones)

## Accomplishments

- **La decisión quedó separada del mecanismo.** `analyzeSql` es `string → veredicto`: sin I/O, sin pool, sin Fastify, sin Drizzle, sin `NODE_ENV`. El plan 03 monta el wrap del pool encima y el plan 04 le pone la severidad; la clasificación ya está congelada por tests y se prueba sin MySQL.
- **El trap de la proyección está atrapado Y protegido** (T-170-01). Drizzle expande `db.select().from(users)` a todas las columnas, `tenant_id` incluida: el scan completo sin `where` —la fuga más grave posible— llega al pool CON el literal adentro. El recorte de la proyección antes de buscarlo es la mitigación, y su `it` dedicado se pone rojo si alguien la saca (demostrado en vivo, ver abajo).
- **El control de transacción nunca es violación** (T-170-04). Las 11 formas de no-DML e introspección tienen **un `it` cada una**, no una lista adentro de un test: borrar una del parser deja SU test rojo y se ve en el diff. Es la mitigación de Pitfall 3, que es lo que evita que el sentinel reviente transacciones legítimas en modo throw.
- **El canal de exención del sentinel es el SQL** (D-17), con motivo obligatorio. Una anotación pelada NO exime — y ese caso tiene su propio test, porque la regex candidata del RESEARCH lo dejaba pasar (ver Desvío 2).
- **Cero duplicación de la lista de tablas.** El set sale de `GYM_OWNED_TABLES`; el archivo no re-lista nada. Un vigilante con su propia copia se desincroniza en la primera tabla nueva y falla en silencio, que es el único modo de falla que hace inútil a un gate.

## Task Commits

1. **Task 1: Parser puro `analyzeSql` + `fingerprint`** — `95fa20de` (feat)
2. **Task 2: Batería unitaria de clasificación (32 tests)** — `a37bf171` (test)

## Files Created/Modified

- `el-templo-api/src/db/sentinel/analyze.ts` — **nuevo**, 261 líneas. Las 4 etapas en el orden que pide el plan (skip de no-DML → exención en el SQL → extracción de tablas → `tenant_id` en el predicado), 6 regex module-level, el helper `exemptionMotive` y `fingerprint`. Docblock de cabecera con `QUÉ CLASIFICA`, `LOS DOS CANALES DE EXENCIÓN (D-17)`, `POR QUÉ NO USA UN PARSER SQL DE VERDAD`, `LA LIMITACIÓN, ESCRITA`, `POR QUÉ ES SEGURO LOGUEAR` y `QUÉ HACER CUANDO ESTO SE CAIGA`.
- `el-templo-api/test/unit/sentinel-analyze.test.ts` — **nuevo**, 308 líneas, **32 tests** en 6 `describe`. Los strings de SQL son los del bloque `<sql_shapes>` del plan (salida real de `.toSQL()` de Drizzle 0.45.1), copiados literales.

## Decisions Made

- **El motivo de la exención se recorta con `indexOf`, no con una regex que lo capture.** Dos motivos: (a) capturar "todo hasta el cierre del comentario" pide un cuantificador anidado o un unrolled loop, y el plan prohíbe cuantificadores anidados porque esto corre en el hot path de toda query (T-170-03); (b) es la única forma limpia de rechazar el motivo vacío (ver Desvío 2). La regex module-level solo matchea la APERTURA del tag.
- **El default gym-owned es un `ReadonlySet` construido desde `GYM_OWNED_TABLES`, no el predicado `isGymOwnedTable`.** El plan admitía "vía `isGymOwnedTable`", pero el parámetro `gymOwned` tiene que ser un `ReadonlySet` inyectable (D-07: el test le pasa un set con una sola tabla) y envolver el predicado en un set sería un rodeo sin ganancia. La lista sigue saliendo de `../tenant-tables`, que es lo que el `key_link` del plan exige.
- **El tag literal de exención no aparece escrito en ningún docblock.** Un comentario de bloque no se puede anidar (hallazgo 169-07), así que escribirlo cerraría el docblock. La primera versión lo resolvió metiendo caracteres de ancho cero entre el `*` y el `/` — se revirtió antes de commitear: un carácter invisible en el fuente rompe el grep y la próxima edición de quien lo lea. Se describe en prosa y se aclara por qué no está el literal.
- **`tables` vacío para `skip` y para `exempt`.** El contrato del plan solo lo pide para `skip`; se extendió a `exempt` porque la exención se decide en la etapa 2, ANTES de extraer tablas — devolver un array a medio llenar sería una mentira sobre lo que el parser miró. Hay un test que lo fija para las formas de no-DML.

## Deviations from Plan

### 1. [Rule 1 - Bug] `spom_config` NO es el ejemplo de tabla "no gym-owned": está en `GYM_OWNED_TABLES`

- **Found during:** Task 1 (smoke del parser, antes de escribir los tests)
- **Issue:** El plan (`<behavior>`) y el RESEARCH (§"Parser candidato — 14/14 casos") usan `` select `id` from `spom_config` `` como el caso "tabla no gym-owned → `skip`". Pero `spom_config` **está en `GYM_OWNED_TABLES`** (`src/db/tenant-tables.ts:133`), así que el veredicto correcto para ese SQL es `violation`, no `skip`. El caso 14/14 del RESEARCH está mal contado: el parser candidato daba `violation` ahí también.
- **Fix:** El parser NO se tocó — su comportamiento es el correcto. El test usa las tablas que sí son exentas de verdad, tomadas de `TENANT_EXEMPT_TABLES`: `system_settings` (la mina M2 del diseño, config global heredada que no recibe `tenant_id` en todo v6.0) y `tenants` (plataforma). Se escribió el motivo en un comentario dentro del test para que nadie lo "corrija" de vuelta al ejemplo del plan.
- **Files modified:** `el-templo-api/test/unit/sentinel-analyze.test.ts`
- **Verification:** `grep -n spom_config src/db/tenant-tables.ts` → línea 133, dentro de `GYM_OWNED_TABLES`; smoke del parser clasificando ese SQL como `violation ["spom_config"]`, que es lo correcto.
- **Committed in:** `a37bf171`
- **Nota para el plan 04 y para el inventario:** cualquier query real sobre `spom_config` sin `tenant_id` va a aparecer en el inventario como violación. Es correcto y es deuda real, no un falso positivo del parser.

### 2. [Rule 1 - Bug] La regex de exención del RESEARCH daba por válido el motivo VACÍO

- **Found during:** Task 1
- **Issue:** El Pattern 2 del RESEARCH propone `/\/\*\s*tenant-safe:\s*\S/` para exigir motivo no vacío. Falla justo en el caso que el plan pide rechazar: en una anotación sin motivo, después de los dos puntos viene el cierre del comentario, y su `*` **es un `\S`** — la regex matchea y la query queda `exempt`. O sea: la anotación pelada, que es indistinguible de un olvido, eximía.
- **Fix:** La regex module-level (`EXEMPT_TAG`) matchea solo la APERTURA del tag; el motivo se recorta desde el fin del match hasta el cierre del comentario con `indexOf("\*\/")` y se exige no vacío después de `trim()`. De paso queda sin cuantificadores anidados, que es lo que T-170-03 pide para el hot path.
- **Files modified:** `el-templo-api/src/db/sentinel/analyze.ts`
- **Verification:** dos tests dedicados — anotación sin motivo sobre un INSERT que viola → `violation`; la misma anotación sobre un INSERT que sí cumple → `ok` (o sea, la anotación pelada no cambia NADA, ni para bien ni para mal).
- **Committed in:** `95fa20de`

### 3. [Rule 3 - Blocking] El worktree es `et-170-sentinel`, no `et-170-deteccion`

- **Found during:** arranque
- **Issue:** El plan referencia `/home/franco/projects/et-170-deteccion` en su `<context>` y en los dos bloques `<verify>`. Ese worktree no existe.
- **Fix:** Se trabajó en `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`), el worktree real de la fase, tal como ya lo dejó registrado el Desvío 1 del `170-01-SUMMARY.md`. Los comandos de verificación se corrieron con esa ruta. Cero worktrees nuevos.
- **Files modified:** ninguno
- **Committed in:** n/a
- **Nota:** el desvío se hereda tal cual para los planes 03-06.

### 4. [Rule 3 - Blocking] Orden TDD del Task 1 vs. el Task 2, que es dueño del archivo de test

- **Found during:** Task 1
- **Issue:** El Task 1 viene marcado `tdd="true"`, pero la batería de tests es el **Task 2**, y su `read_first` pide leer `src/db/sentinel/analyze.ts` "(recién creado)". Un ciclo RED/GREEN estricto habría exigido escribir el archivo de test dentro del Task 1, que no lo lista en sus `<files>`.
- **Fix:** Se respetó el ordenamiento explícito del plan (implementación → batería) y se cubrió la garantía que el TDD aporta acá con la **prueba negativa** que el propio Task 2 exige como criterio de aceptación: se sacó la mitigación y se verificó el rojo del test que la protege (ver Verification Results). El commit del Task 1 nunca estuvo "verde por casualidad": el smoke del parser sobre los 23 casos corrió antes de commitear.
- **Files modified:** ninguno
- **Committed in:** n/a

---

**Total deviations:** 4 auto-fixed (2 × Rule 1 — bugs en los ejemplos y en la regex propuesta por el RESEARCH; 2 × Rule 3 — bloqueos de entorno/proceso)
**Impact on plan:** Ninguno sobre el contrato entregado. Los exports, la firma, el orden de las 4 etapas y los criterios de aceptación salieron exactamente como los especifica el plan. Cero dependencias, cero migraciones, cero scope creep.

## Issues Encountered

- **Un docblock que menciona `createTestApp` en prosa rompe el grep del criterio de aceptación.** El plan pide `grep -c "createTestApp" test/unit/sentinel-analyze.test.ts` → 0, y la primera versión del docblock explicaba justamente que el archivo NO lo usa — dando 1. Se reescribió la frase sin el token. Es, en chiquito, exactamente el hallazgo 169-09 que motiva el D-10 de esta fase: **el grep crudo no distingue código de prosa**. Vale como recordatorio vivo para el plan 05, que tiene que anclar por AST.
- **La corrida del archivo de test tarda ~110-118 s.** Los 32 tests corren en milisegundos; el resto es el `setupFiles` de Vitest provisionando MySQL para todo archivo de test, incluido uno que no toca la base (hallazgo 169-07, ya documentado en el CONTEXT). Reconfirma D-09: el lint de la fase no debe ser un gate de Vitest.
- **Caracteres de ancho cero en el fuente:** la primera versión del docblock los usó para poder escribir el tag de exención sin cerrar el comentario. Se detectaron y eliminaron antes del commit (`grep` del carácter → 0 resultados). Queda anotado como anti-patrón para los planes que sigan documentando este tag.

## Verification Results

| Verificación                                                        | Resultado                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                            | ✅ exit 0 (después del Task 1, y otra vez al cierre con la sonda revertida) |
| `pnpm exec vitest run test/unit/sentinel-analyze.test.ts`           | ✅ **32 tests passed** (el plan pide ≥ 20)                              |
| `grep -E "mysql2\|fastify\|drizzle" src/db/sentinel/analyze.ts`     | ✅ sin resultados                                                       |
| `grep -c "console\." src/db/sentinel/analyze.ts`                    | ✅ 0                                                                    |
| Ocurrencias de `any`                                                | ✅ 0 en los dos archivos                                                |
| `grep -cE "createTestApp\|helpers" test/unit/sentinel-analyze.test.ts` | ✅ 0                                                                  |
| Exports de `analyze.ts`                                             | ✅ `analyzeSql`, `fingerprint`, `SentinelVerdict`, `SentinelVerdictKind` |
| Lista de tablas importada, no duplicada                             | ✅ `import { GYM_OWNED_TABLES } from "../tenant-tables"`                |
| Comentario del recorte de proyección arriba de la línea que lo hace | ✅ `analyze.ts:227-233` (bloque `⚠ RECORTE DE LA PROYECCIÓN`)          |
| Tamaño de los artefactos                                            | ✅ 261 líneas (mín. 80) y 308 líneas (mín. 120)                         |
| Diff acotado                                                        | ✅ 2 archivos, +569/-0, cero deleciones                                 |
| `pnpm-lock.yaml`                                                    | ✅ sin cambios — cero dependencias instaladas o actualizadas            |
| Migraciones de DB                                                   | ✅ ninguna (la numeración sigue reservada desde 0197)                   |

### Clasificación verificada (smoke previo al commit del Task 1)

Los 23 statements del bloque `<sql_shapes>` del plan, clasificados por el parser:

```
violation  ["users"]              select `id`, `tenant_id`, `first_name` from `users`      ← el trap
ok         ["users"]              …from `users` where (`users`.`tenant_id` = ? and …)
violation  ["bookings"]           select count(*) from `bookings`
ok         ["users"]              insert into `users` (`id`, `tenant_id`, …) values (…)
violation  ["tv_pairings"]        insert into `tv_pairings` (`user_code`) values (?)
violation  ["users"]              update `users` set `first_name` = ? where `users`.`id` = ?
ok         ["users"]              delete from `users` where `users`.`tenant_id` = ? and `id` = ?
violation  ["bookings","users"]   …from `bookings` inner join `users` on …
skip       []                     begin / commit / rollback / savepoint sp1 /
                                  release savepoint sp1 / rollback to sp1 /
                                  start transaction / SET autocommit=0 / SHOW TABLES /
                                  select database() / information_schema.columns
exempt     []                     /* tenant-safe: idempotencia global */ insert into `users` …
violation  ["users"]              /* tenant-safe: */ insert into `users` …   ← motivo vacío NO exime
```

### Prueba negativa del recorte de proyección (fail-closed demostrado en vivo)

Sonda temporal en `src/db/sentinel/analyze.ts` — se desactivó el recorte, dejando el
predicado igual al statement completo:

```ts
const predicado = texto; // SONDA TEMPORAL: recorte de proyección desactivado
```

Resultado: **2 failed | 30 passed**. Los dos rojos son exactamente los que protegen la
mitigación:

- `violation: un SELECT sin filtro de tenant sobre una tabla gym-owned`
- `un SELECT sin WHERE es violation AUNQUE la proyección contenga tenant_id`

Las 11 formas de no-DML, el join, las exenciones, la inyección del set y `fingerprint`
siguieron en verde — o sea, la sonda no contaminó nada más y el rojo señala la causa exacta.

Sonda **revertida sin commitear el estado roto** (idioma 168-05 / 169-04): `git status`
quedó limpio sobre `analyze.ts` y el commit `95fa20de` contiene la versión con el recorte
en pie.

## User Setup Required

None — cero variables de entorno nuevas, cero servicios externos, cero configuración manual.
(El flag `SENTINEL_INVENTORY` de D-08 pertenece al plan 04, no a este.)

## Next Phase Readiness

**Listo para el plan 03 (wrap del pool) y el plan 04 (instalación + severidad):**

- El contrato está exportado y estable: `analyzeSql(sql, gymOwned?) → SentinelVerdict` y `fingerprint(sql) → string`.
- **Lo que el plan 03/04 tiene que aportar y este plan deliberadamente NO hace:** interceptar también `getConnection()` (Pitfall 1 — Drizzle abre toda transacción por ahí y el wrap de `pool.query` solo queda ciego al camino de escritura), decidir throw vs `log.error` según `NODE_ENV` y la lista strict, la dedup por fingerprint (D-01) y el resumen periódico con `.unref()` (Pitfall 4).
- **Ojo con `params`:** el parser nunca los recibe y no debe recibirlos. Es lo que hace seguro loguear el veredicto (T-170-02).
- Para el inventario del plan 04: las 9 exenciones `tenant-safe:` de la fase 169 **no viajan en el SQL** (D-17), así que van a salir como violaciones no-strict. Está previsto y es correcto.

**Sin blockers.** Nada se pusheó, nada se mergeó a `staging` ni a `master`: los dos commits viven en la rama local `feat/170-sentinel-lint` del worktree.

## Threat Flags

Ninguna superficie nueva. Los dos archivos son una función pura sin I/O y su test: cero endpoints, cero rutas de auth, cero acceso a archivos, cero cambios de schema, cero dependencias. El plan **mitiga** T-170-01 (recorte de proyección + test que lo protege), T-170-02 (el parser nunca ve los `params`; el fingerprint opera sobre texto con placeholders), T-170-03 (skip de no-DML primero, regex sin cuantificadores anidados, cero I/O) y T-170-04 (un `it` por forma de no-DML). T-170-SC queda cerrado: cero paquetes instalados.

## Self-Check: PASSED

- Archivos: `el-templo-api/src/db/sentinel/analyze.ts`, `el-templo-api/test/unit/sentinel-analyze.test.ts` y este SUMMARY existen en disco.
- Commits: `95fa20de` y `a37bf171` existen en `feat/170-sentinel-lint`.
- `STATE.md` y `ROADMAP.md` NO fueron modificados por este ejecutor (los escribe el orquestador).

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 02_
_Completed: 2026-07-28_
