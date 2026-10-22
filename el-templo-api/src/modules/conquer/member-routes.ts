// Módulo: conquer — rutas del alumno (Fase 201 D-12, D-17)
//
// Registradas en `app.ts` con `moduleScope(app, "templo-training", ..., {
// prefix: "/api/members/conquer" })`: un gimnasio sin el módulo recibe 404.
// El `userId` sale SIEMPRE de `request.user`, nunca de body/query/params.
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant } from "../shared/tenant";
import { resolveCalibration } from "./calibration-service";
import type { CountedStep, StepKey } from "./engine";
import { sendConquerError } from "./errors";
import { getConquerState, requestUnlock } from "./member-service";
import { buildProgress } from "./progress-service";
import {
  changeStepSchema,
  conquerStateResponseSchema,
  progressSchema,
  resolveCalibrationSchema,
  saveSessionSchema,
  subirStepSchema,
  todaySchema,
  unlockRequestSchema,
} from "./schemas";
import { saveSession, type SaveSessionBody } from "./session-service";
import { changeStep, subirStep, type ChangeStepBody } from "./step-service";
import { buildToday } from "./today-service";

export const conquerMemberRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /state — bloqueado | pedido | activo (D-12). No exige plan (D-17).
  fastify.get(
    "/state",
    {
      onRequest: [fastify.authenticate],
      schema: { response: conquerStateResponseSchema },
    },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.state");
        return await getConquerState(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "conquer.member.state");
      }
    },
  );

  // POST /unlock-request — "Quiero desbloquearlo": un solo pedido (D-12).
  fastify.post(
    "/unlock-request",
    {
      onRequest: [fastify.authenticate],
      schema: unlockRequestSchema,
    },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.unlock");
        return await requestUnlock(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "conquer.member.unlock");
      }
    },
  );

  // GET /today?day= — Hoy: el día que toca (D-16) con el contador precargado (D-18).
  fastify.get<{ Querystring: { day?: string } }>(
    "/today",
    { onRequest: [fastify.authenticate], schema: todaySchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.today");
        return await buildToday(
          fastify.db,
          ctx,
          request.user.userId,
          request.query.day,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.today");
      }
    },
  );

  // PUT /sessions — guarda la sesión de hoy. Fecha y prev los fija el servidor.
  fastify.put<{ Body: SaveSessionBody }>(
    "/sessions",
    { onRequest: [fastify.authenticate], schema: saveSessionSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.sessions");
        return await saveSession(
          fastify.db,
          ctx,
          request.user.userId,
          request.body,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.sessions");
      }
    },
  );

  // PUT /steps/:exerciseId/:step — cambia la progresión de un escalón (§4.5).
  fastify.put<{
    Params: { exerciseId: number; step: StepKey };
    Body: ChangeStepBody;
  }>(
    "/steps/:exerciseId/:step",
    { onRequest: [fastify.authenticate], schema: changeStepSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.steps");
        return await changeStep(
          fastify.db,
          ctx,
          request.user.userId,
          request.params.exerciseId,
          request.params.step,
          request.body,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.steps");
      }
    },
  );

  // GET /progress — Progreso: acierto, "Hoy toca subir", calibración, figura de la semana.
  fastify.get(
    "/progress",
    { onRequest: [fastify.authenticate], schema: progressSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.progress");
        return await buildProgress(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.progress");
      }
    },
  );

  // POST /steps/:exerciseId/:step/subir — botón Subir, sin aprobación del coach (§4.5, D-06).
  fastify.post<{ Params: { exerciseId: number; step: CountedStep } }>(
    "/steps/:exerciseId/:step/subir",
    { onRequest: [fastify.authenticate], schema: subirStepSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.subir");
        const userId = request.user.userId;
        await subirStep(
          fastify.db,
          ctx,
          userId,
          request.params.exerciseId,
          request.params.step,
        );
        return await buildProgress(fastify.db, ctx, userId);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.subir");
      }
    },
  );

  // POST /calibration/:exerciseId — acepta o no la propuesta de la semana 1 (§4.3).
  fastify.post<{
    Params: { exerciseId: number };
    Body: { accept: boolean };
  }>(
    "/calibration/:exerciseId",
    { onRequest: [fastify.authenticate], schema: resolveCalibrationSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.calibration");
        const userId = request.user.userId;
        await resolveCalibration(
          fastify.db,
          ctx,
          userId,
          request.params.exerciseId,
          request.body.accept,
        );
        return await buildProgress(fastify.db, ctx, userId);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.calibration");
      }
    },
  );
};
