---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
reviewed: 2026-07-28T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - .github/workflows/ci.yml
  - el-templo-api/.env.example
  - el-templo-api/package.json
  - el-templo-api/src/db/index.ts
  - el-templo-api/src/db/scripts/lint-tenant.ts
  - el-templo-api/src/db/sentinel/analyze.ts
  - el-templo-api/src/db/sentinel/install.ts
  - el-templo-api/src/db/tenant-tables.ts
  - el-templo-api/src/plugins/database.ts
  - el-templo-api/tenant-lint-allowlist.json
  - el-templo-api/test/db/tenant-tables.test.ts
  - el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts
  - el-templo-api/test/tenancy/__fixtures__/lint/exenciones.ts
  - el-templo-api/test/tenancy/__fixtures__/lint/exento-por-archivo.ts
  - el-templo-api/test/tenancy/__fixtures__/lint/tipos.ts
  - el-templo-api/test/tenancy/con-05-sentinel.test.ts
  - el-templo-api/test/tenancy/con-06-lint.test.ts
  - el-templo-api/test/unit/sentinel-analyze.test.ts
  - el-templo-api/test/unit/sentinel-install.test.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Fase 170: Code Review Report

**Reviewed:** 2026-07-28
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Se revisaron los dos vigilantes de la fase (sentinel de pool mysql2 + lint estático CON-06), su cableado en el plugin de base de datos, el step de CI, la allowlist baseline (423 entradas, validada: ordenada, sin duplicados, sin `\`) y las cuatro baterías de tests. La calidad general es alta: el sentinel maneja bien los tres canales de SQL (query/execute/getConnection), el dedup de conexiones reusadas, la matriz de severidad, el `.unref()` del timer y la exclusión de `params` del log; el lint es fail-closed en la allowlist, en los flags de la CLI y en la resolución de la base, y `git` se invoca sin shell con la ref validada contra inyección de flags.

**Pero el lint tiene un punto ciego vivo de la misma clase que el que el plan 08 cerró para los imports profundos** — alias locales de tablas de schema — y hay evidencia concreta en `campaigns/service.ts` de accesos sin scope a `users` y `branches` (las dos tablas ancla ya migradas en la fase 166) que hoy son invisibles al gate y que no están en el baseline. Como D-16 congela el baseline one-shot sin regenerador, arreglarlo DESPUÉS de mergear obliga a un re-baseline que es exactamente la puerta trasera que el diseño prohíbe. Por eso es Critical y no Warning: es ahora o es caro.

## Critical Issues

### CR-01: El lint es ciego a los alias locales de tablas de schema — accesos sin scope reales de `campaigns/service.ts` quedan fuera del gate y del baseline

**File:** `el-templo-api/src/db/scripts/lint-tenant.ts:732-751` (`tableOfExpression`), evidencia viva en `el-templo-api/src/modules/campaigns/service.ts:65-108`
**Issue:** `tableOfExpression` solo resuelve tres formas: `namespace.prop` (`schema.users`), identificadores ligados por **import** nombrado, y el primer argumento de una llamada (`alias(schema.users, "u")` inline). Un alias por variable local — patrón vivo en el repo — no resuelve nada:

```ts
// src/modules/campaigns/service.ts:65-69 (código real de origin/master)
const u = schema.users;
const s = schema.subscriptions;
const b = schema.bookings;
const unsub = schema.campaignUnsubscribes;
const br = schema.branches;
// ...
.from(u)                          // línea 106: lectura de `users` SIN tenant — invisible
.innerJoin(br, eq(br.id, u.branchId))  // `branches` SIN tenant — invisible (ver además WR-01)
// y los sql`NOT EXISTS (SELECT 1 FROM ${s} ...)` interpolan `s`/`b`/`unsub`:
// la interpolación tampoco resuelve, y el nombre no está en el texto literal.
```

Verificado contra la allowlist: `campaigns/service.ts` tiene entradas para `bookings`, `campaigns`, `campaign_events`, `campaign_sends` y `user_status_history` (accesos directos de otros métodos), pero **NO tiene entradas para `users`, `subscriptions`, `branches` ni `campaign_unsubscribes`** — o sea que estos accesos no entraron al baseline: el motor no los vio. Lo mismo aplica a los `alias(...)` guardados en variable (`transaction-service.ts:976,1099,1268,1469`, `exercise-adjustments/coach-service.ts:51-52`), aunque ahí los pares (file, table) están cubiertos por otros accesos directos del mismo archivo.

Consecuencias concretas:
1. Un acceso **NUEVO** sin `tenant_id` escrito con este patrón no pone el build en rojo — contradice el contrato escrito del step de CI ("Un acceso nuevo a una tabla gym-owned sin tenant_id ... deja el build ROJO") y es, textual del propio archivo, "el único error que este lint no puede permitirse".
2. La aserción de paridad de `con-06-lint.test.ts:357-361` (≥87 tablas con deuda) da falsa tranquilidad: la paridad es por **tabla** global, pero la clave del ratchet es el **par (archivo, tabla)**, y esos pares faltan.
3. Es exactamente la clase de agujero que el plan 08 clasificó como grave y re-baselineó ("no aparecían como violación, no entraban a la allowlist, y un acceso NUEVO ... no ponía el build en rojo").

**Fix:** En `collectSchemaBindings` (o en un pase previo por archivo), resolver también los alias locales de una asignación simple, con la misma filosofía sintáctica del resto del motor:

```ts
// dentro del recorrido del archivo, además de los imports:
// const u = schema.users;   |   const origin = alias(schema.users, "o");
if (
  ts.isVariableDeclaration(node) &&
  ts.isIdentifier(node.name) &&
  node.initializer
) {
  const table = tableOfExpression(node.initializer); // ya resuelve schema.X y alias(schema.X, ...)
  if (table) localAliases.set(node.name.text, table);
}
// y en tableOfExpression, como último caso para identificadores:
if (ts.isIdentifier(expression))
  return bindings.named.get(expression.text) ?? localAliases.get(expression.text);
```

Esto va a destapar violaciones nuevas (al menos los 4 pares de `campaigns/service.ts`); hay que **re-baselinear la allowlist EN ESTA FASE** (mismo procedimiento del plan 08, documentado en `generated`), antes de que el one-shot de D-16 quede congelado en master. Hacerlo después convierte el fix en la puerta trasera que D-16 prohíbe.

## Warnings

### WR-01: `TABLE_METHODS` no incluye los métodos de join — la tabla joineada nunca entra al par (archivo, tabla) del ratchet

**File:** `el-templo-api/src/db/scripts/lint-tenant.ts:478` (`const TABLE_METHODS = new Set(["from", "insert", "update", "delete"])`)
**Issue:** `.innerJoin(schema.users, ...)`, `.leftJoin(...)` y `.rightJoin(...)` (397 usos en `src/`) no se registran como acceso. Cuando el `from()` es sobre una tabla gym-owned el statement igual se marca violación **para la tabla del from**, así que el rojo sale — pero la tabla joineada no genera su propio par: un join nuevo sin scope a OTRA tabla gym-owned, en un archivo cuyo par del from ya está en la allowlist, crece deuda en silencio (la clave del ratchet es por par, no por statement). Y cuando el `from()` no resuelve (alias local, CR-01) o es sobre tabla exenta, el join queda 100 % invisible — `campaigns/service.ts:107` (`innerJoin(br, ...)` sobre `branches`) es el caso vivo.
**Fix:** Agregar `"innerJoin"`, `"leftJoin"`, `"rightJoin"`, `"fullJoin"` a `TABLE_METHODS`. Igual que CR-01, esto suma pares al inventario: re-baselinear junto con CR-01 en el mismo movimiento.

### WR-02: El recorte de la proyección solo corre si el statement empieza con `select` — un `WITH ... SELECT` reabre el trap de T-170-01

**File:** `el-templo-api/src/db/sentinel/analyze.ts:135-137, 234-238`
**Issue:** `STARTS_WITH_SELECT = /^\s*select\b/i` no matchea un statement que arranca con `with` (CTE). Para `with x as (select ...) select \`id\`, \`tenant_id\`, ... from \`users\``, el predicado queda igual al texto completo, la proyección expandida de Drizzle contiene `tenant_id`, y el scan sin filtro — la fuga que todo el diseño de la etapa 4 vino a atrapar — pasa como `ok`. Hoy no hay ningún `.with(`/`$with(` en `src/` (verificado por grep), así que es latente, pero Drizzle soporta CTEs en MySQL y nada avisa el día que aparezca el primero. El mismo agujero, en menor medida, existe con un subselect en la proyección (`select (select ... from b where tenant_id=?) from users`): el primer `from` es el interno y el `tenant_id` del subselect blanquea el scan externo.
**Fix:** Extender el disparador del recorte:

```ts
const STARTS_WITH_SELECT = /^\s*(?:select|with)\b/i;
```

(para el CTE, cortar desde el primer `from` sigue dejando el `tenant_id` de cualquier `where` interno dentro del predicado, así que no genera falsos positivos nuevos). Sumar un `it` en `sentinel-analyze.test.ts` con un `WITH` que expanda `tenant_id` en la proyección.

### WR-03: `github.event.before` irresoluble tras un force-push deja el step de CI en exit 2 (rojo por error interno, no por deuda)

**File:** `.github/workflows/ci.yml:63-70` + `el-templo-api/src/db/scripts/lint-tenant.ts:1459-1471` (`resolveBaseRef`)
**Issue:** En eventos `push`, `LINT_BASE` es `github.event.before`. Tras un **force-push** (operación rutinaria en ramas de feature de este repo), ese SHA es el tip viejo descartado, que puede no existir en el clon (`fetch-depth: 0` trae refs alcanzables, no commits colgantes) → `rev-parse --verify` falla → exit 2 con el hint de `fetch-depth: 0`, que en ese caso es un diagnóstico equivocado: el fetch-depth ya está en 0 y el operador va a perseguir el hint incorrecto. El caso es moralmente idéntico al `NULL_SHA` que el script ya normaliza ("la rama no tenía un estado anterior utilizable"). Nota adicional: en pushes de rama la base es el tip anterior de la MISMA rama, o sea que una entrada ganada solo da rojo en el push que la introduce; los pushes siguientes de esa rama quedan verdes — el ratchet se sostiene porque el push a master/staging y los PR sí comparan contra la base correcta, pero conviene saberlo.
**Fix:** En `resolveBaseRef`, cuando la ref vino del evento y no resuelve, caer al mismo fallback del SHA nulo (`git merge-base origin/master HEAD`) con una advertencia ruidosa en vez de exit 2 — para un force-push de rama el merge-base es incluso una base MÁS estricta que el tip viejo. Alternativa mínima: agregar al mensaje de error la causa "force-push" para que el hint no despiste. (No usar merge-base como base por defecto en TODOS los push: en un push a master, `origin/master` ya es HEAD y el gate quedaría decorativo — `event.before` es el que sostiene el ratchet ahí.)

### WR-04: `isCompliantText` matchea `tenant_id` por substring sobre el texto del statement, incluidos sus comentarios internos

**File:** `el-templo-api/src/db/scripts/lint-tenant.ts:489-511`
**Issue:** Dos canales de falso cumplimiento que van más allá de la limitación documentada ("presencia ≠ corrección"):
1. `statement.getText()` incluye los comentarios interiores al span del statement. Un `// TODO: falta filtrar por tenant_id` en el medio de un encadenado multi-línea marca el acceso como `compliant` y lo saca del ratchet en silencio — un comentario que documenta la deuda la borra del radar. Es la misma clase de error prosa-vs-código que el hallazgo 169-09 (y que este mismo archivo evita con esmero para las exenciones).
2. `includes("tenant_id")` sin word boundary: un identificador como `idx_bookings_tenant_idx` o `by_tenant_id_desc` cuenta.
**Fix:** Antes de buscar los marcadores, reconstruir el texto del statement sin comentarios (recorrer los hijos con `getText()` de tokens, o un strip de `/* */` y `//` sobre el span), y buscar `tenant_id` con `/\btenant_id\b/`. Sumar al fixture `exenciones.ts` un caso "comentario interno que menciona tenant_id" con veredicto `viola`.

## Info

### IN-01: `installSentinel` no es idempotente sobre el pool

**File:** `el-templo-api/src/db/sentinel/install.ts:526-539`
**Issue:** Las conexiones llevan la marca `SENTINEL_MARK`, pero el pool no: una segunda llamada a `installSentinel` sobre el mismo pool apila wrappers en `query`/`execute`/`getConnection` — cada statement se inspeccionaría y contaría N veces, y en modo throw lanzaría desde el wrapper exterior. Hoy solo lo llama el plugin (una vez) y cada test crea su pool, así que es latente.
**Fix:** Mismo patrón que las conexiones: marcar el pool con un símbolo y devolver el handle existente (o lanzar) si ya está instalado.

### IN-02: `SENTINEL_INVENTORY=1` en prod desactiva el tope de fingerprints sin ningún gate de entorno

**File:** `el-templo-api/src/db/sentinel/install.ts:302,306-308` + `el-templo-api/.env.example:86-95`
**Issue:** El modo inventario está pensado para la corrida de la suite, pero la env var se honra en cualquier entorno. Con `SENTINEL_INVENTORY=1` en un proceso pm2 de semanas, `maxFingerprints = Infinity` reabre exactamente el crecimiento sin techo del mapa que `MAX_TRACKED_FINGERPRINTS` existe para acotar (un `sql.raw` con valor interpolado = un fingerprint nuevo por ejecución), y además emite un `log.error` por cada statement nuevo (→ Sentry, T-170-13). El `.env.example` dice "apagado no cambia ningún comportamiento" pero no advierte el costo de dejarla PRENDIDA en prod.
**Fix:** Ignorar la variable (o loguear un warning y no aplicarla) cuando `mode === "log"`, o documentar en `.env.example` que es solo para corridas de test.

### IN-03: `db.execute("string")`, templates sin tag y `sql.raw(...)` quedan fuera del alcance estático

**File:** `el-templo-api/src/db/scripts/lint-tenant.ts:805-859`
**Issue:** El motor solo ve templates **taggeados** con `sql` y los métodos de `TABLE_METHODS`. Un `db.execute("delete from bookings")` con string pelado, o un nombre de tabla que entra por `sql.raw(...)`, son invisibles estáticamente. Hoy los usos de `sql.raw` del repo son fragmentos seguros (predicados/enteros validados, `analytics/`, `reports/`) y los `execute("...")` con string tocan solo `_migrations`/DDL de seeds, así que no hay caso vivo — y el sentinel cubre el runtime. Pero el docblock afirma "las dos formas que existen en este repo" sin dejar escrita esta tercera frontera.
**Fix:** Documentar la limitación en el docblock del motor (junto a la de presencia ≠ corrección), para que la primera persona que escriba un `execute("delete from ...")` no asuma cobertura.

### IN-04: Tests de `con-05-sentinel.test.ts` con estado compartido dependen del orden de ejecución

**File:** `el-templo-api/test/tenancy/con-05-sentinel.test.ts:403-428`
**Issue:** El `it` de `report()` ("modo inventario: report() incluye la tabla no strict") afirma que el reporte contiene `bookings`, que solo está en los contadores porque el `it` ANTERIOR ejecutó la query violadora sobre `bookings` con el mismo handle compartido. Con `.only`, `--shuffle` o un skip del test previo, este se pone rojo por acoplamiento y no por regresión.
**Fix:** Ejecutar la query violadora dentro del propio `it` del reporte (los contadores acumulan; la aserción no necesita exclusividad), o al menos dejar el acoplamiento comentado.

---

_Reviewed: 2026-07-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
