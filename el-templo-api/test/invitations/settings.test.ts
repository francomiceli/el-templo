/**
 * Fase 194 Plan 07 (D-10c, D-09, D-11, D-12, D-13, T-194-21..24) — parámetros
 * del programa de Invitaciones en `tenant_settings` y su API
 * `GET/PUT /api/admin/settings/invitations`.
 *
 * Servicio (`invitation-settings.ts`) + HTTP contra MySQL real por worker.
 * Este archivo NO llama `cleanAllTestData` en cada test: crea sus usuarios staff
 * una vez y solo resetea su propio namespace (`invitations.%`) y las dos fuentes
 * globales de solo lectura (`aura_config['referral']`, `system_settings`).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  createTestMember,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import { tenantSettings, users } from "../../src/db/schema";
import {
  discountCapKey,
  getDiscountCapAmount,
  getInvitationSettings,
  INVITATION_SETTING_DEFAULTS,
  INVITATION_SETTINGS_PREFIX,
  invitationSettingKey,
  setInvitationSettings,
} from "../../src/modules/referrals/invitation-settings";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const URL = "/api/admin/settings/invitations";

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let ctxDos: TenantContext;
let ownerToken: string;
let gestionToken: string;
let recepcionToken: string;
let coachToken: string;
let memberToken: string;

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

async function http(
  method: "GET" | "PUT",
  token: string | null,
  payload?: Record<string, unknown>,
) {
  const res = await app.inject({
    method,
    url: URL,
    headers: token ? auth(token) : {},
    payload,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function countRows(ctx: TenantContext): Promise<number> {
  const rows = await app.db
    .select({ id: tenantSettings.id })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        like(tenantSettings.settingKey, `${INVITATION_SETTINGS_PREFIX}%`),
      ),
    );
  return rows.length;
}

async function seedGlobalSources(
  perLink: number,
  cap: number,
): Promise<void> {
  // cleanAllTestData de otros archivos vacía estas dos tablas: se resiembran.
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', ${perLink})
        ON DUPLICATE KEY UPDATE default_amount = ${perLink}`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', ${String(cap)})
        ON DUPLICATE KEY UPDATE setting_value = ${String(cap)}`,
  );
}

async function wipeInvitationSettings(): Promise<void> {
  await app.db
    .delete(tenantSettings)
    .where(like(tenantSettings.settingKey, `${INVITATION_SETTINGS_PREFIX}%`));
}

beforeAll(async () => {
  app = await createTestApp();
  const suf = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const [owner] = await app.db
    .select({ branchId: users.branchId })
    .from(users)
    .where(
      and(
        tenantWhere(users, CTX_TEMPLO),
        eq(users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  const branchId = owner.branchId ?? 1;
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  for (const role of ["gestion", "recepcion", "coach"] as const) {
    await createStaffUser(app, {
      email: `${role}-inv-settings-${suf}@test.local`,
      password: "pass123456",
      firstName: role,
      lastName: "InvSettings",
      role,
      branchId,
    });
  }
  gestionToken = await getAuthToken(
    app,
    `gestion-inv-settings-${suf}@test.local`,
    "pass123456",
  );
  recepcionToken = await getAuthToken(
    app,
    `recepcion-inv-settings-${suf}@test.local`,
    "pass123456",
  );
  coachToken = await getAuthToken(
    app,
    `coach-inv-settings-${suf}@test.local`,
    "pass123456",
  );
  memberToken = (await createTestMember(app, { branchId })).token;

  gym2 = await seedSecondTenant(app);
  ctxDos = { tenantId: gym2.tenantId };
});

afterAll(async () => {
  await wipeInvitationSettings();
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

beforeEach(async () => {
  await wipeInvitationSettings();
  await seedGlobalSources(10, 40);
});

describe("getInvitationSettings (servicio)", () => {
  it("sin filas devuelve los defaults + las fuentes existentes de solo lectura", async () => {
    const s = await getInvitationSettings(app.db, CTX_TEMPLO, app.log);
    expect(s).toEqual({
      monthlyQuota: 2,
      accessBusinessDays: 10,
      reinviteWindowDays: 90,
      exMemberInactivityMonths: 6,
      latePurchaseWindowDays: 30,
      inviteePercent: 10,
      discountCapAmount: { AR: null, ES: null },
      perLinkPercent: 10,
      maxPercentCap: 40,
    });
    expect(INVITATION_SETTING_DEFAULTS.monthlyQuota).toBe(2);
  });

  it("perLinkPercent y maxPercentCap siguen leyendo aura_config y system_settings", async () => {
    await seedGlobalSources(15, 30);
    const s = await getInvitationSettings(app.db, CTX_TEMPLO, app.log);
    expect(s.perLinkPercent).toBe(15);
    expect(s.maxPercentCap).toBe(30);
  });

  it("un valor corrupto o fuera de rango en la base cae al default (fail-closed)", async () => {
    await app.db.insert(tenantSettings).values([
      tenantValues(CTX_TEMPLO, {
        settingKey: invitationSettingKey("monthlyQuota"),
        settingValue: "x",
      }),
      tenantValues(CTX_TEMPLO, {
        settingKey: invitationSettingKey("accessBusinessDays"),
        settingValue: "999",
      }),
      tenantValues(CTX_TEMPLO, {
        settingKey: invitationSettingKey("inviteePercent"),
        settingValue: "-5",
      }),
      tenantValues(CTX_TEMPLO, {
        settingKey: invitationSettingKey("reinviteWindowDays"),
        settingValue: "45",
      }),
      tenantValues(CTX_TEMPLO, {
        settingKey: discountCapKey("AR"),
        settingValue: "abc",
      }),
      tenantValues(CTX_TEMPLO, {
        settingKey: discountCapKey("ES"),
        settingValue: "0",
      }),
    ]);
    const s = await getInvitationSettings(app.db, CTX_TEMPLO, app.log);
    expect(s.monthlyQuota).toBe(2);
    expect(s.accessBusinessDays).toBe(10);
    expect(s.inviteePercent).toBe(10);
    // Un valor sano sí se respeta.
    expect(s.reinviteWindowDays).toBe(45);
    expect(s.discountCapAmount).toEqual({ AR: null, ES: null });
    expect(await getDiscountCapAmount(app.db, CTX_TEMPLO, "AR")).toBeNull();
    expect(await getDiscountCapAmount(app.db, CTX_TEMPLO, "ES")).toBeNull();
  });
});

describe("setInvitationSettings (servicio)", () => {
  it("round-trip, upsert sin duplicar filas y patch parcial que conserva el resto", async () => {
    await setInvitationSettings(app.db, CTX_TEMPLO, {
      monthlyQuota: 3,
      discountCapAmount: { AR: 20000 },
    });
    await setInvitationSettings(app.db, CTX_TEMPLO, { monthlyQuota: 4 });
    await setInvitationSettings(app.db, CTX_TEMPLO, { inviteePercent: 0 });

    const s = await getInvitationSettings(app.db, CTX_TEMPLO, app.log);
    expect(s.monthlyQuota).toBe(4);
    expect(s.inviteePercent).toBe(0);
    expect(s.discountCapAmount).toEqual({ AR: 20000, ES: null });
    // monthly_quota, invitee_percent y cap AR: 3 filas (el upsert no duplicó).
    expect(await countRows(CTX_TEMPLO)).toBe(3);
    expect(await getDiscountCapAmount(app.db, CTX_TEMPLO, "AR")).toBe(20000);
  });

  it("cap null borra la fila (vuelve a sin tope)", async () => {
    await setInvitationSettings(app.db, CTX_TEMPLO, {
      discountCapAmount: { AR: 20000, ES: 50 },
    });
    expect(await countRows(CTX_TEMPLO)).toBe(2);
    await setInvitationSettings(app.db, CTX_TEMPLO, {
      discountCapAmount: { AR: null },
    });
    expect(await countRows(CTX_TEMPLO)).toBe(1);
    expect(await getDiscountCapAmount(app.db, CTX_TEMPLO, "AR")).toBeNull();
    expect(await getDiscountCapAmount(app.db, CTX_TEMPLO, "ES")).toBe(50);
  });

  it.each([
    ["quota 0", { monthlyQuota: 0 }],
    ["quota 11", { monthlyQuota: 11 }],
    ["quota decimal", { monthlyQuota: 2.5 }],
    ["invitee 80", { inviteePercent: 80 }],
    ["cap negativo", { discountCapAmount: { AR: -5 } }],
    ["cap cero", { discountCapAmount: { ES: 0 } }],
    ["cap decimal", { discountCapAmount: { AR: 10.5 } }],
    ["país desconocido", { discountCapAmount: { BR: 100 } }],
    ["clave desconocida", { foo: 1 }],
  ])("rechaza %s sin escribir nada (validación previa)", async (_n, bad) => {
    // El patch mezcla un campo válido con el inválido: tampoco debe escribirse
    // el válido (todo o nada).
    await expect(
      setInvitationSettings(app.db, CTX_TEMPLO, {
        reinviteWindowDays: 30,
        ...(bad as Record<string, unknown>),
      }),
    ).rejects.toThrow();
    expect(await countRows(CTX_TEMPLO)).toBe(0);
  });
});

describe("GET/PUT /api/admin/settings/invitations (HTTP)", () => {
  it("GET con staff (coach) devuelve 200 con los defaults", async () => {
    const r = await http("GET", coachToken);
    expect(r.statusCode).toBe(200);
    expect(r.body.monthlyQuota).toBe(2);
    expect(r.body.discountCapAmount).toEqual({ AR: null, ES: null });
    expect(r.body.perLinkPercent).toBe(10);
    expect(r.body.maxPercentCap).toBe(40);
  });

  it("PUT como gestion -> 200 y el GET refleja el cambio", async () => {
    const put = await http("PUT", gestionToken, {
      monthlyQuota: 3,
      discountCapAmount: { AR: 20000 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.body.monthlyQuota).toBe(3);
    expect(put.body.discountCapAmount).toEqual({ AR: 20000, ES: null });

    const get = await http("GET", ownerToken);
    expect(get.body.monthlyQuota).toBe(3);
    expect(get.body.discountCapAmount).toEqual({ AR: 20000, ES: null });
  });

  it("PUT como owner con cap null borra el tope", async () => {
    await http("PUT", ownerToken, { discountCapAmount: { AR: 20000 } });
    const put = await http("PUT", ownerToken, {
      discountCapAmount: { AR: null },
    });
    expect(put.statusCode).toBe(200);
    expect(put.body.discountCapAmount.AR).toBeNull();
    expect(await countRows(CTX_TEMPLO)).toBe(0);
  });

  it.each([
    ["quota 0", { monthlyQuota: 0 }],
    ["invitee 80", { inviteePercent: 80 }],
    ["cap negativo", { discountCapAmount: { AR: -5 } }],
    ["cap texto", { discountCapAmount: { AR: "abc" } }],
    ["cap decimal", { discountCapAmount: { ES: 10.5 } }],
    ["vigencia 31", { accessBusinessDays: 31 }],
  ])("PUT con %s -> 400 y no se escribe nada", async (_n, bad) => {
    const r = await http("PUT", ownerToken, { reinviteWindowDays: 30, ...bad });
    expect(r.statusCode).toBe(400);
    expect(await countRows(CTX_TEMPLO)).toBe(0);
  });

  it("claves desconocidas del body nunca se persisten", async () => {
    // Fastify (ajv removeAdditional) las descarta antes de llegar al servicio.
    const r = await http("PUT", ownerToken, {
      monthlyQuota: 3,
      tenantId: 99999,
      foo: "bar",
    });
    expect(r.statusCode).toBe(200);
    expect(await countRows(CTX_TEMPLO)).toBe(1);
    // Y el tenant NUNCA sale del body: no hay filas para el tenant inventado.
    expect(await countRows({ tenantId: 99999 })).toBe(0);
  });

  it("roles: coach y recepcion no escriben (403), un socio no lee ni escribe (403), sin token 401", async () => {
    expect((await http("PUT", coachToken, { monthlyQuota: 5 })).statusCode).toBe(
      403,
    );
    expect(
      (await http("PUT", recepcionToken, { monthlyQuota: 5 })).statusCode,
    ).toBe(403);
    expect((await http("GET", recepcionToken)).statusCode).toBe(200);
    expect((await http("GET", memberToken)).statusCode).toBe(403);
    expect(
      (await http("PUT", memberToken, { monthlyQuota: 5 })).statusCode,
    ).toBe(403);
    expect((await http("GET", null)).statusCode).toBe(401);
    expect(await countRows(CTX_TEMPLO)).toBe(0);
  });
});

describe("aislamiento entre gimnasios (T-194-23)", () => {
  it("lo escrito con el ctx de un tenant no se ve con el ctx de otro", async () => {
    await setInvitationSettings(app.db, CTX_TEMPLO, {
      monthlyQuota: 5,
      discountCapAmount: { AR: 20000 },
    });
    await setInvitationSettings(app.db, ctxDos, {
      monthlyQuota: 7,
      discountCapAmount: { AR: 9000 },
    });

    const a = await getInvitationSettings(app.db, CTX_TEMPLO, app.log);
    const b = await getInvitationSettings(app.db, ctxDos, app.log);
    expect(a.monthlyQuota).toBe(5);
    expect(a.discountCapAmount.AR).toBe(20000);
    expect(b.monthlyQuota).toBe(7);
    expect(b.discountCapAmount.AR).toBe(9000);

    // Borrar el tope de un gimnasio no toca el del otro.
    await setInvitationSettings(app.db, ctxDos, {
      discountCapAmount: { AR: null },
    });
    expect(await getDiscountCapAmount(app.db, ctxDos, "AR")).toBeNull();
    expect(await getDiscountCapAmount(app.db, CTX_TEMPLO, "AR")).toBe(20000);
  });

  it("por HTTP: el admin del gimnasio 2 escribe en SU tenant, no en el de El Templo", async () => {
    const put = await http("PUT", gym2.adminToken, { monthlyQuota: 9 });
    expect(put.statusCode).toBe(200);
    expect(put.body.monthlyQuota).toBe(9);

    const templo = await http("GET", ownerToken);
    expect(templo.body.monthlyQuota).toBe(2);
    expect(await countRows(CTX_TEMPLO)).toBe(0);
    expect(await countRows(ctxDos)).toBe(1);
  });
});
