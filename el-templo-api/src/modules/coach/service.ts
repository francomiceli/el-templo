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
import { tenantWhere, type TenantContext } from "../shared/tenant";
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

  /**
   * Fase 172 (ADO-01): `ctx` es el PRIMER parámetro y llega desde
   * `assertTenant(request.scope, "coach.outstanding-balances")`. Va delante de
   * `scope` a propósito: `CoachScope` (rol/país/sucursales) resuelve QUÉ SUBSET
   * del gimnasio ve este profe, mientras que `ctx` resuelve DE QUÉ GIMNASIO son
   * los datos. Son dos preguntas distintas y la segunda no es negociable, así
   * que se responde primero.
   */
  async getOutstandingBalances(
    ctx: TenantContext,
    filters: CoachOutstandingBalancesFilters,
    scope: CoachScope,
  ): Promise<CoachOutstandingBalancesResult> {
    if (scope.role === "coach" && scope.branchIds.length === 0) {
      return { rows: [] };
    }

    const conds: SQL[] = [gt(schema.balances.amount, 0)];

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
      // El filtro de gimnasio se escribe ACÁ y no como primer elemento de
      // `conds`: el SQL sale idéntico (primer término del WHERE en los dos
      // casos), pero el lint de tenancy razona por STATEMENT (hallazgo 172-02)
      // y el statement que nombra `balances` es ÉSTE, no el del array.
      .where(and(tenantWhere(schema.balances, ctx), ...conds))
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
