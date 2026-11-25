/**
 * Número de Aura con separador de miles es-AR ("1.240"), igual que la app
 * (`el-templo-app/src/utils/aura-format.ts`). A mano y no con `Intl.NumberFormat('es-AR')`:
 * el CLDR de `es` no agrupa los números de 4 cifras ("1240").
 */
export function formatAura(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
