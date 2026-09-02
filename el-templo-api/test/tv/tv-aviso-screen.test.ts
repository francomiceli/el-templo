/**
 * Fase 193 Plan 10 (COM-04, D-25/D-26) — el estado `screen: 'aviso'` de
 * `tv_class_state`, contra MySQL real y las rutas de control existentes
 * (fase 164, `tv/control-routes.ts`, sin rutas nuevas):
 *
 *   POST /api/admin/tv/control/state       — escritura absoluta (D-25)
 *   GET  /api/admin/tv/control/screen      — poll TV-facing (D-27/D-28)
 *   POST /api/admin/tv/control/end-class   — reposo, idempotente (D-07)
 *
 * Casos del plan:
 *   (1) escribir `{screen:'aviso', tvAvisoId}` deja la fila con
 *       `screen='aviso'`/`tv_aviso_id` seteado, y el poll devuelve
 *       `screen:'aviso'` con `aviso.title`/`aviso.body` y `class:null`.
 *   (2) D-26: escribir despues un `blockRole` distinto, o `screen:'closing'`,
 *       deja `screen='class'`/`tv_aviso_id` NULL — el aviso sale al avanzar.
 *   (3) Degradacion (T-193-39): con `screen='aviso'` y el aviso desactivado o
 *       borrado, el poll degrada a `screen:'class'` (o `idle` sin clase
 *       iniciada), NUNCA un 500.
 *   (4) Tampering (T-193-37/T-193-38): un `tvAvisoId` de otro tenant o
 *       inexistente responde 400 y el estado NO cambia.
 *   (5) `end-class` borra la fila (idempotente) tambien cuando estaba en
 *       `aviso`.
 *
 * `tv_avisos` no tiene semilla de sistema (193-03, L2) y NO esta en
 * `TABLES_TO_CLEAN` (`test/helpers.ts`) — este archivo la limpia entera en
 * cada `beforeEach`, mismo criterio que `test/communications/tv-avisos.test.ts`.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism --hookTimeout=300000 test/tv/tv-aviso-screen.test.ts
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
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { seedSecondTenant, limpiarSegundoGimnasio } from "../fixtures/second-tenant";

const STATE_URL = "/api/admin/tv/control/state";
const SCREEN_URL = "/api/admin/tv/control/screen";
const END_CLASS_URL = "/api/admin/tv/control/end-class";

const AR_TZ = "America/Argentina/Buenos_Aires";
// Ancla SPOM: WEEK_ONE_MONDAY = 2026-02-23 (lunes). Martes W1, 12:00 en AR.
const TUESDAY = new Date("2026-02-24T15:00:00Z");

let app: FastifyInstance;
let branchId: number;
let coachToken: string;
let exerciseId: number;

function uniqueCode(prefix: string): string {
  return `${prefix}${randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedBranch(): Promise<void> {
  const [b] = await app.db
    .insert(schema.branches)
    .values({
      name: "Mogotes",
      code: uniqueCode("AVS"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  branchId = b.id;

  const [ex] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "TRACCION",
      category: "pull",
      exercise: "Dominadas",
      effort: "high",
      route: "OAP",
      videoUrl: null,
    })
    .$returningId();
  exerciseId = ex.id;
}

/** Sesion del martes W1, aprobada, con dos bloques (INITIUM/NUCLEUS) para
 *  poder ejercitar "avanzar a otro bloque" (D-26). */
async function seedApprovedSession(): Promise<void> {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: "W1-martes-alfa-193-10",
      week: 1,
      day: "martes",
      levelGroup: "alfa_delta",
      blockCount: 2,
      status: "approved",
      sessionMode: "regular",
    })
    .$returningId();

  const roles = ["INITIUM", "NUCLEUS"];
  for (let i = 0; i < roles.length; i++) {
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: `B-${session.id}-${i}`,
        role: roles[i],
        route: "OAP",
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 40,
        formatId: 1,
        formatName: "AMRAP",
        formatParams: { type: "amrap", minutes: 10 },
        exerciseCount: 1,
        sortOrder: i,
      })
      .$returningId();

    await app.db.insert(schema.sessionPrescriptions).values({
      blockId: block.id,
      exerciseId,
      exerciseName: `${roles[i]}-alfa-0`,
      contraction: "CON",
      reps: 8,
      repsMax: 10,
      seconds: 0,
      rest: 60,
      sortOrder: 0,
      exerciseType: "main",
    });
  }
}

/** 193-03 (L2): `tv_avisos` no tiene semilla de sistema — limpieza global. */
async function limpiarTvAvisos(): Promise<void> {
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba (patron cleanAllTestData), tv_avisos no tiene semilla de sistema */ DELETE FROM tv_avisos`,
  );
}

async function createTvAviso(
  overrides: Partial<{
    title: string;
    body: string;
    isActive: boolean;
    tenantId: number;
  }> = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.tvAvisos)
    .values({
      title: overrides.title ?? "Aviso de prueba 193-10",
      body: overrides.body ?? "Cuerpo del aviso de prueba 193-10",
      mode: "manual",
      isActive: overrides.isActive ?? true,
      ...(overrides.tenantId !== undefined
        ? { tenantId: overrides.tenantId }
        : {}),
    })
    .$returningId();
  return row.id;
}

/** Borrado FORZADO de un aviso de TV, con `tv_class_state` todavia
 *  apuntandole — simula "el aviso desaparecio" sin pasar por el DELETE seguro
 *  del service (que limpia la referencia primero, plan 07/T-193-28). Es
 *  EXACTAMENTE el escenario que `resolveAviso`/T-193-39 tiene que degradar
 *  sin 500: una fila de `tv_class_state` con un `tv_aviso_id` que ya no
 *  existe. FK checks se togglean solo para este DELETE puntual (mismo
 *  patron que `cleanAllTestData`, `test/helpers.ts`). */
async function forceDeleteTvAviso(id: number): Promise<void> {
  await app.db.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
  await app.db.execute(
    sql`/* tenant-safe: borrado forzado de prueba (los avisos de este archivo son siempre tenant 1), simula una fila huerfana para T-193-39 */ DELETE FROM tv_avisos WHERE id = ${id}`,
  );
  await app.db.execute(sql`SET FOREIGN_KEY_CHECKS=1`);
}

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

function postState(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: STATE_URL,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function getScreen(token: string, bId: number) {
  return app.inject({
    method: "GET",
    url: `${SCREEN_URL}?branchId=${bId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postEndClass(token: string, bId: number) {
  return app.inject({
    method: "POST",
    url: END_CLASS_URL,
    headers: { authorization: `Bearer ${token}` },
    payload: { branchId: bId },
  });
}

async function readRow(bId: number) {
  const [row] = await app.db
    .select()
    .from(schema.tvClassState)
    .where(eq(schema.tvClassState.branchId, bId));
  return row;
}

interface ControlStateBody {
  screen: string;
  blockRole: string;
}

interface PollBody {
  screen: string;
  class: unknown;
  aviso: { id: number; title: string; body: string } | null;
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TUESDAY);
  app = await createTestApp();
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(async () => {
  vi.setSystemTime(TUESDAY);
  await cleanAllTestData(app);
  await limpiarTvAvisos();
  await seedBranch();
  await seedApprovedSession();

  await createStaffUser(app, {
    email: "tv-aviso-coach@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "Aviso",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "tv-aviso-coach@test.com",
    "coach-pass-123",
  );
});

describe("screen 'aviso' — escritura, poll, salida y degradacion (D-25/D-26)", () => {
  it("(1) escribir screen:'aviso' deja la fila lista y el poll con el texto del aviso, class:null", async () => {
    const avisoId = await createTvAviso({
      title: "Recorda traer la toalla",
      body: "Vamos a hacer un cambio en la rutina de hoy",
    });

    const writeRes = await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });
    expect(writeRes.statusCode, writeRes.body).toBe(200);
    const context = JSON.parse(writeRes.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("aviso");

    const row = await readRow(branchId);
    expect(row.screen).toBe("aviso");
    expect(row.tvAvisoId).toBe(avisoId);

    const screenRes = await getScreen(coachToken, branchId);
    expect(screenRes.statusCode, screenRes.body).toBe(200);
    const poll = JSON.parse(screenRes.body) as PollBody;
    expect(poll.screen).toBe("aviso");
    expect(poll.class).toBeNull();
    expect(poll.aviso).toEqual({
      id: avisoId,
      title: "Recorda traer la toalla",
      body: "Vamos a hacer un cambio en la rutina de hoy",
    });
  });

  it("(2a) D-26: avanzar a otro bloque saca del aviso — screen vuelve a 'class' y tv_aviso_id queda NULL", async () => {
    const avisoId = await createTvAviso();
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });

    const res = await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    expect(res.statusCode, res.body).toBe(200);
    const context = JSON.parse(res.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("class");
    expect(context.state.blockRole).toBe("NUCLEUS");

    const row = await readRow(branchId);
    expect(row.screen).toBe("class");
    expect(row.tvAvisoId).toBeNull();

    // El poll deja de mostrar el aviso y vuelve a pintar el bloque en curso.
    const screenRes = await getScreen(coachToken, branchId);
    const poll = JSON.parse(screenRes.body) as PollBody;
    expect(poll.screen).toBe("class");
    expect(poll.aviso).toBeNull();
  });

  it("(2b) D-26: escribir screen:'closing' desde el aviso tambien lo saca — tv_aviso_id NULL", async () => {
    const avisoId = await createTvAviso();
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });

    const res = await postState(coachToken, { branchId, screen: "closing" });
    expect(res.statusCode, res.body).toBe(200);
    const context = JSON.parse(res.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("closing");

    const row = await readRow(branchId);
    expect(row.screen).toBe("closing");
    expect(row.tvAvisoId).toBeNull();
  });

  it("(3a) degradacion: el aviso desactivado no puede clavar el TV — el poll degrada a 'class', nunca 500", async () => {
    const avisoId = await createTvAviso({ isActive: true });
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });

    // El admin desactiva el aviso desde otro lado (CRUD, plan 07) mientras el
    // TV lo sigue teniendo referenciado en su fila de estado. Filtro literal
    // por `tenantId` (siempre 1 en este archivo) — mismo criterio que
    // `tenantWhere`, sin el helper porque no hay `TenantContext` a mano acá.
    await app.db
      .update(schema.tvAvisos)
      .set({ isActive: false })
      .where(
        and(eq(schema.tvAvisos.id, avisoId), eq(schema.tvAvisos.tenantId, 1)),
      );

    const screenRes = await getScreen(coachToken, branchId);
    expect(screenRes.statusCode, screenRes.body).toBe(200);
    const poll = JSON.parse(screenRes.body) as PollBody;
    expect(poll.screen).toBe("class");
    expect(poll.aviso).toBeNull();
    expect(poll.class).not.toBeNull();
  });

  it("(3b) degradacion: el aviso borrado (fila inexistente) tampoco puede clavar el TV — nunca 500", async () => {
    const avisoId = await createTvAviso({ isActive: true });
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });

    // El aviso desaparece de verdad (fila borrada) sin que nadie haya
    // limpiado la referencia de `tv_class_state` primero — exactamente el
    // caso que `resolveAviso` tiene que degradar, no un DELETE seguro
    // (plan 07 ya cubre ese camino con su propio test).
    await forceDeleteTvAviso(avisoId);

    const screenRes = await getScreen(coachToken, branchId);
    expect(screenRes.statusCode, screenRes.body).toBe(200);
    const poll = JSON.parse(screenRes.body) as PollBody;
    expect(poll.screen).toBe("class");
    expect(poll.aviso).toBeNull();
  });

  it("(3c) degradacion sin clase iniciada: sin sesion aprobada ademas, el poll degrada a 'idle'", async () => {
    // Estado en 'aviso' pero SIN sesion aprobada hoy: desaprobar la sesion
    // de hoy simula la carrera "el aviso quedo huerfano Y ademas hoy no hay
    // clase" — el poll no puede mostrar 'class' porque no hay bloque que
    // pintar, tiene que caer al reposo silencioso (D-09).
    const avisoId = await createTvAviso({ isActive: true });
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });
    await forceDeleteTvAviso(avisoId);
    await app.db
      .update(schema.sessions)
      .set({ status: "draft" })
      .where(eq(schema.sessions.dayId, "W1-martes-alfa-193-10"));

    const screenRes = await getScreen(coachToken, branchId);
    expect(screenRes.statusCode, screenRes.body).toBe(200);
    const poll = JSON.parse(screenRes.body) as PollBody;
    expect(poll.screen).toBe("idle");
    expect(poll.class).toBeNull();
    expect(poll.aviso).toBeNull();
  });

  it("(4a) tampering: un tvAvisoId de OTRO TENANT responde 400 y el estado no cambia", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      const foreignAvisoId = await createTvAviso({
        isActive: true,
        tenantId: gym2.tenantId,
      });

      await postState(coachToken, { branchId, blockRole: "INITIUM" });
      const before = await readRow(branchId);

      const res = await postState(coachToken, {
        branchId,
        screen: "aviso",
        tvAvisoId: foreignAvisoId,
      });
      expect(res.statusCode, res.body).toBe(400);

      const after = await readRow(branchId);
      expect(after.screen).toBe(before.screen);
      expect(after.blockRole).toBe(before.blockRole);
      expect(after.tvAvisoId).toBe(before.tvAvisoId);
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });

  it("(4b) tampering: un tvAvisoId INEXISTENTE responde 400 y el estado no cambia", async () => {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    const before = await readRow(branchId);

    const res = await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: 999999999,
    });
    expect(res.statusCode, res.body).toBe(400);

    const after = await readRow(branchId);
    expect(after.screen).toBe(before.screen);
    expect(after.tvAvisoId).toBe(before.tvAvisoId);
  });

  it("(5) end-class borra la fila (idempotente) tambien estando en 'aviso'", async () => {
    const avisoId = await createTvAviso();
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });
    expect(await readRow(branchId)).toBeDefined();

    const first = await postEndClass(coachToken, branchId);
    expect(first.statusCode, first.body).toBe(200);
    expect(await readRow(branchId)).toBeUndefined();

    // Idempotente: terminar de nuevo no falla aunque ya no haya fila.
    const second = await postEndClass(coachToken, branchId);
    expect(second.statusCode, second.body).toBe(200);

    const screenRes = await getScreen(coachToken, branchId);
    const poll = JSON.parse(screenRes.body) as PollBody;
    expect(poll.screen).toBe("idle");
    expect(poll.aviso).toBeNull();
  });
});
