// deploy: forzar build del admin tras el CI rojo del hotfix de domiciliación (11-26)
/**
 * "Dejar de domiciliar desde" (domiciliación España, mig 0362 del API).
 *
 * El valor es un mes "YYYY-MM". Desde ese mes la fila del socio sale en rojo
 * en el export para el banco. Compartido por el formulario de edición y la
 * ficha para que el texto del mes sea el mismo en los dos lados.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** "2026-12" → "diciembre 2026". */
export function sepaStopFromLabel(month: string): string {
  const [year, mm] = month.split('-');
  return `${MESES[Number(mm) - 1] ?? mm} ${year}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** ¿Ya llegó el mes desde el que deja de domiciliarse? (mismo criterio que el export) */
export function sepaStopFromReached(month: string, now: Date = new Date()): boolean {
  return month <= monthKey(now);
}

export interface SepaStopFromOption {
  label: string;
  value: string | null;
}

/**
 * Opciones del selector: "Sigue domiciliado" + el mes en curso y los 12
 * siguientes. Si el socio ya tiene guardado un mes fuera de esa ventana (uno
 * pasado), se agrega para que el selector lo muestre y no lo pierda al guardar.
 */
export function sepaStopFromOptions(
  current: string | null,
  now: Date = new Date()
): SepaStopFromOption[] {
  const months: string[] = [];
  for (let i = 0; i <= 12; i++) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() + i, 1)));
  }
  if (current && !months.includes(current)) {
    months.unshift(current);
  }
  return [
    { label: 'Sigue domiciliado', value: null },
    ...months.map((m) => ({ label: sepaStopFromLabel(m), value: m })),
  ];
}
