# Phase 168: Contratos SQL — uniques compuestas e índices por `tenant_id` - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Los contratos de unicidad dejan de ser globales donde un segundo gimnasio colisionaría:
las ~10 uniques del doc 06 §1-D pasan a `(tenant_id, …)` (incluida la obligatoria
`campaign_unsubscribes.email` — mina M3), las 11 de la lista M8 quedan explícitamente
globales con motivo anotado y test, y CON-02 (toda tabla gym-owned con índice de prefijo
`tenant_id`) queda verificado por assert contra `information_schema`. Tanda D del doc 06:
1 migración (**0196**) + schema Drizzle + tests. El código que inserta NO cambia (los
valores ya son únicos dentro del tenant 1); cero cambio de comportamiento para el staff.
(CON-01, CON-02)

Fuera de esta fase: helpers `tenantWhere`/`tenantValues` y `TenantContext` (169),
sentinel de pool y lint CI (170), manifiesto de rutas y fixtures 2-tenant (171),
adopción por módulo (172-175). Las uniques de módulos Templo (`sessions.day_id` —M5—,
`aura_config.source_type`, slugs de blog/gladius, catálogos SPOM) NO se tocan: quedan
globales como deuda consciente mientras SPOM/marketing sean Templo-only.

</domain>

<decisions>
## Implementation Decisions

### Lockeadas por diseño (validadas — NO re-litigar; fuentes en canonical_refs)

- **D-01:** La lista de conversión es EXACTAMENTE la del doc 06 §1-D: `users.email`,
  `users.dni`, `users.referral_code`, `branches.code`, `cost_centers (name, country)`,
  `promo_plans.promo_code`, `campaign_unsubscribes.email`, `notification_templates.template_key`,
  `day_modes.day_of_week`, `holidays (country, date)`, `formats.name`. Todas →
  `UNIQUE(tenant_id, …)`.
- **D-02:** La lista M8 (11 uniques) queda GLOBAL a propósito, aprobada completa el
  2026-07-26 (§8-Q4): `users.gympass_id`, `branches.wellhub_gym_id`,
  `wellhub_classes.wellhub_class_id`, `wellhub_slots.wellhub_slot_id`,
  `wellhub_bookings.booking_number`, `wellhub_events.event_id`,
  `refresh_tokens.token_hash`, `device_tokens.token`, `tv_devices.token_hash`,
  `tv_pairings.user_code` / `device_code_hash`. Racional: ids de plataforma externa
  (la unique global impide que 2 tenants reclamen el mismo recurso) y secretos random
  con lookup pre-scope (componer por tenant es circular).
- **D-03:** Numeración: reservar desde **0196** verificando el máximo real en
  `_migrations` al arrancar (tope aplicado en prod al 2026-07-27: 0195). Reglas del
  repo: SQL commiteado junto al schema, nunca `;` en comentarios SQL, runner propio.
- **D-04:** El mismo email podrá existir en 2 tenants — la ambigüedad de login
  cross-tenant es una decisión DIFERIDA por diseño (doc 06 §1-D: "compatible con los
  3 escenarios"). No resolver ni bloquear acá.

### Índices secundarios para lookups por valor solo (discutido 2026-07-27)

- **D-05:** Al componer las uniques, los lookups por el valor solo pierden el índice
  (el valor pasa a 2º campo). Se agregan índices secundarios NO-unique en la misma
  migración, solo en tablas cuyo volumen crece con el uso:
  - `users`: `INDEX(email)` (login, `auth/routes.ts:69`), `INDEX(dni)` (registro,
    `auth/routes.ts:85`), `INDEX(referral_code)` (canje, `referrals/service.ts:124`).
  - `campaign_unsubscribes`: `INDEX(email)` (filtro NOT EXISTS de envíos).
- **D-06:** Los catálogos chicos (<100 filas: `promo_plans`, `notification_templates`,
  `day_modes`, `holidays`, `formats`, `cost_centers`, `branches`) NO reciben índice
  secundario — sería ruido.

### Índices de CON-02 y empaquetado (discutido 2026-07-27)

- **D-07:** **Las FK de la fase 167 ya dejaron índice auto-creado `(tenant_id)` en las
  87 tablas** (las migs 0192-0195 crearon `ADD CONSTRAINT fk_*_tenant FOREIGN KEY` sin
  índice explícito → InnoDB lo auto-creó). Esos índices SATISFACEN CON-02: no se agrega
  ningún `INDEX(tenant_id)` explícito ni se dropean los que quedan redundantes en las
  tablas que reciben unique compuesta. Cero DDL extra para CON-02; el assert los cuenta.
- **D-08:** UNA sola migración **0196** con toda la tanda D: uniques compuestas +
  índices secundarios, con el estilo de comentarios-narrativa de la 0192 (contexto,
  porqués, trampas). Schema Drizzle actualizado en el mismo commit. Nota DDL: convertir
  cada unique con un solo `ALTER TABLE ... DROP INDEX ..., ADD UNIQUE ...` atómico
  donde sea posible (sin ventana sin contrato de unicidad).
- **D-09:** Rollout dentro de la fase, patrón 166/167: rama propia desde
  `origin/master` (worktree — el checkout principal está en otra rama y ATRASADO),
  staging → pipeline aplica a `eltemplo_staging`, luego master → `eltemplo`. Pushes
  SIEMPRE con OK previo de Franco.

### Lista de tablas gym-owned y asserts (discutido 2026-07-27)

- **D-10:** Nace `el-templo-api/src/db/tenant-tables.ts`: módulo versionado en runtime
  (no en `test/` — el sentinel de la fase 170 lo necesita en prod) que clasifica TODAS
  las tablas: 87 gym-owned + globales explícitas (`tenants`, `tenant_settings` —KV por
  tenant pero es infra—, `labs_inquiries`, `system_settings`, `_migrations`, …).
  Single source of truth que las fases 170 (sentinel) y 171 (manifiesto) reutilizan.
- **D-11:** Assert CON-02 **fail-closed**: el test recorre `information_schema` de la
  DB de test y exige (a) toda tabla gym-owned tiene un índice cuyo 1er campo es
  `tenant_id` (los auto-creados por FK cuentan), y (b) toda tabla existente está
  clasificada — tabla nueva sin clasificar = rojo.
- **D-12:** Verificación contra las bases reales, patrón COL-02 de la 167: tras aplicar
  la 0196 en cada base, correr la verificación de uniques+índices contra
  `eltemplo_staging` y `eltemplo` (SSH con OK previo). La fase cierra con evidencia
  real en ambas bases, no solo con la suite.

### Anotación y test de las M8 (discutido 2026-07-27)

- **D-13:** El motivo de cada unique global vive CENTRAL en `src/db/tenant-tables.ts`
  (lista M8 con motivo por unique, fuente del test) + comentario de UNA línea junto a
  la unique en cada schema file (p. ej. `// tenant-global (M8): secreto random, lookup
pre-scope`) para que nadie la "arregle" en el futuro.
- **D-14:** Test de uniques **fail-closed total**: recorre TODAS las uniques de tablas
  gym-owned vía `information_schema` y exige que cada una o arranque con `tenant_id`, o
  esté en la allowlist (11 M8 + uniques Templo-module en deuda consciente + PKs). Una
  unique global nueva sin clasificar = rojo.

### Claude's Discretion

- Forma exacta del módulo `tenant-tables.ts` (arrays vs record con categoría/motivo),
  nombres de índices/constraints, y ubicación de los tests dentro de la suite.
- Mecánica DDL fina (orden DROP/ADD, algoritmo INPLACE, si MySQL exige pasos separados
  en alguna tabla por la FK) — el planner/executor la resuelve reproduciendo local.
- Los tests de CON-01 (sembrar tenant 2 + insertar duplicados cross-tenant) siguen los
  success criteria del ROADMAP tal cual; helpers de seeding mínimos propios de la fase
  (los fixtures 2-tenant completos son de la 171 — no adelantarlos).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de tenancy (decisiones validadas — fuente de verdad de esta fase)

- `.docs/saas-multitenancy/06-estrategia-migracion.md` §1-D — La tabla EXACTA de
  conversión, la lista M8 que queda global, la regla de índices y el punto de acople
  código↔schema (§6). QUÉ hace esta fase.
- `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` §5.6 + §6 (minas M3, M5,
  M8) — Racional completo por unique; M8 aprobada completa y M3 resuelta (supresión por
  tenant, §8-Q5).
- `.docs/saas-multitenancy/README.md` §4.3-§5 — Modelo de aislamiento y la nota
  obligatoria de índices por `tenant_id`.

### Estado real post-167 (leer antes de escribir DDL)

- Worktree `et-167-columnas` (`/home/franco/projects/et-167-columnas`), migraciones
  `el-templo-api/src/db/migrations/0192-0195_*.sql` — El estilo de comentarios-narrativa
  a imitar, el ciclo por tabla (DEFAULT 1 en ADD y en MODIFY — trampa verificada en
  prod), y la evidencia de que las FK se crearon SIN índice explícito (origen de D-07).
  OJO: el checkout principal está en `fix/referral-preview-y-refresh-ficha` con migs
  hasta 0181 — partir SIEMPRE de `origin/master`.
- `.planning/phases/167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n/167-07-SUMMARY.md`
  — Cómo se corrió el verificador COL-02 contra las dos bases (patrón de D-12) y el
  hallazgo `completed_sessions.day_id` huérfanas (NO tocar acá; es deuda de ISO-03).

### Reglas operativas del repo

- `.claude/skills/el-templo-db-migrations/SKILL.md` — Runner propio, `_migrations` como
  fuente de verdad, numeración a mano (reservar desde 0196), trampa del `;` en
  comentarios, staging/prod comparten host MySQL con bases separadas, provisioning de
  la DB de tests.
- `.claude/skills/el-templo-change-control/SKILL.md` — Staging-first estricto, pushes
  con OK previo, `git add` explícito por ruta.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Migraciones `0192-0195` (worktree `et-167-columnas`) — plantilla de estilo y de
  verificación; la 0196 sigue esa narrativa.
- `el-templo-api/test/helpers.ts` + `test/setup.ts` — provisioning de la DB de test por
  migraciones (la 0196 entra sola al provisioning; `MAX_TEST_WORKERS=1`). El seed
  `tenants id=1` ya existe desde la 166; sembrar el tenant 2 en los tests de CON-01 es
  un INSERT directo.
- Script verificador de la 167 (COL-02, en `src/db/scripts/` de esa rama) — molde para
  la verificación de D-12 contra staging/prod.

### Established Patterns

- Lookups por valor solo que motivan D-05: `auth/routes.ts:69` (login por email),
  `auth/routes.ts:85` (registro por DNI), `referrals/service.ts:124` (canje de código),
  `shared/member-search.ts:36` (búsqueda por DNI con LIKE — no usa índice hoy tampoco).
- `members/service.ts:908` documenta la carrera de unicidad de DNI (T-148-02) — el
  contrato de "duplicado rechazado" que la suite protege y NO puede cambiar para el
  tenant 1.
- Drizzle: `unique()`/`uniqueIndex()` en schema files; recordar que el 1er argumento de
  `mysqlEnum` es el NOMBRE DE COLUMNA (trampa documentada) y que las columnas sin
  calificar en `.select()` rompen subqueries correlacionadas.

### Integration Points

- `el-templo-api/src/db/schema/*.ts` — ~10 schema files tocan su unique (users,
  branches, cost-centers, promo-plans (o donde viva promo_code), campaigns
  (campaign_unsubscribes), notification-templates, day-modes, holidays, formats) +
  comentarios M8 en users, branches, wellhub*, refresh-tokens, device-tokens, tv*.
- `el-templo-api/src/db/migrations/0196_*.sql` — la migración única de la tanda D.
- `el-templo-api/src/db/tenant-tables.ts` — módulo NUEVO (D-10), consumido por los
  tests de esta fase y por las fases 170/171.
- CI: la suite corre en CI (no local — regla del repo); typecheck local `tsc` sí.

</code_context>

<specifics>
## Specific Ideas

Franco eligió en todas las áreas la opción recomendada, con énfasis en el patrón
fail-closed (lista de tablas Y test de uniques) y en repetir el patrón operativo de la
166/167 (worktree + staging→prod dentro de la fase + verificación contra ambas bases).

</specifics>

<deferred>
## Deferred Ideas

- Limpieza de los índices de FK que quedan redundantes bajo las uniques compuestas
  (D-07 los deja a propósito) — si alguna vez molesta, es una migración cosmética
  aparte, post-v6.0.
- Ambigüedad de login con emails duplicados cross-tenant — decisión diferida del
  diseño (login/dominios), NO de esta fase.
- Uniques de módulos Templo (M5 `sessions.day_id`, slugs, catálogos SPOM) — deuda
  consciente; se resuelven solo si un tenant ≠ 1 activa esos módulos.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — matchea por la palabra "milestone"
  (`milestone_exercise_id` del árbol SPOM); es rollout de datos de v5.1, sin relación
  con tenancy. Ya había sido revisado y descartado en la fase 166.

</deferred>

---

_Phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id_
_Context gathered: 2026-07-27_
