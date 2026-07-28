# Phase 170: Detección automática — sentinel de pool mysql2 + lint en CI - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Phase Boundary

El sistema se avisa solo cuando alguien escribe una query sin tenant. Dos piezas:

1. **Sentinel de pool mysql2** (capa 3 del doc 03): envuelve `pool.query/execute`
   **por debajo de Drizzle** (ve el SQL final de todo: query builder, `sql``` crudo,
joins). Detecta SQL que mencione una tabla gym-owned (las 87 de `GYM_OWNED_TABLES`)
sin `tenant_id`. Throw en test/dev para tablas de módulos migrados (lista strict,
vacía en esta fase); `log.error` deduplicado + métrica en prod/staging.
2. **Lint estático en CI** (capa 4): script AST que deja el build rojo ante un
   ` sql`` ` o acceso query-builder a tabla gym-owned nuevo sin `tenant_id` ni
   anotación `/* tenant-safe: <motivo> */`, con allowlist que arranca completa y
   solo puede achicarse.

Fuera de esta fase: migrar módulos al patrón (adopción 172-175), manifiesto de rutas
y fixtures 2-tenant (171). **Cero migraciones de DB previstas** (si apareciera una,
reservar desde 0197).

**Base de código:** arrancar desde `origin/master` (fases 166-169 mergeadas y en
prod; `a70ee297`). El checkout principal está en una rama vieja — patrón worktree
de las fases 166-169.

</domain>

<decisions>
## Implementation Decisions

### Ruido en prod y métrica (sentinel)

- **D-01:** **Dedup por fingerprint** en prod/staging: la primera aparición de cada
  SQL violador distinto (el texto con placeholders `?` que ve el pool YA es el
  fingerprint) emite `log.error` con detalle; las repeticiones solo incrementan un
  contador. Motivo: hoy cero módulos están migrados — sin dedup, el sentinel
  flaggearía casi todo el tráfico de prod y taparía errores reales.
- **D-02:** La "métrica" es **contador in-memory + resumen periódico en log**
  (p. ej. cada hora, log estructurado con totales y top tablas/queries violadoras).
  Grepeable vía pm2/Pino, cero dependencias nuevas. **NO Sentry** para esta deuda
  conocida (no mezclar con errores reales del dashboard).
- **D-03:** El sentinel inspecciona **todas las queries** — SELECT y escrituras
  (diseño cerrado del doc 03; una lectura sin `tenant_id` es la fuga peor: devuelve
  datos de otro gimnasio).
- **D-04:** Ventana de observación (criterio 2): el inventario grueso de excepciones
  sale **determinístico de correr la suite con el sentinel en modo inventario**
  (~140 archivos de test ejercitan el SQL real); después **2-3 días en staging** con
  uso del staff confirman y cierran la lista. No semanas de observación pasiva.

### Mecanismo de "módulo migrado" (lista strict)

- **D-05:** La lista strict (throw) vive en **`src/db/tenant-tables.ts`** junto a
  `GYM_OWNED_TABLES` y `TENANT_GLOBAL_UNIQUES` — fuente canónica única, ya vigilada
  por los gates de forma del 168-05.
- **D-06:** Granularidad **por módulo → tablas** (`Record<módulo, tabla[]>`, p. ej.
  `{ finance: [...] }`): una fase de adopción = una entrada. El sentinel la aplana
  internamente. Arranca **vacía** en la 170 (la primera entrada la agrega la 172).
- **D-07:** El sentinel es **parametrizable**: acepta la lista strict por parámetro
  (default: la de `tenant-tables.ts`). El test del criterio 1 inyecta una tabla real
  como strict, dispara una query sin `tenant_id` y afirma el **throw con el SQL en
  el mensaje**. NO se declara migrada ninguna tabla real en esta fase.
- **D-08:** En la corrida normal de tests, las tablas no-strict quedan **en
  silencio** (el output de la suite no se ensucia). Un flag (p. ej.
  `SENTINEL_INVENTORY=1`) activa el **modo inventario**: junta todas las violaciones
  y escupe el reporte agregado al final — es la fuente del inventario de D-04.

### Forma del lint

- **D-09:** **Script standalone tsx** (idioma `verify-tenant-*` del repo): exit
  codes 0 = limpio / 1 = violaciones / 2 = error de uso o interno, step propio en el
  job de CI del API que rompe el build, y comando local (`pnpm lint:tenant` o
  similar). **NO regla ESLint** (el API no tiene config ESLint y armarla es la pieza
  más cara), **NO gate Vitest** (pagaría los ~96 s del provisioning MySQL que
  `test/setup.ts` impone a todo archivo de test — hallazgo 169-07).
- **D-10:** Análisis por **AST con el compiler API de TypeScript** (ya es
  dependencia — cero deps nuevas; regla del repo: no instalar deps sin preguntar).
  El AST distingue un ` sql`` ` real de una mención en prosa/comentario y ancla la
  exención al **comentario de bloque en el sitio del write** — cierra el hallazgo
  169-09: el grep crudo de `tenant-safe:` da 11 archivos y solo 9 son exenciones
  reales (`require-tenant.ts:44` y `schema/tv.ts:81` son prosa).
- **D-11:** Corre en **CI + comando local manual**. NO en pre-commit (no sumar
  segundos de análisis de proyecto entero a todos los commits).
- **D-12:** El lint **valida también las exenciones existentes** (criterio 3):
  motivo no vacío, anclaje a un sitio real de query (no prosa suelta), y emite el
  inventario completo (los 9 actuales, listados en 169-09-SUMMARY) en una salida
  revisable de una sola pasada.

### Allowlist decreciente

- **D-13:** Formato de entrada: **archivo + tabla gym-owned accedida** (sin números
  de línea — estable ante ediciones). Un acceso nuevo a otra tabla en el mismo
  archivo = entrada nueva = rojo. Mapea 1:1 con la adopción por módulo.
- **D-14:** Anti-crecimiento **duro**: el step de CI compara la allowlist contra la
  rama base (merge-base con master; `event.before` en push directo — ver trampa de
  `paths-filter` en las refs) y **entradas ganadas = build rojo**. Además, entradas
  **stale** (el sitio ya no viola o el archivo no accede más esa tabla) = rojo,
  forzando el achique.
- **D-15:** **Coherencia strict/allowlist enforced**: tabla presente en la lista
  strict del sentinel con entradas vivas en la allowlist = rojo. Cada fase de
  adopción queda obligada a vaciar sus entradas al activar el throw.
- **D-16:** Baseline **one-shot**: el modo de generación se corre UNA vez en esta
  fase para poblar la allowlist inicial (revisada y commiteada). **No queda comando
  regenerador permanente** — sería la puerta trasera del ratchet; achicar es borrar
  entradas a mano al migrar.

### Canal de exención (resuelto post-research, 2026-07-28)

- **D-17:** **Dos canales explícitos de exención** (decisión de Franco sobre la
  open question #1 del RESEARCH): el **lint** razona sobre el código fuente
  (comentario `/* tenant-safe: <motivo> */` anclado al call site vía AST) y el
  **sentinel** razona sobre el SQL crudo. NO se fuerza a que el comentario viaje
  embebido en el SQL — ninguna de las 9 exenciones reales de la 169 llega al SQL
  (6 file-level, 3 comentarios TS) y no se reescriben. Consecuencia aceptada:
  esas exenciones aparecen como violaciones no-strict en el inventario del
  sentinel — correcto, porque son deuda real y ninguna tabla es strict aún.

### Lockeadas por diseño (NO re-litigar; fuentes en canonical_refs)

- Sentinel envuelve `pool.query/execute` por debajo de Drizzle (doc 03 capa 3);
  **detecta, no re-escribe** SQL.
- test/dev = throw (para strict); prod = `log.error` + métrica, jamás throw
  (decidido con Nacho 2026-07-02).
- Exenciones `/* tenant-safe: <motivo> */` grepeables en el fuente; formato ya
  establecido con 9 exenciones reales escritas en la 169. (El "viajan en el SQL"
  del doc 03 queda superado por D-17: canal fuente para el lint, canal SQL para
  el sentinel.)
- Limitación asumida y documentada: el sentinel chequea **presencia** de
  `tenant_id`, no corrección del filtro — es tripwire contra el olvido; la
  corrección la prueba la capa 5 (fase 171+).
- Lista de 87 tablas gym-owned = `GYM_OWNED_TABLES` de `src/db/tenant-tables.ts`
  (generada/validada en la 167, con gates de forma).

### Claude's Discretion

- Forma exacta del parser del sentinel ("parsea trivialmente" per doc 03): cómo
  extraer nombres de tabla del SQL y detectar presencia de `tenant_id` con mínimos
  falsos positivos; qué hacer con statements no-DML (SET, SHOW, transacciones).
- Nombre y ubicación del script de lint, del pnpm script y del archivo de allowlist.
- Detalle del resumen periódico (intervalo exacto, forma del log estructurado).
- Cómo se integra el wrap del pool en `plugins/database.ts` (decorar antes de
  `drizzle(pool)` vs proxy del pool) — mientras quede por debajo de Drizzle.
- Qué considera el lint como "presencia de tenant_id": uso de
  `tenantWhere`/`tenantValues` cuenta como cumplimiento (son la forma correcta que
  el sentinel premia — fase 169).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de tenancy (fuente de verdad de esta fase)

- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3 (capas 3 y 4) — Diseño
  cerrado del sentinel de pool y del lint de CI: qué detecta, throw vs log, formato
  de exención. La fase implementa esto tal cual.
- `.docs/saas-multitenancy/README.md` §4.2 (puntos 3 y 4) — Decisiones validadas
  con Nacho (2026-07-02): prod = `log.error` + métrica, no throw; limitación
  presencia-no-corrección asumida.
- `.planning/phases/169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc/169-09-SUMMARY.md`
  — **Inventario completo de las 9 exenciones `tenant-safe:` con sus motivos** y el
  **hallazgo accionable**: el grep crudo da 11 archivos (2 son prosa:
  `src/db/scripts/require-tenant.ts:44` y `src/db/schema/tv.ts:81`); el matcher
  debe anclar en comentario de bloque en el sitio del write.
- `.planning/phases/169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc/169-CONTEXT.md`
  — Decisiones de la 169 (helpers, formato de exención D-06, contrato CLI D-07).

### Código canónico ya existente (leer en `origin/master`, NO en ramas viejas)

- `el-templo-api/src/db/tenant-tables.ts` — `GYM_OWNED_TABLES` (87 tablas),
  `TENANT_EXEMPT_TABLES`, `TENANT_GLOBAL_UNIQUES`, allowlist de uniques; acá se
  agrega la lista strict por módulo (D-05/D-06). Tiene gates de forma en
  `test/db/tenant-tables.test.ts` que habrá que extender, no romper.
- `el-templo-api/src/plugins/database.ts` — El pool mysql2 (`createPool` +
  `drizzle(pool)`), ya decorado como `dbPool`; punto de integración del sentinel.
- `el-templo-api/src/modules/shared/tenant.ts` — `tenantWhere`/`tenantValues`
  (169): la forma correcta que sentinel y lint premian.
- `el-templo-api/src/db/scripts/verify-tenant-uniques.ts` — Idioma de scripts
  standalone del repo (conexión, salida, exit codes 0/1/2) que el lint copia.
- `.github/workflows/ci.yml` — Job del API (tsc + audit + build + tests); acá se
  agrega el step del lint. **Dato:** el API NO tiene ESLint configurado (los
  `eslint.config.js` son de los frontends).

### Reglas operativas del repo

- `.claude/skills/el-templo-change-control/SKILL.md` — Staging-first, worktree para
  la fase (checkout principal compartido y en rama vieja), no instalar deps sin
  preguntar.
- `.planning/memory/reference_deploy_paths_filter_trap.md` (vía MEMORY.md) —
  `paths-filter` usa `event.before`: relevante para el diff de allowlist en CI
  (D-14) y para el deploy del step nuevo.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/plugins/database.ts` — el pool se crea en un solo lugar y ya
  se decora (`dbPool`); envolver `pool.query/execute` ahí cubre TODO el SQL de la
  app (Drizzle pasa por ese pool).
- `el-templo-api/src/db/tenant-tables.ts` — la lista de 87 tablas ya existe,
  exportada y con gates; el sentinel y el lint la importan en vez de duplicarla.
- `el-templo-api/src/db/scripts/verify-tenant-*.ts` — patrón completo de script
  standalone (tsx, exit codes, `QueryFn` inyectable para tests unitarios sin DB —
  ver `require-tenant.ts` de la 169 y sus 16 tests unit).
- `test/unit/require-tenant.test.ts` — precedente de test unitario puro (sin
  MySQL); ojo: `test/setup.ts` provisiona la DB igual para todo archivo (~96 s de
  overhead conocida, hallazgo 169-07).

### Established Patterns

- Gates fail-closed probados en vivo (168-05, 169-04, 169-08): el patrón del repo
  es demostrar el rojo con una sonda temporal, registrarlo y revertir sin commitear
  el estado roto — el criterio 4 pide exactamente eso ("demostrado con un caso de
  prueba").
- Exenciones con motivo escrito en comentario de bloque APARTE (no anidado en
  `/** */` — un `/* */` no se puede anidar, hallazgo 169-07).
- CI del API corre en push a staging y master; la trampa de `paths-filter`
  (`event.before`) aplica a cualquier step nuevo.

### Integration Points

- `el-templo-api/src/plugins/database.ts` — wrap del pool (sentinel).
- `el-templo-api/src/db/tenant-tables.ts` — lista strict por módulo (D-05/D-06).
- `.github/workflows/ci.yml` — step nuevo de lint en el job del API.
- `el-templo-api/package.json` — pnpm script del lint local.
- `el-templo-api/test/` — tests del sentinel (throw/warn/exención) y del lint;
  preferir tests unitarios con inyección donde no haga falta MySQL.

</code_context>

<specifics>
## Specific Ideas

Franco eligió la opción recomendada en las 16 preguntas de las 4 áreas (pidió una
sola aclaración: qué significaba el problema del ruido en prod antes de decidir
D-01). Sin pedidos fuera del diseño ya validado.

</specifics>

<deferred>
## Deferred Ideas

- Endurecer el sentinel de prod (pasar de `log.error` a throw) — explícitamente
  pospuesto por diseño "endurecer después con datos reales" (README §4.2); no es de
  esta fase ni está roadmapeado.
- Config ESLint para el API (feedback en editor) — descartada como forma del lint
  de esta fase; si algún día se arma ESLint en el API, la regla podría portarse.
- Sistema de métricas real (Prometheus/OTel) — la "métrica" de esta fase es
  contador + log; una infraestructura de métricas es otra conversación.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — falso positivo por keywords, ya revisado y NO
  foldeado en la 166 y la 169 (rollout de datos del árbol SPOM v5.1, sin relación
  con tenancy).

</deferred>

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Context gathered: 2026-07-28_
