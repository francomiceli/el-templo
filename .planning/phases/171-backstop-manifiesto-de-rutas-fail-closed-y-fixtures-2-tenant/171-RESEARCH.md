# Phase 171: Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant - Research

**Researched:** 2026-07-29
**Domain:** Fastify 5 (hook `onRoute`, inventario de rutas) + infraestructura de tests Vitest/MySQL del repo
**Confidence:** HIGH (todo lo central se verificó ejecutando código contra el repo real, no por memoria)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Forma del manifiesto**

- **D-01:** **Entradas explícitas por ruta exacta** (method + path), agrupadas por módulo
  en el archivo. ~300 entradas escritas una sola vez en esta fase; toda ruta nueva agrega
  su línea a mano — esa edición ES la "decisión consciente" que pide el goal. **Sin reglas
  por prefijo ni comodines**: una regla comodín clasificaría rutas futuras sin que nadie
  lo piense y vaciaría el criterio 2 del ROADMAP.
- **D-02:** Toda entrada **`global` lleva motivo escrito obligatorio** al lado (mismo
  espíritu que las exenciones `/* tenant-safe: <motivo> */` del lint de la 170). Las
  `tenant-scoped` no llevan anotación: son el default masivo. Las `templo-module` heredan
  el criterio de revisión de D-03/D-05 (lista corta revisada por humano).

**Revisión humana de la clasificación inicial**

- **D-03:** **Checkpoint bloqueante** donde Franco revisa SOLO las listas cortas y
  peligrosas: `global` (~10-20 rutas, con sus motivos) y `templo-module` (~30-50). La masa
  `tenant-scoped` va sin revisión: equivocarse hacia tenant-scoped sobra protección, no
  falta.
- **D-04:** **Ruta dudosa → al checkpoint**, en una sección aparte con la recomendación
  del clasificador y su porqué (ej. de zonas grises: blog, academy, franchise,
  app-landing). Nada dudoso se clasifica solo.

**Fixtures del tenant 2**

- **D-05:** Siembra **opt-in por archivo de test** (helper explícito, p. ej.
  `seedSecondTenant`) — formaliza lo que la fase 169 ya hacía a mano con tenants ad-hoc
  (90169/90269/90369/90469). Los ~140 archivos existentes no ven el tenant 2 y sus
  conteos no cambian: el criterio 4 se cumple por construcción. NO se siembra en el setup
  global.
- **D-06:** El gimnasio 2 es un **espejo mínimo fijo y determinístico**: 1 sede, 1 admin,
  1 coach, 2 socios, 1 plan, 1 schedule. Suficiente para probar aislamiento en cualquier
  ruta y barato de sembrar (los tests MySQL ya tardan ~100 s/archivo). Si una batería
  necesita más volumen, lo agrega ella misma.

**Categoría templo-module**

- **D-07:** Los features exclusivos de El Templo (SPOM, gladius, academy, tree-editor,
  etc.) **se etiquetan `templo-module` YA en esta fase**, aunque el enforcement
  `requireModule` llegue en la 176. La decisión consciente se toma una sola vez (y Franco
  la revisa en el checkpoint D-03); la 176 solo agrega enforcement a rutas ya marcadas.
  Beneficio adicional: las fases 172-175 no incluyen esas rutas en la batería de
  aislamiento sin necesidad.

### Claude's Discretion

- Identificación exacta de una ruta (formato de la clave method+path, manejo de prefijos
  de plugins), estructura interna del archivo del manifiesto, y wording de los mensajes
  de rojo (deben nombrar la ruta faltante y decir qué hacer — seguir el precedente de los
  mensajes del lint 170).
- Cómo resolver la limpieza del tenant 2 entre tests (trampa conocida: `cleanAllTestData`
  es global-admin y `branches` no está en `TABLES_TO_CLEAN` — ver code_context). El
  patrón `limpiarRastro()` del 169-06 es el precedente.
- Dónde vive el test del manifiesto y cómo se integra a la suite/CI existente.

### Deferred Ideas (OUT OF SCOPE)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`) — matcheó por keywords
  genéricas; sin relación con el backstop de tenancy. Queda pendiente donde estaba.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ISO-01** | Manifiesto versionado (`test/tenant-manifest.ts`) clasifica el 100% de las rutas (`tenant-scoped`/`global`/`templo-module`); hook `onRoute` fail-closed: ruta nueva sin clasificar = test rojo | §Inventario real (370 rutas verificadas), §Pattern 1 (seam en `buildApp`), §Pattern 2 (normalización de clave + trampa HEAD), §Pattern 3 (comparador como función pura para el criterio 2), §Pitfalls 1-6 |
| **ISO-02** | Fixtures de test siembran 2 tenants; helpers (`createStaffUser` y afines) soportan crear staff/socios por tenant | §Pattern 4 (`seedSecondTenant`), §Pattern 5 (helpers con `tenantId` opcional default 1), §Pitfalls 7-11 (leak de `branches`, `cleanAllTestData`, login por email global, register no tenant-aware) |

</phase_requirements>

---

## Summary

La fase tiene dos mitades técnicamente independientes y ambas resultaron **más
determinadas de lo que el CONTEXT anticipaba**, en un caso para bien y en otro para mal.

**Mitad ISO-01 (manifiesto).** El inventario real ya no es una estimación: se volcó
ejecutando `buildApp()` con un hook `onRoute` colgado. Son **370 entradas method+url**
(no "~300"), más 199 rutas `HEAD` que Fastify genera solo y que **no deben entrar al
manifiesto**. El mecanismo del doc 03 §"Capa 5" funciona, pero tiene un requisito
estructural que hay que decidir en el plan: **el hook `onRoute` NO se puede colgar desde
`createTestApp()`**. Se verificó en vivo que un hook agregado después de un
`await app.register(...)` no ve ninguna ruta previa, y que agregarlo después de
`app.ready()` tira `FST_ERR_INSTANCE_ALREADY_LISTENING`. Fastify no expone ninguna API de
enumeración de rutas (se probó `kRouter`: no existe en v5.7.4) y `printRoutes()` **miente**
—fusiona parámetros de distinto nombre en `:id|:sessionId`— así que no sirve como fuente.
Conclusión: `buildApp()` necesita un seam opcional test-only de una línea. Es barato:
`buildApp` tiene exactamente **2 call sites** en todo el repo.

**Mitad ISO-02 (fixtures).** Acá aparecieron tres trampas duras que el plan tiene que
absorber. (1) `POST /api/auth/register` **no conoce el tenant** —cero menciones de tenant
en `src/modules/auth/routes.ts`— así que `createTestMember`, que va por la API, **no puede
crear un socio del tenant 2**: el DEFAULT 1 de la columna se lo come. El camino del tenant
2 tiene que ser INSERT directo con Drizzle, como ya hace `createStaffUser`. (2) El login
resuelve por `eq(users.email, email)` **sin filtro de tenant**, y `register` rechaza email
duplicado globalmente: los emails del gimnasio 2 tienen que ser distintos de los del 1,
aunque la unique ya sea compuesta desde la 168. (3) De las 87 tablas gym-owned, **15 no
las limpia `cleanAllTestData`** —entre ellas `branches`, `cash_registers` y `aura_config`—
así que la sede del tenant 2 sobrevive entre archivos del mismo worker (`isolate: false`)
y la fila de `tenants` no se puede borrar mientras esa sede la referencie
(`fk_branches_tenant`). El `limpiarRastro()` del 169-06 es exactamente el antídoto.

**El hallazgo que más impacta la planificación:** la lista `templo-module` que D-03 manda
a revisión humana **no son 30-50 rutas: son ~141** (templo-training 102, templo-marketing
35, templo-onboarding 3, templo-gamification 1), aplicando el mapeo carpeta→módulo que el
doc 04 §2.1 ya tiene validado con Nacho. La lista `global` sí cae dentro de lo estimado
(8 firmes + hasta 6 dudosas). El checkpoint hay que estructurarlo por MÓDULO (4 grupos +
prefijos), no ruta por ruta, o se vuelve impracticable.

**Primary recommendation:** agregar a `buildApp(opts?: { onRoute? })` un seam opcional de
una línea; generar el manifiesto una sola vez con el volcado que ya está probado acá;
descartar `HEAD` con un guard explícito (no con un filtro silencioso); y extraer el
comparador manifiesto↔runtime a una **función pura exportada** para que el criterio 2 se
demuestre con fixtures sintéticos en CI y no solo con una sonda borrada a mano.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Observar las rutas registradas | API / Backend (Fastify, boot) | — | El único momento en que existe la lista completa es durante `buildApp()`; ningún otro tier la ve |
| Almacenar la clasificación por ruta | Test infra (`test/tenant-manifest.ts`) | — | Es un artefacto de decisión versionado, no runtime de producción (doc 03 §Capa 5: "plugin test-only") |
| Comparar manifiesto vs. runtime y fallar | Test infra (Vitest) | CI (`api-test` job) | CI ya corre `pnpm test` contra MySQL 8.0; no hace falta step nuevo |
| Sembrar datos del gimnasio 2 | Test infra (`test/helpers.ts` + fixture) | Database (INSERT directo) | Las rutas de escritura NO son tenant-aware hasta las fases 172-175; el borde HTTP no puede crear datos del tenant 2 |
| Resolver el tenant de un request | API / Backend (`attachScope`, fase 166) | — | Ya existe, esta fase no lo toca |
| Enforcement `requireModule` | API / Backend | — | **Fase 176**, fuera de alcance: acá solo se pone la ETIQUETA (D-07) |

---

## Standard Stack

### Core — todo ya instalado, cero deps nuevas

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastify` | **5.7.4** [VERIFIED: `node -e require('fastify/package.json').version`] | Hook `onRoute`, semántica de prefijos y HEAD automático | Ya es el framework del API |
| `@fastify/cors` | **11.2.0** [VERIFIED: idem] | Registra `OPTIONS *` — entra al manifiesto | Ya instalado |
| `vitest` | **4.0.18** [VERIFIED: `package.json` devDependencies] | Runner del gate | Ya es el runner de los 232 archivos de test |
| `drizzle-orm` | **0.45.1** [VERIFIED: idem] | INSERT directo de los fixtures del tenant 2 | Ya es el ORM |
| `argon2` | **0.44.0** [VERIFIED: idem] | Hash de password de staff/socios sembrados directo | Ya lo usa `createStaffUser` |

### Supporting — piezas del propio repo

| Módulo | Purpose | When to Use |
|--------|---------|-------------|
| `src/modules/shared/tenant.ts` (`tenantValues`, `TenantContext`) | Estampar `tenantId` explícito en los INSERT del fixture | **Siempre** en la siembra del gimnasio 2 — sin él el DEFAULT 1 hace que un test pase en verde probando nada (trampa T-168-15, ya mordió en 169-05 y 169-06) |
| `test/helpers.ts` (`createStaffUser`, `createTestMember`, `createTestPlan`, `assignTestPlan`, `cleanAllTestData`, `ensureEfectivoCaja`) | Base a extender con `tenantId` | ISO-02 |
| `test/tenancy/tenant-helpers.test.ts` + `test/tv/tv-pairing-tenant.test.ts` | Precedente de `limpiarRastro()` y de siembra de tenant ad-hoc | Copiar el patrón, no reinventarlo |
| `test/db/tenant-tables.test.ts` | **Precedente exacto** del gate fail-closed bidireccional con mensaje accionable | Modelo literal del test del manifiesto |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Seam `onRoute` en `buildApp()` | `app.printRoutes({ commonPrefix:false })` después de `ready()` | **RECHAZADO por evidencia**: printRoutes fusiona parámetros distintos en un solo nodo (`/api/admin/sessions/:id\|:sessionId/...`, 10+ rutas afectadas) y el árbol hay que parsearlo con caracteres de caja. El volcado por printRoutes dio 384 entradas contra las 370 reales |
| Seam `onRoute` en `buildApp()` | Leer el router interno (`kRouter` / find-my-way) | **RECHAZADO por evidencia**: `require("fastify/lib/symbols.js")` en 5.7.4 solo expone `kRoutePrefix`, `kRouteContext`, `kRouteByFastify`. No hay handle al router |
| Seam `onRoute` en `buildApp()` | Reconstruir la lista de `register(...)` dentro del test | **RECHAZADO**: duplica los 35 registros de `app.ts`; se desincroniza en silencio, que es exactamente lo que la fase viene a impedir |
| Parámetro `onRoute` en `buildApp` | Parámetro `plugins: FastifyPluginCallback[]` (plugin test-only literal, como dice el doc 03) | Equivalente y más ceremonioso. El doc dice "plugin test-only"; un callback es la misma idea con menos superficie. **Decisión del planner** — las dos honran el diseño cerrado |
| Manifiesto en `test/` | Manifiesto en `src/` | `test/` es correcto: el doc 03 lo pide, y **el lint de tenancy de la 170 excluye `test/` a propósito** (`lint-tenant.ts:41-42`), así que un manifiesto en `test/` no genera ruido en CON-06 |

**Installation:** ninguna. **Cero dependencias nuevas.**

---

## Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete externo.** Todo el trabajo usa
dependencias ya presentes en `el-templo-api/package.json` y verificadas en el `node_modules`
del worktree. No se corrió slopcheck porque no hay candidatos a auditar.

Recordatorio de CLAUDE.md/memoria: **nunca instalar ni actualizar dependencias sin
preguntar** (precedente axios supply chain). Si un plan propone una dep nueva, es señal de
que se salió del alcance.

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────┐
   pnpm test (CI + local) │  vitest  →  test/setup.ts (por worker)   │
                          │  provisiona eltemplo_test_<POOL_ID>      │
                          └───────────────────┬─────────────────────┘
                                              │
        ┌─────────────────────────────────────┴──────────────────────────────┐
        │                                                                    │
        ▼  ISO-01                                                            ▼  ISO-02
┌───────────────────────────────┐                       ┌────────────────────────────────────┐
│ test/tenancy/iso-01-*.test.ts │                       │ archivo de test que hace opt-in     │
└──────────────┬────────────────┘                       └──────────────┬─────────────────────┘
               │ createTestApp({ collectRoutes })                      │ seedSecondTenant(app)
               ▼                                                       ▼
   ┌─────────────────────────┐                          ┌──────────────────────────────────┐
   │ buildApp(opts.onRoute)  │  ← seam de 1 línea       │ INSERT directo (Drizzle)         │
   │  addHook("onRoute")     │    ANTES del 1er register│  tenants(id=906xx)               │
   └───────────┬─────────────┘                          │  branches   ─┐                   │
               │ 569 eventos (370 útiles + 199 HEAD)    │  users×4     │ tenantValues(ctx) │
               ▼                                        │  plan, sched ─┘                   │
   ┌─────────────────────────┐                          └──────────────┬───────────────────┘
   │ normalizar clave        │                                         │
   │  METHOD + url           │                                         ▼
   │  expandir method[]      │                          ┌──────────────────────────────────┐
   │  guard: HEAD sin GET?   │                          │ afterAll: limpiarRastro()        │
   └───────────┬─────────────┘                          │  sedes → users → tenant (orden   │
               │ Set<string> observadas                 │  obligado por fk_branches_tenant)│
               ▼                                        └──────────────────────────────────┘
   ┌──────────────────────────────────────────────┐
   │ compararManifiesto(observadas, MANIFIESTO)   │  ← FUNCIÓN PURA EXPORTADA
   │   → { faltantes[], fantasmas[], sinMotivo[] }│    (habilita el criterio 2 con fixtures)
   └───────────┬──────────────────────────────────┘
               ▼
   ┌──────────────────────────────────────────────┐
   │ expect(faltantes).toEqual([])  + mensaje que  │
   │ NOMBRA la ruta y dice qué hacer               │
   └──────────────────────────────────────────────┘
               ▲
               │ lee
   ┌───────────┴──────────────────────────────────┐
   │ test/tenant-manifest.ts  (370 entradas)      │
   │  tenant-scoped │ global (+motivo) │ templo-*  │
   └──────────────────────────────────────────────┘
```

### Recommended Project Structure

```
el-templo-api/
├── src/
│   └── app.ts                       # + seam opcional onRoute (1 línea, guardado por opts)
└── test/
    ├── tenant-manifest.ts           # NUEVO — el manifiesto + el comparador puro
    ├── helpers.ts                   # createTestApp(opts?), createStaffUser(+tenantId), …
    ├── fixtures/
    │   └── second-tenant.ts         # NUEVO — seedSecondTenant() + limpiarRastro()
    └── tenancy/
        ├── iso-01-manifiesto.test.ts    # NUEVO — gate fail-closed bidireccional
        └── iso-02-fixtures.test.ts      # NUEVO — el espejo del gimnasio 2 es correcto
```

> `vitest.config.ts` tiene `include: ["test/**/*.test.ts"]`, así que `test/tenant-manifest.ts`
> y `test/fixtures/second-tenant.ts` son módulos, no archivos de test. [VERIFIED: `vitest.config.ts:6`]

### Pattern 1: El seam de `onRoute` va DENTRO de `buildApp`, antes del primer `register`

**What:** `buildApp` acepta un parámetro opcional y cuelga el hook como primerísima acción.

```ts
// src/app.ts
import type { RouteOptions } from "fastify";

export interface BuildAppOptions {
  /**
   * Fase 171 (ISO-01) — seam TEST-ONLY del inventario de rutas. `src/index.ts`
   * NO lo pasa: en producción esto es exactamente `undefined` y no se agrega
   * ningún hook. Va acá y no en `createTestApp()` porque un hook `onRoute`
   * solo ve las rutas registradas DESPUÉS de colgarse, y para cuando
   * `buildApp()` retorna ya se registraron las 370.
   */
  onRoute?: (route: RouteOptions) => void;
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({ ... });
  if (opts.onRoute) app.addHook("onRoute", opts.onRoute);
  app.addContentTypeParser(...);
  await app.register(cors, ...);
  // …
}
```

**When to use:** siempre; no hay alternativa viable (ver Alternatives Considered).

**Evidencia ejecutada** [VERIFIED: probe corrido en el worktree contra fastify 5.7.4]:

```
# hook colgado ANTES de los register → ve todo, incluido lo de plugins anidados y fp()
OPTIONS url=*                    routePath=*      prefix=""
GET     url=/api/x/a             routePath=/a     prefix="/api/x"
HEAD    url=/api/x/a             routePath=/a     prefix="/api/x"
POST|PUT url=/api/x/multi        routePath=/multi prefix="/api/x"
GET     url=/api/x/nested/deep   routePath=/deep  prefix="/api/x/nested"
GET     url=/fp-route            routePath=/fp-route prefix=""

# hook colgado DESPUÉS de `await app.register(...)` → NO ve nada previo
late hook saw: ["GET /root","HEAD /root"]     # solo lo posterior
hasRoute /api/x/a: true                        # la ruta existe; el hook simplemente no la vio

# hook colgado después de `ready()` → error duro
FastifyError [FST_ERR_INSTANCE_ALREADY_LISTENING]: Fastify instance is already listening.
```

**Blast radius:** `buildApp` tiene **2 call sites** en todo el repo (`src/index.ts:26` y
`test/helpers.ts:23`). [VERIFIED: grep]

### Pattern 2: Clave de ruta — normalización, y el guard de HEAD

**What:** la clave del manifiesto es `` `${METHOD} ${url}` `` con `url` tal cual lo reporta
`onRoute` (ya lleva el prefijo compuesto), previo a dos normalizaciones obligatorias.

1. **`routeOptions.method` puede ser un array.** `app.route({ method: ["POST","PUT"] })`
   dispara UN evento con `method: ["POST","PUT"]`. Hay que expandirlo.
   [VERIFIED: probe — `POST|PUT url=/api/x/multi`]
2. **`HEAD` no entra al manifiesto, pero no se filtra en silencio.** Fastify 5 tiene
   `exposeHeadRoutes: true` por default [CITED: fastify.dev/docs/latest/Reference/Server/]
   y dispara `onRoute` también para el HEAD sintético. Son 199 de los 569 eventos.

**La sutileza que hay que ver antes de escribir el filtro** — para una ruta declarada en
`"/"` dentro de un plugin con prefijo, Fastify dispara **tres** eventos, no dos:

```
GET  url=/api/thing   routePath=""    prefix=/api/thing
HEAD url=/api/thing   routePath=""    prefix=/api/thing
HEAD url=/api/thing/  routePath="/"   prefix=/api/thing   ← fantasma (prefixTrailingSlash)
POST url=/api/thing   routePath=""    prefix=/api/thing
```

[VERIFIED: probe aislado]. En el app real eso produce exactamente **7 HEAD fantasma con
barra final** y **ningún GET con barra final**:

```
/api/admin/analytics/   /api/admin/check-ins/   /api/admin/improvement-proposals/
/api/admin/members/     /api/admin/ratings/     /api/admin/users/
/api/members/referrals/
```

**Regla recomendada (fail-closed, no filtro ciego):**

```ts
// 1. separar
const heads   = observadas.filter((r) => r.method === "HEAD");
const noHead  = observadas.filter((r) => r.method !== "HEAD");
const getUrls = new Set(noHead.filter((r) => r.method === "GET").map((r) => r.url));

// 2. GUARD: todo HEAD tiene que ser derivado de un GET (con o sin barra final).
//    Si mañana alguien declara un HEAD a mano, esto se pone rojo en vez de tragárselo.
const headHuerfanos = heads.filter(
  (r) => !getUrls.has(r.url) && !getUrls.has(r.url.replace(/\/$/, "")),
);
expect(headHuerfanos, "HEAD declarado a mano: clasificalo o quitalo…").toEqual([]);

// 3. el manifiesto se compara solo contra `noHead` → 370 entradas
```

**Anti-pattern:** normalizar la barra final de TODAS las urls. `GET /api/admin/analytics`
y una hipotética `GET /api/admin/analytics/` son claves distintas para find-my-way
(`ignoreTrailingSlash` está en su default `false`); colapsarlas escondería una ruta real.

### Pattern 3: El comparador es una FUNCIÓN PURA exportada (esto es lo que habilita el criterio 2)

**What:** separar "juntar las rutas del app real" de "comparar dos listas y armar el
mensaje". Solo la segunda mitad se puede probar sin tocar el app.

```ts
// test/tenant-manifest.ts
export type Categoria = "tenant-scoped" | "global" | "templo-module";
export interface EntradaManifiesto {
  categoria: Categoria;
  /** D-02: obligatorio y no vacío cuando categoria === "global". */
  motivo?: string;
  /** D-07: qué módulo Templo, cuando categoria === "templo-module". */
  modulo?: "templo-training" | "templo-gamification" | "templo-marketing" | "templo-onboarding";
}
export const TENANT_MANIFEST: Record<string, EntradaManifiesto> = { /* 370 */ };

export interface Discrepancias {
  faltantes: string[];   // observadas en runtime, ausentes del manifiesto
  fantasmas: string[];   // en el manifiesto, ya no registradas
  sinMotivo: string[];   // global sin motivo escrito (D-02)
  sinModulo: string[];   // templo-module sin módulo declarado (D-07)
}
export function compararManifiesto(
  observadas: readonly string[],
  manifiesto: Readonly<Record<string, EntradaManifiesto>> = TENANT_MANIFEST,
): Discrepancias { /* … */ }
```

**Por qué:** el criterio 2 pide **demostrado, no asumido**. Con la función pura se
demuestra en CI, para siempre y sin tocar `app.ts`:

| Test | Entrada | Aserción |
|------|---------|----------|
| 1 (real) | rutas del app real vs. manifiesto real | las 4 listas vacías |
| 2 (sintético) | `[...reales, "POST /api/ruta-nueva-sin-clasificar"]` | `faltantes` contiene esa clave **y** el mensaje del `expect` la nombra literal |
| 3 (sintético) | manifiesto con una clave que ya no existe | `fantasmas` la nombra (atrapa renames y typos) |
| 4 (sintético) | entrada `global` con `motivo: ""` | `sinMotivo` la nombra (D-02 enforced en runtime) |

Además de eso, el ejecutor debe hacer **la sonda en vivo una vez** —agregar una ruta boba
en `app.ts`, ver el rojo, borrarla sin commitear— siguiendo el precedente literal de
`src/jobs/__gate-probe.ts` del 169-04 y del `additionalProperties` del 169-08. Las dos
cosas: la sonda prueba el cableado completo, los fixtures lo dejan probado en CI.

### Pattern 4: `seedSecondTenant` — INSERT directo, nunca por la API

**What:** un helper opt-in que siembra el espejo mínimo de D-06 con `tenantValues` y
devuelve un handle con todos los ids + tokens.

```ts
// test/fixtures/second-tenant.ts
export const TENANT_DOS = 90_671;              // id alto, libre (ver §Convención de ids)
const CTX: TenantContext = { tenantId: TENANT_DOS };

export interface SegundoGimnasio {
  tenantId: number; branchId: number;
  adminId: number; adminToken: string;
  coachId: number; coachToken: string;
  socios: [{ id: number; token: string }, { id: number; token: string }];
  planId: number; scheduleId: number;
}

export async function seedSecondTenant(app: FastifyInstance): Promise<SegundoGimnasio> { … }
export async function limpiarSegundoGimnasio(app: FastifyInstance): Promise<void> { … }
```

**Reglas no negociables del cuerpo:**

- **Todo INSERT pasa por `tenantValues(CTX, …)`**, incluido el de `branches`. Un INSERT sin
  la columna cae en el `DEFAULT 1` de `tenantIdColumn()` y el fixture "funciona" sembrando
  en el tenant 1 — la trampa T-168-15, que ya mordió dos veces en la 169.
  [VERIFIED: `src/db/schema/tenant-column.ts` — `int("tenant_id").notNull().default(1)`]
- **Los emails llevan sufijo propio del gimnasio 2.** `POST /auth/login` resuelve con
  `where(eq(users.email, email))` **sin filtro de tenant**, y `register` rechaza email
  duplicado con la misma query. [VERIFIED: `src/modules/auth/routes.ts:66-72, 412`]
  Emails repetidos entre tenants harían que el token del gimnasio 2 sea no-determinístico.
- **Los tokens se sacan con `getAuthToken`** (login normal): funciona porque el login es
  tenant-agnóstico hoy. No hay que firmar JWTs a mano.
- **`ensureEfectivoCaja(app, branchId)`** si el espejo va a cobrar: `TransactionService.create()`
  tira duro cuando una sede no tiene caja efectivo. [VERIFIED: `test/helpers.ts:290-297`]

### Pattern 5: `tenantId` como parámetro opcional con default 1

**What:** la firma que el criterio 3 pide sin romper los ~215 archivos que ya llaman a
estos helpers.

```ts
export async function createStaffUser(
  app: FastifyInstance,
  data: { email: string; password: string; firstName: string; lastName: string;
          role: string; branchId: number; country?: "AR" | "ES" | null;
          /** Fase 171 (ISO-02). Default 1 = El Templo: los call sites previos no cambian. */
          tenantId?: number },
): Promise<number> {
  // …
  .values(tenantValues({ tenantId: data.tenantId ?? 1 }, { email, passwordHash, … }))
```

**Ojo con `createTestMember`:** hoy delega en `registerUser` → `POST /api/auth/register`, y
**esa ruta no conoce el tenant** (cero ocurrencias de `tenant` en `src/modules/auth/routes.ts`
[VERIFIED: grep]). Opciones para el planner:

| Opción | Cómo | Tradeoff |
|--------|------|----------|
| **A (recomendada)** | `tenantId ?? 1` → si es 1, camino actual por API (cero cambio); si no, INSERT directo con `tenantValues` + `getAuthToken` | Preserva byte a byte el comportamiento de los 215 archivos existentes. El socio del tenant 2 no tiene los efectos colaterales de `register` (referral code, etc.), que D-06 no pide |
| B | Siempre por API + `UPDATE users SET tenant_id` después | Más corto, pero deja las filas colaterales que `register` crea (`referrals`, `member_profiles`) en el tenant 1 → fixture incoherente, y es justo lo que las fases 172-175 van a auditar |
| C | Esperar a que `auth` sea tenant-aware | **No**: eso es ADO-06, fase 175. La 171 la desbloquea, no al revés |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enumerar las rutas | Parser del árbol de `printRoutes()` | Hook `onRoute` con el seam de `buildApp` | printRoutes fusiona `:id` con `:sessionId` en un nodo `:id\|:sessionId` — el manifiesto tendría 10+ claves que no existen [VERIFIED: volcado comparado] |
| Enumerar las rutas | Regex sobre `src/**/routes.ts` | Idem | Los prefijos se componen en `app.ts` y hay anidamiento (`/api/x/nested/deep`); un grep no compone prefijos |
| Limpiar el gimnasio 2 | Ampliar `TABLES_TO_CLEAN` con `branches` | `limpiarRastro()` local en `afterAll` (precedente 169-06) | Meter `branches` en la limpieza global borra las sedes semilla de `test/setup.ts` y rompe los 165 archivos que dependen de `branchId: 1` |
| Sembrar el tenant 2 | Llamar a las rutas admin con un token del tenant 2 | INSERT directo con `tenantValues` | Las rutas de escritura **no son tenant-aware hasta las fases 172-175**: escribirían en el tenant 1 y el fixture mentiría |
| Validar la forma del manifiesto | Confiar en TypeScript | Aserciones de runtime en el test | **`tsconfig.json` tiene `include: ["src/**/*"]`**, así que `tsc --noEmit` de CI **no typechequea `test/`**, y vitest transpila con esbuild (borra tipos, no los chequea). Un error de tipo en el manifiesto no lo atrapa nadie [VERIFIED: `tsconfig.json`, `ci.yml:52`] |
| Filtrar HEAD | `.filter(r => r.method !== "HEAD")` a secas | Guard "todo HEAD tiene un GET hermano" + filtrado | Un HEAD declarado a mano en el futuro quedaría fuera del backstop en silencio |

**Key insight:** las tres piezas caras de esta fase (enumerar rutas, componer prefijos,
limpiar entre tests) ya tienen dueño en el repo o en Fastify. Lo único genuinamente nuevo
es **la decisión por ruta**, que es el trabajo humano que el goal pide y que no se
automatiza sin vaciar el criterio 2.

---

## Inventario real de rutas (verificado, no estimado)

Volcado ejecutando `buildApp()` contra `eltemplo_test_1` con un hook `onRoute`.
[VERIFIED: ejecución en `/home/franco/projects/et-170-sentinel/el-templo-api`, 2026-07-29]

| Métrica | Valor |
|---------|-------|
| Eventos `onRoute` totales (method expandido) | **569** |
| De ellos, `HEAD` (auto-generados) | **199** |
| **Entradas del manifiesto (todo menos HEAD)** | **370** |
| Claves duplicadas | **0** |
| Grupos de prefijo | 57 |

Por método (sin HEAD): `GET` 192 · `POST` 124 · `PATCH` 21 · `PUT` 19 · `DELETE` 13 · `OPTIONS` 1.

Los 10 grupos más grandes: `/api/admin/finance` 36 · `/api/admin/subscriptions` 26 ·
`/api/admin/sessions` 24 · `/api/admin/members` 23 · `/api/admin/scheduling` 23 ·
`/api/admin/analytics` 22 · `/api/admin/exercises` 16 · `/api/blog` 16 ·
`/api/admin/reports` 16 · `/api/admin/programs` 10.

**Outliers de forma de URL que el manifiesto tiene que contemplar:**

- `OPTIONS *` — `@fastify/cors` v11 registra **siempre** `fastify.options('*', …)`;
  `hideOptionsRoute` solo la oculta del schema de swagger, no evita el registro.
  [VERIFIED: `node_modules/@fastify/cors/index.js:48,70,79`]
- `/health` — sin prefijo `/api`.
- `/spom/week|lookup|exercises|tables` (5 rutas) — el `spomPlugin` registra **fuera de
  `/api`**. Es el único módulo con esa forma.
- `GET /api/admin/analytics` (y 6 más) vienen de un handler declarado en `"/"` dentro de
  un plugin con prefijo: `routePath` es `""` y la url NO lleva barra final.

### Sizing de las listas del checkpoint D-03 — ⚠️ desvío vs. el CONTEXT

Aplicando el mapeo carpeta→módulo del doc 04 §2.1 (ya validado con Nacho el 2026-07-02):

| Categoría candidata | Rutas | Estimación del CONTEXT |
|---|---:|---|
| `tenant-scoped` (sin revisión, D-03) | **218** | "la masa" ✓ |
| **`templo-module`** | **141** | **"~30-50"** ✗ |
| ├─ `templo-training` | 102 | |
| ├─ `templo-marketing` | 35 | |
| ├─ `templo-onboarding` | 3 | |
| └─ `templo-gamification` | 1 | |
| `global` (candidatas firmes) | **11** | "~10-20" ✓ |

**Consecuencia para el plan:** el checkpoint D-03 no puede presentar 141 líneas sueltas.
Recomendación: presentarlo como **4 grupos de módulo × prefijos con conteo** (p. ej.
"`templo-training` ← `/spom/*` 5, `/api/sessions/*` 5, `/api/admin/sessions/*` 24, …")
más la sección aparte de dudosas de D-04, que sí van una por una. Así Franco revisa ~20
líneas de fronteras de módulo en vez de 141 rutas, sin perder la decisión consciente: el
mapeo carpeta→módulo ya está validado y lo que se confirma es que estos prefijos caen ahí.

### Candidatas `global` firmes (con motivo propuesto para D-02)

| Ruta | Motivo propuesto |
|------|------------------|
| `GET /health` | Liveness probe; no toca ninguna tabla |
| `OPTIONS *` | Preflight CORS de `@fastify/cors`; no ejecuta lógica de negocio |
| `POST /api/auth/login` | Resuelve identidad ANTES de conocer el gimnasio; el tenant sale de la fila encontrada |
| `POST /api/auth/refresh` | Ídem, sobre el refresh token |
| `POST /api/auth/logout` | Invalida el token del portador; no lee datos del gimnasio |
| `POST /api/webhooks/wellhub` | Entrada pública sin sesión; el tenant se DERIVA server-side (`gym.id` → `branches.wellhub_gym_id`, CON-04 cerrado en 169-05) |
| `POST /api/tv/pair/start` | Pre-claim: la fila nace antes de saber de quién es el televisor (mina M7, exención ya anotada en `TvPairingService.start()`) |
| `GET /api/tv/pair/status` | Ídem, polling del código pre-claim |

### Dudosas → sección aparte del checkpoint (D-04)

| Ruta(s) | Recomendación | Por qué es dudosa |
|---|---|---|
| `POST /api/app/labs-inquiry`, `GET /api/app/admin/labs-inquiries`, `PATCH …/:id/status` (3) | **`global`** | **Conflicto real de docs**: el doc 04 §2.1 mete `app-landing` en `templo-marketing`, pero la decisión Q2 del doc 06 §8 dice que `labs_inquiries` es **GLOBAL (plataforma)**: son los leads del propio SaaS. Recomiendo seguir Q2 y partir el prefijo |
| `POST /api/app/waitlist`, `GET /api/app/admin/waitlist` (2) | `templo-module` (templo-marketing) | `app_waitlist` sí es gym-owned |
| `/api/franchise/*` (5) | `templo-module` (templo-marketing) | Doc 04 lo dice, pero franquiciar "El Templo" es la marca, no el gimnasio; roza plataforma |
| `/api/blog/*` (16), `/api/academy/*` (2), `/api/gladius/*` (7) | `templo-module` (templo-marketing) | Rutas públicas de eltemplo.org, pero las 3 tablas son gym-owned |
| `GET /api/campaigns/track/open`, `…/click`, `GET /api/campaigns/unsubscribe` (3) | **`tenant-scoped`** (resuelto por token), NO `global` | La decisión Q5 del doc 06 §8 hizo la supresión de unsubscribes **POR TENANT** (`uq (tenant_id, email)`). Marcarlas `global` contradiría esa decisión |
| `POST /api/auth/register` | `tenant-scoped` | Público, pero crea una fila gym-owned; hoy cae en el DEFAULT 1 porque `auth` no es tenant-aware hasta la fase 175 |
| `GET /api/auth/me`, `PATCH /api/auth/me/change-password`, `DELETE /api/auth/me/delete-account` (3) | `tenant-scoped` | Self-scoped por token, pero cuelgan del prefijo `/api/auth` que tiene rutas `global` |
| `GET /api/tv/me`, `GET /api/tv/state`, `POST /api/tv/client-log` (3) | `tenant-scoped` | Post-claim: el televisor no tiene JWT ni scope, pero el tenant sale de la fila ya reclamada |
| `/api/check-ins*`, `/api/admin/check-ins*` (3) | `templo-module` (templo-training) | Doc 04 lista `check-ins` como Templo; el nombre se confunde con el check-in de asistencia, que es CORE |
| `/api/members/me/current-program` (2) | `templo-module` (templo-training) | Vive bajo `/api/members/me`, que en el resto es core |
| `/api/admin/ratings`, `/api/members/ratings` (6) | `tenant-scoped` (core) | `coach_ratings` es core, pero "rating de clase" suena a feature Templo |

**Dato relevante para la clasificación:** **no hay ninguna ruta de AURA registrada** en el
app. AURA es un service interno (consumido por subscriptions, streaks, onboarding,
programs). `templo-gamification` aporta una sola ruta: `POST /api/bar-challenge/result`.
[VERIFIED: grep sobre el volcado]

---

## Runtime State Inventory

Esta fase es de código y tests, no un rename — pero **sí deja estado vivo en las bases de
test**, que es donde muerde.

| Categoría | Encontrado | Acción requerida |
|-----------|-----------|------------------|
| Stored data | Bases por worker `eltemplo_test_1..N` (existe `eltemplo_test_1` en la máquina local). Una corrida abortada deja filas del gimnasio 2 en `tenants` + `branches` | `limpiarRastro()` **incondicional en `beforeAll` Y en `afterAll`** (precedente 169-06 / 169-01) |
| Live service config | Ninguna. La fase no toca n8n, Datadog, Tailscale ni Cloudflare | — |
| OS-registered state | Ninguna | — |
| Secrets/env vars | Ninguna variable nueva. El volcado one-shot necesita `JWT_SECRET` y credenciales de DB, que ya están en `.env.development` | — |
| Build artifacts | Ninguno. `test/` no entra a `tsc` (`include: ["src/**/*"]`), así que no hay `dist/` que actualizar | — |
| Migraciones | **Cero esperadas.** Si alguna apareciera, reservar desde **0197** (0196 es la última, fase 168) | — |

---

## Common Pitfalls

### Pitfall 1: colgar el hook en `createTestApp()` y ver 0 rutas
**Qué sale mal:** el test pasa en verde con el manifiesto vacío, o falla con "faltan 370".
**Por qué:** `buildApp()` hace `await app.register(...)` × 35; el `await` **ejecuta el
plugin en el acto**, así que para cuando `createTestApp` recibe la instancia ya están las
370 registradas. [VERIFIED: probe — `immediately after register() (no await): []` →
`after await: ["GET /lazy","HEAD /lazy"]`]
**Cómo evitarlo:** seam dentro de `buildApp` (Pattern 1).
**Señal temprana:** el array de recolectadas tiene 0 o solo lo declarado después del hook.

### Pitfall 2: `buildApp()` **necesita MySQL vivo** — el test del manifiesto NO puede ser unitario puro
**Qué sale mal:** se ubica el test en `test/unit/` esperando ahorrar los ~100 s, y explota
con `Access denied` / `Failed query: select name, description from formats`.
**Por qué:** `src/modules/sessions/routes.ts:376` hace un `SELECT` sobre `formats`
**durante el registro del plugin**, no en el handler. [VERIFIED: stack trace reproducido]
**Cómo evitarlo:** ubicarlo en `test/tenancy/` como integración, y usar `createTestApp()`.
**Costo real: cero extra** — `vitest.config.ts` declara `test/setup.ts` como `setupFiles`
para TODOS los archivos (incluidos los de `test/unit/`), así que el provisioning de ~96 s
se paga igual (hallazgo 169-07). No hay nada que optimizar ubicándolo en otro lado.

### Pitfall 3: contar `HEAD` como rutas y terminar con 569 entradas
**Qué sale mal:** el manifiesto duplica cada GET y encima suma 7 entradas fantasma con
barra final que no corresponden a ningún handler.
**Por qué:** `exposeHeadRoutes: true` (default v5) + `prefixTrailingSlash: 'both'` para
handlers declarados en `"/"`.
**Cómo evitarlo:** guard "todo HEAD tiene GET hermano" + comparar solo el resto (Pattern 2).
**Señal temprana:** aparecen claves terminadas en `/` que ningún archivo de rutas declara.

### Pitfall 4: `expect` que no nombra la ruta
**Qué sale mal:** CI rojo con `expected [ '…' ] to equal []` y nadie sabe qué hacer.
**Por qué:** el criterio 2 exige **que el mensaje nombre la ruta faltante**.
**Cómo evitarlo:** copiar literal el estilo de `test/db/tenant-tables.test.ts`: el segundo
argumento del `expect` lista los incumplidores por nombre Y dice qué hacer (agregar la
línea al manifiesto en la categoría que corresponda; y que **agrandar la categoría `global`
no es una salida válida sin motivo escrito**).

### Pitfall 5: confiar en TypeScript para validar el manifiesto
**Qué sale mal:** una entrada `global` sin `motivo`, o una categoría mal escrita, pasa
silenciosa a master.
**Por qué:** `tsconfig.json` → `include: ["src/**/*"]`; CI corre `tsc --noEmit` que **no
mira `test/`**, y vitest usa esbuild (type-erasure sin chequeo). Tampoco hay `eslint.config`
en `el-templo-api` [VERIFIED: `ls`]. `test/` es tierra sin tipos verificados.
**Cómo evitarlo:** aserciones de runtime (`sinMotivo`, `sinModulo`, categoría ∈ las 3).

### Pitfall 6: usar `routeOptions.onRequest` para adivinar si una ruta es pública
**Qué sale mal:** el clasificador marca 314 de 370 rutas como "sin auth".
**Por qué:** la mayoría de los módulos ponen un `fastify.addHook("onRequest", …)` a nivel
de plugin, que **no aparece** en `routeOptions.onRequest` de las rutas hijas.
[VERIFIED: volcado — 314 rutas con `onRequest=0`, incluidas todas las de
`/api/admin/finance`]
**Cómo evitarlo:** clasificar por prefijo + lectura del código, no por metadata del hook.

### Pitfall 7: `cleanAllTestData` borra el gimnasio 2 a mitad de camino
**Qué sale mal:** `seedSecondTenant()` en `beforeAll` y `cleanAllTestData` en `beforeEach`
→ los usuarios y el plan del gimnasio 2 desaparecen antes del primer `it`.
**Por qué:** `cleanAllTestData` hace `DELETE FROM users WHERE NOT (email <=> 'admin@test.com')`
y vacía ~90 tablas, **sin ningún filtro de tenant**. 162 archivos lo llaman en `beforeEach`.
[VERIFIED: `test/helpers.ts:244-267` + grep]
**Cómo evitarlo:** el archivo que hace opt-in llama `seedSecondTenant()` **después** de
`cleanAllTestData` (mismo `beforeEach`), o directamente no usa `cleanAllTestData`. El
helper tiene que ser idempotente y barato.

### Pitfall 8: la sede del gimnasio 2 se filtra al archivo siguiente
**Qué sale mal:** un archivo posterior del mismo worker ve una sede extra.
**Por qué:** con `poolOptions.forks.isolate: false` el proceso se reusa y la base es la
misma; y **15 tablas gym-owned no están en `TABLES_TO_CLEAN`**: `audit_log`, `aura_config`,
**`branches`**, `cash_registers`, `class_coach_assignments`, `coach_ratings`,
`cost_centers`, `day_modes`, `debt_management`, `exercise_adjustments`,
`exercise_dimension_proposals`, `exercise_milestone_proposals`, `exercise_progressions`,
`plan_programs`, `spom_config`. [VERIFIED: cruce programático `GYM_OWNED_TABLES` vs.
`TABLES_TO_CLEAN`]
**Cómo evitarlo:** `limpiarSegundoGimnasio()` en `afterAll`, borrando **sedes → users →
tenant** en ese orden (`fk_branches_tenant` impide borrar la fila de `tenants` mientras una
sede la referencie — es la trampa exacta que documentó el 169-06).
**Buena noticia para el criterio 4:** se buscaron aserciones de conteo exacto sobre sedes y
**no hay ninguna**; `test/branch-access.test.ts` usa `toContain` / `not.toContain`.
[VERIFIED: grep] El riesgo real es bajo, pero el `afterAll` no es opcional.

### Pitfall 9: `aura_config.source_type` es unique GLOBAL
**Qué sale mal:** si el espejo del gimnasio 2 siembra `aura_config`, choca con el del 1.
**Cómo evitarlo:** D-06 no pide `aura_config` — **no sembrarla**. Si un plan la agrega,
usar un `source_type` distinto (precedente 169-01).

### Pitfall 10: elegir un id de tenant ya usado
**Qué sale mal:** dos archivos del mismo worker se pisan (`isolate: false`) y el rojo es
intermitente.
**Ids TOMADOS:** `90168` (con-01), `90169` (tenant-helpers), `90269` (con-04), `90369`
(con-03), `90469` (webhook wellhub), `90569` (tv-pairing). [VERIFIED: grep sobre `test/`]
**Cómo evitarlo:** el fixture del tenant 2 usa un id nuevo (p. ej. **`90671`**) y lo
declara en una constante exportada. Si algún test de la 171 necesita un tercer gimnasio,
que tome otro id propio.

### Pitfall 11: creer que el sentinel de la 170 va a molestar
**Qué NO pasa:** `TENANT_STRICT_MODULES` está **vacío** hoy, así que el sentinel no hace
throw sobre ninguna tabla. [VERIFIED: `src/db/tenant-tables.ts:510`] Los INSERT/DELETE
crudos del fixture no lo despiertan. **Pero cambia en la fase 172**: cuando `finance` entre
a strict, un `DELETE FROM branches` sin `tenant_id` del `limpiarRastro` podría tirar. Vale
la pena que los DELETE del fixture ya lleven `WHERE tenant_id = …` desde ahora.

---

## Code Examples

### Volcado one-shot del inventario (D-16: se usa una vez y NO se commitea)

Este script produce las 370 claves **sin tocar `src/app.ts`** — sirve para generar el
baseline antes de que exista el seam. Parchea el módulo `fastify` en la cache de require
para colgar el hook antes del primer `register`.

```ts
/* scratchpad/dump-onroute.ts — NO COMMITEAR (precedente D-16 de la fase 170) */
const path = require("path");
const API = "<ruta-al-worktree>/el-templo-api";
const fastifyId = require.resolve("fastify", { paths: [API] });
const realFactory = require(fastifyId).default ?? require(fastifyId);
const collected: Array<{ m: string; url: string }> = [];
function patched(...args: unknown[]) {
  const app = (realFactory as (...a: unknown[]) => any)(...args);
  app.addHook("onRoute", (r: any) => {
    for (const m of Array.isArray(r.method) ? r.method : [r.method])
      collected.push({ m, url: r.url });
  });
  return app;
}
Object.assign(patched, realFactory);
(patched as any).default = patched;
require.cache[fastifyId]!.exports = patched;

(async () => {
  const { buildApp } = require(path.join(API, "src/app.ts"));
  const app = await buildApp();
  await app.ready();
  console.log(collected.filter((r) => r.m !== "HEAD")
    .map((r) => `${r.m} ${r.url}`).sort().join("\n"));
  await app.close();
})();
```

Se corre así (necesita MySQL con una base migrada — `buildApp` consulta `formats`):

```bash
cd el-templo-api
set -a && . ./.env.development && set +a
NODE_PATH="$PWD/node_modules" NODE_ENV=test DB_NAME=eltemplo_test_1 JWT_SECRET=dummy \
  ./node_modules/.bin/tsx /ruta/scratchpad/dump-onroute.ts > /ruta/scratchpad/rutas.txt
```

Salida verificada: **370 líneas, 0 duplicados**.

### Forma del manifiesto (D-01 + D-02 + D-07)

```ts
export const TENANT_MANIFEST: Record<string, EntradaManifiesto> = {
  // ── plataforma ────────────────────────────────────────────────────────────
  "GET /health": { categoria: "global", motivo: "liveness probe; no toca ninguna tabla" },
  "OPTIONS *":   { categoria: "global", motivo: "preflight CORS de @fastify/cors; sin logica de negocio" },

  // ── auth ──────────────────────────────────────────────────────────────────
  "POST /api/auth/login":  { categoria: "global", motivo: "resuelve identidad ANTES de conocer el gimnasio" },
  "POST /api/auth/refresh":{ categoria: "global", motivo: "idem, sobre el refresh token" },
  "POST /api/auth/register": { categoria: "tenant-scoped" },
  "GET /api/auth/me":        { categoria: "tenant-scoped" },

  // ── finance (core) ────────────────────────────────────────────────────────
  "GET /api/admin/finance/transactions": { categoria: "tenant-scoped" },
  // … 36 en total

  // ── templo-training ───────────────────────────────────────────────────────
  "GET /spom/week": { categoria: "templo-module", modulo: "templo-training" },
  // … 102 en total
};
```

### Precedente literal del mensaje accionable (copiar el tono)

```ts
// test/db/tenant-tables.test.ts:63-72 — el modelo a seguir
expect(
  unclassified,
  `Tablas del schema Drizzle SIN clasificar en src/db/tenant-tables.ts: ` +
    `${unclassified.join(", ")}. Toda tabla nueva tiene que entrar en ` +
    `GYM_OWNED_TABLES (lleva tenant_id) o en TENANT_EXEMPT_TABLES (con el ` +
    `motivo escrito). No hay tercera opción — el aislamiento multi-tenant ` +
    `de las fases 168/169/170 se construye sobre esta lista.`,
).toEqual([]);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `exposeHeadRoutes` opcional/off | **`true` por default** | Fastify v4 → v5 | 199 eventos `HEAD` extra que hay que descartar con guard [CITED: fastify.dev/docs/latest/Reference/Server/] |
| `fastify.routes` (decorador de `@fastify/routes`) | No hay API de enumeración; `onRoute` es el único camino | v5 | Confirmado: `fastify/lib/symbols.js` en 5.7.4 no expone el router [VERIFIED: probe] |
| `hideOptionsRoute` evitaba registrar `OPTIONS *` | En `@fastify/cors` v11 **siempre** registra; el flag solo oculta del schema | v11 | `OPTIONS *` entra al manifiesto sí o sí [VERIFIED: código del plugin] |

**Deprecado / desactualizado en el CONTEXT:**
- "~300 entradas" → son **370**.
- "`templo-module` (~30-50)" → son **~141**.
- "los ~140 archivos existentes" → hay **232 archivos `.test.ts`**, **215** usan
  `createTestApp` y **165** usan `cleanAllTestData`. [VERIFIED: grep]

---

## Project Constraints (from CLAUDE.md)

| Directiva | Cómo aplica a esta fase |
|---|---|
| **Nunca `console.log`** — API usa el logger de Fastify | El fixture y el test no deben loguear a consola; si hace falta trazar, `app.log` |
| **Sin `any`** | El comparador y el manifiesto son código nuevo: `unknown` + narrowing. ⚠️ Nadie lo verifica automáticamente en `test/` (Pitfall 5) — es disciplina, no gate |
| **Rutas nuevas del API requieren tests de integración en `test/`** | Esta fase no agrega rutas de producción; la ruta sonda del criterio 2 se borra sin commitear |
| **Cambios de schema por Drizzle + `pnpm db:generate`; nunca `drizzle-kit migrate`** | No aplica: **cero migraciones**. Si apareciera una, reservar desde **0197** |
| **Nueva env var → actualizar `.env.example`** | No aplica |
| **Pre-commit: Husky + lint-staged (Prettier `--write` sobre `**/*.{ts,vue,js,json,md}`)** | El manifiesto de 370 líneas será reformateado por Prettier. Si un PLAN.md lleva bloques literales, protegerlos (precedente: commit `3796b655` de la fase 170) |
| **Si lint-staged rompe el commit, arreglar y commitear de nuevo (no `--amend`)** | Aplica a los commits de la fase |
| **Facade pattern / composables con `cleanup()`** | No aplica (solo API + tests) |

**De la memoria del proyecto (gates personales de Franco):**
- **No correr la suite completa local** — corre en CI. Verificación local: correr solo los
  archivos nuevos y los directamente afectados.
- **Nunca `git add -A` / `git add .`** — stagear por ruta.
- **Nunca instalar ni actualizar dependencias sin preguntar.**
- **Staging-first estricto**; preguntar antes de pushear.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Las 3 rutas de `labs-inquiries` van a `global` y no a `templo-marketing` | Dudosas D-04 | Contradicción entre doc 04 §2.1 y doc 06 §8 Q2. **Es exactamente lo que D-04 manda al checkpoint** — no decidir sin Franco |
| A2 | `/api/campaigns/track/*` y `/unsubscribe` son `tenant-scoped` y no `global` | Dudosas D-04 | Si van a `global`, la decisión Q5 (unsubscribes por tenant) queda sin backstop en la fase 175 |
| A3 | El espejo mínimo de D-06 no necesita `aura_config` ni `cash_registers` | Pattern 4 | Si una batería de la 172 (finance) necesita cobrar en el gimnasio 2, hay que sumar `ensureEfectivoCaja` — cambio menor, aditivo |
| A4 | `90671` está libre como id del gimnasio 2 | Pitfall 10 | Verificado contra los 6 ids en uso hoy; un archivo nuevo de otra fase podría tomarlo antes. El ejecutor debe re-grepear al escribirlo |
| A5 | El checkpoint agrupado por módulo satisface "decisión consciente" de D-01/D-03 | Sizing | Si Franco quiere las 141 una por una, el checkpoint se alarga (no rompe nada, cuesta tiempo) |
| A6 | Ningún test existente rompe por la sede extra del gimnasio 2 | Pitfall 8 | Se verificó que no hay aserciones de conteo exacto sobre `branches`; podría haber una indirecta (p. ej. un export de Excel que cuente filas). Lo cierra el criterio 4 corriendo la suite en CI |

---

## Open Questions

1. **¿`buildApp(opts.onRoute)` o `buildApp(opts.plugins)`?**
   - Qué sabemos: las dos funcionan; el doc 03 dice "plugin test-only"; el callback tiene
     menos superficie y `buildApp` tiene solo 2 call sites.
   - Qué falta: preferencia de estilo. Es discreción del planner (el CONTEXT la deja
     abierta en "estructura interna" / "dónde vive el test").
   - Recomendación: `onRoute?: (r: RouteOptions) => void`, con docblock que explique por
     qué NO puede vivir en `createTestApp()` (para que nadie lo "limpie" después).

2. **¿El manifiesto guarda también `templo-module` → nombre de módulo?**
   - Qué sabemos: D-07 pide etiquetar ya; el doc 04 §3 pide que **toda ruta `templo-module`
     tenga `requireModule`**, y el test de la 176 lo va a verificar contra ESTE manifiesto.
   - Recomendación: **sí**, campo `modulo` obligatorio para esa categoría. Cuesta cero
     ahora y le ahorra a la 176 volver a clasificar 141 rutas.

3. **¿El test del manifiesto corre en un archivo propio o junto a los fixtures?**
   - Recomendación: archivo propio (`test/tenancy/iso-01-manifiesto.test.ts`). Los tests
     de fixtures necesitan sembrar el gimnasio 2; el del manifiesto no toca datos y no
     debería heredar ese setup.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | todo | ✓ | v22.22.0 | — |
| MySQL server (local) | `buildApp()` en el volcado y en el test | ✓ | conectado con las credenciales de `.env.development`; existe `eltemplo_test_1` | — |
| `node_modules` de `el-templo-api` en el worktree | volcado + typecheck | ✓ | presente en `et-170-sentinel/el-templo-api/node_modules` — **no hizo falta symlink ni `pnpm install`** | — |
| `tsx` | correr el volcado | ✓ | 4.21.0 (`./node_modules/.bin/tsx`) | — |
| `ctx7` (Context7 CLI) | docs de librerías | ✗ | — | Se usó WebFetch contra fastify.dev + verificación empírica (mejor evidencia que la doc) |
| `slopcheck` | auditoría de paquetes | n/a | — | No aplica: cero deps nuevas |

**Sin bloqueantes.**

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 4.0.18 |
| Config file | `el-templo-api/vitest.config.ts` |
| Quick run command | `cd el-templo-api && pnpm test -- test/tenancy/iso-01-manifiesto.test.ts` |
| Full suite command | `cd el-templo-api && pnpm test` (**en CI**, no local — ver memoria del proyecto) |
| CI | job `api-test` de `.github/workflows/ci.yml:83-133`, `pnpm test` contra MySQL 8.0 service container. **No hace falta step nuevo** |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| ISO-01 | El manifiesto cubre el 100% de las rutas observadas | integration | `pnpm test -- test/tenancy/iso-01-manifiesto.test.ts` | ❌ Wave 0 |
| ISO-01 | Ruta observada sin entrada → rojo que la nombra (fixture sintético) | unit (función pura) | idem | ❌ Wave 0 |
| ISO-01 | Entrada del manifiesto sin ruta → rojo que la nombra | unit | idem | ❌ Wave 0 |
| ISO-01 | Entrada `global` sin motivo → rojo (D-02, runtime) | unit | idem | ❌ Wave 0 |
| ISO-01 | Entrada `templo-module` sin módulo → rojo (D-07) | unit | idem | ❌ Wave 0 |
| ISO-01 | Todo `HEAD` observado tiene GET hermano | integration | idem | ❌ Wave 0 |
| ISO-01 | Sonda en vivo: ruta boba en `app.ts` → rojo → borrar sin commitear | manual (una vez) | precedente `__gate-probe.ts` del 169-04 | n/a |
| ISO-02 | `seedSecondTenant` crea 1 sede + 1 admin + 1 coach + 2 socios + 1 plan + 1 schedule, **todos con `tenant_id` = id del gimnasio 2** (`SELECT tenant_id` sobre la fila real) | integration | `pnpm test -- test/tenancy/iso-02-fixtures.test.ts` | ❌ Wave 0 |
| ISO-02 | `createStaffUser`/`createTestMember` sin `tenantId` siguen escribiendo en el tenant 1 (retrocompat) | integration | idem | ❌ Wave 0 |
| ISO-02 | `limpiarSegundoGimnasio` deja 0 filas del gimnasio 2 (tenants, branches, users) | integration | idem | ❌ Wave 0 |
| ISO-02 (crit. 4) | La suite completa sigue verde | full suite | CI | ✅ existe |

### Sampling Rate

- **Por task commit:** el archivo de test tocado (`pnpm test -- <archivo>`) — cada archivo
  MySQL-backed cuesta ~100 s de reloj, la mayor parte del provisioning del worker.
- **Por wave merge:** los 2 archivos nuevos de la fase.
- **Phase gate:** suite completa verde **en CI** antes de `/gsd:verify-work` (no local).

### Wave 0 Gaps

- [ ] `test/tenant-manifest.ts` — manifiesto (370 entradas) + `compararManifiesto` (ISO-01)
- [ ] `test/fixtures/second-tenant.ts` — `seedSecondTenant` + `limpiarSegundoGimnasio` (ISO-02)
- [ ] `test/tenancy/iso-01-manifiesto.test.ts` — gate fail-closed bidireccional (ISO-01)
- [ ] `test/tenancy/iso-02-fixtures.test.ts` — verificación del espejo (ISO-02)
- [ ] Framework install: **ninguno**, Vitest ya está.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | La fase no toca el flujo de auth (se lee, no se modifica) |
| V3 Session Management | no | — |
| **V4 Access Control** | **sí** | Es literalmente el objetivo: el manifiesto es el backstop de autorización horizontal (IDOR entre tenants). El control es el gate fail-closed, no una librería |
| V5 Input Validation | no | Sin rutas nuevas ni schemas nuevos |
| V6 Cryptography | no | `argon2` ya en uso para el hash de los fixtures; no se toca |
| V7 Error Handling / Logging | parcial | El mensaje del rojo no debe filtrar datos; nombra rutas y categorías, nada más |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Ruta nueva sin filtro de tenant → lectura horizontal entre gimnasios | Information Disclosure | **Este manifiesto** (ISO-01) + batería ISO-03 (fase 172+) |
| Clasificar de más como `global` para "que pase el test" | Elevation of Privilege | D-02: motivo escrito obligatorio + checkpoint humano D-03. El mensaje de rojo debe decir explícitamente que **agrandar `global` no es una salida válida** (precedente literal del lint 170 sobre la allowlist) |
| Fixture del tenant 2 que en realidad escribe en el tenant 1 | — (falso verde) | `tenantValues` en todo INSERT + aserción por `SELECT tenant_id` sobre la fila real, nunca por la respuesta HTTP (T-168-15, precedentes 169-05/169-06/169-08) |
| Test que borra datos del tenant 1 al limpiar el 2 | Denial of Service (de la suite) | `limpiarRastro` filtrado por el id del gimnasio 2, nunca `DELETE` sin `WHERE` |

---

## Sources

### Primary (HIGH confidence) — verificación empírica en el worktree

- Volcado `onRoute` sobre `buildApp()` real → 569 eventos / 370 rutas / 0 duplicados.
- Probes aislados de Fastify 5.7.4: encapsulación de `onRoute`, `method` como array,
  HEAD automático, fantasma de `prefixTrailingSlash`, `FST_ERR_INSTANCE_ALREADY_LISTENING`,
  ausencia de `kRouter`.
- `el-templo-api/src/app.ts`, `src/plugins/database.ts`, `src/modules/sessions/routes.ts:367-386`,
  `src/modules/auth/routes.ts:55-90,412`, `src/modules/shared/tenant.ts`,
  `src/modules/shared/country-scope.ts`, `src/db/schema/tenant-column.ts`,
  `src/db/schema/tenants.ts`, `src/db/tenant-tables.ts:510-536`,
  `src/db/sentinel/install.ts:296-302`, `src/db/scripts/lint-tenant.ts:41-42`.
- `test/helpers.ts`, `test/setup.ts`, `vitest.config.ts`, `tsconfig.json`,
  `test/db/tenant-tables.test.ts`, `test/tenancy/tenant-helpers.test.ts`,
  `test/tenancy/con-06-lint.test.ts`, `test/branch-access.test.ts:383-470`.
- `.github/workflows/ci.yml` (jobs `api-check` y `api-test`).
- `node_modules/@fastify/cors/index.js:48,70,79`.
- Cruce programático `GYM_OWNED_TABLES` × `TABLES_TO_CLEAN` → las 15 tablas no limpiadas.

### Primary (HIGH) — diseño cerrado del milestone

- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §"Capa 5" (líneas 95-106).
- `.docs/saas-multitenancy/04-mecanismo-modulos.md` §2.1 (mapeo carpeta→módulo) y §3
  (regla "toda ruta `templo-module` DEBE tener `requireModule`").
- `.docs/saas-multitenancy/06-estrategia-migracion.md` §7 (T4) y §8 (Q2, Q4, Q5).
- `.planning/REQUIREMENTS.md` (ISO-01, ISO-02), `.planning/ROADMAP.md:4640-4655`,
  `.planning/STATE.md` (resúmenes 169-01 a 169-08).

### Secondary (MEDIUM confidence)

- fastify.dev — Reference/Hooks (`onRoute`) y Reference/Server (`exposeHeadRoutes`,
  `printRoutes`). La doc es escueta sobre encapsulación y HEAD; ambas se resolvieron
  ejecutando, no leyendo.

### Tertiary (LOW confidence)

- Ninguna afirmación de este documento descansa solo en memoria de entrenamiento.

---

## Metadata

**Confidence breakdown:**
- Inventario de rutas: **HIGH** — volcado ejecutado, cruzado contra un segundo método
  (printRoutes) y las discrepancias explicadas una por una.
- Mecánica de `onRoute` / Fastify 5: **HIGH** — cuatro probes independientes.
- Trampas de los fixtures: **HIGH** — leídas en el código y cruzadas con los SUMMARY de la
  fase 169 que ya las sufrieron.
- Clasificación candidata por categoría: **MEDIUM** — el mapeo carpeta→módulo viene de un
  doc validado, pero las 12 zonas grises son decisión humana por diseño (D-04).
- Sizing del checkpoint (141 templo-module): **HIGH** para el conteo, **MEDIUM** para la
  forma de presentarlo.

**Research date:** 2026-07-29
**Valid until:** ~2026-08-28 (30 días). Se invalida antes si se agregan o quitan rutas del
API: el conteo de 370 es un snapshot de `feat/170-sentinel-lint`.
