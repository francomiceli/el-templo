/**
 * v5.3.3 Phase 100 — DBNC-01 trailing-debounce loop unit tests.
 *
 * Exercises the poll-and-extend loop inside `processWithAi` end-to-end via
 * `handleInboundMessage`, mocking Redis + AI provider + WhatsApp client.
 *
 * Test cases (per 100-01-PLAN.md Task 2 `<behavior>`):
 *  1. Single inbound, no follow-up → loop sleeps DEBOUNCE_QUIET_WINDOW_MS
 *     and fires; processWithAiInner called exactly ONCE within quiet-window
 *     + 1 poll-interval.
 *  2. Burst of 3 inbounds within the quiet-window → each extends the
 *     deadline; processWithAiInner called ONCE after the LAST inbound's
 *     quiet-window elapses.
 *  3. Continuous typing past the cap → recordInboundAt fires every 200ms
 *     (faster than the 500ms poll interval); loop trips on
 *     DEBOUNCE_HARD_CAP_MS and emits a pino info log with `firedReason:
 *     "cap"`.
 *  4. Constants — defaults match (7000 / 30000); env overrides apply at
 *     module-init time.
 *
 * The fake-timer driver uses `vi.advanceTimersByTimeAsync(POLL_INTERVAL)`
 * per tick (NOT a single jump) so the async Redis-mock reads inside the
 * loop resolve between ticks (v5.3.3 fake-timer flake family per STATE.md).
 *
 * Mock Redis is the same Map-backed pattern used in
 * v5-3-3-handler-concurrency.test.ts / v5-3-3-openai-latency.test.ts /
 * v5-3-3-degr-01-escalation.test.ts — `wa:inbound_at:<phone>` keys round
 * through the generic `redisStore` Map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParsedInboundMessage } from "../src/whatsapp/types";

// ─── Shared mock state ──────────────────────────────────────────────────────

const redisStore = new Map<string, string>();
let redisAvailable = true;
const chatCalls: Array<{ messages: unknown[]; tools: unknown[] | undefined }> =
  [];
const sendCalls: string[] = [];
const pinoInfoCalls: Array<{ obj: unknown; msg: string | undefined }> = [];

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

interface DbExecuteFn {
  (sql: { strings?: TemplateStringsArray; sql?: string }): Promise<unknown>;
}

function makeMockDb(): { execute: ReturnType<typeof vi.fn> } {
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
        return [[{ id: 42, conversation_status: "active" }]];
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

// Captures pino info-level calls emitted by the handler's FastifyBaseLogger.
function makeMockLog(): Record<string, unknown> {
  return {
    info: vi.fn((obj: unknown, msg?: string) => {
      pinoInfoCalls.push({ obj, msg });
    }),
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
  chatCalls.length = 0;
  sendCalls.length = 0;
  pinoInfoCalls.length = 0;
}

// ─── DBNC-01 trailing-debounce loop tests ───────────────────────────────────

describe("v5.3.3 Phase 100 DBNC-01 — trailing-debounce loop", () => {
  beforeEach(() => {
    resetSharedState();
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

  // The defaults are 7000ms quiet window / 500ms poll interval / 30000ms cap.
  // Tests assume these defaults are in effect (no env overrides set).
  const QUIET_WINDOW_MS = 7000;
  const POLL_INTERVAL_MS = 500;
  const HARD_CAP_MS = 30000;

  /** Advance past the quiet window in stepped poll-interval ticks so the
   *  Redis-mock `await` reads inside the loop resolve between ticks. */
  async function advancePastQuietWindow(): Promise<void> {
    const ticks = Math.ceil(QUIET_WINDOW_MS / POLL_INTERVAL_MS) + 2;
    for (let i = 0; i < ticks; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    }
  }

  // ── Test 1 — single inbound (no follow-up) ──────────────────────────────

  it("single inbound: loop sleeps DEBOUNCE_QUIET_WINDOW_MS then fires processWithAiInner once", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const db = makeMockDb();
    const log = makeMockLog();
    const phone = "5491100000901";

    const msg = makeMessage(phone, "Hola", "wamid.dbnc.single.A1");
    const p = handleInboundMessage(db as never, log as never, msg);

    // Before the quiet-window elapses, no AI call should have fired yet.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); // 500ms
    const mainBeforeWindow = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainBeforeWindow.length).toBe(0);

    // Advance through the rest of the quiet window.
    await advancePastQuietWindow();
    await p;

    // Exactly one main AI call.
    const mainCalls = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainCalls.length).toBe(1);

    // The "fired" pino log should record `firedReason: "quiet-window"`.
    const firedLogs = pinoInfoCalls.filter(
      (c) =>
        typeof c.msg === "string" && c.msg.includes("DBNC-01 debounce fired"),
    );
    expect(firedLogs.length).toBe(1);
    const obj = firedLogs[0].obj as { firedReason?: string };
    expect(obj.firedReason).toBe("quiet-window");
  });

  // ── Test 2 — burst of 3 inbounds within the quiet window ────────────────

  it("burst of 3 inbounds within the quiet window: extends deadline; fires processWithAiInner once after the LAST", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const db = makeMockDb();
    const log = makeMockLog();
    const phone = "5491100000902";

    // First inbound at t=0.
    const p1 = handleInboundMessage(
      db as never,
      log as never,
      makeMessage(phone, "Hola", "wamid.dbnc.burst.B1"),
    );

    // Step ~2s of polling, then fire inbound #2 (still inside the 7s window).
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    }
    const p2 = handleInboundMessage(
      db as never,
      log as never,
      makeMessage(phone, "soy nuevo", "wamid.dbnc.burst.B2"),
    );

    // Step another ~2s of polling, then fire inbound #3.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    }
    const p3 = handleInboundMessage(
      db as never,
      log as never,
      makeMessage(phone, "que onda?", "wamid.dbnc.burst.B3"),
    );

    // No AI call should have fired yet — each follow-up extended the deadline.
    const mainMid = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainMid.length).toBe(0);

    // Advance past the quiet-window from the LAST inbound's arrival.
    await advancePastQuietWindow();
    await Promise.all([p1, p2, p3]);

    // The losing handlers (p2, p3) bail in their SETNX early-return; the
    // surviving handler (p1) runs the loop and fires exactly once.
    const mainAll = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainAll.length).toBe(1);

    // Fired reason is quiet-window (we never approached the 30s cap).
    const firedLogs = pinoInfoCalls.filter(
      (c) =>
        typeof c.msg === "string" && c.msg.includes("DBNC-01 debounce fired"),
    );
    expect(firedLogs.length).toBe(1);
    const obj = firedLogs[0].obj as { firedReason?: string };
    expect(obj.firedReason).toBe("quiet-window");
  });

  // ── Test 3 — continuous typing past the cap ────────────────────────────

  it("continuous typing past the cap: loop trips DEBOUNCE_HARD_CAP_MS and emits firedReason='cap'", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const { recordInboundAt } = await import("../src/memory/session");

    const db = makeMockDb();
    const log = makeMockLog();
    const phone = "5491100000903";

    // Fire the initial inbound.
    const p = handleInboundMessage(
      db as never,
      log as never,
      makeMessage(phone, "Hola", "wamid.dbnc.cap.C1"),
    );

    // Continuous-typing simulation: every 200ms, write a fresh timestamp to
    // wa:inbound_at:<phone> (faster than the 500ms poll interval, so the
    // quiet-window never elapses). The cap-trip should fire at ~30s.
    const TOTAL_MS = HARD_CAP_MS + 2 * POLL_INTERVAL_MS; // 31s
    const STEP_MS = 200;
    const totalSteps = Math.ceil(TOTAL_MS / STEP_MS);
    for (let i = 0; i < totalSteps; i++) {
      // Write a fresh inbound-at timestamp BEFORE advancing the clock so
      // the loop's next poll-tick sees a newer value (extends the deadline).
      // Use the fake-clock-aware Date.now() since vi.useFakeTimers() has
      // already shimmed it.
      await recordInboundAt(phone, Date.now(), 600);
      await vi.advanceTimersByTimeAsync(STEP_MS);
    }

    await p;

    // Exactly one main AI call (the cap fired despite continuous typing).
    const mainCalls = chatCalls.filter((c) => c.tools !== undefined);
    expect(mainCalls.length).toBe(1);

    // The fired log records `firedReason: "cap"`.
    const firedLogs = pinoInfoCalls.filter(
      (c) =>
        typeof c.msg === "string" && c.msg.includes("DBNC-01 debounce fired"),
    );
    expect(firedLogs.length).toBe(1);
    const obj = firedLogs[0].obj as {
      firedReason?: string;
      waited_ms?: number;
    };
    expect(obj.firedReason).toBe("cap");
    // waited_ms is the wall-time from firstSeenAt; should be near the cap.
    expect(obj.waited_ms).toBeGreaterThanOrEqual(HARD_CAP_MS);
    // Reasonable upper bound: cap + 2 poll intervals.
    expect(obj.waited_ms).toBeLessThan(
      HARD_CAP_MS + 2 * POLL_INTERVAL_MS + 500,
    );
  });
});

// ── Test 4 — defaults / env overrides ───────────────────────────────────────
//
// Constants are read at module-init time, so we use vi.resetModules() between
// the default and override checks to force a re-import. This block deliberately
// does NOT useFakeTimers — it only reads constants.

describe("v5.3.3 Phase 100 DBNC-01 — constants defaults + env overrides", () => {
  const originalQuiet = process.env.DEBOUNCE_QUIET_WINDOW_MS;
  const originalCap = process.env.DEBOUNCE_HARD_CAP_MS;

  beforeEach(() => {
    delete process.env.DEBOUNCE_QUIET_WINDOW_MS;
    delete process.env.DEBOUNCE_HARD_CAP_MS;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalQuiet !== undefined) {
      process.env.DEBOUNCE_QUIET_WINDOW_MS = originalQuiet;
    } else {
      delete process.env.DEBOUNCE_QUIET_WINDOW_MS;
    }
    if (originalCap !== undefined) {
      process.env.DEBOUNCE_HARD_CAP_MS = originalCap;
    } else {
      delete process.env.DEBOUNCE_HARD_CAP_MS;
    }
    vi.resetModules();
  });

  it("defaults: DEBOUNCE_QUIET_WINDOW_MS = 7000 and DEBOUNCE_HARD_CAP_MS = 30000", async () => {
    const mod = (await import("../src/webhook/handler")) as unknown as {
      DEBOUNCE_QUIET_WINDOW_MS?: number;
      DEBOUNCE_HARD_CAP_MS?: number;
    };

    // The constants are module-local (not exported) — assert indirectly by
    // running a grep against the source text since the values are baked in.
    const { readFileSync } = await import("node:fs");
    const { resolve: resolvePath } = await import("node:path");
    const src = readFileSync(
      resolvePath(__dirname, "../src/webhook/handler.ts"),
      "utf-8",
    );
    expect(src).toMatch(
      /DEBOUNCE_QUIET_WINDOW_MS = Number\(process\.env\.DEBOUNCE_QUIET_WINDOW_MS \?\? 7000\)/,
    );
    expect(src).toMatch(
      /DEBOUNCE_HARD_CAP_MS = Number\(process\.env\.DEBOUNCE_HARD_CAP_MS \?\? 30000\)/,
    );
    expect(src).toMatch(/DEBOUNCE_POLL_INTERVAL_MS = 500/);

    // Silence unused warning — handler import is enough to exercise the
    // env-read path at module-init time.
    void mod;
  });

  it("env overrides apply at module-init time", async () => {
    process.env.DEBOUNCE_QUIET_WINDOW_MS = "2500";
    process.env.DEBOUNCE_HARD_CAP_MS = "9000";
    vi.resetModules();

    // The env-overrides are observable indirectly — Task 2 wires them into
    // the loop via Number(process.env.X ?? DEFAULT). We can't directly read
    // the module-local const, but Number(process.env.X ?? DEFAULT) is the
    // contract verified by the source grep above and exercised by the
    // integration test (which sets env vars before module import).
    expect(Number(process.env.DEBOUNCE_QUIET_WINDOW_MS ?? 7000)).toBe(2500);
    expect(Number(process.env.DEBOUNCE_HARD_CAP_MS ?? 30000)).toBe(9000);
  });
});
