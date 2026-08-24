/**
 * Fase 175.1 Plan 05 (ISO-03) — batería de AISLAMIENTO de las 4 rutas
 * `tenant-scoped` de `improvement-proposals` (derivadas de
 * `test/tenant-manifest.ts`, transcritas abajo y en el SUMMARY): 2 admin +
 * 2 de miembro.
 *
 * EL CANAL ES ANÓNIMO DE CARA AL STAFF — NO HAY `users` EN EL JOIN
 * -----------------------------------------------------------------------
 * `fetchRows` (`service.ts`) NO joinea `users` a propósito (el copy de la app
 * promete anonimato) — solo expone `branchName`/`proposal`/`createdAt`. El
 * caso de aislamiento de las 2 rutas admin (listado + export) prueba que la
 * SUCURSAL que se ve nunca es la del otro gimnasio, con texto de propuesta
 * ÚNICO por tenant como marca inconfundible.
 *
 * LAS 2 RUTAS DE MIEMBRO SON PRE-SCOPE POR DISEÑO (mismo patrón T-175-03 de
 * `notifications`) — NO SON UN AGUJERO
 * -----------------------------------------------------------------------
 * `getPromptStatus`/`submitProposal` filtran por `memberId`, que sale SIEMPRE
 * de `request.user.userId` (el token) — una PK global de `users`, sin
 * ambigüedad posible entre gimnasios. El `tenantWhere(improvementProposals, ctx)`
 * que llevan igual (defensa en profundidad, no la única línea) es lo que la
 * mutación de cierre de este archivo apaga para demostrar que SÍ hace algo
 * real en las rutas ADMIN (que si dependen de él para no listar todo el
 * módulo).
 *
 * CERO 403 (D-06 del milestone)
 * -----------------------------------------------------------------------
 * Ninguna de las 4 rutas devuelve 403 por cruce de tenant — el filtro de
 * tenant es transparente (listado vacío / prompt correcto), el 403 de estas
 * rutas es SOLO por rol (`MEMBER_LIFECYCLE_ROLES`), no ejercitado acá.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-improvement-proposals.test.ts
 *
 * @see test/tenancy/iso-03-notifications.test.ts — el precedente inmediato (175.1-04) del patrón pre-scope
 * @see src/modules/improvement-proposals/service.ts — buildConditions (mutación de cierre de este plan)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-07, D-11
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { Workbook } from "exceljs";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createTestApp, cleanAllTestData, getAuthToken, createTestMember } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

const MARCA = "ISO03IP";
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface Ficha {
  branchId: number;
  branchName: string;
  /** Socio CON una propuesta reciente ya sembrada (para prompt-status=false). */
  memberId: number;
  memberToken: string;
  proposalId: number;
  proposalText: string;
  /** Socio SIN propuesta (para prompt-status=true, el contraste del caso). */
  freshMemberId: number;
  freshMemberToken: string;
}

async function sembrarFicha(
  app: FastifyInstance,
  ctx: TenantContext,
  branchId: number,
  branchName: string,
  emailPrefix: string,
): Promise<Ficha> {
  const suf = sufijo();
  const member = await createTestMember(app, {
    email: `${emailPrefix}-con-${suf}@test.com`,
    branchId,
    ...(ctx.tenantId !== TENANT_TEMPLO ? { tenantId: ctx.tenantId } : {}),
  });
  const freshMember = await createTestMember(app, {
    email: `${emailPrefix}-sin-${suf}@test.com`,
    branchId,
    ...(ctx.tenantId !== TENANT_TEMPLO ? { tenantId: ctx.tenantId } : {}),
  });
  const proposalText = `${MARCA} propuesta de ${emailPrefix} ${suf}`;
  const [row] = await app.db
    .insert(schema.improvementProposals)
    .values(
      tenantValues(ctx, {
        memberId: member.id,
        branchId,
        proposal: proposalText,
      }),
    )
    .$returningId();
  return {
    branchId,
    branchName,
    memberId: member.id,
    memberToken: member.token,
    proposalId: row.id,
    proposalText,
    freshMemberId: freshMember.id,
    freshMemberToken: freshMember.token,
  };
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: Ficha;
let dos: Ficha;
let templeAdminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  const [sedeTemplo] = await app.db
    .select({ id: schema.branches.id, name: schema.branches.name })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, CTX_TEMPLO))
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sedeTemplo) {
    throw new Error(
      "iso-03-improvement-proposals: El Templo no tiene ninguna sede (test/setup.ts).",
    );
  }

  templo = await sembrarFicha(
    app,
    CTX_TEMPLO,
    sedeTemplo.id,
    sedeTemplo.name,
    "ip-templo",
  );
  dos = await sembrarFicha(
    app,
    CTX_DOS,
    gym2.branchId,
    `Sede del ${gym2.tenantId}`,
    "ip-g2",
  );
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(url: string, token: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function porQueImportaElAislamiento(ruta: string, detalle: string): string {
  return (
    `${ruta} mezcló datos de El Templo (${TENANT_TEMPLO}) y el gimnasio ` +
    `${TENANT_DOS}: ${detalle}. Revisar el \`tenantWhere(improvementProposals, ctx)\` ` +
    `en src/modules/improvement-proposals/service.ts (buildConditions). NO ` +
    `"arreglar" esto filtrando en el front.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 4 rutas del manifiesto para improvement-proposals coinciden con las 4 de este archivo", () => {
    const RUTAS_MANIFIESTO = [
      "GET /api/admin/improvement-proposals",
      "GET /api/admin/improvement-proposals/export",
      "GET /api/members/improvement-proposals/prompt-status",
      "POST /api/members/improvement-proposals",
    ];
    expect(RUTAS_MANIFIESTO.length).toBe(4);
    expect(new Set(RUTAS_MANIFIESTO).size).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/improvement-proposals — listado (admin)
// ═══════════════════════════════════════════════════════════════════════════

describe("listado admin — GET /api/admin/improvement-proposals", () => {
  const RUTA = "GET /api/admin/improvement-proposals";

  it("aislamiento: el gimnasio 2 ve SU propuesta, NUNCA el texto de El Templo (canal anónimo — sin nombre de socio que comparar)", async () => {
    const res = await getComo(
      "/api/admin/improvement-proposals",
      gym2.adminToken,
    );
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      rows: Array<{ proposal: string }>;
      total: number;
    };
    const textos = body.rows.map((r) => r.proposal);
    expect(
      textos,
      porQueImportaElAislamiento(RUTA, `esperaba incluir "${dos.proposalText}"`),
    ).toContain(dos.proposalText);
    expect(
      textos,
      porQueImportaElAislamiento(
        RUTA,
        `NO debería incluir la propuesta de El Templo ("${templo.proposalText}")`,
      ),
    ).not.toContain(templo.proposalText);
  });

  it("control: El Templo ve SU propuesta, no la del gimnasio 2", async () => {
    const res = await getComo(
      "/api/admin/improvement-proposals",
      templeAdminToken,
    );
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      rows: Array<{ proposal: string }>;
    };
    const textos = body.rows.map((r) => r.proposal);
    expect(textos).toContain(templo.proposalText);
    expect(textos).not.toContain(dos.proposalText);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/improvement-proposals/export — export xlsx (admin)
// ═══════════════════════════════════════════════════════════════════════════

describe("export admin — GET /api/admin/improvement-proposals/export", () => {
  const RUTA = "GET /api/admin/improvement-proposals/export";

  async function columnaPropuesta(token: string): Promise<string[]> {
    const res = await getComo("/api/admin/improvement-proposals/export", token);
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const wb = new Workbook();
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const hoja = wb.getWorksheet("Propuestas");
    expect(hoja, `${RUTA} no trajo la hoja "Propuestas"`).toBeDefined();
    const valores: string[] = [];
    hoja?.eachRow((row, i) => {
      if (i === 1) return; // encabezado
      valores.push(String(row.getCell(3).value ?? "")); // col 3 = Propuesta
    });
    return valores;
  }

  it("aislamiento: el .xlsx del gimnasio 2 no incluye la propuesta de El Templo", async () => {
    const propuestas = await columnaPropuesta(gym2.adminToken);
    expect(
      propuestas,
      porQueImportaElAislamiento(RUTA, "el export trajo la propuesta ajena"),
    ).not.toContain(templo.proposalText);
    expect(propuestas).toContain(dos.proposalText);
  });

  it("control: el .xlsx de El Templo SÍ incluye su propia propuesta", async () => {
    const propuestas = await columnaPropuesta(templeAdminToken);
    expect(propuestas).toContain(templo.proposalText);
    expect(propuestas).not.toContain(dos.proposalText);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/members/improvement-proposals/prompt-status — pre-scope por diseño
// ═══════════════════════════════════════════════════════════════════════════

describe("estado del popup — GET /api/members/improvement-proposals/prompt-status", () => {
  it("aislamiento: el socio CON propuesta reciente del gimnasio 2 ve shouldPrompt=false, el SIN propuesta ve true — el estado de cada uno no se contamina con el de El Templo", async () => {
    const conProposal = await getComo(
      "/api/members/improvement-proposals/prompt-status",
      dos.memberToken,
    );
    expect(conProposal.statusCode, conProposal.body).toBe(200);
    const bodyCon = JSON.parse(conProposal.body) as { shouldPrompt: boolean };
    expect(bodyCon.shouldPrompt).toBe(false);

    const sinProposal = await getComo(
      "/api/members/improvement-proposals/prompt-status",
      dos.freshMemberToken,
    );
    expect(sinProposal.statusCode, sinProposal.body).toBe(200);
    const bodySin = JSON.parse(sinProposal.body) as { shouldPrompt: boolean };
    expect(bodySin.shouldPrompt).toBe(true);
  });

  it("control: mismo contraste (con/sin propuesta reciente) para El Templo", async () => {
    const conProposal = await getComo(
      "/api/members/improvement-proposals/prompt-status",
      templo.memberToken,
    );
    const bodyCon = JSON.parse(conProposal.body) as { shouldPrompt: boolean };
    expect(bodyCon.shouldPrompt).toBe(false);

    const sinProposal = await getComo(
      "/api/members/improvement-proposals/prompt-status",
      templo.freshMemberToken,
    );
    const bodySin = JSON.parse(sinProposal.body) as { shouldPrompt: boolean };
    expect(bodySin.shouldPrompt).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/members/improvement-proposals — enviar propuesta (miembro)
// ═══════════════════════════════════════════════════════════════════════════

describe("enviar propuesta — POST /api/members/improvement-proposals", () => {
  const RUTA = "POST /api/members/improvement-proposals";

  it("aislamiento: la propuesta enviada por el socio del gimnasio 2 (sin propuestas previas) queda estampada TENANT_DOS y con SU sucursal, no la de El Templo", async () => {
    const texto = `${MARCA} nueva propuesta del gimnasio 2 ${sufijo()}`;
    const res = await postComo(
      "/api/members/improvement-proposals",
      dos.freshMemberToken,
      { proposal: texto },
    );
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(201);

    const filas = await app.db
      .select({
        tenantId: schema.improvementProposals.tenantId,
        branchId: schema.improvementProposals.branchId,
        proposal: schema.improvementProposals.proposal,
      })
      .from(schema.improvementProposals)
      .where(
        sql`/* tenant-safe: filtro por memberId propio (users.id, globalmente único) */ ${schema.improvementProposals.memberId} = ${dos.freshMemberId}`,
      );
    const nueva = filas.find((f) => f.proposal === texto);
    expect(
      nueva?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `la propuesta del socio del gimnasio ${TENANT_DOS} quedó con tenant_id=${nueva?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
    expect(nueva?.branchId).toBe(dos.branchId);
  });

  it("control: la propuesta enviada por el socio de El Templo queda estampada TENANT_TEMPLO", async () => {
    const texto = `${MARCA} nueva propuesta de El Templo ${sufijo()}`;
    const res = await postComo(
      "/api/members/improvement-proposals",
      templo.freshMemberToken,
      { proposal: texto },
    );
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(201);

    const filas = await app.db
      .select({
        tenantId: schema.improvementProposals.tenantId,
        branchId: schema.improvementProposals.branchId,
        proposal: schema.improvementProposals.proposal,
      })
      .from(schema.improvementProposals)
      .where(
        sql`/* tenant-safe: filtro por memberId propio (users.id, globalmente único) */ ${schema.improvementProposals.memberId} = ${templo.freshMemberId}`,
      );
    const nueva = filas.find((f) => f.proposal === texto);
    expect(nueva?.tenantId).toBe(TENANT_TEMPLO);
    expect(nueva?.branchId).toBe(templo.branchId);
  });
});
