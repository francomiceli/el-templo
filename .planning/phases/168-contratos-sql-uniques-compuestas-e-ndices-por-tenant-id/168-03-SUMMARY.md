---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
plan: 03
subsystem: database
tags:
  [
    mysql,
    drizzle,
    multi-tenancy,
    unique-constraints,
    indexes,
    verification,
    fail-closed,
  ]

# Dependency graph
requires:
  - phase: 167-columnas-tenant-id
    provides: "src/db/tenant-tables.ts con GYM_OWNED_TABLES (87) + TENANT_EXEMPT_TABLES (4), y el analog verify-tenant-backfill.ts con su contrato QueryFn"
  - plan: 168-01
    provides: "migración 0196 aplicada a la base local con los 11 contratos compuestos"
  - plan: 168-02
    provides: "schema Drizzle alineado con la 0196 y los 11 comentarios M8 que nombran TENANT_GLOBAL_UNIQUES por adelantado"
provides:
  - "TENANT_GLOBAL_UNIQUES (11 M8) + TENANT_UNIQUE_ALLOWLIST (37) + PLATFORM_PHYSICAL_TABLES en src/db/tenant-tables.ts, con motivo escrito por entrada"
  - "Helpers isTenantGlobalUnique / isAllowedGlobalUnique / tenantUniqueMotive / isPlatformPhysicalTable"
  - "src/db/scripts/verify-tenant-uniques.ts: verificador fail-closed de solo lectura, CLI + suite, exit 0/1/2"
  - "Script pnpm db:verify-uniques"
  - "12º contrato de unicidad: subscription_plans (tenant_id, name, country), agregado a la 0196"
  - "Base local eltemplo con discrepancies 0 y exit 0"
affects:
  - "168-04 (los tests de introspección consumen verifyTenantUniques y los dos registros)"
  - "168-06 (el mismo verificador corre contra eltemplo_staging y eltemplo, y la 0196 que despliega ya trae 12 contratos)"
  - "170 (el sentinel de pool reutiliza isGymOwnedTable y los registros de uniques)"
  - "171 (el manifiesto de rutas reutiliza la misma clasificación)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registro Record<clave, motivo> en vez de array as const cuando el motivo es obligatorio por entrada (D-13)"
    - "Verificador hermano que IMPORTA el QueryFn del verificador de la fase anterior en vez de redeclararlo"
    - "Tablas efímeras (backups de migración) detectadas por patrón de nombre y reportadas como warning, nunca como discrepancia"

key-files:
  created:
    - el-templo-api/src/db/scripts/verify-tenant-uniques.ts
  modified:
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/package.json
    - el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql
    - el-templo-api/src/db/schema/subscription-plans.ts

key-decisions:
  - "El gate encontró un 12º contrato que D-01 no listaba: subscription_plans (name, country). Franco eligió la opción A el 2026-07-27 — convertirlo DENTRO de la 0196, no en una 0197 aparte, porque staging y prod están en 0195 y nunca vieron ese archivo"
  - "La causa raíz del 12º es drift schema↔DB: el índice existe en MySQL desde la migración 0091 y nunca se declaró en Drizzle, así que el inventario del doc 05 —armado leyendo los schema files— anotó 'name NO es unique'. Se corrigió el drift en el mismo commit"
  - "M8 queda cerrada en 11: financial_transactions.idempotency_key es un token random con lookup pre-scope (mismo racional que la mitad de M8) pero entra en la ALLOWLIST, no en M8, porque esa lista se aprobó completa el 2026-07-26 y no se toca desde un plan de ejecución"
  - "Las claves de los dos registros son los nombres FÍSICOS de information_schema, no los que deduciría Drizzle: refresh_tokens declara .unique() inline pero la migración 0125 creó uq_refresh_tokens_token_hash"
  - "Las tablas de backup de migraciones NO entran en PLATFORM_PHYSICAL_TABLES: son efímeras y asimétricas entre bases, y versionarlas convertiría el archivo en un basurero. Van a warnings por patrón de nombre"

patterns-established:
  - "Todo motivo de allowlist nombra su FK concreta y su tabla padre, o su módulo Templo concreto: un motivo genérico copiado no permite auditar nada (mitigación T-168-11)"
  - "El verificador de una fase de contratos afirma lo que dejó de ser global (CONVERTED_CONTRACTS) además de clasificar lo que sigue global"

requirements-completed: []

# Metrics
duration: 45min
completed: 2026-07-27
---

# Phase 168 Plan 03: Registro canónico de uniques + gate fail-closed Summary

**El registro `tenant-tables.ts` pasó a clasificar uniques además de tablas (11 M8 + 37 allowlist, con motivo escrito y obligatorio por entrada), y el verificador de solo lectura `verify-tenant-uniques.ts` cerró la base local en `discrepancies: 0` — pero antes encontró un 12º contrato que la lista D-01 no tenía, `subscription_plans (name, country)`, invisible desde 2024 por drift schema↔DB.**

## Performance

- **Duration:** ~45 min (incluye una pausa de checkpoint por decisión de Franco)
- **Completed:** 2026-07-27
- **Tasks:** 3/3
- **Files modified:** 1 creado + 4 modificados

## Accomplishments

### Task 1 — El registro canónico de uniques (`758f2aa3`)

`src/db/tenant-tables.ts` creció **288 líneas y no perdió ninguna**: `GYM_OWNED_TABLES` (87), `TENANT_EXEMPT_TABLES` (4) e `isGymOwnedTable` quedaron byte a byte como los dejó la fase 167. El único cambio sobre lo existente fue ampliar la cabecera con la segunda responsabilidad que suma la 168.

- **`TENANT_GLOBAL_UNIQUES`** — las 11 uniques M8, `Record<"tabla.indice", motivo>` porque el motivo es obligatorio (D-13): un array no permitiría agregar una entrada sin justificarla. Dos racionales escritos entrada por entrada — id de plataforma externa (la unique global es la que impide que dos tenants reclamen el mismo recurso de Wellhub/Gympass) y secreto random con lookup pre-scope (componer por tenant sería circular: el tenant sale de la fila encontrada).
- **`TENANT_UNIQUE_ALLOWLIST`** — 37 entradas en tres categorías, distinguidas en el texto de cada motivo:
  - **26 derivadas de FK scopeada.** Cada motivo nombra la FK y la tabla padre concreta que la hace segura (`aura_balances.user_id → users`, `campaign_sends.campaign_id → campaigns`, `plan_programs.subscription_plan_id → subscription_plans`, …). Un "derivada de FK" genérico no habría permitido auditar nada — es la mitigación explícita de T-168-11.
  - **10 deuda consciente Templo-module.** SPOM (`routes`, `intensity_rules`, `contraction_rules`, `spom_rules`, `weekly_rotator`, `sessions.day_id` = mina M5), blog (`blog_posts.slug`, `blog_tags.slug`), Gladius (`gladius_products.slug`) y Aura (`aura_config.source_type`). Todos los motivos dicen explícitamente que se resuelven **solo** si un tenant distinto de 1 activa ese módulo y que **NO es un olvido de la fase 168**.
  - **1 token opaco random con lookup pre-scope** — `financial_transactions.uq_financial_tx_idempotency_key`. Categoría no prevista por el plan: ver Desviaciones.
- **`PLATFORM_PHYSICAL_TABLES`** — `_migrations` (tracking del runner propio) y `__drizzle_migrations` (residuo muerto del journal de drizzle-kit, que el repo no usa por Hard Rule 1). El JSDoc explica por qué las tablas de backup NO van ahí.
- **Helpers** en el estilo `Set`-based del archivo: `isTenantGlobalUnique`, `isAllowedGlobalUnique`, `tenantUniqueMotive`, `isPlatformPhysicalTable`. Todos aceptan `string`, igual que `isGymOwnedTable`, porque los consumidores clasifican nombres que salen de `information_schema`.

**Los 11 nombres de índice M8 se leyeron de `INFORMATION_SCHEMA`, no se dedujeron del schema** — y ahí apareció un caso que lo justifica: `refresh_tokens` declara `.unique()` inline (Drizzle lo llamaría `refresh_tokens_token_hash_unique`) pero la migración 0125 lo creó como **`uq_refresh_tokens_token_hash`**. El nombre físico manda, y queda dicho en el motivo de esa entrada. Los 11 se verificaron uno por uno contra `INFORMATION_SCHEMA.STATISTICS` con `NON_UNIQUE = 0`: 11/11 presentes.

Validaciones: `npx tsc --noEmit` en 0, 87 gym-owned y 4 exentas sin cambios, 0 motivos vacíos / `TODO` / `pendiente`, **0 motivos duplicados byte a byte** entre las 48 entradas.

### Task 2 — El verificador y el script (`44618ca2`)

`src/db/scripts/verify-tenant-uniques.ts`, hermano de `verify-tenant-backfill.ts`. **Importa** su `QueryFn` en vez de redeclararlo, así que el adaptador `makeQueryFn` de la suite sirve para los dos sin divergir.

Cinco categorías de hallazgo, todas fail-closed y todas sumando a `discrepancies`:

| Campo                        | Qué afirma                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `uniquesMissingTenantPrefix` | D-14: unique de tabla gym-owned sin `tenant_id` en `SEQ_IN_INDEX = 1` y sin clasificar |
| `tablesWithoutTenantIndex`   | CON-02 / D-11a: gym-owned sin ningún índice de prefijo `tenant_id` (los de FK cuentan) |
| `unclassifiedTables`         | D-11b: tabla física fuera de las tres listas                                           |
| `staleClassifications`       | entrada de registro que apunta a un índice inexistente (typo, rename, índice borrado)  |
| `missingConvertedContracts`  | CON-01 estructural: los contratos de la 0196, con su orden de columnas exacto          |

Mitigaciones implementadas y verificadas:

- **Solo `SELECT`** (T-168-12): grep de SQL de escritura fuera de comentarios da 0. Es seguro correrlo contra producción.
- **`SELECT DATABASE()` como primer statement** y la base como primera línea de `formatReport` (T-168-13): staging y prod son dos bases del MISMO host.
- **`PRIMARY` excluido en la propia query** — `INFORMATION_SCHEMA` lo devuelve con `NON_UNIQUE = 0` y colarlo haría que TODA tabla apareciera con una "unique global" sobre su `id`.
- **Tablas de backup a `warnings`, no a discrepancias** (T-168-14): se detectan por patrón `_backup(_\d+)?$`. En la base local aparecen `users_lead_backup_0170` y `users_lead_backup_0183`.
- `NON_UNIQUE` casteado siempre con `Number(...)`, y las dos consultas de introspección filtran por `TABLE_SCHEMA = DATABASE()` sin ningún nombre de base hardcodeado.

`formatReport` imprime cada hallazgo con qué hacer: para una unique sin clasificar dice qué columna quedó primera, cuál sería la compuesta y que la alternativa es clasificarla con motivo. Los mensajes accionables son la convención del repo.

`package.json` sumó **exactamente una línea**: `"db:verify-uniques": "tsx src/db/scripts/verify-tenant-uniques.ts"`, junto a `db:verify-tenant`. Cero cambios en `dependencies` / `devDependencies`, cero instalaciones (T-168-SC).

### Task 3 — Cierre contra la base real, y el 12º contrato (`ba37a148`)

La primera corrida contra `eltemplo` local dio **1 discrepancia**, no 0:

```
subscription_plans.ux_subscription_plans_name_country (name, country) — la primera columna es `name`.
```

`subscription_plans` es una tabla **CORE gym-owned**, no un módulo Templo, y su primer campo es `name`, no una FK: no hay transitividad ni deuda diferible. Un segundo gimnasio en AR que quisiera vender un plan llamado "Flex", "Foundation" o "Clase unica" —los nombres que hoy tiene El Templo entre sus 31 planes— recibiría un duplicate-key. Es un bloqueo real del alta del tenant 2.

**Por qué D-01 no la listaba.** El índice lo creó `0091_multi_currency_and_country_scope.sql:52` y **nunca se declaró en `src/db/schema/subscription-plans.ts`**. El inventario del doc 05 se armó leyendo los schema files, así que su línea 80 afirma literalmente `— (name NO es unique)` para esta tabla. Drift schema↔DB silencioso desde 2024. La migración `0179_especial_pass_core.sql:43` además ya se apoyaba en ese índice para su `INSERT IGNORE`, así que estaba en uso.

Siguiendo el Task 3 del plan, **no se allowlisteó**: se dejó el gate en rojo y se escaló como checkpoint. **Franco eligió la opción A el 2026-07-27**: convertirla dentro de la misma 0196.

Lo que se hizo con la decisión:

- **`0196_tenant_unique_contracts.sql`** — décimo `ALTER TABLE`, con `DROP INDEX` + `ADD UNIQUE INDEX` en el mismo statement (D-08). Antes de aplicarlo se descartó el errno 150 por introspección de `KEY_COLUMN_USAGE`: las 3 FKs entrantes (`plan_programs`, `subscriptions`, `users.purchased_plan_id`) referencian `id`, ninguna dependía del índice dropeado. **No hizo falta el orden ADD-primero.** La cabecera-narrativa pasó a 12 contratos y ganó una sección entera que explica de dónde salió el doceavo y por qué nadie lo había visto.
- **`subscription-plans.ts`** — el `mysqlTable` pasó de 2 a 3 argumentos (mismo movimiento que hizo el plan 02 en `promo_plans` y `notification_templates`) y declara `uq_subscription_plans_tenant_name_country`. **El drift queda cerrado**: Drizzle ya no tiene una unique fantasma.
- **`verify-tenant-uniques.ts`** — el contrato entra en `CONVERTED_CONTRACTS` y el JSDoc registra la procedencia del doceavo.
- **Aplicado a mano SOLO en la base local.** La 0196 ya figura en `_migrations` local, así que el runner la saltea: se corrió el `ALTER` suelto. Staging y prod están en 0195 y **nunca vieron la 0196** — para ellos el archivo editado es indistinguible de uno nuevo, y su rollout es del plan 168-06.

**Hallazgo lateral de InnoDB (registrado para el 168-06):** al crear la unique compuesta, InnoDB **dropeó solo** el índice auto-creado `fk_subscription_plans_tenant`, porque la unique nueva arranca con `tenant_id` y ya sirve a la FK. La FK sigue viva (verificado por `KEY_COLUMN_USAGE`) y `tablesWithoutTenantIndex` da 0, así que **CON-02 se mantiene**. Es esperable que pase lo mismo en staging y prod.

Corrida final contra `eltemplo` local:

```
Tablas gym-owned verificadas:   87
Uniques gym-owned evaluadas:    60
uniquesMissingTenantPrefix: 0
tablesWithoutTenantIndex:   0
unclassifiedTables:         0
staleClassifications:       0
missingConvertedContracts:  0
DISCREPANCIAS: 0            EXIT=0
```

**Conteo final de la allowlist por categoría:** 26 derivadas de FK scopeada + 10 deuda consciente Templo-module + 1 token opaco random = **37**. Más las 11 M8 = 48 uniques clasificadas sobre las 60 evaluadas; las 12 restantes son los contratos convertidos, que arrancan con `tenant_id` y no necesitan clasificación.

**Warnings emitidos (insumo del plan 168-06):**

1. `users_lead_backup_0170` y `users_lead_backup_0183` como tablas de backup. En prod se espera al menos `users_lead_backup_0183`; en staging y en la base de test probablemente ninguna. **No suman a discrepancias por diseño.**
2. `Uniques M8 encontradas y correctamente clasificadas como globales: 11 de 11`, seguido del detalle de las once con su motivo. Si en staging o prod ese número no diera 11, significa que un índice M8 tiene otro nombre en esa base y hay que mirarlo antes de seguir.

## Task Commits

| Task | Nombre                                  | Commit     | Archivos                                                                                              |
| ---- | --------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Registro canónico de uniques con motivo | `758f2aa3` | `src/db/tenant-tables.ts` (+288 / −0)                                                                 |
| 2    | Verificador fail-closed + script        | `44618ca2` | `src/db/scripts/verify-tenant-uniques.ts` (nuevo), `package.json` (+1 línea)                          |
| 3    | 12º contrato: `subscription_plans`      | `ba37a148` | `0196_tenant_unique_contracts.sql`, `src/db/schema/subscription-plans.ts`, `verify-tenant-uniques.ts` |

Los tres commits viven en el worktree `/home/franco/projects/et-168-contratos`, rama `feat/168-contratos-sql`, sobre `5d5c0bc7`. **Nada fue pusheado.**

## Deviations from Plan

### Escalado a decisión de Franco (no auto-resuelto)

**1. [Rule 4 - Arquitectural] El gate encontró un 12º contrato fuera de la lista D-01**

- **Found during:** Task 3, primera corrida del verificador
- **Issue:** `subscription_plans.ux_subscription_plans_name_country` es una unique global de tabla gym-owned que un segundo gimnasio colisionaría de verdad. No es segura por transitividad ni es deuda Templo-module, así que el Task 3 prohibía explícitamente allowlistearla (T-168-11, "allowlist usada como alfombra"). Cambiar la lista D-01 aprobada es decisión de Franco, no del executor.
- **Fix:** se detuvo la ejecución con un checkpoint de decisión, presentando tres opciones con sus tradeoffs. Franco eligió **A** (convertir dentro de la 0196). Implementado en `ba37a148`.
- **Files modified:** `0196_tenant_unique_contracts.sql`, `src/db/schema/subscription-plans.ts`, `src/db/scripts/verify-tenant-uniques.ts`
- **Commit:** `ba37a148`

### Auto-fixed / decisiones de redacción

**2. [Rule 2 - Correctness] La allowlist necesitó una TERCERA categoría que el plan no anticipaba**

- **Found during:** Task 1
- **Issue:** el plan definía dos categorías (derivada de FK scopeada / deuda consciente Templo-module). `financial_transactions.uq_financial_tx_idempotency_key` no encaja en ninguna: su primer campo `idempotency_key` no es una FK, y `financial_transactions` no es un módulo Templo. Es un `crypto.randomUUID()` generado por el admin (fase 140, CARGA-02) cuyo re-read post `ER_DUP_ENTRY` (`findByIdempotencyKey`) lo busca por el valor pelado, sin scope — exactamente el racional de la segunda mitad de M8.
- **Fix:** se agregó la categoría **(c) token opaco random con lookup pre-scope**, documentada en el JSDoc de la allowlist. **No se agregó a M8**: esa lista se aprobó completa en once el 2026-07-26 y ampliarla es una decisión de diseño, no de ejecución.
- **Files modified:** `src/db/tenant-tables.ts`
- **Commit:** `758f2aa3`

**3. La allowlist quedó escrita completa en el Task 1, no incrementalmente en el Task 3**

El plan preveía llenarla en el Task 1 con lo enumerable desde los schema files y cerrarla empíricamente en el Task 3. Como los nombres de índice físicos hay que leerlos de `information_schema` de todos modos (el Task 1 lo exige para las M8), se usó la misma fuente para las 37 entradas. Resultado: el bucle de cierre del Task 3 convergió en una sola pasada, con `staleClassifications` en 0 —o sea, ninguna entrada de más— y una única discrepancia, que fue justamente el hallazgo real.

**4. El plan decía "Sin commit: el commit único de la fase lo arma el plan 168-06"**

Se commiteó igual, por task, como mandan el orquestador y el patrón de los planes 168-01 / 168-02. El Task 3 además toca la migración 0196 **y** el schema Drizzle: la Hard Rule 3 del skill de migraciones obliga a que viajen en el mismo commit, y así se hizo.

## Threat Model — resultado

| Threat ID | Resultado                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-168-10  | **Mitigada y probada en vivo.** `uniquesMissingTenantPrefix` es fail-closed y en su primera corrida atrapó exactamente el caso que la amenaza describe: una unique global que nadie había clasificado, que además llevaba dos años invisible por drift. |
| T-168-11  | Mitigada. Los 48 motivos son distintos byte a byte y cada uno nombra su FK concreta o su módulo Templo concreto. La única unique realmente colisionable NO se allowlisteó: se escaló como hallazgo, que es lo que la amenaza pedía.                     |
| T-168-12  | Mitigada. Grep de `INSERT/UPDATE/DELETE/ALTER/DROP/CREATE` fuera de comentarios sobre el verificador: 0 coincidencias. Solo `SELECT`, declarado en la cabecera.                                                                                         |
| T-168-13  | Mitigada. `SELECT DATABASE()` es el primer statement y `Base de datos: eltemplo` la primera línea del reporte. Las dos consultas de introspección filtran por `TABLE_SCHEMA = DATABASE()`, sin nombres hardcodeados.                                    |
| T-168-14  | Mitigada. `users_lead_backup_0170` y `users_lead_backup_0183` salieron como warning y no bloquearon el cierre. `unclassifiedTables` dio 0.                                                                                                              |
| T-168-SC  | Mitigada. Cero `pnpm install` / `npm install`. `mysql2`, `dotenv` y `tsx` ya estaban por el analog de la 167 y `node_modules` sigue siendo el symlink al worktree 167.                                                                                  |

## Known Stubs

Ninguno. Lo único pendiente es alcance explícito de los planes siguientes: los tests de introspección (168-04), el schema/allowlist de las fases de módulo, y el rollout a `eltemplo_staging` y `eltemplo` (168-06).

## Threat Flags

Ninguna superficie de red, auth o acceso a archivos nueva: el plan agrega un script de solo lectura y metadata de clasificación.

## Notas para el plan siguiente (168-04 / 168-06)

- **La 0196 tiene ahora 10 `ALTER TABLE` y 12 contratos**, no 9 y 11. Todo test o assert que cuente contratos convertidos tiene que decir 12.
- El verificador expone `verifyTenantUniques(query: QueryFn)` y `formatReport(report)` — el test de la 168-04 lo invoca con el `makeQueryFn(app)` que ya existe en `test/migrations/0192-0195-tenant-columns.test.ts`.
- **Qué esperar en staging y prod (168-06):** `discrepancies` 0 y el warning de M8 en 11/11. El warning de tablas de backup va a diferir por base (prod tiene al menos `users_lead_backup_0183`, staging probablemente ninguna) y **no** es un problema.
- Es esperable que en staging y prod InnoDB también droppee solo el índice `fk_subscription_plans_tenant` al crear la unique compuesta. La FK sobrevive y `tablesWithoutTenantIndex` tiene que seguir dando 0 — si diera distinto, mirar antes de continuar.
- `CON-01` y `CON-02` siguen en `Pending` en REQUIREMENTS.md, igual que en 168-01 y 168-02: el contrato está vivo en la base local y en el schema, pero no en staging ni en prod. Los cierra el 168-06 o el verificador de fase.

## Self-Check

- `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` — FOUND (worktree `et-168-contratos`)
- `el-templo-api/src/db/tenant-tables.ts` con `TENANT_GLOBAL_UNIQUES` — FOUND
- `el-templo-api/package.json` con `db:verify-uniques` — FOUND
- `el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql` con el 12º ALTER — FOUND
- Commit `758f2aa3` — FOUND
- Commit `44618ca2` — FOUND
- Commit `ba37a148` — FOUND
- `pnpm db:verify-uniques` → `DISCREPANCIAS: 0`, `EXIT=0` — PASSED
- `npx tsc --noEmit` — PASSED
- Checkout principal en `fix/referral-preview-y-refresh-ficha` con su working tree ajeno intacto — VERIFICADO

## Self-Check: PASSED
