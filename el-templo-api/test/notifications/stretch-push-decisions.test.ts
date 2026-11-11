/**
 * Fase 213 Plan 07 (SC-5, SC-7, SC-8, SC-9, D-11, D-12, D-13, D-15): motivos de
 * no envío, tope y pausa, segundo gimnasio y reconciliación del push
 * "¿Estiraste?" (SPEC 5.2, parte 2).
 *
 * Mismo armado que `stretch-push-timing.test.ts`: se llama al paso del cron
 * directo con el reloj INYECTADO (`localClock` sobre el último miércoles de la
 * sede, calculado desde `Date.now()`), sin fechas de calendario fijas ni ids de
 * usuario fijos. Clase 20:00-21:00 y socio `push_60` salvo que se diga otra
 * cosa: el push sale a las 21:30 (tope).
 *
 * La historia de los casos de tope y pausa se escribe con fechas RELATIVAS al
 * día del caso (`shiftDate(date, -n)`) y `push_queued_at` a las 21:30 de ese día.
 *
 * El segundo gimnasio sigue el armado de `test/tenancy/iso-03-stretch.test.ts`:
 * `sessions.day_id` es UNIQUE global, así que las dos sesiones del mismo día se
 * separan por nivel (El Templo `sigma`, gimnasio 2 `alfa`).
 */
process.env.DRY_RUN = "true";

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
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { shiftDate } from "../../src/modules/shared/week-dates";
import { restoreTemploFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
import { AuraService } from "../../src/modules/aura/service";
import {
  StretchService,
  type EligibleAttendance,
} from "../../src/modules/sessions/stretch-service";
import { runStretchPushForTenant } from "../../src/modules/sessions/stretch-push";
import {
  AR_TZ,
  BLOQUES_REGULAR,
  BRANCH_ID,
  DOW,
  LEVEL,
  addDeviceToken,
  arrangeStretchScenario,
  createMemberWithArm,
  insertOfferHistory,
  localClock,
  prepareStretchTemplate,
  readStretchOffers,
  seedAttendance,
  seedClass,
  seedStretchCatalog,
  seedStretchSession,
  stretchPendingRows,
  type Arranged,
  type ArrangeOpts,
} from "../sessions/_stretch-fixtures";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };
const LEVEL_DOS = "alfa";

describe("push ¿Estiraste?: motivos, tope, segundo gimnasio y reconciliación (213-07, SPEC 5.2 parte 2)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.db
      .update(schema.branches)
      .set({ timezone: AR_TZ })
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    await cleanAllTestData(app);
    // Idempotente: el caso del segundo gimnasio ya lo limpia en su `finally`.
    await limpiarSegundoGimnasio(app);
    await restoreTemploFlags(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await restoreTemploFlags(app);
    await prepareStretchTemplate(app);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Escenario del día con token del socio (clase 20-21, `push_60`). */
  async function arrange(opts: ArrangeOpts = {}): Promise<Arranged> {
    const scenario = await arrangeStretchScenario(app, {
      arm: "push_60",
      ...opts,
    });
    await addDeviceToken(app, scenario.member.id);
    return scenario;
  }

  function tick(now: Date, ctx: TenantContext = CTX_TEMPLO) {
    return runStretchPushForTenant(app.db, ctx, app.log, now);
  }

  function at(date: string, hhmm: string): Date {
    return localClock(AR_TZ, date, hhmm);
  }

  async function onlyOffer(userId: number) {
    const rows = await readStretchOffers(app, userId);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  function stretchService(): StretchService {
    return new StretchService(app.db, app.log, new AuraService(app.db));
  }

  /** Historia: una fila encolada hace `daysAgo` días (a las 21:30 de ese día). */
  async function addHistory(
    userId: number,
    date: string,
    daysAgo: number,
    openedAt: Date | null = null,
  ): Promise<void> {
    const localDate = shiftDate(date, -daysAgo);
    await insertOfferHistory(app, {
      userId,
      branchId: BRANCH_ID,
      localDate,
      queuedAt: at(localDate, "21:30"),
      openedAt,
    });
  }

  // ─── motivos de no envío ───────────────────────────────────────────────

  it("(1) sin token: fila con sin_token, sin push, y la card sigue ofreciendo", async () => {
    // Sin `addDeviceToken`: el escenario directo no registra token.
    const { date, member } = await arrangeStretchScenario(app, {
      arm: "push_60",
    });

    const now = at(date, "21:30");
    const result = await tick(now);
    expect(result.queued).toBe(0);
    expect(result.decided.sin_token).toBe(1);
    expect((await onlyOffer(member.id)).pushDecision).toBe("sin_token");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
    expect(
      (await stretchService().getToday(CTX_TEMPLO, member.id, now)).status,
    ).toBe("available");
  });

  it("(2) categoría entrenamiento apagada: categoria_apagada y sin push", async () => {
    const { date, member } = await arrange();
    await app.db.insert(schema.notificationPreferences).values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        category: "entrenamiento" as const,
        enabled: false,
      }),
    );

    const result = await tick(at(date, "21:30"));
    expect(result.decided.categoria_apagada).toBe(1);
    expect((await onlyOffer(member.id)).pushDecision).toBe("categoria_apagada");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(3a) started_at seteado por POST /stretch/events antes del tick: ya_empezo y sin push", async () => {
    const { date, member } = await arrange();

    // La fila nace con la oferta (el push de las 21:30 todavía no salió).
    await tick(at(date, "21:10"));
    expect((await onlyOffer(member.id)).pushDecision).toBeNull();

    // El socio abre la card y arranca por su cuenta: el reloj del servidor
    // (que usa la ruta) se mueve a las 21:15.
    vi.setSystemTime(at(date, "21:15"));
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/stretch/events",
      headers: { authorization: `Bearer ${member.token}` },
      payload: { type: "started", from: "card" },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((await onlyOffer(member.id)).startedAt).not.toBeNull();

    const result = await tick(at(date, "21:30"));
    expect(result.decided.ya_empezo).toBe(1);
    expect((await onlyOffer(member.id)).pushDecision).toBe("ya_empezo");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(3b) completed_at seteado antes del tick: ya_empezo y sin push", async () => {
    const { date, member } = await arrange();

    await tick(at(date, "21:10"));
    const offer = await onlyOffer(member.id);
    await app.db
      .update(schema.stretchOffers)
      .set({ completedAt: at(date, "21:20") })
      .where(
        and(
          tenantWhere(schema.stretchOffers, CTX_TEMPLO),
          eq(schema.stretchOffers.id, offer.id),
        ),
      );

    const result = await tick(at(date, "21:30"));
    expect(result.decided.ya_empezo).toBe(1);
    expect((await onlyOffer(member.id)).pushDecision).toBe("ya_empezo");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(4) plantilla apagada: plantilla_apagada, sin push, y la card sigue ofreciendo", async () => {
    await prepareStretchTemplate(app, { enabled: false });
    const { date, member } = await arrange();

    const now = at(date, "21:30");
    const result = await tick(now);
    expect(result.decided.plantilla_apagada).toBe(1);
    expect((await onlyOffer(member.id)).pushDecision).toBe("plantilla_apagada");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
    expect(
      (await stretchService().getToday(CTX_TEMPLO, member.id, now)).status,
    ).toBe("available");
  });

  it("(4b) el staff edita la plantilla: el push sale con el texto editado (D-12)", async () => {
    const { date, member } = await arrange();
    await app.db
      .update(schema.notificationTemplates)
      .set({ title: "Título editado", body: "Cuerpo editado por el staff" })
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX_TEMPLO),
          eq(schema.notificationTemplates.templateKey, "stretch_followup"),
        ),
      );

    await tick(at(date, "21:30"));
    const rows = await stretchPendingRows(app, member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Título editado");
    expect(rows[0]!.body).toBe("Cuerpo editado por el staff");
  });

  // ─── tope semanal y pausa ──────────────────────────────────────────────

  it("(5) tope: con 3 pushes encolados en los últimos 6 días, el de hoy queda como tope_semanal", async () => {
    const { date, member } = await arrange();
    for (const daysAgo of [1, 2, 3]) await addHistory(member.id, date, daysAgo);

    const result = await tick(at(date, "21:30"));
    expect(result.decided.tope_semanal).toBe(1);
    const offers = await readStretchOffers(app, member.id);
    expect(offers.find((o) => o.localDate === date)?.pushDecision).toBe(
      "tope_semanal",
    );
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(5b) tope: con solo 2 pushes en los últimos 6 días el de hoy sale", async () => {
    const { date, member } = await arrange();
    for (const daysAgo of [1, 2]) await addHistory(member.id, date, daysAgo);
    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  it("(5c) tope: 3 pushes de hace 7 días o más ya no cuentan en la ventana de 7 días", async () => {
    const { date, member } = await arrange();
    // Abiertos, para que tampoco dispare la pausa por 4 sin abrir.
    for (const daysAgo of [7, 8, 9]) {
      await addHistory(member.id, date, daysAgo, at(date, "09:00"));
    }

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
  });

  it("(6a) pausa: 4 sin abrir (hace 3, 5, 9 y 12 días) -> pausa_sin_abrir exacta, no el tope", async () => {
    const { date, member } = await arrange();
    // Solo 2 caen dentro de los 7 días (3 y 5): el tope de 3 en 7 no tapa la pausa.
    for (const daysAgo of [3, 5, 9, 12])
      await addHistory(member.id, date, daysAgo);

    const result = await tick(at(date, "21:30"));
    expect(result.decided.pausa_sin_abrir).toBe(1);
    const offers = await readStretchOffers(app, member.id);
    expect(offers.find((o) => o.localDate === date)?.pushDecision).toBe(
      "pausa_sin_abrir",
    );
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(6b) pausa vencida: las mismas 4 corridas hace 15, 17, 20 y 23 días -> queued", async () => {
    const { date, member } = await arrange();
    for (const daysAgo of [15, 17, 20, 23]) {
      await addHistory(member.id, date, daysAgo);
    }

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
    const offers = await readStretchOffers(app, member.id);
    expect(offers.find((o) => o.localDate === date)?.pushDecision).toBe(
      "queued",
    );
  });

  // ─── reconciliación de push_sent_at ────────────────────────────────────

  it("(7a) reconciliación: la fila de la cola pasa a sent y la oferta guarda push_sent_at", async () => {
    const { date, member } = await arrange();
    const queued = await tick(at(date, "21:30"));
    expect(queued.queued).toBe(1);
    const offer = await onlyOffer(member.id);
    expect(offer.pushSentAt).toBeNull();

    const sentAt = at(date, "21:31");
    await app.db
      .update(schema.pendingNotifications)
      .set({ status: "sent", sentAt })
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX_TEMPLO),
          eq(schema.pendingNotifications.id, offer.pendingNotificationId ?? -1),
        ),
      );

    const result = await tick(at(date, "21:35"));
    expect(result.reconciled).toBe(1);
    const after = await onlyOffer(member.id);
    expect(after.pushDecision).toBe("queued");
    expect(after.pushSentAt?.getTime()).toBe(sentAt.getTime());

    // Un tick más no la vuelve a tocar.
    const again = await tick(at(date, "21:40"));
    expect(again.reconciled).toBe(0);
  });

  it("(7b) reconciliación: la fila de la cola pasa a failed y la oferta queda en fallo_envio", async () => {
    const { date, member } = await arrange();
    await tick(at(date, "21:30"));
    const offer = await onlyOffer(member.id);

    await app.db
      .update(schema.pendingNotifications)
      .set({ status: "failed", errorMessage: "FCM no disponible" })
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX_TEMPLO),
          eq(schema.pendingNotifications.id, offer.pendingNotificationId ?? -1),
        ),
      );

    const result = await tick(at(date, "21:35"));
    expect(result.reconciled).toBe(1);
    const after = await onlyOffer(member.id);
    expect(after.pushDecision).toBe("fallo_envio");
    expect(after.pushSentAt).toBeNull();
  });

  it("(7c) reconciliación: con la fila de la cola purgada o todavía pending no cambia nada", async () => {
    const { date, member } = await arrange();
    await tick(at(date, "21:30"));
    const offer = await onlyOffer(member.id);

    // Todavía pending: nada.
    const waiting = await tick(at(date, "21:35"));
    expect(waiting.reconciled).toBe(0);

    // Purgada: nada, y sin error.
    await app.db
      .delete(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX_TEMPLO),
          eq(schema.pendingNotifications.id, offer.pendingNotificationId ?? -1),
        ),
      );
    const purged = await tick(at(date, "21:40"));
    expect(purged.reconciled).toBe(0);
    expect(purged.failed).toBe(0);
    const after = await onlyOffer(member.id);
    expect(after.pushDecision).toBe("queued");
    expect(after.pushSentAt).toBeNull();
  });

  // ─── segundo gimnasio sin el módulo (D-13) ─────────────────────────────

  it("(8) gimnasio sin templo-training: ni filas ni pushes aunque El Templo lo tenga andando", async () => {
    await seedSecondTenant(app);
    try {
      // El Templo: escenario completo y push_60 con token.
      const templo = await arrange();
      const { date } = templo;

      // Gimnasio 2: catálogo, socio push_60 (alfa), sesión del mismo día con
      // otro nivel, clase, asistencia, token y plantilla prendida.
      const [branchDos] = await app.db
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(tenantWhere(schema.branches, CTX_DOS))
        .limit(1);
      const branchDosId = branchDos!.id;
      // La sede del gimnasio 2 en la misma zona que la de El Templo.
      await app.db
        .update(schema.branches)
        .set({ timezone: AR_TZ })
        .where(
          and(
            tenantWhere(schema.branches, CTX_DOS),
            eq(schema.branches.id, branchDosId),
          ),
        );
      await seedStretchCatalog(app, CTX_DOS);
      const socioDos = await createMemberWithArm(app, "push_60", {
        level: LEVEL_DOS,
        ctx: CTX_DOS,
        branchId: branchDosId,
      });
      await seedStretchSession(app, {
        date,
        level: LEVEL_DOS,
        mode: "regular",
        blocks: BLOQUES_REGULAR,
        ctx: CTX_DOS,
      });
      const { scheduleId } = await seedClass(app, {
        branchId: branchDosId,
        dayOfWeek: DOW.miercoles,
        startTime: "20:00",
        endTime: "21:00",
        ctx: CTX_DOS,
      });
      await seedAttendance(app, {
        memberId: socioDos.id,
        branchId: branchDosId,
        scheduleId,
        sessionDate: date,
        ctx: CTX_DOS,
      });
      await addDeviceToken(app, socioDos.id, CTX_DOS);
      await prepareStretchTemplate(app, { ctx: CTX_DOS });

      const now = at(date, "21:30");

      // Sin el módulo (fail-closed): el gimnasio 2 no genera nada.
      const dosSinModulo = await tick(now, CTX_DOS);
      expect(dosSinModulo.offers).toBe(0);
      expect(dosSinModulo.queued).toBe(0);
      expect(await readStretchOffers(app, socioDos.id, CTX_DOS)).toHaveLength(
        0,
      );
      expect(await stretchPendingRows(app, socioDos.id, CTX_DOS)).toHaveLength(
        0,
      );

      // En el mismo test, El Templo sí encola.
      const conModulo = await tick(now, CTX_TEMPLO);
      expect(conModulo.queued).toBe(1);
      expect(await stretchPendingRows(app, templo.member.id)).toHaveLength(1);

      // Control positivo: con el módulo prendido el MISMO escenario del
      // gimnasio 2 encola, así que el cero de arriba es del módulo y no de un
      // dato que faltaba.
      await setModuleFlag(app, TENANT_DOS, "templo-training", true);
      const dosConModulo = await tick(now, CTX_DOS);
      expect(dosConModulo.queued).toBe(1);
      const filasDos = await readStretchOffers(app, socioDos.id, CTX_DOS);
      expect(filasDos).toHaveLength(1);
      expect(filasDos[0]!.tenantId).toBe(TENANT_DOS);
      expect(await stretchPendingRows(app, socioDos.id, CTX_DOS)).toHaveLength(
        1,
      );
      // Y nada se mezcló: El Templo sigue con su única fila y su único push.
      expect(await readStretchOffers(app, templo.member.id)).toHaveLength(1);
      expect(await stretchPendingRows(app, templo.member.id)).toHaveLength(1);
    } finally {
      // Lo que crea este caso en el gimnasio 2 no lo conoce `limpiarSegundoGimnasio`
      // (asistencia, sesiones, ejercicios, suscripciones, cola, tokens y
      // plantillas): `cleanAllTestData` lo vacía antes de borrar el gimnasio.
      await cleanAllTestData(app);
      await limpiarSegundoGimnasio(app);
    }
  });

  // ─── un candidato que falla no frena a los demás ───────────────────────

  it("(9a) una excepción en un candidato no impide que otro socio del mismo tick encole", async () => {
    const { date, member: socioA, scheduleId } = await arrange();
    const socioB = await createMemberWithArm(app, "push_60", { level: LEVEL });
    await addDeviceToken(app, socioB.id);
    await seedAttendance(app, {
      memberId: socioB.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: date,
    });

    const original = StretchService.prototype.ensureOffer;
    const spy = vi
      .spyOn(StretchService.prototype, "ensureOffer")
      .mockImplementation(async function (
        this: StretchService,
        ctx: TenantContext,
        att: EligibleAttendance,
        now: Date,
      ) {
        if (att.userId === socioA.id) throw new Error("fallo forzado");
        return original.call(this, ctx, att, now);
      });
    try {
      const result = await tick(at(date, "21:30"));
      expect(result.failed).toBe(1);
      expect(result.queued).toBe(1);
    } finally {
      spy.mockRestore();
    }

    expect(await stretchPendingRows(app, socioA.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, socioB.id)).toHaveLength(1);
  });

  it("(9b) un socio sin rutina (sin sesión de su nivel) no impide que otro encole", async () => {
    const { date, member, scheduleId } = await arrange();
    // Sin sesión aprobada de nivel `alfa` en El Templo: `ensureOffer` da null.
    const sinRutina = await createMemberWithArm(app, "push_60", {
      level: LEVEL_DOS,
    });
    await addDeviceToken(app, sinRutina.id);
    await seedAttendance(app, {
      memberId: sinRutina.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: date,
    });

    const result = await tick(at(date, "21:30"));
    expect(result.skipped.sin_rutina).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.queued).toBe(1);
    expect(await readStretchOffers(app, sinRutina.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  // ─── una decisión por día ──────────────────────────────────────────────

  it("(10) una fila ya decidida (sin_token) no cambia aunque el socio registre un token después", async () => {
    const { date, member } = await arrangeStretchScenario(app, {
      arm: "push_60",
    });

    await tick(at(date, "21:30"));
    expect((await onlyOffer(member.id)).pushDecision).toBe("sin_token");

    await addDeviceToken(app, member.id);
    const result = await tick(at(date, "21:35"));
    expect(result.queued).toBe(0);
    expect((await onlyOffer(member.id)).pushDecision).toBe("sin_token");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });
});
