/**
 * Route code to full name mapping
 *
 * Routes represent the main movement skill being trained.
 * These codes are used in the SPOM system and displayed in block headers.
 */
export const ROUTE_NAMES: Record<string, string> = {
  // Pull routes
  FL: 'Front Lever',
  FLR: 'Front Lever Row',
  BL: 'Back Lever',
  MU: 'Muscle Up',
  OAP: 'One Arm Pull Up',
  OAR: 'One Arm Row',
  TTB: 'Toe to Bar',
  'MN/RP': 'Manna / Reverse Planche',

  // Push routes
  PL: 'Planche',
  PLPU: 'Planche Push Up',
  HSPU: 'Handstand Push Up',
  HS: 'Handstand',
  PHS: 'Press Handstand',
  OAPU: 'One Arm Push Up',
  'HD/ID': 'Hefesto / Impossible Dip',

  // Leg routes
  PS: 'Pistol Squat',
  DS: 'Dragon Squat',
  NC: 'Nordic Curl',
  SS: 'Sissy Squat',
  QC: 'Quad Curl',
  HR: 'Ham Raises',
  HT: 'Hip Thrust',
  L: 'Lunge',
  SU: 'Step Up',
  'REVERSE HYPER': 'Reverse Hyper',

  // Other routes
  AF: 'Active Flexibility',
  BRIDGE: 'Bridge',
  PIKE: 'Pike',
  SPAGAT: 'Spagat',
  'SIDE PCK': 'Side Pick',
};

/**
 * Get the full name for a route code
 * Returns the code itself if no mapping exists
 */
export function getRouteName(code: string): string {
  return ROUTE_NAMES[code?.toUpperCase()] || code;
}
