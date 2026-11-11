/**
 * Fase 208 Plan 05 (DI-05): marcador único de "fila de retiro" (formato viejo
 * = expense con responsable, formato nuevo = traslado con responsable).
 * Funciones puras: corre sin DB.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  MEMBER_INFLOW_KINDS,
  withdrawalFormatOf,
  withdrawalRowConditions,
  withdrawalRowSql,
} from "../../src/modules/finance/withdrawal-marker";
import type { TransactionKind } from "../../src/modules/finance/types";

const dialect = new MySqlDialect();

function row(
  kind: TransactionKind,
  direction: "inflow" | "outflow",
  responsibleName: string | null,
) {
  return { kind, direction, responsibleName };
}

describe("withdrawalFormatOf", () => {
  it("expense saliente con responsable = formato viejo", () => {
    expect(withdrawalFormatOf(row("expense", "outflow", "Martín"))).toBe(
      "legacy_expense",
    );
  });

  it("traslado saliente con responsable = formato nuevo", () => {
    expect(withdrawalFormatOf(row("cash_transfer", "outflow", "Martín"))).toBe(
      "transfer",
    );
  });

  it("la pata de entrada del traslado con responsable NO es un retiro", () => {
    expect(
      withdrawalFormatOf(row("cash_transfer", "inflow", "Martín")),
    ).toBeNull();
  });

  it("expense sin responsable no es un retiro", () => {
    expect(withdrawalFormatOf(row("expense", "outflow", null))).toBeNull();
  });

  it("traslado sin responsable (traslado común) no es un retiro", () => {
    expect(withdrawalFormatOf(row("cash_transfer", "outflow", null))).toBeNull();
  });

  it("responsable vacío o solo espacios no cuenta", () => {
    expect(withdrawalFormatOf(row("expense", "outflow", ""))).toBeNull();
    expect(withdrawalFormatOf(row("cash_transfer", "outflow", "   "))).toBeNull();
  });

  it("un ajuste con responsable no es un retiro", () => {
    expect(withdrawalFormatOf(row("adjustment", "outflow", "Martín"))).toBeNull();
  });

  it("un cobro o una devolución con responsable no es un retiro", () => {
    expect(withdrawalFormatOf(row("plan_charge", "inflow", "X"))).toBeNull();
    expect(withdrawalFormatOf(row("refund", "outflow", "X"))).toBeNull();
  });
});

describe("withdrawalRowSql", () => {
  it("renderiza el marcador con el alias dado", () => {
    const { sql: text, params } = dialect.sqlToQuery(withdrawalRowSql("w"));
    expect(text).toContain("w.kind IN ('expense','cash_transfer')");
    expect(text).toContain("w.direction = 'outflow'");
    expect(text).toContain("w.responsible_name IS NOT NULL");
    expect(params).toEqual([]);
  });

  it("acepta otro alias válido", () => {
    const { sql: text } = dialect.sqlToQuery(withdrawalRowSql("wd_1"));
    expect(text).toContain("wd_1.responsible_name IS NOT NULL");
  });

  it("rechaza un alias con inyección o inválido", () => {
    expect(() => withdrawalRowSql("w; DROP")).toThrow();
    expect(() => withdrawalRowSql("")).toThrow();
    expect(() => withdrawalRowSql("1w")).toThrow();
    expect(() => withdrawalRowSql("W")).toThrow();
  });
});

describe("withdrawalRowConditions", () => {
  it("renderiza las tres condiciones sobre financial_transactions", () => {
    const { sql: text, params } = dialect.sqlToQuery(withdrawalRowConditions());
    expect(text).toContain("`direction` = ?");
    expect(text).toContain("`kind` in (?, ?)");
    expect(text).toContain("`responsible_name` is not null");
    expect(params).toEqual(["outflow", "expense", "cash_transfer"]);
  });
});

describe("MEMBER_INFLOW_KINDS", () => {
  it("son exactamente los tres cobros de socio", () => {
    expect([...MEMBER_INFLOW_KINDS]).toEqual([
      "plan_charge",
      "debt_settlement",
      "advance_payment",
    ]);
  });
});

describe("withdrawal-marker.ts", () => {
  it("no importa ningún service", () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../src/modules/finance/withdrawal-marker.ts",
      ),
      "utf8",
    );
    const imports = src
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
    expect(imports).not.toMatch(/-service/);
  });
});
