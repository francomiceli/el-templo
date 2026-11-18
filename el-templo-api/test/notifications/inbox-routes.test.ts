/**
 * Fase 215, plan 14 — rutas de la bandeja de avisos de la app
 * (`/api/members/notifications`).
 *
 * Cubre: lista del más nuevo al más viejo con todas las claves del contrato,
 * avisos futuros que no se ven ni cuentan, paginación por `(shown_at, id)` sin
 * repetir ni saltear (con empates en `shown_at` justo en el corte de página),
 * cursor inválido, el regalo (alumno, profe, anulado, borrado, ajeno), contador
 * de sin leer, marcar uno y marcar todo sin tocar lo ajeno, 401 y que la
 * respuesta no filtre datos de otras personas.
 *
 * Corre en CI (la suite de integración no corre en local).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { INBOX_GIFT_KIND } from "../../src/modules/notifications/inbox-rules";
import { mockPrivateMedia } from "../conquer/_helpers";
import { seedMemberPhoto } from "../members/_profile-photo-helpers";
import { seedGift, setCommunityVisible } from "../aura/_gift-fixtures";

const CTX: TenantContext = { tenantId: 1 };
const BASE = "/api/members/notifications";
const SECOND_MS = 1000;

interface InboxGift {
  amount: number;
  giverKind: "alumno" | "profe";
  giverFirstName: string;
  giverLastInitial: string | null;
  giverPhotoUrl: string | null;
  status: "vigente" | "anulado";
  voidCause: "staff" | "asistencia" | null;
  anonymous: boolean;
}

interface InboxItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  destination: string;
  destinationSection: string | null;
  whatsappText: string | null;
  createdAt: string;
  readAt: string | null;
  gift: InboxGift | null;
}

interface InboxList {
  items: InboxItem[];
  nextBefore: string | null;
}

interface SeedInboxInput {
  title?: string;
  kind?: string;
  refId?: number | null;
  shownAt?: Date;
  readAt?: Date | null;
}

describe("Bandeja de avisos — rutas de la app (fase 215, plan 14)", () => {
  let app: FastifyInstance;
  let member: { id: number; token: string };
  let other: { id: number; token: string };
  let seq = 0;
  /** Base fija por test (segundos enteros, hace una hora): los empates no se corren. */
  let baseSeconds = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    baseSeconds = Math.floor((Date.now() - 60 * 60 * SECOND_MS) / SECOND_MS);
    await cleanAllTestData(app);
    member = await createTestMember(app, {
      firstName: "Lucía",
      lastName: "Pereyra",
    });
    other = await createTestMember(app, {
      firstName: "Otra",
      lastName: "Persona",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Hace una hora más `offsetSeconds`: siempre visible, en segundos enteros. */
  function visibleAt(offsetSeconds = 0): Date {
    return new Date((baseSeconds + offsetSeconds) * SECOND_MS);
  }

  async function seedInbox(
    userId: number,
    input: SeedInboxInput = {},
  ): Promise<number> {
    seq += 1;
    const [row] = await app.db
      .insert(schema.memberNotifications)
      .values(
        tenantValues(CTX, {
          userId,
          pendingNotificationId: null,
          dedupeKey: `inbox-routes-${userId}-${seq}`,
          kind: input.kind ?? "otro",
          refId: input.refId ?? null,
          title: input.title ?? `Aviso ${seq}`,
          body: `Cuerpo ${seq}`,
          route: "/mi-templo",
          destinationType: "app_section",
          destinationSection: "mi_templo",
          whatsappText: null,
          shownAt: input.shownAt ?? visibleAt(),
          readAt: input.readAt ?? null,
        }),
      )
      .$returningId();
    if (!row) throw new Error("no se pudo sembrar el aviso");
    return row.id;
  }

  async function readAtOf(id: number): Promise<Date | null | undefined> {
    const [row] = await app.db
      .select({ readAt: schema.memberNotifications.readAt })
      .from(schema.memberNotifications)
      .where(
        and(
          tenantWhere(schema.memberNotifications, CTX),
          eq(schema.memberNotifications.id, id),
        ),
      );
    return row?.readAt;
  }

  async function seedGiftFor(
    giverUserId: number,
    receiverUserId: number,
    opts: {
      giverKind?: "alumno" | "profe";
      status?: "vigente" | "anulado";
      voidCause?: "staff" | "asistencia";
    } = {},
  ): Promise<number> {
    return seedGift(app, {
      giverUserId,
      receiverUserId,
      giverKind: opts.giverKind ?? "alumno",
      branchId: 1,
      scheduleId: null,
      sessionDate: "2026-01-05",
      status: opts.status,
      voidCause: opts.voidCause,
    });
  }

  async function getList(token: string, query = ""): Promise<InboxList> {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as InboxList;
  }

  async function getCount(token: string): Promise<number> {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/unread-count`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { count: number }).count;
  }

  function post(url: string, token: string) {
    return app.inject({
      method: "POST",
      url: `${BASE}${url}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("1) lista del más nuevo al más viejo con todas las claves del contrato", async () => {
    const viejo = await seedInbox(member.id, {
      title: "Viejo",
      shownAt: visibleAt(0),
    });
    const nuevo = await seedInbox(member.id, {
      title: "Nuevo",
      shownAt: visibleAt(120),
    });

    const body = await getList(member.token);

    expect(body.items.map((i) => i.id)).toEqual([nuevo, viejo]);
    expect(body.nextBefore).toBeNull();
    const first = body.items[0];
    expect(Object.keys(first).sort()).toEqual(
      [
        "id",
        "kind",
        "title",
        "body",
        "route",
        "destination",
        "destinationSection",
        "whatsappText",
        "createdAt",
        "readAt",
        "gift",
      ].sort(),
    );
    expect(first.kind).toBe("otro");
    expect(first.title).toBe("Nuevo");
    expect(first.body).toMatch(/^Cuerpo /);
    expect(first.route).toBe("/mi-templo");
    expect(first.destination).toBe("app_section");
    expect(first.destinationSection).toBe("mi_templo");
    expect(first.whatsappText).toBeNull();
    expect(first.createdAt).toBe(visibleAt(120).toISOString());
    expect(first.readAt).toBeNull();
    expect(first.gift).toBeNull();
  });

  it("2) un aviso con shown_at en el futuro no aparece ni cuenta", async () => {
    await seedInbox(member.id, { title: "Ya visible" });
    await seedInbox(member.id, {
      title: "Programado",
      shownAt: new Date(Date.now() + 2 * 60 * 60 * SECOND_MS),
    });

    const body = await getList(member.token);

    expect(body.items.map((i) => i.title)).toEqual(["Ya visible"]);
    expect(await getCount(member.token)).toBe(1);
  });

  it("3) paginación: 35 avisos dan 30 y nextBefore, la segunda página trae 5 sin repetir ni saltear (con empates en el corte)", async () => {
    // Pares con el mismo shown_at: el par (4, 5) queda partido entre las dos
    // páginas, así que el cursor tiene que desempatar por id.
    for (let i = 0; i < 35; i += 1) {
      await seedInbox(member.id, {
        title: `n${i}`,
        shownAt: visibleAt(Math.floor(i / 2)),
      });
    }

    const first = await getList(member.token);
    expect(first.items).toHaveLength(30);
    expect(first.nextBefore).not.toBeNull();
    expect(first.nextBefore).toMatch(/^\d+\.\d+$/);

    const second = await getList(
      member.token,
      `?before=${first.nextBefore as string}`,
    );
    expect(second.items).toHaveLength(5);
    expect(second.nextBefore).toBeNull();

    const titles = [...first.items, ...second.items].map((i) => i.title);
    const expected = Array.from({ length: 35 }, (_, i) => `n${34 - i}`);
    expect(titles).toEqual(expected);
    expect(new Set(titles).size).toBe(35);
  });

  it("3b) limit chico pagina de a pocos y respeta el máximo del schema", async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedInbox(member.id, { title: `m${i}`, shownAt: visibleAt(i) });
    }

    const page = await getList(member.token, "?limit=2");
    expect(page.items.map((i) => i.title)).toEqual(["m2", "m1"]);
    expect(page.nextBefore).not.toBeNull();

    const tooMany = await app.inject({
      method: "GET",
      url: `${BASE}?limit=51`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it("4) cursor inválido: el que no tiene forma da 400 y el que la tiene pero no sirve devuelve la primera página", async () => {
    await seedInbox(member.id, { title: "Uno", shownAt: visibleAt(0) });
    await seedInbox(member.id, { title: "Dos", shownAt: visibleAt(5) });

    const malFormado = await app.inject({
      method: "GET",
      url: `${BASE}?before=abc`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(malFormado.statusCode).toBe(400);

    const sinSentido = await getList(member.token, "?before=0.0");
    expect(sinSentido.items.map((i) => i.title)).toEqual(["Dos", "Uno"]);
    expect(sinSentido.nextBefore).toBeNull();
  });

  it("5) regalo de alumno: trae dador, inicial, monto y estado vigente; anulado sale anulado; regalo borrado da gift null", async () => {
    const giver = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const vigente = await seedGiftFor(giver.id, member.id);
    const anulado = await seedGiftFor(giver.id, member.id, {
      status: "anulado",
    });
    const borrado = await seedGiftFor(giver.id, member.id);
    await seedInbox(member.id, {
      title: "Vigente",
      kind: INBOX_GIFT_KIND,
      refId: vigente,
      shownAt: visibleAt(10),
    });
    await seedInbox(member.id, {
      title: "Anulado",
      kind: INBOX_GIFT_KIND,
      refId: anulado,
      shownAt: visibleAt(20),
    });
    await seedInbox(member.id, {
      title: "Borrado",
      kind: INBOX_GIFT_KIND,
      refId: borrado,
      shownAt: visibleAt(30),
    });
    await app.dbPool.query("DELETE FROM aura_gifts WHERE id = ?", [borrado]);

    const body = await getList(member.token);
    const byTitle = new Map(body.items.map((i) => [i.title, i]));

    expect(byTitle.get("Vigente")?.gift).toEqual({
      amount: 1,
      giverKind: "alumno",
      giverFirstName: "Sofía",
      giverLastInitial: "M",
      giverPhotoUrl: null,
      status: "vigente",
      voidCause: null,
      anonymous: false,
    });
    expect(byTitle.get("Anulado")?.gift?.status).toBe("anulado");
    expect(byTitle.get("Borrado")?.gift).toBeNull();
  });

  it("5a) regalo anulado: trae la causa (staff o asistencia) y uno vigente la trae en null (#28, #37)", async () => {
    const giver = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const porStaff = await seedGiftFor(giver.id, member.id, {
      status: "anulado",
      voidCause: "staff",
    });
    const porAsistencia = await seedGiftFor(giver.id, member.id, {
      status: "anulado",
      voidCause: "asistencia",
    });
    const viejo = await seedGiftFor(giver.id, member.id, {
      status: "anulado",
    });
    const vigente = await seedGiftFor(giver.id, member.id);
    const casos: Array<[string, number]> = [
      ["Staff", porStaff],
      ["Asistencia", porAsistencia],
      ["Viejo", viejo],
      ["Vigente", vigente],
    ];
    for (const [i, [title, refId]] of casos.entries()) {
      await seedInbox(member.id, {
        title,
        kind: INBOX_GIFT_KIND,
        refId,
        shownAt: visibleAt(10 + i),
      });
    }

    const body = await getList(member.token);
    const byTitle = new Map(body.items.map((i) => [i.title, i]));

    expect(byTitle.get("Staff")?.gift?.voidCause).toBe("staff");
    expect(byTitle.get("Asistencia")?.gift?.voidCause).toBe("asistencia");
    expect(byTitle.get("Viejo")?.gift?.voidCause).toBeNull();
    expect(byTitle.get("Vigente")?.gift?.voidCause).toBeNull();
  });

  it("5b) la foto del dador alumno sale firmada, y sin storage el aviso se lee igual sin foto", async () => {
    const giver = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    await seedMemberPhoto(app, giver.id, { status: "aprobada" });
    const gift = await seedGiftFor(giver.id, member.id);
    await seedInbox(member.id, {
      kind: INBOX_GIFT_KIND,
      refId: gift,
    });

    mockPrivateMedia();
    const conFoto = await getList(member.token);
    expect(conFoto.items[0].gift?.giverPhotoUrl).toMatch(
      /^https:\/\/r2\.test\/get\//,
    );

    vi.restoreAllMocks();
    mockPrivateMedia({
      presignGet: async () => {
        throw new Error("R2 caído");
      },
    });
    const sinStorage = await app.inject({
      method: "GET",
      url: BASE,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(sinStorage.statusCode, sinStorage.body).toBe(200);
    const body = sinStorage.json() as InboxList;
    expect(body.items[0].gift?.giverFirstName).toBe("Sofía");
    expect(body.items[0].gift?.giverPhotoUrl).toBeNull();
  });

  it("5d) ME-01: quien dio y hoy está oculto no se nombra: sin nombre, inicial ni foto, y el texto dice solo monto y motivo", async () => {
    const giver = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    await seedMemberPhoto(app, giver.id, { status: "aprobada" });
    mockPrivateMedia();
    const gift = await seedGiftFor(giver.id, member.id);
    await seedInbox(member.id, {
      title: "Sofía M. te dio Aura",
      kind: INBOX_GIFT_KIND,
      refId: gift,
    });
    await setCommunityVisible(app, giver.id, false);

    const body = await getList(member.token);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe("Te dieron 1 de Aura");
    expect(body.items[0].body).toBe("Motivo: Buena técnica.");
    expect(body.items[0].gift).toEqual({
      amount: 1,
      giverKind: "alumno",
      giverFirstName: "",
      giverLastInitial: null,
      giverPhotoUrl: null,
      status: "vigente",
      voidCause: null,
      anonymous: true,
    });
    expect(JSON.stringify(body)).not.toContain("Sofía");
  });

  it("5e) #38: quien regaló sin nombre cargado tampoco se nombra, ni dice Alguien", async () => {
    const giver = await createTestMember(app, { lastName: "Martínez" });
    await app.dbPool.query("UPDATE users SET first_name = NULL WHERE id = ?", [
      giver.id,
    ]);
    const gift = await seedGiftFor(giver.id, member.id);
    await seedInbox(member.id, {
      title: "Alguien te dio Aura",
      kind: INBOX_GIFT_KIND,
      refId: gift,
    });

    const body = await getList(member.token);

    expect(body.items[0].title).toBe("Te dieron 1 de Aura");
    expect(body.items[0].gift?.anonymous).toBe(true);
    expect(body.items[0].gift?.giverFirstName).toBe("");
    expect(body.items[0].gift?.giverLastInitial).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Alguien");
  });

  it("5f) quien dio vuelve a estar visible: el aviso vuelve a nombrarlo; el profe nunca es anónimo", async () => {
    const giver = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const gift = await seedGiftFor(giver.id, member.id);
    await seedInbox(member.id, {
      title: "Sofía M. te dio Aura",
      kind: INBOX_GIFT_KIND,
      refId: gift,
    });
    await setCommunityVisible(app, giver.id, false);
    await setCommunityVisible(app, giver.id, true);

    const visible = await getList(member.token);
    expect(visible.items[0].title).toBe("Sofía M. te dio Aura");
    expect(visible.items[0].gift?.anonymous).toBe(false);
    expect(visible.items[0].gift?.giverFirstName).toBe("Sofía");

    const profe = await createTestMember(app, { firstName: "Fran" });
    await setCommunityVisible(app, profe.id, false);
    const giftProfe = await seedGiftFor(profe.id, member.id, {
      giverKind: "profe",
    });
    await seedInbox(member.id, {
      title: "Tu profe Fran te dio Aura",
      kind: INBOX_GIFT_KIND,
      refId: giftProfe,
      shownAt: visibleAt(30),
    });
    const conProfe = await getList(member.token);
    const delProfe = conProfe.items.find(
      (i) => i.title === "Tu profe Fran te dio Aura",
    );
    expect(delProfe?.gift?.anonymous).toBe(false);
    expect(delProfe?.gift?.giverKind).toBe("profe");
  });

  it("5c) un aviso que apunta al regalo de otra persona no lo muestra", async () => {
    const giver = await createTestMember(app, { firstName: "Dador" });
    const ajeno = await seedGiftFor(giver.id, other.id);
    await seedInbox(member.id, { kind: INBOX_GIFT_KIND, refId: ajeno });

    const body = await getList(member.token);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].gift).toBeNull();
  });

  it("6) regalo del profe: giverKind profe, sin inicial y sin foto aunque tenga una aprobada", async () => {
    const profe = await createTestMember(app, {
      firstName: "Fran",
      lastName: "Entrenador",
    });
    await seedMemberPhoto(app, profe.id, { status: "aprobada" });
    mockPrivateMedia();
    const gift = await seedGiftFor(profe.id, member.id, {
      giverKind: "profe",
    });
    await seedInbox(member.id, { kind: INBOX_GIFT_KIND, refId: gift });

    const body = await getList(member.token);

    expect(body.items[0].gift).toEqual({
      amount: 2,
      giverKind: "profe",
      giverFirstName: "Fran",
      giverLastInitial: null,
      giverPhotoUrl: null,
      status: "vigente",
      voidCause: null,
      anonymous: false,
    });
  });

  it("7) unread-count cuenta solo los propios, visibles y sin leer", async () => {
    await seedInbox(member.id);
    await seedInbox(member.id);
    await seedInbox(member.id, { readAt: new Date() });
    await seedInbox(member.id, {
      shownAt: new Date(Date.now() + 2 * 60 * 60 * SECOND_MS),
    });
    await seedInbox(other.id);

    expect(await getCount(member.token)).toBe(2);
    expect(await getCount(other.token)).toBe(1);
  });

  it("8) POST /:id/read responde 204 y baja el contador; repetido también 204; un aviso ajeno da 404 y sigue sin leer", async () => {
    const propio = await seedInbox(member.id);
    await seedInbox(member.id);
    const ajeno = await seedInbox(other.id);

    const first = await post(`/${propio}/read`, member.token);
    expect(first.statusCode, first.body).toBe(204);
    expect(await getCount(member.token)).toBe(1);
    expect(await readAtOf(propio)).not.toBeNull();

    const again = await post(`/${propio}/read`, member.token);
    expect(again.statusCode).toBe(204);
    expect(await getCount(member.token)).toBe(1);

    const robado = await post(`/${ajeno}/read`, member.token);
    expect(robado.statusCode).toBe(404);
    expect(await readAtOf(ajeno)).toBeNull();

    const inexistente = await post("/99999999/read", member.token);
    expect(inexistente.statusCode).toBe(404);
  });

  it("9) POST /read-all responde 204, deja el contador en 0 y no toca los avisos de otra persona ni los programados", async () => {
    await seedInbox(member.id);
    await seedInbox(member.id);
    const ajeno = await seedInbox(other.id);
    const futuro = await seedInbox(member.id, {
      shownAt: new Date(Date.now() + 2 * 60 * 60 * SECOND_MS),
    });

    const res = await post("/read-all", member.token);

    expect(res.statusCode, res.body).toBe(204);
    expect(await getCount(member.token)).toBe(0);
    expect(await readAtOf(ajeno)).toBeNull();
    expect(await readAtOf(futuro)).toBeNull();
    expect(await getCount(other.token)).toBe(1);
  });

  it("10) sin token las cuatro rutas responden 401", async () => {
    const id = await seedInbox(member.id);
    const pedidos = [
      { method: "GET" as const, url: BASE },
      { method: "GET" as const, url: `${BASE}/unread-count` },
      { method: "POST" as const, url: `${BASE}/${id}/read` },
      { method: "POST" as const, url: `${BASE}/read-all` },
    ];

    for (const pedido of pedidos) {
      const res = await app.inject(pedido);
      expect(res.statusCode, `${pedido.method} ${pedido.url}`).toBe(401);
    }
    expect(await readAtOf(id)).toBeNull();
  });

  it("11) la respuesta no trae userId ni datos de otras personas fuera de gift, y ?userId= se ignora", async () => {
    await seedInbox(member.id, { title: "Mío" });
    await seedInbox(other.id, { title: "De otra persona" });

    const body = await getList(member.token, `?userId=${other.id}`);
    const texto = JSON.stringify(body);

    expect(body.items.map((i) => i.title)).toEqual(["Mío"]);
    expect(texto).not.toContain("userId");
    expect(texto).not.toContain("tenantId");
    expect(texto).not.toContain("De otra persona");
    expect(texto).not.toContain("refId");
  });
});
