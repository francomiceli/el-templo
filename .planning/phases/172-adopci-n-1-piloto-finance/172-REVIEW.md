---
phase: 172-adopci-n-1-piloto-finance
reviewed: 2026-07-31T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - el-templo-api/src/db/tenant-tables.ts
  - el-templo-api/src/modules/analytics/advanced-finance-service.ts
  - el-templo-api/src/modules/analytics/cohorts.ts
  - el-templo-api/src/modules/analytics/ltv-service.ts
  - el-templo-api/src/modules/analytics/routes.ts
  - el-templo-api/src/modules/analytics/service.ts
  - el-templo-api/src/modules/analytics/ticket-service.ts
  - el-templo-api/src/modules/auth/routes.ts
  - el-templo-api/src/modules/coach/routes.ts
  - el-templo-api/src/modules/coach/service.ts
  - el-templo-api/src/modules/finance/balance-service.ts
  - el-templo-api/src/modules/finance/cash-register-service.ts
  - el-templo-api/src/modules/finance/coach-load-routes.ts
  - el-templo-api/src/modules/finance/movement-service.ts
  - el-templo-api/src/modules/finance/routes.ts
  - el-templo-api/src/modules/finance/transaction-service.ts
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/programs/enrollment-service.ts
  - el-templo-api/src/modules/programs/routes.ts
  - el-templo-api/src/modules/reports/routes.ts
  - el-templo-api/src/modules/reports/service.ts
  - el-templo-api/src/modules/subscriptions/routes.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/scripts/backfill-historical-payments.ts
  - el-templo-api/src/scripts/snapshot-finance-endpoints.ts
  - el-templo-api/test/helpers.ts
  - el-templo-api/test/setup.ts
  - el-templo-api/test/fixtures/finance-gimnasio-dos.ts
  - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
  - el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts
  - el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts
  - el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts
  - el-templo-api/test/db/tenant-tables.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 172: Code Review Report

**Reviewed:** 2026-07-31
**Depth:** standard
**Files Reviewed:** 34 (26 src en detalle, 8 de infraestructura de test en detalle, ~50 tests endurecidos revisados por patrón sobre el diff)
**Status:** issues_found

## Summary

Revisión adversarial del diff completo `a6272df0..HEAD` en el worktree `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`). Se trazó cada foco pedido:

1. **Sesgo del sentinel (evalúa por QUERY):** confirmado leyendo `src/db/sentinel/analyze.ts` — la etapa 4 busca el literal `tenant_id` UNA vez en la zona de predicado del statement completo, no por tabla. Se auditaron todas las queries del diff que tocan más de una tabla strict: solo UNA (el guard de cobros vivos de `_cancelSubscription`) filtra una sola de las dos tablas strict presentes (WR-02). El resto (ticket-service `linkedCharges`, balance-service `getRowsForTransaction`, reports `buildDebtOriginTxSubquery`, `getChargeHistory`) nombra cada tabla strict del statement.
2. **tenantWhere en el lugar equivocado del AND / LEFT JOIN→INNER:** todos los LEFT JOIN del diff llevan el filtro de tenant en el ON, nunca en el WHERE (verificado en `getById`, `listPendingTray`, `listMovEgresos`, `getFinancialHistory`, `getOutstandingConcepts`, `listActiveCajasWithBalance`, `resolveCajaCountry`, `selectOutstandingRows` y las 3 queries de `getOutstandingBalances`). Los `or(...)` (p. ej. `resolveRenewCurrency`) están correctamente anidados como llamada, sin problema de precedencia.
3. **assertTenant con scope undefined:** los 8 archivos de rutas que llaman `assertTenant` montan `attachCountryScope` en un hook `onRequest` de plugin — verificado uno por uno. `programs/routes.ts` (el único sin hook) resuelve el scope per-ruta con `await attachCountryScope(request, fastify.db)` antes del `assertTenant` (el fix del plan 172-15). `auth/routes.ts` (ruta pública) deriva el ctx de la fila de `branches` con guard fail-closed, sin usar `request.scope`. No queda otra instancia del patrón de la regresión.
4. **catch/any/console:** sin `any` nuevos, sin `as any`, sin `@ts-ignore`. Los `console.*` nuevos están todos en los dos scripts CLI (permitido). Los `catch {}` pelados del snapshot script son fallbacks de parseo inmediatos y aceptables. Los `catch (err: unknown)` nuevos narrowean con `instanceof`.
5. **Batería ISO-03:** las aserciones muerden. Cada `describe` de ruta trae aislamiento + control positivo; la evidencia se lee de la BASE (`tenantDeLaFila`/`campoDeLaFila` sin filtro de tenant, con exención `tenant-safe` justificada — filtrar sería tautológico); hay 3 tests de precondiciones que impiden pasar "por la razón equivocada" (mismo país en ambas sedes, recurso ajeno vivo, siembra en el gimnasio correcto); los controles de saldo afirman el importe EXACTO (`IMPORTE_SEMBRADO`, no `> 0`); el gate de cobertura es bidireccional, con baseline numérico anti-vacuidad y fixtures sintéticos que prueban el motor (`sinComentarios`, `.skip` no cuenta). La "limitación conocida" del alta con recursos propios del gimnasio 2 está declarada con un test que se pone rojo cuando la fase 173 la resuelva — buen diseño.

Lo que queda son 2 warnings (una asimetría real en el autorregistro público y un statement con dos tablas strict filtrando una) y 3 info.

## Warnings

### WR-01: El autorregistro deriva el tenant de la sede para las finanzas, pero el INSERT del usuario cae en el DEFAULT 1 — camino mixto sin documentar

**File:** `el-templo-api/src/modules/auth/routes.ts:212-234` (INSERT) vs `:288` (ctx derivado)
**Issue:** La fase agregó a la ruta pública `POST /register` la derivación server-side del tenant desde la fila de `branches` (`branchTenantId`, con guard fail-closed) y la usa para `assignPlan(ctx, …)`. Pero el `fastify.db.insert(users).values({...})` seis líneas antes NO estampa `tenantId`, así que el usuario nace con el `DEFAULT 1` de la columna. Con una sede de un tenant ≠ 1: (a) el usuario queda **commiteado** en el tenant 1 apuntando por `branchId` a una sede del tenant 2 (fila cross-tenant persistente — el INSERT del user no participa de ninguna transacción con el promo), y (b) el `assignPlan` del promo corre con ctx del tenant 2, el `memberExists` de `TransactionService.create` no encuentra al socio (está en tenant 1) y el promo falla en silencio (graceful degradation, `:313-322`). A diferencia de la limitación análoga del alta de coach-load — que está ruidosamente documentada en `iso-03-finance-coach-load.test.ts:1326` con dueño (fase 173) — esta asimetría no está escrita en ningún lado, y el comentario nuevo de la ruta ("la sede dice de qué gimnasio es… es el precedente que copian los demás caminos sin JWT") afirma un contrato que el propio handler no cumple para la fila de `users`. Hoy es inerte (solo existe el tenant 1 en prod), pero es exactamente el tipo de deuda que la receta de adopción existe para inventariar.
**Fix:** Una de dos, y en ambos casos dejarlo escrito:

```ts
// Opción A (preferida, no viola D-07: la columna existe en users desde la fase 166
// y el valor ya está resuelto server-side tres líneas arriba):
const result = await fastify.db.insert(users).values({
  tenantId: branchTenantId,
  email,
  passwordHash,
  branchId,
  // ...
});
```

Opción B: dejar el INSERT como está y documentar la limitación con dueño (fase 173, adopción de members/users) en la receta de adopción (172-23) y el SUMMARY, igual que se hizo con el alta de coach-load.

### WR-02: Guard de cobros vivos de `_cancelSubscription` — dos tablas strict en el statement, una sola filtrada

**File:** `el-templo-api/src/modules/subscriptions/service.ts:2859-2891`
**Issue:** El guard `SUB_HAS_ACTIVE_TRANSACTIONS` hace `FROM transaction_links INNER JOIN financial_transactions` y solo `transaction_links` lleva `tenantWhere` (`:2878`); el ON del join (`:2866-2872`) une por PK sin filtro de tenant. Es transitivamente correcto HOY (el id de `financial_transactions` es PK global y los writes estampan el mismo tenant en link y transacción), pero: (1) contradice la convención que la MISMA fase aplica en los otros dos statements con dos tablas strict — `ticket-service.ts` `linkedCharges` ("DOS tenantWhere, uno por tabla strict presente en el statement", T-172-02-03) y `balance-service.ts` `getRowsForTransaction` ("las TRES tablas del statement son strict y las tres nombran el gimnasio") —; (2) el sentinel jamás lo va a cazar, porque evalúa por query y el `tenant_id` de `transaction_links` ya lo marca `ok`; y (3) los campos leídos de la tabla sin filtrar (`txId`, `amount`, `currency`) se serializan en el body del 409 (`:2898-2909`) — ante un link corrupto cross-tenant, ids e importes del otro gimnasio saldrían por el borde en el mensaje de error.
**Fix:**

```ts
.innerJoin(
  schema.financialTransactions,
  and(
    tenantWhere(schema.financialTransactions, ctx),
    eq(schema.transactionLinks.transactionId, schema.financialTransactions.id),
  ),
)
```

## Info

### IN-01: Comentario de `linkedCharges` sobreafirma lo que el sentinel exige

**File:** `el-templo-api/src/modules/analytics/ticket-service.ts:511-514` (comentario sobre el `.where`)
**Issue:** El comentario dice "el sentinel exige el literal `tenant_id` por CADA tabla migrada que aparece en la query". Es falso: `analyze.ts` (etapa 4) busca el literal UNA vez en la zona de predicado del statement — un solo `tenant_id` de cualquier tabla marca la query entera como `ok`. La práctica de filtrar cada tabla strict es correcta y deseable, pero atribuírsela al sentinel hace creer que el vigilante cazaría un join a medias como el de WR-02, y no lo haría.
**Fix:** Reescribir el comentario: el doble filtro es convención del módulo (defensa en profundidad), no un requisito que el sentinel verifique; el sentinel evalúa por statement.

### IN-02: Paginación del snapshot puede cortarse en silencio sin marcar `truncado`

**File:** `el-templo-api/src/scripts/snapshot-finance-endpoints.ts:419-420`
**Issue:** En el loop de paginación, una página intermedia con body bien formado pero sin `rows` como array (o con `rows` vacío mientras `filas.length < total`) hace `break` sin setear `truncado = true`. La captura queda incompleta pero el snapshot la declara completa, y el `--diff` posterior compararía contra una línea de base parcial sin que nadie lo sepa — justo el modo de falla que el flag `truncado` existe para delatar.
**Fix:** En ambos `break` del final del loop, si `filas.length < total`, setear `truncado = true` y loguear el warn (mismo trato que el tope de `MAX_PAGINAS`).

### IN-03: `getMemberSubscription` / `checkDuplicates` / `createMinimalMember` sin ctx en los handlers de coach-load — deuda de la fase 173, conviene nombrarla en la receta

**File:** `el-templo-api/src/modules/finance/coach-load-routes.ts:484` (`getMemberSubscription`), `:810` (`checkDuplicates`), `:820` (`createMinimalMember`)
**Issue:** Los handlers de la PoS resuelven ctx y lo pasan a todo lo strict, pero siguen llamando servicios de `subscriptions`/`members` sin tenant (fuera del boundary D-07 — correcto para esta fase). El resultado con un socio ajeno es fail-closed vía las barreras de finance aguas abajo (verificado: `resolveUserBranchId` cae al fallback propio y `TransactionService.create` corta con "Miembro no encontrado" — la batería lo afirma), pero el orden de cortes depende de esas barreras de otro módulo. Es el mismo patrón que la limitación documentada del alta; estos tres call sites merecen estar en el inventario de la fase 173 para que la migración de members/subscriptions no los saltee.
**Fix:** Nombrarlos en la receta de adopción (172-23) / SUMMARY como pendientes explícitos de la fase 173. Sin cambio de código en esta fase.

---

## Verificaciones sin hallazgo (evidencia del trabajo adversarial)

- **`TENANT_STRICT_MODULES`:** las 6 tablas coinciden con el gate de forma (`test/db/tenant-tables.test.ts`, `MODULOS_DECLARADOS` como segunda copia deliberada) y con el cruce D-15 contra `tenant-lint-allowlist.json` (test nuevo que no depende de correr el CLI).
- **Escrituras con defensa en profundidad:** todos los UPDATE sobre tablas strict llevan su propio `tenantWhere` además del SELECT previo (`_void`, `validate`, `observe`, `renameCostCenter`, `updateBankAccount`, `closeBankAccount`, `applyDelta`, colapso de deuda en `_cancelSubscription`).
- **Mass-assignment:** `tenantValues` estampa el tenant después del spread en todos los INSERT nuevos; la batería lo prueba con spoof de `tenantId` en el body (alta de cuenta banco, alta de caja).
- **Subqueries correlacionadas:** `b.tenant_id` / `ft.tenant_id` / `tl.tenant_id` presentes y PRIMERO en los 4 `EXISTS`/`NOT EXISTS` crudos tocados (`listMembers` debtorOnly, `getAttentionList` yaPago, `universeCountByCurrency`, `getTrialConversionReport`).
- **`inclusiveRangeConditions` vs `rangeConditions`:** los reemplazos conservan el borde exacto de cada sitio (cerrado `<=` en los 5 legacy de caja, semiabierto `<` en `realPaymentsByMember`) — sin cambio de números.
- **Scripts CLI:** `--tenant` obligatorio fail-closed (exit 2 antes de cualquier query) en el backfill; token del snapshot solo por env, salida 0600 fuera del repo, rango fijo con abort por rango distinto en `--diff`.
- **Test infra:** exención `tenant-safe` del `cleanAllTestData` embebida en el SQL y acotada al DELETE del loop; seeds de `setup.ts` con `tenant_id` explícito y sondas `NOT EXISTS` por gimnasio; fixture del gimnasio 2 con orden de limpieza justificado por FK real (`fk_cost_centers_tenant`).

---

_Reviewed: 2026-07-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
