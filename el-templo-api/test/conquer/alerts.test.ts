/**
 * Fase 201 Plan 09 (S12-6, §5, §5.1, A6, A13, D-15, AS-11, T-201-29/30/32):
 * alertas de Conquer.
 *
 *   - PUT   /api/members/conquer/sessions   (molestia, caída, paso de nivel)
 *   - GET   /api/admin/conquer/members      (alertas derivadas por tiempo)
 *   - PATCH /api/admin/conquer/alerts/:id
 *
 * Integración contra el MySQL de tests. El historial de días pasados va SIEMPRE
 * por `insertConquerSession`; "hoy" solo por `PUT /sessions`. Fechas relativas.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { addDaysIso } from "../../src/modules/conquer/calendar";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  boardMember,
  conquerExerciseIds,
  createActiveConquerMember,
  createConquerStaff,
  fetchBoard,
  insertBodyCheckRow,
  insertConquerAlert,
  insertConquerSession,
  memberToday,
  patchAlert,
  readConquerAlerts,
  saveTodaySession,
  TEMPLO_CTX,
  weeksAgo,
  type ConquerErrorBody,
} from "./_helpers";

let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

/** Edita la fila de `conquer_members` del alumno. */
async function updateMemberRow(
  userId: number,
  patch: Partial<typeof schema.conquerMembers.$inferInsert>,
): Promise<void> {
  await app.db
    .update(schema.conquerMembers)
    .set(patch)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
}

type SessionEdits = NonNullable<
  NonNullable<Parameters<typeof saveTodaySession>[2]>["edits"]
>;

/** Guarda la sesión de hoy del día `day` con la molestia `pain`. */
function guardar(
  token: string,
  day: string,
  pain: number,
  edits: SessionEdits = {},
) {
  return saveTodaySession(app, token, { day, pain, edits });
}

// ── Molestia (S12-6, §5, §5.1) ──────────────────────────────────────

describe("alerta de molestia al guardar (S12-6)", () => {
  it("Toro con molestia 4: rojo con la propuesta de recorte de la etapa 1", async () => {
    const { userId, token, adminToken } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);

    await guardar(token, "plancha", 4);

    const board = await fetchBoard(app, adminToken);
    const member = boardMember(board, userId);
    expect(member.light).toBe("rojo");
    expect(member.alerts).toHaveLength(1);
    expect(member.alerts[0]).toMatchObject({
      kind: "molestia",
      severity: "rojo",
      status: "abierta",
      detail: { pain: 4, date: hoy, dayKey: "plancha" },
      proposal: {
        kind: "etapa",
        stage: 1,
        label: "Sábado: drops de 10 a 6",
      },
    });
    expect(member.alerts[0]?.id).not.toBeNull();
    expect(board.counts).toMatchObject({ rojo: 1, total: 1 });
  });

  it("Novillo con molestia 4: la propuesta es bajar un escalón", async () => {
    const { userId, token, adminToken } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });

    await guardar(token, "empuje", 4);

    const member = boardMember(await fetchBoard(app, adminToken), userId);
    expect(member.light).toBe("rojo");
    expect(member.alerts[0]?.proposal?.kind).toBe("bajar_escalon");
  });

  it.each([0, 1, 3])(
    "molestia %i: sin alerta y el alumno queda ok",
    async (pain) => {
      const { userId, token, adminToken } = await createActiveConquerMember(
        app,
        {
          level: "toro",
          daysCount: 4,
        },
      );

      await guardar(token, "plancha", pain);

      expect(await readConquerAlerts(app, userId)).toHaveLength(0);
      expect(boardMember(await fetchBoard(app, adminToken), userId).light).toBe(
        "ok",
      );
    },
  );

  it("re-guardar con 4 no duplica; con 2 se auto-resuelve (resolved_by NULL); con 4 otra vez se reabre la misma fila", async () => {
    const { userId, token, adminToken } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    await guardar(token, "plancha", 4);
    await guardar(token, "plancha", 4);
    const unica = await readConquerAlerts(app, userId);
    expect(unica).toHaveLength(1);
    expect(unica[0]).toMatchObject({ type: "molestia", status: "abierta" });

    await guardar(token, "plancha", 2);
    const resuelta = await readConquerAlerts(app, userId);
    expect(resuelta).toHaveLength(1);
    expect(resuelta[0]).toMatchObject({ status: "resuelta", resolvedBy: null });
    expect(resuelta[0]?.resolvedAt).not.toBeNull();
    expect(boardMember(await fetchBoard(app, adminToken), userId).light).toBe(
      "ok",
    );

    await guardar(token, "plancha", 4);
    const reabierta = await readConquerAlerts(app, userId);
    expect(reabierta).toHaveLength(1);
    expect(reabierta[0]).toMatchObject({
      id: unica[0]?.id,
      status: "abierta",
      resolvedBy: null,
      resolvedAt: null,
    });
    expect(boardMember(await fetchBoard(app, adminToken), userId).light).toBe(
      "rojo",
    );
  });

  it("una alerta que resolvió el admin no se reabre al re-guardar con 4 (T-201-32)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const admin = await createConquerStaff(app, "admin");
    await guardar(token, "plancha", 4);
    const [alerta] = await readConquerAlerts(app, userId);

    const res = await patchAlert(app, admin.token, alerta?.id ?? 0, {
      status: "resuelta",
    });
    expect(res.statusCode, res.body).toBe(200);

    await guardar(token, "plancha", 4);
    const final = await readConquerAlerts(app, userId);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({
      status: "resuelta",
      resolvedBy: admin.id,
    });
  });

  it("molestias en días distintos son alertas distintas (una por fecha y día)", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    await guardar(token, "plancha", 4);
    await guardar(token, "front", 5);

    const alertas = await readConquerAlerts(app, userId);
    expect(alertas.map((a) => a.type)).toEqual(["molestia", "molestia"]);
    expect(new Set(alertas.map((a) => a.dedupeKey)).size).toBe(2);
  });
});

// ── Caída del E1 (§5, A6) ───────────────────────────────────────────

/** E1 de Planche press en `valores` (de la más vieja a la más nueva), una por semana anterior. */
async function seedPressE1(userId: number, valores: number[]): Promise<void> {
  const hoy = await memberToday(app, userId);
  for (const [i, value] of valores.entries()) {
    await insertConquerSession(app, {
      userId,
      date: weeksAgo(hoy, valores.length - i),
      dayKey: "plancha",
      steps: [{ exerciseCode: "planche_press", step: "e1", value }],
    });
  }
}

describe("alerta de caída del E1 (A6)", () => {
  it.each([
    { hoyE1: 3, alerta: true },
    { hoyE1: 4, alerta: false }, // 6 > 4 = 4: no es estrictamente decreciente
    { hoyE1: 5, alerta: false },
  ])(
    "historial 5, 6, 4 y hoy $hoyE1: alerta de caída = $alerta",
    async ({ hoyE1, alerta }) => {
      const { userId, token, adminToken } = await createActiveConquerMember(
        app,
        { level: "toro", daysCount: 4 },
      );
      const hoy = await memberToday(app, userId);
      const ids = await conquerExerciseIds(app);
      const pressId = ids.get("planche_press") ?? 0;
      await seedPressE1(userId, [5, 6, 4]);

      await guardar(token, "plancha", 0, { planche_press: { e1: hoyE1 } });

      const guardadas = (await readConquerAlerts(app, userId)).filter(
        (a) => a.type === "caida",
      );
      if (!alerta) {
        expect(guardadas).toHaveLength(0);
        return;
      }
      expect(guardadas).toHaveLength(1);
      expect(guardadas[0]).toMatchObject({
        status: "abierta",
        dedupeKey: `caida:${pressId}:${hoy}`,
        detail: {
          exerciseId: pressId,
          exerciseName: "Planche press",
          values: [6, 4, 3],
        },
      });
      const member = boardMember(await fetchBoard(app, adminToken), userId);
      expect(member.light).toBe("rojo");
      expect(member.alerts[0]).toMatchObject({
        kind: "caida",
        proposal: { kind: "etapa", stage: 1 },
      });
    },
  );

  it("re-guardar el mismo día con un E1 que ya no cae auto-resuelve la alerta", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    await seedPressE1(userId, [5, 6, 4]);

    await guardar(token, "plancha", 0, { planche_press: { e1: 3 } });
    await guardar(token, "plancha", 0, { planche_press: { e1: 3 } });
    expect(
      (await readConquerAlerts(app, userId)).filter((a) => a.type === "caida"),
    ).toHaveLength(1);

    await guardar(token, "plancha", 0, { planche_press: { e1: 5 } });

    const caidas = (await readConquerAlerts(app, userId)).filter(
      (a) => a.type === "caida",
    );
    expect(caidas).toHaveLength(1);
    expect(caidas[0]).toMatchObject({ status: "resuelta", resolvedBy: null });
  });

  it("la cuenta se reinicia con el cambio de peldaño: el historial anterior no cuenta", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    const ids = await conquerExerciseIds(app);
    await seedPressE1(userId, [5, 6, 4]);
    // El E1 cambió de peldaño ayer: las marcas de semanas anteriores quedan afuera.
    const [miembro] = await app.db
      .select({ id: schema.conquerMembers.id })
      .from(schema.conquerMembers)
      .where(
        and(
          tenantWhere(schema.conquerMembers, TEMPLO_CTX),
          eq(schema.conquerMembers.userId, userId),
        ),
      );
    await app.db
      .update(schema.conquerSteps)
      .set({ sinceDate: addDaysIso(hoy, -1) })
      .where(
        and(
          tenantWhere(schema.conquerSteps, TEMPLO_CTX),
          eq(schema.conquerSteps.memberId, miembro?.id ?? 0),
          eq(schema.conquerSteps.exerciseId, ids.get("planche_press") ?? 0),
          eq(schema.conquerSteps.step, "e1"),
        ),
      );

    await guardar(token, "plancha", 0, { planche_press: { e1: 3 } });

    expect(
      (await readConquerAlerts(app, userId)).filter((a) => a.type === "caida"),
    ).toHaveLength(0);
  });
});

// ── Paso de nivel (§2.2, A13) ───────────────────────────────────────

/** Una semana a sembrar: hace `w` semanas, `days` días del plan, con `pain`. */
interface WeekSeed {
  w: number;
  days: number;
  pain?: number;
}

const NOVILLO_DAYS = ["empuje", "traccion", "mixto"] as const;
const TORO_DAYS = ["plancha", "front", "vertical", "dominadas"] as const;

async function seedWeeks(
  userId: number,
  dayKeys: readonly string[],
  weeks: WeekSeed[],
): Promise<void> {
  const hoy = await memberToday(app, userId);
  for (const week of weeks) {
    for (const [i, dayKey] of dayKeys.slice(0, week.days).entries()) {
      await insertConquerSession(app, {
        userId,
        date: addDaysIso(weeksAgo(hoy, week.w), i),
        dayKey,
        // La molestia va en el primer día de la semana.
        pain: i === 0 ? (week.pain ?? 0) : 0,
        steps: [],
      });
    }
  }
}

const SEMANAS_COMPLETAS: WeekSeed[] = [4, 3, 2, 1].map((w) => ({ w, days: 3 }));

describe("señal verde de paso de nivel (A13)", () => {
  it.each([
    {
      caso: "4 semanas seguidas con los 3 días",
      semanas: SEMANAS_COMPLETAS,
      alerta: true,
    },
    {
      caso: "molestia 3 en una semana no corta la racha",
      semanas: SEMANAS_COMPLETAS.map((s) =>
        s.w === 2 ? { ...s, pain: 3 } : s,
      ),
      alerta: true,
    },
    {
      caso: "molestia 4 en una de las semanas",
      semanas: SEMANAS_COMPLETAS.map((s) =>
        s.w === 2 ? { ...s, pain: 4 } : s,
      ),
      alerta: false,
    },
    {
      caso: "una semana sin sesiones corta la racha",
      semanas: SEMANAS_COMPLETAS.filter((s) => s.w !== 3),
      alerta: false,
    },
    {
      caso: "una semana con 2 de los 3 días",
      semanas: SEMANAS_COMPLETAS.map((s) =>
        s.w === 4 ? { ...s, days: 2 } : s,
      ),
      alerta: false,
    },
  ])(
    "Novillo de 3 días, $caso: paso de nivel = $alerta",
    async ({ semanas, alerta }) => {
      const { userId, token, adminToken } = await createActiveConquerMember(
        app,
        {
          level: "novillo",
          daysCount: 3,
        },
      );
      const hoy = await memberToday(app, userId);
      const levelSince = weeksAgo(hoy, 5);
      await updateMemberRow(userId, { levelSince, activationDate: levelSince });
      await seedWeeks(userId, NOVILLO_DAYS, semanas);

      await guardar(token, "empuje", 0);

      const guardadas = (await readConquerAlerts(app, userId)).filter(
        (a) => a.type === "paso_nivel",
      );
      if (!alerta) {
        expect(guardadas).toHaveLength(0);
        return;
      }
      expect(guardadas).toHaveLength(1);
      expect(guardadas[0]).toMatchObject({
        status: "abierta",
        dedupeKey: `paso_nivel:novillo:${levelSince}`,
        detail: { from: "novillo", to: "toro", weeks: 4 },
      });
      const member = boardMember(await fetchBoard(app, adminToken), userId);
      expect(member.light).toBe("verde");
      expect(member.alerts[0]).toMatchObject({
        kind: "paso_nivel",
        severity: "verde",
        proposal: null,
      });
    },
  );

  it("re-guardar hoy no duplica la señal verde", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });
    const hoy = await memberToday(app, userId);
    const levelSince = weeksAgo(hoy, 5);
    await updateMemberRow(userId, { levelSince, activationDate: levelSince });
    await seedWeeks(userId, NOVILLO_DAYS, SEMANAS_COMPLETAS);

    await guardar(token, "empuje", 0);
    await guardar(token, "empuje", 0);

    expect(
      (await readConquerAlerts(app, userId)).filter(
        (a) => a.type === "paso_nivel",
      ),
    ).toHaveLength(1);
  });

  it("Toro no tiene nivel siguiente: nunca hay paso de nivel", async () => {
    const { userId, token } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    const levelSince = weeksAgo(hoy, 5);
    await updateMemberRow(userId, { levelSince, activationDate: levelSince });
    await seedWeeks(
      userId,
      TORO_DAYS,
      [4, 3, 2, 1].map((w) => ({ w, days: 4 })),
    );

    await guardar(token, "plancha", 0);

    expect(
      (await readConquerAlerts(app, userId)).filter(
        (a) => a.type === "paso_nivel",
      ),
    ).toHaveLength(0);
  });
});

// ── Derivadas por tiempo (§5, D-15, AS-11) ──────────────────────────

interface DerivedCase {
  caso: string;
  /** Deja el escenario armado; `hoy` es el de la sede del alumno. */
  armar: (userId: number, hoy: string) => Promise<void>;
  esperadas: string[];
}

const sesionHace = (dias: number) => async (userId: number, hoy: string) => {
  await insertConquerSession(app, {
    userId,
    date: addDaysIso(hoy, -dias),
    dayKey: "plancha",
    steps: [],
  });
};

const controlHace =
  (dias: number, kind: "dia0" | "periodico", empty = false) =>
  async (userId: number, hoy: string) => {
    await insertBodyCheckRow(app, {
      userId,
      checkDate: addDaysIso(hoy, -dias),
      kind,
      empty,
    });
  };

const saltearDia0 = async (userId: number) => {
  await updateMemberRow(userId, { day0SkippedAt: new Date() });
};

const DERIVADAS: DerivedCase[] = [
  {
    caso: "activado hace 10 días sin sesiones",
    armar: async (userId, hoy) => {
      await updateMemberRow(userId, { activationDate: addDaysIso(hoy, -10) });
    },
    esperadas: ["inactivo"],
  },
  {
    caso: "última sesión hace 8 días",
    armar: sesionHace(8),
    esperadas: ["inactivo"],
  },
  {
    caso: "última sesión hace 7 días justos",
    armar: sesionHace(7),
    esperadas: ["inactivo"],
  },
  { caso: "última sesión hace 6 días", armar: sesionHace(6), esperadas: [] },
  { caso: "última sesión hace 3 días", armar: sesionHace(3), esperadas: [] },
  {
    caso: "salteó el día 0 y no hizo el control",
    armar: saltearDia0,
    esperadas: ["control_dia0_pendiente"],
  },
  {
    caso: "salteó el día 0 pero después hizo el control",
    armar: async (userId, hoy) => {
      await saltearDia0(userId);
      await controlHace(1, "dia0")(userId, hoy);
    },
    esperadas: [],
  },
  {
    caso: "un día 0 VACÍO no cuenta como día 0",
    armar: async (userId, hoy) => {
      await saltearDia0(userId);
      await controlHace(1, "dia0", true)(userId, hoy);
    },
    esperadas: ["control_dia0_pendiente"],
  },
  {
    caso: "último control hace 43 días",
    armar: controlHace(43, "periodico"),
    esperadas: ["control_vencido"],
  },
  {
    caso: "último control hace 42 días justos",
    armar: controlHace(42, "periodico"),
    esperadas: [],
  },
  {
    caso: "último control hace 20 días",
    armar: controlHace(20, "periodico"),
    esperadas: [],
  },
  {
    caso: "un control VACÍO de ayer no resetea el vencido",
    armar: async (userId, hoy) => {
      await controlHace(43, "periodico")(userId, hoy);
      await controlHace(1, "periodico", true)(userId, hoy);
    },
    esperadas: ["control_vencido"],
  },
  {
    caso: "inactivo y control vencido a la vez",
    armar: async (userId, hoy) => {
      await sesionHace(10)(userId, hoy);
      await controlHace(60, "periodico")(userId, hoy);
    },
    esperadas: ["inactivo", "control_vencido"],
  },
];

describe("alertas derivadas por tiempo, sin cron (D-15, AS-11)", () => {
  it.each(DERIVADAS)("$caso: $esperadas", async ({ armar, esperadas }) => {
    const { userId, adminToken } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    await armar(userId, hoy);

    const member = boardMember(await fetchBoard(app, adminToken), userId);

    const derivadas = member.alerts.filter((a) => a.id === null);
    expect(derivadas.map((a) => a.kind).sort()).toEqual([...esperadas].sort());
    for (const a of derivadas) {
      expect(a).toMatchObject({
        severity: "amarillo",
        status: null,
        createdAt: null,
        proposal: null,
      });
    }
    expect(member.light).toBe(esperadas.length > 0 ? "amarillo" : "ok");
    // Las derivadas no se guardan: no hay filas en conquer_alerts.
    expect(await readConquerAlerts(app, userId)).toHaveLength(0);
  });

  it("el detalle de inactivo trae los días y la última sesión", async () => {
    const { userId, adminToken } = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const hoy = await memberToday(app, userId);
    await sesionHace(9)(userId, hoy);

    const member = boardMember(await fetchBoard(app, adminToken), userId);

    expect(member.lastSessionDate).toBe(addDaysIso(hoy, -9));
    expect(member.alerts[0]).toMatchObject({
      kind: "inactivo",
      detail: { days: 9, lastSessionDate: addDaysIso(hoy, -9) },
    });
  });
});

// ── PATCH /alerts/:id (T-201-29, T-201-30, T-201-32) ────────────────

describe("PATCH /api/admin/conquer/alerts/:id", () => {
  async function alumnoConMolestia() {
    const m = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const alertId = await insertConquerAlert(app, {
      userId: m.userId,
      type: "molestia",
      dedupeKey: "molestia:test",
      detail: { pain: 5 },
    });
    return { ...m, alertId };
  }

  it("vista: sigue en el tablero con status vista y el alumno sigue rojo", async () => {
    const { userId, alertId, adminToken } = await alumnoConMolestia();

    const res = await patchAlert(app, adminToken, alertId, { status: "vista" });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      id: alertId,
      kind: "molestia",
      status: "vista",
      proposal: { kind: "etapa", stage: 1 },
    });
    const member = boardMember(await fetchBoard(app, adminToken), userId);
    expect(member.light).toBe("rojo");
    expect(member.alerts[0]).toMatchObject({ id: alertId, status: "vista" });
  });

  it("resuelta: desaparece del tablero y guarda quién y cuándo", async () => {
    const { userId, alertId } = await alumnoConMolestia();
    const admin = await createConquerStaff(app, "admin");

    const res = await patchAlert(app, admin.token, alertId, {
      status: "resuelta",
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ id: alertId, status: "resuelta" });
    const [fila] = await readConquerAlerts(app, userId);
    expect(fila).toMatchObject({ status: "resuelta", resolvedBy: admin.id });
    expect(fila?.resolvedAt).not.toBeNull();
    const member = boardMember(await fetchBoard(app, admin.token), userId);
    expect(member.alerts).toHaveLength(0);
    expect(member.light).toBe("ok");
  });

  it("vista -> resuelta anda; resuelta -> vista es 409 y repetir resuelta es idempotente", async () => {
    const { userId, alertId, adminToken } = await alumnoConMolestia();

    await patchAlert(app, adminToken, alertId, { status: "vista" });
    const resuelta = await patchAlert(app, adminToken, alertId, {
      status: "resuelta",
    });
    const [antes] = await readConquerAlerts(app, userId);
    const repetida = await patchAlert(app, adminToken, alertId, {
      status: "resuelta",
    });
    const reabrir = await patchAlert(app, adminToken, alertId, {
      status: "vista",
    });

    expect(resuelta.statusCode, resuelta.body).toBe(200);
    expect(repetida.statusCode, repetida.body).toBe(200);
    expect(reabrir.statusCode, reabrir.body).toBe(409);
    expect(reabrir.json<ConquerErrorBody>().code).toBe(
      "CONQUER_ALERTA_RESUELTA",
    );
    const [despues] = await readConquerAlerts(app, userId);
    expect(despues).toMatchObject({
      status: "resuelta",
      resolvedBy: antes?.resolvedBy,
    });
  });

  it("una alerta de otro gimnasio es 404 y no se toca (T-201-30)", async () => {
    const { adminToken } = await alumnoConMolestia();
    const ajena = await insertConquerAlert(app, {
      userId: gym2.socios[0].id,
      type: "molestia",
      dedupeKey: "molestia:gym2",
      tenantId: TENANT_DOS,
    });

    const res = await patchAlert(app, adminToken, ajena, {
      status: "resuelta",
    });

    expect(res.statusCode, res.body).toBe(404);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_ALERTA_NO_ENCONTRADA",
    );
    const [fila] = await app.db
      .select()
      .from(schema.conquerAlerts)
      .where(
        and(
          tenantWhere(schema.conquerAlerts, { tenantId: TENANT_DOS }),
          eq(schema.conquerAlerts.id, ajena),
        ),
      );
    expect(fila).toMatchObject({ status: "abierta", resolvedBy: null });
  });

  it("el admin del gimnasio 2 tampoco toca una alerta del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const { alertId, userId } = await alumnoConMolestia();

    const res = await patchAlert(app, gym2.adminToken, alertId, {
      status: "resuelta",
    });

    expect(res.statusCode, res.body).toBe(404);
    const [fila] = await readConquerAlerts(app, userId);
    expect(fila).toMatchObject({ status: "abierta", resolvedBy: null });
  });

  it("un id que no existe es 404", async () => {
    const { adminToken } = await alumnoConMolestia();

    const res = await patchAlert(app, adminToken, 2_000_000_000, {
      status: "vista",
    });

    expect(res.statusCode, res.body).toBe(404);
  });

  it.each(["coach", "recepcion"])(
    "el rol %s no puede cambiar alertas: 403 aun con un body inválido (T-201-29)",
    async (rol) => {
      const { alertId, userId } = await alumnoConMolestia();
      const staff = await createConquerStaff(app, rol);

      const valido = await patchAlert(app, staff.token, alertId, {
        status: "resuelta",
      });
      const invalido = await patchAlert(app, staff.token, alertId, {
        status: "otra",
      });

      expect(valido.statusCode).toBe(403);
      expect(invalido.statusCode).toBe(403);
      const [fila] = await readConquerAlerts(app, userId);
      expect(fila?.status).toBe("abierta");
    },
  );

  it("un socio no puede: 403; sin token: 401", async () => {
    const { alertId, token } = await alumnoConMolestia();

    const socio = await patchAlert(app, token, alertId, { status: "vista" });
    const anonimo = await patchAlert(app, undefined, alertId, {
      status: "vista",
    });

    expect(socio.statusCode).toBe(403);
    expect(anonimo.statusCode).toBe(401);
  });

  it.each([
    { caso: "status inexistente", id: "1", payload: { status: "abierta" } },
    { caso: "sin status", id: "1", payload: {} },
    { caso: "sin body", id: "1", payload: undefined },
    { caso: "id cero", id: "0", payload: { status: "vista" } },
    { caso: "id no numérico", id: "abc", payload: { status: "vista" } },
  ])("validación: $caso es 400", async ({ id, payload }) => {
    const { adminToken } = await alumnoConMolestia();

    const res = await patchAlert(app, adminToken, id, payload);

    expect(res.statusCode, res.body).toBe(400);
  });
});
