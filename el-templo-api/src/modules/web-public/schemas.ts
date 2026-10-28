// Módulo: web-public — schema de respuesta de GET /site-data.
//
// Declarado COMPLETO a propósito: fast-json-stringify descarta todo campo que
// no figure acá, así que es la segunda barrera contra una fuga de datos
// (T-195-05) además de la selección explícita de columnas del service.
const nullableString = { type: ["string", "null"] } as const;

const countrySchema = { type: "string", enum: ["AR", "ES"] } as const;

const sedeSchema = {
  type: "object",
  required: [
    "id",
    "code",
    "slug",
    "publicName",
    "kind",
    "country",
    "timezone",
    "address",
    "geo",
    "placeId",
    "mapsUrl",
    "phone",
    "photoUrl",
    "activities",
    "openingHours",
    "schedule",
  ],
  properties: {
    id: { type: "integer" },
    code: { type: "string" },
    slug: { type: "string" },
    publicName: { type: "string" },
    kind: { type: "string", enum: ["gym", "community_space"] },
    country: countrySchema,
    timezone: { type: "string" },
    address: {
      type: "object",
      properties: {
        street: nullableString,
        locality: nullableString,
        region: nullableString,
        postalCode: nullableString,
        country: countrySchema,
      },
    },
    geo: {
      type: ["object", "null"],
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
      },
    },
    placeId: nullableString,
    mapsUrl: { type: "string" },
    phone: nullableString,
    photoUrl: nullableString,
    activities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          slug: { type: "string" },
          isSpecial: { type: "boolean" },
        },
      },
    },
    openingHours: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayOfWeek: { type: "integer" },
          opens: { type: "string" },
          closes: { type: "string" },
        },
      },
    },
    schedule: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayOfWeek: { type: "integer" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          activity: { type: "string" },
        },
      },
    },
  },
} as const;

const countryContactSchema = {
  type: "object",
  properties: { salesWhatsapp: nullableString },
} as const;

export const siteDataSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        generatedAt: { type: "string" },
        brand: {
          type: "object",
          properties: { name: { type: "string" } },
        },
        countries: {
          type: "object",
          properties: {
            AR: countryContactSchema,
            ES: countryContactSchema,
          },
        },
        sedes: { type: "array", items: sedeSchema },
      },
    },
  },
} as const;
