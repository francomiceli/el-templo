import { describe, it, expect } from "vitest";
import {
  ALL_STAFF_ROLES,
  ANALYTICS_ADMIN_ROLES,
  ANALYTICS_OPERATIONAL_ROLES,
  ATTENDANCE_ROLES,
  CAJA_ROLES,
  COACH_DEBTS_ROLES,
  PLANES_WRITE_ROLES,
  PLANES_READ_ROLES,
  PROGRAMAS_ROLES,
  PROGRAMAS_LIST_ROLES,
  REFERRAL_AB_RESULTS_ROLES,
  TEMPLO_RBAC_OVERRIDES,
  TV_CONTROL_ROLES,
  CHECKIN_ROSTER_ROLES,
  COACH_ROLES,
  FINANCE_ADJUSTMENT_ROLES,
  FINANCE_LOAD_ROLES,
  FINANCE_READ_ROLES,
  FINANCE_VOID_ROLES,
  FINANCE_WRITE_ROLES,
  INVERSOR_ROLE,
  MEMBER_LIFECYCLE_ROLES,
  MEMBER_ROLES,
  PAYMENT_ROLES,
  STAFF_ATTENDANCE_ROLES,
  STAFF_ATTENDANCE_REPORT_ROLES,
  SUBSCRIPTION_ROLES,
  TRAINING_ROLES,
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
  it("CAJA_ROLES = reportes-override (gestion + inversor) + core", () => {
    // 2026-09-08: `inversor` entra por el override `reportes` — ve la Caja de
    // SU sede (el recorte lo hace `enforcedBranchIds`, no este set).
    expect([...CAJA_ROLES]).toEqual(["gestion", "inversor", "admin", "owner"]);
  });

  it("COACH_DEBTS_ROLES stays byte-identical (composed deudas-override + core)", () => {
    expect([...COACH_DEBTS_ROLES]).toEqual([
      "coach",
      "gestion",
      "inversor",
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
      "inversor",
    ]);
  });

  it("ANALYTICS_ADMIN_ROLES is Dueño core + inversor (2026-09-09, UAT) — gestion stays excluded", () => {
    // El inversor entra a Analíticas admin-only (KPIs/miembros/financiero) pero
    // SIEMPRE acotado a su sede vía `enforceBranchScope`, encadenado en todas
    // esas rutas. `gestion` sigue sin acceso: solo ve el set operacional
    // (ANALYTICS_OPERATIONAL_ROLES).
    expect([...ANALYTICS_ADMIN_ROLES]).toEqual(["admin", "owner", "inversor"]);
    expect([...ANALYTICS_ADMIN_ROLES]).not.toContain("gestion");
  });

  it("REFERRAL_AB_RESULTS_ROLES excluye a inversor (agregado sin dimensión de sede)", () => {
    // GET /admin/referrals/ab-results es un conteo de TODO el gimnasio, sin
    // `branchId` para acotar — se separa de ANALYTICS_OPERATIONAL_ROLES (que sí
    // incluye inversor) a propósito.
    expect([...REFERRAL_AB_RESULTS_ROLES]).toEqual(["gestion", "admin", "owner"]);
    expect([...REFERRAL_AB_RESULTS_ROLES]).not.toContain("inversor");
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

  it("TV_CONTROL_ROLES is Dueño core + coach + cuenta tv (branch TV) — D-01 fase 164, 2026-09-07", () => {
    // El profe vincula y maneja el TV de su sede; la cuenta dedicada `tv`
    // (2026-09-07) loguea los televisores; el resto del staff (gestion,
    // recepcion) NO. El acceso por sede lo impone requireBranchAccess aparte.
    expect([...TV_CONTROL_ROLES]).toEqual(["admin", "owner", "coach", "tv"]);
    expect([...TV_CONTROL_ROLES]).not.toContain("gestion");
    expect([...TV_CONTROL_ROLES]).not.toContain("recepcion");
  });

  it("CHECKIN_ROSTER_ROLES is Dueño core + coach (registro del día) — 2026-08-13", () => {
    // Dato de salud autorreportado: coach + admin/dueño lo ven, gestion/recepcion
    // NO (la vista de Feedback sigue dueño-only). Mismo valor que TV_CONTROL_ROLES
    // pero declarado aparte a propósito.
    expect([...CHECKIN_ROSTER_ROLES]).toEqual(["admin", "owner", "coach"]);
    expect([...CHECKIN_ROSTER_ROLES]).not.toContain("gestion");
    expect([...CHECKIN_ROSTER_ROLES]).not.toContain("recepcion");
  });

  it("TEMPLO_RBAC_OVERRIDES holds only the extra roles layered over the core", () => {
    expect([...TEMPLO_RBAC_OVERRIDES.reportes]).toEqual([
      "gestion",
      "inversor",
    ]);
    expect([...TEMPLO_RBAC_OVERRIDES.deudas]).toEqual([
      "coach",
      "gestion",
      "inversor",
    ]);
  });
});

/**
 * 2026-09-08 — rol `inversor` (migración 0225).
 *
 * La regla del rol es "donde está `gestion`, está `inversor`", con las
 * excepciones que este bloque fija literalmente. Lo que hace al rol seguro NO es
 * este archivo sino `enforcedBranchIds` / `enforceBranchScope`
 * (shared/branch-access.ts), que le acotan los listados a sus `user_branches` —
 * acá sólo se congela QUÉ superficie le queda habilitada, para que ensanchar un
 * set en el futuro no le abra Programas o Entrenamiento sin que nadie lo note.
 */
describe("RBAC — rol inversor (sede-scoped)", () => {
  const ENTRA = {
    ALL_STAFF_ROLES,
    CAJA_ROLES,
    COACH_DEBTS_ROLES,
    ANALYTICS_OPERATIONAL_ROLES,
    ANALYTICS_ADMIN_ROLES,
    ATTENDANCE_ROLES,
    MEMBER_ROLES,
    MEMBER_LIFECYCLE_ROLES,
    PAYMENT_ROLES,
    SUBSCRIPTION_ROLES,
    PLANES_READ_ROLES,
    FINANCE_READ_ROLES,
    FINANCE_WRITE_ROLES,
    FINANCE_LOAD_ROLES,
    FINANCE_VOID_ROLES,
    FINANCE_ADJUSTMENT_ROLES,
  };

  const NO_ENTRA = {
    OWNER_ROLES: ["owner"],
    ADMIN_ROLES: ["admin", "owner"],
    COACH_ROLES,
    TRAINING_ROLES,
    PROGRAMAS_ROLES,
    PROGRAMAS_LIST_ROLES,
    PLANES_WRITE_ROLES,
    TV_CONTROL_ROLES,
    CHECKIN_ROSTER_ROLES,
    STAFF_ATTENDANCE_ROLES,
    STAFF_ATTENDANCE_REPORT_ROLES,
    REFERRAL_AB_RESULTS_ROLES,
  };

  it.each(Object.entries(ENTRA))(
    "inversor ∈ %s (hereda la superficie de gestion)",
    (_name, set) => {
      expect([...(set as readonly string[])]).toContain(INVERSOR_ROLE);
    },
  );

  it.each(Object.entries(NO_ENTRA))(
    "inversor ∉ %s (dueño / entrenamiento / jornada / TV)",
    (_name, set) => {
      expect([...(set as readonly string[])]).not.toContain(INVERSOR_ROLE);
    },
  );

  it("PROGRAMAS_LIST_ROLES deja de coincidir en valor con FINANCE_WRITE_ROLES", () => {
    // Eran byte-idénticos hasta 2026-09-08. `inversor` rompe la coincidencia a
    // propósito: entra en finanzas, NO en Programas.
    expect([...FINANCE_WRITE_ROLES]).toContain(INVERSOR_ROLE);
    expect([...PROGRAMAS_LIST_ROLES]).not.toContain(INVERSOR_ROLE);
  });
});
