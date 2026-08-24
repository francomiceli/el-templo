/**
 * Fase 175 Plan 02 (T-175-02, ADO-06) — supresión de `campaign_unsubscribes`
 * POR TENANT, end-to-end. Cierra la mina M3 (doc 06 §8-Q5).
 *
 * POR QUÉ ESTE ARCHIVO Y NO campaigns-tracking.test.ts
 * ------------------------------------------------------
 * `campaigns-tracking.test.ts` (Phase 119) prueba las rutas públicas contra
 * UN SOLO gimnasio (El Templo, tenant 1) — nunca pudo probar aislamiento entre
 * dos porque el token no lleva `tenantId` y el código, hasta este plan, no lo
 * derivaba de ningún lado (`campaign_events`/`campaign_unsubscribes` caían
 * siempre en el DEFAULT(1)). Este archivo es el gemelo cross-tenant: sede el
 * gimnasio 2 (`seedSecondTenant`) y arma un `campaign_send` en CADA gimnasio
 * para el MISMO email — el escenario real de la mina (dos socios de gimnasios
 * distintos que, por coincidencia o porque son la misma persona en dos
 * gimnasios, comparten dirección de correo).
 *
 * POR QUÉ EL OPT-OUT SE DISPARA DESDE EL GIMNASIO 2 (no El Templo)
 * -------------------------------------------------------------------
 * `TENANT_DOS = 90671` (`fixtures/second-tenant.ts`), mientras que El Templo
 * es el tenant 1 — que es tambien el DEFAULT de la columna `tenant_id`
 * (`tenant-column.ts`). Si el test unsuscribiera desde El Templo y solo
 * verificara "hay una fila con tenant_id=1", una regresión que borrara el
 * `tenantValues(...)` de `recordUnsubscribe` (la fila cae en el DEFAULT 1)
 * pasaría el test SIN QUE NADIE LO NOTE — el número correcto y el número del
 * bug coinciden. Disparando el opt-out desde el gimnasio 2 el DEFAULT y el
 * valor correcto DIVERGEN: una regresión que pierda `tenantValues` hace que
 * la fila aparezca con `tenant_id=1` (El Templo) en vez de `tenant_id=90671`,
 * y la aserción "0 filas en El Templo" la atrapa en el acto.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createEligibleFreemium } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { signCampaignToken } from "../../src/modules/campaigns/token-service";
import { CampaignService } from "../../src/modules/campaigns/service";
import { EmailService } from "../../src/modules/email/service";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import * as schema from "../../src/db/schema";

let app: FastifyInstance;
let ownerId: number;
let gym2: SegundoGimnasio;

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

const MARCA = "T17502";

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX_TEMPLO),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ownerId = owner.id;
});

/**
 * Siembra una campaña + un `campaign_send` en `ctx`, para `userId`/`email`, y
 * devuelve el token firmado que las rutas públicas de tracking consumen.
 * Inserta directo (no hay endpoint admin en el alcance de este plan) con
 * `tenantValues(ctx, ...)` — el mismo INSERT que hace `send()` (175-01).
 */
async function seedSend(
  ctx: TenantContext,
  createdBy: number,
  userId: number,
  email: string,
): Promise<{ campaignId: number; sendId: number; token: string }> {
  const [campaign] = await app.db
    .insert(schema.campaigns)
    .values(
      tenantValues(ctx, {
        name: `${MARCA} campaign ${ctx.tenantId} ${sufijo()}`,
        subject: "Test",
        status: "draft",
        createdBy,
      }),
    )
    .$returningId();

  const [send] = await app.db
    .insert(schema.campaignSends)
    .values(
      tenantValues(ctx, {
        campaignId: campaign.id,
        userId,
        email,
        status: "sent",
      }),
    )
    .$returningId();

  const token = signCampaignToken({
    userId,
    campaignId: campaign.id,
    sendId: send.id,
  });

  return { campaignId: campaign.id, sendId: send.id, token };
}

describe("campaign tracking: supresión de unsubscribes POR TENANT (T-175-02, mina M3)", () => {
  it("D-15/T-175-02: un opt-out del gimnasio 2 NO crea fila en El Templo, aunque compartan email", async () => {
    const suf = sufijo();
    const sharedEmail = `${MARCA.toLowerCase()}-${suf}@test.com`;

    // Mismo email, DOS socios distintos, en DOS gimnasios distintos.
    const userTemplo = await createEligibleFreemium(app, {
      email: sharedEmail,
      tenantId: TENANT_TEMPLO,
    });
    const userDos = await createEligibleFreemium(app, {
      email: sharedEmail,
      tenantId: TENANT_DOS,
      branchId: gym2.branchId,
    });

    // Un send por gimnasio, mismo email. El opt-out se dispara desde el
    // gimnasio 2 (ver docblock del archivo — el DEFAULT es 1, no 90671).
    const sendDos = await seedSend(
      CTX_DOS,
      gym2.adminId,
      userDos.id,
      sharedEmail,
    );
    await seedSend(CTX_TEMPLO, ownerId, userTemplo.id, sharedEmail);

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/unsubscribe?t=${encodeURIComponent(sendDos.token)}`,
    });
    expect(res.statusCode).toBe(200);
    // Anti-enumeration (D-15): la página nunca ecoa el email suprimido.
    expect(res.body).not.toContain(sharedEmail);

    // (1) exactamente una fila, en el gimnasio 2, para ese email.
    const filasDos = await app.db
      .select()
      .from(schema.campaignUnsubscribes)
      .where(
        and(
          tenantWhere(schema.campaignUnsubscribes, CTX_DOS),
          eq(schema.campaignUnsubscribes.email, sharedEmail),
        ),
      );
    expect(filasDos).toHaveLength(1);
    expect(filasDos[0].userId).toBe(userDos.id);
    expect(filasDos[0].campaignId).toBe(sendDos.campaignId);

    // (2) CERO filas en El Templo (tenant_id=1) para el mismo email — esta es
    // la aserción que atrapa una regresión de `tenantValues` (el DEFAULT de
    // la columna es justamente 1).
    const filasTemplo = await app.db
      .select()
      .from(schema.campaignUnsubscribes)
      .where(
        and(
          tenantWhere(schema.campaignUnsubscribes, CTX_TEMPLO),
          eq(schema.campaignUnsubscribes.email, sharedEmail),
        ),
      );
    expect(filasTemplo).toHaveLength(0);

    // (3) el criterio de supresión de la audiencia (listEligible, D-15) NO
    // excluye al socio de El Templo: el opt-out del gimnasio 2 no lo alcanza.
    const service = new CampaignService(app.db, app.log, new EmailService(app.log));
    const elegiblesTemplo = await service.listEligible(CTX_TEMPLO);
    expect(elegiblesTemplo.some((u) => u.email === sharedEmail)).toBe(true);

    // (4) y, en espejo, el socio DEL gimnasio 2 SÍ queda fuera de SU propia
    // audiencia — el opt-out sí suprime dentro de su propio tenant.
    const elegiblesDos = await service.listEligible(CTX_DOS);
    expect(elegiblesDos.some((u) => u.email === sharedEmail)).toBe(false);
  });

  it("D-18/T-175-02: recordOpen/recordClick estampan el tenant_id derivado del send (no el DEFAULT)", async () => {
    const suf = sufijo();
    const email = `${MARCA.toLowerCase()}-open-${suf}@test.com`;
    const userDos = await createEligibleFreemium(app, {
      email,
      tenantId: TENANT_DOS,
      branchId: gym2.branchId,
    });
    const sendDos = await seedSend(CTX_DOS, gym2.adminId, userDos.id, email);

    const openRes = await app.inject({
      method: "GET",
      url: `/api/campaigns/track/open?t=${encodeURIComponent(sendDos.token)}`,
    });
    expect(openRes.statusCode).toBe(200);

    const clickRes = await app.inject({
      method: "GET",
      url: `/api/campaigns/track/click?t=${encodeURIComponent(sendDos.token)}`,
    });
    expect(clickRes.statusCode).toBe(302);

    const eventos = await app.db
      .select()
      .from(schema.campaignEvents)
      .where(
        and(
          tenantWhere(schema.campaignEvents, CTX_DOS),
          eq(schema.campaignEvents.sendId, sendDos.sendId),
        ),
      );
    expect(eventos.map((e) => e.type).sort()).toEqual(["click", "open"]);

    // Ningún evento cae en El Templo (DEFAULT 1) por falta de tenantValues.
    const eventosTemplo = await app.db
      .select()
      .from(schema.campaignEvents)
      .where(
        and(
          tenantWhere(schema.campaignEvents, CTX_TEMPLO),
          eq(schema.campaignEvents.sendId, sendDos.sendId),
        ),
      );
    expect(eventosTemplo).toHaveLength(0);
  });

  it("D-21/T-175-02: un token con sendId inexistente no crashea la ruta pública (no-op silencioso)", async () => {
    // sendId negativo: garantizado a no resolver ninguna fila real de
    // campaign_sends (PK autoincrement, siempre positiva) sin depender de
    // ningún valor puntual de la secuencia (que crece entre corridas).
    const fakeToken = signCampaignToken({
      userId: 1,
      campaignId: 1,
      sendId: -1,
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/unsubscribe?t=${encodeURIComponent(fakeToken)}`,
    });
    expect(res.statusCode).toBe(200);

    const filas = await app.db
      .select()
      .from(schema.campaignUnsubscribes)
      .where(
        sql`/* tenant-safe: aserción de vacío sobre la corrida de este test, sendId inexistente no crea fila */ 1 = 1`,
      );
    expect(filas).toHaveLength(0);
  });
});
