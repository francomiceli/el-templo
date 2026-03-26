/**
 * Unit tests for class reminder scheduler
 *
 * Tests cover:
 * 1. Lock not acquired -- returns early, no messages sent
 * 2. No upcoming bookings -- runs but sends 0 messages
 * 3. One booking found, not yet reminded -- sends template, sets Redis key
 * 4. One booking found, already reminded (Redis key exists) -- skips
 * 5. sendTemplateMessage fails for one booking -- logs error, continues, lock released
 * 6. Lock always released even on query error (try/finally)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockAcquireLock = vi.fn().mockResolvedValue(true);
const mockReleaseLock = vi.fn().mockResolvedValue(undefined);

vi.doMock("../src/schedulers/distributed-lock.js", () => ({
  acquireLock: mockAcquireLock,
  releaseLock: mockReleaseLock,
}));

const mockSendTemplateMessage = vi.fn().mockResolvedValue("wamid_template_1");

vi.doMock("../src/whatsapp/client.js", () => ({
  sendTemplateMessage: mockSendTemplateMessage,
}));

const mockRedisGet = vi.fn().mockResolvedValue(null);
const mockRedisSet = vi.fn().mockResolvedValue("OK");

vi.doMock("../src/redis.js", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
  isRedisAvailable: vi.fn().mockReturnValue(true),
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

const BOOKING_ROW = {
  booking_id: 101,
  first_name: "Maria",
  start_time: "10:00",
  activity_name: "CrossFit",
  phone: "5491100000001",
};

function createMockDb(rows: unknown[]) {
  return {
    execute: vi.fn().mockResolvedValue([rows]),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("runClassReminder", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAcquireLock.mockClear();
    mockReleaseLock.mockClear();
    mockSendTemplateMessage.mockClear();
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockAcquireLock.mockResolvedValue(true);
    mockSendTemplateMessage.mockResolvedValue("wamid_template_1");
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
  });

  async function getRunClassReminder() {
    const { runClassReminder } =
      await import("../src/schedulers/class-reminder.js");
    return runClassReminder;
  }

  it("returns early when lock not acquired, no messages sent", async () => {
    mockAcquireLock.mockResolvedValue(false);

    const runClassReminder = await getRunClassReminder();
    const db = createMockDb([]);

    await runClassReminder(db as never);

    expect(mockAcquireLock).toHaveBeenCalledWith("wa:lock:class-reminder", 120);
    expect(db.execute).not.toHaveBeenCalled();
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it("runs with no upcoming bookings, sends 0 messages", async () => {
    const runClassReminder = await getRunClassReminder();
    const db = createMockDb([]);

    await runClassReminder(db as never);

    expect(mockAcquireLock).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:class-reminder");
  });

  it("sends template and sets Redis key for booking not yet reminded", async () => {
    const runClassReminder = await getRunClassReminder();
    const db = createMockDb([BOOKING_ROW]);

    await runClassReminder(db as never);

    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      "5491100000001",
      "class_reminder",
      "es_AR",
      [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Maria" },
            { type: "text", text: "CrossFit" },
            { type: "text", text: "10:00" },
          ],
        },
      ],
    );

    // Should set reminder key with 24h TTL
    expect(mockRedisSet).toHaveBeenCalledWith(
      "wa:reminder:class:101",
      "1",
      "EX",
      86400,
    );

    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:class-reminder");
  });

  it("skips booking that was already reminded (Redis key exists)", async () => {
    mockRedisGet.mockResolvedValue("1");

    const runClassReminder = await getRunClassReminder();
    const db = createMockDb([BOOKING_ROW]);

    await runClassReminder(db as never);

    expect(mockRedisGet).toHaveBeenCalledWith("wa:reminder:class:101");
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:class-reminder");
  });

  it("continues and releases lock when sendTemplateMessage fails", async () => {
    mockSendTemplateMessage.mockRejectedValue(
      new Error("WhatsApp API error: 500"),
    );

    const secondBooking = {
      ...BOOKING_ROW,
      booking_id: 102,
      first_name: "Carlos",
      phone: "5491100000002",
    };

    const runClassReminder = await getRunClassReminder();
    const db = createMockDb([BOOKING_ROW, secondBooking]);

    await runClassReminder(db as never);

    // Should have attempted both bookings
    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(2);

    // No Redis key set for failed sends
    expect(mockRedisSet).not.toHaveBeenCalled();

    // Lock always released
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:class-reminder");
  });

  it("SQL query uses booking_status column (not bare status)", async () => {
    const runClassReminder = await getRunClassReminder();
    const db = createMockDb([]);

    await runClassReminder(db as never);

    // The sql template literal mock captures the strings array
    const sqlArg = db.execute.mock.calls[0][0] as {
      strings: TemplateStringsArray;
    };
    const fullSql = sqlArg.strings.join("?");

    // Must use booking_status, not bare b.status
    expect(fullSql).toContain("booking_status");
    expect(fullSql).not.toMatch(/b\.status\s/);
  });

  it("releases lock even when query throws an error", async () => {
    const runClassReminder = await getRunClassReminder();
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("Connection lost")),
    };

    await runClassReminder(db as never);

    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:class-reminder");
  });
});
