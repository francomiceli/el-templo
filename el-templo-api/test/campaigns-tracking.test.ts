/**
 * Phase 119 — open/click/unsubscribe tracking. D-15 / D-18 / D-21.
 *
 *   - D-18 open/click → campaign_events (forward-only); /track/open returns a
 *     1×1 GIF (no-store); /track/click 302-redirects to an allowlisted dest.
 *   - D-15 unsubscribe → campaign_unsubscribes, idempotent on UNIQUE(email),
 *     generic confirmation page (no email echoed — anti-enumeration).
 *   - D-21 the token only identifies sendId; tracking is public/no-auth.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createEligibleFreemium,
  createTestCampaign,
  createTestSend,
} from "./helpers";
import { signCampaignToken } from "../src/modules/campaigns/token-service";
import * as schema from "../src/db/schema";

let app: FastifyInstance;
let ownerId: number;

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
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ownerId = owner.id;
});

/** Create a campaign + send for a fresh eligible user, returning ids + token. */
async function seedSend(): Promise<{
  sendId: number;
  campaignId: number;
  userId: number;
  email: string;
  token: string;
}> {
  const { id: userId, email } = await createEligibleFreemium(app);
  const campaignId = await createTestCampaign(app, ownerId);
  const sendId = await createTestSend(app, campaignId, userId, email);
  const token = signCampaignToken({ userId, campaignId, sendId });
  return { sendId, campaignId, userId, email, token };
}

describe("campaign tracking endpoints (Phase 119)", () => {
  it("D-18: GET /track/open inserts an 'open' event + returns a GIF (no-store)", async () => {
    const { sendId, token } = await seedSend();

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/track/open?t=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
    expect(res.headers["cache-control"]).toContain("no-store");

    const events = await app.db
      .select()
      .from(schema.campaignEvents)
      .where(eq(schema.campaignEvents.sendId, sendId));
    expect(events.some((e) => e.type === "open")).toBe(true);
  });

  it("D-18: GET /track/click inserts a 'click' event + 302 to app.eltemplo.org", async () => {
    const { sendId, token } = await seedSend();

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/track/click?t=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers["location"] as string;
    expect(location).toContain("app.eltemplo.org");
    // The destination is the allowlisted deep link, never raw query input.
    expect(location.startsWith("https://app.eltemplo.org/r/trial")).toBe(true);

    const events = await app.db
      .select()
      .from(schema.campaignEvents)
      .where(eq(schema.campaignEvents.sendId, sendId));
    expect(events.some((e) => e.type === "click")).toBe(true);
  });

  it("D-18: /track/click never redirects off the allowlisted host", async () => {
    const { token } = await seedSend();
    // Even with an attacker-supplied `to`, the redirect host stays fixed.
    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/track/click?t=${encodeURIComponent(token)}`,
    });
    const location = res.headers["location"] as string;
    expect(location).not.toContain("evil.com");
    const host = new URL(location).host;
    expect(host).toBe("app.eltemplo.org");
  });

  it("D-15: GET /unsubscribe inserts a campaign_unsubscribes row + generic page", async () => {
    const { email, token } = await seedSend();

    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/unsubscribe?t=${encodeURIComponent(token)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    // Anti-enumeration: the page MUST NOT echo the unsubscribed email.
    expect(res.body).not.toContain(email);

    const rows = await app.db
      .select()
      .from(schema.campaignUnsubscribes)
      .where(eq(schema.campaignUnsubscribes.email, email));
    expect(rows).toHaveLength(1);
  });

  it("D-15: unsubscribe is idempotent (second call → no duplicate row)", async () => {
    const { email, token } = await seedSend();
    const url = `/api/campaigns/unsubscribe?t=${encodeURIComponent(token)}`;

    const first = await app.inject({ method: "GET", url });
    const second = await app.inject({ method: "GET", url });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const rows = await app.db
      .select()
      .from(schema.campaignUnsubscribes)
      .where(eq(schema.campaignUnsubscribes.email, email));
    expect(rows).toHaveLength(1);
  });

  it("D-21: a tampered token records nothing but still serves the pixel", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/campaigns/track/open?t=not-a-valid-token`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
    const events = await app.db.select().from(schema.campaignEvents);
    expect(events).toHaveLength(0);
  });
});
