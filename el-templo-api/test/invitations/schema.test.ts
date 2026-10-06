/**
 * Fase 194 (D-04, 194-04) — tabla `invitations` (migración 0255).
 *
 * Prueba que (1) la migración provisiona la DB de test y la tabla se escribe y
 * se lee con `tenantValues` / `tenantWhere`, (2) el aislamiento por tenant
 * funciona (la fila de un gimnasio no se ve desde otro), (3) la fila NUNCA se
 * borra en cascada (FK a users, sin cascade) y (4) `limpiarSegundoGimnasio`
 * limpia una invitación del gimnasio 2 sin reventar por FK.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  createInvitationRow,
  createMemberInPhysicalBranch,
  ensurePhysicalBranch,
  fixtureCtx,
} from "./_helpers";

describe("invitations schema (0255)", () => {
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

  it("inserta y lee una invitación mínima con tenantValues/tenantWhere (status default 'active')", async () => {
    const ctx = fixtureCtx(app);
    const branch = await ensurePhysicalBranch(ctx);
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const invited = await createMemberInPhysicalBranch(ctx);

    const { id } = await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: invited.id,
      branchId: branch.id,
      phoneLast10: "1155550000",
      dni: "30111222",
    });

    const [row] = await app.db
      .select()
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, id),
        ),
      );
    expect(row).toBeDefined();
    expect(row.status).toBe("active");
    expect(row.channel).toBe("self_service");
    expect(row.tenantId).toBe(ctx.tenant.tenantId);
    expect(row.inviterId).toBe(inviter.id);
    expect(row.invitedUserId).toBe(invited.id);
    expect(row.invitedPhoneLast10).toBe("1155550000");
    expect(row.invitedDni).toBe("30111222");
    expect(row.quotaMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(row.accessStartsOn <= row.accessExpiresOn).toBe(true);
    expect(row.subscriptionId).toBeNull();
    expect(row.convertedAt).toBeNull();
    expect(row.voidedAt).toBeNull();
    expect(row.activatedAt).toBeInstanceOf(Date);
  });

  it("aislamiento: la invitación del gimnasio 2 no se ve con el ctx de El Templo (y viceversa)", async () => {
    const templo = fixtureCtx(app);
    const dos = fixtureCtx(app, TENANT_DOS);

    const branchT = await ensurePhysicalBranch(templo);
    const inviterT = await createMemberInPhysicalBranch(templo, {
      status: "activo",
    });
    const invitedT = await createMemberInPhysicalBranch(templo);
    const { id: idTemplo } = await createInvitationRow(templo, {
      inviterId: inviterT.id,
      invitedUserId: invitedT.id,
      branchId: branchT.id,
    });

    const { id: idDos } = await createInvitationRow(dos, {
      inviterId: gym2.socios[0].id,
      invitedUserId: gym2.socios[1].id,
      branchId: gym2.branchId,
    });

    const vistasPorTemplo = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(tenantWhere(schema.invitations, templo.tenant));
    expect(vistasPorTemplo.map((r) => r.id)).toEqual([idTemplo]);

    const vistasPorDos = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(tenantWhere(schema.invitations, dos.tenant));
    expect(vistasPorDos.map((r) => r.id)).toEqual([idDos]);

    // Fila de El Templo buscada con el ctx del gimnasio 2: no aparece.
    const cruzada = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, dos.tenant),
          eq(schema.invitations.id, idTemplo),
        ),
      );
    expect(cruzada).toHaveLength(0);

    // La invitación del gimnasio 2 queda sembrada: limpiarSegundoGimnasio no
    // debe reventar por FK y debe dejar el gimnasio 2 sin invitaciones.
    await expect(limpiarSegundoGimnasio(app)).resolves.toBeUndefined();
    const restantes = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(tenantWhere(schema.invitations, dos.tenant));
    expect(restantes).toHaveLength(0);
  });

  it("la fila nunca se borra en cascada: borrar el invitado o el invitador falla por FK", async () => {
    const ctx = fixtureCtx(app);
    const branch = await ensurePhysicalBranch(ctx);
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const invited = await createMemberInPhysicalBranch(ctx);
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: invited.id,
      branchId: branch.id,
    });

    await expect(
      app.db.execute(sql`DELETE FROM users WHERE id = ${invited.id}`),
    ).rejects.toThrow();
    await expect(
      app.db.execute(sql`DELETE FROM users WHERE id = ${inviter.id}`),
    ).rejects.toThrow();

    const quedan = await app.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.invitedUserId, invited.id),
        ),
      );
    expect(quedan).toHaveLength(1);
  });

  it("la anulación es un estado: status 'voided' conserva la fila", async () => {
    const ctx = fixtureCtx(app);
    const branch = await ensurePhysicalBranch(ctx);
    const inviter = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const invited = await createMemberInPhysicalBranch(ctx);
    const { id } = await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: invited.id,
      branchId: branch.id,
    });

    await app.db
      .update(schema.invitations)
      .set({
        status: "voided",
        voidedAt: new Date(),
        voidedBy: inviter.id,
        voidReason: "test",
      })
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, id),
        ),
      );

    const [row] = await app.db
      .select()
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, id),
        ),
      );
    expect(row.status).toBe("voided");
    expect(row.voidReason).toBe("test");
    expect(row.voidedBy).toBe(inviter.id);
  });
});
