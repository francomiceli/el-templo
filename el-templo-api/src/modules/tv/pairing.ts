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
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createHash, randomBytes, randomInt } from "node:crypto";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
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
   */
  async start(): Promise<{ userCode: string; deviceCode: string }> {
    const deviceCode = this.generateSecret();
    const deviceCodeHash = this.hash(deviceCode);

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const userCode = this.generateUserCode();
      try {
        await this.db
          .insert(schema.tvPairings)
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
   */
  async claim(
    userCode: string,
    branchId: number,
    claimedBy: number,
    name?: string,
  ): Promise<void> {
    const result = await this.db
      .update(schema.tvPairings)
      .set({
        claimedAt: new Date(),
        claimedBy,
        branchId,
        deviceName: name ?? null,
      })
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
   */
  async consume(deviceCode: string): Promise<TvPairingStatus> {
    const [pairing] = await this.db
      .select({
        id: schema.tvPairings.id,
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
      .values({
        branchId,
        tokenHash: this.hash(deviceToken),
        name: pairing.deviceName,
        pairedBy: pairing.claimedBy,
      })
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
