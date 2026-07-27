---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
reviewed: 2026-07-27T01:40:55Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - el-templo-api/src/db/migrations/0190_tenants_core.sql
  - el-templo-api/src/db/migrations/0191_tenant_anchors.sql
  - el-templo-api/src/db/schema/branches.ts
  - el-templo-api/src/db/schema/index.ts
  - el-templo-api/src/db/schema/tenants.ts
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/modules/shared/country-scope.ts
  - el-templo-api/test/migrations/0190-0191-tenants.test.ts
  - el-templo-api/test/shared/tenant-scope.test.ts
  - el-templo-api/test/shared/tenant-suspension-routes.test.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Fase 166: Reporte de Code Review

**Reviewed:** 2026-07-27T01:40:55Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Se revisaron las dos migraciones fundacionales (0190/0191), los schemas Drizzle de `tenants`/anclas, el hook `attachScope` (resolución server-side de tenant + enforcement de suspensión) y los tres archivos de test. Nota: la revisión es advisory post-deploy — las migraciones ya están aplicadas y verificadas en staging y producción.

Lo central está bien construido: el enum `status` espeja byte a byte schema↔migración (Hard Rule 6), los comentarios SQL no contienen `;`, el tenant se resuelve exclusivamente de `users.tenant_id` (los tests hostiles de query/body/header/claim lo prueban), la comparación `!== 'active'` deniega por default estados futuros del enum, y los tests de introspección contra INFORMATION_SCHEMA cierran el agujero real del provisioning tolerante de `test/setup.ts`. Verifiqué contra `run-migrations.ts` y `test/helpers.ts` (contexto no listado pero necesario) antes de clasificar severidades.

No se encontraron issues críticos. Los tres warnings son: una ventana de carrera en el ciclo ADD→backfill→MODIFY de la 0191 durante rolling deploy (patrón que la fase 167 va a replicar sobre ~85 tablas — ahí sí importa arreglarlo), un leak de `FOREIGN_KEY_CHECKS=0` en el pool si falla el Test 8 de `tenant-scope.test.ts`, y la dependencia total del enforcement de suspensión en el registro por-módulo del hook sin verificación de inventario todavía.

## Warnings

### WR-01: Ventana de carrera en el ciclo ADD→backfill→MODIFY de la 0191 durante rolling deploy

**File:** `el-templo-api/src/db/migrations/0191_tenant_anchors.sql:42-63`
**Issue:** El pipeline de deploy corre `migrate` con el binario viejo todavía sirviendo tráfico. `ADD COLUMN tenant_id INT NULL` (pasos 1 y 6) no lleva DEFAULT, así que todo INSERT concurrente entre el backfill (pasos 2/7) y el `MODIFY ... NOT NULL DEFAULT 1` (pasos 3/8) produce una fila con `tenant_id = NULL`. Consecuencia según el sql_mode: en strict mode el MODIFY falla con "Invalid use of NULL value" y el runner aborta (deploy fallido → auto-rollback); en non-strict, MySQL coerce NULL→0, que no referencia a `tenants` — el paso 5/10 (ADD FOREIGN KEY) fallaría después contra esa fila. El riesgo real en `branches` es ~nulo (no hay inserts en runtime), pero `users` recibe inserts de registro y del webhook de Wellhub. Verifiqué que un re-run del runner se auto-cura (el "Duplicate column name" del paso 1 activa la heurística `alreadyApplied` y los UPDATE guardados por `IS NULL` re-backfillean), así que el daño máximo hoy es un deploy fallido con rollback, no corrupción permanente — por eso es Warning y no Blocker. **Pero la fase 167 replica este mismo ciclo sobre ~85 tablas con tráfico de escritura mucho mayor: ahí la ventana deja de ser teórica.**
**Fix:** Declarar el DEFAULT desde el ADD COLUMN, cerrando la ventana por completo (los inserts concurrentes resuelven a 1 desde el instante cero):

```sql
ALTER TABLE branches ADD COLUMN tenant_id INT NULL DEFAULT 1;
-- backfill igual, luego:
ALTER TABLE branches MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
```

Para 0190/0191 ya aplicadas no hay acción; adoptar este patrón como regla dura en los planes de la fase 167 (y sumarlo al skill `el-templo-db-migrations`).

### WR-02: Test 8 puede devolver una conexión al pool con FOREIGN_KEY_CHECKS=0

**File:** `el-templo-api/test/shared/tenant-scope.test.ts:238-244`
**Issue:** El test simula corrupción con `SET FOREIGN_KEY_CHECKS=0` → UPDATE → `SET FOREIGN_KEY_CHECKS=1` dentro de una transacción. `SET` es una variable de sesión, no transaccional: si el UPDATE lanza (deadlock, lock wait timeout — la DB es compartida por worker con `isolate: false`), Drizzle rollbackea y relanza, el tercer statement nunca corre y la conexión vuelve al pool con los FK checks apagados. Todos los tests siguientes del worker que caigan en esa conexión corren silenciosamente sin enforcement de FKs — exactamente la clase de flakiness cruzada entre archivos que el docblock del propio test se esfuerza en prevenir para `tenants.status`.
**Fix:**

```typescript
await app.db.transaction(async (tx) => {
  await tx.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
  try {
    await tx.execute(
      sql`UPDATE users SET tenant_id = ${orphanTenantId} WHERE id = ${staffId}`,
    );
  } finally {
    await tx.execute(sql`SET FOREIGN_KEY_CHECKS=1`);
  }
});
```

### WR-03: El enforcement de suspensión depende del registro por-módulo del hook, sin verificación de inventario

**File:** `el-templo-api/src/modules/shared/country-scope.ts:126-194`
**Issue:** El corte por `TENANT_SUSPENDED` vive dentro de `attachScope`, y el diseño cuenta con que los 22 call sites lo hereden vía el alias `attachCountryScope`. El corolario adversarial: **cualquier ruta autenticada cuyo módulo no registre el hook (hoy o en un módulo futuro) bypasea por completo la palanca comercial** — un tenant suspendido sigue operando esa superficie sin que nada lo detecte. `tenant-suspension-routes.test.ts` cubre 3 rutas de 2 módulos + login; las otras ~19 registraciones quedan sin verificación, y no existe test de inventario que enumere rutas autenticadas y afirme que todas pasan por el hook. Sé que el roadmap v6.0 tiene fases de "detección" y "backstop" que atacan esto — el warning es que entre hoy y esas fases el invariante CD-01 ("la suspensión alcanza TODA la superficie autenticada") es una afirmación no verificada, y módulos nuevos pueden nacer sin el hook sin que ningún test falle.
**Fix:** Adelantar un test de inventario barato: iterar `app.printRoutes()`/route table tras `createTestApp()`, filtrar las rutas con `authenticate` en su cadena de hooks, y afirmar que cada una registra `attachScope`/`attachCountryScope` (o está en una allowlist explícita tipo `/api/auth/*`). Alternativa mínima: documentar en el módulo la lista de superficies exentas para que el backstop de la fase correspondiente tenga contra qué diffear.

## Info

### IN-01: El comentario de idempotencia de la 0191 sobreafirma ("replay manual es un no-op de 0 filas")

**File:** `el-templo-api/src/db/migrations/0191_tenant_anchors.sql:33-35`
**Issue:** La afirmación es cierta solo para los dos UPDATE (guardados por `IS NULL`). Los 8 ALTER no son no-ops en un replay manual fuera del runner: el primero muere con "Duplicate column name" y un cliente mysql típico aborta ahí — el operador que confíe en el comentario se encuentra con un error, no con un no-op. (Dentro del runner sí se tolera vía la heurística de duplicados.)
**Fix:** Precisar el comentario: "los UPDATE son no-ops; los ALTER fallan con Duplicate en un replay manual (inocuo pero ruidoso)".

### IN-02: Igualdad laxa `== null` en el chequeo de tenantStatus

**File:** `el-templo-api/src/modules/shared/country-scope.ts:169`
**Issue:** `row.tenantStatus == null` usa igualdad laxa. El tipo Drizzle del LEFT JOIN es `... | null` (nunca `undefined`), así que `=== null` es suficiente y más alineado con "explicit over clever" del CLAUDE.md. Sin impacto funcional.
**Fix:** `if (row.tenantStatus === null) {`.

### IN-03: Test 3 afirma COUNT(\*)=1 sobre una tabla que ninguna limpieza toca

**File:** `el-templo-api/test/migrations/0190-0191-tenants.test.ts:256-258`
**Issue:** `tenants` no está en `TABLES_TO_CLEAN` (correcto — preserva el seed), pero eso significa que cualquier suite futura del mismo worker que inserte un tenant de prueba y no lo borre rompe este assert de forma no local (el fallo aparece acá, no en la suite culpable). Fragilidad latente de cara a las fases 167+ que van a manipular tenants en tests.
**Fix:** Afirmar sobre la fila id=1 (ya se hace en las líneas siguientes) y relajar el conteo a `>= 1`, o documentar el contrato "ningún test deja tenants extra" donde las fases siguientes lo vean.

### IN-04: El seed de la 0190 guarda solo por id=1, no por slug

**File:** `el-templo-api/src/db/migrations/0190_tenants_core.sql:51-55`
**Issue:** `WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1)` — si por cualquier camino existiera una fila con slug `el-templo` bajo otro id (restore parcial, seed manual), el INSERT fallaría por `tenants_slug_unique` en vez de ser no-op. Escenario teórico en una tabla recién creada; lo anoto porque el patrón se va a copiar en seeds futuros de tenants.
**Fix:** Guardar por ambas claves: `WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1 OR slug = 'el-templo')`.

### IN-05: El camino fail-closed de `tenantId = null` es fail-open en la práctica hasta que exista un consumidor

**File:** `el-templo-api/src/modules/shared/country-scope.ts:169-179`
**Issue:** Ante un tenant no resoluble, el hook loguea error, deja `tenantId = null` y el request **continúa con el scope de país completo** — hoy nada consume `scope.tenantId`, así que "default-deny aguas abajo" es una promesa para la fase 169, no un comportamiento actual: un usuario con tenant corrupto opera igual que siempre. Está documentado y es una decisión razonable (no convertir corrupción de datos en outage), pero el invariante "todo helper DEBE tratar null como deny" vive solo en un comentario.
**Fix:** Cuando nazca el primer helper de tenancy (fase 169), acompañarlo de un test que fije el contrato `tenantId === null → deny` para que el invariante deje de ser prosa.

---

_Reviewed: 2026-07-27T01:40:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
