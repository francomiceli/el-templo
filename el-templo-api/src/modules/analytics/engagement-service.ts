/**
 * Engagement Service (Phase 117 D-12 / D-09 / D-17).
 *
 * A NEW domain service (per D-09) that REUSES the existing segmentation module
 * — it does NOT recalculate segments or invent thresholds. The 6 behavioral
 * segments are computed and persisted by `segmentation/service.ts` into
 * `member_profiles.segment` (recalculated on member login, 1h cooldown). This
 * service only READS that column and AGGREGATES:
 *
 *   - countActiveBySegment: how many ACTIVE members (canonical
 *     `activeMemberExists` predicate, never `users.status`) sit in each of the
 *     6 segments + a `sinSegmento` bucket for active members whose segment is
 *     NULL (no profile / never logged in since segmentation shipped).
 *   - getEngagementNominalList: the worklist of active `en_riesgo` / `ghost`
 *     members ("los que se van a ir si nadie los toca") with phone for the
 *     WhatsApp action — same nominal shape as analytics' getAttentionList.
 *
 * Staleness is acceptable (D-12): the segment is recomputed at member login,
 * analytics only reads. NO recompute happens here.
 *
 * Scope (D-17 / T-117-01 / T-117-06): every query routes through `applyScope`
 * on `users.branchId` so a coach/admin of sede X never counts or sees PII
 * (phone) of sede Y. The MemberSegment type is IMPORTED from segmentation —
 * this service defines NO segment enum of its own.
 *
 * Uses constructor DI pattern (Phase 56 convention), same shape as
 * AnalyticsService / AttendanceMetricsService / SegmentationService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { activeMemberExists } from "../shared/active-member";
import type { MemberSegment } from "../segmentation/types";
import type {
  AnalyticsFilters,
  SegmentCounts,
  EngagementMember,
} from "./types";

/** The 6 canonical segments (segmentation/types.ts) — NOT redefined here. */
const SEGMENT_KEYS: MemberSegment[] = [
  "nuevo",
  "espartano",
  "intermitente",
  "en_riesgo",
  "digital_warrior",
  "ghost",
];

export class EngagementService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Count ACTIVE members grouped by their persisted `member_profiles.segment`
   * (D-12). Only members that are active per the canonical `activeMemberExists`
   * predicate are counted — a non-active member with a stale `ghost` segment is
   * NOT counted. Active members with NULL segment (no profile row, or never
   * computed) land in `sinSegmento` so the per-segment counts reconcile against
   * the total active count. Scope via applyScope on `users.branchId` (D-17).
   * Reused, never recalculated.
   */
  async countActiveBySegment(
    filters: AnalyticsFilters,
  ): Promise<SegmentCounts> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.users.branchId,
    });

    const conditions: SQL[] = [
      eq(schema.users.role, "member") as unknown as SQL,
      activeMemberExists(schema.users.id),
      ...scopeConditions,
    ];

    // LEFT JOIN member_profiles so active members WITHOUT a profile row still
    // appear (segment resolves to NULL → sinSegmento). NULL is normalized to the
    // literal 'sinSegmento' bucket inside the GROUP BY so the grouping is total.
    const base = this.db
      .select({
        bucket: sql<string>`COALESCE(${schema.memberProfiles.segment}, 'sinSegmento')`,
        count: sql<number>`COUNT(DISTINCT ${schema.users.id})`,
      })
      .from(schema.users)
      .leftJoin(
        schema.memberProfiles,
        eq(schema.memberProfiles.userId, schema.users.id),
      );

    const rows = needsBranchJoin
      ? await base
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .where(and(...conditions))
          .groupBy(
            sql`COALESCE(${schema.memberProfiles.segment}, 'sinSegmento')`,
          )
      : await base
          .where(and(...conditions))
          .groupBy(
            sql`COALESCE(${schema.memberProfiles.segment}, 'sinSegmento')`,
          );

    const counts: SegmentCounts = {
      nuevo: 0,
      espartano: 0,
      intermitente: 0,
      en_riesgo: 0,
      digital_warrior: 0,
      ghost: 0,
      sinSegmento: 0,
    };

    for (const row of rows) {
      const bucket = row.bucket;
      const n = Number(row.count ?? 0);
      if (bucket === "sinSegmento") {
        counts.sinSegmento = n;
      } else if ((SEGMENT_KEYS as string[]).includes(bucket)) {
        counts[bucket as MemberSegment] = n;
      } else {
        // Defensive: an unexpected enum value (shouldn't happen) is logged and
        // folded into sinSegmento rather than dropped.
        this.log.warn(
          { bucket },
          "engagement: unexpected segment value, folding into sinSegmento",
        );
        counts.sinSegmento += n;
      }
    }

    return counts;
  }

  /**
   * Nominal worklist of ACTIVE `en_riesgo` / `ghost` members (D-12 / D-17). Same
   * shape as getAttentionList (userId / firstName / lastName / planName / phone)
   * plus the segment so the admin can prioritize. Only active members are
   * included (canonical predicate). The member's plan name is taken from the
   * most relevant in-effect subscription. Scope via applyScope on
   * `users.branchId` (T-117-01: no PII leak across sedes). PII (phone) is gated
   * upstream by the ADMIN_ROLES guard (T-117-06).
   */
  async getEngagementNominalList(
    filters: AnalyticsFilters,
  ): Promise<EngagementMember[]> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.users.branchId,
    });

    const conditions: SQL[] = [
      eq(schema.users.role, "member") as unknown as SQL,
      sql`${schema.memberProfiles.segment} IN ('en_riesgo','ghost')`,
      activeMemberExists(schema.users.id),
      ...scopeConditions,
    ];

    // Plan name comes from a correlated subquery over the in-effect subscription
    // (same predicate window as activeMemberExists), avoiding a fan-out join
    // when a member has multiple subscriptions.
    const planNameExpr = sql<string | null>`(SELECT sp.name FROM subscriptions s
        INNER JOIN subscription_plans sp ON sp.id = s.plan_id
        WHERE s.user_id = ${schema.users.id}
          AND s.subscription_status IN ('active','paused')
          AND s.start_date <= CURDATE()
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
        ORDER BY s.end_date DESC
        LIMIT 1)`;

    const base = this.db
      .select({
        userId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        segment: schema.memberProfiles.segment,
        planName: planNameExpr,
      })
      .from(schema.users)
      .innerJoin(
        schema.memberProfiles,
        eq(schema.memberProfiles.userId, schema.users.id),
      );

    const rows = needsBranchJoin
      ? await base
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .where(and(...conditions))
      : await base.where(and(...conditions));

    // Sort ghost before en_riesgo (ghost = higher urgency), then by name for a
    // stable list. The admin can re-sort; this is a sensible default.
    const urgency: Record<"en_riesgo" | "ghost", number> = {
      ghost: 0,
      en_riesgo: 1,
    };

    return rows
      .filter(
        (r): r is typeof r & { segment: "en_riesgo" | "ghost" } =>
          r.segment === "en_riesgo" || r.segment === "ghost",
      )
      .map((r) => ({
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        planName: r.planName ?? null,
        phone: r.phone,
        segment: r.segment,
      }))
      .sort((a, b) => {
        const u = urgency[a.segment] - urgency[b.segment];
        if (u !== 0) return u;
        return (a.lastName ?? "").localeCompare(b.lastName ?? "");
      });
  }
}
