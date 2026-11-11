/**
 * Fase 213 Plan 05 (T-213-14, T-213-17, SC-8) — aislamiento de tenant del
 * estiramiento post-clase y de su cierre:
 *
 *   GET  /api/sessions/stretch/today
 *   POST /api/sessions/stretch/events
 *   POST /api/sessions/stretch/complete
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Las tres rutas viven dentro de `sessionRoutes`, o sea detrás del guard de
 * módulo `templo-training` (`moduleScope`), y en `test/tenant-manifest.ts` son
 * `templo-module`. Para ejercer el aislamiento de tenant sobre ellas el
 * gimnasio 2 necesita el módulo PRENDIDO (`setModuleFlag`), igual que
 * `iso-03-free-blocks.test.ts`: sin el flag, todo caso pegaría contra el 404 del
 * guard y no probaría nada del filtro por tenant.
 *
 * Qué prueba:
 *   (1) cada socio ve y crea SOLO su oferta: las filas de `stretch_offers`
 *       quedan con el `tenant_id` de su gimnasio y la rutina sale del catálogo
 *       de su gimnasio;
 *   (2) completar el `offerId` de otro gimnasio da 404 en los dos sentidos y no
 *       toca la fila ajena;
 *   (3) los eventos de un socio no marcan la oferta de otro gimnasio;
 *   (4) control positivo: el socio del gimnasio 2 cierra su propia oferta y la
 *       fila queda en el gimnasio 2;
 *   (5) con `templo-training` OFF para el gimnasio 2, las tres rutas dan 404
 *       del guard (se prueba primero que con el flag ON la misma request anda,
 *       para que el 404 sea del guard y no de otra cosa).
 *
 * `sessions.day_id` es UNIQUE global: las dos sesiones son del mismo día y se
 * separan por NIVEL (El Templo `sigma`, gimnasio 2 `alfa`), para que el único
 * filtro entre los dos sea el tenant.
 *
 * NO ESTÁ EN NINGÚN `ARCHIVOS_BATERIA`: mismo criterio que
 * `iso-03-free-blocks.test.ts` (rutas `templo-module`, cobertura de manifiesto
 * en `iso-01-manifiesto.test.ts`).
 *
 * Reloj: lo fija `arrangeStretchScenario` (solo `Date`, 21:05 de la sede del
 * último miércoles, con la clase terminada a las 21:00) ANTES de loguear a los
 * socios; se restaura en `afterEach`.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-stretch.test.ts --hookTimeout=250000
 *
 * @see test/tenancy/iso-03-free-blocks.test.ts — modelo de este archivo
 * @see test/sessions/_stretch-fixtures.ts — fábricas con `ctx`
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import type {
  StretchCompleteView,
  StretchTodayView,
} from "../../src/modules/sessions/stretch-service";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";
import { createPresencialMember } from "../sessions/_free-blocks-fixtures";
import {
  BLOQUES_REGULAR,
  DOW,
  arrangeStretchScenario,
  seedAttendance,
  seedClass,
  seedStretchCatalog,
  seedStretchSession,
} from "../sessions/_stretch-fixtures";

const MIN = 60_000;
const BASE = "/api/sessions/stretch";
const LEVEL_DOS = "alfa";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

interface Socio {
  id: number;
  token: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: Socio;
let dos: Socio;
// Ids de ejercicio del catálogo del gimnasio 2 (para afirmar de dónde sale la rutina).
let catalogoDos: Set<number>;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  // El Templo con los 4 flags ON y el gimnasio 2 con templo-training prendido:
  // sin esto, todo caso pegaría contra el 404 del guard en vez de contra el
  // aislamiento de tenant que este archivo existe para probar.
  await restoreTemploFlags(app);
  await setModuleFlag(app, TENANT_DOS, "templo-training", true);

  // El Templo: reloj, day_modes, catálogo, socio (sigma), sesión, clase y
  // asistencia del miércoles. Fija el reloj ANTES de crear a los socios.
  const escenario = await arrangeStretchScenario(app, { dia: "miercoles" });
  templo = escenario.member;

  // Gimnasio 2: catálogo, socio (alfa), sesión del mismo día con OTRO nivel,
  // clase propia y asistencia propia. Sin day_modes (sin fila = regular).
  const idsCatalogo = await seedStretchCatalog(app, CTX_DOS);
  catalogoDos = new Set(idsCatalogo.values());
  dos = await createPresencialMember(app, {
    level: LEVEL_DOS,
    ctx: CTX_DOS,
    branchId: gym2.branchId,
  });
  await seedStretchSession(app, {
    date: escenario.date,
    level: LEVEL_DOS,
    mode: "regular",
    blocks: BLOQUES_REGULAR,
    ctx: CTX_DOS,
  });
  const { scheduleId } = await seedClass(app, {
    branchId: gym2.branchId,
    dayOfWeek: DOW.miercoles,
    startTime: "20:00",
    endTime: "21:00",
    ctx: CTX_DOS,
  });
  await seedAttendance(app, {
    memberId: dos.id,
    branchId: gym2.branchId,
    scheduleId,
    sessionDate: escenario.date,
    ctx: CTX_DOS,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  // No filtrar flags al worker (isolate: false): `limpiarSegundoGimnasio` ya
  // borra los del gimnasio 2; los de El Templo vuelven a su default ON.
  await restoreTemploFlags(app);
  await app.close();
});

// ─── helpers ─────────────────────────────────────────────────────────────

async function getToday(socio: Socio) {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/today`,
    headers: { authorization: `Bearer ${socio.token}` },
  });
  return { status: res.statusCode, raw: res.body };
}

async function hoy(socio: Socio): Promise<StretchTodayView> {
  const res = await getToday(socio);
  expect(res.status, res.raw).toBe(200);
  return JSON.parse(res.raw) as StretchTodayView;
}

async function postEvent(socio: Socio, payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/events`,
    headers: { authorization: `Bearer ${socio.token}` },
    payload,
  });
  return { status: res.statusCode, raw: res.body };
}

async function postComplete(
  socio: Socio,
  offerId: number,
  exercisesCompleted: number[],
) {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/complete`,
    headers: { authorization: `Bearer ${socio.token}` },
    payload: { offerId, exercisesCompleted },
  });
  return { status: res.statusCode, raw: res.body };
}

/** Filas de stretch_offers de un gimnasio, filtradas por su tenant. */
async function filas(ctx: TenantContext) {
  return app.db
    .select()
    .from(schema.stretchOffers)
    .where(tenantWhere(schema.stretchOffers, ctx));
}

async function fila(ctx: TenantContext, offerId: number) {
  const [row] = await app.db
    .select()
    .from(schema.stretchOffers)
    .where(
      and(
        tenantWhere(schema.stretchOffers, ctx),
        eq(schema.stretchOffers.id, offerId),
      ),
    );
  return row;
}

/** Apaga templo-training para el gimnasio 2 durante `fn` y lo restaura. */
async function conModuloApagado(fn: () => Promise<void>): Promise<void> {
  await setModuleFlag(app, TENANT_DOS, "templo-training", false);
  try {
    await fn();
  } finally {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
  }
}

// ─── casos ───────────────────────────────────────────────────────────────

describe("GET /api/sessions/stretch/today", () => {
  it("aislamiento: cada socio crea SOLO su oferta, con el tenant_id y el catálogo de su gimnasio", async () => {
    const deTemplo = await hoy(templo);
    const deDos = await hoy(dos);

    expect(deTemplo.status).toBe("available");
    expect(deDos.status).toBe("available");
    expect(deDos.offerId).not.toBe(deTemplo.offerId);

    const filasTemplo = await filas(CTX_TEMPLO);
    const filasDos = await filas(CTX_DOS);
    expect(filasTemplo).toHaveLength(1);
    expect(filasTemplo[0].userId).toBe(templo.id);
    expect(filasTemplo[0].tenantId).toBe(TENANT_TEMPLO);
    expect(filasDos).toHaveLength(1);
    expect(
      filasDos[0].userId,
      `GET ${BASE}/today: el gimnasio ${TENANT_DOS} no creó la fila de su socio.`,
    ).toBe(dos.id);
    expect(filasDos[0].tenantId).toBe(TENANT_DOS);

    // La rutina del gimnasio 2 sale SOLO de su catálogo.
    expect(deDos.exercises.length).toBeGreaterThan(0);
    for (const e of deDos.exercises) {
      expect(
        catalogoDos.has(e.exerciseId),
        `el ejercicio ${e.exerciseId} del gimnasio ${TENANT_DOS} no es de su catálogo`,
      ).toBe(true);
    }
    for (const e of deTemplo.exercises) {
      expect(catalogoDos.has(e.exerciseId)).toBe(false);
    }
  });

  it("guard: con templo-training OFF para el gimnasio 2 da 404 del guard", async () => {
    // Con el flag ON la misma request anda: el 404 de abajo es del guard.
    expect((await getToday(dos)).status).toBe(200);
    await conModuloApagado(async () => {
      const res = await getToday(dos);
      expect(
        res.status,
        `GET ${BASE}/today: con el módulo OFF el guard tiene que cortar. ${res.raw}`,
      ).toBe(404);
    });
  });
});

describe("POST /api/sessions/stretch/complete", () => {
  it("aislamiento: cerrar el offerId de otro gimnasio da 404 en los dos sentidos y no toca la fila ajena", async () => {
    const deTemplo = await hoy(templo);
    const deDos = await hoy(dos);
    const offerTemplo = deTemplo.offerId as number;
    const offerDos = deDos.offerId as number;

    const dosSobreTemplo = await postComplete(
      dos,
      offerTemplo,
      deTemplo.exercises.map((e) => e.exerciseId),
    );
    expect(
      dosSobreTemplo.status,
      `POST ${BASE}/complete: el gimnasio ${TENANT_DOS} cerró una oferta de El Templo.`,
    ).toBe(404);

    const temploSobreDos = await postComplete(
      templo,
      offerDos,
      deDos.exercises.map((e) => e.exerciseId),
    );
    expect(
      temploSobreDos.status,
      `POST ${BASE}/complete: El Templo cerró una oferta del gimnasio ${TENANT_DOS}.`,
    ).toBe(404);

    expect((await fila(CTX_TEMPLO, offerTemplo)).completedAt).toBeNull();
    expect((await fila(CTX_DOS, offerDos)).completedAt).toBeNull();
  });

  it("control positivo: el socio del gimnasio 2 cierra su propia oferta y la fila queda en su gimnasio", async () => {
    const deTemplo = await hoy(templo);
    const deDos = await hoy(dos);

    const res = await postComplete(
      dos,
      deDos.offerId as number,
      deDos.exercises.map((e) => e.exerciseId),
    );
    expect(res.status, res.raw).toBe(200);
    const body = JSON.parse(res.raw) as StretchCompleteView;
    expect(body.alreadyCompleted).toBe(false);

    const propia = await fila(CTX_DOS, deDos.offerId as number);
    expect(propia.tenantId).toBe(TENANT_DOS);
    expect(propia.userId).toBe(dos.id);
    expect(propia.completedAt).not.toBeNull();
    // La oferta de El Templo no se movió.
    expect(
      (await fila(CTX_TEMPLO, deTemplo.offerId as number)).completedAt,
    ).toBeNull();
  });

  it("guard: con templo-training OFF para el gimnasio 2, cerrar su propia oferta da 404 y no escribe", async () => {
    const deDos = await hoy(dos);
    const ids = deDos.exercises.map((e) => e.exerciseId);
    const offerDos = deDos.offerId as number;

    // Con el flag ON la misma request cierra la oferta (200).
    expect((await postComplete(dos, offerDos, ids)).status).toBe(200);
    // Se borra la marca para medir el OFF sobre una oferta sin cerrar.
    await app.db
      .update(schema.stretchOffers)
      .set({ completedAt: null })
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_DOS),
          eq(schema.stretchOffers.id, offerDos),
        ),
      );

    await conModuloApagado(async () => {
      const res = await postComplete(dos, offerDos, ids);
      expect(
        res.status,
        `POST ${BASE}/complete: con el módulo OFF el guard tiene que cortar antes del service. ${res.raw}`,
      ).toBe(404);
    });
    expect((await fila(CTX_DOS, offerDos)).completedAt).toBeNull();
  });
});

describe("POST /api/sessions/stretch/events", () => {
  it("aislamiento: los eventos de un socio no marcan la oferta de otro gimnasio", async () => {
    // Solo El Templo tiene oferta; el socio del gimnasio 2 todavía no abrió la card.
    const deTemplo = await hoy(templo);

    expect((await postEvent(dos, { type: "card_seen" })).status).toBe(404);
    expect((await postEvent(dos, { type: "started" })).status).toBe(404);
    // push_opened es siempre 200 (no-op), pero tampoco puede tocar la fila ajena.
    expect((await postEvent(dos, { type: "push_opened" })).status).toBe(200);

    const ajena = await fila(CTX_TEMPLO, deTemplo.offerId as number);
    expect(ajena.cardSeenAt).toBeNull();
    expect(ajena.startedAt).toBeNull();
    expect(ajena.pushOpenedAt).toBeNull();
    expect(await filas(CTX_DOS)).toHaveLength(0);
  });

  it("control positivo: cada socio marca SU oferta y no la del otro", async () => {
    const deTemplo = await hoy(templo);
    const deDos = await hoy(dos);

    expect((await postEvent(dos, { type: "card_seen" })).status).toBe(200);

    expect(
      (await fila(CTX_DOS, deDos.offerId as number)).cardSeenAt,
    ).not.toBeNull();
    expect(
      (await fila(CTX_TEMPLO, deTemplo.offerId as number)).cardSeenAt,
    ).toBeNull();
  });

  it("guard: con templo-training OFF para el gimnasio 2, los eventos dan 404 del guard", async () => {
    const deDos = await hoy(dos);
    // Con el flag ON el mismo evento anda.
    expect((await postEvent(dos, { type: "card_seen" })).status).toBe(200);
    expect((await fila(CTX_DOS, deDos.offerId as number)).startedAt).toBeNull();

    await conModuloApagado(async () => {
      vi.setSystemTime(new Date(Date.now() + MIN));
      for (const payload of [
        { type: "started" },
        { type: "card_seen" },
        { type: "push_opened" },
      ]) {
        const res = await postEvent(dos, payload);
        expect(
          res.status,
          `POST ${BASE}/events (${payload.type}): con el módulo OFF el guard tiene que cortar. ${res.raw}`,
        ).toBe(404);
      }
    });
    expect((await fila(CTX_DOS, deDos.offerId as number)).startedAt).toBeNull();
  });
});
