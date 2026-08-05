# Phase 169: Capa de escritura — helpers `tenantWhere`/`tenantValues` y `TenantContext` - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Existe UNA sola forma de leer y escribir con tenant, con o sin request.
`src/modules/shared/tenant.ts` expone `tenantWhere`/`tenantValues` (firma exacta del
doc 03 §3 — ya diseñada, NO re-diseñar) que aceptan indistintamente el `scope` de un
request y un `TenantContext { tenantId }` plano. Los caminos que nacen fuera de un
request construyen ese contexto explícitamente: los crons iteran tenants activos, el
webhook de Wellhub deriva el tenant vía `payload.gym.id` → `branches.wellhub_gym_id` →
`branches.tenant_id`, y los scripts CLI que escriben gym-owned exigen `--tenant` o
abortan. `tv_pairings` pre-claim queda exento con anotación
`/* tenant-safe: pairing pre-claim */` y el claim estampa el tenant del scope de staff.
(CON-03, CON-04)

Fuera de esta fase: migrar services al patrón (adopción 172-175, piloto `finance` en
172), sentinel de pool + lint CI (170), manifiesto de rutas + fixtures 2-tenant (171).
Sin migraciones de DB previstas (los contratos SQL quedaron estables en la 168).

**Base de código:** el trabajo arranca desde `origin/master` (fases 166-168 mergeadas;
el checkout principal puede estar en una rama vieja — verificar base antes de editar,
patrón worktree de las fases 166-168).

</domain>

<decisions>
## Implementation Decisions

### Crons (los 7 jobs de `src/jobs/`)

- **D-01:** Los **7 jobs reales** adoptan el loop por-tenant-activo en esta fase:
  `auto-approve`, `auto-resume-pauses`, `expire-lost-leads`, `mark-no-shows`,
  `notification-cron` (sus 4 schedules), `reassign-multibranch`, `wellhub-sync`. No
  solo los 4 que nombra el ROADMAP ("streaks" no existe como job — la lista real es
  esta). Ningún cron queda "para acordarse después".
- **D-02:** El `TenantContext` baja **solo hasta el cuerpo del job**: el loop se lo
  entrega, el job lo loguea y lo tiene disponible, pero los services que el job llama
  MANTIENEN su firma actual hasta su fase de adopción (172-175). La 169 no toca lógica
  de negocio — con un solo tenant el resultado es idéntico al actual.
- **D-03:** Aislamiento de errores por tenant: si el job falla para un tenant, catch +
  `log.error` + Sentry con el `tenantId`, y el loop **continúa con el siguiente**. Un
  tenant roto no frena a los demás.

### Webhook Wellhub

- **D-04:** Gym sin mapear → se MANTIENE el contrato actual: HTTP **200 con outcome
  `skipped`** + log (fail-closed lógico: no se crea nada). NO pasar a 4xx — provocaría
  reintentos eternos de Wellhub por un gym que jamás va a mapear. La fase suma la
  derivación del tenant (`gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id`),
  el `TenantContext` construido de ahí, y el test.
- **D-05:** Gym que mapea a una sede de un tenant `suspended`/`archived` → **NO se
  procesa** el check-in: 200 `skipped` + log con `tenantId`. Coherente con CD-01 de la
  166 (suspensión = palanca comercial total) y con los crons que solo iteran activos.

### Scripts CLI

- **D-06:** La regla "tenant obligatorio o aborta" aplica **solo a scripts que
  escriben tablas gym-owned**. Helper compartido que parsea `--tenant=<id>` y aborta
  sin él. Retrofit de `scripts/seed-onboarding-aura.ts` como ejemplar (hoy escribe
  `aura_config` cayendo en el DEFAULT 1 sin declararlo). Exentos con anotación
  `/* tenant-safe: <motivo> */` grepeable: `run-migrations.ts`, los `verify-tenant-*`
  (herramientas de plataforma que corren en CI/deploy y escanean todos los tenants),
  `db:seed`/`seed:spom` (provisioning local) y `wellhub-sandbox.ts` (no toca DB —
  postea al webhook local, que resuelve el tenant por su propio camino).
- **D-07:** El helper valida contra la DB **que el tenant exista** (typo = corte
  inmediato antes de escribir nada) pero **NO exige status `active`**: el CLI es
  tooling de operador y puede necesitar tocar un tenant suspendido (export, limpieza).
  Contrato deliberadamente distinto al de crons/webhook, que sí filtran solo activos.

### Grado de adopción de la fase

- **D-08:** **Cero migración de services.** La 169 entrega helpers + `TenantContext` +
  crons/webhook/CLI + tests, más una auditoría puntual: grep de INSERTs que spreadeen
  el body del request sobre tablas gym-owned (mass-assignment) y fix de los que
  aparezcan. La adopción real empieza en la 172 con `finance`.
- **D-09:** El test del criterio 2 (mandar `tenantId: 2` en el body y verificar que la
  fila nace con `tenant_id = 1`) corre sobre una **batería representativa**: una ruta
  de escritura clave por módulo crítico (alta de socio, cobro, booking, asignación de
  plan…). Cada fase de adopción la extiende a su módulo; el barrido 100% llega con el
  manifiesto (171/ISO-03).

### Lockeadas por diseño (NO re-litigar; fuentes en canonical_refs)

- Firma de `tenantWhere`/`tenantValues` EXACTAMENTE como doc 03 §3 (código propuesto):
  `tenantWhere(table, scope)` → `eq(table.tenantId, scope.tenantId)`;
  `tenantValues(scope, values)` → `{ ...values, tenantId: scope.tenantId }`.
- `{ tenantId }` plano como contrato: el scope de request y el `TenantContext` son
  estructuralmente compatibles — NO hay dos APIs.
- Convención: `and(tenantWhere(table, scope), ...resto)` como primer término de todo
  WHERE sobre gym-owned; en ` sql` ``crudos,`WHERE tenant_id = ${scope.tenantId}`.
- `tenant_id` JAMÁS de payload/JWT (regla dura del milestone).
- `scope.tenantId` ya existe (166, `attachScope` con alias `attachCountryScope`).

### Claude's Discretion

- Dónde vive exactamente el iterador de tenants activos (p. ej. `forEachActiveTenant`
  en `tenant.ts`) y su forma (secuencial es lo obvio con lista=[1]).
- Forma del test del criterio 3 (2 tenants sembrados, suspendido no se procesa):
  unit del iterador + integración con un cron representativo parece suficiente.
- Selección exacta de rutas de la batería representativa (D-09) — el planner elige
  las de mayor riesgo real de mass-assignment.
- Cómo el webhook construye y pasa el `TenantContext` sin cambiar firmas de services
  (coherente con D-02).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de tenancy (fuente de verdad de esta fase)

- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3 (capa 2) — **Código
  propuesto de `tenantWhere`/`tenantValues`** (firma exacta, convenciones de WHERE e
  INSERT). La fase implementa esto tal cual.
- `.docs/saas-multitenancy/06-estrategia-migracion.md` §2-§3 — Orden de capas y la
  **tabla de caminos sin request** (webhook/crons/CLI/tv_pairings) que define CON-04.
- `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` — Minas M6 (webhook
  auto-crea) y M7 (`tv_pairings` pre-claim).
- `.planning/phases/166-fundaci-n-tenants-anclas-y-scope-server-side/166-CONTEXT.md` —
  D-02 (scope server-side), CD-01 (suspensión total), CD-03 (rename gradual
  `attachScope`), forma del scope.

### Código canónico ya existente (leer en `origin/master`, NO en ramas viejas)

- `el-templo-api/src/modules/shared/country-scope.ts` — `attachScope` con
  `scope.tenantId` resuelto y default-deny; el tipo del scope que los helpers reciben.
- `el-templo-api/src/db/tenant-tables.ts` — Lista canónica de las 87 tablas gym-owned
  - `TENANT_GLOBAL_UNIQUES` (motivos M8) + allowlist; insumo para saber qué tablas
    cubre la regla de escritura.
- `el-templo-api/src/db/schema/wellhub.ts` — Comentarios que ya anticipan la
  derivación CON-04 (dejados por la 167/168).

### Reglas operativas del repo

- `.claude/skills/el-templo-db-migrations/SKILL.md` — Solo si apareciera necesidad de
  tocar DB (no prevista); tope aplicado en prod: 0196, reservar desde 0197.
- `.claude/skills/el-templo-change-control/SKILL.md` — Staging-first, worktree para la
  fase (el checkout principal es compartido y puede estar en rama vieja).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/shared/country-scope.ts` — el scope con `tenantId` ya
  resuelto server-side; los helpers nuevos consumen `{ tenantId }` de ahí.
- `el-templo-api/src/jobs/*.ts` — los 7 crons usan `cron.schedule(...)` con el mismo
  patrón (función exportada + registro en `index.ts`); envolver el cuerpo en el loop
  por tenant es mecánico y uniforme.
- `el-templo-api/src/modules/wellhub/service.ts` — ya resuelve
  `event_data.gym.id → findBranchByGymId()`; la derivación del tenant es agregar
  `branch.tenant_id` a lo que ese lookup ya devuelve. El caso `gym_sin_sede` ya
  responde 200 `skipped` (D-04 lo conserva).
- `el-templo-api/src/db/scripts/verify-tenant-*.ts` — ejemplos del idioma de scripts
  standalone del repo (conexión, salida, exit codes) para el helper CLI.

### Established Patterns

- Services singleton por app; el scope fluye **por argumento** (idioma existente,
  igual que `country` y `tx`) — por eso los helpers son funciones puras, no wrappers
  de `db`.
- Fail-closed default-deny ya establecido en el scope (166) — el helper CLI y el
  webhook siguen esa misma filosofía.
- `DEFAULT 1` en `tenant_id` (167) significa que los INSERTs existentes ya nacen bien
  hoy; el riesgo real de la fase es mass-assignment (spread del body), no columnas
  faltantes.

### Integration Points

- `el-templo-api/src/modules/shared/tenant.ts` — archivo NUEVO, corazón de la fase.
- `el-templo-api/src/index.ts` — registro de crons (el loop por tenant se engancha
  donde hoy se llama a cada `start*Jobs`/`schedule*`).
- `el-templo-api/src/modules/tv/pairing.ts` — anotación `/* tenant-safe: pairing
pre-claim */` + test del ciclo pairing→claim estampando tenant.
- `el-templo-api/test/` — tests de integración nuevos; los fixtures 2-tenant formales
  son de la 171, esta fase siembra su segundo tenant ad-hoc como hizo la 168
  (tenant id fijo 90168 en `con-01-uniques-cross-tenant.test.ts` — reusar el patrón).

</code_context>

<specifics>
## Specific Ideas

No hubo pedidos específicos más allá del diseño validado — Franco eligió las opciones
recomendadas en las 4 áreas (pidió y recibió aclaración de qué significa "scripts CLI"
antes de decidir D-07).

</specifics>

<deferred>
## Deferred Ideas

- Plumbing del `TenantContext` hacia dentro de los services que los crons/webhook
  llaman — es exactamente la adopción módulo a módulo (fases 172-175), no de esta.
- Barrido 100% de rutas de escritura con el test de `tenantId` en body — llega con el
  manifiesto de rutas y la batería ISO-03 (fases 171-172).
- Remover el `DEFAULT 1` de `tenant_id` (que la columna exija valor explícito) — solo
  tendría sentido post-adopción completa; ni siquiera está roadmapeado, anotado acá
  para no perderlo.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — falso positivo por keyword (ya revisado y NO
  foldeado en la 166: rollout de datos del árbol SPOM v5.1, sin relación con tenancy).

</deferred>

---

_Phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc_
_Context gathered: 2026-07-27_
