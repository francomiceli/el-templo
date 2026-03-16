/**
 * Unit tests for CSV member import pure functions.
 *
 * All functions are pure -- no DB, no server context needed.
 * Tests cover CSV parsing, duplicate resolution, and plan mapping logic.
 */

import { describe, it, expect } from "vitest";
import {
  parseCsvRow,
  resolveDuplicates,
  mapPlanName,
  parseAllCsvs,
} from "../../src/db/import-members";
import type { ParsedMember } from "../../src/db/import-members";

// ─── parseCsvRow ────────────────────────────────────────────────────────────

describe("parseCsvRow", () => {
  const baseRow: Record<string, string> = {
    Apellido: "Garcia",
    Nombre: "Juan",
    Email: "juan@test.com",
    "Número tarjeta": "12345",
    Teléfono: "0223-4567890",
    Celular: "2235551234",
    Activo: "Si",
    "Tipo de documento": "DNI",
    "Número de documento": "30123456",
    "Fecha de nacimiento": "15/06/1990",
    Sexo: "Masculino",
    Domicilio: "Av. Colon 1234",
    Observaciones: "Alumno regular",
    "Último servicio/membresía vigente": "FLEX",
    Vencimiento: "25/03/2026",
    "Fecha de ingreso": "10/01/2024",
    "Creador del legajo": "Admin Test",
  };

  it("converts DD/MM/YYYY to YYYY-MM-DD for dateOfBirth", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result).not.toBeNull();
    expect(result!.dateOfBirth).toBe("1990-06-15");
  });

  it("converts DD/MM/YYYY to YYYY-MM-DD for fechaIngreso", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result!.fechaIngreso).toBe("2024-01-10");
  });

  it("converts DD/MM/YYYY to YYYY-MM-DD for vencimiento", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result!.vencimiento).toBe("2026-03-25");
  });

  it("maps Masculino to male", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result!.gender).toBe("male");
  });

  it("maps Femenino to female", () => {
    const row = { ...baseRow, Sexo: "Femenino" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.gender).toBe("female");
  });

  it("maps blank Sexo to null", () => {
    const row = { ...baseRow, Sexo: "" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.gender).toBeNull();
  });

  it("maps Si to true for isActive", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result!.isActive).toBe(true);
  });

  it("maps No to false for isActive", () => {
    const row = { ...baseRow, Activo: "No" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.isActive).toBe(false);
  });

  it("uses Celular for phone, ignores Telefono", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result!.phone).toBe("2235551234");
  });

  it("returns null phone when Celular is blank", () => {
    const row = { ...baseRow, Celular: "" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.phone).toBeNull();
  });

  it("defaults documentType to DNI when blank", () => {
    const row = { ...baseRow, "Tipo de documento": "" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.documentType).toBe("DNI");
  });

  it("skips rows with blank email (returns null)", () => {
    const row = { ...baseRow, Email: "" };
    const result = parseCsvRow(row, "Alem");
    expect(result).toBeNull();
  });

  it("skips rows with whitespace-only email (returns null)", () => {
    const row = { ...baseRow, Email: "   " };
    const result = parseCsvRow(row, "Alem");
    expect(result).toBeNull();
  });

  it("trims whitespace from all string fields", () => {
    const row = {
      ...baseRow,
      Apellido: "  Garcia  ",
      Nombre: "  Juan  ",
      Email: "  juan@test.com  ",
      Celular: "  2235551234  ",
      Domicilio: "  Av. Colon 1234  ",
    };
    const result = parseCsvRow(row, "Alem");
    expect(result!.lastName).toBe("Garcia");
    expect(result!.firstName).toBe("Juan");
    expect(result!.email).toBe("juan@test.com");
    expect(result!.phone).toBe("2235551234");
    expect(result!.address).toBe("Av. Colon 1234");
  });

  it("handles single-digit day/month in dates (5/12/2003)", () => {
    const row = { ...baseRow, "Fecha de nacimiento": "5/12/2003" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.dateOfBirth).toBe("2003-12-05");
  });

  it("stores branchName from parameter", () => {
    const result = parseCsvRow(baseRow, "Moreno");
    expect(result!.branchName).toBe("Moreno");
  });

  it("maps plan name from CSV field", () => {
    const result = parseCsvRow(baseRow, "Alem");
    expect(result!.planName).toBe("FLEX");
  });

  it("returns null planName when field is blank", () => {
    const row = { ...baseRow, "Último servicio/membresía vigente": "" };
    const result = parseCsvRow(row, "Alem");
    expect(result!.planName).toBeNull();
  });
});

// ─── resolveDuplicates ──────────────────────────────────────────────────────

describe("resolveDuplicates", () => {
  const makeMember = (overrides: Partial<ParsedMember>): ParsedMember => ({
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    phone: null,
    dni: "30000000",
    documentType: "DNI",
    address: null,
    dateOfBirth: null,
    gender: null,
    isActive: false,
    branchName: "Alem",
    observaciones: null,
    creadorLegajo: null,
    planName: null,
    vencimiento: null,
    fechaIngreso: null,
    ...overrides,
  });

  it("passes through members with unique DNI", () => {
    const members = [
      makeMember({ dni: "30000001", email: "a@test.com" }),
      makeMember({ dni: "30000002", email: "b@test.com" }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(2);
  });

  it("with same DNI in two branches, one active one inactive -> picks active branch", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Alem",
        fechaIngreso: "2024-01-01",
      }),
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: true,
        branchName: "Moreno",
        fechaIngreso: "2023-06-01",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(1);
    expect(result[0].branchName).toBe("Moreno");
    expect(result[0].isActive).toBe(true);
  });

  it("with same DNI both inactive -> picks most recent fechaIngreso", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Alem",
        fechaIngreso: "2024-06-01",
      }),
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Moreno",
        fechaIngreso: "2023-01-01",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(1);
    expect(result[0].branchName).toBe("Alem");
  });

  it("with same DNI both active -> picks most recent fechaIngreso", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: true,
        branchName: "Alem",
        fechaIngreso: "2022-01-01",
      }),
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: true,
        branchName: "Moreno",
        fechaIngreso: "2024-06-01",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(1);
    expect(result[0].branchName).toBe("Moreno");
  });

  it("merges data: prefers non-blank, prefers active branch version", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Alem",
        phone: "2235551111",
        address: null,
        dateOfBirth: "1990-06-15",
      }),
      makeMember({
        dni: "30000001",
        email: "b@test.com",
        isActive: true,
        branchName: "Moreno",
        phone: null,
        address: "Calle 123",
        dateOfBirth: "1990-06-15",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(1);
    // Active branch (Moreno) wins for branch assignment
    expect(result[0].branchName).toBe("Moreno");
    // Phone from Alem (non-blank) merged in since Moreno is blank
    expect(result[0].phone).toBe("2235551111");
    // Address from Moreno (non-blank)
    expect(result[0].address).toBe("Calle 123");
    // Email from active branch (Moreno)
    expect(result[0].email).toBe("b@test.com");
  });

  it("combines Observaciones from all branches with branch prefix", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: true,
        branchName: "Alem",
        observaciones: "Note from Alem",
      }),
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Moreno",
        observaciones: "Note from Moreno",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(1);
    expect(result[0].observaciones).toContain("[Alem] Note from Alem");
    expect(result[0].observaciones).toContain("[Moreno] Note from Moreno");
  });

  it("sets mergedFrom array for duplicates", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        branchName: "Alem",
      }),
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        branchName: "Moreno",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result[0].mergedFrom).toEqual(
      expect.arrayContaining(["Alem", "Moreno"]),
    );
  });

  it("does not set mergedFrom for unique members", () => {
    const members = [makeMember({ dni: "30000001", email: "a@test.com" })];
    const result = resolveDuplicates(members);
    expect(result[0].mergedFrom).toBeUndefined();
  });

  it("handles null fechaIngreso in tiebreaker (treats as oldest)", () => {
    const members = [
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Alem",
        fechaIngreso: null,
      }),
      makeMember({
        dni: "30000001",
        email: "a@test.com",
        isActive: false,
        branchName: "Moreno",
        fechaIngreso: "2023-01-01",
      }),
    ];
    const result = resolveDuplicates(members);
    expect(result).toHaveLength(1);
    expect(result[0].branchName).toBe("Moreno");
  });
});

// ─── mapPlanName ────────────────────────────────────────────────────────────

describe("mapPlanName", () => {
  const existingPlans = [
    { id: 1, name: "Flex" },
    { id: 2, name: "Flex+" },
    { id: 3, name: "Foundation" },
    { id: 4, name: "Foundation+" },
    { id: 5, name: "Performance" },
    { id: 6, name: "Sesion de Prueba" },
  ];

  it("maps FLEX to existing plan (case-insensitive)", () => {
    const result = mapPlanName("FLEX", existingPlans);
    expect(result.planId).toBe(1);
    expect(result.isLegacy).toBe(false);
  });

  it("maps 'flex' lowercase to existing plan", () => {
    const result = mapPlanName("flex", existingPlans);
    expect(result.planId).toBe(1);
    expect(result.isLegacy).toBe(false);
  });

  it("maps FLEX PLUS to Flex+", () => {
    const result = mapPlanName("FLEX PLUS", existingPlans);
    expect(result.planId).toBe(2);
    expect(result.isLegacy).toBe(false);
  });

  it("maps FLEX+ to Flex+", () => {
    const result = mapPlanName("FLEX+", existingPlans);
    expect(result.planId).toBe(2);
    expect(result.isLegacy).toBe(false);
  });

  it("maps FOUNDATION PLUS to Foundation+", () => {
    const result = mapPlanName("FOUNDATION PLUS", existingPlans);
    expect(result.planId).toBe(4);
    expect(result.isLegacy).toBe(false);
  });

  it("maps Sesion de Prueba (accent-insensitive)", () => {
    const result = mapPlanName("Sesión de Prueba", existingPlans);
    expect(result.planId).toBe(6);
    expect(result.isLegacy).toBe(false);
  });

  it("maps SESION DE PRUEBA uppercase", () => {
    const result = mapPlanName("SESION DE PRUEBA", existingPlans);
    expect(result.planId).toBe(6);
    expect(result.isLegacy).toBe(false);
  });

  it("returns null planId for legacy names like PROGRAMA 3 MESES", () => {
    const result = mapPlanName("PROGRAMA 3 MESES", existingPlans);
    expect(result.planId).toBeNull();
    expect(result.isLegacy).toBe(true);
  });

  it("returns null planId for MES INDIVIDUAL", () => {
    const result = mapPlanName("MES INDIVIDUAL", existingPlans);
    expect(result.planId).toBeNull();
    expect(result.isLegacy).toBe(true);
  });

  it("returns normalizedName", () => {
    const result = mapPlanName("  flex plus  ", existingPlans);
    expect(result.normalizedName).toBe("FLEX PLUS");
  });

  it("maps PERFORMANCE to existing plan", () => {
    const result = mapPlanName("PERFORMANCE", existingPlans);
    expect(result.planId).toBe(5);
    expect(result.isLegacy).toBe(false);
  });
});

// ─── parseAllCsvs ───────────────────────────────────────────────────────────

describe("parseAllCsvs", () => {
  const dataDir = "/home/franco/projects/el-templo/.docs/admin-docs";

  it("parses all 5 branch CSV files", () => {
    const { members, branchMap } = parseAllCsvs(dataDir);
    expect(branchMap.size).toBe(5);
    expect(members.length).toBeGreaterThan(0);
  });

  it("extracts correct branch names from filenames", () => {
    const { branchMap } = parseAllCsvs(dataDir);
    expect(branchMap.has("alem")).toBe(true);
    expect(branchMap.has("constitucion")).toBe(true);
    expect(branchMap.has("jujuy")).toBe(true);
    expect(branchMap.has("mogotes")).toBe(true);
    expect(branchMap.has("moreno")).toBe(true);
  });

  it("skips blank rows and rows with blank email", () => {
    const { members } = parseAllCsvs(dataDir);
    // Every returned member should have a non-blank email
    for (const m of members) {
      expect(m.email.trim()).not.toBe("");
    }
  });

  it("handles CSVs with leading empty rows (mogotes has blank row before header)", () => {
    const { members, branchMap } = parseAllCsvs(dataDir);
    // Mogotes should have parsed members
    const mogotesMembers = members.filter(
      (m) => m.branchName === branchMap.get("mogotes"),
    );
    expect(mogotesMembers.length).toBeGreaterThan(0);
  });
});
