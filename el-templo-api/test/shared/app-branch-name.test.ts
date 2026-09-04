import { describe, it, expect } from "vitest";
import { appBranchName } from "../../src/modules/shared/app-branch-name";

describe("appBranchName — compat shim para la app de miembros", () => {
  it("reconstruye el prefijo en nombres cortos", () => {
    expect(appBranchName("Alem")).toBe("El Templo Alem");
    expect(appBranchName("Mario Bravo")).toBe("El Templo Mario Bravo");
    expect(appBranchName("Moreno")).toBe("El Templo Moreno");
  });

  it("es idempotente si ya trae el prefijo", () => {
    expect(appBranchName("El Templo Alem")).toBe("El Templo Alem");
    expect(appBranchName("el templo sur")).toBe("el templo sur");
  });

  it("deja pasar vacío/null/undefined sin agregar prefijo", () => {
    expect(appBranchName("")).toBe("");
    expect(appBranchName(null)).toBeNull();
    expect(appBranchName(undefined)).toBeUndefined();
  });

  it("el resultado, pasado por el regex baked del front, da 'Sede X'", () => {
    const front = (n: string) => n.replace(/^El Templo\s+/i, "Sede ");
    expect(front(appBranchName("Alem"))).toBe("Sede Alem");
    expect(front(appBranchName("Mario Bravo"))).toBe("Sede Mario Bravo");
  });
});
