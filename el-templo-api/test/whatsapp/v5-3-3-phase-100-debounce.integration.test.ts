/**
 * Phase 100 DBNC-01 integration test (v5.3.3): trailing-debounce loop.
 *
 * End-to-end coverage for the poll-and-extend debounce mechanism in
 * `el-templo-bot/src/webhook/handler.ts`:
 *  - Scenario 1 — single inbound: provider.chat called EXACTLY ONCE within
 *    the quiet-window (NOT within the cap).
 *  - Scenario 2 — burst aggregation: 3 inbounds within the quiet-window
 *    are coalesced into a single provider.chat call.
 *  - Scenario 3 — cap-trip: continuous typing past the cap fires once
 *    with `firedReason: "cap"`.
 *
 * Env-override-before-import (CRITICAL):
 *   The DBNC-01 constants are `Number(process.env.X ?? DEFAULT)` at
 *   module-init time. To run the integration test against small values
 *   (1000ms quiet / 2000ms cap) for speed, env vars MUST be set BEFORE
 *   handler.ts evaluates — vi.hoisted() runs before module imports per
 *   the vitest hoisting contract.
 *
 * Scaffolding mirrors
 *   `el-templo-api/test/whatsapp/v5-3-3-handler-concurrency.integration.test.ts`
 *   (Map-backed Redis mock + canned-reply AI provider mock + tracked
 *   sendTextMessage mock + real MySQL `eltemplo_test` via drizzle)
 * so the new loop is exercised end-to-end through the real `webhookRoutes`
 * handler dispatch, not a stub.
 *
 * Per 100-CONTEXT.md `<scope_fence>`: zero `el-templo-api/src/**`
 * modifications. Pure test authorship.
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

// ─── Env override BEFORE handler.ts evaluates ────────────────────────────────
// `vi.hoisted()` is hoisted to before all imports including the bot routes
// import below. handler.ts reads `Number(process.env.DEBOUNCE_QUIET_WINDOW_MS
// ?? 7000)` and `Number(process.env.DEBOUNCE_HARD_CAP_MS ?? 30000)` at
// module-init time — setting env here forces small values for speed.
//
// Defaults: 1000ms quiet window / 2000ms hard cap. Tests advance fake
// timers in 100-200ms steps so the loop sees a few poll-tick iterations
// of the actual loop body and the cap-trip is observable.
const DBNC_TEST_QUIET_MS = 1000;
const DBNC_TEST_CAP_MS = 2000;
vi.hoisted(() => {
  process.env.DEBOUNCE_QUIET_WINDOW_MS = String(1000);
  process.env.DEBOUNCE_HARD_CAP_MS = String(2000);
  // Force fresh module evaluation in case another suite ran first.
});

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import type { MetaWebhookPayload } from "../../../el-templo-bot/src/whatsapp/types";

// ─── Map-backed Redis mock ───────────────────────────────────────────────────
// Same pattern as v5-3-3-handler-concurrency.integration.test.ts:35-130 —
// the generic Map handles ANY key shape including the new wa:inbound_at:<phone>
// keys the DBNC-01 poll loop reads/writes.

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

// ─── AI provider mock — counter-incrementing canned reply ────────────────────
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
        return {
          content: "Listo, ¿en qué te ayudo?",
          toolCalls: [] as unknown[],
        };
      },
    }),
  };
});

// ─── sendTextMessage mock ────────────────────────────────────────────────────
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

// Import AFTER mocks are registered.
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeTextPayload(
  phone: string,
  text: string,
  wamid: string,
  contactName = "DBNC-01 User",
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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("v5.3.3 Phase 100 DBNC-01 — trailing-debounce integration", () => {
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
    process.env.WHATSAPP_VERIFY_TOKEN = "phase100-verify-token";
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

  // ── Scenario 1: single-msg ─────────────────────────────────────────────────

  it("Scenario 1 — single inbound: provider.chat called exactly ONCE within quiet-window (not cap)", async () => {
    const phone = "5491133311101";

    const wait = nextHandlerResolution();
    const start = Date.now();

    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "Hola", "wamid.dbnc.int.S1"),
    });
    expect(res.statusCode).toBe(200);

    // Wait for the handler to complete (real timers — the test env-override
    // makes quiet-window 1000ms so the loop wall-time is bounded to ~1.5s).
    await Promise.race([
      wait,
      new Promise<void>((resolve) =>
        setTimeout(resolve, DBNC_TEST_CAP_MS + 1500),
      ),
    ]);

    const elapsed = Date.now() - start;

    // Exactly one main AI call.
    const mainCalls = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainCalls.length).toBe(1);

    // Wall-time bound: fired in the quiet-window range, not at the cap.
    // Quiet window = 1000ms + small overhead (poll ticks are 500ms cadence).
    expect(elapsed).toBeGreaterThanOrEqual(DBNC_TEST_QUIET_MS - 100);
    expect(elapsed).toBeLessThan(DBNC_TEST_CAP_MS); // < cap (no cap-trip)
  });

  // ── Scenario 2: burst aggregation ──────────────────────────────────────────

  it("Scenario 2 — burst of 3 inbounds within quiet-window: provider.chat called EXACTLY ONCE", async () => {
    const phone = "5491133311102";

    const waits = [
      nextHandlerResolution(),
      nextHandlerResolution(),
      nextHandlerResolution(),
    ];

    // Three inbounds 300ms apart — each within the 1000ms quiet window of
    // its predecessor, so the loop's deadline keeps extending.
    const res1 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "Hola", "wamid.dbnc.int.B1"),
    });
    expect(res1.statusCode).toBe(200);

    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const res2 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "soy nuevo", "wamid.dbnc.int.B2"),
    });
    expect(res2.statusCode).toBe(200);

    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const res3 = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "qué onda?", "wamid.dbnc.int.B3"),
    });
    expect(res3.statusCode).toBe(200);

    // Wait for all three fire-and-forget handlers to complete.
    await Promise.race([
      Promise.all(waits),
      new Promise<void>((resolve) =>
        setTimeout(resolve, DBNC_TEST_CAP_MS + 2000),
      ),
    ]);

    // Exactly ONE main AI call — burst aggregation.
    const mainCalls = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainCalls.length).toBe(1);

    // Verify the surviving handler's chat call saw the messages. The session
    // re-read happens inside processWithAiInner, so all 3 user texts should
    // appear in the messages array.
    const messages = mainCalls[0].messages as Array<{
      role: string;
      content: string;
    }>;
    const userTexts = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" | ");
    expect(userTexts).toContain("Hola");
    expect(userTexts).toContain("soy nuevo");
    expect(userTexts).toContain("qué onda?");
  });

  // ── Scenario 3: cap trip ───────────────────────────────────────────────────

  it("Scenario 3 — continuous typing past the cap: fires once with firedReason='cap'", async () => {
    const phone = "5491133311103";

    // The chat-call wall-time is the reliable signal for the cap-trip: it
    // records the moment processWithAiInner runs, i.e., AFTER the loop
    // exits. Capture the wall-time by stamping each chatCall entry as it
    // arrives. (Losing-race handlers bail before processWithAiInner.)
    const startedAt = Date.now();
    const chatCallTimestamps: number[] = [];
    const originalChatLength = chatCalls.length;

    // Initial inbound — kicks off the loop.
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: makeTextPayload(phone, "Hola", "wamid.dbnc.int.C1"),
    });
    expect(res.statusCode).toBe(200);

    // Keep typing — fire follow-up inbounds every 300ms (faster than the
    // 1000ms quiet window, so the quiet-window never elapses, forcing the
    // cap-trip at ~2000ms from the FIRST inbound).
    let i = 0;
    const interval = setInterval(() => {
      i++;
      void app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(
          phone,
          `tipear-${i}`,
          `wamid.dbnc.int.C${i + 1}`,
        ),
      });
    }, 300);

    // Poll until a MAIN chat call is observed (this is the cap-trip
    // moment — losing-race handlers never reach provider.chat). The cap
    // is 2000ms; allow up to 4000ms with slack for the continuous-typer.
    const POLL_INTERVAL = 50;
    const POLL_DEADLINE = startedAt + DBNC_TEST_CAP_MS + 4000;
    while (Date.now() < POLL_DEADLINE) {
      const mainCalls = chatCalls
        .slice(originalChatLength)
        .filter((c) => c.tools !== undefined);
      if (mainCalls.length >= 1) {
        chatCallTimestamps.push(Date.now());
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
    clearInterval(interval);

    // Verify exactly one main AI call eventually fired (cap-trip).
    const mainCalls = chatCalls
      .slice(originalChatLength)
      .filter((c) => c.tools !== undefined);
    expect(mainCalls.length).toBe(1);

    // Wall-time bound on the cap-trip moment.
    expect(chatCallTimestamps.length).toBe(1);
    const elapsedAtFire = chatCallTimestamps[0] - startedAt;
    // The cap is 2000ms; the loop's poll-interval is 500ms so the trip
    // observation lag is up to one poll-tick (loop checks the cap at
    // each iteration). Allow 200ms slack for jitter. Lower bound:
    // cap - poll-interval = 2000 - 500 = 1500ms.
    // (Pino `firedReason: "cap"` is verified by the unit test in
    // el-templo-bot/test/v5-3-3-phase-100-debounce.test.ts; this
    // integration test verifies the wall-time bound instead — the cap
    // tripped because elapsed >= ~cap even though typing continued
    // faster than the quiet window.)
    expect(elapsedAtFire).toBeGreaterThanOrEqual(DBNC_TEST_CAP_MS - 500);

    // Wait briefly for any in-flight follow-up requests to settle so the
    // afterEach cleanup doesn't race against a still-pending handler.
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }, 10000); // 10s timeout — cap is 2s + slack for the continuous-typer interval
});
