---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
reviewed: 2026-07-27T17:25:17Z
depth: standard
files_reviewed: 83
files_reviewed_list:
  - el-templo-api/package.json
  - el-templo-api/src/db/migrations/0192_tenant_id_core_ops.sql
  - el-templo-api/src/db/migrations/0193_tenant_id_core_comms.sql
  - el-templo-api/src/db/migrations/0194_tenant_id_templo_spom.sql
  - el-templo-api/src/db/migrations/0195_tenant_id_templo_rest.sql
  - el-templo-api/src/db/schema/academy-inquiries.ts
  - el-templo-api/src/db/schema/activities.ts
  - el-templo-api/src/db/schema/app-waitlist.ts
  - el-templo-api/src/db/schema/attendance.ts
  - el-templo-api/src/db/schema/audit-log.ts
  - el-templo-api/src/db/schema/aura-balances.ts
  - el-templo-api/src/db/schema/aura-config.ts
  - el-templo-api/src/db/schema/aura-transactions.ts
  - el-templo-api/src/db/schema/balances.ts
  - el-templo-api/src/db/schema/blog-posts.ts
  - el-templo-api/src/db/schema/blog-tags.ts
  - el-templo-api/src/db/schema/bookings.ts
  - el-templo-api/src/db/schema/campaigns.ts
  - el-templo-api/src/db/schema/cash-registers.ts
  - el-templo-api/src/db/schema/check-in-responses.ts
  - el-templo-api/src/db/schema/class-coach-assignments.ts
  - el-templo-api/src/db/schema/coach-ratings.ts
  - el-templo-api/src/db/schema/completed-sessions.ts
  - el-templo-api/src/db/schema/contraction-rules.ts
  - el-templo-api/src/db/schema/cost-centers.ts
  - el-templo-api/src/db/schema/day-modes.ts
  - el-templo-api/src/db/schema/debt-management.ts
  - el-templo-api/src/db/schema/evaluation-requests.ts
  - el-templo-api/src/db/schema/exercise-adjustments.ts
  - el-templo-api/src/db/schema/exercise-dimension-proposals.ts
  - el-templo-api/src/db/schema/exercise-milestone-proposals.ts
  - el-templo-api/src/db/schema/exercise-progressions.ts
  - el-templo-api/src/db/schema/exercises.ts
  - el-templo-api/src/db/schema/financial-transactions.ts
  - el-templo-api/src/db/schema/format-compatibility.ts
  - el-templo-api/src/db/schema/formats.ts
  - el-templo-api/src/db/schema/franchise-applications.ts
  - el-templo-api/src/db/schema/gladius-inquiries.ts
  - el-templo-api/src/db/schema/gladius-products.ts
  - el-templo-api/src/db/schema/holidays.ts
  - el-templo-api/src/db/schema/improvement-proposals.ts
  - el-templo-api/src/db/schema/intensity-rules.ts
  - el-templo-api/src/db/schema/member-logins.ts
  - el-templo-api/src/db/schema/member-notes.ts
  - el-templo-api/src/db/schema/member-profiles.ts
  - el-templo-api/src/db/schema/micro-programs.ts
  - el-templo-api/src/db/schema/notifications.ts
  - el-templo-api/src/db/schema/onboarding-analytics.ts
  - el-templo-api/src/db/schema/plan-programs.ts
  - el-templo-api/src/db/schema/program-enrollments.ts
  - el-templo-api/src/db/schema/promo-plans.ts
  - el-templo-api/src/db/schema/referral-credits.ts
  - el-templo-api/src/db/schema/referral-cta-clicks.ts
  - el-templo-api/src/db/schema/referrals.ts
  - el-templo-api/src/db/schema/refresh-tokens.ts
  - el-templo-api/src/db/schema/routes.ts
  - el-templo-api/src/db/schema/saved-blocks.ts
  - el-templo-api/src/db/schema/schedule-exceptions.ts
  - el-templo-api/src/db/schema/schedules.ts
  - el-templo-api/src/db/schema/session-blocks.ts
  - el-templo-api/src/db/schema/session-edit-logs.ts
  - el-templo-api/src/db/schema/session-prescriptions.ts
  - el-templo-api/src/db/schema/session-traces.ts
  - el-templo-api/src/db/schema/sessions.ts
  - el-templo-api/src/db/schema/spom-config.ts
  - el-templo-api/src/db/schema/spom-rules.ts
  - el-templo-api/src/db/schema/subscription-plans.ts
  - el-templo-api/src/db/schema/subscription-schedule-changes.ts
  - el-templo-api/src/db/schema/subscription-schedules.ts
  - el-templo-api/src/db/schema/subscriptions.ts
  - el-templo-api/src/db/schema/tenant-column.ts
  - el-templo-api/src/db/schema/transaction-links.ts
  - el-templo-api/src/db/schema/tv.ts
  - el-templo-api/src/db/schema/user-branches.ts
  - el-templo-api/src/db/schema/user-sepa-details.ts
  - el-templo-api/src/db/schema/user-status-history.ts
  - el-templo-api/src/db/schema/weekly-rotator.ts
  - el-templo-api/src/db/schema/wellhub.ts
  - el-templo-api/src/db/scripts/verify-tenant-backfill.ts
  - el-templo-api/src/db/tenant-tables.ts
  - el-templo-api/src/modules/finance/balance-service.ts
  - el-templo-api/test/db/tenant-tables.test.ts
  - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 167: Code Review Report

**Reviewed:** 2026-07-27T17:25:17Z
**Depth:** standard
**Files Reviewed:** 83
**Status:** issues_found

## Summary

Revisión adversarial de la fase 167 (tenant_id en las 85 tablas restantes + verificador de backfill), sobre el worktree `/home/franco/projects/et-167-columnas` (diff `e6cab5f6..1c15b300`). El código ya está en producción; los hallazgos son advisory.

**Lo que se verificó y CIERRA exacto (no se encontró ningún Critical):**

- **Paridad migración ↔ lista canónica:** los nombres de tabla extraídos de los `ALTER TABLE ... ADD COLUMN` de 0192-0195 (85, sin duplicados) coinciden EXACTAMENTE con `GYM_OWNED_TABLES` menos las 2 anclas (`users`, `branches`). Diff de conjuntos vacío en ambas direcciones.
- **Conteos internos de los SQL:** 27+16+22+20 = 85 tablas; 108/64/88/80 statements por archivo coinciden con lo que anuncian sus propios comentarios (4 por tabla).
- **Regla del runner:** ningún comentario de los 4 SQL contiene `;` (verificado por grep). Ciclo ADD COLUMN nullable con DEFAULT → backfill guardado por `IS NULL` → MODIFY NOT NULL con DEFAULT repetido → FK nombrada: correcto para rolling deploy y replay manual.
- **Uniformidad del cambio mecánico en los schemas:** las 85 tablas no-ancla usan `tenantId: tenantIdColumn()` (85 usos contados fuera de `tenant-column.ts`); las únicas desviaciones del diff son comentarios de minas (M1/M3/M6/M7/M9) y los imports con comilla simple en archivos SPOM que ya usaban comilla simple. Las anclas declaran a mano la definición idéntica (`int("tenant_id").notNull().default(1).references(...)`, `users.ts:119-122`, `branches.ts:32-35`).
- **Sin inyección SQL en el verificador:** todos los identificadores pasan por `ident()` (backtick-escape), los literales por `literal()`, y todos los nombres salen de constantes del repo o de INFORMATION_SCHEMA. Solo `SELECT`, sin escrituras.
- **Sin `any`, sin secretos, catch con `instanceof Error`** en el código nuevo. El `console.log/error` del CLI sigue el precedente de `run-migrations.ts` (scripts de DB son la excepción aceptada).

Los tres Warnings son gaps de solidez del verificador y de fuerza de aserción de los tests — importan porque este verificador es el gate de aislamiento de las fases 168-170, y hoy (con un solo tenant, todo `tenant_id = 1`) varios de sus chequeos son trivialmente verdes: un defecto en ellos no puede manifestarse hasta que exista el tenant 2, que es exactamente cuando más se los va a necesitar.

## Warnings

### WR-01: Mapa `TARGET_KIND_TABLES` único aplicado a los 3 hosts heterogéneos — para `balances.target_kind='debt_balance'` produce un self-join de semántica no establecida

**File:** `el-templo-api/src/db/scripts/verify-tenant-backfill.ts:256-262` (y su uso en `buildLogicalEdges`, líneas 904-924)
**Issue:** El mapa `target_kind -> tabla` está derivado del probe TXN-07 de `transaction-service.ts:216-246`, que define la resolución para `transaction_links` (ahí `debt_balance` → `balances.id`, correcto). Pero el mismo mapa se aplica sin distinción a los tres hosts. Para el host `balances`, una fila con `target_kind='debt_balance'` genera la arista `balances.target_id -> balances.id` (self-join), y en ningún lugar del código está establecido que ese sea el referente real: `balance-service.ts:75` solo dice "row must already exist (caller responsibility)" y no existe hoy ningún writer que cree filas `debt_balance` en `balances`. Si el referente real fuera otro (o el propio id, volviendo el chequeo vacuo), la verificación daría un resultado engañoso. Hoy es indetectable: con un único tenant, cualquier join —correcto o no— da 0 mismatches. El día que exista tenant 2, un mapeo equivocado produce falsos positivos o, peor, mismatches reales no detectados.
**Fix:** Hacer el mapa por-host:

```ts
const TARGET_KIND_TABLES_BY_HOST: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  transaction_links: {
    subscription: "subscriptions",
    debt_balance: "balances",
    transaction: "financial_transactions",
    enrollment: "program_enrollments",
  },
  balances: {
    subscription:
      "subscriptions" /* debt_balance: referente sin definir — va a warnings */,
  },
  audit_log: {
    subscription: "subscriptions",
    transaction: "financial_transactions",
    member: "users",
  },
};
```

y dejar que `debt_balance` en el host `balances` caiga en la rama de "target_kind sin mapeo" (warning, no discrepancia) hasta que su semántica quede documentada.

### WR-02: Test 2 es tautológico — `gymOwnedChecked` es una constante que se devuelve a sí misma, no mide cobertura real

**File:** `el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts:114-116` y `el-templo-api/src/db/scripts/verify-tenant-backfill.ts:1165`
**Issue:** El test afirma "la verificacion cubre las 87 tablas gym-owned, no un subconjunto", pero `report.gymOwnedChecked` se asigna estáticamente como `GYM_OWNED_TABLES.length` (línea 1165), sin relación con lo efectivamente verificado. Si el paso B corre sobre menos tablas (el propio script lo contempla: `countableTables` puede ser menor, líneas 1091-1098, y solo emite un warning), `gymOwnedChecked` sigue reportando 87 y el Test 2 sigue verde. La cobertura real la garantiza indirectamente el Test 1 (`ddlMissing` vacío), pero el Test 2, tal como está nombrado y comentado, promete algo que su aserción no puede detectar. El doc del campo (`línea 107: "Cantidad de tablas gym-owned verificadas"`) tiene el mismo problema.
**Fix:** Exponer el conteo real en el reporte (p. ej. `rowIntegrityChecked: countableTables.length`) y asertar sobre ese:

```ts
expect(report.rowIntegrityChecked).toBe(87);
```

o, mínimo, renombrar el test/campo para que digan lo que de verdad afirman (que la lista declarada tiene 87 entradas — aserción que ya vive en `tenant-tables.test.ts:89`).

### WR-03: El path de enums lowercasea los valores de `target_kind` (y `literal()` asume escapes por backslash) — el gate puede quedar silenciosamente en verde bajo drift de collation/sql_mode

**File:** `el-templo-api/src/db/scripts/verify-tenant-backfill.ts:507` (lowercase de `COLUMN_TYPE`), `885-887` (extracción de valores del enum), `406-409` (`literal()`)
**Issue:** `loadColumns` guarda `COLUMN_TYPE` en lowercase; los valores de enum extraídos de ahí quedan lowercaseados, mientras que el path `distinct` (audit_log) preserva el case de los datos — asimetría entre los dos paths. Hoy todos los valores (`subscription`, `debt_balance`, etc.) son lowercase y las collations del repo son `_ci`, así que es benigno. Pero si un valor de enum futuro tiene mayúsculas y la columna usa collation `_bin` (o alguien la migra), el filtro `c.target_kind = 'valor-lowercaseado'` cuenta 0 filas y la arista queda verificada "sin mismatches" sin haber mirado ninguna fila — un falso verde en un gate de aislamiento. Adicional menor: `literal()` escapa `\` como `\\`, que bajo `sql_mode=NO_BACKSLASH_ESCAPES` produce un literal distinto al buscado.
**Fix:** No lowercasear `COLUMN_TYPE` al cargarlo (lowercasear solo en las comparaciones que lo necesiten, como `dataType`), de modo que los valores de enum conserven su case exacto:

```ts
columnType: toStringOrNull(row.COLUMN_TYPE) ?? "",
```

y comparar `col.dataType !== "int"` sobre `dataType` (que ya se lowercasea aparte). Para `literal()`, el doblado de comillas (`''`) alcanza — el escape de backslash puede quitarse o condicionarse.

## Info

### IN-01: El nombre de FK que Drizzle generaría difiere del `fk_<tabla>_tenant` real — drift adicional para cualquier `db:generate` futuro

**File:** `el-templo-api/src/db/schema/tenant-column.ts:56-61`
**Issue:** `.references(() => tenants.id)` registra en el metadata de Drizzle una FK con nombre autogenerado (`<tabla>_tenant_id_tenants_id_fk`), mientras que las migraciones crean `fk_<tabla>_tenant`. Con `db:generate` ya declarado roto esto no muerde hoy, pero suma 85 constraints al drift que cualquier intento de rehabilitar drizzle-kit va a tener que reconciliar (dropearía/crearía FKs "faltantes").
**Fix:** Documentarlo en el comentario del helper, o usar `foreignKey({ name: "fk_..." })` a nivel tabla si algún día se rehabilita drizzle-kit. Sin acción requerida en v6.0.

### IN-02: `.default(1)` deja `tenantId` opcional en TODOS los tipos de insert — cero enforcement de compilación de acá a la fase 169

**File:** `el-templo-api/src/db/schema/tenant-column.ts:59`
**Issue:** Decisión documentada y correcta para el rolling deploy, pero conviene dejarlo asentado como riesgo vivo: hasta que las fases 169 (helpers `tenantWhere`/`tenantValues`) y 170 (sentinel + lint) aterricen, ningún `db.insert(...)` del repo está obligado —ni por el tipo ni por la DB— a declarar tenant, y toda fila nueva cae silenciosamente en el tenant 1. Si el tenant 2 se creara antes de completar la adopción, esto es un vector directo de filas mal atribuidas. El gate del milestone ("tenant 2 solo con batería de aislamiento verde") es la única protección.
**Fix:** Ninguno en esta fase. Registrado para que las fases 169/170 lo cierren y para que la re-evaluación del DEFAULT prometida en el comentario no se pierda.

### IN-03: Warnings duplicados por host heterogéneo en el reporte del verificador

**File:** `el-templo-api/src/db/scripts/verify-tenant-backfill.ts:1113-1125`
**Issue:** El loop post-verificación emite el warning de "columna NULLABLE" por cada arista expandida; un host heterogéneo con N kinds mapeados repite N veces el mismo warning sobre la misma columna física (`target_id`). Ruido en el reporte, sin efecto sobre `discrepancies`.
**Fix:** Deduplicar por `${edge.child}.${edge.childColumn}` antes de pushear el warning.

---

_Reviewed: 2026-07-27T17:25:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
