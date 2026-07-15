/**
 * Fase 163-03 (AUTO-03 / AUTO-04, D-03 / D-04 / D-07) — integration tests de
 * los writes de `lead_status_source` de la máquina de estados del lead.
 *
 * Corre contra la DB real eltemplo_test vía las rutas HTTP reales (mismo
 * patrón que test/scheduling/trials.test.ts: fake timers fijados a un miércoles
 * para que el jueves sea un slot futuro válido).
 *
 * Cubre las cuatro transiciones que estampan la fuente:
 *   1. Reset vía bookTrial (admin)      — un Perdido re-agendado → en_seguimiento / 'auto'.
 *   2. Reset vía self-service           — un Perdido freemium re-entrando → en_seguimiento / 'auto'.
 *   3. PATCH manual /admin/leads/:id    — editar lead_status → lead_status_source='manual'.
 *   4. Alta de lead (soft register)     — nace con lead_status_source='auto'.
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
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

const ADMIN_SCHED_URL = "/api/admin/scheduling";
const MEMBER_SCHED_URL = "/api/members/scheduling";
const TRIALS_URL = `${ADMIN_SCHED_URL}/trials`;
const TRIAL_MEMBER_URL = "/api/admin/members/trial";
const LEADS_URL = "/api/admin/leads";

describe("lead_status_source transitions (Fase 163-03)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchId: number;
  let seq = 0;

  beforeAll(async () => {
    // Miércoles 10:00 UTC — el jueves siguiente es un slot futuro válido para
    // la validación de ventana de reserva (self-service).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [b] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"));
    branchId = b.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  function nextTag(): string {
    seq += 1;
    return `${Date.now() % 100000}${String(seq).padStart(4, "0")}`;
  }

  /** Jueves de la semana en curso (día futuro respecto del miércoles fijado). */
  function nextThursday(): string {
    const now = new Date();
    const currentDay = now.getDay(); // 0=Dom..6=Sáb
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const target = new Date(monday);
    target.setDate(monday.getDate() + 3); // jueves ISO (day 4)
    return target.toISOString().split("T")[0];
  }

  async function createActivity(): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHED_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `Calistenia ${nextTag()}`, description: "trial test" },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id;
  }

  async function createSchedule(activityId: number): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHED_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId,
        activityId,
        dayOfWeek: 4, // jueves ISO
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id;
  }

  /** Alta de lead soft-register (status='prueba', en_seguimiento, source auto). */
  async function softRegisterLead(): Promise<number> {
    const tag = nextTag();
    const res = await app.inject({
      method: "POST",
      url: TRIAL_MEMBER_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Lead",
        lastName: `Prospecto${tag}`,
        phone: `+549115${tag.slice(-8).padStart(8, "0")}`,
        branchId,
      },
    });
    if (res.statusCode !== 201) {
      throw new Error(`softRegisterLead failed: ${res.statusCode} ${res.body}`);
    }
    return JSON.parse(res.body).id;
  }

  async function forceLeadState(
    userId: number,
    leadStatus: "en_seguimiento" | "ganado" | "perdido",
    leadStatusSource: "auto" | "manual",
  ): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ leadStatus, leadStatusSource })
      .where(eq(schema.users.id, userId));
  }

  async function readLead(
    userId: number,
  ): Promise<{ leadStatus: string | null; leadStatusSource: string | null }> {
    const [row] = await app.db
      .select({
        leadStatus: schema.users.leadStatus,
        leadStatusSource: schema.users.leadStatusSource,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return { leadStatus: row.leadStatus, leadStatusSource: row.leadStatusSource };
  }

  // ─── Caso 1: reset vía bookTrial (admin) ─────────────────────────────────

  it("un Perdido re-agendado por bookTrial vuelve a en_seguimiento / source auto", async () => {
    const activityId = await createActivity();
    const scheduleId = await createSchedule(activityId);
    const userId = await softRegisterLead();

    // Simula un lead marcado Perdido a mano (source manual, el caso más exigente:
    // el automatismo legítimo del re-agende SÍ puede pisarlo, D-07).
    await forceLeadState(userId, "perdido", "manual");

    const res = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId, scheduleId, bookingDate: nextThursday() },
    });
    expect(res.statusCode).toBe(201);

    const s = await readLead(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
    expect(s.leadStatusSource).toBe("auto");
  });

  // ─── Caso 2: reset vía self-service (freemium) ───────────────────────────

  it("un Perdido freemium re-entrando por reserveTrialSelfService vuelve a en_seguimiento / source auto", async () => {
    const activityId = await createActivity();
    const scheduleId = await createSchedule(activityId);

    const tag = nextTag();
    const { token, user } = await registerUser(app, {
      email: `freemium${tag}@test.com`,
      password: "pass123456",
      branchId,
      dni: `SS${tag}`,
      phone: `+549116${tag.slice(-8).padStart(8, "0")}`,
    });
    const userId = (user as { id: number }).id;

    // El freemium quedó Perdido (source manual) — al reservar de nuevo se resetea.
    await forceLeadState(userId, "perdido", "manual");

    const res = await app.inject({
      method: "POST",
      url: `${MEMBER_SCHED_URL}/reserve-trial`,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date: nextThursday(), branchId },
    });
    expect(res.statusCode).toBe(201);

    const s = await readLead(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
    expect(s.leadStatusSource).toBe("auto");
  });

  // ─── Caso 3: PATCH manual estampa source manual ──────────────────────────

  it("el PATCH /admin/leads/:userId estampa lead_status_source='manual'", async () => {
    const userId = await softRegisterLead();
    // Nace en 'auto'; el PATCH manual debe cambiar la fuente a 'manual'.
    expect((await readLead(userId)).leadStatusSource).toBe("auto");

    const res = await app.inject({
      method: "PATCH",
      url: `${LEADS_URL}/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { leadStatus: "perdido" },
    });
    expect(res.statusCode).toBe(200);

    const s = await readLead(userId);
    expect(s.leadStatus).toBe("perdido");
    expect(s.leadStatusSource).toBe("manual");
  });

  // ─── Caso 4: alta de lead nace en source auto ────────────────────────────

  it("un lead recién creado (soft register) nace con lead_status_source='auto'", async () => {
    const userId = await softRegisterLead();

    const s = await readLead(userId);
    expect(s.leadStatus).toBe("en_seguimiento");
    expect(s.leadStatusSource).toBe("auto");
  });
});
