/**
 * TvPairingService — vinculacion de un televisor (patron device-code, RFC 8628).
 *
 * Fase 164. El TV no tiene teclado ni credenciales: arranca pidiendo un par
 * (`user_code` publico / `device_code` secreto), muestra el `user_code` en
 * pantalla y pollea hasta que alguien del staff lo reclama desde el admin.
 *
 * POR QUE DOS CODIGOS (Pattern 2 / Pitfall 10). D-02 fija un `user_code` que NO
 * expira: un TV colgado en la pared puede quedar dias mostrandolo. Un codigo
 * eterno de 6 chars, con un repo que no tiene rate limiting, seria fuerza-brutable
 * — pero solo importa si ese codigo alcanza para retirar el token. No alcanza:
 * `consume()` pide el `device_code` de 256 bits que solo conoce el TV. Adivinar
 * lo que se ve en la pantalla no entrega absolutamente nada.
 *
 * SECRETOS. Ni el `device_code` ni el token del dispositivo se persisten en
 * claro: se guarda su sha256 hex y se re-deriva en cada lookup. Mismo patron
 * auditado en la fase 116 (`refresh-token-service.ts`). El plaintext se devuelve
 * exactamente UNA vez y NUNCA se loguea (T-164-14).
 *
 * TOCTOU. Tanto el claim como el consumo son un unico `UPDATE ... WHERE <campo>
 * IS NULL` con chequeo de `affectedRows` — jamas un `SELECT` seguido de un
 * `UPDATE`. Dos profes tipeando el mismo codigo a la vez, o dos polls del TV que
 * se pisan, no pueden emitir dos tokens (T-164-10).
 *
 * LOGS. Todo camino invalido va a `log.warn` y a ningun nivel mas alto: un TV
 * mal configurado pollea cada 3 s y llenaria Sentry en una tarde.
 *
 * DI por constructor (convencion fase 56).
 *
 * TENANCY (fase 169, CON-04). Este archivo tiene los tres unicos puntos de
 * escritura del pairing y cada uno recibe un tratamiento DISTINTO, a proposito:
 *
 *   - `start()`  → EXENTO y anotado. La fila nace antes de que exista un dueño.
 *   - `claim()`  → ESTAMPA el gimnasio del scope del STAFF que reclama.
 *   - `consume()`→ ESTAMPA `tv_devices` con el gimnasio de la fila ya reclamada.
 *
 * Es la unica excepcion legitima de todo el milestone v6.0, y esta escrita
 * arriba de cada metodo con su motivo para que el sentinel de la fase 170 no la
 * confunda con un olvido.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createHash, randomBytes, randomInt } from "node:crypto";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
import { tenantValues, type TenantContext } from "../shared/tenant";
import { TV_USER_CODE_ALPHABET, TV_USER_CODE_LENGTH } from "./schemas";

/** Intentos maximos ante colision del UNIQUE de `user_code`. */
const MAX_CODE_ATTEMPTS = 5;

/** Resultado del poll del TV sobre su propio pairing. */
export type TvPairingStatus =
  | { status: "pending" }
  | { status: "paired"; deviceToken: string; branchName: string }
  | { status: "consumed" }
  | { status: "unknown" };

/**
 * True si el error (o su causa) es un choque de UNIQUE de MySQL.
 *
 * Drizzle envuelve el error de mysql2: el `message` externo es solo
 * "Failed query: insert into ..." y el `ER_DUP_ENTRY` real vive en `cause`
 * (mismo hallazgo que el test de schema del plan 164-01).
 */
function isDuplicateEntry(err: unknown): boolean {
  const codeOf = (e: unknown): string | null =>
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : null;
  if (codeOf(err) === "ER_DUP_ENTRY") return true;
  const cause = err instanceof Error ? err.cause : undefined;
  return codeOf(cause) === "ER_DUP_ENTRY";
}

export class TvPairingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /** sha256 hex. Ni el device_code ni el token se persisten en claro. */
  private hash(plain: string): string {
    return createHash("sha256").update(plain).digest("hex");
  }

  /** Secreto opaco de 256 bits, url-safe (device_code y device token). */
  private generateSecret(): string {
    return randomBytes(32).toString("base64url");
  }

  /**
   * `user_code` de 6 chars con CSPRNG.
   *
   * `randomInt` de node:crypto, jamas el PRNG de `Math` (V6): ese generador no
   * es criptografico y su estado interno es recuperable observando unas pocas
   * salidas — con codigos que no expiran (D-02) eso convertiria el espacio de
   * 1e9 en algo predecible.
   */
  private generateUserCode(): string {
    let code = "";
    for (let i = 0; i < TV_USER_CODE_LENGTH; i++) {
      code += TV_USER_CODE_ALPHABET[randomInt(TV_USER_CODE_ALPHABET.length)];
    }
    return code;
  }

  /**
   * Arranca un pairing. Devuelve el par en claro UNA sola vez: el TV muestra el
   * `userCode` en pantalla y guarda el `deviceCode` en localStorage.
   *
   * Reintenta ante colision del UNIQUE (el espacio es de 1.07e9, asi que en la
   * practica no ocurre; el retry existe para no romperle la pantalla a una sede
   * por un choque cosmico).
   *
   * EXENCION DE TENANCY (fase 169, CON-04) — `tenant-safe: pairing pre-claim`
   * ------------------------------------------------------------------------
   * Este INSERT es la UNICA escritura sobre una tabla gym-owned que la fase 169
   * deja deliberadamente sin estampar el gimnasio, y no es un olvido: la fila
   * nace ANTES de que se sepa de quien es el televisor. El TV arranca sin
   * credenciales y sin sede (`branch_id` es nulo hasta el claim, D-01), asi que
   * no hay ningun scope del cual sacar el dueño. Estampar algo aca seria
   * INVENTARLO, y un dueño inventado es peor que la columna en su DEFAULT: el
   * claim lo pisa con el gimnasio real un instante despues.
   *
   * Consecuencia permanente: los dos codigos de la fila (`user_code` y
   * `device_code_hash`) quedan UNIQUE GLOBALES para siempre, porque el claim y
   * el poll tienen que resolverlos SIN scope. Los motivos formales estan
   * registrados en `TENANT_GLOBAL_UNIQUES` (`src/db/tenant-tables.ts:249-252`,
   * lista M8 aprobada) — no se repiten aca para que exista una sola fuente.
   *
   * La ventana sin dueño la cierran `claim()` (que estampa) y el `consume()`
   * (que propaga a `tv_devices`). Ver los docblocks de esos dos metodos.
   */
  async start(): Promise<{ userCode: string; deviceCode: string }> {
    const deviceCode = this.generateSecret();
    const deviceCodeHash = this.hash(deviceCode);

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const userCode = this.generateUserCode();
      try {
        await this.db
          .insert(schema.tvPairings) /* tenant-safe: pairing pre-claim */
          .values({ userCode, deviceCodeHash });
        return { userCode, deviceCode };
      } catch (err: unknown) {
        if (!isDuplicateEntry(err) || attempt === MAX_CODE_ATTEMPTS) throw err;
        // Sin el codigo en el log: es publico, pero no hace falta almacenarlo.
        this.log.warn(
          { attempt },
          "TV pairing: colision de user_code, regenerando",
        );
      }
    }
    // Inalcanzable: el loop retorna o relanza. Satisface el control flow de TS.
    throw new Error("TV pairing: no se pudo generar un user_code");
  }

  /**
   * El staff reclama un pairing y le asigna la sede (D-01: la sede la decide
   * quien reclama, no el TV).
   *
   * Un UNICO `UPDATE ... WHERE user_code = ? AND claimed_at IS NULL`: si dos
   * personas mandan el mismo codigo a la vez, MySQL le da la fila a una sola y
   * la otra ve `affectedRows = 0` (T-164-10). El `SELECT` posterior corre SOLO
   * para elegir el mensaje de error (404 vs 409), nunca para decidir el update.
   *
   * TENANCY (fase 169, CON-04). Este es el momento exacto en que el sistema
   * APRENDE de quien es el televisor, asi que aca se cierra la exencion de
   * `start()`: el `.set()` pasa por `tenantValues` y estampa el gimnasio del
   * scope del STAFF que reclama. El `ctx` va PRIMERO en la firma a proposito —
   * agregarlo al final habria dejado que un call site viejo compilara con los
   * argumentos corridos; asi, `tsc` obliga a mirar cada uno.
   *
   * De donde sale el gimnasio: de `assertTenant(request.scope, …)` en
   * `control-routes.ts`, nunca del body (regla dura del milestone). El
   * `requireBranchAccess({ from: "body.branchId" })` de esa misma ruta ya
   * garantizo, ANTES de llegar aca, que la sede elegida esta dentro del scope
   * de quien reclama. El invariante `user.tenant_id === branch.tenant_id` lo
   * enforcea la fase 173 (ADO-07).
   */
  async claim(
    ctx: TenantContext,
    userCode: string,
    branchId: number,
    claimedBy: number,
    name?: string,
  ): Promise<void> {
    const result = await this.db
      .update(schema.tvPairings)
      .set(
        tenantValues(ctx, {
          claimedAt: new Date(),
          claimedBy,
          branchId,
          deviceName: name ?? null,
        }),
      )
      // OJO: el WHERE NO lleva `tenantWhere` y no debe llevarlo nunca. El
      // `user_code` es GLOBAL por diseño (mina M7) y el claim es justamente la
      // operacion que DESCUBRE el tenant: filtrar por un gimnasio que la fila
      // todavia no declara dejaria el pairing imposible de reclamar. "Falta el
      // filtro de tenant" es, en este unico WHERE, la respuesta correcta.
      .where(
        and(
          eq(schema.tvPairings.userCode, userCode),
          isNull(schema.tvPairings.claimedAt),
        ),
      );

    if (result[0].affectedRows > 0) return;

    const [existing] = await this.db
      .select({ id: schema.tvPairings.id })
      .from(schema.tvPairings)
      .where(eq(schema.tvPairings.userCode, userCode))
      .limit(1);

    if (!existing) {
      this.log.warn(
        { claimedBy },
        "TV pairing: claim de un user_code inexistente",
      );
      throw new NotFoundError(
        "Ese código no existe. Revisá la pantalla del TV.",
      );
    }

    this.log.warn(
      { claimedBy },
      "TV pairing: claim de un user_code ya reclamado",
    );
    throw new ConflictError(
      "Ese código ya fue usado. Reiniciá el TV para generar uno nuevo.",
    );
  }

  /**
   * Poll del TV con su `device_code` secreto.
   *
   * Es el unico momento en que se emite el token del dispositivo, y se emite
   * exactamente una vez: el `UPDATE ... WHERE device_id IS NULL` sella el
   * pairing. Si dos polls se pisan, el perdedor borra el device que acababa de
   * crear y ve `consumed` — nunca dos tokens vivos para un mismo pairing.
   *
   * TENANCY (fase 169, CON-04). `tv_devices` tambien es gym-owned, y este
   * INSERT no tiene scope de request: el televisor pollea SIN sesion. El
   * gimnasio sale entonces de la fila de pairing YA RECLAMADA —el `claim()` lo
   * estampo con el scope del staff— y no de un DEFAULT ni de nada que mande el
   * TV. Por eso el `select` de abajo trae `tenantId`.
   */
  async consume(deviceCode: string): Promise<TvPairingStatus> {
    const [pairing] = await this.db
      .select({
        id: schema.tvPairings.id,
        // Fase 169: el dueño del dispositivo que se va a crear. `tenant_id` es
        // NOT NULL desde la 167, asi que llega `number` y no necesita narrowing.
        tenantId: schema.tvPairings.tenantId,
        branchId: schema.tvPairings.branchId,
        deviceName: schema.tvPairings.deviceName,
        claimedAt: schema.tvPairings.claimedAt,
        claimedBy: schema.tvPairings.claimedBy,
        deviceId: schema.tvPairings.deviceId,
      })
      .from(schema.tvPairings)
      .where(eq(schema.tvPairings.deviceCodeHash, this.hash(deviceCode)))
      .limit(1);

    if (!pairing) {
      // Sin el device_code en el log (T-164-14).
      this.log.warn("TV pairing: status de un device_code desconocido");
      return { status: "unknown" };
    }

    if (pairing.claimedAt === null) return { status: "pending" };
    if (pairing.deviceId !== null) return { status: "consumed" };

    if (pairing.branchId === null) {
      // Defensa en profundidad: `claim()` siempre setea la sede, asi que esto
      // solo puede venir de una escritura manual en la DB. Se deja al TV
      // polleando en vez de crear un dispositivo sin sede.
      this.log.warn(
        { pairingId: pairing.id },
        "TV pairing: reclamado sin sede, no se emite token",
      );
      return { status: "pending" };
    }

    const branchId = pairing.branchId;
    const deviceToken = this.generateSecret();
    const [inserted] = await this.db
      .insert(schema.tvDevices)
      // El gimnasio viene de la fila de pairing reclamada, NO de un scope de
      // request: el TV pollea sin sesion. Ver el docblock del metodo.
      .values(
        tenantValues(
          { tenantId: pairing.tenantId },
          {
            branchId,
            tokenHash: this.hash(deviceToken),
            name: pairing.deviceName,
            pairedBy: pairing.claimedBy,
          },
        ),
      )
      .$returningId();

    const sealed = await this.db
      .update(schema.tvPairings)
      .set({ deviceId: inserted.id })
      .where(
        and(
          eq(schema.tvPairings.id, pairing.id),
          isNull(schema.tvPairings.deviceId),
        ),
      );

    if (sealed[0].affectedRows === 0) {
      // Otro poll gano la carrera: el token recien generado no salio de aca,
      // asi que el device queda huerfano y se borra.
      await this.db
        .delete(schema.tvDevices)
        .where(eq(schema.tvDevices.id, inserted.id));
      this.log.warn(
        { pairingId: pairing.id },
        "TV pairing: consumo simultaneo, se descarta el device duplicado",
      );
      return { status: "consumed" };
    }

    const [branch] = await this.db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId))
      .limit(1);

    return {
      status: "paired",
      deviceToken,
      branchName: branch?.name ?? "",
    };
  }
}
