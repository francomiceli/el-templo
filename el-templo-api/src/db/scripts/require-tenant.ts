/**
 * CON-04 (fase 169, D-06/D-07) — `--tenant=<id>` obligatorio para los scripts
 * CLI que escriben tablas gym-owned.
 *
 * QUÉ RESUELVE
 * ------------
 * Es la última superficie sin request del milestone. Una ruta tiene
 * `attachScope`, un cron tiene `forEachActiveTenant` y el webhook deriva su
 * gimnasio de nuestra propia DB; un script corrido a mano no tiene NADA. Hasta
 * esta fase, `scripts/seed-onboarding-aura.ts` escribía `aura_config` cayendo en
 * el `DEFAULT 1` de la columna sin declararlo: con dos gimnasios, ese script
 * escribe en el equivocado sin decir una palabra (T-169-32).
 *
 * La regla de D-06 es entonces: **todo script que ESCRIBA una tabla gym-owned
 * exige `--tenant=<id>` o aborta antes de tocar la base**. `requireTenant` hace
 * las dos cosas que el operador no puede garantizar solo:
 *   1. Parsea el flag y corta con exit code **2** si falta o es inválido.
 *   2. Verifica CONTRA LA DB que ese gimnasio exista, así un typo en el id corta
 *      antes de escribir nada en vez de escribir en el gimnasio de otro
 *      (T-169-33).
 *
 * CÓDIGOS DE SALIDA (convención ya establecida en el repo)
 * --------------------------------------------------------
 * `verify-tenant-uniques.ts` fijó: **0** OK, **1** discrepancias o fallo de
 * datos, **2** error de conexión o de USO. La falta de `--tenant` y un tenant
 * inexistente son errores de uso → **2**, nunca 1. Un script que abortara con 1
 * se confundiría con "corrió y encontró problemas".
 *
 * POR QUÉ NO EXIGE `status = 'active'` (D-07)
 * -------------------------------------------
 * Contrato DELIBERADAMENTE distinto al de los crons y al del webhook, que sí
 * filtran sólo gimnasios activos (D-01, D-05). El CLI es tooling de OPERADOR: un
 * gimnasio suspendido por falta de pago o archivado sigue necesitando exports,
 * limpiezas y correcciones puntuales, y bloquearlas dejaría al operador sin
 * herramientas justo cuando más las necesita (T-169-35, aceptado). Por eso acá
 * un gimnasio no activo AVISA por stderr y sigue. Que nadie "unifique" esto
 * después con el criterio de los crons: la diferencia es la decisión, no un
 * olvido.
 *
 * SCRIPTS EXENTOS — la anotación que va a leer la fase 170
 * --------------------------------------------------------
 * Un script sin `--tenant` es indistinguible de un olvido, así que la exención
 * se escribe en el archivo como un comentario de bloque con el texto grepeable
 * `tenant-safe: <motivo>`
 * (motivo OBLIGATORIO, nunca la anotación pelada — T-169-36). El sentinel y el
 * lint de CI de la **fase 170** son los que van a leer estas anotaciones; la 169
 * las siembra. Los seis exentos de hoy y su motivo:
 *
 *   - `src/db/run-migrations.ts` .................. herramienta de plataforma:
 *       aplica DDL a la base entera, no escribe filas de negocio.
 *   - `src/db/scripts/verify-tenant-backfill.ts` .. verificador de plataforma:
 *       escanea TODOS los tenants por diseño, corre en CI/deploy, sólo lectura.
 *   - `src/db/scripts/verify-tenant-uniques.ts` ... ídem.
 *   - `src/db/seed.ts` ............................ provisioning local/de test:
 *       construye la base desde cero, incluido el tenant 1.
 *   - `src/db/seed-spom.ts` ....................... ídem.
 *   - `scripts/wellhub-sandbox.ts` ................ no toca la DB: postea al
 *       webhook local, que resuelve el tenant por su propio camino (fase 169).
 *
 * CÓMO SE USA EN UN SCRIPT
 * ------------------------
 * ```ts
 * const { db, connection } = await createSingleConnection();
 * const ctx = await requireTenant(queryFnFromConnection(connection));
 * // ...recién ahora, cualquier query:
 * await db.insert(tabla).values(tenantValues(ctx, { ... }));
 * ...
 * main().catch((err: unknown) => failTenantArg(err, "mi-script"));
 * ```
 *
 * `console.*` está permitido acá: esto es tooling de línea de comandos, no el
 * runtime de Fastify ni un frontend (precedente `verify-tenant-uniques.ts`).
 *
 * QUÉ NO HACE
 * -----------
 * No verifica CONTRA QUÉ BASE se está corriendo. Staging y producción comparten
 * el mismo host MySQL, así que un script apuntado a la base equivocada escribe
 * en producción (T-169-37, fuera del alcance de la fase). Los scripts cargan su
 * env por `NODE_ENV` igual que `run-migrations.ts`; quien agregue un script de
 * ESCRITURA nuevo debería copiar además el guard `SELECT DATABASE()` de
 * `verify-tenant-uniques.ts`.
 */

import type { Connection } from "mysql2/promise";
import type { TenantContext } from "../../modules/shared/tenant";

const FLAG = "--tenant";
const USO = `Uso: --tenant=<id>  (o --tenant <id>), donde <id> es el id de una fila de \`tenants\`.`;

/**
 * Capa de acceso a datos que `requireTenant` necesita: una sola función que
 * ejecuta un statement parametrizado y devuelve filas planas.
 *
 * Es el mismo idioma de `QueryFn` que ya usa `verify-tenant-uniques.ts`, y
 * existe por la misma razón: hace testeable toda la lógica de validación sin
 * abrir una conexión a MySQL.
 */
export type TenantQueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<Array<Record<string, unknown>>>;

/**
 * Error de USO del script — el que sale con código 2.
 *
 * Distinto de un error de datos (1) y de un fallo inesperado (1): que el
 * operador se haya olvidado del flag, o haya escrito un id que no existe, no es
 * un problema de la base.
 */
export class TenantArgError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "TenantArgError";
  }
}

/**
 * Adapta una `Connection` de `mysql2/promise` a {@link TenantQueryFn}.
 *
 * `createSingleConnection()` (`src/db/index.ts`) devuelve exactamente esa
 * `connection` junto al `db` de Drizzle, así que el llamador no tiene que
 * cambiar nada de lo que ya hace.
 */
export function queryFnFromConnection(connection: Connection): TenantQueryFn {
  return async (sql, params) => {
    const [rows] = await connection.query(sql, params);
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  };
}

/**
 * Extrae el id de gimnasio de `argv`. Acepta `--tenant=<id>` y `--tenant <id>`.
 *
 * @throws {TenantArgError} si el flag falta, viene sin valor, no es un número,
 *   no es entero o no es positivo. `tenants.id` es un autoincrement, así que 0 y
 *   los negativos se rechazan acá y ni siquiera llegan a consultar la DB.
 */
export function parseTenantArg(argv: string[]): number {
  let crudo: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === FLAG) {
      crudo = argv[i + 1];
      break;
    }
    if (arg.startsWith(`${FLAG}=`)) {
      crudo = arg.slice(FLAG.length + 1);
      break;
    }
  }

  if (crudo === undefined || crudo.trim() === "") {
    throw new TenantArgError(
      `Falta el gimnasio: este script escribe tablas gym-owned y no adivina en cuál. ${USO}`,
    );
  }

  const valor = Number(crudo);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new TenantArgError(
      `\`${crudo}\` no es un id de gimnasio válido (se espera un entero positivo). ${USO}`,
    );
  }

  return valor;
}

/**
 * Parsea `--tenant`, verifica contra la DB que ese gimnasio exista y devuelve el
 * {@link TenantContext} con el que el script tiene que escribir.
 *
 * Llamarlo ANTES de cualquier query de escritura: su razón de ser es cortar
 * mientras cortar todavía no cuesta nada.
 *
 * Un gimnasio cuyo `status` no sea `active` NO corta (D-07): avisa por stderr y
 * devuelve el contexto igual. Ver el docblock de cabecera para el porqué.
 *
 * @param query capa de datos — típicamente `queryFnFromConnection(connection)`.
 * @param argv por defecto, los argumentos reales del proceso.
 * @throws {TenantArgError} por flag ausente/inválido o gimnasio inexistente.
 */
export async function requireTenant(
  query: TenantQueryFn,
  argv: string[] = process.argv.slice(2),
): Promise<TenantContext> {
  const tenantId = parseTenantArg(argv);

  // Parametrizado a propósito (T-169-34): el id es entrada de línea de comandos
  // y nunca se interpola en el string del statement.
  const filas = await query("SELECT id, status FROM tenants WHERE id = ?", [
    tenantId,
  ]);

  const fila = filas[0];
  if (fila === undefined) {
    throw new TenantArgError(
      `No existe ningún gimnasio con id ${tenantId}. Verificá el id contra la tabla \`tenants\` de ESTA base antes de reintentar.`,
    );
  }

  const estado = typeof fila.status === "string" ? fila.status : "desconocido";
  if (estado !== "active") {
    // Comparación POSITIVA contra 'active' y no contra la lista de estados
    // malos, para que un estado futuro del enum también dispare el aviso.
    console.warn(
      `AVISO: el gimnasio ${tenantId} está en estado '${estado}', no 'active'. El script continúa a propósito (D-07: el CLI es tooling de operador), pero confirmá que querías escribir en un gimnasio no activo.`,
    );
  }

  return { tenantId };
}

/**
 * Cierre estándar del `main().catch(...)` de un script que usa este helper.
 *
 * Imprime a stderr con el nombre del script y sale con **2** para un
 * {@link TenantArgError} (error de uso) y con **1** para cualquier otro error.
 */
export function failTenantArg(err: unknown, scriptName: string): never {
  const mensaje = err instanceof Error ? err.message : String(err);
  console.error(`${scriptName} fallo: ${mensaje}`);
  process.exit(err instanceof TenantArgError ? err.exitCode : 1);
}
