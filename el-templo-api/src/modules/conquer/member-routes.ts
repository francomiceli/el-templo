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
import { subirCombo } from "./combo-service";
import {
  confirmPhoto,
  getPhotoUrl,
  listChecks,
  requestPhotoUpload,
  skipDay0,
  upsertTodayCheck,
  type UpsertCheckBody,
} from "./body-check-service";
import type { ComboKey } from "./combos";
import { registerCorrectionMemberRoutes } from "./correction-routes";
import type { CountedStep, StepKey } from "./engine";
import { sendConquerError } from "./errors";
import {
  getConquerState,
  markGuideSeen,
  requestUnlock,
  setPublishPermission,
} from "./member-service";
import type { ConquerPose } from "./private-media";
import { buildProgress } from "./progress-service";
import {
  changeStepSchema,
  conquerStateResponseSchema,
  guideSeenSchema,
  listBodyChecksSchema,
  photoConfirmSchema,
  photoUploadUrlSchema,
  photoUrlSchema,
  progressSchema,
  publishPermissionSchema,
  resolveCalibrationSchema,
  saveSessionSchema,
  skipDay0Schema,
  subirComboSchema,
  subirStepSchema,
  todaySchema,
  unlockRequestSchema,
  upsertBodyCheckSchema,
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

  // POST /combos/:comboKey/subir — Subir la progresión de arranque de un combo (D-14, §4.5).
  fastify.post<{ Params: { comboKey: ComboKey } }>(
    "/combos/:comboKey/subir",
    { onRequest: [fastify.authenticate], schema: subirComboSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.combo_subir");
        return await subirCombo(
          fastify.db,
          ctx,
          request.user.userId,
          request.params.comboKey,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.combo_subir");
      }
    },
  );

  // ── Control físico (§6, D-15) ─────────────────────────────────────

  // POST /body-checks — crea o continúa el control de HOY (body vacío permitido).
  fastify.post<{ Body: UpsertCheckBody }>(
    "/body-checks",
    { onRequest: [fastify.authenticate], schema: upsertBodyCheckSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.body_checks");
        return await upsertTodayCheck(
          fastify.db,
          ctx,
          request.user.userId,
          request.body,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.body_checks");
      }
    },
  );

  // GET /body-checks — controles, comparador día 0 vs último y vencimiento.
  fastify.get(
    "/body-checks",
    { onRequest: [fastify.authenticate], schema: listBodyChecksSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "conquer.member.body_checks_list",
        );
        return await listChecks(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.body_checks_list",
        );
      }
    },
  );

  // POST /body-checks/skip-day0 — "Lo hago después" (D-15).
  fastify.post(
    "/body-checks/skip-day0",
    { onRequest: [fastify.authenticate], schema: skipDay0Schema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.skip_day0");
        return await skipDay0(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.skip_day0");
      }
    },
  );

  // POST /guide-seen — la guía "¿Cómo funciona?" ya se vio (DA-21).
  fastify.post(
    "/guide-seen",
    { onRequest: [fastify.authenticate], schema: guideSeenSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.guide_seen");
        return await markGuideSeen(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.guide_seen");
      }
    },
  );

  // POST /body-checks/:checkId/photos/:pose/upload-url — URL firmada para subir.
  fastify.post<{
    Params: { checkId: number; pose: ConquerPose };
    Body: { contentType: string };
  }>(
    "/body-checks/:checkId/photos/:pose/upload-url",
    { onRequest: [fastify.authenticate], schema: photoUploadUrlSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.photo_upload");
        return await requestPhotoUpload(
          fastify,
          ctx,
          request.user.userId,
          request.params.checkId,
          request.params.pose,
          request.body.contentType,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.photo_upload",
        );
      }
    },
  );

  // POST /body-checks/:checkId/photos/:pose/confirm — valida clave y HEAD.
  fastify.post<{
    Params: { checkId: number; pose: ConquerPose };
    Body: { key: string };
  }>(
    "/body-checks/:checkId/photos/:pose/confirm",
    { onRequest: [fastify.authenticate], schema: photoConfirmSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.photo_confirm");
        return await confirmPhoto(
          fastify,
          ctx,
          request.user.userId,
          request.params.checkId,
          request.params.pose,
          request.body.key,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.photo_confirm",
        );
      }
    },
  );

  // GET /body-checks/:checkId/photos/:pose/url — URL firmada de lectura (5 min).
  fastify.get<{ Params: { checkId: number; pose: ConquerPose } }>(
    "/body-checks/:checkId/photos/:pose/url",
    { onRequest: [fastify.authenticate], schema: photoUrlSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.photo_url");
        return await getPhotoUrl(
          fastify,
          ctx,
          request.user.userId,
          request.params.checkId,
          request.params.pose,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.photo_url");
      }
    },
  );

  // PUT /publish-permission — activa o retira el permiso de publicación (§6, A19).
  fastify.put<{ Body: { enabled: boolean; noFace: boolean } }>(
    "/publish-permission",
    { onRequest: [fastify.authenticate], schema: publishPermissionSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.publish");
        return await setPublishPermission(
          fastify.db,
          ctx,
          request.user.userId,
          request.body,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.publish");
      }
    },
  );

  // Fase 201 D-26: correcciones con video (correction-routes.ts).
  registerCorrectionMemberRoutes(fastify);
};
