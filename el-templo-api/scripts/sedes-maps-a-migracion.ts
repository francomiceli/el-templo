/**
 * Links de Google Maps de las sedes -> migración 0275 de datos exactos
 * (fase 195, plan 14, D-08).
 *
 * HERRAMIENTA LOCAL (PC de Franco o del equipo):
 *
 *   cd el-templo-api
 *   cp scripts/sedes-maps.example.json /ruta/sedes-maps.json   (completarlo)
 *   pnpm exec tsx scripts/sedes-maps-a-migracion.ts /ruta/sedes-maps.json          # solo muestra la tabla
 *   pnpm exec tsx scripts/sedes-maps-a-migracion.ts /ruta/sedes-maps.json --write  # además escribe la migración
 *
 * Por cada sede con datos: sigue los links cortos (maps.app.goo.gl) hasta el
 * link largo, saca latitud y longitud (mínimo 5 decimales), toma el Place ID
 * del JSON (gana sobre el del link), valida teléfono y código postal, y con
 * `--write` escribe `src/db/migrations/0275_sedes_maps_franco.sql` con un
 * UPDATE por sede (keyed por code y tenant_id = 1, solo las columnas con dato).
 * Revisar el archivo antes de commitear. Si hay cualquier error no se escribe
 * nada, y si el archivo ya existe no se pisa.
 *
 * Solo hace pedidos GET a links de Google Maps (lista cerrada de hosts, máximo
 * 5 saltos). Destino final aceptado: www.google.com/maps, google.com/maps y
 * maps.google.com (los links cortos maps.app.goo.gl y goo.gl/maps solo valen
 * como paso intermedio). Si el destino es otro sitio se rechaza la entrada con
 * el motivo. No toca la base de datos. `--out=<ruta>` cambia el archivo de
 * salida (sirve para probar sin tocar el repo).
 */

/* tenant-safe: no toca la DB: lee un JSON local, resuelve links de Google Maps y, con --write, escribe un borrador de migración en disco (no se ejecuta) */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isGoogleMapsUrl,
  isShortMapsUrl,
  parseMapsLink,
  precisionOk,
} from "../src/modules/web-public/maps-link";

export const MIGRATION_FILE = "0275_sedes_maps_franco.sql";
export const SEDE_CODES = [
  "CONST",
  "JUJUY",
  "MORENO",
  "ALEM",
  "ALBERTI",
  "MOGOTES",
  "BCN",
  "PARK",
] as const;
export const MAX_HOPS = 5;
/** Largo de la columna `branches.maps_url`. */
export const MAPS_URL_MAX = 500;
const INPUT_KEYS = ["code", "mapsLink", "placeId", "phone", "postalCode"];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SedeInput {
  code: string;
  mapsLink: string;
  placeId: string;
  phone: string;
  postalCode: string;
}

export interface SedeRow {
  code: string;
  lat: number | null;
  lng: number | null;
  /** null si la sede no trae coordenadas. */
  precisionOk: boolean | null;
  placeId: string | null;
  mapsUrl: string | null;
  phone: string | null;
  postalCode: string | null;
  /** Avisos que no frenan (por ejemplo, se usó un link de Maps más corto). */
  notes: string[];
  problems: string[];
  /** La entrada no trae ningún dato: se saltea sin error. */
  empty: boolean;
}

export type ResolveResult =
  | { ok: true; finalUrl: string; hops: number }
  | { ok: false; reason: string };

function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/**
 * Sigue un link de Google Maps hasta su destino final. Cada link (el inicial y
 * cada salto) tiene que ser de Google Maps: los cortos solo sirven de paso y el
 * destino final tiene que estar en la lista cerrada de `isGoogleMapsUrl`.
 * Nunca se pide una URL que no sea de Google (los saltos se validan antes de
 * seguirlos).
 */
export async function resolveMapsLink(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveResult> {
  let current: URL;
  try {
    current = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "el link no es una URL válida" };
  }

  for (let hops = 0; ; hops++) {
    if (current.protocol !== "https:") {
      return { ok: false, reason: "el link no es https" };
    }
    if (isGoogleMapsUrl(current)) {
      return { ok: true, finalUrl: current.href, hops };
    }
    if (!isShortMapsUrl(current)) {
      return {
        ok: false,
        reason: `el destino final es otro sitio (${current.hostname}), no Google Maps: pegá el link largo desde el navegador`,
      };
    }
    if (hops >= MAX_HOPS) {
      return {
        ok: false,
        reason: `más de ${MAX_HOPS} redirecciones seguidas: pegá el link largo desde el navegador`,
      };
    }

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetchImpl(current.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err: unknown) {
      return {
        ok: false,
        reason: `no se pudo abrir el link corto (${err instanceof Error ? err.message : "error de red"})`,
      };
    }
    // No hace falta el cuerpo: solo el encabezado `location`.
    await response.body?.cancel().catch(() => undefined);

    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || location === null) {
      return {
        ok: false,
        reason: `el link corto no redirige (respuesta ${response.status})`,
      };
    }
    try {
      current = new URL(location, current);
    } catch {
      return { ok: false, reason: "el link corto redirige a una URL inválida" };
    }
  }
}

/** Teléfono: se sacan espacios, guiones, puntos y paréntesis. Queda `+` opcional y 8-16 caracteres. */
export function normalizePhone(
  raw: string,
): { value: string } | { problem: string } {
  const value = raw.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(value) || value.length < 8 || value.length > 16) {
    return {
      problem: `teléfono inválido "${raw}": usar solo números y un + opcional al principio, de 8 a 16 caracteres (ej. +542234792626)`,
    };
  }
  return { value };
}

export function validatePostalCode(
  raw: string,
): { value: string } | { problem: string } {
  const value = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/.test(value)) {
    return {
      problem: `código postal inválido "${raw}": hasta 20 caracteres, solo letras, números, espacio y guion`,
    };
  }
  return { value };
}

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,255}$/;

/**
 * Texto seguro para guardar como `maps_url`. Si el link largo no entra en la
 * columna o trae caracteres que pueden romper el SQL, se arma el link canónico
 * de búsqueda con los datos ya validados.
 */
export function chooseMapsUrl(
  finalUrl: string,
  lat: number,
  lng: number,
  placeId: string | null,
): { url: string; note: string | null } {
  // eslint-disable-next-line no-control-regex
  const unsafe = /[;\\\u0000-\u001f\u007f]|-->/.test(finalUrl);
  if (finalUrl.length <= MAPS_URL_MAX && !unsafe) {
    return { url: finalUrl, note: null };
  }
  const canonical =
    `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}` +
    (placeId !== null ? `&query_place_id=${encodeURIComponent(placeId)}` : "");
  return {
    url: canonical,
    note: "el link largo no entra en la columna maps_url o trae caracteres no admitidos: se guarda el link de búsqueda con las coordenadas",
  };
}

/** Valida la forma del JSON de entrada. */
export function parseInput(raw: unknown): {
  entries: Array<{ index: number; input: SedeInput; problems: string[] }>;
  fatal: string | null;
} {
  if (!Array.isArray(raw)) {
    return {
      entries: [],
      fatal: "El JSON tiene que ser una lista de sedes: [ { code: ... }, ... ]",
    };
  }
  const seen = new Set<string>();
  const entries = raw.map((item: unknown, index) => {
    const problems: string[] = [];
    const record =
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (record === null) {
      return {
        index,
        input: {
          code: "",
          mapsLink: "",
          placeId: "",
          phone: "",
          postalCode: "",
        },
        problems: [`la entrada ${index + 1} no es un objeto`],
      };
    }
    for (const key of Object.keys(record)) {
      if (!INPUT_KEYS.includes(key)) {
        problems.push(
          `campo desconocido "${key}" (los campos son: ${INPUT_KEYS.join(", ")})`,
        );
      }
    }
    const text = (key: string): string => {
      const value = record[key];
      if (value === undefined || value === null) return "";
      if (typeof value !== "string") {
        problems.push(`"${key}" tiene que ser texto entre comillas`);
        return "";
      }
      return value.trim();
    };
    const input: SedeInput = {
      code: text("code"),
      mapsLink: text("mapsLink"),
      placeId: text("placeId"),
      phone: text("phone"),
      postalCode: text("postalCode"),
    };
    if (!(SEDE_CODES as readonly string[]).includes(input.code)) {
      problems.push(
        `code "${input.code}" desconocido (válidos: ${SEDE_CODES.join(", ")})`,
      );
    } else if (seen.has(input.code)) {
      problems.push(`code "${input.code}" repetido`);
    } else {
      seen.add(input.code);
    }
    return { index, input, problems };
  });
  return { entries, fatal: null };
}

/** Resuelve y valida una entrada. */
export async function buildRow(
  input: SedeInput,
  inheritedProblems: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<SedeRow> {
  const row: SedeRow = {
    code: input.code,
    lat: null,
    lng: null,
    precisionOk: null,
    placeId: null,
    mapsUrl: null,
    phone: null,
    postalCode: null,
    notes: [],
    problems: [...inheritedProblems],
    empty:
      input.mapsLink === "" &&
      input.placeId === "" &&
      input.phone === "" &&
      input.postalCode === "",
  };
  if (row.empty) return row;

  let linkPlaceId: string | null = null;
  if (input.mapsLink !== "") {
    const resolved = await resolveMapsLink(input.mapsLink, fetchImpl);
    if (!resolved.ok) {
      row.problems.push(`mapsLink: ${resolved.reason}`);
    } else {
      const parsed = parseMapsLink(resolved.finalUrl);
      if (parsed === null) {
        row.problems.push(
          "mapsLink: no se encontraron coordenadas ni Place ID en el link",
        );
      } else if (parsed.lat === null || parsed.lng === null) {
        row.problems.push(
          "mapsLink: el link no trae coordenadas (abrí el lugar en Google Maps y copiá el link largo de la barra del navegador)",
        );
      } else {
        row.lat = parsed.lat;
        row.lng = parsed.lng;
        row.precisionOk = precisionOk(parsed.lat) && precisionOk(parsed.lng);
        linkPlaceId = parsed.placeId;
        if (!row.precisionOk) {
          row.problems.push(
            `mapsLink: coordenadas con menos de 5 decimales (${parsed.lat}, ${parsed.lng}): copiá el link largo del lugar (el que tiene "!3d" y "!4d"), no el del centro del mapa`,
          );
        } else {
          const chosen = chooseMapsUrl(
            resolved.finalUrl,
            parsed.lat,
            parsed.lng,
            input.placeId !== "" ? input.placeId : linkPlaceId,
          );
          row.mapsUrl = chosen.url;
          if (chosen.note !== null) row.notes.push(chosen.note);
        }
      }
    }
  }

  // El Place ID del JSON gana sobre el del link.
  const placeId = input.placeId !== "" ? input.placeId : linkPlaceId;
  if (placeId !== null) {
    if (PLACE_ID_RE.test(placeId)) {
      row.placeId = placeId;
    } else {
      row.problems.push(
        `placeId inválido "${placeId}": 10 a 255 caracteres, solo letras, números, _ y - (se obtiene con el Place ID Finder)`,
      );
    }
  }

  if (input.phone !== "") {
    const phone = normalizePhone(input.phone);
    if ("problem" in phone) row.problems.push(phone.problem);
    else row.phone = phone.value;
  }
  if (input.postalCode !== "") {
    const postalCode = validatePostalCode(input.postalCode);
    if ("problem" in postalCode) row.problems.push(postalCode.problem);
    else row.postalCode = postalCode.value;
  }
  return row;
}

/** Literal de texto para MySQL: se duplican las comillas simples y se escapa la barra invertida. */
export function sqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Texto de la migración. Sin punto y coma dentro de los comentarios. */
export function renderMigrationSql(rows: SedeRow[], date: string): string {
  const header = [
    `-- ${MIGRATION_FILE}`,
    "-- Fase 195 (D-08): datos exactos de las sedes para la web y las fichas de Google.",
    `-- Generada el ${date} por scripts/sedes-maps-a-migracion.ts.`,
    "-- Origen: links de Google Maps provistos por Franco.",
    "-- REVISAR A MANO antes de commitear: coordenadas, Place ID, telefonos y codigos postales.",
    "--",
    "-- Cada UPDATE va keyed por code y tenant_id = 1 (El Templo) y toca solo las",
    "-- columnas con dato. Es idempotente: re-ejecutarla deja los mismos valores.",
    "-- Un comentario SQL nunca debe contener el separador de statements.",
    "",
  ].join("\n");

  const statements = rows
    .filter((r) => !r.empty && r.problems.length === 0)
    .map((r) => {
      const sets: string[] = [];
      if (r.lat !== null && r.lng !== null) {
        sets.push(`latitude = ${r.lat.toFixed(6)}`);
        sets.push(`longitude = ${r.lng.toFixed(6)}`);
      }
      if (r.placeId !== null) sets.push(`place_id = ${sqlString(r.placeId)}`);
      if (r.mapsUrl !== null) sets.push(`maps_url = ${sqlString(r.mapsUrl)}`);
      if (r.phone !== null) sets.push(`phone = ${sqlString(r.phone)}`);
      if (r.postalCode !== null) {
        sets.push(`postal_code = ${sqlString(r.postalCode)}`);
      }
      return (
        `UPDATE branches\n  SET ${sets.join(",\n      ")}\n` +
        `  WHERE code = ${sqlString(r.code)} AND tenant_id = 1;`
      );
    });

  return `${header}\n${statements.join("\n--> statement-breakpoint\n")}\n`;
}

function cell(value: string | number | null, width: number): string {
  return String(value ?? "-")
    .slice(0, width)
    .padEnd(width);
}

export function renderTable(rows: SedeRow[]): string {
  const head = [
    cell("CODE", 8),
    cell("LAT", 12),
    cell("LNG", 12),
    cell("PRECISION", 10),
    cell("PLACE ID", 18),
    cell("TELEFONO", 17),
    cell("CP", 9),
    "PROBLEMAS",
  ].join(" ");
  const lines = rows.map((r) =>
    [
      cell(r.code, 8),
      cell(r.lat, 12),
      cell(r.lng, 12),
      cell(r.precisionOk === null ? "-" : r.precisionOk ? "OK" : "BAJA", 10),
      cell(r.placeId, 18),
      cell(r.phone, 17),
      cell(r.postalCode, 9),
      r.empty
        ? "(sin datos, se saltea)"
        : r.problems.length === 0
          ? "-"
          : `${r.problems.length} (ver abajo)`,
    ].join(" "),
  );
  return [head, ...lines].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const outFlag = args.find((a) => a.startsWith("--out="));
  const positional = args.filter((a) => !a.startsWith("--"));
  const inputPath = positional[0];
  if (inputPath === undefined) {
    fail(
      "Uso: pnpm exec tsx scripts/sedes-maps-a-migracion.ts <ruta-json> [--write]",
      2,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.resolve(inputPath), "utf8")) as unknown;
  } catch (err: unknown) {
    fail(
      `No se pudo leer el JSON "${inputPath}": ${err instanceof Error ? err.message : "error desconocido"}`,
      2,
    );
  }

  const parsed = parseInput(raw);
  if (parsed.fatal !== null) fail(parsed.fatal, 2);

  const rows: SedeRow[] = [];
  for (const entry of parsed.entries) {
    rows.push(await buildRow(entry.input, entry.problems));
  }

  out(renderTable(rows));
  let problemCount = 0;
  for (const r of rows) {
    for (const note of r.notes) out(`\nAviso ${r.code || "?"}: ${note}`);
  }
  for (const r of rows) {
    if (r.problems.length === 0) continue;
    problemCount += r.problems.length;
    out(`\nPROBLEMAS en ${r.code || "(sin code)"}:`);
    for (const p of r.problems) out(`  - ${p}`);
  }

  const usable = rows.filter((r) => !r.empty && r.problems.length === 0);
  if (problemCount > 0) {
    fail(
      `\nHay ${problemCount} problema(s): corregí el JSON y repetí. No se escribió nada.`,
    );
  }
  if (usable.length === 0) {
    fail("\nNinguna sede trae datos: completá el JSON y repetí.");
  }
  if (!write) {
    out(
      `\n${usable.length} sede(s) listas. Para escribir la migración, repetí con --write.`,
    );
    return;
  }

  const target =
    outFlag !== undefined
      ? path.resolve(outFlag.slice("--out=".length))
      : path.resolve(__dirname, "../src/db/migrations", MIGRATION_FILE);
  if (existsSync(target)) {
    fail(`\n${target} ya existe: no se pisa. Borralo o renombralo y repetí.`);
  }
  const date = new Date().toISOString().slice(0, 10);
  // flag "wx": falla si el archivo apareció entre el chequeo y la escritura.
  writeFileSync(target, renderMigrationSql(rows, date), {
    encoding: "utf8",
    flag: "wx",
  });
  out(`\nMigración escrita en ${target}. Revisala antes de commitear.`);
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : "Error desconocido");
  });
}
