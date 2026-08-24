/**
 * Fase 174.1 Plan 09 (ISO-03) — el gate fail-closed de COBERTURA de la
 * batería de aislamiento de `subscriptions` + `scheduling`.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Los planes 174.1-01 (subs lectura), 174.1-06 (subs escritura), 174.1-07
 * (scheduling lectura) y 174.1-08 (scheduling escritura) escribieron 62
 * tests que prueban, ruta por ruta, que un gimnasio no ve ni escribe las
 * suscripciones/horarios/reservas del otro. Eso es cierto HOY. El problema
 * no es el código de hoy: es el que se agregue mañana. Alguien registra
 * `POST /api/admin/scheduling/lo-que-sea` en una fase futura, lo clasifica
 * en el manifiesto (el gate ISO-01 lo obliga) y… nadie escribe su caso de
 * aislamiento. La batería sigue en verde con 62 tests, el requisito ISO-03
 * sigue "cumplido" para estos dos módulos, y esa ruta queda fuera del gate
 * del milestone para siempre — hasta que un gimnasio lea o mueva un turno o
 * una suscripción ajena.
 *
 * Este archivo es el gemelo exacto, por estructura, de
 * `iso-03-cobertura-members.test.ts` (fase 173 plan 29) — mismo motor,
 * mismas cuatro garantías — con **dos** cambios medidos (no uno):
 *
 *   1. Son CUATRO prefijos, no tres: `/api/admin/subscriptions`,
 *      `/api/members/subscription`, `/api/admin/scheduling`,
 *      `/api/members/scheduling`.
 *   2. `CASOS_BASELINE = 65` y `ARCHIVOS_BATERIA` apunta a los 4 archivos
 *      de esta batería.
 *
 * Requisitos: **ADO-03** (subscriptions), **ADO-04** (scheduling),
 * extendiendo **ISO-03** a estas rutas.
 *
 * LO QUE SE AFIRMA
 * ----------------
 * 1. Toda ruta `tenant-scoped` de los 4 prefijos del manifiesto tiene un
 *    caso en la batería (`faltantes` = []). Ruta nueva sin caso = CI rojo,
 *    NOMBRÁNDOLA.
 * 2. Todo caso de la batería apunta a una ruta que existe en el manifiesto
 *    (`fantasmas` = []): atrapa typos en el nombre del `describe`, renames
 *    de ruta que no se propagaron y casos que quedaron cubriendo una ruta
 *    borrada.
 * 3. El conteo del baseline, para que el verde no pueda serlo por vacuidad.
 * 4. Las excepciones nombradas siguen siendo excepciones: existen en el
 *    manifiesto, siguen fuera de los 4 prefijos y siguen con su motivo
 *    escrito.
 *
 * POR QUÉ EL CRITERIO NO ES UN startsWith A SECAS (la trampa medida del molde)
 * -----------------------------------------------------------------------
 * `iso-03-cobertura-members.test.ts` documentó la trampa real: un criterio
 * `url.startsWith(prefijo + "/")` a secas pierde EN SILENCIO cualquier ruta
 * que sea el prefijo pelado, sin segmento después (en members: las 4 rutas
 * `GET`/`POST /api/admin/members` y `GET`/`POST /api/admin/users`). Acá se
 * usa el mismo criterio corregido por la misma razón — defensivo hacia
 * adelante, no porque hoy haga falta (ver el hallazgo abajo):
 *
 *   url === prefijo || url.startsWith(prefijo + "/")
 *
 * HALLAZGO MEDIDO EN ESTE PLAN (a diferencia de members): ninguno de los
 * CUATRO prefijos de subs+scheduling tiene HOY una ruta que sea el prefijo
 * pelado. Verificado exhaustivamente contra el manifiesto completo (las 158
 * claves, sin filtrar por categoría): cero matches de
 * `"<MÉTODO> /api/admin/subscriptions"`, `"<MÉTODO> /api/members/subscription"`,
 * `"<MÉTODO> /api/admin/scheduling"` o `"<MÉTODO> /api/members/scheduling"`
 * exactos. Por eso, a diferencia de members (30 → 26 al cambiar el
 * criterio), acá el conteo NO cambia (62 → 62) al usar el criterio
 * incorrecto — Task 2 transcribe esta comparación con el número real. El
 * criterio corregido sigue siendo obligatorio: protege contra el día en que
 * alguien registre `GET /api/admin/scheduling` (un dashboard-resumen, por
 * ejemplo) sin segmento después.
 *
 * LOS CUATRO PREFIJOS
 * --------------------
 * `/api/admin/subscriptions` (26 rutas) + `/api/members/subscription` (4) +
 * `/api/admin/scheduling` (23) + `/api/members/scheduling` (9) = **62**
 * rutas `tenant-scoped`. Verificado sin colisiones: no existe
 * `/api/admin/subscriptions-*`, `/api/members/subscription-*`,
 * `/api/admin/scheduling-*` ni `/api/members/scheduling-*` en el
 * manifiesto, y el singular app-facing `/api/members/subscription` no
 * matchea el plural admin `/api/admin/subscriptions` (ni al revés) porque
 * el ancla de los cuatro prefijos es `/api/admin/` vs `/api/members/`.
 *
 * CÓMO SE SABE QUÉ RUTA CUBRE CADA CASO / POR QUÉ SE LEE EL FUENTE / POR QUÉ
 * SE BORRAN LOS COMENTARIOS ANTES DE BUSCAR / QUÉ HACER CUANDO SE CAIGA
 * ---------------------------------------------------------------------
 * Idéntico a `iso-03-cobertura-members.test.ts` (fase 173): el nombre del
 * `describe` ES el registro de cobertura (`"<prosa> — <MÉTODO> <url completa>"`),
 * se lee el fuente con `readFileSync` (importar los 4 archivos los
 * EJECUTARÍA contra MySQL), se borran los comentarios antes de buscar (los 4
 * archivos listan sus rutas en el docblock de cabecera) y `describe.skip` /
 * `.todo` NO cuentan como cobertura.
 *
 * CÓMO CORRERLO
 * -------------
 *   cd el-templo-api
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-cobertura-subs-sched.test.ts
 *
 * Este gate NO toca la base: no manda un request, no construye el app y no
 * lee una fila. Solo lee texto.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

import { TENANT_MANIFEST } from "../tenant-manifest";

/**
 * Los CUATRO prefijos de `subscriptions` + `scheduling` (admin y app-facing
 * de cada uno). Ninguno lleva barra final — ver el docblock de arriba: la
 * barra final es exactamente la trampa que este criterio existe para no
 * tener, y agregarla acá reintroduciría el mismo modo de falla que el
 * comentario de arriba mide (hoy en 0 rutas perdidas, pero el criterio
 * protege igual hacia adelante).
 */
const PREFIJO_ADMIN_SUBS = "/api/admin/subscriptions";
const PREFIJO_APP_SUBS = "/api/members/subscription";
const PREFIJO_ADMIN_SCHED = "/api/admin/scheduling";
const PREFIJO_APP_SCHED = "/api/members/scheduling";
const PREFIJOS = [
  PREFIJO_ADMIN_SUBS,
  PREFIJO_APP_SUBS,
  PREFIJO_ADMIN_SCHED,
  PREFIJO_APP_SCHED,
] as const;

/**
 * El criterio de "es una ruta de estos módulos": el prefijo PELADO cuenta
 * (defensivo — ver el docblock de arriba: hoy ninguna ruta de estos 4
 * prefijos es el prefijo pelado, pero una ruta futura sí podría serlo), y
 * cualquier cosa debajo cuenta vía el segmento CON barra (para no matchear
 * un futuro `/api/admin/scheduling-algo` que no sea de este módulo —
 * verificado que no existe hoy).
 */
function esRutaDelModulo(url: string): boolean {
  return PREFIJOS.some(
    (prefijo) => url === prefijo || url.startsWith(prefijo + "/"),
  );
}

/**
 * Rutas que un lector razonable esperaría en esta batería y que están AFUERA
 * a propósito, cada una con el motivo escrito. Hoy está VACÍA: las 62 rutas
 * `tenant-scoped` de los 4 prefijos están cubiertas directamente por los 4
 * archivos de la batería (174.1-01/06/07/08), sin necesidad de excluir
 * ninguna. Se deja la forma (y su gate, el cuarto `it` de abajo) para cuando
 * una fase futura registre una ruta que se LLAME subscriptions/scheduling
 * pero viva y se adopte en otro módulo.
 */
export const EXCEPCIONES_NOMBRADAS: Readonly<Record<string, string>> = {};

/**
 * Las rutas de los 4 prefijos que la batería tenía cubiertas cuando este
 * gate se escribió (2026-08-13, planes 174.1-01/06/07/08): **62**
 * (26 admin-subs + 4 app-subs + 23 admin-sched + 9 app-sched).
 *
 * MOVER ESTE NÚMERO ES UNA DECISIÓN DE DISEÑO, NO UN AJUSTE.
 *
 *   - **Sube** cuando se agrega una ruta de subscriptions/scheduling CON su
 *     caso de aislamiento y su control positivo. Las dos mitades: la ruta
 *     sola deja rojo `faltantes`, el caso solo deja rojo `fantasmas`.
 *   - **Baja** SOLO cuando una ruta deja de existir en el API y su entrada
 *     sale del manifiesto. Bajarlo por cualquier otro motivo es sacarle
 *     superficie al gate del milestone: significa que hay menos rutas de
 *     SUSCRIPCIONES/TURNOS probadas contra un segundo gimnasio que ayer —
 *     exactamente el retroceso que ISO-03 existe para impedir. Si estás por
 *     bajarlo para poner CI en verde, el rojo que estás tapando es el
 *     hallazgo.
 *
 * POR QUÉ EXISTE habiendo ya dos gates bidireccionales: los dos comparan dos
 * listas DERIVADAS, y si la derivación se rompiera —alguien mueve o
 * renombra un archivo de la batería, `readFileSync` devuelve otra cosa, el
 * regex de `describe` deja de matchear— las dos listas quedarían vacías
 * contra un manifiesto vacío y todo pasaría en verde por vacuidad. Este
 * conteo es lo que hace que 0 rutas cubiertas se ponga tan rojo como 63.
 */
const CASOS_BASELINE = 65;

/** Los cuatro archivos de la batería ISO-03 de subs+scheduling. */
const ARCHIVOS_BATERIA = [
  "iso-03-subs-lecturas.test.ts", // plan 174.1-01 — 14 rutas (subs lectura)
  "iso-03-subs-escritura.test.ts", // plan 174.1-06 — 16 rutas (subs escritura)
  "iso-03-sched-lecturas.test.ts", // plan 174.1-07 — 14 rutas (sched lectura, +1 fase 180: GET class-label-descriptions)
  "iso-03-sched-escritura.test.ts", // plan 174.1-08 — 20 rutas (sched escritura, +1 fase 180: PUT class-label-descriptions)
] as const;

/**
 * Métodos HTTP que pueden abrir una clave del manifiesto. Union cerrada a
 * propósito: un regex con `\w+` tomaría por método cualquier palabra en
 * mayúsculas de la prosa del `describe`.
 */
const METODOS = "GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS";

/**
 * Borra comentarios de bloque y de línea completa. Ver el docblock de
 * arriba: sin esto el gate mediría los headers de los archivos, que listan
 * las 62 rutas, en vez de los tests.
 *
 * No pretende ser un parser de TypeScript: no toca comentarios al final de
 * una línea de código, porque un `describe(...)` no se abre después de un
 * `//` y porque recortar hasta el fin de línea rompería cualquier string
 * con `//` adentro (una URL absoluta, por ejemplo).
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
 *   - `describe.skip` y `describe.todo` NO cuentan: un caso apagado no
 *     prueba aislamiento.
 *   - Un `describe` sin clave (el de precondiciones, por ejemplo) se ignora
 *     en silencio; no todo bloque tiene que ser una ruta.
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

/** Las rutas `tenant-scoped` de los 4 prefijos del módulo (la lista a cubrir). */
const RUTAS_SUBS_SCHED: readonly string[] = Object.entries(TENANT_MANIFEST)
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

describe("cobertura de la batería ISO-03 de subs+scheduling — contra el manifiesto real", () => {
  it("toda ruta tenant-scoped de los 4 prefijos tiene caso de aislamiento", () => {
    const escritos = new Set(CASOS_ESCRITOS);
    const faltantes = RUTAS_SUBS_SCHED.filter((ruta) => !escritos.has(ruta));

    expect(
      faltantes,
      `Rutas de subscriptions/scheduling "tenant-scoped" del manifiesto que NO ` +
        `tienen caso en la batería ISO-03: ${faltantes.join(", ")}. ` +
        `QUÉ HACER: escribile a cada una su caso en el archivo de la familia ` +
        `que corresponda —${ARCHIVOS_BATERIA.join(", ")}— con la clave exacta ` +
        `"<MÉTODO> <url>" adentro del nombre del describe (la prosa va ` +
        `adelante, separada por " — "). Y el caso son DOS its, no uno: el de ` +
        `aislamiento (el recurso del otro gimnasio es indistinguible de uno ` +
        `inexistente) y su CONTROL POSITIVO (la ruta funciona de verdad para ` +
        `el dueño). Sin el control, un 404 por siembra rota se ve igual que ` +
        `un 404 por aislamiento y el caso pasa sin probar nada. ` +
        `LO QUE NO ES UNA SALIDA: renombrar el describe sin escribir el test, ` +
        `apagarlo con .skip (no cuenta, a propósito), o meter la ruta en ` +
        `EXCEPCIONES_NOMBRADAS —que es para rutas FUERA de los 4 prefijos y el ` +
        `cuarto test lo verifica—. ` +
        `POR QUÉ IMPORTA: ISO-03 es el requisito que el milestone usa como GATE ` +
        `para onboardear el segundo gimnasio. Una ruta de SUSCRIPCIONES o ` +
        `TURNOS sin caso de aislamiento no la mira nadie —ni el sentinel, que ` +
        `solo ve queries, ni la revisión humana— hasta que un gimnasio lea o ` +
        `mueva un turno o una suscripción ajena. Este test es la única razón ` +
        `por la que la batería no puede envejecer en silencio mientras las ` +
        `fases futuras agregan superficie.`,
    ).toEqual([]);
  });

  it("todo caso de la batería apunta a una ruta que existe en el manifiesto", () => {
    const subsSched = new Set(RUTAS_SUBS_SCHED);
    const excepciones = new Set(Object.keys(EXCEPCIONES_NOMBRADAS));
    const fantasmas = CASOS_ESCRITOS.filter(
      (clave) => !subsSched.has(clave) && !excepciones.has(clave),
    );

    expect(
      fantasmas,
      `Casos de la batería cuyo describe nombra una ruta que NO existe entre ` +
        `las rutas de subscriptions/scheduling del manifiesto: ${fantasmas.join(", ")}. ` +
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

  it("la batería cubre exactamente las 62 rutas de subscriptions/scheduling del baseline", () => {
    expect(
      RUTAS_SUBS_SCHED.length,
      `El manifiesto tiene ${RUTAS_SUBS_SCHED.length} rutas de ` +
        `subscriptions/scheduling "tenant-scoped" y el baseline dice ` +
        `${CASOS_BASELINE}. Ver el docblock de CASOS_BASELINE: sube cuando se ` +
        `agrega una ruta CON su caso, baja SOLO cuando una ruta deja de ` +
        `existir en el API. Si se movió sin ninguna de las dos cosas, alguien ` +
        `tocó el registro de rutas sin tocar la batería —o al revés—.`,
    ).toBe(CASOS_BASELINE);

    const cubiertas = CASOS_ESCRITOS.filter((clave) =>
      RUTAS_SUBS_SCHED.includes(clave),
    );
    expect(
      cubiertas.length,
      `La batería declara ${cubiertas.length} rutas de subscriptions/scheduling ` +
        `cubiertas y el baseline dice ${CASOS_BASELINE}. Si este número es 0 ` +
        `—o mucho más chico de lo esperado— el problema NO es la cobertura: es ` +
        `la derivación. Alguien movió o renombró un archivo de la batería, o el ` +
        `regex de describe dejó de matchear, y los dos gates bidireccionales de ` +
        `arriba estarían comparando listas vacías en verde. Revisá ` +
        `ARCHIVOS_BATERIA y clavesDeLosDescribe antes que la batería.`,
    ).toBe(CASOS_BASELINE);

    // Cada archivo tiene que aportar: si uno queda en 0, la lectura de ESE
    // archivo se rompió y los otros tres podrían tapar el agujero en el total.
    for (const { archivo, claves } of CASOS_POR_ARCHIVO) {
      expect(
        claves.length,
        `${archivo} no declaró ni una sola ruta en sus describe. O el archivo ` +
          `se vació, o se renombró, o sus describe perdieron la clave del ` +
          `manifiesto. Los cuatro archivos aportan (14 + 16 + 13 + 19 = ` +
          `${CASOS_BASELINE}), así que un 0 acá es una lectura rota, no una ` +
          `decisión.`,
      ).toBeGreaterThan(0);
    }
  });

  it("las excepciones nombradas siguen existiendo, siguen fuera de los 4 prefijos y siguen con su motivo", () => {
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
      `Excepciones que SÍ matchean alguno de los 4 prefijos del módulo ` +
        `(${PREFIJOS.join(", ")}): ${conPrefijoDelModulo.join(", ")}. ` +
        `EXCEPCIONES_NOMBRADAS existe para rutas que se LLAMAN ` +
        `subscriptions/scheduling pero viven y se adoptan en otro módulo, NO ` +
        `para sacar del gate una ruta de este módulo que quedó sin caso. Esa ` +
        `puerta tiene que estar cerrada: si estuviera abierta, el rojo de ` +
        `"faltantes" se apagaría escribiendo una línea acá en vez de un test, ` +
        `y este archivo entero dejaría de significar algo. ` +
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
        `las entradas "global" del manifiesto: un motivo vacío, de dos ` +
        `palabras o con marcador de trabajo pendiente vale lo mismo que nada. ` +
        `QUÉ HACER: escribí una oración que diga POR QUÉ la ruta está afuera y ` +
        `QUIÉN la cubre —qué fase, qué batería—, para que dentro de un año se ` +
        `pueda auditar si fue una decisión o un descuido.`,
    ).toEqual([]);
  });
});

/**
 * La otra mitad del gate. Los cuatro tests de arriba prueban que HOY la
 * batería y el manifiesto coinciden; éstos prueban que el MOTOR sabe
 * distinguir un test de un comentario — sin lo cual el verde de arriba
 * podría ser prosa.
 *
 * No es paranoia teórica: los cuatro archivos de la batería abren con un
 * docblock que lista sus rutas en el formato exacto de la clave. Si
 * `sinComentarios()` dejara de funcionar, el gate seguiría en verde con la
 * batería VACÍA. Estos fixtures son lo único que lo delata.
 *
 * Mismo patrón que `iso-03-cobertura.test.ts` (fase 172) y
 * `iso-03-cobertura-members.test.ts` (fase 173).
 */
describe("cobertura ISO-03 de subs+scheduling — motor con fixtures sintéticos", () => {
  const RUTA_FIXTURE = "POST /api/admin/scheduling/fixture-174-1-09";

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
        `archivo: los cuatro archivos de la batería listan sus 62 rutas en ` +
        `sus headers, así que un motor que no borre comentarios da el gate ` +
        `entero en verde aunque no exista un solo it.`,
    ).toEqual([]);
  });

  it("un describe con la clave del manifiesto sí cuenta, y la prosa de adelante no molesta", () => {
    const fuente = `describe("alta — ${RUTA_FIXTURE} (actor: ADMIN)", () => {});`;

    expect(
      clavesDeLosDescribe(fuente),
      `El motor NO extrajo la clave de un describe bien formado. Si esto se ` +
        `rompe, TODA la batería pasa a "faltante" de golpe: el rojo sería ` +
        `ruidoso pero al menos honesto. Lo grave es lo inverso —que extraiga ` +
        `de más—, y de eso se ocupan los otros dos casos.`,
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
        `cuatro archivos abren con un bloque de precondiciones que no cubre ` +
        `ninguna ruta, y tratarlo como fantasma llenaría el gate de ruido.`,
    ).toEqual([]);
  });
});
