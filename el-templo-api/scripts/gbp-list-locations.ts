/**
 * Google Business Profile — listar las fichas y mapearlas a las sedes
 * (fase 195, plan 09, D-21.3).
 *
 * HERRAMIENTA LOCAL (PC de Franco, nunca en el server):
 *
 *   GBP_OAUTH_CLIENT_ID=... GBP_OAUTH_CLIENT_SECRET=... GBP_REFRESH_TOKEN=... \
 *     pnpm exec tsx scripts/gbp-list-locations.ts [--write]
 *
 * Lista las cuentas y las ubicaciones a las que tiene acceso el refresh token,
 * las muestra en una tabla (id, título, dirección) y SUGIERE a qué sede
 * corresponde cada una comparando el número de calle con la dirección de las
 * sedes del seed. Con `--write` escribe un BORRADOR de
 * `src/db/migrations/0276_gbp_location_ids.sql` con un UPDATE por coincidencia
 * (revisarlo a mano antes de commitear: las coincidencias son una sugerencia).
 * Sin `--write` no escribe nada. No toca la base ni llama a ningún endpoint de
 * escritura de Google.
 *
 * Nunca imprime el client secret, el refresh token ni el access token.
 */

/* tenant-safe: no toca la DB: lista fichas de Google y, con --write, escribe un borrador de migración en disco (no se ejecuta) */

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { refreshTokenAccessToken } from "../src/modules/marketing/google/auth";
import { normalizeLocationId } from "../src/modules/marketing/google/location-id";

loadEnv({ path: ".env.development" });
loadEnv({ path: ".env" });

const ACCOUNTS_URL =
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const LOCATIONS_ORIGIN =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const MAX_PAGES = 20;
export const MIGRATION_FILE = "0276_gbp_location_ids.sql";

/** Sedes del seed y el número de calle de su dirección (tenant 1). */
export const SEDES_SEED: ReadonlyArray<{
  code: string;
  name: string;
  streetNumber: string;
}> = [
  { code: "CONST", name: "Constitución", streetNumber: "6745" },
  { code: "JUJUY", name: "Jujuy", streetNumber: "3761" },
  { code: "MORENO", name: "Moreno", streetNumber: "3751" },
  { code: "ALEM", name: "Juan B. Justo", streetNumber: "1018" },
  { code: "ALBERTI", name: "Alberti", streetNumber: "2024" },
  { code: "MOGOTES", name: "Mario Bravo", streetNumber: "618" },
  { code: "BCN", name: "Barcelona", streetNumber: "368" },
];

export interface GbpLocation {
  /** `locations/<id>` tal como lo devuelve Google. */
  name: string;
  title: string;
  address: string;
}

export interface LocationMatch {
  code: string;
  sedeName: string;
  location: GbpLocation;
  /** Id numérico (lo que va a `branches.gbp_location_id`). */
  locationId: string;
}

export interface MatchResult {
  matches: LocationMatch[];
  /** Sedes sin ficha, o con más de una candidata (no se adivina). */
  unmatchedSedes: Array<{ code: string; reason: "sin_ficha" | "ambigua" }>;
  /** Fichas que no encajan con ninguna sede. */
  unmatchedLocations: GbpLocation[];
}

function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** Números de 3 a 5 dígitos que aparecen sueltos en un texto. */
function streetNumbers(text: string): string[] {
  return text.match(/(?<![0-9])[0-9]{3,5}(?![0-9])/g) ?? [];
}

/**
 * Sugiere ficha → sede por número de calle. Una sede con 0 o 2+ candidatas
 * queda sin mapear (se informa) y una ficha que encaja con dos sedes no se
 * asigna: la ambigüedad la resuelve una persona.
 */
export function matchLocationsToSedes(locations: GbpLocation[]): MatchResult {
  const candidatesBySede = new Map<string, GbpLocation[]>();
  const sedesByLocation = new Map<string, string[]>();

  for (const sede of SEDES_SEED) {
    const found = locations.filter((loc) =>
      streetNumbers(loc.address).includes(sede.streetNumber),
    );
    candidatesBySede.set(sede.code, found);
    for (const loc of found) {
      sedesByLocation.set(loc.name, [
        ...(sedesByLocation.get(loc.name) ?? []),
        sede.code,
      ]);
    }
  }

  const matches: LocationMatch[] = [];
  const unmatchedSedes: MatchResult["unmatchedSedes"] = [];
  const matchedNames = new Set<string>();

  for (const sede of SEDES_SEED) {
    const found = candidatesBySede.get(sede.code) ?? [];
    if (found.length === 0) {
      unmatchedSedes.push({ code: sede.code, reason: "sin_ficha" });
      continue;
    }
    const loc = found[0];
    const locationId = normalizeLocationId(loc.name);
    if (
      found.length > 1 ||
      (sedesByLocation.get(loc.name) ?? []).length > 1 ||
      locationId === null
    ) {
      unmatchedSedes.push({ code: sede.code, reason: "ambigua" });
      continue;
    }
    matches.push({
      code: sede.code,
      sedeName: sede.name,
      location: loc,
      locationId,
    });
    matchedNames.add(loc.name);
  }

  return {
    matches,
    unmatchedSedes,
    unmatchedLocations: locations.filter((l) => !matchedNames.has(l.name)),
  };
}

/** Texto del borrador de migración. Sin punto y coma dentro de los comentarios. */
export function renderMigrationSql(matches: LocationMatch[]): string {
  const header = [
    "-- 0276_gbp_location_ids.sql",
    "-- BORRADOR generado por scripts/gbp-list-locations.ts (fase 195, plan 09).",
    "-- REVISAR A MANO antes de commitear: las coincidencias se sugirieron comparando",
    "-- el numero de calle con la direccion de cada ficha de Google.",
    "-- Mapea cada sede de El Templo (tenant 1) con su ficha de Google Business Profile.",
    "-- Idempotente y keyed por code mas tenant_id, como el resto de las migraciones de datos.",
    "-- Un comentario SQL nunca debe contener el separador de statements.",
    "",
  ];
  const statements = matches.map(
    (m) =>
      `-- ${m.sedeName}: ${m.location.title.replace(/[;\r\n]/g, " ")}\n` +
      `UPDATE branches SET gbp_location_id = '${m.locationId}' WHERE code = '${m.code}' AND tenant_id = 1;`,
  );
  return `${header.join("\n")}\n${statements.join("\n\n")}\n`;
}

function formatAddress(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const a = raw as {
    addressLines?: unknown;
    locality?: unknown;
    administrativeArea?: unknown;
  };
  const lines = Array.isArray(a.addressLines)
    ? a.addressLines.filter((l): l is string => typeof l === "string")
    : [];
  return [
    ...lines,
    typeof a.locality === "string" ? a.locality : "",
    typeof a.administrativeArea === "string" ? a.administrativeArea : "",
  ]
    .filter((p) => p.length > 0)
    .join(", ");
}

async function getJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      `Google respondió ${response.status} en ${new URL(url).pathname}`,
    );
  }
  return (await response.json()) as unknown;
}

/** Todas las ubicaciones de todas las cuentas (con paginado). Solo lectura. */
export async function listAllLocations(token: string): Promise<GbpLocation[]> {
  const accountsBody = (await getJson(ACCOUNTS_URL, token)) as {
    accounts?: Array<{ name?: unknown }>;
  };
  const locations: GbpLocation[] = [];

  for (const account of accountsBody.accounts ?? []) {
    if (
      typeof account.name !== "string" ||
      !/^accounts\/[0-9]+$/.test(account.name)
    ) {
      continue;
    }
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        readMask: "name,title,storefrontAddress",
        pageSize: "100",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const body = (await getJson(
        `${LOCATIONS_ORIGIN}/${account.name}/locations?${params.toString()}`,
        token,
      )) as {
        locations?: Array<{
          name?: unknown;
          title?: unknown;
          storefrontAddress?: unknown;
        }>;
        nextPageToken?: unknown;
      };
      for (const loc of body.locations ?? []) {
        if (typeof loc.name !== "string") continue;
        locations.push({
          name: loc.name,
          title: typeof loc.title === "string" ? loc.title : "",
          address: formatAddress(loc.storefrontAddress),
        });
      }
      if (typeof body.nextPageToken !== "string" || body.nextPageToken === "")
        break;
      pageToken = body.nextPageToken;
    }
  }
  return locations;
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const clientId = (process.env.GBP_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GBP_OAUTH_CLIENT_SECRET ?? "").trim();
  const refreshToken = (process.env.GBP_REFRESH_TOKEN ?? "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    fail(
      "Faltan GBP_OAUTH_CLIENT_ID, GBP_OAUTH_CLIENT_SECRET y/o GBP_REFRESH_TOKEN (el token sale de scripts/gbp-authorize.ts).",
      2,
    );
  }

  const token = await refreshTokenAccessToken({
    clientId,
    clientSecret,
    refreshToken,
  });
  const locations = await listAllLocations(token);

  out(`Fichas encontradas: ${locations.length}`);
  out("");
  out(["ID".padEnd(22), "TITULO".padEnd(36), "DIRECCION"].join(" "));
  for (const loc of locations) {
    out(
      [
        (normalizeLocationId(loc.name) ?? loc.name).padEnd(22),
        loc.title.slice(0, 35).padEnd(36),
        loc.address,
      ].join(" "),
    );
  }

  const result = matchLocationsToSedes(locations);
  out("");
  out("Sugerencia de mapeo ficha -> sede (por numero de calle):");
  for (const m of result.matches) {
    out(
      `  ${m.code.padEnd(8)} ${m.sedeName.padEnd(14)} -> ${m.locationId}  (${m.location.title})`,
    );
  }
  for (const u of result.unmatchedSedes) {
    out(
      `  ${u.code.padEnd(8)} SIN MAPEAR (${u.reason === "ambigua" ? "mas de una ficha posible" : "ninguna ficha con ese numero de calle"})`,
    );
  }
  if (result.unmatchedLocations.length > 0) {
    out("");
    out("Fichas que no encajan con ninguna sede:");
    for (const l of result.unmatchedLocations) {
      out(`  ${(normalizeLocationId(l.name) ?? l.name).padEnd(22)} ${l.title}`);
    }
  }

  if (!write) {
    out("");
    out("Para escribir el borrador de la migracion, repetí con --write.");
    return;
  }
  if (result.matches.length === 0) {
    fail("No hay coincidencias que escribir.");
  }
  const target = path.resolve(
    __dirname,
    "../src/db/migrations",
    MIGRATION_FILE,
  );
  if (existsSync(target)) {
    fail(
      `${MIGRATION_FILE} ya existe: no se pisa. Borralo o renombralo y repetí.`,
    );
  }
  writeFileSync(target, renderMigrationSql(result.matches), "utf8");
  out("");
  out(
    `Borrador escrito en src/db/migrations/${MIGRATION_FILE}. Revisalo antes de commitear.`,
  );
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : "Error desconocido");
  });
}
