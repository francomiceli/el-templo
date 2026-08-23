/**
 * Fase 179 Plan 04 (D-12) — exclusividad de origen: un socio tiene UN
 * origen, `referrals` (socio) XOR `partner_referrals` (comercio partner),
 * nunca ambos.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. `PartnerReferralService.attributePartnerAtSignup` se DEGRADA EN
 *     SILENCIO (devuelve `null`, no lanza) cuando el socio ya tiene CUALQUIER
 *     origen — `referrals` o `partner_referrals` — sin el 409 visible que sí
 *     tiene la asignación retroactiva (179-08, ficha del alumno).
 *  2. La carrera del UNIQUE compuesto (`referred_id`) se atrapa: un segundo
 *     intento de vínculo nunca deja 2 filas ni escapa una excepción.
 *  3. El constraint de base es la garantía última, no la app: dos INSERT
 *     crudos con el mismo `referred_id` — el segundo SIEMPRE falla
 *     (`ER_DUP_ENTRY`), independientemente de cualquier chequeo previo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import { referrals } from "../../src/db/schema/referrals";
import { partnerReferrals } from "../../src/db/schema/partner-referrals";
import { tenantValues } from "../../src/modules/shared/tenant";
import { PartnerReferralService } from "../../src/modules/referral-partners/service";
import { insertPartner, insertPartnerLink, partnerLinkRow } from "./_helpers";

let app: FastifyInstance;
let service: PartnerReferralService;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1.

beforeAll(async () => {
  app = await createTestApp();
  service = new PartnerReferralService(app.db, app.log);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

/** Narrowing local del error de clave duplicada (mismo criterio que `service.ts`). */
function isDupKeyError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === "object") {
      const e = current as { code?: string; errno?: number; cause?: unknown };
      if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
      current = e.cause;
    } else {
      break;
    }
  }
  return false;
}

async function countPartnerLinks(referredId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT COUNT(*) AS c FROM partner_referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as { c: number }[];
  return Number(list[0]?.c ?? 0);
}

describe("attributePartnerAtSignup — exclusividad de origen (D-12)", () => {
  it("un socio con fila previa en referrals NO recibe vínculo de partner (skip silencioso)", async () => {
    const referrer = await createMember(app, {
      email: `origen-referrer-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    const socio = await createMember(app, {
      email: `origen-socio-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });

    // Origen preexistente: fila en `referrals` (socio referido por otro
    // socio), insertada cruda — no vía /register, para aislar el chequeo.
    await app.db.insert(referrals).values(
      tenantValues(
        { tenantId: 1 },
        {
          referrerId: referrer.id,
          referredId: socio.id,
          status: "pending" as const,
          attributionChannel: "self_service" as const,
        },
      ),
    );

    const partner = await insertPartner(app, {
      benefitType: "discount_percent",
      benefitValue: 15,
    });

    const result = await service.attributePartnerAtSignup({
      partnerId: partner.id,
      tenantId: 1,
      referredId: socio.id,
      benefitType: "discount_percent",
      benefitValue: 15,
    });

    expect(result).toBeNull();
    const row = await partnerLinkRow(app, socio.id);
    expect(row).toBeNull();
  });

  it("un socio con partner_referrals previo NO recibe un segundo vínculo (UNIQUE, sin excepción hacia afuera)", async () => {
    const socio = await createMember(app, {
      email: `origen-doble-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    const partnerA = await insertPartner(app, { benefitType: "free_pass", benefitValue: 0 });
    const partnerB = await insertPartner(app, {
      benefitType: "discount_percent",
      benefitValue: 20,
    });

    const { id: existingLinkId } = await insertPartnerLink(app, {
      partnerId: partnerA.id,
      referredId: socio.id,
    });

    const result = await service.attributePartnerAtSignup({
      partnerId: partnerB.id,
      tenantId: 1,
      referredId: socio.id,
      benefitType: "discount_percent",
      benefitValue: 20,
    });

    expect(result).toBeNull();
    expect(await countPartnerLinks(socio.id)).toBe(1);
    const row = await partnerLinkRow(app, socio.id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(existingLinkId);
    expect(row!.partner_id).toBe(partnerA.id);
  });

  it("findOriginForMember devuelve el origen correcto (member/partner/null)", async () => {
    const sinOrigen = await createMember(app, {
      email: `origen-null-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    expect(await service.findOriginForMember({ tenantId: 1 }, sinOrigen.id)).toBeNull();

    const referrer = await createMember(app, {
      email: `origen-member-referrer-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    const conOrigenMember = await createMember(app, {
      email: `origen-member-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    await app.db.insert(referrals).values(
      tenantValues(
        { tenantId: 1 },
        {
          referrerId: referrer.id,
          referredId: conOrigenMember.id,
          status: "pending" as const,
          attributionChannel: "self_service" as const,
        },
      ),
    );
    expect(
      await service.findOriginForMember({ tenantId: 1 }, conOrigenMember.id),
    ).toEqual({ kind: "member" });

    const conOrigenPartner = await createMember(app, {
      email: `origen-partner-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    const partner = await insertPartner(app);
    const { id: linkId } = await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: conOrigenPartner.id,
    });
    expect(
      await service.findOriginForMember({ tenantId: 1 }, conOrigenPartner.id),
    ).toEqual({ kind: "partner", partnerId: partner.id, linkId });
  });
});

describe("Constraint UNIQUE(referred_id) de partner_referrals — garantía de base (D-12)", () => {
  it("dos INSERT crudos con el mismo referred_id: el segundo falla con ER_DUP_ENTRY", async () => {
    const socio = await createMember(app, {
      email: `origen-constraint-${Date.now()}@test.com`,
      branchId: AR_BRANCH_ID,
    });
    const partnerA = await insertPartner(app);
    const partnerB = await insertPartner(app);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await app.db.insert(partnerReferrals).values(
      tenantValues(
        { tenantId: 1 },
        {
          partnerId: partnerA.id,
          referredId: socio.id,
          status: "pending" as const,
          attributionChannel: "self_service" as const,
          benefitType: "discount_percent" as const,
          benefitValue: 10,
          benefitStatus: "pending" as const,
          benefitExpiresAt: expiresAt,
        },
      ),
    );

    let caught: unknown = null;
    try {
      await app.db.insert(partnerReferrals).values(
        tenantValues(
          { tenantId: 1 },
          {
            partnerId: partnerB.id,
            referredId: socio.id,
            status: "pending" as const,
            attributionChannel: "self_service" as const,
            benefitType: "discount_percent" as const,
            benefitValue: 20,
            benefitStatus: "pending" as const,
            benefitExpiresAt: expiresAt,
          },
        ),
      );
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(isDupKeyError(caught)).toBe(true);
    expect(await countPartnerLinks(socio.id)).toBe(1);
  });
});
