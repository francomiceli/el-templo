# SaaS Multi-Tenancy — Doc de diseño (vivo)

> **Estado:** Fase 1 — Alineación y diseño. Documento en construcción, crece por fase.
> **Última actualización:** 2026-07-01
> **Objetivo global:** Convertir `el-templo-admin` + `el-templo-api` en un SaaS multi-tenant
> para administrar gimnasios en general, donde **El Templo pasa a ser el tenant #1**.
> Un solo código, sin forks: las features de core benefician a todos los gimnasios;
> lo específico del Templo vive como módulos/extensiones.

---

## 0. Índice y estado de fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Alineación (estado actual + mejoras del admin) + diseño de tenancy | ✅ Hecha |
| » | └ [Análisis de "Correcciones El Templo" bajo lente SaaS](./01-analisis-correcciones-admin.md) | ✅ Hecho |
| 2 | Diseño de multi-tenancy (modelo, aislamiento DB, API, auth) | ✅ Hecha |
| » | └ [Inventario núcleo vs Templo — grilla de discusión](./02-inventario-modulos.md) | ✅ Cerrado |
| » | └ [Diseño técnico capa de datos tenant-safe](./03-diseno-tenant-db-layer.md) | ✅ Validado |
| » | └ [Mecanismo de módulos/flags](./04-mecanismo-modulos.md) | ✅ Validado |
| 3 | Estrategia de migración (Templo → tenant #1 sin romper prod) | ✅ Cerrada 2026-07-26 |
| » | └ [Inventario completo de 89 tablas (post wellhub+tv)](./05-inventario-tablas-2026-07-26.md) | ✅ Cerrado |
| » | └ [Estrategia de migración detallada (tandas SQL + fases GSD)](./06-estrategia-migracion.md) | ✅ Decisiones §8 resueltas |
| 4 | Ejecución iterativa | ⬜ Pendiente |
| » | └ [Diseño del módulo Gimnasio: las 7 definiciones del brief + la superficie member-facing](./08-diseno-modulo-gimnasio.md) | ✅ Firmado por Franco (D-09) 2026-08-27 (fase 181, milestone v6.1) |

**Secuencia de workstreams — DECIDIDA (Nacho, 2026-07-02): PRIMERO la reforma del admin
según [`Correcciones El Templo.md`](./Correcciones%20El%20Templo.md), DESPUÉS la capa de
tenancy — secuencial, NO en paralelo.** La reforma no depende de la tabla `tenants`:
reorganizar nav, separar pantallas (planes de pago vs rutinas), RBAC y de-Templo-ficar la
superficie MVP **reduce** el trabajo de tenancy posterior (menos superficie Templo que
clasificar/migrar) y le entrega valor al Templo ya. Única regla: todo cambio de API que
la reforma toque adopta los patrones ya decididos (motor vs plantilla, regla de dirección
de imports del doc 04, sin nuevos Templo-ismos en core).

**Documento de mejoras del admin (input de fase 1):** ✅ incorporado.
Fuente cruda: [`Correcciones El Templo.md`](./Correcciones%20El%20Templo.md) (voz de Nacho, intacta).
Análisis bajo lente SaaS: [`01-analisis-correcciones-admin.md`](./01-analisis-correcciones-admin.md).

**Principio rector (Nacho, 2026-07-01):** El Templo se asienta sobre el terreno común
general lo más posible; lo propio del Templo se "dibuja" después, encima. → sesgo por
default: **estandarizar/generalizar primero**, Templo como capa/módulo posterior.

---

## 1. Principios rectores (acordados)

1. **Un solo sistema, sin mantener dos en paralelo.** Toda feature de core impacta
   al Templo y a futuros gimnasios a la vez.
2. **El núcleo nunca nombra a un tenant específico.** Prohibido `if (tenant === 'templo')`
   desparramado por el código. Lo específico se activa por configuración/flags o vive
   en módulos con puntos de enganche definidos.
3. **Flags/planes = el interruptor; módulos/extensiones = lo que el interruptor prende.**
   No son alternativas, trabajan juntos. SPOM, niveles, AGORA, aura → módulos del Templo.
   Otro gimnasio podría tener sus propios módulos igual de "especiales".
4. **El aislamiento vive en el modelo de datos y en la API, no en el frontend.**
   "Convertir el admin en SaaS" es en el fondo un problema de `el-templo-api` + base de datos.

---

## 2. Estado actual del sistema (análisis 2026-07-01)

**Stack:** monorepo con `el-templo-app` (PWA miembros, Vue/Quasar/Capacitor),
`el-templo-admin` (web admin/coach, Vue/Quasar), `el-templo-api`
(Fastify 5 + Drizzle ORM + **MySQL 8**), `el-templo-web` (marketing).
API y base de datos **compartidas**.

### 2.1 No existe concepto de tenant
- **0 referencias a "tenant"** en `el-templo-api/src`. El sistema asume un único gimnasio.

### 2.2 SÍ existe una capa de sucursales (`branches`) con scoping funcional
Este es el activo más valioso: el modelo mental de "aislar datos a una partición"
**ya está construido y en producción**, un nivel por debajo del que necesita el SaaS.

| Rol (`users.role`) | Alcance actual | Implementación |
|--------------------|---------------|----------------|
| `owner` | Global | por rol |
| `admin` / `gestion` | Por país | `users.country` |
| `coach` / `recepcion` | Por sucursal(es) | tabla `user_branches` → `canAccessBranch()` (403 si se sale de scope) |
| `member` | Una sucursal | `users.branch_id` |

Archivos clave:
- `src/db/schema/branches.ts` — sede física (name, code, timezone, country, address, maxCapacity, romEnabled, isActive, isVirtual)
- `src/db/schema/user-branches.ts` — junction staff↔sucursal (scope operativo, es restricción de seguridad, Phase 110)
- `src/db/schema/users.ts` — `role` enum, `branch_id`, `country`
- `src/modules/shared/branch-access.ts` (`canAccessBranch`) — enforcement de scope por sucursal
- `src/modules/shared/country-scope.ts` — enforcement de scope por país (admin/gestion)

### 2.3 Medida del trabajo de tenancy
- **Solo 10 de 66 tablas** tienen `branch_id` hoy: `cash-registers`, `attendance`,
  `class-coach-assignments`, `completed-sessions`, `financial-transactions`,
  `coach-ratings`, `subscriptions`, `schedules`, `users`, `user-branches`.
- Las otras **56 tablas son "globales"** — pertenecen al Templo implícitamente
  porque hay un solo gimnasio. Son las que necesitarán `tenant_id`.

### 2.4 Minas terrestres — supuestos de "un solo gimnasio" horneados en la DB
- `src/db/schema/spom-config.ts`: `CHECK (id = 1)` — **prohíbe más de una fila**.
  Ejemplo perfecto de config Templo-céntrica. Multi-tenant: o se vuelve por-tenant,
  o SPOM queda como módulo exclusivo del Templo.
- `src/db/schema/system-settings.ts`: key-value **global**, sin scoping.
- Módulos claramente Templo-específicos (candidatos a "extensión"): SPOM
  (`spom-config`, `spom-rules`), niveles (`kairos→alfa→delta→sigma→omega→spartan`),
  AGORA (módulo comunidad), aura (`aura-*`), gladius.
- Núcleo genérico (todo gimnasio lo necesita): members/users, subscriptions,
  financial-transactions, cash-registers, cost-centers, attendance, bookings,
  schedules, check-ins.

### 2.5 Falso amigo: el módulo `franchise`
`src/modules/franchise/` **no es infraestructura de tenants**. Es una feature de
marketing/lead-gen: gente que aplica para abrir una franquicia del Templo, con un
agente de IA de outreach. Nota poética: un franquiciado podría convertirse en tenant #2,
pero no es el mecanismo de tenancy.

---

## 3. Modelo de tenancy objetivo (acordado a alto nivel)

**Sucursal ≠ tenant.** Una sucursal es una sede *dentro* de un gimnasio; un tenant es
*el negocio gimnasio entero*. No reutilizamos `branches` como tenant — le **agregamos
un nivel padre**.

```
Tenant / Organización          ← NUEVO nivel (El Templo = tenant #1)
   │
   ├── branches (sucursales)    ← capa ya existente
   │      │
   │    users / socios / datos
   │
   └── (otro gimnasio = tenant #2, puede ser mono o multi-sucursal)
```

**Forma del tenant (confirmado con Nacho):** El Templo es un tenant multi-sucursal;
otros tenants pueden ser mono-sede o multi-sede. Diseñamos para el caso general
`tenant → N branches` (cubre ambos sin costo extra).

Patrón SaaS clásico: organización → workspace → usuario.

---

## 4. Aislamiento de datos — DECIDIDO (2026-07-01)

**Decisión: columna `tenant_id` compartida + DENORMALIZADA** en toda tabla gym-owned,
incluso donde el tenant sería derivable por FK.

- **Por qué denormalizar** (elegido sobre derivar-por-JOIN e híbrido): el `tenant_id` de
  una fila es **inmutable** (se setea al crear, nunca cambia) → no hay riesgo de
  inconsistencia/drift. Habilita una regla mecánica y simple: *"toda query sobre una tabla
  gym-owned filtra `tenant_id`"*, inyectada por la capa de acceso a datos. Sin necesidad de
  razonar JOINs. Migración mayor pero mecánica.
- **Restricción dura del stack:** MySQL 8 **no tiene Row-Level Security** (a diferencia de
  PostgreSQL). Sin esa red a nivel base, **la capa de acceso centralizada que inyecta
  `tenant_id` NO es opcional** — es la única garantía real contra fugas ("data leak").
- Complementos: tests de aislamiento cross-tenant automatizados.

### 4.1 Modelo de jerarquía y anclas (clasificación de las 66 tablas)

Casi todo **deriva** a un tenant por FK que ya existen. Solo un puñado recibe `tenant_id`
como ancla; el resto lo hereda (y, por la decisión de arriba, igual se **denormaliza**).

```
tenants (NUEVO)
   ├──< branches   ← ANCLA #1: tenant_id acá (El Templo = tenant 1 + sus sucursales)
   │       └──< (10 tablas branch-scoped: users, attendance, cash_registers,
   │             financial_transactions, subscriptions, schedules, coach_ratings…)
   ├──< users      ← ANCLA #2: tenant_id acá (staff sin branch, ej. owner)
   │       └──< (tablas user-scoped: member_profiles, notifications, aura_*, balances…)
   └──< catálogos gym-wide (tenant_id directo): subscription_plans, cost_centers,
         campaigns, promo_plans, activities, holidays, gladius_products, exercises, formats…
```

- **Tablas global/compartidas (SIN `tenant_id`):** la tabla `tenants`, y lo que sea catálogo
  verdaderamente compartido. A inventariar fino. **Primer miembro confirmado (2026-07-02):**
  el futuro **catálogo genérico de ejercicios** (global, curado por nosotros, disponibilidad
  por tenant según equipamiento — ver doc 02 §2).

### 4.2 Enforcement en capas — DECIDIDO (2026-07-01)

Contexto medido en el código real: **334 queries `sql\`\``**, **306 joins**, 49 transacciones,
67 services, Drizzle 0.45 (sin intercepción nativa de queries). Conclusión: un wrapper
"mágico" universal que auto-inyecte `tenant_id` es **inviable y peligroso** acá — no puede
ver dentro de un `sql\`\`` ni razonar aliases de joins, y daría falsa sensación de seguridad.

La garantía viene de **cinco capas imperfectas que se solapan**, no de una "perfecta".
**✅ VALIDADAS con Nacho (2026-07-02)** — detalle técnico en
[`03-diseno-tenant-db-layer.md`](./03-diseno-tenant-db-layer.md):

1. **`scope.tenantId` por-request** — extender `attachCountryScope`
   (`src/modules/shared/country-scope.ts`) para resolver también `tenant_id` desde `users`
   (server-side, NUNCA en el JWT — coherente con la filosofía existente: cambios de permiso
   aplican sin re-login). **La misma query chequea `tenants.status`** (JOIN a `tenants`):
   tenant `suspended`/`archived` → 403. Un solo punto de enforcement del status para todos
   los frontends, costo ~cero (decidido 2026-07-02).
2. **Patrón por-método + helpers (`tenantWhere`/`tenantValues`)** — los métodos de service
   reciben `scope` como argumento, como hoy ya fluyen `country` y `tx` (idioma existente del
   codebase). Convención: `tenantWhere(table, scope)` como primer término de todo WHERE sobre
   tabla gym-owned; `tenantValues(scope, values)` en todo INSERT. Sin re-instanciar services,
   migración módulo por módulo.
   > Reemplaza al "`request.db` tenant-bound" originalmente asentado: inviable con services
   > singleton (db capturado en constructor), y un proxy de Drizzle no ve dentro de los 334
   > `sql``` crudos → cobertura parcial con apariencia de total = falsa seguridad.
3. **Sentinel de SQL a nivel pool mysql2** — envuelve `pool.query/execute` **por debajo de
   Drizzle**: ve el SQL final de TODO (query builder, `sql``` crudo, joins). Detecta query
   sobre tabla gym-owned sin `tenant_id`. **Decidido: test/dev = throw; prod = `log.error` +
   métrica** (no romper prod por un falso positivo del parser; endurecer después con datos
   reales). Exenciones anotadas `/* tenant-safe: <motivo> */` viajan en el SQL y quedan
   grepeables. Limitación asumida: chequea *presencia* de `tenant_id`, no *corrección* del
   filtro — es un tripwire contra el olvido; la corrección la prueba la capa 5.
4. **Chequeo estático en CI** — todo `sql\`\`` o join sobre tablas gym-owned debe referenciar
   `tenant_id` o llevar anotación explícita de exención (`/* tenant-safe: <motivo> */`).
   Convierte el olvido silencioso en fallo de build visible y documenta cada excepción.
5. **Tests de aislamiento cross-tenant (backstop real)** — sembrar 2 tenants, ejecutar cada
   endpoint como tenant A y verificar cero datos de B. **Mecanismo decidido:** hook `onRoute`
   de Fastify colecciona toda ruta registrada → se cruza contra un **manifiesto versionado**
   (`test/tenant-manifest.ts`: `tenant-scoped` / `global` / `templo-module`). **Ruta nueva
   sin clasificar = test rojo** (fail-closed: el backstop crece con el sistema, no se queda viejo).

**Regla de escritura (misma jerarquía que la de lectura):** en todo INSERT/UPDATE, el
`tenant_id` sale SIEMPRE de `scope.tenantId` resuelto server-side — **jamás de un payload
del cliente**. Un endpoint que acepte `tenantId` en el body es una vulnerabilidad de
escritura cross-tenant.

**Red de fondo:** migración incremental sin big-bang. Mientras solo exista el tenant 1 no
puede haber fuga (no hay otro tenant). El tenant 2 NO se onboardea hasta que los caminos
críticos pasen la batería de aislamiento.

### 4.3 Unique constraints → compuestas (tarea de la misma migración)

Hoy hay uniques **globales** que rompen el tenant #2 el primer día (ej.: dos gimnasios
tendrán socios con el mismo DNI). Toda unique de tabla gym-owned pasa a compuesta con
`tenant_id`. Inventario inicial (verificado en schema, 2026-07-01; revisar fino al migrar):

| Hoy (global) | Pasa a |
|---|---|
| `users.email` | `(tenant_id, email)` ⚠️ ligada a la decisión diferida de login/dominios |
| `users.dni` | `(tenant_id, dni)` |
| `branches.code` | `(tenant_id, code)` |
| `formats.name` | `(tenant_id, name)` *(si formats queda en core)* |
| `system_settings.setting_key` | reemplazada por `tenant_settings (tenant_id, setting_key)` |
| `day_modes.day_of_week` | `(tenant_id, day_of_week)` |
| `notifications.template_key` | `(tenant_id, template_key)` |
| `holidays (country, date)` | `(tenant_id, country, date)` |
| `aura_config.source_type`, `sessions.day_id`, slugs de blog/gladius | módulo-Templo — se resuelven en esa discusión, fuera del core MVP |

Esta conversión entra en **la misma migración** que agrega las columnas `tenant_id`, no después.
- **Marketing/lead del sitio Templo** (`blog_*`, `*_inquiries`, `franchise_applications`) y
  **SPOM/motor de rutinas** (`spom_*`, `sessions`, `session_*`, reglas): módulo-Templo — su
  scoping se resuelve dentro de esa discusión (§ módulos), no en el core del MVP.
- **Migración del Templo ≈ gratis:** crear `tenant 1`, setear `tenant_id=1` en branches +
  users, backfill del resto por la cadena de FK. Sin downtime.

---

## 5. Tabla `tenants` + anclas — diseño VALIDADO (fase 2)

> ✅ **VALIDADO con Nacho (2026-07-02)**, con 3 refinamientos incorporados: enforcement de
> `suspended` en `attachScope` (§4.2 capa 1), coexistencia gradual `system_settings` →
> `tenant_settings`, y nota de índices en la migración. Convenciones del repo respetadas:
> `int` autoincrement PK, timestamps `created_at/updated_at`, enums MySQL.

```ts
// src/db/schema/tenants.ts (propuesto — NO implementado aún)
export const tenantStatusEnum = mysqlEnum("tenant_status", [
  "active",    // operativo
  "suspended", // palanca operativa del SaaS (ej. falta de pago): login bloqueado, datos intactos
  "archived",  // baja lógica — NUNCA DELETE físico de un tenant
]);

export const tenants = mysqlTable("tenants", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),          // "El Templo"
  slug: varchar("slug", { length: 50 }).notNull().unique(),  // "el-templo"
  status: tenantStatusEnum.default("active").notNull(),
  // Defaults para nuevas branches del tenant — NO verdad absoluta: cada branch
  // conserva su country/timezone propios (modelo actual, no cambia).
  defaultCountry: varchar("default_country", { length: 2 }).default("AR").notNull(),
  defaultCurrency: varchar("default_currency", { length: 3 }).default("ARS").notNull(),
  defaultTimezone: varchar("default_timezone", { length: 50 })
    .default("America/Argentina/Buenos_Aires").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Config por-tenant: espeja el patrón existente de system_settings (KV), scoped.
// Hogar natural también para feature-flags por tenant (mecanismo de módulos: discusión aparte).
export const tenantSettings = mysqlTable("tenant_settings", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => [uniqueIndex("uq_tenant_setting").on(t.tenantId, t.settingKey)]);
```

**Anclas:** `branches.tenant_id` y `users.tenant_id` → `int notNull references tenants.id`.

**Notas de diseño (validadas 2026-07-02):**
- **`slug` único global**: identificador estable que funciona igual con sitio único,
  subdominio por tenant o dominio propio → **no bloquea la decisión diferida de login/dominios**.
  Reservar slugs a nivel aplicación (`admin`, `api`, `www`, …) por si esa diferida termina
  en subdominios.
- **`status` enum en vez de `is_active`**: "suspendido por falta de pago" ≠ "dado de baja";
  la suspensión reversible es la palanca comercial del SaaS. **Enforcement: capa 1
  (`attachScope`) chequea `tenants.status` en la misma query que resuelve el scope** (§4.2).
  Extensible con ALTER barato en MySQL 8 si aparecen `trial`/`onboarding`.
- **Sin campos de billing/plan comercial todavía**: se agregan cuando exista modelo
  comercial; no bloquean nada y evitamos diseñar en el aire.
- **`system_settings` → `tenant_settings`: coexistencia GRADUAL (decidido).**
  `tenant_settings` nace vacía; cada módulo migra sus keys cuando adopta el patrón
  por-método (§4.2 capa 2). `system_settings` se deprecia cuando migre el último módulo —
  coherente con la migración incremental sin big-bang.

**Secuencia de migración (Templo → tenant 1, sin downtime) — validada:**
1. Crear `tenants` + `tenant_settings`; sembrar fila `id=1` (El Templo).
2. Agregar `tenant_id` **nullable** a anclas y tablas gym-owned.
3. Backfill `tenant_id=1` (anclas directo; el resto por cadena de FK existente).
4. Volver `NOT NULL` + convertir uniques a compuestas (§4.3) en el mismo paso.

**Nota de índices (obligatoria en el paso 4):** toda tabla gym-owned filtra por `tenant_id`
en cada query → necesita índice. Las que reciben unique compuesta `(tenant_id, …)` lo tienen
gratis (prefijo); el resto lleva `INDEX (tenant_id)` explícito en la misma migración.

---

## 6. Decisiones abiertas (para fases 2–3)

- [x] ~~`tenant_id` compartido vs schema-por-tenant vs base-por-tenant~~ → **DECIDIDO: columna compartida + denormalizada** (§4).
- [x] ~~Mecanismo de módulos/extensiones~~ → **DECIDIDO Y VALIDADO (2026-07-02), diseño
  completo en [`04-mecanismo-modulos.md`](./04-mecanismo-modulos.md)**: 3 piezas (flags
  `module.<nombre>.enabled` en `tenant_settings` + guard `requireModule` 404 en rutas +
  registry de hooks tipado con 2 clases: filters bloqueantes / events best-effort).
  Composition root explícito (único archivo core que importa módulos); 4 módulos gruesos
  (`templo-training`/`templo-gamification`/`templo-marketing`/`templo-onboarding`);
  campos Templo del request viajan en sobre opaco `moduleInput` validado por el módulo.
  Hallazgo que lo dimensionó: la superficie real de hooks core→Templo es **2** (filter
  `pricing.adjust` + event `streak.milestone`); onboarding/programs→AURA son
  Templo→Templo (import directo legal).
- [x] ~~SPOM/niveles/AGORA/aura: ¿por-tenant configurable o módulo exclusivo Templo?~~ →
  **DECIDIDO vía grilla (doc 02): módulos exclusivos Templo**; lo genérico (catálogo de
  ejercicios global + motor de entrenamiento) se construye nuevo como core.
- [ ] Relación tenant ↔ country ↔ branch (hoy admin/gestion scope por `country`).
- [x] ~~Estrategia de migración sin downtime~~ → **DECIDIDA a alto nivel: incremental sin
  big-bang** (§4.2 red de fondo + §5 secuencia); detalle fino al ejecutar.
- [x] ~~Cómo viaja el `tenant_id` en el request~~ → **DECIDIDO: `scope.tenantId` resuelto
  server-side por-request en `attachCountryScope`, nunca en el JWT** (§4.2).
- [x] ~~Enforcement del filtro por tenant~~ → **DECIDIDO Y VALIDADO (2026-07-02): 5 capas**
  (scope + patrón por-método `tenantWhere`/`tenantValues` + sentinel de pool + CI lint +
  tests de aislamiento con manifiesto `onRoute` fail-closed) (§4.2).
- [ ] 🕓 **DIFERIDA (decisión de Nacho, 2026-07-02): app de miembros multi-tenant.**
  MVP white-label = **admin-only** (coherente con el scope de Correcciones: Finanzas,
  Alumnos, Horarios, Planes). Visión de Nacho: eventualmente **construimos nosotros una
  app de miembros multi-tenant NUEVA** — `el-templo-app` NO se transforma (demasiado
  Templo-céntrica: aura, niveles, SPOM, AGORA); queda como la app del tenant 1. La API se
  diseña hoy para servir múltiples frontends member-facing (el scope server-side y la regla
  de escritura ya lo cubren; las rutas member entran al manifiesto de la capa 5 como
  cualquier otra). Interactúa con la diferida de login/dominios en su dimensión stores:
  ¿una app multi-tenant con selección de gimnasio, o builds por tenant? Afecta clasificación
  de módulos member-facing en la grilla (02): lente "núcleo dormido vs Templo", sin bloquear.
  **Dependencia estructural señalada por Nacho (2026-07-02): `notifications` (push) queda
  dormido para tenants ≠ 1 hasta que esta app exista** — mientras tanto el canal
  member-facing del SaaS es `email`.
- [x] ~~🕓 DIFERIDA (decisión de Nacho, 2026-07-01): login / resolución de tenant / unicidad
  de email.~~ → **CERRADA por el doc 08 §H-3 (2026-08-27).** Sentido de la resolución: una
  capa nueva de resolución de tenant por hostname, anterior a `attachScope`, mapea el header
  `Host` al `slug` de `tenants` (`RESERVED_TENANT_SLUGS` ya reservado para esto); el login de
  la app de alumnos queda scoped por el tenant resuelto del host (deja de ser cross-tenant por
  email); `el-templo-admin` y `el-templo-app` quedan sobre el tenant 1 mientras su hostname no
  resuelva otro tenant, y migran al mismo mecanismo cuando corresponda. Un `Host` no resoluble
  se rechaza — nunca `?? 1` ni non-null assertion. Detalle completo en doc 08 §H-3.
- [ ] ¿MySQL sigue siendo la elección correcta a largo plazo, o Postgres (RLS) entra en la conversación?
- [x] ~~¿El SaaS debe separarse del monorepo el-templo?~~ → **DECIDIDO (2026-07-02): split
  diferido con trigger explícito.** Evidencia medida: cero imports de código entre apps (tipos
  espejados a mano, no workspace), CI ya particionado por app, deploy con path-filtering →
  no se acumula deuda por esperar. El split es el **acto de fundación del producto SaaS**,
  no limpieza preventiva. **Trigger re-enunciado por el doc 08 §H-4 (2026-08-27)** — la fase
  181 construyó la app de miembros multi-tenant dentro del monorepo (D-05: nacer en el
  monorepo es deliberado y NO adelanta el split, reusa CI/deploy/convenciones existentes), lo
  que hacía literalmente falsa la redacción anterior de este trigger ("el nacimiento de la app
  de miembros multi-tenant, que ESTRENA el repo SaaS"). Redacción vigente, idéntica a la del
  doc 08 §H-4:

  > El split de repos se dispara cuando la app de alumnos multi-tenant tiene **al menos un
  > tenant pago publicado en las tiendas** (App Store / Play Store) — no cuando el código nace
  > en el monorepo. Nacer en el monorepo (fase 181) es deliberado y NO adelanta el split: reusa
  > CI, deploy y convenciones existentes, mismo EC2, un vhost más.

  `el-templo-app` + `el-templo-web` quedan como repo del tenant 1. Triggers secundarios:
  identidad comercial / equipo propio.
- [ ] **Contrato de tipos API↔frontends** (decisión de fase 2-3, conviene con el refactor):
  hoy los tipos se **espejan a mano** en cada frontend (`// Mirrors el-templo-api/...`,
  ej. `WeeklySlotView` duplicada en `el-templo-app/src/types/scheduling.ts`). Con 3+
  frontends SaaS el drift silencioso escala. Opciones: paquete compartido (workspace pnpm,
  ata al monorepo) vs tipos generados de OpenAPI (repo-agnóstico, abarata el split futuro).
  El refactor tenancy tocará decenas de endpoints → oportunidad natural de resolverlo.
  **Empeora con la app "Kaia" de la fase 181 (doc 08)**: el monorepo pasa a tener **cinco**
  frontends espejando tipos a mano, no tres. El doc 08 no la resuelve, la registra acá como
  consecuencia asumida (doc 08, "Decisiones heredadas por las fases 182-192").

---

## Registro de cambios

- **2026-07-01** — Creación. Análisis del estado actual de `el-templo-api`, modelo
  de tenancy objetivo (tenant → branches), principios rectores. Fase 1 en curso.
- **2026-07-01** — Fase 1 análisis del doc de mejoras (`01-analisis-...`). Diagnóstico
  subscriptions (dato sucio de import, modelo sano). Entrada a fase 2: clasificación de las
  66 tablas + **decisión de aislamiento: `tenant_id` denormalizado** (§4).
- **2026-07-01 (repaso de sesión)** — Fase 1 cerrada. Decisiones: **enforcement en 4 capas**
  (§4.2) + **regla de escritura** (tenant_id solo server-side). Hallazgos del repaso:
  **uniques globales → compuestas** (§4.3, entra con la migración), login/dominios **diferida**
  sin bloquear (slug agnóstico). Borrador de `tenants` + `tenant_settings` + secuencia de
  migración (§5).
- **2026-07-01 (trabajo autónomo)** — Creados `02-inventario-modulos.md` (grilla núcleo/Templo/
  discutir: 13 CORE, 16 TEMPLO, 8 zona gris + acoples transversales) y
  `03-diseno-tenant-db-layer.md` (diseño técnico de la capa de datos). **Refinamiento
  importante:** la capa 2 del enforcement (`request.db`) resultó inviable con la arquitectura
  real (services singleton) → reemplazo propuesto por patrón por-método + sentinel de pool.
  Ambos docs pendientes de discusión/validación con Nacho.
- **2026-07-02** — **Validación con Nacho de la capa de datos (doc 03): ✅ aprobada** con
  decisiones: sentinel en prod = `log.error` + métrica (no throw); manifiesto de rutas
  fail-closed. §4.2 actualizado a 5 capas definitivas. Nueva diferida: **app de miembros
  multi-tenant propia** (`el-templo-app` no se transforma, app nueva eventual; MVP
  admin-only). Pendiente siguiente: borrador `tenants` (§5) + grilla (doc 02).
- **2026-07-02 (repos)** — Discusión repo/separation-of-concerns con evidencia medida (cero
  imports cross-app, CI particionado, deploy path-filtered). **Decidido: split diferido;
  trigger = la app de miembros multi-tenant estrena el repo SaaS.** Nueva decisión abierta:
  contrato de tipos API↔frontends (matar el patrón "mirror a mano" durante el refactor).
- **2026-07-02 (tabla tenants)** — **§5 VALIDADO con Nacho.** Refinamientos: enforcement de
  `suspended` en `attachScope` (capa 1, mismo query); `system_settings`→`tenant_settings`
  coexistencia gradual módulo a módulo; nota de índices `tenant_id` en el paso 4; slugs
  reservados a nivel app. Pendiente siguiente: grilla del inventario (doc 02).
- **2026-07-02 (grilla, ejercicios)** — **Decisión de Nacho sobre ejercicios/rutinas:**
  catálogo genérico GLOBAL de ejercicios (core, nuevo, sin tenant_id) + motor de rutinas
  automatizadas tipo-SPOM para gimnasios convencionales (core futuro, post-MVP); el SPOM
  actual queda módulo Templo sin transformar (su tabla `exercises` es el árbol de
  progresión, no un catálogo). Detalle en doc 02 §2. Grilla CORE/TEMPLO en discusión.
- **2026-07-02 (coach + secuencia)** — **Decisión de Nacho sobre `coach`:** coach-cajero =
  modo operativo Templo (sucursales sin recepción), no el caso típico → la funcionalidad de
  cobros/deudas es core (superficie Finanzas/PoS según Correcciones) y el acceso se gobierna
  por **roles configurables por tenant**, no por módulo (doc 02 §1). **Confirmado además:**
  la reforma del admin según Correcciones es workstream paralelo que puede preceder a los
  tenants (nota en §0).
- **2026-07-02 (grilla)** — **§1 CORE y §2 TEMPLO confirmados en bloque** por Nacho.
  Matices: `notifications` = core dormido para tenants ≠ 1 hasta la app multi-tenant (el
  canal member-facing del SaaS mientras tanto es `email`). **Zona gris 4/8 decididos:**
  campaigns (motor core + contenido tenant), programs (Templo; la noción SaaS se integra
  al futuro motor de entrenamiento genérico), member-profiles (no partir tabla, partir
  significado), segmentation (core + umbrales en `tenant_settings`). Pendientes: streaks,
  check-ins, onboarding, member-logins → luego §4.1/§4.2 del doc 02.
- **2026-07-02 (cierre §4 doc 02)** — **§4.1 y §4.2 decididos**: columnas Templo de
  `users.ts` quedan gobernadas por módulos (salvo `bar_challenge_*`: se borran con su
  módulo, previa verificación en prod); dirección **hooks/eventos** confirmada para romper
  los acoples (AURA + boarding pass en pricing). **Fase 2 de diseño: inventario y capa de
  datos COMPLETOS. Próxima sesión: diseño del mecanismo de módulos.**
- **2026-07-02 (cierre grilla)** — **Zona gris 8/8 decididos** (doc 02 §3): streaks =
  núcleo core + recompensa como hook; check-ins = Templo; onboarding = Templo (el genérico
  nace con la app multi-tenant); member-logins = core. **Inventario COMPLETO.** Quedan las
  2 estructurales del doc 02 §4 — columnas Templo en `users.ts` (propuesta: quedan,
  gobierna el mecanismo de módulos, mismo criterio que member-profiles) y acople
  `AuraService` en 4 services core (propuesta: dirección hooks/eventos, core nunca importa
  módulos) — y con eso se abre la **discusión del mecanismo de módulos/flags**, la gran
  decisión que sigue.
- **2026-07-02 (mecanismo de módulos — propuesta)** — Creado
  [`04-mecanismo-modulos.md`](./04-mecanismo-modulos.md) (trabajo autónomo, exploración
  del wiring real de la API). **Hallazgo central:** solo 2 de los 4 acoples de AuraService
  son core→Templo (pricing en subscriptions + milestone de racha); onboarding y programs
  son módulos Templo → import directo legal → la superficie de hooks del MVP es mínima.
  Diseño propuesto: 3 piezas (flags KV por tenant, gating de rutas `requireModule`,
  registry tipado con filters/events), regla de dirección de imports, composition root
  explícito, módulos gruesos (training/gamification/marketing/onboarding), filter
  `pricing.adjust` con `commit:false` para preview (de paso mata la cadena de pricing
  duplicada en 4 métodos). **PENDIENTE: validar las 6 decisiones de doc 04 §8 con Nacho.**
- **2026-07-02 (mecanismo de módulos — ✅ VALIDADO)** — **Las 6 decisiones del doc 04 §8
  aprobadas por Nacho** tal como se propusieron: 3 piezas mínimas, flags en
  `tenant_settings` KV, composition root explícito, filters-propagan/events-aíslan,
  4 módulos gruesos, `moduleInput` opaco. **FASE 2 DE DISEÑO COMPLETA.**
- **2026-07-26 (fase 3 — borrador)** — Prerequisito cumplido (reforma admin v5.4 en prod
  desde 2026-07-08). Creados **doc 05** (inventario real: **89 tablas**, no 66 — el doc 02
  subcontó archivos multi-tabla; 15 nuevas post-diseño incl. wellhub/tv/referidos; 10
  minas M1-M10, destacan `campaign_unsubscribes.email` UNIQUE global y escrituras sin
  request del webhook Wellhub) y **doc 06** (estrategia de migración en 4 tandas SQL +
  `TenantContext` para crons/webhooks + propuesta de fases GSD T1-Tn). **Pendiente:
  discusión con Nacho de las 5 preguntas del doc 06 §8.**
- **2026-07-26 (cierre fase 3)** — **Las 5 preguntas del doc 06 §8 RESUELTAS en sesión:**
  (Q1) Wellhub = CORE-integración con flag por tenant, **no ofertada a otros gimnasios
  por ahora** (acuerdo puntual del Templo); (Q2) `labs_inquiries` = GLOBAL de plataforma
  — primera tabla global existente; (Q3) referidos = CORE (el hook `pricing.adjust` pasa
  a 4 clientes: override → boarding pass → AURA → referral); (Q4) lista M8 aprobada
  completa — las 11 uniques de ids externos/secretos quedan globales; (Q5) supresión de
  unsubscribes POR TENANT (`(tenant_id, email)` compuesta, resuelve M3). **FASE 3
  CERRADA. Próximo: milestone GSD de tenancy (fases T1-T6+ del doc 06 §7).**
- **2026-07-26 (brief módulo Gimnasio)** — Ingresó
  [`brief-fran-modulo-gimnasio.md`](./brief-fran-modulo-gimnasio.md) (Nacho, 2026-07-24):
  el catálogo genérico + motor de entrenamiento que el doc 02 ya reservaba como "core a
  construir nuevo", ahora con spec de producto (catálogo global+local, plantillas,
  asignación, registro por serie, panel del profe). **Decisiones de la sesión (addendum
  A1-A7):** frontera = **módulo duro dentro del mismo sistema** (tablas/rutas propias,
  cero imports con SPOM, acople solo por FKs core — se descartó sistema separado por el
  costo de sincronizar socios/membresías entre dos bases); dos catálogos confirmados
  (SPOM intocado); prior fuerte: Calistenia y Gimnasio NO comparten modelo de datos;
  agregados categoría derivada (7 categorías por mapeo fijo) y "crear rutina desde cero"
  solo-profe-v1; superficie member-facing se decide en la fase de diseño (diferida de la
  app multi-tenant REABIERTA); **secuencia: milestone Tenancy primero, milestone Módulo
  Gimnasio después.**
- **2026-07-02 (cierres de sesión)** — **(a) Verificación bar-challenge en prod hecha**
  (SSH read-only con OK): el evento SÍ se usó (18 intentos 23-28 may, 1 completado 346s)
  → **decisión revertida por Nacho: el módulo `bar-challenge` SE CONSERVA** dentro de
  `templo-gamification`, columnas `bar_challenge_*` quedan gobernadas por módulos (doc 02
  §4.1 y doc 04 §2.1 actualizados). **(b) Secuencia de workstreams decidida: PRIMERO la
  reforma del admin según Correcciones, DESPUÉS tenancy — secuencial, no paralelo** (§0).
  Siguiente sesión: arrancar la reforma del admin; fase 3 (migración detallada) queda
  para después de la reforma.
- **2026-08-27 (fase 181, cierre — reconciliación con el doc 08)** — Agregado
  [`08-diseno-modulo-gimnasio.md`](./08-diseno-modulo-gimnasio.md) al índice (§0): diseño
  del módulo Gimnasio, completo, pendiente firma de Franco (D-09). **Diferida de
  login/resolución de tenant/unicidad de email CERRADA por el doc 08 §H-3** (§6):
  resolución de tenant por hostname anterior a `attachScope`, login de la app de alumnos
  scoped por el tenant del host. **Trigger del split de repos re-enunciado por el doc 08
  §H-4** (§6): el split se dispara con el primer tenant pago publicado en tiendas, no con
  el nacimiento de la app en el monorepo — la app de alumnos ("Kaia") nació en el monorepo
  en esta misma fase sin disparar el trigger, por decisión explícita (D-05). El README y el
  doc 08 dejan de decir cosas distintas sobre este punto. Nota agregada a la decisión
  abierta de contrato de tipos: con la app nueva, el monorepo pasa a tener cinco frontends
  espejando tipos a mano.
