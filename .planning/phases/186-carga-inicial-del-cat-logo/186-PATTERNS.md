# Phase 186: Carga inicial del catálogo - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 12 (piezas nuevas de infraestructura de datos; sin UI nueva por D-01/D-02)
**Analogs found:** 12 / 12 (2 son "no analog" de propósito — proceso, no código)

**Codebase fuente:** worktree `/home/franco/projects/et-182` (rama `feat/185-catalogo-ciclo-buscador`, HEAD `dae9c8f7`, sin push). **Todos los paths abajo son relativos a la raíz del repo tal como existen en ese worktree** — el checkout principal (`/home/franco/projects/el-templo`, master) NO tiene el código de 184/185. Los ejecutores de esta fase trabajan DENTRO de `et-182`.

**Mecanismo de ejecución de scripts (confirmado, `el-templo-api/package.json`):** todos los scripts TS del API corren con `tsx` directo, sin compilar — `"db:migrate": "tsx src/db/run-migrations.ts"`, `"db:verify-uniques": "tsx src/db/scripts/verify-tenant-uniques.ts"`, `"seed:spom": "tsx src/db/seed-spom.ts"`. Los tres scripts nuevos de esta fase (loader, validador, export) DEBEN seguir el mismo mecanismo: entrada `tsx src/db/scripts/<nombre>.ts`, agregada como script de `package.json` (`db:load-gym-catalog`, `db:validate-gym-catalog`, `db:export-gym-catalog-migration` o nombres equivalentes — Claude's Discretion del CONTEXT).

---

## File Classification

| New/Modified File                                                                                           | Role                                        | Data Flow                       | Closest Analog                                                                                                                                                                                                                                                                              | Match Quality                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/seed-data/gym-catalog/*.json` (nuevo, dataset versionado, D-05)                       | config/data                                 | file-I/O, batch                 | Ningún archivo de datos commiteado precede esto en el repo (ver "No Analog Found") — estructura libre (Claude's Discretion)                                                                                                                                                                 | no analog directo, precedente de proceso: JSON Schema + `taxonomies.ts` (184) como fuente de los enums permitidos                 |
| `el-templo-api/src/db/scripts/load-gym-catalog-dataset.ts` (nuevo, D-05/D-13)                               | script (CLI, DB write)                      | batch, file-I/O → CRUD (upsert) | `el-templo-api/src/modules/gimnasio/service.ts` método `createExercise` (líneas 505-596, leído completo) para el bloque transaccional multi-tabla; `el-templo-api/src/db/index.ts` función `createSingleConnection` (líneas 38-56, leída completa) para obtener `db` fuera del runtime HTTP | role-match fuerte (mismo INSERT+alias+alternativas en tx; el "upsert" y el scope global NULL son la única diferencia real)        |
| `el-templo-api/src/db/scripts/validate-gym-catalog-dataset.ts` (nuevo, D-08, gate script)                   | script (CLI, sin DB) + módulo importable    | file-I/O, transform, batch      | `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` (leído parcial, cabecera + firmas, 627 líneas) para la FORMA del script (función pura exportada + `formatReport` + wrapper `if (require.main === module)` con exit codes 0/1/2)                                                     | exact en forma, aunque ese analog SÍ toca DB y el nuestro no                                                                      |
| `el-templo-api/test/gimnasio/catalog-dataset-validation.test.ts` (nuevo, D-08, test de CI)                  | test (unit, sin DB)                         | transform                       | `el-templo-api/test/gimnasio/taxonomies.test.ts` (116 líneas, leído completo)                                                                                                                                                                                                               | exact — mismo criterio: test puro, sin `app`/`helpers`, importa funciones/constantes y hace aserciones de conteo/mapeo            |
| `el-templo-api/src/db/scripts/export-gym-catalog-migration.ts` (nuevo, D-03)                                | script (CLI, DB read-only + file write)     | batch, file-I/O                 | `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` (patrón de conexión + reporte + exit codes) para la lectura; `el-templo-api/src/db/migrations/0020_seed_blog_posts.sql` y `0201_aura_planes_accesos.sql` (leídos completos) como MOLDE del SQL generado                             | role-match (script) + exact (forma del SQL de salida)                                                                             |
| `el-templo-api/src/db/migrations/0218_gym_catalog_seed.sql` (nuevo, generado por el script de arriba, D-03) | migration (DML, data-only)                  | DDL/DML batch                   | `el-templo-api/src/db/migrations/0020_seed_blog_posts.sql` (INSERTs directos multi-fila, sin guard de idempotencia) + `0201_aura_planes_accesos.sql` (INSERT...SELECT...WHERE NOT EXISTS, idempotente) + `0217_gym_catalog.sql` (molde de docblock del módulo)                              | exact — D-14 confirma "la tabla llega vacía a prod", así que el molde SIN guard (`0020`) es el que aplica, no el de `0201`/`0211` |
| `el-templo-api/package.json` (editar — 3 scripts nuevos)                                                    | config                                      | —                               | scripts ya existentes (`db:verify-uniques`, `seed:spom`, `db:migrate`)                                                                                                                                                                                                                      | exact                                                                                                                             |
| Prompts de generación por lote (9 lotes, D-06/D-07)                                                         | proceso (sin código)                        | —                               | Ninguno — ver "No Analog Found"                                                                                                                                                                                                                                                             | sin analog de código; precedente de proceso (subagentes GSD)                                                                      |
| Reporte de validación (D-08, "conteos por grupo/patrón/equipamiento/duplicados")                            | output de `validate-gym-catalog-dataset.ts` | transform                       | `verify-tenant-uniques.ts` función `formatReport` (línea 514)                                                                                                                                                                                                                               | exact                                                                                                                             |

---

## Pattern Assignments

### `el-templo-api/src/db/seed-data/gym-catalog/*.json` (nuevo, D-05)

**No hay analog de datos commiteados en el repo** (verificado: `find el-templo-api/src -iname "*.json"` solo devuelve `meta/*.json` de drizzle-kit, que es tooling, no dataset de dominio). Estructura libre por Claude's Discretion del CONTEXT, pero el CONTENIDO de cada entrada debe validar contra:

- `el-templo-api/src/modules/gimnasio/taxonomies.ts` (219 líneas, leído completo) — las listas cerradas exactas: `MUSCLE_GROUP_VALUES` (14), `EQUIPMENT_VALUES` (23, **NO 25/26** — los 3 agarres están fuera, ver comentario bloqueado líneas 52-69), `MOVEMENT_PATTERN_VALUES` (9), `DIFFICULTY_LEVEL_VALUES` (3), `LOAD_TYPE_VALUES` (5). `category` NUNCA es un campo del dataset — se deriva con `deriveCategory(muscleGroupPrimary)` (línea 215), nunca se genera ni se valida como input.
- Forma de la ficha completa: los 19 campos de `gymExercises` en `el-templo-api/src/db/schema/gym-exercises.ts` (líneas 109-208, leído completo) menos los que la capa de aplicación calcula/asigna (`id`, `tenantId`, `tenantScopeKey`, `status`, `createdByUserId`, `createdAt`, `updatedAt`).
- Referencias internas por slug/nombre canónico, no por id de DB (D-13: "las referencias internas del dataset apuntan por slug canónico") — `easierVariantExerciseId`/`harderVariantExerciseId`/alternativas se resuelven al nombre canónico de OTRA entrada del mismo dataset; el loader/validador traduce nombre→id en tiempo de carga.
- Aliases: mismo criterio de normalización que `gym_exercise_aliases.aliasNormalized` — 2-4 por ejercicio (D-11), el original se guarda tal cual lo escribió el generador, el normalizado se calcula con `normalizeSearchText` (ver abajo), NUNCA a mano en el JSON (evita que el JSON y el loader diverjan en el criterio de normalización).

---

### `el-templo-api/src/db/scripts/load-gym-catalog-dataset.ts` (nuevo, D-05/D-13)

**Analogs:**

1. `el-templo-api/src/db/index.ts`, función `createSingleConnection` (líneas 38-56, leída completa) — cómo un script CLI obtiene `db`/`connection` FUERA del runtime HTTP:

```typescript
// el-templo-api/src/db/index.ts:38-56 (ya leído completo)
export async function createSingleConnection() {
  const connection = await mysql.createConnection(dbConfig);
  return {
    db: drizzle(connection),
    connection,
  };
}
```

Uso en un script real (`el-templo-api/src/db/import-members.ts:437-448`, patrón de carga de env + conexión):

```typescript
const dotenv = await import("dotenv");
// ... dotenv.config con NODE_ENV, igual que run-migrations.ts
const { createSingleConnection } = await import("./index.js");
const { db, connection } = await createSingleConnection();
```

2. `el-templo-api/src/modules/gimnasio/service.ts`, método `createExercise` (líneas 505-596, leído completo) — el bloque transaccional exacto a portar para el INSERT de cada ejercicio + sus alias + sus alternativas:

```typescript
// service.ts:536-583 — mismo esqueleto para el loader, con estas diferencias:
//   - tenantId: null explícito (NUNCA tenantValues(ctx, ...) — ese helper es
//     para escrituras de TENANT; acá se inserta GLOBAL a mano, mismo criterio
//     que gym-catalog-promotion-service.ts de la 185 al tocar tenant_id=NULL).
//   - status: 'borrador' (D-01: "la generación carga los ejercicios como
//     borrador"), NO 'publicado' como hace createExercise.
//   - alternativeExerciseId/easierVariantExerciseId/harderVariantExerciseId
//     se resuelven de nombre canónico → id ANTES del insert (mapa en memoria
//     construido en un primer pase sobre todo el dataset, porque las
//     referencias pueden ser hacia adelante en el archivo).
let insertedId: number;
try {
  insertedId = await this.db.transaction(async (tx) => {
    const result = await tx.insert(gymExercises).values({
      tenantId: null,
      nombreCanonico,
      muscleGroupPrimary,
      secondaryMuscleGroups,
      equipment,
      movementPattern,
      difficultyLevel,
      loadType,
      shortDescription,
      executionSteps,
      commonMistakes,
      safetyNotes,
      easierVariantExerciseId,
      harderVariantExerciseId,
      status: "borrador",
      createdByUserId: null, // "NULL para el catálogo global sembrado por el equipo" (docblock schema línea 185)
    });
    const id = Number(result[0].insertId);
    if (aliases.length > 0) {
      await tx
        .insert(gymExerciseAliases)
        .values(
          aliases.map((alias) => ({
            tenantId: null,
            exerciseId: id,
            alias: alias.original,
            aliasNormalized: alias.normalized,
          })),
        );
    }
    if (alternativeIds.length > 0) {
      await tx
        .insert(gymExerciseAlternatives)
        .values(
          alternativeIds.map((alternativeExerciseId) => ({
            tenantId: null,
            exerciseId: id,
            alternativeExerciseId,
          })),
        );
    }
    return id;
  });
} catch (err: unknown) {
  if (isDuplicateKeyError(err)) {
    /* D-13: rama de UPDATE, ver abajo */
  }
  throw err;
}
```

**D-13 upsert por nombre canónico normalizado (parte SIN analog exacto — combinar dos patrones existentes):** antes del INSERT de cada ejercicio, buscar si ya existe una fila global con el mismo nombre canónico normalizado, usando la MISMA normalización del buscador (185):

```typescript
// Reusar textual: el-templo-api/src/modules/gimnasio/search-normalization.ts
// (119 líneas, leído completo) — normalizeSearchText (líneas 70-76) para
// normalizar el nombre del dataset, normalizedSql (líneas 100-106) para
// comparar contra la columna en DB. NO crear una segunda normalización.
import {
  normalizeSearchText,
  normalizedSql,
} from "../../modules/gimnasio/search-normalization";

const [existing] = await db
  .select({ id: gymExercises.id, status: gymExercises.status })
  .from(gymExercises)
  .where(
    and(
      eq(gymExercises.tenantScopeKey, 0),
      eq(
        normalizedSql(gymExercises.nombreCanonico),
        normalizeSearchText(datasetEntry.nombreCanonico),
      ),
    ),
  )
  .limit(1);

if (existing) {
  // UPDATE de todos los campos de ficha, PRESERVANDO existing.status
  // (D-13: "preserva el estado de revisión de los ya publicados") — nunca
  // tocar `status` en la rama de update. Reemplazar alias/alternativas en
  // bloque (DELETE + re-INSERT dentro de la misma tx), mismo criterio que
  // `updateExercise` (service.ts, "Alias y alternativas se reemplazan en
  // bloque si vinieron en el input").
} else {
  // INSERT nuevo, status: 'borrador' (bloque de arriba).
}
```

**Exención `--tenant` (CON-04, fase 169) — anotación OBLIGATORIA:** este script escribe filas GLOBALES (`tenant_id = NULL`) por diseño, nunca recibe `--tenant`. El repo exige una anotación de bloque grepeable `tenant-safe: <motivo>` en cualquier script CLI que escriba tablas gym-owned/mixtas sin `--tenant` (`el-templo-api/src/db/scripts/require-tenant.ts`, leído parcial, docblock líneas 1-50) — un sentinel/lint de CI (fase 170) audita el inventario de exenciones. Precedente EXACTO a copiar, mismo motivo de fondo:

```typescript
/* tenant-safe: seed de producción global — siembra branches/plans/schedules operativos para TODOS los gimnasios por diseño, este script no recibe --tenant */
// el-templo-api/src/db/seed-production.ts:235 (y 4 ocurrencias más idénticas)
```

Adaptar el motivo: `/* tenant-safe: carga del catálogo GLOBAL de ejercicios (fase 186, D-13) — tenant_id=NULL por diseño, no aplica --tenant */`. Otros scripts con la MISMA forma de exención: `el-templo-api/src/db/seed.ts:1`, `seed-spom.ts:1` (ambos de una sola línea al inicio del archivo).

---

### `el-templo-api/src/db/scripts/validate-gym-catalog-dataset.ts` (nuevo, D-08)

**Analog de FORMA (no de contenido):** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` — función pura exportada + `formatReport` + wrapper CLI con exit codes. Firmas relevantes (grep, no releídas completas por ser 627 líneas):

```typescript
// verify-tenant-uniques.ts:326, 514, 617 (firmas confirmadas por grep)
export async function verifyTenantUniques(/* ... */): Promise<TenantUniquesReport> {
  /* ... */
}
export function formatReport(report: TenantUniquesReport): string {
  /* ... */
}
if (require.main === module) {
  // parsea argv, corre, imprime formatReport(...), process.exit(code)
}
```

Portar la MISMA forma para el dataset (sin DB — la única I/O es `fs.readdirSync`/`fs.readFileSync` sobre `src/db/seed-data/gym-catalog/`):

```typescript
export interface GymCatalogDatasetReport {
  totalEjercicios: number;
  porGrupoMuscular: Record<string, number>;
  porPatron: Record<string, number>;
  porEquipamiento: Record<string, number>;
  duplicados: Array<{ nombreA: string; nombreB: string; normalizado: string }>;
  patronesCubiertos: string[]; // debe ser igual a MOVEMENT_PATTERN_VALUES (9)
  alternativasColgadas: Array<{ ejercicio: string; apuntaA: string }>;
  variantesColgadas: Array<{
    ejercicio: string;
    campo: "easier" | "harder";
    apuntaA: string;
  }>;
  ok: boolean; // false si hay duplicados o punteros colgados (D-08: bloqueante)
}
export function validateGymCatalogDataset(
  entries: GymCatalogEntry[],
): GymCatalogDatasetReport {
  /* ... */
}
export function formatReport(report: GymCatalogDatasetReport): string {
  /* ... */
}
if (require.main === module) {
  /* leer JSONs, correr, imprimir, exit 0|1 */
}
```

**Reglas concretas a validar (D-08, del CONTEXT):**

- Taxonomías: cada valor de `muscleGroupPrimary`/`equipment[]`/`movementPattern`/`difficultyLevel`/`loadType` DEBE estar en las listas de `taxonomies.ts` — reusar `assertEnumValue` si es exportable del módulo, o el mismo criterio de `EQUIPMENT_VALUES`/`MUSCLE_GROUP_VALUES` importados directo (mismo import que hace el test `taxonomies.test.ts`).
- 9 patrones cubiertos: `new Set(entries.map(e => e.movementPattern))` debe ser superset de `MOVEMENT_PATTERN_VALUES` — bloqueante si falta alguno (D-07: "cobertura de los 9 patrones garantizada por construcción", el validador lo confirma).
- Colisiones de nombre/alias: usar `normalizeSearchText` (185) sobre TODOS los nombres canónicos Y todos los alias del dataset combinados — dos entradas distintas no pueden normalizar igual (D-08: "el que más importa... bloqueante, no warning").
- Punteros de alternativas/variantes resolubles: cada nombre referenciado por `alternativeExerciseIds`/`easierVariant`/`harderVariant` debe existir como nombre canónico de OTRA entrada del mismo dataset (D-10: "resolviendo DENTRO del set inicial").
- Conteos por grupo/patrón/equipamiento/duplicados: el reporte que exige el protocolo del brief, paso 2 — mismo espíritu que `formatReport` de `verify-tenant-uniques.ts` (texto plano, secciones tituladas, cabecera con el total).

---

### `el-templo-api/test/gimnasio/catalog-dataset-validation.test.ts` (nuevo, D-08)

**Analog exacto:** `el-templo-api/test/gimnasio/taxonomies.test.ts` (116 líneas, leído completo) — mismo criterio: test puro (`describe`/`it`/`expect` de vitest), CERO import de `helpers`/`app`/DB, corre en CI barato:

```typescript
// Mismo esqueleto que taxonomies.test.ts (líneas 1-30) — import directo de
// funciones puras, sin fixtures de red.
import { describe, it, expect } from "vitest";
import { loadGymCatalogDataset } from "../../src/db/scripts/load-gym-catalog-dataset"; // o donde viva el reader de JSONs
import { validateGymCatalogDataset } from "../../src/db/scripts/validate-gym-catalog-dataset";

describe("gimnasio/gym-catalog dataset — validación permanente (fase 186, D-08)", () => {
  it("sin duplicados de nombre/alias normalizado", () => {
    const report = validateGymCatalogDataset(loadGymCatalogDataset());
    expect(report.duplicados, JSON.stringify(report.duplicados)).toHaveLength(
      0,
    );
  });
  it("cubre los 9 patrones de movimiento", () => {
    const report = validateGymCatalogDataset(loadGymCatalogDataset());
    expect(report.patronesCubiertos.sort()).toEqual(
      [...MOVEMENT_PATTERN_VALUES].sort(),
    );
  });
  it("ninguna alternativa/variante apunta a un nombre inexistente en el set", () => {
    const report = validateGymCatalogDataset(loadGymCatalogDataset());
    expect(report.alternativasColgadas).toHaveLength(0);
    expect(report.variantesColgadas).toHaveLength(0);
  });
  it("volumen dentro del rango duro 40-80 publicables", () => {
    const report = validateGymCatalogDataset(loadGymCatalogDataset());
    expect(report.totalEjercicios).toBeGreaterThanOrEqual(40);
    expect(report.totalEjercicios).toBeLessThanOrEqual(80);
  });
});
```

Este test queda en `el-templo-api/test/` y corre con la suite normal (`pnpm test` en CI) — es "barato" porque no toca `helpers.ts`/MySQL, igual que `taxonomies.test.ts`.

---

### `el-templo-api/src/db/scripts/export-gym-catalog-migration.ts` (nuevo, D-03)

**Analog de conexión/reporte:** mismo patrón de `createSingleConnection`/`verify-tenant-uniques.ts` que el loader — este script es de LECTURA sobre dev (`SELECT ... FROM gym_exercises WHERE tenant_id IS NULL AND status = 'publicado'`, con sus aliases y alternatives por `exercise_id IN (...)`), y de ESCRITURA de un archivo `.sql` nuevo (no de la DB).

**Molde EXACTO del SQL de salida:** `el-templo-api/src/db/migrations/0020_seed_blog_posts.sql` (INSERTs directos multi-fila, SIN guard `WHERE NOT EXISTS`) — confirmado por D-14: "la migración inserta solo filas globales nuevas (la tabla llega vacía a prod)", así que el guard de idempotencia de `0201_aura_planes_accesos.sql`/`0211_add_alberti_branch.sql` NO aplica acá (esos son para tablas que YA tienen filas en prod cuando corre la migración; `gym_exercises` en prod arranca vacía tras la 0217).

```sql
-- 0218_gym_catalog_seed.sql (nombre exacto TBD por planning — verificar
-- número libre real al momento de generar, igual que hizo la 185-PATTERNS
-- con 0218 para su propia fase)
-- Fase 186 (CAT-08): carga inicial de ~N ejercicios PUBLICADOS del catálogo
-- global, aprobados uno por uno en el panel de plataforma (D-01/D-02).
-- Generada por `tsx src/db/scripts/export-gym-catalog-migration.ts` desde
-- el dataset aprobado en dev -- NUNCA editar a mano (D-04: corregir en la
-- fuente y regenerar).
--
-- Reversion (D-14): DELETE de las 3 tablas en scope global, documentado
-- aca. Valido SOLO mientras no existan registros de entrenamiento
-- referenciando estos ids.
--   DELETE FROM gym_exercise_alternatives WHERE tenant_id IS NULL;
--   DELETE FROM gym_exercise_aliases WHERE tenant_id IS NULL;
--   DELETE FROM gym_exercises WHERE tenant_id IS NULL;

INSERT INTO gym_exercises
  (id, nombre_canonico, muscle_group_primary, secondary_muscle_groups, equipment,
   movement_pattern, difficulty_level, load_type, short_description,
   execution_steps, common_mistakes, safety_notes,
   easier_variant_exercise_id, harder_variant_exercise_id, status)
VALUES
  (1, 'Sentadilla con barra', 'cuádriceps', '["glúteos","isquiotibiales"]', '["barra olímpica","discos"]',
   'dominante de rodilla', 'intermedio', 'externa', '...',
   '...', '...', '...', NULL, NULL, 'publicado');
   -- ... una fila por ejercicio, o VALUES multi-fila como 0020 (una sola
   -- sentencia con N tuplas, mas barato que N sentencias)
--> statement-breakpoint

INSERT INTO gym_exercise_aliases (tenant_id, exercise_id, alias, alias_normalized)
VALUES (NULL, 1, 'sentadilla', 'sentadilla'), (NULL, 1, 'squat', 'squat');
--> statement-breakpoint

INSERT INTO gym_exercise_alternatives (tenant_id, exercise_id, alternative_exercise_id)
VALUES (NULL, 1, 7);
```

**Decisión de planning pendiente (Claude's Discretion del CONTEXT):** ids explícitos (como arriba, requiere que el script calcule/reserve los ids en el orden de inserción — riesgoso si el autoincrement de dev no arranca en el mismo punto que prod) VS. resolver referencias de alternativas/variantes por subquery de nombre (`(SELECT id FROM gym_exercises WHERE nombre_canonico = '...' AND tenant_id IS NULL)`, más robusto pero más verboso). **Ningún data-migration existente en el repo resuelve FKs por subquery de nombre entre filas insertadas en el MISMO archivo** (0211 sí usa subquery, pero contra tablas YA POBLADAS — `branches`/`activities` — no contra filas que la propia migración acaba de insertar). Recomendación implícita del molde 0020 (que no tiene FKs internas) + la nota de la 184 sobre `AUTO_INCREMENT` no coincidiendo entre entornos: preferir subquery de nombre por robustez, aceptando el costo de verbosidad.

---

### `el-templo-api/package.json` (editar)

**Analog:** scripts ya existentes, mismo bloque:

```json
"db:verify-uniques": "tsx src/db/scripts/verify-tenant-uniques.ts",
"seed:spom": "tsx src/db/seed-spom.ts",
```

Agregar (nombres exactos a decidir en planning):

```json
"db:load-gym-catalog": "tsx src/db/scripts/load-gym-catalog-dataset.ts",
"db:validate-gym-catalog": "tsx src/db/scripts/validate-gym-catalog-dataset.ts",
"db:export-gym-catalog-migration": "tsx src/db/scripts/export-gym-catalog-migration.ts"
```

---

## Shared Patterns

### Conexión standalone para scripts CLI (fuera del runtime HTTP)

**Fuente:** `el-templo-api/src/db/index.ts`, función `createSingleConnection` (líneas 38-56, leída completa) + carga de env (`run-migrations.ts` líneas 22-28, ya leído en la 185).
**Aplica a:** loader, validador (si en algún momento necesita leer DB — hoy NO, es puro), export.
**Nota crítica del docblock (líneas 38-49):** esta conexión queda FUERA del sentinel de tenancy a propósito — es tooling de desarrollo, no runtime de la app. Es la vía correcta para los 3 scripts nuevos.

### Exención `tenant-safe` para escrituras globales sin `--tenant`

**Fuente:** `el-templo-api/src/db/seed.ts:1`, `seed-spom.ts:1`, `seed-production.ts:235` (idéntico x5), `fill-future-bookings.ts:151/160` — todos con la forma `/* tenant-safe: <motivo> */` como comentario de bloque pegado al sitio del write o al inicio del archivo.
**Aplica a:** `load-gym-catalog-dataset.ts` (escribe `tenant_id = NULL` en `gym_exercises`/aliases/alternatives, tabla de scope MIXTO según `TENANT_MIXED_SCOPE_TABLES` en `el-templo-api/src/db/tenant-tables.ts:257-263`). El sentinel/lint de CI de la fase 170 audita este inventario — omitir la anotación puede poner la suite de tenancy en rojo.

### Transacción multi-tabla ejercicio + aliases + alternativas

**Fuente:** `el-templo-api/src/modules/gimnasio/service.ts`, método `createExercise` (líneas 505-596, leído completo) — INSERT de la fila principal, `insertId` capturado, INSERT en bloque de aliases y de alternativas dentro del MISMO `db.transaction`, catch de `isDuplicateKeyError`.
**Aplica a:** `load-gym-catalog-dataset.ts` — mismo esqueleto, con `tenantId: null` a mano y rama de UPDATE para el caso "ya existe" (D-13).

### Normalización canónica de búsqueda (fuente única, NO duplicar)

**Fuente:** `el-templo-api/src/modules/gimnasio/search-normalization.ts` completo (119 líneas) — `normalizeSearchText` (líneas 70-76) y `normalizedSql` (líneas 100-106).
**Aplica a:** loader (D-13, ancla de upsert), validador (D-08, detección de colisiones de nombre/alias) — LOS DOS deben llamar a esta MISMA función, nunca reimplementar `stripAccents` a mano (el patrón viejo de `import-members.ts:98-99` está DEPRECADO para este módulo desde la 185, según el propio docblock de `search-normalization.ts`).

### Migración de datos: molde INSERT directo sin idempotencia (tabla vacía en prod)

**Fuente:** `el-templo-api/src/db/migrations/0020_seed_blog_posts.sql` completo — `INSERT INTO ... VALUES (...);` seguido de `--> statement-breakpoint`, sin `WHERE NOT EXISTS`.
**Aplica a:** `0218_gym_catalog_seed.sql` generado por el script de export — D-14 confirma que la tabla llega vacía a prod, así que el guard de idempotencia (visto en `0201`/`0211`, para tablas que YA tienen filas) es innecesario y agregaría complejidad sin beneficio.
**Contraste:** si el planner decide que el script de export debe ser re-ejecutable de forma segura contra un entorno donde la migración YA corrió parcialmente, el molde de `0201_aura_planes_accesos.sql` (INSERT...SELECT...WHERE NOT EXISTS por `name`) es el fallback a usar — pero el criterio default, dado D-14, es el molde simple de `0020`.

### Script gate: función pura exportada + reporte + wrapper CLI con exit codes

**Fuente:** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` — `export async function verifyTenantUniques(...)` (línea 326), `export function formatReport(...)` (línea 514), `if (require.main === module) { ...; process.exit(code); }` (línea 617). Convención de exit codes ya establecida en el repo (documentada también en `require-tenant.ts`): **0** OK, **1** discrepancias/datos inválidos, **2** error de conexión o de uso.
**Aplica a:** `validate-gym-catalog-dataset.ts` (sin DB, mismo contrato de exit codes) — y es el archivo que el test de CI (`catalog-dataset-validation.test.ts`) importa directamente, evitando duplicar la lógica de validación entre el gate manual y el test permanente.

### Test unitario puro sobre constantes/datos del módulo (sin DB, sin HTTP)

**Fuente:** `el-templo-api/test/gimnasio/taxonomies.test.ts` completo (116 líneas) — sin `helpers`, sin `app`, `describe`/`it`/`expect` de vitest importando directo del módulo bajo test.
**Aplica a:** `catalog-dataset-validation.test.ts` — mismo criterio de "barato, CI-friendly" que pide D-08 explícitamente.

---

## No Analog Found

| File/Pieza                                                                                                               | Role        | Data Flow | Reason                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Estructura interna del dataset JSON (un archivo por patrón vs. por ejercicio, esquema exacto)                            | config/data | file-I/O  | Ningún dataset de dominio commiteado precede esto en el repo — los únicos `.json` versionados son metadata de drizzle-kit (`meta/*.json`), sin relación de contenido. Claude's Discretion del CONTEXT es la fuente primaria de la decisión de forma.                                                                                                                                                               |
| Prompts de generación por lote (9 lotes, D-06/D-07, con §2.4/§2.5 embebidos)                                             | proceso     | —         | No hay precedente de código — son prompts de sesión GSD para subagentes, no artefactos de repo. El precedente es de PROCESO: la convención de subagentes sonnet documentada en `CLAUDE.md` raíz ("Ejecución de fases GSD con modelo barato") y el criterio de "un lote = un patrón de movimiento" ya fijado por D-07.                                                                                              |
| Resolución de FKs internas del dataset por subquery de nombre en la MISMA migración que las inserta (vs. ids explícitos) | transform   | batch     | Ningún data-migration del repo resuelve una FK contra una fila insertada por el MISMO archivo mediante subquery de nombre — los `INSERT...SELECT` existentes (`0211`) referencian tablas YA POBLADAS antes de esa migración (`branches`, `activities`), nunca filas hermanas del mismo statement. Decisión de planning sin precedente exacto — ver nota en la sección de `export-gym-catalog-migration.ts` arriba. |

## Metadata

**Analog search scope:** `el-templo-api/src/db/` (`scripts/`, `migrations/`, `schema/`, `seed*.ts`, `import-*.ts`, `index.ts`, `run-migrations.ts`, `tenant-tables.ts`), `el-templo-api/src/modules/gimnasio/` (`service.ts`, `taxonomies.ts`, `search-normalization.ts`, `schema`), `el-templo-api/test/gimnasio/` (`taxonomies.test.ts`, `catalog-validation.test.ts` descartado por ser DB-based), `el-templo-api/package.json` — todos dentro del worktree `/home/franco/projects/et-182`.
**Files scanned/read in full or targeted ranges:** ~11 archivos de código + `186-CONTEXT.md` + `185-PATTERNS.md` como referencia de formato.
**Pattern extraction date:** 2026-09-01
