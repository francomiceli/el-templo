// Módulo: conquer — rutas de los tutoriales en video (Fase 202 D-25, DA-49)
//
// `registerTutorialMemberRoutes` se registra SOBRE la instancia del plugin del
// alumno (`/api/members/conquer`) y `registerTutorialAdminRoutes` sobre la de
// `conquerAdminRoutes` (`/api/admin/conquer`), DESPUÉS del `addHook` del guard
// `canManageConquer` (en `onRequest`: un rol sin permiso recibe 403 antes de
// validar el body). Las claves de storage no se loguean.
import type { FastifyInstance } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { sendConquerError } from "./errors";
import {
  adminTutorialsSchema,
  confirmTutorialSchema,
  deleteComboTutorialSchema,
  deleteExerciseTutorialSchema,
  memberTutorialsSchema,
  tutorialUploadUrlSchema,
} from "./tutorial-schemas";
import {
  confirmTutorial,
  deleteTutorial,
  getAdminTutorials,
  getMemberTutorials,
  requestTutorialUpload,
  type ConfirmTutorialBody,
  type UploadTutorialBody,
} from "./tutorial-service";

export function registerTutorialMemberRoutes(fastify: FastifyInstance): void {
  // GET /tutorials — URLs públicas de los tutoriales del gimnasio (DA-49). Pide
  // sesión pero NO Conquer activo: es contenido del gimnasio, sin datos personales.
  fastify.get(
    "/tutorials",
    { onRequest: [fastify.authenticate], schema: memberTutorialsSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.tutorials");
        return await getMemberTutorials(fastify.db, ctx);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.tutorials");
      }
    },
  );
}

export function registerTutorialAdminRoutes(fastify: FastifyInstance): void {
  // GET /tutorials — los tutoriales cargados y los 6 combos (con o sin video).
  fastify.get(
    "/tutorials",
    { schema: adminTutorialsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "conquer.admin.tutorials");
        return await getAdminTutorials(fastify, ctx);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.admin.tutorials");
      }
    },
  );

  // POST /tutorials/upload-url — URL firmada al bucket público (DA-39, DA-48).
  fastify.post<{ Body: UploadTutorialBody }>(
    "/tutorials/upload-url",
    { schema: tutorialUploadUrlSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.tutorials.upload",
        );
        return await requestTutorialUpload(fastify, ctx, request.body);
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.tutorials.upload",
        );
      }
    },
  );

  // PUT /tutorials — confirma el video (HEAD) y lo deja como el tutorial (D-25).
  fastify.put<{ Body: ConfirmTutorialBody }>(
    "/tutorials",
    { schema: confirmTutorialSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.tutorials.confirm",
        );
        const view = await confirmTutorial(
          fastify,
          ctx,
          request.user.userId,
          request.body,
        );
        request.log.info(
          { target: request.body.target },
          "conquer tutorial saved",
        );
        return view;
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.tutorials.confirm",
        );
      }
    },
  );

  // DELETE /tutorials/exercise/:exerciseId — idempotente (DA-48).
  fastify.delete<{ Params: { exerciseId: number } }>(
    "/tutorials/exercise/:exerciseId",
    { schema: deleteExerciseTutorialSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.tutorials.delete-exercise",
        );
        return await deleteTutorial(
          fastify,
          ctx,
          "ejercicio",
          request.params.exerciseId,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.tutorials.delete-exercise",
        );
      }
    },
  );

  // DELETE /tutorials/combo/:comboKey — el combo se valida contra COMBO_KEYS en el servicio.
  fastify.delete<{ Params: { comboKey: string } }>(
    "/tutorials/combo/:comboKey",
    { schema: deleteComboTutorialSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.tutorials.delete-combo",
        );
        return await deleteTutorial(
          fastify,
          ctx,
          "combo",
          request.params.comboKey,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.tutorials.delete-combo",
        );
      }
    },
  );
}
