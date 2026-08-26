/**
 * Fixtures compartidas del módulo `referral-partners` (fase 179).
 *
 * Reusadas por el resto de la fase (planes 03 a 09): la firma de estas
 * funciones importa, no son un detalle interno de este archivo.
 *
 * `insertPartner`/`insertPartnerLink` son INSERTs crudos (bypasean el
 * servicio) para armar el estado de partida de un test rápido; `partnerLinkRow`
 * / `partnerCommissionRows` leen la fila CRUDA por SQL — los tests afirman
 * sobre la base, no sobre el DTO (mismo estilo que `referralRow` en
 * `test/referrals/admin-assign-referrer.test.ts`).
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantValues } from "../../src/modules/shared/tenant";
import type {
  PartnerBenefitType,
  PartnerCommissionType,
  PartnerCurrency,
} from "../../src/modules/referral-partners/types";

/**
 * Código único por corrida — mismo patrón que `nextSuffix` de
 * `test/referrals/admin-assign-referrer.test.ts`. Se pasa por
 * `normalizeCode`-compatible (upper + alfanumérico), así que sirve tanto para
 * insertar crudo como para pasarlo a `createPartner` sin normalizar dos veces.
 */
export function nextCode(prefix: string): string {
  const t = Date.now().toString(36).slice(-5).toUpperCase();
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0")
    .toUpperCase();
  return `${prefix}${t}${r}`.replace(/[^A-Z0-9]/g, "");
}

/** Crea una sede de test con el país indicado (default AR). Código único. */
export async function insertBranch(
  app: FastifyInstance,
  overrides: { country?: string; name?: string } = {},
): Promise<{ id: number }> {
  const code = nextCode("BR");
  const [row] = await app.db
    .insert(schema.branches)
    .values({
      name: overrides.name ?? `Branch ${code}`,
      code,
      country: overrides.country ?? "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return { id: row.id };
}

interface InsertPartnerOverrides {
  name?: string;
  code?: string;
  branchId?: number;
  benefitType?: PartnerBenefitType;
  benefitValue?: number;
  commissionType?: PartnerCommissionType;
  commissionValue?: number;
  currency?: PartnerCurrency;
  isActive?: boolean;
  tenantId?: number;
  createdBy?: number | null;
}

/** INSERT crudo en `referral_partners`. Devuelve el id y el código (único). */
export async function insertPartner(
  app: FastifyInstance,
  overrides: InsertPartnerOverrides = {},
): Promise<{ id: number; code: string }> {
  const code = overrides.code ?? nextCode("PART");
  const [row] = await app.db
    .insert(schema.referralPartners)
    .values(
      tenantValues(
        { tenantId: overrides.tenantId ?? 1 },
        {
          name: overrides.name ?? `Partner ${code}`,
          code,
          branchId: overrides.branchId ?? 1,
          benefitType: overrides.benefitType ?? "discount_percent",
          benefitValue: overrides.benefitValue ?? 20,
          commissionType: overrides.commissionType ?? "fixed",
          commissionValue: overrides.commissionValue ?? 5000,
          currency: overrides.currency ?? "ARS",
          isActive: overrides.isActive ?? true,
          createdBy: overrides.createdBy ?? null,
        },
      ),
    )
    .$returningId();
  return { id: row.id, code };
}

interface InsertPartnerLinkOverrides {
  status?: "pending" | "qualified" | "revoked";
  attributionChannel?: "self_service" | "assisted";
  benefitType?: PartnerBenefitType;
  benefitValue?: number;
  benefitStatus?: "pending" | "consumed" | "expired";
  benefitExpiresAt?: Date;
  appliedPercent?: number | null;
  appliedAmount?: number | null;
  appliedSubscriptionId?: number | null;
  appliedReason?: string | null;
  qualifiedAt?: Date | null;
  createdBy?: number | null;
  tenantId?: number;
}

/** INSERT crudo en `partner_referrals`, con `benefit_expires_at` a 30 días. */
export async function insertPartnerLink(
  app: FastifyInstance,
  params: {
    partnerId: number;
    referredId: number;
  } & InsertPartnerLinkOverrides,
): Promise<{ id: number }> {
  const { partnerId, referredId, ...overrides } = params;
  const expiresAt =
    overrides.benefitExpiresAt ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [row] = await app.db
    .insert(schema.partnerReferrals)
    .values(
      tenantValues(
        { tenantId: overrides.tenantId ?? 1 },
        {
          partnerId,
          referredId,
          status: overrides.status ?? "pending",
          attributionChannel: overrides.attributionChannel ?? "self_service",
          benefitType: overrides.benefitType ?? "discount_percent",
          benefitValue: overrides.benefitValue ?? 20,
          benefitStatus: overrides.benefitStatus ?? "pending",
          benefitExpiresAt: expiresAt,
          appliedPercent: overrides.appliedPercent ?? null,
          appliedAmount: overrides.appliedAmount ?? null,
          appliedSubscriptionId: overrides.appliedSubscriptionId ?? null,
          appliedReason: overrides.appliedReason ?? null,
          qualifiedAt: overrides.qualifiedAt ?? null,
          createdBy: overrides.createdBy ?? null,
        },
      ),
    )
    .$returningId();
  return { id: row.id };
}

export interface PartnerReferralRawRow {
  id: number;
  tenant_id: number;
  partner_id: number;
  referred_id: number;
  status: string;
  attribution_channel: string;
  benefit_type: string;
  benefit_value: number;
  benefit_status: string;
  benefit_expires_at: Date;
  qualified_at: Date | null;
}

/** La fila cruda del vínculo — se afirma sobre el SQL, no sobre el DTO. */
export async function partnerLinkRow(
  app: FastifyInstance,
  referredId: number,
): Promise<PartnerReferralRawRow | null> {
  const rows = await app.db.execute(
    sql`SELECT id, tenant_id, partner_id, referred_id, status, attribution_channel,
               benefit_type, benefit_value, benefit_status, benefit_expires_at, qualified_at
        FROM partner_referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as PartnerReferralRawRow[];
  return list.length > 0 ? list[0] : null;
}

export interface PartnerCommissionRawRow {
  id: number;
  tenant_id: number;
  partner_id: number;
  partner_referral_id: number;
  user_id: number;
  subscription_id: number;
  amount: number;
  currency: string;
  status: string;
}

/** Las filas crudas de comisión de un cargo — se afirma sobre el SQL. */
export async function partnerCommissionRows(
  app: FastifyInstance,
  subscriptionId: number,
): Promise<PartnerCommissionRawRow[]> {
  const rows = await app.db.execute(
    sql`SELECT id, tenant_id, partner_id, partner_referral_id, user_id, subscription_id,
               amount, currency, status
        FROM partner_commissions WHERE subscription_id = ${subscriptionId}`,
  );
  return rows[0] as unknown as PartnerCommissionRawRow[];
}
