/**
 * Anatomy API Routes (fase 200, P3)
 *
 * Contenido de anatomía funcional, SOLO LECTURA. Dos vistas, el recorte por
 * audiencia lo hace el server (`serializers.ts`), no la UI:
 *   - GET /api/admin/anatomy: vista completa del profe. ANATOMIA_STAFF_ROLES
 *     (R1: coach, admin, owner, coach_actividad). Trae además la lista real de
 *     ejercicios del catálogo de cada ruta (tenant de la request).
 *   - GET /api/anatomy: vista de alumno, cualquier autenticado. Sin antagonista,
 *     banderas, ficha de profe ni códigos de ruta (D14, D15).
 */
import type { FastifyPluginAsync } from "fastify";
import { and, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { handleServiceError } from "../shared/error-handler";
import { attachCountryScope } from "../shared/country-scope";
import { ANATOMIA_STAFF_ROLES } from "../shared/permissions";
import { assertTenant, tenantWhere } from "../shared/tenant";
import { RUTAS } from "./content/rutas";
import { ejerciciosPorRutaDe, vistaAlumno, vistaProfe } from "./serializers";

/** Códigos de las 30 rutas del modelo (los únicos que la ficha lista). */
const CODIGOS_RUTA: string[] = RUTAS.map((r) => r.code);

export const anatomyRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/admin/anatomy — vista completa para el staff de piso.
   */
  fastify.get(
    "/admin/anatomy",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ANATOMIA_STAFF_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Acceso requerido",
        });
      }

      try {
        // T-200-23: `exercises` es gym-owned. El ctx sale del scope del
        // usuario autenticado (attachCountryScope + assertTenant).
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "anatomy.ejercicios");

        // El CSV de ejercicios trae espacios finales y mayúsculas mezcladas
        // en `route`: se compara normalizado (UPPER + TRIM), igual que la
        // proyección de zonas.
        const filas = await fastify.db
          .select({
            route: schema.exercises.route,
            exercise: schema.exercises.exercise,
            dificultadLineal: schema.exercises.dificultadLineal,
            progressionStep: schema.exercises.progressionStep,
          })
          .from(schema.exercises)
          .where(
            and(
              tenantWhere(schema.exercises, ctx),
              inArray(
                sql<string>`UPPER(TRIM(${schema.exercises.route}))`,
                CODIGOS_RUTA,
              ),
            ),
          );

        return vistaProfe(ejerciciosPorRutaDe(filas));
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getAnatomyStaff");
      }
    },
  );

  /**
   * GET /api/anatomy — vista de alumno (recortada en el server).
   * Contenido estático sin datos personales: no toca la DB.
   */
  fastify.get(
    "/anatomy",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        return vistaAlumno();
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getAnatomyStudent");
      }
    },
  );
};
