/**
 * Integration tests — módulo staff-attendance (2026-09-07).
 *
 * Endpoints:
 *   GET  /api/admin/staff-attendance/me
 *   POST /api/admin/staff-attendance/check-in
 *   POST /api/admin/staff-attendance/check-out
 *   GET  /api/admin/staff-attendance/shifts
 *
 * El check-in/check-out reusa el MISMO QR físico de sede que el check-in de
 * socios (`generateQrToken`/`validateQrToken`, `shared/qr-token.ts`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { generateQrToken } from "../../src/modules/shared/qr-token";
import { BRANCH_OUT_OF_SCOPE } from "../../src/modules/shared/branch-access";
import { checklistForDow } from "../../src/modules/staff-attendance/checklist";
import { dowInTz } from "../../src/modules/shared/date-utils";

const ME_URL = "/api/admin/staff-attendance/me";
const CHECK_IN_URL = "/api/admin/staff-attendance/check-in";
const CHECK_OUT_URL = "/api/admin/staff-attendance/check-out";
const SHIFTS_URL = "/api/admin/staff-attendance/shifts";

const VALID_CHECKLIST = { cobros: true, espacio: true, lote: true };

function uniqueSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 10000)
    .toString(36)
    .padStart(3, "0");
  return `${prefix}${t}${r}`;
}

describe("Staff Attendance API", () => {
  let app: FastifyInstance;

  let branchAId: number;
  let branchBId: number;
  let branchAName: string;

  let coachAToken: string; // asignado SOLO a branchA (user_branches)
  let adminToken: string;
  let gestionToken: string;
  let ownerToken: string;
  let tvToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    const u = uniqueSuffix("SA");

    const [a] = await app.db
      .insert(schema.branches)
      .values({
        name: `Staff Attendance A ${u}`,
        code: `SAA-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    branchAId = a.id;
    branchAName = `Staff Attendance A ${u}`;

    const [b] = await app.db
      .insert(schema.branches)
      .values({
        name: `Staff Attendance B ${u}`,
        code: `SAB-${u}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();
    branchBId = b.id;

    const coachAId = await createStaffUser(app, {
      email: `coach-a-${u}@test.local`,
      password: "test1234",
      firstName: "Coach",
      lastName: "A",
      role: "coach",
      branchId: branchAId,
    });
    void coachAId;
    coachAToken = await getAuthToken(
      app,
      `coach-a-${u}@test.local`,
      "test1234",
    );

    await createStaffUser(app, {
      email: `gestion-${u}@test.local`,
      password: "test1234",
      firstName: "Gestion",
      lastName: "Test",
      role: "gestion",
      branchId: branchAId,
      country: "AR",
    });
    gestionToken = await getAuthToken(
      app,
      `gestion-${u}@test.local`,
      "test1234",
    );

    await createStaffUser(app, {
      email: `admin-${u}@test.local`,
      password: "test1234",
      firstName: "Admin",
      lastName: "Test",
      role: "admin",
      branchId: branchAId,
      country: "AR",
    });
    adminToken = await getAuthToken(app, `admin-${u}@test.local`, "test1234");

    await createStaffUser(app, {
      email: `owner-${u}@test.local`,
      password: "test1234",
      firstName: "Owner",
      lastName: "Test",
      role: "owner",
      branchId: branchAId,
    });
    ownerToken = await getAuthToken(app, `owner-${u}@test.local`, "test1234");

    await createStaffUser(app, {
      email: `tv-${u}@test.local`,
      password: "test1234",
      firstName: "TV",
      lastName: "Account",
      role: "tv",
      branchId: branchAId,
    });
    tvToken = await getAuthToken(app, `tv-${u}@test.local`, "test1234");
  });

  afterAll(async () => {
    await app.close();
  });

  describe("check-in + GET /me", () => {
    it("QR inválido -> 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: { qrToken: "esto-no-es-un-qr-valido" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("coach con QR de sede fuera de sus user_branches -> 403 BRANCH_OUT_OF_SCOPE", async () => {
      const qrToken = generateQrToken(branchBId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: { qrToken },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(BRANCH_OUT_OF_SCOPE);
    });

    it("check-in OK -> 201, y GET /me lo devuelve", async () => {
      const qrToken = generateQrToken(branchAId);
      const checkInRes = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: { qrToken },
      });
      expect(checkInRes.statusCode).toBe(201);
      const checkInBody = JSON.parse(checkInRes.body);
      expect(checkInBody.shift.branchId).toBe(branchAId);
      expect(checkInBody.shift.branchName).toBe(branchAName);
      expect(typeof checkInBody.shift.checkedInAt).toBe("string");

      const meRes = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body);
      expect(meBody.open).not.toBeNull();
      expect(meBody.open.id).toBe(checkInBody.shift.id);
      expect(meBody.open.branchId).toBe(branchAId);
      expect(Array.isArray(meBody.checklist)).toBe(true);
      // Lote del posnet solo mié/sáb (día en la zona de la sede, AR por default).
      const esperados = checklistForDow(dowInTz("America/Argentina/Buenos_Aires")).map(
        (c) => c.key,
      );
      expect(meBody.checklist.map((c: { key: string }) => c.key)).toEqual(esperados);
    });

    it("segundo check-in con jornada ya abierta -> 409", async () => {
      const qrToken = generateQrToken(branchAId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: { qrToken },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("check-out", () => {
    it("check-out con QR de otra sede que la del check-in -> 400", async () => {
      // Owner: acceso a AMBAS sedes (Regla 2, bypass de canAccessBranch), así
      // que la request llega hasta la comparación de sede -- a diferencia de
      // coachA (limitado a branchA por user_branches), que cortaría antes en
      // el 403 de canAccessBranch (ver el test de arriba).
      const checkInQr = generateQrToken(branchAId);
      const checkInRes = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: { qrToken: checkInQr },
      });
      expect(checkInRes.statusCode).toBe(201);

      const wrongBranchQr = generateQrToken(branchBId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: { qrToken: wrongBranchQr, checklist: VALID_CHECKLIST },
      });
      expect(res.statusCode).toBe(400);

      // Cierra la jornada de owner (QR correcto) para no contaminar los
      // tests siguientes (GET /shifts corre más abajo con este mismo token).
      const closeRes = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: { qrToken: checkInQr, checklist: VALID_CHECKLIST },
      });
      expect(closeRes.statusCode).toBe(200);
    });

    it("check-out con un ítem del checklist en false -> 400", async () => {
      const qrToken = generateQrToken(branchAId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: {
          qrToken,
          checklist: { cobros: true, espacio: false, lote: true },
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("check-out OK -> 200 con durationMinutes >= 0 y checklist guardado", async () => {
      const qrToken = generateQrToken(branchAId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: { qrToken, checklist: VALID_CHECKLIST },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.shift.branchId).toBe(branchAId);
      expect(typeof body.shift.checkedOutAt).toBe("string");
      expect(body.shift.durationMinutes).toBeGreaterThanOrEqual(0);

      // GET /me vuelve a null: la jornada ya se cerró.
      const meRes = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
      });
      expect(JSON.parse(meRes.body).open).toBeNull();
    });

    it("check-out sin jornada abierta -> 409", async () => {
      const qrToken = generateQrToken(branchAId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_OUT_URL,
        headers: { Authorization: `Bearer ${coachAToken}` },
        payload: { qrToken, checklist: VALID_CHECKLIST },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /shifts", () => {
    const today = new Date().toISOString().split("T")[0];

    it("admin ve la fila -> 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SHIFTS_URL}?branchId=${branchAId}&from=${today}&to=${today}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.shifts)).toBe(true);
      expect(body.shifts.length).toBeGreaterThanOrEqual(1);
      const row = body.shifts[0];
      expect(row.branchId).toBe(branchAId);
      expect(typeof row.userName).toBe("string");
      expect(row.checklist).toEqual(VALID_CHECKLIST);
      expect(row.durationMinutes).toBeGreaterThanOrEqual(0);
    });

    it("gestion no entra a NADA del plugin (decisión 2026-09-07) -> 403", async () => {
      const registro = await app.inject({
        method: "GET",
        url: `${SHIFTS_URL}?branchId=${branchAId}&from=${today}&to=${today}`,
        headers: { Authorization: `Bearer ${gestionToken}` },
      });
      expect(registro.statusCode).toBe(403);
      const me = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: { Authorization: `Bearer ${gestionToken}` },
      });
      expect(me.statusCode).toBe(403);
    });

    it("coach (fuera de STAFF_ATTENDANCE_REPORT_ROLES) -> 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SHIFTS_URL}?branchId=${branchAId}&from=${today}&to=${today}`,
        headers: { Authorization: `Bearer ${coachAToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("sin from/to -> 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SHIFTS_URL}?branchId=${branchAId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rango > 62 días -> 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SHIFTS_URL}?branchId=${branchAId}&from=2026-01-01&to=2026-04-15`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("owner también puede ver el registro -> 200", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SHIFTS_URL}?branchId=${branchAId}&from=${today}&to=${today}`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("roles excluidos de todo el plugin", () => {
    it("cuenta 'tv' -> 403 en GET /me", async () => {
      const res = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: { Authorization: `Bearer ${tvToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("cuenta 'tv' -> 403 en POST /check-in", async () => {
      const qrToken = generateQrToken(branchAId);
      const res = await app.inject({
        method: "POST",
        url: CHECK_IN_URL,
        headers: { Authorization: `Bearer ${tvToken}` },
        payload: { qrToken },
      });
      expect(res.statusCode).toBe(403);
    });

    it("member -> 403 en GET /me", async () => {
      const u = uniqueSuffix("SAM");
      const { token: memberToken } = await registerUser(app, {
        email: `member-${u}@test.local`,
        password: "test1234",
        branchId: branchAId,
      });
      const res = await app.inject({
        method: "GET",
        url: ME_URL,
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
