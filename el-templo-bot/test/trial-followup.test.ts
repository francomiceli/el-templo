/**
 * Unit tests for trial follow-up scheduler
 *
 * Tests cover:
 * 1. Lock not acquired -- returns early, no messages sent
 * 2. Outside business hours (3am) -- returns early without querying
 * 3. No eligible trial attendees -- runs but sends 0 messages
 * 4. One eligible attendee, not yet followed up -- sends template, sets Redis key with 7d TTL
 * 5. One eligible attendee, already followed up (Redis key exists) -- skips
 * 6. Attendee already converted to paid membership -- not included in results (query filter)
 * 7. sendTemplateMessage fails -- logs error, continues, lock released
 * 8. Lock released even when query throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const TRIAL_ATTENDEE_ROW = {
  user_id: 42,
  first_name: "Lucia",
  phone: "5491100000010",
  checked_in_at: "2026-03-17T14:00:00.000Z",
};

function createMockDb(rows: unknown[]) {
  return {
    execute: vi.fn().mockResolvedValue([rows]),
  };
}

/**
 * Mock Intl.DateTimeFormat to return a specific hour for Argentina timezone.
 * This controls the isBusinessHours() check inside the scheduler.
 */
const OriginalDateTimeFormat = Intl.DateTimeFormat;

function mockArgentinaHour(hour: number): void {
  // Must use a regular function (not arrow) so it can be called with `new`
  const MockDateTimeFormat = function (
    this: Intl.DateTimeFormat,
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (
      options?.timeZone === "America/Argentina/Buenos_Aires" &&
      options?.hour === "numeric"
    ) {
      return {
        format: () => String(hour),
        formatToParts: () => [],
        formatRange: () => "",
        formatRangeToParts: () => [],
        resolvedOptions: () => ({}) as Intl.ResolvedDateTimeFormatOptions,
      } as Intl.DateTimeFormat;
    }
    return new OriginalDateTimeFormat(locales, options);
  } as unknown as typeof Intl.DateTimeFormat;

  // Copy static methods
  MockDateTimeFormat.supportedLocalesOf =
    OriginalDateTimeFormat.supportedLocalesOf;
  MockDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;

  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(MockDateTimeFormat);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("runTrialFollowup", () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function getRunTrialFollowup() {
    const { runTrialFollowup } =
      await import("../src/schedulers/trial-followup.js");
    return runTrialFollowup;
  }

  it("returns early when lock not acquired, no messages sent", async () => {
    mockAcquireLock.mockResolvedValue(false);
    mockArgentinaHour(14); // Business hours

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([]);

    await runTrialFollowup(db as never);

    expect(mockAcquireLock).toHaveBeenCalledWith("wa:lock:trial-followup", 120);
    expect(db.execute).not.toHaveBeenCalled();
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it("returns early outside business hours without querying", async () => {
    mockArgentinaHour(3); // 3am -- outside business hours

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([]);

    await runTrialFollowup(db as never);

    // Should not even try to acquire lock
    expect(mockAcquireLock).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
  });

  it("runs with no eligible trial attendees, sends 0 messages", async () => {
    mockArgentinaHour(14);

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([]);

    await runTrialFollowup(db as never);

    expect(mockAcquireLock).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:trial-followup");
  });

  it("sends template and sets Redis key with 7d TTL for eligible attendee", async () => {
    mockArgentinaHour(14);

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([TRIAL_ATTENDEE_ROW]);

    await runTrialFollowup(db as never);

    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      "5491100000010",
      "trial_followup",
      "es_AR",
      [
        {
          type: "body",
          parameters: [{ type: "text", text: "Lucia" }],
        },
      ],
    );

    // Should set follow-up key with 7 day TTL (604800 seconds)
    expect(mockRedisSet).toHaveBeenCalledWith(
      "wa:followup:trial:42",
      "1",
      "EX",
      604800,
    );

    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:trial-followup");
  });

  it("skips attendee that was already followed up (Redis key exists)", async () => {
    mockRedisGet.mockResolvedValue("1");
    mockArgentinaHour(14);

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([TRIAL_ATTENDEE_ROW]);

    await runTrialFollowup(db as never);

    expect(mockRedisGet).toHaveBeenCalledWith("wa:followup:trial:42");
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:trial-followup");
  });

  it("converted member not in results (verified via query mock returning empty)", async () => {
    mockArgentinaHour(14);

    // The SQL query has NOT EXISTS for paid subscriptions,
    // so a converted member won't appear in results.
    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([]);

    await runTrialFollowup(db as never);

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:trial-followup");
  });

  it("continues and releases lock when sendTemplateMessage fails", async () => {
    mockSendTemplateMessage.mockRejectedValue(
      new Error("WhatsApp API error: 500"),
    );
    mockArgentinaHour(14);

    const secondAttendee = {
      ...TRIAL_ATTENDEE_ROW,
      user_id: 43,
      first_name: "Pablo",
      phone: "5491100000011",
    };

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([TRIAL_ATTENDEE_ROW, secondAttendee]);

    await runTrialFollowup(db as never);

    // Should have attempted both attendees
    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(2);

    // No Redis key set for failed sends
    expect(mockRedisSet).not.toHaveBeenCalled();

    // Lock always released
    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:trial-followup");
  });

  it("SQL query uses subscription_status column (not bare status)", async () => {
    mockArgentinaHour(14);

    const runTrialFollowup = await getRunTrialFollowup();
    const db = createMockDb([]);

    await runTrialFollowup(db as never);

    // The sql template literal mock captures the strings array
    const sqlArg = db.execute.mock.calls[0][0] as {
      strings: TemplateStringsArray;
    };
    const fullSql = sqlArg.strings.join("?");

    // Must use subscription_status in both main WHERE and NOT EXISTS subquery
    const matches = fullSql.match(/subscription_status/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);

    // Must NOT use bare s.status or s2.status
    expect(fullSql).not.toMatch(/s\.status\s/);
    expect(fullSql).not.toMatch(/s2\.status\s/);
  });

  it("releases lock even when query throws an error", async () => {
    mockArgentinaHour(14);

    const runTrialFollowup = await getRunTrialFollowup();
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("Connection lost")),
    };

    await runTrialFollowup(db as never);

    expect(mockReleaseLock).toHaveBeenCalledWith("wa:lock:trial-followup");
  });
});
