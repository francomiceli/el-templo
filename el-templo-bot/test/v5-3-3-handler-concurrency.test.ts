/**
 * v5.3.3 Phase 93 — Handler concurrency regression test (CONC-01 / BUG-01).
 *
 * Branch 1 (SETNX-race) + Branch 4 (TTL coupling) verdicts from 93-AUDIT.md.
 *
 * TDD fail-in-main discipline (per 93-01-PLAN.md task 2):
 *  - Both sub-tests below (same-body drop + different-body coalesce) MUST FAIL
 *    against HEAD because the non-atomic `isDebounceActive` + `setDebounce`
 *    pair in `el-templo-bot/src/memory/session.ts:125-155` permits two
 *    concurrent invocations of `processWithAi` to both observe `null` from
 *    `redis.get` before either's `redis.set` lands, both spawn AI calls, and
 *    both send duplicate outbound replies.
 *  - After Task 4 lands the atomic `SET NX PX` primitive (Branch 1 fix),
 *    both sub-tests MUST PASS — exactly ONE `provider.chat(...)` call per
 *    rapid-fire burst regardless of body equality.
 *
 * Model after `el-templo-bot/test/ai-handler.test.ts` mock patterns:
 *  - Map-backed Redis store via `vi.doMock("../src/redis", ...)` so that
 *    the SAME mock store is observed by every consumer of `redis.get/set`.
 *  - `vi.doMock("../src/ai/provider")` to count `provider.chat` invocations
 *    and capture the messages array (asserting coalesce includes BOTH bodies).
 *  - `vi.doMock("../src/whatsapp/client")` to capture outbound sends.
 *  - Mocked DB execute returning sufficient row shapes for the handler
 *    pipeline; we don't exercise the real schema, only the dedup/debounce
 *    decision path.
 *
 * `vi.useFakeTimers()` is used to advance the 3s `setTimeout` debounce
 * delay deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParsedInboundMessage } from "../src/whatsapp/types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state — visible across the test file. Reset in beforeEach.
// ─────────────────────────────────────────────────────────────────────────────

const redisStore = new Map<string, string>();
let redisAvailable = true;
const chatCalls: Array<{ messages: unknown[]; tools: unknown[] | undefined }> =
  [];
const sendCalls: string[] = [];

/**
 * Async Redis `get` — returns null if key absent.
 * Async so that two `await redis.get(key)` calls from concurrent invocations
 * interleave around the await point (mirrors real ioredis behavior on the
 * network round-trip).
 */
async function mockRedisGet(key: string): Promise<string | null> {
  return redisStore.get(key) ?? null;
}

/**
 * Async Redis `set` — mimics ioredis varargs:
 *   redis.set(key, value, "EX", ttlSeconds)              — set unconditional
 *   redis.set(key, value, "EX", ttlSeconds, "NX")        — set IFF not exists
 * Returns "OK" on success, null on NX-conflict.
 *
 * Supporting NX semantics here is critical so that AFTER the Branch 1 fix
 * lands (Task 4), the test confirms the atomic primitive actually prevents
 * the race we observe BEFORE the fix.
 */
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
  // Lua compare-and-delete: if redis.call("get", KEYS[1]) == ARGV[1] then del
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

vi.mock("../src/redis", () => ({
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

vi.mock("pino", () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => noopLogger),
  };
  return { default: () => noopLogger };
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider + WhatsApp client mocks — captured per-test via vi.doMock.
// We use vi.doMock (NOT vi.mock) so each test's beforeEach can re-register
// mocks against a freshly cleared `chatCalls` / `sendCalls` array.
// ─────────────────────────────────────────────────────────────────────────────

function setupProviderMock(): void {
  vi.doMock("../src/ai/provider", () => ({
    createAiProvider: () => ({
      chat: async (messages: unknown[], tools: unknown[] | undefined) => {
        chatCalls.push({ messages, tools });
        return {
          content: "Hola! En que te puedo ayudar?",
          toolCalls: [],
        };
      },
    }),
  }));
}

function setupSurroundingMocks(): void {
  // Avoid expensive real-prompt rendering in the test.
  vi.doMock("../src/ai/system-prompt", () => ({
    getSystemPrompt: () => "TEST SYSTEM PROMPT",
  }));

  vi.doMock("../src/ai/tools", () => ({
    BOT_TOOLS: [],
    executeTool: async () => "",
    resolvePendingAction: async () => null,
  }));

  vi.doMock("../src/whatsapp/client", () => ({
    sendTextMessage: async (_phone: string, text: string) => {
      sendCalls.push(text);
      return `wamid_outbound_${sendCalls.length}`;
    },
    sendInteractiveMessage: async () => `wamid_interactive_${Date.now()}`,
  }));

  vi.doMock("../src/memory/profile", () => ({
    getProfile: async () => null,
    updateProfile: async () => {},
    buildProfileContext: () => "",
  }));

  vi.doMock("../src/memory/playbook-state", () => ({
    getPlaybookState: async () => null,
    setPlaybookState: async () => {},
  }));

  vi.doMock("../src/state/machine", () => ({
    determineClientState: async () => ({ state: "lead", userId: null }),
    updateConversationState: async () => {},
  }));

  vi.doMock("../src/playbooks/resolver", () => ({
    resolvePlaybook: () => ({
      playbookId: null,
      stageId: null,
      avatar: null,
    }),
  }));

  vi.doMock("../src/playbooks/advance", () => ({
    advanceStageIfComplete: () => null,
  }));

  vi.doMock("../src/playbooks/profile-tag", () => ({
    extractProfileTag: () => null,
    stripProfileTag: (text: string) => text,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// DB mock — sufficient row shapes for handleInboundMessage flow.
// ─────────────────────────────────────────────────────────────────────────────

interface DbExecuteFn {
  (sql: { strings?: TemplateStringsArray; sql?: string }): Promise<unknown>;
}

function makeMockDb(): {
  execute: ReturnType<typeof vi.fn>;
} {
  let conversationLookupCount = 0;
  return {
    execute: vi.fn(async (query: unknown) => {
      // Drizzle SQL template literals carry the raw SQL on the `.sql` property
      // or by toString(). We pattern-match on substrings to dispatch.
      const sqlStr =
        (query as { sql?: string }).sql ??
        (query as { queryChunks?: Array<{ value?: string }> }).queryChunks
          ?.map((c) => c?.value ?? "")
          .join("") ??
        String(query);

      // SELECT id, conversation_status FROM whatsapp_conversations WHERE phone = ...
      if (
        sqlStr.includes("SELECT") &&
        sqlStr.includes("whatsapp_conversations")
      ) {
        conversationLookupCount++;
        return [[{ id: 42, conversation_status: "active" }]];
      }
      // History SELECT — return empty
      if (sqlStr.includes("SELECT") && sqlStr.includes("whatsapp_messages")) {
        return [[]];
      }
      // INSERT into whatsapp_messages (the dedup INSERT or outbound INSERT)
      if (sqlStr.includes("INSERT") && sqlStr.includes("whatsapp_messages")) {
        return [{ insertId: 100 + conversationLookupCount, affectedRows: 1 }];
      }
      // UPDATE whatsapp_conversations
      if (sqlStr.includes("UPDATE")) {
        return [{ affectedRows: 1 }];
      }
      // Default fallback
      return [[]];
    }) satisfies DbExecuteFn,
  };
}

function makeMessage(
  phone: string,
  text: string,
  wamid: string,
): ParsedInboundMessage {
  return {
    phone,
    contactName: "Test User",
    text,
    messageType: "text",
    whatsappMessageId: wamid,
    rawPayload: {},
  } as ParsedInboundMessage;
}

function makeMockLog(): Record<string, unknown> {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: "info",
    silent: vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONC-01 — Rapid-fire single-response (Branch 1 SETNX-race fix-in-main).
// ─────────────────────────────────────────────────────────────────────────────

describe("CONC-01 — rapid-fire single-response (Branch 1 SETNX-race fix)", () => {
  beforeEach(() => {
    redisStore.clear();
    redisAvailable = true;
    chatCalls.length = 0;
    sendCalls.length = 0;
    vi.resetModules();
    setupProviderMock();
    setupSurroundingMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../src/ai/provider");
    vi.doUnmock("../src/ai/system-prompt");
    vi.doUnmock("../src/ai/tools");
    vi.doUnmock("../src/whatsapp/client");
    vi.doUnmock("../src/memory/profile");
    vi.doUnmock("../src/memory/playbook-state");
    vi.doUnmock("../src/state/machine");
    vi.doUnmock("../src/playbooks/resolver");
    vi.doUnmock("../src/playbooks/advance");
    vi.doUnmock("../src/playbooks/profile-tag");
  });

  describe("same-body rapid-fire → silent drop (drop sub-test)", () => {
    it("two concurrent inbounds with identical body but different wamids → exactly ONE provider.chat call", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const db = makeMockDb();
      const log = makeMockLog();
      const phone = "5491100000777";

      const msg1 = makeMessage(phone, "Hola", "wamid.race.A1");
      const msg2 = makeMessage(phone, "Hola", "wamid.race.A2");

      // Fire both inbounds concurrently — this is the SETNX-race window.
      // Both invocations of processWithAi will reach `isDebounceActive` before
      // either's `setDebounce` lands → both observe null → both proceed.
      const p1 = handleInboundMessage(db as never, log as never, msg1);
      const p2 = handleInboundMessage(db as never, log as never, msg2);

      // Advance the 3s debounce delay so processWithAiInner runs.
      // Use multiple ticks since both invocations create their own setTimeout.
      await vi.advanceTimersByTimeAsync(3500);

      await Promise.all([p1, p2]);

      // Branch 1 invariant: same-body rapid-fire is silently dropped — exactly
      // ONE main AI invocation regardless of how many duplicate inbounds.
      // Filter to main handler calls only — the profile-extraction call at
      // handler.ts:1391 is fire-and-forget AFTER reply, has NO tools arg,
      // and is orthogonal to the duplicate-response failure mode.
      const mainChatCalls = chatCalls.filter((c) => c.tools !== undefined);
      expect(mainChatCalls.length).toBe(1);
    });
  });

  describe("different-body rapid-fire → coalesce into one AI turn (coalesce sub-test)", () => {
    it("two concurrent inbounds with different bodies → exactly ONE provider.chat call whose context contains BOTH user texts", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const db = makeMockDb();
      const log = makeMockLog();
      const phone = "5491100000778";

      const msg1 = makeMessage(phone, "Hola", "wamid.race.B1");
      const msg2 = makeMessage(phone, "¿hay clases mañana?", "wamid.race.B2");

      const p1 = handleInboundMessage(db as never, log as never, msg1);
      const p2 = handleInboundMessage(db as never, log as never, msg2);

      await vi.advanceTimersByTimeAsync(3500);

      await Promise.all([p1, p2]);

      // Branch 1 invariant: different-body rapid-fire coalesces — exactly ONE
      // main AI call whose messages[] contains BOTH user texts as the user's
      // combined turn. The surviving handler re-reads the session after its
      // 3s sleep and sees both messages (both invocations of processWithAi
      // called updateSession before the debounce check).
      // Filter to main handler calls only — see same-body sub-test for rationale.
      const mainChatCalls = chatCalls.filter((c) => c.tools !== undefined);
      expect(mainChatCalls.length).toBe(1);

      // Verify the single chat call saw BOTH user texts. The handler injects
      // session.messages into the chat's messages[] array after the system
      // prompt, in chronological order.
      const messagesArg = mainChatCalls[0].messages as Array<{
        role: string;
        content: string;
      }>;
      const userTexts = messagesArg
        .filter((m) => m.role === "user")
        .map((m) => m.content);
      const concatenated = userTexts.join(" | ");

      expect(concatenated).toContain("Hola");
      expect(concatenated).toContain("¿hay clases mañana?");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONC-01 — Sequential (non-race) sanity: confirms the test scaffold does NOT
// trivially pass via mock starvation. ONE inbound followed by ANOTHER inbound
// AFTER the first has fully completed → 2 separate AI calls (different turns,
// not a race). If THIS test fails, the scaffold has a leak.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONC-01 sanity — sequential (non-rapid-fire) inbounds produce 2 AI calls", () => {
  beforeEach(() => {
    redisStore.clear();
    redisAvailable = true;
    chatCalls.length = 0;
    sendCalls.length = 0;
    vi.resetModules();
    setupProviderMock();
    setupSurroundingMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../src/ai/provider");
    vi.doUnmock("../src/ai/system-prompt");
    vi.doUnmock("../src/ai/tools");
    vi.doUnmock("../src/whatsapp/client");
    vi.doUnmock("../src/memory/profile");
    vi.doUnmock("../src/memory/playbook-state");
    vi.doUnmock("../src/state/machine");
    vi.doUnmock("../src/playbooks/resolver");
    vi.doUnmock("../src/playbooks/advance");
    vi.doUnmock("../src/playbooks/profile-tag");
  });

  it("two inbounds at fully-separate turns each get their own AI call", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const db = makeMockDb();
    const log = makeMockLog();
    const phone = "5491100000779";

    const msg1 = makeMessage(phone, "Hola", "wamid.seq.C1");
    const p1 = handleInboundMessage(db as never, log as never, msg1);
    await vi.advanceTimersByTimeAsync(3500);
    await p1;

    // After the first inbound fully completes, the debounce key has been
    // released by the finally block. A fresh inbound starts a new turn.
    const msg2 = makeMessage(phone, "¿hay clases mañana?", "wamid.seq.C2");
    const p2 = handleInboundMessage(db as never, log as never, msg2);
    await vi.advanceTimersByTimeAsync(3500);
    await p2;

    // Sanity: 2 separate turns → 2 MAIN AI calls. If this test fails, the
    // scaffold is leaking state across inbounds (e.g., redisStore not being
    // cleared between sub-tests). The race-condition sub-tests above would
    // then be unreliable. Filter to main calls only (see race sub-tests for
    // rationale — extractor calls are post-reply fire-and-forget and orthogonal).
    const mainChatCalls = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainChatCalls.length).toBe(2);
  });
});
