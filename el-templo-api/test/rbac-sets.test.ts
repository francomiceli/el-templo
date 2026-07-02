import { describe, it, expect } from "vitest";
import {
  CAJA_ROLES,
  COACH_DEBTS_ROLES,
  PLANES_WRITE_ROLES,
  PLANES_READ_ROLES,
  PROGRAMAS_ROLES,
  PROGRAMAS_LIST_ROLES,
  TEMPLO_RBAC_OVERRIDES,
} from "../src/modules/shared/permissions";

/**
 * Pure unit test (no app / no MySQL): imports the RBAC constants and asserts
 * their effective values. Guards the phase-149 refactor that re-expresses the
 * Templo sets as "white-label core + Templo override" (D-01/D-06):
 *
 *  - The EXISTING sets (CAJA_ROLES, COACH_DEBTS_ROLES) must stay byte-identical
 *    to their historical values so their consumers (reports, coach, leads) do
 *    NOT regress (T-149-02).
 *  - The NEW sets (PLANES_WRITE/READ, PROGRAMAS) must expose the intended
 *    Dueño-only / all-staff surfaces (D-11 / D-15).
 */
describe("RBAC sets — core white-label + Templo overrides", () => {
  it("CAJA_ROLES stays byte-identical (composed reportes-override + core)", () => {
    expect([...CAJA_ROLES]).toEqual(["gestion", "admin", "owner"]);
  });

  it("COACH_DEBTS_ROLES stays byte-identical (composed deudas-override + core)", () => {
    expect([...COACH_DEBTS_ROLES]).toEqual([
      "coach",
      "gestion",
      "admin",
      "owner",
    ]);
  });

  it("PLANES_WRITE_ROLES is Dueño-only (owner + admin) — closes D-11", () => {
    expect([...PLANES_WRITE_ROLES]).toEqual(["admin", "owner"]);
  });

  it("PLANES_READ_ROLES is all staff (Planes read-only for employees)", () => {
    expect([...PLANES_READ_ROLES]).toEqual([
      "coach",
      "admin",
      "owner",
      "gestion",
      "recepcion",
    ]);
  });

  it("PROGRAMAS_ROLES is Dueño-only (owner + admin) — closes D-15", () => {
    expect([...PROGRAMAS_ROLES]).toEqual(["admin", "owner"]);
  });

  it("PROGRAMAS_LIST_ROLES is admin staff without coach (list-only) — D-10/CR-01", () => {
    // GET /admin/programs (list) is readable by the administrative staff so the
    // Planes "Programa" column and the add-on assign dialog work; coach is
    // EXCLUDED per D-10 (Programas is not a coach surface). Mirrors
    // FINANCE_WRITE_ROLES in value.
    expect([...PROGRAMAS_LIST_ROLES]).toEqual([
      "owner",
      "admin",
      "gestion",
      "recepcion",
    ]);
    expect([...PROGRAMAS_LIST_ROLES]).not.toContain("coach");
  });

  it("TEMPLO_RBAC_OVERRIDES holds only the extra roles layered over the core", () => {
    expect([...TEMPLO_RBAC_OVERRIDES.reportes]).toEqual(["gestion"]);
    expect([...TEMPLO_RBAC_OVERRIDES.deudas]).toEqual(["coach", "gestion"]);
  });
});
