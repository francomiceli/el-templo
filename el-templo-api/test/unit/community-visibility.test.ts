/**
 * Unit tests de las reglas de visibilidad de la comunidad (fase 214,
 * D-05, D-07, D-09, D-11 y D-47). Todo es puro, sin DB.
 */

import { describe, it, expect } from "vitest";
import {
  isMinor,
  defaultVisible,
  effectiveVisible,
  listAccess,
} from "../../src/modules/scheduling/community-visibility";

describe("isMinor (D-47)", () => {
  it("es menor con 16 años cumplidos", () => {
    expect(isMinor("2010-05-01", "2026-11-17")).toBe(true);
  });

  it("deja de ser menor el día que cumple 18", () => {
    expect(isMinor("2008-11-17", "2026-11-17")).toBe(false);
  });

  it("sigue siendo menor la víspera de los 18", () => {
    expect(isMinor("2008-11-18", "2026-11-17")).toBe(true);
  });

  it("sin fecha de nacimiento cuenta como adulto", () => {
    expect(isMinor(null, "2026-11-17")).toBe(false);
  });

  it("nacido un 29 de febrero cumple los 18 el 1 de marzo si el año no es bisiesto", () => {
    expect(isMinor("2008-02-29", "2026-02-28")).toBe(true);
    expect(isMinor("2008-02-29", "2026-03-01")).toBe(false);
  });
});

describe("defaultVisible (D-11)", () => {
  const todayLocal = "2026-11-17";

  it("adulto de sede argentina es visible", () => {
    expect(
      defaultVisible({
        dateOfBirth: "1990-01-01",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(true);
  });

  it("sin fecha de nacimiento en sede argentina es visible", () => {
    expect(
      defaultVisible({ dateOfBirth: null, branchCountry: "AR", todayLocal }),
    ).toBe(true);
  });

  it("sede fuera de Argentina no es visible", () => {
    expect(
      defaultVisible({ dateOfBirth: null, branchCountry: "ES", todayLocal }),
    ).toBe(false);
  });

  it("menor en sede argentina no es visible", () => {
    expect(
      defaultVisible({
        dateOfBirth: "2010-05-01",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(false);
  });

  it("al cumplir 18 pasa a visible sin guardar nada", () => {
    expect(
      defaultVisible({
        dateOfBirth: "2008-11-17",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(true);
  });
});

describe("effectiveVisible (D-05)", () => {
  const todayLocal = "2026-11-17";

  it("la preferencia verdadera le gana a la regla (menor se activa)", () => {
    expect(
      effectiveVisible({
        preference: true,
        dateOfBirth: "2010-05-01",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(true);
  });

  it("la preferencia falsa le gana a la regla (adulto se oculta)", () => {
    expect(
      effectiveVisible({
        preference: false,
        dateOfBirth: "1990-01-01",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(false);
  });

  it("sin preferencia vale la regla por defecto", () => {
    expect(
      effectiveVisible({
        preference: null,
        dateOfBirth: "2010-05-01",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(false);
    expect(
      effectiveVisible({
        preference: null,
        dateOfBirth: "1990-01-01",
        branchCountry: "AR",
        todayLocal,
      }),
    ).toBe(true);
  });
});

describe("listAccess (D-07, D-09)", () => {
  it("el staff siempre ve la lista", () => {
    expect(
      listAccess({
        isStaff: true,
        hasPlanInEffect: false,
        viewerVisible: false,
      }),
    ).toEqual({ canSeeList: true, reason: "ok" });
  });

  it("un alumno sin plan en vigor ve solo el número (sin_plan)", () => {
    expect(
      listAccess({
        isStaff: false,
        hasPlanInEffect: false,
        viewerVisible: true,
      }),
    ).toEqual({ canSeeList: false, reason: "sin_plan" });
  });

  it("un alumno oculto no ve la lista (reciprocidad, oculto)", () => {
    expect(
      listAccess({
        isStaff: false,
        hasPlanInEffect: true,
        viewerVisible: false,
      }),
    ).toEqual({ canSeeList: false, reason: "oculto" });
  });

  it("un alumno con plan y visible ve la lista", () => {
    expect(
      listAccess({
        isStaff: false,
        hasPlanInEffect: true,
        viewerVisible: true,
      }),
    ).toEqual({ canSeeList: true, reason: "ok" });
  });

  it("sin plan y oculto, el motivo es sin_plan", () => {
    expect(
      listAccess({
        isStaff: false,
        hasPlanInEffect: false,
        viewerVisible: false,
      }),
    ).toEqual({ canSeeList: false, reason: "sin_plan" });
  });
});
