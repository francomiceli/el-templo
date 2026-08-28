# Fase 181 — Diseño del módulo Gimnasio (bloqueante)

> **Estado:** ✅ **Firmado por Franco (D-09) — 2026-08-27.** Fase 181 cerrada (sin gate de
> aprobación de Nacho; a Nacho le llega como información). Responde las 7 definiciones del brief de Nacho (2026-07-24 +
> addendum A1-A7) y decide la superficie member-facing multi-tenant (DIS-02). Evidencia:
> RESEARCH.md de la fase 181 (inventario de `tenant-tables.ts`, `tenant-manifest.ts`,
> `modules.ts`, `auth/routes.ts`, `deploy.yml`, más documentación oficial de Quasar, Apple,
> WebKit y Let's Encrypt).

## Resumen ejecutivo

El módulo Gimnasio es un módulo duro (A1): nace **dentro** de la maquinaria de tenancy que
dejó instalada el milestone v6.0, no al lado de ella. Antes de responder las 7 definiciones
del brief, este doc abre con una sección de **precondiciones de plataforma** que resuelve
cuatro hallazgos bloqueantes (H-1..H-4) — sin decisión escrita acá, cada una de las fases
182-192 vuelve a chocar por separado con lo mismo. Con esas cuatro decisiones firmadas, el
doc responde las 7 definiciones del brief y decide la superficie member-facing (DIS-02): dos
superficies, staff en `el-templo-admin` y alumnos en una app nueva del monorepo.

La forma de la solución, antes del detalle:

1. **Precondiciones de plataforma** — una tercera categoría de tabla (scope mixto), un
   rename de categoría en el manifiesto de rutas, una capa de resolución de tenant por
   hostname que además cierra el login cross-tenant, y una re-enunciación del trigger de
   split de repos.
2. **Modelo de datos** — Calistenia y Gimnasio no comparten esquema (D-01); exclusión mutua
   de módulos como invariante del diseño (D-02).
3. **Catálogo global+local** — una tabla con `tenant_id` NULLable; NULL es global.
4. **Ejecución y offline** — guardado local primero, sync posterior, resolución de
   conflictos determinista.
5. **Récords, superseries e índices** — cálculo transaccional server-side; índice de
   cobertura por alumno×ejercicio.
6. **Superficie member-facing** — staff en `el-templo-admin`; alumnos en una cuarta app del
   monorepo (Quasar+Vue+Capacitor), acceso por subdominio, publicación en tiendas como app
   container multi-tenant con branding en runtime.

## Precondiciones de plataforma (H-1..H-4)

Una **precondición de plataforma** es algo que el diseño tiene que resolver ANTES de que
arranque la fase 184, porque la maquinaria de tenancy que dejó instalada v6.0 no puede
expresarlo tal cual está hoy. No son opiniones: los cuatro hallazgos de abajo salen de leer
el código real del repo (`RESEARCH.md` de esta fase, sección "Hallazgos bloqueantes"). Sin
decisión escrita acá, cada una de las fases 182-192 vuelve a chocar con lo mismo por
separado — y en el caso de H-1/H-2 el CI queda directamente en rojo si la fase ejecutora
intenta inventar la clasificación por su cuenta.

### H-1 — El catálogo global+local no tiene forma de expresarse con los helpers de tenancy actuales

**El hecho verificado.** `tenantWhere(table, ctx)` es literalmente un `eq` estricto sobre
`tenantId` (`el-templo-api/src/modules/shared/tenant.ts:149-154`): no admite `NULL` ni un
segundo tenant. `tenantIdColumn()` produce `int NOT NULL DEFAULT 1 REFERENCES tenants.id`
(`el-templo-api/src/db/schema/tenant-column.ts:56-61`) — toda tabla gym-owned normal lleva
esa forma. Y `el-templo-api/src/db/tenant-tables.ts` clasifica **cada** tabla del schema en
exactamente dos baldes: `GYM_OWNED_TABLES` (**91 entradas contadas sobre el código actual** —
el docblock que antecede a la lista arrastra un número de tablas desactualizado, stale desde
antes de la fase 159) o `TENANT_EXEMPT_TABLES` (4: `tenants`, `tenant_settings`, `system_settings`,
`labs_inquiries`). El test `test/db/tenant-tables.test.ts` es fail-closed: una tabla sin
clasificar deja la suite en rojo, no pasa en silencio.

**El conflicto.** El §2.1 del brief pide un catálogo donde todos los gimnasios ven las filas
globales de la plataforma más las propias. Eso es `WHERE tenant_id IS NULL OR tenant_id = ?`,
que no es `tenantWhere` ni es "tabla exenta" — no existe hoy una tercera forma de
clasificación. Y el sentinel de pool mysql2 evalúa **por query** mientras el lint de tenancy
evalúa **por tabla**: una tabla de scope mixto dispara los dos controles a la vez si no se la
clasifica a propósito.

**Las opciones reales, con su costo:**

| Opción                                                   | Forma                                          | Promoción local→global (CAT-04)                                                                                                              | Costo en la maquinaria v6.0                                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Una tabla, `tenant_id` NULLable** (NULL = global)    | `gym_exercises` con `tenant_id INT NULL`        | `UPDATE ... SET tenant_id = NULL` — el `id` no cambia, cero registros históricos rotos. Cumple CAT-04 por construcción.                        | Necesita categoría nueva en `tenant-tables.ts` con motivo escrito, helper nuevo `tenantOrGlobalWhere()`, exención nominal del sentinel/lint. Rompe la invariante "toda tabla gym-owned lleva `NOT NULL DEFAULT 1`" — a propósito. |
| **B. Dos tablas** (global exenta + local gym-owned)       | `gym_exercises_global` + `gym_exercises_local`  | Copiar la fila a global y reescribir referencias, o dejar un puntero — riesgo directo contra CAT-04.                                           | Enforcement limpio (cada tabla cae en un balde existente), pero toda FK aguas abajo se vuelve **polimórfica** (`exercise_scope` + `exercise_id`), sin integridad referencial y con peor selectividad para el índice de la Def. 6. |
| **C. Tenant plataforma** (`tenant_id` = fila reservada)   | Una tabla gym-owned, `tenant_id = PLATFORM_ID` | `UPDATE ... SET tenant_id = PLATFORM` — id preservado, igual de limpio que A.                                                                  | Conserva `NOT NULL` + FK, pero el filtro deja de ser `tenantWhere` igual que en A, y agrega una fila en `tenants` que `forEachActiveTenant` barrería en los 7 crons si quedara `status='active'`.                                |

**Decisión que este doc firma: Opción A.** Es la única donde CAT-04 ("promover sin romper
historial") es un `UPDATE ... SET tenant_id = NULL` — un no-evento, no una migración de
datos riesgosa. El "club GLOBAL" del doc 05 §3 ya declara al catálogo genérico de ejercicios
como su **primer miembro confirmado**. Y con la Opción B la FK aguas abajo se vuelve
polimórfica, sin integridad referencial y con peor selectividad exactamente en el índice
crítico que pide la Definición 6.

La decisión nombra los artefactos concretos que las fases ejecutoras tienen que crear, porque
no pueden inventarlos por su cuenta sin re-litigar A1/A2:

- Una **tercera categoría** en `el-templo-api/src/db/tenant-tables.ts` llamada
  `TENANT_MIXED_SCOPE_TABLES`, con el motivo escrito al lado de cada entrada — el precedente
  formal es `TENANT_GLOBAL_UNIQUES`, cuyo docblock exige exactamente eso (el motivo es
  obligatorio por entrada, nunca una allowlist muda).
- Un **helper hermano** `tenantOrGlobalWhere(table, ctx)` en
  `el-templo-api/src/modules/shared/tenant.ts`, que produce
  `tenant_id IS NULL OR tenant_id = ?` y es el único filtro admitido para LEER esas tablas.
  Las ESCRITURAS siguen usando `tenantValues` sin cambios — nadie escribe una fila global
  desde una ruta de tenant; promover a global es una operación de plataforma aparte.
- Una **exención nominal**, con motivo, para esas tablas en el sentinel de pool y en el lint
  de tenancy — el mismo patrón de exención nominal que hoy usan `TENANT_GLOBAL_UNIQUES` y
  `TENANT_UNIQUE_ALLOWLIST`.
- Las dos entidades afectadas por esta decisión son `gym_exercises` (CAT-01, CAT-02) y las
  plantillas de rutina globales (RUT-01): **la decisión es una sola para las dos**, no se
  re-discute por separado en la fase 187.

**✅ CERRADA (doc 08, 2026-08-27)** — habilita CAT-01, CAT-02, CAT-04, RUT-01.

### H-2 — El manifiesto de rutas tiene tres categorías y declara que la cuarta es una decisión de diseño

**El hecho verificado.** `el-templo-api/test/tenant-manifest.ts` define
`const CATEGORIAS = ["tenant-scoped", "global", "templo-module"] as const;` con el comentario
literal: _"Las tres categorías posibles. No hay una cuarta, y agregarla es una decisión de
diseño."_ El campo `modulo` está tipado como `ModuloTemplo`, alias de `MODULE_NAMES` de
`el-templo-api/src/modules/shared/modules.ts`, hoy con exactamente 4 valores:
`templo-training`, `templo-gamification`, `templo-marketing`, `templo-onboarding`. El gate
`test/tenancy/iso-01-manifiesto.test.ts` corre con `ENTRADAS_BASELINE = 389` — el header de
ese mismo archivo arrastra en un comentario viejo un conteo de rutas desactualizado (stale);
el número real hay que contarlo sobre el `Record`, nunca sobre el docblock.

**El conflicto.** El ROADMAP fija el flag del módulo como `module.gimnasio.enabled`. Para que
`parseModuleFlagKey` lo reconozca, `"gimnasio"` tiene que entrar a `MODULE_NAMES` —
**una key de módulo con un nombre desconocido se ignora en silencio** (typo, módulo de otra
instalación) y el módulo quedaría OFF para siempre, sin error visible. Pero al entrar a
`MODULE_NAMES`, una ruta del módulo Gimnasio se clasificaría
`categoria: "templo-module", modulo: "gimnasio"` — semánticamente falso: el módulo Gimnasio
es lo contrario de un feature exclusivo de El Templo, es la razón de ser del multi-tenant.

**Decisión que este doc firma: Opción B1** — renombrar la categoría `templo-module` a
`feature-module` y el tipo `ModuloTemplo` a `ModuloFeature` en
`el-templo-api/test/tenant-manifest.ts`, y agregar `"gimnasio"` a `MODULE_NAMES` en
`el-templo-api/src/modules/shared/modules.ts` como **un solo módulo comercial grueso** (doc
04 §2.1: nunca un flag por carpeta). Es un rename mecánico sobre las entradas actuales del
manifiesto + el tipo + el gate — barato hoy, con `templo-module` usado en un puñado de rutas
existentes; carísimo si se pospone hasta que existan las ~300 rutas del módulo Gimnasio mal
clasificadas semánticamente. La opción **B2** (dejar `templo-module` como está y documentar
que el nombre es histórico) queda nombrada como fallback si el rename toca más superficie de
la esperada (asunción A4 del research) — pero no es la elegida.

La fase que ejecute el rename **mueve `ENTRADAS_BASELINE`**: ese número se cuenta sobre el
`Record` real del manifiesto en el momento del rename, nunca sobre un comentario o un
conteo anterior copiado a mano.

**✅ CERRADA (doc 08, 2026-08-27)** — habilita DIS-01, PLAT-03.

### H-3 — El login es cross-tenant por email y toda superficie pública resuelve al tenant 1

**Los hechos, los dos verificados en el código.** (1) `POST /api/auth/login`
(`el-templo-api/src/modules/auth/routes.ts`) busca el usuario **sin selector de gimnasio**,
cross-tenant, con `.limit(1)`, y recién DESPUÉS deriva el `TenantContext` de la fila
encontrada (`user.tenantId`). Está marcado en el propio código como deuda pre-existente
**T-173-15**, con una exención `tenant-safe` embebida directamente en el SQL del `where`. El
chequeo de duplicado de `/register` lleva la misma exención. (2) `users.email` dejó de ser
único global en la fase 168: la unique real es **`uq_users_tenant_email (tenant_id, email)`**
(`el-templo-api/src/db/schema/users.ts`).

**La consecuencia, sin suavizarla.** En cuanto exista el tenant 2, dos personas de gimnasios
distintos con el mismo email son legales en la base — y el login le entrega la sesión a la
fila que MySQL devuelva primero de un `.limit(1)` sin `ORDER BY` determinista. No es
hipotético: es el escenario normal de un socio de El Templo que también entrena en el
gimnasio nuevo, o de un profe que trabaja en dos. Rompe ONB-01. Es un problema de
**autenticación**, no de UX.

El segundo hecho agrava el primero: **`DEFAULT_PUBLIC_TENANT_ID = 1`**
(`el-templo-api/src/modules/shared/modules.ts`) resuelve como tenant 1 toda ruta que corra
sin `request.user`. El propio comentario del código documenta que ese default deja de ser
válido "cuando exista más de un tenant con superficie pública propia" — que es exactamente lo
que D-06 (subdominio por gimnasio) crea.

**Decisión que este doc firma.** D-06 no es solo una URL bonita: es la solución de las dos
deudas a la vez.

- Una capa nueva de **resolución de tenant por hostname**, ANTERIOR a `attachScope`, que
  mapea el header `Host` al `slug` de `tenants`. `RESERVED_TENANT_SLUGS`
  (`el-templo-api/src/db/schema/tenants.ts`) ya existe en el schema para esto — su comentario
  dice literalmente que se reservaron "por si la decisión diferida de login/dominios termina
  en subdominios". Se implementa **sin cambiar la forma de `CountryScope`**: si el research
  posterior descubre que hace falta cambiarla, el costo sube y toca los call sites de
  `country-scope.ts` (asunción A9 del research, a re-evaluar en ese caso).
- El login de la app de alumnos pasa a ser **scoped por el tenant resuelto del host**: la
  query deja de ser cross-tenant y `.limit(1)` deja de ser ambiguo.
- El login de `el-templo-admin` y de `el-templo-app` en v1: **quedan como están, sobre el
  tenant 1, mientras su hostname no resuelva otro tenant** — y migran al mismo mecanismo de
  resolución por host cuando su hostname entre al esquema. Esta decisión queda escrita acá,
  no implícita, porque son las dos superficies que hoy sostienen la operación de El Templo.
- **Seguridad obligatoria, no opcional:** si el tenant se resuelve por `Host`, ese header es
  entrada del atacante. Mitigación prescripta: nginx fija `server_name` y
  `proxy_set_header Host` explícitos (no confía en lo que llega del cliente sin normalizar), y
  la API valida el host contra la lista de `tenants.slug` con **lookup exacto**, nunca con un
  parseo confiado ni con `endsWith`. Un host no resoluble se **rechaza** — jamás cae a `?? 1`
  ni a un non-null assertion (los dos están prohibidos en todo el repo, para siempre, por el
  mismo motivo que documenta `tenant.ts`).
- **Registro formal:** la decisión **DIFERIDA** del README de saas-multitenancy
  ("login / resolución de tenant / unicidad de email", abierta desde 2026-07-01) queda
  **CERRADA por este doc**. Queda anotado acá y es trabajo de la ola de cierre (181-06)
  actualizar el README para que dejen de coexistir dos fuentes de verdad.
- **Cuándo se ejecuta:** la resolución por host y el login scoped tienen que estar en
  producción **antes** de la fase 192 (ONB-01) — son precondición del wizard de la 182, que
  aprovisiona el subdominio en el alta.

**✅ CERRADA (doc 08, 2026-08-27)** — habilita ONB-01, PLAT-03, DIS-02.

### H-4 — El trigger del split de repos es, textualmente, la app que esta fase decide construir

**El hecho.** El README de saas-multitenancy define el trigger del split de repos como "el
nacimiento de la app de miembros multi-tenant, que ESTRENA el repo SaaS" (se funda con `api` +
`admin` white-label + la app nueva + contrato de tipos); `el-templo-app` + `el-templo-web`
quedan como repo del tenant 1. Y D-05 dice que **el split de repos NO se adelanta**. Por la
definición vigente del README, construir la app de alumnos de este mismo doc **ES** disparar
el trigger — la contradicción no se puede dejar implícita, porque el criterio de éxito 2 de la
fase exige constancia explícita sobre este punto.

**Constancia explícita (D-04):** `el-templo-app` **NO se transforma**. Sigue siendo la app
Templo-céntrica del tenant 1 (aura, niveles, SPOM, AGORA) sin gates de módulo Gimnasio ni
código de multi-tenancy nuevo; la superficie de alumnos multi-tenant vive enteramente en la
app nueva de D-03(b), no en una transformación de `el-templo-app`.

**Decisión que este doc firma: re-enunciar el trigger, no solo declararlo intacto.** De las
dos redacciones honestas posibles — (a) el trigger se cumplió y se decide deliberadamente NO
ejecutarlo en v6.1, re-armándolo sobre los triggers secundarios (identidad comercial / equipo
propio) y sobre el primer tenant que pague; o (b) el trigger se redefine: lo dispara la app
**en tiendas con tenants pagos**, no su existencia en el repo — este doc elige **(b)**, porque
es la única de las dos que deja el criterio verificable (una fecha de publicación en tienda
con al menos un tenant pago, no una fecha de merge). El texto normativo que reemplaza al del
README a partir de este doc es:

> El split de repos se dispara cuando la app de alumnos multi-tenant tiene **al menos un
> tenant pago publicado en las tiendas** (App Store / Play Store) — no cuando el código nace
> en el monorepo. Nacer en el monorepo (esta fase) es deliberado y NO adelanta el split: reusa
> CI, deploy y convenciones existentes, mismo EC2, un vhost más.

La app nueva nace en el monorepo (D-05); el split de repos sigue siendo un evento futuro,
condicionado al primer tenant pago en tienda. La decisión abierta **"contrato de tipos
API↔frontends"** (hoy los tipos se espejan a mano con comentarios
`// Mirrors el-templo-api/...`) **empeora con un quinto frontend** — este doc no la resuelve,
la nombra como consecuencia asumida que la ola de cierre (181-06) debe registrar en el
README junto con la actualización de H-4.

**✅ CERRADA (doc 08, 2026-08-27)** — habilita DIS-02.

### Checklist de precondiciones — qué debe existir antes de que arranque la fase 184

```
PRECONDICIONES DE PLATAFORMA — módulo Gimnasio

TENANCY (H-1)
[ ] Categoría `TENANT_MIXED_SCOPE_TABLES` creada en `el-templo-api/src/db/tenant-tables.ts`,
    con motivo escrito por entrada (fase 184)
[ ] Helper `tenantOrGlobalWhere(table, ctx)` creado en
    `el-templo-api/src/modules/shared/tenant.ts` (fase 184)
[ ] `gym_exercises` y las plantillas de rutina globales clasificadas en la categoría nueva,
    con `tenant_id` NULLable (fases 184/187)
[ ] Exención nominal, con motivo, en el sentinel de pool y en el lint de tenancy (fase 184)

MANIFIESTO DE RUTAS (H-2)
[ ] Categoría `templo-module` renombrada a `feature-module` en
    `el-templo-api/test/tenant-manifest.ts` (fase 184)
[ ] Tipo `ModuloTemplo` renombrado a `ModuloFeature` (fase 184)
[ ] `"gimnasio"` agregado a `MODULE_NAMES` en `el-templo-api/src/modules/shared/modules.ts`
    como módulo comercial único (fase 184)
[ ] `ENTRADAS_BASELINE` de `test/tenancy/iso-01-manifiesto.test.ts` actualizado al valor real
    del `Record` post-rename (fase 184)

RESOLUCIÓN DE TENANT Y LOGIN (H-3)
[ ] Capa de resolución de tenant por hostname implementada, anterior a `attachScope` (fase 182)
[ ] Login de la app de alumnos scoped por el tenant resuelto del host (fase 182)
[ ] Validación de `Host` contra `tenants.slug` con lookup exacto; host no resoluble rechazado,
    sin fallback a `?? 1` (fase 182)
[ ] README de saas-multitenancy actualizado: decisión diferida de login/dominios marcada
    CERRADA por este doc (fase 181-06)

TRIGGER DE SPLIT (H-4)
[ ] README de saas-multitenancy actualizado con el trigger re-enunciado (fase 181-06)
[ ] Este mismo doc mantiene el texto normativo del trigger sin contradicción con el README
```

## Definición 1 — ¿Calistenia y Gimnasio comparten modelo de datos?

**Respuesta, arriba de todo: no comparten modelo de datos.** Son dos módulos separados, con
tablas propias, y ni siquiera se unen en la capa de presentación — por D-02 un tenant nunca
tiene los dos módulos prendidos al mismo tiempo, así que no hay pantalla que necesite mezclar
las dos fuentes.

**Fundamento con evidencia del código, no opinión.** `exercises` del SPOM no es un catálogo:
es un árbol de progresión. Sus columnas son `pattern`, `route`, `progression_step`,
`dificultad_lineal`, `habilidad`, `canonical_exercise_id`, `milestone_exercise_id`, `effort` y
`level` (enum de niveles griegos: alfa, delta, sigma, omega, spartan) — ninguna de ellas tiene
sentido en un catálogo de musculación. A la inversa, ninguno de los 15 campos de la ficha del
§2.2 del brief (alias, grupo muscular secundario, equipamiento múltiple, tipo de carga,
ejecución paso a paso, errores frecuentes, variantes fácil/difícil, alternativas, alcance,
estado) existe en `exercises`. Sumado a esto un hecho estructural: `exercises` lleva
`tenant_id` y está clasificada en `GYM_OWNED_TABLES` — es literalmente "el árbol del SPOM del
gimnasio X" (hoy solo El Templo lo tiene poblado), no un catálogo de plataforma. El catálogo
global que pide el brief es estructuralmente otra cosa (cross-ref H-1 arriba).

**La diferencia de forma que Nacho pide entender.** En Calistenia la sesión la genera un
algoritmo a partir del árbol de progresión (nivel del alumno × ruta × patrón). En Gimnasio la
sesión sale de una plantilla que se clona y se completa con un registro de series cargado por
el alumno. Son dos ciclos de vida distintos — uno computa la sesión siguiente, el otro registra
lo que ya pasó — no dos vistas del mismo dato.

**El caso peso-corporal-con-lastre** (dominadas, fondos), que es donde Nacho dice que se va a
notar la decisión: fichas independientes en cada catálogo, sin puente de datos entre ambas. El
fundamento verificable es de vocabulario: `exercises.equipment` está tipado con el vocabulario
cerrado del SPOM (`barras`, `anillas`, `paralelas`, `cajon`, `ninguno`), y el catálogo nuevo del
módulo Gimnasio tendrá su propia lista cerrada de 25 equipamientos del §2.3 del brief — dos
vocabularios que nunca se cruzan porque describen dominios distintos. Es exactamente el "fichas
independientes sin puente de datos" del addendum A3: una dominada con lastre en Calistenia es
una fila de `exercises` con `equipment = 'ninguno'` (o el lastre resuelto por progresión); una
dominada con lastre en Gimnasio es una fila del catálogo nuevo con su propio registro de series
(peso corporal + lastre agregado). Nunca es la misma fila ni hay FK entre las dos.

**La respuesta a "¿el alumno ve un historial o dos?": uno, siempre.** Fundamento: exclusión
mutua de módulos como invariante del diseño (D-02) — un tenant tiene `templo-training` ON o
`gimnasio` ON, nunca los dos a la vez. Y esto ya está implementado de hecho en la maquinaria de
la fase 176: `enabledModulesFor` es fail-closed y el guard `requireModule` responde **404** (no
403) cuando el módulo está apagado, justamente para no revelar que el feature existe
(Information Disclosure, ver `module-registry.ts`). Un alumno de un gimnasio con el módulo
Gimnasio prendido y el módulo Templo apagado ve un solo sistema de entrenamiento, sin una línea
de código condicional extra que "junte" los dos historiales — porque el segundo historial no
existe para ese tenant.

**✅ CERRADA (CONTEXT 2026-08-27, D-01 / D-02)** — habilita CAT-01, CAT-02, REG-03, DIS-01.

## Definición 2 — Alcance global/local, ciclo de vida del catálogo y taxonomías

**La forma elegida**, citando la decisión ya firmada en H-1 sin volver a abrir la comparación
entre alternativas: una sola tabla `gym_exercises` con `tenant_id` NULLable, donde `NULL`
significa "fila global de la plataforma" y un valor significa "ejercicio propio de ese
gimnasio". Todas las lecturas del catálogo usan `tenantOrGlobalWhere`; todas las escrituras
desde rutas de tenant usan `tenantValues` sin cambios — nadie escribe una fila global desde una
ruta de gimnasio, promover a global es una operación de plataforma aparte (ver más abajo).
CAT-01 y CAT-02 quedan resueltos por la misma tabla: todos los gimnasios ven las filas con
`tenant_id IS NULL` más las propias, y cada gimnasio puede insertar sus propias filas con su
`tenant_id`.

**CAT-03 — copia local automática.** Editar un ejercicio global desde un gimnasio NO muta el
global: inserta una fila nueva con `tenant_id = <gimnasio>` y una columna
`copied_from_exercise_id` que apunta al ejercicio global de origen. Ese puntero es
**informativo** — sirve para que la UI diga "esta es tu versión de X" — y **no** es una FK que
la lectura tenga que seguir. Si la lectura del historial tuviera que resolver ese puntero en
cada consulta, el índice de cobertura de la Definición 6 (`tenant_id, user_id, exercise_id,
performed_at DESC`) dejaría de cubrir la consulta crítica del brief, porque agregaría un JOIN
extra justo en el camino caliente.

**CAT-04 — promoción local→global.** Es un `UPDATE gym_exercises SET tenant_id = NULL WHERE id
= ?`. El `id` no cambia, así que todos los `gym_set_logs` históricos que apuntan por FK a ese
mismo `id` no se enteran de la promoción: cero registros rotos, cero migración de datos. Esto
**no** es un DELETE + INSERT — el guardrail del brief es "nada se borra" y un DELETE + INSERT
obligaría a reescribir cada referencia histórica, exactamente lo que CAT-04 prohíbe. La
promoción es una acción de plataforma (la ejecuta el equipo de El Templo desde una herramienta
interna), nunca una acción disponible para un tenant sobre su propio contenido.

**CAT-05 — desactivación.** Una columna `status` con tres valores — `borrador`, `publicado`,
`desactivado` — del §2.2 del brief, **nunca** un `deleted_at`. Semántica de cada valor, en el
mismo estilo que el enum de `status` de `tenants.ts`:

- `borrador` — recién generado o creado, no visible en el buscador ni asignable en rutinas
  nuevas. No implica que el histórico lo ignore (todavía no tiene histórico si es nuevo).
- `publicado` — visible en el buscador, asignable en rutinas nuevas, es el estado normal de un
  ejercicio en uso.
- `desactivado` — no borrado. Sale del buscador y no se puede asignar en rutinas nuevas, pero
  NO deja de resolver: toda referencia histórica (`gym_set_logs`, rutinas asignadas ya
  clonadas) lo sigue viendo intacto.

Regla de lectura: el buscador y la creación de rutinas nuevas filtran `status != 'desactivado'`;
las lecturas de historial **no filtran por `status`**, así que un ejercicio desactivado sigue
resolviendo todo el pasado del alumno sin excepción.

**Unicidad de nombres y el caso borde de MySQL.** La unicidad natural del nombre canónico es
`(tenant_id, nombre_canonico)` — mismo patrón que ya usa `tenants.slug` para el mismo problema
de scope. Pero en MySQL una unique compuesta con una columna `NULL` **no impide duplicados**:
dos filas globales (`tenant_id = NULL`, `tenant_id = NULL`) con el mismo nombre canónico
pasarían la unique sin error, porque MySQL trata cada `NULL` como distinto de cualquier otro
`NULL` a los fines de unicidad. La salida concreta que este doc prescribe: una columna
generada/estable de scope, por ejemplo `tenant_scope_key` con el valor `COALESCE(tenant_id, 0)`,
incluida en la unique compuesta en lugar de `tenant_id` crudo — así la unicidad se aplica tanto
dentro de un gimnasio como dentro del catálogo global. Este caso borde queda escrito acá a
propósito, porque una fase ejecutora distraída declara la unique sobre `tenant_id` tal cual y
cree que ya está protegida, cuando en MySQL no lo está.

**CAT-06 — taxonomías cerradas del §2.3.** Tres listas cerradas, validadas **en la carga**
(schema de Fastify por ruta) — ningún valor fuera de lista entra a la base, nunca como
validación posterior:

- **14 grupos musculares:** pecho, espalda, hombros, bíceps, tríceps, antebrazo, cuádriceps,
  isquiotibiales, glúteos, gemelos, aductores, abdominales, lumbares, cuello.
- **25 equipamientos:** peso corporal, mancuernas, barra olímpica, barra recta, barra EZ,
  discos, kettlebell, máquina, polea alta, polea baja, banco plano, banco inclinado, banco
  declinado, multipower, prensa, bandas elásticas, TRX o similar, anillas, paralelas, barra de
  dominadas, colchoneta, cajón, soga, agarre neutro, agarre supino, agarre prono.
- **9 patrones de movimiento:** empuje horizontal, empuje vertical, tracción horizontal,
  tracción vertical, dominante de rodilla, dominante de cadera, aislamiento, core, cardio.

La **categoría** (7 valores: Pecho, Espalda, Hombros, Bíceps, Tríceps, Piernas, Core) es una
**capa derivada por mapeo fijo** desde el grupo muscular primario, no un campo editable:

| Categoría | Grupos musculares que agrupa                                 |
| --------- | -------------------------------------------------------------- |
| Pecho     | pecho                                                           |
| Espalda   | espalda                                                         |
| Hombros   | hombros                                                         |
| Bíceps    | bíceps, antebrazo                                               |
| Tríceps   | tríceps                                                         |
| Piernas   | cuádriceps, isquiotibiales, glúteos, gemelos, aductores         |
| Core      | abdominales, lumbares, cuello                                   |

Los dos mapeos que no son obvios a simple vista — `antebrazo → Bíceps` y `cuello → Core` —
quedaron **validados el 2026-08-27 (D-10)**: el mapeo del addendum A4 es definitivo, sin
pendientes de confirmación adicionales. El generador de catálogo (CAT-08) usa este mismo mapeo
al momento de la carga inicial, no un mapeo aparte.

**Aislamiento del buscador (CAT-07).** Un gimnasio ve las filas globales y las propias, nunca
las filas locales de otro gimnasio — incluido el buscador, que es superficie explícita del
guardrail de aislamiento del brief. Es el mismo `tenantOrGlobalWhere` de la lectura general, sin
excepción ni atajo para el caso "buscador".

**Corrección heredada que este doc salda.** `02-inventario-modulos.md` §2 describe el catálogo
global con "disponibilidad por tenant según equipamiento/máquinas". El brief §2.3 lo prohíbe de
forma explícita: "ningún gimnasio configura qué máquinas tiene, ni por sede, ni por cantidad...
quedó explícitamente fuera de alcance". Manda el brief, no el inventario viejo — queda la
corrección escrita acá para que ninguna fase ejecutora de la 184 en adelante reabra esa
disponibilidad-por-equipamiento como feature. La salida real para "este gimnasio no tiene esta
máquina" es la de variantes/alternativas manuales del §2.6 del brief: el profe o el alumno
reemplazan el ejercicio a mano por una alternativa cargada en el catálogo, con un toque.

**Alcance de plantillas.** La misma decisión de scope mixto (tabla única, `tenant_id` NULLable,
`tenantOrGlobalWhere` en lectura) aplica a las plantillas de rutina globales (RUT-01), tal como
fijó H-1 arriba — una sola regla para las dos entidades, no dos decisiones que puedan divergir
entre la fase 184 (catálogo) y la fase 187 (plantillas).

**✅ CERRADA (doc 08, 2026-08-27 — apoyada en H-1 y D-10)** — habilita CAT-01, CAT-02, CAT-03,
CAT-04, CAT-05, CAT-06, CAT-07, CAT-08, RUT-01.

## Definición 3 — Comportamiento offline

**Alcance del offline: SOLO la sesión en curso.** Se cachea la rutina activa del alumno —
segura de cachear por definición, porque RUT-04 la fija como una copia inmutable de la
plantilla — y se escriben localmente las series a medida que el alumno las carga. Todo lo
demás (catálogo completo, panel del profe, historial, edición de registros viejos) requiere
red. Es el único punto donde el brief dice explícitamente que la señal se pierde (gimnasios
en subsuelo, §5) y el único donde el costo de perder datos es total: "si no carga, no hay
historial" (§5, brief-fran-modulo-gimnasio.md).

**Mecanismo: outbox local sobre `@capacitor/preferences`**, que en web cae a `localStorage`
sin código adicional. La app nueva no inventa un mecanismo: copia dos patrones que ya existen
en el repo. `sessionPlayerStore.ts` ya persiste el progreso de una sesión en curso con este
mismo mecanismo (`load`/`save`/`remove` por `dayId`, `el-templo-app/src/modules/training/stores/sessionPlayerStore.ts`),
y `useTokenStorage.ts` ya resuelve la rama nativo-vs-web con `Capacitor.isNativePlatform()`
(Preferences si es nativo, `localStorage` si es web). Volumen: una sesión típica son
~6 ejercicios × 4 series ≈ 24 filas, y una sesión larga no llega a 100 — no justifica
IndexedDB en v1. `idb` queda nombrado como la migración natural el día que v2 pida múltiples
sesiones en cola o adjuntos, pero **no se adopta en v1**.

**Idempotencia obligatoria.** Cada serie lleva un `client_set_uid` (UUID generado en el
cliente al crear la fila local), y la tabla de series lleva una unique
`(tenant_id, client_set_uid)`. El endpoint de sync es un upsert por esa clave. Esto resuelve
de una sola vez tres problemas: reintentos de red, doble-tap del botón "hice lo planificado"
(REG-01), y re-sync después de un crash de la app. Nota de seguridad obligatoria: el
`client_set_uid` es entrada del cliente, se valida el formato al recibirlo y **jamás** se usa
para derivar el tenant — el tenant sale del `TenantContext` de la sesión autenticada, nunca
del payload.

**Dos dispositivos del mismo alumno — la pregunta explícita de Nacho.** La unidad de
identidad es la **serie**, no la sesión: la sesión es una sola entidad server-side, y el
segundo dispositivo simplemente la continúa. El merge es **last-write-wins por serie**,
comparando el `recorded_at` que manda el cliente — nunca `NOW()` del servidor, que borraría el
orden real en que el alumno entrenó. Lo que el merge pisa **no se descarta en silencio**:
queda en el log de ediciones, por el guardrail "nada se borra", y esa misma evidencia es la
que alimenta el recálculo de récords de la Definición 4.

**El reloj del cliente no es confiable.** Se guardan los dos sellos: `recorded_at` (del
cliente, para ordenar y mergear) y `synced_at` (del servidor, para auditar). Un `recorded_at`
fuera de una ventana razonable respecto de `synced_at` se **marca, no se rechaza** — el
guardrail dice que la serie que salió mal también es dato, y rechazarla sería borrarla por la
puerta de atrás.

**El timeout de abandono se evalúa server-side, nunca en el cliente** (REG-02, default 12 h
parametrizable): un cliente offline no tiene forma de saber si pasaron 12 h de verdad. El job
corre con `forEachActiveTenant`, el mismo patrón que ya usan los demás crons que barren todos
los gimnasios activos.

**Caso borde a escribir explícitamente: una sesión que el cliente sincroniza DESPUÉS de haber
sido marcada `abandonada` por el timeout.** Regla: se aceptan las series igual (nada se
borra), pero la sesión **no** vuelve a `completada` salvo cierre manual explícito del alumno,
porque REG-02 dice que una sesión se completa únicamente cuando el alumno la cierra a mano —
nunca por un efecto colateral del sync. **Esta es una regla de producto que Franco firma junto
con este doc** (es la Open Question 6 del research de la fase), no una decisión técnica
implícita.

**Límite de plataforma que condiciona la promesa de offline en la web.** WebKit exime del
borrado a los 7 días del storage script-writable a las web apps **agregadas a la pantalla de
inicio**, pero no a Safari en pestaña normal. Consecuencia de diseño: el offline es confiable
en la build Capacitor y en la PWA instalada; en Safari-en-pestaña **no** lo es. La superficie
web tiene que mostrar el prompt de **"Agregar a inicio"** ANTES de prometer offline, y mientras
la app no esté instalada el registro de series exige red o avisa explícitamente que puede
perderse. Una pantalla de sesión que se comporta exactamente igual instalada y no instalada es
la señal de que este límite se ignoró en la implementación.

**✅ CERRADA (doc 08, 2026-08-27 — discreción de Claude dentro de los guardrails del brief
§5)** — traza REG-01, REG-02, REG-03, REG-05.

## Definición 4 — Recálculo de récords personales

**La respuesta a la pregunta de Nacho ("en el momento o en proceso diferido"): en el momento,
dentro de la misma transacción que el alta, la edición o la baja del registro de la serie.**
El criterio de aceptación del brief es "el alumno nunca ve un récord que después cambia solo"
(§7), y cualquier ventana entre el registro y el recálculo — por chica que sea — es
exactamente ese bug. El proceso diferido/batch queda descartado de plano: un batch que corre
cada N minutos es una ventana con nombre, no una solución.

**Tabla derivada `gym_personal_records`**, con unique
`(tenant_id, user_id, exercise_id, metric)` y columnas `best_value`, `achieved_at`,
`source_set_log_id`. La columna `metric` existe desde v1 aunque v1 tenga una sola métrica
(`max_weight`, EVO-01): el brief manda récords de reps y de volumen a v2 (§7), y agregarlos
después con la columna ya presente es un `INSERT` de filas nuevas, no un `ALTER` de forma.

**Dos caminos, no uno:**

- **Alta de una serie:** comparación barata con `INSERT ... ON DUPLICATE KEY UPDATE`, con la
  comparación resuelta en SQL contra `best_value`. No hace falta releer el historial.
- **Edición o baja de una serie (REG-05):** **recálculo completo** del récord de ese par
  (tenant, usuario, ejercicio, métrica) con un `SELECT MAX(...)` acotado sobre el historial.
  **Nunca un decremento manual** — decrementar el valor guardado es exactamente lo que produce
  el "récord fantasma" cuando se borra o corrige la serie que lo sostenía: si el segundo mejor
  valor histórico no se relee, el récord queda mintiendo.
- El recálculo es viable como respuesta síncrona **porque el índice de la Definición 6
  (`idx_gym_set_logs_hist`) ya existe para servir el historial** — la misma estructura sirve a
  las dos cosas, la lectura del historial y el recálculo del récord, sin un índice adicional.

**Concurrencia.** El sync offline (Definición 3) y una edición del profe pueden pegarle a la
fila del récord al mismo tiempo. Se prescribe bloqueo de la fila dentro de la transacción
(`SELECT ... FOR UPDATE`) o una comparación atómica resuelta dentro del propio
`ON DUPLICATE KEY UPDATE`. Sin uno de los dos, dos escrituras concurrentes pueden dejar pegado
un récord viejo aunque cada escritura individualmente fuera correcta.

**Anti-patrón nombrado explícitamente: nunca en un hook `event` del registry de módulos.** Los
`event` son best-effort y aislados por diseño (doc 04 §4.1: "Event → aislado", el ejemplo
documentado es la recompensa de racha que hoy corre en `try/catch` + `log.warn`) — un récord
perdido en ese camino no rompería nada visible y nadie se enteraría, que es lo opuesto de lo
que pide el brief. Un plan de la fase 190 que mencione "job" o "cola" para calcular récords es
la señal temprana de que este anti-patrón se coló de nuevo.

**El récord se acumula contra el ejercicio REALIZADO, no el planificado** (REG-04). Es
consecuencia directa del guardrail "se guarda el ejercicio efectivamente realizado" (§5.3 del
brief) y queda escrito acá porque es exactamente donde una implementación distraída acumula
por error contra el ejercicio que planificó el profe.

**La alternativa honesta, nombrada antes de descartarla: calcular el récord on-the-fly con un
`MAX()` en cada lectura.** Nunca miente y ahorra mantener una tabla; con el índice de la
Definición 6 sería técnicamente viable. Se descarta por dos motivos: paga el costo del
agregado en cada pantalla de evolución en vez de una sola vez en la escritura, y sobre todo
**no tiene dónde guardar `achieved_at` como un hecho** — EVO-01 pide mostrar la fecha en la que
se logró el récord, y un `MAX()` sin tabla derivada no puede reconstruir cuándo pasó sin
recorrer el historial completo cada vez que se muestra.

**✅ CERRADA (doc 08, 2026-08-27 — discreción de Claude dentro del criterio del brief §7)** —
traza EVO-01, REG-04, REG-05, VAL-01.

## Definición 5 — Superseries y circuitos

**La decisión: columnas de agrupación en la propia fila del ejercicio del día, sin tabla de
bloques aparte.**

| Columna          | Tipo                              | Semántica                                                          |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `order_in_day`   | int, siempre presente              | Orden del ejercicio dentro del día.                                  |
| `group_key`      | varchar corto, NULL                | `NULL` = ejercicio suelto (el 90% de los casos). Mismo valor = mismo bloque. |
| `group_type`     | enum(`superset`, `circuit`), NULL  | Solo tiene valor cuando `group_key` no es NULL.                      |
| `order_in_group` | int, NULL                          | Orden del ejercicio dentro del bloque.                                |

**Por qué el caso simple no paga nada.** Un ejercicio suelto tiene tres columnas en NULL que
nadie lee ni renderiza distinto. Una tabla `routine_blocks` obligaría a un JOIN (o a un LEFT
JOIN cargado de NULLs) para renderizar la rutina más común del sistema — exactamente lo que el
brief prohíbe con "sin complicar el caso simple, que es el 90%".

**Por qué sobrevive al clonado, que es la razón más fuerte de la decisión.** La regla dura
RUT-03/RUT-04 es que la plantilla se **clona** y la rutina asignada es una **copia** que jamás
muta. Con la agrupación viviendo en la misma fila del ejercicio, clonar es un
`INSERT ... SELECT` y la agrupación viaja sola, sin tocar nada más. Con una tabla aparte,
clonar exige remapear los ids de bloque de la plantilla a ids de bloque nuevos de la copia —
una fuente de bugs gratuita en la operación más frecuente de todo el módulo.

**Detalle que este doc fija y que la fase 187 no puede improvisar.** El `group_key` lo genera
el **servidor** al guardar, nunca lo elige el usuario, y es único **dentro del día**, no
global — así el clonado nunca colisiona, porque cada copia genera sus propios `group_key` al
clonarse.

**La alternativa considerada y por qué no ahora.** Una tabla `routine_blocks` con FK es más
limpia semánticamente y se vuelve necesaria el día que v2 pida rondas por bloque, descanso
específico por bloque o un tiempo de circuito con su propio timer — atributos que ya no caben
en una fila de ejercicio individual. Promover de columnas a tabla en ese momento es una
migración acotada (agregar la tabla, backfill desde `group_key`/`group_type` existentes);
hacerlo hoy es complejidad para un requerimiento que el brief mandó explícitamente a resolverse
"de forma simple" (§3). El disparador concreto que obligaría a la promoción: la primera vez que
un requerimiento de producto necesite un atributo que pertenezca al **bloque** y no al
**ejercicio individual** dentro de él.

**Dónde viven esas columnas.** En las filas de ejercicio tanto de la plantilla como de la
rutina asignada — las dos tienen la misma forma, porque una es copia literal de la otra (cross-
ref Definición 6, que nombra las tablas concretas).

**✅ CERRADA (doc 08, 2026-08-27 — discreción de Claude dentro del criterio del brief §3)** —
traza RUT-02, RUT-03, RUT-04, RUT-08.

## Definición 6 — Volumen de datos, esquema e índices

**La consulta que manda:** "historial de este alumno en este ejercicio" — el brief la señala
como la más frecuente del módulo. En v1 la sirven tres requirements a la vez: EVO-01 (récord
de peso), EVO-02 (qué hizo la última vez) y PROF-03 (planificado vs. realizado, panel del
profe).

### Inventario de tablas nuevas

Todas las tablas nuevas del módulo llevan prefijo `gym_`:

| Tabla                             | Qué guarda                                                                                             | Scope de tenancy                                                | REQ que habilita                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `gym_exercises`                   | Catálogo de ejercicios (ficha del §2.2 del brief: nombre canónico, taxonomías cerradas, estado)         | **MIXTO** — `tenant_id` NULLable, NULL = global (H-1 Opción A)    | CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07, CAT-08    |
| `gym_routine_templates`           | Plantillas de rutina — globales de la plataforma y propias del gimnasio                                | **MIXTO** — misma regla de H-1, aplicada a la misma decisión      | RUT-01, RUT-02                                                    |
| `gym_routine_template_days`       | Días de una plantilla (Día 1, Torso, Pierna…)                                                          | **MIXTO** — hereda el scope de la plantilla dueña                 | RUT-02                                                            |
| `gym_routine_template_exercises`  | Ejercicios de cada día de plantilla: series/reps objetivo, descanso, agrupación de superserie/circuito | **MIXTO** — hereda el scope de su día                             | RUT-02, RUT-08                                                    |
| `gym_assigned_routines`           | La copia inmutable que recibe un alumno al asignarle una plantilla (RUT-04)                            | GYM-OWNED                                                          | RUT-03, RUT-04, RUT-05, RUT-07                                    |
| `gym_assigned_routine_days`       | Días de la rutina asignada — copia literal de los de la plantilla                                     | GYM-OWNED                                                          | RUT-04                                                            |
| `gym_assigned_routine_exercises`  | Ejercicios de cada día asignado; el profe los edita en curso (RUT-06)                                  | GYM-OWNED                                                          | RUT-04, RUT-06, RUT-08                                            |
| `gym_sessions`                    | Una ejecución concreta de un día de rutina, con su estado (§5.2)                                       | GYM-OWNED                                                          | REG-02                                                            |
| `gym_session_exercises`           | Planificado vs. realizado por ejercicio dentro de una sesión, más la valoración del alumno              | GYM-OWNED                                                          | REG-04, VAL-01, VAL-02, PROF-03                                   |
| `gym_set_logs`                    | El registro por serie — la tabla de mayor volumen del módulo (ver estimación abajo)                    | GYM-OWNED                                                          | REG-01, REG-02, REG-03, REG-04, REG-05, EVO-01, EVO-02, PROF-03   |
| `gym_personal_records`            | Récord vigente por alumno×ejercicio×métrica (ya definida en la Definición 4, se consigna con su forma completa) | GYM-OWNED                                                 | EVO-01, REG-05                                                    |
| `gym_log_edits`                   | Historial de ediciones y bajas de una fila de `gym_set_logs` (REG-05)                                  | GYM-OWNED                                                          | REG-05                                                            |

Doce tablas nuevas, ninguna comparte prefijo con el SPOM ni con ninguna tabla existente.

### Reglas transversales (se escriben una vez, aplican a las doce)

Todas llevan `id` autoincrement como clave primaria. Todas llevan la columna de tenancy con la
forma de `tenantIdColumn()` (`int NOT NULL DEFAULT 1 REFERENCES tenants.id`) **salvo las
cuatro de scope mixto** (`gym_exercises`, `gym_routine_templates`, `gym_routine_template_days`,
`gym_routine_template_exercises`), que la llevan `NULL` a propósito — la misma excepción que
fija H-1 arriba, con el mismo motivo: `NULL` es la única forma de expresar "fila de plataforma"
sin condenar CAT-04 a una migración de datos. Al estilo del docblock de `tenant-column.ts` — una
decisión, su motivo, el trade-off descartado —: la alternativa era declarar estas cuatro tablas
`NOT NULL DEFAULT 1` y resolver "global" con un tenant reservado (Opción C de H-1), descartada
porque agregaba una fila en `tenants` que los crons de `forEachActiveTenant` tendrían que
aprender a saltear.

Las **dos tablas hijas de plantilla** (`gym_routine_template_days`,
`gym_routine_template_exercises`) denormalizan el `tenant_id` de su plantilla dueña al momento
de crearse — nunca se "reparenta" un día a otra plantilla, así que el valor no se desincroniza.
Esto evita que una lectura de "todos los días de mis plantillas" tenga que resolver el scope
subiendo por dos JOINs.

Las únicas FKs hacia afuera del módulo son a `users`, `branches` y `tenants` (frontera A1) —
ninguna tabla de este inventario tiene ni tendrá una FK a `exercises` ni a ninguna otra tabla
del SPOM (A2, `exercises` no se toca). La lectura de si un alumno tiene una suscripción activa
va, en las rutas del módulo, por los helpers de `shared/active-member.ts` — nunca por una FK
desde una tabla `gym_*` a `subscriptions`.

### Cada tabla: columnas clave, FKs e índices

Nivel de detalle: entidades, columnas clave, FKs e índices para las consultas críticas — no DDL
completo (D-08). El schema Drizzle final lo escriben las fases 184+.

**`gym_exercises`** (scope MIXTO)

```
id                      PK autoincrement
tenant_id               int NULL, FK -> tenants.id            -- NULL = global (H-1 Opción A)
tenant_scope_key        int NOT NULL, generado = COALESCE(tenant_id, 0)  -- Definición 2, caso borde de unique con NULL
nombre_canonico         varchar(150) NOT NULL
muscle_group_primary    varchar(20) NOT NULL                  -- 14 valores cerrados, CAT-06
equipment               json NOT NULL                         -- array del set de 25 valores cerrados
movement_pattern        varchar(30) NOT NULL                  -- 9 valores cerrados
load_type               varchar(30) NOT NULL
status                  enum('borrador','publicado','desactivado') NOT NULL DEFAULT 'borrador'  -- CAT-05
copied_from_exercise_id int NULL, FK -> gym_exercises.id      -- CAT-03, puntero informativo, no se sigue en lecturas
created_at / updated_at
```

Índices: `uq_gym_exercises_scope_name (tenant_scope_key, nombre_canonico)` — unicidad del
nombre canónico dentro de cada scope, resolviendo el caso borde de MySQL de la Definición 2;
`idx_gym_exercises_scope_status (tenant_scope_key, status)` — el buscador y la creación de
rutinas filtran `status != 'desactivado'` dentro del scope visible del gimnasio.

**`gym_routine_templates`** (scope MIXTO)

```
id                  PK autoincrement
tenant_id           int NULL, FK -> tenants.id       -- NULL = plantilla global (RUT-01, misma regla de H-1)
tenant_scope_key    int NOT NULL, generado = COALESCE(tenant_id, 0)
name                varchar(150) NOT NULL
status              enum('borrador','publicado','desactivado') NOT NULL DEFAULT 'publicado'  -- mismo patrón que CAT-05, nunca se borra
created_by_user_id  int NULL, FK -> users.id         -- NULL para las plantillas sembradas por el equipo de El Templo
created_at / updated_at
```

Índice: `idx_gym_routine_templates_scope_status (tenant_scope_key, status)`.

**`gym_routine_template_days`** (scope MIXTO, hereda)

```
id           PK autoincrement
template_id  int NOT NULL, FK -> gym_routine_templates.id
tenant_id    int NULL   -- denormalizado del tenant_id de la plantilla dueña
day_order    int NOT NULL
day_label    varchar(50) NOT NULL   -- "Día 1", "Torso", "Pierna"...
```

Índice: `uq_gym_routine_template_days_order (template_id, day_order)`.

**`gym_routine_template_exercises`** (scope MIXTO, hereda)

```
id                   PK autoincrement
template_day_id      int NOT NULL, FK -> gym_routine_template_days.id
tenant_id            int NULL   -- denormalizado del día dueño
exercise_id          int NOT NULL, FK -> gym_exercises.id
order_in_day         int NOT NULL
group_key            varchar(20) NULL       -- Definición 5, superserie/circuito
group_type           enum('superset','circuit') NULL
order_in_group       int NULL
target_sets          int NOT NULL
target_reps          varchar(20) NOT NULL   -- valor u rango, "8" u "8-12"
suggested_weight_kg  decimal(6,2) NULL
rest_seconds         int NULL
notes                text NULL
```

Índice: `idx_gym_routine_template_exercises_day (template_day_id, order_in_day)`.

**`gym_assigned_routines`** (GYM-OWNED)

```
id                    PK autoincrement
tenant_id             int NOT NULL DEFAULT 1, FK -> tenants.id  -- tenantIdColumn()
user_id               int NOT NULL, FK -> users.id              -- el alumno
source_template_id    int NULL, FK -> gym_routine_templates.id  -- de qué plantilla se clonó; informativo, RUT-04 no lo sigue en lecturas
assigned_by_user_id   int NOT NULL, FK -> users.id               -- profe, o el propio alumno si RUT-07
is_self_assigned      boolean NOT NULL DEFAULT false             -- RUT-07
name                  varchar(150) NOT NULL                      -- copiado de la plantilla al clonar
status                enum('activa','finalizada') NOT NULL DEFAULT 'activa'
start_date            date NOT NULL
end_date              date NULL
created_at / updated_at
```

Índice: `idx_gym_assigned_routines_active (tenant_id, user_id, status)` — resuelve RUT-05
("una rutina activa por vez") y es el mismo índice que consulta la validación de alta antes de
asignar una rutina nueva.

**`gym_assigned_routine_days`** (GYM-OWNED)

```
id                    PK autoincrement
tenant_id             int NOT NULL DEFAULT 1, FK -> tenants.id
assigned_routine_id   int NOT NULL, FK -> gym_assigned_routines.id
day_order             int NOT NULL
day_label             varchar(50) NOT NULL
```

Índice: `uq_gym_assigned_routine_days_order (assigned_routine_id, day_order)`.

**`gym_assigned_routine_exercises`** (GYM-OWNED)

```
id                          PK autoincrement
tenant_id                   int NOT NULL DEFAULT 1, FK -> tenants.id
assigned_routine_day_id     int NOT NULL, FK -> gym_assigned_routine_days.id
exercise_id                 int NOT NULL, FK -> gym_exercises.id
order_in_day                int NOT NULL
group_key / group_type / order_in_group     -- misma forma que la plantilla, Definición 5
target_sets                 int NOT NULL
target_reps                 varchar(20) NOT NULL
suggested_weight_kg         decimal(6,2) NULL
rest_seconds                int NULL
notes                       text NULL
last_modified_at            timestamp NULL          -- RUT-06
last_modified_by_user_id    int NULL, FK -> users.id -- RUT-06
```

Índice: `idx_gym_assigned_routine_exercises_day (assigned_routine_day_id, order_in_day)`.

**RUT-06 — cómo queda representada una modificación en curso.** El profe edita esta fila
directamente (le sube el peso, cambia el `exercise_id`) y el `UPDATE` setea
`last_modified_at`/`last_modified_by_user_id`. Esto no contradice RUT-04 ("copia inmutable"):
lo que la rutina asignada no hace es _seguir_ ediciones de la plantilla de origen; sí puede
recibir ediciones directas del profe, y esas quedan visibles para el alumno con su fecha porque
el brief (§4.1) solo pide "una modificación, con su fecha" — no un diff campo a campo, así que
un timestamp + el actor alcanzan sin una tabla de versiones aparte.

**`gym_sessions`** (GYM-OWNED)

```
id                        PK autoincrement
tenant_id                 int NOT NULL DEFAULT 1, FK -> tenants.id
user_id                   int NOT NULL, FK -> users.id
assigned_routine_day_id   int NOT NULL, FK -> gym_assigned_routine_days.id
branch_id                 int NOT NULL, FK -> branches.id
status                    enum('pendiente','en_curso','completada','abandonada') NOT NULL DEFAULT 'pendiente'  -- §5.2
started_at / completed_at / abandoned_at    timestamp NULL
```

Índice: `idx_gym_sessions_user_status (tenant_id, user_id, status)` — sirve la lectura "sesión
en curso de este alumno" (RUT-05 / autogestión) y el barrido del timeout de abandono (REG-02,
`WHERE status = 'en_curso' AND started_at < NOW() - INTERVAL ...`). También sirve **EVO-03**
("sesiones completadas en el mes"): un `COUNT` sobre `gym_sessions` filtrado por
`status = 'completada'` y `completed_at` dentro del mes cae en el mismo rango de índice, sin
índice adicional.

**`gym_session_exercises`** (GYM-OWNED)

```
id                      PK autoincrement
tenant_id               int NOT NULL DEFAULT 1, FK -> tenants.id
session_id              int NOT NULL, FK -> gym_sessions.id
planned_exercise_id     int NOT NULL, FK -> gym_exercises.id   -- lo que planificó el profe
performed_exercise_id   int NOT NULL, FK -> gym_exercises.id   -- lo efectivamente realizado (REG-04)
order_in_day            int NOT NULL
rating                  enum('facil','adecuado','dificil') NULL   -- VAL-01, opcional
had_discomfort          boolean NULL                              -- VAL-02, opcional
discomfort_location     varchar(100) NULL
discomfort_notes        text NULL
```

Índice: `idx_gym_session_exercises_session (session_id, order_in_day)`.

**`gym_set_logs`** (GYM-OWNED — la tabla crítica)

```
id                    PK autoincrement
tenant_id             int NOT NULL DEFAULT 1, FK -> tenants.id
session_exercise_id   int NOT NULL, FK -> gym_session_exercises.id
set_order             int NOT NULL
user_id               int NOT NULL, FK -> users.id            -- DENORMALIZADO, ver más abajo
exercise_id           int NOT NULL, FK -> gym_exercises.id    -- DENORMALIZADO, = performed_exercise_id de la sesión
performed_at          timestamp NOT NULL                      -- DENORMALIZADO, = recorded_at del cliente (Definición 3)
reps                  int NULL
weight_kg             decimal(6,2) NULL
duration_seconds      int NULL
distance_meters       decimal(8,2) NULL
bodyweight_kg         decimal(6,2) NULL
added_load_kg         decimal(6,2) NULL
assistance_kg         decimal(6,2) NULL
client_set_uid        varchar(36) NOT NULL     -- Definición 3, idempotencia del sync
synced_at             timestamp NOT NULL
```

Índices: `uq_gym_set_logs_client_uid (tenant_id, client_set_uid)` — idempotencia
(Definición 3); `idx_gym_set_logs_hist (tenant_id, user_id, exercise_id, performed_at DESC)` —
el índice de cobertura, ver abajo.

**`gym_personal_records`** (GYM-OWNED, ya definida en la Definición 4)

```
id                  PK autoincrement
tenant_id           int NOT NULL DEFAULT 1, FK -> tenants.id
user_id             int NOT NULL, FK -> users.id
exercise_id         int NOT NULL, FK -> gym_exercises.id
metric              varchar(30) NOT NULL        -- 'max_weight' en v1
best_value          decimal(8,2) NOT NULL
achieved_at         timestamp NOT NULL
source_set_log_id   int NOT NULL, FK -> gym_set_logs.id
```

Índice: `uq_gym_personal_records (tenant_id, user_id, exercise_id, metric)`.

**`gym_log_edits`** (GYM-OWNED, REG-05)

```
id                  PK autoincrement
tenant_id           int NOT NULL DEFAULT 1, FK -> tenants.id
set_log_id          int NOT NULL, FK -> gym_set_logs.id
edited_by_user_id   int NOT NULL, FK -> users.id
edit_type           enum('alumno_ventana','profe_fuera_ventana','merge_offline') NOT NULL
before_json         json NOT NULL
after_json          json NULL      -- NULL = la edición fue una baja
edited_at           timestamp NOT NULL DEFAULT NOW()
```

Índice: `idx_gym_log_edits_set_log (set_log_id, edited_at)`.

**Por qué tabla propia y no `audit_log`.** `audit_log` es un log forense de tres acciones
financieras (`subscription_cancelled`, `transaction_voided`, `plan_assigned`), write-only por
diseño, con `target_kind`/`target_id` heterogéneos y sin columnas de antes/después — el diff
vive en `payload_json` sin forma fija. Mezclar ahí las ediciones de `gym_set_logs` (volumen del
orden de millones de filas, ver estimación abajo) obligaría a inventar un
`target_kind = 'gym_set_log'` ad-hoc y degradaría la selectividad de los tres índices que hoy
sirven exclusivamente al forense financiero. `gym_log_edits` es más barata de razonar, tiene su
propio índice para "historial de ediciones de esta serie" y no compite por espacio ni por
índice con una tabla que además tiene pendiente un REVOKE UPDATE/DELETE a nivel SQL.

### LA decisión de esta definición: denormalizar `user_id`, `exercise_id` y `performed_at` en `gym_set_logs`

Los tres son derivables de la sesión (`gym_set_logs → gym_session_exercises → gym_sessions →
user_id`, y `performed_exercise_id` de la misma fila de sesión). Se **denormalizan** igual, a
propósito: sin la denormalización, la consulta crítica necesita 2-3 JOINs
(`set_log → session_exercise → session → user`) y ningún índice puede cubrirla — el plan de
ejecución siempre incluye al menos un acceso por fila a una tabla intermedia. Con la
denormalización, un único índice la resuelve entera, sin tocar ninguna otra tabla.

**Por qué es seguro.** Los tres son inmutables una vez creada la fila. El único que "cambia" en
apariencia es `exercise_id`, cuando el alumno sustituye el ejercicio planificado por una
alternativa (REG-04): ahí lo correcto — y lo que este doc prescribe — es que la fila se escriba
directamente con el ejercicio **realizado**, nunca que se actualice después. No hay una ruta de
código que haga `UPDATE gym_set_logs SET exercise_id = ...` después del alta.

### El índice de cobertura: `idx_gym_set_logs_hist (tenant_id, user_id, exercise_id, performed_at DESC)`

**Por qué ese orden de columnas.** `tenant_id` primero, por la convención que fijó la fase 168
para toda unique/índice compuesto de una tabla gym-owned y porque el filtro de tenant es el
primer término de todo `WHERE` sobre estas tablas (`tenant.ts:17-21`). Después `user_id` y
`exercise_id`, las dos columnas de igualdad de la consulta crítica. `performed_at DESC` al
final, porque el historial se lee del más reciente al más viejo.

**Qué sirve el mismo índice, sin duplicarlo:** el historial alumno×ejercicio (la consulta más
frecuente según Nacho, §7 del brief); el `MAX()` del recálculo de récords de la Definición 4
(mismo rango de índice, agregando `MAX(weight_kg)` sobre las filas que ya trae ordenadas); y
EVO-02 ("qué hizo la última vez") con `ORDER BY performed_at DESC LIMIT 1` sobre el mismo rango.

**Por qué esta tabla se aparta del patrón de índices simples de `completed_sessions`.**
`completed_sessions` (el analog gym-owned más cercano) usa tres índices de una sola columna
(`user_idx`, `date_idx`, `branch_idx`) porque sus consultas hoy son independientes entre sí — se
filtra por usuario, o por fecha, o por sede, casi nunca las tres combinadas con igual peso.
`gym_set_logs` filtra por `tenant_id`, `user_id` y `exercise_id` **a la vez**, siempre, en la
consulta que manda el diseño — ahí un índice compuesto de cobertura rinde una consulta de rango
de decenas de filas; tres índices simples obligarían a MySQL a elegir uno solo y filtrar el
resto en memoria.

### Otras uniques/índices que ya decidieron las definiciones anteriores

- `uq_gym_set_logs_client_uid (tenant_id, client_set_uid)` en `gym_set_logs` — idempotencia del
  sync offline (Definición 3).
- `uq_gym_personal_records (tenant_id, user_id, exercise_id, metric)` en `gym_personal_records`
  (Definición 4).
- `uq_gym_exercises_scope_name (tenant_scope_key, nombre_canonico)` en `gym_exercises` — la
  unique de nombre canónico con la clave de scope estable, el caso borde de MySQL con `NULL`
  que fija la Definición 2.
- `idx_gym_sessions_user_status (tenant_id, user_id, status)` en `gym_sessions` — "una rutina
  activa por vez" (RUT-05) y el barrido del timeout de abandono (REG-02).

### Estimación de volumen [ASSUMED — aritmética sobre supuestos de uso, no medición]

Un alumno activo con 4 sesiones/semana × 6 ejercicios × 4 series ≈ **96 filas/semana ≈ 5.000
filas/año** en `gym_set_logs`. Un gimnasio de 500 alumnos activos ≈ **2,5 M filas/año**; uno de
1.000 alumnos ≈ 5 M/año. Con `idx_gym_set_logs_hist`, MySQL 8 resuelve el historial de un
alumno×ejercicio en un rango de índice de decenas de filas, **independientemente del total de
la tabla** — el volumen agregado no degrada la consulta crítica.

**Decisión: no particionar en v1.** Umbral de revisión concreto: revisar particionado por rango
de `performed_at` cuando `gym_set_logs` pase el orden de las **decenas de millones de filas**, o
cuando el índice de cobertura deje de entrar en el buffer pool de InnoDB — lo que ocurra
primero. Ninguno de los dos es previsible antes de tener varios gimnasios grandes con años de
historial.

**Nada se borra (guardrail del brief) ⇒ la tabla crece monótonamente.** No habrá purga de
`gym_set_logs` ni de ninguna otra tabla del módulo.

### Argumento cuantitativo que refuerza H-1

Con la Opción A de H-1 (`gym_exercises` con `tenant_id` NULLable), la FK de
`gym_set_logs.exercise_id` es una FK simple a `gym_exercises(id)` y el índice de cobertura
funciona sin ninguna columna extra. Con la Opción B (dos tablas, `gym_exercises_global` +
`gym_exercises_local`), esa referencia se vuelve **polimórfica** (`exercise_scope` +
`exercise_id`) — sin integridad referencial declarativa y con peor selectividad exactamente en
el índice que sostiene la consulta crítica de este doc. Es el mismo argumento de la Definición
2, repetido acá porque es donde más pesa: el índice de cobertura es el artefacto concreto que la
Opción B rompería.

### Encaje con los gates de CI

Cada una de las doce tablas se clasifica en `el-templo-api/src/db/tenant-tables.ts`: las ocho
GYM-OWNED entran a `GYM_OWNED_TABLES`, las cuatro de scope mixto (`gym_exercises`,
`gym_routine_templates`, `gym_routine_template_days`, `gym_routine_template_exercises`) entran a
la categoría nueva `TENANT_MIXED_SCOPE_TABLES` que fija H-1, con el motivo escrito por entrada.
Una tabla sin clasificar deja `test/db/tenant-tables.test.ts` en rojo — no es opcional.

Las migraciones del módulo **reservan desde la 0216** (producción está en 0215 al firmar este
doc). Hand-written junto al schema Drizzle en el mismo commit, sin `;` dentro de comentarios
`--`, y nunca con `drizzle-kit migrate` (el runner custom de `run-migrations.ts` es la única
fuente de verdad para local y producción, ver CLAUDE.md).

**✅ CERRADA (doc 08, 2026-08-27 — nivel de detalle según D-08)** — traza CAT-01, RUT-02,
RUT-04, RUT-05, RUT-06, REG-02, REG-03, REG-04, REG-05, EVO-01, EVO-02, EVO-03, PROF-03.

## Definición 7 — Mapa de parámetros en tenant_settings

### La mecánica verificada

`tenant_settings` es un KV `(tenant_id, setting_key, setting_value TEXT)` con unique
`uq_tenant_setting` — ya existe (`el-templo-api/src/db/schema/tenants.ts`) y no se propone de
nuevo. El vocabulario de los flags de módulo es `"true"`/`"false"`, **divergencia deliberada**
respecto de `system_settings`, que usa `'on'`/`'off'` — el docblock de `modules.ts` ordena no
mezclar los dos vocabularios, y este doc extiende esa misma regla a los ocho parámetros de
abajo. El cache de flags de módulo es in-memory con TTL 60 s en runtime y 0 en test (para no
filtrar estado entre archivos de test que comparten el mismo worker de Vitest), con
`invalidateModuleFlags()` exportada para que cualquier escritura la invoque.

### Mapa de parámetros del módulo

| Key                                        | Default                                                 | REQ     | Fuente en el brief                                                    |
| -------------------------------------------- | ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `module.gimnasio.enabled`                  | `"false"` (fail-closed); el wizard de la 182 lo siembra en `"true"` | PLAT-03 | ROADMAP regla 2 / doc 04                                              |
| `gimnasio.self_service.enabled`            | `"false"`                                                | RUT-07  | §4.2 "apagado por default"                                            |
| `gimnasio.session.abandon_timeout_hours`   | `"12"`                                                   | REG-02  | §5.2                                                                    |
| `gimnasio.log.edit_window_hours`           | `"24"`                                                   | REG-05  | §5.4                                                                    |
| `gimnasio.signals.hard_streak`             | `"3"`                                                    | PROF-02 | §8 "umbral parametrizable, default 3"                                  |
| `gimnasio.signals.easy_streak`             | `"3"`                                                    | PROF-02 | §8 — el brief NO da default para "Fácil"; el 3 es una elección de este diseño, que espeja el de "Difícil" |
| `gimnasio.signals.inactivity_days`         | `"14"`                                                   | PROF-02 | §8 "default 14"                                                        |
| `gimnasio.units.weight`                    | `"kg"`                                                   | REG-03  | §5.3 "kg en v1, libras previsto"                                       |

### Claves de branding (D-12: config, nunca código)

Estas siete keys son el mecanismo concreto que sostiene D-12 y alimentan la superficie
member-facing multi-tenant que decide DIS-02 (plan 181-05): sin este mapa, DIS-02 no tendría de
dónde leer el branding por tenant.

| Key                        | Uso                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `brand.display_name`       | Nombre del gimnasio dentro de la app y en el `<title>` de la web                                                          |
| `brand.subdomain`          | **Derivado de `tenants.slug`, no se persiste** (decisión de este doc). D-06 fija el acceso por subdominio; duplicar el valor en `tenant_settings` crearía dos fuentes que podrían divergir (rename de `slug` sin actualizar la key). La resolución de tenant por hostname (H-3) resuelve `Host → tenants.slug` directamente. |
| `brand.color.primary`      | Aplicado en runtime con `setCssVar`                                                                                       |
| `brand.color.secondary`    | Aplicado en runtime con `setCssVar`                                                                                       |
| `brand.color.accent`       | Aplicado en runtime con `setCssVar`                                                                                       |
| `brand.logo_url`           | Asset por tenant, hogar natural en R2 (ya montado como plugin, `src/plugins/r2.ts`)                                       |
| `brand.icon_key`           | Cuál del set pre-empaquetado de íconos alternativos usa la build nativa (D-11)                                            |

### Reglas de forma que el doc fija

- **Tres namespaces que coexisten en la misma tabla, sin mezclarse:** `module.` (del mecanismo
  de módulos), `gimnasio.` (parámetros de este módulo) y `brand.` (transversal a cualquier
  módulo, no exclusivo de Gimnasio).
- **Todo valor es TEXT ⇒ el parseo con default vive en un solo helper por módulo.** Sigue el
  patrón `parseOrDefault` que ya usan streaks y finance contra `system_settings` (doc 04 §2) —
  un `parseGimnasioSettings(tenantId, db)` único, nunca un default repetido en cada call site.
  Un default duplicado en dos lugares es el bug clásico que este doc nombra a propósito para que
  la fase 189 no lo reintroduzca.
- **Los defaults viven en código, no en la migración de seed.** Un tenant nuevo sin ninguna fila
  en `tenant_settings` tiene que funcionar con los ocho defaults de la tabla de arriba. La
  migración del wizard (PLAT-03) escribe solo las keys que el owner elige distinto del default —
  nunca las ocho de memoria.
- **Cache: decisión explícita, no queda abierta.** Los `gimnasio.*` **no se cachean** — cada
  lectura pega a `tenant_settings` con una query directa por `(tenant_id, setting_key)`, que es
  una lookup por índice único (`uq_tenant_setting`), barata. Se descarta cachearlos como
  `module.*.enabled`: agregar un segundo mecanismo de cache con su propio TTL y su propia
  función de invalidación (`invalidateGimnasioSettings()`) es una clase entera de bugs —
  invalidación olvidada tras un `UPDATE` de un umbral de señal — para un ahorro que ninguna de
  las lecturas de este módulo necesita (el panel del profe y la ejecución de sesión no son de
  alto tráfico por tenant). Si el volumen de lecturas lo justifica en el futuro, se adopta el
  mismo patrón de `invalidateModuleFlags()`, pero v1 no lo pide.
- **Regla dura 5 del milestone: ningún parámetro del brief queda hardcodeado.** La lista de ocho
  se cerró releyendo §4.2, §5.2, §5.3, §5.4 y §8 del brief completo — no hay una novena
  constante escondida en código. Cualquier parámetro que el brief mencione después de este doc
  entra a esta tabla, nunca al código.

**✅ CERRADA (doc 08, 2026-08-27)** — traza PLAT-03, RUT-07, REG-02, REG-03, REG-05, PROF-02,
DIS-02.

## DIS-02 — Superficie member-facing multi-tenant

### (a) Las dos superficies

**STAFF** (profes/admins de cada gimnasio) vive en `el-templo-admin`, que ya es multi-tenant
desde v6.0: no nace una app nueva para el staff. Las secciones del módulo Gimnasio se gatean
por `module.gimnasio.enabled`, así que el staff de El Templo (módulo Gimnasio siempre OFF para
el tenant 1) no las ve nunca. Convención concreta que este doc fija: las páginas nuevas van en
una subcarpeta `src/pages/gimnasio/` — hoy `el-templo-admin/src/pages` es **completamente
plana** (30 páginas, `TvControlPage.vue`/`TvScreenPage.vue` incluidas, sin ninguna
subcarpeta) [VERIFIED: `find el-templo-admin/src/pages -type d` no devuelve subdirectorios];
`pages/gimnasio/` es la primera excepción a ese patrón plano, deliberada, para que el módulo
quede localizable como unidad. Y una constancia que no puede quedar implícita: **gatear el nav
por `enabledModules` de `/auth/me` es trabajo NUEVO** — el endpoint ya devuelve `enabledModules`
en la respuesta de login, pero ningún frontend lo consume todavía [VERIFIED]. Sin ese trabajo,
el nav de `el-templo-admin` mostraría el módulo Gimnasio a un staff que no lo tiene contratado
aunque la ruta responda 404 igual.

**ALUMNOS** viven en una app nueva del monorepo — el resto de esta sección la especifica.

### (b) Corrección de conteo: el monorepo tiene HOY cuatro apps, no tres

`CLAUDE.md` dice "Monorepo with 3 apps" y está **desactualizado** — la corrección de ese
archivo no es trabajo de esta fase, pero queda anotada acá para que una fase de housekeeping la
tome. El inventario real, verificado sobre el repo y `.github/workflows/deploy.yml`:

| App                | Stack                                  | Rol                             |
| ------------------- | --------------------------------------- | -------------------------------- |
| `el-templo-api`    | Fastify + Drizzle + MySQL               | Backend                          |
| `el-templo-app`    | Quasar + Vue 3 + Capacitor (v1.7.7)     | App de miembros del tenant 1     |
| `el-templo-admin`  | Quasar + Vue 3 (web-only)               | Staff, ya multi-tenant           |
| `el-templo-web`    | Nuxt 4 + `@nuxt/content` (SSG)          | Landing pública `eltemplo.org`   |

La app de alumnos multi-tenant que decide esta sección es la **quinta** app del monorepo, no la
cuarta.

### (c) `el-templo-app` no se transforma

Constancia literal, exigida por D-04: `el-templo-app` **no se transforma**. Sigue siendo la app
de miembros del tenant 1 (aura, niveles, SPOM, AGORA), sin gates de módulo Gimnasio ni código de
multi-tenancy nuevo. La superficie de alumnos multi-tenant vive enteramente en la app nueva de
(d)-(k), no en una transformación de `el-templo-app`.

**Anti-patrón prohibido explícitamente: la app nueva NO se crea clonando `el-templo-app`.**
Clonar hereda tres cosas que matan el diseño en la primera semana: la paleta como variables
SCSS de build-time (`el-templo-app/src/css/quasar.variables.scss`, mata D-12), el modo
`pwa: false` (mata D-12(a)), y el `appId`/`appName` de El Templo (mata D-11) — y arrastra,
además, imports del SPOM que violarían la frontera A1. La app nueva nace del **scaffold de
Quasar**, y de `el-templo-app` toma **patrones puntuales**, nunca el proyecto entero: el logger
`createLogger()`, el token storage con la rama `Capacitor.isNativePlatform()`
(`useTokenStorage.ts`), el boot de Sentry, y el patrón de `sessionPlayerStore.ts` para la
sesión en curso.

### (d) Stack y estructura de la app nueva

Versiones ya presentes en el repo (`el-templo-app/package.json`), reusadas sin instalar nada
nuevo: `quasar` ^2.16.0, `@quasar/app-vite` ^2.4.1, `vue` ^3.5.22, `pinia` ^3.0.4,
`@capacitor/core` ^8.0.1 / `@capacitor/cli` ^8.1.0, `@capacitor/preferences` ^8.0.0, `axios`
^1.13.5, `@sentry/vue` ^10.38.0.

**Modos de `quasar.config.js`:** `spa` + **`pwa: true`** (a diferencia de `el-templo-app`, que
hoy lo tiene con `pwa: false` en su bloque `ssr`) + `capacitor`.

**Estructura por feature-module**, espejando `el-templo-app`:

```
el-templo-alumnos/              # ver nombre elegido en (e)
├── quasar.config.js            # spa + pwa: true + capacitor
├── src-capacitor/               # appId/appName DE PLATAFORMA, ver (e)
└── src/
    ├── boot/                   # sentry.ts PRIMER boot file, axios.ts, tenant.ts (branding runtime)
    ├── css/                    # tokens de marca como CSS custom properties, NUNCA variables SCSS
    ├── stores/                 # Pinia composition API
    ├── composables/            # exponen cleanup(), sin onUnmounted adentro
    ├── modules/
    │   ├── rutina/
    │   ├── sesion/
    │   └── evolucion/
    └── utils/logger.ts         # createLogger() — nunca console.*
```

### (e) Nombre de la app

Discreción explícita del CONTEXT ("proponer en el doc"). Restricción dura de D-11: el nombre de
tienda es de **plataforma**, neutro — no puede ser "El Templo" ni el nombre de un gimnasio
cliente — porque tiene que sostener el modelo "picker" de la guideline 4.2.6 (ver (h)) frente a
N gimnasios distintos dentro del mismo binario.

Dos candidatos evaluados:

1. **"Kaia"** — nombre de marca de plataforma sin significado literal en el dominio fitness, sin
   colisión evidente con apps existentes de rubro gym-management en las tiendas.
2. **"GymOS"** — descriptivo del rol (sistema operativo del gimnasio), pero mucho más genérico y
   con alta probabilidad de colisión de nombre en las tiendas.

**Elegido: "Kaia".** Es más defendible en el modelo "picker" (un nombre de marca, no una
descripción de categoría que compita con otras apps de gestión de gimnasios) y dificulta menos
la búsqueda en tienda.

| Identificador          | Valor                                        |
| ------------------------ | ----------------------------------------------- |
| Directorio en el monorepo | `el-templo-alumnos-kaia`, o corto `kaia-app`  |
| Nombre visible en tiendas | **Kaia**                                       |
| `appId` (reverse-DNS)     | `org.eltemplo.kaia` (dominio de plataforma pendiente, ver (f); el reverse-DNS de plataforma se fija cuando ese dominio se registre — el prefijo `org.eltemplo` es el placeholder hasta entonces) |

### (f) Acceso por subdominio (D-06) y su aprovisionamiento

Acceso: `gimnasioX.<dominio-plataforma>`. La resolución de tenant por hostname ya quedó firmada
en **H-3** (cross-ref, no se re-decide acá): el header `Host` mapea a `tenants.slug` con lookup
exacto, anterior a `attachScope`.

Lo que falta especificar acá es el aprovisionamiento:

- **Wildcard DNS** + **certificado wildcard**, que exige el **challenge DNS-01** de Let's
  Encrypt — HTTP-01 **no** emite certificados wildcard [CITED: letsencrypt.org/docs/challenge-types/].
  En la práctica: un `certbot` con plugin DNS del proveedor y credenciales de API de DNS
  guardadas en el servidor. **No es opcional**: sin DNS-01, cada gimnasio nuevo es un
  certificado emitido a mano, lo que rompe la promesa de alta automática de PLAT-03.
- Un **vhost wildcard** de nginx, no un vhost por gimnasio — el mismo vhost sirve a todos los
  subdominios y resuelve el tenant leyendo `Host` (ver Seguridad del diseño más abajo).
- **El dominio de plataforma no está elegido ni registrado.** `eltemplo.org` es del tenant 1 y
  no sirve como dominio de plataforma: publicar `gimnasioX.eltemplo.org` sería branding de El
  Templo para todos los gimnasios, exactamente lo que D-12 prohíbe. Del dominio de plataforma
  dependen el certificado wildcard, el DNS-01 y la función de `origin` de CORS de (g) — por eso
  es **precondición de la fase 182** (PLAT-02/PLAT-03), y este doc la nombra explícitamente
  porque bloquea esa fase si no se resuelve antes.

### (g) CORS (bloqueo S-3)

Hoy `el-templo-api/src/app.ts` registra `origin` como un **array estático de 5 orígenes**
(`FRONTEND_URL`, `ADMIN_URL`, `https://eltemplo.org`, `capacitor://localhost`,
`http://localhost`). Con N subdominios de gimnasio, un array estático no escala: `origin` pasa a
ser una **función** con anclaje estricto de regex, de la forma:

```
^https://[a-z0-9-]+\.<dominio-plataforma>$
```

**Nunca** un `endsWith(dominioPlataforma)`: un origen del tipo `https://evil-<dominio-plataforma>.com`
pasaría un `endsWith` mal construido sin pasar el anclaje `^https://`. La función de `origin`
valida contra la porción exacta después del esquema, no contra una subcadena al final.

Consignar además: **ningún vhost de front proxea `/api`** [memoria
`reference_admin_nginx_no_proxea_api`] — el llamado del subdominio del gimnasio a la API
**siempre** es cross-origin, nunca same-origin vía proxy. La URL del API se hornea en build vía
`VITE_API_URL`, con su entrada correspondiente en el `.env.example` de la app nueva.

### (h) Publicación en tiendas (D-11)

**Modelo: UNA sola app container multi-tenant**, publicada y mantenida desde la cuenta de la
plataforma (nunca N apps clonadas). Texto vigente de la App Store Review Guideline **4.2.6**
(verificado 2026-08-27): _"Apps created from a commercialized template or app generation service
will be rejected unless they are submitted directly by the provider of the app's content...
Another acceptable option for template providers is to create **a single binary to host all
client content in an aggregated or 'picker' model**"_ [CITED:
developer.apple.com/app-store/review/guidelines/]. La Opción A de D-11 es literalmente el modelo
que Apple nombra como aceptable. Y **4.3(a)** — _"Don't create multiple Bundle IDs of the same
app"_ — es por qué N apps clonadas desde la cuenta de la plataforma está prohibido de plano, no
solo desaconsejado.

**Límites de plataforma que esto impone, verificados:**

- En iOS, `setAlternateIconName` solo permite alternar entre íconos **pre-declarados en el
  bundle** (`CFBundleAlternateIcons`) — no un ícono arbitrario servido en runtime.
- `CFBundleDisplayName` **no se puede cambiar en runtime.**

Consecuencia: el ícono y el nombre en la home del teléfono y en la ficha de la tienda quedan
**genéricos de plataforma** ("Kaia"), nunca el logo/nombre de un gimnasio específico, dentro del
binario que se publica en tiendas.

**Detección de tenant en la app nativa**, dos vías combinadas (una tercera queda descartada por
ahora):

1. **Pantalla "picker" de gimnasio** al abrir la app sin tenant recordado — es además el modelo
   que la propia guideline 4.2.6 nombra, el más defendible en review.
2. **`Preferences` recuerda el último tenant** — reabrir la app entra directo al gimnasio de la
   última sesión, sin repetir el picker cada vez.
3. Deep link / universal link desde el subdominio del gimnasio **no está disponible**: los
   Associated Domains de iOS siguen sin configurarse [memoria
   `reminder_ios_deeplinks_associated_domains`]. Queda nombrado como vía futura, condicionada a
   ese trabajo previo.

**Timing de la primera publicación en tiendas — decisión explícita que este doc fija:** la
superficie **web/PWA por subdominio va primero**, porque habilita ONB-01 (el primer gimnasio
real operando) sin depender de un review de tienda, y porque D-12(a) ya la usa como vía de
marca propia en v1. La **build de tiendas va después**, disparada por un criterio concreto, no
por calendario: **cuando exista al menos un tenant pago que la pida como canal**, o cuando el
volumen de gimnasios activos haga la fricción de "Agregar a inicio" un obstáculo de adopción
medible — lo que ocurra primero. Antes de ese punto, publicar en tiendas es costo de review y de
mantenimiento de build sin un tenant que lo necesite.

### (i) Branding en runtime (D-12)

Los colores se aplican con `setCssVar` de Quasar, que escribe las custom properties `--q-<name>`
en el elemento raíz sin rebuild [CITED: quasar.dev/style/color-palette]. Nombres válidos:
`primary`, `secondary`, `accent`, `dark`, `positive`, `negative`, `info`, `warning`. El valor se
lee de las claves `brand.*` de `tenant_settings` (Definición 7: `brand.color.primary`,
`brand.color.secondary`, `brand.color.accent`), y el logo desde R2 (`brand.logo_url`).

**Regla de diseño concreta y fácil de violar:** todos los tokens de marca propios de la app
(fondos, sombras, acentos, cualquier color que no sea uno de los 8 de Quasar) tienen que ser
**CSS custom properties**, nunca variables SCSS — las variables SCSS de `el-templo-app`
(`quasar.variables.scss`) son build-time y no se pueden cambiar en runtime. Si la app nueva copia
ese patrón, el branding por tenant queda a medias: los 8 colores de Quasar cambiarían con
`setCssVar`, pero los tokens propios seguirían fijos del build.

**Estrategia de marca en dos niveles:**

- **v1:** la PWA por subdominio es la vía de ícono y nombre propios en el teléfono, vía
  "Agregar a inicio" — tenants ilimitados, sin releases de tienda.
- **Futuro, fuera de v6.1:** "tu app con tu marca en la tienda" como add-on premium, vía el
  mismo modelo 4.2.6 — el gimnasio publica desde SU cuenta Apple/Google y paga sus propios fees,
  la plataforma automatiza la build (fastlane/CI). Patrón estándar de SaaS white-label.

La consecuencia que esto impone hoy, no después: **todo el branding es config por tenant, nunca
código**, para que esa build futura sea configuración + assets, sin fork del código de la app.

**Riesgo abierto a escribir explícitamente (asunción A3 del research):** la PWA por subdominio
necesita un `manifest.json` **distinto por tenant** (nombre + íconos), servido dinámicamente por
`Host` o generado por tenant — hoy no hay un mecanismo verificado para eso con un vhost
wildcard. Esta viabilidad se **verifica antes de comprometer** la promesa de marca propia en v1
(fase 182 o 189, spike acotado). **Fallback si no es viable:** un `manifest.json` único
genérico de plataforma para todos los tenants en v1 (ícono/nombre "Kaia"), y la marca propia por
tenant queda en pantalla (colores, logo) pero no en el ícono de "Agregar a inicio" hasta que el
mecanismo de manifest dinámico se resuelva.

### (j) Costo exacto de sumar la quinta app al monorepo (D-05, el split no se adelanta)

Verificado sobre `.github/workflows/ci.yml` y `deploy.yml`: un filtro más en
`dorny/paths-filter`, un job de build más en CI y en deploy, un secret `*_DEPLOY_PATH` más, un
paso de `rsync` más, un smoke test más (mismo patrón que el `curl` del smoke test de
`el-templo-web`), y **un vhost nginx más en el EC2** — trabajo manual por SSH, que es un **gate
humano** según el skill de change-control (con subdominios, es un vhost wildcard, no uno por
gimnasio). Trampa conocida: el `paths-filter` usa `event.before`, así que un commit vacío o mal
armado deploya un no-op de ~11 s en vez de detectar cambios reales [memoria
`reference_deploy_paths_filter_trap`]. Cross-ref a **H-4** para el trigger del split de repos:
nacer en el monorepo (esta decisión) es deliberado y **no** dispara ese trigger — el split sigue
condicionado al primer tenant pago publicado en tiendas.

### (k) Consecuencia colateral a registrar

Las notificaciones push están dormidas para tenants ≠ 1 hasta que exista la app de miembros
multi-tenant. Esta app **desbloquea** esa dependencia estructural, aunque el push no esté en el
alcance de v6.1 — el canal member-facing del SaaS sigue siendo email hasta entonces.

**✅ CERRADA (CONTEXT 2026-08-27 — D-03 / D-04 / D-05 / D-06 / D-11 / D-12)** — traza DIS-02,
PLAT-03, ONB-01, REG-01.

## Seguridad del diseño (STRIDE)

Esta sección traza a **DIS-01** (el modelo de datos y el catálogo global+local que introducen
superficie de aislamiento nueva) y a **DIS-02** (la superficie member-facing que introduce el
subdominio, el CORS abierto y el binario multi-tenant en tiendas).

### Fronteras de confianza

| Frontera                                            | Qué cruza                                                                       | Por qué importa                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Navegador/app del alumno → API, por subdominio       | El header `Host`, que decide de qué gimnasio son los datos servidos               | Es la única entrada nueva que introduce D-06; si se confía sin validar, un `Host` falsificado cruza tenants        |
| Body de request → capa de datos                      | Cualquier campo del payload que pretenda ser `tenant_id`                          | `tenant_id` jamás viaja por el borde (doc 03 §3); si un handler lo leyera del body, sería mass assignment          |
| Outbox offline (Definición 3) → endpoint de sync      | `client_set_uid` y `recorded_at`, ambos generados en el cliente                    | Son entrada del cliente: se validan por formato, nunca se usan para derivar tenant ni para decidir autorización     |
| Buscador del catálogo (CAT-07) → filas de otros tenants | El filtro de scope del catálogo mixto (`tenant_id IS NULL OR tenant_id = ?`)      | Es superficie explícita del guardrail de aislamiento del brief — el buscador no tiene excepción respecto a otras lecturas |
| Profe → datos de alumnos de su gimnasio               | El scope de `assertTenant`, no un chequeo de permiso adicional                    | Sin toggle de consentimiento por decisión de producto (brief §9); el único control es que el profe está scoped a SU tenant |

### Categorías ASVS aplicables

| ASVS                             | ¿Aplica? | Control en este repo                                                                                                                                 |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication                 | Sí        | El login cross-tenant de H-3 es una debilidad real en cuanto exista tenant 2; este diseño la cierra con la resolución por `Host` + login scoped         |
| V3 Session Management              | Sí        | Refresh tokens; hay un problema conocido de replay de refresh (`project_fix_refresh_reuse_scope`) y la app nueva suma un cliente más al mismo mecanismo, sin resolverlo acá |
| V4 Access Control                 | Sí — eje central | `attachScope` + `assertTenant`/`tenantWhere`/`tenantOrGlobalWhere` + uniques compuestas + sentinel de pool + lint de tenancy + manifiesto fail-closed + baterías ISO. El diseño **cabe ahí, no lo rodea** |
| V5 Input Validation                | Sí        | Schemas de Fastify por ruta; las taxonomías cerradas de CAT-06 (grupos musculares, equipamiento, patrones) son validación de entrada en la carga, no posterior |
| V6 Cryptography                   | No directamente | El módulo no maneja secretos propios; nunca hand-roll si en algún punto lo necesitara                                                               |
| V7 Error Handling & Logging       | Sí        | Pino hacia Sentry; el log de ediciones de REG-05 (`gym_log_edits`) sigue el patrón de columnas `before_json`/`after_json` de la tabla `audit_log` existente |
| V13 API                           | Sí        | Toda ruta nueva del módulo entra al manifiesto de `tenant-manifest.ts` o el CI queda en rojo (ISO-01)                                                |

### Registro STRIDE del diseño

| Amenaza                                             | STRIDE                  | Componente                                        | Disposición | Mitigación que el diseño prescribe                                                                                                                              |
| ------------------------------------------------------ | -------------------------- | ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant data leakage                            | Information Disclosure    | Cualquier lectura de tabla `gym_*`                   | mitigate       | `tenantWhere`/`tenantOrGlobalWhere` como primer término de todo `WHERE`, sentinel de pool por query, lint de tenancy por tabla, batería ISO-03; el buscador del catálogo (CAT-07) es superficie explícita del guardrail |
| Mass assignment de `tenant_id` desde el body          | Tampering / Elevation     | Cualquier `INSERT`/`UPDATE` sobre tabla `gym_*`      | mitigate       | `tenantValues` pone `tenantId` DESPUÉS del spread — pisa cualquier `tenantId` que llegue en el body; la columna no se expone en ningún schema de request         |
| Tenant confusion en el login                          | Spoofing                   | `POST /api/auth/login` de la app de alumnos          | mitigate       | Login scoped por el tenant resuelto del `Host` (H-3), no cross-tenant por email                                                                                     |
| **Host header injection** (amenaza NUEVA de D-06)     | Spoofing                   | Resolución de tenant por `Host` en la capa nueva anterior a `attachScope` | mitigate | nginx fija `server_name` y `proxy_set_header Host` explícitos (no confía en lo que llega del cliente sin normalizar); la API valida el `Host` contra `tenants.slug` con lookup exacto; `Host` no resoluble se **rechaza**, nunca `?? 1` |
| Module enumeration                                    | Information Disclosure    | `requireModule` sobre cualquier ruta del módulo Gimnasio | mitigate   | Responde **404**, no 403 — un módulo apagado es indistinguible de una ruta inexistente (`module-registry.ts`)                                                        |
| Privacidad profe → alumno                             | Information Disclosure    | Panel del profe sobre datos de alumnos               | accept         | Sin toggle de consentimiento por decisión de producto (brief §9); el control es que el profe solo ve alumnos **de su gimnasio** — access control de tenant, ya cubierto por V4 |
| Replay del sync offline                               | Tampering                 | Endpoint de sync de `gym_set_logs`                   | mitigate       | Unique `(tenant_id, client_set_uid)` + upsert idempotente; `client_set_uid` se valida por formato y **jamás** se usa para derivar el tenant                          |
| **CORS demasiado laxo** (amenaza NUEVA de D-06)       | Elevation of Privilege     | Función `origin` de CORS con N subdominios de gimnasio | mitigate     | Anclaje estricto `^https://[a-z0-9-]+\.<dominio-plataforma>$`; `endsWith` prohibido explícitamente por este doc                                                       |
| Binario único multi-tenant como superficie de confusión | Spoofing                  | Selección de tenant en la app nativa (picker)        | mitigate       | El picker solo selecciona a qué `Host` apuntar; la autorización real la resuelve el servidor con el login scoped de H-3, nunca el cliente                            |

### El único fallback prohibido para siempre

El módulo Gimnasio **no construye enforcement propio.** Cabe dentro de las cinco capas de v6.0
(resolución por `Host`/`CountryScope`, `attachScope`, `tenantWhere`/`tenantValues`, sentinel de
pool, lint + manifiesto + baterías ISO) o el CI lo frena. Y el único fallback prohibido para
siempre, en todo el repo, es resolver un tenant no resoluble con un default (`?? 1`) o con un
non-null assertion — la misma prohibición que ya fija `tenant.ts` para el resto del sistema, sin
excepción nueva para la superficie por subdominio.

## Frontera A1/A2 y qué NO se construye

### (a) La frontera, afirmada de forma verificable

El módulo Gimnasio tiene **tablas propias**: las doce de la Definición 6, todas con
prefijo `gym_`, sin excepción. Tiene **rutas propias**, registradas con
`moduleScope(app, "gimnasio", gimnasioRoutes, { prefix: "/api/gimnasio" })` — el mismo
mecanismo de `moduleScope` que ya usan los cuatro módulos existentes (doc 04). Tiene
**cero imports desde o hacia el SPOM, en ninguna dirección**: ninguna tabla `gym_*` tiene
ni tendrá una FK a `exercises` ni a ninguna otra tabla del SPOM, y ningún archivo bajo
`el-templo-api/src/modules/gimnasio/` (o el nombre final del directorio del módulo)
importa nada de `el-templo-api/src/modules/spom/` ni viceversa. `exercises` del SPOM
**no se toca** (A2) — cero migraciones sobre esa tabla, cero columnas nuevas, cero lectura
desde una ruta del módulo Gimnasio.

El acople hacia el core se limita a tres cosas, y solo a esas tres: FKs sobre `users`,
`branches` y `tenants` (las mismas que usa cualquier tabla gym-owned del resto del
sistema); y la **lectura** de `subscriptions` para saber si un socio está activo, siempre
a través de los helpers de `shared/active-member.ts` (`activeMemberExists` y familia) —
**nunca con un SELECT propio** contra `subscriptions`. No hay una cuarta forma de
acoplarse: ni un import directo de un service del SPOM, ni una tabla `gym_*` con FK a una
tabla del SPOM, ni una escritura del módulo Gimnasio sobre una tabla que no sea suya.

**Cómo se verifica esto cuando haya código** (los cuatro mecanismos ya existen y son
fail-closed, ninguno se construye de nuevo):

- **El lint de tenancy** (§4.2 capa 4 del README) — todo `sql\`\`` o join sobre una tabla
  gym-owned tiene que referenciar `tenant_id` o llevar una anotación de exención con
  motivo; una tabla `gym_*` sin `tenant_id` en el WHERE deja el build en rojo.
- **El manifiesto de rutas** (`test/tenant-manifest.ts`, ISO-01) — toda ruta de
  `/api/gimnasio/*` entra clasificada (`gimnasio` como `modulo`, `feature-module` como
  `categoria` tras H-2); una ruta sin clasificar deja `test/tenancy/iso-01-manifiesto.test.ts`
  en rojo.
- **La clasificación de `tenant-tables.ts`** (H-1) — las doce tablas `gym_*` entran a
  `GYM_OWNED_TABLES` o a `TENANT_MIXED_SCOPE_TABLES`; una tabla nueva sin clasificar deja
  `test/db/tenant-tables.test.ts` en rojo.
- **Las baterías ISO de aislamiento cross-tenant** (§4.2 capa 5 del README) — siembran 2
  tenants y verifican cero datos cruzados en cada endpoint; una ruta del módulo Gimnasio
  que filtre mal cae ahí, no en un review manual.

### (b) Qué NO se construye

Del research de la fase (`181-RESEARCH.md`, sección "Don't Hand-Roll"): la maquinaria de
tenancy de v6.0 ya resuelve estos ocho problemas, y el módulo Gimnasio los reusa tal
cual, sin reinventarlos.

| Problema                              | No construir                                                   | Usar en su lugar                                                                    | Por qué                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtrar por gimnasio                  | Un `WHERE tenant_id = ...` a mano en cada query                 | `tenantWhere` / `tenantOrGlobalWhere` (H-1) / `tenantValues` / `assertTenant`         | Firma lockeada por el doc 03 §3; el sentinel y el lint verifican que se usen. Un filtro a mano pasa el typecheck y falla la batería ISO      |
| Gate del módulo                       | Un `if (settings.gimnasio)` por handler                         | `moduleScope(...)` + `requireModule`                                                    | Responde 404 (no 403) para no revelar el feature; ISO-01 exige que TODA ruta del módulo lo tenga                                            |
| Leer un flag de `tenant_settings`     | Una query + parseo propios                                       | `enabledModulesFor` / `isModuleEnabled` (+ el helper análogo `gimnasio.*` de Def. 7)   | Cache con TTL fail-closed, invalidación exportada, TTL=0 en test para no arrastrar estado entre archivos                                    |
| Saber si un socio está activo         | Un `SELECT` propio sobre `subscriptions`                         | `activeMemberExists` y familia (`shared/active-member.ts`)                              | 5 variantes ya escritas (paga / no-especial / por kind) — exactamente el "leer `subscriptions`" que A1 del brief permite                    |
| Barrer todos los gimnasios en un cron | Un `for` sobre `SELECT * FROM tenants`                           | `forEachActiveTenant`                                                                    | Compara positivamente contra `'active'` (un estado nuevo queda denegado por default) y aísla errores por iteración                          |
| Colores por tenant                    | Regenerar CSS por gimnasio o servir hojas de estilo distintas    | `setCssVar` sobre `--q-*`                                                                | API oficial de Quasar, sin rebuild ni fork (ver DIS-02 (i))                                                                                  |
| Storage local con rama nativo/web     | Un wrapper nuevo                                                  | El patrón de `useTokenStorage.ts` (`Capacitor.isNativePlatform()`)                      | Ya resuelto y probado en producción                                                                                                          |
| Deduplicar el sync offline            | Comparar por timestamp o por contenido                            | Unique `(tenant_id, client_set_uid)` + upsert (Definición 3)                             | La única forma barata de que reintentos y doble-tap sean no-eventos                                                                          |
| Numerar una migración                 | Confiar en `drizzle-kit generate`/`migrate`                       | Hand-written desde **0216**, junto al schema Drizzle, en el mismo commit                | El journal de `drizzle-kit` está stale y `drizzle-kit migrate` está prohibido (CLAUDE.md); el runner custom es la única fuente de verdad     |

### (c) Anti-patrones nombrados

- **Recalcular récords en un hook `event`** del registry de módulos — los `event` son
  best-effort y aislados por diseño; un récord perdido ahí no rompería nada visible y
  nadie se enteraría (Definición 4).
- **Definir los tokens de marca de la app nueva como variables SCSS**, copiando
  `quasar.variables.scss` de `el-templo-app` — son build-time, matan el branding en
  runtime que pide D-12 (DIS-02 (i)).
- **Resolver un tenant no resoluble con un default (`?? 1`) o un non-null assertion** —
  prohibido en todo el repo, para siempre, sin excepción nueva para la resolución por
  `Host` (H-3, Seguridad del diseño).
- **Referenciar el ejercicio planificado en el registro** — se guarda el efectivamente
  **realizado**, nunca el planificado (REG-04, Definición 4 y Definición 6).
- **Un flag por carpeta** en vez de un módulo comercial grueso — el módulo Gimnasio es
  **uno**, no una colección de sub-flags (H-2, doc 04 §2.1).
- **`;` dentro de comentarios `--` en las migraciones** — rompió todo el CI una vez
  (migración 0119); las migraciones del módulo lo evitan desde la 0216 en adelante
  (Definición 6, "Encaje con los gates de CI").

## Trazabilidad REQ → sección

Cobertura de los 37 REQ IDs de v1 que este diseño condiciona, directa o como
precondición de plataforma. Las fases 182-192 se planifican contra esta tabla, no contra
una relectura del addendum A1-A7.

| REQ     | Qué decide el doc                                                                                                            | Sección                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| DIS-01  | Calistenia y Gimnasio no comparten modelo de datos; módulo duro con tablas propias, exclusión mutua por tenant (D-01/D-02)   | Definición 1 / H-2                                          |
| DIS-02  | Superficie member-facing completa: dos superficies, app nueva "Kaia", subdominio por gimnasio, tienda como container único    | DIS-02 — Superficie member-facing multi-tenant / H-3 / H-4  |
| CAT-01  | Catálogo global+local en una tabla `gym_exercises` con `tenant_id` NULLable (NULL=global); todos ven global+propias           | H-1 / Definición 2                                           |
| CAT-02  | Cada gimnasio inserta sus propias filas con su `tenant_id`, vía `tenantValues` sin cambios                                    | H-1 / Definición 2                                           |
| CAT-03  | Copia local automática al editar un ejercicio global; `copied_from_exercise_id` es puntero informativo, no FK a seguir        | Definición 2                                                 |
| CAT-04  | Promoción local→global = `UPDATE ... SET tenant_id = NULL`, `id` preservado, cero migración de datos                          | H-1 / Definición 2                                           |
| CAT-05  | Desactivación con `status` enum (`borrador`/`publicado`/`desactivado`), nunca `deleted_at`; historial sigue resolviendo       | Definición 2                                                 |
| CAT-06  | Tres taxonomías cerradas (14 grupos musculares, 25 equipamientos, 9 patrones), validadas en la carga                          | Definición 2                                                 |
| CAT-07  | Aislamiento del buscador con el mismo `tenantOrGlobalWhere`, sin excepción ni atajo                                            | Definición 2                                                 |
| CAT-08  | Categoría derivada (7 valores) por mapeo fijo desde el grupo muscular; el generador de catálogo usa el mismo mapeo            | Definición 2 (D-10)                                          |
| RUT-01  | Plantillas de rutina globales+locales con la misma regla de scope mixto que el catálogo (una sola decisión para las dos)      | H-1 / Definición 2                                           |
| RUT-02  | Días y ejercicios de plantilla; agrupación de superserie/circuito como columnas en la fila del ejercicio                       | Definición 5 / Definición 6                                  |
| RUT-03  | La rutina asignada es copia inmutable; no sigue ediciones de la plantilla de origen                                            | Definición 5                                                 |
| RUT-04  | Copia inmutable al asignar (`gym_assigned_routines`); clonado es `INSERT ... SELECT`, agrupación viaja sola                    | Definición 5 / Definición 6                                  |
| RUT-05  | Una rutina activa por vez, resuelto por `idx_gym_assigned_routines_active (tenant_id, user_id, status)`                        | Definición 6                                                 |
| RUT-06  | Modificación en curso: el profe edita la fila directamente, `last_modified_at`/`last_modified_by_user_id`, sin tabla de versiones | Definición 6 (subsección RUT-06)                          |
| RUT-07  | Autogestión (crear rutina propia) gateada por `gimnasio.self_service.enabled`, default `"false"`                               | Definición 7                                                 |
| RUT-08  | La agrupación de superserie/circuito viaja igual en la plantilla y en la rutina asignada                                       | Definición 5 / Definición 6                                  |
| REG-01  | Idempotencia de la serie vía `client_set_uid` + unique `(tenant_id, client_set_uid)`; resuelve el doble-tap                    | Definición 3                                                 |
| REG-02  | Timeout de abandono evaluado server-side con `forEachActiveTenant`; default parametrizable `gimnasio.session.abandon_timeout_hours` | Definición 3 / Definición 6 / Definición 7               |
| REG-03  | Offline SOLO la sesión en curso; outbox sobre `@capacitor/preferences`; unidad de peso parametrizable `gimnasio.units.weight` | Definición 1 / Definición 3 / Definición 7                   |
| REG-04  | El registro y el récord se acumulan contra el ejercicio REALIZADO, nunca el planificado                                        | Definición 4 / Definición 6                                  |
| REG-05  | Edición/baja recalcula el récord completo (nunca decremento manual); log de ediciones en `gym_log_edits`, ventana parametrizable | Definición 3 / Definición 4 / Definición 6 / Definición 7  |
| VAL-01  | Valoración de dificultad opcional por ejercicio de sesión (`gym_session_exercises.rating`)                                     | Definición 4 / Definición 6                                  |
| VAL-02  | Registro de molestia opcional (`had_discomfort` + ubicación/notas) en la misma fila                                             | Definición 6                                                 |
| EVO-01  | Récord personal recalculado transaccionalmente en el momento; tabla `gym_personal_records` con `achieved_at`                   | Definición 4 / Definición 6                                  |
| EVO-02  | "Qué hizo la última vez" servido por el mismo índice de cobertura (`ORDER BY performed_at DESC LIMIT 1`)                       | Definición 6                                                 |
| EVO-03  | Sesiones completadas en el mes, mismo rango de `idx_gym_sessions_user_status`, sin índice adicional                             | Definición 6                                                 |
| PROF-01 | Lista de alumnos con rutina activa (`idx_gym_assigned_routines_active`) y última sesión (`idx_gym_sessions_user_status`); señales vía PROF-02 | Definición 6                                  |
| PROF-02 | Umbrales de señales parametrizables por gimnasio en `tenant_settings` (`hard_streak`, `easy_streak`, `inactivity_days`)        | Definición 7                                                 |
| PROF-03 | Planificado vs. realizado por ejercicio y valoraciones, tabla `gym_session_exercises`; el profe edita desde `gym_assigned_routine_exercises` | Definición 6                                    |
| PLAT-03 | Flag `module.gimnasio.enabled` + los 8 parámetros de `tenant_settings` que el wizard de alta siembra                            | H-2 / Definición 7 / DIS-02                                   |
| ONB-01  | Precondición: login scoped por el tenant resuelto del `Host`, en producción antes de que arranque la fase 192                  | H-3 / DIS-02                                                  |
| PLAT-01 | El doc **fija el modelo** (tabla `platform_users` aparte) para que la fase 182 no lo re-litigue; la implementación es de la 182 | Decisiones heredadas por las fases 182-192                   |
| PLAT-02 | El doc nombra el dominio de plataforma como precondición bloqueante del cert wildcard, DNS-01 y CORS; no lo elige ni registra  | DIS-02 (f) / Decisiones heredadas por las fases 182-192      |
| PLAT-04 | Nada — el panel de métricas por tenant es superficie de plataforma, fuera del modelo de datos del módulo Gimnasio             | Decisiones heredadas por las fases 182-192                   |
| PLAT-05 | Nada directo — el enforcement 403 de `tenants.status` ya existe desde v6.0; el módulo Gimnasio no agrega mecanismo nuevo      | Decisiones heredadas por las fases 182-192                   |

## Decisiones heredadas por las fases 182-192

Lo que queda abierto después de este doc, y a quién le toca — sin dejarlo implícito.

**Modelo del rol de plataforma (PLAT-01, implementación en fase 182) — el doc lo FIJA
acá.** Los hechos verificados que acotan la decisión: `roleEnum`
(`el-templo-api/src/db/schema/users.ts:20-26`) tiene exactamente 6 valores (`member`,
`coach`, `admin`, `owner`, `gestion`, `recepcion`), ninguno de plataforma; y
`users.tenant_id` es `NOT NULL DEFAULT 1` con `assertTenant` (`shared/tenant.ts`) que
**deniega** (403 `TENANT_UNRESOLVED`, fail-closed) un tenant nulo — o sea que hoy un
usuario **no puede** existir por encima de los tenants, esa es una invariante absoluta de
todo el sistema.

| Opción                                            | Forma                                                                                          | Costo                                                                                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Usuario del tenant 1 con rol especial**       | Agregar `"platform"` a `roleEnum`; el super-owner vive en `users` con `tenant_id = 1`            | Barata de tipar (un valor de enum), pero conflates la operación de plataforma con El Templo (tenant #1 es un cliente más, no la plataforma); todo reporting/cron que enumere "usuarios de tenant 1" tiene que aprender a excluirlo a mano; si tenant 1 se suspende/archiva alguna vez, el acceso de plataforma queda atado a ese estado por accidente |
| **B. Tabla `platform_users` aparte**               | Tabla nueva, fuera de `users`, con su propio login/JWT que **nunca** lleva `tenant_id`            | Tabla + endpoint de auth propios (trabajo acotado); nunca pasa por `assertTenant` porque no tiene tenant que resolver — no hace falta ninguna excepción a la invariante `NOT NULL` de `users.tenant_id` ni al enum de roles     |
| **C. Tenant reservado de plataforma**              | Fila especial en `tenants` (`id` reservado); usuario normal con `tenant_id = PLATFORM_ID`         | Mismo problema que la Opción C de H-1: agrega una fila a `tenants` que `forEachActiveTenant` tendría que aprender a saltear en los 7 crons, y el `status` de esa fila termina gobernando por accidente el acceso de plataforma |

**Decisión que este doc fija: Opción B.** Es la única de las tres que no dobla ninguna
invariante existente — no toca `roleEnum`, no toca la restricción `NOT NULL` de
`users.tenant_id`, y no agrega una fila a `tenants` que los crons tengan que aprender a
excluir. El super-owner nunca es una fila de `users` ni de `tenants`: es una entidad de
autenticación estructuralmente separada, con su propio login que no resuelve tenant
porque no tiene ninguno que resolver. La fase 182 implementa la tabla, el endpoint de
login y el JWT (audience/claim distintos del de `users`), pero no vuelve a discutir si el
super-owner "es" un usuario de tenant 1 o una fila de `tenants` — esa pregunta queda
cerrada acá.

**Dominio de plataforma sin elegir ni registrar (PLAT-02, fase 182).** Bloquea el
certificado wildcard, el challenge DNS-01 y la función de `origin` de CORS (DIS-02 (f) y
(g)). Es precondición del wizard de alta (PLAT-02/PLAT-03) — este doc lo nombra, no lo
resuelve.

**PLAT-04/PLAT-05 (fase 183): nada de este doc los condiciona.** El panel de métricas por
tenant y la suspensión/archivado desde el panel son superficie de plataforma que no toca
el modelo de datos del módulo Gimnasio; el enforcement 403 de `tenants.status` que
PLAT-05 reusa ya existe desde v6.0 (§4.2 capa 1 del README).

**Contrato de tipos API↔frontends.** Decisión abierta ya registrada en el README (§6):
hoy los tipos se espejan a mano con comentarios `// Mirrors el-templo-api/...`. Con la
app nueva de DIS-02, el monorepo pasa a tener **cinco** frontends que consumen la misma
API — el drift silencioso empeora con cada frontend nuevo. Este doc no la resuelve, la
nombra como consecuencia asumida que la fase 182 o una fase de housekeeping posterior
debe tomar.

**Reglas de producto que Franco firma junto con el doc (Task 3 de este plan):**

- Una sesión que sincroniza **después** del timeout de abandono acepta las series igual
  (nada se borra), pero la sesión **no** vuelve a `completada` salvo cierre manual
  explícito del alumno (Definición 3, Open Question 6 del research).
- El default `"3"` de `gimnasio.signals.easy_streak` es elección de este diseño, no del
  brief — el brief solo da default para "Difícil" (Definición 7, A7 del research).
- El récord/registro se acumula contra el ejercicio **realizado**, nunca el planificado
  (REG-04, Definición 4).

**Asunciones a re-verificar antes de comprometerlas (fases 182/189):**

- El `manifest.json` distinto por subdominio (DIS-02 (i), asunción A3 del research): no
  hay hoy un mecanismo verificado para servirlo dinámicamente por `Host` con un vhost
  wildcard. Se verifica con un spike acotado antes de comprometer la promesa de marca
  propia en v1; el fallback (manifest único genérico "Kaia") ya está escrito en DIS-02
  (i).
- El texto vigente de las App Store Review Guidelines (4.2.6, 4.3(a)) citado en DIS-02
  (h), si este doc se ejecuta semanas después de escrito (asunción A10 del research):
  Apple las revisa varias veces por año.

## Registro de cambios

- **2026-08-27** — Creación. Esqueleto del doc con las 15 secciones canónicas y el
  verificador estructural (`verificar-doc-08.sh`).
- **2026-08-27 — Creación.** Doc completo: las 4 precondiciones de plataforma (H-1
  catálogo global+local con `tenant_id` NULLable; H-2 categoría `feature-module` +
  `"gimnasio"` en `MODULE_NAMES`; H-3 resolución de tenant por hostname + login scoped,
  que cierra la diferida de login/dominios del README; H-4 re-enunciación del trigger de
  split de repos), las 7 definiciones del brief respondidas (modelo de datos separado del
  SPOM, catálogo global/local, offline solo-sesión-en-curso, récords transaccionales,
  superseries por columnas en la fila, doce tablas nuevas `gym_*` con el índice de
  cobertura `idx_gym_set_logs_hist`, y el mapa de 8 parámetros + 7 claves de branding en
  `tenant_settings`), y la superficie member-facing (DIS-02: dos superficies — staff en
  `el-templo-admin`, alumnos en la app nueva "Kaia" del monorepo, subdominio por gimnasio,
  app container única en tiendas con branding en runtime). Cierra con la frontera A1/A2
  verificable, la trazabilidad a los 37 REQ IDs de v1 y las decisiones heredadas por las
  fases 182-192 (modelo de PLAT-01 fijado). Pendiente: firma de Franco (D-09).
