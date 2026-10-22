/**
 * Fase 201 Plan 05: permisos de Conquer (D-08) y parámetros `conquer.*` (D-14).
 *
 * Sin DB, sin servidor: corre con `vitest.config.unit.ts`. `settings.ts`
 * importa el schema de Drizzle pero NO conecta a nada al importarlo.
 */
import { describe, it, expect } from "vitest";
import {
  CONQUER_MANAGER_ROLES,
  canManageConquer,
  canViewConquerPhotos,
} from "../../src/modules/conquer/permissions";
import {
  CONQUER_SETTING_DEFAULTS,
  CONQUER_SETTING_KEYS,
  CONQUER_SETTINGS_PREFIX,
  parseConquerSettings,
} from "../../src/modules/conquer/settings";
import { ALL_STAFF_ROLES } from "../../src/modules/shared/permissions";

const ROLES_A_PROBAR = [...ALL_STAFF_ROLES, "member"] as const;

describe("canManageConquer (D-08)", () => {
  it("los roles gestores son exactamente owner y admin", () => {
    expect([...CONQUER_MANAGER_ROLES]).toEqual(["owner", "admin"]);
  });

  it.each(ROLES_A_PROBAR)("rol %s: solo owner y admin pueden", (role) => {
    const esperado = role === "owner" || role === "admin";
    expect(canManageConquer({ role, userId: 7 })).toBe(esperado);
  });

  it("un rol desconocido o vacío no puede", () => {
    expect(canManageConquer({ role: "", userId: 7 })).toBe(false);
    expect(canManageConquer({ role: "superadmin", userId: 7 })).toBe(false);
  });

  it("el alumno (parámetro opcional) no cambia el resultado hoy", () => {
    expect(
      canManageConquer({ role: "coach", userId: 7 }, { coachUserId: 7 }),
    ).toBe(false);
    expect(
      canManageConquer({ role: "admin", userId: 7 }, { coachUserId: null }),
    ).toBe(true);
  });

  it("canViewConquerPhotos usa la misma regla", () => {
    expect(canViewConquerPhotos({ role: "owner", userId: 1 })).toBe(true);
    expect(canViewConquerPhotos({ role: "coach", userId: 1 })).toBe(false);
  });
});

describe("parseConquerSettings (D-14)", () => {
  const K = CONQUER_SETTING_KEYS;
  const fila = (settingKey: string, settingValue: string) => ({
    settingKey,
    settingValue,
  });

  it("todas las claves cuelgan del prefijo conquer.", () => {
    for (const key of Object.values(K)) {
      expect(key.startsWith(CONQUER_SETTINGS_PREFIX)).toBe(true);
    }
  });

  it("sin filas devuelve los defaults (N = 2)", () => {
    const s = parseConquerSettings([]);
    expect(s).toEqual(CONQUER_SETTING_DEFAULTS);
    expect(s.comboWeeksN).toBe(2);
  });

  it("un valor válido pisa el default", () => {
    const s = parseConquerSettings([fila(K.comboWeeksN, "5")]);
    expect(s.comboWeeksN).toBe(5);
  });

  // 201-25 DA-5: las filas viejas de los offsets se ignoran y ya no existen en el tipo.
  it.each(["conquer.start_offset.ternero", "conquer.start_offset.novillo"])(
    "una fila vieja %s se ignora",
    (key) => {
      const s = parseConquerSettings([fila(key, "3")]);
      expect(s).toEqual(CONQUER_SETTING_DEFAULTS);
      expect(Object.keys(s)).toEqual(["comboWeeksN"]);
    },
  );

  it.each([
    ["combo_weeks_n en 0", "0"],
    ["combo_weeks_n en 9", "9"],
    ["combo_weeks_n no numérico", "dos"],
    ["combo_weeks_n decimal", "1.5"],
    ["combo_weeks_n vacío", ""],
  ])("%s cae al default", (_nombre, valor) => {
    const s = parseConquerSettings([fila(K.comboWeeksN, valor)]);
    expect(s.comboWeeksN).toBe(2);
  });

  it.each([
    ["combo_weeks_n en el mínimo (1)", "1", 1],
    ["combo_weeks_n en el máximo (8)", "8", 8],
  ])("%s es válido (límites inclusivos)", (_nombre, valor, esperado) => {
    const s = parseConquerSettings([fila(K.comboWeeksN, valor)]);
    expect(s.comboWeeksN).toBe(esperado);
  });
});
