/**
 * Fase 200 (P3, R1, SC3, SC4, T-200-20..23): endpoints de anatomia de solo
 * lectura.
 *
 *   - GET /api/admin/anatomy: vista completa, solo ANATOMIA_STAFF_ROLES
 *     (coach, admin, owner, coach_actividad). 401 sin token, 403 al resto.
 *   - GET /api/anatomy: vista de alumno recortada, cualquier autenticado.
 *
 * Integracion contra el MySQL de tests. Los usuarios salen de las fabricas de
 * test/helpers.ts (nunca ids fijos).
 *
 *   pnpm exec vitest run test/anatomy/anatomy-routes.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  cleanAllTestData,
  createStaffUser,
  createTestApp,
  createTestMember,
  getAuthToken,
} from "../helpers";
import { seedExercise } from "../sessions/_free-blocks-fixtures";
import { ROUTE_PROGRESSION_MAP } from "../../src/modules/exercises/route-progression-map";

interface RutaProfePayload {
  code: string;
  nombre: string;
  ejercicios: string[];
  nEjercicios: number;
  fichaProfe: { banderas: { id: string }[] } | null;
}

interface VistaProfePayload {
  estado: string;
  rutas: RutaProfePayload[];
  musculos: unknown[];
  regiones: unknown[];
}

interface VistaAlumnoPayload {
  rutas: { slug: string }[];
  musculos: unknown[];
  regiones: unknown[];
}

const CLAVES_PROHIBIDAS_ALUMNO = new Set([
  "code",
  "antagonista",
  "banderas",
  "banderasRuta",
  "fichaProfe",
  "notaInterna",
  "relaciones",
  "c",
  "pendientes",
]);

/** Todas las claves de un arbol JSON (nombre simple). */
function clavesProfundas(obj: unknown): string[] {
  if (Array.isArray(obj)) return obj.flatMap(clavesProfundas);
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => [k, ...clavesProfundas(v)]);
  }
  return [];
}

/** Todos los strings de un arbol JSON. */
function stringsProfundos(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap(stringsProfundos);
  if (obj && typeof obj === "object") {
    return Object.values(obj).flatMap(stringsProfundos);
  }
  return [];
}

describe("Anatomia — endpoints de solo lectura (fase 200)", () => {
  let app: FastifyInstance;
  const timestamp = Date.now().toString(36);
  const password = "anat-pass-123";

  /** Crea un staff del rol dado y devuelve su token. */
  async function tokenDeStaff(role: string): Promise<string> {
    const email = `anat-${role}-${timestamp}@test.com`;
    await createStaffUser(app, {
      email,
      password,
      firstName: "Anat",
      lastName: role,
      role,
      branchId: 1,
    });
    return getAuthToken(app, email, password);
  }

  function get(url: string, token?: string) {
    return app.inject({
      method: "GET",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  describe("401 sin token", () => {
    it("GET /api/admin/anatomy", async () => {
      expect((await get("/api/admin/anatomy")).statusCode).toBe(401);
    });

    it("GET /api/anatomy", async () => {
      expect((await get("/api/anatomy")).statusCode).toBe(401);
    });
  });

  describe("403 en /api/admin/anatomy fuera de ANATOMIA_STAFF_ROLES", () => {
    it("member", async () => {
      const member = await createTestMember(app);
      const res = await get("/api/admin/anatomy", member.token);
      expect(res.statusCode).toBe(403);
    });

    // createStaffUser soporta todos los roles de staff; recepcion, gestion, tv
    // y admin_sede quedan afuera por R1.
    it.each(["gestion", "recepcion", "tv", "admin_sede"])(
      "%s",
      async (role) => {
        const token = await tokenDeStaff(role);
        const res = await get("/api/admin/anatomy", token);
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({
          error: "Acceso denegado",
          message: "Acceso requerido",
        });
      },
    );
  });

  describe("200 en /api/admin/anatomy para el staff de piso", () => {
    it.each(["coach", "admin", "owner", "coach_actividad"])(
      "%s ve la vista de profe completa",
      async (role) => {
        const token = await tokenDeStaff(role);
        const res = await get("/api/admin/anatomy", token);
        expect(res.statusCode).toBe(200);
        const body = res.json<VistaProfePayload>();
        expect(body.estado).toBe("borrador");
        expect(body.rutas).toHaveLength(30);
        expect(body.musculos).toHaveLength(28);
        expect(body.regiones).toHaveLength(16);
      },
    );

    it("la ficha de FL trae los ejercicios reales del catalogo y sus banderas", async () => {
      const nombre1 = `Anat FL uno ${timestamp}`;
      const nombre2 = `Anat FL dos ${timestamp}`;
      const nombre3 = `Anat FL tres ${timestamp}`;
      await seedExercise(app, { name: nombre1, route: "FL" });
      await seedExercise(app, { name: nombre2, route: "FL" });
      // El CSV trae la ruta con espacios y minusculas: igual cuenta.
      await seedExercise(app, { name: nombre3, route: "fl " });

      const token = await tokenDeStaff("coach");
      const res = await get("/api/admin/anatomy", token);
      expect(res.statusCode).toBe(200);
      const fl = res
        .json<VistaProfePayload>()
        .rutas.find((r) => r.code === "FL");
      expect(fl).toBeDefined();
      expect(fl?.ejercicios).toEqual(
        expect.arrayContaining([nombre1, nombre2, nombre3]),
      );
      expect(fl?.nEjercicios).toBeGreaterThanOrEqual(3);
      expect(fl?.nEjercicios).toBe(fl?.ejercicios.length);
      expect(fl?.fichaProfe?.banderas.map((b) => b.id)).toEqual(
        expect.arrayContaining(["b9", "b21"]),
      );
    });

    it("un ejercicio de otra ruta no aparece en FL", async () => {
      const ajeno = `Anat PS ${timestamp}`;
      await seedExercise(app, { name: ajeno, route: "PS" });
      const token = await tokenDeStaff("admin");
      const body = (
        await get("/api/admin/anatomy", token)
      ).json<VistaProfePayload>();
      const fl = body.rutas.find((r) => r.code === "FL");
      const ps = body.rutas.find((r) => r.code === "PS");
      expect(fl?.ejercicios).not.toContain(ajeno);
      expect(ps?.ejercicios).toContain(ajeno);
    });

    it("ninguna clave notaInterna en la respuesta de staff (T-200-22)", async () => {
      const token = await tokenDeStaff("owner");
      const res = await get("/api/admin/anatomy", token);
      expect(res.statusCode).toBe(200);
      expect(clavesProfundas(res.json())).not.toContain("notaInterna");
      expect(res.body).not.toContain("notaInterna");
    });
  });

  describe("GET /api/anatomy — vista de alumno", () => {
    it("un socio recibe 30 rutas, 28 musculos y 16 regiones", async () => {
      const member = await createTestMember(app);
      const res = await get("/api/anatomy", member.token);
      expect(res.statusCode).toBe(200);
      const body = res.json<VistaAlumnoPayload>();
      expect(body.rutas).toHaveLength(30);
      expect(body.musculos).toHaveLength(28);
      expect(body.regiones).toHaveLength(16);
    });

    it("el staff tambien puede pedirla (cualquier autenticado)", async () => {
      const token = await tokenDeStaff("gestion");
      expect((await get("/api/anatomy", token)).statusCode).toBe(200);
    });

    it("recorte profundo: sin antagonista, banderas, ficha de profe, notas ni codigos (T-200-21)", async () => {
      const member = await createTestMember(app);
      const res = await get("/api/anatomy", member.token);
      expect(res.statusCode).toBe(200);
      const body = res.json();

      const prohibidas = clavesProfundas(body).filter((k) =>
        CLAVES_PROHIBIDAS_ALUMNO.has(k),
      );
      expect(prohibidas).toEqual([]);

      // Las rutas van por slug: ningun valor es un codigo de ruta.
      const codigos = new Set(Object.keys(ROUTE_PROGRESSION_MAP));
      const hallados = stringsProfundos(body).filter((s) => codigos.has(s));
      expect(hallados).toEqual([]);

      expect(res.body).not.toContain("notaInterna");
    });

    it("la ruta de alumno se identifica por slug", async () => {
      const member = await createTestMember(app);
      const body = (
        await get("/api/anatomy", member.token)
      ).json<VistaAlumnoPayload>();
      expect(body.rutas.map((r) => r.slug)).toContain("front-lever");
    });
  });
});
