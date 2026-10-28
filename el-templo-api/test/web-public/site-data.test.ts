import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { WEB_BRAND_NAME_KEY } from "../../src/modules/web-public/brand";
import type { WebSede, WebSiteData } from "../../src/modules/web-public/types";
import { cleanAllTestData, createStaffUser, createTestApp } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const CTX = { tenantId: 1 };
const URL = "/api/web/site-data";

const COACH_EMAIL = "coach-w195-secreto@test.com";
const AR_KEY = "whatsapp.sales_number.AR";
const ES_KEY = "whatsapp.sales_number.ES";
const SETTING_KEYS = [AR_KEY, ES_KEY, WEB_BRAND_NAME_KEY];
const CODES = ["W195A", "W195B", "W195C", "W195D", "W195E"];

describe("GET /api/web/site-data", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let branchIds: Record<string, number>;
  let calisteniaId: number;
  let originalSettings: Array<{ settingKey: string; settingValue: string }>;

  async function getSiteData(): Promise<{
    status: number;
    headers: Record<string, unknown>;
    raw: string;
    body: WebSiteData;
  }> {
    const res = await app.inject({ method: "GET", url: URL });
    return {
      status: res.statusCode,
      headers: res.headers,
      raw: res.body,
      body: JSON.parse(res.body) as WebSiteData,
    };
  }

  async function sedeByCode(code: string): Promise<WebSede | undefined> {
    const { body } = await getSiteData();
    return body.sedes.find((s) => s.code === code);
  }

  async function setSetting(key: string, value: string) {
    await app.db
      .insert(schema.tenantSettings)
      .values(tenantValues(CTX, { settingKey: key, settingValue: value }))
      .onDuplicateKeyUpdate({ set: { settingValue: value } });
  }

  async function clearSettings() {
    await app.db
      .delete(schema.tenantSettings)
      .where(
        and(
          tenantWhere(schema.tenantSettings, CTX),
          inArray(schema.tenantSettings.settingKey, SETTING_KEYS),
        ),
      );
  }

  async function restoreSettings() {
    await clearSettings();
    for (const row of originalSettings) {
      await setSetting(row.settingKey, row.settingValue);
    }
  }

  async function dropSeededBranches() {
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          inArray(schema.branches.code, CODES),
        ),
      );
  }

  beforeAll(async () => {
    app = await createTestApp();

    originalSettings = await app.db
      .select({
        settingKey: schema.tenantSettings.settingKey,
        settingValue: schema.tenantSettings.settingValue,
      })
      .from(schema.tenantSettings)
      .where(
        and(
          tenantWhere(schema.tenantSettings, CTX),
          inArray(schema.tenantSettings.settingKey, SETTING_KEYS),
        ),
      );

    // Orden obligatorio del fixture: primero limpiar, después sembrar.
    await cleanAllTestData(app);
    await dropSeededBranches();
    gym2 = await seedSecondTenant(app);

    const insertBranch = async (
      values: Partial<typeof schema.branches.$inferInsert> & {
        code: string;
        name: string;
      },
    ): Promise<number> => {
      const [row] = await app.db
        .insert(schema.branches)
        .values(tenantValues(CTX, values))
        .$returningId();
      return row.id;
    };

    branchIds = {
      W195A: await insertBranch({
        code: "W195A",
        name: "Sede A interna",
        webSlug: "sede-a-195",
        publicName: "El Templo Calistenia — Sede A",
        publishOnWeb: true,
        address: "Calle Falsa 123",
        locality: "Mar del Plata",
        region: "Buenos Aires",
        postalCode: "7600",
        phone: "+54 223 555-0195",
        latitude: -38.00123,
        longitude: -57.55678,
        placeId: "ChIJ195A",
        gbpLocationId: "locations/195-secreto-gbp",
      }),
      W195B: await insertBranch({
        code: "W195B",
        name: "Sede B no publicada",
        webSlug: "sede-b-195",
        publishOnWeb: false,
      }),
      W195C: await insertBranch({
        code: "W195C",
        name: "Sede C inactiva",
        webSlug: "sede-c-195",
        publishOnWeb: true,
        isActive: false,
      }),
      W195D: await insertBranch({
        code: "W195D",
        name: "Sede D sin slug",
        webSlug: null,
        publishOnWeb: true,
      }),
      W195E: await insertBranch({
        code: "W195E",
        name: "Sede E interna",
        webSlug: "sede-e-195",
        publicName: null,
        publishOnWeb: true,
        webKind: "community_space",
        country: "ES",
        timezone: "Europe/Madrid",
        mapsUrl: "https://maps.app.goo.gl/xyz195",
      }),
    };

    const insertActivity = async (
      values: Partial<typeof schema.activities.$inferInsert> & {
        name: string;
      },
    ): Promise<number> => {
      const [row] = await app.db
        .insert(schema.activities)
        .values(tenantValues(CTX, values))
        .$returningId();
      return row.id;
    };
    const calistenia = await insertActivity({ name: "Calistenia 195" });
    calisteniaId = calistenia;
    const funcional = await insertActivity({ name: "Funcional 195" });
    const yoga = await insertActivity({
      name: "Yoga 195",
      isSpecial: true,
      specialLine: "yoga",
    });
    // Dos actividades con el mismo nombre, una especial y otra regular: la
    // especial queda primero en la grilla (10:00) y no puede perder el flag.
    const mixtaEspecial = await insertActivity({
      name: "Mixta 195",
      isSpecial: true,
      specialLine: "yoga",
    });
    const mixtaRegular = await insertActivity({ name: "Mixta 195" });
    const inactiva = await insertActivity({
      name: "Inactiva 195",
      isActive: false,
    });
    const soloInactivo = await insertActivity({ name: "SoloInactivo 195" });

    const coachId = await createStaffUser(app, {
      email: COACH_EMAIL,
      password: "coachpass123",
      firstName: "Secreta",
      lastName: "Profe",
      role: "coach",
      branchId: branchIds.W195A,
    });

    const slot = async (
      values: Partial<typeof schema.schedules.$inferInsert> & {
        branchId: number;
        activityId: number;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
      },
    ) => {
      await app.db
        .insert(schema.schedules)
        .values(tenantValues(CTX, { isActive: true, ...values }));
    };
    const A = branchIds.W195A;
    // Se insertan primero a propósito: el orden de salida no puede depender del
    // orden de inserción.
    await slot({
      branchId: A,
      activityId: calistenia,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    });
    await slot({
      branchId: A,
      activityId: calistenia,
      dayOfWeek: 1,
      startTime: "18:00",
      endTime: "19:00",
    });
    // Lunes: dos clases solapadas + una de tarde (regulares), y una especial
    // (yoga) que, si entrara en la apertura, fusionaría la tarde a 18:00-20:30.
    await slot({
      branchId: A,
      activityId: calistenia,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
      coachUserId: coachId,
    });
    await slot({
      branchId: A,
      activityId: funcional,
      dayOfWeek: 1,
      startTime: "08:30",
      endTime: "09:30",
    });
    await slot({
      branchId: A,
      activityId: yoga,
      dayOfWeek: 1,
      startTime: "19:30",
      endTime: "20:30",
    });
    await slot({
      branchId: A,
      activityId: mixtaEspecial,
      dayOfWeek: 6,
      startTime: "10:00",
      endTime: "11:00",
    });
    await slot({
      branchId: A,
      activityId: mixtaRegular,
      dayOfWeek: 6,
      startTime: "12:00",
      endTime: "13:00",
    });
    // Lo que NO debe aparecer en ningún campo:
    await slot({
      branchId: A,
      activityId: calistenia,
      dayOfWeek: 1,
      startTime: "14:20",
      endTime: "14:50",
      isActive: false,
    });
    await slot({
      branchId: A,
      activityId: calistenia,
      dayOfWeek: 2,
      startTime: "07:00",
      endTime: "08:00",
      isActive: true,
      deletedFrom: "2026-01-01",
    });
    await slot({
      branchId: A,
      activityId: inactiva,
      dayOfWeek: 2,
      startTime: "10:00",
      endTime: "11:00",
    });
    await slot({
      branchId: A,
      activityId: soloInactivo,
      dayOfWeek: 4,
      startTime: "10:00",
      endTime: "11:00",
      isActive: false,
    });
    await slot({
      branchId: A,
      activityId: calistenia,
      dayOfWeek: 3,
      startTime: "15:00",
      endTime: "16:00",
      isActive: false,
      deletedFrom: "2026-01-01",
    });
    // Sedes que no deben salir, con clases para que un filtro roto se note.
    for (const code of ["W195B", "W195C", "W195D"]) {
      await slot({
        branchId: branchIds[code],
        activityId: calistenia,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "11:00",
      });
    }
  }, 120_000);

  afterAll(async () => {
    await restoreSettings();
    await cleanAllTestData(app);
    await dropSeededBranches();
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  it("responde 200 sin Authorization con Cache-Control público de 5 minutos", async () => {
    const res = await getSiteData();
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.body.sedes.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(res.body.generatedAt))).toBe(false);
  });

  it("solo salen sedes publicadas, activas y con slug del tenant 1", async () => {
    const { body } = await getSiteData();
    const codes = body.sedes.map((s) => s.code);
    expect(codes).toContain("W195A");
    expect(codes).toContain("W195E");
    // publish_on_web = 0, sede inactiva, sin slug y la sede ONLINE.
    for (const oculto of ["W195B", "W195C", "W195D", "ONLINE"]) {
      expect(codes, `${oculto} no debe publicarse`).not.toContain(oculto);
    }
  });

  it("arma horarios regulares: fusiona los solapados y excluye la actividad especial", async () => {
    const sede = await sedeByCode("W195A");
    expect(sede?.openingHours).toEqual([
      { dayOfWeek: 1, opens: "08:00", closes: "09:30" },
      { dayOfWeek: 1, opens: "18:00", closes: "19:00" },
      { dayOfWeek: 3, opens: "09:00", closes: "10:00" },
      { dayOfWeek: 6, opens: "12:00", closes: "13:00" },
    ]);
    expect(sede?.schedule).toEqual([
      {
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
        activity: "Calistenia 195",
      },
      {
        dayOfWeek: 1,
        startTime: "08:30",
        endTime: "09:30",
        activity: "Funcional 195",
      },
      {
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:00",
        activity: "Calistenia 195",
      },
      {
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "10:00",
        activity: "Calistenia 195",
      },
      {
        dayOfWeek: 6,
        startTime: "12:00",
        endTime: "13:00",
        activity: "Mixta 195",
      },
    ]);
  });

  it("activities incluye la especial con isSpecial y omite las inactivas", async () => {
    const sede = await sedeByCode("W195A");
    expect(sede?.activities).toEqual([
      { name: "Calistenia 195", slug: "calistenia-195", isSpecial: false },
      { name: "Funcional 195", slug: "funcional-195", isSpecial: false },
      { name: "Mixta 195", slug: "mixta-195", isSpecial: true },
      { name: "Yoga 195", slug: "yoga-195", isSpecial: true },
    ]);
  });

  it("horarios inactivos, eliminados o de actividad inactiva no aparecen en ningún campo", async () => {
    const sede = await sedeByCode("W195A");
    const json = JSON.stringify(sede);
    expect(json).not.toContain("Inactiva 195");
    expect(json).not.toContain("SoloInactivo 195");
    expect(json).not.toContain("14:20");
    expect(json).not.toContain("15:00");
    // El martes solo tenía un horario eliminado (activo) y uno de actividad
    // inactiva: ese día no puede figurar como abierto.
    expect(sede?.openingHours.some((h) => h.dayOfWeek === 2)).toBe(false);
    expect(sede?.openingHours.some((h) => h.dayOfWeek === 4)).toBe(false);
  });

  it("una sede sin clases (espacio de comunidad) sale con listas vacías", async () => {
    const sede = await sedeByCode("W195E");
    expect(sede?.activities).toEqual([]);
    expect(sede?.openingHours).toEqual([]);
    expect(sede?.schedule).toEqual([]);
  });

  it("mapea dirección, geo numérico, place id, teléfono y nombre público", async () => {
    const a = await sedeByCode("W195A");
    expect(a).toMatchObject({
      id: branchIds.W195A,
      slug: "sede-a-195",
      publicName: "El Templo Calistenia — Sede A",
      kind: "gym",
      country: "AR",
      timezone: "America/Argentina/Buenos_Aires",
      address: {
        street: "Calle Falsa 123",
        locality: "Mar del Plata",
        region: "Buenos Aires",
        postalCode: "7600",
        country: "AR",
      },
      placeId: "ChIJ195A",
      phone: "+54 223 555-0195",
      photoUrl: null,
    });
    expect(a?.geo).toEqual({ lat: -38.00123, lng: -57.55678 });
    expect(typeof a?.geo?.lat).toBe("number");

    const e = await sedeByCode("W195E");
    expect(e).toMatchObject({
      kind: "community_space",
      country: "ES",
      timezone: "Europe/Madrid",
      // sin public_name cae al name interno
      publicName: "Sede E interna",
      placeId: null,
      phone: null,
    });
    expect(e?.geo).toBeNull();
  });

  it("mapsUrl: usa maps_url si existe y si no arma la búsqueda de Google Maps", async () => {
    const e = await sedeByCode("W195E");
    expect(e?.mapsUrl).toBe("https://maps.app.goo.gl/xyz195");

    const a = await sedeByCode("W195A");
    expect(a?.mapsUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=Calle%20Falsa%20123%2C%20Mar%20del%20Plata&query_place_id=ChIJ195A",
    );

    // Sin place id no se agrega query_place_id.
    await app.db
      .update(schema.branches)
      .set({ placeId: null })
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          eq(schema.branches.id, branchIds.W195A),
        ),
      );
    try {
      const sinPlace = await sedeByCode("W195A");
      expect(sinPlace?.mapsUrl).toBe(
        "https://www.google.com/maps/search/?api=1&query=Calle%20Falsa%20123%2C%20Mar%20del%20Plata",
      );
    } finally {
      await app.db
        .update(schema.branches)
        .set({ placeId: "ChIJ195A" })
        .where(
          and(
            tenantWhere(schema.branches, CTX),
            eq(schema.branches.id, branchIds.W195A),
          ),
        );
    }
  });

  it("countries refleja el WhatsApp de ventas por país y es null si no hay o es inválido", async () => {
    await clearSettings();
    try {
      const vacio = await getSiteData();
      expect(vacio.body.countries).toEqual({
        AR: { salesWhatsapp: null },
        ES: { salesWhatsapp: null },
      });

      await setSetting(AR_KEY, "5492230000195");
      await setSetting(ES_KEY, "34600000195");
      const cargado = await getSiteData();
      expect(cargado.body.countries).toEqual({
        AR: { salesWhatsapp: "5492230000195" },
        ES: { salesWhatsapp: "34600000195" },
      });

      // Fail-closed: un valor corrupto no sale (evita un wa.me roto).
      await setSetting(ES_KEY, "+34 600 000 195");
      const corrupto = await getSiteData();
      expect(corrupto.body.countries.ES.salesWhatsapp).toBeNull();
      expect(corrupto.body.countries.AR.salesWhatsapp).toBe("5492230000195");
    } finally {
      await restoreSettings();
    }
  });

  it("brand.name: default sin setting, el valor del setting si existe y default si está en blanco", async () => {
    await clearSettings();
    // Marca de OTRO gimnasio: no puede colarse en la del tenant 1.
    await app.db
      .insert(schema.tenantSettings)
      .values(
        tenantValues(
          { tenantId: gym2.tenantId },
          { settingKey: WEB_BRAND_NAME_KEY, settingValue: "Marca Gym2" },
        ),
      );
    try {
      expect((await getSiteData()).body.brand.name).toBe(
        "El Templo Calistenia",
      );

      await setSetting(WEB_BRAND_NAME_KEY, "  Marca X  ");
      expect((await getSiteData()).body.brand.name).toBe("Marca X");

      await setSetting(WEB_BRAND_NAME_KEY, "   ");
      expect((await getSiteData()).body.brand.name).toBe(
        "El Templo Calistenia",
      );
    } finally {
      await app.db
        .delete(schema.tenantSettings)
        .where(
          and(
            tenantWhere(schema.tenantSettings, { tenantId: gym2.tenantId }),
            eq(schema.tenantSettings.settingKey, WEB_BRAND_NAME_KEY),
          ),
        );
      await restoreSettings();
    }
  });

  it("no filtra datos personales ni columnas internas", async () => {
    const { raw, body } = await getSiteData();
    const a = body.sedes.find((s) => s.code === "W195A");
    expect(
      a,
      "la sede W195A tiene un horario con coach asignado",
    ).toBeDefined();

    for (const clave of [
      "coachUserId",
      "coach_user_id",
      "email",
      "tenantId",
      "tenant_id",
      "gbpLocationId",
      "gbpSyncedHash",
      "passwordHash",
    ]) {
      expect(raw, `la clave ${clave} no debe viajar`).not.toContain(
        `"${clave}"`,
      );
    }
    expect(raw).not.toContain(COACH_EMAIL);
    expect(raw).not.toContain("Secreta");
    expect(raw).not.toContain("195-secreto-gbp");
    // Nombre interno de la sede: solo sale publicName.
    expect(raw).not.toContain("Sede A interna");
  });

  it("no expone sedes ni horarios de otro gimnasio aunque estén marcados para la web", async () => {
    await app.db
      .update(schema.branches)
      .set({ publishOnWeb: true, webSlug: "gym2-195" })
      .where(
        and(
          eq(schema.branches.tenantId, gym2.tenantId),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    const [check] = await app.db
      .select({
        publishOnWeb: schema.branches.publishOnWeb,
        webSlug: schema.branches.webSlug,
      })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.tenantId, gym2.tenantId),
          eq(schema.branches.id, gym2.branchId),
        ),
      );
    // Precondición: la sede del gimnasio 2 SÍ cumple el criterio de publicación.
    expect(check).toEqual({ publishOnWeb: true, webSlug: "gym2-195" });

    const { body, raw } = await getSiteData();
    expect(body.sedes.map((s) => s.id)).not.toContain(gym2.branchId);
    expect(body.sedes.map((s) => s.slug)).not.toContain("gym2-195");
    expect(raw).not.toContain("Actividad "); // actividad sembrada del gimnasio 2
  });

  it("filas cruzadas entre gimnasios (schedules/activities) no entran en la grilla", async () => {
    // Las FK simples de schedules no impiden estas filas, así que el único
    // freno es el tenantWhere de cada tabla del JOIN:
    //  - horario del gimnasio 2 sobre una sede y una actividad del tenant 1
    //  - horario del tenant 1 sobre una actividad del gimnasio 2
    await app.db.insert(schema.schedules).values(
      tenantValues(
        { tenantId: gym2.tenantId },
        {
          branchId: branchIds.W195A,
          activityId: calisteniaId,
          dayOfWeek: 5,
          startTime: "22:00",
          endTime: "23:00",
          isActive: true,
        },
      ),
    );
    await app.db.insert(schema.schedules).values(
      tenantValues(CTX, {
        branchId: branchIds.W195A,
        activityId: gym2.activityId,
        dayOfWeek: 7,
        startTime: "20:00",
        endTime: "21:00",
        isActive: true,
      }),
    );
    try {
      const sede = await sedeByCode("W195A");
      expect(sede?.openingHours.some((h) => h.dayOfWeek === 5)).toBe(false);
      expect(sede?.openingHours.some((h) => h.dayOfWeek === 7)).toBe(false);
      expect(JSON.stringify(sede)).not.toContain("Actividad ");
    } finally {
      for (const ctx of [CTX, { tenantId: gym2.tenantId }]) {
        await app.db
          .delete(schema.schedules)
          .where(
            and(
              tenantWhere(schema.schedules, ctx),
              inArray(schema.schedules.dayOfWeek, [5, 7]),
              eq(schema.schedules.branchId, branchIds.W195A),
            ),
          );
      }
    }
  });
});

describe("GET /api/web/site-data - rate limit", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("el pedido 61 de una misma IP en la ventana responde 429", async () => {
    const remoteAddress = "10.195.2.61";
    for (let i = 0; i < 60; i++) {
      const res = await app.inject({ method: "GET", url: URL, remoteAddress });
      expect(res.statusCode, `pedido ${i + 1}`).toBe(200);
    }
    const blocked = await app.inject({
      method: "GET",
      url: URL,
      remoteAddress,
    });
    expect(blocked.statusCode).toBe(429);
  });
});
