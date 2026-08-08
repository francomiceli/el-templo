/**
 * Segmentation Service
 *
 * Calculates the Attendance label for members based 100% on the percentage of
 * membership usage (attendance vs plan budget) over a rolling 28-day window.
 * The label is plan-relative and recalculates on login (with a 1h cooldown).
 *
 * Phase 136 (D-01..D-09): collapsed the legacy 6-value behavioral segment
 * (nuevo/espartano/intermitente/en_riesgo/digital_warrior/ghost + golden case +
 * inactivity-by-weeks) into the 4 attendance bands. Cut points are fixed in
 * code (types.ts), no longer read from system_settings.
 *
 * Uses constructor DI pattern (Phase 56 convention).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, sql, desc, inArray, isNotNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantValues, type TenantContext } from "../shared/tenant";
import type { MemberSegment } from "./types";
import {
  ATTENDANCE_OPTIMA_PCT,
  ATTENDANCE_REGULAR_PCT,
  ATTENDANCE_WINDOW_DAYS,
  ATTENDANCE_TARGET_MAX_PER_WEEK,
} from "./types";
import { computeSeniority } from "../shared/date-utils";

/** Skip recalculation if segment was updated within this many milliseconds */
const RECALC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export class SegmentationService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Calculate the Attendance label for a member (D-01..D-08).
   *
   * Returns NULL when no label applies:
   *  - tenure < 1 month (D-07): not enough history, must not fall unfairly into
   *    Alerta/Ausente during the first month;
   *  - no active/paused subscription: no plan to measure against;
   *  - non-presencial (online) plan: the label measures physical gym usage,
   *    which is meaningless for digital plans.
   *
   * The denominator is a realistic weekly attendance target
   * (ATTENDANCE_TARGET_MAX_PER_WEEK), capping the plan's booking allowance.
   * Open-ended presencial plans without a classesPerWeek (programs/memberships)
   * fall back to that same default target so their members still get a label.
   *
   * Otherwise classifies by attendance percentage over the 28-day window:
   *  - pct >= 75            → optima (D-04: >100% stays optima)
   *  - 50 <= pct < 75       → regular
   *  - 0  <  pct < 50       → alerta
   *  - pct == 0             → ausente
   */
  async calculateSegment(userId: number): Promise<MemberSegment | null> {
    // Step 1: tenure guard (D-07). Members with < 1 month since registration
    // have no Attendance label — the column stays NULL.
    //
    // T-173-08: `users` es tabla strict (D-01) pero este método no recibe un
    // `ctx` externo. Sus 2 call sites son `GET /me` (auth/routes.ts, ruta JWT
    // pública del socio, sin `request.scope`) y el cron de recategorización
    // de segmentos (notification-cron.ts, dueño 173-16) — ninguno de los dos
    // es archivo de este plan (D-02: cirugía mínima, no se infla el alcance a
    // módulos ajenos). El `id` es siempre el PK propio del socio (su propio
    // JWT o el `userId` que ya iteró el cron), nunca un filtro de lista, así
    // que el `isNotNull(tenantId)` de abajo no es un adorno: es el mismo
    // guard fail-closed contra corrupción de datos que usa `country-scope.ts`
    // (un socio sin gimnasio resoluble no participa de ninguna operación), y
    // le da al sentinel el literal `tenant_id` que necesita en la zona de
    // predicado sin inventar una quinta fuente de `TenantContext`.
    const [user] = await this.db
      .select({ createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), isNotNull(schema.users.tenantId)))
      .limit(1);

    if (!user) {
      this.log.warn({ userId }, "User not found for segment calculation");
      return null;
    }

    // Guard uses the exact same "nuevo" tenure boundary as the Antigüedad pill
    // (computeSeniority, D-06) so the two can never disagree: a member tagged
    // "Nuevo" must never carry an Attendance label.
    if (computeSeniority(user.createdAt) === "nuevo") {
      return null;
    }

    // Step 2: active plan (D-08). Need an active/paused subscription; the label
    // only applies to presencial plans (physical attendance).
    const [activeSub] = await this.db
      .select({
        classesPerWeek: schema.subscriptionPlans.classesPerWeek,
        planCategory: schema.subscriptionPlans.planCategory,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          inArray(schema.subscriptions.status, ["active", "paused"]),
        ),
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);

    if (!activeSub || activeSub.planCategory !== "presencial") {
      return null;
    }

    // Step 3: expected classes in the rolling window. classesPerWeek is a
    // booking cap, not an attendance target — cap it at a realistic weekly
    // target so flexible plans (cap 6) aren't scored against an unreachable
    // ideal. Open-ended presencial plans without a cap (programs/memberships)
    // fall back to the same default target (see ATTENDANCE_TARGET_MAX_PER_WEEK).
    const targetPerWeek = activeSub.classesPerWeek
      ? Math.min(activeSub.classesPerWeek, ATTENDANCE_TARGET_MAX_PER_WEEK)
      : ATTENDANCE_TARGET_MAX_PER_WEEK;
    const expectedClasses = targetPerWeek * (ATTENDANCE_WINDOW_DAYS / 7);

    if (expectedClasses <= 0) {
      return null;
    }

    // Step 4: count attendance in the rolling 28-day window.
    const windowStart = new Date(
      Date.now() - ATTENDANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [attendanceResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, userId),
          gte(schema.attendance.checkedInAt, windowStart),
        ),
      );

    const attendanceCount = attendanceResult?.count ?? 0;

    // Step 5: attendance percentage and 4-band classification.
    const attendancePct = (attendanceCount / expectedClasses) * 100;

    if (attendancePct >= ATTENDANCE_OPTIMA_PCT) {
      return "optima";
    }

    if (attendancePct >= ATTENDANCE_REGULAR_PCT) {
      return "regular";
    }

    if (attendancePct > 0) {
      return "alerta";
    }

    return "ausente";
  }

  /**
   * Calculate the Attendance label and persist it to member_profiles.
   * Skips recalculation if segment was updated within the last hour.
   *
   * NULL is a valid result to persist (D-07/D-08: no label applies).
   */
  async calculateAndUpdate(userId: number): Promise<MemberSegment | null> {
    // T-173-08: mismo caso que calculateSegment — sin `ctx` externo (mismos 2
    // call sites ajenos), `member_profiles` tiene su propia columna
    // `tenant_id` y el guard `isNotNull` se aplica sobre ELLA, no sobre la de
    // `users` (cada tabla strict lleva el suyo).
    //
    // Check cooldown: skip if recently updated and a label is already set.
    const [profile] = await this.db
      .select({
        segment: schema.memberProfiles.segment,
        segmentUpdatedAt: schema.memberProfiles.segmentUpdatedAt,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          eq(schema.memberProfiles.userId, userId),
          isNotNull(schema.memberProfiles.tenantId),
        ),
      )
      .limit(1);

    if (profile?.segmentUpdatedAt) {
      const elapsed = Date.now() - profile.segmentUpdatedAt.getTime();
      if (elapsed < RECALC_COOLDOWN_MS && profile.segment) {
        return profile.segment as MemberSegment;
      }
    }

    const segment = await this.calculateSegment(userId);

    // Update or skip if no member_profiles row exists (member may not have
    // completed onboarding). NULL is persisted intentionally.
    if (profile) {
      await this.db
        .update(schema.memberProfiles)
        .set({
          segment,
          segmentUpdatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.memberProfiles.userId, userId),
            isNotNull(schema.memberProfiles.tenantId),
          ),
        );
    }

    return segment;
  }

  /**
   * Record a login event for the user.
   *
   * T-173-08: `member_logins` es tabla strict y el INSERT necesita un
   * `tenant_id` REAL (a diferencia de un guard de lectura, acá no alcanza con
   * "nombrar la columna" — el valor que se escribe importa). Sin `ctx`
   * externo disponible (mismo caso que `calculateSegment`), se resuelve el
   * gimnasio de ESTE socio leyendo su propia fila de `users` por `id` — el
   * mismo origen que usa `attachScope` (`country-scope.ts`) antes de que
   * exista un `TenantContext`. Si el socio no resuelve gimnasio (corrupción
   * de datos), se omite el registro en vez de escribir una fila sin dueño.
   */
  async recordLogin(userId: number): Promise<void> {
    const [owner] = await this.db
      .select({ tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), isNotNull(schema.users.tenantId)))
      .limit(1);

    if (!owner) {
      this.log.warn(
        { userId },
        "recordLogin: no se pudo resolver el gimnasio del socio — se omite el registro",
      );
      return;
    }

    const ctx: TenantContext = { tenantId: owner.tenantId };
    await this.db.insert(schema.memberLogins).values(
      tenantValues(ctx, {
        userId,
        loggedInAt: new Date(),
      }),
    );
  }
}
