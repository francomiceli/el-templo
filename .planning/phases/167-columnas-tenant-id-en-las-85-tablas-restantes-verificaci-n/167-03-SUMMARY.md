---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 03
subsystem: database
tags:
  [
    drizzle,
    mysql,
    multi-tenancy,
    migrations,
    saas,
    campaigns,
    notifications,
    referrals,
    wellhub,
  ]

# Dependency graph
requires:
  - "167-01 (worktree et-167-columnas, numeracion 0192-0195 reservada, helper tenantIdColumn(), clasificacion GYM_OWNED_TABLES)"
  - "167-02 (tanda C1: 27 tablas del core operativo + migracion 0192, patron SQL canonico con DEFAULT desde el ADD COLUMN)"
  - "166-01/166-02 (tabla tenants con El Templo id=1 + anclas users/branches)"
provides:
  - "tenant_id NOT NULL DEFAULT 1 + FK a tenants en las 16 tablas de comunicacion, crecimiento e integraciones, en schema Drizzle y en la DB local"
  - "Migracion 0193_tenant_id_core_comms.sql: 64 statements, mismo ciclo de 4 pasos por tabla que la 0192"
  - "Mina M3 anotada en campaign_unsubscribes (la unique global email pasa a (tenant_id, email) en la fase 168) y mina M6 anotada en wellhub_events (sin FK, derivacion por payload.gym.id en la fase 169)"
affects:
  - "167-04 y 167-05 (las 42 tablas restantes de la tanda C: numeros 0194 y 0195 siguen libres)"
  - "167-06 (verificacion de las 87 tablas: 45 de las 87 ya cumplen — 43 de la tanda C + las 2 anclas)"
  - "168 (CON-01/CON-02: la unique compuesta (tenant_id, email) de campaign_unsubscribes ya tiene la columna que necesita)"
  - "169 (CON-04: wellhub_events ya tiene la columna donde el TenantContext derivado va a estampar)"
  - "175 (ADO: filtro de supresion de campanias scopeado por tenant)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Comentario de mina en el schema, no solo en el plan: la tabla que arrastra deuda conocida (M3, M6) lleva escrito en el codigo que fase la cierra y por que hoy el backfill directo es correcto"
    - "Prueba empirica de compatibilidad en las DOS tablas de borde del grupo (campaign_unsubscribes y wellhub_events), no en una sola: son justo las dos superficies que escriben sin request de socio adelante"

key-files:
  created:
    - el-templo-api/src/db/migrations/0193_tenant_id_core_comms.sql
  modified:
    - el-templo-api/src/db/schema/campaigns.ts
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/db/schema/referrals.ts
    - el-templo-api/src/db/schema/referral-credits.ts
    - el-templo-api/src/db/schema/referral-cta-clicks.ts
    - el-templo-api/src/db/schema/improvement-proposals.ts
    - el-templo-api/src/db/schema/wellhub.ts

key-decisions:
  - "Cero desviaciones de codigo: ninguna de las 16 tablas de este grupo esta acoplada a un $inferSelect con proyeccion explicita, asi que la trampa que el 167-02 encontro en BalanceService no se repitio (verificado por grep antes de editar)"
  - "El insert de prueba sin tenant_id se hizo en DOS tablas (campaign_unsubscribes y wellhub_events) en vez de la unica que pedia el plan: son las dos superficies que T-167-14 senala como escritoras durante el rolling deploy"
  - "El comentario de la mina M6 va sobre wellhub_events ANTES de event_id, no pegado a tenantId, para que se lea como nota de la tabla y no de la columna"

patterns-established:
  - "En archivos con varias tablas, el import de tenant-column va una sola vez y la columna en CADA tabla: campaigns.ts, notifications.ts y wellhub.ts suman 4 ocurrencias cada uno y 3 archivos cubren 12 de las 16 tablas"

# COL-01 sigue Pending: acumulado 43 de las 85 tablas de la tanda C.
# Lo completan 167-04 y 167-05 (42 restantes) y lo verifica 167-06.
requirements-completed: []
requirements-progressed: [COL-01]

# Metrics
duration: ~12min
completed: 2026-07-27
---

# Phase 167 Plan 03: tenant_id en comunicacion, crecimiento e integraciones (tanda C2) Summary

**Las 16 tablas de campanias, notificaciones, referidos, sugerencias y Wellhub tienen `tenant_id INT NOT NULL DEFAULT 1` con FK nombrada a `tenants` y el 100% de las filas en 1, cerrando la mitad de schema de la mina M3 (`campaign_unsubscribes` ya puede recibir la unique compuesta que la fase 168 le pone) y habilitando la mina M6 (`wellhub_events`, la unica tabla del sistema sin ninguna FK, ya tiene la columna donde la fase 169 va a estampar el tenant derivado del payload).**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files:** 1 creado (la migracion), 7 modificados (schemas)
- **Commits:** 1 de codigo (worktree, `1c65bb0b`) + 1 de planning (checkout principal)

## Task 1 — los 7 schemas Drizzle, 16 tablas

Misma edicion de 3 lineas por tabla que el plan 167-02 (import una vez por archivo + comentario + columna):

```ts
import { tenantIdColumn } from "./tenant-column";
// ...
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
```

Tres archivos concentran 12 de las 16 tablas (4 ocurrencias cada uno):

| Archivo                    | Tablas                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `campaigns.ts`             | campaigns, campaign_sends, campaign_events, campaign_unsubscribes                      |
| `notifications.ts`         | device_tokens, notification_templates, notification_preferences, pending_notifications |
| `wellhub.ts`               | wellhub_classes, wellhub_slots, wellhub_bookings, wellhub_events                       |
| `referrals.ts`             | referrals                                                                              |
| `referral-credits.ts`      | referral_credits                                                                       |
| `referral-cta-clicks.ts`   | referral_cta_clicks                                                                    |
| `improvement-proposals.ts` | improvement_proposals                                                                  |

`campaigns` y `notification_templates` declaran el objeto de columnas al tope (indentacion 2); las otras 14 usan el tercer argumento de `mysqlTable` (indentacion 4). Ninguna tabla recibio indice, relacion a `tenants` ni reordenamiento de columnas.

### Las dos minas quedaron escritas en el codigo

- **`campaign_unsubscribes` (M3, doc 06 §8-Q5):** cuatro lineas explicando que la unique global sobre `email` pasa a `(tenant_id, email)` en la fase 168 (hoy una baja en un gimnasio suprimiria los envios de todos) y que `user_id` puede ser NULL (baja solo-email), asi que su backfill es **directo** y no derivado del socio.
- **`wellhub_events` (M6):** cuatro lineas explicando que es la unica tabla del grupo sin ninguna FK a nuestro dominio, que la derivacion real es `payload.gym.id` -> `branches.wellhub_gym_id` -> `branch.tenant_id` en la fase 169, y que con un solo tenant el backfill directo a 1 es correcto por construccion.

### La trampa del `$inferSelect` NO se repitio

El 167-02 dejo el aviso de buscar acoplamientos antes de editar. `grep -rn '\$inferSelect' src/` devuelve 11 lineas y **ninguna** toca las 16 tablas de este grupo (son `refreshTokens`, `financialTransactions`, `transactionLinks`, `balances`, `franchiseApplications`, `subscriptionPlans`, `sessions`, `activities`). `npx tsc --noEmit` salio limpio de una, sin necesitar ningun fix de proyeccion.

## Task 2 — migracion 0193

`el-templo-api/src/db/migrations/0193_tenant_id_core_comms.sql`, hand-written, **64 statements** = 16 tablas x 4 pasos, en orden alfabetico de tabla, copiando el patron de la 0192 (no el de la 0191):

```sql
ALTER TABLE <t> ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE <t> MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE <t> ADD CONSTRAINT fk_<t>_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
```

El header explica los mismos "por que" que la 0192, con el argumento de WR-01 **especializado a este grupo**: aca el riesgo del rolling deploy deja de ser teorico porque el webhook de Wellhub inserta en `wellhub_events` por cada evento entrante y no se puede pausar, y los crons de notificaciones escriben `pending_notifications` sin coordinacion con el deploy. Ademas documenta las dos minas (M3 y M6) para quien lea la migracion sin leer el plan. **Ninguna linea del archivo contiene `--` y `;` a la vez** (verificado como gate estatico ANTES de correr el runner).

### Aplicacion local

`pnpm db:migrate` -> `Applying: 0193_tenant_id_core_comms.sql (64 statements)` / `Applied successfully`, **sin una sola linea `Skipped`**: los 64 statements ejecutaron limpios de verdad, no por la heuristica `alreadyApplied`. No hizo falta el procedimiento de recuperacion de falla parcial.

## Verificacion

| Check                                                                              | Esperado    | Resultado                                      |
| ---------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| `npx tsc --noEmit`                                                                 | limpio      | limpio (a la primera, sin fixes)               |
| `grep -c 'tenantIdColumn()'` en `campaigns.ts` / `notifications.ts` / `wellhub.ts` | 4 / 4 / 4   | **4 / 4 / 4**                                  |
| idem en los 4 archivos de una tabla                                                | 1 cada uno  | **1 / 1 / 1 / 1**                              |
| `grep -rho 'tenantIdColumn()' src/db/schema/ --exclude=tenant-column.ts \| wc -l`  | 43          | **43** (27 del 167-02 + 16 de este)            |
| `git diff --name-only` (pre-commit)                                                | 7 rutas     | exactamente los 7 schemas, ninguna otra        |
| `grep -c 'M3' campaigns.ts` / `grep -c 'M6' wellhub.ts`                            | >= 1        | **1 / 1**                                      |
| `grep -nE ':\s*any\b'` en los 7 archivos                                           | vacio       | vacio                                          |
| Lineas del `.sql` con `--` y `;` a la vez                                          | 0           | **0**                                          |
| `ADD COLUMN tenant_id INT NULL DEFAULT 1` (sin comentarios)                        | 16          | **16**                                         |
| `UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL`                             | 16          | **16**                                         |
| `MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1`                                   | 16          | **16**                                         |
| `REFERENCES tenants(id)`                                                           | 16          | **16**                                         |
| `AFTER ` (case-insensitive, sin comentarios)                                       | 0           | **0**                                          |
| Statements totales del archivo                                                     | 64          | **64**                                         |
| Constraint mas largo                                                               | <= 64 chars | 34 (`fk_notification_preferences_tenant`)      |
| Constraints que NO siguen `fk_<tabla>_tenant`                                      | 0           | **0** (query sobre `INFORMATION_SCHEMA`)       |
| `INFORMATION_SCHEMA.COLUMNS`: NOT NULL / DEFAULT '1' / `int` en las 16             | 16          | **16**                                         |
| FKs a `tenants` de las 16 tablas de este plan                                      | 16          | **16**                                         |
| FKs a `tenants` en toda la base local                                              | 46          | **46** (30 previas + 16)                       |
| Filas con `tenant_id <> 1 OR IS NULL` (suma de las 16)                             | 0           | **0** sobre 120 filas                          |
| Insert en `campaign_unsubscribes` SIN `tenant_id`                                  | queda en 1  | `tenant_id = 1`, fila borrada (vuelve a 0)     |
| Insert en `wellhub_events` SIN `tenant_id`                                         | queda en 1  | `tenant_id = 1`, fila borrada (vuelve a 3)     |
| Segunda corrida de `pnpm db:migrate`                                               | sin cambios | `No new migrations to apply`                   |
| `SELECT COUNT(*) FROM _migrations WHERE name='0193_...'`                           | 1           | **1**                                          |
| `npx vitest run test/db/tenant-tables.test.ts`                                     | verde       | **5/5** en 81 s                                |
| DB de test provisionada por el worker (`eltemplo_test_1`)                          | 46 / 46     | **46 columnas `tenant_id` / 46 FKs a tenants** |
| `npx prettier --check` sobre los 7 `.ts`                                           | limpio      | "All matched files use Prettier code style!"   |
| Deleciones en el commit                                                            | ninguna     | ninguna                                        |
| `git status --porcelain` del worktree post-commit                                  | vacio       | vacio                                          |
| `git show --stat HEAD`                                                             | 8 archivos  | **8 archivos, 207 inserciones, 0 deleciones**  |

**El backstop del parser se ejercito de verdad otra vez:** `test/setup.ts` (`provisionWorkerDB`) aplica las migraciones con el MISMO `splitSqlStatements()` que produccion. La base `eltemplo_test_1` quedo con **46 columnas `tenant_id` y 46 FKs a `tenants`** (43 de la tanda C + las 2 anclas + `tenant_settings`), identico a la DB de desarrollo, o sea que el archivo de 64 statements parsea bien tambien por ese camino.

## Deviations from Plan

### Ajustes automaticos

Ninguno. **El plan se ejecuto exactamente como estaba escrito**, sin bugs, sin funcionalidad critica faltante y sin bloqueos: los dos tasks pasaron sus gates a la primera.

### Aclaraciones sobre criterios del plan (no son cambios de comportamiento)

**1. El grep de aceptacion de `tenantIdColumn()` da 45 crudo, 43 con `--exclude`**

El criterio del plan pide que `grep -rho 'tenantIdColumn()' src/db/schema/ | wc -l` devuelva `43`. Devuelve **45**, y no puede devolver 43: el helper `tenant-column.ts` vive dentro de `src/db/schema/` y aporta 2 ocurrencias propias (el ejemplo del JSDoc y la declaracion de la funcion). Es exactamente la trampa que el SUMMARY del 167-02 dejo documentada. El conteo verificable equivalente es `--exclude=tenant-column.ts` -> **43**, confirmado. Los planes 167-04 y 167-05 tienen la misma trampa (esperar `N + 2`).

**2. El insert de prueba se hizo en dos tablas, no en una**

El plan pedia una sola prueba empirica, con `campaign_unsubscribes` o `wellhub_events` como candidatas. Se hicieron **las dos**: son precisamente las dos superficies que el `<threat_model>` senala (T-167-14, el webhook de Wellhub durante el rolling deploy) y el costo era un INSERT mas. Ambas quedaron en `tenant_id = 1` y ambas filas se borraron (`campaign_unsubscribes` vuelve a 0 filas, `wellhub_events` vuelve a 3).

### Observaciones operativas (no son desviaciones)

- **Task 1 no tiene commit propio a proposito.** Hard Rule 3 del skill `el-templo-db-migrations` exige que el `.sql` viaje en el mismo commit que el cambio de schema, y el plan lo pide explicitamente. Un unico commit `1c65bb0b` cubre los dos tasks.
- **Los hooks de pre-commit siguen sin correr en el worktree.** Se corrio `npx prettier --check` a mano sobre los 7 `.ts` antes de commitear. El `.sql` no necesita prettier (`lint-staged` de la raiz solo matchea `**/*.{ts,vue,js,json,md}`).
- **El checkout principal no se toco para codigo.** Sigue en `fix/referral-preview-y-refresh-ficha` con el WIP ajeno intacto (98 entradas en `git status --porcelain`, sin archivos de codigo de la fase 167). Todos los edits de codigo fueron bajo `/home/franco/projects/et-167-columnas`.
- **Volumen local del grupo: 120 filas** (101 en `notification_preferences`, 16 en `notification_templates`, 3 en `wellhub_events`, el resto vacias). Es un grupo mucho mas chico que el de la 0192 en desarrollo, pero **en produccion `pending_notifications`, `campaign_sends` y `device_tokens` son tablas grandes** — la medicion de volumen real antes del rollout sigue siendo el plan 167-07 (mitigacion T-167-10).

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. No se agrego ni modifico ningun endpoint, ninguna ruta de auth ni ningun esquema de request: `tenant_id` no aparece en ninguna superficie de entrada. Las dos disposiciones `accept`/`mitigate` del registro quedan como estaban, con la deuda ahora anotada en el codigo ademas de en el plan.

## Next Phase Readiness

Los planes 167-04 y 167-05 arrancan sin bloqueos:

- Worktree `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`), HEAD `1c65bb0b`, working tree limpio.
- Numeros libres: **0194 / 0195**. `_migrations` local tiene ya `0192_tenant_id_core_ops.sql` y `0193_tenant_id_core_comms.sql`.
- **Copiar el patron SQL de 0192/0193, no el de 0191.**
- Acumulado: **43** de las 85 tablas de la tanda C. Con las 2 anclas, **45 de las 87** gym-owned ya tienen la columna. Faltan **42**.
- Trampas vigentes: el grep de `tenantIdColumn()` incluye 2 del propio helper (usar `--exclude=tenant-column.ts`), `npx prettier --check` a mano (no hay hook en el worktree), nunca `git add -A`, y verificar la migracion contra `INFORMATION_SCHEMA` en vez de contra `_migrations`.
- Antes de editar, repetir `grep -rn '\$inferSelect' src/` para ver si alguna de las 42 tablas restantes esta acoplada a una proyeccion explicita (en este grupo no habia ninguna).

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0193_tenant_id_core_comms.sql` existe en el worktree y esta en el commit.
- Los 7 `.ts` de schema declarados existen y estan en el commit.
- El commit `1c65bb0b` esta en el historial de `feat/167-tenant-columns` con 8 archivos, 207 inserciones y 0 deleciones.
- Este SUMMARY existe en el checkout principal.
