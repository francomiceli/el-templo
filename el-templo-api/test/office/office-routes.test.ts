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

  it("rechaza con 403 a coach, recepcion, admin_sede y gestion, y deja pasar a owner y admin (igual que el Tablero)", async () => {
    for (const role of ["coach", "recepcion", "admin_sede", "gestion"]) {
      const actor = await staff(role);
      const topics = await call(actor.token, "GET", "/topics");
      expect(topics.statusCode).toBe(403);
      expect(topics.json<{ error: string }>().error).toBe("Acceso denegado");
      const bdg = await call(actor.token, "GET", "/badge");
      expect(bdg.statusCode).toBe(403);
    }

    for (const token of [owner.token, (await staff("admin")).token]) {
      expect((await call(token, "GET", "/topics")).statusCode).toBe(200);
      expect((await call(token, "GET", "/badge")).statusCode).toBe(200);
    }
  });

  // ──────────────────────── 2. Crear + D-07 (visto) ────────────────────────

  it("crea un tema manual: abierto, con evento creado, visto para quien lo creó y nuevo para el resto", async () => {
    const segundo = await staff("admin", "segundo");
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

    const deSegundo = await list(segundo.token);
    expect(deSegundo).toHaveLength(1);
    expect(deSegundo[0].unseen).toBe(true);
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

  it("crea menciones solo para owner/admin ajenos al autor y las cuenta en el badge hasta que se marcan vistas", async () => {
    const segundo = await staff("admin", "segundo");
    const member = await createTestMember(app);
    const topic = await createTopic(owner.token, {
      title: "Tema con menciones",
    });

    const res = await call(
      owner.token,
      "POST",
      `/topics/${topic.id}/comments`,
      {
        body: "@Nombresegundo Oficina fijate esto",
        mentionUserIds: [segundo.id, owner.id, member.id],
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
    expect(mentions[0].userId).toBe(segundo.id);
    expect(mentions[0].readAt).toBeNull();

    expect(await badge(segundo.token)).toEqual({
      count: 1,
      mentions: 1,
      assigned: 0,
    });
    expect(await badge(owner.token)).toEqual({
      count: 0,
      mentions: 0,
      assigned: 0,
    });

    const seen = await call(segundo.token, "POST", `/topics/${topic.id}/seen`);
    expect(seen.statusCode).toBe(204);
    expect(await badge(segundo.token)).toEqual({
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

  it("descarta en silencio las menciones a gestion y coach: sin fila en office_mentions y sin badge que aplique", async () => {
    const gestion = await staff("gestion");
    const coach = await staff("coach");
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, { title: "Solo admins" });

    const res = await call(
      owner.token,
      "POST",
      `/topics/${topic.id}/comments`,
      {
        body: "@Nombregestion Oficina @Nombrecoach Oficina @Nombresegundo Oficina",
        mentionUserIds: [gestion.id, coach.id, segundo.id],
      },
    );
    // El comentario se crea igual: lo descartado son las menciones, no el pedido.
    expect(res.statusCode).toBe(201);

    const mentions = await app.db
      .select({ userId: schema.officeMentions.userId })
      .from(schema.officeMentions)
      .where(
        and(
          tenantWhere(schema.officeMentions, TEMPLO_CTX),
          eq(schema.officeMentions.topicId, topic.id),
        ),
      );
    expect(mentions.map((m) => m.userId)).toEqual([segundo.id]);

    // Quienes no son owner/admin ni siquiera pueden pedir el badge (403).
    expect((await call(gestion.token, "GET", "/badge")).statusCode).toBe(403);
    expect((await call(coach.token, "GET", "/badge")).statusCode).toBe(403);
    expect((await badge(segundo.token)).mentions).toBe(1);
  });

  it("una acción propia (comentar) deja leídas mis menciones sin pasar por /seen", async () => {
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, { title: "Respondé esto" });
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "@Nombresegundo Oficina ¿lo viste?",
      mentionUserIds: [segundo.id],
    });
    expect((await badge(segundo.token)).mentions).toBe(1);

    const res = await call(
      segundo.token,
      "POST",
      `/topics/${topic.id}/comments`,
      { body: "Sí, lo veo ahora" },
    );
    expect(res.statusCode).toBe(201);
    expect(await badge(segundo.token)).toEqual({
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
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, {
      title: "Se cierra enseguida",
    });
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "@Nombresegundo Oficina mirá",
      mentionUserIds: [segundo.id],
    });
    expect((await badge(segundo.token)).mentions).toBe(1);

    const cerrar = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      status: "cerrado",
    });
    expect(cerrar.statusCode).toBe(200);
    expect((await badge(segundo.token)).mentions).toBe(0);
  });

  // ───────────────────────────── 5. Asignación ─────────────────────────────

  /** Último evento de un tipo en el hilo de un tema (null si no hay). */
  function ultimo(topic: OfficeTopicDetail, type: string) {
    return topic.events.filter((e) => e.type === type).at(-1) ?? null;
  }

  async function patchAsignados(
    token: string,
    topicId: number,
    assigneeIds: number[],
  ): Promise<OfficeTopicDetail> {
    const res = await call(token, "PATCH", `/topics/${topicId}`, {
      assigneeIds,
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ topic: OfficeTopicDetail }>().topic;
  }

  it("crea con dos responsables: un evento asignado con ambos y la respuesta ordenada por nombre", async () => {
    const segundo = await staff("admin", "segundo");
    const admin = await staff("admin");
    const topic = await createTopic(owner.token, {
      title: "Nace con dos responsables",
      assigneeIds: [segundo.id, admin.id],
    });
    expect(topic.events.map((e) => e.type)).toEqual(["creado", "asignado"]);
    // "Nombreadmin" < "Nombresegundo", sin importar el orden en que llegaron.
    expect(topic.assignees.map((a) => a.id)).toEqual([admin.id, segundo.id]);
    const evento = ultimo(topic, "asignado");
    expect([...(evento?.payload?.assigneeIds as number[])].sort()).toEqual(
      [admin.id, segundo.id].sort(),
    );
    expect(evento?.payload?.assigneeNames).toHaveLength(2);

    // El listado trae los mismos responsables (consulta por lote).
    const [enListado] = await list(owner.token);
    expect(enListado.assignees.map((a) => a.id)).toEqual([
      admin.id,
      segundo.id,
    ]);
  });

  it("crear con el actor como único responsable emite tomado, y sin responsables no emite nada", async () => {
    const propio = await createTopic(owner.token, {
      title: "Lo tomo yo",
      assigneeIds: [owner.id],
    });
    expect(propio.events.map((e) => e.type)).toEqual(["creado", "tomado"]);
    expect(propio.assignees.map((a) => a.id)).toEqual([owner.id]);

    const sinNadie = await createTopic(owner.token, { title: "Sin nadie" });
    expect(sinNadie.events.map((e) => e.type)).toEqual(["creado"]);
    expect(sinNadie.assignees).toEqual([]);
  });

  it("el parche REEMPLAZA el conjunto: agregar emite asignado, quitar emite desasignado y tomar emite tomado", async () => {
    const segundo = await staff("admin", "segundo");
    const admin = await staff("admin");
    const topic = await createTopic(owner.token, { title: "Asignaciones" });

    // Tomar = el cliente manda el conjunto actual + él mismo.
    const tomado = await patchAsignados(owner.token, topic.id, [owner.id]);
    expect(tomado.assignees.map((a) => a.id)).toEqual([owner.id]);
    expect(tomado.events.at(-1)?.type).toBe("tomado");
    expect(tomado.events.at(-1)?.payload?.assigneeIds).toEqual([owner.id]);

    // Suma a segundo (el actor ya estaba): asignado con SOLO el agregado.
    const asignado = await patchAsignados(owner.token, topic.id, [
      owner.id,
      segundo.id,
    ]);
    expect(asignado.assignees.map((a) => a.id).sort()).toEqual(
      [owner.id, segundo.id].sort(),
    );
    expect(asignado.events.at(-1)?.type).toBe("asignado");
    expect(asignado.events.at(-1)?.payload?.assigneeIds).toEqual([segundo.id]);
    expect(asignado.events.at(-1)?.payload?.assigneeNames).toEqual([
      "Nombresegundo Oficina",
    ]);

    // Reemplazo: sale segundo, entra admin => asignado(admin) + desasignado(segundo).
    const reemplazado = await patchAsignados(owner.token, topic.id, [
      owner.id,
      admin.id,
    ]);
    const tipos = reemplazado.events.map((e) => e.type);
    expect(tipos.slice(-2)).toEqual(["asignado", "desasignado"]);
    expect(reemplazado.events.at(-2)?.payload?.assigneeIds).toEqual([admin.id]);
    expect(reemplazado.events.at(-1)?.payload?.assigneeIds).toEqual([
      segundo.id,
    ]);
    expect(reemplazado.assignees.map((a) => a.id).sort()).toEqual(
      [owner.id, admin.id].sort(),
    );

    // Soltar (el actor se saca a sí mismo): desasignado con él.
    const suelto = await patchAsignados(owner.token, topic.id, [admin.id]);
    expect(suelto.events.at(-1)?.type).toBe("desasignado");
    expect(suelto.events.at(-1)?.payload?.assigneeIds).toEqual([owner.id]);
    expect(suelto.assignees.map((a) => a.id)).toEqual([admin.id]);
  });

  it("un parche sin cambios en los responsables no genera evento ni mueve la actividad", async () => {
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, {
      title: "Sin cambios",
      assigneeIds: [segundo.id],
    });
    const eventosAntes = topic.events.length;

    // Mismo conjunto (y repetido: el servidor deduplica).
    const igual = await patchAsignados(owner.token, topic.id, [
      segundo.id,
      segundo.id,
    ]);
    expect(igual.events).toHaveLength(eventosAntes);
    expect(igual.lastActivityAt).toBe(topic.lastActivityAt);
    expect(igual.assignees.map((a) => a.id)).toEqual([segundo.id]);

    // Sin la clave `assigneeIds` tampoco se tocan los responsables.
    const soloTitulo = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      title: "Sin cambios (renombrado)",
    });
    expect(
      soloTitulo
        .json<{ topic: OfficeTopicDetail }>()
        .topic.assignees.map((a) => a.id),
    ).toEqual([segundo.id]);
  });

  it("un arreglo vacío deja el tema sin responsables", async () => {
    const segundo = await staff("admin", "segundo");
    const admin = await staff("admin");
    const topic = await createTopic(owner.token, {
      title: "Se vacía",
      assigneeIds: [segundo.id, admin.id],
    });
    const vacio = await patchAsignados(owner.token, topic.id, []);
    expect(vacio.assignees).toEqual([]);
    const quitado = ultimo(vacio, "desasignado");
    expect([...(quitado?.payload?.assigneeIds as number[])].sort()).toEqual(
      [segundo.id, admin.id].sort(),
    );
    expect(await list(segundo.token, "?view=mios")).toHaveLength(0);
  });

  it("deduplica ids repetidos al crear y rechaza más de 20 responsables", async () => {
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, {
      title: "Repetidos",
      assigneeIds: [segundo.id, segundo.id, segundo.id],
    });
    expect(topic.assignees.map((a) => a.id)).toEqual([segundo.id]);
    const filas = await app.db
      .select({ id: schema.officeTopicAssignees.id })
      .from(schema.officeTopicAssignees)
      .where(tenantWhere(schema.officeTopicAssignees, TEMPLO_CTX));
    expect(filas).toHaveLength(1);

    const demasiados = await call(owner.token, "POST", "/topics", {
      title: "Demasiados",
      assigneeIds: Array.from({ length: 21 }, (_, i) => i + 1),
    });
    expect(demasiados.statusCode).toBe(400);
  });

  it("rechaza con 400 asignar a quien no es owner/admin (socio) sin tocar el conjunto", async () => {
    const segundo = await staff("admin", "segundo");
    const member = await createTestMember(app);
    const topic = await createTopic(owner.token, {
      title: "Solo owner y admin",
      assigneeIds: [segundo.id],
    });

    const aSocio = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      assigneeIds: [segundo.id, member.id],
    });
    expect(aSocio.statusCode).toBe(400);

    const creaConSocio = await call(owner.token, "POST", "/topics", {
      title: "Con socio",
      assigneeIds: [segundo.id, member.id],
    });
    expect(creaConSocio.statusCode).toBe(400);

    const intacto = await call(owner.token, "GET", `/topics/${topic.id}`);
    const detalle = intacto.json<{ topic: OfficeTopicDetail }>().topic;
    expect(detalle.assignees.map((a) => a.id)).toEqual([segundo.id]);
    expect(detalle.events.map((e) => e.type)).toEqual(["creado", "asignado"]);
  });

  it("rechaza con 400 asignar a gestion o a coach (solo owner y admin), al crear y al editar", async () => {
    const gestion = await staff("gestion");
    const coach = await staff("coach");
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, {
      title: "Solo owner y admin 2",
      assigneeIds: [segundo.id],
    });

    for (const intruso of [gestion, coach]) {
      const crea = await call(owner.token, "POST", "/topics", {
        title: "Con intruso",
        assigneeIds: [segundo.id, intruso.id],
      });
      expect(crea.statusCode).toBe(400);

      const edita = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
        assigneeIds: [segundo.id, intruso.id],
      });
      expect(edita.statusCode).toBe(400);
    }

    // Ni el tema "Con intruso" se creó, ni el conjunto del otro cambió.
    const todos = await list(owner.token, "?view=todos");
    expect(todos.map((t) => t.title)).toEqual(["Solo owner y admin 2"]);
    const intacto = await call(owner.token, "GET", `/topics/${topic.id}`);
    const detalle = intacto.json<{ topic: OfficeTopicDetail }>().topic;
    expect(detalle.assignees.map((a) => a.id)).toEqual([segundo.id]);
  });

  it("quien ya era responsable y dejó de ser admin no bloquea el parche, y se lo puede quitar", async () => {
    const exAdmin = await staff("admin", "exadmin");
    const admin = await staff("admin");
    const topic = await createTopic(owner.token, {
      title: "Cambió de rol",
      assigneeIds: [exAdmin.id],
    });
    await app.db
      .update(schema.users)
      .set({ role: "coach" })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, exAdmin.id),
        ),
      );

    // Mantiene al ex admin y suma a otro: solo se valida al agregado.
    const suma = await patchAsignados(owner.token, topic.id, [
      exAdmin.id,
      admin.id,
    ]);
    expect(suma.assignees.map((a) => a.id).sort()).toEqual(
      [exAdmin.id, admin.id].sort(),
    );

    // Y se lo puede quitar (200).
    const saca = await call(owner.token, "PATCH", `/topics/${topic.id}`, {
      assigneeIds: [admin.id],
    });
    expect(saca.statusCode).toBe(200);
    const detalle = saca.json<{ topic: OfficeTopicDetail }>().topic;
    expect(detalle.assignees.map((a) => a.id)).toEqual([admin.id]);
    expect(detalle.events.at(-1)?.type).toBe("desasignado");
  });

  it("quien ya era responsable y se deshabilitó no bloquea el parche, y se lo puede quitar", async () => {
    const segundo = await staff("admin", "segundo");
    const admin = await staff("admin");
    const topic = await createTopic(owner.token, {
      title: "Se fue de baja",
      assigneeIds: [segundo.id],
    });
    await app.db
      .update(schema.users)
      .set({ staffDisabled: true })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, segundo.id),
        ),
      );

    // Mantiene al deshabilitado y suma a otro: no se revalida al que ya estaba.
    const suma = await patchAsignados(owner.token, topic.id, [
      segundo.id,
      admin.id,
    ]);
    expect(suma.assignees.map((a) => a.id).sort()).toEqual(
      [segundo.id, admin.id].sort(),
    );

    // Y se lo puede sacar.
    const saca = await patchAsignados(owner.token, topic.id, [admin.id]);
    expect(saca.assignees.map((a) => a.id)).toEqual([admin.id]);
    expect(saca.events.at(-1)?.type).toBe("desasignado");
  });

  it("filtra 'mios' por responsable (ambos lo ven, un tercero no) y excluye los cerrados", async () => {
    const segundo = await staff("admin", "segundo");
    const admin = await staff("admin");
    await createTopic(owner.token, {
      title: "Mío abierto",
      assigneeIds: [segundo.id, admin.id],
    });
    const cerrado = await createTopic(owner.token, {
      title: "Mío cerrado",
      assigneeIds: [segundo.id],
    });
    await createTopic(owner.token, { title: "De nadie" });
    await call(owner.token, "PATCH", `/topics/${cerrado.id}`, {
      status: "cerrado",
    });

    expect(
      (await list(segundo.token, "?view=mios")).map((t) => t.title),
    ).toEqual(["Mío abierto"]);
    expect((await list(admin.token, "?view=mios")).map((t) => t.title)).toEqual(
      ["Mío abierto"],
    );
    // El tercero (owner, que no es responsable de ninguno) no ve nada.
    expect(await list(owner.token, "?view=mios")).toHaveLength(0);
  });

  // ───────────────── 6. Badge de asignados + acción propia (D-07, D-08) ─────────────────

  it("el badge de asignados baja al ver, sube con actividad ajena y una acción propia cuenta como vista", async () => {
    const segundo = await staff("admin", "segundo");
    const topic = await createTopic(owner.token, {
      title: "Para gestión",
      assigneeIds: [segundo.id],
    });

    // Nunca visto por la persona asignada.
    expect(await badge(segundo.token)).toEqual({
      count: 1,
      mentions: 0,
      assigned: 1,
    });

    await call(segundo.token, "POST", `/topics/${topic.id}/seen`);
    expect((await badge(segundo.token)).assigned).toBe(0);

    // Actividad de otra persona en un segundo posterior a la vista.
    await esperar(1100);
    await call(owner.token, "POST", `/topics/${topic.id}/comments`, {
      body: "Novedades por acá",
    });
    expect((await badge(segundo.token)).assigned).toBe(1);

    // Comentar uno mismo cuenta como vista: no queda "nuevo" para el autor.
    const propio = await call(
      segundo.token,
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
    expect((await badge(segundo.token)).assigned).toBe(0);
  });

  it("el badge de asignados cuenta para cada responsable y cada uno baja al ver lo suyo", async () => {
    const segundo = await staff("admin", "segundo");
    const admin = await staff("admin");
    const topic = await createTopic(owner.token, {
      title: "Para dos",
      assigneeIds: [segundo.id, admin.id],
    });

    expect((await badge(segundo.token)).assigned).toBe(1);
    expect((await badge(admin.token)).assigned).toBe(1);
    // Quien creó el tema sin ser responsable no recibe aviso de asignación.
    expect((await badge(owner.token)).assigned).toBe(0);

    await call(segundo.token, "POST", `/topics/${topic.id}/seen`);
    expect((await badge(segundo.token)).assigned).toBe(0);
    expect((await badge(admin.token)).assigned).toBe(1);

    // Si se lo quita del conjunto, el tema deja de contarle.
    await patchAsignados(owner.token, topic.id, [segundo.id]);
    expect((await badge(admin.token)).assigned).toBe(0);
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
        assigneeIds: [gym2.adminId],
      });
      expect(asignar.statusCode).toBe(400);

      // Mezclado con staff propio también se rechaza todo el pedido.
      const mezclado = await call(owner.token, "POST", "/topics", {
        title: "Mezcla de gimnasios",
        assigneeIds: [owner.id, gym2.adminId],
      });
      expect(mezclado.statusCode).toBe(400);
      expect(await eventTypes(topic.id)).toEqual(["creado"]);
      const asignadosAjenos = await app.db
        .select({ id: schema.officeTopicAssignees.id })
        .from(schema.officeTopicAssignees)
        .where(tenantWhere(schema.officeTopicAssignees, DOS_CTX));
      expect(asignadosAjenos).toHaveLength(0);

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

  it("lista solo owner/admin activos: sin gestion ni coach, sin socios, sin cuentas de TV y sin deshabilitados", async () => {
    const coach = await staff("coach");
    const gestion = await staff("gestion");
    const segundo = await staff("admin", "segundo");
    const tv = await staff("tv");
    const deshabilitado = await staff("admin", "deshabilitado");
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
    expect(ids).toContain(segundo.id);
    expect(ids).not.toContain(coach.id);
    expect(ids).not.toContain(gestion.id);
    expect(ids).not.toContain(tv.id);
    expect(ids).not.toContain(deshabilitado.id);
    expect(ids).not.toContain(member.id);
    expect(lista.find((s) => s.id === segundo.id)?.role).toBe("admin");
    expect(lista.find((s) => s.id === owner.id)).toBeDefined();
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
    expect(abiertos).toEqual([{ id, sourceKey: "staff_shift:4242", branchId }]);
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
