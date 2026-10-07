import { describe, expect, it } from "vitest";
import {
  buildLocationPatch,
  buildWebsiteUri,
  patchHash,
  updateMaskFor,
  type GbpSedeInput,
} from "../../src/modules/marketing/google/gbp";

/** Fase 195-09 (D-08/D-21.3): el patch de la ficha es puro y determinista. */
const AR_WA = "5492235820521";

function sede(over: Partial<GbpSedeInput> = {}): GbpSedeInput {
  return {
    slug: "juan-b-justo",
    country: "AR",
    phone: null,
    address: {
      street: "Juan B. Justo 1018",
      locality: "Mar del Plata",
      region: "Buenos Aires",
      postalCode: null,
      country: "AR",
    },
    openingHours: [
      { dayOfWeek: 1, opens: "07:00", closes: "12:00" },
      { dayOfWeek: 1, opens: "16:00", closes: "21:00" },
      { dayOfWeek: 6, opens: "09:00", closes: "12:00" },
    ],
    ...over,
  };
}

describe("buildLocationPatch", () => {
  it("mapea horarios a regularHours.periods (lunes x2, sábado)", () => {
    const patch = buildLocationPatch(sede(), AR_WA);
    expect(patch.regularHours?.periods).toEqual([
      {
        openDay: "MONDAY",
        openTime: { hours: 7, minutes: 0 },
        closeDay: "MONDAY",
        closeTime: { hours: 12, minutes: 0 },
      },
      {
        openDay: "MONDAY",
        openTime: { hours: 16, minutes: 0 },
        closeDay: "MONDAY",
        closeTime: { hours: 21, minutes: 0 },
      },
      {
        openDay: "SATURDAY",
        openTime: { hours: 9, minutes: 0 },
        closeDay: "SATURDAY",
        closeTime: { hours: 12, minutes: 0 },
      },
    ]);
  });

  it("dayOfWeek 1..7 → MONDAY..SUNDAY y minutos distintos de cero", () => {
    const patch = buildLocationPatch(
      sede({
        openingHours: [
          { dayOfWeek: 7, opens: "10:30", closes: "13:45" },
          { dayOfWeek: 3, opens: "06:15", closes: "08:05" },
        ],
      }),
      AR_WA,
    );
    expect(patch.regularHours?.periods.map((p) => p.openDay)).toEqual([
      "WEDNESDAY",
      "SUNDAY",
    ]);
    expect(patch.regularHours?.periods[1]).toEqual({
      openDay: "SUNDAY",
      openTime: { hours: 10, minutes: 30 },
      closeDay: "SUNDAY",
      closeTime: { hours: 13, minutes: 45 },
    });
  });

  it("ordena los períodos aunque lleguen desordenados", () => {
    const a = buildLocationPatch(sede(), AR_WA);
    const b = buildLocationPatch(
      sede({ openingHours: [...sede().openingHours].reverse() }),
      AR_WA,
    );
    expect(b.regularHours).toEqual(a.regularHours);
    expect(patchHash(b)).toBe(patchHash(a));
  });

  it("sin teléfono propio usa el WhatsApp de ventas con +", () => {
    const patch = buildLocationPatch(sede({ phone: null }), AR_WA);
    expect(patch.phoneNumbers).toEqual({ primaryPhone: "+5492235820521" });
  });

  it("el teléfono propio de la sede gana al WhatsApp", () => {
    const patch = buildLocationPatch(
      sede({ phone: " +54 223 555-0000 " }),
      AR_WA,
    );
    expect(patch.phoneNumbers).toEqual({ primaryPhone: "+54 223 555-0000" });
  });

  it("un WhatsApp que ya trae + no lo duplica", () => {
    const patch = buildLocationPatch(sede({ phone: null }), "+5492235820521");
    expect(patch.phoneNumbers).toEqual({ primaryPhone: "+5492235820521" });
  });

  it("descarta horarios con día fuera de 1..7 en vez de mandar un período roto", () => {
    const patch = buildLocationPatch(
      sede({
        openingHours: [
          { dayOfWeek: 0, opens: "07:00", closes: "12:00" },
          { dayOfWeek: 8, opens: "07:00", closes: "12:00" },
          { dayOfWeek: 2, opens: "07:00", closes: "12:00" },
        ],
      }),
      AR_WA,
    );
    expect(patch.regularHours?.periods.map((p) => p.openDay)).toEqual([
      "TUESDAY",
    ]);
  });

  it("si todos los horarios son inválidos no manda regularHours", () => {
    const patch = buildLocationPatch(
      sede({
        openingHours: [{ dayOfWeek: 9, opens: "07:00", closes: "12:00" }],
      }),
      AR_WA,
    );
    expect(patch.regularHours).toBeUndefined();
  });

  it("sin teléfono ni WhatsApp se omite phoneNumbers (no se borra en Google)", () => {
    const patch = buildLocationPatch(sede({ phone: null }), null);
    expect(patch.phoneNumbers).toBeUndefined();
    expect(updateMaskFor(patch)).not.toContain("phoneNumbers");
  });

  it("dirección AR: regionCode, locality, administrativeArea y calle; sin postalCode si no existe", () => {
    const patch = buildLocationPatch(sede(), AR_WA);
    expect(patch.storefrontAddress).toEqual({
      regionCode: "AR",
      locality: "Mar del Plata",
      administrativeArea: "Buenos Aires",
      addressLines: ["Juan B. Justo 1018"],
    });
    expect(patch.storefrontAddress).not.toHaveProperty("postalCode");
  });

  it("incluye postalCode solo si existe", () => {
    const base = sede();
    const patch = buildLocationPatch(
      sede({ address: { ...base.address, postalCode: "7600" } }),
      AR_WA,
    );
    expect(patch.storefrontAddress?.postalCode).toBe("7600");
  });

  it("sin calle se omite storefrontAddress", () => {
    const base = sede();
    const patch = buildLocationPatch(
      sede({ address: { ...base.address, street: null } }),
      AR_WA,
    );
    expect(patch.storefrontAddress).toBeUndefined();
    expect(updateMaskFor(patch)).not.toContain("storefrontAddress");
  });

  it("websiteUri de una sede AR", () => {
    expect(buildLocationPatch(sede(), AR_WA).websiteUri).toBe(
      "https://eltemplo.org/sedes/juan-b-justo?utm_source=google&utm_medium=organic&utm_campaign=gbp-juan-b-justo",
    );
  });

  it("sede ES: /es/sedes y regionCode ES", () => {
    const base = sede();
    const patch = buildLocationPatch(
      sede({
        slug: "barcelona",
        country: "ES",
        address: {
          ...base.address,
          country: "ES",
          locality: "Barcelona",
          region: "Cataluña",
        },
      }),
      "34680774331",
    );
    expect(patch.websiteUri).toBe(
      "https://eltemplo.org/es/sedes/barcelona?utm_source=google&utm_medium=organic&utm_campaign=gbp-barcelona",
    );
    expect(patch.storefrontAddress?.regionCode).toBe("ES");
    expect(patch.phoneNumbers?.primaryPhone).toBe("+34680774331");
  });

  it("sede sin horarios publicados (Moreno): no manda regularHours (no borra los de Google)", () => {
    const patch = buildLocationPatch(sede({ openingHours: [] }), AR_WA);
    expect(patch.regularHours).toBeUndefined();
    const mask = updateMaskFor(patch);
    expect(mask).not.toContain("regularHours");
    expect(mask).toBe("phoneNumbers,storefrontAddress,websiteUri");
  });

  it("buildWebsiteUri es el mismo que usa el patch", () => {
    expect(buildWebsiteUri("jujuy", "AR")).toBe(
      "https://eltemplo.org/sedes/jujuy?utm_source=google&utm_medium=organic&utm_campaign=gbp-jujuy",
    );
  });
});

describe("updateMaskFor", () => {
  it("incluye exactamente las claves presentes, en orden fijo", () => {
    expect(updateMaskFor(buildLocationPatch(sede(), AR_WA))).toBe(
      "regularHours,phoneNumbers,storefrontAddress,websiteUri",
    );
  });
});

describe("patchHash", () => {
  it("es SHA-256 hex de 64 caracteres y estable", () => {
    const h = patchHash(buildLocationPatch(sede(), AR_WA));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(patchHash(buildLocationPatch(sede(), AR_WA))).toBe(h);
  });

  it("no depende del orden de las claves", () => {
    const a = buildLocationPatch(sede(), AR_WA);
    const b = {
      websiteUri: a.websiteUri,
      storefrontAddress: a.storefrontAddress,
      phoneNumbers: a.phoneNumbers,
      regularHours: a.regularHours,
    };
    expect(patchHash(b)).toBe(patchHash(a));
  });

  it("cambiar un horario cambia el hash", () => {
    const base = patchHash(buildLocationPatch(sede(), AR_WA));
    const changed = patchHash(
      buildLocationPatch(
        sede({
          openingHours: [
            { dayOfWeek: 1, opens: "07:00", closes: "12:30" },
            { dayOfWeek: 1, opens: "16:00", closes: "21:00" },
            { dayOfWeek: 6, opens: "09:00", closes: "12:00" },
          ],
        }),
        AR_WA,
      ),
    );
    expect(changed).not.toBe(base);
  });

  it.each([
    ["teléfono", { phone: "+5400000000" } as Partial<GbpSedeInput>],
    ["slug (web)", { slug: "otro" } as Partial<GbpSedeInput>],
  ])("cambiar %s cambia el hash", (_n, over) => {
    expect(patchHash(buildLocationPatch(sede(over), AR_WA))).not.toBe(
      patchHash(buildLocationPatch(sede(), AR_WA)),
    );
  });

  it("una clave undefined no cambia el hash (es lo mismo que ausente)", () => {
    const base = buildLocationPatch(sede({ phone: null }), null);
    expect(base.phoneNumbers).toBeUndefined();
    expect(patchHash({ ...base, phoneNumbers: undefined })).toBe(
      patchHash(base),
    );
  });

  it("cambiar la dirección cambia el hash", () => {
    const base = sede();
    const other = sede({ address: { ...base.address, street: "Otra 1" } });
    expect(patchHash(buildLocationPatch(other, AR_WA))).not.toBe(
      patchHash(buildLocationPatch(base, AR_WA)),
    );
  });
});
