/**
 * Phase 119 — campaign create + send pipeline. D-11 / D-12.
 *
 *   - D-12 create persists a draft campaign and returns it.
 *   - D-12 send creates one campaign_sends row per eligible user, records
 *     status='sent', and is idempotent on UNIQUE(campaign_id, user_id).
 *   - D-12 send batches via EmailService.sendCampaignBatch with an idempotencyKey.
 *   - D-11 send degrades gracefully when RESEND_API_KEY is unset (no key in the
 *     test env → sendCampaignBatch no-ops, send still records the audience).
 *
 * Resend is never instantiated in the test env (no RESEND_API_KEY) so the batch
 * call no-ops; we spy on sendCampaignBatch to assert the call shape.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createEligibleFreemium,
} from "./helpers";
import { CampaignService } from "../src/modules/campaigns/service";
import { EmailService } from "../src/modules/email/service";
import {
  tenantWhere,
  type TenantContext,
} from "../src/modules/shared/tenant";
import * as schema from "../src/db/schema";

let app: FastifyInstance;
let ownerId: number;

// T-173-08: `send()` recibe `ctx` primero (audiencia scopeada por gimnasio).
const CTX: TenantContext = { tenantId: 1 };

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ownerId = owner.id;
});

function makeService(email?: EmailService): CampaignService {
  return new CampaignService(
    app.db,
    app.log,
    email ?? new EmailService(app.log),
  );
}

describe("campaign create (Phase 119)", () => {
  it("D-12: create persists a draft campaign and returns it", async () => {
    const service = makeService();
    const campaign = await service.create(
      {
        name: "Sesión de prueba",
        subject: "Tu primera sesión es gratis",
        copySlots: { headline: "H", subheadline: "S", body: "B" },
      },
      ownerId,
    );

    expect(campaign.id).toBeGreaterThan(0);
    expect(campaign.status).toBe("draft");
    expect(campaign.name).toBe("Sesión de prueba");

    const [row] = await app.db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaign.id));
    expect(row.status).toBe("draft");
  });

  it("D-12: create rejects an empty name/subject", async () => {
    const service = makeService();
    await expect(
      service.create(
        {
          name: "  ",
          subject: "x",
          copySlots: { headline: "H", subheadline: "S", body: "B" },
        },
        ownerId,
      ),
    ).rejects.toThrow();
  });
});

describe("campaign send pipeline (Phase 119)", () => {
  it("D-12: send creates one campaign_sends row per eligible user", async () => {
    const { id: u1 } = await createEligibleFreemium(app);
    const { id: u2 } = await createEligibleFreemium(app);
    const service = makeService();
    const campaign = await service.create(
      {
        name: "Send Test",
        subject: "S",
        copySlots: { headline: "H", subheadline: "S", body: "B" },
      },
      ownerId,
    );

    const result = await service.send(CTX, campaign.id);
    expect(result.recipientCount).toBe(2);

    const sends = await app.db
      .select()
      .from(schema.campaignSends)
      .where(eq(schema.campaignSends.campaignId, campaign.id));
    const userIds = sends.map((s) => s.userId).sort();
    expect(userIds).toEqual([u1, u2].sort());
    // D-11/D-12: with no RESEND_API_KEY the batch no-ops but sends are recorded.
    expect(sends.every((s) => s.status === "sent")).toBe(true);
  });

  it("WR-01/WR-05: a second send is rejected — no duplicate rows", async () => {
    await createEligibleFreemium(app);
    const service = makeService();
    const campaign = await service.create(
      {
        name: "Idem",
        subject: "S",
        copySlots: { headline: "H", subheadline: "S", body: "B" },
      },
      ownerId,
    );

    const first = await service.send(CTX, campaign.id);
    expect(first.recipientCount).toBe(1);

    // The atomic status gate makes the mass-send single-shot: a second send on
    // an already-'sent' campaign is rejected, so the audience is never
    // re-enrolled (duplicate delivery prevented at the source, not just via
    // Resend's idempotency window).
    await expect(service.send(CTX, campaign.id)).rejects.toThrow(
      /ya fue enviada/i,
    );

    const sends = await app.db
      .select()
      .from(schema.campaignSends)
      .where(eq(schema.campaignSends.campaignId, campaign.id));
    expect(sends).toHaveLength(1);
  });

  it("D-12: send delegates to sendCampaignBatch with an idempotencyKey", async () => {
    await createEligibleFreemium(app);
    const email = new EmailService(app.log);
    const spy = vi
      .spyOn(email, "sendCampaignBatch")
      .mockResolvedValue(undefined);
    const service = makeService(email);
    const campaign = await service.create(
      {
        name: "Batch",
        subject: "S",
        copySlots: { headline: "H", subheadline: "S", body: "B" },
      },
      ownerId,
    );

    await service.send(CTX, campaign.id);

    expect(spy).toHaveBeenCalledTimes(1);
    const [messages, idempotencyKey] = spy.mock.calls[0];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toHaveProperty("to");
    expect(messages[0]).toHaveProperty("subject");
    expect(messages[0]).toHaveProperty("html");
    expect(idempotencyKey).toContain(`campaign-${campaign.id}-batch-`);
    spy.mockRestore();
  });

  it("D-11: send degrades gracefully when RESEND_API_KEY is unset", async () => {
    // No RESEND_API_KEY in the test env — sendCampaignBatch no-ops. send() must
    // not throw and must still record the audience.
    expect(process.env.RESEND_API_KEY).toBeFalsy();
    await createEligibleFreemium(app);
    const service = makeService();
    const campaign = await service.create(
      {
        name: "Degrade",
        subject: "S",
        copySlots: { headline: "H", subheadline: "S", body: "B" },
      },
      ownerId,
    );

    await expect(service.send(CTX, campaign.id)).resolves.toBeDefined();

    const [campaignRow] = await app.db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaign.id));
    expect(campaignRow.status).toBe("sent");
    expect(campaignRow.sentAt).not.toBeNull();
  });
});

describe("campaign test send (Phase 119)", () => {
  it("sends one [PRUEBA] preview without enrolling the audience or changing status", async () => {
    // An eligible freemium exists, but a test send must NOT enroll them.
    await createEligibleFreemium(app);
    const email = new EmailService(app.log);
    const spy = vi
      .spyOn(email, "sendCampaignTest")
      .mockResolvedValue(undefined);
    const service = makeService(email);
    const campaign = await service.create(
      {
        name: "Preview",
        subject: "Tu sesión de prueba",
        copySlots: { headline: "Headline", subheadline: "Sub", body: "Body" },
      },
      ownerId,
    );

    const result = await service.sendTest(
      campaign.id,
      "comunidad@eltemplo.org",
    );

    // The preview is delivered to exactly the requested address, subject-tagged.
    expect(spy).toHaveBeenCalledTimes(1);
    const [message] = spy.mock.calls[0];
    expect(message.to).toBe("comunidad@eltemplo.org");
    expect(message.subject).toMatch(/^\[PRUEBA\] /);
    expect(message.html).toContain("Headline");
    expect(result.to).toBe("comunidad@eltemplo.org");

    // Inert: no campaign_sends rows, status stays draft.
    const sends = await app.db
      .select()
      .from(schema.campaignSends)
      .where(eq(schema.campaignSends.campaignId, campaign.id));
    expect(sends).toHaveLength(0);
    const [row] = await app.db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaign.id));
    expect(row.status).toBe("draft");

    spy.mockRestore();
  });

  it("surfaces a Resend failure as an error (never a silent success)", async () => {
    const email = new EmailService(app.log);
    vi.spyOn(email, "sendCampaignTest").mockRejectedValue(
      new Error("You can only send testing emails to your own email address"),
    );
    const service = makeService(email);
    const campaign = await service.create(
      {
        name: "Preview Fail",
        subject: "S",
        copySlots: { headline: "H", subheadline: "S", body: "B" },
      },
      ownerId,
    );

    await expect(
      service.sendTest(campaign.id, "alguien@gmail.com"),
    ).rejects.toThrow(/No se pudo enviar la prueba/i);
  });
});
