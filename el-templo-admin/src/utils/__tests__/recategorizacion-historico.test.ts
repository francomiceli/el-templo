import { describe, it, expect } from 'vitest';
import type { MultibranchReassignmentRow } from 'src/composables/useReportsApi';
import {
  formatAttendanceRatio,
  formatReassignmentDay,
  groupReassignmentsByMonth,
  monthLabel,
  reassignmentsExportFilename,
  studentsCountLabel,
} from '../recategorizacion-historico';

function row(id: number, reassignedAt: string): MultibranchReassignmentRow {
  return {
    id,
    memberId: id * 10,
    memberName: `Alumno ${id}`,
    fromBranchId: null,
    fromBranchName: null,
    toBranchId: 1,
    toBranchName: 'Sede',
    toBranchAttendances: 8,
    totalAttendances: 10,
    source: 'cron',
    reassignedAt,
  };
}

describe('groupReassignmentsByMonth', () => {
  it('agrupa por mes UTC con el más nuevo primero y conserva el orden interno', () => {
    const groups = groupReassignmentsByMonth([
      row(1, '2026-11-01T07:00:03.000Z'),
      row(2, '2026-11-01T07:00:01.000Z'),
      row(3, '2026-10-01T07:00:02.000Z'),
      row(4, '2026-08-01T07:00:00.000Z'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-11', '2026-10', '2026-08']);
    expect(groups[0].label).toBe('Noviembre 2026');
    expect(groups[0].rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('ordena los meses aunque la entrada venga desordenada y cruce de año', () => {
    const groups = groupReassignmentsByMonth([
      row(1, '2026-01-01T07:00:00.000Z'),
      row(2, '2025-12-01T07:00:00.000Z'),
      row(3, '2026-02-01T07:00:00.000Z'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-02', '2026-01', '2025-12']);
  });

  it('devuelve una lista vacía sin eventos', () => {
    expect(groupReassignmentsByMonth([])).toEqual([]);
  });
});

describe('formatos', () => {
  it('monthLabel usa nombre del mes en español con mayúscula', () => {
    expect(monthLabel('2026-09')).toBe('Septiembre 2026');
    expect(monthLabel('2026-01')).toBe('Enero 2026');
  });

  it('studentsCountLabel singular y plural', () => {
    expect(studentsCountLabel(1)).toBe('1 alumno');
    expect(studentsCountLabel(20)).toBe('20 alumnos');
  });

  it('formatAttendanceRatio redondea el porcentaje y tolera total 0', () => {
    expect(formatAttendanceRatio(8, 10)).toBe('8 de 10 (80%)');
    expect(formatAttendanceRatio(5, 6)).toBe('5 de 6 (83%)');
    expect(formatAttendanceRatio(0, 0)).toBe('0 de 0');
  });

  it('formatReassignmentDay devuelve dd/mm en UTC', () => {
    expect(formatReassignmentDay('2026-11-01T07:00:00.000Z')).toBe('01/11');
    expect(formatReassignmentDay('2026-10-15T23:59:00.000Z')).toBe('15/10');
  });
});

describe('reassignmentsExportFilename', () => {
  it('el período completo lleva la fecha de hoy', () => {
    expect(reassignmentsExportFilename(undefined, new Date(2026, 10, 3))).toBe(
      'recategorizaciones-total-2026-11-03.xlsx'
    );
  });

  it('un mes puntual lleva AAAA-MM y no la fecha de hoy', () => {
    expect(reassignmentsExportFilename('2026-10', new Date(2026, 10, 3))).toBe(
      'recategorizaciones-2026-10.xlsx'
    );
  });
});
