# Phase 171: Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 6 (4 nuevos, 2 modificados)
**Analogs found:** 6 / 6 (5 exactos o casi, 1 parcial)
**Worktree:** `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`)

> Todas las rutas de este documento son relativas a `el-templo-api/` salvo que se
> diga lo contrario. Los excerpts salen de una lectura real del worktree, con el
> número de línea de la versión actual de `feat/170-sentinel-lint`.

---

## File Classification

| Archivo nuevo/modificado | Rol | Data flow | Analog más cercano | Calidad del match |
|---|---|---|---|---|
| `test/tenant-manifest.ts` **(nuevo)** | registro canónico + función pura | transform | `src/db/tenant-tables.ts` | **exacto** (lista estática + `Record<clave, motivo>` obligatorio + helpers) |
| `test/tenancy/iso-01-manifiesto.test.ts` **(nuevo)** | test (gate fail-closed) | transform / introspección | `test/db/tenant-tables.test.ts` | **exacto** (gate bidireccional con mensaje accionable) |
| `test/fixtures/second-tenant.ts` **(nuevo)** | fixture / factory de test | CRUD (INSERT directo) | `test/tv/tv-pairing-tenant.test.ts:90-198` | **exacto** (`seedBranch` con tenant explícito + `limpiarRastro` branches→tenants) |
| `test/tenancy/iso-02-fixtures.test.ts` **(nuevo)** | test (verificación del espejo) | CRUD | `test/tenancy/tenant-helpers.test.ts` | **exacto** (aserciones por `SELECT tenant_id` + "higiene del archivo") |
| `test/helpers.ts` **(modificado)** | utility / test helper | CRUD | sí mismo (`createStaffUser`, `ensureEfectivoCaja`, `createEligibleFreemium`) | **exacto** (precedente de param opcional retrocompatible) |
| `src/app.ts` **(modificado, 1 línea + docblock)** | config / bootstrap de la app | request-response (registro de rutas) | **parcial** — no hay precedente de `opts` en un factory de app | role-match parcial (ver §No Analog Found) |

**Precedentes secundarios que aplican a varios archivos:**
`test/tenancy/con-04-crons-per-tenant.test.ts:250-364` (enumerar incumplidores por
nombre + mapa de exentos con motivo) y `test/tenancy/con-06-lint.test.ts:94-146`
(motor puro probado con fixtures sintéticos **y** contra el repo real, en el mismo
archivo).

---

## Pattern Assignments

### `test/tenant-manifest.ts` (registro canónico + función pura, transform)

**Analog:** `src/db/tenant-tables.ts` — es el mismo artefacto conceptual: una lista
escrita a mano, versionada, que un gate cruza contra la realidad. El manifiesto de
rutas es su hermano para el eje "rutas" en vez del eje "tablas".

**Docblock de cabecera** — copiar la estructura de secciones en mayúsculas
(`src/db/tenant-tables.ts:1-56`). Es el idioma del repo para registros canónicos:

```ts
// Módulo: tenant-tables — clasificación canónica "¿esta tabla lleva tenant_id?" (v6.0, COL-01)
//
// Esta es la fuente de verdad de qué tablas son gym-owned (llevan la columna
// `tenant_id` que declara `schema/tenant-column.ts`) y cuáles están exentas.
// Vive fuera de `schema/` a propósito: no es una tabla, es metadata del modelo.
//
// DE DÓNDE SALE LA LISTA
// ----------------------
// Del inventario cerrado `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md`: …
//
// POR QUÉ IMPORTA MANTENERLA
// --------------------------
// Esta lista es el insumo directo de las fases siguientes del milestone: …
// Agregar una tabla nueva al schema OBLIGA a clasificarla acá. El test
// `test/db/tenant-tables.test.ts` es fail-closed: una tabla sin clasificar deja
// la suite en rojo, no pasa en silencio.
```

Secciones equivalentes para el manifiesto: `DE DÓNDE SALE LA LISTA` (el volcado
one-shot de `onRoute`, D-16 — y que **no se commitea un regenerador**),
`POR QUÉ IMPORTA MANTENERLA` (una ruta nueva sin línea deja CI en rojo; la 176 lee
la etiqueta `templo-module` de acá), y `POR QUÉ NO HAY COMODINES` (D-01).

**Motivo escrito obligatorio (D-02)** — el precedente literal es
`TENANT_GLOBAL_UNIQUES` (`src/db/tenant-tables.ts:233-249`). Nótese que el motivo
es una **frase que nombra el porqué concreto**, no una etiqueta:

```ts
export const TENANT_GLOBAL_UNIQUES: Record<string, string> = {
  // ── Ids de plataforma externa ──────────────────────────────────────────────
  "users.users_gympass_id_unique":
    "Id de plataforma externa: `gympass_id` lo emite Gympass/Wellhub, no El Templo. Global impide que dos tenants reclamen al mismo usuario de Gympass, que es exactamente el contrato que queremos.",
  "branches.branches_wellhub_gym_id_unique":
    "Id de plataforma externa: `wellhub_gym_id` identifica una sede en el catálogo de Wellhub. Dos tenants no pueden mapear su sede al MISMO gym de Wellhub — la unique global es la que lo garantiza.",

  // ── Secretos random con lookup pre-scope ───────────────────────────────────
  "refresh_tokens.uq_refresh_tokens_token_hash":
    "Secreto random con lookup pre-scope: el refresh llega con el token solo y el tenant sale de la fila encontrada, no al revés. …",
```

Copiar: (a) los **separadores de sección con caja** `// ── nombre ──…` para agrupar
por módulo (D-01 pide agrupación por módulo); (b) el motivo como oración completa
que nombra la causa; (c) el docblock que declara el registro `Record<…>`
justamente "para que no se pueda agregar una entrada sin escribir por qué"
(`src/db/tenant-tables.ts:21-23`).

**Helpers derivados del registro** — `src/db/tenant-tables.ts:181-191`:

```ts
const GYM_OWNED_SET: ReadonlySet<string> = new Set(GYM_OWNED_TABLES);

/**
 * `true` si la tabla física `name` lleva la columna `tenant_id`.
 *
 * Acepta `string` (no `GymOwnedTable`) a propósito: los consumidores de las
 * fases 168-170 clasifican nombres que salen de INFORMATION_SCHEMA, de
 * `getTableName()` o del AST del linter — todos `string` en tiempo de
 * compilación.
 */
export function isGymOwnedTable(name: string): boolean {
```

Aplicar igual: el `Set`/índice se arma **una vez a nivel de módulo**, y
`compararManifiesto` acepta `readonly string[]` (no un tipo literal de las 370
claves) porque las claves observadas salen de `onRoute` en runtime.

**Función pura con parámetro inyectable** — el precedente de "el comparador se puede
llamar con datos sintéticos" es la firma de `lintTenant` /`lintTenantSources` que
`con-06` invoca dos veces, una con fixtures y otra con el repo real
(`test/tenancy/con-06-lint.test.ts:100-110`):

```ts
const SCHEMA_MAP = buildSchemaTableMap(path.join(API_DIR, "src/db/schema"));

const FIXTURE_RESULT: LintSourceResult = lintTenantSources({
  rootDir: FIXTURES_DIR,
  scopeDirs: ["."],
  schemaMap: SCHEMA_MAP,
});

const REAL_RESULT: LintSourceResult = lintTenantSources({ rootDir: REPO_ROOT });
```

Traducción a esta fase: `compararManifiesto(observadas, manifiesto = TENANT_MANIFEST)`
— segundo parámetro con default, para que los tests sintéticos del criterio 2 pasen
un manifiesto inventado sin tocar el real.

---

### `test/tenancy/iso-01-manifiesto.test.ts` (test, gate fail-closed)

**Analog:** `test/db/tenant-tables.test.ts` — es el modelo literal, ya citado como tal
por el RESEARCH.

**Docblock "POR QUÉ EXISTE ESTE ARCHIVO"** (`test/db/tenant-tables.test.ts:1-21`):

```ts
/**
 * Fase 167 Plan 01 (COL-01): gate fail-closed de la clasificación de tablas.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `src/db/tenant-tables.ts` es una lista escrita a mano, y una lista escrita a
 * mano se pudre: alguien agrega una tabla al schema en la fase 172 y nadie se
 * acuerda de clasificarla. …
 *
 * Este test cruza la lista contra el schema Drizzle REAL. Es fail-closed en
 * las dos direcciones: una tabla del schema sin clasificar rompe, y un nombre
 * clasificado que no existe en el schema (typo, rename, tabla borrada) también.
 *
 * NO toca la base de datos: es pura introspección … Corre igual bajo el
 * `setupFiles` del repo (que provisiona la DB por worker) porque así está
 * configurado vitest para todos los archivos — no requiere `createTestApp()`.
 */
```

⚠️ Diferencia obligatoria para el 171: este archivo **SÍ necesita `createTestApp()`**
(Pitfall 2 del RESEARCH — `buildApp()` consulta `formats` durante el registro del
plugin de sessions). El docblock debe decirlo explícitamente para que nadie lo
"optimice" moviéndolo a `test/unit/`.

**El gate bidireccional** (`test/db/tenant-tables.test.ts:61-95`) — es el molde
exacto de `faltantes` / `fantasmas`:

```ts
it("toda tabla del schema está clasificada como gym-owned o exenta", () => {
  const unclassified = [...schemaTables]
    .filter((name) => !gymOwned.has(name) && !exempt.has(name))
    .sort();

  expect(
    unclassified,
    `Tablas del schema Drizzle SIN clasificar en src/db/tenant-tables.ts: ` +
      `${unclassified.join(", ")}. Toda tabla nueva tiene que entrar en ` +
      `GYM_OWNED_TABLES (lleva tenant_id) o en TENANT_EXEMPT_TABLES (con el ` +
      `motivo escrito). No hay tercera opción — el aislamiento multi-tenant ` +
      `de las fases 168/169/170 se construye sobre esta lista.`,
  ).toEqual([]);
});

it("todo nombre clasificado existe realmente en el schema (atrapa typos y renames)", () => {
  const ghosts = [...gymOwned, ...exempt]
    .filter((name) => !schemaTables.has(name))
    .sort();

  expect(
    ghosts,
    `Nombres en src/db/tenant-tables.ts que NO existen en el schema Drizzle ` +
      `(typo, rename o tabla eliminada): ${ghosts.join(", ")}`,
  ).toEqual([]);
});
```

**Anatomía a copiar del mensaje de rojo** (los 4 elementos, en este orden):
1. **Qué falló**, nombrando el archivo del registro.
2. **La lista de incumplidores por nombre** (`.join(", ")`, siempre `.sort()` antes).
3. **Qué hacer**, con las opciones exhaustivas ("no hay tercera opción").
4. **Por qué importa**, citando la fase/decisión (`D-02`, `criterio 2 del ROADMAP`).

**Validación de forma del registro en runtime** (Pitfall 5: `test/` no lo typechequea
nadie) — el precedente es el bloque de la 168, `test/db/tenant-tables.test.ts:207-236`:

```ts
it("todo motivo es una cadena con contenido real, sin marcadores de trabajo pendiente", () => {
  const MARCADORES = /\b(TODO|FIXME|TBD|XXX)\b/;
  const vacios = entradas
    .filter((entrada) => entrada.motivo.trim().length === 0)
    .map((entrada) => `${entrada.registro}: ${entrada.clave} (motivo vacío)`);
  const conMarcador = entradas
    .filter((e) => MARCADORES.test(e.motivo) || /pendiente/i.test(e.motivo))
    .map((e) => `${e.registro}: ${e.clave} (marcador de trabajo pendiente)`);
  const problemas = [...vacios, ...conMarcador].sort();

  expect(
    problemas,
    `Motivos inservibles en los registros de uniques:\n${problemas.join("\n")}\n` +
      `El motivo es obligatorio y es lo ÚNICO que permite auditar la decisión un año ` +
      `después: … Un motivo vacío o un "TODO" convierten la allowlist en una ` +
      `alfombra debajo de la cual barrer uniques sin scope.`,
  ).toEqual([]);
});
```

→ Es literalmente el test `sinMotivo` de D-02. El de `sinModulo` (D-07) sale del
mismo molde, y el de "categoría ∈ las 3" del gate de identificadores
(`test/db/tenant-tables.test.ts:413-433`, regex `/^[a-z][a-z0-9-]*$/` + mensaje que
imprime `IDENTIFICADOR.source`).

**Conteo exacto como decisión de diseño** (para "el manifiesto tiene 370 entradas") —
`test/db/tenant-tables.test.ts:238-249`. Copiar el patrón de mensaje que explica que
mover el número **es una decisión, no un detalle**:

```ts
it("TENANT_GLOBAL_UNIQUES tiene exactamente 11 entradas (la lista M8 cerrada)", () => {
  expect(
    clavesM8.length,
    `TENANT_GLOBAL_UNIQUES tiene ${clavesM8.length} entradas, esperadas 11. La lista M8 se ` +
      `aprobó COMPLETA el 2026-07-26 (doc 06 §8-Q4): … Agregar una doceava es una DECISIÓN ` +
      `DE DISEÑO … y no un detalle de implementación: va con el dueño del producto, no en ` +
      `un plan de ejecución.`,
  ).toBe(11);
});
```

**Enumerar incumplidores leídos del filesystem / runtime, con mapa de exentos**
(`test/tenancy/con-04-crons-per-tenant.test.ts:296-363`) — es el precedente del guard
de HEAD y del bloque "QUÉ HACER CUANDO SE CAIGA":

```ts
/**
 * Jobs que corren fuera del sweep DELIBERADAMENTE, con su motivo. Hoy no hay
 * ninguno: los 7 barren por gimnasio. El mapa existe para que la única forma de
 * eximir un job sea escribir por qué.
 */
const JOBS_EXENTOS: Record<string, string> = {};

it("Test 7: todo job con cron.schedule barre por tenant activo", () => {
  const incumplidores = leerJobs()
    .filter((j) => j.codigo.includes("cron.schedule"))
    .filter((j) => !j.codigo.includes("forEachActiveTenant"))
    .filter((j) => !(j.nombre in JOBS_EXENTOS))
    .map((j) => j.nombre);

  expect(
    incumplidores,
    `Jobs con cron.schedule que NO llaman a forEachActiveTenant: ` +
      `${incumplidores.join(", ")}. Un cron sin barrido por gimnasio lee y ` +
      `escribe sin contexto de tenant y nadie se entera (D-01/T-169-18). ` +
      `Envolvé su cuerpo en forEachActiveTenant, o —si es genuinamente ` +
      `global— anotalo con /* tenant-safe: <motivo> */ y agregalo a ` +
      `JOBS_EXENTOS con el motivo.`,
  ).toEqual([]);
});
```

Y el comentario de bloque que lo precede (`con-04:251-277`), con sus tres títulos
—`POR QUÉ ES FAIL-CLOSED`, `QUÉ HACER CUANDO SE CAIGA`, `POR QUÉ SE DESCARTAN …`—
es el modelo para explicar el guard de HEAD huérfano (Pattern 2 del RESEARCH:
filtrar HEAD en silencio es exactamente el anti-patrón que este comentario condena).

---

### `test/fixtures/second-tenant.ts` (fixture / factory, CRUD por INSERT directo)

**Analog:** `test/tv/tv-pairing-tenant.test.ts` (fase 169-06). Es el único archivo del
repo que ya siembra **tenant + sede + staff** de un segundo gimnasio y lo limpia
respetando `fk_branches_tenant`.

**Constantes de gimnasio arriba, con el porqué del id** (`tv-pairing-tenant.test.ts:62-69`):

```ts
// ─── Constantes de gimnasio ─────────────────────────────────────────────────
/** El Templo, sembrado por la migracion 0190. Este archivo NUNCA lo modifica. */
const TENANT_TEMPLO = 1;
/** Segundo gimnasio, id fijo y ALTO: ver la cabecera. Lo crea y lo borra este archivo. */
const TENANT_SEGUNDO = 90569;
```

Y el párrafo de cabecera que justifica el id (`tv-pairing-tenant.test.ts:39-42`):

```
 * El id 90569 es propio de este archivo y no colisiona con los de los otros
 * archivos de la fase (90168 / 90169 / 90269 / 90369 / 90469): vitest corre con
 * `isolate: false` y dos archivos con el mismo id se pisan dentro del worker.
```

→ El fixture del 171 exporta la constante (p. ej. `TENANT_DOS = 90671`) y repite el
párrafo con la lista de ids tomados **re-grepeada al escribirla** (assumption A4).

**Siembra de sede con `tenantId` EXPLÍCITO** (`tv-pairing-tenant.test.ts:90-115`) —
el corazón de la mitigación T-168-15:

```ts
/**
 * Siembra una sede con `tenantId` EXPLICITO.
 *
 * Explicito incluso para el tenant 1 (T-168-15): una sede del "segundo
 * gimnasio" sembrada sin `tenantId` seria en realidad una sede de El Templo y
 * el test de abajo probaria exactamente nada.
 */
async function seedBranch(
  app: FastifyInstance,
  tenantId: number,
  name: string,
  code: string,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.branches)
    .values({
      tenantId,
      name,
      code: `${code}${suffix()}`.toUpperCase().slice(0, 20),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return row.id;
}
```

⚠️ **Mejora obligatoria sobre el analog:** el 171 debe pasar por `tenantValues(CTX, {…})`
en vez del `tenantId` desnudo — así lo hace el otro precedente de la 169
(`test/tenancy/tenant-helpers.test.ts:198-223`) y lo pide el RESEARCH:

```ts
// Los DOS inserts pasan por `tenantValues`, o sea que estampan `tenantId`
// explícito — incluido el del tenant 1 (T-168-15). Un insert sin la columna
// caería en el DEFAULT 1 y el test del filtro pasaría en verde probando nada.
const [filaTemplo] = await app.db
  .insert(schema.auraConfig)
  .values(
    tenantValues(CTX_TEMPLO, {
      sourceType: SOURCE_TEMPLO,
      defaultAmount: 11,
      description: "169-01 fila del tenant 1",
    }),
  )
  .$returningId();
```

**Sufijo único para códigos/emails** (`tv-pairing-tenant.test.ts:82-88`):

```ts
function suffix(): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000).toString(36).padStart(2, "0");
  return `${t}${r}`;
}
```

Alternativa ya usada en `test/helpers.ts:361` para emails:
`` `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` ``.
Cualquiera de las dos sirve; el punto es que los emails del gimnasio 2 **no pueden
repetir** los del 1 (login resuelve por email sin filtro de tenant).

**Staff del tenant 2 = `createStaffUser` + reasignación** (`tv-pairing-tenant.test.ts:263-278`)
— este es el hueco que ISO-02 viene a tapar; el comentario dice literalmente por qué:

```ts
const ownerSegundoId = await createStaffUser(app, {
  email: "tv-tenant-owner-2@test.com",
  password: "owner-pass-123",
  firstName: "Dueño",
  lastName: "Segundo",
  role: "owner",
  branchId: branchSegundoId,
});
// `createStaffUser` no expone `tenantId` (todo el staff de hoy es del
// tenant 1 y cae en el DEFAULT), asi que el dueño del segundo gimnasio se
// reasigna aca. Es lo que hace que `attachScope` le resuelva
// `scope.tenantId = 90569` y que el claim tenga algo distinto de 1 que
// estampar.
await app.db.execute(
  sql`UPDATE users SET tenant_id = ${TENANT_SEGUNDO} WHERE id = ${ownerSegundoId}`,
);
```

→ Después de ISO-02 este workaround desaparece: `createStaffUser(app, { …, tenantId })`.
El fixture nuevo **no** debe replicar el `UPDATE` posterior.

**`limpiarRastro` — el orden de FKs y el motivo escrito** (`tv-pairing-tenant.test.ts:170-184`).
Es el excerpt más importante del archivo para ISO-02:

```ts
/**
 * Borra el rastro de este archivo, en orden seguro de FKs.
 *
 * `cleanAllTestData` NO limpia `branches` (no esta en `TABLES_TO_CLEAN`): las
 * sedes sobreviven entre tests del mismo worker. Hay que borrarlas a mano
 * porque la fila de `tenants` no puede irse mientras una sede la referencie
 * (`fk_branches_tenant`) — y sin borrar el gimnasio, el `beforeEach` siguiente
 * chocaria con su propia PK.
 */
async function limpiarRastro(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql`DELETE FROM branches WHERE tenant_id = ${TENANT_SEGUNDO} OR name IN (${SEDE_TEMPLO}, ${SEDE_SEGUNDA})`,
  );
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_SEGUNDO}`);
}
```

Notar que el `DELETE` ya lleva `WHERE tenant_id = …` — que es exactamente lo que el
Pitfall 11 pide adoptar desde ahora (cuando `finance` entre a `TENANT_STRICT_MODULES`
en la 172, un `DELETE` sin `tenant_id` haría throw en el sentinel). El fixture del 171
debe borrar **users del tenant 2 también** (`DELETE FROM users WHERE tenant_id = …`),
antes de las sedes.

**Uso en `beforeAll`/`afterAll` — incondicional en los dos** (`tenant-helpers.test.ts:154-167, 186-238`):

```ts
/**
 * Corre en el `beforeAll` (defensivo: una corrida anterior abortada podría
 * haber dejado filas colgadas) y en el `afterAll` (obligatorio: la base la
 * comparten todos los archivos del mismo worker).
 */
```

**Contador de verificación** (`tv-pairing-tenant.test.ts:186-198` / `tenant-helpers.test.ts:169-180`)
— el `execute` de Drizzle devuelve una forma incómoda y los dos archivos la normalizan igual:

```ts
async function contarTenant(app: FastifyInstance, tenantId: number): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${tenantId}`,
  )) as unknown as [Array<{ n: number }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ n: number }>);
  return Number(filas?.[0]?.n ?? -1);
}
```

**Orden de limpieza cuando el archivo también usa `cleanAllTestData`**
(`tv-pairing-tenant.test.ts:220-233`) — resuelve el Pitfall 7:

```ts
afterAll(async () => {
  // Orden seguro de FKs: primero lo que cuelga de las sedes (users,
  // tv_pairings, tv_devices los borra `cleanAllTestData`), despues las sedes
  // y recien al final la fila de `tenants`.
  await cleanAllTestData(app);
  await limpiarRastro(app);
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // Red incondicional: el gimnasio y las sedes se recrean en cada test para
  // que ninguno herede el estado del anterior.
  await limpiarRastro(app);
  await app.db.insert(schema.tenants).values({
    id: TENANT_SEGUNDO,
    name: "Gimnasio de prueba 169-06",
    slug: `test-169-tv-${TENANT_SEGUNDO}`,
    status: "active",
  });
```

→ Regla derivada para `seedSecondTenant`: **siempre después** de `cleanAllTestData`,
e idempotente (arranca por `limpiarSegundoGimnasio`).

---

### `test/tenancy/iso-02-fixtures.test.ts` (test, CRUD)

**Analog:** `test/tenancy/tenant-helpers.test.ts` (169-01).

**Aserción contra la BASE, no contra la respuesta HTTP** — el criterio está escrito en
la cabecera de `tv-pairing-tenant.test.ts:24-26`:

```
 * LAS ASERCIONES VAN CONTRA LA BASE, no contra el body de la respuesta HTTP: lo
 * que esta en discusion es que quedo ESCRITO. El claim devuelve `{ ok: true }` y
 * no expone el tenant (ni debe hacerlo — la columna no sale por ningun schema).
```

**Aserción de doble lado (incluye Y excluye)** — `tenant-helpers.test.ts:276-296`.
Media aserción pasa en verde con un WHERE sin filtro; el comentario lo dice:

```ts
it("Test 4: contra MySQL devuelve sólo las filas del gimnasio pedido", async () => {
  const delSegundo = await app.db
    .select({ id: schema.auraConfig.id, tenantId: schema.auraConfig.tenantId })
    .from(schema.auraConfig)
    .where(tenantWhere(schema.auraConfig, CTX_SEGUNDO));

  const ids = delSegundo.map((f) => f.id);
  expect(ids).toContain(idFilaSegundo);
  // La mitad que importa: la fila del otro gimnasio NO aparece. Una aserción
  // de sola inclusión pasaría en verde con un WHERE sin filtro.
  expect(ids).not.toContain(idFilaTemplo);
  expect(delSegundo.every((f) => f.tenantId === TENANT_SEGUNDO)).toBe(true);
```

**`describe("higiene del archivo")` de cierre** — `tenant-helpers.test.ts:428-442` y
`con-04:366-373`. Es el test de `limpiarSegundoGimnasio` que pide ISO-02:

```ts
describe("higiene del archivo", () => {
  it("Test 13: la limpieza deja la base sin rastro del segundo gimnasio", async () => {
    await limpiarRastro(app);

    expect(await contarTenant(app, TENANT_SEGUNDO)).toBe(0);
    const quedan = await app.db.select(…)…;
    expect(quedan).toEqual([]);

    // El tenant 1 queda intacto: este archivo nunca lo borra.
    expect(await contarTenant(app, TENANT_TEMPLO)).toBe(1);
  });
});
```

**Nota de cómo correrlo, en el docblock** (`tenant-helpers.test.ts:53-55`):

```
 * Correr SOLO este archivo: más de uno a la vez revienta el timeout de 120 s del
 * provisioning en esta máquina.
 *   npx vitest run test/tenancy/tenant-helpers.test.ts --no-file-parallelism
```

---

### `test/helpers.ts` (modificado — utility, CRUD)

**Analog:** sí mismo. Los tres precedentes internos que gobiernan la firma nueva:

**(1) Param opcional con backfill + comentario que explica la retrocompatibilidad**
(`test/helpers.ts:429-470`). Es el molde exacto de `tenantId?: number` con default 1:

```ts
/**
 * Create a staff user directly in the database (bypasses API auth).
 * Returns the created user's ID.
 *
 * Phase 110: `users.country` (varchar(2)) is required for admin/gestion to get
 * a non-null `scope.country` … For backward compatibility with the dozens of
 * existing tests that pre-date Phase 110, when `country` is not explicitly
 * passed AND the role is admin/gestion, this helper derives the country from
 * the user's branch — mirroring the production migration-0107 backfill …
 */
export async function createStaffUser(
  app: FastifyInstance,
  data: {
    email: string; password: string; firstName: string; lastName: string;
    role: string; branchId: number;
    country?: "AR" | "ES" | null;
  },
): Promise<number> {
  const passwordHash = await argon2.hash(data.password);
  …
  const [result] = await app.db
    .insert(schema.users)
    .values({ email: data.email, passwordHash, …, branchId: data.branchId, country })
    .$returningId();
```

→ El cambio del 171 es aditivo: sumar `tenantId?: number` al objeto `data`, envolver
el `.values({…})` en `tenantValues({ tenantId: data.tenantId ?? 1 }, {…})`, y agregar
un párrafo `Fase 171 (ISO-02)` al docblock con el mismo tono ("los ~215 call sites
previos no cambian"). **Ojo con el segundo INSERT** del mismo helper
(`test/helpers.ts:489-493`, `userBranches` para coach/recepcion): también es tabla
gym-owned y también necesita el `tenantValues`.

**(2) INSERT directo cuando la ruta pública no sirve** (`test/helpers.ts:502-551`,
`createEligibleFreemium`) — el precedente exacto de la Opción A del RESEARCH para
`createTestMember` del tenant 2:

```ts
 * Inserts the user directly (bypasses /register, which forces freemium + a
 * fresh created_at) so the test can pin an old created_at. Returns the user id
 * and the email snapshot used by campaign_sends.
 */
export async function createEligibleFreemium(…) {
  const passwordHash = await argon2.hash("pass123456");
  const [result] = await app.db.insert(schema.users).values({ email, passwordHash, … }).$returningId();
  return { id: result.id, email };
}
```

**(3) Helper idempotente que se saltea si ya existe** (`test/helpers.ts:299-322`,
`ensureEfectivoCaja`) — molde para `seedSecondTenant` "barato y repetible":

```ts
export async function ensureEfectivoCaja(app, branchId, currency = "ARS"): Promise<void> {
  const existing = await app.db.select({ id: schema.cashRegisters.id })…limit(1);
  if (existing.length > 0) return;
  await app.db.insert(schema.cashRegisters).values({ … });
}
```

**(4) `createTestApp` — el punto donde se enchufa el seam** (`test/helpers.ts:15-26`):

```ts
/**
 * Create a Fastify test app instance connected to the per-worker test
 * database. DB_NAME is set by test/setup.ts (it includes a suffix derived
 * from VITEST_POOL_ID so parallel workers don't share state).
 *
 * NODE_ENV and JWT_SECRET are set by vitest.config.ts env block.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}
```

→ Cambio del 171: `createTestApp(opts: BuildAppOptions = {})` que **reenvía** las
opciones a `buildApp(opts)`. El hook NO se cuelga acá (Pitfall 1); acá solo se pasa.

---

### `src/app.ts` (modificado — bootstrap, request-response)

**Analog parcial.** No hay ningún factory de app con parámetro de opciones en el repo:
`buildApp()` no recibe nada hoy (`src/app.ts:61`) y tiene **2 call sites**
(`src/index.ts:26`, `test/helpers.ts:23`). Lo que sí hay son dos patrones a copiar:

**(a) Dónde va la línea.** El hook tiene que colgarse **antes** del primer
`addContentTypeParser`/`register` (`src/app.ts:61-89`):

```ts
export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? { level: "silent" } : true,
  });

  // ← AQUÍ va el seam (antes de todo lo demás)

  app.addContentTypeParser("application/x-www-form-urlencoded", …);

  // CORS configuration
  await app.register(cors, { … });
```

**(b) El estilo de docblock "por qué está acá y no en el lugar obvio".** El precedente
es `src/modules/shared/tenant.ts:39-47`, que defiende una decisión de ubicación contra
un futuro refactor bienintencionado:

```ts
// POR QUÉ HAY UN GUARD (`assertTenant`)
// -------------------------------------
// … Por eso el narrowing es un guard EXPORTADO y fail-closed (403
// `TENANT_UNRESOLVED`), y no un non-null assertion ni un `?? 1` escondido:
// prohibidos los dos, en todo el repo, para siempre. El guard se llama en el
// CALL SITE y no dentro de `tenantWhere`, para que el narrowing sea visible en
// el diff que lo introduce.
```

y `src/modules/shared/tenant.ts:65-67`:

```ts
// Este archivo NO se exporta desde el barrel `src/modules/shared/index.ts`, a
// propósito: `country-scope.ts` tampoco está y se importa por path directo desde
// sus 22 call sites. La 169 es consistente con eso.
```

→ El docblock de `BuildAppOptions` debe decir, en ese tono: que es **test-only**, que
`src/index.ts` no lo pasa (en producción es `undefined` y no se agrega ningún hook), y
**por qué no puede vivir en `createTestApp()`** (un hook `onRoute` solo ve rutas
registradas después de colgarse; para cuando `buildApp()` retorna ya se registraron las
370, y después de `ready()` tira `FST_ERR_INSTANCE_ALREADY_LISTENING`).

**(c) Comentarios que explican decisiones de registro.** El archivo ya tiene el hábito
(`src/app.ts:262-274`): cada registro raro lleva su porqué. El seam no es la excepción.

---

## Shared Patterns

### 1. Fail-closed con mensaje que nombra al incumplidor
**Fuente:** `test/db/tenant-tables.test.ts:66-73` (canónico), `test/tenancy/con-04-crons-per-tenant.test.ts:354-362`.
**Aplica a:** `iso-01-manifiesto.test.ts` (todos los `expect`), `iso-02-fixtures.test.ts`.
**Forma:** segundo argumento de `expect(valor, mensaje)` con los 4 elementos (qué falló
+ lista `.sort().join(", ")` + qué hacer + por qué importa).
**Regla propia del 171 (STRIDE del RESEARCH):** el mensaje debe decir explícitamente que
**agrandar la categoría `global` no es una salida válida sin motivo escrito** — mismo
espíritu que el aviso del lint 170 sobre la allowlist (`test/tenancy/con-06-lint.test.ts:60-65`):

```
 * obvia: **agrandar `tenant-lint-allowlist.json` no es una salida válida.** No
 * es una cuestión de disciplina, es que no funciona: el gate de entradas
 * ganadas (D-14) compara la lista contra la rama base y deja el build rojo
 * igual.
```

### 2. Motivo escrito obligatorio junto a la excepción
**Fuente:** `src/db/tenant-tables.ts:21-23` (el porqué del `Record<clave, motivo>`),
`:233-249` (las entradas), `test/tenancy/con-04-crons-per-tenant.test.ts:296-301`
(`JOBS_EXENTOS` vacío pero existente).
**Aplica a:** entradas `global` del manifiesto (D-02) y `templo-module` → `modulo` (D-07).
**Corolario:** el registro puede arrancar vacío y el gate igual existe — "el mapa existe
para que la única forma de eximir sea escribir por qué".

### 3. `tenantValues` en TODO INSERT, incluso los del tenant 1 (T-168-15)
**Fuente:** `src/modules/shared/tenant.ts:170-175` + `test/tenancy/tenant-helpers.test.ts:198-210`.
**Aplica a:** `second-tenant.ts` (todos los INSERT), `helpers.ts` (`createStaffUser`,
`userBranches`, `createTestMember` camino tenant≠1).

```ts
export function tenantValues<V extends Record<string, unknown>>(
  scope: { tenantId: TenantId },
  values: V,
): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId };
}
```

### 4. Limpieza local, incondicional y en orden de FK
**Fuente:** `test/tv/tv-pairing-tenant.test.ts:170-184` + `test/tenancy/tenant-helpers.test.ts:154-167`.
**Aplica a:** `second-tenant.ts` (`limpiarSegundoGimnasio`), los dos archivos de test nuevos.
**Orden obligado:** filas hijas → `users` (tenant 2) → `branches` (tenant 2) → `tenants`.
Los `DELETE` llevan `WHERE tenant_id = …` desde ahora (Pitfall 11).
**Nunca:** ampliar `TABLES_TO_CLEAN` con `branches` (rompería los 165 archivos que
dependen de `branchId: 1` sembrado por `test/setup.ts`).

### 5. Constantes arriba, cero números mágicos en las aserciones
**Fuente:** `test/tenancy/tenant-helpers.test.ts:73-99`, `test/tv/tv-pairing-tenant.test.ts:58-69`.
**Aplica a:** los 4 archivos nuevos. Ids de tenant, urls de ruta y nombres de sede como
constantes con docblock que explique la elección del valor.

### 6. Docblock de cabecera con secciones en MAYÚSCULAS
**Fuente:** `test/db/tenant-tables.test.ts:1-21`, `test/tenancy/tenant-helpers.test.ts:1-56`,
`test/tv/tv-pairing-tenant.test.ts:1-45`, `src/db/tenant-tables.ts:1-56`.
**Secciones del idioma del repo:** `POR QUÉ EXISTE ESTE ARCHIVO`, `LO QUE SE AFIRMA`,
`QUÉ **NO** ES ESTE ARCHIVO`, `QUÉ HACER CUANDO SE CAIGA`, `ALCANCE`, más la nota de
cómo correrlo. Los archivos de tenancy están escritos **en castellano**; mantenerlo.

### 7. Costo del provisioning: decirlo en el docblock, no pelearlo
**Fuente:** `test/db/tenant-tables.test.ts:17-20`, `test/tenancy/con-06-lint.test.ts:67-71`.
**Aplica a:** `iso-01-manifiesto.test.ts`.

```
 * Los dos `describe` **NO tocan la base de datos**: leen archivos y los
 * parsean. Corren igual bajo el `setupFiles` del repo, que provisiona MySQL por
 * worker para TODO archivo de test (~96 s de overhead conocida, hallazgo
 * 169-07).
```

⚠️ En el 171 la frase se invierte: el gate del manifiesto **sí** necesita
`createTestApp()` porque `buildApp()` consulta `formats` al registrar el plugin de
sessions. Decirlo con esa misma explicitud para que nadie lo mueva a `test/unit/`.

### 8. Motor puro probado dos veces: con fixture sintético y contra lo real
**Fuente:** `test/tenancy/con-06-lint.test.ts:100-110` + los dos `describe` que separan
"motor sobre fixtures" de "contra los archivos reales" (`:132`, `:277`).
**Aplica a:** `iso-01-manifiesto.test.ts` — es la estructura que habilita el criterio 2
del ROADMAP (demostrado, no asumido): un `describe` con las rutas reales y otro con
listas sintéticas que fuerzan `faltantes`/`fantasmas`/`sinMotivo`/`sinModulo`.

---

## No Analog Found

| Archivo | Rol | Data flow | Motivo |
|---|---|---|---|
| `src/app.ts` — parámetro `BuildAppOptions` | bootstrap | request-response | No existe en el repo ningún factory de app con opciones ni ningún seam test-only en `src/`. Lo más cercano son params opcionales de helpers **de test** (`createStaffUser` `country?`, `ensureEfectivoCaja` `currency = "ARS"`) — sirven para la forma de la firma, no para el racional. Para el docblock, usar el tono de `src/modules/shared/tenant.ts:39-47` (defender la ubicación contra un refactor futuro). El RESEARCH ya lo dejó especificado en Pattern 1; el planner solo cierra la Open Question 1 (`onRoute?: (r: RouteOptions) => void` vs. `plugins: FastifyPluginCallback[]`). |

**Zona sin precedente parcial:** el guard de HEAD huérfano (Pattern 2 del RESEARCH) no
tiene analog directo, pero su *forma* —separar, filtrar con un guard que se pone rojo
en vez de tragarse el caso raro, y explicar en comentario por qué el filtro ciego es el
anti-patrón— es exactamente `con-04:272-277` (`POR QUÉ SE DESCARTAN LAS LÍNEAS DE
COMENTARIO ANTES DE BUSCAR`: *"El filtro no es cosmético"*).

---

## Metadata

**Analog search scope:** `el-templo-api/test/tenancy/`, `el-templo-api/test/db/`,
`el-templo-api/test/tv/`, `el-templo-api/test/wellhub/`, `el-templo-api/test/helpers.ts`,
`el-templo-api/src/app.ts`, `el-templo-api/src/db/tenant-tables.ts`,
`el-templo-api/src/modules/shared/tenant.ts`.
**Archivos leídos en profundidad:** 8 (`test/db/tenant-tables.test.ts`, `src/app.ts`,
`test/helpers.ts`, `src/modules/shared/tenant.ts`, `test/tenancy/tenant-helpers.test.ts`,
`test/tv/tv-pairing-tenant.test.ts` parcial, `test/tenancy/con-04-crons-per-tenant.test.ts`
parcial, `test/tenancy/con-06-lint.test.ts` parcial) + `src/db/tenant-tables.ts` parcial.
**Ids de tenant tomados hoy (re-grepeado 2026-07-29):** 90168, 90169, 90269, 90369,
90469, 90569. El fixture del 171 necesita uno nuevo (RESEARCH propone `90671`).
**Pattern extraction date:** 2026-07-29
