/**
 * Coach Service
 *
 * Read-only queries powering the coach-facing "Deudas" tab in the admin web.
 * Surfaces a minimal projection of outstanding member balances aggregated by
 * (member, currency) so a professor receiving a payment at the door knows
 * exactly how much to collect, with no other financial detail exposed.
 *
 * Scope rules (mirror `attachCountryScope` semantics):
 *  - coach: restricted to members whose `users.branchId` is in their assigned
 *    `scope.branchIds`. Filtering by member branch (not subscription branch)
 *    captures both subscription balances and `debt_balance` rows for the
 *    coach's local roster — what they will actually collect at the door.
 *    Coaches with no branches see nothing.
 *  - gestion/admin: restricted to their `scope.country` via `users.country`.
 *  - owner: unrestricted by scope; sees all countries.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gt, inArray, sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";
import { buildMemberNameSearchCondition } from "../shared/member-search";
import { collectibleDebtCondition } from "../finance/debt-conditions";
import type {
  CoachOutstandingBalanceRow,
  CoachOutstandingBalancesFilters,
  CoachOutstandingBalancesResult,
} from "./types";

type CoachScope = {
  role: string;
  isOwner: boolean;
  country: "AR" | "ES" | null;
  branchIds: number[];
};

export class CoachService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async getOutstandingBalances(
    filters: CoachOutstandingBalancesFilters,
    scope: CoachScope,
  ): Promise<CoachOutstandingBalancesResult> {
    if (scope.role === "coach" && scope.branchIds.length === 0) {
      return { rows: [] };
    }

    const conds: SQL[] = [
      gt(schema.balances.amount, 0),
      collectibleDebtCondition(),
    ];

    if (scope.role === "coach") {
      conds.push(inArray(schema.users.branchId, scope.branchIds));
    } else if (!scope.isOwner) {
      if (scope.country === null) return { rows: [] };
      conds.push(eq(schema.users.country, scope.country));
    }

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const searchCond = buildMemberNameSearchCondition(filters.search, {
        includeDni: false,
      });
      if (searchCond !== null) {
        conds.push(searchCond);
      }
    }

    const rows = await this.db
      .select({
        memberId: schema.balances.memberId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        currency: schema.balances.currency,
        totalAmount: sql<string>`SUM(${schema.balances.amount})`,
      })
      .from(schema.balances)
      .innerJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .where(and(...conds))
      .groupBy(
        schema.balances.memberId,
        schema.users.firstName,
        schema.users.lastName,
        schema.users.phone,
        schema.balances.currency,
      )
      .orderBy(schema.users.firstName, schema.users.lastName);

    const mapped: CoachOutstandingBalanceRow[] = rows.map((r) => ({
      memberId: r.memberId,
      memberName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      memberPhone: r.phone ?? null,
      totalAmount: Number(r.totalAmount),
      currency: r.currency,
    }));

    return { rows: mapped };
  }
}
