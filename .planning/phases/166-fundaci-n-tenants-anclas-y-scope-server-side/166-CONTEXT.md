# Phase 166: Fundación — `tenants`, anclas y scope server-side - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Phase Boundary

El sistema conoce el concepto de tenant y lo resuelve solo. Existen `tenants` y
`tenant_settings` con El Templo sembrado como tenant `id=1`, las dos anclas del modelo
(`users`, `branches`) llevan `tenant_id NOT NULL` con FK e índice, y todo request
autenticado tiene `scope.tenantId` resuelto server-side en la misma query que hoy
resuelve el scope de país, con enforcement del estado del tenant (suspended/archived →
403). Sin downtime, sin cambio visible para el staff. (FUND-01..04)

Fuera de esta fase: las 85 tablas restantes (167), uniques compuestas (168), helpers y
`TenantContext` (169), sentinel/lint (170), manifiesto (171), adopción (172-175),
módulos (176). Sin UI de tenants en ninguna parte de v6.0.

</domain>

<decisions>
## Implementation Decisions

### Lockeadas por diseño (validadas — NO re-litigar; fuentes en canonical_refs)

- **D-01:** Schema de `tenants` + `tenant_settings` EXACTAMENTE como README §5 (enum
  status active/suspended/archived, slug unique, defaults AR/ARS/BsAs, KV con unique
  `(tenant_id, setting_key)`). Seed: una sola fila `id=1`, name "El Templo", slug
  `el-templo`, status `active`.
- **D-02:** `scope.tenantId` se resuelve server-side extendiendo `attachCountryScope`
  (el select a `users` que ya corre por request suma `tenant_id` + JOIN a `tenants`
  para el status). JAMÁS en el JWT ni aceptado de payload/query.
- **D-03:** Enforcement de `suspended`/`archived` en la MISMA query del scope (capa 1,
  costo ~cero) — no un hook aparte.
- **D-04:** Migraciones incrementales compatibles con código viejo: ADD COLUMN nullable
  (INSTANT en MySQL 8) → backfill `=1` → MODIFY NOT NULL + FK + índice. Tandas A
  (tenants/settings/seed) y B (anclas) del doc 06 §1.
- **D-05:** `tenant_settings` nace VACÍA (coexistencia gradual con `system_settings`,
  decidido 2026-07-02). Slugs reservados (`admin`, `api`, `www`, …) como constante en
  código, no en DB.
- **D-06:** Reservar el bloque de numeración de migraciones AL ARRANCAR el primer plan,
  verificando el máximo real en `_migrations` en ese momento (al 2026-07-26 el último
  es 0189, de la fase 164 TV que sigue viva en el worktree `et-164-tv` — el número
  puede haberse movido). Regla del repo: SQL commiteado junto al schema, nunca `;` en
  comentarios SQL.

### Claude's Discretion (Franco eligió "directo a plan" — recomendaciones de la sesión, el planner las adopta salvo que encuentre evidencia en contra)

- **CD-01 — Superficie de la suspensión:** un tenant `suspended` bloquea TODO lo
  autenticado del tenant (staff + member app + futuras superficies), no solo
  staff/admin — la suspensión es la palanca comercial total del SaaS; suspender "a
  medias" (socios entrenando mientras el dueño no paga) no es un estado que queramos
  soportar. El login en sí puede responder (pre-scope), pero todo lo scoped posterior
  da 403. Nota: el TV kiosk usa auth de device (no JWT/scope) — su gating por tenant
  llega con la adopción, no en esta fase; no bloquear acá.
- **CD-02 — Contrato del error:** 403 con código específico en el body
  (`error: "TENANT_SUSPENDED"` según el formato de error existente del API), no un 403
  genérico — cuesta cero ahora y permite que cualquier frontend muestre un mensaje
  claro el día que importe. Para el tenant 1 nunca debería verse.
- **CD-03 — Rename `attachCountryScope` → `attachScope`:** gradual, no big-bang: se
  exporta `attachScope` como nombre nuevo (misma función) y `attachCountryScope` queda
  como alias deprecado; los 55 call sites migran módulo a módulo durante la adopción
  (172-175). El tipo `CountryScope` se extiende con `tenantId` (renombrar el tipo
  también puede ser gradual vía alias). Evita un commit mecánico de 10 módulos en la
  fase fundacional.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de tenancy (decisiones validadas — la fuente de verdad de esta fase)

- `.docs/saas-multitenancy/README.md` §4-§5 — Modelo de aislamiento, enforcement en 5
  capas, **schema completo de `tenants` + `tenant_settings` (§5, validado línea por
  línea)** y secuencia de migración sin downtime.
- `.docs/saas-multitenancy/06-estrategia-migracion.md` §0-§2 — Tandas A y B (qué hace
  exactamente esta fase), regla de escritura, orden de capas de código.
- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3 (capa 1) — Diseño de
  `attachScope`/`scope.tenantId` y por qué el enforcement va en la misma query.
- `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` §1.1 — Las anclas
  (`users`, `branches`) con sus uniques existentes (NO se tocan en esta fase — las
  compuestas son de la 168).

### Reglas operativas del repo

- `.claude/skills/el-templo-db-migrations/SKILL.md` — Runner propio, `_migrations` como
  fuente de verdad, numeración a mano, trampa del `;` en comentarios, staging/prod
  comparten host MySQL con bases separadas.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/shared/country-scope.ts` — EL archivo de la fase:
  `CountryScope` interface + `attachCountryScope(request, db)` ya resuelve
  country/branchIds/isOwner/role/userBranchId con UN select a `users` por request.
  Extender ese select con `tenant_id` + JOIN a `tenants` (status) es exactamente el
  diseño. Patrón fail-closed ya establecido ahí (country NULL → deny, no leak).
- `el-templo-api/src/db/schema/branches.ts` / `users.ts` — plantillas de convención
  Drizzle del repo (int PK autoincrement, timestamps created_at/updated_at, mysqlEnum —
  ojo: el 1er argumento de mysqlEnum es el NOMBRE DE COLUMNA, trampa documentada).
- `el-templo-api/test/helpers.ts` — `createStaffUser`/`getAuthToken` para los tests de
  integración del 403 de suspensión (se les suma soporte de tenant recién en la 171).

### Established Patterns

- 55 call sites de `attachCountryScope` en ~10 módulos (analytics, members, finance,
  subscriptions incl. member-routes, campaigns, coach…) — el hook corre después de
  `authenticate` en orden fijo por módulo. El rename big-bang tocaría todos: por eso
  CD-03 recomienda alias gradual.
- El JWT carga solo `{ userId, email, role }` (plugins/auth.ts) — coherente con D-02:
  el tenant JAMÁS viaja en el token; cambios de estado aplican sin re-login.
- Services singleton por app (construidos en el plugin body capturando `fastify.db`) —
  NO re-instanciar por request; el scope fluye por argumento (idioma existente).

### Integration Points

- `el-templo-api/src/db/schema/index.ts` — export del schema nuevo `tenants.ts`
  (conflicto conocido de registro adyacente si otra rama toca la misma zona).
- `el-templo-api/src/db/migrations/` — 2 migraciones nuevas (tanda A y tanda B), número
  a reservar según D-06.
- Tests existentes: la suite completa debe pasar SIN ajustar expectativas (criterio de
  éxito 4 de la fase) — el seed `id=1` tiene que entrar también en el provisioning de
  la DB de tests (`test/setup.ts`, DB por worker, `MAX_TEST_WORKERS=1` en este repo).

</code_context>

<specifics>
## Specific Ideas

No hubo pedidos específicos de Franco más allá del diseño ya validado — eligió
"directo a plan" confiando en los docs. Las tres zonas grises presentadas quedaron en
Claude's Discretion (CD-01..03) con recomendación explícita.

</specifics>

<deferred>
## Deferred Ideas

- Gating por tenant del TV kiosk (auth de device, sin scope JWT) — llega con la
  adopción/manifiesto (fases 171-175), no en la fundación.
- UI/admin de tenants (alta, suspensión desde pantalla) — fuera de v6.0 por completo;
  la suspensión se opera por DB/script hasta que exista superficie de plataforma.
- Todo `v51-milestone-data-rollout.md` revisado y NO foldeado: matchea por la palabra
  "milestone" (`milestone_exercise_id` del árbol SPOM) — es rollout de datos de v5.1,
  sin relación con tenancy.

</deferred>

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Context gathered: 2026-07-26_
