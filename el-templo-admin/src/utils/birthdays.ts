/**
 * Cumpleaños — lógica pura (espejo de el-templo-api/src/modules/shared/birthdays.ts).
 *
 * La ficha del alumno la calcula del lado del cliente porque ya tiene la fecha
 * de nacimiento cargada; Horarios y el roster de clase reciben la frase hecha
 * desde la API. Regla del 29 de febrero: en años no bisiestos se festeja el 28.
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseDateStr(
  value: string | null | undefined
): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** ¿Cumple años en `targetDate` (YYYY-MM-DD)? */
export function isBirthdayOn(dateOfBirth: string | null | undefined, targetDate: string): boolean {
  const dob = parseDateStr(dateOfBirth);
  const target = parseDateStr(targetDate);
  if (dob === null || target === null) return false;
  if (target.y < dob.y) return false;
  if (dob.m === 2 && dob.d === 29 && !isLeapYear(target.y)) {
    return target.m === 2 && target.d === 28;
  }
  return dob.m === target.m && dob.d === target.d;
}

/** "Cumple N años" si `targetDate` es su cumpleaños; null si no. */
export function birthdayLabelOn(
  dateOfBirth: string | null | undefined,
  targetDate: string
): string | null {
  if (!isBirthdayOn(dateOfBirth, targetDate)) return null;
  const dob = parseDateStr(dateOfBirth);
  const target = parseDateStr(targetDate);
  if (dob === null || target === null) return null;
  const age = target.y - dob.y;
  return age === 1 ? 'Cumple 1 año' : `Cumple ${age} años`;
}
