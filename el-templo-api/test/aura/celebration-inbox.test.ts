/**
 * La Aura celebrada en pantalla también queda en Notificaciones (2026-11-20).
 *
 * Al consultar `GET /api/members/aura/celebration` lo pendiente de celebrar se
 * guarda en la bandeja (`member_notifications`, tipo `aura`), sin push. El
 * `ack` lo marca leído. No entran asistencia, estiramiento, bloque libre,
 * regalos ni antigüedad (los dos últimos ya dejan su propio aviso), ni restas,
 * ni canjes, ni el historial previo a la primera consulta.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { memberNotifications } from "../../src/db/schema/member-notifications";
import { tenantValues } from "../../src/modules/shared/tenant";
import { auraInboxText } from "../../src/modules/aura/celebration-inbox";

type SourceType = typeof auraTransactions.$inferInsert.sourceType;

interface LedgerRow {
  sourceType: SourceType;
  amount: number;
  referenceType?: string | null;
  referenceId?: number | null;
}

interface InboxItemBody {
  id: number;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  readAt: string | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

async function seedLedger(
  userId: number,
  rows: LedgerRow[],
  tenantId: number = TENANT_TEMPLO,
): Promise<number[]> {
  const ids: number[] = [];
  for (const row of rows) {
    const [inserted] = await app.db
      .insert(auraTransactions)
      .values(
        tenantValues(
          { tenantId },
          {
            userId,
            sourceType: row.sourceType,
            amount: row.amount,
            referenceType: row.referenceType ?? null,
            referenceId: row.referenceId ?? null,
          },
        ),
      )
      .$returningId();
    ids.push(inserted.id);
  }
  return ids;
}

async function getCelebration(token: string): Promise<{ maxId: number }> {
  const res = await app.inject({
    method: "GET",
    url: "/api/members/aura/celebration",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function postAck(token: string, upToId: number): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/members/aura/celebration/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { upToId },
  });
  expect(res.statusCode).toBe(204);
}

async function listInbox(token: string): Promise<InboxItemBody[]> {
  const res = await app.inject({
    method: "GET",
    url: "/api/members/notifications",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { items: InboxItemBody[] }).items;
}

async function unreadCount(token: string): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: "/api/members/notifications/unread-count",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { count: number }).count;
}

async function auraRows(userId: number, tenantId: number = TENANT_TEMPLO) {
  return app.db
    .select({
      refId: memberNotifications.refId,
      readAt: memberNotifications.readAt,
    })
    .from(memberNotifications)
    .where(
      and(
        eq(memberNotifications.tenantId, tenantId),
        eq(memberNotifications.userId, userId),
        eq(memberNotifications.kind, "aura"),
      ),
    );
}

describe("auraInboxText", () => {
  it("título con el monto y cuerpo con el motivo", () => {
    expect(auraInboxText(5, "Foto de perfil")).toEqual({
      title: "Sumaste 5 de Aura",
      body: "Foto de perfil",
    });
  });
});

describe("Aura celebrada → Notificaciones", () => {
  it("la foto de perfil queda en la bandeja, sin leer, con el texto y el destino del detalle de Aura", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token); // fija la marca
    const [ledgerId] = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
    ]);

    await getCelebration(socio.token);

    const items = await listInbox(socio.token);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "aura",
      title: "Sumaste 5 de Aura",
      body: "Foto de perfil",
      route: "/mi-templo?aura=detalle",
      readAt: null,
    });
    const rows = await auraRows(socio.id);
    expect(rows.map((r) => r.refId)).toEqual([ledgerId]);
    expect(await unreadCount(socio.token)).toBe(1);
  });

  it("consultar la celebración dos veces no duplica el aviso", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [
      { sourceType: "streak_bonus", amount: 10, referenceId: 14 },
    ]);

    await getCelebration(socio.token);
    await getCelebration(socio.token);

    const items = await listInbox(socio.token);
    expect(items).toHaveLength(1);
    expect(items[0].body).toBe("14 días seguidos entrenando en la app");
  });

  it("un aviso por movimiento celebrado", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [
      { sourceType: "program_week_completion", amount: 10 },
      { sourceType: "program_completion", amount: 50 },
    ]);

    await getCelebration(socio.token);

    const titles = (await listInbox(socio.token)).map((i) => i.title).sort();
    expect(titles).toEqual(["Sumaste 10 de Aura", "Sumaste 50 de Aura"]);
  });

  it("no entran clases, estiramiento, bloque libre, regalos, antigüedad, restas ni canjes", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    const [fotoId] = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
      { sourceType: "attendance", amount: 5 },
      { sourceType: "stretch", amount: 2 },
      { sourceType: "extra_block", amount: 3 },
      {
        sourceType: "social",
        amount: 1,
        referenceType: "aura_gift",
        referenceId: 999_999,
      },
      { sourceType: "tenure_milestone", amount: 15, referenceId: 3 },
      {
        sourceType: "manual_adjustment",
        amount: -5,
        referenceType: "attendance_reversal",
      },
      { sourceType: "subscription_discount", amount: 20 },
    ]);

    await getCelebration(socio.token);

    const rows = await auraRows(socio.id);
    expect(rows.map((r) => r.refId)).toEqual([fotoId]);
  });

  it("el historial previo a la primera consulta no va a la bandeja", async () => {
    const socio = await createTestMember(app);
    await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
      { sourceType: "program_completion", amount: 50 },
    ]);

    await getCelebration(socio.token);
    await getCelebration(socio.token);

    expect(await auraRows(socio.id)).toEqual([]);
  });

  it("el ack de la celebración lo marca leído: la campanita no lo cuenta", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [{ sourceType: "profile_photo", amount: 5 }]);
    const { maxId } = await getCelebration(socio.token);
    expect(await unreadCount(socio.token)).toBe(1);

    await postAck(socio.token, maxId);

    expect(await unreadCount(socio.token)).toBe(0);
    const items = await listInbox(socio.token);
    expect(items).toHaveLength(1);
    expect(items[0].readAt).not.toBeNull();
  });

  it("el ack no marca leída la Aura que llegó después de la celebración vista", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [{ sourceType: "profile_photo", amount: 5 }]);
    const { maxId } = await getCelebration(socio.token);
    const [nuevoId] = await seedLedger(socio.id, [
      { sourceType: "program_completion", amount: 50 },
    ]);
    await getCelebration(socio.token);

    await postAck(socio.token, maxId);

    const rows = await auraRows(socio.id);
    const nuevo = rows.find((r) => r.refId === nuevoId);
    expect(nuevo?.readAt).toBeNull();
    expect(await unreadCount(socio.token)).toBe(1);
  });

  it("los avisos de otra persona y de otro gimnasio no se mezclan", async () => {
    const socio = await createTestMember(app);
    const otro = await createTestMember(app);
    await getCelebration(socio.token);
    await getCelebration(otro.token);
    await seedLedger(otro.id, [{ sourceType: "profile_photo", amount: 5 }]);
    // Fila del mismo usuario en el segundo gimnasio: no es Aura de El Templo.
    await seedLedger(
      socio.id,
      [{ sourceType: "program_completion", amount: 50 }],
      gym2.tenantId,
    );

    await getCelebration(socio.token);
    await getCelebration(otro.token);

    expect(await listInbox(socio.token)).toEqual([]);
    expect(await auraRows(socio.id, gym2.tenantId)).toEqual([]);
    expect(await listInbox(otro.token)).toHaveLength(1);
  });
});
