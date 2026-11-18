/**
 * Fase 215 (plan 15; SC-6, D-17, D-19, D-22) — la push del regalo de Aura y su
 * llegada a la bandeja, de punta a punta:
 *   POST /api/members/aura/gifts        (regalo de alumno)
 *   POST /api/admin/aura/gifts          (regalo del profe)
 *   POST /api/admin/aura/gifts/:id/void (anular no avisa)
 *   GET  /api/members/notifications     (la bandeja del que recibe)
 *
 * Fechas relativas al día local de la sede y personas por fábrica (ningún id de
 * `users` hardcodeado). El barrido de la cola corre con un servicio en modo
 * `dryRun`: no habla con FCM. Corre en CI.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { NotificationService } from "../../src/modules/notifications/service";
import { queueGiftNotification } from "../../src/modules/aura/gift-push";
import { GIFT_ROUTE } from "../../src/modules/aura/gift-rules";
import {
  cleanupGiftClasses,
  GIFT_CTX,
  ledgerSum,
  seedAttendance,
  seedGiftClass,
  seedGiftPlan,
  seedMember,
  seedMemberWithPlan,
  type GiftClass,
  type GiftPerson,
} from "./_gift-fixtures";

const PASSWORD = "pass123456";
const STAFF_PASSWORD = "staff-pass-215";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "adminpass123";
const TOKEN_RECEPTOR = "fcm-gift-push-token-a-abcdef1234567890abcdef1234567890";
const TOKEN_DADOR = "fcm-gift-push-token-b-abcdef1234567890abcdef1234567890";

interface InboxGift {
  amount: number;
  giverKind: "alumno" | "profe";
  giverFirstName: string;
  giverLastInitial: string | null;
  status: "vigente" | "anulado";
}

interface InboxItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  gift: InboxGift | null;
}

interface InboxList {
  items: InboxItem[];
}

interface Dador extends GiftPerson {
  attendanceId: number;
}

interface Receptor extends GiftPerson {
  attendanceId: number;
}

describe("Fase 215-15: push del regalo y bandeja", () => {
  let app: FastifyInstance;
  let service: NotificationService;
  let planId: number;
  let cls: GiftClass;
  let staffSeq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    service = new NotificationService(app.db, app.log, true);
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    planId = await seedGiftPlan(app);
    cls = await seedGiftClass(app);
  });

  afterEach(async () => {
    await cleanAllTestData(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await cleanupGiftClasses(app, [cls]);
    await app.close();
  });

  // ── Siembra ────────────────────────────────────────────────────────────────

  /** Alumno con plan en vigor que fue a la clase (quien da el regalo). */
  async function dador(): Promise<Dador> {
    const person = await seedMemberWithPlan(app, {
      branchId: cls.branchId,
      planId,
      today: cls.today,
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
    });
    return { ...person, attendanceId };
  }

  /** Compañero (sin plan) con asistencia en la clase: quien recibe. */
  async function receptor(): Promise<Receptor> {
    const person = await seedMember(app, {
      branchId: cls.branchId,
      status: "activo",
      firstName: "Lucía",
      lastName: "Pereyra",
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
    });
    return { ...person, attendanceId };
  }

  async function profeToken(): Promise<string> {
    staffSeq += 1;
    const email = `profe-215-15-${staffSeq}-${Date.now().toString(36)}@test.com`;
    await createStaffUser(app, {
      email,
      password: STAFF_PASSWORD,
      firstName: "Fran",
      lastName: "Profesor",
      role: "coach",
      branchId: cls.branchId,
    });
    return getAuthToken(app, email, STAFF_PASSWORD);
  }

  async function darRegaloAlumno(
    g: Dador,
    r: Receptor,
    reason = "energia",
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/members/aura/gifts",
      headers: {
        authorization: `Bearer ${await getAuthToken(app, g.email, PASSWORD)}`,
      },
      payload: {
        attendanceId: g.attendanceId,
        receiverAttendanceId: r.attendanceId,
        reason,
      },
    });
    expect(res.statusCode).toBe(201);
    return idDelRegaloRecibidoPor(r.id);
  }

  async function darRegaloProfe(r: Receptor, reason = "energia") {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/aura/gifts",
      headers: { authorization: `Bearer ${await profeToken()}` },
      payload: { attendanceId: r.attendanceId, reason },
    });
    expect(res.statusCode).toBe(201);
    return idDelRegaloRecibidoPor(r.id);
  }

  async function idDelRegaloRecibidoPor(receiverId: number): Promise<number> {
    const [row] = await app.db
      .select({ id: schema.auraGifts.id })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.receiverUserId, receiverId),
        ),
      );
    return row.id;
  }

  async function anular(giftId: number): Promise<number> {
    const adminToken = await getAuthToken(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/aura/gifts/${giftId}/void`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return res.statusCode;
  }

  // ── Lecturas ───────────────────────────────────────────────────────────────

  async function colaDe(userId: number) {
    return app.db
      .select()
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, GIFT_CTX),
          eq(schema.pendingNotifications.userId, userId),
        ),
      )
      .orderBy(schema.pendingNotifications.id);
  }

  async function bandejaDe(userId: number) {
    return app.db
      .select()
      .from(schema.memberNotifications)
      .where(
        and(
          tenantWhere(schema.memberNotifications, GIFT_CTX),
          eq(schema.memberNotifications.userId, userId),
        ),
      )
      .orderBy(schema.memberNotifications.id);
  }

  /** `shown_at` es de segundos enteros: se espera para que el aviso ya se vea. */
  async function leerBandejaPorRuta(person: GiftPerson): Promise<InboxItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const res = await app.inject({
      method: "GET",
      url: "/api/members/notifications",
      headers: {
        authorization: `Bearer ${await getAuthToken(app, person.email, PASSWORD)}`,
      },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as InboxList).items;
  }

  // ── Casos ──────────────────────────────────────────────────────────────────

  it("(1) regalo de alumno: la cola lleva el texto, la ruta y el tipo; tras el barrido la bandeja lo trae como regalo vigente", async () => {
    const g = await dador();
    const r = await receptor();
    await service.registerToken(r.id, TOKEN_RECEPTOR, "android");

    const giftId = await darRegaloAlumno(g, r, "energia");

    const cola = await colaDe(r.id);
    expect(cola).toHaveLength(1);
    expect(cola[0].title).toBe("Sofía M. te dio Aura");
    expect(cola[0].body).toBe("Motivo: Buena energía.");
    expect(cola[0].route).toBe(GIFT_ROUTE);
    expect(cola[0].route).toBe("/mi-templo?aura=detalle");
    expect(cola[0].inboxKind).toBe("aura_gift");
    expect(cola[0].inboxRefId).toBe(giftId);

    await service.processQueue();

    const items = await leerBandejaPorRuta(r);
    const aviso = items.find((item) => item.kind === "aura_gift");
    expect(aviso).toBeDefined();
    expect(aviso?.title).toBe("Sofía M. te dio Aura");
    expect(aviso?.gift?.status).toBe("vigente");
    expect(aviso?.gift?.amount).toBe(1);
    expect(aviso?.gift?.giverKind).toBe("alumno");
  });

  it("(2) regalo del profe: título 'Tu profe Nombre te dio Aura' y regalo de tipo profe en la bandeja", async () => {
    const r = await receptor();
    await service.registerToken(r.id, TOKEN_RECEPTOR, "android");

    const giftId = await darRegaloProfe(r, "tecnica");

    const cola = await colaDe(r.id);
    expect(cola).toHaveLength(1);
    expect(cola[0].title).toBe("Tu profe Fran te dio Aura");
    expect(cola[0].body).toBe("Motivo: Buena técnica.");
    expect(cola[0].inboxKind).toBe("aura_gift");
    expect(cola[0].inboxRefId).toBe(giftId);

    await service.processQueue();

    const items = await leerBandejaPorRuta(r);
    const aviso = items.find((item) => item.kind === "aura_gift");
    expect(aviso?.gift?.giverKind).toBe("profe");
    expect(aviso?.gift?.status).toBe("vigente");
  });

  it("(3) receptor sin token: nada en la cola y UNA fila en la bandeja, con el regalo completo", async () => {
    const g = await dador();
    const r = await receptor();

    const giftId = await darRegaloAlumno(g, r, "energia");

    expect(await colaDe(r.id)).toHaveLength(0);
    const filas = await bandejaDe(r.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].kind).toBe("aura_gift");
    expect(filas[0].refId).toBe(giftId);
    expect(filas[0].pendingNotificationId).toBeNull();

    const items = await leerBandejaPorRuta(r);
    const aviso = items.find((item) => item.kind === "aura_gift");
    expect(aviso).toBeDefined();
    expect(aviso?.route).toBe(GIFT_ROUTE);
    expect(aviso?.gift).toMatchObject({
      amount: 1,
      giverKind: "alumno",
      status: "vigente",
    });
  });

  it("(4) con la categoría motivación apagada: ni push ni bandeja, pero el regalo y su Aura existen", async () => {
    const g = await dador();
    const r = await receptor();
    await service.registerToken(r.id, TOKEN_RECEPTOR, "android");
    await service.updatePreference(r.id, "motivacion", false);

    const giftId = await darRegaloAlumno(g, r, "energia");

    expect(await colaDe(r.id)).toHaveLength(0);
    expect(await bandejaDe(r.id)).toHaveLength(0);
    expect(giftId).toBeGreaterThan(0);
    expect(await ledgerSum(app, r.id)).toBe(1);
  });

  it("(5) anular el regalo no encola nada y la bandeja lo muestra anulado", async () => {
    const g = await dador();
    const r = await receptor();
    await service.registerToken(r.id, TOKEN_RECEPTOR, "android");
    const giftId = await darRegaloAlumno(g, r, "energia");
    await service.processQueue();
    const colaAntes = await colaDe(r.id);
    const bandejaAntes = await bandejaDe(r.id);

    expect(await anular(giftId)).toBe(204);

    expect(await colaDe(r.id)).toHaveLength(colaAntes.length);
    expect(await bandejaDe(r.id)).toHaveLength(bandejaAntes.length);
    const items = await leerBandejaPorRuta(r);
    const aviso = items.find((item) => item.kind === "aura_gift");
    expect(aviso?.gift?.status).toBe("anulado");
  });

  it("(6) ningún título ni cuerpo del aviso promete privacidad", async () => {
    const g = await dador();
    const r = await receptor();
    const r2 = await receptor();
    await service.registerToken(r.id, TOKEN_RECEPTOR, "android");

    await darRegaloAlumno(g, r, "energia");
    await darRegaloProfe(r2, "tecnica");

    const textos = [
      ...(await colaDe(r.id)),
      ...(await bandejaDe(r.id)),
      ...(await bandejaDe(r2.id)),
    ].flatMap((fila) => [fila.title, fila.body]);
    expect(textos.length).toBeGreaterThanOrEqual(4);
    for (const texto of textos) {
      expect(texto.toLowerCase()).not.toContain("privad");
    }
  });

  it("(7) el dador no recibe ningún aviso, ni de alumno ni de profe", async () => {
    const g = await dador();
    const r = await receptor();
    await service.registerToken(g.id, TOKEN_DADOR, "android");
    await service.registerToken(r.id, TOKEN_RECEPTOR, "android");

    await darRegaloAlumno(g, r, "energia");
    await service.processQueue();

    expect(await colaDe(g.id)).toHaveLength(0);
    expect(await bandejaDe(g.id)).toHaveLength(0);

    const r3 = await receptor();
    const giftProfeId = await darRegaloProfe(r3, "tecnica");
    const [regalo] = await app.db
      .select({ giverUserId: schema.auraGifts.giverUserId })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.id, giftProfeId),
        ),
      );
    expect(await colaDe(regalo.giverUserId)).toHaveLength(0);
    expect(await bandejaDe(regalo.giverUserId)).toHaveLength(0);
  });

  it("(8) receptor sin token: volver a encolar el mismo regalo no suma otra fila a la bandeja", async () => {
    const g = await dador();
    const r = await receptor();
    const giftId = await darRegaloAlumno(g, r, "energia");
    expect(await bandejaDe(r.id)).toHaveLength(1);

    await queueGiftNotification(
      service,
      GIFT_CTX,
      {
        giftId,
        receiverUserId: r.id,
        giverKind: "alumno",
        giverFirstName: "Sofía",
        giverLastInitial: "M",
        reason: "energia",
      },
      app.log,
    );

    const filas = await bandejaDe(r.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].refId).toBe(giftId);
  });

  it("(9) si encolar falla, queueGiftNotification no lanza", async () => {
    const roto = {
      queueAdHocNotification: async (): Promise<number> => {
        throw new Error("cola caída");
      },
    } as unknown as NotificationService;

    await expect(
      queueGiftNotification(
        roto,
        GIFT_CTX,
        {
          giftId: 1,
          receiverUserId: 1,
          giverKind: "profe",
          giverFirstName: "Fran",
          giverLastInitial: null,
          reason: "energia",
        },
        app.log,
      ),
    ).resolves.toBeUndefined();
  });
});
