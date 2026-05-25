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
 * - Reuse detection: replaying an already-revoked (rotated) token revokes the
 *   whole family for that user and raises a 401 signal (T-116-02).
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

/** Refresh token lifetime: 30 days sliding (Req 6). */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
   */
  async issue(userId: number): Promise<string> {
    const plain = this.generatePlain();
    await this.db.insert(schema.refreshTokens).values({
      userId,
      tokenHash: this.hash(plain),
      expiresAt: this.expiry(),
    });
    return plain;
  }

  private async findByPlain(plain: string): Promise<RefreshTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, this.hash(plain)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Rotate a valid refresh token.
   *
   * - Unknown / expired token -> RefreshTokenError (401), no side effects.
   * - Already-revoked token (reuse) -> revoke the whole family for the owner
   *   and raise RefreshTokenError (401). Does NOT return a new token.
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

    // Reuse detection: a token that was already rotated (revoked) is being
    // replayed -> revoke the entire family for this user.
    if (row.revokedAt !== null) {
      this.log.warn(
        { userId: row.userId, tokenId: row.id },
        "Refresh rotate: token reusado, revocando familia completa del user",
      );
      await this.revokeAllForUser(row.userId);
      throw new RefreshTokenError("Refresh token reusado");
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      this.log.warn(
        { userId: row.userId, tokenId: row.id },
        "Refresh rotate: token expirado",
      );
      throw new RefreshTokenError("Refresh token expirado");
    }

    // Issue the replacement (sliding expiry).
    const newPlain = this.generatePlain();
    const inserted = await this.db.insert(schema.refreshTokens).values({
      userId: row.userId,
      tokenHash: this.hash(newPlain),
      expiresAt: this.expiry(),
    });
    const newId = Number(inserted[0].insertId);

    // Mark the old row revoked + chained to the replacement.
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date(), replacedById: newId })
      .where(eq(schema.refreshTokens.id, row.id));

    return { newToken: newPlain, userId: row.userId };
  }

  /**
   * Revoke a single refresh token. Idempotent: no-op if unknown or already
   * revoked. Never throws (used by /logout).
   */
  async revoke(plainToken: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
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
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: sql`NOW()` })
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }
}
