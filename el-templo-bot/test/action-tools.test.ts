/**
 * Unit tests for action tools: book_class and register_trial
 *
 * Tests cover:
 * - State eligibility gates for both tools
 * - Interactive button confirmation flow (sendInteractiveMessage called with correct button IDs)
 * - Successful API calls (201)
 * - Conflict handling (409)
 * - Class full with alternative buttons (400)
 * - API error handling (500)
 * - pendingActions store/resolve lifecycle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockSendInteractiveMessage = vi
  .fn()
  .mockResolvedValue("wamid_interactive");

vi.doMock("../src/whatsapp/client.js", () => ({
  sendInteractiveMessage: mockSendInteractiveMessage,
  sendTextMessage: vi.fn().mockResolvedValue("wamid_text"),
}));

// Mock drizzle-orm sql template literal
vi.doMock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    _tag: "sql",
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb(executeResults: unknown[]) {
  const results = [...executeResults];
  return {
    execute: vi.fn().mockImplementation(() => {
      const result = results.shift();
      return Promise.resolve(result);
    }),
  };
}

const ACTIVE_CONTEXT = {
  phone: "5491100000001",
  clientState: "active_member" as const,
};

const LEAD_CONTEXT = {
  phone: "5491100000002",
  clientState: "lead" as const,
};

const TRIAL_CONTEXT = {
  phone: "5491100000003",
  clientState: "trial" as const,
};

const EXPIRED_CONTEXT = {
  phone: "5491100000004",
  clientState: "expired_member" as const,
};

const INACTIVE_CONTEXT = {
  phone: "5491100000005",
  clientState: "inactive_member" as const,
};

// Schedule detail row for DB mock
const SCHEDULE_ROW = {
  id: 42,
  activity_name: "CrossFit",
  branch_name: "Alem",
  day_of_week: 1,
  start_time: "08:00",
  end_time: "09:00",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("book_class tool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockSendInteractiveMessage.mockClear();
    mockSendInteractiveMessage.mockResolvedValue("wamid_interactive");
    // Reset fetch mock
    vi.stubGlobal("fetch", vi.fn());
  });

  async function getExecuteTool() {
    const { executeTool } = await import("../src/ai/tools");
    return executeTool;
  }

  it("state gate: lead gets directed to trial", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "book_class",
      { scheduleId: 1, date: "2026-03-20" },
      db as never,
      1,
      LEAD_CONTEXT,
    );

    expect(result).toContain("clase de prueba gratuita");
  });

  it("state gate: expired member gets reactivation message", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "book_class",
      { scheduleId: 1, date: "2026-03-20" },
      db as never,
      1,
      EXPIRED_CONTEXT,
    );

    expect(result).toContain("membresia no esta activa");
  });

  it("state gate: trial user gets membership info", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "book_class",
      { scheduleId: 1, date: "2026-03-20" },
      db as never,
      1,
      TRIAL_CONTEXT,
    );

    expect(result).toContain("membresias");
  });

  it("confirmation sends interactive buttons (confirmed=false)", async () => {
    const executeTool = await getExecuteTool();

    // DB: user lookup, schedule lookup
    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
      [[SCHEDULE_ROW]], // schedule details
    ]);

    const result = await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20" },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toBe("[BUTTONS_SENT]");
    expect(mockSendInteractiveMessage).toHaveBeenCalledTimes(1);
    expect(mockSendInteractiveMessage).toHaveBeenCalledWith(
      ACTIVE_CONTEXT.phone,
      expect.stringContaining("CrossFit"),
      [
        { id: "confirm_booking", title: "Confirmar" },
        { id: "cancel_booking", title: "Cancelar" },
      ],
    );
  });

  it("successful booking (confirmed=true)", async () => {
    const executeTool = await getExecuteTool();

    // DB: user lookup, schedule details for success message
    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
      [[SCHEDULE_ROW]], // schedule details for success message
    ]);

    // Mock fetch - 201 success
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ success: true }),
      }),
    );

    const result = await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20", confirmed: true },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toContain("Reserva confirmada");
    expect(result).toContain("Lunes");
    expect(result).toContain("Alem");
    // Should NOT send interactive buttons for confirmed booking
    expect(mockSendInteractiveMessage).not.toHaveBeenCalled();
  });

  it("already booked (409)", async () => {
    const executeTool = await getExecuteTool();

    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
      }),
    );

    const result = await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20", confirmed: true },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toContain("Ya tenes una reserva");
  });

  it("class full sends alternative buttons (400)", async () => {
    const executeTool = await getExecuteTool();

    const alternatives = [
      {
        id: 43,
        activity_name: "Yoga",
        branch_name: "Alem",
        day_of_week: 1,
        start_time: "10:00",
        end_time: "11:00",
        max_capacity: 20,
        booking_count: 5,
      },
      {
        id: 44,
        activity_name: "Funcional",
        branch_name: "Alem",
        day_of_week: 2,
        start_time: "09:00",
        end_time: "10:00",
        max_capacity: 15,
        booking_count: 3,
      },
    ];

    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
      [alternatives], // alternative schedules
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
      }),
    );

    const result = await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20", confirmed: true },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toBe("[BUTTONS_SENT]");
    expect(mockSendInteractiveMessage).toHaveBeenCalledTimes(1);
    expect(mockSendInteractiveMessage).toHaveBeenCalledWith(
      ACTIVE_CONTEXT.phone,
      expect.stringContaining("llena"),
      expect.arrayContaining([
        expect.objectContaining({
          id: "schedule_43_2026-03-20",
        }),
      ]),
    );
  });

  it("class full with no alternatives (400)", async () => {
    const executeTool = await getExecuteTool();

    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
      [[]], // no alternatives
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
      }),
    );

    const result = await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20", confirmed: true },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toContain("no hay alternativas");
    expect(mockSendInteractiveMessage).not.toHaveBeenCalled();
  });

  it("API error (500)", async () => {
    const executeTool = await getExecuteTool();

    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      }),
    );

    const result = await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20", confirmed: true },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toContain("No pude completar la reserva");
  });
});

describe("register_trial tool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockSendInteractiveMessage.mockClear();
    mockSendInteractiveMessage.mockResolvedValue("wamid_interactive");
    vi.stubGlobal("fetch", vi.fn());
  });

  async function getExecuteTool() {
    const { executeTool } = await import("../src/ai/tools");
    return executeTool;
  }

  it("state gate: active member gets redirected", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "register_trial",
      { name: "Maria" },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    expect(result).toContain("Ya sos miembro");
  });

  it("state gate: trial user gets membership info", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "register_trial",
      { name: "Carlos" },
      db as never,
      1,
      TRIAL_CONTEXT,
    );

    expect(result).toContain("clase de prueba registrada");
  });

  it("state gate: expired member gets warm redirect", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "register_trial",
      { name: "Juan" },
      db as never,
      1,
      EXPIRED_CONTEXT,
    );

    expect(result).toContain("Hola de nuevo");
  });

  it("state gate: inactive member gets warm redirect", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "register_trial",
      { name: "Ana" },
      db as never,
      1,
      INACTIVE_CONTEXT,
    );

    expect(result).toContain("Hola de nuevo");
  });

  it("confirmation sends interactive buttons (confirmed=false)", async () => {
    const executeTool = await getExecuteTool();

    const db = createMockDb([
      [[SCHEDULE_ROW]], // schedule details
    ]);

    const result = await executeTool(
      "register_trial",
      { name: "Maria", scheduleId: 42, date: "2026-03-20" },
      db as never,
      1,
      LEAD_CONTEXT,
    );

    expect(result).toBe("[BUTTONS_SENT]");
    expect(mockSendInteractiveMessage).toHaveBeenCalledTimes(1);
    expect(mockSendInteractiveMessage).toHaveBeenCalledWith(
      LEAD_CONTEXT.phone,
      expect.stringContaining("Maria"),
      [
        { id: "confirm_trial", title: "Confirmar" },
        { id: "cancel_trial", title: "Cancelar" },
      ],
    );
  });

  it("missing scheduleId prompts class selection", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    const result = await executeTool(
      "register_trial",
      { name: "Maria" },
      db as never,
      1,
      LEAD_CONTEXT,
    );

    expect(result).toContain("check_schedule");
  });

  it("successful registration (confirmed=true)", async () => {
    const executeTool = await getExecuteTool();

    const db = createMockDb([
      [[SCHEDULE_ROW]], // schedule details for success message
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ success: true }),
      }),
    );

    const result = await executeTool(
      "register_trial",
      {
        name: "Maria",
        scheduleId: 42,
        date: "2026-03-20",
        confirmed: true,
      },
      db as never,
      1,
      LEAD_CONTEXT,
    );

    expect(result).toContain("Listo!");
    expect(result).toContain("CrossFit");
    expect(result).toContain("Alem");
  });

  it("already had trial (409)", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
      }),
    );

    const result = await executeTool(
      "register_trial",
      {
        name: "Maria",
        scheduleId: 42,
        date: "2026-03-20",
        confirmed: true,
      },
      db as never,
      1,
      LEAD_CONTEXT,
    );

    expect(result).toContain("planes de membresia");
  });

  it("API error (500)", async () => {
    const executeTool = await getExecuteTool();
    const db = createMockDb([]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      }),
    );

    const result = await executeTool(
      "register_trial",
      {
        name: "Maria",
        scheduleId: 42,
        date: "2026-03-20",
        confirmed: true,
      },
      db as never,
      1,
      LEAD_CONTEXT,
    );

    expect(result).toContain("No pude completar el registro");
  });
});

describe("resolvePendingAction", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSendInteractiveMessage.mockClear();
    mockSendInteractiveMessage.mockResolvedValue("wamid_interactive");
  });

  it("returns and clears pending action", async () => {
    const { executeTool, resolvePendingAction } =
      await import("../src/ai/tools");

    // Set up a pending action by calling bookClass with unconfirmed
    const db = createMockDb([
      [[{ id: 10 }]], // user by phone
      [[SCHEDULE_ROW]], // schedule details
    ]);

    await executeTool(
      "book_class",
      { scheduleId: 42, date: "2026-03-20" },
      db as never,
      1,
      ACTIVE_CONTEXT,
    );

    // Should return the pending action
    const pending = resolvePendingAction(ACTIVE_CONTEXT.phone);
    expect(pending).toBeDefined();
    expect(pending?.tool).toBe("book_class");
    expect(pending?.args.confirmed).toBe(true);

    // Second call should return undefined (cleared)
    const pending2 = resolvePendingAction(ACTIVE_CONTEXT.phone);
    expect(pending2).toBeUndefined();
  });

  it("returns undefined when no pending action", async () => {
    const { resolvePendingAction } = await import("../src/ai/tools");

    const result = resolvePendingAction("5491199999999");
    expect(result).toBeUndefined();
  });
});
