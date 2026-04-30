/**
 * Members API Routes
 *
 * Admin endpoints for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 *
 * All routes require authentication and coach/admin/owner/gestion role.
 */

import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { BookingService } from "../scheduling/booking-service";
import { NotificationService } from "../notifications/service";
import { NotFoundError } from "../shared/errors";
import { EmailService } from "../email";
import type {
  CreateMemberInput,
  UpdateMemberInput,
  MemberListParams,
} from "./types";
import {
  listMembersSchema,
  getMemberSchema,
  createMemberSchema,
  updateMemberSchema,
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

import {
  ADMIN_ROLES,
  MEMBER_ROLES,
  FINANCE_READ_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { TransactionService, BalanceService } from "../finance";
import {
  financialHistorySchema,
  outstandingConceptsSchema,
} from "../finance/schemas";
import { handleServiceError } from "../shared/error-handler";

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
  const memberService = new MemberService(fastify.db, fastify.log);
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
  );

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
      // Phase 103 (R8): export uses the same status enum as the list endpoint.
      status?: "todos" | "freemium" | "prueba" | "activo" | "inactivo";
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
      status: request.query.status,
      planId: request.query.planId,
      avatarType: request.query.avatarType,
      country: request.scope.country ?? undefined,
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
      planId?: number;
      segment?: string;
      avatarType?: string;
      debtorOnly?: boolean;
      // Phase 103 (R8): first-class users.status filter (replaces Phase 102 enum).
      status?: "todos" | "freemium" | "prueba" | "activo" | "inactivo";
      page?: number;
      limit?: number;
    };
  }>("/", { schema: listMembersSchema }, async (request) => {
    const {
      search,
      branchId,
      multiBranch,
      level,
      planId,
      segment,
      avatarType,
      debtorOnly,
      status,
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
      planId,
      segment,
      avatarType,
      country: request.scope.country ?? undefined,
      debtorOnly,
      status,
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

      // Country-scope guard — non-owner staff cannot read other-country
      // members. Virtual branches (e.g. ONLINE) are exempt so self-registered
      // members stay reachable by staff of either country until a coach
      // reassigns them to their physical branch.
      if (request.scope.country && member.branchId) {
        const [memberBranch] = await fastify.db
          .select({
            country: schema.branches.country,
            isVirtual: schema.branches.isVirtual,
          })
          .from(schema.branches)
          .where(eq(schema.branches.id, member.branchId))
          .limit(1);
        if (
          memberBranch &&
          !memberBranch.isVirtual &&
          memberBranch.country !== request.scope.country
        ) {
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

        // Auto-create subscription at base regular price when a plan was
        // selected. Plan is optional at creation: admin can assign it later
        // via "Gestionar Plan" which supports custom pricing (zero, credit
        // card, override + reason).
        if (request.body.planId !== undefined) {
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
        }

        // Send password-set email (best effort).
        // Phase 102: trial users have email=null; skip sending in that case.
        if (member.email) {
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
        }

        // Re-fetch so users.status reflects the auto-transition triggered
        // by the subscription created above (Plan 02 recomputeUserStatus
        // flips 'prueba' → 'activo' inside assignPlan's transaction).
        const freshMember =
          (await memberService.getMemberById(member.id)) ?? member;
        return reply.code(201).send(freshMember);
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

  // PUT /admin/members/:userId — Update member fields.
  //
  // Phase 105 (D-11): debt mutation is gone. The Zod/JSON schema is closed
  // (additionalProperties:false) so legacy admin clients posting
  // `debt`/`isDebtor`/`debtAmount`/`debtCurrency`/`debtNote` get a 400 with
  // a clear error. The new finance model (Phase 106+) exposes
  // POST /transactions for any debt/payment workflow.
  fastify.put<{
    Params: { userId: number };
    Body: UpdateMemberInput;
  }>("/:userId", { schema: updateMemberSchema }, async (request, reply) => {
    try {
      const member = await memberService.updateMember(
        request.params.userId,
        request.body,
      );
      if (!member) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      return member;
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

  // DELETE /admin/members/:userId — Soft-delete a member.
  //
  // Scrubs email + DNI so the person can be re-onboarded with their real
  // identifiers, and sets deletedAt so the row drops out of admin lists and
  // single-member reads. Financial history (financial_transactions,
  // subscriptions) stays intact. ADMIN_ROLES only — coaches cannot delete.
  // Refuses to delete non-members (coach/admin/owner rows) as a safety net.
  fastify.delete<{ Params: { userId: number } }>(
    "/:userId",
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Solo admin/owner puede eliminar alumnos",
        });
      }

      // Cross-country guard: read the target row directly (getMemberById
      // already filters deletedAt, so we query the join here to resolve the
      // branch country for the scope check). Returns 404 for cross-country
      // (mirrors GET /:userId) so nothing leaks.
      const [target] = await fastify.db
        .select({
          id: schema.users.id,
          role: schema.users.role,
          deletedAt: schema.users.deletedAt,
          branchCountry: schema.branches.country,
          branchIsVirtual: schema.branches.isVirtual,
        })
        .from(schema.users)
        .innerJoin(
          schema.branches,
          eq(schema.branches.id, schema.users.branchId),
        )
        .where(eq(schema.users.id, request.params.userId))
        .limit(1);

      if (!target || target.deletedAt) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      if (
        request.scope.country &&
        !target.branchIsVirtual &&
        target.branchCountry !== request.scope.country
      ) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      // Cancel any active/paused subscription and the future bookings it
      // owns. cancelSubscription also nukes the scheduled successor (if any)
      // and calls BookingService.cancelFutureBookings for fixed-plan subs
      // — so this one call covers subscription-tied bookings.
      const auraService = new AuraService(fastify.db);
      const subscriptionService = new SubscriptionService(
        fastify.db,
        request.log,
        auraService,
      );
      const notificationService = new NotificationService(
        fastify.db,
        request.log,
      );
      const bookingService = new BookingService(
        fastify.db,
        request.log,
        subscriptionService,
        notificationService,
      );
      subscriptionService.setBookingService(bookingService);

      try {
        await subscriptionService.cancelSubscription(
          request.params.userId,
          "Cancelado por eliminación del alumno",
        );
      } catch (err) {
        // Members with no active/paused subscription hit NotFoundError —
        // that is expected, keep going. Anything else is unexpected; log
        // and rethrow so the admin sees a 500 rather than a silent partial.
        if (!(err instanceof NotFoundError)) throw err;
      }

      // Catch remaining future bookings the subscription cancel didn't
      // touch: trial bookings (no subscription), bookings attached to a
      // subscription that already ended, and any flex-plan reservations
      // that aren't wired through subscription_schedules.
      const today = new Date().toISOString().split("T")[0];
      await fastify.db
        .update(schema.bookings)
        .set({
          status: "cancelado",
          cancelledAt: new Date(),
          waitlistPosition: null,
        })
        .where(
          and(
            eq(schema.bookings.memberId, request.params.userId),
            sql`${schema.bookings.bookingDate} >= ${today}`,
            inArray(schema.bookings.status, ["reservado", "lista_espera"]),
          ),
        );

      const result = await memberService.softDeleteMember(
        request.params.userId,
      );

      if (!result.ok) {
        if (result.reason === "not_found") {
          return reply
            .code(404)
            .send({ error: "No encontrado", message: "Miembro no encontrado" });
        }
        if (result.reason === "not_member") {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: "Solo se pueden eliminar alumnos",
          });
        }
        // already_deleted
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      request.log.info(
        { userId: request.params.userId, deletedBy: request.user.userId },
        "Member soft-deleted",
      );

      return reply.code(204).send();
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
  // Financial History (Phase 106-04)
  // =========================================================================

  // GET /admin/members/:userId/financial-history — D-09 / D-13
  // Coach is excluded by D-04 even though MEMBER_ROLES (module hook) admits them.
  // Cross-country reads return 404 to avoid info-leak (T-106-02).
  fastify.get<{
    Params: { userId: number };
    Querystring: { page?: number; limit?: number };
  }>(
    "/:userId/financial-history",
    { schema: financialHistorySchema },
    async (request, reply) => {
      try {
        // D-04 privacy override (FINANCE_READ_ROLES is stricter than
        // MEMBER_ROLES: it excludes 'coach'). The module-level hook admits
        // coach because they need other member info; financial history is the
        // exception per the privacy decision.
        if (
          !(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para ver el historial financiero",
          });
        }

        // T-106-02 — verify target member exists and (for non-owners) lives
        // in a branch that matches the request's country scope. Returns 404
        // (not 403) for cross-country to mirror DELETE /:userId pattern and
        // avoid leaking the existence of users outside the caller's country.
        const [target] = await fastify.db
          .select({
            id: schema.users.id,
            deletedAt: schema.users.deletedAt,
            branchCountry: schema.branches.country,
            branchIsVirtual: schema.branches.isVirtual,
          })
          .from(schema.users)
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .where(eq(schema.users.id, request.params.userId))
          .limit(1);

        if (!target || target.deletedAt) {
          return reply.code(404).send({
            error: "No encontrado",
            message: "Miembro no encontrado",
          });
        }

        if (
          !request.scope.isOwner &&
          !target.branchIsVirtual &&
          target.branchCountry !== request.scope.country
        ) {
          // 404 (not 403) to mirror DELETE /:userId pattern (info-leak avoid).
          return reply.code(404).send({
            error: "No encontrado",
            message: "Miembro no encontrado",
          });
        }

        return await transactionService.getFinancialHistory(
          request.params.userId,
          {
            page: request.query.page,
            limit: request.query.limit,
          },
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get financial history");
      }
    },
  );

  // GET /admin/members/:userId/outstanding-concepts — Phase 108 D-01..D-06
  // Source autoritativa de saldos pendientes para el dialog "Registrar pago".
  // RBAC: FINANCE_READ_ROLES (excluye coach por privacidad).
  // Cross-country reads return 404 (info-leak prevention) — mismo patrón que
  // financial-history.
  fastify.get<{ Params: { userId: number } }>(
    "/:userId/outstanding-concepts",
    { schema: outstandingConceptsSchema },
    async (request, reply) => {
      try {
        // D-04 privacy override (FINANCE_READ_ROLES es más estricto que
        // MEMBER_ROLES — excluye 'coach'). El módulo-level hook admite coach
        // pero los datos financieros son la excepción.
        if (
          !(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para ver los saldos pendientes",
          });
        }

        // T-106-02 — verify target member exists and (for non-owners) lives
        // in a branch that matches the request's country scope. 404 (no 403)
        // para cross-country, mirror DELETE /:userId pattern (info-leak avoid).
        const [target] = await fastify.db
          .select({
            id: schema.users.id,
            deletedAt: schema.users.deletedAt,
            branchCountry: schema.branches.country,
            branchIsVirtual: schema.branches.isVirtual,
          })
          .from(schema.users)
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .where(eq(schema.users.id, request.params.userId))
          .limit(1);

        if (!target || target.deletedAt) {
          return reply.code(404).send({
            error: "No encontrado",
            message: "Miembro no encontrado",
          });
        }

        if (
          !request.scope.isOwner &&
          !target.branchIsVirtual &&
          target.branchCountry !== request.scope.country
        ) {
          // 404 (not 403) to mirror DELETE /:userId pattern (info-leak avoid).
          return reply.code(404).send({
            error: "No encontrado",
            message: "Miembro no encontrado",
          });
        }

        // D-03: cuando no hay saldos abiertos, retornar { concepts: [] }.
        const concepts = await transactionService.getOutstandingConcepts(
          request.params.userId,
        );
        return { concepts };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get outstanding concepts");
      }
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
