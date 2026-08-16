/**
 * Refresh Token Service
 *
 * Phase 116. Owns the lifecycle of opaque refresh tokens: issue, rotate
 * (with reuse detection), revoke, and revokeAllForUser.
 *
 * Security model:
 * - The plaintext token (crypto.randomBytes(32) base64url) is NEVER persisted.
 *   Only its sha256 hex digest is stored in refresh_tokens.token_hash
 *   (T-116-01). The plaintext is returned to the caller once and re-derived
 *   for lookup via sha256 on subsequent calls.
 * - Rotation marks the old row revoked + replaced_by_id -> new row.
 * - Reuse detection: replaying an already-revoked (rotated) token revokes THAT
 *   token's chain (esa sesión) and raises a 401 signal (T-116-02). Hasta
 *   2026-08-04 revocaba todas las sesiones del usuario; ver `handleRevokedToken`
 *   para por qué eso convertía un tropiezo en deslogueo permanente.
 * - Un replay dentro de REUSE_GRACE_MS se atiende como reintento de red.
 *
 * Failed-refresh paths log at `warn` (NOT `error`) to avoid Sentry spam
 * (SPEC constraint + CONTEXT specific idea).
 *
 * Uses constructor DI pattern (Phase 56 convention).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import * as schema from "../../db/schema";
import { tenantValues, type TenantId } from "../shared/tenant";

/** Refresh token lifetime: 30 days sliding (Req 6). */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ventana en la que un token recién rotado se acepta como REINTENTO y no como
 * robo (2026-08-04).
 *
 * El caso real: el cliente manda /auth/refresh, el server rota, y la respuesta
 * se pierde (red intermitente, o el `timeout: 10000` de axios corta antes). El
 * cliente se queda con el token viejo — el único que tiene — y lo reintenta. Sin
 * esta ventana eso es indistinguible de un replay y termina en deslogueo.
 *
 * 10 s alcanza para un reintento y es demasiado poco para un ataque práctico:
 * el atacante tendría que usar el token robado dentro de los 10 s de que la
 * víctima lo rotara. Fuera de la ventana, sigue siendo robo.
 */
const REUSE_GRACE_MS = 10_000;

/** Tope de saltos al recorrer una cadena de rotaciones (anti-ciclo). */
const MAX_CHAIN_HOPS = 200;

/**
 * Typed error for invalid/expired/reused refresh tokens. Route handlers
 * (Plan 02) map `code === "REFRESH_INVALID"` to `reply.code(401)`.
 */
export class RefreshTokenError extends Error {
  readonly code = "REFRESH_INVALID" as const;
  constructor(message = "Refresh token invalido") {
    super(message);
    this.name = "RefreshTokenError";
  }
}

type RefreshTokenRow = typeof schema.refreshTokens.$inferSelect;

export class RefreshTokenService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /** sha256 hex of the plaintext token. The plaintext is never persisted. */
  private hash(plain: string): string {
    return createHash("sha256").update(plain).digest("hex");
  }

  /** Generate a fresh opaque token plaintext (256 bits, url-safe). */
  private generatePlain(): string {
    return randomBytes(32).toString("base64url");
  }

  private expiry(): Date {
    return new Date(Date.now() + REFRESH_TTL_MS);
  }

  /**
   * Issue a brand-new refresh token for a user.
   * Persists only the sha256 hash + expiry. Returns the plaintext (the only
   * time the caller ever sees it).
   *
   * T-175-06: estampa `tenant_id`, derivado de `userId` (esta ruta no siempre
   * tiene `request.scope` — login/register son públicas). `users.tenant_id`
   * es NOT NULL, así que el lookup resuelve siempre para un usuario válido.
   */
  async issue(userId: number): Promise<string> {
    const tenantId = await this.resolveTenantId(userId);
    const plain = this.generatePlain();
    await this.db.insert(schema.refreshTokens).values(
      tenantValues(
        { tenantId },
        {
          userId,
          tokenHash: this.hash(plain),
          expiresAt: this.expiry(),
        },
      ),
    );
    return plain;
  }

  /** `tenant_id` del dueño de `userId`, para estampar refresh_tokens en `issue`. */
  private async resolveTenantId(userId: number): Promise<TenantId> {
    // T-175-06: `users` ya es tabla STRICT (sentinel de runtime activo) — el
    // comentario TS de arriba exime al LINT, no al SENTINEL (que solo lee el
    // SQL de runtime, Drizzle nunca emite comentarios TS en el texto que
    // llega al pool). Por eso la MISMA exención se repite EMBEBIDA en el SQL
    // del `where` de abajo (mismo idioma que T-173-22 en auth/routes.ts).
    /* tenant-safe: lookup pre-scope por PK de users — esta ES la lectura que DERIVA el tenant_id de arriba, filtrarla por tenant seria circular (mismo criterio que branches lookup de auth/routes.ts en el registro) */
    const [row] = await this.db
      .select({ tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(
        sql`/* tenant-safe: lookup pre-scope por PK de users — esta ES la lectura que DERIVA el tenant_id de arriba, filtrarla por tenant seria circular (mismo criterio que branches lookup de auth/routes.ts en el registro) */ ${eq(schema.users.id, userId)}`,
      )
      .limit(1);
    // users.tenant_id es NOT NULL (COL-01); si la fila no existe, el INSERT
    // de refresh_tokens que sigue va a fallar por la FK a users de todos
    // modos, así que 1 acá es un placeholder que nunca persiste.
    return row?.tenantId ?? 1;
  }

  private async findByPlain(plain: string): Promise<RefreshTokenRow | null> {
    // 175.1-07 (D-17, dos canales): este comentario exime al LINT (ancla AST);
    // la MISMA exención se repite EMBEBIDA en el `sql` de abajo porque el
    // sentinel de runtime solo lee el SQL final, nunca comentarios TS.
    /* tenant-safe: lookup pre-scope por hash opaco del token (M8) — el tenant_id recien se conoce DESPUES de encontrar la fila por su hash, componer la unique por tenant seria circular (mismo criterio que tokenHash UNIQUE global, tenant-column.ts:42) */
    const [row] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        sql`/* tenant-safe: lookup pre-scope por hash opaco del token (M8) — el tenant_id recien se conoce DESPUES de encontrar la fila por su hash, componer la unique por tenant seria circular (mismo criterio que tokenHash UNIQUE global, tenant-column.ts:42) */ ${schema.refreshTokens.tokenHash} = ${this.hash(plain)}`,
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Rotate a valid refresh token.
   *
   * - Unknown / expired token -> RefreshTokenError (401), no side effects.
   * - Already-revoked token -> {@link handleRevokedToken}: reintento dentro de
   *   la gracia (200, sigue la misma cadena) o replay (revoca ESA cadena, 401).
   * - Valid token -> mark old revoked + replaced_by_id, issue a new sliding
   *   token, and return { newToken, userId }. The owner's userId comes from
   *   the validated row already in memory (no extra query for the route).
   */
  async rotate(
    plainToken: string,
  ): Promise<{ newToken: string; userId: number }> {
    const row = await this.findByPlain(plainToken);

    if (!row) {
      this.log.warn("Refresh rotate: token desconocido");
      throw new RefreshTokenError();
    }

    if (row.revokedAt !== null) {
      return this.handleRevokedToken(row);
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      this.log.warn(
        { userId: row.userId, tokenId: row.id },
        "Refresh rotate: token expirado",
      );
      throw new RefreshTokenError("Refresh token expirado");
    }

    return this.issueReplacementFor(row);
  }

  /**
   * Un token ya revocado volvió a presentarse. Dos lecturas posibles, y hasta
   * 2026-08-04 el servicio solo contemplaba la peor.
   *
   * (a) REINTENTO: se revocó hace menos de {@link REUSE_GRACE_MS} y su cadena
   *     sigue sana. El cliente perdió la respuesta de la rotación anterior y
   *     reintentó con lo único que tiene. Se lo atiende continuando LA MISMA
   *     cadena desde su punta — no nace una sesión nueva.
   * (b) REPLAY: fuera de la ventana. Se revoca la cadena de ESE token y 401.
   *
   * Por qué la cadena y no `revokeAllForUser`: revocar todo el usuario hacía que
   * un tropiezo en el celular cerrara también la sesión de la computadora, y
   * como los otros clientes seguían con su token en localStorage, cada intento
   * suyo entraba de nuevo por acá y disparaba otra revocación total. Un solo
   * evento se volvía deslogueo permanente en todos los dispositivos (Super Admin,
   * 3 sesiones vivas revocadas de golpe el 2026-08-04 12:40:12 en prod).
   *
   * Cerrar TODAS las sesiones sigue siendo lo correcto ante un cambio de
   * contraseña o una baja de cuenta — eso es {@link revokeAllForUser}, que sigue
   * ahí y no cambió. Lo que se corrige es usarlo como respuesta a un replay.
   */
  private async handleRevokedToken(
    row: RefreshTokenRow,
  ): Promise<{ newToken: string; userId: number }> {
    const sinceRevoked = Date.now() - (row.revokedAt?.getTime() ?? 0);

    if (row.replacedById !== null && sinceRevoked <= REUSE_GRACE_MS) {
      const tip = await this.chainTip(row);
      if (
        tip &&
        tip.revokedAt === null &&
        tip.expiresAt.getTime() > Date.now()
      ) {
        this.log.warn(
          { userId: row.userId, tokenId: row.id, tipId: tip.id, sinceRevoked },
          "Refresh rotate: reintento dentro de la ventana de gracia, se continua la cadena",
        );
        return this.issueReplacementFor(tip);
      }
    }

    this.log.warn(
      { userId: row.userId, tokenId: row.id, sinceRevoked },
      "Refresh rotate: token reusado, revocando la cadena de ese token",
    );
    await this.revokeChain(row);
    throw new RefreshTokenError("Refresh token reusado");
  }

  /**
   * Rota `row`: emite el reemplazo y encadena el viejo. Asume `row` usable.
   *
   * T-175-06: el reemplazo hereda `row.tenantId` (la fila vieja ya tiene su
   * gimnasio resuelto de cuando se emitió) en vez de re-derivarlo de
   * `userId` — evita una query extra y preserva la procedencia de la cadena.
   */
  private async issueReplacementFor(
    row: RefreshTokenRow,
  ): Promise<{ newToken: string; userId: number }> {
    const newPlain = this.generatePlain();
    const inserted = await this.db.insert(schema.refreshTokens).values(
      tenantValues(
        { tenantId: row.tenantId },
        {
          userId: row.userId,
          tokenHash: this.hash(newPlain),
          expiresAt: this.expiry(),
        },
      ),
    );
    const newId = Number(inserted[0].insertId);

    /* tenant-safe: update por PK de row.id, fila ya resuelta (ancla derivada) — mismo criterio que processQueue en notifications/service.ts */
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date(), replacedById: newId })
      .where(
        sql`/* tenant-safe: update por PK de row.id, fila ya resuelta (ancla derivada) — mismo criterio que processQueue en notifications/service.ts */ ${schema.refreshTokens.id} = ${row.id}`,
      );

    return { newToken: newPlain, userId: row.userId };
  }

  /**
   * Última fila de la cadena de rotaciones que arranca en `row`, siguiendo
   * `replaced_by_id`. Devuelve `row` mismo si no fue reemplazado.
   *
   * El tope de saltos es defensivo: la cadena es un camino simple por
   * construcción (cada rotación crea una fila nueva), pero un dato corrupto no
   * puede colgar el login de nadie.
   */
  private async chainTip(
    row: RefreshTokenRow,
  ): Promise<RefreshTokenRow | null> {
    let current: RefreshTokenRow = row;
    for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
      if (current.replacedById === null) return current;
      /* tenant-safe: select por PK de replacedById, fila ya resuelta (ancla derivada) — mismo criterio que issueReplacementFor de arriba */
      const [next] = await this.db
        .select()
        .from(schema.refreshTokens)
        .where(
          sql`/* tenant-safe: select por PK de replacedById, fila ya resuelta (ancla derivada) — mismo criterio que issueReplacementFor de arriba */ ${schema.refreshTokens.id} = ${current.replacedById}`,
        )
        .limit(1);
      if (!next) return current;
      current = next;
    }
    this.log.warn(
      { userId: row.userId, tokenId: row.id },
      "Refresh chainTip: tope de saltos alcanzado, cadena sospechosa",
    );
    return null;
  }

  /**
   * Revoca la cadena a la que pertenece `row` — o sea, esa sesión y nada más.
   * Recorre hacia adelante desde `row` revocando lo que siga vivo. Idempotente.
   */
  private async revokeChain(row: RefreshTokenRow): Promise<void> {
    let current: RefreshTokenRow = row;
    for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
      if (current.revokedAt === null) {
        /* tenant-safe: update por PK de current.id, fila ya resuelta (ancla derivada) — mismo criterio que issueReplacementFor de arriba */
        await this.db
          .update(schema.refreshTokens)
          .set({ revokedAt: sql`NOW()` })
          .where(
            and(
              sql`/* tenant-safe: update por PK de current.id, fila ya resuelta (ancla derivada) — mismo criterio que issueReplacementFor de arriba */ 1 = 1`,
              eq(schema.refreshTokens.id, current.id),
              isNull(schema.refreshTokens.revokedAt),
            ),
          );
      }
      if (current.replacedById === null) return;
      /* tenant-safe: select por PK de replacedById, fila ya resuelta (ancla derivada) — mismo criterio que chainTip de arriba */
      const [next] = await this.db
        .select()
        .from(schema.refreshTokens)
        .where(
          sql`/* tenant-safe: select por PK de replacedById, fila ya resuelta (ancla derivada) — mismo criterio que chainTip de arriba */ ${schema.refreshTokens.id} = ${current.replacedById}`,
        )
        .limit(1);
      if (!next) return;
      current = next;
    }
    this.log.warn(
      { userId: row.userId, tokenId: row.id },
      "Refresh revokeChain: tope de saltos alcanzado, cadena sospechosa",
    );
  }

  /**
   * Revoke a single refresh token. Idempotent: no-op if unknown or already
   * revoked. Never throws (used by /logout).
   */
  async revoke(plainToken: string): Promise<void> {
    /* tenant-safe: lookup pre-scope por hash opaco del token (M8) — mismo motivo que findByPlain arriba */
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          sql`/* tenant-safe: lookup pre-scope por hash opaco del token (M8) — mismo motivo que findByPlain arriba */ 1 = 1`,
          eq(schema.refreshTokens.tokenHash, this.hash(plainToken)),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }

  /**
   * Revoke every active refresh token for a user. Used by change-password
   * (D-01) and delete-account (D-05).
   */
  async revokeAllForUser(userId: number): Promise<void> {
    /* tenant-safe: filtro por userId propio del dueño de la sesion — acota a las filas de un solo usuario sin ambiguedad, userId ya resuelve el gimnasio (mismo criterio que getUserPreferences en notifications/service.ts) */
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: sql`NOW()` })
      .where(
        and(
          sql`/* tenant-safe: filtro por userId propio del dueño de la sesion — acota a las filas de un solo usuario sin ambiguedad, userId ya resuelve el gimnasio (mismo criterio que getUserPreferences en notifications/service.ts) */ 1 = 1`,
          eq(schema.refreshTokens.userId, userId),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }
}
