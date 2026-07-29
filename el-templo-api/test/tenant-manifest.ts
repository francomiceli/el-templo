// Módulo: tenant-manifest — clasificación canónica "¿esta ruta ve datos de UN
//                           gimnasio?" (v6.0, fase 171, ISO-01)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------
// El aislamiento multi-tenant se construyó de abajo hacia arriba: la columna
// (fase 166/167), las uniques compuestas (168), los helpers de escritura (169)
// y el sentinel + lint (170). Falta el backstop de arriba: una ruta nueva que
// consulte una tabla gym-owned sin scope de gimnasio no la atrapa ninguna de
// esas capas si el autor simplemente no pensó en el tema.
//
// Este registro es la contrapartida por el eje "rutas" de lo que
// `src/db/tenant-tables.ts` es por el eje "tablas": una lista escrita a mano,
// versionada, que un gate cruza contra la realidad. El gate es
// `test/tenancy/iso-01-manifiesto.test.ts` y es fail-closed en las dos
// direcciones: una ruta registrada sin entrada acá deja la suite en rojo
// nombrándola, y una entrada que ya no corresponde a ninguna ruta registrada
// (typo, rename, ruta borrada) también.
//
// DE DÓNDE SALE LA LISTA
// ----------------------
// De un volcado one-shot del hook `onRoute` de Fastify sobre `buildApp()`,
// hecho una sola vez al construir la fase 171 (el seam es `BuildAppOptions` en
// `src/app.ts`). Siguiendo D-16 de la fase 170: **no se commitea ningún
// regenerador**. Refrescar la lista con un script convertiría la clasificación
// en un trámite ("correr el script y commitear el diff") en vez de una decisión
// por ruta, que es exactamente lo que este archivo compra. Toda ruta nueva
// agrega su línea a mano, y esa edición ES la decisión consciente.
//
// POR QUÉ NO HAY COMODINES
// ------------------------
// D-01: entradas explícitas por ruta exacta (método + path), sin reglas por
// prefijo. Una regla comodín del estilo "todo `/api/admin/*` es tenant-scoped"
// clasificaría automáticamente rutas que todavía no existen, y con eso vaciaría
// el criterio 2 del ROADMAP de la fase 171 (una ruta nueva sin clasificar tiene
// que romper CI). Por eso el registro es un `Record` de clave exacta y no hay,
// en todo este archivo, ningún matching por prefijo.
//
// POR QUÉ EL MOTIVO ES OBLIGATORIO EN global
// ------------------------------------------
// D-02: `global` es la categoría peligrosa — es la que dice "esta ruta ve datos
// de todos los gimnasios y está bien". Sin motivo escrito, en un año nadie
// puede auditar si esa decisión fue deliberada o un descuido, y la categoría se
// vuelve la alfombra debajo de la cual barrer rutas que no se quiso pensar. Es
// el mismo espíritu de las exenciones `/* tenant-safe: <motivo> */` del lint de
// la 170 y de `TENANT_GLOBAL_UNIQUES` en `src/db/tenant-tables.ts`. El motivo
// se valida en runtime (`compararManifiesto` → `sinMotivo`): vacío o con un
// marcador de trabajo pendiente cuenta como ausente.
// Las `tenant-scoped` no llevan anotación: son el default masivo, y equivocarse
// hacia tenant-scoped sobra protección en vez de faltar.
//
// POR QUÉ templo-module SE ETIQUETA HOY
// -------------------------------------
// D-07: los features exclusivos de El Templo (SPOM, gladius, academy,
// tree-editor…) se marcan `templo-module` ya en esta fase aunque el enforcement
// `requireModule` llegue recién en la fase 176 — esa fase va a LEER esta
// etiqueta, no a re-decidirla. La decisión consciente se toma una sola vez, con
// revisión humana de la lista corta, y de paso las fases 172-175 no arrastran
// esas rutas a la batería de aislamiento sin necesidad. Toda entrada
// `templo-module` declara CUÁL módulo (`sinModulo` lo valida en runtime).
//
// QUÉ NO ES ESTE ARCHIVO
// ----------------------
// No es runtime de producción: nada en `src/` lo importa ni puede importarlo.
// Vive en `test/` a propósito, y por eso el lint de tenancy de la fase 170 —que
// solo mira `src/`— no lo analiza. Tampoco tiene dependencias: es TypeScript
// puro sin un solo import, lo que permite typechequearlo suelto con `tsc`
// (`tsconfig.json` incluye solo `src/**`, así que CI no typechequea `test/` —
// esa es la única red que tiene, junto con las validaciones de forma que el
// gate corre en runtime).

/** Las tres categorías posibles. No hay una cuarta, y agregarla es una decisión de diseño. */
const CATEGORIAS = ["tenant-scoped", "global", "templo-module"] as const;

/**
 * - `tenant-scoped`: la ruta lee o escribe datos de UN gimnasio. Es el default
 *   masivo y no lleva anotación.
 * - `global`: la ruta es genuinamente transversal a todos los gimnasios (o
 *   pre-scope: resuelve el tenant recién a partir de lo que encuentra). Lleva
 *   `motivo` obligatorio (D-02).
 * - `templo-module`: la ruta pertenece a un feature exclusivo de El Templo.
 *   Lleva `modulo` obligatorio (D-07).
 */
export type Categoria = (typeof CATEGORIAS)[number];

/** Módulos Templo del doc `.docs/saas-multitenancy/04-mecanismo-modulos.md`. */
const MODULOS_TEMPLO = [
  "templo-training",
  "templo-gamification",
  "templo-marketing",
  "templo-onboarding",
] as const;

export type ModuloTemplo = (typeof MODULOS_TEMPLO)[number];

export interface EntradaManifiesto {
  categoria: Categoria;
  /**
   * D-02: OBLIGATORIO y no vacío cuando `categoria === "global"`. Oración
   * completa que nombra la causa concreta ("el webhook se procesa antes de
   * saber a qué gimnasio pertenece"), no una etiqueta ("es global"). Un
   * "TODO" o un "pendiente" cuentan como ausente.
   */
  motivo?: string;
  /**
   * D-07: OBLIGATORIO cuando `categoria === "templo-module"`. Es la etiqueta
   * que la fase 176 va a leer para exigir `requireModule` en la ruta.
   */
  modulo?: ModuloTemplo;
}

/**
 * El manifiesto. La clave es `` `${MÉTODO} ${url}` `` con la url tal cual la
 * reporta el hook `onRoute` (ya viene con el prefijo compuesto del plugin).
 *
 * ARRANCA VACÍO A PROPÓSITO. Las ~370 entradas de las rutas registradas hoy las
 * escribe el plan 171-02, después de que el contrato de este archivo esté
 * cerrado — así se clasifican contra una forma ya definida (categoría, motivo,
 * módulo) y no al revés. Mientras esté vacío el gate del plan 171-03 reporta
 * las 370 como `faltantes`, que es el comportamiento correcto de un registro
 * fail-closed sin poblar.
 *
 * El precedente de "el registro existe aunque esté vacío" es `JOBS_EXENTOS` de
 * `test/tenancy/con-04-crons-per-tenant.test.ts`: el mapa existe para que la
 * única forma de eximir algo sea escribir por qué.
 */
export const TENANT_MANIFEST: Record<string, EntradaManifiesto> = {};

/**
 * Claves de ruta de UN evento `onRoute`.
 *
 * Fastify dispara un solo evento para `app.route({ method: ["POST", "PUT"] })`,
 * con `method` como array. Expandirlo es obligatorio: una ruta declarada con
 * dos métodos son dos entradas del manifiesto, porque son dos decisiones
 * distintas (el GET de un recurso puede ser global y su PUT no).
 *
 * Acepta `string | readonly string[]` porque eso es literalmente lo que trae
 * `RouteOptions["method"]` en runtime.
 */
export function clavesDeEvento(
  metodo: string | readonly string[],
  url: string,
): string[] {
  const metodos = typeof metodo === "string" ? [metodo] : metodo;
  return metodos.map((m) => `${m.trim().toUpperCase()} ${url}`);
}

/** Resultado de `particionarObservadas`. */
export interface Particion {
  /** Claves que van al manifiesto (todo lo que no es HEAD), únicas y ordenadas. */
  rutas: string[];
  /** HEAD que NO se explican por un GET hermano. Deben ser cero. */
  headHuerfanos: string[];
}

/**
 * Separa los `HEAD` del resto y, de paso, deja evidencia de que ninguno se
 * descartó a ciegas.
 *
 * POR QUÉ EL FILTRO NO ES COSMÉTICO
 * ---------------------------------
 * Fastify 5 trae `exposeHeadRoutes: true` por default: por cada `GET` dispara
 * también un evento `HEAD` sintético (199 de los 569 eventos del app real).
 * Meterlos al manifiesto sería duplicar cada decisión sin agregar información.
 *
 * Pero filtrar `HEAD` a secas sería el anti-patrón: si mañana alguien declara
 * un `HEAD` A MANO —una ruta real, con su handler y su acceso a datos— el
 * filtro ciego la dejaría fuera del backstop en silencio, que es exactamente lo
 * que este archivo existe para impedir. Por eso los HEAD sin `GET` hermano
 * salen por `headHuerfanos` y el gate los pone en rojo.
 *
 * POR QUÉ SE COMPARA TAMBIÉN SIN LA BARRA FINAL
 * ---------------------------------------------
 * Una ruta declarada en `"/"` dentro de un plugin con prefijo dispara un tercer
 * evento fantasma, `HEAD <prefijo>/` con barra final, que no tiene `GET`
 * hermano con esa url exacta (son 7 en el app real). Se resuelve comparando el
 * HEAD contra el set de GET con y sin barra final.
 *
 * Lo que NO se hace es normalizar la barra final de TODAS las urls:
 * `ignoreTrailingSlash` está en su default `false`, o sea que
 * `/api/admin/analytics` y `/api/admin/analytics/` son rutas DISTINTAS para
 * find-my-way. Colapsarlas escondería una ruta real detrás de otra.
 */
export function particionarObservadas(claves: readonly string[]): Particion {
  const heads: string[] = [];
  const rutas = new Set<string>();
  const urlsGet = new Set<string>();

  for (const clave of claves) {
    const corte = clave.indexOf(" ");
    const metodo = corte === -1 ? clave : clave.slice(0, corte);
    const url = corte === -1 ? "" : clave.slice(corte + 1);

    if (metodo === "HEAD") {
      heads.push(clave);
      continue;
    }
    rutas.add(clave);
    if (metodo === "GET") urlsGet.add(url);
  }

  const headHuerfanos = new Set(
    heads.filter((clave) => {
      const url = clave.slice(clave.indexOf(" ") + 1);
      return !urlsGet.has(url) && !urlsGet.has(url.replace(/\/$/, ""));
    }),
  );

  return {
    rutas: Array.from(rutas).sort(),
    headHuerfanos: Array.from(headHuerfanos).sort(),
  };
}

/** Las cinco formas en que el manifiesto y la realidad pueden discrepar. */
export interface Discrepancias {
  /** Observadas en runtime que no tienen entrada. Una ruta nueva sin clasificar cae acá. */
  faltantes: string[];
  /** Entradas que ya no corresponden a ninguna ruta registrada (typo, rename, ruta borrada). */
  fantasmas: string[];
  /** Entradas `global` sin motivo utilizable (D-02). */
  sinMotivo: string[];
  /** Entradas `templo-module` sin módulo declarado o con uno inválido (D-07). */
  sinModulo: string[];
  /** Entradas con una `categoria` fuera de las tres. Solo pasa porque nadie typechequea `test/`. */
  categoriaInvalida: string[];
}

/** Marcadores que convierten un motivo escrito en un motivo inservible. */
const MARCADORES_PENDIENTE = /\b(TODO|FIXME|TBD|XXX)\b|pendiente/i;

const CATEGORIAS_VALIDAS: ReadonlySet<string> = new Set(CATEGORIAS);
const MODULOS_VALIDOS: ReadonlySet<string> = new Set(MODULOS_TEMPLO);

/**
 * Compara lo observado en runtime contra el manifiesto y devuelve las cinco
 * listas de discrepancias, cada una única y ordenada.
 *
 * ES UNA FUNCIÓN PURA Y EL MANIFIESTO ES UN PARÁMETRO
 * ---------------------------------------------------
 * El segundo parámetro tiene default, pero existe: NO borrarlo ni volverlo
 * obligatorio. Es lo que permite que el gate del plan 171-03 demuestre el
 * criterio 2 del ROADMAP ("una ruta nueva sin clasificar rompe CI") con
 * fixtures sintéticos —una lista de rutas inventada, un manifiesto inventado—
 * en vez de asumirlo. El precedente es `lintTenantSources` de la fase 170, que
 * `con-06` invoca dos veces: una sobre fixtures y otra sobre el repo real.
 *
 * `observadas` se espera SIN los HEAD (ver `particionarObservadas`), y se
 * declara `readonly string[]` y no un tipo literal de las claves porque las
 * claves salen de `onRoute` en runtime, no del compilador.
 */
export function compararManifiesto(
  observadas: readonly string[],
  manifiesto: Readonly<Record<string, EntradaManifiesto>> = TENANT_MANIFEST,
): Discrepancias {
  const observadasSet = new Set(observadas);
  const clavesManifiesto = Object.keys(manifiesto);

  const faltantes = new Set(
    Array.from(observadasSet).filter((clave) => !(clave in manifiesto)),
  );
  const fantasmas = new Set(
    clavesManifiesto.filter((clave) => !observadasSet.has(clave)),
  );

  const sinMotivo: string[] = [];
  const sinModulo: string[] = [];
  const categoriaInvalida: string[] = [];

  for (const clave of clavesManifiesto) {
    const entrada: EntradaManifiesto | undefined = manifiesto[clave];
    if (!entrada) continue;

    const categoria: string = entrada.categoria;
    if (!CATEGORIAS_VALIDAS.has(categoria)) {
      // Categoría inválida y listo: no tiene sentido exigirle motivo o módulo
      // a una entrada cuya categoría no se entiende.
      categoriaInvalida.push(clave);
      continue;
    }

    if (categoria === "global") {
      const motivo = entrada.motivo;
      const utilizable =
        typeof motivo === "string" &&
        motivo.trim().length > 0 &&
        !MARCADORES_PENDIENTE.test(motivo);
      if (!utilizable) sinMotivo.push(clave);
    }

    if (categoria === "templo-module") {
      const modulo: string | undefined = entrada.modulo;
      if (modulo === undefined || !MODULOS_VALIDOS.has(modulo)) {
        sinModulo.push(clave);
      }
    }
  }

  return {
    faltantes: Array.from(faltantes).sort(),
    fantasmas: Array.from(fantasmas).sort(),
    sinMotivo: Array.from(new Set(sinMotivo)).sort(),
    sinModulo: Array.from(new Set(sinModulo)).sort(),
    categoriaInvalida: Array.from(new Set(categoriaInvalida)).sort(),
  };
}
