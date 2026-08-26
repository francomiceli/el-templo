/**
 * Fase 173 Plan 29 (ISO-03) — el gate fail-closed de COBERTURA de la batería de
 * aislamiento de `members` (socios, staff y leads).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Los planes 173-26, 173-27 y 173-28 escribieron 62 tests que prueban, ruta por
 * ruta, que un gimnasio no ve ni escribe los datos de socios/staff/leads del
 * otro. Eso es cierto HOY. El problema no es el código de hoy: es el que se
 * agregue mañana. Alguien registra `POST /api/admin/members/lo-que-sea` en la
 * fase 174, lo clasifica en el manifiesto (el gate ISO-01 lo obliga) y… nadie
 * escribe su caso de aislamiento. La batería sigue en verde con 62 tests, el
 * requisito ISO-03 sigue "cumplido" para este módulo, y esa ruta queda fuera
 * del gate del milestone para siempre — hasta que un gimnasio lea o mueva a un
 * socio ajeno.
 *
 * Este archivo es el gemelo exacto, por estructura, de
 * `iso-03-cobertura.test.ts` (fase 172, finance) — mismo motor, mismas cuatro
 * garantías — con **tres** cambios medidos (no uno):
 *
 *   1. El criterio de prefijo corrige una trampa real de `iso-03-cobertura.test.ts`
 *      (ver más abajo, "POR QUÉ EL CRITERIO NO ES UN startsWith A SECAS").
 *   2. Son TRES prefijos (`/api/admin/members`, `/api/admin/users`,
 *      `/api/admin/leads`), no uno.
 *   3. `CASOS_BASELINE = 29` y `ARCHIVOS_BATERIA` apunta a los 3 archivos de esta
 *      batería.
 *
 * Requisito: **ISO-03** / **ADO-02**. Receta de adopción:
 * `.docs/saas-multitenancy/07-receta-adopcion.md` (⚠️ `.docs/` no está
 * versionado, vive solo en el checkout principal).
 *
 * LO QUE SE AFIRMA
 * ----------------
 * 1. Toda ruta `tenant-scoped` de los 3 prefijos del manifiesto tiene un caso en
 *    la batería (`faltantes` = []). Ruta nueva sin caso = CI rojo, NOMBRÁNDOLA.
 * 2. Todo caso de la batería apunta a una ruta que existe en el manifiesto
 *    (`fantasmas` = []): atrapa typos en el nombre del `describe`, renames de
 *    ruta que no se propagaron y casos que quedaron cubriendo una ruta borrada.
 * 3. El conteo del baseline, para que el verde no pueda serlo por vacuidad.
 * 4. Las excepciones nombradas siguen siendo excepciones: existen en el
 *    manifiesto, siguen fuera de los 3 prefijos y siguen con su motivo escrito.
 *
 * POR QUÉ EL CRITERIO NO ES UN startsWith A SECAS (la trampa medida del plan)
 * -----------------------------------------------------------------------
 * `iso-03-cobertura.test.ts` usa `url.startsWith(PREFIJO_FINANCE)` con
 * `PREFIJO_FINANCE = "/api/admin/finance/"` — **con barra final**. Ese criterio
 * es seguro ahí porque NINGUNA ruta finance es el prefijo pelado (todas tienen
 * algo después de `/finance/`).
 *
 * Members NO tiene esa suerte: `GET /api/admin/members` y
 * `POST /api/admin/members` (el listado paginado y el alta de socio — dos de
 * las rutas MÁS importantes del módulo) son el prefijo pelado, sin barra ni
 * segmento después. Si acá se copiara el mismo criterio con barra final
 * (`url.startsWith("/api/admin/members" + "/")`), esas dos rutas NO
 * matchearían — se perderían EN SILENCIO, el conteo bajaría de 30 a un número
 * menor, y como `CASOS_BASELINE` también bajaría para "cuadrar", el gate
 * quedaría VERDE mintiendo: dos de las rutas de mayor tráfico del módulo
 * quedarían fuera de la protección de este archivo sin que nadie se enterara.
 *
 * Medido en este plan: bajo el criterio incorrecto (`startsWith(P + "/")`
 * aplicado a LOS TRES prefijos), el conteo NO da 28 — da **26**. La razón es
 * que la misma trampa alcanza también a `/api/admin/users`: `GET /api/admin/users`
 * y `POST /api/admin/users` (listado de staff y alta de staff) son IGUAL de
 * pelados que sus pares de members. Cuatro rutas pierden el match, no dos:
 * las dos de members MÁS las dos de users. Queda transcripto en el Task 2 con
 * el número real, no el estimado.
 *
 * Por eso el criterio de acá es:
 *
 *   url === prefijo || url.startsWith(prefijo + "/")
 *
 * — ni comodín a secas (matchearía `/api/admin/members-algo` si existiera:
 * verificado que no existe) ni barra final a secas (pierde las 4 rutas
 * pelotas de arriba): el prefijo pelado cuenta como match exacto, y cualquier
 * cosa debajo cuenta vía el segmento con barra.
 *
 * LOS TRES PREFIJOS
 * -----------------
 * `/api/admin/members` (24 rutas) + `/api/admin/users` (4 rutas) +
 * `/api/admin/leads` (1 ruta) = **29** rutas `tenant-scoped`. Verificado sin
 * colisiones: no existe `/api/admin/member-*`, `/api/admin/users-*` ni
 * `/api/admin/leads-*` en el manifiesto, y las rutas member-facing de la app
 * (`/api/members/*`) no matchean ninguno de los tres porque el ancla de los
 * tres prefijos es `/api/admin/`.
 *
 * CÓMO SE SABE QUÉ RUTA CUBRE CADA CASO / POR QUÉ SE LEE EL FUENTE / POR QUÉ
 * SE BORRAN LOS COMENTARIOS ANTES DE BUSCAR / QUÉ HACER CUANDO SE CAIGA
 * ---------------------------------------------------------------------
 * Idéntico a `iso-03-cobertura.test.ts` (fase 172): el nombre del `describe` ES
 * el registro de cobertura (`"<prosa> — <MÉTODO> <url completa>"`), se lee el
 * fuente con `readFileSync` (importar los 3 archivos los EJECUTARÍA contra
 * MySQL), se borran los comentarios antes de buscar (los 3 archivos listan sus
 * rutas en el docblock de cabecera) y `describe.skip` / `.todo` NO cuentan como
 * cobertura.
 *
 * CÓMO CORRERLO
 * -------------
 *   cd el-templo-api
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-cobertura-members.test.ts
 *
 * Este gate NO toca la base: no manda un request, no construye el app y no lee
 * una fila. Solo lee texto.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

import { TENANT_MANIFEST } from "../tenant-manifest";

/**
 * Los TRES prefijos del módulo `members` (socios, staff, leads). Ninguno lleva
 * barra final — ver el docblock de arriba: la barra final es exactamente la
 * trampa que este criterio existe para no tener, y agregarla acá reintroduciría
 * el mismo modo de falla que el comentario de arriba mide en 26 vs 30.
 */
const PREFIJO_MEMBERS = "/api/admin/members";
const PREFIJO_USERS = "/api/admin/users";
const PREFIJO_LEADS = "/api/admin/leads";
const PREFIJOS = [PREFIJO_MEMBERS, PREFIJO_USERS, PREFIJO_LEADS] as const;

/**
 * El criterio de "es una ruta de este módulo": el prefijo PELADO cuenta (para
 * no perder `GET`/`POST /api/admin/members` y `GET`/`POST /api/admin/users`,
 * las 4 rutas sin segmento después del prefijo), y cualquier cosa debajo cuenta
 * vía el segmento CON barra (para no matchear un futuro
 * `/api/admin/members-algo` que no sea de este módulo — verificado que no
 * existe hoy).
 */
function esRutaDelModulo(url: string): boolean {
  return PREFIJOS.some(
    (prefijo) => url === prefijo || url.startsWith(prefijo + "/"),
  );
}

/**
 * Rutas que un lector razonable esperaría en esta batería y que están AFUERA a
 * propósito, cada una con el motivo escrito. Hoy está VACÍA: las 29 rutas
 * `tenant-scoped` de los 3 prefijos están cubiertas directamente por los 3
 * archivos de la batería (173-26/27/28), sin necesidad de excluir ninguna. Se
 * deja la forma (y su gate, el cuarto `it` de abajo) para cuando una fase
 * futura (174/175) registre una ruta que se LLAME members/users/leads pero
 * viva y se adopte en otro módulo — el mismo caso que
 * `GET /api/admin/analytics/advanced-finance` es para `iso-03-cobertura.test.ts`.
 */
export const EXCEPCIONES_NOMBRADAS: Readonly<Record<string, string>> = {};

/**
 * Las rutas de los 3 prefijos que la batería tenía cubiertas cuando este gate
 * se escribió (2026-08-09, planes 173-26/27/28): **30**.
 *
 * BAJÓ DE 30 A 29 (fase 176 plan 11, 2026-08-22) — DECISIÓN DE DISEÑO, NO UN
 * AJUSTE PARA CI: `POST /api/admin/users/:userId/program-addons` migró de
 * `tenant-scoped` a `templo-module`/`templo-training` en el plan 176-05.
 * `moduleScope` ya la gateaba en runtime desde 176-03 — lo que estaba
 * desactualizado era `test/tenant-manifest.ts`, que 176-05 corrigió. Esa ruta
 * dejó de pertenecer al set `tenant-scoped` de members (no dejó de existir en
 * el API), así que el baseline de ESTA batería baja de 30 a 29 — la ruta
 * sigue existiendo y sigue probada, pero como ruta de módulo, con su
 * aislamiento reubicado a test/tenancy/iso-03-programs-modulo.test.ts.
 *
 * MOVER ESTE NÚMERO ES UNA DECISIÓN DE DISEÑO, NO UN AJUSTE.
 *
 *   - **Sube** cuando se agrega una ruta de members/users/leads CON su caso de
 *     aislamiento y su control positivo. Las dos mitades: la ruta sola deja
 *     rojo `faltantes`, el caso solo deja rojo `fantasmas`.
 *   - **Baja** SOLO cuando una ruta deja de existir en el API y su entrada sale
 *     del manifiesto. Bajarlo por cualquier otro motivo es sacarle superficie
 *     al gate del milestone: significa que hay menos rutas de SOCIOS probadas
 *     contra un segundo gimnasio que ayer — exactamente el retroceso que
 *     ISO-03 existe para impedir. Si estás por bajarlo para poner CI en verde,
 *     el rojo que estás tapando es el hallazgo.
 *
 * POR QUÉ EXISTE habiendo ya dos gates bidireccionales: los dos comparan dos
 * listas DERIVADAS, y si la derivación se rompiera —alguien mueve o renombra un
 * archivo de la batería, `readFileSync` devuelve otra cosa, el regex de
 * `describe` deja de matchear— las dos listas quedarían vacías contra un
 * manifiesto vacío y todo pasaría en verde por vacuidad. Este conteo es lo que
 * hace que 0 rutas cubiertas se ponga tan rojo como 29.
 */
// 2026-08-25: 29 → 30 al agregar POST /api/admin/leads/:userId/start-followup
// (sella el seguimiento de una SP de app) con su caso de aislamiento + control.
// 2026-08-26: 30 → 33 al aterrizar la fase 179 (tren 179+180 a master) — las 3
// rutas de asignación retroactiva de partner de la ficha,
// GET/POST/DELETE /api/admin/members/:userId/partner-referral, con sus casos de
// aislamiento + control en iso-03-members-ficha.test.ts (la deuda "batería
// tenancy por verificar" de la 179, saldada acá).
const CASOS_BASELINE = 33;

/** Los tres archivos de la batería ISO-03 de members. */
const ARCHIVOS_BATERIA = [
  "iso-03-members-listados.test.ts", // plan 173-26 — 9 rutas (listado/export)
  "iso-03-members-ficha.test.ts", // plan 173-27 — 10 rutas (ficha del socio)
  "iso-03-members-altas-y-staff.test.ts", // plan 173-28 — 10 rutas (escritura) — 11 originalmente, bajó a 10 en 176-11 (program-addons se mudó)
] as const;

/**
 * Métodos HTTP que pueden abrir una clave del manifiesto. Union cerrada a
 * propósito: un regex con `\w+` tomaría por método cualquier palabra en
 * mayúsculas de la prosa del `describe`.
 */
const METODOS = "GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS";

/**
 * Borra comentarios de bloque y de línea completa. Ver el docblock de arriba:
 * sin esto el gate mediría los headers de los archivos, que listan las 29
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

/** Las rutas `tenant-scoped` de los 3 prefijos del módulo (la lista a cubrir). */
const RUTAS_MEMBERS: readonly string[] = Object.entries(TENANT_MANIFEST)
  .filter(([clave, entrada]) => {
    if (entrada.categoria !== "tenant-scoped") return false;
    const url = clave.slice(clave.indexOf(" ") + 1);
    return esRutaDelModulo(url);
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

describe("cobertura de la batería ISO-03 de members — contra el manifiesto real", () => {
  it("toda ruta tenant-scoped de los 3 prefijos tiene caso de aislamiento", () => {
    const escritos = new Set(CASOS_ESCRITOS);
    const faltantes = RUTAS_MEMBERS.filter((ruta) => !escritos.has(ruta));

    expect(
      faltantes,
      `Rutas de members/users/leads "tenant-scoped" del manifiesto que NO ` +
        `tienen caso en la batería ISO-03: ${faltantes.join(", ")}. ` +
        `QUÉ HACER: escribile a cada una su caso en el archivo de la familia ` +
        `que corresponda —${ARCHIVOS_BATERIA.join(", ")}— con la clave exacta ` +
        `"<MÉTODO> <url>" adentro del nombre del describe (la prosa va ` +
        `adelante, separada por " — "). Y el caso son DOS its, no uno: el de ` +
        `aislamiento (el recurso del otro gimnasio es indistinguible de uno ` +
        `inexistente, D-06) y su CONTROL POSITIVO (la ruta funciona de verdad ` +
        `para el dueño). Sin el control, un 404 por siembra rota se ve igual ` +
        `que un 404 por aislamiento y el caso pasa sin probar nada. ` +
        `LO QUE NO ES UNA SALIDA: renombrar el describe sin escribir el test, ` +
        `apagarlo con .skip (no cuenta, a propósito), o meter la ruta en ` +
        `EXCEPCIONES_NOMBRADAS —que es para rutas FUERA de los 3 prefijos y el ` +
        `cuarto test lo verifica—. ` +
        `POR QUÉ IMPORTA: ISO-03 es el requisito que el milestone usa como GATE ` +
        `para onboardear el segundo gimnasio. Una ruta de SOCIOS sin caso de ` +
        `aislamiento no la mira nadie —ni el sentinel, que solo ve queries, ni ` +
        `la revisión humana— hasta que un gimnasio lea o edite a un socio ` +
        `ajeno. Este test es la única razón por la que la batería no puede ` +
        `envejecer en silencio mientras las fases 174-175 agregan superficie.`,
    ).toEqual([]);
  });

  it("todo caso de la batería apunta a una ruta que existe en el manifiesto", () => {
    const members = new Set(RUTAS_MEMBERS);
    const excepciones = new Set(Object.keys(EXCEPCIONES_NOMBRADAS));
    const fantasmas = CASOS_ESCRITOS.filter(
      (clave) => !members.has(clave) && !excepciones.has(clave),
    );

    expect(
      fantasmas,
      `Casos de la batería cuyo describe nombra una ruta que NO existe entre ` +
        `las rutas de members/users/leads del manifiesto: ${fantasmas.join(", ")}. ` +
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

  it("la batería cubre exactamente las 29 rutas de members/users/leads del baseline", () => {
    expect(
      RUTAS_MEMBERS.length,
      `El manifiesto tiene ${RUTAS_MEMBERS.length} rutas de members/users/leads ` +
        `"tenant-scoped" y el baseline dice ${CASOS_BASELINE}. Ver el docblock ` +
        `de CASOS_BASELINE: sube cuando se agrega una ruta CON su caso, baja ` +
        `SOLO cuando una ruta deja de existir en el API. Si se movió sin ` +
        `ninguna de las dos cosas, alguien tocó el registro de rutas sin tocar ` +
        `la batería —o al revés—.`,
    ).toBe(CASOS_BASELINE);

    const cubiertas = CASOS_ESCRITOS.filter((clave) =>
      RUTAS_MEMBERS.includes(clave),
    );
    expect(
      cubiertas.length,
      `La batería declara ${cubiertas.length} rutas de members/users/leads ` +
        `cubiertas y el baseline dice ${CASOS_BASELINE}. Si este número es 0 ` +
        `—o mucho más chico de lo esperado— el problema NO es la cobertura: es ` +
        `la derivación. Alguien movió o renombró un archivo de la batería, o el ` +
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
          `manifiesto. Los tres archivos aportan (9 + 10 + 10 = ` +
          `${CASOS_BASELINE}), así que un 0 acá es una lectura rota, no una ` +
          `decisión.`,
      ).toBeGreaterThan(0);
    }
  });

  it("las excepciones nombradas siguen existiendo, siguen fuera de los 3 prefijos y siguen con su motivo", () => {
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

    const conPrefijoDelModulo = claves.filter((clave) =>
      esRutaDelModulo(clave.slice(clave.indexOf(" ") + 1)),
    );
    expect(
      conPrefijoDelModulo,
      `Excepciones que SÍ matchean alguno de los 3 prefijos del módulo ` +
        `(${PREFIJOS.join(", ")}): ${conPrefijoDelModulo.join(", ")}. ` +
        `EXCEPCIONES_NOMBRADAS existe para rutas que se LLAMAN ` +
        `members/users/leads pero viven y se adoptan en otro módulo, NO para ` +
        `sacar del gate una ruta de este módulo que quedó sin caso. Esa puerta ` +
        `tiene que estar cerrada: si estuviera abierta, el rojo de "faltantes" ` +
        `se apagaría escribiendo una línea acá en vez de un test, y este ` +
        `archivo entero dejaría de significar algo. ` +
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
        `D-02 (fase 171) con las entradas "global" del manifiesto: un motivo ` +
        `vacío, de dos palabras o con marcador de trabajo pendiente vale lo ` +
        `mismo que nada. ` +
        `QUÉ HACER: escribí una oración que diga POR QUÉ la ruta está afuera y ` +
        `QUIÉN la cubre —qué fase, qué batería—, para que dentro de un año se ` +
        `pueda auditar si fue una decisión o un descuido.`,
    ).toEqual([]);
  });
});

/**
 * La otra mitad del gate. Los cuatro tests de arriba prueban que HOY la
 * batería y el manifiesto coinciden; éstos prueban que el MOTOR sabe
 * distinguir un test de un comentario — sin lo cual el verde de arriba podría
 * ser prosa.
 *
 * No es paranoia teórica: los tres archivos de la batería abren con un
 * docblock que lista sus rutas en el formato exacto de la clave. Si
 * `sinComentarios()` dejara de funcionar, el gate seguiría en verde con la
 * batería VACÍA. Estos fixtures son lo único que lo delata.
 *
 * Mismo patrón que `iso-03-cobertura.test.ts` (fase 172) y que
 * `iso-01-manifiesto.test.ts` (motor con fixtures sintéticos).
 */
describe("cobertura ISO-03 de members — motor con fixtures sintéticos", () => {
  const RUTA_FIXTURE = "POST /api/admin/members/fixture-173-29";

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
        `archivo: los tres archivos de la batería listan sus 29 rutas en sus ` +
        `headers, así que un motor que no borre comentarios da el gate entero ` +
        `en verde aunque no exista un solo it.`,
    ).toEqual([]);
  });

  it("un describe con la clave del manifiesto sí cuenta, y la prosa de adelante no molesta", () => {
    const fuente = `describe("alta — ${RUTA_FIXTURE} (actor: ADMIN)", () => {});`;

    expect(
      clavesDeLosDescribe(fuente),
      `El motor NO extrajo la clave de un describe bien formado. Si esto se ` +
        `rompe, TODA la batería pasa a "faltante" de golpe: el rojo sería ` +
        `ruidoso pero al menos honesto. Lo grave es lo inverso —que extraiga de ` +
        `más—, y de eso se ocupan los otros dos casos.`,
    ).toEqual([RUTA_FIXTURE]);
  });

  it("un describe apagado con .skip no cuenta como cobertura", () => {
    const fuente = `describe.skip("alta — ${RUTA_FIXTURE}", () => {});`;

    expect(
      clavesDeLosDescribe(fuente),
      `Un describe.skip contó como cobertura. Un caso apagado no prueba ` +
        `aislamiento, y si contara, la salida fácil para el rojo de ` +
        `"faltantes" sería apagar el test en vez de escribirlo — que es justo ` +
        `lo que este gate existe para hacer imposible.`,
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
