---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 09
subsystem: rollout
tags: [tenancy, gate, staging-first, deploy]
requirements: [CON-03, CON-04]
status: complete
completed: 2026-07-28
---

# 169-09 — Gate consolidado + rollout staging-first

## Resultado

La fase 169 está **en producción** (deploy verde con smoke test) tras el gate local
consolidado, un smoke E2E extra por navegador y las dos señales humanas del checkpoint.
Cero migraciones (tope sigue **0196**), cero dependencias nuevas, cero SSH, cero bump de
versión. `el-templo-app/version.txt` intacto.

## Señales humanas registradas (checkpoint Task 2)

| #   | Señal (texto literal) | Momento (UTC aprox.) | Alcance habilitado                                                               |
| --- | --------------------- | -------------------- | -------------------------------------------------------------------------------- |
| 1   | `aprobado staging`    | 2026-07-28 ≈16:05Z   | Etapa A: push de respaldo de la rama + merge a staging + seguimiento de CI       |
| 2   | `aprobado prod`       | 2026-07-28 ≈16:35Z   | Etapa B: merge de master + push a master (deploy prod) + seguimiento hasta smoke |

Ninguna señal habilitó más que su etapa. Entre ambas, Franco además confirmó "ci verde"
(informativo; la etapa B esperó la señal literal).

Nota de proceso: entre el gate y la señal 1, Franco pidió un **smoke E2E adicional por
navegador** (Playwright por script contra el entorno local completo del worktree):
login admin → alta de socio asistida por el stepper completo → fila verificada en DB con
`tenant_id = 1` / `branch_id = 1` → CON-03 en vivo por HTTP (`tenantId: 999` en el body →
fila con `tenant_id = 1`). Sin hallazgos atribuibles a la fase; datos QA borrados de la
base local.

## SHAs por entorno

| Ref                              | Antes        | Después                                                                              |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `origin/feat/169-capa-escritura` | (no existía) | `a70ee297` (18 commits, respaldo)                                                    |
| `origin/staging`                 | `f934693c`   | `7c15f428` (merge `--no-ff` vía rama descartable `merge-staging-169`, patrón 168-06) |
| `origin/master`                  | `1200b8af`   | `a70ee297` (**fast-forward**, los 18 SHAs de la fase intactos)                       |

Chequeos previos al push a master, como exige el plan:

- `git merge-base --is-ancestor origin/staging HEAD` → **NO** ancestro: los 30 commits
  ajenos parados en staging (merges 166/167/168, fix Aura, firma Wellhub, TV 164, mig 0188)
  **no viajaron** a producción en este push.
- Los 17 archivos que difieren master↔staging no intersectan con los 31 de la fase.
- `npx tsc --noEmit` exit 0 sobre cada árbol pusheado (staging mergeado y master final),
  con symlink de `node_modules` verificado por lockfile (`cmp` contra et-167) y borrado
  antes de cada verificación de árbol. `git add` siempre por ruta explícita; el push a
  staging no requirió staging de archivos (merge limpio sin conflictos).

## Runs de CI/CD

| Etapa              | Run           | Resultado por job                                                                                                            |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A — CI staging     | `30376973958` | API Type Check & Build ✅ · **API Integration Tests ✅** · Admin ✅ · Web ✅ · App ✅                                        |
| A — Deploy Staging | `30376974103` | Detect Changes ✅ · Build API ✅ · Admin/Web/App `skipped` (solo cambió el API) · Deploy to Staging ✅                       |
| B — CI master      | `30378346752` | los 5 jobs ✅                                                                                                                |
| B — Deploy prod    | `30378346443` | Detect Changes ✅ · Build API ✅ · Admin/Web/App `skipped` · **Deploy to Production ✅** (smoke test incluido, sin rollback) |

Salud post-deploy: `api-staging.eltemplo.org/health` → ok (16:23:48Z);
`api.eltemplo.org/health` → ok (16:54:08Z). El flake anticipado de `hookTimeout`
**no apareció** en CI.

## Gate local consolidado (Task 1)

- `npx tsc --noEmit` exit 0. Gate de `any` explícito: **0 hallazgos** en los 20 archivos
  de la fase (único gate real de esa regla: ni tsc ni CI la cubren).
- **11 archivos de test, de a uno con `--no-file-parallelism`: 120/120 verdes.**

| Archivo                                              | Tests |
| ---------------------------------------------------- | ----- |
| `test/tenancy/tenant-helpers.test.ts`                | 13    |
| `test/tenancy/con-04-crons-per-tenant.test.ts`       | 8     |
| `test/tenancy/con-03-write-paths-tenant-id.test.ts`  | 18    |
| `test/wellhub/webhook-tenant-derivation.test.ts`     | 7     |
| `test/tv/tv-pairing-tenant.test.ts`                  | 6     |
| `test/unit/require-tenant.test.ts`                   | 16    |
| `test/expire-lost-leads.test.ts` (regresión)         | 7     |
| `test/jobs/reassign-multibranch.test.ts` (regresión) | 10    |
| `test/notification-plan-renewal.test.ts` (regresión) | 6     |
| `test/wellhub/webhook-checkin.test.ts` (regresión)   | 12    |
| `test/tv/tv-pairing.test.ts` (regresión)             | 17    |

- Desviación operativa (Rule 3): los archivos de webhook y TV necesitaron
  `--hookTimeout=300000` por flag de CLI en local — el provisioning de 196 migraciones
  tarda 97-160 s en esta máquina y roza el techo de `vitest.config.ts:42` (120 s),
  preexistente a la fase. Ningún archivo commiteado se tocó. Si algún día CI cae con
  `Hook timed out`, el arreglo es subir `hookTimeout` en `vitest.config.ts` (commit aparte).
- Migraciones: `git diff --name-only origin/master...HEAD` sin nada bajo
  `src/db/migrations/`; el `.sql` de mayor número sigue siendo `0196_tenant_unique_contracts.sql`.
- Árbol: `git status --porcelain` vacío; 31 archivos en el diff, todos de la lista esperada
  del plan. De los `schemas.ts` auditados solo `members/schemas.ts` necesitó cambio
  (los de finance/campaigns/scheduling ya tenían `additionalProperties: false`);
  `createProductSchema` vive en `gladius/routes.ts`, por eso ese archivo está en el diff.

## Mapa criterio del ROADMAP → evidencia real

| #   | Criterio (fase 169)                                                                                                     | Evidencia                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tenantWhere`/`tenantValues` aceptan scope de request y `TenantContext`, con unit tests (CON-03)                        | `src/modules/shared/tenant.ts` + `tenant-helpers.test.ts` (13 ✅)                                                                                 |
| 2   | `tenantId: 2` en el body ⇒ la fila nace con `tenant_id = 1` (CON-03)                                                    | `con-03-write-paths-tenant-id.test.ts` (18 ✅, 5 rutas × 2 casos) + prueba en vivo del smoke (HTTP real, `tenantId: 999` ignorado)                |
| 3   | Crons iteran tenants ACTIVOS con `TenantContext` por tenant; suspendido no se procesa (CON-04)                          | `con-04-crons-per-tenant.test.ts` (8 ✅, incluido el gate fail-closed de cobertura de los 7 jobs y D-03)                                          |
| 4   | Webhook Wellhub deriva `gym.id` → `wellhub_gym_id` → `tenant_id` fail-closed; CLI exige tenant y aborta sin él (CON-04) | `webhook-tenant-derivation.test.ts` (7 ✅) + `require-tenant.test.ts` (16 ✅) + 3 corridas manuales de `seed-onboarding-aura.ts` (169-07-SUMMARY) |
| 5   | `tv_pairings` pre-claim anotado; el claim estampa el tenant (CON-04)                                                    | `src/modules/tv/pairing.ts:145` + `tv-pairing-tenant.test.ts` (6 ✅, ciclo start→claim→consume)                                                   |

## Inventario de exenciones `tenant-safe:` (para la fase 170)

Los 9 esperados, cada uno con motivo (ninguna anotación pelada):

```
src/db/seed.ts:1                             provisioning local/de test: construye la base desde cero, incluido el tenant 1
src/db/seed-spom.ts:1                        provisioning local/de test: construye la base desde cero, incluido el tenant 1
src/db/run-migrations.ts:10                  herramienta de plataforma: aplica DDL a la base entera, no escribe filas de negocio
src/db/scripts/verify-tenant-backfill.ts:58  verificador de plataforma: escanea TODOS los tenants por diseño, solo lectura
src/db/scripts/verify-tenant-uniques.ts:61   verificador de plataforma: escanea TODOS los tenants por diseño, solo lectura
scripts/wellhub-sandbox.ts:27                no toca la DB: postea al webhook local, que resuelve el tenant por su propio camino
src/modules/tv/pairing.ts:145                pairing pre-claim
src/modules/wellhub/service.ts:135           idempotencia global previa a la derivación del tenant (M8)
src/jobs/notification-cron.ts:754            seed de templates global hasta la adopción de notifications (fase 175)
```

**Hallazgo accionable para la 170:** el grep crudo de `tenant-safe:` devuelve **11**
archivos, no 9. Los 2 extra son prosa, no exenciones: `src/db/scripts/require-tenant.ts:44`
(docblock que documenta el formato) y `src/db/schema/tv.ts:81` (comentario `//` que cita la
anotación de pairing). El sentinel/lint de la 170 **no puede** matchear el literal suelto ni
anclar solo en `/* tenant-safe: */` — tiene que exigir comentario de bloque en el sitio del
write, o va a autorizar a ciegas archivos sin exención real.

## Desviaciones del plan

1. (Rule 3) `--hookTimeout=300000` por CLI en el gate local — detallado arriba.
2. (Rule 3) El poller de CI corrió sin `gh` ni token: el API público de Actions del repo
   respondió sin autenticación, así que el seguimiento fue por `curl` al REST API cada 90 s.
3. (Contexto) El smoke E2E por navegador previo a la señal 1 no estaba en el plan; quedó
   registrado arriba y no modificó ningún archivo de la fase.
