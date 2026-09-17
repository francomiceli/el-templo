/**
 * Cartelera de aniversarios de permanencia y cumpleaños.
 * De GET /admin/anniversaries?branchId&date&includeTomorrow
 */
export interface AnniversaryEntry {
  memberId: number;
  memberName: string;
  /** Meses del hito (3, 6, 12, 24, ...). */
  months: number;
  /** Label corto ("6 meses", "1 año"). */
  label: string;
  /** Si el hito cae hoy o mañana (anticipo). */
  when: 'today' | 'tomorrow';
}

export interface BirthdayEntry {
  memberId: number;
  memberName: string;
  /** Edad que cumple ese día. */
  age: number;
  /** Frase lista ("Cumple 30 años"). */
  label: string;
  /** Si el cumpleaños cae hoy o mañana (anticipo). */
  when: 'today' | 'tomorrow';
}

export interface BranchCelebrations {
  anniversaries: AnniversaryEntry[];
  birthdays: BirthdayEntry[];
}
