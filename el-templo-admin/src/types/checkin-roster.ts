/**
 * Registro del día del alumno (energía/sueño/molestias) para el staff.
 * De GET /admin/check-ins/roster y del campo `checkIn` de la lista de asistencia.
 */

/**
 * El registro diario más reciente de un socio dentro de los últimos 7 días.
 * `daysAgo` 0 = del día (hoy o el día de la clase); >0 = último dato disponible
 * ("hace 2 días"). Valores: energy bajo/normal/alto, sleep mal/ok/bien, soreness
 * ninguna/leve/moderada (+ sorenessBodyArea cuando hay molestia).
 */
export interface DayCheckIn {
  date: string;
  daysAgo: number;
  energy: string | null;
  soreness: string | null;
  sorenessBodyArea: string | null;
  sleep: string | null;
}

export interface CheckInRosterEntry {
  memberId: number;
  memberName: string;
  checkIn: DayCheckIn;
}

export interface CheckInRosterResponse {
  entries: CheckInRosterEntry[];
  attendeeCount: number;
}
