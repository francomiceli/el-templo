# Fase 159 — Handoff de ejecución (pausa 2026-08-13)

## Dónde está todo

- **Worktree:** `/home/franco/projects/et-159`
- **Branch:** `feat/159-semana-nueva-backend` (basado en `origin/master` @ `d20f52da`)
- **NO pusheado** (Franco decide push). Working tree limpio, sin vitest huérfanos.
- Los PLAN/CONTEXT/RESEARCH viven en la feature branch (se copiaron del checkout de docs, que no está pusheado). Commit baseline `0d5a7b2d`.
- Ejecución con `gsd-executor` en **sonnet**, secuencial (comparten worktree). Orquestación/verificación en opus. Base correcta = origin/master (migs 0202/0203/0204 libres; no depende del tren v6.0 173/174/175).

## Progreso: 4 de 6 planes COMPLETOS y verificados

| Wave | Plan | Estado | Commits | Verificación del orquestador |
|------|------|--------|---------|------------------------------|
| 1 | **159-01** tipos/validadores/body schema | ✅ | `b9521333`, `f36bc9f0`, `e5dec4c9` | tsc=0, sin rutas HTTP nuevas (ISO-01 intacto) |
| 1 | **159-04** tabla `session_week_regime` + migs 0202/0203 | ✅ | `0c68ae47`, `ad67317b`, `7fd93189` | tsc=0, migs sin `;` en comentarios, 0203 `@data-only`, lint:tenant sin discrepancias por la tabla |
| 2 | **159-02** `semana-nueva-pipeline` + `stretching-selection` | ✅* | `9320c713`, `7f59df95`, `024a62dd`, `b148780c` | tsc=0, test unit 7/7 verde. *(⚠ dejó 1 discrepancia lint:tenant — ver abajo)* |
| 2 | **159-06** etiqueta derivada + rename Calistenia→General (mig 0204) + fix TV | ✅ | `bd99a0b0`, `b84096b0`, `4ea3712b` | tsc=0, test integración `derived-class-label` 2/2 verde |

## 🔴 BLOQUEANTE ABIERTO — resolver ANTES de continuar con 159-03/05

**`lint:tenant` = DISCREPANCIAS: 1** en `el-templo-api/src/modules/sessions/pipeline/utils/stretching-selection.ts` (acceso a `exercises` sin patrón de tenancy). Es gate de CI → rojo si se pushea así.

### Diagnóstico (ya hecho, no re-investigar)
- El ejecutor de 159-02 **reinventó** la query `.from(schema.exercises).where(pattern='MOVILIDAD')` dentro de `stretching-selection.ts` (líneas ~55-57), en vez de **reutilizar** `mobility-selection.ts` como manda **D-12** ("reutiliza el pool y la lógica de movilidad de ROM, NO reinventa la maquinaria"). El propio JSDoc de `stretching-selection.ts:7` DICE que reutiliza mobility-selection, pero el código no lo hace.
- La allowlist de tenancy (`el-templo-api/tenant-lint-allowlist.json`) es **anti-crecimiento** (ratchet D-14, corre en CI con `--base`): NO se puede agregar `stretching-selection.ts` a la allowlist — CI lo marcaría como "entrada ganada". La allowlist es keyed por **(file, table)** sin conteo.
- `utils/mobility-selection.ts` **YA está en la allowlist** para `exercises` (una entrada cubre todos sus accesos, sin importar cuántos).

### Fix (diseñado, listo para aplicar — es edición delicada, hacerla en el hilo principal)
Extraer el pool MOVILIDAD a un helper compartido en el archivo YA allowlisteado, y que stretching lo consuma → cero accesos directos en stretching-selection.ts.

1. En **`mobility-selection.ts`**: agregar `export type MobilityPoolRow = { id: number; name: string; effort: string | null; mobilityRelated: string | null }` (ajustar tipos a lo que devuelve el select actual) y `export async function queryMobilityPool(db): Promise<MobilityPoolRow[]>` con el `.select({id, name: exercises.exercise, effort, mobilityRelated}).from(exercises).where(eq(pattern,'MOVILIDAD'))` (mover la query actual de `selectMobilityExercise` acá). Refactorizar `selectMobilityExercise` para que llame a `queryMobilityPool(db)`. El acceso a `exercises` sigue viviendo SOLO en este archivo (ya allowlisteado).
2. En **`stretching-selection.ts`**: borrar la query directa (`db.select()...from(exercises)`), importar `{ queryMobilityPool }` from `./mobility-selection`, y hacer `const allMobility = await queryMobilityPool(db)`. Quitar el import `{ eq }` si queda sin uso (mantener `import * as schema` solo si el tipo del param `db` lo necesita). El resto (sort por id + pick determinístico por simpleHash + map a ExercisePrescription) queda igual.
3. Verificar: `cd el-templo-api && pnpm exec tsc --noEmit` = 0, `pnpm exec vitest run test/unit/stretching-selection.test.ts` (con `VITEST_POOL_ID=et159` para no chocar con otros worktrees) verde, y `pnpm exec tsx src/db/scripts/lint-tenant.ts` → **DISCREPANCIAS: 0**.
4. Commit: `fix(159-02): stretching reutiliza queryMobilityPool de mobility-selection (D-12, lint:tenant limpio)`. Borrar la entrada de `stretching-selection.ts` del `deferred-items.md` de la fase.

Este fix es DRY + honra D-12 + limpia el gate SIN tocar la allowlist. Es el correcto; no buscar alternativas (ya se descartaron: allowlist=prohibido por ratchet, tenantWhere=inconsistente con master no-strict — ver PATTERNS.md Pitfall 7 líneas 1106/1150).

## Pendiente de ejecutar (después del fix)

- **Wave 3 — 159-03** (`combos-generator.ts` + `tecnica-generator.ts` + 2 tests unit). depends_on: 159-01, 159-02. Consume `runSemanaNuevaBlockPipeline` + `selectStretchingExercises`. dayId debe ser `W{week}-{day}-{memberLevel}` (igual a regular). Tests unit con DB mockeada.
- **Wave 4 — 159-05** (ruteo `/generate` por modo en `AdminService.generateWeek()` + badge DEUTEROS D1/D2→DA/DB + test integración real contra MySQL `generate-modes.test.ts`). depends_on: 159-01, 159-03. Correr el test de integración con `VITEST_POOL_ID` aislado.
- Después: verificación de fase (gsd-verifier → VERIFICATION.md), y reporte final a Franco.

### Prompt para ejecutores (recordatorio de lo que funcionó)
cd a `/home/franco/projects/et-159`; leer PLAN+CONTEXT+RESEARCH+PATTERNS+CLAUDE.md; reglas duras (no console.log, no any, git add por ruta, migraciones a mano sin `;` en comentarios); tsc foreground obligatorio; tests SOLO en foreground con `VITEST_POOL_ID=et159` y timeout amplio (PROHIBIDO run_in_background y loops con pgrep — matan el propio proceso); NO tocar STATE.md/ROADMAP.md; SUMMARY.md → commit → narración. El worktree ya tiene `.env`/`.env.development` (gitignored) para correr tests.

## Dos avisos que levantó 159-06 (para Franco, antes de shippear)

1. **Doble push del fix de TV** (`tv/class-day.ts`): la TV vive en master (et-tv-master) Y staging (et-tv2) como historias separadas → todo cambio de TV es doble push hasta que el tren llegue a master. El fix de 159-06 toca la lógica de modo de la TV.
2. **Efecto retroactivo del rename Calistenia→General** (mig 0204) sobre reports/analytics históricos (decisión A2). Confirmar con Franco antes de correr 0204 en producción.

## Migraciones nuevas de la fase
- `0202_session_week_regime.sql` (DDL, 159-04)
- `0203_backfill_regime_w12_w26.sql` (`@data-only`, backfill W12-W26, 159-04) + `scripts/0203_regime_dryrun.sql` (dry-run read-only)
- `0204_rename_calistenia_general.sql` (rename actividad, 159-06)
- Máx en origin/master al arrancar = 0201. Si el tren v6.0 mergea a master antes de shippear 159, RE-VERIFICAR numeración + patrón de tenancy (pasaría a strict) + ENTRADAS_BASELINE de ISO-01 (PATTERNS.md:1150).
