/**
 * Members API Routes
 *
 * Admin endpoints for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 *
 * All routes require authentication and coach/admin/owner/gestion role.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as schema from "../../db/schema";
import { memberProfiles } from "../../db/schema/member-profiles";
import {
  GOAL_LABELS,
  EXPERIENCE_LABELS,
  TRAINING_FOCUS_LABELS,
  MOTIVATION_LABELS,
} from "../onboarding/types";
import { MemberService } from "./service";
import { DebtService } from "./debts-service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { EmailService } from "../email";
import type {
  CreateMemberInput,
  UpdateMemberInput,
  MemberListParams,
  DebtUpsertInput,
} from "./types";
import {
  listMembersSchema,
  getMemberSchema,
  createMemberSchema,
  updateMemberSchema,
  toggleStatusSchema,
  checkDniSchema,
  exportMembersSchema,
  uploadPhotoUrlSchema,
  listNotesSchema,
  createNoteSchema,
  updateNoteSchema,
  deleteNoteSchema,
  getMemberSessionLevelsSchema,
} from "./schemas";
import { Workbook } from "exceljs";

import { ADMIN_ROLES, MEMBER_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";

/**
 * Check if an error is a MySQL duplicate key error and extract details.
 * Drizzle wraps MySQL errors: the real MySQL error is in `err.cause`.
 */
function isDuplicateKeyError(err: unknown): {
  isDuplicate: boolean;
  detail: string;
} {
  if (!(err instanceof Error)) return { isDuplicate: false, detail: "" };

  // Drizzle wraps the MySQL error in `cause`
  const cause = err.cause as Record<string, unknown> | undefined;
  const causeCode = typeof cause?.code === "string" ? cause.code : "";
  const causeSqlMessage =
    typeof cause?.sqlMessage === "string" ? cause.sqlMessage : "";
  const causeMessage = cause instanceof Error ? cause.message : causeSqlMessage;

  // Check the cause first (Drizzle wrapper), then the error itself
  const isDuplicate =
    causeCode === "ER_DUP_ENTRY" ||
    causeSqlMessage.includes("Duplicate entry") ||
    causeMessage.includes("Duplicate entry") ||
    err.message.includes("Duplicate entry");

  const detail = causeSqlMessage || causeMessage || err.message;

  return { isDuplicate, detail };
}

export const memberRoutes: FastifyPluginAsync = async (fastify) => {
  const debtService = new DebtService(fastify.db, fastify.log);
  const memberService = new MemberService(fastify.db, fastify.log, debtService);

  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(MEMBER_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // =========================================================================
  // Branches (must be defined BEFORE :userId param routes)
  // =========================================================================

  // GET /admin/members/branches — List active branches for dropdowns
  fastify.get("/branches", async () => {
    const rows = await fastify.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
      })
      .from(schema.branches)
      .where(eq(schema.branches.isActive, true))
      .orderBy(schema.branches.name);
    return { branches: rows };
  });

  // =========================================================================
  // DNI Check (must be defined BEFORE :userId param routes)
  // =========================================================================

  // GET /admin/members/check-dni?dni=X&excludeUserId=Y
  fastify.get<{
    Querystring: { dni: string; excludeUserId?: number };
  }>("/check-dni", { schema: checkDniSchema }, async (request) => {
    const { dni, excludeUserId } = request.query;
    return memberService.checkDniUniqueness(dni, excludeUserId);
  });

  // =========================================================================
  // Export (must be defined BEFORE :userId param routes)
  // =========================================================================

  // GET /admin/members/export — Export filtered members as .xlsx
  fastify.get<{
    Querystring: {
      search?: string;
      branchId?: number;
      multiBranch?: boolean;
      level?: string;
      isActive?: boolean;
      planId?: number;
      avatarType?: string;
    };
  }>("/export", { schema: exportMembersSchema }, async (request, reply) => {
    // Country scope (Phase 98): always pass request.scope.country into the
    // service so /export mirrors the list endpoint. Non-owners cannot
    // override this (preHandler ignores their ?country=); owners get the
    // country they selected via the admin dropdown.
    const rows = await memberService.exportMembers({
      search: request.query.search,
      branchId: request.query.branchId,
      multiBranch: request.query.multiBranch,
      level: request.query.level,
      isActive: request.query.isActive,
      planId: request.query.planId,
      avatarType: request.query.avatarType,
      country: request.scope.country,
    });

    const workbook = new Workbook();
    workbook.creator = "El Templo";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Alumnos");

    sheet.columns = [
      { header: "Nombre", key: "nombre", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "DNI", key: "dni", width: 15 },
      { header: "Telefono", key: "telefono", width: 18 },
      { header: "Sucursal", key: "sucursal", width: 20 },
      { header: "Nivel", key: "nivel", width: 12 },
      { header: "Plan", key: "plan", width: 25 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Vencimiento", key: "vencimientoSuscripcion", width: 15 },
      { header: "Fecha Nac.", key: "fechaNacimiento", width: 15 },
      { header: "Direccion", key: "direccion", width: 35 },
    ];

    // Style header row: bold, background color
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    for (const row of rows) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const today = new Date().toISOString().split("T")[0];
    const filename = `alumnos-${today}.xlsx`;

    return reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });

  // =========================================================================
  // Member CRUD
  // =========================================================================

  // GET /admin/members — List members with search, filters, pagination
  fastify.get<{
    Querystring: {
      search?: string;
      branchId?: number;
      multiBranch?: boolean;
      level?: string;
      isActive?: boolean;
      planId?: number;
      segment?: string;
      avatarType?: string;
      debtorOnly?: boolean;
      page?: number;
      limit?: number;
    };
  }>("/", { schema: listMembersSchema }, async (request) => {
    const {
      search,
      branchId,
      multiBranch,
      level,
      isActive,
      planId,
      segment,
      avatarType,
      debtorOnly,
      page = 1,
      limit = 20,
    } = request.query;

    // Country scope (Phase 98): request.scope.country is set by
    // attachCountryScope. Non-owners cannot override it; owners' `?country=`
    // has already been reflected into scope.country by the preHandler.
    const params: MemberListParams = {
      search,
      branchId,
      multiBranch,
      level,
      isActive,
      planId,
      segment,
      avatarType,
      country: request.scope.country,
      debtorOnly,
      page,
      limit,
    };

    const result = await memberService.listMembers(params);
    return { ...result, page, limit };
  });

  // GET /admin/members/:userId — Get member profile
  fastify.get<{ Params: { userId: number } }>(
    "/:userId",
    { schema: getMemberSchema },
    async (request, reply) => {
      const member = await memberService.getMemberById(request.params.userId);
      if (!member) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      // Country-scope guard — non-owner staff cannot read other-country members
      if (request.scope.country && member.branchId) {
        const [memberBranch] = await fastify.db
          .select({ country: schema.branches.country })
          .from(schema.branches)
          .where(eq(schema.branches.id, member.branchId))
          .limit(1);
        if (memberBranch && memberBranch.country !== request.scope.country) {
          return reply
            .code(404)
            .send({ error: "No encontrado", message: "Miembro no encontrado" });
        }
      }

      // Fetch segment + onboarding + avatar data from member_profiles
      const [profile] = await fastify.db
        .select({
          segment: memberProfiles.segment,
          segmentUpdatedAt: memberProfiles.segmentUpdatedAt,
          avatarType: memberProfiles.avatarType,
          goalType: memberProfiles.goalType,
          experienceLevel: memberProfiles.experienceLevel,
          trainingFocus: memberProfiles.trainingFocus,
          motivationStyle: memberProfiles.motivationStyle,
          onboardingCompletedAt: memberProfiles.onboardingCompletedAt,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, request.params.userId))
        .limit(1);

      const onboardingProfile = profile?.onboardingCompletedAt
        ? {
            goalType: profile.goalType ?? null,
            goalLabel: profile.goalType ? GOAL_LABELS[profile.goalType] : null,
            experienceLevel: profile.experienceLevel ?? null,
            experienceLabel: profile.experienceLevel
              ? EXPERIENCE_LABELS[profile.experienceLevel]
              : null,
            trainingFocus: profile.trainingFocus ?? null,
            focusLabel: profile.trainingFocus
              ? TRAINING_FOCUS_LABELS[profile.trainingFocus]
              : null,
            motivationStyle: profile.motivationStyle ?? null,
            motivationLabel: profile.motivationStyle
              ? MOTIVATION_LABELS[profile.motivationStyle]
              : null,
            completedAt: profile.onboardingCompletedAt.toISOString(),
          }
        : null;

      return {
        ...member,
        segment: profile?.segment ?? null,
        segmentUpdatedAt: profile?.segmentUpdatedAt?.toISOString() ?? null,
        avatarType: profile?.avatarType ?? null,
        onboardingProfile,
      };
    },
  );

  // POST /admin/members — Create member (plan-first, auto-password, auto-subscription)
  fastify.post<{ Body: CreateMemberInput }>(
    "/",
    { schema: createMemberSchema },
    async (request, reply) => {
      try {
        const { member, tempPassword } = await memberService.createMember(
          request.body,
        );

        // Auto-create subscription at base regular price
        try {
          const auraService = new AuraService(fastify.db);
          const subscriptionService = new SubscriptionService(
            fastify.db,
            fastify.log,
            auraService,
          );

          const today = new Date().toISOString().split("T")[0];
          await subscriptionService.assignPlan(
            member.id,
            {
              planId: request.body.planId,
              branchId: request.body.branchId,
              startDate: today,
              priceTypeApplied: "regular",
              paymentMethod: "cash",
            },
            request.user.userId,
          );
        } catch (subErr: unknown) {
          request.log.error(
            { err: subErr },
            "Error creating subscription for new member",
          );
          // Don't fail member creation if subscription fails
        }

        // Send password-set email (best effort)
        try {
          const emailService = new EmailService(fastify.log);
          await emailService.sendPasswordSetEmail(
            member.email,
            member.firstName ?? "",
            tempPassword,
          );
        } catch (emailErr: unknown) {
          request.log.error(
            { err: emailErr },
            "Error sending password-set email",
          );
          // Don't fail member creation if email fails
        }

        return reply.code(201).send(member);
      } catch (err: unknown) {
        const { isDuplicate, detail } = isDuplicateKeyError(err);

        if (isDuplicate) {
          if (detail.includes("email")) {
            return reply.code(409).send({
              error: "Conflicto",
              message: "El email ya esta registrado",
            });
          }
          if (detail.includes("dni")) {
            return reply.code(409).send({
              error: "Conflicto",
              message: "El DNI ya esta registrado",
            });
          }
          return reply
            .code(409)
            .send({ error: "Conflicto", message: "Registro duplicado" });
        }

        request.log.error({ err }, "Error creating member");
        return reply.code(500).send({
          error: "Error del servidor",
          message: "Error al crear miembro",
        });
      }
    },
  );

  // PUT /admin/members/:userId — Update member (+ optional debt upsert/cancel)
  fastify.put<{
    Params: { userId: number };
    Body: UpdateMemberInput & { debt?: DebtUpsertInput | null };
  }>("/:userId", { schema: updateMemberSchema }, async (request, reply) => {
    // Phase 101 RBAC (T-101-10): the route plugin's onRequest admits the full
    // MEMBER_ROLES set (coach/admin/owner/gestion/recepcion), but debt writes
    // are stricter — only ADMIN_ROLES (admin, owner) may mutate debts.
    // We check `'debt' in request.body` so that omitting the field entirely
    // (current UX for non-debt edits) is unaffected; supplying `debt: null`
    // (cancel) or `debt: {...}` (upsert) BOTH require ADMIN_ROLES.
    const body = request.body;
    const wantsDebtMutation = Object.prototype.hasOwnProperty.call(
      body,
      "debt",
    );
    if (
      wantsDebtMutation &&
      !(ADMIN_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Solo admin/owner puede gestionar deudas",
      });
    }

    // Separate debt payload from the regular member update fields.
    const { debt, ...memberFields } = body;

    try {
      const member = await memberService.updateMember(
        request.params.userId,
        memberFields,
      );
      if (!member) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      // Apply the debt mutation (already ADMIN_ROLES-gated above).
      if (wantsDebtMutation) {
        if (debt === null) {
          await debtService.cancelActiveDebt(request.params.userId);
        } else if (debt !== undefined) {
          await debtService.upsertActiveDebt(request.params.userId, debt);
        }
      }

      const currentDebt = await debtService.getActiveDebtForUser(
        request.params.userId,
      );
      return { ...member, debt: currentDebt };
    } catch (err: unknown) {
      const { isDuplicate, detail } = isDuplicateKeyError(err);

      if (isDuplicate) {
        if (detail.includes("dni")) {
          return reply.code(409).send({
            error: "Conflicto",
            message: "El DNI ya esta registrado",
          });
        }
        return reply
          .code(409)
          .send({ error: "Conflicto", message: "Registro duplicado" });
      }

      request.log.error({ err }, "Error updating member");
      return reply.code(500).send({
        error: "Error del servidor",
        message: "Error al actualizar miembro",
      });
    }
  });

  // PATCH /admin/members/:userId/status — Toggle active status
  fastify.patch<{ Params: { userId: number }; Body: { isActive: boolean } }>(
    "/:userId/status",
    { schema: toggleStatusSchema },
    async (request, reply) => {
      const member = await memberService.toggleActive(
        request.params.userId,
        request.body.isActive,
      );
      if (!member) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }
      return member;
    },
  );

  // =========================================================================
  // Photo Upload
  // =========================================================================

  // POST /admin/members/:userId/photo/upload-url — Generate R2 presigned URL for member photo
  fastify.post<{ Params: { userId: number }; Body: { filename: string } }>(
    "/:userId/photo/upload-url",
    { schema: uploadPhotoUrlSchema },
    async (request, reply) => {
      if (!fastify.r2) {
        return reply.code(503).send({
          error: "Servicio no disponible",
          message: "Almacenamiento de imagenes no configurado",
        });
      }

      const sanitized = request.body.filename
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/-+/g, "-");
      const ext = sanitized.split(".").pop()?.toLowerCase() ?? "";
      const MIME_MAP: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      const contentType = MIME_MAP[ext] ?? "image/jpeg";
      const key = `members/photos/${request.params.userId}-${Date.now()}.${ext || "jpg"}`;

      const command = new PutObjectCommand({
        Bucket: fastify.r2Bucket,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(fastify.r2, command, {
        expiresIn: 900,
      });
      const publicUrl = `${process.env.R2_PUBLIC_URL || ""}/${key}`;

      // Save publicUrl to DB immediately
      await memberService.updatePhoto(request.params.userId, publicUrl);

      request.log.info(
        { userId: request.params.userId, key },
        "Member photo upload URL generated",
      );

      return { uploadUrl, publicUrl };
    },
  );

  // =========================================================================
  // Session Level Counts (Phase 99 R11)
  // =========================================================================

  // GET /admin/members/:userId/session-levels?days=30 — per-level completion counts
  fastify.get<{
    Params: { userId: number };
    Querystring: { days?: number };
  }>(
    "/:userId/session-levels",
    { schema: getMemberSessionLevelsSchema },
    async (request) => {
      const { userId } = request.params;
      // Defense-in-depth clamp (schema already validates [1, 365] with default 30)
      const days = Math.max(1, Math.min(365, request.query.days ?? 30));
      const counts = await memberService.getSessionLevelCounts(userId, days);
      return { counts };
    },
  );

  // =========================================================================
  // Notes
  // =========================================================================

  // GET /admin/members/:userId/notes — List notes for a member
  fastify.get<{ Params: { userId: number } }>(
    "/:userId/notes",
    { schema: listNotesSchema },
    async (request) => {
      const notes = await memberService.getNotes(request.params.userId);
      return { notes };
    },
  );

  // POST /admin/members/:userId/notes — Create note
  fastify.post<{ Params: { userId: number }; Body: { content: string } }>(
    "/:userId/notes",
    { schema: createNoteSchema },
    async (request, reply) => {
      const note = await memberService.createNote(request.user.userId, {
        userId: request.params.userId,
        content: request.body.content,
      });
      return reply.code(201).send(note);
    },
  );

  // PUT /admin/members/:userId/notes/:noteId — Update note
  fastify.put<{
    Params: { userId: number; noteId: number };
    Body: { content: string };
  }>(
    "/:userId/notes/:noteId",
    { schema: updateNoteSchema },
    async (request, reply) => {
      const { noteId } = request.params;

      // Fetch note to check authorization
      const notes = await memberService.getNotes(request.params.userId);
      const existingNote = notes.find((n) => n.id === noteId);

      if (!existingNote) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Nota no encontrada" });
      }

      if (
        !memberService.canEditNote(
          existingNote.authorId,
          request.user.userId,
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "No tienes permiso para editar esta nota",
        });
      }

      const updated = await memberService.updateNote(noteId, {
        content: request.body.content,
      });
      if (!updated) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Nota no encontrada" });
      }
      return updated;
    },
  );

  // DELETE /admin/members/:userId/notes/:noteId — Delete note
  fastify.delete<{ Params: { userId: number; noteId: number } }>(
    "/:userId/notes/:noteId",
    { schema: deleteNoteSchema },
    async (request, reply) => {
      const { noteId } = request.params;

      // Fetch note to check authorization
      const notes = await memberService.getNotes(request.params.userId);
      const existingNote = notes.find((n) => n.id === noteId);

      if (!existingNote) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Nota no encontrada" });
      }

      if (
        !memberService.canEditNote(
          existingNote.authorId,
          request.user.userId,
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "No tienes permiso para eliminar esta nota",
        });
      }

      await memberService.deleteNote(noteId);
      return { success: true };
    },
  );
};
