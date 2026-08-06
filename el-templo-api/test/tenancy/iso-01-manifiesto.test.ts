/**
 * Fase 171 Plan 03 (ISO-01): el gate fail-closed del manifiesto de rutas.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `test/tenant-manifest.ts` es una lista escrita a mano que dice, ruta por
 * ruta, si esa ruta ve datos de UN gimnasio (`tenant-scoped`), de todos a
 * propósito (`global`, con motivo escrito) o de un módulo exclusivo de El
 * Templo (`templo-module`, con módulo declarado). Una lista escrita a mano se
 * pudre sola: alguien registra una ruta nueva en la fase 173 y nadie se acuerda
 * de clasificarla. Esa ruta quedaría FUERA del backstop de aislamiento para
 * siempre —sin decisión consciente, sin revisión, sin nada que la delate— hasta
 * que un gimnasio leyera datos de otro.
 *
 * Este archivo cruza el manifiesto contra las rutas que Fastify registra DE
 * VERDAD, observadas por el hook `onRoute` que `buildApp()` cuelga cuando se lo
 * pide el seam `BuildAppOptions` (fase 171 plan 01). Es el analog por el eje
 * "rutas" de lo que `test/db/tenant-tables.test.ts` es por el eje "tablas".
 *
 * LO QUE SE AFIRMA
 * ----------------
 * 1. Toda ruta observada en runtime tiene entrada en el manifiesto
 *    (`faltantes` = []). Es el criterio 2 del ROADMAP de la fase 171: una ruta
 *    nueva sin clasificar deja CI en rojo NOMBRÁNDOLA.
 * 2. Toda entrada del manifiesto corresponde a una ruta que existe de verdad
 *    (`fantasmas` = []): atrapa typos, renames y rutas borradas.
 * 3. Todo `HEAD` observado se explica por un `GET` hermano
 *    (`headHuerfanos` = []): un HEAD declarado A MANO se pone rojo en vez de
 *    colarse por el filtro. Las dos formas de declararlo se detectan: sin GET
 *    hermano cae en `headHuerfanos`, y con GET hermano —que Fastify obliga a
 *    registrar con `exposeHeadRoute: false`— el `onRoute` lo delata y el HEAD
 *    va al manifiesto como cualquier ruta (rojo en el test 1 hasta que se
 *    clasifique).
 * 4. El manifiesto tiene el conteo exacto del baseline, para que un gate verde
 *    no pueda serlo por vacuidad.
 * 5. Las validaciones de FORMA (D-02 motivo obligatorio en `global`, D-07
 *    módulo obligatorio en `templo-module`, categoría dentro de las tres) se
 *    AFIRMAN contra el manifiesto REAL (quinto test del bloque real-app) y
 *    además se demuestran con fixtures sintéticos que dejan probado el motor en
 *    CI para siempre. Las dos mitades hacen falta: sin la primera, una entrada
 *    `global` con motivo "TODO" entraría a master en verde (la clave existe,
 *    así que ni `faltantes` ni `fantasmas` la ven); sin la segunda, el verde de
 *    la primera podría ser un comparador roto que nunca reporta nada. No
 *    alcanza con los tipos: `tsconfig.json` incluye solo `src/**`, así que el
 *    `tsc --noEmit` de CI NO mira `test/` y Vitest usa esbuild (borra tipos sin
 *    chequearlos). `test/` es tierra sin tipos verificados.
 *
 * QUÉ NO ES ESTE ARCHIVO
 * ----------------------
 * No es un test de comportamiento de ninguna ruta: no manda un solo request. No
 * opina sobre si la clasificación de una ruta es CORRECTA —eso es la decisión
 * humana del checkpoint D-03/D-04— sino sobre si existe, si es auditable y si
 * sigue correspondiéndose con la realidad.
 *
 * POR QUÉ SÍ NECESITA `createTestApp()` (no lo muevas a `test/unit/`)
 * -------------------------------------------------------------------
 * La tentación obvia es "esto no toca la base, va en test/unit/". No funciona:
 * `buildApp()` NECESITA MySQL vivo, porque `src/modules/sessions/routes.ts`
 * hace un `SELECT` sobre `formats` DURANTE el registro del plugin, no en el
 * handler. Sin base, el `beforeAll` explota con `Failed query: select name,
 * description from formats`. Y además no habría nada que ganar: `vitest.config.ts`
 * declara `test/setup.ts` como `setupFiles` para TODOS los archivos —también los
 * de `test/unit/`— así que el provisioning por worker (~96 s, hallazgo 169-07)
 * se paga igual en cualquier carpeta. Por eso vive acá, en `test/tenancy/`,
 * junto al resto de los gates de aislamiento.
 *
 * QUÉ HACER CUANDO SE CAIGA
 * -------------------------
 *   - Rojo en "toda ruta observada está clasificada": agregaste una ruta.
 *     Escribile su línea en `test/tenant-manifest.ts`, en la categoría que
 *     corresponda. Esa edición ES la decisión consciente que esta fase compra.
 *   - Rojo en "toda entrada existe realmente": borraste o renombraste una ruta y
 *     su línea quedó huérfana, o hay un typo en la clave. Borrá o corregí la
 *     entrada.
 *   - Rojo en el guard de HEAD: alguien declaró un `HEAD` a mano. Clasificalo o
 *     quitalo — no lo filtres.
 *   - Rojo en el test de FORMA: una entrada `global` quedó sin motivo utilizable
 *     (D-02), una `templo-module` sin módulo válido (D-07), o una categoría está
 *     mal escrita. Escribí el motivo/módulo que falta o corregí el typo — NO
 *     borres la entrada para que se calle.
 *   - Rojo en el conteo: mirá el diff. El número sube cuando se agrega una ruta
 *     CON su línea y baja cuando se borra una ruta Y su línea; que se mueva solo
 *     significa que una de las dos mitades falta.
 *
 * Y la que NO está en la lista, escrita explícitamente porque es la tentación
 * obvia: mandar la ruta nueva a `global` para que el gate se calle **no es una
 * salida válida sin motivo escrito** (D-02). `global` es la categoría
 * peligrosa: afirma que esa ruta ve datos de todos los gimnasios y está bien.
 * Sin motivo, la validación de runtime la reporta en `sinMotivo` y el gate sigue
 * rojo.
 *
 * CÓMO CORRERLO
 * -------------
 *   cd el-templo-api
 *   pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000
 *
 * El `--hookTimeout` alto es por el provisioning del worker, no por este
 * archivo.
 */

import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

import { createTestApp } from "../helpers";
import {
  TENANT_MANIFEST,
  clavesDeEvento,
  compararManifiesto,
  particionarObservadas,
  type Discrepancias,
  type EntradaManifiesto,
  type Particion,
} from "../tenant-manifest";

/**
 * Conteo del baseline volcado el 2026-07-29 sobre `feat/170-sentinel-lint`
 * (plan 171-02): **370 rutas**. Mover este número es una DECISIÓN, no un
 * detalle: ver el cuarto test.
 *
 * **Movido a 372 el 2026-07-30**, primera vez que el gate cobró en serio. Al
 * mergear `origin/staging` para el tren a master entraron dos rutas de caja en
 * efectivo escritas en paralelo a esta fase (UAT caja/cobros 2026-07-21), y el
 * gate las nombró en CI:
 *   - `GET /api/admin/finance/coach-load/caja-efectivo`
 *   - `POST /api/admin/finance/cash-registers/efectivo`
 * Ambas clasificadas **tenant-scoped**, que es lo que su código ya afirmaba:
 * las dos llaman `assertTenant(request.scope, …)` y el GET filtra con
 * `tenantWhere(schema.cashRegisters, ctx)`. Ver datos de UN gimnasio es
 * exactamente el caso normal (D-02). Decisión de Franco, 2026-07-30.
 *
 * **Movido a 373 el 2026-08-04**, esta vez por una ruta nueva y no por un
 * merge: `POST /api/admin/members/:userId/referrals` (atribución retroactiva de
 * referidor, fase 173). **tenant-scoped**: escribe en `referrals`, gym-owned, y
 * el INSERT toma el gimnasio de `assertTenant(request.scope, …)` — jamás del
 * body. Es el caso normal de D-02, operar sobre datos de UN gimnasio.
 *
 * **Movido a 374 el 2026-08-06**, ruta nueva y no un merge:
 * `GET /api/admin/anniversaries` (cartelera de aniversarios de permanencia).
 * **tenant-scoped**: lista alumnos de UNA sede (branchId + requireBranchAccess),
 * datos de un solo gimnasio, el caso normal de D-02. NOTA: esta feature viaja a
 * master por fuera del tren v6.0; en master no existe este gate, así que este
 * bump es solo de staging.
 *
 * El reparto por categoría vigente es 225 `tenant-scoped` · 8 `global` · 141
 * `templo-module`, sobre el aprobado por Franco en el
 * checkpoint del plan 171-06 (2026-07-29). Este archivo NO afirma el reparto
 * por categoría a propósito, y
 * por eso recategorizar una ruta no lo pone rojo: lo que el gate defiende es que
 * NINGUNA ruta quede sin clasificar (los dos tests bidireccionales) y que la
 * forma de cada entrada se sostenga (`sinMotivo` / `sinModulo` /
 * `categoriaInvalida`). Quién va en qué categoría es una decisión humana con
 * dueño y fecha, registrada en `171-CLASIFICACION.md`, no una constante de test.
 */
const ENTRADAS_BASELINE = 374;

describe("manifiesto de rutas — contra el app real (ISO-01)", () => {
  let app: FastifyInstance | undefined;
  let particion: Particion;
  let discrepancias: Discrepancias;

  /**
   * UN solo `beforeAll` para los cinco tests: cada `buildApp()` registra ~35
   * plugins y consulta la base, así que construir el app por test multiplicaría
   * el costo sin agregar una sola afirmación.
   */
  beforeAll(async () => {
    const observadas: string[] = [];
    const getsSinHeadSintetico: string[] = [];
    app = await createTestApp({
      onRoute: (route) => {
        for (const clave of clavesDeEvento(route.method, route.url)) {
          observadas.push(clave);
        }
        // WR-03: un GET registrado con `exposeHeadRoute: false` NO genera HEAD
        // sintético — es la única forma que Fastify acepta de convivir con un
        // HEAD declarado a mano en la misma url. Registrar estas urls es lo que
        // le permite a `particionarObservadas` mandar ese HEAD manual al
        // manifiesto en vez de filtrarlo como si fuera sintético.
        const metodos =
          typeof route.method === "string" ? [route.method] : route.method;
        if (
          route.exposeHeadRoute === false &&
          metodos.some((m) => m.trim().toUpperCase() === "GET")
        ) {
          getsSinHeadSintetico.push(route.url);
        }
      },
    });
    particion = particionarObservadas(observadas, getsSinHeadSintetico);
    discrepancias = compararManifiesto(particion.rutas);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("toda ruta registrada por el app tiene entrada en el manifiesto", () => {
    const faltantes = discrepancias.faltantes.slice().sort();

    expect(
      faltantes,
      `Rutas que el app REGISTRA y que NO están clasificadas en ` +
        `test/tenant-manifest.ts: ${faltantes.join(", ")}. ` +
        `QUÉ HACER: agregá una línea por cada una en TENANT_MANIFEST, con la ` +
        `clave exacta "<MÉTODO> <url>" tal cual aparece acá arriba, en la ` +
        `categoría que corresponda — "tenant-scoped" si la ruta ve datos de UN ` +
        `gimnasio (el caso normal), "templo-module" con su módulo si es un ` +
        `feature exclusivo de El Templo (D-07), "global" SOLO si de verdad ve ` +
        `datos de todos los gimnasios. ` +
        `OJO: mandarla a "global" para que este test se calle NO ES UNA SALIDA ` +
        `VÁLIDA SIN MOTIVO ESCRITO (D-02): la validación de runtime la reporta ` +
        `en sinMotivo y el gate sigue rojo igual. ` +
        `POR QUÉ IMPORTA: esto es el criterio 2 del ROADMAP de la fase 171 —una ` +
        `ruta nueva sin clasificar tiene que romper CI— y es lo que impide que ` +
        `las fases 172-175 construyan el aislamiento sobre una lista incompleta. ` +
        `Una ruta sin entrada no la mira nadie: ni la revisión humana, ni el ` +
        `enforcement de requireModule de la fase 176.`,
    ).toEqual([]);
  });

  it("toda entrada del manifiesto corresponde a una ruta que existe (atrapa typos, renames y rutas borradas)", () => {
    const fantasmas = discrepancias.fantasmas.slice().sort();

    expect(
      fantasmas,
      `Entradas de test/tenant-manifest.ts que NO corresponden a ninguna ruta ` +
        `registrada hoy: ${fantasmas.join(", ")}. ` +
        `Las causas son tres y todas importan: (1) un TYPO en la clave —y una ` +
        `clave con typo no clasifica nada, deja la ruta real como faltante—, ` +
        `(2) un RENAME de la ruta que no se propagó a su línea, (3) una ruta ` +
        `BORRADA cuya entrada quedó huérfana. ` +
        `QUÉ HACER: corregí la clave si es (1) o (2); borrá la línea si es (3). ` +
        `Sin este lado del gate, el manifiesto se llenaría de clasificaciones ` +
        `muertas que dan sensación de cobertura sin cubrir nada.`,
    ).toEqual([]);
  });

  it("todo HEAD observado se explica por un GET hermano (un HEAD declarado a mano no se cuela)", () => {
    const huerfanos = particion.headHuerfanos.slice().sort();

    expect(
      huerfanos,
      `Rutas HEAD observadas que NO tienen un GET hermano: ${huerfanos.join(", ")}. ` +
        `POR QUÉ ESTE GUARD NO ES COSMÉTICO: Fastify 5 trae exposeHeadRoutes en ` +
        `true por default y dispara un evento HEAD sintético por cada GET (199 ` +
        `de los 569 eventos del app real). Meterlos al manifiesto sería duplicar ` +
        `cada decisión sin agregar información. Pero filtrar HEAD A SECAS era el ` +
        `ANTI-PATRÓN: si alguien declara un HEAD a mano —una ruta real, con su ` +
        `handler y su acceso a datos— el filtro ciego la dejaría fuera del ` +
        `backstop en silencio, que es exactamente lo que este archivo existe ` +
        `para impedir. ` +
        `QUÉ HACER: si el HEAD listado arriba es una ruta real, clasificala en ` +
        `el manifiesto como cualquier otra; si sobra, quitala del código. Lo que ` +
        `no se hace es agrandar el filtro. ` +
        `(La otra forma de declarar un HEAD a mano —junto a un GET con ` +
        `exposeHeadRoute: false— no cae acá: el onRoute la delata y ese HEAD va ` +
        `derecho al manifiesto, o sea al primer test.)`,
    ).toEqual([]);
  });

  it("el manifiesto tiene exactamente las 374 entradas del baseline", () => {
    const total = Object.keys(TENANT_MANIFEST).length;

    expect(
      total,
      `TENANT_MANIFEST tiene ${total} entradas, esperadas ${ENTRADAS_BASELINE}. ` +
        `Mover este número es una DECISIÓN DE DISEÑO, no un detalle de ` +
        `implementación: sube cuando se agrega una ruta CON su línea de ` +
        `clasificación, y baja cuando se borra una ruta Y su línea. Si se movió ` +
        `sin que pase ninguna de las dos cosas, alguien tocó el registro sin ` +
        `tocar el API —o al revés— y el manifiesto dejó de describir la ` +
        `realidad. ` +
        `POR QUÉ EXISTE ESTE TEST habiendo ya dos gates bidireccionales arriba: ` +
        `porque los dos comparan contra lo OBSERVADO, y si el seam onRoute se ` +
        `rompiera —alguien "limpia" BuildAppOptions, o el hook se cuelga después ` +
        `del primer register— las listas quedarían vacías contra un manifiesto ` +
        `vacío y todo pasaría en verde por vacuidad. Este conteo es lo que hace ` +
        `que 0 rutas observadas se ponga tan rojo como 371.`,
    ).toBe(ENTRADAS_BASELINE);

    // El baseline también tiene que coincidir con lo que el app registra hoy:
    // el conteo de arriba mira solo el registro, éste cierra el círculo.
    expect(
      particion.rutas.length,
      `El app registró ${particion.rutas.length} rutas (sin contar los HEAD ` +
        `sintéticos) y el manifiesto tiene ${total}. Si este número es 0, el ` +
        `seam onRoute dejó de funcionar y ningún gate de este archivo está ` +
        `probando nada: revisá BuildAppOptions en src/app.ts antes que el ` +
        `manifiesto.`,
    ).toBe(ENTRADAS_BASELINE);
  });

  /**
   * CR-01 de la review de fase: sin este test, D-02 y D-07 estaban ENUNCIADOS
   * pero no ENFORCEADOS. Los dos tests bidireccionales de arriba solo miran
   * claves: una entrada `global` con motivo "TODO" —o una `templo-module` sin
   * módulo, o una categoría con typo— tiene su clave en las dos listas, así que
   * ni `faltantes` ni `fantasmas` la ven y el gate pasaba en verde. Las tres
   * listas de FORMA se validaban solo contra fixtures sintéticos (el describe
   * de abajo), que prueban el MOTOR pero no el manifiesto real. Este test cierra
   * ese agujero: `compararManifiesto` shape-valida TODAS las entradas del
   * manifiesto que recibe, así que afirmar sobre el `discrepancias` real cubre
   * las 373.
   */
  it("toda entrada del manifiesto real tiene la forma exigida (D-02 motivo, D-07 módulo, categoría válida)", () => {
    const sinMotivo = discrepancias.sinMotivo.slice().sort();
    const sinModulo = discrepancias.sinModulo.slice().sort();
    const categoriaInvalida = discrepancias.categoriaInvalida.slice().sort();

    expect(
      sinMotivo,
      `Entradas "global" del manifiesto REAL sin motivo utilizable (D-02): ` +
        `${sinMotivo.join(", ")}. ` +
        `QUÉ HACER: escribile a cada una un motivo que sea una oración completa ` +
        `nombrando la causa concreta ("el webhook se procesa antes de saber a ` +
        `qué gimnasio pertenece"), no una etiqueta ("es global"). Un motivo ` +
        `vacío o con marcador de trabajo pendiente (TODO/FIXME/TBD/XXX/` +
        `"pendiente") cuenta como ausente. ` +
        `POR QUÉ IMPORTA: "global" es la categoría peligrosa —afirma que la ` +
        `ruta ve datos de TODOS los gimnasios y está bien— y sin motivo escrito ` +
        `nadie puede auditar en un año si fue deliberado o un descuido. Este es ` +
        `el test que hace verdad la promesa de los mensajes de arriba ("la ` +
        `validación de runtime la reporta en sinMotivo y el gate sigue rojo").`,
    ).toEqual([]);

    expect(
      sinModulo,
      `Entradas "templo-module" del manifiesto REAL sin módulo válido (D-07): ` +
        `${sinModulo.join(", ")}. ` +
        `QUÉ HACER: declarale a cada una su \`modulo\` con uno de los cuatro ` +
        `valores de MODULOS_TEMPLO (un typo en el nombre del módulo también cae ` +
        `acá). ` +
        `POR QUÉ IMPORTA: la fase 176 va a LEER esa etiqueta para exigir ` +
        `requireModule en la ruta; una entrada sin módulo es una ruta que queda ` +
        `fuera del enforcement sin que nadie lo note.`,
    ).toEqual([]);

    expect(
      categoriaInvalida,
      `Entradas del manifiesto REAL con categoría fuera de las tres: ` +
        `${categoriaInvalida.join(", ")}. ` +
        `QUÉ HACER: corregí el typo — las categorías son exactamente ` +
        `tenant-scoped, global y templo-module, y agregar una cuarta es una ` +
        `decisión de diseño, no una edición de este manifiesto. ` +
        `POR QUÉ IMPORTA: nadie typechequea test/ (tsconfig incluye solo src/ y ` +
        `Vitest borra tipos con esbuild), así que esta validación de runtime es ` +
        `la ÚNICA red contra una categoría mal escrita que dejaría la ruta ` +
        `clasificada "en algo" que ningún consumidor entiende.`,
    ).toEqual([]);
  });
});

/**
 * La otra mitad del criterio 2. Los cuatro tests de arriba prueban que HOY el
 * manifiesto y la realidad coinciden; éstos prueban que el MOTOR sabe detectar
 * cada forma de discrepancia y NOMBRARLA — sin lo cual el verde de arriba
 * podría ser un comparador roto que nunca devuelve nada.
 *
 * No tocan el app: `compararManifiesto` recibe el manifiesto por parámetro (por
 * eso el segundo parámetro existe y tiene default en vez de ser una constante
 * capturada). Precedente: `lintTenantSources` de la fase 170, que `con-06`
 * invoca dos veces, una sobre fixtures y otra sobre el repo real.
 *
 * Las cuatro últimas afirmaciones —motivo, módulo y categoría— son las que
 * compensan que NADIE typechequee `test/` (Pitfall 5 del RESEARCH): sin ellas,
 * una entrada `global` sin motivo o con la categoría mal escrita entraría a
 * master en silencio.
 */
describe("manifiesto de rutas — motor con fixtures sintéticos (criterio 2, demostrado)", () => {
  /** Manifiesto mínimo y bien formado: la línea de base de cada fixture. */
  const MANIFIESTO_OK: Record<string, EntradaManifiesto> = {
    "GET /api/fixture/socios": { categoria: "tenant-scoped" },
  };

  it("un HEAD manual junto a un GET con exposeHeadRoute: false va al manifiesto, no al filtro (WR-03)", () => {
    const URL_MANUAL = "/api/fixture/head-manual";
    const URL_NORMAL = "/api/fixture/head-sintetico";

    const particion = particionarObservadas(
      [
        `GET ${URL_MANUAL}`,
        `HEAD ${URL_MANUAL}`, // declarado a mano: su GET renunció al sintético
        `GET ${URL_NORMAL}`,
        `HEAD ${URL_NORMAL}`, // sintético de Fastify: se filtra como siempre
      ],
      [URL_MANUAL],
    );

    expect(
      particion.rutas,
      `El HEAD declarado a mano NO llegó al manifiesto. Un GET registrado con ` +
        `exposeHeadRoute: false no genera HEAD sintético —es la única forma que ` +
        `Fastify acepta de convivir con un HEAD manual en la misma url—, así que ` +
        `un HEAD observado ahí es una ruta real con handler y acceso a datos: ` +
        `filtrarla la dejaría fuera del backstop en silencio, que es exactamente ` +
        `lo que este archivo existe para impedir. Rutas: ${particion.rutas.join(", ")}`,
    ).toContain(`HEAD ${URL_MANUAL}`);

    expect(
      particion.rutas,
      `El HEAD sintético se metió al manifiesto: duplicaría cada decisión de ` +
        `clasificación sin agregar información. El filtro solo puede abrirse ` +
        `para urls cuyo GET tiene exposeHeadRoute: false. Rutas: ` +
        `${particion.rutas.join(", ")}`,
    ).not.toContain(`HEAD ${URL_NORMAL}`);

    expect(
      particion.headHuerfanos,
      `Ningún HEAD de este fixture es huérfano (los dos tienen GET hermano): el ` +
        `manual se clasifica, no se reporta dos veces. Reportado: ` +
        `${particion.headHuerfanos.join(", ")}`,
    ).toEqual([]);
  });

  it("una ruta observada sin entrada cae en faltantes y sale nombrada", () => {
    const RUTA_NUEVA = "POST /api/_probe-171-sin-clasificar";

    const { faltantes, fantasmas } = compararManifiesto(
      ["GET /api/fixture/socios", RUTA_NUEVA],
      MANIFIESTO_OK,
    );

    expect(
      faltantes,
      `El comparador NO reportó la ruta sin clasificar. Esto es el criterio 2 ` +
        `del ROADMAP en su forma más pura: si "${RUTA_NUEVA}" no sale en ` +
        `faltantes, una ruta nueva puede entrar a master sin que nadie decida si ` +
        `ve datos de un gimnasio o de todos. Reportado: ${faltantes.join(", ")}`,
    ).toEqual([RUTA_NUEVA]);

    expect(
      fantasmas,
      `La ruta del fixture que SÍ está clasificada no puede salir como fantasma: ` +
        `una clave presente en las dos listas está en orden. Reportado: ` +
        `${fantasmas.join(", ")}`,
    ).toEqual([]);
  });

  it("una entrada que ya no corresponde a ninguna ruta cae en fantasmas y sale nombrada", () => {
    const CLAVE_MUERTA = "GET /api/ruta-que-ya-no-existe";

    const { fantasmas, faltantes } = compararManifiesto(
      ["GET /api/fixture/socios"],
      { ...MANIFIESTO_OK, [CLAVE_MUERTA]: { categoria: "tenant-scoped" } },
    );

    expect(
      fantasmas,
      `El comparador NO reportó la entrada huérfana "${CLAVE_MUERTA}". Este es ` +
        `el lado del gate que atrapa typos en la clave, renames de ruta y rutas ` +
        `borradas: sin él, el manifiesto acumula clasificaciones muertas que ` +
        `parecen cobertura. Reportado: ${fantasmas.join(", ")}`,
    ).toEqual([CLAVE_MUERTA]);

    expect(
      faltantes,
      `Ninguna ruta observada quedó sin entrada en este fixture, así que ` +
        `faltantes tiene que estar vacío: las dos listas son independientes y no ` +
        `se contaminan. Reportado: ${faltantes.join(", ")}`,
    ).toEqual([]);
  });

  it("una entrada global sin motivo utilizable cae en sinMotivo (D-02, validado en runtime)", () => {
    const SIN_MOTIVO = "GET /api/fixture/global-sin-motivo";
    const MOTIVO_PENDIENTE = "GET /api/fixture/global-con-todo";
    const observadas = [SIN_MOTIVO, MOTIVO_PENDIENTE];

    const { sinMotivo } = compararManifiesto(observadas, {
      [SIN_MOTIVO]: { categoria: "global", motivo: "" },
      [MOTIVO_PENDIENTE]: { categoria: "global", motivo: "TODO" },
    });

    expect(
      sinMotivo.slice().sort(),
      `Las dos entradas "global" sin motivo utilizable tienen que salir en ` +
        `sinMotivo y el comparador reportó: ${sinMotivo.join(", ")}. Un motivo ` +
        `VACÍO y un motivo que es un marcador de trabajo pendiente ("TODO", ` +
        `"FIXME", "TBD", "XXX", "pendiente") valen exactamente lo mismo: nada. ` +
        `D-02 existe porque "global" es la categoría peligrosa —afirma que la ` +
        `ruta ve datos de TODOS los gimnasios y está bien— y sin motivo escrito ` +
        `nadie puede auditar en un año si fue deliberado o un descuido. Se ` +
        `valida acá, en RUNTIME, porque el tsc de CI no mira test/ y Vitest usa ` +
        `esbuild: los tipos no defienden nada en esta carpeta.`,
    ).toEqual([MOTIVO_PENDIENTE, SIN_MOTIVO].slice().sort());
  });

  it("una entrada templo-module sin módulo cae en sinModulo (D-07, validado en runtime)", () => {
    const SIN_MODULO = "GET /api/fixture/templo-sin-modulo";

    const { sinModulo } = compararManifiesto([SIN_MODULO], {
      ...MANIFIESTO_OK,
      [SIN_MODULO]: { categoria: "templo-module" },
    });

    expect(
      sinModulo,
      `La entrada "templo-module" sin módulo declarado tiene que salir en ` +
        `sinModulo y el comparador reportó: ${sinModulo.join(", ")}. La ` +
        `etiqueta de módulo no es decorativa: es lo que la fase 176 va a LEER ` +
        `para exigir requireModule en la ruta. Una entrada "templo-module" sin ` +
        `módulo es una ruta que quedó fuera del enforcement sin que nadie lo ` +
        `note, y —igual que D-02— se valida en runtime porque nadie typechequea ` +
        `test/.`,
    ).toEqual([SIN_MODULO]);
  });

  it("una entrada con categoría fuera de las tres cae en categoriaInvalida", () => {
    const CATEGORIA_BASURA = "GET /api/fixture/categoria-inventada";
    // El cast es el punto del test: en producción esto lo atajaría el tipo
    // `Categoria`, pero `test/` no lo typechequea nadie (Pitfall 5), así que la
    // única red real es esta validación de runtime.
    const entradaInvalida = {
      categoria: "publica",
      motivo: "",
    } as unknown as EntradaManifiesto;

    const { categoriaInvalida, sinMotivo } = compararManifiesto(
      [CATEGORIA_BASURA],
      { [CATEGORIA_BASURA]: entradaInvalida },
    );

    expect(
      categoriaInvalida,
      `La entrada con categoría "publica" tiene que salir en categoriaInvalida y ` +
        `el comparador reportó: ${categoriaInvalida.join(", ")}. Las categorías ` +
        `son exactamente tres —tenant-scoped, global, templo-module— y agregar ` +
        `una cuarta es una decisión de diseño, no un typo tolerable. Sin este ` +
        `gate, una categoría mal escrita dejaría la ruta clasificada "en algo" ` +
        `que ningún consumidor entiende, en verde y en silencio.`,
    ).toEqual([CATEGORIA_BASURA]);

    expect(
      sinMotivo,
      `A una entrada cuya CATEGORÍA no se entiende no se le exige además motivo ` +
        `ni módulo: reportarla en dos listas a la vez multiplica el ruido y ` +
        `esconde el problema real. Reportado en sinMotivo: ${sinMotivo.join(", ")}`,
    ).toEqual([]);
  });
});
