# Fase 3 — Estrategia de migración detallada: El Templo → tenant #1

> **Fecha:** 2026-07-26
> **Estado: ✅ DECISIONES ABIERTAS RESUELTAS (sesión 2026-07-26, §8) — listo para bajar
> a milestone GSD.** Baja a pasos
> ejecutables las decisiones YA validadas (README §4/§5, doc 03, doc 04) usando el
> inventario real de 89 tablas ([`05-inventario-tablas-2026-07-26.md`](./05-inventario-tablas-2026-07-26.md)).
> Nada de lo decidido se re-litiga; lo nuevo que requiere decisión está en §8.
> **Prerequisito cumplido:** la reforma del admin (v5.4) está en prod desde 2026-07-08 —
> la secuencia "primero reforma, después tenancy" (Nacho, 2026-07-02) quedó satisfecha.

---

## 0. Principios operativos (recordatorio, ya decididos)

1. **Incremental, sin big-bang, sin downtime.** Mientras solo exista el tenant 1 no puede
   haber fuga cross-tenant. El tenant 2 NO se onboardea hasta que los caminos críticos
   pasen la batería de aislamiento (README §4.2, red de fondo).
2. **`tenant_id` denormalizado en toda tabla gym-owned** — regla mecánica, sin razonar JOINs.
3. **Escritura: `tenant_id` sale SIEMPRE de `scope.tenantId` server-side**, jamás del payload.
4. **Enforcement = 5 capas imperfectas que se solapan** (doc 03), no una mágica.
5. Migraciones por el runner propio (`_migrations` como fuente de verdad), numeración a
   mano — **reservar el bloque de números al arrancar** (hoy el último es 0189; staging y
   prod comparten host MySQL: la mig corre en ambas bases por sus pipelines respectivos).

---

## 1. Mapa de la migración SQL (4 tandas)

Con un solo tenant existente, **el backfill es literalmente `SET tenant_id = 1`** — la
"cadena de FK" del README §5 no hace falta como fuente del backfill; se usa como
**verificación de consistencia** (§5 de este doc). Eso simplifica todo el plan.

Alcance: **87 tablas reciben `tenant_id`** = 46 CORE + 42 TEMPLO-MODULO, menos
`system_settings` (decidido: deprecación gradual hacia `tenant_settings`, no recibe
columna) y menos `labs_inquiries` si se confirma GLOBAL (§8-Q2).

### Tanda A — Fundación (1 migración)

1. `CREATE TABLE tenants` + `tenant_settings` exactamente como README §5 (diseño validado).
2. Seed: `INSERT INTO tenants (id=1, name='El Templo', slug='el-templo', status='active', …)`.
3. Slugs reservados a nivel app (`admin`, `api`, `www`, …) — constante en código, no en DB.

Riesgo: nulo (tablas nuevas + 1 fila). Reversible con DROP.

### Tanda B — Anclas (1 migración)

1. `ALTER TABLE branches ADD COLUMN tenant_id INT NULL REFERENCES tenants(id)` + backfill `=1` + `MODIFY NOT NULL` + índice.
2. Ídem `users`. (En MySQL 8: ADD COLUMN nullable = INSTANT; el MODIFY es INPLACE — con
   los volúmenes actuales, segundos.)
3. En la misma tanda: **capa 1 de código** — `attachCountryScope` → `attachScope`, agrega
   `tenantId` al select de `users` + JOIN a `tenants` con enforcement de `status`
   (`suspended`/`archived` → 403). El scope queda disponible para todo lo que sigue.

### Tanda C — Las 85 restantes (2-3 migraciones, agrupadas por dominio)

Para cada tabla: `ADD COLUMN tenant_id INT NULL` → `UPDATE SET tenant_id = 1` →
`MODIFY NOT NULL` → FK a `tenants`. Agrupar por dominio para que cada migración sea
legible y acotada (p. ej. C1 = core operativo: scheduling/finanzas/subs; C2 = comunicación
+ crecimiento + integraciones; C3 = TEMPLO-MODULO completo). Sin datos que razonar: el
backfill es constante.

Nota MySQL: en tablas grandes (`attendance`, `bookings`, `aura_transactions`,
`financial_transactions`) el UPDATE masivo es barato hoy (decenas de miles de filas). No
hace falta chunking; si prod creciera 100×, chunkear por PK.

### Tanda D — Uniques compuestas + índices (1-2 migraciones, la parte con filo)

Conversión `UNIQUE(x)` → `UNIQUE(tenant_id, x)` según README §4.3 **actualizado por el
inventario** (doc 05 §5.6):

| Convertir a `(tenant_id, …)` | Notas |
|---|---|
| `users.email`, `users.dni`, `users.referral_code` | email ligado a la diferida login/dominios — la compuesta es compatible con los 3 escenarios |
| `branches.code` | |
| `cost_centers (name, country)` | |
| `promo_plans.promo_code` | |
| `campaign_unsubscribes.email` | **obligatoria** — mina M3 |
| `notification_templates.template_key` | |
| `day_modes.day_of_week` | |
| `holidays (country, date)` | |
| `formats.name` | condicional (si formats queda en core) |

**Quedan GLOBALES a propósito** (lista M8 del doc 05, a confirmar con Nacho §8-Q4): ids de
plataforma externa (`gympass_id`, `wellhub_*`, `booking_number`, `event_id`) y secretos
random con lookup pre-scope (`refresh_tokens.token_hash`, `device_tokens.token`,
`tv_devices.token_hash`, `tv_pairings.user_code`/`device_code_hash`). Convertirlas sería
activamente peor: el lookup ocurre antes de conocer el tenant.

**Índices:** toda tabla gym-owned filtra `tenant_id` en cada query. Las que reciben unique
compuesta lo tienen gratis (prefijo); el resto lleva `INDEX (tenant_id)` explícito en la
misma migración (README §5, nota obligatoria).

**Los uniques de módulos Templo** (`sessions.day_id` —M5—, `aura_config.source_type`,
slugs de blog/gladius, catálogos SPOM) **NO se tocan en el MVP**: reciben `tenant_id`
como columna (tanda C) pero sus uniques quedan globales mientras SPOM/marketing sean
Templo-only. Se resuelven si algún día un tenant ≠ 1 activa ese módulo (documentado como
deuda consciente, coherente con doc 02).

---

## 2. Capas de código — orden de implementación

Sigue doc 03 §4, con las adiciones que el inventario obligó:

1. **Capa 1** — `attachScope` + `scope.tenantId` + enforcement `suspended` (entra con tanda B).
2. **Capa 2** — `src/modules/shared/tenant.ts`: `tenantWhere`/`tenantValues` (doc 03 §3).
   **Adición nueva: `TenantContext` para caminos sin request** (§3 de este doc).
3. **Capa 3** — sentinel de pool mysql2 en modo **warn** global (test/dev = throw solo
   para los módulos ya migrados; prod = `log.error` + métrica). Lista estática de tablas
   gym-owned generada del schema (las 87).
4. **Capa 4** — lint CI: `sql``` o `.from(<gym-owned>)` sin `tenant_id` ni anotación
   `/* tenant-safe: <motivo> */` = build rojo, solo sobre módulos ya migrados (allowlist
   decreciente, mismo patrón que el baseline-diff de tsc del admin).
5. **Capa 5** — manifiesto `test/tenant-manifest.ts` con **las rutas actuales completas**
   clasificadas (`tenant-scoped` / `global` / `templo-module`) + hook `onRoute` fail-closed.
   Arranca clasificando TODO el estado actual (el inventario de 89 tablas y el bloque de
   registros de `app.ts` son los insumos); el test de aislamiento con 2 tenants sembrados
   se activa módulo a módulo.

**Orden de adopción por módulo** (doc 03 §4, criticidad MVP): `finance` → `members` →
`subscriptions` → `scheduling` → `analytics` → resto core (campaigns, notifications,
referrals, wellhub, feedback) → módulos Templo (en su propia discusión). "Migrar un
módulo" = sus services reciben `scope`, todo WHERE/INSERT usa los helpers, sentinel pasa
a throw para sus tablas, sus rutas quedan `tenant-scoped` en el manifiesto y el test de
aislamiento corre verde.

---

## 3. Caminos de escritura SIN request (hallazgo del inventario, diseño nuevo)

El diseño original asumía `scope` fluyendo desde un request. El inventario encontró
escrituras que nacen fuera de un request (M6/M7 + crons):

| Camino | Cómo resuelve tenant |
|---|---|
| Webhook Wellhub (auto-crea users, bookings) | `payload.gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id`. El módulo construye un `TenantContext {tenantId}` explícito y lo pasa a los services. |
| Crons (wellhub-sync, recategorización multisucursal, vencimientos, streaks) | Iterar `tenants` activos y correr el job con `TenantContext` por tenant. Hoy: lista = [1] — el patrón queda listo, el costo es cero. |
| Scripts CLI / migraciones de datos | `TenantContext` explícito obligatorio como argumento. |
| `tv_pairings` pre-claim (M7) | Legítimamente pre-tenant hasta el claim: exención anotada `/* tenant-safe: pairing pre-claim */`; el claim (con scope de staff) estampa `tenant_id`. |

Propuesta concreta: `tenantValues`/`tenantWhere` aceptan `{ tenantId }` plano — el scope
de request y el `TenantContext` son estructuralmente compatibles; no hay dos APIs.

## 4. Guardas de consistencia entre anclas (mina M10)

`users.branch_id` y el cron de recategorización reescriben la sede → invariante
"`user.tenant_id === branch.tenant_id`" se chequea a nivel app en los ~10 sitios de
escritura de `branch_id` ya instrumentados por el cron multisucursal (están listados en
ese proyecto) + `setMemberBranch()`. Sin triggers de DB (explícito > clever, y el codebase
no usa triggers).

## 5. Verificación del backfill (reemplaza a la "cadena de FK como fuente")

Después de la tanda C, un script one-shot (versionado en `src/db/scripts/`) recorre las
cadenas de FK del inventario y verifica que la derivación coincida con el valor
backfilleado (hoy trivialmente `=1`, pero deja el molde para auditorías post-tenant-2):

- por cada tabla con ancla: `COUNT(*) WHERE t.tenant_id <> derivado` → debe dar 0;
- lista explícita de [SIN-ANCLA] (37 + 3 parciales) donde la derivación no aplica y el
  valor directo es la verdad;
- las FKs lógicas sin constraint (M9) se verifican con joins manuales enumerados.

## 6. Interacción con staging/prod (operativa)

- Staging y prod comparten host MySQL con bases separadas: cada pipeline aplica las migs
  a SU base — el flujo staging-first cubre el ensayo completo de cada tanda.
- Las tandas son **aditivas y compatibles con el código viejo** (columna nueva nullable →
  backfill → NOT NULL con default implícito por el seed): el API pre-tenancy sigue
  funcionando durante todo el rollout. El único punto de acople código↔schema es la tanda
  D (uniques): el código que inserta en esas tablas no cambia (los valores ya son únicos
  dentro del tenant 1).
- Reserva de numeración: la fase que ejecute esto reserva su bloque (p. ej. 0190-0196)
  en el momento de arrancar, según el estado real de `_migrations` en ese momento.

## 7. Propuesta de fases GSD (para el milestone de tenancy)

| Fase | Contenido | Gate de salida |
|---|---|---|
| T1 — Fundación | Tandas A+B (tenants, settings, anclas) + `attachScope` con `tenantId` y `suspended` | mig verde en staging+prod; scope disponible en todo request |
| T2 — Columnas | Tanda C completa (85 tablas) + script de verificación §5 | verificación = 0 diffs |
| T3 — Contratos | Tanda D (uniques+índices) + helpers capa 2 + `TenantContext` §3 + sentinel warn + lint CI (allowlist llena) | sentinel logueando en prod sin falsos positivos ruidosos |
| T4 — Backstop | Manifiesto completo de rutas + hook onRoute fail-closed + fixtures 2-tenant | ruta sin clasificar = test rojo, en CI |
| T5..Tn — Adopción | Un módulo core por fase: finance → members → subscriptions → scheduling → analytics → resto | por módulo: sentinel=throw, aislamiento verde |
| T-final — Módulos | Flags `module.*.enabled` + `requireModule` + registry (doc 04) sobre `tenant_settings` | los 4 módulos Templo gateados para tenant 1 |

MVP white-label admin-only (decidido): la app de miembros y el split de repo quedan fuera
— sus triggers no cambian.

## 8. Decisiones del inventario — ✅ RESUELTAS (sesión 2026-07-26)

- **Q1 — Casillero de Wellhub: CORE-integración** (flag `integration.wellhub.enabled` en
  `tenant_settings` + `branches.wellhub_gym_id` NULL = apagado; el mecanismo de módulos
  doc 04 queda puro para lo Templo). **Matiz de negocio explícito: NO se ofrece a otros
  gimnasios por ahora** — la integración con Wellhub es un acuerdo puntual de El Templo;
  el flag arranca apagado para todo tenant ≠ 1 y no forma parte de la oferta del SaaS.
- **Q2 — `labs_inquiries`: GLOBAL (plataforma).** Son los leads del propio SaaS; jamás se
  expone como feature a un tenant. Hoy casi vacía → decisión de costo cero, reversible.
- **Q3 — Referidos: CORE.** Motor de adquisición genérico. Consecuencia asumida: el hook
  `pricing.adjust` tiene 4 clientes (override → boarding pass → AURA → referral); referral
  entra como filter core-a-core.
- **Q4 — Lista M8 APROBADA completa (las 11 quedan globales).** Análisis que cerró la
  duda: "unique global" ≠ "feature compartida" — las filas igual reciben `tenant_id`.
  Grupo A (ids emitidos por Wellhub): el webhook llega sin tenant y lo DESCUBRE por ese
  lookup; la unique global impide que dos tenants reclamen el mismo recurso externo.
  Grupo B (secretos random): el lookup es cómo el sistema descubre quién sos — componer
  por tenant es circular; colisión imposible (256 bits).
- **Q5 — Supresión de unsubscribes POR TENANT.** Unique compuesta `(tenant_id, email)` +
  filtro de envío scopeado: cada gimnasio maneja su lista de desuscriptos (el opt-out es
  hacia un remitente concreto). Resuelve la mina M3 en su totalidad.

## Registro de cambios

- **2026-07-26** — Creación autónoma post-inventario (doc 05). Baja las decisiones
  validadas a 4 tandas SQL + orden de capas + fases GSD propuestas. Nuevo diseño §3
  (TenantContext sin request) forzado por M6/M7. Pendiente: discusión §8 con Nacho.
