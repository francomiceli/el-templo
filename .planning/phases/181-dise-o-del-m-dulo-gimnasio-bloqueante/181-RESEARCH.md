# Phase 181: Diseño del módulo Gimnasio (bloqueante) — Research

**Researched:** 2026-08-27
**Domain:** Diseño de datos y arquitectura multi-tenant sobre un monorepo Fastify + Drizzle/MySQL + Quasar ya endurecido por el milestone v6.0
**Confidence:** HIGH para todo lo que es inventario del repo (verificado leyendo el código); MEDIUM-HIGH para las recomendaciones de diseño (fundadas en el código + docs oficiales citadas); las asunciones están listadas en el Assumptions Log.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Definición 1 / Prior A3 — modelo de datos**

- **D-01:** A3 queda **CERRADA como decisión**: Calistenia y Gimnasio NO comparten modelo de datos. El doc escribe el fundamento (sesión generada por algoritmo vs plantilla→registro de series; el caso peso-corporal-con-lastre como fichas independientes sin puente de datos) — **sin matriz comparativa unificar-vs-separar**. El researcher no debe gastar esfuerzo evaluando la alternativa unificada.
- **D-02:** **El caso híbrido (un tenant con módulo Templo Y módulo Gimnasio prendidos) NO existe ni existirá** — palabras del usuario. Exclusión mutua como **invariante del diseño**, ni siquiera como pregunta abierta de v2. Respuesta a la pregunta de Nacho: un alumno siempre ve UN solo historial.

**Superficie member-facing (DIS-02)**

- **D-03 (corregida 2026-08-27):** Esquema de **dos superficies**: (a) STAFF de tenants (profes/admins) en `el-templo-admin`, que ya es multi-tenant desde v6.0, con las secciones del módulo Gimnasio gateadas por `module.gimnasio.enabled` (el staff de El Templo no las ve); (b) ALUMNOS en una **NUEVA app multi-tenant dentro del monorepo** — cuarta app junto a api/app/admin, mismo stack Quasar+Vue+**Capacitor**. La app nativa en tiendas es **destino confirmado** (ver D-11), no hipótesis: un solo código con destino dual (web por subdominio + build Capacitor). El timing de la primera publicación en tiendas lo especifica el doc de diseño. _(Reemplaza al "web app/PWA sin tiendas en v1" de la discusión original.)_
- **D-04:** `el-templo-app` NO se transforma (regla firme, se ratifica con constancia explícita en el doc).
- **D-05:** **El split de repos NO se adelanta.** El doc deja constancia de que el trigger sigue intacto; la nueva app nace en el monorepo (reusa CI, deploy, convenciones; mismo EC2, un vhost más).
- **D-06:** Acceso del alumno por **subdominio por gimnasio** (`gimnasioX.<plataforma>.com`): branding pre-login y URLs propias por tenant. Implicancias que el diseño debe especificar: resolución de tenant por hostname, y aprovisionamiento del subdominio en el wizard de la 182 (recomendado: wildcard cert + nginx catch-all para que el alta no toque DNS/certs a mano).
- **D-11 (agregada 2026-08-27):** **Modelo de publicación en tiendas: UNA sola app container multi-tenant (Opción A)**, publicada y mantenida desde la cuenta de la plataforma, con branding por tenant en **runtime** (logo, colores y nombre visibles DENTRO de la app). Fundamento: como proveedores de servicio a otros gimnasios, N apps clonadas desde nuestra cuenta viola App Store Guideline 4.3 (spam) — **prohibido**. El doc de la 181 especifica la arquitectura del runtime branding (detección de tenant por login/deep link/config) y verifica el texto vigente de 4.2.6/4.3 al formalizar. Límite de plataforma asumido: el ícono/nombre en la home y en la ficha de la tienda quedan genéricos de la plataforma (ícono cambiable en runtime solo desde un set pre-empaquetado; nombre imposible en iOS).
- **D-12 (agregada 2026-08-27):** **Marca propia por gimnasio — estrategia en dos niveles.** (a) **v1:** la PWA por subdominio (D-06) es la vía de ícono+nombre propios en el teléfono ("Agregar a inicio"), tenants ilimitados sin releases; (b) **futuro, fuera de v6.1:** "tu app con tu marca en la tienda" como **add-on premium vía modelo 4.2.6** — el gimnasio publica desde SU cuenta Apple/Google (paga sus fees), la plataforma automatiza la build (fastlane/CI). Patrón estándar de SaaS white-label (Mindbody, Glofox). **Requisito de diseño que esto impone a la 181:** todo el branding es **config por tenant, nunca código** (claves en `tenant_settings` + assets por tenant), de modo que una build white-label futura sea solo configuración + assets, sin fork.

**Formato y validación del documento**

- **D-07:** **Un solo documento** en `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`, siguiendo la serie 01-07 del diseño v6.0. Las 7 definiciones + DIS-02 como secciones, cada una trazada a sus REQ (criterio de éxito 4 de la fase).
- **D-08:** Nivel de detalle: **entidades, columnas clave, FKs e índices para las consultas críticas** (sobre todo "historial de este alumno en este ejercicio", definición 6). El schema Drizzle/DDL final lo escriben las fases ejecutoras (184+). Ni DDL completo ni solo-conceptual.
- **D-09:** **Franco firma el doc — sin gate de aprobación de Nacho.** La fase se cierra con el OK de Franco; a Nacho le llega como información.
- **D-10:** **El pendiente de A4 queda VALIDADO en esta discusión** (2026-08-27): mapeo de categorías tal cual está en el addendum — antebrazo→Bíceps, cuello→Core, 7 categorías (Pecho, Espalda, Hombros, Bíceps, Tríceps, Piernas, Core). El doc ya no arrastra ningún "validar con Nacho".

### Claude's Discretion

- **Ambición offline (definición 3):** área no seleccionada para discusión. La resuelve el diseño/research dentro de los guardrails del brief (§5 fricción mínima; def. 3: gimnasios en subsuelo, guardado local + sync posterior, conflicto entre dos dispositivos del mismo alumno).
- **Recálculo de récords (def. 4), modelado de superseries/circuitos (def. 5), esquema e índices (def. 6), mapa de `tenant_settings` (def. 7):** territorio del researcher/planner — el brief fija los criterios de aceptación (el alumno nunca ve un récord que cambia solo; el caso simple del 90% no se complica; consulta más frecuente = historial alumno×ejercicio; todo parámetro configurable en `tenant_settings`, nunca hardcodeado).
- Nombre/branding de la nueva app de alumnos: no discutido — proponer en el doc.

### Deferred Ideas (OUT OF SCOPE)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`, SPOM v5.1) — matcheó por keywords genéricas; revisado y NO plegado: es rollout de datos del módulo Templo, sin relación con el diseño del módulo Gimnasio. Sigue como todo independiente.

Fuera de eso: ninguna — la discusión se mantuvo dentro del alcance de la fase.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID         | Descripción                                                                                                                       | Qué de este research lo habilita                                                                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DIS-01** | Las 7 definiciones del brief respondidas y documentadas antes de construir                                                        | §"Las 7 definiciones: insumos verificados" (una subsección por definición, con la recomendación prescriptiva y su fundamento en el código real); §"Hallazgos bloqueantes" H-1/H-2/H-3 condicionan las definiciones 2 y 6; §"Don't Hand-Roll" evita re-construir el enforcement de tenancy            |
| **DIS-02** | Superficie member-facing multi-tenant decidida y documentada; `el-templo-app` NO se transforma; puede adelantar el split de repos | §"Superficie member-facing (DIS-02)" con el inventario real de las 4 apps del monorepo, el costo exacto de sumar la 5ª, los 4 bloqueos técnicos verificados (login cross-tenant, `DEFAULT_PUBLIC_TENANT_ID`, CORS estático, cert wildcard) y la contradicción documentada del trigger de split (H-4) |

</phase_requirements>

---

## Summary

Esta fase no escribe código de producto: produce `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`. Por eso el research de más valor no es "qué librería usar" sino **el inventario exacto de la maquinaria de tenancy que v6.0 dejó instalada y contra la cual el diseño tiene que encajar sin pelearse**. Esa maquinaria es real, es fail-closed y tiene gates de CI que rompen si el diseño la ignora: 91 tablas gym-owned declaradas a mano en `src/db/tenant-tables.ts`, 389 rutas clasificadas en `test/tenant-manifest.ts`, un sentinel de pool mysql2 que tira si una query toca una tabla strict sin filtro de tenant, un lint con allowlist versionada, y un guard `requireModule` que devuelve 404. El diseño del módulo Gimnasio se inserta ahí o el CI queda rojo.

De ese inventario salieron **cuatro hallazgos que condicionan definiciones enteras del brief** y que el doc de diseño tiene que resolver explícitamente, no descubrir en la fase 184: (1) el catálogo global+local que pide el §2 del brief **no tiene forma de expresarse** con los helpers actuales (`tenantWhere` es un `eq` estricto; no existe una categoría "scope mixto" ni en `tenant-tables.ts` ni en el sentinel); (2) el manifiesto de rutas declara literalmente que sus tres categorías no admiten una cuarta y que "agregarla es una decisión de diseño" — el módulo Gimnasio necesita esa decisión; (3) el **login es cross-tenant por email con `.limit(1)`** (deuda pre-existente documentada como T-173-15) y `DEFAULT_PUBLIC_TENANT_ID = 1` resuelve toda superficie pública al tenant 1 — los dos rompen en el minuto uno del tenant 2, o sea antes de ONB-01; (4) el trigger documentado del split de repos es, textualmente, "el nacimiento de la app de miembros multi-tenant" — o sea que D-05 ("no se adelanta") contradice la definición vigente del trigger y el doc tiene que reconciliarlo, porque el criterio de éxito 2 de la fase exige constancia explícita sobre ese punto.

En lo que es discreción de Claude (offline, récords, superseries, índices, `tenant_settings`) el research llegó a recomendaciones prescriptivas fundadas en prior art del propio repo (`sessionPlayerStore` ya persiste una sesión en curso con `@capacitor/preferences`) y en documentación oficial verificada (Quasar `setCssVar` para branding en runtime; WebKit exime del borrado a los 7 días a las web apps agregadas a inicio; Apple 4.2.6 nombra explícitamente el modelo "single binary / picker" que es la Opción A de D-11).

**Primary recommendation:** escribir el doc 08 con las 7 definiciones + DIS-02 como secciones, pero abrirlo con una sección **"Precondiciones de plataforma"** que resuelva de una los cuatro hallazgos bloqueantes (scope mixto del catálogo, cuarta categoría de manifiesto, resolución de tenant por hostname + login, y la constancia sobre el trigger de split). Sin eso, cada una de las fases 182-192 vuelve a chocar con lo mismo por separado.

---

## Architectural Responsibility Map

| Capability                                          | Primary Tier                                                               | Secondary Tier                                            | Rationale                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documento de diseño (el entregable de la fase)      | Repo / docs (`.docs/saas-multitenancy/`)                                   | —                                                         | La serie 01-07 vive ahí y el CONTEXT lo fija (D-07). Prettier lo formatea en pre-commit.                                                            |
| Catálogo de ejercicios global + local               | API / Backend (Drizzle + MySQL)                                            | —                                                         | Es modelo de datos con reglas de propiedad y aislamiento; ninguna parte vive en el cliente.                                                         |
| Aislamiento entre gimnasios                         | API / Backend (capa 1 `attachScope` + capa 2 `tenantWhere`/`tenantValues`) | Database (FK + uniques compuestas)                        | Regla dura de v6.0: el tenant JAMÁS viaja por el borde — se resuelve server-side desde `users.tenant_id`.                                           |
| Gate del módulo (`module.gimnasio.enabled`)         | API / Backend (`requireModule` → 404)                                      | Frontend (nav gateado por `enabledModules` de `/auth/me`) | El backend es fail-closed; el frontend solo evita mostrar links muertos.                                                                            |
| Ejecución y registro de la sesión (fricción mínima) | Browser / Client (nueva app de alumnos)                                    | API / Backend (sync idempotente)                          | El §5 del brief es UX pura de pulgar; la red es opcional durante la sesión.                                                                         |
| Persistencia offline de la sesión en curso          | Browser / Client (Capacitor Preferences / IndexedDB)                       | API / Backend (outbox → upsert idempotente)               | Gimnasios en subsuelo (def. 3): el registro no puede depender de la red.                                                                            |
| Récords personales                                  | API / Backend (tabla derivada, misma transacción)                          | —                                                         | "El alumno nunca ve un récord que cambia solo" exige transaccionalidad server-side; un cálculo en el cliente miente en cuanto hay dos dispositivos. |
| Branding por tenant (colores, logo, nombre)         | API / Backend (`tenant_settings` + assets en R2)                           | Browser / Client (`setCssVar` en runtime)                 | D-12: config, nunca código. El cliente solo APLICA lo que el server le dice.                                                                        |
| Resolución de tenant pre-login                      | API / Backend (por hostname)                                               | CDN / nginx (vhost wildcard)                              | D-06: branding pre-login por subdominio ⇒ el tenant se resuelve antes de que exista un usuario.                                                     |
| Panel del profesor (señales)                        | Frontend `el-templo-admin`                                                 | API / Backend (agregados por tenant)                      | D-03(a): el staff ya tiene hogar multi-tenant; no se crea app nueva para el profe.                                                                  |
| Aprovisionamiento de subdominio + certs             | CDN / nginx + DNS (EC2)                                                    | API / Backend (wizard PLAT-02/03)                         | Wildcard DNS + wildcard cert evitan que el alta toque el servidor a mano.                                                                           |

---

## Project Constraints (from CLAUDE.md)

Directivas accionables extraídas de `./CLAUDE.md` que el planner debe verificar en cada plan de esta fase y que el diseño debe respetar aguas abajo:

| #    | Directiva                                                                                                                                             | Impacto en la 181                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C-1  | **Logging:** API usa Pino (`request.log`/`app.log`); frontends usan `createLogger()` de `src/utils/logger.ts`. **Nunca `console.log`.**               | La nueva app de alumnos nace con `createLogger()`, no con `console`. El doc lo deja escrito.                         |
| C-2  | **TypeScript:** prohibido `any`; `catch (err: unknown)` con `instanceof Error`.                                                                       | Aplica al código de las fases 184+; el doc no propone tipos laxos.                                                   |
| C-3  | **API Tests:** toda ruta nueva lleva test de integración en `el-templo-api/test/` contra MySQL real (`eltemplo_test`).                                | El doc debe dimensionar que el módulo Gimnasio agrega ~decenas de rutas ⇒ decenas de tests + entradas de manifiesto. |
| C-4  | **DB:** cambios por schema Drizzle + SQL hand-written; `pnpm db:migrate`; **nunca `drizzle-kit migrate`**; `db:push` prohibido en trabajo commiteado. | Las migraciones del módulo reservan desde **0216** (verificado: la última es `0215_referral_partners.sql`).          |
| C-5  | **Env vars:** toda var nueva actualiza su `.env.example`.                                                                                             | La app nueva introduce al menos `VITE_API_URL` propio + secrets de deploy.                                           |
| C-6  | **Pre-commit:** Husky + lint-staged (Prettier). Si falla, commit nuevo — **no `--amend`**.                                                            | Prettier formatea `**/*.md` ⇒ el doc 08 pasa por Prettier. Es el único gate automático del entregable.               |
| C-7  | **CI/CD:** type check, lint, security audit, integration tests, build en cada push; deploy con auto-rollback.                                         | Sumar una 5ª app implica un job de build más y un `paths-filter` más.                                                |
| C-8  | **Patrones:** services API con fachada; stores Pinia composition API; composables exponen `cleanup()`, sin `onUnmounted` adentro.                     | El doc prescribe estos patrones para la app nueva en vez de inventar otros.                                          |
| C-9  | **Sentry:** `@sentry/node` en API (`instrument.ts` primero), `@sentry/vue` en frontends (`boot/sentry.ts` primer boot file), guardado por DSN.        | La app nueva nace con el boot de Sentry (es una línea del doc, no una fase).                                         |
| C-10 | **Delegación:** barridos de lectura e inventarios a subagentes sonnet; hilo principal solo decisiones.                                                | Operativo del planner, no del diseño.                                                                                |
| C-11 | **Plan Mode Review:** DRY agresivo, tests no negociables, "engineered enough", edge cases de más, explícito sobre clever.                             | Criterio de calidad del propio doc de diseño.                                                                        |

**Reglas duras del milestone (ROADMAP §"Reglas duras", autoridad equivalente):** módulo duro A1 (cero imports SPOM en ninguna dirección, `exercises` intacta); gate `module.gimnasio.enabled`; migraciones desde 0216; staging-first estricto (push y SSH son gates humanos); todo parámetro en `tenant_settings`; guardrails del brief (nada se borra, taxonomías validadas en carga, aislamiento total, la rutina asignada no muta, se registra lo realizado).

---

## Hallazgos bloqueantes (lo que el doc 08 tiene que resolver sí o sí)

Estos cuatro son el resultado de más valor de este research. Ninguno es opinión: los cuatro salen de leer el código y los docs del propio repo.

### H-1 — El catálogo global+local no tiene forma de expresarse con los helpers de tenancy actuales

**El hecho.** `tenantWhere(table, ctx)` es literalmente `eq(table.tenantId, scope.tenantId)` [VERIFIED: `el-templo-api/src/modules/shared/tenant.ts:149-154`]. `tenantIdColumn()` es `int NOT NULL DEFAULT 1 REFERENCES tenants.id` [VERIFIED: `src/db/schema/tenant-column.ts:56-61`]. Y `src/db/tenant-tables.ts` clasifica **cada** tabla del schema en exactamente dos baldes: `GYM_OWNED_TABLES` (91 entradas verificadas) o `TENANT_EXEMPT_TABLES` (4: `tenants`, `tenant_settings`, `system_settings`, `labs_inquiries`) [VERIFIED: conteo directo sobre el archivo]. El test `test/db/tenant-tables.test.ts` es fail-closed: una tabla sin clasificar deja la suite en rojo.

**Por qué bloquea.** El §2.1 del brief pide un catálogo donde **todos los gimnasios ven las filas globales y además las propias**. Eso es `WHERE tenant_id IS NULL OR tenant_id = ?`, que no es `tenantWhere` ni es "tabla exenta". No existe hoy una tercera categoría. Y el sentinel de pool evalúa **por query** mientras el lint evalúa **por tabla** (trampa (h) de la receta 07) — una tabla de scope mixto dispara los dos si no se la clasifica a propósito.

**Las opciones reales, con su costo:**

| Opción                                                  | Forma                                                 | Promoción local→global (CAT-04)                                                                                                                           | Costo en la maquinaria v6.0                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Una tabla, `tenant_id` NULLable** (NULL = global)  | `gym_exercises` con `tenant_id INT NULL`              | **`UPDATE ... SET tenant_id = NULL`** — el `id` no cambia, ergo CERO registros históricos rotos. Cumple CAT-04 por construcción.                          | Necesita: categoría nueva en `tenant-tables.ts` con motivo escrito, helper nuevo `tenantOrGlobalWhere()`, y exención explícita del sentinel/lint para esa tabla. Rompe la invariante "toda tabla gym-owned lleva `NOT NULL DEFAULT 1`".                                                                 |
| **B. Dos tablas** (global exenta + local gym-owned)     | `gym_exercises_global` + `gym_exercises_local`        | Copiar la fila a global y **reescribir todas las referencias** — o dejar un puntero. Riesgo directo contra CAT-04 ("ningún registro histórico se rompe"). | Enforcement limpio (cada tabla cae en un balde existente), pero **toda FK aguas abajo se vuelve polimórfica** (`exercise_scope` + `exercise_id`), sin integridad referencial, con índices y JOINs peores para la consulta crítica de la def. 6.                                                         |
| **C. Tenant plataforma** (`tenant_id` = fila reservada) | Una tabla gym-owned, `tenant_id = PLATFORM_TENANT_ID` | `UPDATE ... SET tenant_id = PLATFORM` — id preservado, igual de limpio que A.                                                                             | Conserva `NOT NULL` + FK. Pero el filtro deja de ser `tenantWhere` (`inArray(tenant_id, [PLATFORM, ctx.tenantId])`) igual que en A, y agrega un efecto colateral: una fila en `tenants` que `forEachActiveTenant` barrería en los 7 crons si quedara `status='active'` [VERIFIED: `tenant.ts:220-229`]. |

**Recomendación (MEDIUM-HIGH confidence):** **Opción A**, porque es la única que hace de CAT-04 ("promover sin romper historial") un no-evento en vez de una migración de datos riesgosa, y porque el "club GLOBAL" del doc 05 §3 ya declara al catálogo genérico como **su primer miembro confirmado** [CITED: `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` §3]. El costo (una categoría más en `tenant-tables.ts` + un helper) es exactamente el tipo de decisión que el repo espera que se escriba con su motivo al lado — el precedente es `TENANT_GLOBAL_UNIQUES`, cuyo docblock dice que "la única forma de eximir algo es escribir por qué". **El doc 08 debe elegir explícitamente y nombrar el helper y la categoría nuevos**, porque las fases 184/185 no pueden inventarlos por su cuenta sin re-litigar A1/A2.

⚠️ Lo mismo aplica, con el mismo análisis, a **plantillas de rutina globales + del gimnasio** (RUT-01). La decisión debe ser una sola para las dos entidades.

### H-2 — El manifiesto de rutas tiene tres categorías y declara que la cuarta es una decisión de diseño

**El hecho.** `test/tenant-manifest.ts` define `const CATEGORIAS = ["tenant-scoped", "global", "templo-module"] as const;` con el comentario literal: _"Las tres categorías posibles. **No hay una cuarta, y agregarla es una decisión de diseño.**"_ [VERIFIED: `el-templo-api/test/tenant-manifest.ts:148`]. El campo `modulo` está tipado como `ModuloTemplo`, alias de `MODULE_NAMES` de `src/modules/shared/modules.ts`, hoy con exactamente 4 valores: `templo-training`, `templo-gamification`, `templo-marketing`, `templo-onboarding` [VERIFIED: `modules.ts:35-40`]. El gate `test/tenancy/iso-01-manifiesto.test.ts` corre con `ENTRADAS_BASELINE = 389` [VERIFIED: línea 261] — cada ruta nueva del módulo Gimnasio mueve ese número y exige su entrada clasificada.

**Por qué bloquea.** El ROADMAP fija el flag como `module.gimnasio.enabled`. Para que `parseModuleFlagKey` lo reconozca, `"gimnasio"` tiene que entrar a `MODULE_NAMES` [VERIFIED: `modules.ts:69-76` — una key con nombre desconocido se **ignora**, o sea el módulo quedaría OFF para siempre, en silencio]. Pero al entrar a `MODULE_NAMES`, una ruta del módulo Gimnasio se clasificaría `categoria: "templo-module", modulo: "gimnasio"` — semánticamente falso: el módulo Gimnasio es lo contrario de un feature exclusivo de El Templo.

**Recomendación (HIGH confidence):** el doc 08 decide una de dos, y lo escribe:

- **B1 (recomendada):** renombrar la categoría a `feature-module` (o agregar `gimnasio-module` como cuarta) y renombrar `ModuloTemplo` → `ModuloFeature`. Es un rename mecánico sobre 141 entradas + el gate; barato hoy, carísimo cuando haya 300 rutas del módulo Gimnasio clasificadas mal.
- **B2:** dejar `templo-module` como está y documentar que el nombre es histórico. Costo cero hoy, deuda semántica permanente en el archivo que el repo usa como fuente de verdad de aislamiento.

Y en los dos casos: **`"gimnasio"` entra a `MODULE_NAMES`** (con la granularidad "módulo comercial grueso" del doc 04 §2.1 — UNO solo, no uno por carpeta).

### H-3 — El login es cross-tenant por email y toda superficie pública resuelve al tenant 1

**Los hechos, los dos verificados en el código:**

1. `POST /api/auth/login` busca el usuario **sin selector de gimnasio**, cross-tenant, con `.limit(1)`, y recién después deriva el `TenantContext` de la fila encontrada. Está comentado como deuda pre-existente T-173-15 con exención `tenant-safe` embebida en el SQL [VERIFIED: `el-templo-api/src/modules/auth/routes.ts:620-672`]. El chequeo de duplicado de `/register` tiene la misma exención [VERIFIED: `routes.ts:111`].
2. `users.email` dejó de ser único global en la fase 168: la unique es `uq_users_tenant_email (tenant_id, email)` [VERIFIED: `src/db/schema/users.ts:295`].

**Por qué bloquea.** (1) + (2) significan que en cuanto exista tenant 2, **dos personas de gimnasios distintos con el mismo email son legales en la base y el login le entrega la sesión a la que MySQL devuelva primero**. No es hipotético: es el escenario normal (un socio de El Templo que también entrena en el gimnasio nuevo; un profe que trabaja en dos). Rompe ONB-01 y es un problema de seguridad, no de UX.

Además, `DEFAULT_PUBLIC_TENANT_ID = 1` resuelve como tenant 1 **toda ruta que corra sin `request.user`** — el guard lo documenta como deuda consciente D-06 y dice textualmente que _"cuando exista más de un tenant con superficie pública propia, este default deja de ser válido y hay que resolver por dominio/Host en su lugar"_ [VERIFIED: `src/modules/shared/modules.ts:78-86` y el docblock de `module-registry.ts`]. La D-06 del CONTEXT (branding pre-login por subdominio) **es exactamente ese caso**.

**Recomendación (HIGH confidence):** D-06 no solo elige una URL bonita — **es la solución de las dos deudas a la vez**, y el doc 08 debería decirlo así:

- Resolución de tenant **por hostname** en una capa nueva anterior a `attachScope` (`Host` → `tenants.slug`), con `RESERVED_TENANT_SLUGS` ya previsto en el schema para esto [VERIFIED: `src/db/schema/tenants.ts:92-106`, cuyo comentario dice que los slugs se reservaron "por si la decisión diferida de login/dominios termina en subdominios"].
- El login de la app de alumnos pasa a ser **scoped por tenant resuelto del host** ⇒ la query deja de ser cross-tenant y `.limit(1)` deja de ser ambiguo.
- El login de `el-templo-admin` y de `el-templo-app` (tenant 1) queda como está en v1, o migra al mismo mecanismo — el doc decide y lo traza.
- Consecuencia formal: **la decisión DIFERIDA del README §"login / resolución de tenant / unicidad de email" (abierta desde 2026-07-01) queda CERRADA por esta fase** [CITED: `.docs/saas-multitenancy/README.md:361-365`]. Conviene registrarlo, porque cerrar una diferida ajena sin decirlo la deja viva en el índice.

### H-4 — El trigger del split de repos es, textualmente, la app que esta fase decide construir

**El hecho.** README de saas-multitenancy: _"**Trigger: el nacimiento de la app de miembros multi-tenant, que ESTRENA el repo SaaS** (se funda con `api` + `admin` white-label + la app nueva + contrato de tipos); `el-templo-app` + `el-templo-web` quedan como repo del tenant 1."_ [VERIFIED: `.docs/saas-multitenancy/README.md:371-374`].

**Por qué importa.** D-05 dice "el split NO se adelanta; el trigger sigue intacto". Pero por la definición vigente, **construir la app de alumnos ES disparar el trigger**. El criterio de éxito 2 de la fase pide constancia explícita "de si la decisión adelanta o no la discusión del split de repos" — así que esto no se puede dejar implícito.

**Recomendación (HIGH confidence):** el doc 08 debe **re-enunciar el trigger**, no solo declararlo intacto. Dos redacciones honestas posibles: (a) _"el trigger se cumplió y se decide deliberadamente NO ejecutarlo en v6.1; se re-arma sobre los triggers secundarios (identidad comercial / equipo propio) y sobre el primer tenant que pague"_; o (b) _"el trigger se redefine: lo dispara la app en TIENDAS con tenants pagos, no su existencia en el repo"_. Cualquiera sirve; lo que no sirve es dejar el README diciendo una cosa y el doc 08 otra.

**Corolario para el planner:** la decisión abierta **"contrato de tipos API↔frontends"** (README:375-380, hoy los tipos se espejan a mano con comentarios `// Mirrors el-templo-api/...`) empeora con un 5º frontend. El doc 08 no la tiene que resolver, pero debería nombrarla como consecuencia asumida.

---

## Las 7 definiciones: insumos verificados y recomendación

### Definición 1 — ¿Calistenia y Gimnasio comparten modelo de datos?

**CERRADA por D-01/D-02.** No se investigó la alternativa unificada (orden explícita del CONTEXT). Lo que el research aporta es la **evidencia de código** que sostiene el fundamento que el doc tiene que escribir:

- `exercises` es el árbol de progresión del SPOM, no un catálogo: sus columnas son `pattern`, `route`, `progression_step`, `dificultad_lineal`, `habilidad`, `canonical_exercise_id`, `milestone_exercise_id`, `effort`, `level` (enum de niveles griegos) [VERIFIED: `src/db/schema/exercises.ts:23-86`]. Ninguna de esas columnas tiene sentido en un catálogo de musculación, y ninguna de las 15 columnas de la ficha del §2.2 del brief (alias, grupo muscular secundario, equipamiento múltiple, tipo de carga, ejecución paso a paso, errores frecuentes, variantes fácil/difícil, alternativas, alcance, estado) existe ahí.
- `exercises` **lleva `tenant_id`** y está en `GYM_OWNED_TABLES` [VERIFIED: `src/db/tenant-tables.ts:103`]. O sea: es "el árbol del SPOM del gimnasio X", no un catálogo de plataforma. El catálogo global del brief es estructuralmente otra cosa (H-1).
- La exclusión mutua de D-02 ya está implementada de hecho: `enabledModulesFor` es fail-closed y el guard responde **404** (no 403) para no revelar que el feature existe [VERIFIED: `module-registry.ts` docblock]. Un tenant con `templo-training` OFF y `gimnasio` ON ve un solo sistema, sin código condicional adicional.

**Aporte del research al fundamento del "peso corporal con lastre":** el `exercises` del SPOM ya tiene una columna `equipment` tipada [VERIFIED: `exercises.ts:83`] y el catálogo nuevo tendrá su propia lista cerrada de 25 equipamientos (§2.3). Son dos vocabularios distintos que nunca se cruzan — exactamente el "fichas independientes sin puente de datos" del addendum A3.

### Definición 2 — Alcance global/local y promoción sin romper historial

Ver **H-1** (es la definición más condicionada por la maquinaria existente). Insumos adicionales:

- **La promoción NO puede ser un DELETE + INSERT.** Guardrail del brief: "nada se borra". Con Opción A (H-1) la promoción es un `UPDATE tenant_id → NULL` y los `set_logs` históricos, que apuntan por FK al mismo `id`, no se enteran. Es la única de las tres opciones donde CAT-04 se cumple sin escribir código de migración de datos.
- **La copia local automática (CAT-03)** es el mecanismo inverso: editar un global inserta una fila nueva con `tenant_id = X` y `copied_from_exercise_id = <global>`. Ese puntero es informativo (para "esta es tu versión de X"), **no** una FK que la lectura tenga que seguir — si la lectura tuviera que resolverlo, el índice de la def. 6 dejaría de cubrir la consulta.
- **Desactivación (CAT-05):** columna `status` (borrador/publicado/desactivado) del §2.2, no un `deleted_at`. Nada se borra: el filtro del buscador excluye `desactivado`, las lecturas de historial no filtran por `status`.
- **Precedente de nombres:** el `slug` de `tenants` es único global "para que funcione igual con sitio único, subdominio o dominio propio" [VERIFIED: `tenants.ts:87-91`]. El catálogo puede seguir el mismo criterio para el nombre canónico: unique compuesta `(tenant_id, nombre_canónico)` con las filas globales compartiendo el mismo espacio de nombres — el brief exige justamente detectar colisiones y sinónimos (CAT-08 paso 2).
- ⚠️ **Contradicción heredada a saldar en el doc:** el doc 02 §2 describe el catálogo global con "disponibilidad por tenant según equipamiento/máquinas". El brief §2.3 lo prohíbe explícitamente ("ningún gimnasio configura qué máquinas tiene… quedó explícitamente fuera de alcance"). Manda el brief; el doc 08 debería dejar la corrección escrita para que nadie la reabra en la 184.

### Definición 3 — Comportamiento offline (discreción de Claude)

**Prior art del propio repo (el hallazgo que hace barata esta definición):** `el-templo-app/src/modules/training/stores/sessionPlayerStore.ts` **ya persiste el progreso de una sesión en curso** en `@capacitor/preferences`, con `load`/`save`/`remove` por `dayId` [VERIFIED: líneas 3, 34, 67-139]. Y `useTokenStorage.ts` ya tiene el patrón de rama nativo-vs-web (`Capacitor.isNativePlatform()` → Preferences, si no → `localStorage`) [VERIFIED: `src/composables/useTokenStorage.ts:1-38`]. La app nueva no inventa nada: copia estos dos patrones.

**Hechos de plataforma verificados:**

- Las web apps **agregadas a la pantalla de inicio en iOS están exentas** del borrado a los 7 días que ITP aplica al storage script-writable (IndexedDB, localStorage, Cache API, Service Workers): "their days of use will match actual use of the web application… first-party data should not be deleted for home screen web apps, and any such deletion would be a serious bug" [CITED: webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/]. **Consecuencia de diseño:** el offline es confiable en la app Capacitor y en la PWA instalada; **no** lo es en Safari-en-pestaña. El onboarding de la superficie web debe empujar "Agregar a inicio" ANTES de prometer offline.
- `el-templo-app` tiene el modo PWA de Quasar **apagado** (`pwa: false`, bloques de service worker comentados) [VERIFIED: `el-templo-app/quasar.config.js:138-174`]. La app nueva tiene que **encender** el modo PWA si D-12(a) va en serio — no es gratis, es una configuración + un manifest por subdominio.

**Recomendación prescriptiva (MEDIUM-HIGH):**

1. **Alcance del offline: SOLO la sesión en curso.** Se cachea la rutina activa del alumno (es una copia inmutable — RUT-04 — así que cachearla es seguro por definición) y se escriben localmente las series. Catálogo completo, panel del profe, historial y edición de registros viejos: online. Justificación: es el único punto donde el brief dice que la red se pierde (§ def. 3, subsuelo) y es donde el costo de perder datos es total (§5: "si no carga, no hay historial").
2. **Mecanismo: outbox local**, misma tecnología que el prior art (`@capacitor/preferences`, que en web cae a `localStorage`). Volumen: una sesión típica son ~6 ejercicios × 4 series = 24 filas; incluso una sesión larga no llega a 100. No justifica IndexedDB en v1. Si en v2 hace falta (múltiples sesiones en cola, adjuntos), la migración natural es `idb`.
3. **Idempotencia obligatoria:** cada serie lleva un `client_set_uid` (UUID generado en el cliente al crear la fila local) con **unique `(tenant_id, client_set_uid)`** en la tabla de series. El endpoint de sync es un upsert por esa clave. Esto resuelve de una: reintentos de red, doble-tap del botón "hice lo planificado", y re-sync después de un crash.
4. **Dos dispositivos del mismo alumno (la pregunta explícita de Nacho):** la unidad de identidad es la serie, no la sesión. Regla recomendada: **la sesión es una sola entidad server-side; el segundo dispositivo la "continúa"**, y el merge es last-write-wins **por serie**, comparando el `recorded_at` que manda el cliente (no `NOW()` del server, que borraría el orden real). Lo pisado no se descarta en silencio: se guarda en el log de ediciones (guardrail "nada se borra", y sostiene el recálculo de récords de la def. 4).
   - **El reloj del cliente no es confiable** — guardar los dos sellos: `recorded_at` (cliente, para ordenar/mergear) y `synced_at` (servidor, para auditar). Y acotar: un `recorded_at` fuera de una ventana razonable respecto de `synced_at` se marca, no se rechaza (el guardrail dice que la serie que salió mal también es dato).
5. **El timeout de abandono (12 h, REG-02) se evalúa server-side**, nunca en el cliente: un cliente offline no puede saber si pasaron 12 h "de verdad". El cron/job de abandono corre con `forEachActiveTenant` [VERIFIED: patrón ya existente, `tenant.ts:248`].
6. **Caso borde a escribir:** una sesión que el cliente sincroniza DESPUÉS de haber sido marcada `abandonada` por el timeout. Recomendación: se aceptan las series (nada se borra) y la sesión **no** vuelve a `completada` salvo cierre manual explícito — REG-02 dice "completada únicamente si el alumno la cierra a mano".

### Definición 4 — Recálculo de récords (discreción de Claude)

**Criterio de aceptación del brief:** "el alumno nunca ve un récord que después cambia solo". Eso **descarta el proceso diferido/batch** de plano: cualquier ventana entre el registro y el recálculo es exactamente el bug que el brief prohíbe.

**Recomendación prescriptiva (HIGH confidence en la forma, MEDIUM en los detalles de columnas):**

- **Tabla derivada `gym_personal_records`** con unique `(tenant_id, user_id, exercise_id, metric)` y columnas `best_value`, `achieved_at`, `source_set_log_id`.
  - `metric` desde v1 aunque v1 tenga una sola métrica (`max_weight`, EVO-01): el brief manda récords de reps y de volumen a v2 (§7), y agregarlos después con la columna ya presente es un INSERT, no un ALTER de forma.
- **Mantenimiento en la MISMA transacción** que el alta/edición/baja del registro. Nunca en un hook `event` del registry (los events son best-effort y aislados por diseño — `04-mecanismo-modulos.md` §4.1 — o sea que un récord perdido no rompería nada y nadie se enteraría; es justo lo contrario de lo que pide el brief).
- **Dos caminos, no uno:**
  - **Alta:** comparación barata (`INSERT ... ON DUPLICATE KEY UPDATE` con la comparación en SQL). No hace falta releer el historial.
  - **Edición o baja:** **recálculo completo del récord de ESE (tenant, usuario, ejercicio, métrica)** con un `SELECT MAX(...)` acotado. Nunca un decremento — decrementar es lo que produce el "récord fantasma" cuando se borra la serie que lo sostenía (criterio de éxito 5 de la fase 190).
  - El recálculo es barato **porque el índice de la definición 6 ya existe para el historial**: la misma estructura sirve a las dos cosas. Esto es lo que hace que la respuesta síncrona sea viable y hay que escribirlo en el doc.
- **Concurrencia:** el sync offline y la edición del profe pueden pegar a la vez. Bloqueo de la fila de récord dentro de la transacción (`SELECT ... FOR UPDATE`) o comparación atómica en el `ON DUPLICATE KEY UPDATE`. Sin eso, dos escrituras concurrentes dejan un récord viejo pegado.
- **Ejercicio realizado ≠ planificado (REG-04):** el récord se acumula contra el ejercicio **realizado**. Es una consecuencia directa del guardrail y hay que dejarlo escrito, porque es donde una implementación distraída acumularía contra el planificado.

### Definición 5 — Superseries y circuitos (discreción de Claude)

**Restricción del brief:** "aunque sea de forma simple (ejercicios marcados como parte del mismo bloque)" y "sin complicar el caso simple, que es el 90%".

**Recomendación prescriptiva (MEDIUM-HIGH):** **columnas de agrupación en la propia fila del ejercicio del día**, sin tabla de bloques:

| Columna          | Tipo                             | Semántica                                                       |
| ---------------- | -------------------------------- | --------------------------------------------------------------- |
| `order_in_day`   | int                              | Orden del ejercicio dentro del día. Siempre presente.           |
| `group_key`      | varchar corto, **NULL**          | `NULL` = ejercicio suelto (el 90%). Mismo valor = mismo bloque. |
| `group_type`     | enum(`superset`,`circuit`), NULL | Solo cuando `group_key` no es NULL.                             |
| `order_in_group` | int, NULL                        | Orden dentro del bloque.                                        |

- **El caso simple no paga nada:** tres columnas NULL que nadie lee. Una tabla `routine_blocks` obligaría a un JOIN (o a un LEFT JOIN con NULLs) para renderizar la rutina más común del sistema.
- **Sobrevive al clonado.** La regla dura RUT-03/RUT-04 es que la plantilla se **clona** y la asignada es una **copia**: con la agrupación en la misma fila, clonar es `INSERT ... SELECT` y la agrupación viaja sola. Con tabla aparte, clonar exige remapear ids de bloque — una fuente de bugs gratuita.
- **Alternativa considerada y por qué no:** tabla `routine_blocks` con FK es más limpia semánticamente y necesaria si v2 pide rondas por bloque, descanso por bloque o tiempo de circuito. Promover de columnas a tabla más adelante es una migración acotada; hacerlo hoy es complejidad para un requerimiento que el brief mandó a "de forma simple".
- **Detalle que el doc debe fijar:** el `group_key` se genera en el servidor al guardar (no lo elige el usuario) y es **único dentro del día**, no global — así el clonado no colisiona nunca.

### Definición 6 — Volumen de datos, esquema e índices (discreción de Claude)

**La consulta que manda:** "historial de este alumno en este ejercicio" (el brief la nombra como la más frecuente). En v1 la sirven **tres** requirements a la vez: EVO-01 (récord de peso), EVO-02 (qué hizo la última vez) y PROF-03 (planificado vs realizado).

**Recomendación prescriptiva (MEDIUM-HIGH):**

1. **Denormalizar `user_id`, `exercise_id` y `performed_at` en la fila de la serie**, aunque los tres sean derivables de la sesión. Es LA decisión de esta definición. Sin eso, la consulta necesita 2-3 JOINs (`set_log → session_exercise → session → user`) y **ningún índice puede cubrirla**. Con eso, un índice único la resuelve entera.
   - Es seguro: los tres son inmutables una vez creada la fila. El único que "cambia" es `exercise_id` cuando el alumno sustituye el ejercicio (REG-04) — y ahí lo correcto es que la fila guarde el **realizado**, o sea que se escribe con el valor final, no que se actualice después.
2. **Índice de cobertura:** `idx_gym_set_logs_hist (tenant_id, user_id, exercise_id, performed_at DESC)`.
   - `tenant_id` primero: es la convención de la fase 168 para uniques compuestas y lo que el aislamiento exige (el filtro de tenant es el primer término de todo WHERE — `tenant.ts:17-21`).
   - Sirve al historial, al `MAX()` del recálculo de récords (def. 4) y a EVO-02 ("la última vez") con un `ORDER BY performed_at DESC LIMIT 1`.
3. **Estimación de volumen (para responderle a Nacho con un número, no con "crece rápido"):** un alumno activo con 4 sesiones/semana × 6 ejercicios × 4 series ≈ **96 filas/semana ≈ 5.000 filas/año**. Un gimnasio de 500 alumnos activos ≈ **2,5 M filas/año**; uno de 1.000 ≈ 5 M/año. Con el índice de arriba, MySQL 8 resuelve el historial de un alumno×ejercicio en un rango de índice de decenas de filas, **independientemente del total de la tabla**. [ASSUMED — aritmética sobre supuestos de uso, no medición]
   - **Sin particionado en v1.** Recomendación: escribir el umbral de revisión (p. ej. "revisar particionado por rango de `performed_at` cuando la tabla pase las ~50 M de filas o el índice no entre en el buffer pool") en vez de dejarlo abierto.
   - **Nada se borra** (guardrail) ⇒ la tabla crece monótonamente. Esto hay que decirlo explícitamente: no habrá purga.
4. **Sobre la FK a ejercicio:** con la Opción A de H-1 es una FK simple a `gym_exercises(id)` y el índice funciona. Con la Opción B (dos tablas) la referencia se vuelve polimórfica y el índice pierde selectividad — **este es el argumento cuantitativo a favor de A** y conviene que aparezca en la definición 6, no solo en la 2.
5. **`el-templo-api` no typechequea `test/`** y **CI no typechequea los frontends** [CITED: memoria `reference_ci_no_typecheck_frontends`; `tenant-manifest.ts:140-143`]. Irrelevante para el diseño, pero relevante para el planner de las fases ejecutoras.

### Definición 7 — Mapa de parámetros en `tenant_settings`

**Mecánica verificada:** `tenant_settings` es un KV `(tenant_id, setting_key, setting_value TEXT)` con unique `uq_tenant_setting` [VERIFIED: `src/db/schema/tenants.ts:73-85`]. El vocabulario de los flags de módulo es `"true"`/`"false"` — **divergencia deliberada** respecto de `system_settings`, que usa `'on'`/`'off'`; el docblock ordena no mezclarlos [VERIFIED: `modules.ts:44-52`]. El cache es in-memory con TTL 60 s en runtime y 0 en test, con `invalidateModuleFlags()` exportada [VERIFIED: `module-flags.ts:60-82`]. `tenant_settings` está en `TENANT_EXEMPT_TABLES` (no lleva `tenant_id` como columna gym-owned: lo lleva como parte de su clave) [VERIFIED: `tenant-tables.ts`].

**Mapa recomendado (todos los parámetros que el brief declara configurables, ninguno hardcodeado):**

| Key                                      | Default                                                | REQ     | Fuente en el brief                                                  |
| ---------------------------------------- | ------------------------------------------------------ | ------- | ------------------------------------------------------------------- |
| `module.gimnasio.enabled`                | `"false"` (fail-closed); el wizard lo siembra `"true"` | PLAT-03 | ROADMAP regla 2 / doc 04                                            |
| `gimnasio.self_service.enabled`          | `"false"`                                              | RUT-07  | §4.2 "apagado por default"                                          |
| `gimnasio.session.abandon_timeout_hours` | `"12"`                                                 | REG-02  | §5.2                                                                |
| `gimnasio.log.edit_window_hours`         | `"24"`                                                 | REG-05  | §5.4                                                                |
| `gimnasio.signals.hard_streak`           | `"3"`                                                  | PROF-02 | §8 "umbral parametrizable, default 3"                               |
| `gimnasio.signals.easy_streak`           | `"3"`                                                  | PROF-02 | §8 (el brief no da default para "Fácil"; se espeja el de "Difícil") |
| `gimnasio.signals.inactivity_days`       | `"14"`                                                 | PROF-02 | §8 "default 14"                                                     |
| `gimnasio.units.weight`                  | `"kg"`                                                 | REG-03  | §5.3 "kg en v1, libras previsto"                                    |

**Claves de branding (D-12: config, nunca código):**

| Key                                                                    | Uso                                                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `brand.display_name`                                                   | Nombre del gimnasio dentro de la app y en el `<title>` de la web                                                        |
| `brand.subdomain`                                                      | Hostname del tenant (D-06). Puede derivarse de `tenants.slug` en vez de duplicarse — **decisión del doc**               |
| `brand.color.primary` / `brand.color.secondary` / `brand.color.accent` | Aplicados en runtime con `setCssVar` (ver Code Examples)                                                                |
| `brand.logo_url`                                                       | Asset por tenant. Hogar natural: R2, ya montado como plugin (`fastify.r2` / `r2Bucket`) [VERIFIED: `src/plugins/r2.ts`] |
| `brand.icon_key`                                                       | Cuál del set pre-empaquetado de íconos alternativos usa la app nativa (D-11)                                            |

**Recomendaciones de forma que el doc debe fijar:**

- **Un solo namespace `gimnasio.`** para los parámetros del módulo, separado del namespace `module.` (que es del mecanismo) y de `brand.` (que es transversal a cualquier módulo). Los tres coexisten en la misma tabla.
- **Todo valor es TEXT** ⇒ el parseo con default vive en un solo helper por módulo (patrón `parseOrDefault` que ya usan streaks y finance contra `system_settings`, doc 04 §2). Un default duplicado en dos call sites es el bug clásico.
- **Los defaults viven en código**, no en la migración de seed: un tenant nuevo sin filas tiene que funcionar. La migración de seed del wizard (PLAT-03) escribe las que el owner elige distinto, no las 8.
- **Cache invalidation:** toda escritura de estas keys debe llamar a la invalidación correspondiente. Hoy solo existe `invalidateModuleFlags()` (para `module.*`); si los parámetros de gimnasio se cachean igual, el doc debe pedir el helper análogo. **Si no se cachean, decirlo también** — una query por request es aceptable y evita una clase entera de bugs.

---

## Superficie member-facing (DIS-02) — inventario y costo real

### El monorepo tiene HOY cuatro apps, no tres

`CLAUDE.md` dice "Monorepo with 3 apps". **Está desactualizado.** El repo tiene:

| App               | Stack                                   | Rol                            | Deploy                                        |
| ----------------- | --------------------------------------- | ------------------------------ | --------------------------------------------- |
| `el-templo-api`   | Fastify + Drizzle + MySQL               | Backend                        | rsync + migraciones + restart + smoke test    |
| `el-templo-app`   | Quasar + Vue 3 + **Capacitor** (v1.7.7) | App de miembros del tenant 1   | rsync a `APP_DEPLOY_PATH` + builds de tiendas |
| `el-templo-admin` | Quasar + Vue 3 (web-only)               | Staff, ya multi-tenant         | rsync a `ADMIN_DEPLOY_PATH`                   |
| `el-templo-web`   | **Nuxt 4** + @nuxt/content (SSG)        | Landing pública `eltemplo.org` | rsync a `WEB_DEPLOY_PATH` + smoke test propio |

[VERIFIED: `ls`, los cuatro `package.json`, y `.github/workflows/deploy.yml` líneas 30-42 y 381-408]

⇒ **La app de alumnos es la QUINTA app**, no la cuarta. D-03 dice "cuarta app junto a api/app/admin" — el doc 08 debe corregir el conteo (y conviene actualizar `CLAUDE.md` en alguna fase, aunque no necesariamente en la 181).

### Costo exacto de sumar la app nueva al monorepo (D-05)

Cada punto verificado en `deploy.yml` / `ci.yml`:

1. Un filtro más en `dorny/paths-filter` (`deploy.yml:30-42`).
2. Un job de build más (`ci.yml` + `deploy.yml`).
3. Un secret de deploy más (`*_DEPLOY_PATH` — los cuatro actuales son secrets de GitHub).
4. Un paso de `rsync` más.
5. Un smoke test más (el patrón está: `Web smoke test` hace `curl` contra `https://eltemplo.org`).
6. **Un vhost nginx más en el EC2** — trabajo manual por SSH, que es un **gate humano** según el skill de change-control. Con subdominios por tenant, es un vhost **wildcard**, no uno por gimnasio.
7. ⚠️ **Trampa conocida:** el `paths-filter` usa `event.before`, así que un commit vacío o mal armado deploya un no-op de 11 s [CITED: memoria `reference_deploy_paths_filter_trap`].

### Los cuatro bloqueos técnicos de la superficie (verificados)

| #   | Bloqueo                                                                                                                                             | Evidencia                                                                                                                                                                                                          | Qué tiene que decidir el doc                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | **Login cross-tenant ambiguo**                                                                                                                      | `auth/routes.ts:620-672` + unique `(tenant_id,email)`                                                                                                                                                              | Resolución de tenant por hostname antes del login (ver H-3)                                                                                                                                                                                                                           |
| S-2 | **`DEFAULT_PUBLIC_TENANT_ID = 1`** para toda ruta sin `request.user`                                                                                | `modules.ts:78-86`                                                                                                                                                                                                 | El branding pre-login (D-06) obliga a resolver por Host. La deuda D-06 del código se salda acá                                                                                                                                                                                        |
| S-3 | **CORS es una allowlist estática de 5 orígenes** (`FRONTEND_URL`, `ADMIN_URL`, `https://eltemplo.org`, `capacitor://localhost`, `http://localhost`) | `src/app.ts:130-152`                                                                                                                                                                                               | Con N subdominios hace falta `origin` como **función** (regex sobre el dominio de plataforma), no un array. Y **ningún vhost de front proxea `/api`** ⇒ el llamado siempre es cross-origin y la URL del API se hornea en build [CITED: memoria `reference_admin_nginx_no_proxea_api`] |
| S-4 | **Certificado wildcard requiere DNS-01**                                                                                                            | Let's Encrypt: "DNS-01… you can use this challenge to issue certificates containing wildcard domain names"; HTTP-01 "cannot be used to issue wildcard certificates" [CITED: letsencrypt.org/docs/challenge-types/] | El aprovisionamiento automático del subdominio (recomendación de D-06) exige un certbot con plugin DNS del proveedor + credenciales de API de DNS en el servidor. **No es opcional**: sin DNS-01 cada gimnasio nuevo es un cert emitido a mano                                        |

### Branding en runtime (D-11/D-12) — mecanismo verificado

- **Colores:** Quasar expone las 8 marcas como **CSS custom properties `--q-<name>`** en el elemento raíz y provee `setCssVar(name, value, element?)` / `getCssVar(name)` para cambiarlas en runtime sin rebuild. Los nombres válidos son `primary, secondary, accent, dark, positive, negative, info, warning` [CITED: quasar.dev/style/color-palette].
- ⚠️ **Restricción que esto impone al diseño:** `el-templo-app` define su paleta como **variables SCSS de build-time** (`$primary`, `$cream`, `$bronze-light`… en `src/css/quasar.variables.scss`) [VERIFIED]. Las variables SCSS custom **no** son cambiables en runtime. **La app nueva tiene que definir todos sus tokens de marca como CSS custom properties, no como variables SCSS**, o el branding por tenant queda a medias (los 8 de Quasar cambiarían, los custom no). Es una regla de diseño concreta y fácil de violar por copiar `el-templo-app`.
- **Ícono y nombre en la app nativa:** en iOS, `setAlternateIconName` solo permite íconos **pre-declarados en el bundle** (`CFBundleAlternateIcons`); el nombre visible (`CFBundleDisplayName`) **no se puede cambiar en runtime** [CITED: developer.apple.com — API `setAlternateIconName(_:completionHandler:)`]. Confirma exactamente el límite que D-11 ya asumía.
- **Guideline 4.2.6 (texto vigente al 2026-08-27, verificado):** _"Apps created from a commercialized template or app generation service will be rejected unless they are submitted directly by the provider of the app's content. These services should not submit apps on behalf of their clients… Another acceptable option for template providers is to create **a single binary to host all client content in an aggregated or 'picker' model**"_ [CITED: developer.apple.com/app-store/review/guidelines/]. **La Opción A de D-11 es literalmente el modelo que Apple nombra como aceptable.** Y 4.3(a): _"Don't create multiple Bundle IDs of the same app"_ — confirma que la Opción C estaba bien descartada. El doc puede citar el texto en vez de razonarlo.
- **Detección de tenant en la app nativa (lo que D-11 pide especificar):** tres caminos, no excluyentes — (i) pantalla "picker" de gimnasio (es el modelo que Apple nombra, así que además es el más defendible en review); (ii) deep link / universal link desde el subdominio del gimnasio; (iii) recordar el último tenant en `Preferences`. ⚠️ Los deep links de iOS **hoy no están configurados** (Associated Domains pendiente) [CITED: memoria `reminder_ios_deeplinks_associated_domains`] ⇒ (ii) no está disponible sin trabajo previo. Recomendación: (i) + (iii) en v1.
- **PWA:** hoy `pwa: false` en `el-templo-app`. Para D-12(a) ("ícono y nombre propios vía Agregar a inicio") hace falta el modo PWA de Quasar **y un `manifest.json` distinto por subdominio** (nombre + íconos del tenant). Con un vhost wildcard, el manifest tiene que servirse dinámicamente por Host o generarse por tenant — **decisión concreta para el doc**, no un detalle.

### Consecuencia colateral que conviene registrar

`notifications` (push) está **dormido para tenants ≠ 1 hasta que exista la app de miembros multi-tenant** — dependencia estructural señalada por Nacho el 2026-07-02; mientras tanto el canal member-facing del SaaS es email [CITED: `.docs/saas-multitenancy/README.md:350-360`]. La app de esta fase **desbloquea** eso, aunque el push no esté en el alcance de v6.1.

---

## Standard Stack

Esta fase **no instala nada**. La tabla documenta el stack que el diseño PRESCRIBE para las fases ejecutoras, con las versiones ya presentes en el repo.

### Core (ya en el monorepo — se reusa, no se elige)

| Librería                             | Versión en repo | Propósito                             | Por qué es el estándar acá                                                                                                        |
| ------------------------------------ | --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `quasar`                             | ^2.16.0         | Framework UI de la app nueva          | Los dos frontends actuales lo usan; `setCssVar` da el branding en runtime que D-12 exige [VERIFIED: `el-templo-app/package.json`] |
| `@quasar/app-vite`                   | ^2.4.1          | Build/CLI                             | Idem                                                                                                                              |
| `vue`                                | ^3.5.22         | —                                     | Idem                                                                                                                              |
| `pinia`                              | ^3.0.4          | Stores (composition API, C-8)         | Idem                                                                                                                              |
| `@capacitor/core` + `@capacitor/cli` | ^8.0.1 / ^8.1.0 | Build nativa (D-03/D-11)              | Idem                                                                                                                              |
| `@capacitor/preferences`             | ^8.0.0          | Persistencia local del outbox offline | **Prior art directo**: `sessionPlayerStore` ya lo usa para el progreso de sesión                                                  |
| `axios`                              | ^1.13.5         | HTTP                                  | Idem `el-templo-app`                                                                                                              |
| `@sentry/vue`                        | ^10.38.0        | Errores (C-9)                         | Idem                                                                                                                              |
| `drizzle-orm` (mysql2)               | — (API)         | Schema y queries del módulo           | Regla del repo                                                                                                                    |

### Soporte (solo si la evidencia lo pide)

| Librería | Cuándo usarla                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `idb`    | Solo si el outbox supera lo que `Preferences` sostiene cómodamente (múltiples sesiones en cola, adjuntos). **No en v1.** |
| `dexie`  | Alternativa a `idb` con más azúcar. Misma condición: no en v1.                                                           |

### Alternativas consideradas

| En vez de                          | Se podría usar                                 | Tradeoff                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quasar+Capacitor para la app nueva | Nuxt (como `el-templo-web`)                    | Nuxt es SSG/SSR para contenido público; no tiene camino a tiendas. D-03 fija Capacitor.                                                                                                                                                                                    |
| `@capacitor/preferences`           | IndexedDB directo                              | Preferences ya está probado en el repo y cae a `localStorage` en web sin código extra. IndexedDB es más capaz y más código para un volumen de ~24 filas.                                                                                                                   |
| Tabla derivada de récords          | Cálculo on-the-fly con `MAX()` en cada lectura | On-the-fly nunca miente y ahorra una tabla; pero paga el agregado en cada pantalla de evolución y no deja dónde guardar `achieved_at` como hecho. Con el índice de la def. 6 sería viable — **es la alternativa honesta y el doc debería nombrarla antes de descartarla.** |

**Instalación:** ninguna en esta fase.

---

## Package Legitimacy Audit

La fase 181 **no instala paquetes** (produce un documento). Esta auditoría cubre los paquetes que el research **menciona como recomendación aguas abajo**, para que las fases 184+ no tengan que re-verificarlos.

Verificación ejecutada: `slopcheck install --ecosystem npm dexie idb @capacitor/preferences quasar` — **ecosistema npm forzado explícitamente**, porque la autodetección resolvió PyPI y marcó `dexie` como `[SLOP]` ("does not exist on pypi") — un falso positivo de ecosistema cruzado, exactamente la clase de confusión que el protocolo advierte.

| Paquete                  | Registro | Origen del nombre                                      | slopcheck (npm)                                          | Disposition                               |
| ------------------------ | -------- | ------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------- |
| `quasar`                 | npm      | Ya en `el-templo-app/package.json` y `el-templo-admin` | `[OK]`                                                   | Aprobado — ya instalado en el repo        |
| `@capacitor/preferences` | npm      | Ya en `el-templo-app/package.json`, en uso real        | `[OK]`                                                   | Aprobado — ya instalado en el repo        |
| `idb`                    | npm      | Sugerencia condicional del research (NO en v1)         | `[OK]`                                                   | Aprobado, pero **no recomendado para v1** |
| `dexie`                  | npm      | Sugerencia condicional del research (NO en v1)         | `[OK]` en npm — `[SLOP]` en PyPI (ecosistema equivocado) | Aprobado, pero **no recomendado para v1** |

**Paquetes eliminados por veredicto `[SLOP]`:** ninguno.
**Paquetes marcados sospechosos `[SUS]`:** ninguno.

⚠️ Nota de método para el planner: si alguna fase corre `slopcheck` en este repo sin `--ecosystem npm`, va a recibir falsos positivos. El repo tiene `package.json` en subdirectorios, no en la raíz de detección.

---

## Architecture Patterns

### Diagrama: dónde encaja el módulo Gimnasio en la plataforma actual

```
                        ┌─────────────────── SUPERFICIES ───────────────────┐
   gimnasioX.<plat>.com │  App ALUMNOS (NUEVA, 5ª app)                      │
   (D-06, subdominio)   │  Quasar+Vue+Capacitor · web PWA + build nativa    │
                        │  branding runtime: setCssVar + tenant_settings    │
   tiendas (1 binario,  └───────────────┬───────────────────────────────────┘
    picker · D-11/4.2.6)                │  cross-origin (ningún vhost proxea /api)
                                        │
   admin.<dominio>      ┌───────────────┴────────┐
                        │ el-templo-admin (STAFF)│  secciones Gimnasio gateadas
                        │ ya multi-tenant v6.0   │  por enabledModules de /auth/me
                        └───────────────┬────────┘
                                        │
   app.eltemplo.org     ┌───────────────┴────────┐
                        │ el-templo-app (tenant 1)│  NO SE TRANSFORMA (D-04)
                        └───────────────┬────────┘
                                        ▼
 ══════════════════════════════ el-templo-api (Fastify) ══════════════════════════════
   ① resolución de tenant           ② gate de módulo           ③ scope de datos
   ┌──────────────────────────┐  ┌──────────────────────┐  ┌─────────────────────────┐
   │ NUEVO: Host → slug       │  │ requireModule(...)   │  │ assertTenant(scope)      │
   │  (pre-login, D-06 / H-3) │→ │  flag OFF ⇒ 404      │→ │ tenantWhere/tenantValues │
   │ attachScope: users.      │  │ (module-registry.ts) │  │ (tenant.ts, firma        │
   │  tenant_id + status      │  │ fail-closed          │  │  lockeada doc 03 §3)     │
   └──────────────────────────┘  └──────────────────────┘  └─────────────────────────┘
            │                              │                          │
            └──────── el tenant NUNCA viaja en el JWT ni en el payload ┘
                                        ▼
 ═══════════════════════════════ MySQL (una sola base) ═══════════════════════════════
   MÓDULO TEMPLO (SPOM)          │  CORE (compartido)      │  MÓDULO GIMNASIO (NUEVO)
   exercises, sessions,          │  users, branches,       │  catálogo global+local,
   spom_*, aura_*, ...           │  tenants, subscriptions │  plantillas, rutinas
   ── frontera A1: cero imports ─┼── acople permitido: ────┼── asignadas, sesiones,
      en NINGUNA dirección       │   FK a users/branches/  │   set_logs, records
   `exercises` INTACTA (A2)      │   tenants + LEER subs   │
                                 │   (active-member.ts)    │
 ══════════════════════════════════════════════════════════════════════════════════════
   GATES DE CI que el diseño debe satisfacer:
   · tenant-tables.ts (91 gym-owned + 4 exentas)   → toda tabla nueva se clasifica o CI rojo
   · tenant-manifest.ts (389 entradas, 3 categorías) → toda ruta nueva se clasifica o CI rojo
   · sentinel de pool mysql2 (por QUERY) + lint-tenant (por TABLA) + baterías ISO-01/03
```

### Estructura de proyecto recomendada para la app nueva

Espeja `el-templo-app`, que ya organiza por feature-module (`src/modules/training/`, `src/modules/bar-challenge/`) [VERIFIED: `ls el-templo-app/src`]:

```
el-templo-<nombre>/            # nombre a proponer en el doc (discreción de Claude)
├── quasar.config.js           # modos: spa + pwa(true, a diferencia de el-templo-app) + capacitor
├── src-capacitor/             # appId/appName de PLATAFORMA, no de un tenant (D-11)
└── src/
    ├── boot/                  # sentry.ts PRIMERO (C-9), axios.ts, tenant.ts (branding runtime)
    ├── css/                   # tokens como CSS custom properties, NO variables SCSS (D-12)
    ├── stores/                # Pinia composition API (C-8)
    ├── composables/           # con cleanup(), sin onUnmounted adentro (C-8)
    ├── modules/
    │   ├── rutina/            # rutina activa, historial de rutinas
    │   ├── sesion/            # ejecución + registro + outbox offline (el corazón)
    │   └── evolucion/         # récord, vez anterior, sesiones del mes
    └── utils/logger.ts        # createLogger() — nunca console.* (C-1)
```

### Pattern 1 — Registro de un módulo con su guard

```ts
// Fuente: el-templo-api/src/app.ts + src/modules/shared/module-registry.ts (fase 176)
// moduleScope crea su PROPIO scope encapsulado y appendea requireModule al
// array onRequest de cada ruta registrada adentro. NUNCA un addHook dentro de
// un fp(...) — la encapsulación desactivada derramaría el 404 a toda la API.
moduleScope(app, "gimnasio", gimnasioRoutes, { prefix: "/api/gimnasio" });
```

### Pattern 2 — Toda lectura/escritura de una tabla del módulo

```ts
// Fuente: el-templo-api/src/modules/shared/tenant.ts (firma lockeada, doc 03 §3)
const ctx = assertTenant(request.scope, "gimnasio.listSetLogs"); // 403 fail-closed si null
const rows = await db
  .select()
  .from(schema.gymSetLogs)
  .where(and(tenantWhere(schema.gymSetLogs, ctx), eq(schema.gymSetLogs.userId, userId)));

await db.insert(schema.gymSetLogs).values(tenantValues(ctx, { ... }));
// tenantValues pone tenantId DESPUÉS del spread ⇒ pisa cualquier tenantId del body
// (mitigación de mass-assignment a nivel de tipo y de runtime).
```

⚠️ **Y acá está el problema de H-1:** `tenantWhere` es un `eq` estricto. Para el catálogo global+local hace falta un helper hermano que el doc tiene que nombrar (p. ej. `tenantOrGlobalWhere`), con su motivo escrito, o el catálogo global es invisible para todos los gimnasios.

### Pattern 3 — Branding por tenant en runtime

```ts
// Fuente: https://quasar.dev/style/color-palette (docs oficiales, verificado 2026-08-27)
import { setCssVar } from "quasar";
setCssVar("primary", brand.primaryColor); // escribe --q-primary en :root
setCssVar("secondary", brand.secondaryColor);
// Nombres válidos: primary, secondary, accent, dark, positive, negative, info, warning
// Los tokens propios del diseño (fondos, sombras) deben ser CSS custom properties
// para poder recibir el mismo tratamiento — como variables SCSS NO son cambiables.
```

### Pattern 4 — Persistencia local de la sesión en curso (prior art del repo)

```ts
// Fuente: el-templo-app/src/modules/training/stores/sessionPlayerStore.ts
import { Preferences } from "@capacitor/preferences";
await Preferences.set({
  key: storageKey(dayId),
  value: JSON.stringify(progress),
});
const { value } = await Preferences.get({ key: storageKey(dayId) });
await Preferences.remove({ key: storageKey(dayId) }); // al sincronizar OK

// Rama nativo/web ya resuelta en src/composables/useTokenStorage.ts:
// Capacitor.isNativePlatform() ? Preferences : localStorage
```

### Anti-patrones a evitar

- **Recalcular récords en un `event` del registry de hooks.** Los events son best-effort y aislados por diseño (doc 04 §4.1) — un récord perdido no rompería nada y nadie se enteraría. Va en la transacción.
- **Definir los tokens de marca de la app nueva como variables SCSS** copiando `quasar.variables.scss` de `el-templo-app`. Build-time ⇒ branding por tenant imposible (D-12).
- **Resolver un tenant no resoluble con `?? 1` o con un non-null assertion.** Prohibido en todo el repo, para siempre (`tenant.ts:40-47`). La única excepción documentada es `DEFAULT_PUBLIC_TENANT_ID` en superficie pública — y H-3 dice que esa excepción caduca con el tenant 2.
- **Referenciar el ejercicio planificado en el registro.** El guardrail dice: se guarda el realizado.
- **Un flag por carpeta.** Doc 04 §2.1: módulos comerciales gruesos. El módulo Gimnasio es UNO.
- **`;` dentro de comentarios `--` en las migraciones.** Rompió todo el CI una vez (migración 0119).

---

## Don't Hand-Roll

| Problema                              | No construir                                                  | Usar en su lugar                                                                | Por qué                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Filtrar datos por gimnasio            | Un `where tenant_id = ...` a mano en cada query               | `tenantWhere` / `tenantValues` / `assertTenant`                                 | Firma lockeada por el doc 03 §3; el sentinel y el lint verifican que se usen. Un filtro a mano pasa el typecheck y falla la batería ISO |
| Gate del módulo                       | Un `if (settings.gimnasio)` en cada handler                   | `moduleScope(...)` + `requireModule`                                            | Responde 404 (no 403) para no revelar el feature; el gate ISO-01 exige que TODA ruta del módulo lo tenga                                |
| Leer un flag de `tenant_settings`     | Query + parseo propios                                        | `enabledModulesFor` / `isModuleEnabled` (+ el helper análogo para `gimnasio.*`) | Cache con TTL, fail-closed, invalidación exportada, y TTL=0 en test para no arrastrar estado entre archivos                             |
| Saber si un socio está activo         | Un `SELECT` propio sobre `subscriptions`                      | `activeMemberExists` y familia (`shared/active-member.ts`)                      | 5 variantes ya escritas (paga / no-especial / por kind). Es exactamente el "leer `subscriptions`" que A1 permite                        |
| Barrer todos los gimnasios en un cron | Un `for` sobre `SELECT * FROM tenants`                        | `forEachActiveTenant`                                                           | Compara positivamente contra `'active'` (un estado nuevo queda denegado por default) y aísla errores por iteración                      |
| Colores por tenant                    | Regenerar CSS por gimnasio o servir hojas de estilo distintas | `setCssVar` sobre `--q-*`                                                       | Es API oficial de Quasar, sin rebuild ni fork                                                                                           |
| Storage local con rama nativo/web     | Un wrapper nuevo                                              | El patrón de `useTokenStorage.ts`                                               | Ya resuelto y probado en producción                                                                                                     |
| Deduplicar el sync offline            | Comparar por timestamp o por contenido                        | Unique `(tenant_id, client_set_uid)` + upsert                                   | La única forma barata de que reintentos y doble-tap sean no-eventos                                                                     |
| Numerar una migración                 | Confiar en `drizzle-kit generate`                             | Hand-written, `ls migrations \| tail`, empezando en **0216**                    | El journal de drizzle-kit está stale y `drizzle-kit migrate` está prohibido                                                             |

**Key insight:** en este repo, el 80% del "trabajo de plataforma" del módulo Gimnasio **ya existe y es fail-closed**. El riesgo real del diseño no es olvidarse de construir algo — es **diseñar algo que la maquinaria existente no puede expresar** (H-1 y H-2 son exactamente eso). Por eso el doc 08 tiene que hablar en el vocabulario de `tenant-tables.ts` y `tenant-manifest.ts`, no en un vocabulario propio.

---

## Common Pitfalls

### Pitfall 1 — Diseñar el catálogo global sin decidir su clasificación de tenancy

**Qué sale mal:** la fase 184 crea la tabla, el test `tenant-tables.test.ts` la nombra como "sin clasificar", y el equipo improvisa una clasificación bajo presión de CI rojo — probablemente `gym-owned`, que hace el catálogo global invisible.
**Por qué pasa:** el brief habla de "alcance global/local" en lenguaje de producto; el repo habla de "gym-owned vs exenta" en lenguaje de enforcement. Nadie traduce.
**Cómo evitarlo:** H-1 resuelto explícitamente en el doc 08, con el nombre de la categoría y del helper.
**Señal temprana:** un plan de la 184 que crea una tabla y no menciona `tenant-tables.ts`.

### Pitfall 2 — Agregar `"gimnasio"` a `MODULE_NAMES` y clasificar sus rutas como `templo-module`

**Qué sale mal:** el archivo que el repo usa como fuente de verdad de aislamiento afirma que un feature para OTROS gimnasios es "exclusivo de El Templo". El error es semántico, no funcional, así que ningún test lo atrapa — y se fosiliza a lo largo de ~300 rutas.
**Cómo evitarlo:** H-2 decidido en el doc 08 (renombrar la categoría o documentar el nombre histórico).
**Señal temprana:** la primera entrada del manifiesto con `modulo: "gimnasio"` bajo `categoria: "templo-module"`.

### Pitfall 3 — Asumir que el login "ya funciona" para el tenant 2

**Qué sale mal:** en el onboarding real (ONB-01) un socio que existe en dos gimnasios entra al gimnasio equivocado. Es un incidente de aislamiento en producción, con datos reales de un cliente que paga.
**Por qué pasa:** con un solo tenant el bug es literalmente invisible; la exención `tenant-safe` está escrita y justificada, lo que hace fácil leerla como "resuelto".
**Cómo evitarlo:** H-3 en el doc 08 y, en el plan, una fase que lo arregle **antes** de la 192.
**Señal temprana:** cualquier plan que trate el login de la app nueva como "igual al de `el-templo-app`".

### Pitfall 4 — Prometer offline sobre Safari en pestaña

**Qué sale mal:** un alumno usa el subdominio en Safari sin instalar, entrena una semana, y el storage se borra por ITP. Se pierden sesiones reales.
**Por qué pasa:** la exención es solo para web apps de la pantalla de inicio [CITED: WebKit].
**Cómo evitarlo:** el doc especifica que la superficie web muestra el prompt de "Agregar a inicio" y que, mientras no esté instalada, el registro **exige red** (o avisa que puede perderse).
**Señal temprana:** una pantalla de sesión que funciona igual instalada y no instalada.

### Pitfall 5 — Récord recalculado fuera de la transacción

**Qué sale mal:** el alumno cierra la sesión, ve "récord: 80 kg", refresca y ve 75 kg. Es el escenario textual que el brief prohíbe.
**Cómo evitarlo:** misma transacción, recálculo completo del par (usuario, ejercicio) en edición/baja, bloqueo de fila para la concurrencia sync-vs-profe.
**Señal temprana:** un plan que menciona "job" o "cola" para récords.

### Pitfall 6 — Clonar `el-templo-app` como punto de partida de la app nueva

**Qué sale mal:** se hereda la paleta SCSS de build-time (mata D-12), `pwa: false` (mata D-12(a)), el `appId`/`appName` de El Templo (mata D-11), y — peor — se arrastran imports del SPOM, violando A1 en la primera semana.
**Cómo evitarlo:** app nueva desde el scaffold de Quasar, tomando de `el-templo-app` **patrones puntuales** (logger, token storage, boot de Sentry, session player), nunca el proyecto entero.
**Señal temprana:** un plan que diga "copiar `el-templo-app` y limpiar".

### Pitfall 7 — Dar por hecho que "un vhost más" es trabajo de CI

**Qué sale mal:** el deploy pasa verde y el subdominio no responde, o responde 405 porque el request de API cayó en el bloque de estáticos.
**Por qué pasa:** el vhost se toca por SSH (gate humano) y **ningún vhost de front proxea `/api`** [CITED: memoria].
**Cómo evitarlo:** el doc especifica el vhost wildcard, el cert DNS-01 y que la URL del API se hornea en build.

### Pitfall 8 — Números de docblock stale usados como fuente

**Qué sale mal:** un plan afirma "374 rutas" o "88 tablas gym-owned" y el gate dice otra cosa.
**El hecho:** el header de `tenant-manifest.ts` dice 374, pero `ENTRADAS_BASELINE = 389` [VERIFIED]. El docblock de `tenant-tables.ts` dice 88, pero la lista tiene **91** entradas [VERIFIED por conteo]. El propio archivo advierte: _"contá entradas del `Record`, no rutas conceptuales, o vas a 'corregir' un número que estaba bien"_.
**Cómo evitarlo:** contar sobre el código, nunca citar el docblock.

---

## State of the Art (contexto del repo, no del ecosistema)

| Antes                                               | Ahora                                                                                     | Cuándo cambió                            | Impacto en este diseño                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Instalación mono-tenant, `users.email` único global | Multi-tenant con 91 tablas gym-owned, unique `(tenant_id, email)`, enforcement en 5 capas | v6.0, fases 166-178 (shipped 2026-08-26) | El módulo nace **dentro** de este régimen; nada de lo anterior aplica       |
| Features de El Templo siempre encendidas            | 4 módulos con flag en `tenant_settings` + guard 404                                       | Fase 176 (2026-08-20)                    | El gate de todo el módulo Gimnasio ya existe: solo hay que declarar el flag |
| `system_settings` KV global con `'on'`/`'off'`      | `tenant_settings` KV por tenant con `"true"`/`"false"` para módulos; coexistencia gradual | v6.0                                     | **No mezclar los vocabularios** (orden explícita del docblock)              |
| Login/dominios: decisión DIFERIDA desde 2026-07-01  | D-06 (subdominio por gimnasio) la cierra de hecho                                         | Esta fase                                | El doc debería registrar el cierre de esa diferida (H-3)                    |
| "Monorepo with 3 apps" (CLAUDE.md)                  | Cuatro apps reales; la de alumnos será la quinta                                          | `el-templo-web` (Nuxt) ya en deploy      | Corregir el conteo en el doc                                                |
| App de miembros = trigger del split de repos        | D-05: no se adelanta                                                                      | Esta fase                                | Contradicción a reconciliar (H-4)                                           |

**Deprecado / no usar:**

- `drizzle-kit migrate` y su `meta/_journal.json` — la fuente de verdad es la tabla `_migrations`.
- `pnpm db:push` en trabajo commiteado.
- `attachCountryScope` como nombre — es alias de `attachScope` [VERIFIED: `country-scope.ts:288`].

---

## Assumptions Log

| #   | Claim                                                                                                                                | Sección          | Riesgo si está mal                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | La estimación de volumen (≈5.000 filas/año/alumno; 2,5 M/año para 500 alumnos) es aritmética sobre supuestos de uso, no una medición | Definición 6     | Si el uso real es 3× más alto, el umbral de particionado llega antes. No cambia el diseño del índice                                                                        |
| A2  | `@capacitor/preferences` sostiene cómodamente un outbox de ~24-100 filas por sesión                                                  | Definición 3     | Si no, la migración a `idb` es acotada (mismo contrato de store). Riesgo bajo                                                                                               |
| A3  | El manifest PWA por subdominio es viable sirviéndolo dinámicamente por Host desde nginx o el server                                  | DIS-02 / D-12(a) | Si no, D-12(a) (ícono+nombre propios vía "Agregar a inicio") se cae y hay que re-decidir la vía de marca propia en v1. **Verificar antes de comprometer D-12(a) en el doc** |
| A4  | Renombrar `templo-module` → `feature-module` es mecánico (141 entradas + tipo + gate) y no rompe nada más                            | H-2              | Si toca más superficie de la esperada, la opción B2 (dejarlo) es el fallback                                                                                                |
| A5  | Un tenant "plataforma" con `status != 'active'` no rompería otros invariantes (opción C de H-1)                                      | H-1              | Solo importa si se elige C; la recomendación es A                                                                                                                           |
| A6  | La lista de 8 keys de `tenant_settings` cubre TODOS los parámetros que el brief declara configurables                                | Definición 7     | Un parámetro olvidado se hardcodea y viola la regla dura 5 del ROADMAP. Mitigación: releer §4.2, §5.2, §5.4, §8 del brief al escribir el doc                                |
| A7  | El default de "Fácil repetido" (PROF-02) es 3, espejando el de "Difícil"                                                             | Definición 7     | El brief no da default para "Fácil". Es una elección del research, no del brief — el doc debería marcarla como propia                                                       |
| A8  | Los deep links de iOS siguen sin Associated Domains configurados                                                                     | DIS-02 / D-11    | Sale de una memoria (`reminder_ios_deeplinks_associated_domains`), no de una verificación en el repo. Si ya se configuró, la vía (ii) de detección de tenant se abre        |
| A9  | La resolución de tenant por Host se implementa como capa **anterior** a `attachScope`, sin tocar el contrato de `CountryScope`       | H-3 / DIS-02     | Si `CountryScope` tiene que cambiar de forma, el costo sube y toca 22 call sites de `country-scope.ts`                                                                      |
| A10 | El texto de las guidelines de Apple citado es el vigente a 2026-08-27                                                                | D-11             | Apple las revisa varias veces por año. D-11 ya pide verificar el texto al formalizar — este research lo hizo hoy; si el doc se escribe semanas después, re-verificar        |

---

## Open Questions (RESOLVED)

> Las 6 preguntas quedaron asignadas a una tarea concreta de los PLAN.md (verificado por el plan-checker 2026-08-27). Ninguna queda sin dueño.

1. **¿Qué categoría de manifiesto usan las rutas del módulo Gimnasio?**
   - RESOLVED: plan 181-01 (precondición H-2, opción B1) — el doc 08 la fija.
   - Lo que sabemos: hay tres categorías y el archivo declara que la cuarta es una decisión de diseño; `modulo` está tipado contra `MODULE_NAMES`.
   - Lo que falta: la decisión.
   - Recomendación: resolverlo en el doc 08 (H-2, opción B1).

2. **¿Cuál es el dominio de plataforma?**
   - Lo que sabemos: D-06 lo escribe como `gimnasioX.<plataforma>.com`; `eltemplo.org` es del tenant 1 y no sirve (sería branding de El Templo para todos los gimnasios). `RESERVED_TENANT_SLUGS` ya existe en el schema para este escenario.
   - Lo que falta: el dominio no está elegido ni registrado, y de él dependen el cert wildcard, el DNS-01 y el CORS.
   - Recomendación: el doc lo trata como **precondición del wizard (PLAT-02/03)**, no como detalle de la 181. Pero debe nombrarlo, porque bloquea la fase 182.
   - RESOLVED: plan 181-05 (f) — el doc lo nombra como precondición de la 182 (wildcard cert DNS-01, CORS).

3. **¿El nombre de la app de alumnos?**
   - Discreción explícita del CONTEXT ("proponer en el doc"). Restricción dura de D-11: el nombre en la tienda es de **plataforma**, no de un gimnasio, y en iOS no se cambia en runtime. Así que el nombre tiene que ser neutro y sostener el modelo "picker" de 4.2.6.
   - RESOLVED: plan 181-05 (e) — el doc propone el nombre bajo esas restricciones.

4. **¿La superficie staff del módulo Gimnasio vive dentro de `el-templo-admin` como páginas nuevas, o como un área separada?**
   - Lo que sabemos: `el-templo-admin/src/pages` es plano (~30 páginas, sin subcarpetas salvo `tv/`). `/auth/me` ya devuelve `enabledModules` pero **ningún frontend lo consume todavía** [VERIFIED].
   - Recomendación: el doc decide la convención (subcarpeta `pages/gimnasio/`) y deja escrito que gatear el nav por `enabledModules` es trabajo nuevo, no algo que exista.
   - RESOLVED: plan 181-05 (a) — convención `pages/gimnasio/` fijada en el doc.

5. **¿El rol super-owner (PLAT-01) es un valor más del enum o un modelo aparte?**
   - Lo que sabemos: `roleEnum` tiene 6 valores (`member, coach, admin, owner, gestion, recepcion`), **ninguno de plataforma**; y `users.tenant_id` es `NOT NULL DEFAULT 1` con `assertTenant` que **deniega** un tenant nulo [VERIFIED]. O sea: hoy un usuario **no puede** existir por encima de los tenants.
   - Es la fase 182, pero el criterio de éxito 4 de la 181 pide que las fases siguientes no re-litiguen el diseño. **Recomendación: el doc 08 fija el modelo del rol de plataforma** (¿usuario del tenant 1 con rol especial? ¿tabla `platform_users` aparte? ¿tenant reservado?), aunque la implementación sea de la 182.
   - RESOLVED: plan 181-06 Task 1 — el doc fija el modelo del rol de plataforma.

6. **¿El outbox offline sincroniza al servidor una sesión que ya fue marcada `abandonada`?**
   - Recomendación en la definición 3 (se aceptan las series, la sesión no vuelve a `completada`), pero es una regla de producto: conviene que la firme Franco junto con el doc.
   - RESOLVED: plan 181-03 (Definición 3, punto g) + firma de Franco en el checkpoint del plan 181-06.

---

## Environment Availability

| Dependencia                                        | Requerida por                              | Disponible                                                      | Versión                  | Fallback                                                                                                 |
| -------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Repo `.docs/saas-multitenancy/` con la serie 01-07 | El entregable (D-07 sigue esa serie)       | ✓                                                               | 7 docs + README + brief  | —                                                                                                        |
| Prettier vía Husky/lint-staged sobre `**/*.md`     | Formateo del doc 08 (C-6)                  | ✓                                                               | prettier ^3.3.3          | —                                                                                                        |
| `slopcheck`                                        | Auditoría de paquetes                      | ✓                                                               | `~/.local/bin/slopcheck` | —                                                                                                        |
| Context7 (MCP o `ctx7` CLI)                        | Docs de librerías                          | ✗                                                               | —                        | **Usado:** WebFetch contra docs oficiales (quasar.dev, developer.apple.com, letsencrypt.org, webkit.org) |
| Brave / Exa / Firecrawl                            | Búsqueda mejorada                          | ✗ (`brave_search:false`, `exa_search:false`, `firecrawl:false`) | —                        | WebFetch/WebSearch nativos                                                                               |
| MySQL local + `pnpm test`                          | Nada de esta fase (no hay código)          | n/a                                                             | —                        | —                                                                                                        |
| Acceso SSH al EC2                                  | Nada de esta fase (el vhost es de la 182+) | gate humano                                                     | —                        | —                                                                                                        |

**Dependencias faltantes sin fallback:** ninguna para esta fase.
**Dependencias faltantes con fallback:** Context7 (cubierto con WebFetch a fuentes oficiales, que para Quasar/Apple/WebKit/LetsEncrypt es equivalente o mejor).

---

## Validation Architecture

> `workflow.nyquist_validation` no está en `.planning/config.json` ⇒ se trata como habilitado. **Advertencia honesta:** esta fase entrega un documento Markdown; no hay comportamiento ejecutable que testear. Lo de abajo son verificaciones **deterministas y automatizables sobre el artefacto**, no tests de software. No inventar tests de unidad para un `.md`.

### Test Framework

| Propiedad          | Valor                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Framework          | Ninguno aplica al entregable. (El repo usa **vitest** en `el-templo-api`, `el-templo-app`, `el-templo-admin`)         |
| Config file        | `el-templo-api/vitest.config.ts` (irrelevante para esta fase)                                                         |
| Quick run command  | `pnpm exec prettier --check .planning/../.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`                        |
| Full suite command | n/a — esta fase no toca código; la suite completa (`cd el-templo-api && pnpm test`) no puede regresionar por un `.md` |

### Phase Requirements → Verification Map

| Req ID     | Comportamiento verificable                                      | Tipo                                    | Comando automatizado                                                                           | ¿Existe?                                                         |
| ---------- | --------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| DIS-01     | El doc tiene una sección por cada una de las 7 definiciones     | grep estructural                        | `grep -c '^## Definición' .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` → 7            | ❌ crear en el plan                                              |
| DIS-01     | Cada definición traza a al menos un REQ-ID                      | grep estructural                        | `grep -oE '\b(CAT\|RUT\|REG\|VAL\|EVO\|PROF\|PLAT\|ONB)-[0-9]{2}\b' <doc> \| sort -u \| wc -l` | ❌ crear en el plan                                              |
| DIS-02     | Existe constancia literal de "`el-templo-app` no se transforma" | grep literal                            | `grep -q 'el-templo-app' <doc> && grep -qi 'no se transforma' <doc>`                           | ❌ crear en el plan                                              |
| DIS-02     | Existe constancia explícita sobre el split de repos (H-4)       | grep literal                            | `grep -qi 'split' <doc>`                                                                       | ❌ crear en el plan                                              |
| Criterio 3 | Cero imports SPOM: el doc lo afirma y nombra las tablas nuevas  | revisión humana (no hay código todavía) | —                                                                                              | manual-only, justificado: no hay código que grepear en esta fase |
| Todos      | El doc está formateado                                          | prettier                                | `pnpm exec prettier --check <doc>`                                                             | ✅ existe (pre-commit)                                           |
| Todos      | Franco firma (D-09)                                             | `checkpoint:human-verify`               | —                                                                                              | manual-only por decisión del CONTEXT                             |

### Sampling Rate

- **Por commit de tarea:** `pnpm exec prettier --check` sobre el doc (es lo que el pre-commit ya hace).
- **Por merge de wave:** los greps estructurales de la tabla de arriba, como un script chico.
- **Gate de fase:** checkpoint humano — **OK de Franco** (D-09). Es el gate real de esta fase.

### Wave 0 Gaps

- [ ] Script de verificación estructural del doc (los 4 greps de arriba en un `.sh` o en el `verification` del plan) — cubre DIS-01/DIS-02.
- [ ] Nada más. **No** instalar framework de tests: no hay código.

_Si el planner prefiere no crear el script, los greps pueden ir literalmente como `verification` de la tarea que escribe el doc. Es igual de determinista y no agrega un archivo._

---

## Security Domain

`security_enforcement` no está declarado en `.planning/config.json` ⇒ se trata como habilitado.

### Categorías ASVS aplicables al diseño que esta fase produce

| ASVS                        | ¿Aplica?                | Control estándar en este repo                                                                                                                                                                           |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication           | **sí**                  | JWT + `refresh_tokens` + `fastify.authenticate`. ⚠️ H-3: el login cross-tenant por email con `.limit(1)` es una **debilidad de autenticación real** en cuanto exista tenant 2 — el diseño debe cerrarla |
| V3 Session Management       | sí                      | Refresh tokens con `uq_refresh_tokens_token_hash`. ⚠️ Hay un problema conocido de replay de refresh (memoria `project_fix_refresh_reuse_scope`); la app nueva suma un cliente más al mismo mecanismo    |
| V4 Access Control           | **sí (el eje central)** | `attachScope` (capa 1) + `assertTenant`/`tenantWhere` (capa 2) + uniques compuestas + sentinel + lint + manifiesto + baterías ISO. El diseño debe caber ahí, no rodearlo                                |
| V5 Input Validation         | sí                      | Schemas de Fastify por ruta. Las taxonomías cerradas del §2.3 (CAT-06) son validación de entrada: lista cerrada, validada **en la carga**, no después                                                   |
| V6 Cryptography             | no directamente         | Passwords hasheados por el core; el módulo no maneja secretos propios. **Nunca hand-roll**                                                                                                              |
| V7 Error Handling & Logging | sí                      | Pino → Sentry. `audit_log` es tabla gym-owned existente: el log de ediciones de registros (REG-05) puede seguir ese patrón                                                                              |
| V13 API                     | sí                      | Toda ruta nueva entra al manifiesto fail-closed o CI rojo                                                                                                                                               |

### Patrones de amenaza para este stack

| Patrón                                                      | STRIDE                 | Mitigación estándar                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-tenant data leakage** (el riesgo #1 del milestone)  | Information Disclosure | `tenantWhere` como primer término de todo WHERE + sentinel por query + lint por tabla + batería ISO-03. El buscador del catálogo es superficie explícita: el guardrail dice que "un gimnasio nunca ve ejercicios locales de otro" **incluido el buscador**                   |
| **Mass assignment de `tenant_id`** desde el body            | Tampering / Elevation  | `tenantValues` pone `tenantId` después del spread; la columna no se expone en ningún schema de request                                                                                                                                                                       |
| **Tenant confusion en login** (H-3)                         | Spoofing               | Scoping del login por tenant resuelto del host                                                                                                                                                                                                                               |
| **Host header injection** (nuevo, lo introduce D-06)        | Spoofing               | Si el tenant se resuelve por `Host`, ese header **es entrada del atacante**. Mitigación: nginx fija `server_name`/`proxy_set_header Host` y la API valida el host contra `tenants.slug` con una lista, nunca con un parseo confiado. **Punto de diseño obligatorio del doc** |
| **Module enumeration**                                      | Information Disclosure | `requireModule` responde **404**, no 403 — un módulo apagado es indistinguible de una ruta inexistente                                                                                                                                                                       |
| **Privacidad profe→alumno** (§9 del brief)                  | Information Disclosure | Sin toggle de consentimiento por decisión de producto; el control es que el profe solo ve alumnos **de su gimnasio** — que es access control de tenant, ya cubierto por V4                                                                                                   |
| **Replay del sync offline**                                 | Tampering              | Unique `(tenant_id, client_set_uid)` + upsert idempotente. Un `client_set_uid` es entrada del cliente ⇒ validar formato y **jamás** derivar el tenant de él                                                                                                                  |
| **CORS wildcard demasiado laxo** (nuevo, lo introduce D-06) | Elevation              | La función de `origin` debe matchear el dominio de plataforma con un **anclaje estricto** (`^https://[a-z0-9-]+\.plataforma\.com$`), nunca un `endsWith` — `evil-plataforma.com` pasaría                                                                                     |

---

## Sources

### Primarias (HIGH confidence) — código y docs del propio repo, leídos en esta sesión

- `el-templo-api/src/db/schema/tenants.ts` — `tenants`, `tenant_settings`, `RESERVED_TENANT_SLUGS`
- `el-templo-api/src/db/schema/tenant-column.ts` — definición única de `tenant_id`
- `el-templo-api/src/db/schema/users.ts` — `roleEnum`, uniques `uq_users_tenant_*`
- `el-templo-api/src/db/schema/exercises.ts`, `subscriptions.ts`
- `el-templo-api/src/db/tenant-tables.ts` — `GYM_OWNED_TABLES` (91), `TENANT_EXEMPT_TABLES` (4), `TENANT_STRICT_MODULES`
- `el-templo-api/src/modules/shared/tenant.ts` — `tenantWhere`, `tenantValues`, `assertTenant`, `forEachActiveTenant`
- `el-templo-api/src/modules/shared/modules.ts`, `module-flags.ts`, `module-registry.ts`, `active-member.ts`
- `el-templo-api/src/modules/auth/routes.ts:620-672` — login cross-tenant (T-173-15)
- `el-templo-api/src/app.ts:130-152` — allowlist de CORS
- `el-templo-api/test/tenant-manifest.ts` — 3 categorías, 389 entradas; `test/tenancy/iso-01-manifiesto.test.ts:261`
- `el-templo-app/` — `package.json`, `quasar.config.js`, `src-capacitor/capacitor.config.ts`, `src/css/quasar.variables.scss`, `src/modules/training/stores/sessionPlayerStore.ts`, `src/composables/useTokenStorage.ts`
- `.github/workflows/deploy.yml` — paths-filter, 4 builds, 4 rsync, smoke tests
- `package.json` (raíz) — lint-staged con Prettier sobre `**/*.md`
- `.docs/saas-multitenancy/` — README (§5, diferidas, trigger de split), 02 §2, 04 (mecanismo de módulos), 05 §3 (club GLOBAL), 07 §1.4 (sede virtual), `brief-fran-modulo-gimnasio.md` (brief + addendum A1-A7)
- `.claude/skills/el-templo-db-migrations/SKILL.md`, `.claude/skills/el-templo-change-control/SKILL.md`
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `181-CONTEXT.md`, `181-DISCUSSION-LOG.md`

### Primarias (HIGH confidence) — documentación oficial externa

- https://quasar.dev/style/color-palette — `--q-<name>`, `setCssVar`/`getCssVar`, los 8 nombres válidos
- https://developer.apple.com/app-store/review/guidelines/ — texto vigente de 4.2.6 (incluye el modelo "single binary… aggregated or 'picker'") y 4.3(a)/(b)
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ — cap de 7 días al storage script-writable y la exención de las web apps de la pantalla de inicio
- https://letsencrypt.org/docs/challenge-types/ — DNS-01 requerido para wildcards; HTTP-01 no los emite
- https://developer.apple.com/documentation/uikit/uiapplication/setalternateiconname(_:completionhandler:) — íconos alternativos solo pre-declarados en el bundle

### Secundarias (MEDIUM confidence) — memorias del proyecto, cruzadas con el repo

- `reference_admin_nginx_no_proxea_api` — ningún vhost de front proxea `/api` (cruzado contra `deploy.yml` y el CORS de `app.ts`)
- `reference_deploy_paths_filter_trap` — `event.before` y los deploys no-op (cruzado contra `deploy.yml`)
- `reference_ci_no_typecheck_frontends` — CI no typechequea app ni admin
- `reminder_ios_deeplinks_associated_domains` — deep links de iOS pendientes (**no verificado en el repo en esta sesión**)

### Terciarias (LOW confidence)

- Ninguna. No se usó WebSearch sin verificación: todo lo externo salió de documentación oficial de primera mano.

---

## Metadata

**Desglose de confianza:**

- **Inventario del repo (tenancy, módulos, apps, deploy):** HIGH — leído archivo por archivo, con conteos hechos sobre el código y no sobre los docblocks (que están stale en dos casos y se reporta cuáles).
- **Hallazgos bloqueantes H-1..H-4:** HIGH en los hechos, MEDIUM-HIGH en las recomendaciones — los hechos son citas verificables; la elección entre opciones es juicio de diseño que el doc 08 debe firmar.
- **Definiciones 3/4/5/6/7 (discreción de Claude):** MEDIUM-HIGH — fundadas en prior art del repo + guardrails del brief + docs oficiales para las restricciones de plataforma. La estimación de volumen es aritmética sobre supuestos (A1).
- **Restricciones de plataforma (Apple, WebKit, Let's Encrypt, Quasar):** HIGH — documentación oficial de primera mano, citada con URL.
- **Superficie member-facing / costo de la 5ª app:** HIGH — verificado contra `deploy.yml` y los cuatro `package.json`.

**Research date:** 2026-08-27
**Valid until:** 2026-09-26 (30 días). Excepciones a re-verificar antes si el doc se escribe más tarde: el texto de las App Store Guidelines (A10) y los conteos de `ENTRADAS_BASELINE` / `GYM_OWNED_TABLES`, que se mueven con cada ruta o tabla que entra al repo.
