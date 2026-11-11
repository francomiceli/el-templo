/**
 * Fase 213 Plan 05 (D-08, D-12, D-15, SC-3, SC-7): eventos del embudo y cierre
 * del estiramiento.
 *
 *   POST /api/sessions/stretch/events
 *   POST /api/sessions/stretch/complete
 *
 * Reloj: `arrangeStretchScenario` fija solo `Date` en la hora de pared de la
 * sede (21:05 por defecto, la clase terminó a las 21:00) del último día de la
 * semana que pida, calculado desde el `Date.now()` real. Los saltos de reloj de
 * cada caso son RELATIVOS a `Date.now()` (`avanzar`). Sin fechas de calendario
 * fijas ni ids de usuario fijos. El reloj se restaura en `afterEach`.
 *
 * `aura_config` NO se puede dar por sembrada (`TABLES_TO_CLEAN` la borra y otros
 * archivos del worker también): la fuente `stretch` se re-siembra en cada
 * `beforeEach`. `stretch_catalog` lo siembra el escenario.
 *
 * La oferta nace como en producción: con `GET /stretch/today` de una clase ya
 * terminada.
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
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { shiftDate } from "../../src/modules/shared/week-dates";
import type {
  StretchCompleteView,
  StretchTodayView,
} from "../../src/modules/sessions/stretch-service";
import { stretchArm } from "../../src/modules/sessions/stretch-timing";
import {
  CTX_TEMPLO,
  createPresencialMember,
  dayIdFor,
} from "./_free-blocks-fixtures";
import {
  AR_TZ,
  BRANCH_ID,
  LEVEL,
  arrangeStretchScenario,
  restoreStretchScenario,
  localClock,
  type ArrangeOpts,
  type Arranged,
} from "./_stretch-fixtures";

const MIN = 60_000;

type CompleteBody = StretchCompleteView & { error?: string };

describe("eventos y cierre del estiramiento: POST /api/sessions/stretch/{events,complete} (213-05)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // aura_config no se da por sembrada: la fuente stretch se re-siembra.
    await app.db
      .insert(schema.auraConfig)
      .values(
        tenantValues(CTX_TEMPLO, {
          sourceType: "stretch" as const,
          defaultAmount: 5,
          description: "Estiramiento post-clase del día",
          isActive: true,
        }),
      )
      .onDuplicateKeyUpdate({ set: { defaultAmount: 5, isActive: true } });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await restoreStretchScenario(app);
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Mueve el reloj `ms` hacia adelante, relativo al `Date.now()` actual. */
  function avanzar(ms: number): void {
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  function arrange(opts: ArrangeOpts = {}): Promise<Arranged> {
    return arrangeStretchScenario(app, opts);
  }

  async function getToday(token: string): Promise<StretchTodayView> {
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/stretch/today",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    return JSON.parse(res.body) as StretchTodayView;
  }

  async function postEvent(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/stretch/events",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as { ok?: boolean; error?: string },
    };
  }

  async function postComplete(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: CompleteBody }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/stretch/complete",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as CompleteBody,
    };
  }

  /** Oferta del día creada como en producción (la card llama a /today). */
  async function crearOferta(
    token: string,
  ): Promise<{ offerId: number; ids: number[] }> {
    const today = await getToday(token);
    expect(today.status).toBe("available");
    expect(today.offerId).not.toBeNull();
    return {
      offerId: today.offerId as number,
      ids: today.exercises.map((e) => e.exerciseId),
    };
  }

  async function offerRow(offerId: number) {
    const [row] = await app.db
      .select()
      .from(schema.stretchOffers)
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_TEMPLO),
          eq(schema.stretchOffers.id, offerId),
        ),
      );
    return row;
  }

  async function auraStretch(userId: number) {
    return app.db
      .select({
        amount: schema.auraTransactions.amount,
        sourceType: schema.auraTransactions.sourceType,
        referenceType: schema.auraTransactions.referenceType,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, CTX_TEMPLO),
          eq(schema.auraTransactions.userId, userId),
          eq(schema.auraTransactions.sourceType, "stretch"),
        ),
      );
  }

  async function contarCompletedSessions(userId: number): Promise<number> {
    const [row] = await app.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, CTX_TEMPLO),
          eq(schema.completedSessions.userId, userId),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async function racha(userId: number) {
    const [row] = await app.db
      .select({
        current: schema.memberProfiles.currentStreak,
        longest: schema.memberProfiles.longestStreak,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, userId),
        ),
      );
    return row;
  }

  /** Notificaciones encoladas del socio con la plantilla post_session_soreness. */
  async function contarSoreness(userId: number): Promise<number> {
    const rows = await app.db
      .select({ id: schema.pendingNotifications.id })
      .from(schema.pendingNotifications)
      .innerJoin(
        schema.notificationTemplates,
        eq(
          schema.notificationTemplates.id,
          schema.pendingNotifications.templateId,
        ),
      )
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX_TEMPLO),
          eq(schema.pendingNotifications.userId, userId),
          eq(schema.notificationTemplates.templateKey, "post_session_soreness"),
        ),
      );
    return rows.length;
  }

  /** Inserta una oferta de otro día (sin pasar por /today). */
  async function insertarOferta(
    userId: number,
    localDate: string,
    extra: Partial<typeof schema.stretchOffers.$inferInsert> = {},
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.stretchOffers)
      .values(
        tenantValues(CTX_TEMPLO, {
          userId,
          localDate,
          branchId: BRANCH_ID,
          sourceDayId: dayIdFor(localDate, LEVEL),
          classEndAt: new Date(),
          exercises: [
            {
              exerciseId: 1,
              name: "CAT COW",
              family: "FL" as const,
              sides: 1,
            },
          ],
          plannedSeconds: 330,
          arm: stretchArm(userId),
          ...extra,
        }),
      )
      .$returningId();
    return row.id;
  }

  // ─── casos ─────────────────────────────────────────────────────────────

  it("(a) started y complete con todos los ejercicios 4 minutos después: acredita +5 AURA stretch y marca la fila", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    expect((await postEvent(member.token, { type: "started" })).status).toBe(
      200,
    );
    avanzar(4 * MIN);
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.allDone).toBe(true);
    expect(res.body.auraAwarded).toBe(true);
    expect(res.body.alreadyCompleted).toBe(false);
    expect(res.body.durationSeconds).toBeGreaterThanOrEqual(239);
    expect(res.body.durationSeconds).toBeLessThanOrEqual(241);
    expect(res.body.minutes).toBe(4);

    const aura = await auraStretch(member.id);
    expect(aura).toHaveLength(1);
    expect(aura[0].amount).toBe(5);
    expect(aura[0].referenceType).toBe("stretch_day");

    const row = await offerRow(offerId);
    expect(row.completedAt).not.toBeNull();
    expect(row.auraAwarded).toBe(true);
    expect(row.exercisesCompleted).toEqual(ids);
    expect(row.durationSeconds).toBe(res.body.durationSeconds);
    expect(row.startedFrom).toBe("card");
  });

  it("(b) invariantes: no escribe completed_sessions, no toca la racha y no encola post_session_soreness", async () => {
    const { member } = await arrange();

    // Template de la notificación post-sesión: sin él, un encolado indebido se
    // perdería en silencio y el invariante no vería nada.
    await app.db.insert(schema.notificationTemplates).values(
      tenantValues(CTX_TEMPLO, {
        templateKey: "post_session_soreness",
        category: "motivacion" as const,
        title: "Cómo te sentís",
        body: "Contanos cómo te sentís después de entrenar",
        isEnabled: true,
      }),
    );
    // Perfil con racha 3 / 5 (el servicio de racha solo actualiza perfiles existentes).
    await app.db.insert(schema.memberProfiles).values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        goalType: "fitness" as const,
        experienceLevel: "beginner" as const,
        trainingFocus: "full_body" as const,
        motivationStyle: "discipline" as const,
        onboardingCompletedAt: new Date(),
        currentStreak: 3,
        longestStreak: 5,
      }),
    );

    const { offerId, ids } = await crearOferta(member.token);
    const sesionesAntes = await contarCompletedSessions(member.id);
    const rachaAntes = await racha(member.id);
    const sorenessAntes = await contarSoreness(member.id);
    expect(rachaAntes).toEqual({ current: 3, longest: 5 });

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.auraAwarded).toBe(true);

    expect(await contarCompletedSessions(member.id)).toBe(sesionesAntes);
    expect(await racha(member.id)).toEqual(rachaAntes);
    expect(await contarSoreness(member.id)).toBe(sorenessAntes);
    expect(sorenessAntes).toBe(0);
  });

  it("(c) complete a los 2 minutos con todos marcados: completado pero sin AURA", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started" });
    avanzar(2 * MIN);
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.allDone).toBe(true);
    expect(res.body.auraAwarded).toBe(false);
    expect(res.body.durationSeconds).toBeGreaterThanOrEqual(119);
    expect(res.body.durationSeconds).toBeLessThanOrEqual(121);
    expect(await auraStretch(member.id)).toHaveLength(0);

    const row = await offerRow(offerId);
    expect(row.completedAt).not.toBeNull();
    expect(row.auraAwarded).toBe(false);
  });

  it("(d) complete a los 4 minutos con un ejercicio sin marcar: allDone false y sin AURA", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);
    expect(ids.length).toBeGreaterThan(1);

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    const marcados = ids.slice(0, -1);
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: marcados,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.allDone).toBe(false);
    expect(res.body.auraAwarded).toBe(false);
    expect(await auraStretch(member.id)).toHaveLength(0);

    const row = await offerRow(offerId);
    expect(row.completedAt).not.toBeNull();
    expect(row.exercisesCompleted).toEqual(marcados);
  });

  it("(e) un segundo complete devuelve alreadyCompleted y sigue habiendo una sola transacción de AURA", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    const primera = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });
    expect(primera.body.auraAwarded).toBe(true);
    const rowAntes = await offerRow(offerId);

    avanzar(MIN);
    const segunda = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(segunda.status, JSON.stringify(segunda.body)).toBe(200);
    expect(segunda.body.alreadyCompleted).toBe(true);
    expect(segunda.body.durationSeconds).toBe(primera.body.durationSeconds);
    expect(await auraStretch(member.id)).toHaveLength(1);

    // La fila no se reescribe: la marca de completado es la primera.
    const rowDespues = await offerRow(offerId);
    expect(rowDespues.completedAt?.getTime()).toBe(
      rowAntes.completedAt?.getTime(),
    );
  });

  it("(f) AURA una vez por día: reabrir la oferta y completar de nuevo no acredita otra", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    const primera = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });
    expect(primera.body.auraAwarded).toBe(true);

    // Se borra la marca de completado a mano: el candado que queda es el unique
    // del ledger (`awardOncePerLocalDay`).
    await app.db
      .update(schema.stretchOffers)
      .set({ completedAt: null })
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_TEMPLO),
          eq(schema.stretchOffers.id, offerId),
        ),
      );

    avanzar(MIN);
    const segunda = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(segunda.status, JSON.stringify(segunda.body)).toBe(200);
    expect(segunda.body.alreadyCompleted).toBe(false);
    expect(segunda.body.auraAwarded).toBe(false);
    expect(await auraStretch(member.id)).toHaveLength(1);
  });

  it("(f2) reintento tras un premio fallido: la oferta completada con condiciones cumplidas y aura_awarded false acredita una sola vez", async () => {
    const { member, date } = await arrange();
    // Simula el fallo previo: completada con todo marcado y 4 min medidos, pero
    // el premio no llego a acreditarse (aura_awarded false, sin ledger).
    const offerId = await insertarOferta(member.id, date, {
      startedAt: new Date(Date.now() - 4 * MIN),
      completedAt: new Date(),
      durationSeconds: 240,
      exercisesCompleted: [1],
      auraAwarded: false,
    });
    expect(await auraStretch(member.id)).toHaveLength(0);

    const primera = await postComplete(member.token, {
      offerId,
      exercisesCompleted: [1],
    });
    expect(primera.status, JSON.stringify(primera.body)).toBe(200);
    expect(primera.body.alreadyCompleted).toBe(true);
    expect(primera.body.auraAwarded).toBe(true);
    expect(await auraStretch(member.id)).toHaveLength(1);
    expect((await offerRow(offerId)).auraAwarded).toBe(true);

    // Un tercer intento ya no acredita nada mas.
    const segunda = await postComplete(member.token, {
      offerId,
      exercisesCompleted: [1],
    });
    expect(segunda.body.alreadyCompleted).toBe(true);
    expect(segunda.body.auraAwarded).toBe(true);
    expect(await auraStretch(member.id)).toHaveLength(1);
  });

  it("(f3) reintento sin condiciones de AURA (menos de 180 s o ejercicios sin marcar): no acredita", async () => {
    const { member, date } = await arrange();
    const corta = await insertarOferta(member.id, date, {
      startedAt: new Date(Date.now() - 2 * MIN),
      completedAt: new Date(),
      durationSeconds: 120,
      exercisesCompleted: [1],
      auraAwarded: false,
    });

    const res = await postComplete(member.token, {
      offerId: corta,
      exercisesCompleted: [1],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.alreadyCompleted).toBe(true);
    expect(res.body.auraAwarded).toBe(false);
    expect(await auraStretch(member.id)).toHaveLength(0);
    expect((await offerRow(corta)).auraAwarded).toBe(false);
  });

  it("(g) complete de una oferta de ayer responde 410 y la fila no cambia (D-12)", async () => {
    const { member, date } = await arrange();
    const ayer = shiftDate(date, -1);
    const offerId = await insertarOferta(member.id, ayer, {
      startedAt: new Date(Date.now() - 30 * MIN),
    });

    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: [1],
    });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe("Este estiramiento ya venció");
    const row = await offerRow(offerId);
    expect(row.completedAt).toBeNull();
    expect(row.durationSeconds).toBeNull();
    expect(row.exercisesCompleted).toBeNull();
    expect(row.auraAwarded).toBe(false);
    expect(await auraStretch(member.id)).toHaveLength(0);
  });

  it("(h) complete del offerId de otro socio responde 404 y no toca la fila", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);
    const otro = await createPresencialMember(app, { level: LEVEL });

    const res = await postComplete(otro.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No encontramos ese estiramiento");
    const row = await offerRow(offerId);
    expect(row.completedAt).toBeNull();
    expect(await auraStretch(member.id)).toHaveLength(0);
    expect(await auraStretch(otro.id)).toHaveLength(0);
  });

  it("(i) complete sin started: se registra sin duración y sin AURA", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    avanzar(5 * MIN);
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.durationSeconds).toBeNull();
    expect(res.body.auraAwarded).toBe(false);
    expect(res.body.minutes).toBeGreaterThanOrEqual(1);
    expect(await auraStretch(member.id)).toHaveLength(0);

    const row = await offerRow(offerId);
    expect(row.completedAt).not.toBeNull();
    expect(row.durationSeconds).toBeNull();
    expect(row.startedAt).toBeNull();
  });

  it("(j) card_seen dos veces: la marca queda en la primera", async () => {
    const { member } = await arrange();
    const { offerId } = await crearOferta(member.token);

    const primera = await postEvent(member.token, { type: "card_seen" });
    expect(primera.status).toBe(200);
    expect(primera.body.ok).toBe(true);
    const marcaPrimera = (await offerRow(offerId)).cardSeenAt;
    expect(marcaPrimera).not.toBeNull();

    avanzar(10 * MIN);
    const segunda = await postEvent(member.token, { type: "card_seen" });
    expect(segunda.status).toBe(200);

    const marcaSegunda = (await offerRow(offerId)).cardSeenAt;
    expect(marcaSegunda?.getTime()).toBe(marcaPrimera?.getTime());
  });

  it("(k) started dos veces: started_at se mueve al último ingreso y started_from queda el del primero", async () => {
    const { member } = await arrange();
    const { offerId } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started", from: "push" });
    const primera = await offerRow(offerId);
    expect(primera.startedAt).not.toBeNull();
    expect(primera.startedFrom).toBe("push");

    avanzar(5 * MIN);
    const segunda = await postEvent(member.token, {
      type: "started",
      from: "card",
    });
    expect(segunda.status).toBe(200);

    const despues = await offerRow(offerId);
    expect(despues.startedAt?.getTime()).toBe(
      (primera.startedAt?.getTime() ?? 0) + 5 * MIN,
    );
    expect(despues.startedFrom).toBe("push");
  });

  it("(k2) reingreso: con todo marcado a menos de 180 s del último ingreso no hay AURA, aunque el primer ingreso fuera hace 10 minutos", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started", from: "card" });
    avanzar(10 * MIN);
    // Sale y vuelve a entrar: la medicion arranca de nuevo.
    await postEvent(member.token, { type: "started", from: "push" });
    avanzar(60 * 1000);
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.allDone).toBe(true);
    expect(res.body.auraAwarded).toBe(false);
    expect(res.body.durationSeconds).toBeGreaterThanOrEqual(59);
    expect(res.body.durationSeconds).toBeLessThanOrEqual(61);
    expect(await auraStretch(member.id)).toHaveLength(0);

    const row = await offerRow(offerId);
    expect(row.startedFrom).toBe("card");
    expect(row.durationSeconds).toBe(res.body.durationSeconds);
  });

  it("(k3) started con la oferta completada no mueve started_at", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    const cierre = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
    });
    expect(cierre.body.auraAwarded).toBe(true);
    const antes = await offerRow(offerId);

    avanzar(MIN);
    expect((await postEvent(member.token, { type: "started" })).status).toBe(
      200,
    );
    const despues = await offerRow(offerId);
    expect(despues.startedAt?.getTime()).toBe(antes.startedAt?.getTime());
  });

  it("(l) push_opened pasada la medianoche marca la fila encolada de ayer; sin filas encoladas es un no-op", async () => {
    // Reloj a las 00:30 locales: el push se encoló ayer a las 23:50.
    const { member, date, tz } = await arrange({ clock: "00:30" });
    const ayer = shiftDate(date, -1);
    const offerId = await insertarOferta(member.id, ayer, {
      pushDecision: "queued",
      pushQueuedAt: localClock(tz, ayer, "23:50"),
    });

    const res = await postEvent(member.token, { type: "push_opened" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = await offerRow(offerId);
    expect(row.pushOpenedAt).not.toBeNull();
    expect(
      Math.abs((row.pushOpenedAt?.getTime() ?? 0) - Date.now()),
    ).toBeLessThanOrEqual(2000);

    // Segundo toque: la marca no se mueve.
    const marca = row.pushOpenedAt?.getTime();
    avanzar(10 * MIN);
    expect(
      (await postEvent(member.token, { type: "push_opened" })).status,
    ).toBe(200);
    expect((await offerRow(offerId)).pushOpenedAt?.getTime()).toBe(marca);

    // Un socio sin filas encoladas: 200 y nada que marcar.
    const otro = await createPresencialMember(app, { level: LEVEL });
    const vacio = await postEvent(otro.token, { type: "push_opened" });
    expect(vacio.status).toBe(200);
    expect(vacio.body.ok).toBe(true);
  });

  it("(m) las propiedades fuera del contrato se podan (removeAdditional): ni tenantId ni startedAt tienen efecto", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    // Fastify poda la clave ajena en vez de rechazarla: 200 y sin efecto.
    const evento = await postEvent(member.token, {
      type: "card_seen",
      tenantId: 2,
    });
    expect(evento.status).toBe(200);
    expect(evento.body.ok).toBe(true);
    const tras = await offerRow(offerId);
    expect(tras.cardSeenAt).not.toBeNull();
    expect(tras.tenantId).toBe(CTX_TEMPLO.tenantId);

    // Arranque real del servidor y 2 minutos despues. Un startedAt falso de hace
    // 10 minutos (que daria AURA si se respetara) se descarta: la duracion sale
    // de las marcas del servidor.
    await postEvent(member.token, { type: "started" });
    avanzar(2 * MIN);
    const cierre = await postComplete(member.token, {
      offerId,
      exercisesCompleted: ids,
      startedAt: new Date(Date.now() - 10 * MIN).toISOString(),
    });
    expect(cierre.status, JSON.stringify(cierre.body)).toBe(200);
    expect(cierre.body.durationSeconds).toBeGreaterThanOrEqual(119);
    expect(cierre.body.durationSeconds).toBeLessThanOrEqual(121);
    expect(cierre.body.auraAwarded).toBe(false);
    expect(await auraStretch(member.id)).toHaveLength(0);

    const row = await offerRow(offerId);
    expect(row.tenantId).toBe(CTX_TEMPLO.tenantId);
    expect(row.durationSeconds).toBe(cierre.body.durationSeconds);
  });

  it("(n) los ids que no son de la rutina se ignoran: no inflan allDone ni se guardan", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    // La rutina completa más un id ajeno: solo cuentan los de la rutina.
    const ajeno = Math.max(...ids) + 100_000;
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: [...ids, ids[0], ajeno],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.allDone).toBe(true);
    const row = await offerRow(offerId);
    expect(row.exercisesCompleted).toEqual(ids);
  });

  it("(o) un id ajeno no reemplaza a uno de la rutina: con uno faltante allDone sigue en false", async () => {
    const { member } = await arrange();
    const { offerId, ids } = await crearOferta(member.token);

    await postEvent(member.token, { type: "started" });
    avanzar(4 * MIN);
    const ajeno = Math.max(...ids) + 100_000;
    const res = await postComplete(member.token, {
      offerId,
      exercisesCompleted: [...ids.slice(0, -1), ajeno],
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.allDone).toBe(false);
    expect(res.body.auraAwarded).toBe(false);
    expect(await auraStretch(member.id)).toHaveLength(0);
  });

  it("(p) card_seen y started sin oferta del día responden 404 y no crean filas", async () => {
    const { member } = await arrange({ attend: false });

    expect((await postEvent(member.token, { type: "card_seen" })).status).toBe(
      404,
    );
    expect((await postEvent(member.token, { type: "started" })).status).toBe(
      404,
    );

    const filas = await app.db
      .select({ id: schema.stretchOffers.id })
      .from(schema.stretchOffers)
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_TEMPLO),
          eq(schema.stretchOffers.userId, member.id),
        ),
      );
    expect(filas).toHaveLength(0);
  });

  it("(q) sin token las dos rutas responden 401", async () => {
    const evento = await app.inject({
      method: "POST",
      url: "/api/sessions/stretch/events",
      payload: { type: "card_seen" },
    });
    expect(evento.statusCode).toBe(401);
    const cierre = await app.inject({
      method: "POST",
      url: "/api/sessions/stretch/complete",
      payload: { offerId: 1, exercisesCompleted: [] },
    });
    expect(cierre.statusCode).toBe(401);
  });
});
