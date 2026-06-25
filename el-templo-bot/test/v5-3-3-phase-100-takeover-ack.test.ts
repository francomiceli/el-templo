/**
 * v5.3.3 Phase 100 — TAKE-01 / TAKE-02 unit tests.
 *
 * TAKE-01 (HANDOFF_CONTEXT_AWARE_ADDENDUM):
 *   The system-prompt addendum unit-tests live in test/system-prompt-playbook.test.ts
 *   (they exercise getSystemPrompt directly). This file's TAKE-01-related tests
 *   exercise the HANDLER-SIDE wiring choice: at handler entry, scan session
 *   history for the most recent `[tool_call: request_human(...)]` text and
 *   pass the extracted reason as `handoffReason` to getSystemPrompt for the
 *   current turn. Wiring rationale documented in 100-02-SUMMARY.md.
 *
 * TAKE-02 (rate-limited takeover reassurance):
 *   Replaces the bare `return` at handler.ts on `conversationStatus ===
 *   "human_takeover"` with the 3-branch Redis fail-mode dispatch:
 *     1. Redis UNAVAILABLE → fail-OPEN (unconditional sendTextMessage +
 *        log.warn + return).
 *     2. Redis AVAILABLE but SETEX throws → fail-CLOSED (log.error + return,
 *        do NOT send).
 *     3. Redis AVAILABLE and SETEX succeeds → branch on acked === "OK"
 *        (first ack within TTL → send + log.info + return) vs acked === null
 *        (key exists → suppressed + log.info + return).
 *   All three branches end with `return;` — preserves the early-return
 *   semantics; the AI provider is NEVER invoked during human_takeover.
 *
 * CRITICAL "no AI in takeover" sentinel: vi.doMock replaces provider.chat
 * with a function that THROWS on any invocation. Tests assert the mock is
 * never called during human_takeover — this is the T-100-07 elevation-of-
 * privilege mitigation per 100-02-PLAN.md.
 *
 * Mocking pattern mirrors test/v5-3-3-degr-01-escalation.test.ts (Map-backed
 * Redis store + vi.doMock for provider/tools/whatsapp/system-prompt/memory
 * helpers + vi.mock for redis/pino).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParsedInboundMessage } from "../src/whatsapp/types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state — module scope; reset in beforeEach.
// ─────────────────────────────────────────────────────────────────────────────

const redisStore = new Map<string, string>();
let redisAvailable = true;
let redisSetThrowOnce = false;

const sendCalls: string[] = [];
const setSnapshots: Array<{ key: string; value: string; flags: string[] }> = [];
let providerChatCalls = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Redis mock — Map-backed + flag-aware SET (NX support) matching the existing
// mock pattern in v5-3-3-handler-concurrency.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

async function mockRedisGet(key: string): Promise<string | null> {
  return redisStore.get(key) ?? null;
}

async function mockRedisSet(
  key: string,
  value: string,
  ...args: unknown[]
): Promise<string | null> {
  if (redisSetThrowOnce) {
    redisSetThrowOnce = false;
    throw new Error("Mock Redis SET failure (TAKE-02 fail-closed test)");
  }
  const flags = args.map((a) => String(a).toUpperCase());
  setSnapshots.push({ key, value, flags });
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
        ...(args.slice(3) as string[]),
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
// Per-test mocks — registered via vi.doMock so each `it` block can pre-set
// `conversation_status` (via setConversationStatus) before importing handler.
// ─────────────────────────────────────────────────────────────────────────────

// CRITICAL "no AI in takeover" sentinel — provider.chat throws on any
// invocation. Tests during human_takeover assert this mock was never called.
// AI MUST NOT BE INVOKED during human_takeover.
function setupAllMocks(): void {
  vi.doMock("../src/ai/provider", () => ({
    createAiProvider: () => ({
      chat: async () => {
        providerChatCalls++;
        throw new Error("AI MUST NOT BE INVOKED — TAKE-02 guard violation");
      },
    }),
  }));

  vi.doMock("../src/ai/system-prompt", () => ({
    getSystemPrompt: () => "TEST SYSTEM PROMPT",
  }));

  vi.doMock("../src/ai/tools", () => ({
    BOT_TOOLS: [],
    resolvePendingAction: () => null,
    executeTool: async () => "",
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

function teardownAllMocks(): void {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// DB mock — switches conversation_status between "active" and "human_takeover"
// to drive the takeover-detection code path.
// ─────────────────────────────────────────────────────────────────────────────

interface DbExecuteFn {
  (sql: { strings?: TemplateStringsArray; sql?: string }): Promise<unknown>;
}

function makeMockDb(conversationStatus: "active" | "human_takeover"): {
  execute: ReturnType<typeof vi.fn>;
} {
  let conversationLookupCount = 0;
  return {
    execute: vi.fn(async (query: unknown) => {
      const sqlStr =
        (query as { sql?: string }).sql ??
        (query as { queryChunks?: Array<{ value?: string }> }).queryChunks
          ?.map((c) => c?.value ?? "")
          .join("") ??
        String(query);

      if (
        sqlStr.includes("SELECT") &&
        sqlStr.includes("whatsapp_conversations")
      ) {
        conversationLookupCount++;
        return [[{ id: 42, conversation_status: conversationStatus }]];
      }
      if (sqlStr.includes("SELECT") && sqlStr.includes("whatsapp_messages")) {
        return [[]];
      }
      if (sqlStr.includes("INSERT") && sqlStr.includes("whatsapp_messages")) {
        return [{ insertId: 100 + conversationLookupCount, affectedRows: 1 }];
      }
      if (sqlStr.includes("UPDATE")) {
        return [{ affectedRows: 1 }];
      }
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

function resetSharedState(): void {
  redisStore.clear();
  redisAvailable = true;
  redisSetThrowOnce = false;
  sendCalls.length = 0;
  setSnapshots.length = 0;
  providerChatCalls = 0;
}

// Byte-exact reassurance phrase. The handler-side constant MUST match this
// byte-for-byte; any drift trips this test loud.
const TAKEOVER_REASSURANCE_PHRASE_EXPECTED =
  "Alguien del equipo te va a responder a la brevedad 🙏";

// ─────────────────────────────────────────────────────────────────────────────
// TAKE-02 Test 1 — first-ack: empty Redis, SETEX succeeds, send fires once.
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 100 TAKE-02 — rate-limited takeover reassurance", () => {
  describe("Test 1 — first-ack: empty Redis, SETEX succeeds, send fires once with TTL=3600", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
    });

    afterEach(() => {
      teardownAllMocks();
    });

    it("sendTextMessage called ONCE with byte-exact TAKEOVER_REASSURANCE_PHRASE; wa:takeover_ack:<phone> key set with TTL", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const db = makeMockDb("human_takeover");
      const log = makeMockLog();
      const phone = "5491100000801";

      const msg = makeMessage(phone, "hola estoy ahi?", "wamid.take02.t1");
      await handleInboundMessage(db as never, log as never, msg);

      // Exactly ONE sendTextMessage call with the byte-exact phrase.
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0]).toBe(TAKEOVER_REASSURANCE_PHRASE_EXPECTED);

      // wa:takeover_ack:<phone> set in Redis with EX 3600 NX flags.
      const ackSet = setSnapshots.find(
        (s) => s.key === `wa:takeover_ack:${phone}`,
      );
      expect(ackSet).toBeDefined();
      // flags include EX (with value), NX
      expect(ackSet?.flags).toContain("EX");
      expect(ackSet?.flags).toContain("3600");
      expect(ackSet?.flags).toContain("NX");

      // CRITICAL: provider.chat (which throws) was NEVER invoked.
      expect(providerChatCalls).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TAKE-02 Test 2 — rate-limit: key already exists, SETEX-NX returns null,
  // send is suppressed.
  // ───────────────────────────────────────────────────────────────────────────

  describe("Test 2 — rate-limit: key already exists → suppress (no send), still return cleanly", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
    });

    afterEach(() => {
      teardownAllMocks();
    });

    it("second inbound within TTL: sendTextMessage NOT called; AI provider NOT invoked", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const phone = "5491100000802";

      // Pre-populate the Redis ack key — simulates the first inbound's
      // SETEX-NX already succeeded earlier in this takeover-session.
      redisStore.set(`wa:takeover_ack:${phone}`, "1");

      const db = makeMockDb("human_takeover");
      const log = makeMockLog();
      const msg = makeMessage(phone, "alguien me responde?", "wamid.take02.t2");
      await handleInboundMessage(db as never, log as never, msg);

      // No sendTextMessage — suppressed.
      expect(sendCalls.length).toBe(0);

      // CRITICAL: provider.chat (which throws) was NEVER invoked.
      expect(providerChatCalls).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TAKE-02 Test 3 — Redis UNAVAILABLE → fail-OPEN: send fires unconditionally.
  // ───────────────────────────────────────────────────────────────────────────

  describe("Test 3 — Redis UNAVAILABLE: fail-OPEN, unconditional reassurance fires", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
    });

    afterEach(() => {
      teardownAllMocks();
    });

    it("sendTextMessage called once even though Redis is down (no rate-limit possible)", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      redisAvailable = false; // Flip BEFORE handler runs.
      const db = makeMockDb("human_takeover");
      const log = makeMockLog();
      const phone = "5491100000803";

      const msg = makeMessage(phone, "estan?", "wamid.take02.t3");
      await handleInboundMessage(db as never, log as never, msg);

      // Sent unconditionally (fail-OPEN).
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0]).toBe(TAKEOVER_REASSURANCE_PHRASE_EXPECTED);

      // CRITICAL: provider.chat (which throws) was NEVER invoked.
      expect(providerChatCalls).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TAKE-02 Test 4 — Redis SET throws → fail-CLOSED: NO send, no AI.
  // ───────────────────────────────────────────────────────────────────────────

  describe("Test 4 — Redis available but SET throws: fail-CLOSED (no send)", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
    });

    afterEach(() => {
      teardownAllMocks();
    });

    it("sendTextMessage NOT called; AI provider NOT invoked", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const phone = "5491100000804";

      // Flip the throw-once flag — the next mockRedisSet call throws once.
      // The handler MUST catch it and return without sending.
      redisSetThrowOnce = true;

      const db = makeMockDb("human_takeover");
      const log = makeMockLog();
      const msg = makeMessage(phone, "hola?", "wamid.take02.t4");

      // The handler must NOT propagate the SETEX throw — it catches and returns.
      await handleInboundMessage(db as never, log as never, msg);

      // No send — fail-CLOSED.
      expect(sendCalls.length).toBe(0);

      // CRITICAL: provider.chat (which throws) was NEVER invoked.
      expect(providerChatCalls).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TAKE-02 Test 5 — "No AI in takeover" sentinel: provider.chat mock throws
  // on ANY call. This test re-asserts the invariant across the most common
  // takeover input shapes.
  // ───────────────────────────────────────────────────────────────────────────

  describe("Test 5 — CRITICAL: no AI provider invocation during human_takeover", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
    });

    afterEach(() => {
      teardownAllMocks();
    });

    it("first inbound during takeover never invokes provider.chat (mock would throw)", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const db = makeMockDb("human_takeover");
      const log = makeMockLog();
      const phone = "5491100000805";

      const msg = makeMessage(phone, "consulta cualquiera", "wamid.take02.t5a");
      // If the handler ever called provider.chat, our mock throws "AI MUST
      // NOT BE INVOKED" and the test fails noisily. Reaching this expectation
      // is the proof.
      await handleInboundMessage(db as never, log as never, msg);

      expect(providerChatCalls).toBe(0);
    });

    it("subsequent inbounds within takeover (after rate-limit) also never invoke provider.chat", async () => {
      const { handleInboundMessage } = await import("../src/webhook/handler");
      const phone = "5491100000806";
      // Pre-populate to force the suppression branch — the AI must STILL not
      // be invoked.
      redisStore.set(`wa:takeover_ack:${phone}`, "1");

      const db = makeMockDb("human_takeover");
      const log = makeMockLog();
      const msg = makeMessage(phone, "hola?", "wamid.take02.t5b");
      await handleInboundMessage(db as never, log as never, msg);

      expect(sendCalls.length).toBe(0); // suppressed
      expect(providerChatCalls).toBe(0); // never invoked
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TAKE-01 wiring tests — exercise the handler-entry session-history scan that
// extracts the most recent `[tool_call: request_human(...)]` reason and
// passes it as `handoffReason` to getSystemPrompt for the current turn.
//
// The wiring lives in handler.ts; this test captures the getSystemPrompt
// kwargs via a spy mock and asserts the extracted reason flows through.
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 100 TAKE-01 — handler-entry session scan for handoffReason wiring", () => {
  let capturedHandoffReason: string | undefined;

  function setupSystemPromptSpy(): void {
    vi.doMock("../src/ai/system-prompt", () => ({
      getSystemPrompt: (options?: { handoffReason?: string }) => {
        capturedHandoffReason = options?.handoffReason;
        return "TEST SYSTEM PROMPT";
      },
    }));
  }

  beforeEach(() => {
    resetSharedState();
    capturedHandoffReason = undefined;
    vi.resetModules();
    // Use the spy version of system-prompt instead of the simple stub.
    setupAllMocks();
    vi.doUnmock("../src/ai/system-prompt");
    setupSystemPromptSpy();
    // For these tests, the AI provider must NOT throw — replace the sentinel
    // with a non-throwing stub so handleInboundMessage completes normally.
    vi.doUnmock("../src/ai/provider");
    vi.doMock("../src/ai/provider", () => ({
      createAiProvider: () => ({
        chat: async () => ({
          content: "respuesta del modelo",
          toolCalls: [],
        }),
      }),
    }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    teardownAllMocks();
  });

  /**
   * Stepped fake-timer advance past `DEBOUNCE_QUIET_WINDOW_MS` mirroring the
   * driver pattern from v5-3-3-degr-01-escalation.test.ts:advancePastQuietWindow.
   */
  async function advancePastQuietWindow(): Promise<void> {
    const QUIET_WINDOW = 7000;
    const POLL_INTERVAL = 500;
    const ticks = Math.ceil(QUIET_WINDOW / POLL_INTERVAL) + 2;
    for (let i = 0; i < ticks; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    }
  }

  it("when session contains a prior [tool_call: request_human({reason: \"X\"})] in an assistant message, handoffReason='X' flows into getSystemPrompt", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const phone = "5491100000810";

    // Seed the session with a prior assistant message that includes a
    // request_human tool-call summary (the same shape handler.ts itself
    // writes at line 887 — `[tool_call: request_human(${JSON.stringify(args)})]`).
    const sessionShape = {
      messages: [
        { role: "user", content: "me lastimé la rodilla", timestamp: 1 },
        {
          role: "assistant",
          content:
            'vi que estás lesionado, te paso con alguien del equipo\n[tool_call: request_human({"reason":"usuario lesionado busca asesoramiento"})]',
          timestamp: 2,
        },
      ],
      updatedAt: 2,
    };
    redisStore.set(`wa:session:${phone}`, JSON.stringify(sessionShape));

    const db = makeMockDb("active");
    const log = makeMockLog();
    const msg = makeMessage(phone, "y ahora?", "wamid.take01.wire.A1");
    const p = handleInboundMessage(db as never, log as never, msg);
    await advancePastQuietWindow();
    await p;

    // The handler extracted the prior reason and passed it through.
    expect(capturedHandoffReason).toBe("usuario lesionado busca asesoramiento");
  });

  it("when session has no prior request_human tool call, handoffReason is undefined (baseline)", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const phone = "5491100000811";

    // Seed the session with normal assistant content — no tool_call markers.
    const sessionShape = {
      messages: [
        { role: "user", content: "hola, quería preguntar", timestamp: 1 },
        { role: "assistant", content: "claro, contame", timestamp: 2 },
      ],
      updatedAt: 2,
    };
    redisStore.set(`wa:session:${phone}`, JSON.stringify(sessionShape));

    const db = makeMockDb("active");
    const log = makeMockLog();
    const msg = makeMessage(
      phone,
      "qué planes tienen?",
      "wamid.take01.wire.A2",
    );
    const p = handleInboundMessage(db as never, log as never, msg);
    await advancePastQuietWindow();
    await p;

    // No prior escalation → no handoffReason passed → baseline render.
    expect(capturedHandoffReason).toBeUndefined();
  });
});
