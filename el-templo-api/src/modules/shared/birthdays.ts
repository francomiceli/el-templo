/**
 * Cumpleaños de alumnos — lógica pura y compartida.
 *
 * Se deriva on-the-fly de users.dateOfBirth ("YYYY-MM-DD", nullable: no es
 * obligatoria en el alta, así que sólo se marcan los alumnos que la cargaron).
 * Igual que los aniversarios de permanencia (tenure-milestones), nunca se
 * persiste: la cartelera de Horarios, la línea del roster de clase y la ficha
 * comparan a nivel de fecha calendario.
 *
 * Regla del 29 de febrero: en años no bisiestos el cumpleaños se festeja el 28.
 * Tests: test/unit/birthdays.test.ts (puro) + anniversaries y attendance (integración).
 */

/** ¿`year` es bisiesto? */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Parsea "YYYY-MM-DD" a partes numéricas; null si no tiene ese formato. */
function parseDateStr(
  value: string | null | undefined,
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

/**
 * ¿El alumno nacido en `dateOfBirth` cumple años en `targetDate` (YYYY-MM-DD)?
 * Nacidos el 29/02 cumplen el 28/02 en años no bisiestos.
 */
export function isBirthdayOn(
  dateOfBirth: string | null | undefined,
  targetDate: string,
): boolean {
  const dob = parseDateStr(dateOfBirth);
  const target = parseDateStr(targetDate);
  if (dob === null || target === null) return false;
  if (target.y < dob.y) return false;
  if (dob.m === 2 && dob.d === 29 && !isLeapYear(target.y)) {
    return target.m === 2 && target.d === 28;
  }
  return dob.m === target.m && dob.d === target.d;
}

/**
 * Edad que cumple en `targetDate` si ese día es su cumpleaños; null si no lo es
 * o si la fecha de nacimiento es inválida.
 */
export function ageOnBirthday(
  dateOfBirth: string | null | undefined,
  targetDate: string,
): number | null {
  if (!isBirthdayOn(dateOfBirth, targetDate)) return null;
  const dob = parseDateStr(dateOfBirth);
  const target = parseDateStr(targetDate);
  if (dob === null || target === null) return null;
  return target.y - dob.y;
}

/**
 * Frase lista para mostrar ("Cumple 30 años") si `targetDate` es el cumpleaños
 * del alumno; null si no. Misma copy en la cartelera y en el roster de clase.
 */
export function birthdayLabelOn(
  dateOfBirth: string | null | undefined,
  targetDate: string,
): string | null {
  const age = ageOnBirthday(dateOfBirth, targetDate);
  if (age === null) return null;
  return age === 1 ? "Cumple 1 año" : `Cumple ${age} años`;
}
