/**
 * Contraction type display helpers.
 * Normalizes contraction strings and provides consistent labels/colors.
 */

export function normalizeContraction(contraction: string | null | undefined): string {
  switch (contraction?.toUpperCase()) {
    case 'CON':
    case 'CONCENTRICO':
      return 'CON';
    case 'EXC':
    case 'EXCENTRICO':
      return 'EXC';
    case 'ISO':
    case 'ISOMETRICO':
      return 'ISO';
    default:
      return contraction?.toUpperCase() || '';
  }
}

export function contractionLabel(contraction: string | null | undefined): string {
  return normalizeContraction(contraction) || '-';
}

export function contractionColor(contraction: string | null | undefined): string {
  switch (normalizeContraction(contraction)) {
    case 'CON':
      return 'blue-grey';
    case 'EXC':
      return 'teal';
    case 'ISO':
      return 'orange';
    default:
      return 'grey';
  }
}
