/**
 * Fase 201 Plan 09 (S12-7, §7.2, T-201-29, T-201-31): tablero del coach.
 *
 *   - GET /api/admin/conquer/members
 *
 * Integración contra el MySQL de tests. Alumnos con fábricas (`createTestMember`)
 * y filas directas en `conquer_members` / `conquer_alerts`.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { addDaysIso } from "../../src/modules/conquer/calendar";
import { buildBoard } from "../../src/modules/conquer/board-service";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  boardMember,
  createConquerStaff,
  fetchBoard,
  getBoardRaw,
  insertConquerAlert,
  insertConquerMember,
  memberToday,
  TEMPLO_CTX,
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

/** Sembrar 30 alumnos por la API de registro tarda: más holgura que los 30 s por defecto. */
const SEED_TIMEOUT = 120_000;

const TOTAL = 30;
/** Índices (por apellido) de cada grupo: los rojos son los que MÁS tarde caen por apellido. */
const ROJOS = [28, 29];
const AMARILLOS = [10, 11, 12];
const VERDE = 5;

const apellido = (i: number) => `Apellido ${String(i).padStart(2, "0")}`;

/** 30 alumnos `activo` de El Templo, el índice `i` con el apellido `apellido(i)`. */
async function sembrarAlumnos(): Promise<{ ids: number[]; hoy: string }> {
  const ids: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const m = await createTestMember(app, { lastName: apellido(i) });
    ids.push(m.id);
  }
  const hoy = await memberToday(app, ids[0] ?? 0);
  for (const [i, userId] of ids.entries()) {
    await insertConquerMember(app, userId, {
      status: "activo",
      level: "toro",
      daysCount: 4,
      // Los amarillos y el primer rojo llevan 10 días activados sin entrenar.
      activationDate:
        AMARILLOS.includes(i) || i === ROJOS[0] ? addDaysIso(hoy, -10) : hoy,
      levelSince: hoy,
    });
  }
  return { ids, hoy };
}

describe("GET /api/admin/conquer/members (S12-7)", () => {
  it(
    "30 alumnos en una sola request: counts correctos y orden rojo, amarillo, verde, ok y apellido",
    async () => {
      const { ids } = await sembrarAlumnos();
      const admin = await createConquerStaff(app, "admin");
      for (const i of ROJOS) {
        await insertConquerAlert(app, {
          userId: ids[i] ?? 0,
          type: "molestia",
          dedupeKey: `molestia:tablero:${i}`,
          detail: { pain: 5 },
        });
      }
      await insertConquerAlert(app, {
        userId: ids[VERDE] ?? 0,
        type: "paso_nivel",
        dedupeKey: "paso_nivel:toro:tablero",
        detail: { from: "novillo", to: "toro", weeks: 4 },
      });

      const board = await fetchBoard(app, admin.token);

      expect(board.members).toHaveLength(TOTAL);
      // 2 rojos (el primero también inactivo), 3 amarillos (inactivos) y 1 verde.
      expect(board.counts).toEqual({
        rojo: 2,
        amarillo: 3,
        verde: 1,
        ok: TOTAL - 6,
        total: TOTAL,
      });
      const esperado = [
        ...ROJOS,
        ...AMARILLOS,
        VERDE,
        ...ids
          .map((_, i) => i)
          .filter(
            (i) => !ROJOS.includes(i) && !AMARILLOS.includes(i) && i !== VERDE,
          ),
      ].map((i) => ids[i]);
      expect(board.members.map((m) => m.userId)).toEqual(esperado);
      expect(board.members.map((m) => m.light)).toEqual([
        "rojo",
        "rojo",
        "amarillo",
        "amarillo",
        "amarillo",
        "verde",
        ...Array<string>(TOTAL - 6).fill("ok"),
      ]);
    },
    SEED_TIMEOUT,
  );

  it(
    "cada alumno trae su nivel, días y las alertas con la forma del contrato",
    async () => {
      const { ids } = await sembrarAlumnos();
      const admin = await createConquerStaff(app, "admin");
      await insertConquerAlert(app, {
        userId: ids[ROJOS[0] ?? 0] ?? 0,
        type: "molestia",
        dedupeKey: "molestia:contrato",
        detail: { pain: 5 },
      });

      const board = await fetchBoard(app, admin.token);

      // El primer rojo también está inactivo: el peor semáforo gana y trae las dos.
      const rojo = boardMember(board, ids[ROJOS[0] ?? 0] ?? 0);
      expect(rojo).toMatchObject({
        firstName: "Test",
        lastName: apellido(ROJOS[0] ?? 0),
        level: "toro",
        daysCount: 4,
        cutStage: 0,
        lastSessionDate: null,
        light: "rojo",
      });
      expect(rojo.alerts.map((a) => a.kind)).toEqual(["molestia", "inactivo"]);
      expect(rojo.alerts[0]).toMatchObject({
        severity: "rojo",
        label: "Molestia",
        // 201-26 DA-13: la frase del anexo §8 (alerta sin día ni fecha: se omiten).
        text: "Molestia 5/10",
        status: "abierta",
        detail: { pain: 5 },
        proposal: { kind: "etapa", stage: 1, label: "Sábado: drops de 10 a 6" },
      });
      expect(rojo.alerts[0]?.id).toEqual(expect.any(Number));
      expect(rojo.alerts[0]?.createdAt).toEqual(expect.any(String));
      expect(rojo.alerts[1]).toMatchObject({
        id: null,
        severity: "amarillo",
        label: "Inactivo",
        text: "Todavía no registró sesiones",
        status: null,
        createdAt: null,
        proposal: null,
      });
      // Un alumno sin nada pendiente.
      expect(boardMember(board, ids[0] ?? 0)).toMatchObject({
        light: "ok",
        alerts: [],
      });
    },
    SEED_TIMEOUT,
  );

  // 201-26 DA-12 / anexo §8: Toro con la etapa 5 ya no tiene propuesta.
  it(
    "Toro en la etapa 5: las alertas de molestia y caída no traen propuesta (null)",
    async () => {
      const { ids } = await sembrarAlumnos();
      const admin = await createConquerStaff(app, "admin");
      const userId = ids[0] ?? 0;
      await app.db
        .update(schema.conquerMembers)
        .set({ cutStage: 5 })
        .where(
          and(
            tenantWhere(schema.conquerMembers, TEMPLO_CTX),
            eq(schema.conquerMembers.userId, userId),
          ),
        );
      await insertConquerAlert(app, {
        userId,
        type: "caida",
        dedupeKey: "caida:1:etapa5",
        detail: { exerciseId: 1, exerciseName: "HSPU" },
      });

      const member = boardMember(await fetchBoard(app, admin.token), userId);

      const caida = member.alerts.find((a) => a.kind === "caida");
      expect(caida?.proposal).toBeNull();
      expect(caida?.text).toBe("El E1 de HSPU bajó 2 sesiones seguidas");
    },
    SEED_TIMEOUT,
  );

  it(
    "el recorte avanza con cut_stage: Toro en la etapa 2 propone la 3",
    async () => {
      const { ids } = await sembrarAlumnos();
      const admin = await createConquerStaff(app, "admin");
      const userId = ids[0] ?? 0;
      await app.db
        .update(schema.conquerMembers)
        .set({ cutStage: 2 })
        .where(
          and(
            tenantWhere(schema.conquerMembers, TEMPLO_CTX),
            eq(schema.conquerMembers.userId, userId),
          ),
        );
      await insertConquerAlert(app, {
        userId,
        type: "caida",
        dedupeKey: "caida:1:tablero",
        detail: { exerciseId: 1 },
      });

      const member = boardMember(await fetchBoard(app, admin.token), userId);

      expect(member.cutStage).toBe(2);
      expect(member.alerts[0]?.proposal).toEqual({
        kind: "etapa",
        stage: 3,
        label: "Sábado: se saca",
      });
    },
    SEED_TIMEOUT,
  );

  it(
    "T-201-31: son 4 queries fijas con 30 alumnos y con 1 (sin N+1)",
    async () => {
      await sembrarAlumnos();
      const select = vi.spyOn(app.db, "select");
      try {
        await buildBoard(app.db, TEMPLO_CTX);
        expect(select).toHaveBeenCalledTimes(4);

        await cleanAllTestData(app);
        const solo = await createTestMember(app);
        await insertConquerMember(app, solo.id, {
          status: "activo",
          level: "toro",
          daysCount: 4,
        });
        // El limpiado y el alta también usan `select`: se cuentan desde acá.
        select.mockClear();
        await buildBoard(app.db, TEMPLO_CTX);
        expect(select).toHaveBeenCalledTimes(4);
      } finally {
        select.mockRestore();
      }
    },
    SEED_TIMEOUT,
  );

  it("sin alumnos activos: tablero vacío", async () => {
    const admin = await createConquerStaff(app, "admin");

    const board = await fetchBoard(app, admin.token);

    expect(board).toEqual({
      counts: { rojo: 0, amarillo: 0, verde: 0, ok: 0, total: 0 },
      members: [],
    });
  });

  it("los alumnos en pedido no aparecen", async () => {
    const admin = await createConquerStaff(app, "admin");
    const pedido = await createTestMember(app);
    const activo = await createTestMember(app);
    await insertConquerMember(app, pedido.id, { status: "pedido" });
    await insertConquerMember(app, activo.id, {
      status: "activo",
      level: "novillo",
      daysCount: 3,
    });

    const board = await fetchBoard(app, admin.token);

    expect(board.members.map((m) => m.userId)).toEqual([activo.id]);
    expect(board.counts.total).toBe(1);
  });

  it("una alerta resuelta no cuenta para el semáforo", async () => {
    const admin = await createConquerStaff(app, "admin");
    const m = await createTestMember(app);
    await insertConquerMember(app, m.id, {
      status: "activo",
      level: "toro",
      daysCount: 4,
    });
    await insertConquerAlert(app, {
      userId: m.id,
      type: "molestia",
      dedupeKey: "molestia:cerrada",
      status: "resuelta",
      resolvedBy: admin.id,
    });

    const member = boardMember(await fetchBoard(app, admin.token), m.id);

    expect(member.light).toBe("ok");
    expect(member.alerts).toEqual([]);
  });

  it("gimnasio 2 aislado: cada admin ve solo a los suyos y a sus alertas", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const templo = await createTestMember(app);
    await insertConquerMember(app, templo.id, {
      status: "activo",
      level: "toro",
      daysCount: 4,
    });
    await insertConquerAlert(app, {
      userId: templo.id,
      type: "molestia",
      dedupeKey: "molestia:templo",
    });
    const [socio2] = gym2.socios;
    await app.db.insert(schema.conquerMembers).values(
      tenantValues(
        { tenantId: TENANT_DOS },
        {
          userId: socio2.id,
          status: "activo" as const,
          level: "novillo" as const,
          daysCount: 3,
        },
      ),
    );
    await insertConquerAlert(app, {
      userId: socio2.id,
      type: "caida",
      dedupeKey: "caida:gym2",
      tenantId: TENANT_DOS,
    });
    const admin = await createConquerStaff(app, "admin");

    const delTemplo = await fetchBoard(app, admin.token);
    const delGym2 = await fetchBoard(app, gym2.adminToken);

    expect(delTemplo.members.map((m) => m.userId)).toEqual([templo.id]);
    expect(delTemplo.members[0]?.alerts.map((a) => a.kind)).toEqual([
      "molestia",
    ]);
    expect(delGym2.members.map((m) => m.userId)).toEqual([socio2.id]);
    expect(delGym2.members[0]?.alerts.map((a) => a.kind)).toEqual(["caida"]);
  });

  it.each(["coach", "recepcion"])(
    "el rol %s no ve el tablero: 403 (T-201-29)",
    async (rol) => {
      const staff = await createConquerStaff(app, rol);

      const res = await getBoardRaw(app, staff.token);

      expect(res.statusCode).toBe(403);
    },
  );

  it("un socio no ve el tablero: 403; sin token: 401", async () => {
    const socio = await createTestMember(app);

    const comoSocio = await getBoardRaw(app, socio.token);
    const anonimo = await getBoardRaw(app);

    expect(comoSocio.statusCode).toBe(403);
    expect(anonimo.statusCode).toBe(401);
  });
});
