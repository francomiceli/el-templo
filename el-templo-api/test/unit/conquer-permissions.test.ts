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

  it("sin filas devuelve los defaults (2 / 1 / 0 y N = 2)", () => {
    const s = parseConquerSettings([]);
    expect(s).toEqual(CONQUER_SETTING_DEFAULTS);
    expect(s.startOffset).toEqual({ ternero: 2, novillo: 1, toro: 0 });
    expect(s.comboWeeksN).toBe(2);
  });

  it("un valor válido pisa el default", () => {
    const s = parseConquerSettings([
      fila(K.startOffsetTernero, "3"),
      fila(K.startOffsetNovillo, "0"),
      fila(K.comboWeeksN, "5"),
    ]);
    expect(s.startOffset.ternero).toBe(3);
    expect(s.startOffset.novillo).toBe(0);
    expect(s.comboWeeksN).toBe(5);
  });

  it("toro siempre es 0, aunque venga una fila", () => {
    const s = parseConquerSettings([fila("conquer.start_offset.toro", "3")]);
    expect(s.startOffset.toro).toBe(0);
  });

  it.each([
    ["offset ternero fuera de rango (9)", K.startOffsetTernero, "9", 2],
    ["offset ternero negativo", K.startOffsetTernero, "-1", 2],
    ["offset novillo no numérico", K.startOffsetNovillo, "abc", 1],
    ["offset novillo decimal", K.startOffsetNovillo, "1.5", 1],
    ["offset novillo vacío", K.startOffsetNovillo, "", 1],
    ["combo_weeks_n en 0", K.comboWeeksN, "0", 2],
    ["combo_weeks_n en 9", K.comboWeeksN, "9", 2],
    ["combo_weeks_n no numérico", K.comboWeeksN, "dos", 2],
  ])("%s cae al default", (_nombre, key, valor, esperado) => {
    const s = parseConquerSettings([fila(key, valor)]);
    const obtenido =
      key === K.comboWeeksN
        ? s.comboWeeksN
        : key === K.startOffsetTernero
          ? s.startOffset.ternero
          : s.startOffset.novillo;
    expect(obtenido).toBe(esperado);
  });

  it.each([
    ["offset ternero en el mínimo (0)", K.startOffsetTernero, "0", 0],
    ["offset ternero en el máximo (4)", K.startOffsetTernero, "4", 4],
    ["combo_weeks_n en el mínimo (1)", K.comboWeeksN, "1", 1],
    ["combo_weeks_n en el máximo (8)", K.comboWeeksN, "8", 8],
  ])("%s es válido (límites inclusivos)", (_nombre, key, valor, esperado) => {
    const s = parseConquerSettings([fila(key, valor)]);
    const obtenido =
      key === K.comboWeeksN ? s.comboWeeksN : s.startOffset.ternero;
    expect(obtenido).toBe(esperado);
  });

  it("un valor inválido no contamina a los otros parámetros", () => {
    const s = parseConquerSettings([
      fila(K.startOffsetTernero, "9"),
      fila(K.comboWeeksN, "4"),
    ]);
    expect(s.startOffset.ternero).toBe(2);
    expect(s.comboWeeksN).toBe(4);
  });
});
