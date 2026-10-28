/**
 * Fase 203 Plan 05 (D-15): GET /api/members/scheduling/my-bookings acepta un
 * parámetro OPCIONAL `weeks` (1 o 2, default 1) para traer la semana actual y
 * la siguiente en UNA consulta. Las versiones viejas de la app (que mandan solo
 * `weekStart`) tienen que recibir exactamente lo mismo que antes.
 *
 * Las fechas se calculan relativas a hoy (lunes de la semana en curso), sin ids
 * de `users` hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  todayStr,
} from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { branches } from "../../src/db/schema/branches";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import { sessions } from "../../src/db/schema/sessions";
import { addDays } from "../../src/modules/shared/date-utils";
import { dateToWeekNumber } from "../../src/modules/shared/week-dates";

const MEMBER_URL = "/api/members/scheduling";

interface MyBookingRow {
  id: number;
  memberId: number;
  scheduleId: number;
  bookingDate: string;
  activityName: string;
}

/** Lunes (UTC) de la semana en curso: ancla de la semana consultada. */
function mondayOfThisWeek(): string {
  const today = todayStr();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back);
}

describe("Fase 203-05: my-bookings con weeks (D-15)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let memberId: number;
  let memberToken: string;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    seq += 1;
    const email = `mybk-weeks-${seq}-${Date.now()}@test.com`;
    const registered = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    memberId = (registered.user as { id: number }).id;
    memberToken = await getAuthToken(app, email, "pass123456");
  });

  async function seedSchedule(dayOfWeek: number): Promise<number> {
    const [activity] = await app.db
      .insert(activities)
      .values({ name: "General", description: "203-05" })
      .$returningId();
    const [schedule] = await app.db
      .insert(schedules)
      .values({
        branchId: testBranchId,
        activityId: activity.id,
        dayOfWeek,
        startTime: "19:00",
        endTime: "20:00",
      })
      .$returningId();
    return schedule.id;
  }

  async function book(
    forMemberId: number,
    scheduleId: number,
    bookingDate: string,
  ): Promise<void> {
    await app.db.insert(bookings).values({
      memberId: forMemberId,
      scheduleId,
      bookingDate,
      status: "reservado",
    });
  }

  async function get(
    query: string,
    token = memberToken,
  ): Promise<{ statusCode: number; body: string }> {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/my-bookings?${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: res.body };
  }

  async function rowsOf(query: string, token = memberToken) {
    const res = await get(query, token);
    expect(res.statusCode, res.body).toBe(200);
    return (JSON.parse(res.body) as { bookings: MyBookingRow[] }).bookings;
  }

  it("sin weeks devuelve solo la semana pedida (igual que antes)", async () => {
    const monday = mondayOfThisWeek();
    const schedule = await seedSchedule(3);
    await book(memberId, schedule, addDays(monday, 2)); // miércoles de esta semana
    await book(memberId, schedule, addDays(monday, 9)); // miércoles de la siguiente

    const rows = await rowsOf(`weekStart=${monday}`);

    expect(rows.map((r) => r.bookingDate)).toEqual([addDays(monday, 2)]);
  });

  it("weeks=1 equivale a no mandar weeks", async () => {
    const monday = mondayOfThisWeek();
    const schedule = await seedSchedule(3);
    await book(memberId, schedule, addDays(monday, 2));
    await book(memberId, schedule, addDays(monday, 9));

    const withParam = await rowsOf(`weekStart=${monday}&weeks=1`);
    const without = await rowsOf(`weekStart=${monday}`);

    expect(withParam).toEqual(without);
    expect(withParam).toHaveLength(1);
  });

  it("weeks=2 devuelve esta semana y la siguiente, ordenadas por fecha", async () => {
    const monday = mondayOfThisWeek();
    const schedule = await seedSchedule(3);
    // Se insertan en orden inverso: el orden lo da la consulta, no el id.
    await book(memberId, schedule, addDays(monday, 9)); // miércoles de la siguiente
    await book(memberId, schedule, addDays(monday, 2)); // miércoles de esta semana
    await book(memberId, schedule, addDays(monday, 12)); // sábado de la siguiente
    await book(memberId, schedule, addDays(monday, 14)); // domingo de la siguiente: fuera
    await book(memberId, schedule, addDays(monday, 16)); // miércoles de la 3.ª: fuera

    const rows = await rowsOf(`weekStart=${monday}&weeks=2`);

    expect(rows.map((r) => r.bookingDate)).toEqual([
      addDays(monday, 2),
      addDays(monday, 9),
      addDays(monday, 12),
    ]);
  });

  it("weeks=2 incluye el domingo de la semana 1 (superset documentado); sin weeks no aparece", async () => {
    const monday = mondayOfThisWeek();
    const schedule = await seedSchedule(3);
    const sunday = addDays(monday, 6);
    await book(memberId, schedule, sunday);

    // weeks=2 es un rango continuo Lun semana 1 -> Sáb semana 2: incluye el
    // domingo de la semana 1, que las dos llamadas viejas excluían; superset
    // inocuo (fase 203).
    const two = await rowsOf(`weekStart=${monday}&weeks=2`);
    const one = await rowsOf(`weekStart=${monday}`);

    expect(two.map((r) => r.bookingDate)).toEqual([sunday]);
    expect(one).toEqual([]);
  });

  it("weeks=2 no mezcla las reservas de otro socio", async () => {
    const monday = mondayOfThisWeek();
    const schedule = await seedSchedule(3);
    await book(memberId, schedule, addDays(monday, 2));
    const otherEmail = `mybk-weeks-ajeno-${Date.now()}@test.com`;
    const other = await registerUser(app, {
      email: otherEmail,
      password: "pass123456",
      branchId: testBranchId,
    });
    const otherId = (other.user as { id: number }).id;
    await book(otherId, schedule, addDays(monday, 9));
    const otherToken = await getAuthToken(app, otherEmail, "pass123456");

    const mine = await rowsOf(`weekStart=${monday}&weeks=2`);
    const theirs = await rowsOf(`weekStart=${monday}&weeks=2`, otherToken);

    expect(mine.map((r) => r.memberId)).toEqual([memberId]);
    expect(mine.map((r) => r.bookingDate)).toEqual([addDays(monday, 2)]);
    expect(theirs.map((r) => r.memberId)).toEqual([otherId]);
    expect(theirs.map((r) => r.bookingDate)).toEqual([addDays(monday, 9)]);
  });

  // La plani (Combos/Técnica) es POR SEMANA: con weeks=2 cada reserva tiene que
  // llevar la etiqueta de SU semana, no la de la primera. La semana SPOM se
  // clampa a 1-52: si las dos semanas caen en la misma, el caso no distingue.
  const anchorMonday = mondayOfThisWeek();
  const sameSpomWeek =
    dateToWeekNumber(anchorMonday) ===
    dateToWeekNumber(addDays(anchorMonday, 7));
  it.skipIf(sameSpomWeek)(
    "weeks=2 deriva la etiqueta Combos/Técnica con la plani de la semana de cada reserva",
    async () => {
      const monday = anchorMonday;
      const schedule = await seedSchedule(3);
      const wed1 = addDays(monday, 2);
      const wed2 = addDays(monday, 9);
      await book(memberId, schedule, wed1);
      await book(memberId, schedule, wed2);
      const approved = async (date: string, mode: string) => {
        await app.db.insert(sessions).values({
          dayId: `W${dateToWeekNumber(date)}-miercoles-203-05-${mode}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          week: dateToWeekNumber(date),
          day: "miercoles",
          levelGroup: "alfa_delta",
          blockCount: 1,
          sessionMode: mode,
          status: "approved",
        });
      };
      await approved(wed1, "combos");
      await approved(wed2, "tecnica");

      const rows = await rowsOf(`weekStart=${monday}&weeks=2`);

      expect(rows.map((r) => [r.bookingDate, r.activityName])).toEqual([
        [wed1, "Combos"],
        [wed2, "Técnica"],
      ]);
    },
  );

  it("weeks=3 responde 400 (máximo 2 semanas)", async () => {
    const res = await get(`weekStart=${mondayOfThisWeek()}&weeks=3`);
    expect(res.statusCode).toBe(400);
  });

  it("weeks=0 responde 400", async () => {
    const res = await get(`weekStart=${mondayOfThisWeek()}&weeks=0`);
    expect(res.statusCode).toBe(400);
  });

  it("weeks=abc responde 400", async () => {
    const res = await get(`weekStart=${mondayOfThisWeek()}&weeks=abc`);
    expect(res.statusCode).toBe(400);
  });

  it("sin weekStart sigue respondiendo 400", async () => {
    const res = await get("weeks=2");
    expect(res.statusCode).toBe(400);
  });

  it("401 sin token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${MEMBER_URL}/my-bookings?weekStart=${mondayOfThisWeek()}&weeks=2`,
    });
    expect(res.statusCode).toBe(401);
  });
});
