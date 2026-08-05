# Phase 173: Adopción 2 — `members` + guarda de consistencia de anclas - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning

<domain>
## Phase Boundary

El módulo de socios y staff se migra al patrón completo de tenancy siguiendo la
receta destilada del piloto (`.docs/saas-multitenancy/07-receta-adopcion.md`), y
—porque toca la **otra ancla**— el sistema garantiza que un usuario nunca queda
apuntando a una sede de otro gimnasio. End state: `members` aislado
(services con `TenantContext`, helpers en todo acceso, fuera de la allowlist,
sentinel en throw para sus tablas, batería ISO-03 verde) y el invariante
`user.tenant_id === branch.tenant_id` enforced a nivel app **y** en la DB en
todos los caminos que reescriben la sede, incluido el cron de recategorización.

**El alcance es POR TABLA, no por directorio** (igual que el piloto). La
diferencia de escala con `finance` es `users`: es la tabla más joineada del
sistema y sus accesos violadores viven en **50 archivos** de casi todos los
módulos. Se migran esos accesos, no esos módulos (cirugía mínima, D-07 del
piloto).

**Números medidos en `et-172` (2026-08-04):**

| Dato                                                        | Valor                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entradas de allowlist sobre tablas del módulo               | **79** (`users` 50, `member_profiles` 13, `user_status_history` 7, `user_branches` 4, `member_notes` 2, `user_sepa_details` 1, `member_logins` 1, `audit_log` 1) |
| Archivos que las contienen                                  | **52** — solo 2 del módulo (`members/routes.ts` 5, `members/service.ts` 14)                                                                                      |
| Rutas `tenant-scoped` del prefijo del módulo                | **29** (`/api/admin/members` 23 + `/api/admin/users` 5 + `/api/admin/leads` 1)                                                                                   |
| Sitios que reescriben la sede del socio (`branchUpdatedAt`) | **12** + 4 escrituras de `user_branches`                                                                                                                         |
| Migraciones                                                 | **1 bloque desde 0198** (unique + FK compuesta) — el resto es 100% código                                                                                        |

Fuera de esta fase: migrar el resto de analytics / scheduling / notificaciones /
campañas / referidos / wellhub / entrenamiento (fases 174-175), la cadena de
pricing (174), remover el `DEFAULT 1` de `tenant_id`.

**Base de código:** worktree desde `origin/staging` **después** del backmerge
master→staging (ver D-12). `origin/master` NO tiene la 172: su
`TENANT_STRICT_MODULES` está vacío. Todo el milestone se resuelve en staging y
viaja junto a master cuando esté listo (decisión de Franco, esta sesión).

</domain>

<decisions>
## Implementation Decisions

### Frontera del strict

- **D-01:** **`users` entra a `TENANT_STRICT_MODULES` en esta fase**, junto con
  las 7 tablas propias (`user_branches`, `member_profiles`, `member_notes`,
  `member_logins`, `user_status_history`, `user_sepa_details`, `audit_log`).
  Las **79** entradas de allowlist salen todas. Motivo: el gate D-15 no admite
  intermedio (tabla strict con entradas vivas = CI rojo), el ancla que ADO-07
  protege necesita también la capa 3, y diferirlo dejaría a 174/175 escribiendo
  queries nuevas sobre `users` sin red.
- **D-02:** En los **50 archivos ajenos**, **cirugía mínima** (D-07 del piloto):
  se toca ÚNICAMENTE la query sobre la tabla strict. Migrar el resto del archivo
  es la fase de su módulo. El planner NO infla el alcance.
- **D-03:** Los scripts de `src/db/` y `src/scripts/` que tocan `users`
  (`import-members`, `import-fecha-ingreso`, `import-turnos`, `import-vigentes`,
  `seed-staging`, `backfill-referral-codes`) reciben **retrofit `requireTenant`
  más helpers**, todos por igual — misma receta que el piloto aplicó a
  `backfill-historical-payments.ts` (ejemplar: `scripts/seed-onboarding-aura.ts`).
  **Cero exenciones `tenant-safe` nuevas** por esta vía.
- **D-04:** Los 7 jobs ya barren con `forEachActiveTenant` (169/171) pero
  **tener `ctx` ≠ estar migrado** (trampa (a) del doc 07): los que tocan tablas
  del módulo (`reassign-multibranch`, `notification-cron`, `expire-lost-leads`)
  migran sus queries acá porque el strict de `users` lo fuerza.

### Invariante de anclas (ADO-07)

- **D-05:** El invariante `user.tenant_id === branch.tenant_id` vive en **app +
  DB**: (a) helper único —resolvedor que devuelve la sede ya validada, o
  `assertBranchDelGimnasio(ctx, branchId)`— en los **12 sitios** que reescriben
  la sede (`members/service.ts` ×4, `subscriptions/service.ts` ×3,
  `users/service.ts` ×2, `auth/routes.ts`, `wellhub/service.ts`,
  `jobs/reassign-multibranch.ts`) más las 4 escrituras de `user_branches`;
  (b) **unique `(tenant_id, id)` en `branches` + FK compuesta
  `users(tenant_id, branch_id)`** — hoy `branches` solo tiene
  `uq_branches_tenant_code`. La FK es el cinturón que ningún SQL crudo, script
  ni backfill puede saltear.
- **D-06:** **Contrato del rechazo = 404 / sede inexistente** (D-09 del piloto,
  vale para todo el milestone). Sale casi gratis: si el helper resuelve la sede
  con `tenantWhere`, la fila ajena no matchea y cae en la rama "sede no
  encontrada" existente. **Cero `403` esperados** — un 403 confirmaría que la
  sede existe en otro gimnasio.
- **D-07:** **El cron: filtro + guarda antes del UPDATE.** Las sedes candidatas
  se resuelven con `tenantWhere` (sale de D-01) **y además** el UPDATE pasa por
  el helper de D-05: si la sede no es del gimnasio, **saltea al socio, lo loguea
  con `tenantId` como campo estructurado y sigue** — nunca aborta el barrido.
  Test que le ofrece sedes de los dos gimnasios y verifica que solo considera
  las propias (SC3).
- **D-08:** **Alcance de la guarda: el ancla y sus tablas** — `users.branch_id`
  y `user_branches.branch_id`, exactamente lo que nombra la mina M10. Las demás
  tablas con `branch_id` (reservas, asistencia, transacciones, horarios, TV)
  quedan protegidas por su propio `tenant_id` y por el aislamiento de su módulo
  en 174/175.

### Batería, cobertura y números

- **D-09:** **La batería ISO-03 va por prefijo del módulo**: las **29** rutas
  `tenant-scoped` de `/api/admin/members` + `/api/admin/users` +
  `/api/admin/leads`, con el gate de cobertura derivado de esos prefijos —
  plantilla `test/tenancy/iso-03-cobertura.test.ts` cambiando una constante. Las
  rutas member-facing de la app (sesiones, árbol, rachas, goal-plans,
  bar-challenge, progresión) quedan con su query de `users` filtrada pero
  **reciben su caso de aislamiento en su propia fase**.
- **D-10:** **Snapshot de listados y exports** antes de tocar código: se reusa
  `el-templo-api/src/scripts/snapshot-finance-endpoints.ts` cambiando la
  constante `ENDPOINTS` → `/members` con sus filtros y paginado agotado,
  `/members/export`, `/members/export-sepa`, `/members/check-duplicates`,
  `/members/search`, `/leads`. El JSON va **fuera del repo**
  (`$HOME/.el-templo-snapshots/173/antes.json`, permisos `0600`: tiene DNIs y
  nombres de socios). Conservar las 3 lecciones del script (mapear el rango al
  nombre real de cada schema porque ajv strippea en silencio; paginar hasta
  agotar `total`; el orden de las listas NO es señal).
- **D-11:** **UAT del staff DESPUÉS del merge a staging**, como el piloto (plan
  172-22): la fase mergea con CI verde y diff de snapshot vacío, y el staff
  prueba contra staging desplegado. SC4 es la lista: alta de alumno, ficha,
  notas, cambio de sede, listados, filtros y export.

### Deudas heredadas de la 172 (todas entran)

- **D-12:** **WR-01** (autorregistro): se estampa `tenantId: branchTenantId` en
  el `insert(users)` de `POST /api/auth/register`
  (`src/modules/auth/routes.ts:212-234`) — opción A del review, el valor ya está
  resuelto server-side tres líneas arriba — **más un test dirigido**: con una
  sede del gimnasio 2, el usuario nace en el gimnasio 2 y el promo se aplica.
  Evidencia leída de la base, no del status.
- **D-13:** **La fuga de `getMemberSubscription` en
  `/api/admin/finance/coach-load/autocompletar/:userId` y `assignPlan` sin
  `tenantValues` se arreglan ACÁ**, aunque vivan en `subscriptions/service.ts`
  (archivo de la 174): ambos bloquean a un gimnasio nuevo y el test-ancla ya les
  puso dueño 173. Al arreglarlos, la aserción "esperaba fallar" de
  `test/tenancy/iso-03-finance-coach-load.test.ts:1326` **se pone en rojo** y hay
  que desmarcarla — es autodestructiva por diseño. El resto de subscriptions
  sigue siendo de la 174.
- **D-14:** **`canAccessBranch` (`src/modules/shared/branch-access.ts`) deja de
  decidir por país** y pasa a decidir por gimnasio (el país sigue filtrando
  adentro). Es el mismo invariante desde el otro lado: ADO-07 impide que un
  socio apunte a una sede ajena, esto impide que un staff **opere** una sede
  ajena. Además el doc 07 marca al país como "el aislador alternativo que nadie
  nombra" — mientras siga decidiendo, la batería puede dar verde sin ejercer la
  tenancy.
- **D-15:** **WR-02 e IN-02 se arreglan.** WR-02: el guard
  `SUB_HAS_ACTIVE_TRANSACTIONS` (`subscriptions/service.ts:2859-2891`) hace
  `FROM transaction_links INNER JOIN financial_transactions` filtrando una sola
  tabla strict, y los campos de la no filtrada se serializan en el body del 409 →
  el `tenantWhere` va **en el ON** del join. IN-02: los dos `break` del loop de
  paginación del script de snapshot setean `truncado = true` si
  `filas.length < total` — sin eso, el `antes.json` de esta fase puede ser
  parcial y el diff compararía contra una base incompleta en silencio.

### Secuencia y base de rama

- **D-16:** **Gate de secuencia: backmerge `origin/master` → `origin/staging`
  ANTES de crear el worktree.** Master tiene 4 commits que staging no, uno de
  ellos —`f77e05b4 feat(referidos): asignar referidor desde la ficha del
alumno`, gemelo cherry-pickeado de `e1952606`— toca `members/routes.ts` y
  `members/schemas.ts` (+150 líneas), exactamente los archivos que esta fase
  reescribe. Mismo razonamiento que el gate CR-CAJA del piloto (D-13 de la 172):
  partir de antes garantiza conflicto sobre las líneas en juego. Discutir y
  planificar puede seguir en paralelo; solo el **execute** espera la base.
- **D-17:** **Worktree propio desde `origin/staging` recién fetcheado**, con
  `node_modules` propio (`pnpm install --frozen-lockfile`) y **sin upstream**
  (un `git push` sin argumentos a master en este repo es un deploy a
  producción). El merge de la fase va **a staging**; el tren a master se arma
  cuando el milestone esté listo (decisión de Franco: todas las fases restantes
  se resuelven en staging y viajan juntas).
- **D-18:** **Migraciones reservadas desde 0198.** Staging ya tiene
  `0197_payment_method_direct_debit.sql` (domiciliación, todavía no en master);
  prod llega a 0196. Verificación de 0 divergencias antes del ALTER (hoy
  imposible que las haya: todo es gimnasio 1). Reglas del skill
  `el-templo-db-migrations`: numeración hand-written, nunca `drizzle-kit
migrate`, sin `;` en comentarios SQL, el SQL se commitea junto al schema.

### Lockeadas por fases anteriores (NO re-litigar; fuentes en canonical_refs)

- `ctx: TenantContext` **PRIMERO** en la firma de todo método migrado (antes del
  `tx` y de los ids) para que un call site viejo no compile; `assertTenant` en el
  borde. Prohibidos `!` y `?? 1`.
- `tenantWhere` como primer término de todo `and(...)`; en ` sql` crudo,
  `WHERE tenant_id = ${ctx.tenantId}`. `tenant_id` **jamás** de payload/JWT;
  `tenantValues` pone el tenant después del spread y no ensancha tipos literales.
- **El switch va último y en dos commits: allowlist primero, entrada strict
  después** (si no, el gate D-15 tumba el commit intermedio). Durante los pasos
  intermedios, allowlist de trabajo en `/tmp/allowlist-173-<NN>.json`.
- Demo del fail-closed **en vivo** con sonda revertida sin commitear, sobre una
  query de **UNA SOLA TABLA** de un método que algún test ejercite (el sentinel
  evalúa por query, el lint por tabla — trampa (h) del doc 07).
- Exenciones `/* tenant-safe: <motivo> */` en comentario de bloque aparte y,
  para SQL crudo, **adentro del SQL** entre el verbo y el `FROM`.
- Manifiesto (`test/tenant-manifest.ts`, 372 rutas, gate ISO-01) y fixtures
  (`test/fixtures/second-tenant.ts`, `TENANT_DOS = 90671`) se **consumen**, no se
  rediseñan.

### Claude's Discretion

- Reparto de planes/olas, respetando el orden de 9 pasos del doc 07 §2 y que
  cada commit quede verde. **Presupuestar `test/` como bloque propio**: el doc 07
  mide que es un cuarto a un tercio del trabajo (un plan de endurecimiento cada
  3-4 de migración), y con `users` strict el impacto sobre `beforeEach` y
  fixtures es mayor que en el piloto.
- Nombre exacto y forma del helper de D-05 (resolvedor que devuelve la sede
  validada vs. aserción), y si la migración de D-18 es una o dos.
- Criterio exacto para derivar "ruta de members" del manifiesto en el gate de
  cobertura, y organización de los archivos de la batería (el piloto usó uno por
  familia de rutas).
- Selección fina de endpoints y rango de fechas fijo del snapshot (D-10).
- Ids de tenants ad-hoc en tests nuevos: convención 90169/90269/90369/90469/
  90671 sin colisiones (archivos con el mismo id se pisan con `isolate: false`).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### La receta (fuente de verdad operativa de esta fase)

- `.docs/saas-multitenancy/07-receta-adopcion.md` — **el documento central**.
  §0 definición de "adoptado" (las 5 cosas juntas), §1 precondiciones y la foto
  de números, §2 el orden de 9 pasos y por qué el switch va último, §3 cómo
  romper ciclos entre services, §4 las 9 trampas medidas (a-i), §5 la forma de
  la batería ISO-03 y su gate, §6 checklist de cierre copiable, §7 costo real
  del piloto para dimensionar. **NO versionado — vive solo en el checkout
  principal `/home/franco/projects/el-templo`.**
- `.planning/phases/172-adopci-n-1-piloto-finance/172-CONTEXT.md` — las 13
  decisiones del piloto (D-01..D-13) que esta fase hereda y extiende.
- `.planning/phases/172-adopci-n-1-piloto-finance/172-REVIEW.md` — WR-01, WR-02,
  IN-01, IN-02 con archivo, línea y fix propuesto (D-12/D-15 de acá).

### Diseño de tenancy (validado, cerrado)

- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3 — las 5 capas; firma
  de helpers, sentinel, lint, tests de aislamiento.
- `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` — **mina M10**
  (líneas 339-343): el par de anclas puede divergir si un update cruza sedes;
  origen de ADO-07.
- `.docs/saas-multitenancy/06-estrategia-migracion.md` §2-§3 — orden de adopción
  por criticidad.
- `.planning/phases/169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc/169-CONTEXT.md`
  — D-02, D-06/D-07 (contrato CLI `requireTenant`), convenciones lockeadas.
- `.planning/phases/170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci/170-CONTEXT.md`
  — D-05/D-06 (lista strict por módulo), D-13/D-14/**D-15** (ratchet y coherencia
  strict/allowlist), D-17 (dos canales de exención).
- `.planning/phases/171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant/171-CONTEXT.md`
  — manifiesto y fixtures 2-tenant que esta fase consume.

### Código canónico (leer en `origin/staging`, NO en master — master no tiene la 172)

- `el-templo-api/src/db/tenant-tables.ts` — `GYM_OWNED_TABLES`,
  `TENANT_STRICT_MODULES` (hoy `{ finance: [6 tablas] }`; acá se agrega
  `members`), `isStrictTable`, `TENANT_GLOBAL_UNIQUES`. Gate de forma en
  `el-templo-api/test/db/tenant-tables.test.ts`.
- `el-templo-api/tenant-lint-allowlist.json` — 450 entradas; las **79** de tablas
  del módulo son las que esta fase borra. El header documenta el ratchet.
- `el-templo-api/src/modules/shared/tenant.ts` — `tenantWhere`, `tenantValues`,
  `assertTenant`, `TenantContext`, `forEachActiveTenant`.
- `el-templo-api/src/modules/members/` — `service.ts` (81 KB), `routes.ts`
  (66 KB), `schemas.ts`, `types.ts`, `leads-routes.ts`, `index.ts`.
- `el-templo-api/src/modules/shared/branch-access.ts` — `canAccessBranch`
  (D-14), y `src/modules/shared/country-scope.ts` (2 entradas de allowlist).
- `el-templo-api/src/db/schema/branches.ts` — hoy `uq_branches_tenant_code` +
  `idx_branches_tenant_id`; falta `(tenant_id, id)` para la FK compuesta (D-05).
- `el-templo-api/src/db/schema/users.ts:144` — el comentario que documenta que
  `branchUpdatedAt`/`branchSource` se escriben siempre junto a `branchId`.
- `el-templo-api/src/jobs/reassign-multibranch.ts` — el cron de ADO-07 (350
  líneas, ya con `forEachActiveTenant`; el UPDATE está en `:287-296`).
- `el-templo-api/test/tenant-manifest.ts` — 372 rutas clasificadas; el prefijo
  del módulo para el gate de cobertura.
- `el-templo-api/test/fixtures/second-tenant.ts` — `TENANT_DOS = 90671`,
  `seedSecondTenant`, `limpiarSegundoGimnasio` (FK-ordenado).
- `el-templo-api/test/tenancy/iso-03-cobertura.test.ts` — **plantilla completa
  del gate**, se copia cambiando el prefijo. Y `iso-03-finance-cajas.test.ts` /
  `-transacciones.test.ts` / `-coach-load.test.ts` como idioma de la batería
  (este último tiene el ancla de D-13 en `:1326`).
- `el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts` — los 8 tests que
  ya cubren el barrido por gimnasio de los 7 jobs.
- `el-templo-api/src/scripts/snapshot-finance-endpoints.ts` — script reusable
  (D-10) y sede del fix IN-02 (D-15).
- `el-templo-api/src/db/scripts/require-tenant.ts` +
  `el-templo-api/scripts/seed-onboarding-aura.ts` — receta CLI para D-03.

### Reglas operativas del repo

- `.claude/skills/el-templo-change-control/SKILL.md` — staging-first, worktree
  propio, `git add` explícito por ruta, pedir OK antes de pushear.
- `.claude/skills/el-templo-db-migrations/SKILL.md` — numeración hand-written
  desde 0198, nunca `drizzle-kit migrate`, sin `;` en comentarios SQL.
- `.claude/skills/el-templo-failure-archaeology/SKILL.md` — antes de investigar
  algo que "parece roto".

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Las 4 capas ya construidas + la 5ª ya ejercitada una vez: esta fase **no
  construye infraestructura**, la enciende para otro módulo.
- `SENTINEL_INVENTORY=1` (170 D-08): la suite en modo inventario da la lista
  determinística de queries violadoras **por query en runtime**; el lint las da
  **por archivo+tabla**. Se necesitan las dos lentes (trampa (h)).
- `pnpm lint:tenant` local: verificación inmediata de que las entradas borradas
  no reaparecen.
- La plantilla del gate de cobertura y los 3 archivos de batería de finance son
  copiables casi tal cual.

### Established Patterns

- **Tener `ctx` ≠ estar migrado** — el criterio de terminado es el inventario del
  lint, jamás la firma (trampa (a): `createEfectivoCaja` tenía `ctx` y no
  filtraba nada).
- **Helpers privados que devuelven fragmentos `SQL`** necesitan el filtro adentro
  o un "scope" único que estampe el `tenantWhere` y le pase columnas al helper
  (trampa (b) — `reports/service.ts` es el caso de manual).
- **Las closures de rutas también hacen queries** y no tienen `request` a mano:
  reciben `ctx` como primer parámetro (trampa (c)). La query más peligrosa del
  piloto fue **la que buscaba por NOMBRE** ("Templo Online") — con un solo tenant
  es invisible.
- **`tenant-lint-allowlist.json` solo cubre `src/`**; el sentinel envuelve el
  **pool** y ve los `beforeEach`. Regla: si el statement lee/borra a propósito de
  todos los gimnasios → exención con motivo; si se puede acotar sin cambiar lo
  que el test prueba → filtro.
- **El filtro de una tabla joineada va en el `ON`**, también en los INNER JOIN —
  en un LEFT JOIN, ponerlo en el WHERE lo convierte en INNER y borra filas en
  silencio con el lint en verde (mordió 4 veces).
- **El gimnasio se nombra INLINE en el statement** que nombra la tabla; un
  `const conditions = [...]` de arriba no cuenta (mordió 5 veces).
- **`tsc --noEmit` NO typechequea `test/`** (`include: ["src/**/*"]`): hace falta
  un `tsconfig.test-check.json` con `rootDir: "."` o el compilador devuelve un
  `TS2554: 0` falso.
- **El throw llega envuelto en `DrizzleQueryError.cause`** — los asserts miran la
  cadena de `cause`, no el error de arriba.
- **`--no-file-parallelism` es MÁS RÁPIDO** (una base MySQL por worker cuesta
  ~96 s). Correr `prettier --write` **antes** de la corrida larga.
- Antes de cambiar una firma, buscar **mocks posicionales**
  (`grep -rn "\.<metodo> = async" test/`): un mock con el `ctx` agregado adelante
  rompe en silencio y el test sigue verde probando nada.
- **Agregar archivos de test re-baraja qué archivos comparten base por worker en
  CI**: una bomba FK latente puede explotar en un archivo que la fase no tocó
  (`ER_ROW_IS_REFERENCED_2`). No es el sentinel — mirar el patrón de limpieza.

### Integration Points

- `el-templo-api/src/db/tenant-tables.ts` — entrada `members` en
  `TENANT_STRICT_MODULES` (el interruptor del throw), con los nombres **físicos**
  de MySQL.
- `el-templo-api/tenant-lint-allowlist.json` — borrado de las 79 entradas
  (esperar **más** que 79: el piloto planeó 47 y fueron 51, por tablas joineadas
  que el lint cuenta como accesos propios).
- `el-templo-api/src/modules/members/*` — firmas con `TenantContext`, helpers en
  todo acceso, `assertTenant` en los route handlers.
- 50 archivos ajenos — solo su query sobre tablas del módulo.
- `el-templo-api/src/db/migrations/0198_*.sql` — unique `(tenant_id, id)` en
  `branches` + FK compuesta en `users` (D-05/D-18).
- `el-templo-api/test/tenancy/` — batería iso-03 de members + su gate de
  cobertura; desmarque del ancla en `iso-03-finance-coach-load.test.ts:1326`.
- `$HOME/.el-templo-snapshots/173/antes.json` — fuera del repo, `0600`.

</code_context>

<specifics>
## Specific Ideas

Franco eligió la opción recomendada en las 14 preguntas de las 4 áreas. Dos
aportes propios:

1. **"Todas las fases que quedan de este milestone se resuelven en staging y van
   todas juntas a master cuando estén listas"** — fija la base y el destino de
   173/174/175 y explica por qué la 173 no puede seguir la letra de la receta
   ("worktree desde `origin/master`").
2. Aceptó explícitamente que esta sea la fase más grande del milestone con tal de
   que el ancla `users` quede con las 5 capas encima, en vez de diferir su strict
   a una fase de cierre.

</specifics>

<deferred>
## Deferred Ideas

- Migración completa de analytics, scheduling, subscriptions (más allá de D-13 y
  D-15), notificaciones, campañas, referidos, wellhub y los módulos de
  entrenamiento — fases 174-175. D-02 lo protege explícitamente.
- Casos de aislamiento para las rutas member-facing de la app (sesiones, árbol,
  rachas, goal-plans, bar-challenge, progresión) y para `POST /api/auth/register`
  como `describe` de batería — van con su módulo (D-09 / D-12).
- Guarda de `branch_id` sobre las tablas no-ancla (reservas, asistencia,
  transacciones, horarios, TV) — se aplica en 174/175; vale documentarla en el
  doc 07 como paso obligatorio de toda adopción que escriba `branch_id`.
- `aura_balances` / `aura_transactions` en strict — con la adopción de
  gamification.
- Remover el `DEFAULT 1` de `tenant_id` — post-adopción completa, no roadmapeado.
- Endurecer el sentinel de prod (log → throw) — pospuesto por diseño (README
  §4.2).
- **Onboarding del gimnasio nuevo** (no de esta fase, pero la batería lo va a
  volver a tocar): todo gimnasio necesita su propia sede virtual "Templo Online"
  o `resolveUserBranchId` cae en un fallback por nombre — doc 07 §1.4.
- Chip "Pendiente" hardcodeado en `CobrosPage.vue:70` (WR-03 viejo del admin) —
  backlog menor, sin dueño.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — falso positivo por keywords (rollout de datos
  del árbol SPOM v5.1, sin relación con tenancy). Ya revisado y NO foldeado en
  las fases 166, 169, 170 y 172.

</deferred>

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Context gathered: 2026-08-04_
