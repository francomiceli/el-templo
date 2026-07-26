# Requirements — v6.0 Tenancy — El Templo pasa a ser tenant #1

Scope derivado del diseño SaaS validado y CERRADO (`.docs/saas-multitenancy/`): README
(decisiones fases 1-2, validadas con Nacho 2026-07-02), doc 05 (inventario real de 89
tablas @ `8ac9ba9f`, minas M1-M10), doc 06 (estrategia de migración en 4 tandas +
`TenantContext` + fases T1-T6+; las 5 decisiones abiertas §8 resueltas 2026-07-26).
Requirements confirmados en sesión 2026-07-26 (24, con MOD incluido).

**Decisiones ya tomadas (NO re-litigar en discuss/plan-phase):** `tenant_id`
denormalizado en toda tabla gym-owned; enforcement en 5 capas (scope server-side +
helpers por-método + sentinel de pool + lint CI + tests de aislamiento fail-closed);
`tenant_id` jamás viaja en JWT ni payload; backfill `=1` (un solo tenant existente, la
cadena de FK es verificación, no fuente); lista M8 de uniques queda global; supresión de
unsubscribes por tenant; wellhub = core-integración (flag, NO ofertada por ahora);
`labs_inquiries` = GLOBAL; referidos = CORE; `system_settings` no recibe tenant_id
(deprecación gradual hacia `tenant_settings`).

**Constraint operativo:** staging-first estricto; migraciones incrementales compatibles
con código viejo (nullable → backfill → NOT NULL), SQL commiteado junto al schema,
reservar bloque de numeración al arrancar (verificar `_migrations` en ese momento);
tests de integración para todo lo nuevo; sin downtime; cero cambio visible para el staff
del Templo.

**Gate del MILESTONE (no de una fase):** el tenant 2 no se onboardea hasta que los
caminos críticos pasen la batería de aislamiento (ISO-03) en verde.

---

## v6.0 Requirements

### FUND — Fundación de tenants

- [x] **FUND-01**: Existen `tenants` + `tenant_settings` (schema validado README §5) con El Templo sembrado como tenant `id=1`, slug `el-templo`, status `active`
- [x] **FUND-02**: `users` y `branches` (anclas) tienen `tenant_id NOT NULL` con FK a `tenants` e índice, backfilleado `=1`
- [x] **FUND-03**: Todo request autenticado resuelve `scope.tenantId` server-side en `attachScope` (extensión de `attachCountryScope`) — nunca del JWT ni de un payload
- [x] **FUND-04**: Un tenant `suspended`/`archived` recibe 403 en todo request scoped, enforced en la misma query que resuelve el scope

### COL — Columnas y backfill

- [ ] **COL-01**: Las 85 tablas gym-owned restantes (46 CORE + 42 TEMPLO-MODULO del doc 05, menos anclas; `system_settings` y `labs_inquiries` excluidas por diseño) tienen `tenant_id NOT NULL` + FK, backfill `=1`
- [ ] **COL-02**: Script versionado de verificación recorre las cadenas de FK del inventario (incl. mapeo manual de las FKs lógicas M9) y reporta 0 discrepancias entre backfill y derivación

### CON — Contratos de acceso

- [ ] **CON-01**: Uniques globales convertidas a compuestas `(tenant_id, …)` según doc 06 §1-D (users.email/dni/referral_code, branches.code, cost_centers, promo_code, campaign_unsubscribes.email, template_key, day_modes, holidays, formats); lista M8 queda global (aprobada 2026-07-26)
- [ ] **CON-02**: Toda tabla gym-owned tiene índice con prefijo `tenant_id` (vía unique compuesta o `INDEX` explícito) en la misma migración
- [ ] **CON-03**: Helpers `tenantWhere`/`tenantValues` en `shared/tenant.ts`; todo INSERT sobre gym-owned toma `tenant_id` exclusivamente de scope/contexto server-side
- [ ] **CON-04**: `TenantContext` explícito para caminos sin request: crons iteran tenants activos, webhook Wellhub deriva tenant vía `branches.wellhub_gym_id`, scripts CLI lo exigen como argumento; `tv_pairings` pre-claim con exención anotada (M7)
- [ ] **CON-05**: Sentinel de pool mysql2 detecta SQL sobre tabla gym-owned sin `tenant_id`: test/dev = throw para módulos migrados, prod = `log.error` + métrica; exenciones `/* tenant-safe: <motivo> */` respetadas y grepeables
- [ ] **CON-06**: Lint estático en CI falla ante ` sql` ``/`.from()`sobre gym-owned sin`tenant_id` ni anotación (allowlist decreciente por módulo)

### ISO — Backstop de aislamiento

- [ ] **ISO-01**: Manifiesto versionado (`test/tenant-manifest.ts`) clasifica el 100% de las rutas (`tenant-scoped`/`global`/`templo-module`); hook `onRoute` fail-closed: ruta nueva sin clasificar = test rojo
- [ ] **ISO-02**: Fixtures de test siembran 2 tenants; helpers (`createStaffUser` y afines) soportan crear staff/socios por tenant
- [ ] **ISO-03**: Batería de aislamiento: cada ruta `tenant-scoped` de un módulo migrado, ejecutada como staff del tenant A, no expone ni escribe datos del tenant B

### ADO — Adopción módulo a módulo

- [ ] **ADO-01**: `finance` migrado al patrón completo (services reciben scope + `tenantWhere`/`tenantValues` + sentinel throw para sus tablas + aislamiento verde)
- [ ] **ADO-02**: `members` ídem
- [ ] **ADO-03**: `subscriptions` ídem, con la cadena de pricing (override → boarding pass → AURA → referral) intacta
- [ ] **ADO-04**: `scheduling` ídem (schedules/bookings/attendance/schedule_exceptions)
- [ ] **ADO-05**: `analytics` ídem
- [ ] **ADO-06**: Resto del core ídem (campaigns, notifications, referrals, wellhub, feedback/improvement_proposals, auth/settings) — incluye supresión de unsubscribes POR TENANT (decisión Q5, mina M3)
- [ ] **ADO-07**: Guarda de consistencia `user.tenant_id === branch.tenant_id` en los ~10 sitios de escritura de `branch_id` + `setMemberBranch()` + cron de recategorización (mina M10)

### MOD — Mecanismo de módulos

- [ ] **MOD-01**: Flags `module.<nombre>.enabled` en `tenant_settings` + guard `requireModule` (404) gatean las rutas de los 4 módulos Templo (templo-training/gamification/marketing/onboarding) — prendidos para tenant 1, apagados por default para tenants nuevos
- [ ] **MOD-02**: Registry de hooks tipado con la superficie mínima validada (doc 04): filter `pricing.adjust` (bloqueante) + event `streak.milestone` (best-effort), composition root explícito

---

## Future Requirements (deferred)

- Módulo Gimnasio completo (catálogo genérico global + plantillas + registro + panel del profe) — **milestone siguiente**, spec en `brief-fran-modulo-gimnasio.md` + addendum A1-A7
- Superficie member-facing multi-tenant (dónde vive se decide en la fase de diseño del milestone Gimnasio; reabre el trigger del split de repos)
- Onboarding real del tenant 2 (alta comercial, provisioning) — post batería verde
- Contrato de tipos API↔frontends (matar el patrón "mirror a mano") — oportunidad natural durante la adopción, pero no es requirement de v6.0
- Billing/plan comercial del SaaS en `tenants` (se agrega cuando exista modelo comercial)
- Login/dominios/subdominios por tenant (diferida original; `tenants.slug` es agnóstico)

## Out of Scope (this milestone)

- **Módulo Gimnasio** — milestone siguiente (secuencia decidida en addendum A7)
- **App member multi-tenant y split de repos** — triggers intactos (README §6)
- **Transformar SPOM o `el-templo-app`** — jamás se transforman (patrón "construir lo genérico nuevo")
- **Uniques de módulos Templo** (`sessions.day_id` M5, `aura_config.source_type`, slugs blog/gladius) — reciben `tenant_id` como columna pero sus uniques quedan globales mientras esos módulos sean Templo-only (deuda consciente documentada)
- **Migración de keys `system_settings` → `tenant_settings`** — coexistencia gradual, migra módulo a módulo cuando cada uno adopte el patrón (no big-bang en v6.0)
- **Postgres/RLS** — MySQL se queda (decisión §4 README)

## Traceability

_Se completa cuando el roadmap asigne cada REQ-ID a una fase._

| REQ-ID  | Fase      | Estado   |
| ------- | --------- | -------- |
| FUND-01 | Phase 166 | Complete |
| FUND-02 | Phase 166 | Complete |
| FUND-03 | Phase 166 | Complete |
| FUND-04 | Phase 166 | Complete |
| COL-01  | Phase 167 | Pending  |
| COL-02  | Phase 167 | Pending  |
| CON-01  | Phase 168 | Pending  |
| CON-02  | Phase 168 | Pending  |
| CON-03  | Phase 169 | Pending  |
| CON-04  | Phase 169 | Pending  |
| CON-05  | Phase 170 | Pending  |
| CON-06  | Phase 170 | Pending  |
| ISO-01  | Phase 171 | Pending  |
| ISO-02  | Phase 171 | Pending  |
| ISO-03  | Phase 172 | Pending  |
| ADO-01  | Phase 172 | Pending  |
| ADO-02  | Phase 173 | Pending  |
| ADO-07  | Phase 173 | Pending  |
| ADO-03  | Phase 174 | Pending  |
| ADO-04  | Phase 174 | Pending  |
| ADO-05  | Phase 175 | Pending  |
| ADO-06  | Phase 175 | Pending  |
| MOD-01  | Phase 176 | Pending  |
| MOD-02  | Phase 176 | Pending  |

**Cobertura: 24/24 REQ-IDs mapeados a exactamente una fase (0 huérfanos, 0 duplicados).**
(El encabezado decía "23" por error aritmético al confirmar; son 24 REQ-IDs — corregido 2026-07-26.)

**Notas de mapeo:**

- **ISO-03** (batería de aislamiento) se ancla en la **fase 172** (piloto `finance`), que es donde
  la batería se construye y corre verde por primera vez; cada fase de adopción posterior
  (173-175) la extiende a sus rutas como parte de su propio ADO-xx.
- **ADO-07** (guarda `user.tenant_id === branch.tenant_id`) viaja con **`members`** (fase 173),
  que es donde viven `setMemberBranch()` y los sitios de escritura de `branch_id`, incluido el
  cron de recategorización multisucursal.
- El **gate del milestone** (tenant 2 solo con la batería verde) NO es de ninguna fase: se evalúa
  al cierre de la fase 175 / del milestone.
