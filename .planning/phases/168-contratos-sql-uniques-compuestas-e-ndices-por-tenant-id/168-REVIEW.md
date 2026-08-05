---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
reviewed: 2026-07-27T22:11:45Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - el-templo-api/package.json
  - el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql
  - el-templo-api/src/db/schema/branches.ts
  - el-templo-api/src/db/schema/campaigns.ts
  - el-templo-api/src/db/schema/cost-centers.ts
  - el-templo-api/src/db/schema/day-modes.ts
  - el-templo-api/src/db/schema/formats.ts
  - el-templo-api/src/db/schema/holidays.ts
  - el-templo-api/src/db/schema/notifications.ts
  - el-templo-api/src/db/schema/promo-plans.ts
  - el-templo-api/src/db/schema/refresh-tokens.ts
  - el-templo-api/src/db/schema/subscription-plans.ts
  - el-templo-api/src/db/schema/tv.ts
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/db/schema/wellhub.ts
  - el-templo-api/src/db/scripts/verify-tenant-uniques.ts
  - el-templo-api/src/db/tenant-tables.ts
  - el-templo-api/test/db/tenant-tables.test.ts
  - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
  - el-templo-api/test/tenancy/con-01-uniques-cross-tenant.test.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Fase 168: Reporte de Code Review

**Revisado:** 2026-07-27T22:11:45Z
**Profundidad:** standard
**Archivos revisados:** 20
**Estado:** issues_found

## Narrative Findings (AI reviewer)

## Resumen

Se revisó la conversión de las 12 uniques globales a `UNIQUE(tenant_id, …)` (migración 0196), el alineamiento del schema Drizzle, el registro canónico de uniques globales (`tenant-tables.ts`), el verificador fail-closed (`verify-tenant-uniques.ts`) y las tres suites de tests (clasificación, introspección del DDL, comportamiento cross-tenant vs intra-tenant).

Chequeos adversariales que salieron limpios y vale la pena dejar asentados:

- **Detección de duplicados en la aplicación no se rompe con el rename de índices.** `src/modules/shared/sql-errors.ts` matchea por `ER_DUP_ENTRY` / `"Duplicate entry"` genérico, nunca por nombre de índice — el 409 de planes (`subscriptions/service.ts:749`) y los handlers de `members/routes.ts` siguen funcionando con los nombres nuevos `uq_*`.
- **Los upserts `ON DUPLICATE KEY UPDATE` sobre las tablas convertidas conservan su semántica** con un solo tenant: `campaign_unsubscribes` (`tracking-service.ts:61`) y `campaign_sends` insertan sin `tenantId` explícito, caen en el DEFAULT 1 y chocan contra la misma unique compuesta.
- **Ningún comentario de la 0196 contiene `;`** (verificado por grep sobre las 108 líneas de comentario) — la trampa del splitter de `run-migrations.ts` está esquivada.
- **La atomicidad DROP+ADD en un solo `ALTER TABLE` por tabla** es correcta: nunca hay ventana sin contrato, y como la unique nueva es más laxa que la vieja el `ADD UNIQUE` no puede fallar por datos existentes.
- **Los conteos internos cierran:** 11 entradas M8 + 37 allowlist = 48 (consistente con el mínimo del Test 10), 12 contratos convertidos en ambas copias de datos (verificador y test), y los cuatro índices secundarios D-05 coinciden byte a byte entre SQL, schema y tests.
- **Los tests de comportamiento son genuinamente fail-closed:** `esperarRechazoPorDuplicado` exige errno 1062 específico, todo insert estampa `tenantId` explícito (el DEFAULT 1 no puede enmascarar), y los contratos de 3 columnas se prueban completos (mismo nombre/otro país acepta, par completo rechaza). Verifiqué contra `TABLES_TO_CLEAN` de `test/helpers.ts` que la limpieza del test con-01 es correcta: las tablas fuera de la lista (`branches`, `cost_centers`, `day_modes`) se limpian en `finally` propios y el test de cierre detecta fugas.

No se encontró ningún hallazgo crítico. Los cuatro warnings son de robustez del verificador y de documentación desactualizada; ninguno afecta el contrato ya desplegado en staging y prod.

## Warnings

### WR-01: El verificador se contradice cuando una tabla gym-owned no existe en la base

**File:** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts:333-343` y `:395-419`
**Issue:** Si una tabla de `GYM_OWNED_TABLES` no existe físicamente en la base verificada, el paso de `checkableTables` la excluye y emite un warning explícito que dice "No es discrepancia de esta fase". Pero el chequeo de `staleClassifications` (líneas 402-419) NO filtra por `physicalSet`: toda entrada de `TENANT_GLOBAL_UNIQUES` / `TENANT_UNIQUE_ALLOWLIST` cuya tabla esté ausente se reporta como "clasificación podrida (typo, rename o índice borrado)" y **suma discrepancias → exit 1**. El reporte queda contradictorio (la misma tabla es a la vez "no verificada, no es discrepancia" y fuente de N discrepancias) y el diagnóstico impreso ("typo, rename o índice borrado") es falso — el índice no tiene typo, la tabla entera no está. El chequeo hermano de `uniquesMissingTenantPrefix` (línea 348) sí filtra por `physicalSet.has(idx.table)`, lo que confirma que la asimetría es un descuido y no una decisión. Contra staging/prod completos nunca dispara, pero el script está diseñado para correrse contra bases arbitrarias (es su razón de ser).
**Fix:**

```typescript
// En los dos bucles de staleClassifications, saltear las tablas ausentes
// y reportarlas como warning coherente con el de checkableTables:
for (const [key, motive] of Object.entries(TENANT_GLOBAL_UNIQUES)) {
  const [table] = splitKey(key);
  if (!physicalSet.has(table)) continue; // ya reportada como tabla ausente
  if (!liveUniqueKeys.has(key)) {
    staleClassifications.push({
      key,
      register: "TENANT_GLOBAL_UNIQUES",
      motive,
    });
  }
}
```

### WR-02: El docblock del verificador dice "11 contratos" en tres lugares — son 12

**File:** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts:19`, `:57`, `:421`
**Issue:** La cabecera del archivo afirma "Que los 11 contratos convertidos por la migración 0196 existen realmente" (línea 19), "este archivo no duplica ningún nombre salvo los 11 contratos convertidos" (línea 57) y el separador de sección dice "CON-01 estructural: los 11 contratos convertidos por la 0196" (línea 421). El array `CONVERTED_CONTRACTS` tiene **12** entradas y su propio docblock (línea 93) dice correctamente "Los 12 contratos" — el doceavo (`subscription_plans`) es justamente la historia central del archivo. En un repo donde los comentarios de contratos DB son load-bearing (y en el archivo cuyo único trabajo es contar contratos), el conteo desactualizado va a confundir a quien audite la fase.
**Fix:** Reemplazar "los 11 contratos" por "los 12 contratos" en las líneas 19, 57 y 421. El resto de las menciones a "once" (lista D-01, lista M8) son correctas y no se tocan.

### WR-03: Comentarios en código de producción referencian índices que la 0196 dropeó

**File:** `el-templo-api/src/modules/subscriptions/service.ts:94`, `:746`; `el-templo-api/src/modules/finance/cash-register-service.ts:415`; también `test/subscriptions/plans-crud.test.ts:124` y `test/finance/cost-centers-abm.test.ts:19`
**Issue:** La fase renombró `ux_subscription_plans_name_country` → `uq_subscription_plans_tenant_name_country` y `uq_cost_centers_name_country` → `uq_cost_centers_tenant_name_country`, pero los comentarios que documentan el manejo del 409 por duplicado en `subscriptions/service.ts` ("Mensaje del 409 al chocar con UNIQUE ux_subscription_plans_name_country", "UNIQUE ux_subscription_plans_name_country (name, country)") y el guard de unicidad de `cash-register-service.ts` ("Belt-and-suspenders con el uniqueIndex `uq_cost_centers_name_country` de la migración 0165") siguen nombrando los índices viejos. Un `ER_DUP_ENTRY` de producción hoy trae el nombre nuevo en su mensaje; quien lo grepee no va a matchear estos comentarios, y quien lea el comentario va a buscar un índice que ya no existe. Además, ambos contratos ahora incluyen `tenant_id` — el comentario describe un contrato que ya no es el vigente.
**Fix:** Actualizar los cuatro comentarios al nombre físico nuevo (por ejemplo: "UNIQUE uq_subscription_plans_tenant_name_country (tenant_id, name, country) — renombrado por la 0196"). Es un sweep de comentarios, cero cambio de comportamiento.

### WR-04: `cleanAllTestData` identifica al admin por email GLOBAL — hueco latente post-0196

**File:** `el-templo-api/test/helpers.ts:257-262` (interacción con el patrón 2-tenant que introduce `test/tenancy/con-01-uniques-cross-tenant.test.ts`)
**Issue:** La limpieza de la suite borra usuarios con `DELETE FROM users WHERE NOT (email <=> 'admin@test.com')`, es decir: **cualquier fila con ese email sobrevive, sin importar el tenant**. Antes de la 0196 eso era seguro (email único global = a lo sumo una fila). Después de la 0196 es legal que exista un `admin@test.com` en el tenant 2 — esa fila sobreviviría a `cleanAllTestData` y se filtraría entre archivos del mismo worker (`fileParallelism` con `isolate: false`), exactamente la clase de contaminación que el test de cierre de con-01 existe para atrapar. Hoy no dispara porque con-01 usa emails `*@tenancy.test`, pero el hueco queda armado para las fixtures 2-tenant de la fase 171: el primer test que cree un admin espejo en el tenant de prueba va a dejar una fila fantasma que rompe archivos vecinos por motivos ajenos a lo que prueban.
**Fix:** Acotar la excepción al tenant 1: `DELETE FROM users WHERE NOT (email <=> 'admin@test.com' AND tenant_id = 1)`. Si se prefiere no tocar `helpers.ts` en esta fase (está fuera del diff), registrarlo como requisito explícito de las fixtures de la fase 171 (ISO-03).

## Info

### IN-01: Entrada de allowlist mal seccionada — `financial_transactions` es categoría (c), está bajo el encabezado (a)

**File:** `el-templo-api/src/db/tenant-tables.ts:309-310`
**Issue:** El docblock de `TENANT_UNIQUE_ALLOWLIST` define tres categorías con encabezados de sección. `financial_transactions.uq_financial_tx_idempotency_key` tiene motivo de categoría (c) ("Token opaco random con lookup pre-scope") pero está físicamente ubicada dentro de la sección "── (a) Derivadas de una FK ya scopeada ──". El motivo individual es correcto y auditable; solo la ubicación desorienta.
**Fix:** Moverla debajo de una sección propia "── (c) Token opaco con lookup pre-scope ──" (o al final, antes de la sección (b)).

### IN-02: Condición muerta en el filtro de uniques gym-owned

**File:** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts:346-349`
**Issue:** El filtro `gymOwnedUniques` exige `physicalSet.has(idx.table)`, pero `indexes` sale de `INFORMATION_SCHEMA.STATISTICS` de la misma base — toda tabla con índices es por definición física, así que la condición es siempre verdadera (STATISTICS no incluye vistas con `TABLE_SCHEMA = DATABASE()` en la práctica de este repo). Inofensiva, pero sugiere una defensa que no defiende nada, en contraste con el lugar donde el filtro sí falta (WR-01).
**Fix:** Quitar la condición o dejar un comentario de una línea explicando que es redundante a propósito.

### IN-03: El drift de nombre de `refresh_tokens` se documenta pero no se cierra — y `db:push` lo materializaría

**File:** `el-templo-api/src/db/schema/refresh-tokens.ts:43`; `el-templo-api/src/db/tenant-tables.ts:243-244`
**Issue:** La fase cerró el drift schema↔DB de `subscription_plans` declarando la unique en el schema, pero el drift simétrico de `refresh_tokens` (schema declara `.unique()` inline → Drizzle lo nombraría `refresh_tokens_token_hash_unique`; el índice físico es `uq_refresh_tokens_token_hash` de la 0125) se deja vivo, documentado en el motivo M8. Es una decisión consciente y el registro usa el nombre físico correcto, así que el gate no se ve afectado — pero un `pnpm db:push` de prototipado sobre una base fresca crearía el índice con el nombre Drizzle y el verificador reportaría la clasificación como podrida. Riesgo bajo (db:push está desaconsejado en el propio CLAUDE.md).
**Fix:** Opcional: en una fase futura, declarar la unique como `uniqueIndex("uq_refresh_tokens_token_hash")` en el callback de tabla y quitar el `.unique()` inline — cierra el drift sin migración (el nombre físico ya es ese).

### IN-04: Filas de STATISTICS con `COLUMN_NAME` NULL se descartan silenciosamente

**File:** `el-templo-api/src/db/scripts/verify-tenant-uniques.ts:278-281`
**Issue:** `loadIndexes` saltea toda fila con `COLUMN_NAME` NULL (`if (!table || !indexName || !column) continue`). En MySQL 8, las partes funcionales de un índice (`INDEX ((LOWER(email)))`) devuelven `COLUMN_NAME = NULL` — si alguna vez se creara un índice funcional en una tabla gym-owned, su lista de columnas quedaría misrepresentada (por ejemplo, la parte 2 pasaría a verse como primera columna) y el gate razonaría sobre un índice que no existe con esa forma. Hoy el repo no tiene índices funcionales, así que es puramente preventivo.
**Fix:** Opcional: cuando una fila tenga `COLUMN_NAME` NULL, registrar el índice con un placeholder (`"(expresión)"`) o emitir un warning, en vez de descartar la fila.

---

_Revisado: 2026-07-27T22:11:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
