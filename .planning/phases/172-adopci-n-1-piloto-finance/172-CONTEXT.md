# Phase 172: Adopción 1 (piloto) — `finance` - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning

<domain>
## Phase Boundary

El módulo más crítico del admin (cobros, caja, deudas, centros de costo, balances)
migra al patrón completo de tenancy y se convierte en la **receta repetible** de las
fases 173-175. End state: services con `TenantContext`, todo WHERE/INSERT sobre las
6 tablas de finance por `tenantWhere`/`tenantValues`, la entrada `finance` en
`TENANT_STRICT_MODULES` (la PRIMERA del milestone — sentinel en throw en test/dev),
batería de aislamiento ISO-03 verde ruta por ruta según el manifiesto, cero entradas
de allowlist sobre tablas finance, y el staff cobrando/validando/arqueando con los
**mismos números** que antes (comparación explícita en staging).

**El alcance es POR TABLA, no por directorio:** el throw del sentinel aplica a toda
query sobre las 6 tablas venga de donde venga — hoy hay 33 entradas de allowlist en
13 archivos, y 6 de esos archivos son de OTROS módulos (analytics ×4, reports,
subscriptions, members, coach) más `scripts/backfill-historical-payments.ts`.

Fuera de esta fase: migrar el resto de analytics/reports/subscriptions/members/coach
(fases 173-175), tablas AURA (`aura_balances`/`aura_transactions` — gamification,
fase 176), remover el `DEFAULT 1` de `tenant_id`. **Cero migraciones de DB
previstas** (si apareciera una: reservar desde 0197).

**Base de código:** worktree desde `origin/master` (tren 170+171 = `29e61c8b`,
mergeado y en prod 2026-07-30). El checkout principal está en una rama vieja y es
COMPARTIDO — patrón worktree de las fases 166-171. **Prerequisito de ejecución:**
el fix CR-CAJA tiene que estar en master antes del execute (ver D-13).

</domain>

<decisions>
## Implementation Decisions

### Frontera del strict (cross-módulo)

- **D-01:** **Se migra TODO acceso a las 6 tablas finance, esté donde esté.** Los
  métodos de analytics/reports/subscriptions/members/coach que tocan esas tablas
  reciben scope y usan los helpers — pero SOLO esos métodos (plumbing mecánico:
  sus rutas ya tienen `request.scope` desde la 166). Las 33 entradas de allowlist
  sobre tablas finance salen todas. NO se abre canal de exención en el sentinel
  (el skiplist existente es solo para falsos positivos del parser, decisión 170).
- **D-02:** `scripts/backfill-historical-payments.ts` recibe **retrofit
  `requireTenant`** + helpers (receta 169 D-06; ejemplar:
  `scripts/seed-onboarding-aura.ts`). Sale de la allowlist (3 entradas).
- **D-03:** El throw se activa **al final de la fase**: se migran todos los accesos
  primero y el último plan escribe la entrada en `TENANT_STRICT_MODULES` + demuestra
  el fail-closed **en vivo** (sonda revertida sin commitear — patrón
  168-05/169-04/171). La suite nunca queda roja entre planes; cada plan es
  commiteable.
- **D-04:** Firma estándar de la receta: **`TenantContext` plano como PRIMER
  parámetro** de cada método migrado; el route handler hace
  `assertTenant(request.scope, "<where>")` en el call site (narrowing visible en el
  borde). Precedentes ya escritos: `cash-register-service.ts:783` y el claim de TV
  (169-06). Prohibidos `!` y `?? 1` (regla 169-01).

### Alcance de tablas y del módulo

- **D-05:** La entrada strict lleva **exactamente las 6 tablas del ROADMAP**:
  `financial_transactions`, `transaction_links`, `balances`, `cash_registers`,
  `cost_centers`, `debt_management`. `aura_balances`/`aura_transactions` quedan
  FUERA (las escribe gamification — su throw llega con su módulo). El planner
  verifica contra `GYM_OWNED_TABLES` que no haya una 7ª tabla finance olvidada.
- **D-06:** **Adentro del módulo, archivos limpios:** los accesos de
  `src/modules/finance/*` a tablas no-finance (`users`, `branches`,
  `subscriptions`, `subscription_plans`, `program_enrollments`,
  `user_status_history` — ~14 entradas) también se scopean de paso. Resultado:
  **cero entradas de allowlist con `file` en `src/modules/finance/`**. Esas tablas
  NO entran en strict.
- **D-07:** **Afuera del módulo, cirugía mínima:** en archivos ajenos se tocan
  ÚNICAMENTE las queries sobre las 6 tablas strict. Migrar el resto de esos
  archivos es la fase de su módulo (173-175) — el planner no infla el alcance.

### Batería ISO-03 (la plantilla)

- **D-08:** **Casos a mano + gate de cobertura fail-closed:** cada ruta finance
  `tenant-scoped` (~38 en el manifiesto) tiene su caso escrito a mano (cada una
  necesita seeding propio), y un gate derivado de `test/tenant-manifest.ts` exige
  que TODA ruta finance tenant-scoped tenga caso — ruta nueva sin caso = rojo.
  Mismo idioma que iso-01/iso-02.
- **D-09:** **Contrato de respuesta cross-tenant = 404/vacío** (para TODO el
  milestone): el recurso de otro tenant es indistinguible de uno inexistente.
  GET by-id → 404, listas → sin filas del B, escrituras sobre recursos del B → 404. NO 403 (filtraría existencia y exigiría la query sin scope que el sentinel
  prohíbe). Sale gratis con `tenantWhere`: la fila no matchea y el código cae en
  su rama not-found actual.
- **D-10:** Cada caso corre con el **rol mínimo real** que puede usar esa ruta
  (coach para coach-load, owner donde es owner-only, admin donde corresponde) —
  precedente 169-08: la evidencia más fuerte viene del borde menos privilegiado.
  Las fixtures de la 171 ya crean staff por tenant con rol parametrizable.
- **D-11:** La receta completa de adopción (entrada strict, vaciado de allowlist,
  firma `TenantContext`, batería, comparación de números) queda documentada en un
  **doc nuevo `.docs/saas-multitenancy/07-receta-adopcion.md`**, escrito al CERRAR
  la fase con lo aprendido. Las fases 173-175 lo cargan como canonical ref. La
  cabecera del test de la batería apunta ahí.

### Criterio "mismos números" y coordinación

- **D-12:** Comparación explícita = **script versionado de snapshot de endpoints**:
  golpea los agregadores de finance (`transactions/summary`,
  `cash-registers/balances`, `pending-tray`, `movements-history`, deudas, exports)
  con un **rango de fechas FIJO histórico**, guarda el JSON antes del deploy de la
  fase en staging y diffea después. Determinístico y replicable por 173-175. (El
  bajo uso de staging no molesta acá: lo que importa es que los DATOS estén
  quietos entre corridas.)
- **D-13:** **CR-CAJA primero:** el fix "la caja del cobro sigue la sede del socio"
  (backend a medio commitear en el checkout compartido; toca `coach-load-routes.ts`
  y `subscriptions/service.ts` — archivos que esta fase reescribe) se termina y
  shippea a staging/master ANTES de ejecutar la 172. Discutir/planificar puede
  seguir en paralelo — solo el execute espera un master que ya lo tenga.

### Lockeadas por fases anteriores (NO re-litigar; fuentes en canonical_refs)

- Helpers `tenantWhere`/`tenantValues` con firma del doc 03 §3; `tenantWhere` como
  PRIMER término de todo `and(...)`; en ` sql` ``crudos,`WHERE tenant_id = ${ctx.tenantId}` (169).
- `tenant_id` JAMÁS de payload/JWT; `tenantValues` pone el tenant DESPUÉS del
  spread (169-01). `tenantValues` NO ensancha tipos literales — sin `as const`
  (hallazgo 169-07).
- Allowlist del lint solo se achica; entradas ganadas o stale = CI rojo (170
  D-13/D-14); coherencia strict/allowlist enforced: tabla strict con entradas
  vivas = rojo (D-15) — esta fase DEBE vaciar las entradas al activar el throw.
- Exenciones `/* tenant-safe: <motivo> */` en comentario de bloque APARTE (no
  anidado en `/** */`), ancladas por AST al sitio del write (169/170).
- Manifiesto y fixtures: `test/tenant-manifest.ts` (372 rutas, gate ISO-01) y
  `test/fixtures/second-tenant.ts` (`TENANT_DOS = 90671`, `seedSecondTenant`
  idempotente + `limpiarSegundoGimnasio` FK-ordenado) — la 172 los CONSUME, no
  los rediseña (171).

### Claude's Discretion

- Reparto de planes/waves (por archivo, por tabla o por capa) mientras respete
  D-03 (throw al final) y commits verdes.
- Forma exacta del gate de cobertura de la batería (cómo se deriva "ruta finance"
  del manifiesto — por prefijo `/api/admin/finance` + `advanced-finance` u otro
  criterio) y organización del/los archivos de test.
- Selección exacta de endpoints y rango de fechas del script de snapshot (D-12),
  y dónde vive el script.
- Cómo llega el `TenantContext` a los métodos ajenos migrados (D-01) sin cambiar
  más firma que la necesaria — coherente con D-02 de la 169.
- Ids de tenants ad-hoc en tests nuevos: seguir la convención 90169/90269/90369/
  90469/90671 sin colisiones (archivos con el mismo id se pisan con
  `isolate: false`).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de tenancy (fuente de verdad)

- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3 — Las 5 capas; firma
  de helpers (capa 2), sentinel (capa 3), lint (capa 4), tests de aislamiento
  (capa 5). La adopción es la capa 5 sobre las 4 ya construidas.
- `.docs/saas-multitenancy/06-estrategia-migracion.md` §2-§3 — Orden de adopción
  por criticidad y el porqué de finance primero.
- `.planning/phases/169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc/169-CONTEXT.md`
  — D-02 (services mantienen firma hasta su adopción — esta fase ES la adopción de
  finance), D-06/D-07 (contrato CLI), convenciones lockeadas.
- `.planning/phases/170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci/170-CONTEXT.md`
  — D-05/D-06 (lista strict por módulo→tablas, la 172 escribe la primera entrada),
  D-13/D-14/D-15 (allowlist ratchet y coherencia strict/allowlist), D-17 (dos
  canales de exención).
- `.planning/phases/171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant/171-CONTEXT.md`
  (en `origin/master` — NO existe en el checkout viejo) — decisiones del
  manifiesto y de las fixtures que esta fase consume.

### Código canónico ya existente (leer en `origin/master` = `29e61c8b`, NO en ramas viejas)

- `el-templo-api/src/db/tenant-tables.ts` — `GYM_OWNED_TABLES`,
  `TENANT_STRICT_MODULES` (vacía; acá va `finance: [...las 6]`), `isStrictTable`.
  Gates de forma en `test/db/tenant-tables.test.ts` — extender, no romper.
- `el-templo-api/tenant-lint-allowlist.json` — 501 entradas; las 33 de tablas
  finance + las ~14 no-finance de archivos del módulo son las que esta fase borra.
  El header del JSON documenta el contrato del ratchet.
- `el-templo-api/src/modules/shared/tenant.ts` — `tenantWhere`, `tenantValues`,
  `assertTenant`, `TenantContext`, `forEachActiveTenant`.
- `el-templo-api/src/modules/finance/` — los 11 archivos del módulo
  (transaction-service, balance-service, cash-register-service, movement-service,
  routes, coach-load-routes, schemas, firm-money, constants, types, index).
  `cash-register-service.ts:783` ya tiene el precedente de firma con
  `TenantContext` (fix del lint en staging, `e3ba7ae5`/`236dbd80`).
- `el-templo-api/test/tenant-manifest.ts` — 372 rutas clasificadas; las finance
  para el gate de cobertura de la batería.
- `el-templo-api/test/fixtures/second-tenant.ts` — `TENANT_DOS = 90671`,
  `seedSecondTenant`, `limpiarSegundoGimnasio`.
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` y
  `el-templo-api/test/tenancy/iso-02-fixtures.test.ts` (nombre a confirmar en
  master) — el idioma de gates que la batería iso-03 copia.
- `el-templo-api/src/db/scripts/require-tenant.ts` +
  `el-templo-api/scripts/seed-onboarding-aura.ts` — receta CLI para el retrofit
  de `backfill-historical-payments.ts` (D-02).
- Archivos ajenos con accesos finance a migrar (D-01):
  `src/modules/analytics/{service,advanced-finance-service,ltv-service,ticket-service}.ts`,
  `src/modules/reports/service.ts`, `src/modules/subscriptions/service.ts`,
  `src/modules/members/service.ts`, `src/modules/coach/service.ts`,
  `src/scripts/backfill-historical-payments.ts`.

### Reglas operativas del repo

- `.claude/skills/el-templo-change-control/SKILL.md` — Staging-first, worktree
  para la fase (checkout compartido en rama vieja), git add explícito, pedir OK
  antes de push.
- `.claude/skills/el-templo-db-migrations/SKILL.md` — Solo si apareciera una
  migración (no prevista); tope prod: 0196, reservar desde 0197.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Las 4 capas ya en prod: helpers (169), sentinel + lint + allowlist ratchet
  (170), manifiesto + fixtures 2-tenant (171). Esta fase no construye
  infraestructura — la consume.
- `SENTINEL_INVENTORY=1` (170 D-08): correr la suite en modo inventario da la
  lista determinística de queries violadoras por tabla — el planner puede usarla
  para el inventario fino de sitios a migrar (complementa las 33+14 entradas de
  la allowlist, que son por archivo+tabla, no por statement).
- `pnpm lint:tenant` local: verificación inmediata de que las entradas borradas
  no reaparecen como violaciones.
- Batería D-09 de la 169 (`test/tenancy/`, 5 rutas × spoofeo+control) — el patrón
  de aserción por `SELECT tenant_id ... WHERE id = ?` sobre la fila creada.

### Established Patterns

- Demo fail-closed en vivo con sonda revertida sin commitear (168-05, 169-04, 171) — D-03 la exige para el throw del sentinel.
- `ctx` primero en la firma para que call sites viejos no compilen con argumentos
  corridos (169-06).
- Trampa de tests: `cleanAllTestData` NO limpia `branches`; sedes sobreviven
  entre tests y `tenants` no se puede borrar con FK viva — `limpiarSegundoGimnasio`
  de la 171 ya lo maneja FK-ordenado.
- Trampa de worktree: `.env`/`.env.development` no viajan (gitignoreados) —
  copiarlos de un worktree hermano; provisioning fresco necesita
  `--hookTimeout=900000`.
- El throw del sentinel llega envuelto en `DrizzleQueryError.cause` vía Drizzle
  (hallazgo 170) — los asserts de la demo deben mirar la causa.
- CI: la trampa de `paths-filter` (`event.before`) y el gate D-14 de allowlist
  comparan contra la rama base — un push que solo BORRA entradas es verde por
  construcción.

### Integration Points

- `el-templo-api/src/db/tenant-tables.ts` — entrada `finance` en
  `TENANT_STRICT_MODULES` (el interruptor del throw).
- `el-templo-api/tenant-lint-allowlist.json` — borrado de ~47 entradas (33
  finance-table + ~14 no-finance de archivos del módulo).
- `el-templo-api/src/modules/finance/*` — firmas con `TenantContext`, helpers en
  todo acceso; route handlers con `assertTenant`.
- Métodos puntuales de analytics/reports/subscriptions/members/coach que tocan
  tablas finance (D-01, cirugía mínima D-07).
- `el-templo-api/test/tenancy/` — batería iso-03 + gate de cobertura.
- `.docs/saas-multitenancy/07-receta-adopcion.md` — doc NUEVO al cierre (D-11).

</code_context>

<specifics>
## Specific Ideas

Franco eligió la opción recomendada en las 13 preguntas de las 4 áreas, sin pedidos
fuera del diseño validado. Único énfasis operativo: la secuencia con CR-CAJA
(D-13) — el fix es producto que el staff espera y va primero.

</specifics>

<deferred>
## Deferred Ideas

- Migración del resto de analytics/reports/subscriptions/members/coach — fases
  173-175 (D-07 lo protege explícitamente).
- `aura_balances`/`aura_transactions` en strict — con la adopción de su módulo
  (gamification, fase 176 o posterior).
- Remover el `DEFAULT 1` de `tenant_id` — post-adopción completa, no roadmapeado
  (ya anotado en la 169).
- Endurecer el sentinel de prod (log → throw) — pospuesto por diseño (README
  §4.2), no es de esta fase.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — falso positivo por keywords, ya revisado y NO
  foldeado en la 166, la 169 y la 170 (rollout de datos del árbol SPOM v5.1, sin
  relación con tenancy).

</deferred>

---

_Phase: 172-adopci-n-1-piloto-finance_
_Context gathered: 2026-07-30_
