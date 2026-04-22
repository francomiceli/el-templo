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
  FLR: 'Front Lever Row',
  BL: 'Back Lever',
  MU: 'Dominadas a pecho',
  OAP: 'Dominada a un brazo',
  OAR: 'Remo a un brazo',
  TTB: 'Punta a la barra',
  'MN/RP': 'Manna / Planche invertida',

  // Push
  PL: 'Plancha',
  PLPU: 'Flexión en plancha',
  HSPU: 'Flexión invertida',
  HS: 'Parada de manos',
  PHS: 'Press a parada de manos',
  OAPU: 'Flexión a un brazo',
  'HD/ID': 'Hefesto / Fondo imposible',

  // Legs
  PS: 'Sentadilla pistol',
  DS: 'Sentadilla dragón',
  NC: 'Curl nórdico',
  SS: 'Sentadilla sissy',
  QC: 'Curl de cuádriceps',
  HR: 'Ham raise',
  HT: 'Empuje de cadera',
  L: 'Zancada',
  SU: 'Subida al cajón',
  'REVERSE HYPER': 'Hiperextensión inversa',

  // Other
  AF: 'Flexibilidad activa',
  BRIDGE: 'Puente',
  PIKE: 'Pica',
  SPAGAT: 'Spagat',
  'SIDE PCK': 'Patada lateral',

  // Phase 100 addition
  games: 'Juegos',
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
