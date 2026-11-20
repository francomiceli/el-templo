/**
 * Bandeja de Invitaciones como lista de seguimiento (`GET /api/admin/referrals/invitations`) y
 * su contador (`GET .../pending-count`):
 *   - campos nuevos por fila: `followStatus`, `endReason`, `endedOn`, `followup`, `lastNote`;
 *   - filtro `followStatus`, orden por prioridad y total paginado exacto;
 *   - `pending-count`: `open` vs `uncontacted`, y que baja al registrar el primer mensaje.
 *
 * Servicio + HTTP contra MySQL real por worker. Fechas relativas a `todayInTz(<tz de la
 * sede>)`; ningún id de `users` hardcodeado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues } from "../../src/modules/shared/tenant";
import { InvitationLeadList } from "../../src/modules/referrals/invitation-lead-list";
import {
  createInvitedUser,
  createInviterWithCode,
  fixtureCtx,
  getAdminUserId,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";
import {
  BASE,
  attend,
  getLeads,
  getPendingCount,
  ownerToken,
  reasonIdByLabel,
  seedFollowupFixtures,
  sendJson,
} from "./_followup-helpers";

describe("Bandeja de invitados como lista de seguimiento", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let env: InvitedUserEnv;
  let list: InvitationLeadList;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    list = new InvitationLeadList(app.db);
    token = await ownerToken(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    env = (await seedFollowupFixtures(ctx)).env;
  });

  /** Seguimiento manual puesto directo en la tabla. */
  async function insertFollowup(
    subscriptionId: number,
    userId: number,
    values: {
      messageCount?: number;
      manualStatus?: "en_proceso" | "no_renovo";
      reasonId?: number | null;
      reasonNote?: string | null;
      lastMessageAt?: Date | null;
    },
  ): Promise<void> {
    await app.db.insert(schema.renewalFollowups).values(
      tenantValues(ctx.tenant, {
        subscriptionId,
        userId,
        messageCount: values.messageCount ?? 0,
        manualStatus: values.manualStatus ?? "en_proceso",
        reasonId: values.reasonId ?? null,
        reasonNote: values.reasonNote ?? null,
        lastMessageAt: values.lastMessageAt ?? null,
      }),
    );
  }

  // ─── Forma de la fila ──────────────────────────────────────────────────

  it("invitado vigente y sin gestión: con_accesos, sin motivo de fin, seguimiento en cero y sin nota", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invited = await createInvitedUser(ctx, env, inviter.id, {
      remaining: 3,
    });

    const res = await getLeads(app, token);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    const [row] = res.body.rows;
    expect(row.invitationId).toBe(invited.invitationId);
    // `stage` no cambia: se sigue devolviendo igual que antes.
    expect(row.stage).toBe("entrenando");
    expect(row.followStatus).toBe("con_accesos");
    expect(row.endReason).toBeNull();
    expect(row.endedOn).toBeNull();
    expect(row.followup).toEqual({
      subscriptionId: invited.subscriptionId,
      manualStatus: "en_proceso",
      messageCount: 0,
      lastMessageAt: null,
      reasonId: null,
      reasonLabel: null,
      reasonNote: null,
    });
    expect(row.lastNote).toBeNull();
  });

  it("seguimiento manual: mensajes, motivo (con su etiqueta) y nota del motivo viajan en la fila", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invited = await createInvitedUser(ctx, env, inviter.id, {});
    const reasonId = await reasonIdByLabel(ctx, "Precio");
    // Sin milisegundos: la columna TIMESTAMP es de precisión 0.
    const lastMessageAt = new Date(
      Math.floor(Date.now() / 1000) * 1000 - 60 * 60 * 1000,
    );
    await insertFollowup(invited.subscriptionId, invited.userId, {
      messageCount: 2,
      manualStatus: "no_renovo",
      reasonId,
      reasonNote: "Lo ve caro",
      lastMessageAt,
    });

    const [row] = (await getLeads(app, token)).body.rows;

    expect(row.followStatus).toBe("no_sigue");
    expect(row.followup).toEqual({
      subscriptionId: invited.subscriptionId,
      manualStatus: "no_renovo",
      messageCount: 2,
      lastMessageAt: lastMessageAt.toISOString(),
      reasonId,
      reasonLabel: "Precio",
      reasonNote: "Lo ve caro",
    });
  });

  it("lastNote: la nota más reciente del invitado, con su autor (la misma forma que Renovaciones)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const invited = await createInvitedUser(ctx, env, inviter.id, {});
    const other = await createInvitedUser(ctx, env, inviter.id, {});
    const adminId = await getAdminUserId(ctx);
    await app.db.insert(schema.memberNotes).values([
      tenantValues(ctx.tenant, {
        userId: invited.userId,
        authorId: adminId,
        content: "Primer contacto",
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      }),
      tenantValues(ctx.tenant, {
        userId: invited.userId,
        authorId: adminId,
        content: "Pidió que lo llamemos el lunes",
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      }),
    ]);

    const page = await getLeads(app, token);

    const row = page.body.rows.find(
      (r) => r.invitationId === invited.invitationId,
    );
    expect(row?.lastNote).toEqual({
      content: "Pidió que lo llamemos el lunes",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      authorName: expect.any(String),
    });
    // El otro invitado no tiene notas: no hereda la de nadie.
    expect(
      page.body.rows.find((r) => r.invitationId === other.invitationId)
        ?.lastNote,
    ).toBeNull();
  });

  // ─── endReason / endedOn ───────────────────────────────────────────────

  describe("endReason y endedOn", () => {
    it("plazo: venció con accesos sin usar -> endedOn = access_expires_on", async () => {
      const inviter = await createInviterWithCode(ctx);
      await createInvitedUser(ctx, env, inviter.id, {
        expiresOffset: -2,
        remaining: 4,
      });

      const [row] = (await getLeads(app, token)).body.rows;

      expect(row.followStatus).toBe("para_contactar");
      expect(row.endReason).toBe("plazo");
      expect(row.endedOn).toBe(addDays(env.today, -2));
    });

    it("agotados con asistencia: endedOn = la última asistencia DENTRO de la invitación", async () => {
      const inviter = await createInviterWithCode(ctx);
      // Activada hace 5 días: ventana [hoy-5, hoy+3].
      const invited = await createInvitedUser(ctx, env, inviter.id, {
        remaining: 0,
        activatedDaysAgo: 5,
        expiresOffset: 3,
      });
      await attend(ctx, invited.userId, env.branchId, addDays(env.today, -4));
      await attend(ctx, invited.userId, env.branchId, addDays(env.today, -2));
      // Fuera de la ventana (antes del inicio y después del vencimiento): no cuentan.
      await attend(ctx, invited.userId, env.branchId, addDays(env.today, -9));
      await attend(ctx, invited.userId, env.branchId, addDays(env.today, 6));

      const [row] = (await getLeads(app, token)).body.rows;

      expect(row.followStatus).toBe("para_contactar");
      expect(row.endReason).toBe("agotados");
      expect(row.endedOn).toBe(addDays(env.today, -2));
    });

    it("agotados sin asistencia registrada (los no-shows también descuentan): cae a access_expires_on", async () => {
      const inviter = await createInviterWithCode(ctx);
      await createInvitedUser(ctx, env, inviter.id, {
        remaining: 0,
        expiresOffset: 2,
      });

      const [row] = (await getLeads(app, token)).body.rows;

      expect(row.endReason).toBe("agotados");
      expect(row.endedOn).toBe(addDays(env.today, 2));
    });

    it("agotados y además vencido: sigue siendo 'agotados' (classes_remaining = 0 manda)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const invited = await createInvitedUser(ctx, env, inviter.id, {
        remaining: 0,
        expiresOffset: -2,
        activatedDaysAgo: 6,
      });
      await attend(ctx, invited.userId, env.branchId, addDays(env.today, -3));

      const [row] = (await getLeads(app, token)).body.rows;

      expect(row.endReason).toBe("agotados");
      expect(row.endedOn).toBe(addDays(env.today, -3));
    });

    it("las asistencias de OTRO invitado no cuentan para el endedOn", async () => {
      const inviter = await createInviterWithCode(ctx);
      const a = await createInvitedUser(ctx, env, inviter.id, {
        remaining: 0,
        expiresOffset: 3,
      });
      const b = await createInvitedUser(ctx, env, inviter.id, {
        remaining: 0,
        expiresOffset: 3,
      });
      await attend(ctx, b.userId, env.branchId, addDays(env.today, -1));

      const page = await getLeads(app, token);

      const rowA = page.body.rows.find(
        (r) => r.invitationId === a.invitationId,
      );
      expect(rowA?.endedOn).toBe(addDays(env.today, 3));
    });
  });

  // ─── Filtro followStatus ───────────────────────────────────────────────

  it("filtro followStatus: cada estado devuelve solo sus filas (y el filtro de etapa se mantiene)", async () => {
    const inviter = await createInviterWithCode(ctx);
    const conAccesos = await createInvitedUser(ctx, env, inviter.id, {});
    const paraContactar = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: -1,
    });
    const compro = await createInvitedUser(ctx, env, inviter.id, {
      converted: true,
      expiresOffset: -2,
    });
    const comproTarde = await createInvitedUser(ctx, env, inviter.id, {
      purchase: "vigente",
      expiresOffset: -1,
    });
    const noSigue = await createInvitedUser(ctx, env, inviter.id, {});
    await insertFollowup(noSigue.subscriptionId, noSigue.userId, {
      manualStatus: "no_renovo",
      reasonId: await reasonIdByLabel(ctx, "Viaje"),
    });

    const ids = async (query: string): Promise<number[]> =>
      (await getLeads(app, token, query)).body.rows
        .map((r) => r.invitationId)
        .sort((x, y) => x - y);
    const sorted = (...xs: number[]) => xs.sort((x, y) => x - y);

    expect(await ids("?followStatus=con_accesos")).toEqual(
      sorted(conAccesos.invitationId),
    );
    expect(await ids("?followStatus=para_contactar")).toEqual(
      sorted(paraContactar.invitationId),
    );
    expect(await ids("?followStatus=compro")).toEqual(
      sorted(compro.invitationId),
    );
    expect(await ids("?followStatus=compro_tarde")).toEqual(
      sorted(comproTarde.invitationId),
    );
    expect(await ids("?followStatus=no_sigue")).toEqual(
      sorted(noSigue.invitationId),
    );
    // El filtro de etapa existente sigue andando y se combina con el nuevo.
    expect(await ids("?stage=convertido")).toEqual(sorted(compro.invitationId));
    expect(await ids("?stage=vencido&followStatus=para_contactar")).toEqual(
      sorted(paraContactar.invitationId),
    );
    expect((await getLeads(app, token, "?followStatus=nada")).statusCode).toBe(
      400,
    );
  });

  it("paginación exacta con followStatus: 30 invitaciones, 12 para_contactar repartidas -> total 12 y páginas de 5, 5 y 2", async () => {
    const inviter = await createInviterWithCode(ctx);
    const contactIdx = new Set([0, 2, 5, 7, 9, 12, 14, 17, 20, 22, 25, 28]);
    const contactIds = new Set<number>();
    for (let n = 0; n < 30; n++) {
      if (contactIdx.has(n)) {
        const row = await createInvitedUser(ctx, env, inviter.id, {
          expiresOffset: n % 2 === 0 ? -1 : 3,
          remaining: n % 2 === 0 ? 4 : 0,
        });
        contactIds.add(row.invitationId);
      } else {
        // El resto: vigentes y convertidos.
        await createInvitedUser(ctx, env, inviter.id, {
          converted: n % 3 === 2,
        });
      }
    }
    expect(contactIds.size).toBe(12);

    const seen: number[] = [];
    const sizes: number[] = [];
    for (const page of [1, 2, 3]) {
      const res = await getLeads(
        app,
        token,
        `?followStatus=para_contactar&page=${page}&pageSize=5`,
      );
      expect(res.body.total).toBe(12);
      expect(
        res.body.rows.every((r) => r.followStatus === "para_contactar"),
      ).toBe(true);
      sizes.push(res.body.rows.length);
      seen.push(...res.body.rows.map((r) => r.invitationId));
    }
    expect(sizes).toEqual([5, 5, 2]);
    expect(new Set(seen)).toEqual(contactIds);

    const beyond = await getLeads(
      app,
      token,
      "?followStatus=para_contactar&page=4&pageSize=5",
    );
    expect(beyond.body.rows).toEqual([]);
    expect(beyond.body.total).toBe(12);
  });

  // ─── Orden ─────────────────────────────────────────────────────────────

  it("orden: para_contactar, después con_accesos, después el resto; dentro de cada grupo por COALESCE(endedOn, vencimiento) desc", async () => {
    const inviter = await createInviterWithCode(ctx);
    // para_contactar: plazo vencido ayer (endedOn hoy-1).
    const a = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: -1,
    });
    // para_contactar: plazo vencido hace 5 días.
    const b = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: -5,
    });
    // para_contactar: agotado, vence en 3 días pero su última asistencia fue hoy-2:
    // ordena por el endedOn (hoy-2), NO por el vencimiento (hoy+3).
    const g = await createInvitedUser(ctx, env, inviter.id, {
      remaining: 0,
      expiresOffset: 3,
      activatedDaysAgo: 5,
    });
    await attend(ctx, g.userId, env.branchId, addDays(env.today, -2));
    // con_accesos: vencen en 10 y en 2 días.
    const c = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: 10,
    });
    const d = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: 2,
    });
    // El resto: no_sigue (vencimiento +3) y compro (vencimiento -2).
    const f = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: 3,
    });
    await insertFollowup(f.subscriptionId, f.userId, {
      manualStatus: "no_renovo",
      reasonId: await reasonIdByLabel(ctx, "Otro"),
    });
    const e = await createInvitedUser(ctx, env, inviter.id, {
      converted: true,
      expiresOffset: -2,
    });

    const res = await getLeads(app, token);

    expect(res.body.rows.map((r) => r.invitationId)).toEqual([
      a.invitationId,
      g.invitationId,
      b.invitationId,
      c.invitationId,
      d.invitationId,
      f.invitationId,
      e.invitationId,
    ]);
  });

  it("empate de fecha: desempata por id descendente", async () => {
    const inviter = await createInviterWithCode(ctx);
    const first = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: -3,
    });
    const second = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: -3,
    });

    const res = await getLeads(app, token);

    expect(res.body.rows.map((r) => r.invitationId)).toEqual([
      second.invitationId,
      first.invitationId,
    ]);
  });

  // ─── pending-count ─────────────────────────────────────────────────────

  describe("GET /invitations/pending-count", () => {
    it("sin invitaciones: todo en 0", async () => {
      expect(await getPendingCount(app, token)).toEqual({
        statusCode: 200,
        body: { open: 0, uncontacted: 0, selfActivatedUncontacted: 0 },
      });
    });

    it("open = invitaciones para_contactar; uncontacted = las de open sin ningún mensaje registrado", async () => {
      const inviter = await createInviterWithCode(ctx);
      // para_contactar sin fila de seguimiento.
      await createInvitedUser(ctx, env, inviter.id, { expiresOffset: -1 });
      // para_contactar con fila de seguimiento pero 0 mensajes.
      const zero = await createInvitedUser(ctx, env, inviter.id, {
        remaining: 0,
      });
      await insertFollowup(zero.subscriptionId, zero.userId, {
        messageCount: 0,
      });
      // para_contactar con 1 y con 3 mensajes (ya contactados).
      for (const messageCount of [1, 3]) {
        const row = await createInvitedUser(ctx, env, inviter.id, {
          expiresOffset: -2,
        });
        await insertFollowup(row.subscriptionId, row.userId, { messageCount });
      }
      // Nada de esto es "para contactar": vigente, convertido, compró tarde y no_sigue.
      // (La vigente sí suma en `selfActivatedUncontacted`: autogestión, 0 mensajes.)
      await createInvitedUser(ctx, env, inviter.id, {});
      await createInvitedUser(ctx, env, inviter.id, {
        converted: true,
        expiresOffset: -2,
      });
      await createInvitedUser(ctx, env, inviter.id, {
        purchase: "vigente",
        expiresOffset: -2,
      });
      const noSigue = await createInvitedUser(ctx, env, inviter.id, {
        expiresOffset: -2,
      });
      await insertFollowup(noSigue.subscriptionId, noSigue.userId, {
        manualStatus: "no_renovo",
        reasonId: await reasonIdByLabel(ctx, "Precio"),
      });
      // Una anulada tampoco cuenta.
      await createInvitedUser(ctx, env, inviter.id, {
        expiresOffset: -2,
        status: "voided",
      });

      const res = await getPendingCount(app, token);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        open: 4,
        uncontacted: 2,
        selfActivatedUncontacted: 1,
      });
      // Coherente con la bandeja: open == total de la bandeja filtrada por para_contactar.
      const filtered = await getLeads(
        app,
        token,
        "?followStatus=para_contactar",
      );
      expect(filtered.body.total).toBe(res.body.open);
      expect((await list.countPending(ctx.tenant)).open).toBe(res.body.open);
    });

    it("baja al registrar el primer mensaje (uncontacted) y deja de contar al pasar a no_renovo (open)", async () => {
      const inviter = await createInviterWithCode(ctx);
      const a = await createInvitedUser(ctx, env, inviter.id, {
        expiresOffset: -1,
      });
      const b = await createInvitedUser(ctx, env, inviter.id, {
        expiresOffset: -1,
      });
      expect((await getPendingCount(app, token)).body).toEqual({
        open: 2,
        uncontacted: 2,
        selfActivatedUncontacted: 0,
      });

      const first = await sendJson(
        app,
        "PATCH",
        `${BASE}/${a.invitationId}/followup`,
        token,
        { messageCount: 1 },
      );
      expect(first.statusCode, first.raw).toBe(200);
      expect((await getPendingCount(app, token)).body).toEqual({
        open: 2,
        uncontacted: 1,
        selfActivatedUncontacted: 0,
      });

      const closed = await sendJson(
        app,
        "PATCH",
        `${BASE}/${b.invitationId}/followup`,
        token,
        {
          manualStatus: "no_renovo",
          reasonId: await reasonIdByLabel(ctx, "Precio"),
        },
      );
      expect(closed.statusCode, closed.raw).toBe(200);
      expect((await getPendingCount(app, token)).body).toEqual({
        open: 1,
        uncontacted: 0,
        selfActivatedUncontacted: 0,
      });
    });

    it("selfActivatedUncontacted = autogestionadas con accesos y sin ningún mensaje (las asistidas, las ya contactadas, las vencidas y las anuladas no)", async () => {
      const inviter = await createInviterWithCode(ctx);
      // Cuentan: autogestión con accesos, sin fila de seguimiento y con fila en 0 mensajes.
      await createInvitedUser(ctx, env, inviter.id, {});
      const zero = await createInvitedUser(ctx, env, inviter.id, {});
      await insertFollowup(zero.subscriptionId, zero.userId, {
        messageCount: 0,
      });
      // También cuenta si ya entrenó una vez y le quedan accesos.
      await createInvitedUser(ctx, env, inviter.id, { remaining: 3 });
      // No cuentan: asistida (la cargó el staff), ya contactada, vencida (va a
      // `uncontacted`), compró y anulada.
      await createInvitedUser(ctx, env, inviter.id, { channel: "assisted" });
      const contacted = await createInvitedUser(ctx, env, inviter.id, {});
      await insertFollowup(contacted.subscriptionId, contacted.userId, {
        messageCount: 1,
      });
      await createInvitedUser(ctx, env, inviter.id, { expiresOffset: -1 });
      await createInvitedUser(ctx, env, inviter.id, { converted: true });
      await createInvitedUser(ctx, env, inviter.id, { status: "voided" });

      const res = await getPendingCount(app, token);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        open: 1,
        uncontacted: 1,
        selfActivatedUncontacted: 3,
      });
      expect(
        (await list.countPending(ctx.tenant)).selfActivatedUncontacted,
      ).toBe(3);
    });

    it("selfActivatedUncontacted baja al registrar el primer mensaje desde la bandeja", async () => {
      const inviter = await createInviterWithCode(ctx);
      const fresh = await createInvitedUser(ctx, env, inviter.id, {});
      expect(
        (await getPendingCount(app, token)).body.selfActivatedUncontacted,
      ).toBe(1);

      const res = await sendJson(
        app,
        "PATCH",
        `${BASE}/${fresh.invitationId}/followup`,
        token,
        { messageCount: 1 },
      );
      expect(res.statusCode, res.raw).toBe(200);
      expect((await getPendingCount(app, token)).body).toEqual({
        open: 0,
        uncontacted: 0,
        selfActivatedUncontacted: 0,
      });
    });
  });
});
