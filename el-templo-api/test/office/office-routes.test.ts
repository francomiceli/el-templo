/**
 * Integration tests — módulo Oficina (Fase 205, plan 02).
 *
 * Endpoints (prefijo /api/admin/office):
 *   GET   /topics            POST /topics
 *   GET   /topics/:id        PATCH /topics/:id
 *   POST  /topics/:id/comments
 *   POST  /topics/:id/seen
 *   GET   /badge             GET /staff
 *
 * Convenciones:
 *   - Nada de ids de `users` hardcodeados: el staff sale de `createStaffUser` y
 *     los socios de `createTestMember`.
 *   - Fechas relativas a hoy en la zona horaria de la sede (`todayInTz`).
 *   - Queries directas del test llevan `tenantWhere(tabla, TEMPLO_CTX)`.
 *   - D-07 compara timestamps con resolución de segundos: donde un test
 *     necesita que OTRA persona actúe "después" de una vista, espera 1,1 s.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { OfficeService } from "../../src/modules/office/service";
import type {
  OfficeBadge,
  OfficeStaff,
  OfficeTopicDetail,
  OfficeTopicListItem,
} from "../../src/modules/office/types";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/admin/office";
const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const DOS_CTX: TenantContext = { tenantId: TENANT_DOS };

interface Actor {
  id: number;
  token: string;
}

const esperar = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Oficina API (central de temas de gestión)", () => {
  let app: FastifyInstance;
  let owner: Actor;
  let branchId: number;
  let timezone: string;
  let seq = 0;
  let cache: Map<string, Actor>;

  /**
   * Staff del rol pedido, creado una vez por test (cleanAllTestData borra los
   * users). La cuenta de TV no se loguea acá: solo hace falta su fila.
   */
  async function staff(role: string, label = role): Promise<Actor> {
    const hit = cache.get(label);
    if (hit) return hit;
    seq += 1;
    const email = `office-${label}-${seq}-${Date.now()}@test.local`;
    const id = await createStaffUser(app, {
      email,
      password: "test1234",
      firstName: `Nombre${label}`,
      lastName: "Oficina",
      role,
      branchId,
      country: "AR",
    });
    const token =
      role === "tv" ? "" : await getAuthToken(app, email, "test1234");
    const actor = { id, token };
    cache.set(label, actor);
    return actor;
  }

  async function call(
    token: string,
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: `${BASE}${url}`,
      headers: { Authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });
  }

  async function createTopic(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<OfficeTopicDetail> {
    const res = await call(token, "POST", "/topics", payload);
    expect(res.statusCode).toBe(201);
    return res.json<{ topic: OfficeTopicDetail }>().topic;
  }

  async function list(
    token: string,
    query = "",
  ): Promise<OfficeTopicListItem[]> {
    const res = await call(token, "GET", `/topics${query}`);
    expect(res.statusCode).toBe(200);
    return res.json<{ topics: OfficeTopicListItem[] }>().topics;
  }

  async function badge(token: string): Promise<OfficeBadge> {
    const res = await call(token, "GET", "/badge");
    expect(res.statusCode).toBe(200);
    return res.json<OfficeBadge>();
  }

  async function eventTypes(
    topicId: number,
    ctx: TenantContext = TEMPLO_CTX,
  ): Promise<string[]> {
    const rows = await app.db
      .select({ type: schema.officeTopicEvents.type })
      .from(schema.officeTopicEvents)
      .where(
        and(
          tenantWhere(schema.officeTopicEvents, ctx),
          eq(schema.officeTopicEvents.topicId, topicId),
        ),
      )
      .orderBy(
        asc(schema.officeTopicEvents.createdAt),
        asc(schema.officeTopicEvents.id),
      );
    return rows.map((r) => r.type);
  }

  /** "Hoy" donde lo calcula el servicio para un tema sin sede: primera sede activa. */
  async function hoyDelTemplo(): Promise<string> {
    const [first] = await app.db
      .select({ tz: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.isActive, true),
        ),
      )
      .orderBy(asc(schema.branches.id))
      .limit(1);
    return todayInTz(first?.tz ?? timezone);
  }

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({
        id: schema.branches.id,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.code, "TEST"),
        ),
      );
    branchId = branch.id;
    timezone = branch.timezone;
    owner = {
      id: 0,
      token: await getAuthToken(app, "admin@test.com", "adminpass123"),
    };
  });

  afterAll(async () => {
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    cache = new Map();
    const [ownerRow] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    owner.id = ownerRow.id;
  });

  // ─────────────────────────────── 1. Roles ───────────────────────────────

  it("rechaza con 403 a coach, recepcion y admin_sede, y deja pasar a owner, admin y gestion", async () => {
    for (const role of ["coach", "recepcion", "admin_sede"]) {
      const actor = await staff(role);
      const topics = await call(actor.token, "GET", "/topics");
      expect(topics.statusCode).toBe(403);
      expect(topics.json<{ error: string }>().error).toBe("Acceso denegado");
      const bdg = await call(actor.token, "GET", "/badge");
      expect(bdg.statusCode).toBe(403);
    }

    for (const token of [
      owner.token,
      (await staff("admin")).token,
      (await staff("gestion")).token,
    ]) {
      expect((await call(token, "GET", "/topics")).statusCode).toBe(200);
      expect((await call(token, "GET", "/badge")).statusCode).toBe(200);
    }
  });

  // ──────────────────────── 2. Crear + D-07 (visto) ────────────────────────

  it("crea un tema manual: abierto, con evento creado, visto para quien lo creó y nuevo para el resto", async () => {
    const gestion = await staff("gestion");
    const topic = await createTopic(owner.token, {
      title: "Revisar el alquiler de Moreno",
      body: "Vence a fin de mes",
    });

    expect(topic.status).toBe("abierto");
    expect(topic.origin).toBe("manual");
    expect(topic.body).toBe("Vence a fin de mes");
    expect(topic.createdBy?.id).toBe(owner.id);
    expect(topic.events).toHaveLength(1);
    expect(topic.events[0].type).toBe("creado");
    expect(topic.events[0].actor?.id).toBe(owner.id);
    expect(topic.unseen).toBe(false);
    expect(topic.commentCount).toBe(0);

    const delOwner = await list(owner.token);
    expect(delOwner).toHaveLength(1);
    expect(delOwner[0].unseen).toBe(false);
    expect(delOwner[0].lastEvent?.type).toBe("creado");

    const deGestion = await list(gestion.token);
    expect(deGestion).toHaveLength(1);
    expect(deGestion[0].unseen).toBe(true);
  });

  it("rechaza un título vacío o solo espacios con 400", async () => {
    const vacio = await call(owner.token, "POST", "/topics", { title: "" });
    expect(vacio.statusCode).toBe(400);
    const espacios = await call(owner.token, "POST", "/topics", {
      title: "    ",
    });
    expect(espacios.statusCode).toBe(400);
  });

  // ───────────────────────────── 3. Vínculo ─────────────────────────────

  it("vincula un socio resolviendo 'Nombre Apellido', exige targetKind y targetId juntos y 404 si el socio no existe", async () => {
    const member = await createTestMember(app, {
      firstName: "Ana",
      lastName: "Quispe",
    });

    const ok = await createTopic(owner.token, {
      title: "Llamar a la socia",
      targetKind: "socio",
      targetId: member.id,
    });
    expect(ok.targetKind).toBe("socio");
    expect(ok.targetId).toBe(member.id);
    expect(ok.targetLabel).toBe("Ana Quispe");

    const soloKind = await call(owner.token, "POST", "/topics", {
      title: "Sin id",
      targetKind: "socio",
    });
    expect(soloKind.statusCode).toBe(400);

    const soloId = await call(owner.token, "POST", "/topics", {
      title: "Sin kind",
      targetId: member.id,
    });
    expect(soloId.statusCode).toBe(400);

    const inexistente = await call(owner.token, "POST", "/topics", {
      title: "Socio fantasma",
      targetKind: "socio",
      targetId: member.id + 987654,
    });
    expect(inexistente.statusCode).toBe(404);
  });

  // ────────────────────── 4. Menciones + badge (D-06, D-08) ──────────────────────

  it("crea menciones solo para staff ajeno al autor y las cuenta en el badge hasta que se marcan vistas", async () => {
    const gestion = await staff("gestion");
    const member = await createTestMember(app);
    const topic = await createTopic(owner.token, {
      title: "Tema con menciones",
    });

    const res = await call(
      owner.token,
      "POST",
      `/topics/${topic.id}/comments`,
      {
        body: "@Nombregestion Oficina fijate esto",
        mentionUserIds: [gestion.id, owner.id, member.id],
      },
    );
    expect(res.statusCode).toBe(201);

    const mentions = await app.db
      .select({
        userId: schema.officeMentions.userId,
        readAt: schema.officeMentions.readAt,
      })
      .from(schema.officeMentions)
      .where(
        and(
          tenantWhere(schema.officeMentions, TEMPLO_CTX),
          eq(schema.officeMentions.topicId, topic.id),
        ),
      );
    // Ni el autor mencionándose a sí mismo ni un socio generan fila.
    expect(mentions).toHaveLength(1);
    expect(mentions[0].userId).toBe(gestion.id);
    expect(mentions[0].readAt).toBeNull();

    expect(await badge(gestion.token)).toEqual({
      count: 1,
      mentions: 1,
      assigned: 0,
    });
    expect(await badge(owner.token)).toEqual({
      count: 0,
      mentions: 0,
      assigned: 0,
    });

    const seen = await call(gestion.token, "POST", `/topics/${topic.id}/seen`);
    expect(seen.statusCode).toBe(204);
    expect(await badge(gestion.token)).toEqual({
      count: 0,
      mentions: 0,
      assigned: 0,
    });

    const after = await app.db
      .select({ readAt: schema.officeMentions.readAt })
      .from(schema.officeMentions)
      .where(
        and(
          tenantWhere(schema.officeMentions, TEMPLO_CTX),
          eq(schema.officeMentions.topicId, topic.id),
        ),
      );
    expect(after[0].readAt).not.toBeNull();
  });

  it("una acción propia (comentar) deja leídas mis menciones sin pasar por /seen", async () => {
    const gestion = await staff("gestion");
    const topic = await createTopic(owner.token, { title: "Respondé esto" });
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "@Nombregestion Oficina ¿lo viste?",
      mentionUserIds: [gestion.id],
    });
    expect((await badge(gestion.token)).mentions).toBe(1);

    const res = await call(
      gestion.token,
      "POST",
      `/topics/${topic.id}/comments`,
      { body: "Sí, lo veo ahora" },
    );
    expect(res.statusCode).toBe(201);
    expect(await badge(gestion.token)).toEqual({
      count: 0,
      mentions: 0,
      assigned: 0,
    });
  });

  it("rechaza con 400 un vínculo manual que no sea a un socio", async () => {
    const res = await call(owner.token, "POST", "/topics", {
      title: "Vínculo raro",
      targetKind: "jornada",
      targetId: 1,
    });
    expect(res.statusCode).toBe(400);
  });

  it("no cuenta las menciones de un tema cerrado en el badge", async () => {
    const gestion = await staff("gestion");
    const topic = await createTopic(owner.token, {
      title: "Se cierra enseguida",
    });
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "@Nombregestion Oficina mirá",
      mentionUserIds: [gestion.id],
    });
    expect((await badge(gestion.token)).mentions).toBe(1);

    const cerrar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      status: "cerrado",
    });
    expect(cerrar.statusCode).toBe(200);
    expect((await badge(gestion.token)).mentions).toBe(0);
  });

  // ───────────────────────────── 5. Asignación ─────────────────────────────

  it("asigna, toma, desasigna y rechaza asignar a quien no es staff", async () => {
    const gestion = await staff("gestion");
    const member = await createTestMember(app);
    const topic = await createTopic(owner.token, { title: "Asignaciones" });

    const tomar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      assigneeId: owner.id,
    });
    expect(tomar.statusCode).toBe(200);
    const tomado = tomar.json<{ topic: OfficeTopicDetail }>().topic;
    expect(tomado.assignee?.id).toBe(owner.id);
    expect(tomado.events.at(-1)?.type).toBe("tomado");

    const asignar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      assigneeId: gestion.id,
    });
    const asignado = asignar.json<{ topic: OfficeTopicDetail }>().topic;
    expect(asignado.assignee?.id).toBe(gestion.id);
    expect(asignado.events.at(-1)?.type).toBe("asignado");
    expect(asignado.events.at(-1)?.payload?.assigneeId).toBe(gestion.id);

    const quitar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      assigneeId: null,
    });
    const quitado = quitar.json<{ topic: OfficeTopicDetail }>().topic;
    expect(quitado.assignee).toBeNull();
    expect(quitado.events.at(-1)?.type).toBe("desasignado");

    const aSocio = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      assigneeId: member.id,
    });
    expect(aSocio.statusCode).toBe(400);

    // Crear con responsable emite creado + asignado en el mismo pedido.
    const conResponsable = await createTopic(owner.token, {
      title: "Nace asignado",
      assigneeId: gestion.id,
    });
    expect(conResponsable.events.map((e) => e.type)).toEqual([
      "creado",
      "asignado",
    ]);
    expect(conResponsable.assignee?.id).toBe(gestion.id);
  });

  it("filtra 'mios' por responsable y excluye los cerrados", async () => {
    const gestion = await staff("gestion");
    await createTopic(owner.token, {
      title: "Mío abierto",
      assigneeId: gestion.id,
    });
    const cerrado = await createTopic(owner.token, {
      title: "Mío cerrado",
      assigneeId: gestion.id,
    });
    await createTopic(owner.token, { title: "De nadie" });
    await call(owner.token, "PATCH", `/topics/${cerrado.id}`, {
      status: "cerrado",
    });

    const mios = await list(gestion.token, "?view=mios");
    expect(mios.map((t) => t.title)).toEqual(["Mío abierto"]);
    expect(await list(owner.token, "?view=mios")).toHaveLength(0);
  });

  // ───────────────── 6. Badge de asignados + acción propia (D-07, D-08) ─────────────────

  it("el badge de asignados baja al ver, sube con actividad ajena y una acción propia cuenta como vista", async () => {
    const gestion = await staff("gestion");
    const topic = await createTopic(owner.token, {
      title: "Para gestión",
      assigneeId: gestion.id,
    });

    // Nunca visto por la persona asignada.
    expect(await badge(gestion.token)).toEqual({
      count: 1,
      mentions: 0,
      assigned: 1,
    });

    await call(gestion.token, "POST", `/topics/${topic.id}/seen`);
    expect((await badge(gestion.token)).assigned).toBe(0);

    // Actividad de otra persona en un segundo posterior a la vista.
    await esperar(1100);
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "Novedades por acá",
    });
    expect((await badge(gestion.token)).assigned).toBe(1);

    // Comentar uno mismo cuenta como vista: no queda "nuevo" para el autor.
    const propio = await call(
      gestion.token,
      "POST",
      `/topics/${topic.id}/comments`,
      {
        body: "Ya lo vi, me ocupo",
      },
    );
    expect(propio.statusCode).toBe(201);
    expect(propio.json<{ topic: OfficeTopicDetail }>().topic.unseen).toBe(
      false,
    );
    expect((await badge(gestion.token)).assigned).toBe(0);
  });

  // ──────────────────────────── 7. Cerrar y reabrir ────────────────────────────

  it("cierra con nota, bloquea comentarios con 409 y reabre limpiando el cierre", async () => {
    const topic = await createTopic(owner.token, { title: "Ciclo de vida" });

    const cerrar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      status: "cerrado",
      note: "Resuelto con el proveedor",
    });
    expect(cerrar.statusCode).toBe(200);
    const cerrado = cerrar.json<{ topic: OfficeTopicDetail }>().topic;
    expect(cerrado.status).toBe("cerrado");
    expect(cerrado.closedAt).not.toBeNull();
    expect(cerrado.events.at(-1)?.type).toBe("cerrado");
    expect(cerrado.events.at(-1)?.body).toBe("Resuelto con el proveedor");

    const [row] = await app.db
      .select({ closedBy: schema.officeTopics.closedBy })
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, TEMPLO_CTX),
          eq(schema.officeTopics.id, topic.id),
        ),
      );
    expect(row.closedBy).toBe(owner.id);

    const comentar = await call(
      owner.token,
      "POST",
      `/topics/${topic.id}/comments`,
      {
        body: "¿Y ahora?",
      },
    );
    expect(comentar.statusCode).toBe(409);

    const reabrir = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      status: "abierto",
    });
    const reabierto = reabrir.json<{ topic: OfficeTopicDetail }>().topic;
    expect(reabierto.status).toBe("abierto");
    expect(reabierto.closedAt).toBeNull();
    expect(reabierto.events.at(-1)?.type).toBe("reabierto");

    const otraVez = await call(
      owner.token,
      "POST",
      `/topics/${topic.id}/comments`,
      {
        body: "Ahora sí",
      },
    );
    expect(otraVez.statusCode).toBe(201);
  });

  it("edita título y contexto con un evento editado, y no emite nada si no hay cambios", async () => {
    const topic = await createTopic(owner.token, {
      title: "Título viejo",
      body: "Contexto viejo",
    });

    const edit = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      title: "Título nuevo",
      body: "Contexto nuevo",
    });
    expect(edit.statusCode).toBe(200);
    const editado = edit.json<{ topic: OfficeTopicDetail }>().topic;
    expect(editado.title).toBe("Título nuevo");
    expect(editado.body).toBe("Contexto nuevo");
    expect(editado.events.at(-1)?.type).toBe("editado");
    expect(editado.events.at(-1)?.payload?.fields).toEqual(["title", "body"]);

    const igual = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      title: "Título nuevo",
    });
    expect(
      igual.json<{ topic: OfficeTopicDetail }>().topic.events,
    ).toHaveLength(editado.events.length);

    const sinTitulo = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      title: "   ",
    });
    expect(sinTitulo.statusCode).toBe(400);
  });

  // ─────────────────────────────── 8. Dormir ───────────────────────────────

  it("duerme hasta una fecha futura, rechaza hoy, fechas inválidas y temas cerrados, y filtra por vista", async () => {
    const hoy = await hoyDelTemplo();
    const manana = addDays(hoy, 1);
    const topic = await createTopic(owner.token, {
      title: "Para más adelante",
    });

    const dormir = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      snoozedUntil: manana,
    });
    expect(dormir.statusCode).toBe(200);
    const dormido = dormir.json<{ topic: OfficeTopicDetail }>().topic;
    expect(dormido.status).toBe("dormido");
    expect(dormido.snoozedUntil).toBe(manana);
    expect(dormido.events.at(-1)?.type).toBe("dormido");
    expect(dormido.events.at(-1)?.payload?.until).toBe(manana);

    expect(
      (await list(owner.token, "?view=dormidos")).map((t) => t.id),
    ).toEqual([topic.id]);
    expect(await list(owner.token, "?view=abiertos")).toHaveLength(0);

    const hoyRes = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      snoozedUntil: hoy,
    });
    expect(hoyRes.statusCode).toBe(400);
    const pasado = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      snoozedUntil: addDays(hoy, -3),
    });
    expect(pasado.statusCode).toBe(400);
    const inventada = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      snoozedUntil: "2099-13-45",
    });
    expect(inventada.statusCode).toBe(400);

    // Quitar el sueño con null lo devuelve a abierto.
    const despertar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      snoozedUntil: null,
    });
    const despierto = despertar.json<{ topic: OfficeTopicDetail }>().topic;
    expect(despierto.status).toBe("abierto");
    expect(despierto.snoozedUntil).toBeNull();
    expect(despierto.events.at(-1)?.type).toBe("reabierto");

    // Un tema cerrado no se duerme.
    await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      status: "cerrado",
    });
    const sobreCerrado = await call(
      owner.token,
      "PATCH",
      `/topics/${topic.id}`,
      {
        snoozedUntil: manana,
      },
    );
    expect(sobreCerrado.statusCode).toBe(409);
  });

  it("despierta solo los dormidos vencidos al listar, con un evento reabierto automático", async () => {
    const hoy = await hoyDelTemplo();
    const [vencido] = await app.db
      .insert(schema.officeTopics)
      .values(
        tenantValues(TEMPLO_CTX, {
          title: "Vencido ayer",
          status: "dormido" as const,
          origin: "manual" as const,
          snoozedUntil: addDays(hoy, -1),
          createdBy: owner.id,
        }),
      )
      .$returningId();
    const [futuro] = await app.db
      .insert(schema.officeTopics)
      .values(
        tenantValues(TEMPLO_CTX, {
          title: "Sigue dormido",
          status: "dormido" as const,
          origin: "manual" as const,
          snoozedUntil: addDays(hoy, 5),
          createdBy: owner.id,
        }),
      )
      .$returningId();

    const abiertos = await list(owner.token, "?view=abiertos");
    expect(abiertos.map((t) => t.id)).toEqual([vencido.id]);
    expect(abiertos[0].status).toBe("abierto");
    expect(abiertos[0].snoozedUntil).toBeNull();

    const detalle = await call(owner.token, "GET", `/topics/${vencido.id}`);
    const topic = detalle.json<{ topic: OfficeTopicDetail }>().topic;
    const reabierto = topic.events.find((e) => e.type === "reabierto");
    expect(reabierto).toBeDefined();
    expect(reabierto?.payload?.auto).toBe(true);
    expect(reabierto?.actor).toBeNull();

    const dormidos = await list(owner.token, "?view=dormidos");
    expect(dormidos.map((t) => t.id)).toEqual([futuro.id]);

    // Una segunda lectura no vuelve a despertar nada ni duplica el evento.
    await list(owner.token);
    expect(await eventTypes(vencido.id)).toEqual(["reabierto"]);
  });

  // ─────────────────────────── 9. Aislamiento de tenant ───────────────────────────

  describe("aislamiento entre gimnasios", () => {
    let gym2: SegundoGimnasio;

    beforeEach(async () => {
      gym2 = await seedSecondTenant(app);
    });

    it("un tema de otro gimnasio es indistinguible de uno inexistente, en ambos sentidos", async () => {
      const [ajeno] = await app.db
        .insert(schema.officeTopics)
        .values(
          tenantValues(DOS_CTX, {
            title: "Tema del gimnasio dos",
            createdBy: gym2.adminId,
          }),
        )
        .$returningId();
      const propio = await createTopic(owner.token, {
        title: "Tema del Templo",
      });

      // El owner del Templo no ve el tema del gimnasio 2.
      expect((await list(owner.token)).map((t) => t.id)).toEqual([propio.id]);
      expect(
        (await call(owner.token, "GET", `/topics/${ajeno.id}`)).statusCode,
      ).toBe(404);
      expect(
        (
          await call(owner.token, "PATCH", `/topics/${ajeno.id}`, {
            status: "cerrado",
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await call(owner.token, "POST", `/topics/${ajeno.id}/comments`, {
            body: "Intruso",
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await call(owner.token, "POST", `/topics/${ajeno.id}/seen`))
          .statusCode,
      ).toBe(404);

      // El admin del gimnasio 2 tampoco ve el del Templo.
      expect((await list(gym2.adminToken)).map((t) => t.id)).toEqual([
        ajeno.id,
      ]);
      expect(
        (await call(gym2.adminToken, "GET", `/topics/${propio.id}`)).statusCode,
      ).toBe(404);

      // Y nada se tocó.
      const [intacto] = await app.db
        .select({ status: schema.officeTopics.status })
        .from(schema.officeTopics)
        .where(
          and(
            tenantWhere(schema.officeTopics, DOS_CTX),
            eq(schema.officeTopics.id, ajeno.id),
          ),
        );
      expect(intacto.status).toBe("abierto");
      expect(await eventTypes(ajeno.id, DOS_CTX)).toEqual([]);
    });

    it("no deja asignar, mencionar ni vincular personas de otro gimnasio, y /staff no las lista", async () => {
      const topic = await createTopic(owner.token, {
        title: "Cruce de gimnasios",
      });

      const asignar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
        assigneeId: gym2.adminId,
      });
      expect(asignar.statusCode).toBe(400);

      const vincular = await call(owner.token, "POST", "/topics", {
        title: "Socio ajeno",
        targetKind: "socio",
        targetId: gym2.socios[0].id,
      });
      expect(vincular.statusCode).toBe(404);

      await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
        body: "@Admin Gimnasio Dos",
        mentionUserIds: [gym2.adminId],
      });
      const menciones = await app.db
        .select({ id: schema.officeMentions.id })
        .from(schema.officeMentions)
        .where(tenantWhere(schema.officeMentions, DOS_CTX));
      expect(menciones).toHaveLength(0);

      const res = await call(owner.token, "GET", "/staff");
      const ids = res.json<{ staff: OfficeStaff[] }>().staff.map((s) => s.id);
      expect(ids).not.toContain(gym2.adminId);
      expect(ids).not.toContain(gym2.coachId);
    });
  });

  // ──────────────────────────────── 11. Staff ────────────────────────────────

  it("lista solo staff activo: sin socios, sin cuentas de TV y sin deshabilitados", async () => {
    const coach = await staff("coach");
    const gestion = await staff("gestion");
    const tv = await staff("tv");
    const deshabilitado = await staff("recepcion");
    const member = await createTestMember(app);
    await app.db
      .update(schema.users)
      .set({ staffDisabled: true })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, deshabilitado.id),
        ),
      );

    const res = await call(owner.token, "GET", "/staff");
    expect(res.statusCode).toBe(200);
    const lista = res.json<{ staff: OfficeStaff[] }>().staff;
    const ids = lista.map((s) => s.id);
    expect(ids).toContain(owner.id);
    expect(ids).toContain(coach.id);
    expect(ids).toContain(gestion.id);
    expect(ids).not.toContain(tv.id);
    expect(ids).not.toContain(deshabilitado.id);
    expect(ids).not.toContain(member.id);
    expect(lista.find((s) => s.id === coach.id)?.role).toBe("coach");
  });

  // ───────────────────────────────── 12. Filtros ─────────────────────────────────

  it("filtra por texto, origen y vínculo, escapa los comodines y ordena por actividad", async () => {
    const member = await createTestMember(app, {
      firstName: "Zulema",
      lastName: "Baldor",
    });
    const a = await createTopic(owner.token, { title: "Gotera en el salón" });
    const b = await createTopic(owner.token, {
      title: "Seguimiento de pago",
      targetKind: "socio",
      targetId: member.id,
    });
    const [c] = await app.db
      .insert(schema.officeTopics)
      .values(
        tenantValues(TEMPLO_CTX, {
          title: "Webhook de Wellhub con error (booking)",
          origin: "sistema" as const,
          sourceKey: "wellhub_event:1",
          createdBy: null,
          // Reloj de Node (no NOW() de MySQL) para que el orden por
          // last_activity_at sea determinista aunque los relojes difieran.
          lastActivityAt: new Date(Math.floor(Date.now() / 1000) * 1000),
        }),
      )
      .$returningId();

    const porTitulo = await list(owner.token, "?q=Gotera");
    expect(porTitulo.map((t) => t.id)).toEqual([a.id]);

    const porEtiqueta = await list(owner.token, "?q=Zulema");
    expect(porEtiqueta.map((t) => t.id)).toEqual([b.id]);

    const sistema = await list(owner.token, "?origin=sistema");
    expect(sistema.map((t) => t.id)).toEqual([c.id]);
    expect(sistema[0].origin).toBe("sistema");
    expect(sistema[0].createdBy).toBeNull();

    const manuales = await list(owner.token, "?origin=manual");
    expect(manuales.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());

    const delSocio = await list(
      owner.token,
      `?targetKind=socio&targetId=${member.id}`,
    );
    expect(delSocio.map((t) => t.id)).toEqual([b.id]);

    // El % se busca literal: ningún título lo contiene.
    expect(await list(owner.token, "?q=%25")).toHaveLength(0);

    // Más reciente primero (empate de segundo: desempata el id).
    const todos = await list(owner.token, "?view=todos");
    expect(todos.map((t) => t.id)).toEqual([c.id, b.id, a.id]);

    const limitado = await list(owner.token, "?view=todos&limit=2");
    expect(limitado).toHaveLength(2);
  });

  it("cuenta comentarios y expone el último evento en el listado", async () => {
    const topic = await createTopic(owner.token, { title: "Con hilo" });
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "Uno",
    });
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "Dos",
    });

    const [item] = await list(owner.token);
    expect(item.commentCount).toBe(2);
    expect(item.lastEvent?.type).toBe("comentario");
    expect(item.lastEvent?.body).toBe("Dos");
    expect(item.lastEvent?.actorFirstName).toBe(
      (
        await app.db
          .select({ firstName: schema.users.firstName })
          .from(schema.users)
          .where(
            and(
              tenantWhere(schema.users, TEMPLO_CTX),
              eq(schema.users.id, owner.id),
            ),
          )
      )[0].firstName,
    );
  });

  it("devuelve 404 para un tema inexistente y 204 al marcar visto uno existente", async () => {
    const topic = await createTopic(owner.token, { title: "Existe" });
    expect(
      (await call(owner.token, "GET", `/topics/${topic.id + 987654}`))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(owner.token, "POST", `/topics/${topic.id}/seen`)).statusCode,
    ).toBe(204);
  });

  // ──────────────────── Servicio: temas del sistema (plan 03) ────────────────────

  it("el servicio abre un tema del sistema una sola vez, lo cierra solo y no lo reabre", async () => {
    const service = new OfficeService(app.db, app.log);
    const input = {
      sourceKey: "staff_shift:4242",
      title: "Jornada sin cerrar: Ana en Moreno (ayer)",
      body: "Quedó abierta",
      targetKind: "jornada" as const,
      targetId: 4242,
      targetLabel: "Jornada de Ana",
      branchId,
    };

    const id = await service.createSystemTopic(TEMPLO_CTX, input);
    expect(id).not.toBeNull();
    // Segunda vez: ya existe, no inserta.
    expect(await service.createSystemTopic(TEMPLO_CTX, input)).toBeNull();

    const abiertos = await service.listOpenSystemTopics(
      TEMPLO_CTX,
      "staff_shift:",
    );
    expect(abiertos).toEqual([{ id, sourceKey: "staff_shift:4242" }]);
    expect(
      await service.listOpenSystemTopics(TEMPLO_CTX, "wellhub_event:"),
    ).toEqual([]);

    const delApi = (await call(owner.token, "GET", `/topics/${id}`)).json<{
      topic: OfficeTopicDetail;
    }>().topic;
    expect(delApi.origin).toBe("sistema");
    expect(delApi.createdBy).toBeNull();
    expect(delApi.branchName).not.toBeNull();
    expect(delApi.events.map((e) => e.type)).toEqual(["creado"]);
    expect(delApi.events[0].actor).toBeNull();

    expect(
      await service.closeSystemTopic(
        TEMPLO_CTX,
        input.sourceKey,
        "Se cerró la jornada",
      ),
    ).toBe(true);
    // Ya cerrado: no hay nada más que cerrar, y la condición no lo reabre.
    expect(
      await service.closeSystemTopic(TEMPLO_CTX, input.sourceKey, "otra vez"),
    ).toBe(false);
    expect(await service.createSystemTopic(TEMPLO_CTX, input)).toBeNull();
    expect(
      await service.listOpenSystemTopics(TEMPLO_CTX, "staff_shift:"),
    ).toEqual([]);

    const cerrado = (await call(owner.token, "GET", `/topics/${id}`)).json<{
      topic: OfficeTopicDetail;
    }>().topic;
    expect(cerrado.status).toBe("cerrado");
    expect(cerrado.closedAt).not.toBeNull();
    expect(cerrado.events.at(-1)?.type).toBe("sistema");
    expect(cerrado.events.at(-1)?.body).toBe("Se cerró la jornada");
    expect(cerrado.events.at(-1)?.actor).toBeNull();
  });
});
