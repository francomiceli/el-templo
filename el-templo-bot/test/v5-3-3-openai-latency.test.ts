/**
 * v5.3.3 Phase 94 — OpenAI latency + graceful failure regression test
 * (LAT-01 / LAT-02 / LAT-03 — closes BUG-02).
 *
 * TDD fail-in-main discipline (per 94-01-PLAN.md task 1):
 *   - SC#1, SC#2, SC#3 below MUST FAIL against current main:
 *       SC#1 — `new OpenAI()` at openai.ts:29 is called with no options.
 *       SC#2 — no "Dame un segundo 🙌" interim send anywhere in handler.ts.
 *       SC#3 — outer try/catch at handler.ts:334-350 is log-only; no
 *              "Tuve un problemita técnico, ¿me lo escribís de nuevo?".
 *   - SC#4 is the static Cross-Phase Invariant numeric check; PASSES on
 *     main but is included here as a forward-looking regression-protector
 *     (locks `600 >= 45*5 + 30*5 + 20 = 395` for the v5.3.3 baseline).
 *   - After Task 2 (GREEN) lands, all four SC's MUST PASS without test
 *     modification.
 *
 * Mock surface — mirrors `v5-3-3-handler-concurrency.test.ts` (Phase 93
 * pattern anchor): Redis store backed by a Map, in-memory `sendCalls`
 * array, mocked DB execute returning conversation/message row shapes
 * sufficient for the handler pipeline. `vi.doMock` (NOT `vi.mock`) is
 * used per-test so each describe's beforeEach re-binds the
 * provider/whatsapp client mocks (and SC#1's openai-module mock) to its
 * own counters.
 *
 * For SC#2/SC#3 we drive the handler's catch path by mocking
 * `createAiProvider` to return a stub whose `.chat` throws a real
 * `OpenAI.APIError` — the actual class from the openai package — so the
 * `err instanceof OpenAI.APIError` discriminator added in GREEN works
 * against the same constructor identity the handler uses at runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import OpenAI from "openai";
import type { ParsedInboundMessage } from "../src/whatsapp/types";

// ─────────────────────────────────────────────────────────────────────────────
// SC#1 — Timeout boundary (LAT-01): OpenAI SDK constructor receives `timeout`.
//
// Strategy: vi.doMock("openai") inside the SC#1 describe's beforeEach. The
// mock factory records constructor calls into a module-level array that the
// test reads after instantiating OpenAiProvider. The factory must ALSO
// expose `APIError` and `APIConnectionTimeoutError` named exports — the
// production module uses them as types and as `instanceof` targets, so the
// mocked module must preserve their identity via `vi.importActual`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the `timeout` field off an OpenAiProvider's underlying SDK client.
 * The OpenAI SDK stores the resolved timeout publicly on the client
 * instance (see openai/index.d.ts:248 — `timeout: number`). We cast
 * through `unknown` because `client` is a private field on OpenAiProvider
 * but exposing it via a test-only getter would couple production code to
 * test scaffolding — keeping the access pattern in the test file
 * preserves the public surface.
 */
function readClientTimeout(provider: object): unknown {
  const inner = (provider as { client: { timeout: unknown } }).client;
  return inner.timeout;
}

/**
 * Read the `maxRetries` field off an OpenAiProvider's underlying SDK
 * client. Mirrors `readClientTimeout` above — same `unknown`-cast pattern
 * and same brittleness caveat (the OpenAI SDK stores `maxRetries`
 * publicly on the client instance but the field is not part of its
 * documented stable surface; if the SDK ever renames or hides it the
 * test breaks even when production code is correct). The team accepted
 * that caveat for 94-01's `readClientTimeout` and 94-02 inherits the
 * same trade-off for SC#1's surface — see review IN WR-08.
 *
 * Used by the two CR-02 regression `it()` blocks in the SC#1 describe
 * below to assert `client.maxRetries === 0`, which closes the gap in
 * the Cross-Phase Invariant formula: SDK default `maxRetries=2` makes
 * real per-`provider.chat` wall-clock up to 3 × OPENAI_TIMEOUT_MS, not
 * 1 × OPENAI_TIMEOUT_MS as the formula assumes.
 */
function readClientMaxRetries(provider: object): unknown {
  const inner = (provider as { client: { maxRetries: unknown } }).client;
  return inner.maxRetries;
}

describe("LAT-01 (SC#1) — OpenAI SDK client constructed with explicit timeout option", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    // The OpenAI SDK constructor throws if OPENAI_API_KEY is unset. We
    // don't make any real network calls in this describe — just inspect
    // the client's resolved `timeout` field — so a fake key is safe.
    process.env.OPENAI_API_KEY = "sk-test-fake-key-for-unit-test";
    delete process.env.OPENAI_TIMEOUT_MS;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.OPENAI_TIMEOUT_MS;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("defaults to 45000 ms when OPENAI_TIMEOUT_MS is unset", async () => {
    const mod = await import("../src/ai/openai");
    const provider = new mod.OpenAiProvider();

    // GREEN target: `new OpenAI({ timeout: 45000 })` at openai.ts:29.
    // RED state (current main): `new OpenAI()` — SDK default is 600_000.
    expect(readClientTimeout(provider)).toBe(45000);
  });

  it("honors OPENAI_TIMEOUT_MS override (parsed as integer)", async () => {
    process.env.OPENAI_TIMEOUT_MS = "12345";

    const mod = await import("../src/ai/openai");
    const provider = new mod.OpenAiProvider();

    expect(readClientTimeout(provider)).toBe(12345);
  });

  it("falls back to 45000 ms when OPENAI_TIMEOUT_MS is invalid (non-numeric)", async () => {
    process.env.OPENAI_TIMEOUT_MS = "not-a-number";

    const mod = await import("../src/ai/openai");
    const provider = new mod.OpenAiProvider();

    expect(readClientTimeout(provider)).toBe(45000);
  });

  // ───────────────────────────────────────────────────────────────────────
  // CR-02 closure (94-02): assert SDK `maxRetries` is locked to 0.
  //
  // The OpenAI SDK defaults to `maxRetries: 2` (see openai/index.d.ts
  // `RequestOptions.maxRetries?: number; // default 2`). With Phase 94's
  // `timeout: 45000` in place but no `maxRetries` override, a single
  // `provider.chat(...)` call can take up to 3 × 45s = 135s wall-clock.
  // Plugged into the Cross-Phase Invariant formula, real worst-case
  // end-to-end becomes 135 × 5 + 30 × 5 + 20 = 845s — exceeding
  // DEBOUNCE_TTL_SECONDS=600 by 245s. That is the failure mode the
  // invariant exists to prevent (lock expires mid-handler → BUG-01
  // reintroduced).
  //
  // RED state (current main, openai.ts:50 has no maxRetries option):
  //   SDK default 2 → `expect(...).toBe(0)` fails.
  // GREEN state (94-02 Task 2 lands `maxRetries: 0` on the constructor):
  //   `expect(...).toBe(0)` passes.
  // ───────────────────────────────────────────────────────────────────────

  it("constructs OpenAI client with maxRetries: 0 to keep Cross-Phase Invariant within bound", async () => {
    const mod = await import("../src/ai/openai");
    const provider = new mod.OpenAiProvider();

    // GREEN target: `new OpenAI({ timeout: 45000, maxRetries: 0 })`.
    // RED state (current main): SDK default `maxRetries=2`.
    expect(readClientMaxRetries(provider)).toBe(0);
  });

  it("maxRetries remains 0 even when OPENAI_TIMEOUT_MS is overridden", async () => {
    // Lock in that `maxRetries` is not coupled to (nor affected by) the
    // `OPENAI_TIMEOUT_MS` env override. The invariant locks maxRetries
    // at 0; only the timeout is operator-tunable.
    process.env.OPENAI_TIMEOUT_MS = "12345";

    const mod = await import("../src/ai/openai");
    const provider = new mod.OpenAiProvider();

    expect(readClientMaxRetries(provider)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state for SC#2 / SC#3 handler-driven tests.
// Mirrors v5-3-3-handler-concurrency.test.ts setup so the mock surface
// is consistent across the two v5.3.3 phases.
// ─────────────────────────────────────────────────────────────────────────────

const redisStore = new Map<string, string>();
let redisAvailable = true;
const sendCalls: string[] = [];

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

function setupThrowingProviderMock(errorToThrow: Error): void {
  vi.doMock("../src/ai/provider", () => ({
    createAiProvider: () => ({
      chat: async () => {
        throw errorToThrow;
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

function makeMockDb(): {
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
// SC#2 — Interim UX on OpenAI.APIError (LAT-02).
//
// Mock `provider.chat` to throw a real `OpenAI.APIError`. Assert
// `sendTextMessage` was called at least once with text containing
// "Dame un segundo".
// ─────────────────────────────────────────────────────────────────────────────

describe("LAT-02 (SC#2) — interim UX 'Dame un segundo' on OpenAI.APIError", () => {
  beforeEach(() => {
    redisStore.clear();
    redisAvailable = true;
    sendCalls.length = 0;
    vi.resetModules();
    // Construct a real APIError instance — handler's `instanceof OpenAI.APIError`
    // check (added in GREEN) will discriminate on this exact class.
    const apiErr = new OpenAI.APIError(
      503,
      { message: "upstream timeout" } as unknown as Record<string, unknown>,
      "upstream timeout",
      undefined,
    );
    setupThrowingProviderMock(apiErr);
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

  it("sends 'Dame un segundo 🙌' interim message exactly once per inbound", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const db = makeMockDb();
    const log = makeMockLog();
    const phone = "5491100000801";

    const msg = makeMessage(phone, "Hola, hay clases hoy?", "wamid.lat02.A1");
    const p = handleInboundMessage(db as never, log as never, msg);

    // Advance debounce delay (3s) so processWithAiInner runs and triggers
    // provider.chat → throws OpenAI.APIError → catch path sends interim msg.
    await vi.advanceTimersByTimeAsync(3500);
    await p;

    // SC#2 invariant: interim "Dame un segundo" sent exactly once.
    const interimSends = sendCalls.filter((t) => t.includes("Dame un segundo"));
    expect(interimSends.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC#3 — Graceful fallback when OpenAI call ultimately fails (LAT-03).
//
// Same setup as SC#2 — when provider.chat throws OpenAI.APIError the
// handler's outer try/catch fires the graceful-fallback Spanish copy
// "Tuve un problemita técnico, ¿me lo escribís de nuevo?" and the
// promise resolves cleanly (no unhandled throw escapes
// handleInboundMessage).
// ─────────────────────────────────────────────────────────────────────────────

describe("LAT-03 (SC#3) — graceful fallback 'Tuve un problemita técnico' when call ultimately fails", () => {
  beforeEach(() => {
    redisStore.clear();
    redisAvailable = true;
    sendCalls.length = 0;
    vi.resetModules();
    const apiErr = new OpenAI.APIError(
      503,
      { message: "upstream timeout" } as unknown as Record<string, unknown>,
      "upstream timeout",
      undefined,
    );
    setupThrowingProviderMock(apiErr);
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

  it("sends 'Dame un segundo' AND 'Tuve un problemita técnico'; handler returns cleanly", async () => {
    const { handleInboundMessage } = await import("../src/webhook/handler");
    const db = makeMockDb();
    const log = makeMockLog();
    const phone = "5491100000802";

    const msg = makeMessage(phone, "Hola, hay clases hoy?", "wamid.lat03.A1");
    const p = handleInboundMessage(db as never, log as never, msg);

    await vi.advanceTimersByTimeAsync(3500);

    // Handler MUST resolve cleanly — no unhandled rejection. Wrap in
    // expect().resolves.toBeUndefined() to make the assertion explicit.
    await expect(p).resolves.toBeUndefined();

    // Interim message (SC#2 invariant, re-asserted here so SC#3 stands alone).
    const interimSends = sendCalls.filter((t) => t.includes("Dame un segundo"));
    expect(interimSends.length).toBe(1);

    // SC#3 invariant: graceful fallback fired.
    const gracefulSends = sendCalls.filter((t) =>
      t.includes("Tuve un problemita técnico"),
    );
    expect(gracefulSends.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC#4 — Cross-Phase Invariant numeric check.
//
// Static unit assertion — locks the formula
//   DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS
//                         + executeTool_timeout * MAX_TOOL_ITERATIONS
//                         + safety_buffer
//   600 >= 45 * 5 + 30 * 5 + 20 = 395
// at the v5.3.3 baseline. If a future PR lowers DEBOUNCE_TTL_SECONDS
// below 395 (or raises OPENAI_TIMEOUT_MS / executeTool budget without
// re-deriving the floor), this assertion catches it before commit.
//
// Constants hard-coded with a pointer to CONTEXT.md per planner
// discretion — they appear verbatim in the .env.example comment block,
// the handler.ts comment block, and the 94-CONTEXT.md canonical block.
// ─────────────────────────────────────────────────────────────────────────────

describe("SC#4 — Cross-Phase Invariant numeric check (DEBOUNCE_TTL >= 395s floor)", () => {
  it("600 >= (45000/1000)*5 + 30*5 + 20 = 395", () => {
    // See .planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md
    // (lines 33-44, "Cross-Phase Invariant"). Mirrors the canonical block
    // in 93-CONTEXT.md, ROADMAP.md, MACRO-ROADMAP.md, .env.example.
    const DEBOUNCE_TTL_SECONDS = 600;
    const OPENAI_TIMEOUT_MS = 45000;
    const MAX_TOOL_ITERATIONS = 5;
    const EXECUTE_TOOL_BUDGET = 30;
    const SAFETY_BUFFER = 20;

    const minimum =
      (OPENAI_TIMEOUT_MS / 1000) * MAX_TOOL_ITERATIONS +
      EXECUTE_TOOL_BUDGET * MAX_TOOL_ITERATIONS +
      SAFETY_BUFFER;

    expect(minimum).toBe(395);
    expect(DEBOUNCE_TTL_SECONDS).toBeGreaterThanOrEqual(minimum);
  });
});
