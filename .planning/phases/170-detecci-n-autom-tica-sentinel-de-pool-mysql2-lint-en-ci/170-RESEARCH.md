# Phase 170: Detección automática — sentinel de pool mysql2 + lint en CI - Research

**Researched:** 2026-07-28
**Domain:** Runtime SQL interception (mysql2 pool / Drizzle driver) + static AST analysis (TypeScript compiler API) + CI ratchet mechanics
**Confidence:** HIGH (todas las decisiones críticas verificadas ejecutando código real de `node_modules` y leyendo `origin/master`; cero dependencias nuevas)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ruido en prod y métrica (sentinel)**

- **D-01:** **Dedup por fingerprint** en prod/staging: la primera aparición de cada SQL violador distinto (el texto con placeholders `?` que ve el pool YA es el fingerprint) emite `log.error` con detalle; las repeticiones solo incrementan un contador. Motivo: hoy cero módulos están migrados — sin dedup, el sentinel flaggearía casi todo el tráfico de prod y taparía errores reales.
- **D-02:** La "métrica" es **contador in-memory + resumen periódico en log** (p. ej. cada hora, log estructurado con totales y top tablas/queries violadoras). Grepeable vía pm2/Pino, cero dependencias nuevas. **NO Sentry** para esta deuda conocida (no mezclar con errores reales del dashboard).
- **D-03:** El sentinel inspecciona **todas las queries** — SELECT y escrituras (diseño cerrado del doc 03; una lectura sin `tenant_id` es la fuga peor: devuelve datos de otro gimnasio).
- **D-04:** Ventana de observación (criterio 2): el inventario grueso de excepciones sale **determinístico de correr la suite con el sentinel en modo inventario** (~140 archivos de test ejercitan el SQL real); después **2-3 días en staging** con uso del staff confirman y cierran la lista. No semanas de observación pasiva.

**Mecanismo de "módulo migrado" (lista strict)**

- **D-05:** La lista strict (throw) vive en **`src/db/tenant-tables.ts`** junto a `GYM_OWNED_TABLES` y `TENANT_GLOBAL_UNIQUES` — fuente canónica única, ya vigilada por los gates de forma del 168-05.
- **D-06:** Granularidad **por módulo → tablas** (`Record<módulo, tabla[]>`, p. ej. `{ finance: [...] }`): una fase de adopción = una entrada. El sentinel la aplana internamente. Arranca **vacía** en la 170 (la primera entrada la agrega la 172).
- **D-07:** El sentinel es **parametrizable**: acepta la lista strict por parámetro (default: la de `tenant-tables.ts`). El test del criterio 1 inyecta una tabla real como strict, dispara una query sin `tenant_id` y afirma el **throw con el SQL en el mensaje**. NO se declara migrada ninguna tabla real en esta fase.
- **D-08:** En la corrida normal de tests, las tablas no-strict quedan **en silencio** (el output de la suite no se ensucia). Un flag (p. ej. `SENTINEL_INVENTORY=1`) activa el **modo inventario**: junta todas las violaciones y escupe el reporte agregado al final — es la fuente del inventario de D-04.

**Forma del lint**

- **D-09:** **Script standalone tsx** (idioma `verify-tenant-*` del repo): exit codes 0 = limpio / 1 = violaciones / 2 = error de uso o interno, step propio en el job de CI del API que rompe el build, y comando local (`pnpm lint:tenant` o similar). **NO regla ESLint** (el API no tiene config ESLint y armarla es la pieza más cara), **NO gate Vitest** (pagaría los ~96 s del provisioning MySQL que `test/setup.ts` impone a todo archivo de test — hallazgo 169-07).
- **D-10:** Análisis por **AST con el compiler API de TypeScript** (ya es dependencia — cero deps nuevas; regla del repo: no instalar deps sin preguntar). El AST distingue un ` sql` ``real de una mención en prosa/comentario y ancla la exención al **comentario de bloque en el sitio del write** — cierra el hallazgo 169-09: el grep crudo de`tenant-safe:` da 11 archivos y solo 9 son exenciones reales (`require-tenant.ts:44`y`schema/tv.ts:81` son prosa).
- **D-11:** Corre en **CI + comando local manual**. NO en pre-commit (no sumar segundos de análisis de proyecto entero a todos los commits).
- **D-12:** El lint **valida también las exenciones existentes** (criterio 3): motivo no vacío, anclaje a un sitio real de query (no prosa suelta), y emite el inventario completo (los 9 actuales, listados en 169-09-SUMMARY) en una salida revisable de una sola pasada.

**Allowlist decreciente**

- **D-13:** Formato de entrada: **archivo + tabla gym-owned accedida** (sin números de línea — estable ante ediciones). Un acceso nuevo a otra tabla en el mismo archivo = entrada nueva = rojo. Mapea 1:1 con la adopción por módulo.
- **D-14:** Anti-crecimiento **duro**: el step de CI compara la allowlist contra la rama base (merge-base con master; `event.before` en push directo — ver trampa de `paths-filter` en las refs) y **entradas ganadas = build rojo**. Además, entradas **stale** (el sitio ya no viola o el archivo no accede más esa tabla) = rojo, forzando el achique.
- **D-15:** **Coherencia strict/allowlist enforced**: tabla presente en la lista strict del sentinel con entradas vivas en la allowlist = rojo. Cada fase de adopción queda obligada a vaciar sus entradas al activar el throw.
- **D-16:** Baseline **one-shot**: el modo de generación se corre UNA vez en esta fase para poblar la allowlist inicial (revisada y commiteada). **No queda comando regenerador permanente** — sería la puerta trasera del ratchet; achicar es borrar entradas a mano al migrar.

**Lockeadas por diseño (NO re-litigar)**

- Sentinel envuelve `pool.query/execute` por debajo de Drizzle (doc 03 capa 3); **detecta, no re-escribe** SQL.
- test/dev = throw (para strict); prod = `log.error` + métrica, jamás throw (decidido con Nacho 2026-07-02).
- Exenciones `/* tenant-safe: <motivo> */` viajan en el SQL y son grepeables; formato ya establecido con 9 exenciones reales escritas en la 169.
- Limitación asumida y documentada: el sentinel chequea **presencia** de `tenant_id`, no corrección del filtro — es tripwire contra el olvido; la corrección la prueba la capa 5 (fase 171+).
- Lista de 87 tablas gym-owned = `GYM_OWNED_TABLES` de `src/db/tenant-tables.ts` (generada/validada en la 167, con gates de forma).

### Claude's Discretion

- Forma exacta del parser del sentinel ("parsea trivialmente" per doc 03): cómo extraer nombres de tabla del SQL y detectar presencia de `tenant_id` con mínimos falsos positivos; qué hacer con statements no-DML (SET, SHOW, transacciones).
- Nombre y ubicación del script de lint, del pnpm script y del archivo de allowlist.
- Detalle del resumen periódico (intervalo exacto, forma del log estructurado).
- Cómo se integra el wrap del pool en `plugins/database.ts` (decorar antes de `drizzle(pool)` vs proxy del pool) — mientras quede por debajo de Drizzle.
- Qué considera el lint como "presencia de tenant_id": uso de `tenantWhere`/`tenantValues` cuenta como cumplimiento (son la forma correcta que el sentinel premia — fase 169).

### Deferred Ideas (OUT OF SCOPE)

- Endurecer el sentinel de prod (pasar de `log.error` a throw) — explícitamente pospuesto por diseño "endurecer después con datos reales" (README §4.2); no es de esta fase ni está roadmapeado.
- Config ESLint para el API (feedback en editor) — descartada como forma del lint de esta fase; si algún día se arma ESLint en el API, la regla podría portarse.
- Sistema de métricas real (Prometheus/OTel) — la "métrica" de esta fase es contador + log; una infraestructura de métricas es otra conversación.
- `v51-milestone-data-rollout.md` — falso positivo por keywords, ya revisado y NO foldeado.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID         | Description                                                                                                                                                                                                       | Research Support                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CON-05** | Sentinel de pool mysql2 detecta SQL sobre tabla gym-owned sin `tenant_id`: test/dev = throw para módulos migrados, prod = `log.error` + métrica; exenciones `/* tenant-safe: <motivo> */` respetadas y grepeables | §Hallazgo 1 (dónde interceptar — `pool.query` **+ `pool.getConnection()`**, probado); §Hallazgo 2 (parser verificado contra 14 casos, incluido el trap de la proyección `select *`); §Hallazgo 4 (canal de exención del sentinel vs. del lint — brecha de diseño a resolver); Pitfalls 1-4, 8                             |
| **CON-06** | Lint estático en CI falla ante ` sql` ``/`.from()`sobre gym-owned sin`tenant_id` ni anotación (allowlist decreciente por módulo)                                                                                  | §Hallazgo 3 (anclaje de comentarios por AST **validado contra los 9 sitios reales** de `origin/master`, incluidos los 2 rechazos correctos de prosa); §Hallazgo 5 (mapa identificador→tabla física requiere AST: el regex resuelve solo 21/92); §Hallazgo 6 (merge-base en CI necesita `fetch-depth: 0`); Pitfalls 5-7, 9 |

</phase_requirements>

---

## Summary

Esta fase tiene **dos piezas técnicamente independientes** con un solo activo compartido (la lista de 87 tablas de `src/db/tenant-tables.ts`) y un formato de anotación compartido (`/* tenant-safe: <motivo> */`). Toda la investigación se hizo ejecutando el código real de `node_modules` y leyendo `origin/master` (el checkout principal está **262 commits atrás**, confirmado por `git rev-list --left-right --count origin/master...HEAD` → `262 86`) [VERIFIED: ejecución local].

**El hallazgo que redefine el plan del sentinel:** envolver `pool.query`/`pool.execute` —tal cual dice el doc 03 §3 capa 3— **no ve ni una sola query dentro de una transacción**. Probado ejecutando Drizzle 0.45.1 contra un pool instrumentado: fuera de transacción llama `pool.query(...)`; dentro, llama `pool.getConnection()` una vez y después dirige **todos** los statements (`begin`, los SELECT, los INSERT, `commit`) a `connection.query(...)`. El repo tiene **65 call sites de `.transaction(` en 25 archivos** — o sea, precisamente el camino de escritura, donde una fuga de tenant es más cara, quedaría ciego. El sentinel **debe** envolver también `getConnection()` y decorar la `PoolConnection` devuelta.

**El hallazgo que redefine el parser:** el chequeo ingenuo "¿el SQL menciona `tenant_id`?" produce un **falso negativo en el peor caso posible**. `db.select().from(schema.bookings)` sin `where` emite `` select `id`, `tenant_id`, `member_id` from `bookings` `` — Drizzle expande la proyección a todas las columnas, **incluida `tenant_id`**, así que un scan completo de tabla sin ningún filtro pasa el sentinel. La corrección es barata y verificada: recortar la lista de proyección (todo entre el `select` inicial y su `from`) antes de buscar `tenant_id`. Un parser candidato con esa regla acierta los 14 casos representativos, incluidos control de transacción, introspección y exenciones.

**Del lado del lint, la mejor noticia:** el anclaje de comentarios por AST **ya está validado contra los 9 sitios de exención reales de `origin/master`** — encuentra los 3 inline (uno de ellos un comentario _trailing_ sobre `.insert(schema.tvPairings)`) y los file-level, y **rechaza correctamente los 2 casos de prosa** que el grep crudo autorizaba (`schema/tv.ts:81` es un `//`, `require-tenant.ts:44` está adentro de un JSDoc). El escaneo AST completo de los 382 archivos de `src` tarda **606 ms** — barato para CI y para un comando local.

**Primary recommendation:** Plantear el sentinel envolviendo **`query` + `execute` + `getConnection`** sobre el pool ya creado en `plugins/database.ts` (monkeypatch de propiedades propias, no `Proxy`, para conservar la identidad del objeto que `fastify.decorate("dbPool", pool)` y 18 sitios de test ya usan); parser con recorte de proyección + skiplist de no-DML; y lint como script `tsx` con `ts.createSourceFile` (sintáctico, **sin** type checker), con un mapa identificador→tabla física construido por AST desde `src/db/schema/*.ts`. Resolver antes de planificar la **brecha de canal de exención** descrita en el Hallazgo 4 — es la única contradicción real entre el doc de diseño y el código que la 169 dejó escrito.

---

## Architectural Responsibility Map

| Capability                              | Primary Tier                                    | Secondary Tier                 | Rationale                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interceptar el SQL final de toda la app | Data-access (capa de pool mysql2)               | —                              | Es el único punto por donde pasa el 100% del SQL: query builder, ` sql` `` crudo y joins. Por encima (Drizzle) no hay hook — verificado, ver Alternatives. |
| Clasificar tabla gym-owned / exenta     | Metadata del modelo (`src/db/tenant-tables.ts`) | —                              | Fuente canónica única ya vigilada por gates (D-05). Sentinel y lint la **importan**, no la duplican.                                                       |
| Decidir throw vs log vs silencio        | Sentinel (runtime)                              | Config de entorno (`NODE_ENV`) | La severidad es una función de (entorno × lista strict); no de la tabla.                                                                                   |
| Emitir la métrica / resumen periódico   | Sentinel (runtime, in-memory)                   | Pino / pm2 (transporte)        | D-02: contador + log estructurado, cero infraestructura nueva.                                                                                             |
| Detectar el olvido en el PR             | Lint estático (CI)                              | —                              | Atrapa antes de mergear lo que el sentinel atraparía recién al ejercitar el test.                                                                          |
| Impedir que la deuda crezca             | Allowlist + diff contra rama base (CI)          | `git merge-base`               | El ratchet es una propiedad del pipeline, no del código.                                                                                                   |
| Anclar la exención a un sitio real      | AST TypeScript (lint)                           | Texto del SQL (sentinel)       | **Son dos canales distintos** — ver Hallazgo 4.                                                                                                            |

---

## Standard Stack

### Core — todo ya instalado, cero deps nuevas

| Library                     | Version (verificada) | Purpose                                                                                                                               | Why Standard                                                                                                                                                      |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` (compiler API) | **5.9.3**            | AST del lint: `createSourceFile`, `forEachChild`, `isTaggedTemplateExpression`, `getLeadingCommentRanges`, `getTrailingCommentRanges` | Ya es devDependency del API; D-10 lo lockea. API confirmada presente en `node_modules/typescript/lib/typescript.d.ts` [VERIFIED: grep sobre el `.d.ts` instalado] |
| `mysql2`                    | **3.16.1**           | El pool a envolver (`mysql2/promise` → `PromisePool`)                                                                                 | Es el driver que el API ya usa [VERIFIED: `node_modules/mysql2/package.json`]                                                                                     |
| `drizzle-orm`               | **0.45.1**           | El ORM por encima del cual va el sentinel                                                                                             | [VERIFIED: `node_modules/drizzle-orm/package.json`]                                                                                                               |
| `tsx`                       | ^4.21.0              | Runner del script de lint (idioma `db:verify-*` del repo)                                                                             | Ya es devDependency; D-09 lo lockea                                                                                                                               |
| `vitest`                    | ^4.0.18              | Tests del sentinel y del lint                                                                                                         | Framework del repo                                                                                                                                                |
| `pino` (vía `fastify.log`)  | ^10.3.0              | `log.error` + resumen estructurado                                                                                                    | CLAUDE.md prohíbe `console.log` en el API                                                                                                                         |

### Alternatives Considered

| Instead of                         | Could Use                                    | Tradeoff                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrap a nivel pool                  | Hook/middleware de Drizzle                   | **No existe.** Drizzle no expone interceptores; la feature request está abierta sin implementar (`drizzle-team/drizzle-orm` issue #2720, discussion #1426). El wrap a nivel driver es el patrón que la comunidad usa como workaround. [CITED: github.com/drizzle-team/drizzle-orm/issues/2720]                                                                                                                                  |
| Wrap a nivel pool                  | `Proxy` sobre el `PromisePool`               | Funciona, pero cambia la identidad del objeto. `fastify.decorate("dbPool", pool)` y **18 sitios de test** hacen `app.dbPool.getConnection()`; además `PromisePool` extiende `EventEmitter` y `inheritEvents` ya está enganchado sobre la instancia. Monkeypatch de `query`/`execute`/`getConnection` como propiedades propias sombrea los métodos del prototipo y conserva todo lo demás intacto. **Recomendado: monkeypatch.** |
| Parser propio                      | Un parser SQL real (`node-sql-parser`, etc.) | Dependencia nueva → prohibido por regla del repo y por D-10. Además el diseño (doc 03) pide explícitamente "parsea trivialmente" y asume la limitación presencia≠corrección.                                                                                                                                                                                                                                                    |
| `ts.createSourceFile` (sintáctico) | `ts.createProgram` + type checker            | El checker resolvería `schema.bookings` → declaración con certeza, pero cuesta lo mismo que un `tsc --noEmit` completo (decenas de segundos). No hace falta: el mapa identificador→tabla física se construye con un pase AST barato sobre `src/db/schema/*.ts`. **Recomendado: sintáctico.** Medido: 382 archivos en **606 ms** [VERIFIED: benchmark ejecutado].                                                                |
| Regla ESLint                       | —                                            | Descartada por D-09 (el API no tiene config ESLint; `eslint` figura en devDependencies pero **no hay `eslint.config.*` en `el-templo-api/`** — los tres que existen son de los frontends) [VERIFIED: `ls`]                                                                                                                                                                                                                      |

**Installation:** ninguna. **Esta fase no instala ni actualiza ningún paquete.**

---

## Package Legitimacy Audit

**No aplica: esta fase instala CERO paquetes externos.** D-10 lockea explícitamente el uso del compiler API de TypeScript "ya es dependencia — cero deps nuevas", y la memoria del repo tiene una regla dura de **nunca instalar ni actualizar dependencias sin preguntar** (precedente de supply chain de axios). Todo el stack recomendado arriba ya está en `el-templo-api/package.json` en `origin/master` y se verificó su versión instalada leyendo `node_modules/*/package.json`.

`slopcheck` no está disponible en este entorno (`command -v slopcheck` → not found) y no se intentó instalarlo, por la misma regla. **No es una degradación:** no hay ningún paquete candidato que auditar.

Si durante la planificación apareciera la tentación de agregar un parser SQL o un helper de AST, la respuesta correcta es **preguntarle a Franco primero** — no instalarlo.

---

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────── CAMINO A: RUNTIME (sentinel, CON-05) ────────────┐

  ruta / cron / webhook
        │
        ▼
  service (Drizzle db)
        │
        ├─── fuera de transacción ──────────────►  pool.query({sql,...}, params)   ──┐
        │                                          pool.execute(sql, params)       ──┤
        │                                                                            │
        └─── db.transaction(...)  ──► pool.getConnection() ──► conn.query(...)  ────┤
             (65 call sites / 25 archivos)          │          conn.execute(...)     │
                                                    │                                │
                                        ┌───────────┴────────────┐                   │
                                        │  ⚠ SIN el wrap de      │                   ▼
                                        │    getConnection, TODO  │        ┌──────────────────────┐
                                        │    esto es INVISIBLE    │        │      SENTINEL        │
                                        └────────────────────────┘        │  (analyze(sql))      │
                                                                           └──────────┬───────────┘
                                                                                      │
                    ┌─────────────────────────────────────────────────────────────────┤
                    ▼                    ▼                     ▼                      ▼
              1. ¿no-DML?          2. ¿tenant-safe:      3. ¿toca tabla        4. ¿tenant_id en
              begin/commit/           en el SQL?            gym-owned?            zona de predicado?
              savepoint/SET/          → EXENTA             (GYM_OWNED_TABLES)     (proyección recortada)
              SHOW/info_schema         │                    │  no → skip           │
                    │                  │                    │                      │
                    ▼                  ▼                    ▼                      ▼
                  skip               skip                                     sí → ok
                                                                              no  → VIOLACIÓN
                                                                                     │
                                     ┌───────────────────────────────────────────────┤
                                     ▼                       ▼                       ▼
                            tabla en lista STRICT     no-strict + test        no-strict + prod
                            + test/dev                (silencio, D-08)        (D-01/D-02)
                                     │                       │                       │
                                     ▼                       ▼                       ▼
                                  THROW              contador inventario     1ª vez: log.error
                              (SQL en el mensaje)    (SENTINEL_INVENTORY=1)  resto: ++contador
                                                                             + resumen periódico

                         └──────────── CAMINO B: ESTÁTICO (lint, CON-06) ─────────────┘

  src/db/schema/*.ts ──► pase AST ──► mapa  { bookings → "bookings", tvPairings → "tv_pairings", ... }
                                              │ (92 declaraciones; el regex solo resuelve 21)
                                              ▼
  src/**/*.ts ──► ts.createSourceFile ──► visita ──► ¿nodo toca tabla gym-owned?
                    (382 archivos, 606 ms)            │  · sql`...` (TaggedTemplateExpression)
                                                      │  · .from(schema.X) / .insert(X) / .update(X) / .delete(X)
                                                      ▼
                                          ¿tiene tenant_id / tenantWhere / tenantValues?
                                                      │ no
                                                      ▼
                                          ¿comentario de bloque /* tenant-safe: <motivo> */
                                           anclado (file-level | leading | trailing)?
                                                      │ no
                                                      ▼
                                          ¿está en la ALLOWLIST (archivo + tabla)?
                                              │ sí → tolerado          │ no → ROJO
                                              ▼                        ▼
                                   ┌──────────────────────────────────────────┐
                                   │  Gates extra del ratchet (mismo pase)    │
                                   │   · entradas GANADAS vs merge-base → rojo│
                                   │   · entradas STALE (ya no violan) → rojo │
                                   │   · tabla strict con entradas vivas→rojo │
                                   └──────────────────────────────────────────┘
```

### Recommended Project Structure

```
el-templo-api/
├── src/
│   ├── db/
│   │   ├── tenant-tables.ts          # ← EXTENDER: lista strict por módulo (D-05/D-06)
│   │   └── sentinel/                 # ← NUEVO (sugerido)
│   │       ├── analyze.ts            #    parser puro: (sql) => veredicto. SIN I/O → unit-testeable sin MySQL
│   │       └── install.ts            #    wrap de query/execute/getConnection + contadores + resumen
│   ├── plugins/
│   │   └── database.ts               # ← EXTENDER: instalar sentinel ANTES de drizzle(pool)
│   └── db/scripts/
│       └── lint-tenant.ts            # ← NUEVO: script tsx del lint (idioma verify-tenant-*)
├── tenant-lint-allowlist.json        # ← NUEVO: allowlist decreciente (D-13/D-16)
└── test/
    ├── unit/sentinel-analyze.test.ts # ← parser puro (sin DB)
    └── tenancy/con-05-sentinel.test.ts / con-06-lint.test.ts
```

### Pattern 1: Instalar el sentinel por debajo de Drizzle (monkeypatch de 3 métodos)

**What:** Sombrear `query`, `execute` y `getConnection` del `PromisePool` con propiedades propias, antes de pasarlo a `drizzle()`.
**When to use:** Es el único punto de integración; `plugins/database.ts` es el lugar (el pool se crea una sola vez).

```ts
// Forma verificada contra drizzle-orm 0.45.1 + mysql2 3.16.1.
// `pool` es el PromisePool de mysql2/promise creado en plugins/database.ts.
// Se muta la INSTANCIA (no un Proxy) para conservar identidad: fastify.decorate("dbPool", pool)
// y 18 sitios de test hacen app.dbPool.getConnection().

function installSentinel(pool: mysql.Pool, opts: SentinelOptions): void {
  const wrap = <F extends (...a: any[]) => any>(orig: F) =>
    function (this: unknown, ...args: Parameters<F>) {
      // Drizzle llama query() con un OBJETO {sql, typeCast, rowsAsArray?} como 1er arg,
      // y execute() con un string. Normalizar las dos formas:
      const first = args[0] as string | { sql: string };
      const text = typeof first === "string" ? first : first?.sql;
      if (typeof text === "string") opts.inspect(text); // puede THROW en test/dev
      return orig.apply(this, args);
    } as F;

  pool.query = wrap(pool.query.bind(pool));
  pool.execute = wrap(pool.execute.bind(pool));

  // ── LO QUE EL DOC 03 NO DICE Y SIN LO CUAL EL SENTINEL ES CIEGO ──
  // Drizzle abre TODA transacción con pool.getConnection() y después manda
  // begin / los statements / commit por connection.query(). Sin esto, 65 call
  // sites de .transaction( en 25 archivos quedan sin vigilar.
  const origGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async function () {
    const conn = await origGetConnection();
    conn.query = wrap(conn.query.bind(conn));
    conn.execute = wrap(conn.execute.bind(conn));
    return conn; // MISMO objeto: release(), .connection y el resto quedan intactos
  };
}
```

**Anti-pattern:** envolver `drizzle(pool)` o el objeto `db`. Queda **por encima** del ORM: no vería el SQL final ni los ` sql` `` crudos, que es exactamente lo que el doc 03 §3 vino a resolver.

### Pattern 2: Parser del sentinel — recortar la proyección antes de buscar `tenant_id`

**What:** Cuatro etapas: skip de no-DML → exención en el SQL → extracción de tablas → presencia de `tenant_id` en zona de predicado.
**When to use:** Es el corazón del sentinel. Función **pura** (`string → veredicto`): testeable sin MySQL, y satisface la parametrización de D-07.

```ts
// Validado contra 14 casos representativos (ver §Code Examples). Función pura.
const NON_DML =
  /^\s*(begin|commit|rollback|savepoint|release\s+savepoint|rollback\s+to|start\s+transaction|set\b|show\b|select\s+database\(\))/i;

function analyze(raw: string, gymOwned: ReadonlySet<string>): Verdict {
  const sql = raw.trim();
  if (NON_DML.test(sql)) return skip("control de transacción / no-DML");
  if (/\/\*\s*tenant-safe:\s*\S/.test(sql)) return exempt("anotado en el SQL");
  if (/\binformation_schema\b/i.test(sql)) return skip("introspección");

  // 1. tablas referenciadas: from / join / into / update
  const tables = new Set<string>();
  const re = /\b(?:from|join|into|update)\s+`?([a-z_][a-z0-9_]*)`?/gi;
  for (let m; (m = re.exec(sql)); ) if (gymOwned.has(m[1])) tables.add(m[1]);
  if (tables.size === 0) return skip("ninguna tabla gym-owned");

  // 2. ⚠ RECORTAR LA PROYECCIÓN. Drizzle expande `select *` a TODAS las columnas,
  //    incluida `tenant_id`, así que un scan sin WHERE contiene el literal y
  //    pasaría un chequeo ingenuo. Ese es el peor falso negativo posible.
  let predicate = sql;
  if (/^\s*select\b/i.test(sql)) {
    const i = sql.search(/\bfrom\b/i);
    predicate = i === -1 ? "" : sql.slice(i);
  }
  return /`?tenant_id`?/i.test(predicate) ? ok() : violation([...tables], sql);
}
```

### Pattern 3: Anclar la exención por AST (cierra el hallazgo 169-09)

**What:** Aceptar el tag **solo** en un `MultiLineCommentTrivia` (`/* */`) cuyo texto arranca con `tenant-safe:` seguido de un motivo no vacío, en una de tres posiciones: file-level (trivia de la posición 0), leading de un statement/call, o trailing de un call.
**When to use:** El matcher del lint. **Validado contra los 9 sitios reales de `origin/master`** — ver §Code Examples.

```ts
// La regla que separa exención de prosa. Dos condiciones, las dos necesarias:
//   (a) kind === MultiLineCommentTrivia  → rechaza schema/tv.ts:81 (es un `//`)
//   (b) el tag arranca el comentario     → rechaza require-tenant.ts:44 (está en
//       la línea ` * \`tenant-safe: <motivo>\`` de un JSDoc, no pegado al `/*`)
const TAG = /\/\*\s*tenant-safe:\s*(\S.*?)\*\//s; // motivo OBLIGATORIO (\S)

function exemptionAt(text: string, node: ts.Node): string | undefined {
  const ranges = [
    ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
    ...(ts.getTrailingCommentRanges(text, node.end) ?? []), // ← .insert(x) /* tenant-safe: y */
  ];
  for (const c of ranges) {
    if (c.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const m = TAG.exec(text.slice(c.pos, c.end));
    if (m) return m[1].trim();
  }
  return undefined;
}
```

### Anti-Patterns to Avoid

- **Envolver solo `pool.query`/`pool.execute`** (lo que dice literalmente el doc 03): deja ciegos los 65 call sites de transacción. Ver Hallazgo 1.
- **Buscar `tenant_id` en el SQL completo**: falso negativo garantizado en todo `db.select().from(gymOwned)` sin `where`. Ver Hallazgo 2.
- **Regex sobre el fuente para el mapa de tablas**: `= mysqlTable("` en una línea resuelve **21 de 92** declaraciones (el resto son multilínea) y además levanta una tabla fantasma `"foo"` que vive dentro de un JSDoc. Ver Hallazgo 5.
- **Grep crudo de `tenant-safe:`**: autoriza 11 archivos cuando solo 9 tienen exención real. Es el hallazgo 169-09 y el motivo entero de D-10.
- **`setInterval` sin `.unref()`** para el resumen periódico: deja el proceso vivo y **cuelga la suite de Vitest**. No hay ni un `setInterval` en todo `src` hoy — es patrón nuevo, sin precedente que copiar. Ver Pitfall 4.
- **`ts.createProgram` + type checker** en el lint: convierte un pase de 0,6 s en uno del orden del `tsc --noEmit`, sin necesidad.

---

## Don't Hand-Roll

| Problem                                | Don't Build                                   | Use Instead                                                                                       | Why                                                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saber qué tablas llevan `tenant_id`    | Una segunda lista en el sentinel o en el lint | `GYM_OWNED_TABLES` / `isGymOwnedTable()` de `src/db/tenant-tables.ts`                             | Ya existe, tiene 87 entradas, y `test/db/tenant-tables.test.ts` es fail-closed sobre ella (una tabla nueva sin clasificar deja la suite roja). Duplicarla crea dos verdades que se desincronizan.                 |
| Distinguir código de prosa/comentario  | Regex sobre el texto fuente                   | `ts.createSourceFile` + `forEachChild`                                                            | Verificado: el regex confunde JSDoc con código en los dos sentidos (tabla `"foo"` fantasma; 2 de 11 `tenant-safe:` falsos).                                                                                       |
| Ubicar comentarios respecto de un nodo | Contar líneas / buscar hacia atrás            | `ts.getLeadingCommentRanges` / `ts.getTrailingCommentRanges`                                      | Manejan trivia, comentarios encadenados y el caso _trailing_ (`.insert(x) /* … */`) que es 1 de los 9 sitios reales.                                                                                              |
| Códigos de salida y forma del CLI      | Un contrato nuevo                             | Copiar `src/db/scripts/verify-tenant-uniques.ts`                                                  | Ya fijó el contrato del repo: **0** limpio / **1** discrepancias / **2** error de uso o interno. `require-tenant.ts` lo reafirma. D-09 lo lockea.                                                                 |
| Testear lógica sin levantar MySQL      | Montar la app en el test                      | El patrón `QueryFn` / función pura inyectable de `verify-tenant-uniques.ts` y `require-tenant.ts` | Precedente vivo: `test/unit/require-tenant.test.ts`, 16 tests sin DB. El parser del sentinel debe ser una función pura por el mismo motivo.                                                                       |
| Logging                                | `console.log`                                 | `fastify.log` (Pino)                                                                              | CLAUDE.md lo prohíbe explícitamente en el API. **Excepción documentada:** en scripts CLI `console.*` sí está permitido (precedente `verify-tenant-uniques.ts`, reafirmado en el docblock de `require-tenant.ts`). |

**Key insight:** las dos piezas de esta fase son _vigilantes_. Un vigilante que duplica la lista de lo que vigila deja de estar sincronizado con lo vigilado en la primera tabla nueva — y falla silenciosamente, que es el único modo de falla que hace inútil a un gate. Importar de `tenant-tables.ts` no es prolijidad: es la condición para que el gate siga siendo cierto en la fase 175.

---

## Runtime State Inventory

Esta fase **no es un rename/refactor/migración** — es código nuevo (sentinel + lint) más dos ediciones aditivas (`tenant-tables.ts`, `plugins/database.ts`). Aun así, el sentinel introduce **estado de runtime nuevo** que conviene tener inventariado antes de planificar:

| Category            | Items Found                                                                                                                                                                                                                                                                                   | Action Required                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Stored data         | **Ninguno.** Cero migraciones previstas (CONTEXT §domain). Verificado: la fase no crea ni altera tablas. Si apareciera una, reservar desde **0197** (la 0196 ya está en staging y prod).                                                                                                      | ninguna                                                               |
| Live service config | **Ninguna.** El sentinel no tiene configuración externa: su severidad sale de `NODE_ENV` (patrón existente: 17 usos de `NODE_ENV === "production"` en `src`) y su lista strict del código commiteado.                                                                                         | ninguna                                                               |
| OS-registered state | **Ninguno** — verificado: no hay `setInterval` en `src` hoy, así que el timer del resumen periódico (D-02) es **estado de proceso nuevo**, no una registración de OS. Vive y muere con el proceso pm2.                                                                                        | debe usar `.unref()` + limpiarse en el hook `onClose` (ver Pitfall 4) |
| Secrets/env vars    | **Uno nuevo, opcional:** el flag del modo inventario (D-08, p. ej. `SENTINEL_INVENTORY=1`). No es secreto. CLAUDE.md exige actualizar el `.env.example` correspondiente al agregar un env var.                                                                                                | agregar a `el-templo-api/.env.example` con comentario                 |
| Build artifacts     | **Ninguno.** El lint es un script `tsx` que no emite; el sentinel compila a `dist/` con el resto del `tsc`. Ojo: si el script de lint queda bajo `src/`, entra en la build de producción — inocuo, pero si se prefiere que no, va bajo `scripts/` (precedente: `scripts/wellhub-sandbox.ts`). | decisión de ubicación en planificación                                |

**Contador in-memory (D-02):** es estado por proceso y **no sobrevive un restart de pm2**. Consecuencia para el criterio 2: los totales del resumen periódico se resetean en cada deploy. Es aceptable (el objetivo es "¿hay ruido recurrente?", no contabilidad exacta), pero debe quedar escrito para que nadie lea un contador en cero como "no hay violaciones".

---

## Common Pitfalls

### Pitfall 1: El sentinel no ve nada adentro de las transacciones

**What goes wrong:** Se implementa exactamente lo que dice el doc 03 ("envolver `pool.query/execute`") y el sentinel pasa todos sus tests unitarios, pero en la app real **no observa ni una sola query transaccional**. El camino de escritura —donde una fuga de tenant es más cara— queda 100 % ciego.
**Why it happens:** Drizzle abre toda transacción con `pool.getConnection()` y construye una sesión nueva cuyo cliente es la `PoolConnection`; a partir de ahí `pool.query` **nunca más se llama**.
**How to avoid:** Envolver también `getConnection()` y decorar `query`/`execute` de la conexión devuelta (Pattern 1).
**Warning signs:** El modo inventario (D-08) sobre la suite completa reporta muchísimas menos violaciones de las esperadas, o ninguna violación de INSERT/UPDATE. **Test de regresión obligatorio:** un test que corre una query adentro de `db.transaction()` y afirma que el sentinel la vio.

### Pitfall 2: Falso negativo por la proyección expandida de Drizzle

**What goes wrong:** `db.select().from(schema.bookings)` — un scan completo de tabla sin ningún filtro de tenant, la fuga más grave posible — **pasa** el sentinel.
**Why it happens:** Drizzle expande la proyección a todas las columnas: `` select `id`, `tenant_id`, `member_id` from `bookings` ``. El literal `tenant_id` está en el SQL, así que un chequeo de presencia sobre el string completo devuelve "cumple".
**How to avoid:** Recortar la lista de proyección antes del chequeo (Pattern 2).
**Warning signs:** Un test que hace `db.select().from(<gym-owned strict>)` sin `where` y **no** hace throw. Debe ser uno de los casos del test del criterio 1.

### Pitfall 3: El sentinel rompe el arranque, los tests o las migraciones

**What goes wrong:** Statements de infraestructura (`begin`, `commit`, `savepoint sp1`, `SET …`, `SHOW …`, `SELECT DATABASE()`, `information_schema`) se marcan como violación; en modo throw, revientan transacciones legítimas.
**Why it happens:** Drizzle emite el control de transacción **por el mismo canal** que las queries (probado: `conn.query("begin")`). El sentinel los ve.
**How to avoid:** Skiplist de no-DML como **primera** etapa del parser (Pattern 2), con test dedicado por cada forma.
**Warning signs:** Fallos en tests que no tocan tenancy; errores que mencionan `begin`/`commit`.

### Pitfall 4: El resumen periódico cuelga la suite de Vitest

**What goes wrong:** `pnpm test` corre todo en verde y después **no termina** — el proceso queda vivo.
**Why it happens:** Un `setInterval` pendiente mantiene vivo el event loop. Agravante: `vitest.config.ts` usa `pool: "forks"` con `isolate: false`, así que el fork se reutiliza entre archivos y el timer se acumula.
**How to avoid:** (a) no armar el timer fuera de producción; (b) `.unref()` siempre; (c) `clearInterval` en el hook `onClose` de `plugins/database.ts` (ya existe uno ahí que hace `pool.end()`).
**Warning signs:** La suite cuelga tras el último test; `--hookTimeout` no lo arregla. **No hay ni un `setInterval` en `src` hoy** — no hay precedente en el repo del que copiarse, así que este pitfall se paga entero la primera vez.

### Pitfall 5: `git merge-base` falla en CI por el clone shallow

**What goes wrong:** El gate anti-crecimiento de la allowlist (D-14) explota, o —peor— "no encuentra diferencias" y **pasa en verde siempre**, convirtiendo el ratchet en decorativo.
**Why it happens:** `actions/checkout@v4` trae **`fetch-depth: 1` por defecto** — "Only a single commit is fetched by default" [CITED: github.com/actions/checkout README]. Los steps de `ci.yml` usan `uses: actions/checkout@v4` **sin bloque `with:`**, o sea shallow. Sin historia no hay merge-base.
**How to avoid:** Agregar `with: { fetch-depth: 0 }` al checkout del job del API (o hacer un fetch dirigido de la base). **Y** hacer el gate fail-closed: si no se puede resolver la base, exit ≠ 0 con mensaje claro — nunca "asumir sin cambios".
**Warning signs:** `fatal: Not a valid object name` / `no merge base`; o el gate que nunca reporta nada.

### Pitfall 6: `github.event.before` es todo ceros en el primer push de una rama

**What goes wrong:** El diff de la allowlist en un push de rama nueva compara contra un SHA inexistente y el step falla (o peor, se traga el error).
**Why it happens:** En la creación de una rama, `before` es el null SHA `0000000000000000000000000000000000000000` — es comportamiento documentado de GitHub. [CITED: github.com/tj-actions/changed-files issue #387; super-linter issue #6193]
**How to avoid:** Detectar el null SHA y caer a `merge-base origin/master HEAD`. En eventos `pull_request` preferir `github.event.pull_request.base.sha`, que siempre existe. Fail-closed en cualquier otro caso.
**Warning signs:** El step solo falla en la primera push de ramas nuevas — justo el caso de una fase GSD arrancando.

### Pitfall 7: La exención _trailing_ autoriza el call equivocado

**What goes wrong:** Un `/* tenant-safe: … */` puesto entre dos calls encadenados exime a un acceso distinto del que se quiso eximir.
**Why it happens:** `getTrailingCommentRanges(text, node.end)` de un `CallExpression` y `getLeadingCommentRanges` del nodo siguiente pueden devolver **el mismo comentario**. Verificado en vivo: en `notification-cron.ts:754` el mismo comentario matcheó dos veces (`ExpressionStatement` **y** el `CallExpression` interno).
**How to avoid:** Deduplicar por `range.pos`, y exigir que el comentario caiga **dentro del span del statement** que contiene el acceso flagueado. Además el lint debe **reportar el inventario** (D-12) para que una exención mal ubicada se vea a ojo.
**Warning signs:** El inventario del lint muestra más exenciones que las 9 conocidas, o una exención atribuida a un archivo/tabla que no es el suyo.

### Pitfall 8: Hay un segundo pool en el código, sin sentinel

**What goes wrong:** Alguien "descubre" `createDbConnection()` en `src/db/index.ts` (cuyo comentario dice literalmente _"Used by the main application"_), lo usa, y sus queries **no pasan por el sentinel**.
**Why it happens:** Es código muerto: `createDbConnection` tiene **cero consumidores** en todo el repo (verificado por grep). El comentario miente.
**How to avoid:** En la planificación, decidir explícitamente: borrarlo, o anotarlo apuntando a `plugins/database.ts` como el único pool vigilado. Nota de alcance aparte: `createSingleConnection()` **sí** se usa (~8 scripts CLI) y devuelve una `Connection`, no un Pool — esos caminos están cubiertos por la regla `--tenant` de la 169 y sus exenciones `tenant-safe:`, no por el sentinel.
**Warning signs:** Un import nuevo de `createDbConnection` en un PR.

### Pitfall 9: El lint mira `test/` y se ahoga en ruido

**What goes wrong:** El baseline one-shot (D-16) sale gigante e irrevisable: hay **228 archivos `*.test.ts`** que escriben tablas gym-owned a propósito para armar fixtures.
**Why it happens:** No decidir el alcance de archivos antes de generar el baseline.
**How to avoid:** Fijar el alcance **antes** de generar (D-16 es one-shot: regenerar es justamente lo que no debe existir). Recomendación: alcance = `src/**` + `scripts/**`, excluyendo `test/**` — con el motivo escrito. Los fixtures 2-tenant son de la fase 171 y ese es el gate correcto para el ruido de tests.
**Warning signs:** Una allowlist inicial de cientos de entradas.

---

## Code Examples

### Prueba ejecutada: qué métodos del pool llama Drizzle (dentro y fuera de transacción)

```js
// Ejecutado contra drizzle-orm 0.45.1 real, con un pool instrumentado.
const db = drizzle({ client: pool }); // pool registra cada llamada
await db.select().from(users).where(eq(users.tenantId, 1));
await db.transaction(async (tx) => {
  await tx.select().from(users);
  await tx.insert(users).values({ id: 1, tenantId: 1 });
});
```

Salida real:

```
POOL.query           select `id`, `tenant_id` from `users` where `users`.`tenant_id` = ?
--- now a transaction ---
POOL.getConnection
CONN.query           begin
CONN.query           select `id`, `tenant_id` from `users`
CONN.query           insert into `users` (`id`, `tenant_id`) values (?, ?)
CONN.query           commit
CONN.release
```

**Lectura:** fuera de transacción → `pool.query`. Dentro → `getConnection()` una vez y después **todo** por `connection.query`. Confirmado en el fuente del driver (`node_modules/drizzle-orm/mysql2/session.cjs`): `MySql2Session.transaction()` hace `new MySql2Session(await this.client.getConnection(), …)`, y `isPool(client)` se decide por `"getConnection" in client`.

### Formas de SQL que emite Drizzle (insumo del parser)

```
1 SELECT      : select `id`, `tenant_id`, `first_name` from `users` where (`users`.`tenant_id` = ? and `users`.`id` = ?)
2 JOIN        : select `bookings`.`id`, … from `bookings` inner join `users` on `bookings`.`member_id` = `users`.`id`
3 INSERT      : insert into `users` (`id`, `tenant_id`, `first_name`) values (?, ?, ?)
4 UPDATE      : update `users` set `first_name` = ? where `users`.`id` = ?
5 DELETE      : delete from `users` where `users`.`id` = ?
A select* s/where : select `id`, `tenant_id`, `first_name` from `users`      ← ⚠ EL TRAP
D count only  : select count(*) from `bookings`
C raw+coment  : select … from `users` where /* tenant-safe: x */ 1=1          ← el comentario SÍ sobrevive
```

Notas: todos los identificadores van **entre backticks**; los parámetros son `?` (el texto ya es el fingerprint de D-01 sin trabajo extra); un comentario de bloque escrito dentro de un ` sql` `` llega intacto al pool.

### Parser candidato — 14/14 casos correctos

```
VIOLATION  | select `id`, `tenant_id`, `first_name` from `users`          ← el trap, atrapado
ok         | select … from `users` where `users`.`tenant_id` = ?
VIOLATION  | select count(*) from `bookings`
ok         | insert into `users` (`id`, `tenant_id`, `first_name`) values (?, ?, ?)
VIOLATION  | insert into `tv_pairings` (`user_code`) values (?)
VIOLATION  | update `users` set `first_name` = ? where `users`.`id` = ?
ok         | delete from `users` where `users`.`tenant_id` = ? and `id` = ?
VIOLATION  | select `a`.`id` from `bookings` `a` inner join `users` on …
skip       | begin | commit | savepoint sp1 | SELECT DATABASE()
exempt     | /* tenant-safe: idempotencia global */ insert into `users` …
skip       | select `id` from `spom_config`        (no gym-owned)
```

### Anclaje de exenciones por AST — validado contra los 9 sitios reales de `origin/master`

Corrido sobre los archivos extraídos de `origin/master` con la regla de Pattern 3:

```
### src/db/seed.ts                  -> 1   FILE-LEVEL   "provisioning local/de test: construye la base desde cero…"
### src/jobs/notification-cron.ts   -> 1   L754  ExpressionStatement  "seed de templates global hasta la adopción…"
### src/modules/tv/pairing.ts       -> 1   L145  CallExpression       "pairing pre-claim"          ← comentario TRAILING
### src/modules/wellhub/service.ts  -> 1   L135  VariableStatement    "idempotencia global previa a la derivación…"
### src/db/schema/tv.ts             -> 0   ✓ RECHAZADO (es un comentario `//`, no `/* */`)
### src/db/scripts/require-tenant.ts-> 0   ✓ RECHAZADO (el tag vive dentro de un JSDoc, no pegado al `/*`)
```

Los dos rechazos son exactamente los 2 falsos positivos del grep crudo que reportó el 169-09-SUMMARY. **El hallazgo queda cerrado con esta regla.** (En `notification-cron.ts` el mismo comentario matcheó en dos nodos anidados → hace falta dedup por `range.pos`, ver Pitfall 7.)

### Costo del escaneo AST

```
files=382  taggedTemplates=552  callExprs=17947  elapsed=606ms
```

382 archivos `.ts` de `src`, parseados con `ts.createSourceFile` + visita completa + consulta de comentarios en cada `CallExpression`. **0,6 s** — despreciable como step de CI y perfectamente viable como comando local.

---

## State of the Art

| Old Approach                                 | Current Approach                                                         | When Changed                                                 | Impact                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `request.db` tenant-bound ("wrapper mágico") | Patrón por-método (`tenantWhere`/`tenantValues`) + sentinel a nivel pool | doc 03 §5, ya implementado en la fase 169                    | El sentinel es el complemento del patrón explícito, no un reemplazo: premia la forma correcta y detecta el olvido. |
| Grep crudo de `tenant-safe:`                 | Anclaje AST a comentario de bloque en el sitio del write                 | hallazgo 169-09 (2026-07-28), cerrado por esta investigación | El grep autoriza 11 archivos cuando hay 9 exenciones.                                                              |
| Middleware/hook del ORM                      | Wrap a nivel driver                                                      | Drizzle no lo soporta (issue #2720 abierta)                  | No hay "manera oficial"; el wrap del pool es el estado del arte para Drizzle+mysql2.                               |

**Deprecated/outdated:**

- `createDbConnection()` en `src/db/index.ts` — comentado como _"Used by the main application"_ pero con **cero consumidores**. El pool real de la app es el de `plugins/database.ts`.
- La formulación del doc 03 §3 capa 3 ("envolver `pool.query/execute`") es **incompleta**, no incorrecta: le falta `getConnection()`. Vale actualizar el doc, no re-litigar el diseño.

---

## Project Constraints (from CLAUDE.md)

| Directive                                                                                                           | Consecuencia para esta fase                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API: usar el logger Pino de Fastify (`request.log`, `app.log`). Nunca `console.log`.**                            | El sentinel loguea por `fastify.log` (closure sobre el plugin). **Excepción:** el script de lint es CLI y `console.*` está permitido ahí (precedente `verify-tenant-uniques.ts`). |
| **Sin tipos `any`. Usar `unknown` + narrowing.**                                                                    | El wrap del pool es el lugar donde más tienta el `any` (la firma `query(sql, values)` de mysql2 tiene overloads). Tipar con `string \| { sql: string }` + narrowing, no `any`.    |
| **`catch (err: unknown)` con chequeos `instanceof Error`.**                                                         | Aplica al sentinel y al script de lint.                                                                                                                                           |
| **Rutas API nuevas requieren tests de integración en `el-templo-api/test/`.**                                       | Esta fase no agrega rutas; igual requiere tests (criterios 1 y 4 los piden explícitamente).                                                                                       |
| **Cambios de schema por archivos Drizzle + `pnpm db:generate` / `db:migrate`. Nunca `drizzle-kit migrate`.**        | **No aplica: cero migraciones.** Si apareciera una, reservar desde **0197**.                                                                                                      |
| **Al agregar un env var, actualizar el `.env.example` correspondiente.**                                            | Aplica al flag del modo inventario (D-08).                                                                                                                                        |
| **Husky + lint-staged (Prettier) corre en cada commit. Si falla, arreglar y hacer un commit nuevo (no `--amend`).** | Los archivos nuevos deben quedar Prettier-formateados.                                                                                                                            |
| **CI corre en cada push: typecheck, lint, audit, tests de integración, build.**                                     | El step del lint se suma al job `api-check` de `ci.yml`.                                                                                                                          |

**Reglas operativas adicionales (memoria del repo / skill `el-templo-change-control`), con la misma autoridad:**

- **Nunca instalar ni actualizar dependencias sin preguntar.** Esta fase no necesita ninguna — mantenerlo así.
- **Staging-first estricto.** El trabajo de fase no se mergea a `master`; va a una rama local y después a `staging` con OK explícito.
- **El checkout principal es compartido y está en rama vieja** (262 commits atrás). Trabajar en worktree desde `origin/master` (`a70ee297` o posterior), como en las fases 166-169.
- **Nunca `git add -A` / `git add .`** — stagear por ruta.
- **No correr la suite de tests completa localmente** (corre en CI); typecheck local sí (`pnpm exec tsc --noEmit`). Los tests unitarios puros del parser sí son baratos de correr sueltos.
- **Siempre preguntar antes de pushear** y antes de SSHear al servidor.

---

## Assumptions Log

| #   | Claim                                                                                                                              | Section                             | Risk if Wrong                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | El resumen periódico de D-02 conviene cada ~1 h y solo en prod/staging                                                             | Runtime State Inventory / Pitfall 4 | Bajo — el intervalo es discreción de Claude (CONTEXT). Si es muy frecuente, ruido en pm2; muy espaciado, se pierde señal en la ventana de 2-3 días de D-04. Confirmar con Franco al planificar.    |
| A2  | El alcance del lint debe excluir `test/**`                                                                                         | Pitfall 9                           | **Medio-alto.** D-16 hace el baseline one-shot: si el alcance queda mal, corregirlo exige regenerar, que es justo la puerta trasera que D-16 prohíbe. **Decidir explícitamente antes de generar.** |
| A3  | Ubicar el sentinel en `src/db/sentinel/` y el lint en `src/db/scripts/lint-tenant.ts`                                              | Recommended Project Structure       | Bajo — nombres y ubicación son discreción explícita de Claude (CONTEXT).                                                                                                                           |
| A4  | El contador in-memory reseteándose en cada restart de pm2 es aceptable para el criterio 2                                          | Runtime State Inventory             | Bajo-medio. Si Franco espera totales acumulados a través de deploys, hace falta persistencia (que D-02 descarta). Vale decirlo en el resumen del criterio 2.                                       |
| A5  | Los ~8 scripts que usan `createSingleConnection()` quedan fuera del alcance del sentinel (los cubre la regla `--tenant` de la 169) | Pitfall 8                           | Bajo — coherente con CON-04 y con las exenciones ya escritas, pero conviene que la fase lo declare en vez de dejarlo implícito.                                                                    |
| A6  | `.iterator()` de Drizzle es un blind spot **teórico** (usa la conexión core, esquiva cualquier wrap de la capa promise)            | Open Question 2                     | Bajo hoy: **cero usos** de `.iterator(` en `src` (verificado). Sube si alguien lo introduce sin saberlo.                                                                                           |

---

## Open Questions (RESOLVED)

_Las 4 quedaron resueltas antes/durante la planificación: Q1 → decisión de Franco lockeada como **D-17** en CONTEXT.md (dos canales; planes 02/03) · Q2 → guard test en plan 06 tarea 3 · Q3 → las dos vías: test permanente con fixture (plan 03 tarea 3) + sonda en vivo (plan 07 tarea 3) · Q4 → plan 05 tarea 1 distingue `staleMissingFile` vs `staleNoLongerViolating` con mensajes propios._

1. **[RESOLVED → D-17] Brecha de canal de exención: el sentinel y el lint no leen lo mismo** _(la única contradicción real diseño↔código; conviene resolverla antes de planificar)_
   - **Lo que sabemos:** el doc 03 §3 dice "el comentario viaja en el SQL y el sentinel lo respeta". Verificado: eso funciona — un `/* tenant-safe: … */` escrito **dentro de un ` sql` `` ** llega intacto al pool. Pero **ninguna de las 9 exenciones que dejó escritas la fase 169 está dentro de un ` sql` ``**: 6 son comentarios de bloque a nivel de archivo y 3 son comentarios TypeScript pegados a un call de query builder. Ninguna de las 9 llega jamás al SQL.
   - **Lo que no está claro:** si el sentinel debe (a) tener su propio canal —solo honra exenciones embebidas en el SQL, y las 9 actuales son exenciones **del lint** únicamente—, o (b) las 9 deben además propagarse al SQL, o (c) el sentinel debe correlacionar la query con el sitio del código que la originó (caro y frágil: requiere stack traces).
   - **Recomendación:** **(a)**, y escribirlo. Son dos capas con dos alcances: el lint razona sobre el **fuente** (donde vive la anotación) y el sentinel sobre el **SQL** (donde solo pueden llegar los ` sql` ``crudos). Consecuencia práctica y benigna: las 8 exenciones que no son`sql`-crudo van a aparecer como violaciones no-strict en el modo inventario — que es correcto, porque son deuda real, no falsos positivos, y ninguna es strict. La opción (c) contradice "detecta, no re-escribe" y agrega costo en el hot path.

2. **[RESOLVED → plan 06] `.iterator()` esquiva cualquier wrap de la capa promise**
   - **Lo que sabemos:** `MySql2PreparedQuery.iterator()` hace `(await pool.getConnection()).connection` — toma la **conexión core de callbacks** de adentro del wrapper promise — y llama `conn.query(...)` ahí. Ni `pool.query` ni el wrap de la `PoolConnection` lo ven. Hoy hay **cero usos** de `.iterator(` en `src` (verificado por grep).
   - **Lo que no está claro:** si vale gastar un guard.
   - **Recomendación:** no envolver la conexión core (frágil y en el hot path). En cambio, un **test barato de guardia** que falle si aparece `.iterator(` en `src`, con el motivo escrito. Costo casi nulo, evita un agujero silencioso.

3. **[RESOLVED → planes 03+07] Cómo demostrar el rojo del criterio 4 sin commitear el estado roto**
   - **Lo que sabemos:** el repo ya tiene el patrón (168-05, 169-04, 169-08): sonda temporal → registrar el rojo → revertir sin commitear.
   - **Lo que no está claro:** si el verificador de la fase espera evidencia en el SUMMARY o un test permanente que ejercite el lint sobre un fixture.
   - **Recomendación:** **las dos.** Un test permanente que corra el lint contra un fixture violador dentro de `test/fixtures/` (fuera del alcance del lint real) da regresión duradera; la sonda en vivo satisface el "demostrado con un caso de prueba" del criterio y queda en el SUMMARY.

4. **[RESOLVED → plan 05] Precisión del gate de entradas "stale" (D-14)**
   - **Lo que sabemos:** D-14 exige rojo cuando una entrada de la allowlist ya no corresponde a una violación real. Es lo que fuerza el achique.
   - **Lo que no está claro:** una entrada puede quedar stale porque el módulo se migró (querido: rojo que obliga a borrarla) **o** porque el archivo se renombró/movió (ruidoso: rojo sin significado). D-13 eligió "archivo + tabla" precisamente para ser estable ante _ediciones_, pero un **rename** igual la rompe.
   - **Recomendación:** que el mensaje de error distinga los dos casos ("el archivo no existe" vs. "el archivo existe y ya no viola") y proponga la acción concreta. No es un problema de diseño, es de calidad del mensaje — pero determina si el gate se respeta o se esquiva.

---

## Environment Availability

| Dependency                  | Required By                        | Available                           | Version | Fallback                                                                                                                                                |
| --------------------------- | ---------------------------------- | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                     | Todo                               | ✓                                   | 22.22.0 | —                                                                                                                                                       |
| `typescript` (compiler API) | Lint AST (D-10)                    | ✓                                   | 5.9.3   | — (sin fallback aceptable; es la decisión lockeada)                                                                                                     |
| `drizzle-orm`               | Sentinel (verificación del driver) | ✓                                   | 0.45.1  | —                                                                                                                                                       |
| `mysql2`                    | Sentinel (pool a envolver)         | ✓                                   | 3.16.1  | —                                                                                                                                                       |
| `tsx`                       | Runner del lint                    | ✓                                   | ^4.21.0 | —                                                                                                                                                       |
| `vitest`                    | Tests                              | ✓                                   | ^4.0.18 | —                                                                                                                                                       |
| MySQL (base de test)        | Tests de integración del sentinel  | ✓ (CI: service container mysql:8.0) | 8.0     | Preferir tests **unitarios puros** del parser (patrón `require-tenant.test.ts`, 16 tests sin DB)                                                        |
| `git` con historia completa | Diff de allowlist en CI (D-14)     | ⚠ **NO en CI**                      | —       | **Requiere `fetch-depth: 0`** en el checkout del job del API — hoy es shallow (default 1). Ver Pitfall 5.                                               |
| `gh` CLI                    | Disparo manual de workflows        | ✗                                   | —       | Franco lo dispara desde la UI de GitHub (memoria del repo)                                                                                              |
| `slopcheck`                 | Auditoría de paquetes              | ✗                                   | —       | No aplica: cero paquetes nuevos                                                                                                                         |
| Context7 / `ctx7`           | Docs de librerías                  | ✗                                   | —       | Se usó lectura directa del fuente instalado en `node_modules` — **más autoritativo** que la doc para estas preguntas (comportamiento exacto del driver) |

**Missing dependencies with no fallback:** ninguna.

**Missing dependencies with fallback:**

- Historia de git en CI → agregar `fetch-depth: 0` (una línea en `ci.yml`). **Es trabajo de la fase, no un bloqueo.**

---

## Validation Architecture

### Test Framework

| Property           | Value                                              |
| ------------------ | -------------------------------------------------- |
| Framework          | Vitest 4.0.18                                      |
| Config file        | `el-templo-api/vitest.config.ts`                   |
| Quick run command  | `pnpm exec vitest run test/unit/<archivo>.test.ts` |
| Full suite command | `cd el-templo-api && pnpm test` (`vitest run`)     |

Detalles que condicionan el diseño de los tests: `globals: true`; `include: ["test/**/*.test.ts"]`; `setupFiles: ["test/setup.ts"]` provisiona una base MySQL **por worker** (`eltemplo_test_<VITEST_POOL_ID>`) — **este costo lo paga todo archivo de test, incluidos los puros** (~96 s, hallazgo 169-07, y `hookTimeout: 120000` existe justamente por eso); `pool: "forks"` con `isolate: false` (el proceso se reutiliza entre archivos → un timer colgado se acumula, ver Pitfall 4); `NODE_ENV: "test"` y `LOG_LEVEL: "silent"` por defecto.

### Phase Requirements → Test Map

| Req ID    | Behavior                                                                                                | Test Type                       | Automated Command                                           | File Exists?                        |
| --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| CON-05    | El parser clasifica bien: violación / ok / skip / exenta (14+ casos, incluido el trap de la proyección) | unit (sin DB)                   | `pnpm exec vitest run test/unit/sentinel-analyze.test.ts`   | ❌ Wave 0                           |
| CON-05    | Query sin `tenant_id` sobre tabla **strict inyectada** (D-07) hace **throw**, con el SQL en el mensaje  | integration                     | `pnpm exec vitest run test/tenancy/con-05-sentinel.test.ts` | ❌ Wave 0                           |
| CON-05    | La misma query sobre tabla **no-strict** NO hace throw y queda en silencio (D-08)                       | integration                     | idem                                                        | ❌ Wave 0                           |
| CON-05    | **El sentinel ve las queries dentro de `db.transaction()`** (regresión de Pitfall 1)                    | integration                     | idem                                                        | ❌ Wave 0                           |
| CON-05    | `begin`/`commit`/`savepoint`/`SET`/`SHOW`/`information_schema` nunca disparan (Pitfall 3)               | unit                            | `…/sentinel-analyze.test.ts`                                | ❌ Wave 0                           |
| CON-05    | En modo prod: `log.error` una sola vez por fingerprint, repeticiones solo cuentan (D-01)                | unit (logger falso)             | `…/sentinel-analyze.test.ts` o hermano                      | ❌ Wave 0                           |
| CON-05    | Modo inventario (`SENTINEL_INVENTORY=1`) agrega y reporta al final (D-08)                               | integration                     | idem                                                        | ❌ Wave 0                           |
| CON-06    | El lint detecta un ` sql` ``nuevo y un`.from(gym-owned)`nuevo sin`tenant_id` → exit 1                   | integration (fixture)           | `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`     | ❌ Wave 0                           |
| CON-06    | El lint reconoce `tenantWhere`/`tenantValues` como cumplimiento                                         | integration (fixture)           | idem                                                        | ❌ Wave 0                           |
| CON-06    | Anclaje de exención: acepta los 3 sitios reales inline + file-level, **rechaza los 2 de prosa** (D-12)  | unit (fixtures del fuente real) | idem                                                        | ❌ Wave 0                           |
| CON-06    | Motivo vacío (`/* tenant-safe: */`) → rechazado                                                         | unit                            | idem                                                        | ❌ Wave 0                           |
| CON-06    | Entrada **ganada** en la allowlist vs. base → exit 1 (D-14)                                             | integration                     | idem                                                        | ❌ Wave 0                           |
| CON-06    | Entrada **stale** → exit 1 (D-14)                                                                       | integration                     | idem                                                        | ❌ Wave 0                           |
| CON-06    | Tabla en lista strict con entradas vivas en allowlist → exit 1 (D-15)                                   | unit                            | idem                                                        | ❌ Wave 0                           |
| CON-06    | Exit codes: 0 limpio / 1 violaciones / 2 error de uso                                                   | integration                     | idem                                                        | ❌ Wave 0                           |
| CON-05/06 | Los gates de forma de `tenant-tables.ts` siguen verdes con la lista strict nueva                        | unit                            | `pnpm exec vitest run test/db/tenant-tables.test.ts`        | ✅ existe (**extender, no romper**) |

### Sampling Rate

- **Per task commit:** `pnpm exec tsc --noEmit` (obligatorio por el skill build-and-run) + el archivo de test unitario que toca la tarea.
- **Per wave merge:** el subconjunto `test/tenancy/` + `test/unit/` + `test/db/tenant-tables.test.ts`.
- **Phase gate:** suite completa verde **en CI** (memoria del repo: no correr el suite completo local) + el lint nuevo en verde + la demostración del rojo del criterio 4.

### Wave 0 Gaps

- [ ] `test/unit/sentinel-analyze.test.ts` — parser puro (CON-05). Sin DB; sigue el patrón de `test/unit/require-tenant.test.ts`.
- [ ] `test/tenancy/con-05-sentinel.test.ts` — throw/silencio/transacción/inventario (CON-05).
- [ ] `test/tenancy/con-06-lint.test.ts` — detección, exenciones, ratchet, exit codes (CON-06).
- [ ] Fixtures del lint (violador + cumplidor + los 3 anclajes de exención), ubicados **fuera** del alcance del lint real para que no contaminen la allowlist.
- [ ] Extender `test/db/tenant-tables.test.ts` con los gates de forma de la lista strict (D-05/D-06: claves de módulo, tablas existentes en `GYM_OWNED_TABLES`, arranca vacía).
- Framework install: **no hace falta** — Vitest ya está configurado.

---

## Security Domain

Esta fase es **defensa en profundidad de un control de seguridad** (aislamiento entre tenants). No expone superficie nueva: no agrega rutas, ni autenticación, ni manejo de datos de usuario.

### Applicable ASVS Categories

| ASVS Category               | Applies                           | Standard Control                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication           | no                                | La fase no toca autenticación                                                                                                                                                                                                                                                                                                                     |
| V3 Session Management       | no                                | Sin cambios de sesión                                                                                                                                                                                                                                                                                                                             |
| **V4 Access Control**       | **sí — es el corazón de la fase** | Aislamiento multi-tenant. El sentinel y el lint son controles **detectivos** (tripwires) sobre el control **preventivo** que son `tenantWhere`/`tenantValues` (fase 169). ASVS V4 pide específicamente controles de acceso a nivel de datos verificados server-side: el tenant sale siempre del servidor (`scope.tenantId`), nunca de un payload. |
| V5 Input Validation         | parcialmente                      | El sentinel **no interpola nada** en el SQL: solo lo lee. Los parámetros ya son `?` cuando llega. El lint no ejecuta el código que analiza (AST puro, sin `eval`, sin `import()` dinámico).                                                                                                                                                       |
| V6 Cryptography             | no                                | Sin criptografía nueva                                                                                                                                                                                                                                                                                                                            |
| V7 Error Handling & Logging | **sí**                            | El `log.error` del sentinel emite el SQL. Ya viene con placeholders `?` (verificado), así que **no filtra valores**. Aun así: nunca loguear el array de `params` — ahí sí van datos personales.                                                                                                                                                   |

### Known Threat Patterns for {Fastify + Drizzle + MySQL, multi-tenant}

| Pattern                                                        | STRIDE                 | Standard Mitigation                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant data leak por WHERE sin `tenant_id`               | Information Disclosure | `tenantWhere` (preventivo, 169) + sentinel (detectivo, esta fase) + lint (detectivo en el PR)                                                                                                                                                                                    |
| Mass assignment de `tenant_id` desde el body                   | Elevation of Privilege | Ya mitigado: `tenantValues` pone el `tenantId` del scope **después** del spread, pisando cualquiera que venga del cliente (169)                                                                                                                                                  |
| El propio gate falla en silencio y da falsa confianza          | Repudiation            | Todos los gates **fail-closed** (idioma del repo: 168-05, 169-04, 169-08). Aplica especialmente al merge-base de Pitfall 5: sin base resoluble → rojo, jamás verde.                                                                                                              |
| El SQL en logs filtra datos personales                         | Information Disclosure | Loguear solo el texto con placeholders (ya lo es); **nunca** los `params`. Nota: Sentry recibe `log.error` de Pino vía `instrument.ts` (CLAUDE.md) — D-02 dice NO Sentry para esta deuda, así que conviene verificar que el canal del sentinel no termine igual en el dashboard. |
| El sentinel se convierte en un DoS del hot path                | Denial of Service      | El parser es regex sobre un string ya construido, sin backtracking catastrófico. Aun así: **medir** el overhead por query y evitar regex anidadas.                                                                                                                               |
| Exención sobre-amplia (file-level) autoriza escrituras futuras | Elevation of Privilege | 6 de las 9 exenciones son **de archivo entero**: cubren código que todavía no se escribió. El lint debería preferir exenciones al sitio y reportar las file-level como de mayor alcance en su inventario (D-12).                                                                 |

---

## Sources

### Primary (HIGH confidence — código real ejecutado o leído en esta sesión)

- `node_modules/drizzle-orm/mysql2/session.cjs` (v0.45.1) — `MySql2PreparedQuery.execute` (`client.query(rawQuery, params)`), `MySql2Session.all` (`client.execute`), `MySql2Session.transaction` (`getConnection()` + sesión nueva), `iterator()` (`.connection` core), `isPool()`.
- `node_modules/drizzle-orm/mysql2/driver.cjs` — `isCallbackClient()` / `client.promise()`; confirma que un `PromisePool` se usa tal cual.
- `node_modules/mysql2/lib/promise/pool.js` y `lib/promise/connection.js` (v3.16.1) — `PromisePool.query/execute/getConnection`, `PromisePoolConnection`, `this.connection` = conexión core.
- **Prueba ejecutada** con pool instrumentado → `POOL.query` fuera de transacción vs. `POOL.getConnection` + `CONN.query` dentro.
- **Prueba ejecutada** de formas de SQL vía `.toSQL()` → expansión de proyección, backticks, supervivencia del comentario de bloque.
- **Prueba ejecutada** del parser candidato → 14/14 casos.
- **Prueba ejecutada** del anclaje AST contra los 6 archivos reales de `origin/master` → 4 aciertos + 2 rechazos correctos de prosa.
- **Benchmark ejecutado** → 382 archivos en 606 ms.
- `node_modules/typescript/lib/typescript.d.ts` (5.9.3) — existencia de `getLeadingCommentRanges`, `getTrailingCommentRanges`, `isTaggedTemplateExpression`, `createSourceFile`, `forEachChild`, `getLineAndCharacterOfPosition`.
- `origin/master`: `src/plugins/database.ts`, `src/db/tenant-tables.ts`, `src/modules/shared/tenant.ts`, `src/db/scripts/verify-tenant-uniques.ts`, `src/db/scripts/require-tenant.ts`, `src/db/index.ts`, `src/modules/tv/pairing.ts`, `src/modules/wellhub/service.ts`, `src/jobs/notification-cron.ts`, `src/db/schema/tv.ts`, `test/setup.ts`, `vitest.config.ts`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `test/db/tenant-tables.test.ts`.
- Conteos verificados por `git grep` sobre `origin/master`: 65 `.transaction(` en 25 archivos; 0 `.iterator(`; 417 ` sql` ``en 62 archivos; 92`mysqlTable(`(21 resolubles por regex de una línea); 425`.ts`en`src`, 228 `_.test.ts`; 92 archivos con `import _ as schema`, 4 con imports nombrados.
- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3 (capas 3, 4, 5) — diseño lockeado (local; **no está en git**).
- `.planning/phases/169-…/169-09-SUMMARY.md` — inventario de las 9 exenciones + hallazgo del grep (11 vs 9).

### Secondary (MEDIUM confidence — doc oficial vía web)

- [actions/checkout README](https://github.com/actions/checkout) — `fetch-depth` default **1**; `0` trae toda la historia.
- [tj-actions/changed-files #387](https://github.com/tj-actions/changed-files/issues/387) y [super-linter #6193](https://github.com/super-linter/super-linter/issues/6193) — `github.event.before` = null SHA en push de rama nueva.
- [drizzle-orm #2720](https://github.com/drizzle-team/drizzle-orm/issues/2720), [discussion #1426](https://github.com/drizzle-team/drizzle-orm/discussions/1426), [discussion #1539](https://github.com/drizzle-team/drizzle-orm/discussions/1539) — Drizzle no expone interceptores/middleware; el multi-tenant guard es tema abierto en la comunidad.

### Tertiary (LOW confidence)

- Ninguna afirmación de este documento descansa solo en WebSearch. Los tres hallazgos estructurales (wrap del pool, parser, anclaje AST) están verificados ejecutando código.

---

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** — cero deps nuevas; toda versión leída del `node_modules` instalado.
- **Punto de integración del sentinel: HIGH** — comportamiento del driver probado ejecutando Drizzle 0.45.1 real, no inferido de la doc.
- **Diseño del parser: HIGH** — 14/14 casos con SQL emitido por el propio Drizzle, incluido el falso negativo que un chequeo ingenuo se comería.
- **Anclaje AST del lint: HIGH** — validado contra los 9 sitios reales de `origin/master`, con los 2 rechazos de prosa correctos.
- **Mecánica del ratchet en CI: MEDIUM-HIGH** — `fetch-depth` y el null SHA confirmados con doc oficial e issues; el comportamiento exacto no se ejecutó en este runner de CI.
- **Pitfalls: HIGH** para 1, 2, 3, 5, 8 (verificados); **MEDIUM** para 4, 7, 9 (razonados desde config y conteos reales, no reproducidos).

**Research date:** 2026-07-28
**Valid until:** ~2026-08-27 (30 días). Se reduce a días si se actualiza `drizzle-orm` o `mysql2`: los hallazgos 1 y 2 dependen del comportamiento **interno** del driver, no de su API pública, así que un bump menor puede invalidarlos. Si esas versiones cambian, re-correr las dos pruebas del pool instrumentado antes de confiar en este documento.
