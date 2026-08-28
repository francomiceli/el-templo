# Fase 2 — Diseño técnico: capa de datos tenant-safe

> **Estado:** ✅ VALIDADA con Nacho (2026-07-02). Decisiones: sentinel en prod = `log.error`
> + métrica (no throw); manifiesto de rutas fail-closed (ruta sin clasificar = test rojo).
> Refina la "capa 2" del enforcement decidido en [README §4.2](./README.md).
> **Cambio clave vs lo asentado:** el helper "`request.db` tenant-bound" NO es viable tal
> cual con la arquitectura actual — acá está el diseño que sí encaja, y por qué.

---

## 1. Lo que dice el código real (hallazgos verificados)

1. **Los services son singletons por-app, no por-request.** Se construyen una vez en el
   cuerpo del plugin (`src/modules/members/routes.ts:82-91`, `finance/routes.ts:78-120`,
   `analytics/routes.ts:71-88` con ~14 services) capturando `fastify.db` en el constructor.
   Hay hasta back-edges post-construcción (`transactionService.setSubscriptionCanceller(...)`,
   `finance/routes.ts:118`). Re-instanciarlos por-request sería un refactor invasivo y caro.
2. **El scope ya fluye por-método, no por-conexión.** Patrón existente:
   `country: request.scope.country ?? undefined` como argumento
   (`members/routes.ts:241`, `subscriptions/routes.ts:132`). El país nunca se "hornea" en el
   handle de DB.
3. **Ya existe el vocabulario de tipos para handles:** `TxHandle`
   (`finance/balance-service.ts:44`), `DbOrTx` + helper `runner(tx?)`
   (`programs/enrollment-service.ts:41-92`, patrón "Phase 111-02"). Las transacciones se
   propagan explícitamente (`_cancelSubscription(tx, ...)`, `auditLog.write(tx, ...)`).
4. **No hay capa repository/DAO** — los services usan Drizzle directo (334 `sql``` crudos,
   306 joins en el codebase). Nada intercepta queries hoy.
5. **Hooks por-módulo en orden fijo:** `authenticate` → guard de rol → `attachCountryScope`
   (`members/routes.ts:96-105` y análogos). `attachCountryScope(request, db)` recibe el db
   explícito y setea `request.scope` (`country-scope.ts:156`).
6. **Tests:** `app.inject()` in-memory, DB por-worker (`test/setup.ts` →
   `eltemplo_test_<POOL_ID>`), helpers `createStaffUser({role, branchId, country})` +
   `getAuthToken` (`test/helpers.ts`). No existe enumeración programática de rutas
   (sin `printRoutes`/Swagger) — la lista canónica es el bloque de registros de `src/app.ts:128-243`.

## 2. Por qué se descarta el `request.db` "mágico" (cierre de la discusión)

- Con services singleton, un db por-request no llega a los métodos sin (a) re-instanciar
  services por-request o (b) cambiar todas las firmas — ambos refactors masivos.
- Aunque llegara, un proxy de Drizzle **no puede ver dentro** de 334 `sql``` ni razonar
  aliases en 306 joins → cobertura parcial con apariencia de total = falsa seguridad.
- **Conclusión:** la seguridad no puede venir de re-escribir queries automáticamente.
  Viene de: patrón explícito de bajo costo + detección automática de olvidos + tests.

## 3. Diseño propuesto (capas revisadas)

### Capa 1 — `scope.tenantId` (sin cambios vs README §4.2)
Extender `CountryScope` → `{ tenantId, country, branchIds, isOwner, role, userBranchId }`.
`attachCountryScope` ya consulta `users` por request; se agrega `tenant_id` al select.
Renombrar conceptualmente a `attachScope` cuando toque ese archivo.

### Capa 2 (REVISADA) — patrón por-método + helpers ergonómicos
Seguir el patrón que el codebase ya habla (como `country` y como `tx`):

```ts
// src/modules/shared/tenant.ts (propuesto)
export type TenantId = number; // considerar brand type más adelante (mismo diferimiento que TxHandle)

/** Filtro estándar: tenantWhere(schema.members, scope) → eq(table.tenantId, scope.tenantId) */
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T, scope: { tenantId: TenantId },
) { return eq(table.tenantId, scope.tenantId); }

/** Valores de INSERT: siempre del scope server-side (regla de escritura, README §4.2) */
export function tenantValues<V>(scope: { tenantId: TenantId }, values: V) {
  return { ...values, tenantId: scope.tenantId };
}
```

- Los métodos de service reciben `scope` (o `tenantId`) como ya reciben `country`/`tx`.
  Sin re-instanciación, sin cambios estructurales; migración módulo por módulo.
- Convención: `and(tenantWhere(table, scope), ...resto)` como primer término de todo WHERE
  sobre tabla gym-owned. En `sql``` crudos: `WHERE tenant_id = ${scope.tenantId} AND ...`.

### Capa 3 (NUEVA, reemplaza con ventaja al "wrapper") — sentinel de SQL a nivel pool
El pool de `mysql2` (`plugins/database.ts:32-33`, ya decorado como `dbPool`) permite envolver
`pool.query/execute` — **por debajo de Drizzle**, así que ve el SQL final de TODO: query
builder, `sql``` crudo y joins. No re-escribe nada (eso sería frágil); **detecta**:

- Parsea trivialmente el SQL saliente: si menciona una tabla gym-owned (lista estática
  generada del schema) y NO contiene `tenant_id`, es una violación.
- **En test/dev: throw** (el test que ejecutó esa query falla con el SQL en el mensaje).
- **En prod: `log.error` + métrica** (no romper producción por un falso positivo).
- Exenciones explícitas anotadas: `sql`/* tenant-safe: <motivo> */...``` — el comentario
  viaja en el SQL y el sentinel lo respeta, quedando documentado y grepeable.

Esto convierte los 334 `sql``` de "imposibles de garantizar" a "vigilados en runtime por
cada test que los ejercite". Combinado con la cobertura de tests existente (~140 archivos),
la detección es temprana y barata.

### Capa 4 — lint estático en CI (sin cambios vs README §4.2)
Chequeo AST/grep sobre `sql``` y `.from(<tabla gym-owned>)` sin `tenant_id` ni anotación.
Atrapa en el PR lo que el sentinel atraparía en el test — dos momentos, mismo contrato.

### Capa 5 — tests de aislamiento con inventario auto-generado vía `onRoute`
Fastify expone el hook **`onRoute`**: un plugin test-only colecciona cada ruta registrada
en `buildApp()`. El test de aislamiento:

1. Colecciona todas las rutas → las cruza contra un **manifiesto versionado**
   (`test/tenant-manifest.ts`) que clasifica cada una: `tenant-scoped` / `global` /
   `templo-module`. **Ruta nueva sin clasificar = test rojo** (el backstop crece solo).
2. Siembra tenant 1 y tenant 2 (extender `createStaffUser`/fixtures con `tenantId`).
3. Ejecuta cada ruta `tenant-scoped` autenticado como staff del tenant A y verifica:
   respuesta sin datos de B (ids sembrados de B no aparecen) y escrituras sin filas B.
4. Encaja en la infra actual: `app.inject()` + DB por-worker ya soportan esto sin cambios.

## 4. Secuencia de implementación (cuando se apruebe)

1. Migración base: tabla `tenants` + seed Templo `id=1` + columnas + uniques (README §5).
2. Capa 1 (`scope.tenantId`) + helpers de capa 2 + sentinel de capa 3 (en modo warn).
3. Manifiesto inicial de rutas (capa 5) con TODO el estado actual clasificado.
4. Migrar módulos al patrón por orden de criticidad MVP: finance → members → subscriptions
   → scheduling → analytics (los módulos Templo-only quedan para su propia discusión).
   Al migrar un módulo: sentinel pasa a throw para sus tablas + tests de aislamiento verdes.
5. Recién entonces: onboarding tenant 2 (red de fondo, README §4.2).

## 5. Qué queda igual y qué cambia vs README §4.2

| Capa asentada en README | Estado tras evidencia |
|---|---|
| 1. `scope.tenantId` por-request | ✅ Igual |
| 2. `request.db` tenant-bound | 🔁 **Reemplazada** por patrón por-método + helpers (`tenantWhere`/`tenantValues`) — el codebase ya habla este idioma (`country`, `tx`) |
| 3. CI lint | ✅ Igual (ahora capa 4) |
| 4. Tests aislamiento auto-inventariados | ✅ Igual (ahora capa 5, mecanismo concreto: hook `onRoute` + manifiesto) |
| — | ➕ **Nueva capa 3: sentinel de SQL a nivel pool** — detección runtime que SÍ ve los 334 `sql``` (lo que el wrapper nunca podría) |

**Neto: el diseño quedó más fuerte, no más débil** — se cambió una pieza inviable por dos
piezas (patrón explícito + sentinel) que cubren más superficie con menos magia.

---

## Registro de cambios
- **2026-07-01** — Creación autónoma. Evidencia: exploración de instanciación de services,
  transacciones, hooks y tests. Pendiente: validación de Nacho del reemplazo de la capa 2.
