/**
 * Utilidades compartidas por los tests del SEGUIMIENTO de invitados (bandeja como lista de
 * trabajo, `pending-count`, `PATCH .../followup`, `POST .../notes` y matriz de roles).
 *
 * Todo cuelga de `fixtureCtx` / `_helpers.ts`: fechas relativas a `todayInTz(<tz de la sede>)`,
 * nunca ids de `users` fijos, y toda consulta directa a una tabla con tenant lleva
 * `tenantWhere(tabla, ctx.tenant)`.
 */
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import type { InvitationLeadRow } from "../../src/modules/referrals/invitation-lead-list";
import {
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
  ensurePhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
} from "./_helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";

export const BASE = "/api/admin/referrals/invitations";

export type StaffRole = "gestion" | "admin_sede" | "recepcion" | "coach";

export interface FollowupFixtures {
  env: InvitedUserEnv;
  arTimezone: string;
}

/** Sede AR, plan Invitación y plan de membresía (la base se vacía en cada `beforeEach`). */
export async function seedFollowupFixtures(
  ctx: InvitationsFixtureCtx,
): Promise<FollowupFixtures> {
  const branch = await ensurePhysicalBranch(ctx, "AR");
  return {
    arTimezone: branch.timezone,
    env: {
      branchId: branch.id,
      today: todayInTz(branch.timezone),
      trialPlanId: (await createTrialPlan(ctx)).id,
      membershipPlanId: (await createMembershipPlan(ctx)).id,
    },
  };
}

let staffSeq = 0;

/** Otra sede FÍSICA del mismo país (o de otro): el país solo no alcanza para `admin_sede`. */
export async function createExtraBranch(
  ctx: InvitationsFixtureCtx,
  opts: { country: "AR" | "ES"; timezone: string },
): Promise<number> {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [created] = await ctx.app.db
    .insert(schema.branches)
    .values(
      tenantValues(ctx.tenant, {
        name: `Sede extra ${seed}`,
        code: `X${seed}`.slice(0, 20),
        country: opts.country,
        timezone: opts.timezone,
      }),
    )
    .$returningId();
  return created.id;
}

/**
 * Staff con token. `admin_sede`/`recepcion`/`coach` quedan asignados a `branchId` (el helper
 * del repo les siembra `user_branches`); `extraBranchIds` suma más sedes a un `admin_sede`.
 */
export async function createStaffToken(
  ctx: InvitationsFixtureCtx,
  role: StaffRole,
  opts: {
    branchId: number;
    country?: "AR" | "ES";
    extraBranchIds?: number[];
  },
): Promise<string> {
  staffSeq += 1;
  const email = `followup-${role}-${staffSeq}-${Date.now().toString(36)}@test.local`;
  const userId = await createStaffUser(ctx.app, {
    email,
    password: "pass123456",
    firstName: role,
    lastName: "Followup",
    role,
    branchId: opts.branchId,
    country: role === "gestion" ? (opts.country ?? "AR") : null,
  });
  for (const branchId of opts.extraBranchIds ?? []) {
    await ctx.app.db
      .insert(schema.userBranches)
      .values(tenantValues(ctx.tenant, { userId, branchId }));
  }
  return getAuthToken(ctx.app, email, "pass123456");
}

export async function ownerToken(app: FastifyInstance): Promise<string> {
  return getAuthToken(app, "admin@test.com", "adminpass123");
}

export async function sendJson(
  app: FastifyInstance,
  method: "GET" | "PATCH" | "POST",
  url: string,
  token: string | null,
  payload?: Record<string, unknown>,
): Promise<{ statusCode: number; body: unknown; raw: string }> {
  const res = await app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });
  let body: unknown = null;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = null;
  }
  return { statusCode: res.statusCode, body, raw: res.body };
}

export interface LeadsPageBody {
  rows: InvitationLeadRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getLeads(
  app: FastifyInstance,
  token: string,
  query = "",
): Promise<{ statusCode: number; body: LeadsPageBody }> {
  const res = await sendJson(app, "GET", `${BASE}${query}`, token);
  return { statusCode: res.statusCode, body: res.body as LeadsPageBody };
}

/** Cuerpo de `GET /invitations/pending-count`. */
export interface PendingCountBody {
  open: number;
  uncontacted: number;
  selfActivatedWithoutBooking: number;
}

export async function getPendingCount(
  app: FastifyInstance,
  token: string,
): Promise<{
  statusCode: number;
  body: PendingCountBody;
}> {
  const res = await sendJson(app, "GET", `${BASE}/pending-count`, token);
  return {
    statusCode: res.statusCode,
    body: res.body as PendingCountBody,
  };
}

/** Asistencia del invitado en un día (`session_date` = día calendario de la sede). */
export async function attend(
  ctx: InvitationsFixtureCtx,
  userId: number,
  branchId: number,
  sessionDate: string,
): Promise<void> {
  await ctx.app.db.insert(schema.attendance).values(
    tenantValues(ctx.tenant, {
      memberId: userId,
      branchId,
      sessionDate,
      source: "manual" as const,
    }),
  );
}

/** Motivo de no renovación del catálogo sembrado por la migración 0237 (por etiqueta). */
export async function reasonIdByLabel(
  ctx: InvitationsFixtureCtx,
  label: string,
): Promise<number> {
  const [row] = await ctx.app.db
    .select({ id: schema.renewalReasons.id })
    .from(schema.renewalReasons)
    .where(
      and(
        tenantWhere(schema.renewalReasons, ctx.tenant),
        eq(schema.renewalReasons.label, label),
      ),
    );
  if (!row) throw new Error(`motivo "${label}" no está sembrado`);
  return row.id;
}

/** Fila de `renewal_followups` de una sub (o `undefined`). */
export async function followupRow(
  ctx: InvitationsFixtureCtx,
  subscriptionId: number,
) {
  const [row] = await ctx.app.db
    .select()
    .from(schema.renewalFollowups)
    .where(
      and(
        tenantWhere(schema.renewalFollowups, ctx.tenant),
        eq(schema.renewalFollowups.subscriptionId, subscriptionId),
      ),
    );
  return row;
}

export async function setLeadStatus(
  ctx: InvitationsFixtureCtx,
  userId: number,
  leadStatus: "en_seguimiento" | "ganado" | "perdido" | null,
  purchasedPlanId?: number | null,
): Promise<void> {
  await ctx.app.db
    .update(schema.users)
    .set({
      leadStatus,
      ...(purchasedPlanId !== undefined ? { purchasedPlanId } : {}),
    })
    .where(
      and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
    );
}

export async function leadStatusOf(
  ctx: InvitationsFixtureCtx,
  userId: number,
): Promise<"en_seguimiento" | "ganado" | "perdido" | null> {
  const [row] = await ctx.app.db
    .select({ leadStatus: schema.users.leadStatus })
    .from(schema.users)
    .where(
      and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
    );
  return row?.leadStatus ?? null;
}
