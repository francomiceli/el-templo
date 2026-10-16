/**
 * Fase 199 Plan 06 (D-04): `branchTimezone` OBLIGATORIO en las respuestas de
 * perfil que la app usa para armar `setProfile`: GET /api/auth/me,
 * POST /api/auth/login y POST /api/auth/register (la cuarta, el canje de
 * magic link, se cubre en test/campaigns-magic-link.test.ts).
 *
 * Siempre es un string no vacío: la zona de la sede del socio. La columna
 * `branches.timezone` es NOT NULL con default `America/Argentina/Buenos_Aires`,
 * así que el fallback del servidor (`?? DEFAULT_TENANT_TIMEZONE`) es defensivo
 * y el caso "zona por defecto" se cubre con una sede que conserva ese default.
 *
 * Sin ids de `users` hardcodeados; emails y dni únicos por corrida.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { branches } from "../../src/db/schema/branches";

const DEFAULT_TZ = "America/Argentina/Buenos_Aires";
const MADRID_CODE = "TZMAD199A";
const PASSWORD = "pass123456";

interface ProfileUser {
  id: number;
  branchId: number;
  branchTimezone: string;
}

describe("Fase 199-06: branchTimezone en el perfil (me / login / register)", () => {
  let app: FastifyInstance;
  let defaultBranchId: number;
  let madridBranchId: number;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();

    const [branch] = await app.db
      .select({ id: branches.id, timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.isVirtual, false))
      .limit(1);
    defaultBranchId = branch.id;
    // Premisa del caso "zona por defecto": la sede sembrada conserva el default.
    expect(branch.timezone).toBe(DEFAULT_TZ);

    await app.db
      .insert(branches)
      .values({
        name: "Sede Madrid 199-06 auth",
        code: MADRID_CODE,
        timezone: "Europe/Madrid",
      })
      .onDuplicateKeyUpdate({ set: { timezone: "Europe/Madrid" } });
    const [madrid] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, MADRID_CODE));
    madridBranchId = madrid.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  function uniqueEmail(label: string): string {
    seq += 1;
    return `tz199-${label}-${seq}-${Date.now()}@test.com`;
  }

  describe("GET /api/auth/me", () => {
    it("devuelve la zona de la sede del socio (Europe/Madrid)", async () => {
      const email = uniqueEmail("me-madrid");
      await registerUser(app, {
        email,
        password: PASSWORD,
        branchId: madridBranchId,
      });
      const token = await getAuthToken(app, email, PASSWORD);

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as ProfileUser;
      expect(body.branchId).toBe(madridBranchId);
      expect(body.branchTimezone).toBe("Europe/Madrid");
    });

    it("una sede con la zona por defecto devuelve America/Argentina/Buenos_Aires", async () => {
      const email = uniqueEmail("me-default");
      await registerUser(app, {
        email,
        password: PASSWORD,
        branchId: defaultBranchId,
      });
      const token = await getAuthToken(app, email, PASSWORD);

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as ProfileUser;
      expect(body.branchTimezone).toBe(DEFAULT_TZ);
    });

    it("el perfil de un admin también la trae (siempre string no vacío)", async () => {
      const token = await getAuthToken(app, "admin@test.com", "adminpass123");

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as ProfileUser;
      expect(typeof body.branchTimezone).toBe("string");
      expect(body.branchTimezone.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/auth/login", () => {
    it("user.branchTimezone = zona de la sede (Europe/Madrid)", async () => {
      const email = uniqueEmail("login-madrid");
      await registerUser(app, {
        email,
        password: PASSWORD,
        branchId: madridBranchId,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: PASSWORD },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as { user: ProfileUser };
      expect(body.user.branchTimezone).toBe("Europe/Madrid");
    });

    it("sede con zona por defecto -> America/Argentina/Buenos_Aires", async () => {
      const email = uniqueEmail("login-default");
      await registerUser(app, {
        email,
        password: PASSWORD,
        branchId: defaultBranchId,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email, password: PASSWORD },
      });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as { user: ProfileUser };
      expect(body.user.branchTimezone).toBe(DEFAULT_TZ);
    });
  });

  describe("POST /api/auth/register", () => {
    it("user.branchTimezone = zona de la sede elegida (Europe/Madrid)", async () => {
      const email = uniqueEmail("register-madrid");

      const registered = await registerUser(app, {
        email,
        password: PASSWORD,
        branchId: madridBranchId,
      });

      const user = registered.user as unknown as ProfileUser;
      expect(user.branchId).toBe(madridBranchId);
      expect(typeof user.branchTimezone).toBe("string");
      expect(user.branchTimezone.length).toBeGreaterThan(0);
      expect(user.branchTimezone).toBe("Europe/Madrid");
    });

    it("sede con zona por defecto -> America/Argentina/Buenos_Aires", async () => {
      const email = uniqueEmail("register-default");

      const registered = await registerUser(app, {
        email,
        password: PASSWORD,
        branchId: defaultBranchId,
      });

      const user = registered.user as unknown as ProfileUser;
      expect(user.branchTimezone).toBe(DEFAULT_TZ);
    });

    it("sin branchId usa la sede ONLINE y también devuelve una zona (string no vacío)", async () => {
      const email = uniqueEmail("register-online");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email,
          password: PASSWORD,
          firstName: "Tz",
          lastName: "Online",
          dni: `TZ${Date.now().toString(36)}${seq}`,
          phone: `+549${String(1_000_000_000 + Math.floor(Math.random() * 8_999_999_999))}`,
          gender: "male",
        },
      });

      expect([200, 201], res.body).toContain(res.statusCode);
      const body = JSON.parse(res.body) as { user: ProfileUser };
      expect(typeof body.user.branchTimezone).toBe("string");
      expect(body.user.branchTimezone.length).toBeGreaterThan(0);
    });
  });
});
