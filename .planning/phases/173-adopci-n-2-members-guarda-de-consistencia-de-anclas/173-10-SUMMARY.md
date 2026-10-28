---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 10
subsystem: tenancy
tags: [tenancy, cli-scripts, require-tenant, d-03, tenantValues, tenantWhere]

# Dependency graph
requires:
  - phase: 173-01
    provides: "worktree et-173 sobre el backmerge, tsconfig.test-check.json y pnpm typecheck:tests (ratchet), baseline de 14 archivos con tenant-safe (medido en 3ba22aff, el commit post-backmerge de origin/staging)"
provides:
  - "los 6 scripts CLI que tocan `users` (import-members, import-fecha-ingreso, import-turnos, import-vigentes, seed-staging, backfill-referral-codes) exigen `--tenant=<id>` antes de la primera query, vía requireTenant/queryFnFromConnection/failTenantArg (contrato de require-tenant.ts, fase 169)"
  - "las 7 entradas de allowlist objetivo (member_notes+users de import-members.ts, users de los otros 5 scripts) quedan fuera del working allowlist sin generar ninguna violación nueva"
  - "backfillReferralCodes(db, ctx, options) — firma con ctx SEGUNDO parámetro (después de db, antes de options), consumida también por test/referrals/backfill-codes.test.ts vía TEMPLO_CTX"
affects:
  [
    "173-30 (el switch final de `members` a TENANT_STRICT_MODULES — este plan deja los 6 scripts CLI ya retrofiteados, así que el switch no encuentra sorpresas ahí)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "reordenar el parseo de args: requireTenant corre ANTES del chequeo de `--data-dir` (que hoy sale con exit 1) para que la ausencia de `--tenant` siempre gane con exit 2, sin importar qué otro flag falte también"
    - "en un `db.execute(sql\\`...\\`)` crudo que ya arma su propio WHERE (los dos recompute de users.status en import-members.ts / import-vigentes.ts), el tenant se agrega como primera condición: `WHERE u.tenant_id = ${ctx.tenantId} AND u.id IN (...)`"
    - "arrays de insert (`.values([...])`) se envuelven con `.map((u) => tenantValues(ctx, u))`; cuando el array mezcla literales de distintos objetos (seed-staging.ts, 2 usuarios fijos), hace falta `as const` en los campos enum para no perder el tipo literal al pasar por `.map()` en vez de la tipificación contextual directa de `.values()`"
    - "seed-staging.ts: el DELETE de `users` se acota con `tenantWhere` (antes borraba TODOS los usuarios de TODOS los gimnasios); el DELETE de `branches` queda sin acotar — no es tabla del módulo de esta fase (D-02) — ver Hallazgos"

key-files:
  created: []
  modified:
    - el-templo-api/src/db/import-members.ts
    - el-templo-api/src/db/import-fecha-ingreso.ts
    - el-templo-api/src/db/import-turnos.ts
    - el-templo-api/src/db/import-vigentes.ts
    - el-templo-api/src/db/seed-staging.ts
    - el-templo-api/src/scripts/backfill-referral-codes.ts
    - el-templo-api/test/referrals/backfill-codes.test.ts

key-decisions:
  - "Alcance ACOTADO a las 7 entradas de allowlist objetivo del plan (member_notes+users en import-members.ts; users en los otros 5). import-members.ts e import-turnos.ts tienen MÁS tablas gym-owned en su allowlist (branches, subscriptions, subscription_plans, schedules, subscription_schedules, bookings) que NO se tocaron: no son tablas del módulo `members` en esta fase (D-02, cirugía mínima) y ninguna de sus entradas estaba en el listado de 'Entradas objetivo (7)' del plan"
  - "seed-staging.ts: se scopeó el DELETE de `users` por `tenantWhere(users, ctx)` además del INSERT (tenantValues) — no estaba explícito en el texto del plan pero es la única forma de que el archivo quede compliant sin ganar una exención `tenant-safe` nueva (D-03 prohíbe eso). El DELETE de `branches` se dejó SIN acotar (fuera del alcance de este plan) — ver Hallazgos, riesgo documentado"
  - "backfill-referral-codes.ts: solo se retrofiteó la query PROPIA del script (el SELECT de candidatos). La escritura real (`ReferralService.generateReferralCode`, en `referrals/service.ts`) NO se tocó — ese archivo es ajeno (D-02) y ya está inventariado como una de las '50 entradas ajenas' de otro plan de la fase; su UPDATE sobre `users` sigue sin `tenantWhere` propio, pero como el `userId` que recibe ya viene de una lectura scopeada por tenant, no hay fuga cross-tenant práctica hoy"
  - "Verificación de tipos: se usó `pnpm typecheck:tests` (el ratchet), NO `pnpm exec tsc -p tsconfig.test-check.json --noEmit` a secas como dice literalmente el comando `<automated>` del Task 1 del plan — ese comando raw siempre falla por los 185 errores de deuda conocida en `test/` (confirmado, ver Desviaciones)."

requirements-completed: [ADO-02]

metrics:
  duration: "~2h"
  completed: "2026-08-08"
---

# Phase 173 Plan 10: Retrofit `requireTenant` en los 6 scripts CLI que tocan `users` Summary

Los 6 scripts CLI que crean o leen `users` fuera de cualquier request (4 importadores CSV legacy, el seed de staging y el backfill de códigos de referido) ahora exigen `--tenant=<id>` antes de tocar la base, siguiendo al pie de la letra el contrato de `require-tenant.ts` que el piloto ya aplicó a `backfill-historical-payments.ts`.

## Qué se hizo

**Task 1 — los 4 importadores + seed-staging.ts:**

- `import-members.ts` (el más grande: 2 tablas strict): `users` en 4 sitios (select de existentes, select de owner para `authorId`, insert, 2 updates en el flujo de duplicado/edición) + `member_notes` en 4 sitios (2 selects de idempotencia + 2 inserts, Observaciones y Creador del legajo) + el recompute de `users.status` en SQL crudo.
- `import-fecha-ingreso.ts`, `import-turnos.ts`, `import-vigentes.ts`: cada uno con su(s) acceso(s) a `users` (select por email, update de `createdAt`, y en `import-vigentes.ts` también el recompute de `status` en SQL crudo).
- `seed-staging.ts`: dejó de sembrar siempre al `DEFAULT 1`. El operador elige el gimnasio con `--tenant`; los 3 inserts de `users` (2 test users, 3 coaches, 15 members) llevan `tenantValues`, y el `DELETE FROM users` se acotó a ese gimnasio.
- En los 5 scripts se reordenó el parseo de argumentos: `requireTenant` corre ANTES del chequeo de `--data-dir`, así que correr sin `--tenant` sale con exit 2 sin importar si además falta `--data-dir`.

**Task 2 — `backfill-referral-codes.ts`:**

- `backfillReferralCodes(db, ctx, options)` ahora recibe `ctx` como segundo parámetro; el SELECT de candidatos (`referral_code IS NULL`) filtra con `tenantWhere(users, ctx)`.
- Docblock explícito: es un barrido POR gimnasio (a demanda, una corrida por gimnasio), no un `forEachActiveTenant` — esa es la diferencia con los crons, escrita a propósito.
- `test/referrals/backfill-codes.test.ts` actualizado: los 4 call sites pasan `TEMPLO_CTX` (`{ tenantId: TENANT_TEMPLO }`, del fixture `second-tenant.ts`).
- Verificado el baseline de exenciones `tenant-safe`: **idéntico** (14 archivos) contra el commit post-backmerge `3ba22aff` — ver Desviaciones sobre por qué no se usó el propio commit `173-01` como referencia.

## Verificación

| Comando                                                                                                             | Resultado                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck:tests`                                                                                              | `DISCREPANCIAS: 0` (185 errores, todos baseline conocido, 0 nuevos)                                                                                                                                                                                                      |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-10.json` (copia de trabajo sin las 7 entradas objetivo)            | `unlistedViolations: 0` para las 7 entradas del plan. Quedan **4** discrepancias `staleNoLongerViolating` — TODAS de `audit-log.ts`/`country-scope.ts`, deuda que el **173-04** ya pagó (no son de este plan; le pertenecen al 173-30 según el brief de la orquestación) |
| `grep -c "tenant-safe" src/db/import-*.ts src/db/seed-staging.ts`                                                   | `0` en los 5 archivos                                                                                                                                                                                                                                                    |
| `grep -c "tenantValues" src/db/import-members.ts`                                                                   | `4` (≥ 2 requerido)                                                                                                                                                                                                                                                      |
| `grep -l "requireTenant"` en los 6 scripts                                                                          | presente en los 6                                                                                                                                                                                                                                                        |
| `grep -rl "tenant-safe" src/ scripts/ \| sort`                                                                      | 14 archivos, **diff vacío** contra `3ba22aff` (ver Desviaciones)                                                                                                                                                                                                         |
| Los 6 scripts sin `--tenant`                                                                                        | exit code **2** en los 6 (confirmado corriendo cada uno)                                                                                                                                                                                                                 |
| Los 6 scripts con `--tenant=999999` (gimnasio inexistente)                                                          | exit code **2** en los 6 (confirmado)                                                                                                                                                                                                                                    |
| `pnpm exec vitest run --no-file-parallelism test/unit/import-members.test.ts test/referrals/backfill-codes.test.ts` | 2 archivos, **46/46 tests OK**                                                                                                                                                                                                                                           |

Ningún script escribió una fila en las corridas sin `--tenant` ni con gimnasio inexistente: el corte de `requireTenant` ocurre antes de la primera query de negocio (confirmado por el mensaje de error, que sale antes de cualquier `console.log` de progreso de escritura).

## Deviaciones

### 1. Comando `<automated>` del Task 1 no se usó literal

El plan especifica `pnpm exec tsc -p tsconfig.test-check.json --noEmit && pnpm exec tsx src/db/import-fecha-ingreso.ts; test $? -eq 2`. El primer tramo (`tsc` raw) **siempre** sale con error porque hay 185 errores de deuda conocida en `test/` (ratchet documentado desde el 173-01) — el `&&` corta la cadena antes de llegar siquiera a correr el script. Reemplazado por la instrucción explícita del orquestador: `pnpm typecheck:tests` (el ratchet) más una corrida separada del script. Resultado: `DISCREPANCIAS: 0` + exit 2 confirmado. No es un bug de este plan, es un desajuste entre el texto literal del `<automated>` y la convención ya vigente del repo.

### 2. Baseline de exenciones `tenant-safe`: no se usó el commit propio del 173-01

Los commits `docs(173-01)` (`901f7a2b`, `d16c7225`, etc.) son ANTERIORES al merge de `origin/staging` (`60cb2992`) que trajo, entre otras cosas, `src/db/scripts/require-tenant.ts` y `src/db/sentinel/`. Comparar contra ese punto habría dado un falso "archivos nuevos" (require-tenant.ts, sentinel/analyze.ts, sentinel/install.ts no existían ahí, pero tampoco son un hallazgo de este plan — ya estaban en `origin/staging` antes del merge). Se usó en cambio `3ba22aff` — el commit inmediato posterior al merge que sincronizó el header del manifiesto — como el baseline real que corren los planes 173-02 en adelante. Diff contra ese punto: **vacío**. Documentado en detalle en el `key-decisions` de arriba.

### [Rule 2 - correctness] `seed-staging.ts`: DELETE de `users` acotado por tenant

El script original hacía `db.delete(users)` sin ningún filtro — un reset completo, sin distinguir gimnasio. Con `users` yendo a strict en esta fase y D-03 prohibiendo exenciones nuevas, dejar ese DELETE sin `tenantWhere` habría dejado el script roto (sentinel en throw) el día que el switch de `members` entre a `TENANT_STRICT_MODULES`. Se acotó a `tenantWhere(users, ctx)`: correr el seed para el gimnasio 2 ya no borra los socios del gimnasio 1.

## Hallazgos (para plans siguientes)

- **`seed-staging.ts` sigue siendo semánticamente single-tenant en la parte de `branches`.** El `DELETE FROM branches` (y el INSERT de las 6 sedes fijas) sigue sin `tenantWhere`/`tenantValues` — `branches` no es una tabla del módulo `members` de esta fase (D-02) y no estaba en las 7 entradas objetivo. Consecuencia real: si se corre `seed-staging.ts --tenant=<gimnasio-2>` contra una base que YA tiene datos de otros gimnasios, (a) el DELETE de `branches` borra las sedes de TODOS los gimnasios, y (b) las sedes recién creadas nacen con `tenant_id` = `DEFAULT` (1), mientras los `users` que el mismo script inserta a continuación sí llevan el `tenantId` elegido — un mismatch `user.tenant_id !== branch.tenant_id` de manual, justo lo que ADO-07/D-05 (guarda de anclas) apunta a prevenir. Hoy el script solo se usa contra una base de staging descartable de un solo gimnasio, así que no es explotable en la práctica, pero si el guard de D-05 (branch-consistency helper, otro plan de esta fase) llega a correr contra datos sembrados por este script con un `--tenant` distinto de 1, va a encontrar esta inconsistencia. Vale la pena que el plan que implemente el guard D-05, o el que cierre el switch (173-30), revise si `seed-staging.ts` necesita un segundo retrofit (fuera de alcance de 173-10).
- **`backfill-referral-codes.ts` delega la escritura real a `ReferralService.generateReferralCode`** (`referrals/service.ts`), que sigue sin `ctx`/`tenantWhere` propio en su SELECT+UPDATE de `users`. No es una fuga hoy (el `userId` que recibe ya viene tenant-filtrado), pero cuando el plan que migre `referrals/service.ts` (uno de los "50 archivos ajenos" de la fase) le agregue `ctx`, hay que revisar si conviene también pasarle el `ctx` desde este script en vez de dejar la llamada posicional tal cual.
- El baseline de 14 archivos con `tenant-safe` (`3ba22aff`) incluye 3 archivos (`require-tenant.ts`, `sentinel/analyze.ts`, `sentinel/install.ts`) que NO figuran en la tabla de 10 exenciones "reales" del 173-01-SUMMARY.md — son menciones de PROSA (documentan la convención en su propio docblock), no exenciones ancladas. El inventario del lint (`exemptionInventory`, 10 items) sigue siendo la fuente autoritativa; el `grep -rl` de 14 archivos es la superficie completa (prosa + exenciones reales), útil solo para el diff de "no se agregó ningún archivo nuevo".

## Self-Check

```
FOUND: el-templo-api/src/db/import-members.ts
FOUND: el-templo-api/src/db/import-fecha-ingreso.ts
FOUND: el-templo-api/src/db/import-turnos.ts
FOUND: el-templo-api/src/db/import-vigentes.ts
FOUND: el-templo-api/src/db/seed-staging.ts
FOUND: el-templo-api/src/scripts/backfill-referral-codes.ts
FOUND: el-templo-api/test/referrals/backfill-codes.test.ts
FOUND commit 47ef65da
FOUND commit 13cd8985
```

## Self-Check: PASSED
