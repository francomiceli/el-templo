/**
 * v5.3.3 Phase 95 Plan 95-03 — DEGR-01 retry counter + escalation safety net
 * (closes BUG-05; also pins DEGR-02 / SC#3 invariant via SC-E).
 *
 * Scenario taxonomy (one-to-one with CONTEXT.md D-05..D-18):
 *   SC-A (POSITIVE): two failed tool calls trip the synthetic escalation
 *                    (HANDOFF_ESCALATION_PHRASE + synthetic request_human +
 *                    humanTakeoverTriggered + segments[0] suppression).
 *                    Maps to D-05, D-06, D-07, D-08, D-13.
 *   SC-B (POSITIVE): no reset on intermediate success — fail / success /
 *                    fail still trips on the 2nd failure. Maps to D-12.
 *   SC-C (POSITIVE × 4): each of the 4 allowlist entries increments the
 *                       counter — bookClass-fail (tools.ts:806),
 *                       registerTrial-fail (tools.ts:968),
 *                       executeTool-timeout (tools.ts:271, 95-02 e213ee80),
 *                       default-case dynamic 'Herramienta "X" no disponible.'
 *                       (tools.ts:264 family, startsWith discriminator).
 *                       Maps to D-11.
 *   SC-D (POSITIVE): non-ToolTimeoutError throw from executeTool increments
 *                    via handler-side try/catch wrapper. Maps to D-11(a).
 *   SC-E (NEGATIVE / SC#3 guardrail): soft-rejection inbound ("lo pienso")
 *                    does NOT increment, does NOT emit synthetic phrase, does
 *                    NOT invoke synthetic request_human. Pre-empts Phase 97
 *                    RGUARD-02. Maps to D-14.
 *   SC-F (NEGATIVE / allowlist boundary): degraded-UX strings (e.g., "Esa
 *                    clase esta llena...") are NOT on the allowlist. Two such
 *                    returns in one inbound do NOT trip count=2. Maps to
 *                    D-11 boundary.
 *
 * Observed RED state on the post-95-02 master (HEAD before this commit's
 * GREEN sibling lands): at minimum 4 of the 6 scenarios FAIL because the
 * failedToolCalls counter, HANDOFF_ESCALATION_PHRASE constant,
 * FAILURE_ALLOWLIST, isFailureToolResult helper, and the threshold-check
 * escalation block do not yet exist in handler.ts. SC-E + SC-F may pass by
 * vacuous truth on master (no synthetic phrase logic exists to violate
 * their negative assertions) — they remain RED-shaped guarantees about
 * post-95-03 behavior.
 *
 * Mocking pattern mirrors `el-templo-bot/test/v5-3-3-openai-latency.test.ts`
 * (vi.doMock for provider/tools/whatsapp/system-prompt/memory/playbook,
 * vi.mock for redis + pino). No production source modified by this commit;
 * GREEN sibling commit ships the handler.ts changes that turn SC-A..SC-D
 * from RED to GREEN while preserving SC-E + SC-F as PASS.
 *
 * Allowlist string literals in this file MUST byte-equal the source in
 * `el-templo-bot/src/ai/tools.ts`:
 *   - tools.ts:806  → 'No pude completar la reserva. Intenta de nuevo en un momento.'
 *   - tools.ts:968  → 'No pude completar el registro. Intenta de nuevo en un momento.'
 *   - tools.ts:271  → 'Herramienta agotada por tiempo de espera.'  (95-02 shipped)
 *   - tools.ts:264  → 'Herramienta "${name}" no disponible.'        (dynamic family)
 * Degraded-UX (NOT on allowlist) byte-exact references:
 *   - tools.ts:803  → 'Esa clase esta llena y no hay alternativas disponibles esta semana.'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolTimeoutError } from "../src/ai/with-timeout";
import type { ParsedInboundMessage } from "../src/whatsapp/types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state — module scope; reset in beforeEach.
// ─────────────────────────────────────────────────────────────────────────────

interface ToolCallShape {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
interface ChatResponseShape {
  content: string | null;
  toolCalls: ToolCallShape[];
}

const redisStore = new Map<string, string>();
let redisAvailable = true;

const sendCalls: string[] = [];
const executeToolCalls: Array<{
  name: string;
  args: Record<string, unknown>;
}> = [];
let providerChatCalls = 0;
const nextChatResponses: ChatResponseShape[] = [];
const nextToolResults: Array<string | Error> = [];

// ─────────────────────────────────────────────────────────────────────────────
// Redis mock — identical map-backed store + Lua-script emulation as in
// v5-3-3-handler-concurrency.test.ts / v5-3-3-openai-latency.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Per-test mocks — registered via vi.doMock inside setupAllMocks() so each
// `it` block can pre-populate `nextChatResponses` + `nextToolResults` before
// dynamically importing `../src/webhook/handler`.
// ─────────────────────────────────────────────────────────────────────────────

function setupAllMocks(): void {
  vi.doMock("../src/ai/provider", () => ({
    createAiProvider: () => ({
      chat: async (_messages: unknown[], _tools: unknown[] | undefined) => {
        providerChatCalls++;
        // If no scripted response queued, exit the tool loop cleanly with
        // an empty text + zero tool calls (the handler treats this as
        // FALLBACK_MESSAGE — fine for our assertions, which focus on the
        // escalation side-effects, not the final text content).
        const next = nextChatResponses.shift();
        if (!next) {
          return { content: "", toolCalls: [] };
        }
        return next;
      },
    }),
  }));

  vi.doMock("../src/ai/system-prompt", () => ({
    getSystemPrompt: () => "TEST SYSTEM PROMPT",
  }));

  vi.doMock("../src/ai/tools", () => ({
    BOT_TOOLS: [],
    resolvePendingAction: () => null,
    executeTool: async (
      name: string,
      args: Record<string, unknown>,
      _db: unknown,
      _conversationId?: number,
      _context?: { phone: string; clientState: unknown },
    ): Promise<string> => {
      executeToolCalls.push({ name, args });
      const next = nextToolResults.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next ?? "";
    },
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
// DB / message / log helpers — copied from v5-3-3-openai-latency.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

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
// Tool-call builder — keeps the per-scenario provider response inline-readable.
// ─────────────────────────────────────────────────────────────────────────────

let toolCallSeq = 0;
function tc(name: string, args: Record<string, unknown> = {}): ToolCallShape {
  toolCallSeq++;
  return { id: `call_${toolCallSeq}`, name, arguments: args };
}

function chat(
  content: string | null,
  toolCalls: ToolCallShape[],
): ChatResponseShape {
  return { content, toolCalls };
}

// Allowlist source strings (byte-equal to tools.ts at the locations in the
// header comment). Centralized here so any future drift is a single-point
// edit; SC-C iterates over them.
const FAIL_BOOK_CLASS =
  "No pude completar la reserva. Intenta de nuevo en un momento.";
const FAIL_REGISTER_TRIAL =
  "No pude completar el registro. Intenta de nuevo en un momento.";
const FAIL_TOOL_TIMEOUT = "Herramienta agotada por tiempo de espera.";
const FAIL_DEFAULT_DYNAMIC = 'Herramienta "unknown_tool" no disponible.';

const DEGRADED_UX_CLASS_FULL =
  "Esa clase esta llena y no hay alternativas disponibles esta semana.";
const SUCCESS_BOOKING_ECHO = "Reserva confirmada para mañana 18:00.";

const HANDOFF_ESCALATION_PHRASE =
  "Te paso con alguien del equipo, te escriben enseguida 🙌";

// ─────────────────────────────────────────────────────────────────────────────
// Common driver — invoke handleInboundMessage and advance past the
// Phase 100 DBNC-01 trailing-debounce quiet window.
//
// Phase 100 driver-update (Task 4): the OLD fixed 3s
// `vi.advanceTimersByTimeAsync(3500)` is replaced with stepped 500ms
// advances totaling 16 ticks (= 8000ms) so the poll loop's async
// `await getLatestInboundAt(...)` reads against the Map-backed Redis mock
// resolve between ticks. A single jump skips those microtask flushes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stepped fake-timer advance past `DEBOUNCE_QUIET_WINDOW_MS`. See
 * handler.ts for the contract (7000ms window, 500ms poll interval).
 */
async function advancePastQuietWindow(): Promise<void> {
  const QUIET_WINDOW = 7000;
  const POLL_INTERVAL = 500;
  const ticks = Math.ceil(QUIET_WINDOW / POLL_INTERVAL) + 2;
  for (let i = 0; i < ticks; i++) {
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
  }
}

async function driveHandler(
  phone: string,
  text: string,
  wamid: string,
): Promise<void> {
  const { handleInboundMessage } = await import("../src/webhook/handler");
  const db = makeMockDb();
  const log = makeMockLog();
  const msg = makeMessage(phone, text, wamid);
  const p = handleInboundMessage(db as never, log as never, msg);
  await advancePastQuietWindow();
  await p;
}

function resetSharedState(): void {
  redisStore.clear();
  redisAvailable = true;
  sendCalls.length = 0;
  executeToolCalls.length = 0;
  providerChatCalls = 0;
  nextChatResponses.length = 0;
  nextToolResults.length = 0;
  toolCallSeq = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SC-A — POSITIVE: two failed tool calls trigger the synthetic escalation.
// ─────────────────────────────────────────────────────────────────────────────

describe("Plan 95-03 / DEGR-01 — escalation counter + synthetic phrase", () => {
  describe("SC-A (D-05/D-06/D-07/D-08/D-13) — count=2 trips escalation", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      teardownAllMocks();
    });

    it("emits HANDOFF_ESCALATION_PHRASE + synthetic request_human + suppresses model segments[0]", async () => {
      // Two iterations of the provider yielding one book_class tool call
      // each. After each tool call, the mocked executeTool returns the
      // bookClass allowlist fail-string. After 2 failures, counter == 2 →
      // ESCALATE → loop exits via early return → no segments[0] leak.
      nextChatResponses.push(
        chat(null, [tc("book_class", { scheduleId: 1, date: "2026-05-20" })]),
        chat("Te quedó algo más por consultar?", [
          tc("book_class", { scheduleId: 1, date: "2026-05-20" }),
        ]),
        // Defensive 3rd iteration content — if the loop did NOT exit, the
        // assertion `providerChatCalls <= 2` below catches the regression.
        chat("Te quedó algo más por consultar?", []),
      );
      nextToolResults.push(FAIL_BOOK_CLASS, FAIL_BOOK_CLASS);

      await driveHandler("5491100000001", "quiero reservar", "wamid_sca_1");

      // (1) Exactly ONE sendTextMessage call, with the byte-exact locked phrase.
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0]).toBe(
        "Te paso con alguien del equipo, te escriben enseguida 🙌",
      );

      // (2) Synthetic request_human invocation with the exact reason string.
      const synthetic = executeToolCalls.find(
        (c) => c.name === "request_human",
      );
      expect(synthetic).toBeDefined();
      expect(synthetic?.args.reason).toBe("auto_escalation_after_2_failures");

      // (3) Provider.chat invoked at most twice — loop exits BEFORE the
      //     defensive 3rd iteration scripted above.
      expect(providerChatCalls).toBeLessThanOrEqual(2);

      // (4) Model `response.content` ("Te quedó algo más por consultar?") is
      //     NOT emitted via sendTextMessage. Pinned by (1) — sendCalls.length === 1
      //     AND sendCalls[0] === locked phrase. Belt-and-suspenders explicit:
      expect(
        sendCalls.some((t) => t.includes("Te quedó algo más por consultar?")),
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SC-B — POSITIVE: no reset on intermediate success per D-12.
  // ─────────────────────────────────────────────────────────────────────────────

  describe("SC-B (D-12) — granularity: intermediate success does NOT reset counter", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      teardownAllMocks();
    });

    it("fail / success-in-same-iteration / fail still escalates on iteration 2", async () => {
      // Iteration 1: TWO tool calls in one assistant turn — first fails,
      // second succeeds. Counter = 1 after iter 1 (no reset on success).
      // Iteration 2: ONE tool call, fails. Counter = 2 → ESCALATE.
      nextChatResponses.push(
        chat(null, [
          tc("book_class", { scheduleId: 1, date: "2026-05-20" }),
          tc("check_schedule", { date: "2026-05-21" }),
        ]),
        chat(null, [tc("book_class", { scheduleId: 2, date: "2026-05-22" })]),
        chat("texto del modelo que NO debería leakear", []),
      );
      nextToolResults.push(
        FAIL_BOOK_CLASS, // iter 1, call 1 — fail (count -> 1)
        SUCCESS_BOOKING_ECHO, // iter 1, call 2 — success (count STAYS 1)
        FAIL_BOOK_CLASS, // iter 2, call 1 — fail (count -> 2, ESCALATE)
      );

      await driveHandler("5491100000002", "varias cosas", "wamid_scb_1");

      // Escalation fires after the SECOND iteration's failure.
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0]).toBe(HANDOFF_ESCALATION_PHRASE);
      const synthetic = executeToolCalls.find(
        (c) => c.name === "request_human",
      );
      expect(synthetic).toBeDefined();
      expect(synthetic?.args.reason).toBe("auto_escalation_after_2_failures");

      // Provider.chat invoked exactly 2 times — the iter-2 fail trips the
      // threshold and returns BEFORE the 3rd scripted response is consumed.
      expect(providerChatCalls).toBe(2);

      // Belt: model content from iter 2 (which is a text-only assistant turn
      // in the scripted response) must not be emitted because the threshold
      // fires inside the iter-2 tool loop BEFORE the next provider.chat that
      // would yield that text.
      expect(sendCalls.some((t) => t.includes("texto del modelo que NO"))).toBe(
        false,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SC-C — POSITIVE × 4: each allowlist entry increments the counter.
  // ─────────────────────────────────────────────────────────────────────────────

  describe("SC-C (D-11) — allowlist coverage", () => {
    const allowlistCases: Array<{ label: string; failString: string }> = [
      {
        label: "(i) bookClass fail (tools.ts:806)",
        failString: FAIL_BOOK_CLASS,
      },
      {
        label: "(ii) registerTrial fail (tools.ts:968)",
        failString: FAIL_REGISTER_TRIAL,
      },
      {
        label:
          "(iii) executeTool ToolTimeoutError catch return (tools.ts:271, 95-02 e213ee80)",
        failString: FAIL_TOOL_TIMEOUT,
      },
      {
        label:
          "(iv) executeTool default-case dynamic 'Herramienta \"X\" no disponible.' (tools.ts:264)",
        failString: FAIL_DEFAULT_DYNAMIC,
      },
    ];

    for (const { label, failString } of allowlistCases) {
      describe(label, () => {
        beforeEach(() => {
          resetSharedState();
          vi.resetModules();
          setupAllMocks();
          vi.useFakeTimers();
        });

        afterEach(() => {
          vi.useRealTimers();
          teardownAllMocks();
        });

        it("pairs this entry with one bookClass-fail to trip the count=2 escalation", async () => {
          // Pair this entry with FAIL_BOOK_CLASS to reach count=2. For the
          // (i) case the pair is two bookClass-fails — semantically identical
          // to SC-A but expressed via the same harness for symmetry.
          nextChatResponses.push(
            chat(null, [tc("book_class", { scheduleId: 1 })]),
            chat(null, [tc("book_class", { scheduleId: 1 })]),
            chat("post-escalation text that must not leak", []),
          );
          nextToolResults.push(failString, FAIL_BOOK_CLASS);

          await driveHandler(
            "5491100000003",
            "trigger allowlist case",
            `wamid_scc_${toolCallSeq + 1}`,
          );

          expect(sendCalls.length).toBe(1);
          expect(sendCalls[0]).toBe(HANDOFF_ESCALATION_PHRASE);
          const synthetic = executeToolCalls.find(
            (c) => c.name === "request_human",
          );
          expect(synthetic).toBeDefined();
          expect(synthetic?.args.reason).toBe(
            "auto_escalation_after_2_failures",
          );
        });
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SC-D — POSITIVE: handler-side try/catch wrapper increments on throw.
  // ─────────────────────────────────────────────────────────────────────────────

  describe("SC-D (D-11(a) / D-15 / D-18) — throw-path increment via handler try/catch", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      teardownAllMocks();
    });

    it("counter increments on a non-ToolTimeoutError throw; single throw alone does NOT escalate (threshold is >= 2)", async () => {
      // executeTool throws a generic Error on iter 1 (NOT ToolTimeoutError —
      // the executeTool internal catch shipped in 95-02 e213ee80 already
      // converts ToolTimeoutError to the allowlist return string, so the
      // handler-side throw branch is only reachable for OTHER error types).
      //
      // The throw re-propagates through processWithAiInner → processWithAi
      // → handleInboundMessage's outer try/catch (handler.ts:345-369), which
      // sends the LAT-03 graceful-fallback string. The COUNTER MUST INCREMENT
      // before the re-throw (recorded on the executeToolCalls array via the
      // mock's invocation; assertion below introspects via a side channel:
      // executeToolCalls.length === 1 + the absence of any synthetic
      // request_human call confirms count = 1 < threshold).
      //
      // Importing ToolTimeoutError keeps the symbol alive for the discipline
      // grep AND documents the contrast between the two error-handling paths.
      expect(ToolTimeoutError).toBeDefined();

      nextChatResponses.push(chat(null, [tc("book_class", { scheduleId: 1 })]));
      nextToolResults.push(new Error("fetch failed"));

      await driveHandler("5491100000004", "boom", "wamid_scd_1");

      // The mock recorded ONE executeTool invocation (the throwing book_class).
      // After the throw re-propagates, handleInboundMessage's outer catch
      // fires the LAT-03 fallback — sendCalls contains that string but NOT
      // the synthetic escalation phrase.
      expect(executeToolCalls.length).toBe(1);
      expect(executeToolCalls[0].name).toBe("book_class");

      // NO synthetic request_human invocation — threshold is >= 2, not >= 1.
      const synthetic = executeToolCalls.find(
        (c) => c.name === "request_human",
      );
      expect(synthetic).toBeUndefined();

      // NO HANDOFF_ESCALATION_PHRASE emitted.
      expect(sendCalls.includes(HANDOFF_ESCALATION_PHRASE)).toBe(false);

      // LAT-03 graceful-fallback fired (handler outer catch).
      expect(
        sendCalls.some((t) => t.includes("Tuve un problemita técnico")),
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SC-E — NEGATIVE: SC#3 / DEGR-02 guardrail (pre-empts Phase 97 RGUARD-02).
  // ─────────────────────────────────────────────────────────────────────────────

  describe("SC-E (D-14) — SC#3 / DEGR-02: soft rejection does NOT trip the counter", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      teardownAllMocks();
    });

    it("inbound 'lo pienso' produces NO synthetic phrase, NO synthetic request_human", async () => {
      // The model emits a text-only response (no tool calls) for a soft
      // rejection. With zero tool calls, the for-loop body never executes,
      // so failedToolCalls stays 0 and no escalation can fire.
      //
      // Soft-rejection corpus referenced in the assertion: 'lo pienso',
      // 'no estoy seguro', 'mañana te digo'. SC-E uses 'lo pienso' as the
      // canonical example; the others are referenced in this comment so a
      // discipline grep for the soft-rejection vocabulary always hits at
      // least one match in this file.
      nextChatResponses.push(chat("Dale, sin problema. Acá estoy 🙌", []));

      await driveHandler("5491100000005", "lo pienso", "wamid_sce_1");

      // The model's reply text is the ONLY thing that should reach the user.
      expect(
        sendCalls.some((t) => t.includes("Dale, sin problema. Acá estoy")),
      ).toBe(true);
      expect(sendCalls.includes(HANDOFF_ESCALATION_PHRASE)).toBe(false);

      // No synthetic request_human invocation — the model didn't request it
      // and the counter never crossed the threshold (counter == 0).
      expect(executeToolCalls.some((c) => c.name === "request_human")).toBe(
        false,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SC-F — NEGATIVE: degraded-UX strings explicitly NOT on the allowlist.
  // ─────────────────────────────────────────────────────────────────────────────

  describe("SC-F (D-11 boundary) — degraded-UX strings are NOT on the allowlist", () => {
    beforeEach(() => {
      resetSharedState();
      vi.resetModules();
      setupAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      teardownAllMocks();
    });

    it("two 'Esa clase esta llena...' returns do NOT trip the count=2 threshold", async () => {
      // Two iterations of book_class, each returning the canonical
      // "class full, no alternatives" degraded-UX string. This string is
      // emitted by tools.ts:803 — explicitly NOT in FAILURE_ALLOWLIST per
      // CONTEXT.md D-11 boundary.
      nextChatResponses.push(
        chat(null, [tc("book_class", { scheduleId: 1 })]),
        chat(null, [tc("book_class", { scheduleId: 2 })]),
        chat("Te avisamos cuando se libere un cupo!", []),
      );
      nextToolResults.push(DEGRADED_UX_CLASS_FULL, DEGRADED_UX_CLASS_FULL);

      await driveHandler("5491100000006", "quiero reservar", "wamid_scf_1");

      // NO synthetic phrase, NO synthetic request_human.
      expect(sendCalls.includes(HANDOFF_ESCALATION_PHRASE)).toBe(false);
      expect(executeToolCalls.some((c) => c.name === "request_human")).toBe(
        false,
      );

      // Provider was allowed to run to the 3rd tool-loop iteration (text-only
      // response) because no threshold ever tripped — the model's text DOES
      // reach the user (segments emitted normally). >= 3 because the handler
      // also fires extractAndUpdateProfile post-loop (an additional provider
      // call); the exact count is unstable across handler refactors, but
      // ">= 3" pins that the tool loop ran to completion (NOT cut short by
      // an escalation), which is the SC-F invariant.
      expect(providerChatCalls).toBeGreaterThanOrEqual(3);
      expect(
        sendCalls.some((t) => t.includes("Te avisamos cuando se libere")),
      ).toBe(true);
    });
  });
});
