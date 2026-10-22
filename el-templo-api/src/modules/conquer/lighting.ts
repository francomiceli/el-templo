/**
 * Fase 201 D-05 / D-13: encendido del mapa muscular de Conquer (puro).
 *
 * Adaptacion de `balance-map.ts` de la fase 196 al registro nuevo (un numero por
 * escalon, el peor de las 3 series): cada escalon E1-E3 con valor mayor que 0
 * cuenta como las 3 series del ejercicio, asi que un ejercicio "trabajado" suma
 * 3 series a cada zona que tiene. Una zona se enciende como principal con 2 o
 * mas series principales, y como secundaria con 4 o mas series secundarias (si
 * no es principal). El hold final y el finisher no cuentan: ni entran al input.
 * Solo se muestra que se enciende, sin numeros ni porcentajes.
 *
 * Los slugs son los de BodyFigure (la zona `tibialis` de la fase 200 no entra).
 *
 * CERO imports: corre con node por type-stripping (ver test/conquer/oracle-check.mjs).
 * Sin enum, sin namespace, sin clases ni parameter properties.
 */

export const CONQUER_ZONES = [
  "chest",
  "deltoids",
  "triceps",
  "biceps",
  "forearm",
  "trapezius",
  "upper-back",
  "lower-back",
  "abs",
  "obliques",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "calves",
] as const;

export type ConquerZone = (typeof CONQUER_ZONES)[number];

export const ZONE_LABELS: Record<ConquerZone, string> = {
  chest: "Pecho",
  deltoids: "Hombros",
  triceps: "Tríceps",
  biceps: "Bíceps",
  forearm: "Antebrazos",
  trapezius: "Trapecio",
  "upper-back": "Espalda alta",
  "lower-back": "Espalda baja",
  abs: "Abdominales",
  obliques: "Oblicuos",
  gluteal: "Glúteos",
  quadriceps: "Cuádriceps",
  hamstring: "Isquiotibiales",
  adductors: "Aductores",
  calves: "Pantorrillas",
};

/** D-13: un ejercicio trabajado cuenta como las 3 series de la sesion. */
export const SERIES_PER_WORKED_EXERCISE = 3;
/** Series con la zona como principal para encenderla como principal. */
export const PRIMARY_MIN_SERIES = 2;
/** Series con la zona como secundaria para encenderla como secundaria. */
export const SECONDARY_MIN_SERIES = 4;

export function isConquerZone(slug: string): boolean {
  return (CONQUER_ZONES as readonly string[]).includes(slug);
}

/**
 * D-13: el ejercicio cuenta si algun escalon E1-E3 tiene valor mayor que 0
 * (un 0 o el vacio no es trabajo hecho). El hold no entra al input.
 */
export function exerciseWorked(values: {
  e1: number;
  e2: number;
  e3: number;
}): boolean {
  return values.e1 > 0 || values.e2 > 0 || values.e3 > 0;
}

type Role = "principal" | "secundario";

/** Roles distintos por zona de un ejercicio (una vez por zona y rol). */
function rolesByZone(
  muscles: readonly { zone: string; role: Role }[],
): { zone: ConquerZone; role: Role }[] {
  const seen = new Set<string>();
  const out: { zone: ConquerZone; role: Role }[] = [];
  for (const { zone, role } of muscles) {
    if (!isConquerZone(zone)) continue;
    const key = `${zone}|${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ zone: zone as ConquerZone, role });
  }
  return out;
}

/**
 * Zonas a encender con los ejercicios de la sesion o de la semana. Salida en el
 * orden de `CONQUER_ZONES`; zonas desconocidas se ignoran.
 */
export function lightZones(
  items: readonly {
    muscles: readonly { zone: string; role: Role }[];
    worked: boolean;
  }[],
): { primary: string[]; secondary: string[] } {
  const principal = new Map<ConquerZone, number>();
  const secondary = new Map<ConquerZone, number>();
  for (const item of items) {
    if (!item.worked) continue;
    for (const { zone, role } of rolesByZone(item.muscles)) {
      const counts = role === "principal" ? principal : secondary;
      counts.set(zone, (counts.get(zone) ?? 0) + SERIES_PER_WORKED_EXERCISE);
    }
  }
  const primary: string[] = [];
  const secondaryOut: string[] = [];
  for (const zone of CONQUER_ZONES) {
    if ((principal.get(zone) ?? 0) >= PRIMARY_MIN_SERIES) {
      primary.push(zone);
    } else if ((secondary.get(zone) ?? 0) >= SECONDARY_MIN_SERIES) {
      secondaryOut.push(zone);
    }
  }
  return { primary, secondary: secondaryOut };
}
