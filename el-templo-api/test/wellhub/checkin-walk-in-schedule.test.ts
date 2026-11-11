/**
 * Check-in de Wellhub SIN reserva → la visita se ubica en la clase por la hora
 * (±20 min del inicio, solo clases que Wellhub vende hoy en esa sede). Fuera de
 * clase queda sin horario. Con reserva Wellhub, manda la reserva.
 *
 * Todo pasa por el webhook real (`postWellhubWebhook`), con el validate de
 * Wellhub mockeado. Horarios sembrados para el día ISO de HOY en la tz de la
 * sede:
 *   - "en la ventana" = hora actual (HH:MM) → a menos de 60 s del check-in;
 *   - "fuera" = 60 min antes / después. Si eso cruza la medianoche, el HH:MM
 *     da la vuelta y la clase queda a ~23 h: sigue fuera, el test no depende
 *     de la hora a la que corra.
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
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { dowInTz, todayInTz } from "../../src/modules/shared/date-utils";
import {
  TEMPLO_CTX,
  WELLHUB_TEST_SECRET,
  checkinPayload,
  insertBooking,
  nowHHMMInTz,
  postWellhubWebhook,
  signWellhub,
  stubValidateFetch,
  uniqueGymId,
  uniqueToken,
} from "../fixtures/wellhub-personas";

const TZ = "America/Argentina/Buenos_Aires";

/** "HH:MM" desplazado `minutes` desde ahora en TZ (da la vuelta a las 24 h). */
function shiftedHHMM(minutes: number): string {
  return nowHHMMInTz(TZ, new Date(Date.now() + minutes * 60 * 1000));
}

describe("Wellhub check-in sin reserva: horario por la hora", () => {
  let app: FastifyInstance;
  let branchId: number;
  let gymId: number;

  async function insertActivity(opts: {
    wellhubEnabled: boolean;
    isSpecial?: boolean;
  }): Promise<number> {
    const [res] = await app.db.insert(schema.activities).values(
      tenantValues(TEMPLO_CTX, {
        name: `Clase WH ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        isActive: true,
        isSpecial: opts.isSpecial ?? false,
        wellhubEnabled: opts.wellhubEnabled,
      }),
    );
    return Number(res.insertId);
  }

  /** Horario de HOY (día ISO en la tz de la sede) que empieza a `startTime`. */
  async function insertSchedule(
    activityId: number,
    startTime: string,
  ): Promise<number> {
    const [res] = await app.db.insert(schema.schedules).values(
      tenantValues(TEMPLO_CTX, {
        branchId,
        activityId,
        dayOfWeek: dowInTz(TZ),
        startTime,
        endTime: startTime, // irrelevante para la regla (mira el inicio)
        isActive: true,
      }),
    );
    return Number(res.insertId);
  }

  /** Manda un check-in y devuelve el schedule_id de la visita registrada. */
  async function checkinAndGetSchedule(
    token = uniqueToken(),
  ): Promise<number | null> {
    stubValidateFetch();
    const raw = checkinPayload({ token, gymId });
    const res = await postWellhubWebhook(app, raw, signWellhub(raw));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).outcome).toBe("processed");

    const [visitor] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.gympassId, token),
        ),
      );
    const rows = await app.db
      .select({
        scheduleId: schema.attendance.scheduleId,
        source: schema.attendance.source,
      })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, TEMPLO_CTX),
          eq(schema.attendance.memberId, visitor.id),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("wellhub");
    return rows[0].scheduleId;
  }

  beforeAll(async () => {
    process.env.WELLHUB_API_KEY = "test-api-key";
    process.env.WELLHUB_WEBHOOK_SECRET = WELLHUB_TEST_SECRET;
    app = await createTestApp();

    gymId = uniqueGymId();
    const suffix = Date.now().toString(36).slice(-6);
    const [inserted] = await app.db.insert(schema.branches).values(
      tenantValues(TEMPLO_CTX, {
        name: `Sede WH walk-in ${suffix}`,
        code: `WHW${suffix.toUpperCase()}`,
        timezone: TZ,
        country: "AR",
        wellhubGymId: gymId,
      }),
    );
    branchId = Number(inserted.insertId);
  });

  afterAll(async () => {
    delete process.env.WELLHUB_API_KEY;
    delete process.env.WELLHUB_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, branchId),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
  });

  it("sin reserva: cae en la clase Wellhub que empieza en la ventana", async () => {
    const general = await insertActivity({ wellhubEnabled: true });
    const enVentana = await insertSchedule(general, shiftedHHMM(0));
    await insertSchedule(general, shiftedHHMM(-60));
    await insertSchedule(general, shiftedHHMM(60));

    expect(await checkinAndGetSchedule()).toBe(enVentana);
  });

  it("sin reserva y sin clase en la ventana: queda sin horario", async () => {
    const general = await insertActivity({ wellhubEnabled: true });
    await insertSchedule(general, shiftedHHMM(-60));
    await insertSchedule(general, shiftedHHMM(60));

    expect(await checkinAndGetSchedule()).toBeNull();
  });

  it("no usa actividades que Wellhub no vende (no habilitada o especial)", async () => {
    const yoga = await insertActivity({ wellhubEnabled: false });
    await insertSchedule(yoga, shiftedHHMM(0));
    const especial = await insertActivity({
      wellhubEnabled: true,
      isSpecial: true,
    });
    await insertSchedule(especial, shiftedHHMM(0));

    expect(await checkinAndGetSchedule()).toBeNull();
  });

  it("no usa una clase cancelada hoy (excepción de horario)", async () => {
    const general = await insertActivity({ wellhubEnabled: true });
    const cancelada = await insertSchedule(general, shiftedHHMM(0));
    await app.db.insert(schema.scheduleExceptions).values(
      tenantValues(TEMPLO_CTX, {
        scheduleId: cancelada,
        exceptionDate: todayInTz(TZ),
        reason: "test walk-in",
      }),
    );

    expect(await checkinAndGetSchedule()).toBeNull();
  });

  it("con reserva Wellhub de hoy manda la reserva, aunque otra clase esté en la ventana", async () => {
    const general = await insertActivity({ wellhubEnabled: true });
    const enVentana = await insertSchedule(general, shiftedHHMM(0));
    const reservada = await insertSchedule(general, shiftedHHMM(60));

    // Visitante con reserva Wellhub para la clase de +60 min.
    const token = uniqueToken();
    // Visitante ya conocido (mismo shape que el alta del webhook).
    const [u] = await app.db.insert(schema.users).values(
      tenantValues(TEMPLO_CTX, {
        passwordHash: "x",
        firstName: "Wellhub",
        lastName: "Reserva",
        email: `wh-${token}@example.com`,
        branchId,
        role: "member" as const,
        status: "wellhub" as const,
        gympassId: token,
      }),
    );
    await insertBooking(app, {
      memberId: Number(u.insertId),
      scheduleId: reservada,
      bookingDate: todayInTz(TZ),
      status: "reservado",
      source: "wellhub",
    });

    const scheduleId = await checkinAndGetSchedule(token);
    expect(scheduleId).toBe(reservada);
    expect(scheduleId).not.toBe(enVentana);
  });
});
