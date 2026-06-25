/**
 * v5.3.3 Phase 100 — TAKE-02 takeover-ack integration test.
 *
 * End-to-end coverage for the rate-limited reassurance behavior when an
 * inbound arrives while `conversation_status = 'human_takeover'`:
 *  - Scenario 1: full flow. Seed conversation in human_takeover; send first
 *    inbound → assert 1 outbound = TAKEOVER_REASSURANCE_PHRASE; send second
 *    inbound within TTL window → assert 0 NEW outbounds; assert provider.chat
 *    mock NEVER invoked across both inbounds (T-100-07 "no AI in takeover"
 *    elevation-of-privilege mitigation).
 *  - Scenario 2: TTL expiry. Seed conversation in human_takeover, send
 *    inbound 1 (gets reassurance), then drop the Redis wa:takeover_ack:<phone>
 *    key (simulating natural TTL expiry); send inbound 2 → assert second
 *    reassurance fires (T-100-06 disposition: accept — "if takeover lasts >
 *    TTL and the lead messages again, a second ack is reasonable").
 *
 * The AI provider is mocked to THROW on any invocation. Both scenarios MUST
 * complete without the mock firing — this is the strongest possible "no AI
 * in takeover" guarantee under real DB + Fastify-inject conditions.
 *
 * Scaffolding mirrors v5-3-3-handler-concurrency.integration.test.ts
 * (Map-backed Redis mock + thrown-on-call AI provider mock + tracked
 * sendTextMessage mock + real MySQL `eltemplo_test` via drizzle). Zero
 * `el-templo-api/src/**` modifications — pure test authorship.
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
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import type { MetaWebhookPayload } from "../../../el-templo-bot/src/whatsapp/types";

// ─── Map-backed Redis mock ──────────────────────────────────────────────────
const redisStore = new Map<string, string>();
let redisAvailable = true;

async function mockRedisGet(key: string): Promise<string | null> {
  return redisStore.get(key) ?? null;
}
async function mockRedisSet(
  key: string,
  value: string,
  ...args: unknown[]
): Promise<string | null> {
  const flags = args.map((a) => String(a).toUpperCase());
  const isNX = flags.includes("NX");
  if (isNX && redisStore.has(key)) {
    return null;
  }
  redisStore.set(key, value);
  return "OK";
}
async function mockRedisDel(key: string): Promise<number> {
  return redisStore.delete(key) ? 1 : 0;
}
interface MockSessionMessage {
  role: string;
  content: string;
  timestamp: number;
}
interface MockSessionShape {
  messages: MockSessionMessage[];
  updatedAt: number;
}
async function mockRedisEval(
  script: string,
  _numKeys: number,
  key: string,
  ...argv: string[]
): Promise<number> {
  if (
    script.includes('redis.call("get"') &&
    script.includes("del") &&
    !script.includes("cjson")
  ) {
    const current = redisStore.get(key);
    if (current === argv[0]) {
      redisStore.delete(key);
      return 1;
    }
    return 0;
  }
  if (script.includes("cjson") && script.includes("messages")) {
    const existingRaw = redisStore.get(key);
    const session: MockSessionShape = existingRaw
      ? (JSON.parse(existingRaw) as MockSessionShape)
      : { messages: [], updatedAt: 0 };
    const newMessage = JSON.parse(argv[0]) as MockSessionMessage;
    session.messages.push(newMessage);
    const maxMessages = Number(argv[1]);
    if (session.messages.length > maxMessages) {
      session.messages = session.messages.slice(-maxMessages);
    }
    session.updatedAt = Number(argv[3]);
    redisStore.set(key, JSON.stringify(session));
    return 1;
  }
  return 0;
}

vi.mock("../../../el-templo-bot/src/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(args[0] as string),
    set: (...args: unknown[]) =>
      mockRedisSet(
        args[0] as string,
        args[1] as string,
        ...(args.slice(2) as unknown[]),
      ),
    del: (...args: unknown[]) => mockRedisDel(args[0] as string),
    eval: (...args: unknown[]) =>
      mockRedisEval(
        args[0] as string,
        args[1] as number,
        args[2] as string,
        ...(args.slice(3) as string[]),
      ),
  },
  isRedisAvailable: () => redisAvailable,
}));

// ─── AI provider mock — THROWS on any invocation (T-100-07 sentinel) ────────
// If the handler EVER calls provider.chat during human_takeover, this mock
// throws and the test fails noisily. Reaching the assertion is the proof.
interface ChatCall {
  messages: unknown[];
  tools: unknown;
}
const chatCalls: ChatCall[] = [];

vi.mock("../../../el-templo-bot/src/ai/provider", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../el-templo-bot/src/ai/provider")
    >();
  return {
    ...original,
    createAiProvider: () => ({
      chat: async (messages: unknown[], tools: unknown) => {
        chatCalls.push({ messages, tools });
        throw new Error(
          "AI MUST NOT BE INVOKED — TAKE-02 integration guard violation",
        );
      },
    }),
  };
});

// ─── sendTextMessage mock ───────────────────────────────────────────────────
interface SendCall {
  phone: string;
  text: string;
}
const sendCalls: SendCall[] = [];

vi.mock(
  "../../../el-templo-bot/src/whatsapp/client",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../el-templo-bot/src/whatsapp/client")
      >();
    return {
      ...original,
      sendTextMessage: async (phone: string, text: string) => {
        sendCalls.push({ phone, text });
        return `wamid.sent.${sendCalls.length}`;
      },
    };
  },
);

// Import AFTER all mocks are registered.
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";

// Byte-exact phrase locked at the handler.ts constant. ANY drift = noisy
// fail. The plan calls this out as a HARD GUARD.
const TAKEOVER_REASSURANCE_PHRASE_EXPECTED =
  "Alguien del equipo te va a responder a la brevedad 🙏";

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeTextPayload(
  phone: string,
  text: string,
  wamid: string,
  contactName = "TAKE-02 Test User",
): MetaWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "PHONE_ID",
              },
              contacts: [{ profile: { name: contactName }, wa_id: phone }],
              messages: [
                {
                  id: wamid,
                  from: phone,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe("v5.3.3 Phase 100 TAKE-02 — takeover-ack integration", () => {
  let app: FastifyInstance;
  let pool: mysql.Pool;
  let handlerResolvers: Array<() => void> = [];

  function nextHandlerResolution(): Promise<void> {
    return new Promise<void>((resolve) => {
      handlerResolvers.push(resolve);
    });
  }
  function onHandlerComplete(): void {
    const resolver = handlerResolvers.shift();
    if (resolver) resolver();
  }

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "phase100-take02-verify-token";
    process.env.WHATSAPP_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_ID = "test-phone-id";

    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: "eltemplo_test",
    });

    const db = drizzle(pool, { schema, mode: "default" });
    app = Fastify({ logger: false });
    app.decorate("db", db);

    await app.register(webhookRoutes, {
      onMessageHandled: () => onHandlerComplete(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.execute("DELETE FROM whatsapp_messages");
    await pool.execute("DELETE FROM whatsapp_conversations");
    redisStore.clear();
    redisAvailable = true;
    chatCalls.length = 0;
    sendCalls.length = 0;
    handlerResolvers = [];
  });

  // ── Scenario 1: full takeover flow ───────────────────────────────────────

  it("Scenario 1 — first inbound during takeover sends reassurance; second within TTL is suppressed; AI never invoked", async () => {
    const phone = "5491133320001";

    // Seed conversation in human_takeover BEFORE the inbound.
    await pool.execute(
      `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
       VALUES (?, 'TAKE-02 Test User', 'human_takeover', 'lead', NOW(), NOW(), NOW())`,
      [phone],
    );

    // ── First inbound — expect reassurance. ──
    const wait1 = nextHandlerResolution();
    const res1 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(
        phone,
        "hola hay alguien?",
        "wamid.take02.int.1",
      ),
    });
    expect(res1.statusCode).toBe(200);

    await Promise.race([
      wait1,
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);

    // Exactly one outbound: the byte-exact reassurance phrase.
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0].phone).toBe(phone);
    expect(sendCalls[0].text).toBe(TAKEOVER_REASSURANCE_PHRASE_EXPECTED);

    // The rate-limit key was written to Redis.
    expect(redisStore.has(`wa:takeover_ack:${phone}`)).toBe(true);

    // CRITICAL: provider.chat (which throws on call) was NEVER invoked.
    expect(chatCalls.length).toBe(0);

    // ── Second inbound — expect SUPPRESSION (no new outbound). ──
    const wait2 = nextHandlerResolution();
    const res2 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "estan ahi?", "wamid.take02.int.2"),
    });
    expect(res2.statusCode).toBe(200);

    await Promise.race([
      wait2,
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);

    // sendCalls.length is STILL 1 (the second inbound was suppressed).
    expect(sendCalls.length).toBe(1);
    // CRITICAL: provider.chat STILL never invoked across both inbounds.
    expect(chatCalls.length).toBe(0);
  });

  // ── Scenario 2: TTL expiry → second reassurance fires ─────────────────────

  it("Scenario 2 — TTL expiry: after the ack key is dropped, a second inbound DOES get reassurance again", async () => {
    const phone = "5491133320002";

    // Seed conversation in human_takeover.
    await pool.execute(
      `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
       VALUES (?, 'TAKE-02 Test User', 'human_takeover', 'lead', NOW(), NOW(), NOW())`,
      [phone],
    );

    // ── First inbound. ──
    const wait1 = nextHandlerResolution();
    const res1 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "primera consulta", "wamid.take02.int.3"),
    });
    expect(res1.statusCode).toBe(200);
    await Promise.race([
      wait1,
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0].text).toBe(TAKEOVER_REASSURANCE_PHRASE_EXPECTED);

    // ── Simulate TTL expiry by dropping the Redis key. ──
    // Production: the SETEX EX TAKEOVER_ACK_TTL_SECONDS would naturally expire
    // after 1h. In the integration test we drop the key directly to simulate
    // the expiry without sleeping 3600s — the post-expiry SETEX-NX will land
    // OK and the second reassurance must fire.
    redisStore.delete(`wa:takeover_ack:${phone}`);

    // ── Second inbound (post-expiry). ──
    const wait2 = nextHandlerResolution();
    const res2 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(
        phone,
        "segunda consulta despues de horas",
        "wamid.take02.int.4",
      ),
    });
    expect(res2.statusCode).toBe(200);
    await Promise.race([
      wait2,
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);

    // sendCalls.length == 2: the second reassurance landed.
    expect(sendCalls.length).toBe(2);
    expect(sendCalls[1].phone).toBe(phone);
    expect(sendCalls[1].text).toBe(TAKEOVER_REASSURANCE_PHRASE_EXPECTED);

    // CRITICAL: provider.chat STILL never invoked across both inbounds.
    expect(chatCalls.length).toBe(0);
  });
});
