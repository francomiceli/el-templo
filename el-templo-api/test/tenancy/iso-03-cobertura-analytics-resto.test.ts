/**
 * Fase 175.1 Plan 06 (ISO-03) — el gate fail-closed de COBERTURA de la
 * batería de aislamiento de `analytics` + los 6 módulos restantes del
 * cierre del milestone (`campaigns`, `notifications`, `referrals`,
 * `improvement-proposals`, `auth`, `wellhub`).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Los planes 175.1-02 (analytics), 175.1-03 (campaigns), 175.1-04
 * (notifications) y 175.1-05 (referrals + improvement-proposals + auth)
 * escribieron 47 tests que prueban, ruta por ruta, que un gimnasio no ve ni
 * escribe los datos del otro en estos 6 módulos. Eso es cierto HOY. El
 * problema, igual que en `iso-03-cobertura-subs-sched.test.ts` (174.1-09) y
 * `iso-03-cobertura-members.test.ts` (173-29), no es el código de hoy: es el
 * que se agregue mañana. Alguien registra `GET /api/campaigns/admin/algo`
 * en una fase futura, lo clasifica en el manifiesto (el gate ISO-01 lo
 * obliga) y… nadie escribe su caso de aislamiento. La batería sigue en
 * verde, ISO-03 sigue "cumplido" para estos módulos, y esa ruta queda fuera
 * del gate del milestone para siempre — hasta que un gimnasio lea o escriba
 * un dato ajeno.
 *
 * Este archivo es el gemelo exacto, por estructura, de
 * `iso-03-cobertura-subs-sched.test.ts` — mismo motor, mismas cuatro
 * garantías — con **tres** cambios medidos (no dos):
 *
 *   1. Son OCHO prefijos, no cuatro: `/api/admin/analytics`,
 *      `/api/campaigns`, `/api/notifications`, `/api/admin/referrals`,
 *      `/api/members/referrals`, `/api/admin/improvement-proposals`,
 *      `/api/members/improvement-proposals`, `/api/auth`.
 *   2. `CASOS_BASELINE = 51` y `ARCHIVOS_BATERIA` apunta a los 6 archivos
 *      de esta batería (no 4).
 *   3. `EXCEPCIONES_NOMBRADAS` NO está vacía (a diferencia de subs+sched):
 *      tiene 2 entradas, la trampa medida de este plan (ver abajo).
 *
 * Requisitos: **ADO-05** (analytics — el código, ya cerrado en la fase 175;
 * la verificación de números es checkpoint humano D2, fuera de esta
 * cadena), **ADO-06** (auth tenant-aware), extendiendo **ISO-03** a estas
 * rutas.
 *
 * LO QUE SE AFIRMA
 * ----------------
 * 1. Toda ruta `tenant-scoped` de los 8 prefijos del manifiesto tiene un
 *    caso en la batería (`faltantes` = []). Ruta nueva sin caso = CI rojo,
 *    NOMBRÁNDOLA.
 * 2. Todo caso de la batería apunta a una ruta que existe en el manifiesto
 *    (`fantasmas` = []): atrapa typos en el nombre del `describe`, renames
 *    de ruta que no se propagaron y casos que quedaron cubriendo una ruta
 *    borrada.
 * 3. El conteo del baseline, para que el verde no pueda serlo por vacuidad.
 * 4. Las excepciones nombradas siguen siendo excepciones: existen en el
 *    manifiesto, siguen fuera de los 8 prefijos y siguen con su motivo
 *    escrito.
 *
 * LA TRAMPA ESPECÍFICA DE ESTE PLAN: `/api/admin/referrals` VS
 * `/api/admin/members/.../referrals`
 * -----------------------------------------------------------------------
 * `GET`/`POST /api/admin/members/:userId/referrals` matchean el prefijo
 * `/api/admin/members` — NO `/api/admin/referrals` (el ancla es distinta:
 * `/api/admin/referrals` no es prefijo de `/api/admin/members/...` ni al
 * revés) — y YA tienen su caso + control positivo en
 * `iso-03-members-ficha.test.ts:490,692` (fase 173-27):
 *   - línea 490: `describe("referidos de la ficha — GET /api/admin/members/:userId/referrals")`
 *   - línea 692: `describe("asignar referidor — POST /api/admin/members/:userId/referrals")`
 * Si el criterio de prefijo capturara `/api/admin/members/*` (por ejemplo,
 * si alguien "simplificara" el prefijo de referrals a
 * `/api/admin/members/referrals` pensando que es más específico), el
 * conteo de este gate daría 2 FANTASMAS: esas 2 rutas ya están cubiertas
 * por el gate de members, no por este archivo, así que si este archivo las
 * reclamara también el gate de members quedaría con casos "fantasma" desde
 * la óptica de esta batería. Por eso las 2 rutas van acá en
 * `EXCEPCIONES_NOMBRADAS` — documentadas, no re-testeadas, no perdidas del
 * conteo — y el prefijo real de este archivo es el ancla pelada
 * `/api/admin/referrals` (que hoy solo tiene 1 ruta:
 * `GET /api/admin/referrals/ab-results`). Task 2 prueba esta trampa en vivo:
 * cambia temporalmente el prefijo a `/api/admin/members/referrals` y
 * transcribe el conteo incorrecto (sube con las 2 rutas capturadas de más).
 *
 * `wellhub` NO TIENE PREFIJO EN ESTE GATE (D-05 DEL CONTEXTO DE FASE)
 * -----------------------------------------------------------------------
 * La única ruta HTTP de `wellhub` es `POST /api/webhooks/wellhub`,
 * clasificada `global` en el manifiesto (resuelve el tenant DESPUÉS de
 * recibir el payload — mina M8, no es tenant-scoped). No hay batería de
 * rutas `tenant-scoped` que escribir para wellhub: su aislamiento ya lo
 * prueba `test/wellhub/*.test.ts` (fase 175-05) por resolución vía
 * `eventId`/`bookingNumber`, no por ruta HTTP scopeada. **Baseline de
 * wellhub en este gate: 0 rutas, sin prefijo propio** — no se agrega un
 * noveno prefijo `/api/webhooks/wellhub` porque no hay nada `tenant-scoped`
 * que ese prefijo capturaría (y agregar un prefijo con 0 matches posibles
 * sería ruido, no cobertura).
 *
 * POR QUÉ EL CRITERIO NO ES UN startsWith A SECAS (la trampa medida del molde)
 * -----------------------------------------------------------------------
 * Igual que `iso-03-cobertura-members.test.ts` y
 * `iso-03-cobertura-subs-sched.test.ts` documentaron: un criterio
 * `url.startsWith(prefijo + "/")` a secas pierde EN SILENCIO cualquier ruta
 * que sea el prefijo pelado, sin segmento después. Acá SÍ hace falta hoy,
 * no solo en defensiva: `GET /api/admin/analytics` (el dashboard resumen)
 * es exactamente el prefijo `/api/admin/analytics` pelado — Task 2
 * transcribe el conteo que se pierde con el criterio incorrecto. Por eso el
 * criterio corregido es obligatorio:
 *
 *   url === prefijo || url.startsWith(prefijo + "/")
 *
 * LOS OCHO PREFIJOS
 * ------------------
 * `/api/admin/analytics` (22) + `/api/campaigns` (11) + `/api/notifications`
 * (8) + `/api/admin/referrals` (1) + `/api/members/referrals` (2) +
 * `/api/admin/improvement-proposals` (2) + `/api/members/improvement-proposals`
 * (2) + `/api/auth` (4) = **52** rutas `tenant-scoped`. Verificado sin
 * colisiones contra el manifiesto completo con `tsx` (374 entradas):
 * ninguno de los 8 prefijos matchea `/api/admin/members/*`, y
 * `/api/admin/referrals` no es prefijo de `/api/admin/members/.../referrals`
 * ni al revés. `/api/auth` excluye `login`/`refresh`/`logout` porque el
 * manifiesto los clasifica `global` (se resuelven ANTES de conocer el
 * gimnasio) — el filtro `categoria === "tenant-scoped"` de abajo ya los deja
 * afuera, no hace falta lógica extra acá.
 *
 * CÓMO SE SABE QUÉ RUTA CUBRE CADA CASO / POR QUÉ SE LEE EL FUENTE / POR QUÉ
 * SE BORRAN LOS COMENTARIOS ANTES DE BUSCAR / QUÉ HACER CUANDO SE CAIGA
 * ---------------------------------------------------------------------
 * Idéntico a `iso-03-cobertura-subs-sched.test.ts` (fase 174.1) y
 * `iso-03-cobertura-members.test.ts` (fase 173): el nombre del `describe`
 * ES el registro de cobertura (`"<prosa> — <MÉTODO> <url completa>"`), se
 * lee el fuente con `readFileSync` (importar los 6 archivos los EJECUTARÍA
 * contra MySQL), se borran los comentarios antes de buscar (los 6 archivos
 * listan sus rutas en el docblock de cabecera — `iso-03-referrals.test.ts`
 * incluso MENCIONA en prosa, dentro de su comentario, las claves de las 2
 * rutas ya cubiertas por members; sin el borrado de comentarios esas 2
 * menciones contarían como cobertura falsa de ESTE archivo) y
 * `describe.skip` / `.todo` NO cuentan como cobertura.
 *
 * CÓMO CORRERLO
 * -------------
 *   cd el-templo-api
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-cobertura-analytics-resto.test.ts
 *
 * Este gate NO toca la base: no manda un request, no construye el app y no
 * lee una fila. Solo lee texto.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

import { TENANT_MANIFEST } from "../tenant-manifest";

/**
 * Los OCHO prefijos de analytics + los 6 módulos restantes. Ninguno lleva
 * barra final — ver el docblock de arriba: la barra final es exactamente la
 * trampa que este criterio existe para no tener, y agregarla acá
 * reintroduciría el mismo modo de falla.
 *
 * `wellhub` NO tiene entrada acá — ver el docblock de arriba (D-05): su
 * única ruta es `global`, no `tenant-scoped`, así que no hay nada que un
 * noveno prefijo capturaría.
 */
const PREFIJO_ANALYTICS = "/api/admin/analytics";
const PREFIJO_CAMPAIGNS = "/api/campaigns";
const PREFIJO_NOTIFICATIONS = "/api/notifications";
const PREFIJO_ADMIN_REFERRALS = "/api/admin/referrals";
const PREFIJO_APP_REFERRALS = "/api/members/referrals";
const PREFIJO_ADMIN_IMPROVEMENT = "/api/admin/improvement-proposals";
const PREFIJO_APP_IMPROVEMENT = "/api/members/improvement-proposals";
const PREFIJO_AUTH = "/api/auth";
const PREFIJOS = [
  PREFIJO_ANALYTICS,
  PREFIJO_CAMPAIGNS,
  PREFIJO_NOTIFICATIONS,
  PREFIJO_ADMIN_REFERRALS,
  PREFIJO_APP_REFERRALS,
  PREFIJO_ADMIN_IMPROVEMENT,
  PREFIJO_APP_IMPROVEMENT,
  PREFIJO_AUTH,
] as const;

/**
 * El criterio de "es una ruta de estos módulos": el prefijo PELADO cuenta
 * (necesario HOY, no solo defensivo — ver el docblock de arriba:
 * `GET /api/admin/analytics` es el prefijo pelado), y cualquier cosa debajo
 * cuenta vía el segmento CON barra (para no matchear un futuro
 * `/api/admin/analytics-algo` que no sea de este módulo, o
 * `/api/admin/members/...` en el caso de `/api/admin/referrals` — ver la
 * trampa del docblock de arriba, verificado sin colisiones).
 */
function esRutaDelModulo(url: string): boolean {
  return PREFIJOS.some(
    (prefijo) => url === prefijo || url.startsWith(prefijo + "/"),
  );
}

/**
 * Rutas que un lector razonable esperaría en esta batería y que están AFUERA
 * a propósito, cada una con el motivo escrito.
 *
 * Las DOS entradas de acá son la trampa medida de este plan (175.1-06): las
 * rutas `GET`/`POST /api/admin/members/:userId/referrals` se LLAMAN
 * "referrals" y a un lector apurado le parecerían de este módulo, pero
 * matchean el prefijo `/api/admin/members` (fase 173, gate de members) y ya
 * tienen su caso de aislamiento + control positivo ahí — ver el docblock de
 * arriba para las líneas exactas. Si estuvieran acá SIN excepción, el
 * cuarto `it` de abajo ("las excepciones... siguen fuera de los 8
 * prefijos") no aplicaría (no matchean ninguno de los 8), así que en
 * realidad ni falta que estén listadas para que el gate pase — pero se
 * documentan explícitamente para que un lector futuro entienda POR QUÉ
 * `iso-03-referrals.test.ts` no las testea, sin tener que ir a leer el
 * docblock de ese archivo.
 */
export const EXCEPCIONES_NOMBRADAS: Readonly<Record<string, string>> = {
  "GET /api/admin/members/:userId/referrals":
    "Cubierta por iso-03-members-ficha.test.ts:490 (fase 173-27, describe " +
    "'referidos de la ficha'); vive bajo /api/admin/members, no bajo " +
    "/api/admin/referrals — ver D-06 de 175.1-CONTEXT.md.",
  "POST /api/admin/members/:userId/referrals":
    "Cubierta por iso-03-members-ficha.test.ts:692 (fase 173-27, describe " +
    "'asignar referidor'); vive bajo /api/admin/members, no bajo " +
    "/api/admin/referrals — ver D-06 de 175.1-CONTEXT.md.",
};

/**
 * Las rutas de los 8 prefijos que la batería tenía cubiertas cuando este
 * gate se escribió (2026-08-15, planes 175.1-02/03/04/05): **51**
 * (22 analytics + 10 campaigns + 8 notifications + 1 admin-referrals +
 * 2 app-referrals + 2 admin-improvement + 2 app-improvement + 4 auth).
 * `wellhub` aporta 0 — ver el docblock de arriba (D-05), no tiene prefijo.
 *
 * MOVER ESTE NÚMERO ES UNA DECISIÓN DE DISEÑO, NO UN AJUSTE.
 *
 *   - **Sube** cuando se agrega una ruta de alguno de los 8 prefijos CON su
 *     caso de aislamiento y su control positivo. Las dos mitades: la ruta
 *     sola deja rojo `faltantes`, el caso solo deja rojo `fantasmas`.
 *   - **Baja** SOLO cuando una ruta deja de existir en el API y su entrada
 *     sale del manifiesto. Bajarlo por cualquier otro motivo es sacarle
 *     superficie al gate del milestone: significa que hay menos rutas de
 *     ANALYTICS/CAMPAIGNS/NOTIFICATIONS/REFERRALS/IMPROVEMENT-PROPOSALS/AUTH
 *     probadas contra un segundo gimnasio que ayer — exactamente el
 *     retroceso que ISO-03 existe para impedir. Si estás por bajarlo para
 *     poner CI en verde, el rojo que estás tapando es el hallazgo.
 *
 * POR QUÉ EXISTE habiendo ya dos gates bidireccionales: los dos comparan dos
 * listas DERIVADAS, y si la derivación se rompiera —alguien mueve o
 * renombra un archivo de la batería, `readFileSync` devuelve otra cosa, el
 * regex de `describe` deja de matchear— las dos listas quedarían vacías
 * contra un manifiesto vacío y todo pasaría en verde por vacuidad. Este
 * conteo es lo que hace que 0 rutas cubiertas se ponga tan rojo como 51.
 */
const CASOS_BASELINE = 52;

/** Los seis archivos de la batería ISO-03 de analytics + resto del core. */
const ARCHIVOS_BATERIA = [
  "iso-03-analytics.test.ts", // plan 175.1-02 — 22 rutas
  "iso-03-campaigns.test.ts", // plan 175.1-03 — 11 rutas (+1 fase 180: POST /exchange)
  "iso-03-notifications.test.ts", // plan 175.1-04 — 8 rutas
  "iso-03-referrals.test.ts", // plan 175.1-05 — 3 rutas (2 más ya cubiertas por members, ver EXCEPCIONES_NOMBRADAS)
  "iso-03-improvement-proposals.test.ts", // plan 175.1-05 — 4 rutas
  "iso-03-auth.test.ts", // plan 175.1-05 — 4 rutas
] as const;

/**
 * Métodos HTTP que pueden abrir una clave del manifiesto. Union cerrada a
 * propósito: un regex con `\w+` tomaría por método cualquier palabra en
 * mayúsculas de la prosa del `describe`.
 */
const METODOS = "GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS";

/**
 * Borra comentarios de bloque y de línea completa. Ver el docblock de
 * arriba: sin esto el gate mediría los headers de los archivos (que listan
 * las 51 rutas, y en el caso de `iso-03-referrals.test.ts` TAMBIÉN mencionan
 * en prosa las 2 claves ya cubiertas por members) en vez de los tests.
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

/** Las rutas `tenant-scoped` de los 8 prefijos del módulo (la lista a cubrir). */
const RUTAS_ANALYTICS_RESTO: readonly string[] = Object.entries(TENANT_MANIFEST)
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

describe("cobertura de la batería ISO-03 de analytics+resto — contra el manifiesto real", () => {
  it("toda ruta tenant-scoped de los 8 prefijos tiene caso de aislamiento", () => {
    const escritos = new Set(CASOS_ESCRITOS);
    const faltantes = RUTAS_ANALYTICS_RESTO.filter(
      (ruta) => !escritos.has(ruta),
    );

    expect(
      faltantes,
      `Rutas de analytics/campaigns/notifications/referrals/improvement-proposals/auth ` +
        `del manifiesto que NO tienen caso en la batería ISO-03: ${faltantes.join(", ")}. ` +
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
        `EXCEPCIONES_NOMBRADAS —que es para rutas FUERA de los 8 prefijos y el ` +
        `cuarto test lo verifica—. ` +
        `POR QUÉ IMPORTA: ISO-03 es el requisito que el milestone usa como GATE ` +
        `para onboardear el segundo gimnasio. Una ruta de estos 6 módulos sin ` +
        `caso de aislamiento no la mira nadie —ni el sentinel, que solo ve ` +
        `queries, ni la revisión humana— hasta que un gimnasio lea o escriba ` +
        `un dato ajeno. Este test es la única razón por la que la batería no ` +
        `puede envejecer en silencio mientras las fases futuras agregan ` +
        `superficie.`,
    ).toEqual([]);
  });

  it("todo caso de la batería apunta a una ruta que existe en el manifiesto", () => {
    const analyticsResto = new Set(RUTAS_ANALYTICS_RESTO);
    const excepciones = new Set(Object.keys(EXCEPCIONES_NOMBRADAS));
    const fantasmas = CASOS_ESCRITOS.filter(
      (clave) => !analyticsResto.has(clave) && !excepciones.has(clave),
    );

    expect(
      fantasmas,
      `Casos de la batería cuyo describe nombra una ruta que NO existe entre ` +
        `las rutas de analytics/campaigns/notifications/referrals/improvement-proposals/auth ` +
        `del manifiesto: ${fantasmas.join(", ")}. Las causas son tres y todas ` +
        `importan: (1) un TYPO en la clave —y una clave con typo no cubre ` +
        `nada, deja la ruta real como faltante—, (2) un RENAME de la ruta que ` +
        `no se propagó al nombre del describe, (3) un caso que quedó ` +
        `cubriendo una ruta BORRADA. ` +
        `QUÉ HACER: corregí el nombre del describe si es (1) o (2) —copiá la ` +
        `clave tal cual de test/tenant-manifest.ts—; borrá el bloque entero si ` +
        `es (3), porque un caso contra una ruta que ya no existe es tiempo de ` +
        `CI comprando confianza falsa. ` +
        `POR QUÉ IMPORTA: sin este lado del gate, la batería acumularía casos ` +
        `muertos que dan sensación de cobertura sin cubrir nada, y el conteo de ` +
        `abajo seguiría cuadrando mientras una ruta real queda afuera.`,
    ).toEqual([]);
  });

  it("la batería cubre exactamente las 51 rutas de analytics+resto del baseline", () => {
    expect(
      RUTAS_ANALYTICS_RESTO.length,
      `El manifiesto tiene ${RUTAS_ANALYTICS_RESTO.length} rutas de ` +
        `analytics/campaigns/notifications/referrals/improvement-proposals/auth ` +
        `"tenant-scoped" y el baseline dice ${CASOS_BASELINE}. Ver el docblock ` +
        `de CASOS_BASELINE: sube cuando se agrega una ruta CON su caso, baja ` +
        `SOLO cuando una ruta deja de existir en el API. Si se movió sin ` +
        `ninguna de las dos cosas, alguien tocó el registro de rutas sin tocar ` +
        `la batería —o al revés—.`,
    ).toBe(CASOS_BASELINE);

    const cubiertas = CASOS_ESCRITOS.filter((clave) =>
      RUTAS_ANALYTICS_RESTO.includes(clave),
    );
    expect(
      cubiertas.length,
      `La batería declara ${cubiertas.length} rutas de analytics+resto ` +
        `cubiertas y el baseline dice ${CASOS_BASELINE}. Si este número es 0 ` +
        `—o mucho más chico de lo esperado— el problema NO es la cobertura: es ` +
        `la derivación. Alguien movió o renombró un archivo de la batería, o el ` +
        `regex de describe dejó de matchear, y los dos gates bidireccionales de ` +
        `arriba estarían comparando listas vacías en verde. Revisá ` +
        `ARCHIVOS_BATERIA y clavesDeLosDescribe antes que la batería.`,
    ).toBe(CASOS_BASELINE);

    // Cada archivo tiene que aportar: si uno queda en 0, la lectura de ESE
    // archivo se rompió y los otros cinco podrían tapar el agujero en el total.
    for (const { archivo, claves } of CASOS_POR_ARCHIVO) {
      expect(
        claves.length,
        `${archivo} no declaró ni una sola ruta en sus describe. O el archivo ` +
          `se vació, o se renombró, o sus describe perdieron la clave del ` +
          `manifiesto. Los seis archivos aportan (22 + 10 + 8 + 3 + 4 + 4 = ` +
          `${CASOS_BASELINE}), así que un 0 acá es una lectura rota, no una ` +
          `decisión.`,
      ).toBeGreaterThan(0);
    }
  });

  it("las excepciones nombradas siguen existiendo, siguen fuera de los 8 prefijos y siguen con su motivo", () => {
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
      `Excepciones que SÍ matchean alguno de los 8 prefijos del módulo ` +
        `(${PREFIJOS.join(", ")}): ${conPrefijoDelModulo.join(", ")}. ` +
        `EXCEPCIONES_NOMBRADAS existe para rutas que se LLAMAN referrals/etc. ` +
        `pero viven y se cubren bajo OTRO prefijo (el caso de members acá), NO ` +
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
 * No es paranoia teórica: los seis archivos de la batería abren con un
 * docblock que lista sus rutas en el formato exacto de la clave, y
 * `iso-03-referrals.test.ts` en particular MENCIONA en prosa, dentro de su
 * comentario, las 2 claves ya cubiertas por members (ver el docblock de
 * arriba). Si `sinComentarios()` dejara de funcionar, el gate seguiría en
 * verde con la batería VACÍA (o, peor, contando esas 2 menciones como
 * cobertura). Estos fixtures son lo único que lo delata.
 *
 * Mismo patrón que `iso-03-cobertura.test.ts` (fase 172),
 * `iso-03-cobertura-members.test.ts` (fase 173) y
 * `iso-03-cobertura-subs-sched.test.ts` (fase 174.1).
 */
describe("cobertura ISO-03 de analytics+resto — motor con fixtures sintéticos", () => {
  const RUTA_FIXTURE = "POST /api/campaigns/admin/fixture-175-1-06";

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
        `archivo: los seis archivos de la batería listan sus 51 rutas en sus ` +
        `headers (y uno de ellos, iso-03-referrals.test.ts, menciona 2 claves ` +
        `MÁS en prosa dentro de un comentario), así que un motor que no borre ` +
        `comentarios da el gate entero en verde aunque no exista un solo it.`,
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
        `seis archivos abren con un bloque de precondiciones que no cubre ` +
        `ninguna ruta, y tratarlo como fantasma llenaría el gate de ruido.`,
    ).toEqual([]);
  });
});
