// Países donde opera El Templo (`branches.country`, ISO alfa-2). Fuente única
// para los selectores de país de Comunicaciones (avisos, push, novedades).

export const COUNTRY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Argentina', value: 'AR' },
  { label: 'España', value: 'ES' },
];

/** "Argentina"/"España", o el código tal cual si es un país que no está en la lista. */
export function countryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((c) => c.value === code)?.label ?? code;
}
