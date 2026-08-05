---
phase: 172-adopci-n-1-piloto-finance
verified: 2026-07-31T19:43:40Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 172: Adopción 1 (piloto) — `finance` Verification Report

**Phase Goal:** El módulo finance queda migrado al patrón completo de tenancy (services con `TenantContext`, `tenantWhere`/`tenantValues` en todo acceso a las 6 tablas strict, módulo entero fuera de la allowlist), `finance` es la primera entrada de `TENANT_STRICT_MODULES` con el sentinel en throw, la batería ISO-03 (38 rutas) corre verde como plantilla repetible, y el staff no percibe cambio de comportamiento (mismos números en staging).
**Verified:** 2026-07-31T19:43:40Z
**Status:** passed
**Re-verification:** No — initial verification

**Nota de layout:** el código de la fase vive en el worktree `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, HEAD `2579bc6b`, sobre `a6272df0` = merge-base con `origin/master`). Todos los chequeos de código de este reporte corren contra ese worktree. Los artefactos de planning se verificaron contra el checkout principal `/home/franco/projects/el-templo`.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Los 6 archivos del módulo finance (y los archivos ajenos que tocan sus tablas) operan con `TenantContext`/`tenantWhere`/`tenantValues` en todo acceso a las 6 tablas strict, módulo entero fuera de la allowlist | ✓ VERIFIED | `tenantWhere(` presente en los 6 archivos de `src/modules/finance/*.ts` (26+12+5+6+4+84 ocurrencias); 0 entradas con `"table"` sobre las 6 tablas strict y 0 entradas con `"file": "src/modules/finance/` en `tenant-lint-allowlist.json` (450 entradas totales, bajó de 501); `pnpm lint:tenant` documentado en 172-21-SUMMARY con `DISCREPANCIAS: 0`                                                                                                                                                                         |
| 2   | `finance` es la primera entrada de `TENANT_STRICT_MODULES`: sentinel en throw en test/dev para las 6 tablas                                                                                                      | ✓ VERIFIED | `el-templo-api/src/db/tenant-tables.ts:524-533` — `TENANT_STRICT_MODULES = { finance: ["balances","cash_registers","cost_centers","debt_management","financial_transactions","transaction_links"] }`, única entrada del registro; las 6 confirmadas dentro de `GYM_OWNED_TABLES`; demo en vivo transcrita en 172-21-SUMMARY (sonda sin `tenantWhere` en `validate()` → `TenantSentinelError` real con SQL y cadena `cause`, revertida sin commitear)                                                                           |
| 3   | Batería ISO-03 verde: cada ruta tenant-scoped de finance (38 según el manifiesto), staff del tenant A no lee ni escribe filas del tenant B — patrón documentado como plantilla                                   | ✓ VERIFIED | 3 archivos de batería existen (`iso-03-finance-cajas.test.ts` 1153 líneas/34 `it`, `iso-03-finance-transacciones.test.ts` 1545 líneas/33 `it`, `iso-03-finance-coach-load.test.ts` 1912 líneas/30 `it`) + gate de cobertura bidireccional (`iso-03-cobertura.test.ts`, `CASOS_BASELINE = 38`, cruza rutas del manifiesto contra `describe` de la batería en las dos direcciones); receta documentada en `.docs/saas-multitenancy/07-receta-adopcion.md` (348 líneas, apuntada desde la cabecera de `iso-03-cobertura.test.ts`) |
| 4   | Sin cambio para el staff: mismos números en staging antes/después y la suite pasa sin ajustar expectativas                                                                                                       | ✓ VERIFIED | Merge real en `origin/staging` (`387c0aaf` + `211c0003`, confirmado por `git log origin/staging`); `$HOME/.el-templo-snapshots/172/antes.json` (2026-07-30T22:51Z) y `despues.json` (2026-07-31T19:05Z) existen con contenido real de `api-staging.eltemplo.org`; diff documentado con 11 divergencias explicadas (10× `ageInDays` +1 por el día calendario entre fotos + 1 timestamp de metadata, cero en montos/filas/saldos); UAT de Franco (owner) aprobado en staging (172-22-SUMMARY)                                    |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                                        | Expected                                                             | Status     | Details                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/tenant-tables.ts`                                         | `TENANT_STRICT_MODULES.finance` con las 6 tablas físicas             | ✓ VERIFIED | Confirmado, coincide exactamente con el ROADMAP; `aura_balances`/`aura_transactions` correctamente fuera (D-05)            |
| `el-templo-api/tenant-lint-allowlist.json`                                      | Sin entradas de finance                                              | ✓ VERIFIED | 501→450, 0 entradas sobre las 6 tablas strict ni con `file` bajo `src/modules/finance/`                                    |
| `el-templo-api/test/db/tenant-tables.test.ts`                                   | Gate de forma con `MODULOS_DECLARADOS` + coherencia D-15             | ✓ VERIFIED | `MODULOS_DECLARADOS.finance` presente L364-379, comparación contra copia escrita a mano (no contra sí mismo)               |
| `el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts`                       | Batería para cash-registers/cost-centers (14 rutas)                  | ✓ VERIFIED | 1153 líneas, 16 `describe`, 34 `it`                                                                                        |
| `el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts`               | Batería para transacciones/pending-tray/movements-history (13 rutas) | ✓ VERIFIED | 1545 líneas, 14 `describe`, 33 `it`                                                                                        |
| `el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts`                  | Batería para coach-load/movimientos/egresos (11 rutas)               | ✓ VERIFIED | 1912 líneas, 12 `describe`, 30 `it`, incluye 2 casos "conocidos" ejecutables (`it.fails`) con dueño explícito fase 173/174 |
| `el-templo-api/test/tenancy/iso-03-cobertura.test.ts`                           | Gate fail-closed bidireccional de cobertura                          | ✓ VERIFIED | 470 líneas, `CASOS_BASELINE = 38`, verifica `faltantes=[]` y `fantasmas=[]`                                                |
| `el-templo-api/src/scripts/snapshot-finance-endpoints.ts`                       | Script de snapshot determinístico                                    | ✓ VERIFIED | Presente en el diff revisado por `172-REVIEW.md` (IN-02 apunta a un detalle menor de paginación, no bloqueante)            |
| `$HOME/.el-templo-snapshots/172/antes.json` y `despues.json`                    | Fotos reales de staging                                              | ✓ VERIFIED | Ambos archivos existen, timestamps y contenido coherentes con lo documentado                                               |
| `/home/franco/projects/el-templo/.docs/saas-multitenancy/07-receta-adopcion.md` | Receta repetible de adopción                                         | ✓ VERIFIED | 348 líneas (≥120 exigido), en checkout principal (`.docs/` gitignored, no vive en el worktree por diseño)                  |

### Key Link Verification

| From                                         | To                                      | Via                                                   | Status  | Details                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------- | ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/tenant-tables.ts`                    | `src/db/sentinel/install.ts`            | `strictTablesSet` alimenta la matriz de severidad     | ✓ WIRED | `install.ts` importa `strictTablesSet` de `tenant-tables`; demo en vivo confirma el throw real                                                                                                                                                                                   |
| `finance/routes.ts` / `coach-load-routes.ts` | `assertTenant`                          | call site por handler                                 | ✓ WIRED | 31 + 11 usos de `assertTenant(` en los dos archivos                                                                                                                                                                                                                              |
| `analytics/routes.ts`, `reports/routes.ts`   | `assertTenant`                          | call sites de métodos que tocan tablas finance (D-01) | ✓ WIRED | 6 usos en cada uno                                                                                                                                                                                                                                                               |
| `auth/routes.ts` (ruta pública)              | `subscriptionService.assignPlan`        | ctx derivado de `branches.tenantId`, fail-closed      | ✓ WIRED | `branchTenantId` resuelto server-side L152-191, `ctx: TenantContext = { tenantId: branchTenantId }` L288 — con la asimetría documentada en REVIEW WR-01 (el INSERT de `users` seis líneas antes no estampa `tenantId`, cae en `DEFAULT 1`; inerte hoy, deuda con dueño fase 173) |
| `iso-03-*.test.ts`                           | `test/fixtures/finance-gimnasio-dos.ts` | `sembrarFinanzasGimnasioDos` + `tenantDeLaFila`       | ✓ WIRED | Fixture existe, documenta el orden obligado de siembra/limpieza FK-safe                                                                                                                                                                                                          |
| `iso-03-cobertura.test.ts`                   | `test/tenant-manifest.ts`               | derivación de rutas finance tenant-scoped por prefijo | ✓ WIRED | `TENANT_MANIFEST` importado, `CASOS_BASELINE = 38` cruzado en las dos direcciones                                                                                                                                                                                                |
| `origin/staging`                             | `snapshot-finance-endpoints.ts --diff`  | `antes.json` vs `despues.json`                        | ✓ WIRED | Confirmado por archivos reales + merges `387c0aaf`/`211c0003` en `origin/staging`                                                                                                                                                                                                |

### Requirements Coverage

| Requirement | Source Plan                               | Description                                                                                       | Status                                                 | Evidence           |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ |
| ADO-01      | 172-01 a 172-23 (declarado en casi todos) | `finance` migrado al patrón completo                                                              | ✓ SATISFIED                                            | Ver truths 1, 2, 4 |
| ISO-03      | 172-17 a 172-23                           | Batería de aislamiento: ruta tenant-scoped de módulo migrado no expone/escribe datos del tenant B | ✓ SATISFIED (con matiz documentado, ver Observaciones) | Ver truth 3        |

**Observación (no es hallazgo nuevo — reportado como tal por instrucción del orquestador):** `REQUIREMENTS.md` sigue marcando `ADO-01` e `ISO-03` como `Pending` (líneas 56/60/113-114) aunque la fase 172 los entrega. Es contabilidad desactualizada de toda la familia ISO/ADO (ya documentada por el propio `172-20` en `deferred-items.md` como decisión de cierre de milestone), no un gap de código de esta fase.

### Anti-Patterns Found

Ninguno bloqueante. Escaneados los ~26 archivos `src/` tocados por la fase (finance, analytics, reports, coach, members, subscriptions, auth, scripts, tenant-tables.ts): sin `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` reales (los matches de "TODO" son la palabra española "todo" = "all", falsos positivos), sin `console.log` fuera de los 2 scripts CLI (permitido), sin `any`/`as any` nuevos.

`172-REVIEW.md` (0 críticos, 2 warnings, 3 info, `status: issues_found`) ya corrió sobre el mismo diff:

- **WR-01** (auth/routes.ts: INSERT de `users` no estampa `tenantId`, cae en `DEFAULT 1`) — inerte hoy (solo existe tenant 1 en prod), deuda con dueño (fase 173), no bloquea esta fase.
- **WR-02** (`_cancelSubscription`: join `transaction_links`↔`financial_transactions` filtra solo una de las dos tablas strict) — transitivamente correcto hoy, deuda con dueño (fase 173/174 según a quién le corresponda), no bloquea esta fase.
- **IN-01/IN-02/IN-03** — informativos, sin acción requerida en esta fase.

Estos warnings están documentados con dueño explícito y no exponen datos hoy (single-tenant en prod); consistente con la nota del orquestador de tratarlos como deuda, no como bloqueantes.

### Human Verification Required

Ninguno pendiente. El checkpoint humano bloqueante del plan 172-22 (Tasks con `type="checkpoint:human-verify" gate="blocking"`) ya se ejecutó y está aprobado: Franco (owner) cobró, validó y arqueó en staging sin notar cambios ("uat ok", documentado en 172-22-SUMMARY con la investigación explícita de la única observación — el chip "Pendiente" hardcodeado de `CobrosPage.vue:70`, deuda preexistente sin relación con esta fase).

### Gaps Summary

Ninguno. Los 3 must-haves de nivel ROADMAP y el criterio "mismos números" están verificados con evidencia de código, git log de `origin/staging`, y archivos de snapshot reales — no solo con las afirmaciones de los SUMMARY. La única tensión notable (`GET /coach-load/autocompletar/:userId` sí expone el plan de un socio de otro gimnasio vía `subscriptions`, tabla NO strict de esta fase) está fuera del boundary explícito D-07 (locked en el CONTEXT antes de planificar), documentada con una aserción ejecutable que falla a propósito (`it.fails`, no oculta el hallazgo) y con dueño nombrado para la migración de `subscriptions` — no es una fuga silenciosa ni fue introducida por esta fase; es la razón de ser de las fases 173-175 siguientes.

---

_Verified: 2026-07-31T19:43:40Z_
_Verifier: Claude (gsd-verifier)_
