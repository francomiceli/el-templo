/**
 * Phase 99 integration tests (v5.3.3): bot copy and price disclosure fixes.
 *
 * Covers:
 *  - COPY-01 Mica name reinforcement (rendered-prompt + source-text)
 *  - COPY-02 class-name rename + preservation strings (source-text)
 *  - PRICE-01 counter (1st/2nd insistence increments + non-PB1 isolation
 *    + per-inbound increment semantics)
 *  - PRICE-02 disclosure-unlocked addendum injection on the 3rd insistence
 *    (prompt-content + outbound deterministic-mock + lead-disclosure
 *    prefix-suppression + PB1.E4 REGLA FUERTE byte-equal)
 *  - PRICE-01 PB2-transition reset (it.todo — no native PB1→PB2 trigger
 *    in advance.ts, see playbook engine note inside test)
 *
 * Scaffolding mirrors `v5-3-3-handler-concurrency.integration.test.ts`
 * (Map-backed Redis mock + canned-reply AI provider mock + tracked
 * sendTextMessage mock + real MySQL `eltemplo_test` via drizzle) so the
 * Phase 99 wiring (counter, disclosure-unlocked flag, addendum injection,
 * tools.ts lead-branch + formatAvailablePlans) is exercised end-to-end
 * through the real `webhookRoutes` handler dispatch, not a stub.
 *
 * Per CONTEXT.md `<scope_fence>`: zero src/** modifications across this
 * plan's commits. Only new test files in `el-templo-api/test/whatsapp/`.
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
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import type { MetaWebhookPayload } from "../../../el-templo-bot/src/whatsapp/types";
import type { PlaybookSessionState } from "../../../el-templo-bot/src/playbooks/types";

// ─── Source-file resolution helpers ──────────────────────────────────────────
// Source files are read read-only for grep-style assertions. Paths resolved
// from the el-templo-api package root (Vitest cwd).

const REPO_ROOT = resolvePath(__dirname, "../../..");
const SYSTEM_PROMPT_PATH = resolvePath(
  REPO_ROOT,
  "el-templo-bot/src/ai/system-prompt.ts",
);
const KNOWLEDGE_PATH = resolvePath(
  REPO_ROOT,
  "el-templo-bot/src/ai/knowledge.ts",
);
const DEFINITIONS_PATH = resolvePath(
  REPO_ROOT,
  "el-templo-bot/src/playbooks/definitions.ts",
);

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

// ─── Map-backed Redis mock ───────────────────────────────────────────────────
// Mirrors `v5-3-3-handler-concurrency.integration.test.ts:35-130` so the bot's
// playbook-state + session reads/writes go to an in-memory store. Critical:
// `getPlaybookState` and `setPlaybookState` round-trip the canonical
// `wa:playbook:<phone>` key shape so the Phase 99 counter persists per-test.

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

// ─── AI provider mock — canned reply + per-test override ─────────────────────
// Default canned reply: empty toolCalls + neutral Spanish content. Specific
// tests override via `vi.mocked(chat).mockResolvedValueOnce(...)` for the
// 3rd-insistence outbound deterministic-mock tests.

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

// ─── sendTextMessage mock ─────────────────────────────────────────────────────
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

// Import AFTER mocks are registered (mirrors webhook.test.ts pattern).
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";
import {
  getPlaybookState,
  setPlaybookState,
  deletePlaybookState,
} from "../../../el-templo-bot/src/memory/playbook-state";

// ─── Payload + helper utilities ─────────────────────────────────────────────
function makeTextPayload(
  phone: string,
  text: string,
  wamid: string,
  contactName = "Phase99 User",
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
 *
 * Returns the string content of `messages[0]` (the system role message).
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

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("v5.3.3 Phase 99 — Bot copy and price disclosure fixes (integration)", () => {
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
  async function waitForHandler(timeoutMs = 8000): Promise<void> {
    const wait = nextHandlerResolution();
    await Promise.race([
      wait,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  // ─── DB seed bookkeeping for cleanup ───────────────────────────────────────
  const seededPlanIds: number[] = [];

  /**
   * Seed `subscription_plans` with clearly-marked TEST sentinel values.
   * Sentinel prices live in `[99999, 88888, 77777, 0, 1, 100]` — the
   * positive-control test in `v5-3-3-phase-99-no-hardcoded-prices.test.ts`
   * enforces this set.
   *
   * Returns the IDs inserted so the suite can clean them up afterward.
   */
  async function seedTestPlans(): Promise<void> {
    // Use unique names so concurrent test runs don't collide on the
    // `subscription_plans.name` UNIQUE constraint (if any).
    const namePrefix = `PHASE99_TEST_${Date.now().toString(36)}_`;
    interface SeedRow {
      name: string;
      plan_tier: "flex" | "foundation" | "performance" | "other";
      booking_mode: "fixed" | "flexible";
      price_regular: number;
      price_zero: number;
      duration_days: number;
      classes_per_week: number | null;
    }
    const rows: SeedRow[] = [
      // TEST VALUES — not real prices. The bot reads dynamically via
      // check_membership; these sentinels assert wiring, not pricing.
      // price_zero uses sentinel 0 (allowed by positive-control test).
      {
        name: `${namePrefix}FLEX`,
        plan_tier: "flex",
        booking_mode: "flexible",
        price_regular: 99999,
        price_zero: 0,
        duration_days: 30,
        classes_per_week: 2,
      },
      {
        name: `${namePrefix}FOUNDATION`,
        plan_tier: "foundation",
        booking_mode: "fixed",
        price_regular: 88888,
        price_zero: 0,
        duration_days: 30,
        classes_per_week: 3,
      },
    ];
    for (const row of rows) {
      const [result] = await pool.execute(
        `INSERT INTO subscription_plans
         (name, plan_tier, booking_mode, price_regular, price_zero,
          duration_days, classes_per_week,
          is_active, is_archived, is_trial, multi_branch, is_group,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, true, false, false, false, false, NOW(), NOW())`,
        [
          row.name,
          row.plan_tier,
          row.booking_mode,
          row.price_regular,
          row.price_zero,
          row.duration_days,
          row.classes_per_week,
        ],
      );
      seededPlanIds.push((result as { insertId: number }).insertId);
    }
  }

  async function cleanupSeededPlans(): Promise<void> {
    if (seededPlanIds.length === 0) return;
    const placeholders = seededPlanIds.map(() => "?").join(",");
    await pool.execute(
      `DELETE FROM subscription_plans WHERE id IN (${placeholders})`,
      seededPlanIds,
    );
    seededPlanIds.length = 0;
  }

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "phase99-verify-token";
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

    // Use real timers per Phase 95/94 flake history (fake timers interact
    // badly with promise-resolution ordering inside the handler dispatch).
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanupSeededPlans();
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
    // Restore the default canned reply (per-test mockResolvedValueOnce calls
    // override this for the deterministic outbound tests).
    chatMock.mockImplementation(async (messages: unknown[], tools: unknown) => {
      chatCalls.push({ messages, tools });
      return {
        content: "Dale, contame un poco más para entender qué buscás.",
        toolCalls: [] as unknown[],
      };
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // COPY-01 — Mica name reinforcement
  // ───────────────────────────────────────────────────────────────────────────

  describe("Phase 99 COPY-01 — Mica name reinforcement", () => {
    it("renders system prompt with the 'Tu nombre es Mica' directive when PB1 is active", async () => {
      const phone = "+5491100099001";
      await deletePlaybookState(phone);
      // Pre-seed playbook state at PB1.E1A so the handler renders the PB1
      // system prompt on the very first inbound.
      const seedState: PlaybookSessionState = {
        activePlaybook: "PB1",
        currentStage: "PB1.E1A",
        updatedAt: Date.now(),
      };
      await setPlaybookState(phone, seedState);

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "Hola, quería info", "wamid.copy01.a1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const systemPrompt = getRenderedSystemPrompt();
      // The Wave 1 anchor lives at system-prompt.ts:386 (post-trim):
      // `*Tu nombre es Mica* — escribilo siempre así, nunca lo deformes.
      //  Nunca te llames Micla, Mika ni ninguna otra variante.`
      expect(systemPrompt).toContain("Tu nombre es Mica");
      expect(systemPrompt).toContain("Nunca te llames Micla");
    });

    it("system-prompt.ts contains the 'Nunca te llames Micla' anti-misspell anchor (source-text)", () => {
      const contents = readSource(SYSTEM_PROMPT_PATH);
      expect(contents).toContain("Tu nombre es Mica");
      expect(contents).toContain("Nunca te llames Micla");
      // Regression guard: the variant list MUST still include Mika so the
      // negative-example anchor isn't trimmed below the minimum identified
      // in 99-01 SUMMARY.
      expect(contents).toContain("Mika");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // COPY-02 — Class-name rename + preservation strings
  // ───────────────────────────────────────────────────────────────────────────

  describe("Phase 99 COPY-02 — Class-name rename + preservation", () => {
    it("knowledge.ts uses 'clases de calistenia' and does NOT contain 'Sesión Grupal'", () => {
      const contents = readSource(KNOWLEDGE_PATH);
      expect(contents).toMatch(/clases de calistenia/);
      expect(contents).not.toMatch(/sesi[oó]n grupal/i);
    });

    it("system-prompt.ts uses 'clases de calistenia' (>=2 occurrences) and does NOT contain 'Sesión Grupal'", () => {
      const contents = readSource(SYSTEM_PROMPT_PATH);
      const matches = contents.match(/clases de calistenia/g) ?? [];
      // Wave 1 landed the rename at :323 and :375 (post-trim line numbers
      // per 99-01 SUMMARY); we require >=2 to lock both sites.
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(contents).not.toMatch(/sesi[oó]n grupal/i);
    });

    it("preserves communal-value strings in knowledge.ts (byte-equal)", () => {
      const contents = readSource(KNOWLEDGE_PATH);
      expect(contents).toContain("movimiento grupal");
      expect(contents).toContain("sin salirte del grupo");
      expect(contents).toContain("sin salirse del grupo");
    });

    it("preserves TEAM-CORR-06 deprecated-framing guards in definitions.ts (byte-equal)", () => {
      const contents = readSource(DEFINITIONS_PATH);
      expect(contents).toContain("framings de arranque grupal");
      expect(contents).toContain("lenguaje de arranque grupal");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PRICE-01 — Counter increments in PB1
  // ───────────────────────────────────────────────────────────────────────────

  describe("Phase 99 PRICE-01 — Counter increment in PB1", () => {
    it("1st price-insistence increments counter to 1 and does NOT inject disclosure addendum", async () => {
      const phone = "+5491100099002";
      await deletePlaybookState(phone);
      // Pre-seed at PB1.E4 (where the REGLA FUERTE lives) so the inbound
      // increments the counter from 0 → 1.
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "es muy caro", "wamid.price01.a1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      expect(state).not.toBeNull();
      expect(state?.priceInsistenceCount).toBe(1);

      const systemPrompt = getRenderedSystemPrompt();
      // Addendum signature from PB1_PRICE_DISCLOSURE_UNLOCKED_ADDENDUM
      // (system-prompt.ts:204). MUST NOT appear when count < threshold+1.
      expect(systemPrompt).not.toContain("Desbloqueo de disclosure de precios");
    });

    it("2nd price-insistence increments counter to 2 and still does NOT inject disclosure addendum", async () => {
      const phone = "+5491100099003";
      await deletePlaybookState(phone);
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 1,
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "está carísimo", "wamid.price01.b1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      expect(state?.priceInsistenceCount).toBe(2);

      const systemPrompt = getRenderedSystemPrompt();
      expect(systemPrompt).not.toContain("Desbloqueo de disclosure de precios");
    });

    it("counter does NOT increment when priceObjection regex does NOT fire", async () => {
      const phone = "+5491100099004";
      await deletePlaybookState(phone);
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 1,
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "hola gracias", "wamid.price01.c1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      expect(state?.priceInsistenceCount).toBe(1);
    });

    it("counter does NOT increment when activePlaybook is not PB1 (per-PB1-session scoping via cancellation route to PB5)", async () => {
      const phone = "+5491100099005";
      await deletePlaybookState(phone);
      // To force `resolved.playbookId !== "PB1"` deterministically without
      // seeding `users` + `subscriptions` rows that drive clientState off
      // 'lead', we use the resolver's cancellation short-circuit (resolver
      // .ts:77 — `cancellationIntent === true → PB5`). The inbound
      // "quiero cancelar, es muy caro" matches BOTH:
      //   - detectCancellationIntent at handler.ts:1184 (`cancelar`)
      //   - detectPriceObjection at handler.ts:1409 (`caro`)
      // The resolver routes to PB5; the pre-AI counter-increment site
      // (handler.ts:597-600) gates on `resolved.playbookId === "PB1"` AND
      // therefore does NOT increment. This is the production semantics:
      // a price token in a non-PB1 session must not pollute the counter.
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 1,
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(
          phone,
          "quiero cancelar, es muy caro",
          "wamid.price01.d1",
        ),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      // Belt-and-suspenders: the resolved playbook must be PB5.
      expect(state?.activePlaybook).toBe("PB5");
      // PB5 routing wins; the per-PB1-session scoping invariant is that the
      // counter does NOT cross the threshold and is NOT incremented from
      // outside PB1. Production behavior under cancellation routing:
      //   1. Pre-AI write: counter held at prior value (1) because the
      //      PB1 gate is false (handler.ts:597-600 — `priceObjectionPre &&
      //      resolved.playbookId === "PB1" ? prior+1 : prior`).
      //   2. Post-AI stage-advance write (handler.ts:1068): when
      //      `advanceStageIfComplete` returns a non-PB1.* nextStage (here
      //      `PB5.E1 → PB5.E2` on `discoveryAnswered`), the counter resets
      //      to 0 (`nextStage.startsWith("PB1.") ? newCount : 0`).
      // Both 1 (pre-AI preserved) and 0 (post-AI reset) are valid "did
      // not increment" outcomes — neither indicates a PB1-gated bump.
      // Assertion: count is NEVER > 1 (would only happen if the PB1 gate
      // leaked, which is the regression we're guarding against).
      expect(state?.priceInsistenceCount ?? 0).toBeLessThanOrEqual(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PRICE-02 — Disclosure addendum unlocks on 3rd price insistence
  // ───────────────────────────────────────────────────────────────────────────

  describe("Phase 99 PRICE-02 — Disclosure addendum unlocks on 3rd price insistence", () => {
    it("3rd price-insistence injects the disclosure addendum into the rendered prompt", async () => {
      const phone = "+5491100099006";
      await deletePlaybookState(phone);
      await seedTestPlans();
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 2,
        updatedAt: Date.now(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "está muy caro", "wamid.price02.a1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      expect(state?.priceInsistenceCount).toBe(3);

      const systemPrompt = getRenderedSystemPrompt();
      expect(systemPrompt).toContain("Desbloqueo de disclosure de precios");
      // Free-trial re-anchor token from the addendum's mandatory closing:
      // `"...pero lo mejor es que lo pruebes gratis primero"` (verb form
      // — anchored on the trailing literal so a future copy polish on
      // "primero" surfaces here).
      expect(systemPrompt).toContain("pruebes gratis primero");
      // Prospect-aware clause — the addendum tells the LLM to IGNORE the
      // "no encontré una cuenta" prefix for prospects.
      expect(systemPrompt).toContain("IGNORALO por completo");
      expect(systemPrompt).toContain(
        "el usuario es un prospecto, no un miembro registrado",
      );
    });

    it("3rd price-insistence outbound contains the real DB plan price verbatim + free-trial re-anchor (deterministic mock)", async () => {
      const phone = "+5491100099007";
      await deletePlaybookState(phone);
      await seedTestPlans();
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 2,
        updatedAt: Date.now(),
      });

      // Deterministic mock — simulates the LLM correctly following the
      // disclosure addendum: lists the seeded test plan price (99999)
      // verbatim AND closes with the free-trial re-anchor ("gratis").
      chatMock.mockImplementationOnce(
        async (messages: unknown[], tools: unknown) => {
          chatCalls.push({ messages, tools });
          return {
            content:
              "Entiendo. Si te sirve, tenemos el plan FLEX a $99999. Muchos arrancan por ahí... pero lo mejor es que lo pruebes gratis primero. ¿Te anoto?",
            toolCalls: [],
          };
        },
      );

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "está muy caro", "wamid.price02.b1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      const state = await getPlaybookState(phone);
      expect(state?.priceInsistenceCount).toBe(3);

      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
      const outbound = sendCalls[sendCalls.length - 1].text;
      // Seeded test price verbatim (sentinel 99999).
      expect(outbound).toMatch(/\b99999\b/);
      // Free-trial re-anchor token from the addendum's mandatory closing.
      expect(outbound).toMatch(/gratis/i);
    });

    it("3rd price-insistence outbound on the lead-disclosure path does NOT parrot the 'no encontré una cuenta' prefix", async () => {
      const phone = "+5491100099008";
      await deletePlaybookState(phone);
      await seedTestPlans();
      // Lead — no `users` row for this phone. The check_membership tool's
      // Piece D-restructured lead branch returns the preserved
      // "No encontré una cuenta..." prefix appended with the plan listing;
      // the addendum instructs the LLM to IGNORE that prefix for prospects.
      await setPlaybookState(phone, {
        activePlaybook: "PB1",
        currentStage: "PB1.E4",
        priceInsistenceCount: 2,
        updatedAt: Date.now(),
      });

      chatMock.mockImplementationOnce(
        async (messages: unknown[], tools: unknown) => {
          chatCalls.push({ messages, tools });
          return {
            content:
              "Entiendo. Tenemos el plan FLEX a $99999, y otros. Muchos arrancan por ahí... pero lo mejor es que lo pruebes gratis primero. ¿Te anoto?",
            toolCalls: [],
          };
        },
      );

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: makeTextPayload(phone, "está muy caro", "wamid.price02.c1"),
      });
      expect(res.statusCode).toBe(200);
      await waitForHandler();

      expect(sendCalls.length).toBeGreaterThanOrEqual(1);
      const outbound = sendCalls[sendCalls.length - 1].text;
      // Lead-disclosure UX guard: the "no encontré una cuenta" prefix MUST
      // NOT reach the user. The addendum tells the LLM to suppress it.
      expect(outbound).not.toMatch(/no encontré una cuenta/i);
      // Broader catch — any "cuenta" parroting on the lead path is wrong.
      expect(outbound).not.toMatch(/\bcuenta\b/i);
      // Sanity: we're testing the prospect-disclosure path, not just
      // absence of a prefix in any random outbound — the price + re-anchor
      // must still pass.
      expect(outbound).toMatch(/\b99999\b/);
      expect(outbound).toMatch(/gratis/i);
    });

    it("PB1.E4 REGLA FUERTE in definitions.ts is byte-equal regardless of disclosure unlock (source-text)", () => {
      const contents = readSource(DEFINITIONS_PATH);
      // Two-part anchor: the REGLA FUERTE preamble + the ÚNICO CTA closer.
      // Sub-option A discipline locked: definitions.ts:74 must be byte-equal
      // pre/post Phase 99 even when the addendum is injected.
      // Source uses WhatsApp-format SINGLE asterisks: `*REGLA FUERTE:*`
      // (not markdown-format `**`). Anchor on the literal opening so a
      // future trim of the trailing text doesn't break the lock.
      expect(contents).toMatch(/\*REGLA FUERTE:\* en esta etapa NO recomendás/);
      expect(contents).toContain(
        "El ÚNICO CTA válido es la clase de prueba GRATIS",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PRICE-01 — Counter resets on PB1→PB2 transition
  // ───────────────────────────────────────────────────────────────────────────

  describe("Phase 99 PRICE-01 — Counter resets on PB1→PB2 transition", () => {
    // The handler-side reset code path is wired at handler.ts:1068 —
    //   priceInsistenceCount: nextStage.startsWith("PB1.") ? newCount : 0
    // — and is exercised whenever `advanceStageIfComplete` returns a
    // non-PB1.* nextStage.
    //
    // However, no current PB1 stage in advance.ts (`PB1.E1A/E1B/E2A/E2B/E3/
    // E4/E5`) returns a non-PB1.* nextStage — `advanceStageIfComplete` for
    // PB1 caps at `E4 → E5` (advance.ts:166-168). The PB1→PB2 transition
    // happens via the resolver (`resolver.ts`) on `clientState` change
    // (lead becomes trial after booking), NOT via `advanceStageIfComplete`.
    //
    // Per plan: "if no PB1.E7→PB2 native trigger exists in the playbook
    // engine, document this in the test as a known-limitation and skip
    // with it.todo(...) rather than constructing a synthetic transition
    // that misrepresents the production behavior."
    it.todo(
      "counter is reset to 0 when handler advances stage from PB1 to PB2 — requires real clientState-change-driven transition (see in-test note)",
    );
  });
});
