/**
 * Fase 215, plan 13 — escritura de la bandeja de avisos (`member_notifications`).
 *
 * Cubre el lado escritura de D-17 y D-18:
 * - el barrido de la cola (`processQueue`) guarda cada aviso, una sola vez;
 * - quien no tiene push guarda igual sus avisos personales desde la hora
 *   programada, y un job que los vuelve a pedir en cada tick deja UNA fila;
 * - cada aviso lleva su tipo (categoría de la plantilla, del aviso suelto o
 *   `aura_gift` con el id del regalo);
 * - abrir la push marca leído el aviso, y la purga borra lo de más de 90 días.
 *
 * Corre en CI (la suite de integración no corre en local).
 */
process.env.DRY_RUN = "true";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, createTestMember, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import type { TenantContext } from "../../src/modules/shared/tenant";
import { NotificationService } from "../../src/modules/notifications/service";
import type { Destination } from "../../src/modules/communications";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_A = "fcm-inbox-queue-token-a-abcdef1234567890abcdef1234567890";
const TOKEN_B = "fcm-inbox-queue-token-b-abcdef1234567890abcdef1234567890";

describe("Bandeja de avisos — escritura (fase 215, plan 13)", () => {
  let app: FastifyInstance;
  let service: NotificationService;
  let memberId: number;
  let memberToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    service = new NotificationService(app.db, app.log, true);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await service.seedTemplates(CTX);
    const member = await createTestMember(app);
    memberId = member.id;
    memberToken = member.token;
  });

  /** Filas de la bandeja de una persona de El Templo, de la más vieja a la más nueva. */
  async function inboxRows(userId: number, ctx: TenantContext = CTX) {
    return app.db
      .select()
      .from(schema.memberNotifications)
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.userId, userId),
        ),
      )
      .orderBy(schema.memberNotifications.id);
  }

  async function pendingRow(id: number) {
    const [row] = await app.db
      .select()
      .from(schema.pendingNotifications)
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, id),
        ),
      );
    return row;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Con push: el barrido guarda el aviso
  // ─────────────────────────────────────────────────────────────────────────

  it("(1) un aviso suelto encolado a quien tiene token queda en la bandeja tras el barrido", async () => {
    await service.registerToken(memberId, TOKEN_A, "android");

    const id = await service.queueAdHocNotification(
      {
        userId: memberId,
        title: "Título de prueba",
        body: "Cuerpo de prueba",
        category: "anuncios",
        route: "/reservas",
      },
      CTX,
    );
    expect(id).toBeGreaterThan(0);
    // Antes del barrido la bandeja todavía no tiene el aviso.
    expect(await inboxRows(memberId)).toHaveLength(0);

    await service.processQueue();

    const rows = await inboxRows(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Título de prueba");
    expect(rows[0].body).toBe("Cuerpo de prueba");
    expect(rows[0].route).toBe("/reservas");
    expect(rows[0].kind).toBe("anuncios");
    expect(rows[0].pendingNotificationId).toBe(id);
    expect(rows[0].dedupeKey).toBeNull();
    expect(rows[0].readAt).toBeNull();
    expect(rows[0].tenantId).toBe(TENANT_TEMPLO);
  });

  it("(2) correr el barrido dos veces sobre la misma fila no duplica el aviso", async () => {
    await service.registerToken(memberId, TOKEN_A, "android");
    const id = await service.queueAdHocNotification(
      {
        userId: memberId,
        title: "Una sola vez",
        body: "No se duplica",
        category: "anuncios",
      },
      CTX,
    );
    expect(id).toBeGreaterThan(0);

    await service.processQueue();

    // Se fuerza la fila otra vez a `pending`, como si el barrido reintentara.
    await app.db
      .update(schema.pendingNotifications)
      .set({ status: "pending" })
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, id),
        ),
      );
    await service.processQueue();

    expect(await inboxRows(memberId)).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sin push: el aviso se guarda directo, una sola vez
  // ─────────────────────────────────────────────────────────────────────────

  it("(3) sin token: el aviso suelto devuelve -1 y queda en la bandeja desde la hora programada", async () => {
    // Sin milisegundos: la columna TIMESTAMP los descarta.
    const scheduledAt = new Date(
      Math.floor(Date.now() / 1000) * 1000 + 60 * 60 * 1000,
    );

    const id = await service.queueAdHocNotification(
      {
        userId: memberId,
        title: "Sin push",
        body: "Igual lo ves en la bandeja",
        category: "anuncios",
        scheduledAt,
      },
      CTX,
    );
    expect(id).toBe(-1);

    const rows = await inboxRows(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].pendingNotificationId).toBeNull();
    expect(rows[0].dedupeKey).not.toBeNull();
    expect(rows[0].shownAt.getTime()).toBe(scheduledAt.getTime());
    expect(rows[0].kind).toBe("anuncios");
    expect(rows[0].title).toBe("Sin push");
  });

  it("(4) sin token: la misma plantilla y la misma reserva pedidas en dos ticks dejan UNA fila", async () => {
    const first = await service.queueNotification({
      userId: memberId,
      templateKey: "class_reminder",
      bookingId: 777001,
      titleOverride: "Tu clase arranca a las 19:00",
    });
    // Cinco minutos después, otro tick del job: mismo `bookingId`, otra hora.
    const second = await service.queueNotification({
      userId: memberId,
      templateKey: "class_reminder",
      bookingId: 777001,
      titleOverride: "Tu clase arranca a las 19:00",
      scheduledAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    expect(first).toBe(-1);
    expect(second).toBe(-1);

    const rows = await inboxRows(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("entrenamiento");
    expect(rows[0].title).toBe("Tu clase arranca a las 19:00");
    expect(rows[0].pendingNotificationId).toBeNull();

    // Otra reserva de la misma persona sí es otro aviso.
    await service.queueNotification({
      userId: memberId,
      templateKey: "class_reminder",
      bookingId: 777002,
    });
    expect(await inboxRows(memberId)).toHaveLength(2);
  });

  it("(5) sin token: mismo tipo y referencia = una fila, y avisos del mismo día con otro título = filas distintas", async () => {
    const input = {
      userId: memberId,
      title: "Te regalaron Aura",
      body: "Alguien te dio 1 de Aura",
      category: "anuncios" as const,
      inboxKind: "aura_gift",
      inboxRefId: 4242,
    };
    expect(await service.queueAdHocNotification(input, CTX)).toBe(-1);
    // El job reintenta (y hasta cambia el texto): la referencia manda.
    expect(
      await service.queueAdHocNotification(
        { ...input, body: "Otro texto del mismo regalo" },
        CTX,
      ),
    ).toBe(-1);
    expect(await inboxRows(memberId)).toHaveLength(1);

    // Sin referencia, la clave es por día y por texto.
    const base = {
      userId: memberId,
      category: "motivacion" as const,
      body: "Cuerpo",
    };
    await service.queueAdHocNotification({ ...base, title: "Uno" }, CTX);
    await service.queueAdHocNotification({ ...base, title: "Dos" }, CTX);
    await service.queueAdHocNotification({ ...base, title: "Dos" }, CTX);

    const rows = await inboxRows(memberId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.kind === "motivacion")).toHaveLength(2);
  });

  it("(6) categoría silenciada en preferencias: ni cola ni bandeja", async () => {
    await service.updatePreference(memberId, "entrenamiento", false);
    await service.updatePreference(memberId, "anuncios", false);

    // Sin token, que sería el camino que guarda directo si no estuviera silenciada.
    const a = await service.queueNotification({
      userId: memberId,
      templateKey: "morning_energy",
    });
    const b = await service.queueAdHocNotification(
      {
        userId: memberId,
        title: "Silenciado",
        body: "No debe guardarse",
        category: "anuncios",
      },
      CTX,
    );
    expect(a).toBe(-1);
    expect(b).toBe(-1);
    expect(await inboxRows(memberId)).toHaveLength(0);

    // Con token tampoco: no se encola, así que el barrido no tiene qué guardar.
    await service.registerToken(memberId, TOKEN_A, "android");
    expect(
      await service.queueNotification({
        userId: memberId,
        templateKey: "morning_energy",
      }),
    ).toBe(-1);
    await service.processQueue();
    expect(await inboxRows(memberId)).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tipo de aviso
  // ─────────────────────────────────────────────────────────────────────────

  it("(7) una plantilla guarda como tipo su categoría, con y sin push", async () => {
    // Sin push: directo.
    await service.queueNotification({
      userId: memberId,
      templateKey: "weekly_summary",
    });
    // Con push: por el barrido.
    await service.registerToken(memberId, TOKEN_A, "android");
    const id = await service.queueNotification({
      userId: memberId,
      templateKey: "plan_loaded",
    });
    expect(id).toBeGreaterThan(0);
    expect((await pendingRow(id)).inboxKind).toBe("planes");

    await service.processQueue();

    const rows = await inboxRows(memberId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.pendingNotificationId === null)?.kind).toBe(
      "entrenamiento",
    );
    expect(rows.find((r) => r.pendingNotificationId === id)?.kind).toBe(
      "planes",
    );
  });

  it("(7b) una fila vieja de la cola sin tipo toma la categoría de su plantilla en el barrido", async () => {
    await service.registerToken(memberId, TOKEN_A, "android");
    const id = await service.queueNotification({
      userId: memberId,
      templateKey: "program_enrollment",
    });
    // Como si se hubiera encolado antes de la fase 215.
    await app.db
      .update(schema.pendingNotifications)
      .set({ inboxKind: null })
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX),
          eq(schema.pendingNotifications.id, id),
        ),
      );

    await service.processQueue();

    const rows = await inboxRows(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("programas");
  });

  it("(8) `aura_gift` y su id llegan a la bandeja, con push (tras el barrido) y sin push (directo)", async () => {
    const other = await createTestMember(app);

    // Con push.
    await service.registerToken(memberId, TOKEN_A, "android");
    const id = await service.queueAdHocNotification(
      {
        userId: memberId,
        title: "Regalo",
        body: "Con push",
        category: "anuncios",
        inboxKind: "aura_gift",
        inboxRefId: 91,
      },
      CTX,
    );
    expect(id).toBeGreaterThan(0);
    await service.processQueue();

    // Sin push.
    await service.queueAdHocNotification(
      {
        userId: other.id,
        title: "Regalo",
        body: "Sin push",
        category: "anuncios",
        inboxKind: "aura_gift",
        inboxRefId: 92,
      },
      CTX,
    );

    const withPush = await inboxRows(memberId);
    expect(withPush).toHaveLength(1);
    expect(withPush[0].kind).toBe("aura_gift");
    expect(withPush[0].refId).toBe(91);

    const withoutPush = await inboxRows(other.id);
    expect(withoutPush).toHaveLength(1);
    expect(withoutPush[0].kind).toBe("aura_gift");
    expect(withoutPush[0].refId).toBe(92);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lo que NO entra
  // ─────────────────────────────────────────────────────────────────────────

  it("(9) sendTestNotification (prueba del admin) no deja fila en la bandeja", async () => {
    await service.registerToken(memberId, TOKEN_A, "android");
    const destination: Destination = {
      type: "app_section",
      section: null,
      whatsappText: null,
    };

    const result = await service.sendTestNotification(
      {
        userId: memberId,
        title: "Prueba del editor",
        body: "No es un aviso del alumno",
        destination,
      },
      CTX,
    );
    expect(result.status).toBe("sent");

    // La fila de la cola nace `sent`: el barrido no la ve, y aun así se revisa.
    await service.processQueue();
    expect(await inboxRows(memberId)).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Abrir la push y purga
  // ─────────────────────────────────────────────────────────────────────────

  it("(10) POST /api/notifications/:id/opened marca leído su aviso, y solo si es de quien abre", async () => {
    const intruder = await createTestMember(app);
    await service.registerToken(memberId, TOKEN_A, "android");
    const id = await service.queueAdHocNotification(
      {
        userId: memberId,
        title: "Para abrir",
        body: "Marcar leído",
        category: "anuncios",
      },
      CTX,
    );
    await service.processQueue();
    expect((await inboxRows(memberId))[0].readAt).toBeNull();

    // Otra persona manda el mismo id: no toca el aviso ajeno (T-215-13-02).
    const foreign = await app.inject({
      method: "POST",
      url: `/api/notifications/${id}/opened`,
      headers: { authorization: `Bearer ${intruder.token}` },
    });
    expect(foreign.statusCode).toBe(200);
    expect((await inboxRows(memberId))[0].readAt).toBeNull();

    const own = await app.inject({
      method: "POST",
      url: `/api/notifications/${id}/opened`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(own.statusCode).toBe(200);
    const [row] = await inboxRows(memberId);
    expect(row.readAt).not.toBeNull();
  });

  it("(11) la purga borra un aviso de 91 días y deja el de 89", async () => {
    const insertAt = async (key: string, ageDays: number) => {
      await app.db.insert(schema.memberNotifications).values(
        tenantValues(CTX, {
          userId: memberId,
          pendingNotificationId: null,
          dedupeKey: key,
          kind: "anuncios",
          title: key,
          body: "Cuerpo",
          route: "/mi-templo",
          shownAt: new Date(Date.now() - ageDays * DAY_MS),
        }),
      );
    };
    await insertAt("viejo-91", 91);
    await insertAt("reciente-89", 89);

    const deleted = await service.purgeOldInbox();
    expect(deleted).toBeGreaterThanOrEqual(1);

    const rows = await inboxRows(memberId);
    expect(rows.map((r) => r.title)).toEqual(["reciente-89"]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gimnasio 2
  // ─────────────────────────────────────────────────────────────────────────

  it("(12) la fila de una persona del gimnasio 2 lleva el tenant del gimnasio 2", async () => {
    const dos: TenantContext = { tenantId: TENANT_DOS };
    const gym2 = await seedSecondTenant(app);
    try {
      await service.seedTemplates(dos);
      const socio = gym2.socios[0];

      // Con push: el barrido copia el tenant de la fila de la cola.
      await service.registerToken(socio.id, TOKEN_B, "android");
      const id = await service.queueAdHocNotification(
        {
          userId: socio.id,
          title: "Aviso del gimnasio 2",
          body: "Con push",
          category: "anuncios",
        },
        dos,
      );
      expect(id).toBeGreaterThan(0);
      await service.processQueue();

      // Sin push: el aviso directo usa el ctx del destinatario.
      const otherSocio = gym2.socios[1];
      await service.queueAdHocNotification(
        {
          userId: otherSocio.id,
          title: "Aviso del gimnasio 2",
          body: "Sin push",
          category: "anuncios",
        },
        dos,
      );

      const withPush = await inboxRows(socio.id, dos);
      expect(withPush).toHaveLength(1);
      expect(withPush[0].tenantId).toBe(TENANT_DOS);

      const withoutPush = await inboxRows(otherSocio.id, dos);
      expect(withoutPush).toHaveLength(1);
      expect(withoutPush[0].tenantId).toBe(TENANT_DOS);

      // Nada se coló en El Templo.
      expect(await inboxRows(socio.id, CTX)).toHaveLength(0);
      expect(await inboxRows(otherSocio.id, CTX)).toHaveLength(0);
    } finally {
      // `limpiarSegundoGimnasio` no conoce las filas que crea este test.
      await app.db
        .delete(schema.memberNotifications)
        .where(tenantWhere(schema.memberNotifications, dos));
      await app.db
        .delete(schema.pendingNotifications)
        .where(tenantWhere(schema.pendingNotifications, dos));
      await app.db
        .delete(schema.deviceTokens)
        .where(tenantWhere(schema.deviceTokens, dos));
      await app.db
        .delete(schema.notificationTemplates)
        .where(tenantWhere(schema.notificationTemplates, dos));
      await limpiarSegundoGimnasio(app);
    }
  });
});
