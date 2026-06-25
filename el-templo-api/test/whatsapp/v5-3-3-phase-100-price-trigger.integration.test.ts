/**
 * Phase 100 TRIG-01 integration tests (v5.3.3): widened detectPriceObjection
 * regex — end-to-end verification that both consumers of the helper continue
 * to function correctly under question-shaped inputs.
 *
 * Three scenarios (per 100-03-PLAN.md Task 3 `<behavior>`):
 *  1. **PB1 counter accumulates on question-shaped triggers** — seed PB1.E4
 *     with priceInsistenceCount=2; send "¿qué tarifa tienen?"; assert counter
 *     advances to 3 AND the PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM is
 *     injected into the rendered system prompt on the 3rd-turn AI call.
 *  2. **PB1 counter does NOT increment on non-price questions** — seed PB1
 *     state with counter=0; send "¿qué clases tienen?" then "¿en qué
 *     horarios?"; assert counter stays 0 after both inbounds.
 *  3. **PB2.E2 routing of neutral price questions** — seed PB2.E2; send
 *     "¿cuál es el plan más barato?"; assert the handler completes cleanly
 *     (no crash), an outbound is sent (any non-empty reply), and provider.chat
 *     is invoked exactly once (no infinite loop, no early-return). Per
 *     Phase 100 CONTEXT decisions, neutral price questions in PB2.E2 are
 *     acceptable — mildly-defensive but on-topic response, not a regression.
 *     T-100-11 mitigation lock.
 *
 * Scaffolding mirrors `v5-3-3-phase-99-copy-and-price.integration.test.ts`
 * (Map-backed Redis mock + canned-reply AI provider mock + tracked
 * sendTextMessage mock + real MySQL `eltemplo_test` via drizzle). Phase 99
 * already exercises the 3rd-insistence disclosure via OBJECTION-shaped
 * triggers ("muy caro", "carísimo"); this file's Scenario 1 closes the gap
 * for QUESTION-shaped triggers ("¿qué tarifa tienen?") — the same code path,
 * different regex token, locks both shapes.
 *
 * Per CONTEXT.md `<scope_fence>`: zero el-templo-api/src/** modifications
 * across this plan's commits. Only new test files in
 * el-templo-api/test/whatsapp/.
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

// ─── Map-backed Redis mock ───────────────────────────────────────────────────

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

// ─── AI provider mock ────────────────────────────────────────────────────────

interface ChatCall {
  messages: unknown[];
  tools: unknown;
}
const chatCalls: ChatCall[] = [];
const chatMock = vi.fn(async (messages: unknown[], tools: unknown) => {
  chatCalls.push({ messages, tools });
  return {
    content: "Dale, contame un poco más para entender qué buscás.",
    toolCalls: [] as unknown[],
  };
});

vi.mock("../../../el-templo-bot/src/ai/provider", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../el-templo-bot/src/ai/provider")
    >();
  return {
    ...original,
    createAiProvider: () => ({
      chat: chatMock,
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

// Import AFTER mocks (mirrors Phase 99 pattern).
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";
import {
  getPlaybookState,
  setPlaybookState,
  deletePlaybookState,
} from "../../../el-templo-bot/src/memory/playbook-state";

// ─── Payload helper ──────────────────────────────────────────────────────────

function makeTextPayload(
  phone: string,
  text: string,
  wamid: string,
  contactName = "Phase100 TRIG-01 User",
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

/**
 * Inspect the most recent MAIN `chat()` call's rendered system prompt.
 * Filters to calls with a defined `tools` arg (the profile-extraction call
 * at handler.ts is fire-and-forget AFTER reply with NO tools arg).
 */
function getRenderedSystemPrompt(): string {
  const mainCalls = chatCalls.filter((c) => c.tools !== undefined);
  if (mainCalls.length === 0) {
    throw new Error(
      "No main chat() call captured — verify the handler reached processWithAi",
    );
  }
  const last = mainCalls[mainCalls.length - 1];
  const messages = last.messages as Array<{ role: string; content: string }>;
  const systemMsg = messages.find((m) => m.role === "system");
  if (!systemMsg) {
    throw new Error("No system message in captured chat() call");
  }
  return systemMsg.content;
}

/**
 * Count MAIN chat() invocations (excludes the fire-and-forget profile-
 * extraction call). Used by Scenario 3 to assert "exactly one AI invocation,
 * no infinite loop".
 */
function getMainChatCallCount(): number {
  return chatCalls.filter((c) => c.tools !== undefined).length;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("v5.3.3 Phase 100 TRIG-01 — widened regex integration (PB1 counter + PB2.E2 routing)", () => {
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
    if (resolver) {
      resolver();
    }
  }
  async function waitForHandler(timeoutMs = 12000): Promise<void> {
    const wait = nextHandlerResolution();
    await Promise.race([
      wait,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "phase100-trig01-verify-token";
    process.env.WHATSAPP_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_ID = "test-phone-id";
    // Short debounce so the handler fires quickly under the new Phase 100
    // DBNC-01 trailing-debounce loop (default 7s).
    process.env.DEBOUNCE_QUIET_WINDOW_MS = "500";
    process.env.DEBOUNCE_HARD_CAP_MS = "1500";

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

    vi.useRealTimers();
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
    chatMock.mockClear();
    chatMock.mockImplementation(async (messages: unknown[], tools: unknown) => {
      chatCalls.push({ messages, tools });
      return {
        content: "Dale, contame un poco más para entender qué buscás.",
        toolCalls: [] as unknown[],
      };
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 1 — PB1 counter accumulates on question-shaped triggers
  // ───────────────────────────────────────────────────────────────────────────

  describe("Scenario 1 — PB1 counter accumulates on question-shaped triggers", () => {
    it("3rd question-shaped insistence (¿qué tarifa tienen?) advances counter to 3 AND injects disclosure addendum", async () => {
      const phone = "+5491100100001";
      await deletePlaybookState(phone);
      // Pre-seed at PB1.E4 with priceInsistenceCount=2 so the next price-
      // trigger inbound flips count to 3 → disclosure addendum unlocks.
      // Uses question-shaped "¿qué tarifa tienen?" — pre-Phase-100, this
      // would NOT have fired the counter (live-test gap). Post-Phase-100,
      // the widened regex matches `tarifa` and the counter advances.
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 2,
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(
          phone,
          "¿qué tarifa tienen?",
          "wamid.trig01.a1",
        ),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      expect(state?.priceInsistenceCount).toBe(3);

      const systemPrompt = getRenderedSystemPrompt();
      // PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM signature
      // (system-prompt.ts:233). Byte-equal vs Phase 99 — Plan 100-03 does
      // NOT touch the addendum string; the widening only changes what
      // TRIGGERS the counter.
      expect(systemPrompt).toContain("Desbloqueo de disclosure de precios");
      // Free-trial re-anchor token (mandatory closing per addendum).
      expect(systemPrompt).toContain("pruebes gratis primero");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 2 — PB1 counter does NOT increment on non-price questions
  // ───────────────────────────────────────────────────────────────────────────

  describe("Scenario 2 — PB1 counter does NOT increment on non-price questions", () => {
    it("two non-price inbounds in PB1 keep priceInsistenceCount at 0", async () => {
      const phone = "+5491100100002";
      await deletePlaybookState(phone);
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        updatedAt: Date.now(),
      });

      // First inbound: classes question — no price tokens.
      const res1 = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(
          phone,
          "¿qué clases tienen?",
          "wamid.trig01.b1",
        ),
      });
      expect(res1.statusCode).toBe(200);
      await waitForHandler();

      const state1 = await getPlaybookState(phone);
      expect(state1?.priceInsistenceCount ?? 0).toBe(0);

      // Second inbound: schedule question — no price tokens.
      const res2 = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "¿en qué horarios?", "wamid.trig01.b2"),
      });
      expect(res2.statusCode).toBe(200);
      await waitForHandler();

      const state2 = await getPlaybookState(phone);
      expect(state2?.priceInsistenceCount ?? 0).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 3 — PB2.E2 neutral price-question routing locks the T-100-11
  // mitigation: handler completes cleanly, no infinite loop, no crash.
  // ───────────────────────────────────────────────────────────────────────────

  describe("Scenario 3 — PB2.E2 neutral price-question routing", () => {
    it("PB2.E2 lead asking '¿cuál es el plan más barato?' completes cleanly with exactly one AI invocation", async () => {
      const phone = "+5491100100003";
      await deletePlaybookState(phone);
      // Seed directly at PB2.E2 — the path that previously handled price-
      // OBJECTION-shaped inputs. With the widened regex, a neutral price
      // QUESTION routes through the same code path. Per CONTEXT.md, this
      // is acceptable — mildly-defensive but on-topic response.
      await setPlaybookState(phone, {
        activePlaybook: "PB2",
        currentStage: "PB2.E2",
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(
          phone,
          "¿cuál es el plan más barato?",
          "wamid.trig01.c1",
        ),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      // T-100-11 mitigation locks:
      //   1. Handler did NOT crash (already implicit if waitForHandler returns
      //      and we reach the assertions below).
      //   2. An outbound was sent (any non-empty reply — we're checking no
      //      regression in the path, not specific copy).
      //   3. The AI provider was invoked exactly once for the main turn
      //      (no infinite loop, no early-return that prevents the AI call).
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
      expect(sendCalls[sendCalls.length - 1].text.length).toBeGreaterThan(0);
      expect(getMainChatCallCount()).toBe(1);
    });
  });
});
