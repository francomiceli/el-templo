/**
 * Bar Challenge Service (Phase 115 — post-launch update 2026-05-21)
 *
 * Persist the user's bar challenge attempt. Sin bloqueos:
 * cada submit sobrescribe los campos `bar_challenge_*` del usuario.
 * El frontend permite reintentos ilimitados.
 *
 * Threat model:
 *  - T-115-08 (tampering): secondsHeld bounds validados en el JSON schema
 *    del route.
 */
import { eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { users } from "../../db/schema/users";

type DbInstance = MySql2Database<typeof schema>;

export interface SubmitResultOutcome {
  completed: boolean;
  seconds: number;
}

export class BarChallengeService {
  constructor(
    private readonly db: DbInstance,
    private readonly log?: FastifyBaseLogger,
  ) {}

  async submitResult(
    userId: number,
    secondsHeld: number,
  ): Promise<SubmitResultOutcome> {
    const completed = secondsHeld >= 90;

    await this.db
      .update(users)
      .set({
        barChallengeCompleted: completed,
        barChallengeSeconds: secondsHeld,
        barChallengeAttemptedAt: sql`NOW()`,
      })
      .where(eq(users.id, userId));

    this.log?.info(
      { userId, completed, seconds: secondsHeld },
      "bar-challenge: attempt recorded",
    );
    return { completed, seconds: secondsHeld };
  }
}
