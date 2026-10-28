/**
 * Fase 201 Plan 14 (D-14, T-201-49): parámetros de Nacho (`conquer.*`).
 *
 *   - GET /api/admin/conquer/settings
 *   - PUT /api/admin/conquer/settings
 *
 * Los parámetros viven en `tenant_settings` (no se limpia en `cleanAllTestData`):
 * `clearConquerSettings` los borra en `beforeEach` y `afterEach`.
 *
 * 201-25 (DA-5): los offsets de arranque (`start_offset.ternero|novillo`) se
 * borraron. Quedó un solo parámetro, `comboWeeksN`; el arranque por nivel son
 * las tablas del anexo guardadas por ejercicio.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, like } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  CONQUER_SETTING_KEYS,
  CONQUER_SETTINGS_PREFIX,
  saveConquerSettings,
  type ConquerSettingsPatch,
} from "../../src/modules/conquer/settings";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  clearConquerSettings,
  createConquerStaff,
  TEMPLO_CTX,
} from "./_helpers";

const SETTINGS_URL = "/api/admin/conquer/settings";
const GYM2_CTX = { tenantId: TENANT_DOS };

interface SettingsBody {
  settings: {
    comboWeeksN: number;
  };
  ranges: Record<string, { min: number; max: number }>;
}

interface ErrorBody {
  error: string;
  code?: string;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let adminToken: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function getSettings(token = adminToken) {
  return app.inject({ method: "GET", url: SETTINGS_URL, headers: auth(token) });
}

async function putSettings(
  payload: Record<string, unknown>,
  token = adminToken,
) {
  return app.inject({
    method: "PUT",
    url: SETTINGS_URL,
    headers: auth(token),
    payload,
  });
}

async function storedRows(ctx: { tenantId: number }) {
  return app.db
    .select({
      key: schema.tenantSettings.settingKey,
      value: schema.tenantSettings.settingValue,
    })
    .from(schema.tenantSettings)
    .where(
      and(
        tenantWhere(schema.tenantSettings, ctx),
        like(schema.tenantSettings.settingKey, "conquer.%"),
      ),
    );
}

async function clearGym2Settings(): Promise<void> {
  await app.db
    .delete(schema.tenantSettings)
    .where(
      and(
        tenantWhere(schema.tenantSettings, GYM2_CTX),
        like(schema.tenantSettings.settingKey, "conquer.%"),
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await clearConquerSettings(app);
  gym2 = await seedSecondTenant(app);
  adminToken = (await createConquerStaff(app, "admin")).token;
});

afterEach(async () => {
  await clearGym2Settings();
  await clearConquerSettings(app);
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await clearGym2Settings();
  await clearConquerSettings(app);
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("GET /api/admin/conquer/settings — parámetros y rangos (D-14)", () => {
  it("sin filas devuelve el default 2 y el rango", async () => {
    const res = await getSettings();

    expect(res.statusCode).toBe(200);
    expect(res.json<SettingsBody>()).toEqual({
      settings: { comboWeeksN: 2 },
      ranges: { comboWeeksN: { min: 1, max: 8 } },
    });
  });

  it("una fila vieja conquer.start_offset.novillo no aparece ni rompe el GET (201-25 DA-5)", async () => {
    await app.db.insert(schema.tenantSettings).values(
      tenantValues(TEMPLO_CTX, {
        settingKey: `${CONQUER_SETTINGS_PREFIX}start_offset.novillo`,
        settingValue: "3",
      }),
    );

    const res = await getSettings();

    expect(res.statusCode).toBe(200);
    expect(res.json<SettingsBody>().settings).toEqual({ comboWeeksN: 2 });
    expect(Object.keys(res.json<SettingsBody>().ranges)).toEqual([
      "comboWeeksN",
    ]);
  });
});

describe("PUT /api/admin/conquer/settings — guardar parámetros (D-14)", () => {
  it("guarda el parámetro y GET lo devuelve; la base queda con una fila", async () => {
    const res = await putSettings({ comboWeeksN: 4 });

    expect(res.statusCode).toBe(200);
    expect(res.json<SettingsBody>().settings).toEqual({ comboWeeksN: 4 });
    expect(
      (await getSettings()).json<SettingsBody>().settings.comboWeeksN,
    ).toBe(4);
    const rows = await storedRows(TEMPLO_CTX);
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({
      [CONQUER_SETTING_KEYS.comboWeeksN]: "4",
    });
  });

  it("un segundo PUT pisa el valor (upsert, sin filas duplicadas)", async () => {
    await putSettings({ comboWeeksN: 3 });
    await putSettings({ comboWeeksN: 5 });

    const body = (await getSettings()).json<SettingsBody>();

    expect(body.settings).toEqual({ comboWeeksN: 5 });
    expect(await storedRows(TEMPLO_CTX)).toHaveLength(1);
  });

  it.each([
    ["comboWeeksN = 9 (máximo 8)", { comboWeeksN: 9 }],
    ["comboWeeksN = 0 (mínimo 1)", { comboWeeksN: 0 }],
    ["comboWeeksN = 1.5 (no entero)", { comboWeeksN: 1.5 }],
    ["comboWeeksN texto", { comboWeeksN: "mucho" }],
    ["body vacío", {}],
    ["solo una clave desconocida", { toro: 1 }],
    // 201-25: el offset ya no es un parámetro, Fastify lo descarta y queda vacío.
    ["solo el offset de Novillo (ya no existe)", { startOffsetNovillo: 1 }],
  ])("%s: 400 y no escribe nada", async (_caso, payload) => {
    const res = await putSettings(payload);

    expect(res.statusCode).toBe(400);
    expect(await storedRows(TEMPLO_CTX)).toHaveLength(0);
  });

  it("un patch con un valor inválido: 400 y no se escribe nada", async () => {
    const res = await putSettings({ startOffsetNovillo: 0, comboWeeksN: 9 });

    expect(res.statusCode).toBe(400);
    expect(await storedRows(TEMPLO_CTX)).toHaveLength(0);
    expect(
      (await getSettings()).json<SettingsBody>().settings.comboWeeksN,
    ).toBe(2);
  });

  it("un patch con una clave desconocida y una válida guarda solo la válida (Fastify descarta la extra)", async () => {
    const res = await putSettings({ comboWeeksN: 3, startOffsetNovillo: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.json<SettingsBody>().settings).toEqual({ comboWeeksN: 3 });
    expect(await storedRows(TEMPLO_CTX)).toHaveLength(1);
  });
});

describe("permisos y aislamiento de los parámetros (T-201-49)", () => {
  it.each(["coach", "recepcion", "gestion"])(
    "el rol %s no lee ni escribe los parámetros: 403",
    async (rol) => {
      const staff = await createConquerStaff(app, rol);

      const read = await getSettings(staff.token);
      const write = await putSettings({ comboWeeksN: 3 }, staff.token);

      expect(read.statusCode).toBe(403);
      expect(write.statusCode).toBe(403);
      expect(await storedRows(TEMPLO_CTX)).toHaveLength(0);
    },
  );

  it("un socio no puede escribir los parámetros: 403", async () => {
    const member = await createTestMember(app);

    const res = await putSettings({ comboWeeksN: 3 }, member.token);

    expect(res.statusCode).toBe(403);
  });

  it("sin token: 401", async () => {
    const res = await app.inject({ method: "GET", url: SETTINGS_URL });

    expect(res.statusCode).toBe(401);
  });

  it("el admin del gimnasio 2 escribe SOLO en su gimnasio: El Templo no cambia", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);

    const res = await putSettings({ comboWeeksN: 6 }, gym2.adminToken);

    expect(res.statusCode).toBe(200);
    expect(res.json<SettingsBody>().settings.comboWeeksN).toBe(6);
    expect(await storedRows(TEMPLO_CTX)).toHaveLength(0);
    expect(await storedRows(GYM2_CTX)).toHaveLength(1);
    expect(
      (await getSettings()).json<SettingsBody>().settings.comboWeeksN,
    ).toBe(2);
  });
});

// Ajv ya frena los rangos en la ruta: estos casos llaman al servicio directo
// para probar que `saveConquerSettings` valida por sí mismo (quien lo reuse
// fuera de la ruta no se salta los rangos).
describe("saveConquerSettings — validación propia del servicio (D-14)", () => {
  it.each([
    ["comboWeeksN = 9", { comboWeeksN: 9 }],
    ["comboWeeksN = 0", { comboWeeksN: 0 }],
    ["un decimal", { comboWeeksN: 2.5 }],
    ["un patch vacío", {}],
  ])(
    "%s: rechaza con 400 CONQUER_PARAMETRO_INVALIDO y no escribe",
    async (_caso, patch) => {
      await expect(
        saveConquerSettings(app.db, TEMPLO_CTX, patch),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "CONQUER_PARAMETRO_INVALIDO",
      });
      expect(await storedRows(TEMPLO_CTX)).toHaveLength(0);
    },
  );

  it("un parámetro desconocido (el offset ya no existe) se rechaza sin escribir lo demás", async () => {
    // Se arma con un cast: el tipo ya no admite la clave, el servicio igual la valida.
    const patch = {
      startOffsetNovillo: 0,
      comboWeeksN: 3,
    } as ConquerSettingsPatch;

    await expect(
      saveConquerSettings(app.db, TEMPLO_CTX, patch),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "CONQUER_PARAMETRO_INVALIDO",
    });
    expect(await storedRows(TEMPLO_CTX)).toHaveLength(0);
  });

  it("acepta los extremos del rango", async () => {
    await saveConquerSettings(app.db, TEMPLO_CTX, { comboWeeksN: 1 });
    expect(
      (await getSettings()).json<SettingsBody>().settings.comboWeeksN,
    ).toBe(1);
    await saveConquerSettings(app.db, TEMPLO_CTX, { comboWeeksN: 8 });
    expect(
      (await getSettings()).json<SettingsBody>().settings.comboWeeksN,
    ).toBe(8);
  });
});
