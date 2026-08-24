/**
 * Fase 172 Plan 20 (ISO-03) — el gate fail-closed de COBERTURA de la batería de
 * aislamiento de `finance`.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Los planes 172-17, 172-18 y 172-19 escribieron 98 tests que prueban, ruta por
 * ruta, que un gimnasio no ve ni escribe los datos del otro. Eso es cierto HOY.
 * El problema no es el código de hoy: es el que se agregue mañana. Alguien
 * registra `POST /api/admin/finance/lo-que-sea` en la fase 174, lo clasifica en
 * el manifiesto (el gate ISO-01 lo obliga) y… nadie escribe su caso de
 * aislamiento. La batería sigue en verde con 98 tests, el requisito ISO-03
 * sigue "cumplido", y esa ruta queda fuera del gate del milestone para siempre
 * — hasta que un gimnasio lea la plata de otro.
 *
 * Este archivo cierra ese agujero: cruza las rutas finance `tenant-scoped` del
 * manifiesto contra las rutas que la batería DICE cubrir, en las dos
 * direcciones. Es el analog exacto, por el eje "cobertura", de lo que
 * `iso-01-manifiesto.test.ts` es por el eje "clasificación" — el mismo gate que
 * el 2026-07-30 cazó dos rutas de caja sin clasificar que habían entrado por
 * staging.
 *
 * Requisito: **ISO-03** (el gate del milestone para onboardear el gimnasio 2).
 * Receta de adopción: `.docs/saas-multitenancy/07-receta-adopcion.md` (la
 * escribe el plan 172-23; ojo: `.docs/` no está versionado, vive en el checkout
 * principal).
 *
 * LO QUE SE AFIRMA
 * ----------------
 * 1. Toda ruta finance `tenant-scoped` del manifiesto tiene un caso en la
 *    batería (`faltantes` = []). Ruta nueva sin caso = CI rojo, NOMBRÁNDOLA.
 * 2. Todo caso de la batería apunta a una ruta que existe en el manifiesto
 *    (`fantasmas` = []): atrapa typos en el nombre del `describe`, renames de
 *    ruta que no se propagaron y casos que quedaron cubriendo una ruta borrada.
 * 3. El conteo del baseline, para que el verde no pueda serlo por vacuidad.
 * 4. Las excepciones nombradas siguen siendo excepciones: existen en el
 *    manifiesto, siguen fuera del prefijo y siguen con su motivo escrito.
 *
 * CÓMO SE SABE QUÉ RUTA CUBRE CADA CASO
 * -------------------------------------
 * Por el nombre del `describe`. El plan 172-20 normalizó los 39 `describe` de
 * ruta de los tres archivos para que cada uno contenga LITERAL la clave del
 * manifiesto (`"<MÉTODO> <url completa>"`), con la prosa adelante separada por
 * ` — `:
 *
 *   describe("egreso — POST /api/admin/finance/expenses (actor: ADMIN…)", …)
 *
 * La alternativa era un registro paralelo (un array `RUTAS_CUBIERTAS` escrito a
 * mano al lado de cada archivo). Se descartó por lo mismo que el manifiesto
 * existe: una segunda lista escrita a mano se desincroniza de la primera, y
 * entonces el gate defiende la lista en vez de la batería. El nombre del test
 * ES el registro, y no puede mentir sin que el rojo lo diga.
 *
 * POR QUÉ SE LEE EL FUENTE Y NO SE IMPORTAN LOS ARCHIVOS
 * -----------------------------------------------------
 * Importarlos los EJECUTA: los tres archivos siembran dos gimnasios enteros
 * contra MySQL y tardan ~250 s. Este gate tiene que poder correr solo y en
 * segundos, porque su valor es correr SIEMPRE. Precedente en la misma carpeta:
 * `iso-02-fixtures.test.ts` lee `test/setup.ts` con `readFileSync` para probar
 * que la siembra del gimnasio 2 es opt-in.
 *
 * POR QUÉ SE BORRAN LOS COMENTARIOS ANTES DE BUSCAR (no es cosmético)
 * ------------------------------------------------------------------
 * Los tres archivos abren con un docblock que LISTA sus rutas, una por línea,
 * en el mismo formato que la clave del manifiesto. Entre los tres headers están
 * las 38. Un gate que busque por substring sobre el fuente crudo daría verde
 * **por los comentarios**, aunque no existiera un solo `it`. Es la misma
 * lección que el 172-16 pagó al revés en `test/setup.ts` (un gate por substring
 * no distingue código de comentario, y ahí lo ponía en ROJO de más). Por eso
 * `sinComentarios()` corre primero, y por eso hay un test de motor que lo
 * demuestra con un fixture sintético: sin él, este archivo podría estar verde
 * midiendo prosa.
 *
 * Por el mismo motivo un `describe.skip` NO cuenta como cobertura: un caso
 * apagado no prueba aislamiento, y "poné .skip y el gate se calla" sería la
 * salida fácil que este archivo existe para cerrar.
 *
 * QUÉ HACER CUANDO SE CAIGA
 * -------------------------
 *   - Rojo en `faltantes`: agregaste una ruta finance. Escribile su caso de
 *     aislamiento MÁS su control positivo en el archivo de la familia que
 *     corresponda (cajas / transacciones / coach-load), con la clave del
 *     manifiesto en el nombre del `describe`. Renombrar el `describe` para que
 *     el gate se calle sin escribir el test es exactamente el fraude que el
 *     control positivo de cada caso existe para hacer imposible.
 *   - Rojo en `fantasmas`: el nombre de un `describe` no corresponde a ninguna
 *     ruta del manifiesto. O hay un typo, o la ruta se renombró, o se borró.
 *     Corregí el nombre, o borrá el caso si la ruta ya no existe.
 *   - Rojo en el baseline: mirá el diff. Ver el docblock de `CASOS_BASELINE`.
 *
 * CÓMO CORRERLO
 * -------------
 *   cd el-templo-api
 *   pnpm exec vitest run test/tenancy/iso-03-cobertura.test.ts
 *
 * Este gate NO toca la base: no manda un request, no construye el app y no lee
 * una fila. Solo lee tres archivos de texto y el manifiesto. (El provisioning
 * del worker se paga igual porque `test/setup.ts` es `setupFiles` para TODOS
 * los archivos — hallazgo 169-07 — pero el gate en sí no depende de él.)
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

import { TENANT_MANIFEST } from "../tenant-manifest";

/**
 * El criterio de "qué es una ruta de finance", derivado del MANIFIESTO y no de
 * una lista escrita a mano. Es lo único que hace que una ruta nueva entre sola
 * al gate: el día que alguien registre `POST /api/admin/finance/x`, el gate
 * ISO-01 lo obliga a clasificarla, y con la clasificación puesta esta línea la
 * mete acá sin que nadie se acuerde de nada.
 *
 * D-01 de la fase 171 prohíbe comodines en el REGISTRO de rutas, no en un
 * filtro de test.
 */
const PREFIJO_FINANCE = "/api/admin/finance/";

/**
 * Rutas que un lector razonable esperaría en esta batería y que están AFUERA a
 * propósito, cada una con el motivo escrito. Se exporta para que la receta de
 * adopción (172-23) y las fases 173-175 la puedan citar en vez de redescubrirla.
 *
 * La forma —clave + motivo en texto— es la del manifiesto y la de
 * `TENANT_GLOBAL_UNIQUES` (`src/db/tenant-tables.ts`): la única forma de eximir
 * algo es escribir por qué. Un set de claves peladas dejaría a la próxima fase
 * adivinando si la ruta se excluyó por decisión o por olvido.
 *
 * OJO: esta lista NO es una salida para bajar el rojo de `faltantes`. Sacar una
 * ruta finance del gate metiéndola acá es una decisión de diseño con dueño, y
 * el cuarto test la obliga a seguir cumpliendo las dos condiciones que la hacen
 * una excepción de verdad (existir en el manifiesto y NO matchear el prefijo);
 * una ruta con prefijo `/api/admin/finance/` metida acá deja el gate rojo igual.
 */
export const EXCEPCIONES_NOMBRADAS: Readonly<Record<string, string>> = {
  // Se llama "finance" pero vive en `src/modules/analytics/routes.ts`, no en el
  // módulo finance: es la vista Caja vs Devengado + ARPU, que LEE de finanzas
  // en vez de escribirlas. Su aislamiento es de la fase 175 (Adopción 4 —
  // `analytics` + resto del core), que la adopta junto al resto de las métricas
  // y le escribe su propia batería. Meterla acá habría atado el cierre de
  // ISO-03 —el gate para onboardear el gimnasio 2— a un módulo que esta fase no
  // migra.
  "GET /api/admin/analytics/advanced-finance":
    "Ruta del módulo analytics (no de finance): la adopta y la aísla la fase 175, con la batería de métricas.",
};

/**
 * Las rutas finance `tenant-scoped` que la batería tenía cubiertas cuando este
 * gate se escribió (2026-07-31, planes 172-17/18/19): **38**.
 *
 * MOVER ESTE NÚMERO ES UNA DECISIÓN DE DISEÑO, NO UN AJUSTE.
 *
 *   - **Sube** cuando se agrega una ruta finance CON su caso de aislamiento y
 *     su control positivo. Las dos mitades: la ruta sola deja rojo `faltantes`,
 *     el caso solo deja rojo `fantasmas`.
 *   - **Baja** SOLO cuando una ruta finance deja de existir en el API y su
 *     entrada sale del manifiesto. Bajarlo por cualquier otro motivo es
 *     sacarle superficie al gate del milestone: significa que hay menos rutas
 *     de plata probadas contra un segundo gimnasio que ayer, y ese es
 *     exactamente el retroceso que ISO-03 existe para impedir. Si estás por
 *     bajarlo para poner CI en verde, el rojo que estás tapando es el
 *     hallazgo.
 *
 * POR QUÉ EXISTE habiendo ya dos gates bidireccionales: porque los dos comparan
 * dos listas DERIVADAS, y si la derivación se rompiera —alguien mueve o
 * renombra un archivo de la batería, el `readFileSync` devuelve otra cosa, el
 * regex de `describe` deja de matchear— las dos listas quedarían vacías contra
 * un manifiesto vacío y todo pasaría en verde por vacuidad. Este conteo es lo
 * que hace que 0 rutas cubiertas se ponga tan rojo como 37.
 */
const CASOS_BASELINE = 38;

/** Los tres archivos de la batería ISO-03, en el orden en que se escribieron. */
const ARCHIVOS_BATERIA = [
  "iso-03-finance-cajas.test.ts", // plan 172-17 — 14 rutas
  "iso-03-finance-transacciones.test.ts", // plan 172-18 — 13 rutas
  "iso-03-finance-coach-load.test.ts", // plan 172-19 — 11 rutas
] as const;

/**
 * Métodos HTTP que pueden abrir una clave del manifiesto. Union cerrada a
 * propósito: un regex con `\w+` tomaría por método cualquier palabra en
 * mayúsculas de la prosa del `describe`.
 */
const METODOS = "GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS";

/**
 * Borra comentarios de bloque y de línea completa. Ver el docblock de arriba:
 * sin esto el gate mediría los headers de los archivos, que listan las 38
 * rutas, en vez de los tests.
 *
 * No pretende ser un parser de TypeScript: no toca comentarios al final de una
 * línea de código, porque un `describe(...)` no se abre después de un `//` y
 * porque recortar hasta el fin de línea rompería cualquier string con `//`
 * adentro (una URL absoluta, por ejemplo).
 */
export function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* … */ y /** … */
    .replace(/^[ \t]*\/\/.*$/gm, ""); // líneas que son solo //
}

/**
 * Extrae, de un fuente de test, las claves de manifiesto que declaran sus
 * `describe`. Es el corazón del gate, y por eso está exportada y tiene su
 * propio bloque de fixtures sintéticos al final del archivo.
 *
 * Reglas:
 *   - Se leen solo los `describe`, no los `it`: el nombre de un caso puede
 *     mencionar una ruta de paso ("…y la de El Templo queda intacta") sin
 *     cubrirla.
 *   - `describe.skip` y `describe.todo` NO cuentan: un caso apagado no prueba
 *     aislamiento.
 *   - Un `describe` sin clave (el de precondiciones, por ejemplo) se ignora en
 *     silencio; no todo bloque tiene que ser una ruta.
 */
export function clavesDeLosDescribe(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const reDescribe = /\bdescribe(\.\w+)?\s*\(\s*"((?:[^"\\]|\\.)*)"/g;
  const reClave = new RegExp(`\\b(${METODOS})\\s+(/[^\\s"]+)`);

  const claves: string[] = [];
  for (const m of codigo.matchAll(reDescribe)) {
    const modificador = m[1];
    if (modificador === ".skip" || modificador === ".todo") continue;

    const clave = reClave.exec(m[2] ?? "");
    if (clave) claves.push(`${clave[1]} ${clave[2]}`);
  }
  return claves;
}

/** Las rutas finance `tenant-scoped` del manifiesto (la lista que hay que cubrir). */
const RUTAS_FINANCE: readonly string[] = Object.entries(TENANT_MANIFEST)
  .filter(([clave, entrada]) => {
    if (entrada.categoria !== "tenant-scoped") return false;
    const url = clave.slice(clave.indexOf(" ") + 1);
    return url.startsWith(PREFIJO_FINANCE);
  })
  .map(([clave]) => clave)
  .sort();

/** Claves declaradas por los `describe` de cada archivo de la batería. */
const CASOS_POR_ARCHIVO: ReadonlyArray<{
  archivo: string;
  claves: string[];
}> = ARCHIVOS_BATERIA.map((archivo) => ({
  archivo,
  claves: clavesDeLosDescribe(
    fs.readFileSync(path.resolve(__dirname, archivo), "utf8"),
  ),
}));

/** Las claves que la batería dice cubrir, sin duplicados (una ruta puede tener dos bloques). */
const CASOS_ESCRITOS: readonly string[] = [
  ...new Set(CASOS_POR_ARCHIVO.flatMap(({ claves }) => claves)),
].sort();

describe("cobertura de la batería ISO-03 — contra el manifiesto real", () => {
  it("toda ruta finance tenant-scoped tiene caso de aislamiento", () => {
    const escritos = new Set(CASOS_ESCRITOS);
    const faltantes = RUTAS_FINANCE.filter((ruta) => !escritos.has(ruta));

    expect(
      faltantes,
      `Rutas finance "tenant-scoped" del manifiesto que NO tienen caso en la ` +
        `batería ISO-03: ${faltantes.join(", ")}. ` +
        `QUÉ HACER: escribile a cada una su caso en el archivo de la familia ` +
        `que corresponda —${ARCHIVOS_BATERIA.join(", ")}— con la clave exacta ` +
        `"<MÉTODO> <url>" adentro del nombre del describe (la prosa va ` +
        `adelante, separada por " — "). Y el caso son DOS its, no uno: el de ` +
        `aislamiento (el recurso del otro gimnasio es indistinguible de uno ` +
        `inexistente, D-09) y su CONTROL POSITIVO (la ruta funciona de verdad ` +
        `para el dueño). Sin el control, un 404 por siembra rota se ve igual ` +
        `que un 404 por aislamiento y el caso pasa sin probar nada. ` +
        `LO QUE NO ES UNA SALIDA: renombrar el describe sin escribir el test, ` +
        `apagarlo con .skip (no cuenta, a propósito), o meter la ruta en ` +
        `EXCEPCIONES_NOMBRADAS —que es para rutas FUERA del prefijo y el cuarto ` +
        `test lo verifica—. ` +
        `POR QUÉ IMPORTA: ISO-03 es el requisito que el milestone usa como GATE ` +
        `para onboardear el segundo gimnasio. Una ruta de PLATA sin caso de ` +
        `aislamiento no la mira nadie —ni el sentinel, que solo ve queries, ni ` +
        `la revisión humana— hasta que un gimnasio lea o mueva el dinero de ` +
        `otro. Este test es la única razón por la que la batería no puede ` +
        `envejecer en silencio mientras las fases 173-175 agregan superficie.`,
    ).toEqual([]);
  });

  it("todo caso de la batería apunta a una ruta que existe en el manifiesto", () => {
    const finance = new Set(RUTAS_FINANCE);
    const excepciones = new Set(Object.keys(EXCEPCIONES_NOMBRADAS));
    const fantasmas = CASOS_ESCRITOS.filter(
      (clave) => !finance.has(clave) && !excepciones.has(clave),
    );

    expect(
      fantasmas,
      `Casos de la batería cuyo describe nombra una ruta que NO existe entre ` +
        `las rutas finance del manifiesto: ${fantasmas.join(", ")}. ` +
        `Las causas son tres y todas importan: (1) un TYPO en la clave —y una ` +
        `clave con typo no cubre nada, deja la ruta real como faltante—, (2) un ` +
        `RENAME de la ruta que no se propagó al nombre del describe, (3) un ` +
        `caso que quedó cubriendo una ruta BORRADA. ` +
        `QUÉ HACER: corregí el nombre del describe si es (1) o (2) —copiá la ` +
        `clave tal cual de test/tenant-manifest.ts—; borrá el bloque entero si ` +
        `es (3), porque un caso contra una ruta que ya no existe es tiempo de ` +
        `CI comprando confianza falsa. ` +
        `POR QUÉ IMPORTA: sin este lado del gate, la batería acumularía casos ` +
        `muertos que dan sensación de cobertura sin cubrir nada, y el conteo de ` +
        `abajo seguiría cuadrando mientras una ruta real queda afuera.`,
    ).toEqual([]);
  });

  it("la batería cubre exactamente las 38 rutas finance del baseline", () => {
    expect(
      RUTAS_FINANCE.length,
      `El manifiesto tiene ${RUTAS_FINANCE.length} rutas finance ` +
        `"tenant-scoped" y el baseline dice ${CASOS_BASELINE}. Ver el docblock ` +
        `de CASOS_BASELINE: sube cuando se agrega una ruta CON su caso, baja ` +
        `SOLO cuando una ruta deja de existir en el API. Si se movió sin ` +
        `ninguna de las dos cosas, alguien tocó el registro de rutas sin tocar ` +
        `la batería —o al revés—.`,
    ).toBe(CASOS_BASELINE);

    const cubiertas = CASOS_ESCRITOS.filter((clave) =>
      RUTAS_FINANCE.includes(clave),
    );
    expect(
      cubiertas.length,
      `La batería declara ${cubiertas.length} rutas finance cubiertas y el ` +
        `baseline dice ${CASOS_BASELINE}. Si este número es 0 —o mucho más ` +
        `chico de lo esperado— el problema NO es la cobertura: es la ` +
        `derivación. Alguien movió o renombró un archivo de la batería, o el ` +
        `regex de describe dejó de matchear, y los dos gates bidireccionales de ` +
        `arriba estarían comparando listas vacías en verde. Revisá ` +
        `ARCHIVOS_BATERIA y clavesDeLosDescribe antes que la batería.`,
    ).toBe(CASOS_BASELINE);

    // Cada archivo tiene que aportar: si uno queda en 0, la lectura de ESE
    // archivo se rompió y los otros dos podrían tapar el agujero en el total.
    for (const { archivo, claves } of CASOS_POR_ARCHIVO) {
      expect(
        claves.length,
        `${archivo} no declaró ni una sola ruta en sus describe. O el archivo ` +
          `se vació, o se renombró, o sus describe perdieron la clave del ` +
          `manifiesto. Los tres archivos aportan (14 + 13 + 11 = ` +
          `${CASOS_BASELINE}), así que un 0 acá es una lectura rota, no una ` +
          `decisión.`,
      ).toBeGreaterThan(0);
    }
  });

  it("las excepciones nombradas siguen existiendo, siguen fuera del prefijo y siguen con su motivo", () => {
    const claves = Object.keys(EXCEPCIONES_NOMBRADAS).sort();

    const inexistentes = claves.filter((clave) => !(clave in TENANT_MANIFEST));
    expect(
      inexistentes,
      `Excepciones nombradas que ya no corresponden a ninguna entrada del ` +
        `manifiesto: ${inexistentes.join(", ")}. La lista de excepciones se ` +
        `pudre igual que cualquier otra lista escrita a mano: si la ruta se ` +
        `borró o se renombró, su exención quedó huérfana y nadie se enteró. ` +
        `QUÉ HACER: corregí la clave o borrá la excepción.`,
    ).toEqual([]);

    const conPrefijoFinance = claves.filter((clave) =>
      clave.slice(clave.indexOf(" ") + 1).startsWith(PREFIJO_FINANCE),
    );
    expect(
      conPrefijoFinance,
      `Excepciones que SÍ matchean el prefijo ${PREFIJO_FINANCE}: ` +
        `${conPrefijoFinance.join(", ")}. EXCEPCIONES_NOMBRADAS existe para ` +
        `rutas que se llaman "finance" pero viven en otro módulo, NO para ` +
        `sacar del gate una ruta del módulo finance que quedó sin caso. Esa ` +
        `puerta tiene que estar cerrada: si estuviera abierta, el rojo de ` +
        `"faltantes" se apagaría escribiendo una línea acá en vez de un test, y ` +
        `este archivo entero dejaría de significar algo. ` +
        `QUÉ HACER: sacala de la lista y escribile su caso de aislamiento.`,
    ).toEqual([]);

    const sinMotivo = claves.filter((clave) => {
      const motivo = (EXCEPCIONES_NOMBRADAS[clave] ?? "").trim();
      return (
        motivo.length < 20 || /^(todo|fixme|tbd|xxx|pendiente)\b/i.test(motivo)
      );
    });
    expect(
      sinMotivo,
      `Excepciones sin motivo utilizable: ${sinMotivo.join(", ")}. Igual que ` +
        `D-02 con las entradas "global" del manifiesto: un motivo vacío, de dos ` +
        `palabras o con marcador de trabajo pendiente vale lo mismo que nada. ` +
        `QUÉ HACER: escribí una oración que diga POR QUÉ la ruta está afuera y ` +
        `QUIÉN la cubre —qué fase, qué batería—, para que dentro de un año se ` +
        `pueda auditar si fue una decisión o un descuido.`,
    ).toEqual([]);
  });
});

/**
 * La otra mitad del gate. Los cuatro tests de arriba prueban que HOY la batería
 * y el manifiesto coinciden; éstos prueban que el MOTOR sabe distinguir un test
 * de un comentario — sin lo cual el verde de arriba podría ser prosa.
 *
 * No es paranoia teórica: los tres archivos de la batería abren con un docblock
 * que lista sus rutas en el formato exacto de la clave. Si `sinComentarios()`
 * dejara de funcionar, el gate seguiría en verde con la batería VACÍA. Estos
 * fixtures son lo único que lo delata.
 *
 * Mismo patrón que el segundo bloque de `iso-01-manifiesto.test.ts` (motor con
 * fixtures sintéticos) y que `con-06-lint.test.ts` (el linter corre dos veces:
 * sobre fixtures y sobre el repo real).
 */
describe("cobertura ISO-03 — motor con fixtures sintéticos", () => {
  const RUTA_FIXTURE = "POST /api/admin/finance/fixture-172-20";

  it("una ruta nombrada SOLO en un comentario no cuenta como caso", () => {
    const fuente = [
      "/**",
      ` * Este archivo cubre ${RUTA_FIXTURE} y nada más.`,
      " */",
      `// TODO: escribir el caso de ${RUTA_FIXTURE}`,
      'describe("precondiciones de la bateria", () => {});',
    ].join("\n");

    expect(
      clavesDeLosDescribe(fuente),
      `El motor contó una ruta que solo aparece en el docblock y en un ` +
        `comentario de línea. Es el modo de falla que más importa de este ` +
        `archivo: los tres archivos de la batería listan sus 38 rutas en sus ` +
        `headers, así que un motor que no borre comentarios da el gate entero ` +
        `en verde aunque no exista un solo it.`,
    ).toEqual([]);
  });

  it("un describe con la clave del manifiesto sí cuenta, y la prosa de adelante no molesta", () => {
    const fuente = `describe("egreso — ${RUTA_FIXTURE} (actor: ADMIN)", () => {});`;

    expect(
      clavesDeLosDescribe(fuente),
      `El motor NO extrajo la clave de un describe bien formado. Si esto se ` +
        `rompe, TODA la batería pasa a "faltante" de golpe: el rojo sería ` +
        `ruidoso pero al menos honesto. Lo grave es lo inverso —que extraiga de ` +
        `más—, y de eso se ocupan los otros dos casos.`,
    ).toEqual([RUTA_FIXTURE]);
  });

  it("un describe apagado con .skip no cuenta como cobertura", () => {
    const fuente = `describe.skip("egreso — ${RUTA_FIXTURE}", () => {});`;

    expect(
      clavesDeLosDescribe(fuente),
      `Un describe.skip contó como cobertura. Un caso apagado no prueba ` +
        `aislamiento, y si contara, la salida fácil para el rojo de "faltantes" ` +
        `sería apagar el test en vez de escribirlo — que es justo lo que este ` +
        `gate existe para hacer imposible.`,
    ).toEqual([]);
  });

  it("un describe sin ruta se ignora en silencio (no es un fantasma)", () => {
    const fuente = 'describe("precondiciones de la bateria", () => {});';

    expect(
      clavesDeLosDescribe(fuente),
      `Un describe sin clave de ruta tiene que ignorarse, no reportarse: los ` +
        `tres archivos abren con un bloque de precondiciones que no cubre ` +
        `ninguna ruta, y tratarlo como fantasma llenaría el gate de ruido.`,
    ).toEqual([]);
  });
});
