/**
 * v5.3.3 Phase 93 — Handler concurrency integration test (CONC-01 / BUG-01).
 *
 * Exercises the full webhook → MySQL → handler pipeline via Fastify `inject`,
 * mocking only the bot-side AI provider, Redis (Map-backed), and WhatsApp
 * outbound client. The real `el-templo-bot/src/webhook/routes.ts` handler
 * dispatch is used (NOT a stub) so the dedup INSERT and the debounce-race
 * surface are exercised against actual code.
 *
 * Placement: per `el-templo-bot/CLAUDE.md` integration tests for bot logic
 * live in `el-templo-api/test/whatsapp/` (shared test DB).
 *
 * TDD fail-in-main: per 93-AUDIT.md Branch 1 (SETNX-race) verdict, two
 * concurrent webhook POSTs with the same phone (different wamids) currently
 * result in TWO `sendTextMessage` calls (duplicate replies). The Branch 1
 * atomic-primitive fix in Task 4 collapses this to ONE call.
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

// ─── Mock the bot's Redis with a Map-backed store ────────────────────────────
// Critical: the SETNX-race window only manifests when get and set are
// genuinely async (each yields to the event loop). The mock below mimics
// ioredis varargs including the optional NX flag.

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
async function mockRedisEval(
  script: string,
  _numKeys: number,
  key: string,
  argv1: string,
): Promise<number> {
  if (script.includes('redis.call("get"') && script.includes("del")) {
    const current = redisStore.get(key);
    if (current === argv1) {
      redisStore.delete(key);
      return 1;
    }
    return 0;
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
        args[3] as string,
      ),
  },
  isRedisAvailable: () => redisAvailable,
}));

// ─── Mock the bot's OpenAI provider so we never hit the real API ─────────────
const chatCalls: Array<{ messages: unknown[]; tools: unknown }> = [];

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
        return {
          content: "Hola! En que te puedo ayudar?",
          toolCalls: [],
        };
      },
    }),
  };
});

// ─── Mock sendTextMessage so we never POST to Meta ───────────────────────────
const sendCalls: Array<{ phone: string; text: string }> = [];

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

// Import after all mocks are registered.
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeTextPayload(
  phone: string,
  text: string,
  wamid: string,
  contactName = "Race User",
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

// ─── Test Suite ──────────────────────────────────────────────────────────────

/**
 * Integration test for CONC-01 (BUG-01 race condition).
 *
 * NOTE: This test does NOT reproduce the SETNX race condition
 * that motivates BUG-01. Fastify-inject serializes requests
 * sufficiently that the in-memory debounce check window
 * (isDebounceActive → setDebounce in session.ts:125-155) does
 * not overlap between concurrent invocations under this
 * harness.
 *
 * Coverage provided:
 * 1. Regression-protector for post-Task-4 atomic-primitive
 *    behavior — after the fix lands, all 3 sub-tests must
 *    continue passing.
 * 2. End-to-end verification of Meta wamid dedup via the
 *    whatsapp_messages UNIQUE constraint
 *    (handler.ts:291-306 + schema:84).
 * 3. Sanity check for the Fastify ack-before-process flow
 *    (routes.ts:54-74) under rapid-fire conditions.
 *
 * Fail-in-main TDD proof for the SETNX race itself lives in
 * test/v5-3-3-handler-concurrency.test.ts (unit test) — that
 * test's Promise.all() pattern exposes the sub-millisecond
 * race window that Fastify-inject hides.
 */
describe("v5.3.3 Phase 93 — Handler concurrency (CONC-01 / BUG-01)", () => {
  let app: FastifyInstance;
  let pool: mysql.Pool;

  // Track pending handler resolutions for deterministic awaits.
  const pendingHandlers: Set<Promise<void>> = new Set();
  let handlerResolvers: Array<() => void> = [];

  function nextHandlerResolution(): Promise<void> {
    return new Promise<void>((resolve) => {
      handlerResolvers.push(resolve);
    });
  }

  function onHandlerComplete(): void {
    const resolver = handlerResolvers.shift();
    if (resolver) {
      resolver();
    }
  }

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "race-test-token";
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
    pendingHandlers.clear();
    handlerResolvers = [];
  });

  describe("same-body rapid-fire → silent drop", () => {
    it("two concurrent webhook POSTs with identical body but different wamids → exactly ONE sendTextMessage call", async () => {
      const phone = "5491133300001";
      // Pre-create the conversation row so both POSTs skip the conv-create
      // INSERT and converge on the debounce check faster (widens the race
      // window from a connection-pool-serialized state to a true sub-ms race).
      await pool.execute(
        `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
         VALUES (?, 'Race User', 'active', 'lead', NOW(), NOW(), NOW())`,
        [phone],
      );

      const wait1 = nextHandlerResolution();
      const wait2 = nextHandlerResolution();

      const p1 = app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "Hola", "wamid.int.race.A1"),
      });
      const p2 = app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "Hola", "wamid.int.race.A2"),
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      // Wait for both fire-and-forget handlers to finish (with timeout floor
      // — the 3s debounce delay + AI mock latency).
      await Promise.race([
        Promise.all([wait1, wait2]),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);

      // Branch 1 invariant: same-body rapid-fire is silently dropped — exactly
      // ONE outbound sendTextMessage regardless of how many duplicate inbounds.
      expect(sendCalls.length).toBe(1);
      // The MAIN AI call was invoked exactly once (the surviving handler).
      // Filter to main calls only — the profile-extraction call at
      // handler.ts:1391 is fire-and-forget AFTER reply, has NO tools arg,
      // and is orthogonal to the duplicate-response failure mode.
      const mainChatCalls = chatCalls.filter((c) => c.tools !== undefined);
      expect(mainChatCalls.length).toBe(1);

      // Both wamids were persisted (dedup INSERT for each — they have
      // different wamids so both INSERTs succeed at the DB layer; the
      // duplicate-response prevention happens at the debounce layer).
      const [rows] = await pool.execute(
        "SELECT whatsapp_message_id FROM whatsapp_messages WHERE message_direction = 'inbound'",
      );
      const inboundWamids = (
        rows as Array<{ whatsapp_message_id: string }>
      ).map((r) => r.whatsapp_message_id);
      // Order-insensitive: auto-increment INSERT order under concurrent
      // INSERTs is non-deterministic (Branch 1 race produces wobble in
      // commit ordering). The bug-shape assertion is sendCalls.length === 1
      // above; this assertion is just verifying both rows persisted.
      expect(inboundWamids).toEqual(
        expect.arrayContaining(["wamid.int.race.A1", "wamid.int.race.A2"]),
      );
      expect(inboundWamids).toHaveLength(2);
    });
  });

  describe("different-body rapid-fire → coalesce into one AI turn", () => {
    it("two concurrent webhook POSTs with different bodies (different wamids) → exactly ONE sendTextMessage call covering BOTH user texts", async () => {
      const phone = "5491133300002";
      await pool.execute(
        `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
         VALUES (?, 'Race User', 'active', 'lead', NOW(), NOW(), NOW())`,
        [phone],
      );

      const wait1 = nextHandlerResolution();
      const wait2 = nextHandlerResolution();

      const p1 = app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "Hola", "wamid.int.race.B1"),
      });
      const p2 = app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(
          phone,
          "¿hay clases mañana?",
          "wamid.int.race.B2",
        ),
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      await Promise.race([
        Promise.all([wait1, wait2]),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);

      // Branch 1 invariant: different-body rapid-fire coalesces — exactly ONE
      // outbound, ONE MAIN AI call. The surviving handler re-reads the session
      // and includes BOTH user texts as the user's combined turn.
      expect(sendCalls.length).toBe(1);
      // Filter to main calls only (see same-body sub-test for rationale).
      const mainChatCalls = chatCalls.filter((c) => c.tools !== undefined);
      expect(mainChatCalls.length).toBe(1);

      const messagesArg = mainChatCalls[0].messages as Array<{
        role: string;
        content: string;
      }>;
      const userTexts = messagesArg
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" | ");
      expect(userTexts).toContain("Hola");
      expect(userTexts).toContain("¿hay clases mañana?");
    });
  });

  describe("Meta retry with SAME wamid (dedup regression-protector)", () => {
    it("two concurrent webhook POSTs with the SAME wamid → exactly ONE sendTextMessage (UNIQUE constraint catches duplicate INSERT)", async () => {
      const phone = "5491133300003";
      await pool.execute(
        `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
         VALUES (?, 'Race User', 'active', 'lead', NOW(), NOW(), NOW())`,
        [phone],
      );

      const wait1 = nextHandlerResolution();
      const wait2 = nextHandlerResolution();

      const sameWamid = "wamid.int.retry.D1";
      const p1 = app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "Hola", sameWamid),
      });
      const p2 = app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "Hola", sameWamid),
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      await Promise.race([
        Promise.all([wait1, wait2]),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);

      // Meta wamid dedup (Check 2 from 93-AUDIT.md) is correctly wired — the
      // UNIQUE constraint catches the duplicate INSERT and the second handler
      // returns before reaching processWithAi. ONE outbound reply only.
      expect(sendCalls.length).toBe(1);

      // Exactly one inbound row persisted (the second INSERT failed at the
      // UNIQUE constraint and the catch block returned early).
      const [rows] = await pool.execute(
        "SELECT whatsapp_message_id FROM whatsapp_messages WHERE message_direction = 'inbound'",
      );
      expect((rows as unknown[]).length).toBe(1);
    });
  });
});
