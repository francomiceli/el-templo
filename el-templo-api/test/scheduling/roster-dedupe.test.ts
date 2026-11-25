/**
 * Mig 0360: el historial cancelado/no_show convive con la reserva nueva del
 * mismo turno, pero el roster del admin muestra UNA fila por alumno.
 */
import { describe, it, expect } from "vitest";
import { dedupeRosterRows } from "../../src/modules/scheduling/roster-dedupe";

type Row = { id: number; memberId: number; status: string };

describe("dedupeRosterRows", () => {
  it("con viva + cancelada del mismo alumno, deja solo la viva", () => {
    const rows: Row[] = [
      { id: 1, memberId: 10, status: "cancelado" },
      { id: 2, memberId: 10, status: "reservado" },
    ];
    expect(dedupeRosterRows(rows).map((r) => r.id)).toEqual([2]);
  });

  it("la viva gana aunque sea más vieja que la muerta", () => {
    const rows: Row[] = [
      { id: 5, memberId: 10, status: "lista_espera" },
      { id: 9, memberId: 10, status: "no_show" },
    ];
    expect(dedupeRosterRows(rows).map((r) => r.id)).toEqual([5]);
  });

  it("solo muertas: deja la más reciente (mayor id)", () => {
    const rows: Row[] = [
      { id: 3, memberId: 10, status: "cancelado" },
      { id: 7, memberId: 10, status: "cancelado" },
      { id: 4, memberId: 10, status: "no_show" },
    ];
    expect(dedupeRosterRows(rows).map((r) => r.id)).toEqual([7]);
  });

  it("no mezcla alumnos y respeta el orden de entrada", () => {
    const rows: Row[] = [
      { id: 1, memberId: 20, status: "reservado" },
      { id: 2, memberId: 10, status: "cancelado" },
      { id: 3, memberId: 30, status: "confirmado" },
      { id: 4, memberId: 10, status: "qr_escaneado" },
    ];
    expect(dedupeRosterRows(rows).map((r) => r.id)).toEqual([1, 3, 4]);
  });

  it("sin duplicados devuelve lo mismo", () => {
    const rows: Row[] = [
      { id: 1, memberId: 1, status: "reservado" },
      { id: 2, memberId: 2, status: "cancelado" },
    ];
    expect(dedupeRosterRows(rows)).toEqual(rows);
  });
});
