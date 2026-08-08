/**
 * Fase 173 — endpoint admin POST /api/admin/members/:id/referrals.
 *
 * Atribución RETROACTIVA de referidor sobre un socio ya creado. El canal
 * asistido de la 157 solo atribuye DENTRO del alta, y en la operación real el
 * dato llega después: entre el deploy de la 157 (2026-07-14) y el 2026-08-04
 * hubo 352 altas y CERO vínculos `assisted` — el caso testigo es Guido Recoulat
 * (alta asistida 11:46) contra Valentina Rossi (compartió su código 13:07).
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. El vínculo creado acá es INDISTINGUIBLE del que crea el alta: mismo canal,
 *     misma `copy_variant`, y `qualifyFirstPayment` lo flippea igual. Si esto se
 *     rompe, el descuento no llega y nadie se entera hasta que un socio reclama.
 *  2. El estado inicial usa el criterio del cobro (D-20, `pricePaid > 0`) y no
 *     "el socio está activo".
 *  3. Las reglas heredadas siguen valiendo: D-13 (auto-referral), D-14 (un solo
 *     referidor, incluso bajo carrera), guard de rol y country-scope.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { createPlan, createMember } from "../subscriptions/_helpers";
import { ReferralService } from "../../src/modules/referrals/service";
import type { TenantContext } from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";

// T-173-08: `qualifyFirstPayment` recibe `ctx` primero.
const CTX: TenantContext = { tenantId: 1 };

const MEMBER_PASSWORD = "pass123456";

interface AssignBody {
  status: "pending" | "qualified";
  referrerId: number;
  referredId: number;
}

interface ReferralRow {
  referrer_id: number;
  referred_id: number;
  status: string;
  attribution_channel: string;
  copy_variant: string | null;
  created_by: number | null;
  qualified_at: Date | null;
  tenant_id: number;
}

function url(userId: number): string {
  return `/api/admin/members/${userId}/referrals`;
}

let app: FastifyInstance;
let adminToken: string;
let esBranchId: number;

// Branches NO están en TABLES_TO_CLEAN — código único por corrida para evitar
// colisiones UNIQUE entre archivos del mismo worker (patrón del endpoint GET).
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

/** La fila cruda del vínculo — se afirma sobre el SQL, no sobre el DTO. */
async function referralRow(referredId: number): Promise<ReferralRow | null> {
  const rows = await app.db.execute(
    sql`SELECT referrer_id, referred_id, status, attribution_channel,
               copy_variant, created_by, qualified_at, tenant_id
        FROM referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as ReferralRow[];
  return list.length > 0 ? list[0] : null;
}

async function referredByOf(userId: number): Promise<number | null> {
  const rows = await app.db.execute(
    sql`SELECT referred_by FROM users WHERE id = ${userId}`,
  );
  const list = rows[0] as unknown as Array<{ referred_by: number | null }>;
  return list[0]?.referred_by ?? null;
}

/** Cobro consumado: lo que hace `qualified` a un vínculo (D-20). */
async function givePaidSubscription(
  userId: number,
  planId: number,
  pricePaid: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status,
                                   start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${userId}, ${planId}, 1, 'active', ${todayStr()},
                ${dateOffsetStr(30)}, ${pricePaid}, 'ARS', 'regular')`,
  );
}

async function assign(
  targetId: number,
  referrerId: number,
  token = adminToken,
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: "POST",
    url: url(targetId),
    headers: { authorization: `Bearer ${token}` },
    payload: { referrerId },
  });
  return { statusCode: res.statusCode, body: res.body };
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-AssignRef-Test",
      code: nextSuffix("ESAR"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  esBranchId = es.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', 10)
        ON DUPLICATE KEY UPDATE default_amount = 10`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', '40')
        ON DUPLICATE KEY UPDATE setting_value = '40'`,
  );
});

describe("POST /api/admin/members/:id/referrals — atribución retroactiva", () => {
  it("crea el vínculo pending cuando el socio todavía no pagó (caso Guido)", async () => {
    const target = await createMember(app, { email: "ar-guido@test.com" });
    const referrer = await createMember(app, { email: "ar-vale@test.com" });

    const res = await assign(target.id, referrer.id);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as AssignBody;
    expect(body.status).toBe("pending");
    expect(body.referrerId).toBe(referrer.id);
    expect(body.referredId).toBe(target.id);

    const row = await referralRow(target.id);
    expect(row).not.toBeNull();
    expect(row?.referrer_id).toBe(referrer.id);
    expect(row?.status).toBe("pending");
    // Indistinguible del alta asistida (REF-03/D-08).
    expect(row?.attribution_channel).toBe("assisted");
    // Un vínculo pending NO tiene fecha de cualificación.
    expect(row?.qualified_at).toBeNull();
    // Espejo desnormalizado, igual que las dos vías de la 157.
    expect(await referredByOf(target.id)).toBe(referrer.id);
  });

  it("estampa copy_variant y created_by igual que el alta asistida", async () => {
    const target = await createMember(app, { email: "ar-cv-t@test.com" });
    const referrer = await createMember(app, { email: "ar-cv-r@test.com" });

    expect((await assign(target.id, referrer.id)).statusCode).toBe(201);

    const row = await referralRow(target.id);
    // La variante se DERIVA del id del referidor (par='A' / impar='B'), nunca
    // del cliente — misma regla que ab-variant.ts.
    expect(row?.copy_variant).toBe(referrer.id % 2 === 0 ? "A" : "B");
    // Queda registrado QUIÉN atribuyó: es el rastro de auditoría de una
    // operación que mueve plata.
    expect(row?.created_by).not.toBeNull();
  });

  it("nace qualified si el socio YA pagó un plan (D-20)", async () => {
    const plan = await createPlan(app, adminToken);
    const target = await createMember(app, { email: "ar-paid-t@test.com" });
    const referrer = await createMember(app, { email: "ar-paid-r@test.com" });
    await givePaidSubscription(target.id, plan.id as number, 15000);

    const res = await assign(target.id, referrer.id);
    expect(res.statusCode).toBe(201);
    expect((JSON.parse(res.body) as AssignBody).status).toBe("qualified");

    const row = await referralRow(target.id);
    expect(row?.status).toBe("qualified");
    // Se estampa el momento de la atribución, no la fecha del pago viejo.
    expect(row?.qualified_at).not.toBeNull();
  });

  it("queda pending si el único cargo fue 100% bonificado (pricePaid = 0)", async () => {
    const plan = await createPlan(app, adminToken);
    const target = await createMember(app, { email: "ar-free-t@test.com" });
    const referrer = await createMember(app, { email: "ar-free-r@test.com" });
    // El "mes fantasma" que D-20 excluye a propósito: hay suscripción, no hay cobro.
    await givePaidSubscription(target.id, plan.id as number, 0);

    const res = await assign(target.id, referrer.id);
    expect((JSON.parse(res.body) as AssignBody).status).toBe("pending");
  });

  // El test que más importa: el vínculo retroactivo tiene que comportarse
  // EXACTAMENTE como uno nativo aguas abajo. Si esto se rompe, el endpoint
  // "funciona" (201, fila creada) y el descuento nunca llega.
  it("el vínculo retroactivo cualifica en el primer pago y habilita el descuento simétrico", async () => {
    const plan = await createPlan(app, adminToken);
    const target = await createMember(app, { email: "ar-flow-t@test.com" });
    const referrer = await createMember(app, { email: "ar-flow-r@test.com" });

    expect((await assign(target.id, referrer.id)).statusCode).toBe(201);

    const service = new ReferralService(app.db, app.log);

    // Pending: todavía no aporta descuento a ninguno de los dos lados.
    expect(await service.computeReferralDiscountPercent(referrer.id)).toBe(0);

    // El hook del cobro encuentra el vínculo y lo flippea, sin saber que se
    // creó retroactivamente.
    const flipped = await service.qualifyFirstPayment(CTX, target.id);
    expect(flipped?.referrerId).toBe(referrer.id);

    // Con ambas partes cubiertas, el descuento simétrico corre para los dos.
    await givePaidSubscription(target.id, plan.id as number, 15000);
    await givePaidSubscription(referrer.id, plan.id as number, 15000);
    expect(await service.computeReferralDiscountPercent(referrer.id)).toBe(10);
    expect(await service.computeReferralDiscountPercent(target.id)).toBe(10);
  });

  it("el gimnasio sale del scope del request, no del body (mass-assignment)", async () => {
    const target = await createMember(app, { email: "ar-mass-t@test.com" });
    const referrer = await createMember(app, { email: "ar-mass-r@test.com" });

    const res = await app.inject({
      method: "POST",
      url: url(target.id),
      headers: { authorization: `Bearer ${adminToken}` },
      // Campos hostiles: si alguno pegara, el vínculo caería en otro gimnasio o
      // nacería cualificado sin haber pagado.
      payload: { referrerId: referrer.id, tenantId: 9999, status: "qualified" },
    });
    expect(res.statusCode).toBe(201);

    const row = await referralRow(target.id);
    expect(row?.tenant_id).toBe(1);
    expect(row?.status).toBe("pending");
  });

  describe("reglas heredadas de la 157", () => {
    it("400 si el socio se refiere a sí mismo (D-13)", async () => {
      const target = await createMember(app, { email: "ar-self@test.com" });
      const res = await assign(target.id, target.id);
      expect(res.statusCode).toBe(400);
      expect(await referralRow(target.id)).toBeNull();
    });

    it("409 si el socio ya tiene un referidor (D-14)", async () => {
      const target = await createMember(app, { email: "ar-dup-t@test.com" });
      const first = await createMember(app, { email: "ar-dup-1@test.com" });
      const second = await createMember(app, { email: "ar-dup-2@test.com" });

      expect((await assign(target.id, first.id)).statusCode).toBe(201);
      expect((await assign(target.id, second.id)).statusCode).toBe(409);

      // El primero sobrevive intacto: un 409 no puede reescribir la atribución.
      const row = await referralRow(target.id);
      expect(row?.referrer_id).toBe(first.id);
      expect(await referredByOf(target.id)).toBe(first.id);
    });

    it("404 si el referidor no existe", async () => {
      const target = await createMember(app, { email: "ar-nor@test.com" });
      const res = await assign(target.id, 99999999);
      expect(res.statusCode).toBe(404);
      // A diferencia del alta (que degrada a "sin atribución"), acá NO se crea
      // nada: fallar en silencio dejaría al admin creyendo que cargó el vínculo.
      expect(await referralRow(target.id)).toBeNull();
    });

    it("404 si el referidor está soft-deleted", async () => {
      const target = await createMember(app, { email: "ar-delr-t@test.com" });
      const referrer = await createMember(app, { email: "ar-delr-r@test.com" });
      await app.db.execute(
        sql`UPDATE users SET deleted_at = NOW() WHERE id = ${referrer.id}`,
      );
      expect((await assign(target.id, referrer.id)).statusCode).toBe(404);
      expect(await referralRow(target.id)).toBeNull();
    });

    it("400 si falta referrerId en el body", async () => {
      const target = await createMember(app, { email: "ar-nobody@test.com" });
      const res = await app.inject({
        method: "POST",
        url: url(target.id),
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("guard de acceso (mismo que el GET)", () => {
    it("404 para un miembro objetivo inexistente", async () => {
      const referrer = await createMember(app, { email: "ar-g404@test.com" });
      expect((await assign(99999999, referrer.id)).statusCode).toBe(404);
    });

    it("404 para un miembro objetivo soft-deleted", async () => {
      const target = await createMember(app, { email: "ar-gdel-t@test.com" });
      const referrer = await createMember(app, { email: "ar-gdel-r@test.com" });
      await app.db.execute(
        sql`UPDATE users SET deleted_at = NOW() WHERE id = ${target.id}`,
      );
      expect((await assign(target.id, referrer.id)).statusCode).toBe(404);
    });

    it("401 sin token", async () => {
      const target = await createMember(app, { email: "ar-401@test.com" });
      const res = await app.inject({
        method: "POST",
        url: url(target.id),
        payload: { referrerId: 1 },
      });
      expect(res.statusCode).toBe(401);
    });

    it("403 para un token de socio", async () => {
      const target = await createMember(app, { email: "ar-403t@test.com" });
      const referrer = await createMember(app, { email: "ar-403r@test.com" });
      await createMember(app, { email: "ar-socio@test.com" });
      const socioToken = await getAuthToken(
        app,
        "ar-socio@test.com",
        MEMBER_PASSWORD,
      );
      const res = await assign(target.id, referrer.id, socioToken);
      expect(res.statusCode).toBe(403);
      expect(await referralRow(target.id)).toBeNull();
    });

    // WR-05: recepción carga el alta pero NO atribuye referidos — decidir a
    // quién se le acredita un descuento es de gestión para arriba.
    it("403 para recepción", async () => {
      const target = await createMember(app, { email: "ar-rec-t@test.com" });
      const referrer = await createMember(app, { email: "ar-rec-r@test.com" });
      await createStaffUser(app, {
        email: "ar-recepcion@test.local",
        password: MEMBER_PASSWORD,
        firstName: "Recep",
        lastName: "Cion",
        role: "recepcion",
        branchId: 1,
      });
      const recepToken = await getAuthToken(
        app,
        "ar-recepcion@test.local",
        MEMBER_PASSWORD,
      );
      const res = await assign(target.id, referrer.id, recepToken);
      expect(res.statusCode).toBe(403);
      expect(await referralRow(target.id)).toBeNull();
    });

    it("cross-country: admin ES (no-owner) recibe 404 para un alumno AR", async () => {
      const target = await createMember(app, { email: "ar-xc-t@test.com" });
      const referrer = await createMember(app, { email: "ar-xc-r@test.com" });
      await createStaffUser(app, {
        email: "ar-admin-es@test.local",
        password: MEMBER_PASSWORD,
        firstName: "Admin",
        lastName: "ES",
        role: "admin",
        branchId: esBranchId,
      });
      const esToken = await getAuthToken(
        app,
        "ar-admin-es@test.local",
        MEMBER_PASSWORD,
      );
      const res = await assign(target.id, referrer.id, esToken);
      expect(res.statusCode).toBe(404);
      expect(await referralRow(target.id)).toBeNull();
    });
  });
});
