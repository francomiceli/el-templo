/**
 * Route short-code → Spanish display label.
 *
 * Duplicated from el-templo-app/src/constants/route-labels.ts — SPEC Requirement 4 (D-02).
 * Keys and Spanish values MUST stay identical across both files; drift is prevented by PR review.
 *
 * Consumed by the admin session editor (as hover tooltip on route displays). The member app has its own copy.
 * Canonical short codes (DB + API wire format) are NOT changed — this dictionary is display-only.
 */
export const ROUTE_LABELS: Record<string, string> = {
  // Pull
  FL: 'Front Lever',
  // Fase 200 D1 (2026-10-21): nombres oficiales de HR, MN/RP, HD/ID y FLR (SIDE PCK ya era Side Pancake)
  FLR: 'Front Lever Row',
  BL: 'Back Lever',
  MU: 'Muscle Up',
  OAP: 'Dominadas',
  OAR: 'Remos',
  TTB: 'Toe to Bar',
  'MN/RP': 'Manna',

  // Push
  PL: 'Planche',
  PLPU: 'Planche Push Up',
  HSPU: 'Handstand Push Up',
  HS: 'Handstand',
  PHS: 'Press to Handstand',
  OAPU: 'Push Ups',
  'HD/ID': 'Fondos',

  // Legs
  PS: 'Pistol Squat',
  DS: 'Dragon Squat',
  NC: 'Nordic Curl',
  SS: 'Sissy Squat',
  QC: 'Quad Curl',
  HR: 'Espinales y planchas laterales',
  HT: 'Hip Thrust',
  L: 'Lunge',
  SU: 'Step Up',
  'REVERSE HYPER': 'Reverse Hyper',

  // Other
  AF: 'Animal Flow',
  BRIDGE: 'Bridge',
  PIKE: 'Pike',
  SPAGAT: 'Spagat',
  'SIDE PCK': 'Side Pancake',

  // Phase 100 addition
  games: 'Juegos',

  // v5.6: ruta que acepta todos los ejercicios
  FB: 'Full Body',
};

/**
 * Get the Spanish display label for a route short code.
 * Falls back to the raw code if not mapped (safety net for any future code added
 * to the DB before the dictionary catches up).
 */
export function getRouteLabel(code: string | null | undefined): string {
  if (!code) return '';
  // Try exact key first, then uppercase, then lowercase for 'games'
  return (
    ROUTE_LABELS[code] ??
    ROUTE_LABELS[code.toUpperCase()] ??
    ROUTE_LABELS[code.toLowerCase()] ??
    code
  );
}
