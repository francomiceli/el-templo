/**
 * Mobility Routes Mapping
 *
 * Maps Nucleus routes to related mobility routes for contextual Initium selection.
 *
 * The mobilityRelated column in exercises contains route codes (FL, PL, MN, etc.)
 * that indicate which mobility areas the exercise targets.
 *
 * Route groupings based on movement patterns:
 * - Upper push (HS, HSPU, PHS, OAPU, PLPU): shoulder, chest activation
 * - Upper pull (MU, OAP, OAR, BL): back, scapular work
 * - Lower knee-dominant (SU, SS, PS): quad, ankle mobility
 * - Lower hip-dominant (FL, PL, DS): hip, glute activation
 * - Core/anti-extension (TTB, L, NC, HT): spine, core stability
 */

export const ROUTE_TO_MOBILITY_ROUTES: Record<string, string[]> = {
  // Upper push patterns -> FL (front lever prep = shoulder/core)
  'HS': ['FL', 'MN'],
  'HSPU': ['FL', 'MN'],
  'PHS': ['FL', 'MN'],
  'OAPU': ['FL', 'MN'],
  'PLPU': ['FL', 'MN'],

  // Upper pull patterns -> PL (planche prep = scapular), BL (back lever)
  'MU': ['PL', 'FL'],
  'OAP': ['PL', 'FL'],
  'OAR': ['PL', 'FL'],
  'BL': ['PL', 'FL'],

  // Lower knee-dominant -> LS (lunges), related lower body
  'SU': ['LS ( LUNGES )', 'PL'],
  'SS': ['LS ( LUNGES )', 'PL'],
  'PS': ['LS ( LUNGES )', 'PL'],
  'QC': ['LS ( LUNGES )', 'PL'],

  // Lower hip-dominant -> FL, PL (hip mobility)
  'FL': ['PL', 'MN'],
  'FLR': ['PL', 'MN'],
  'PL': ['FL', 'MN'],
  'DS': ['FL', 'PL'],

  // Core patterns -> TTB/HF (core), MN (midline)
  'TTB': ['TTB / HF', 'MN'],
  'L': ['TTB / HF', 'FL'],
  'NC': ['TTB / HF', 'MN'],
  'HT': ['MN', 'FL'],

  // Handstand variations -> MN, FL
  'HR': ['MN', 'FL'],
  'HD/ID': ['MN', 'FL'],

  // Lower lunges -> LS (lunges), PL (planche prep)
  'LS': ['LS ( LUNGES )', 'PL'],

  // Other routes
  'MN/RP': ['MN', 'FL'],
};

/**
 * Get mobility routes related to a nucleus route.
 *
 * @param nucleusRoute - The nucleus route code
 * @returns Array of related mobility route codes, empty if no mapping exists
 */
export function getMobilityRoutesForNucleus(nucleusRoute: string): string[] {
  return ROUTE_TO_MOBILITY_ROUTES[nucleusRoute] || [];
}
