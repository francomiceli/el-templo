/**
 * Bar Challenge Service (Phase 115 — D-11, D-14)
 *
 * Single responsibility: persist the user's one-and-only attempt at the bar
 * challenge atomically. Single-attempt is enforced at the SQL layer via a
 * conditional UPDATE (`WHERE bar_challenge_attempted_at IS NULL`) so the
 * service is race-free without needing a transaction or a SELECT+UPDATE.
 *
 * Threat model coverage:
 *  - T-115-09 (repudiation / replay): atomic UPDATE blocks any second attempt
 *    regardless of timing — affectedRows=0 → 409 contract.
 *  - T-115-08 (tampering): secondsHeld bounds are enforced upstream in the
 *    route's JSON schema; the service trusts the caller's already-validated
 *    integer.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { users } from "../../db/schema/users";

type DbInstance = MySql2Database<typeof schema>;

export type SubmitResultOutcome =
  | { ok: true; completed: boolean; seconds: number }
  | { ok: false; reason: "already_attempted" };

export class BarChallengeService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {}

  /**
   * Persist a bar challenge attempt for `userId`. Returns a discriminated
   * union signalling either success (with the resolved `completed` flag and
   * echoed `seconds`) or an already-attempted conflict.
   *
   * The UPDATE is conditional on `bar_challenge_attempted_at IS NULL`, so a
   * second invocation for the same user resolves to `affectedRows === 0`
   * without mutating any row — the persisted first attempt remains
   * authoritative.
   */
  async submitResult(
    userId: number,
    secondsHeld: number,
  ): Promise<SubmitResultOutcome> {
    const completed = secondsHeld >= 90;

    const result = await this.db
      .update(users)
      .set({
        barChallengeCompleted: completed,
        barChallengeSeconds: secondsHeld,
        barChallengeAttemptedAt: sql`NOW()`,
      })
      .where(and(eq(users.id, userId), isNull(users.barChallengeAttemptedAt)));

    // Drizzle MySQL2 returns [ResultSetHeader, FieldPacket[]]; mirror the
    // canonical extraction pattern already used in modules/programs/service.ts
    // (`result[0].affectedRows`).
    const affectedRows = result[0].affectedRows;

    if (affectedRows === 0) {
      this.log?.warn(
        { userId },
        "bar-challenge: second attempt rejected (already_attempted)",
      );
      return { ok: false, reason: "already_attempted" };
    }

    this.log?.info(
      { userId, completed, seconds: secondsHeld },
      "bar-challenge: attempt recorded",
    );
    return { ok: true, completed, seconds: secondsHeld };
  }
}
