/**
 * Cartelera de aniversarios de permanencia.
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
