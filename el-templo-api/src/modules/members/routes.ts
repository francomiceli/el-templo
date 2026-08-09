/**
 * Members API Routes
 *
 * Admin endpoints for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 *
 * All routes require authentication and coach/admin/owner/gestion role.
 */

import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { ReferralService } from "../referrals/service";
import { AuraService } from "../aura/service";
import { BookingService } from "../scheduling/booking-service";
import { NotificationService } from "../notifications/service";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../shared/errors";
import {
  assertTenant,
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { EmailService } from "../email";
import type {
  CreateMemberInput,
  CreateTrialMemberInput,
  ConvertFreemiumToTrialInput,
  UpdateMemberInput,
  MemberListParams,
} from "./types";
import {
  listMembersSchema,
  searchMembersSchema,
  getMemberSchema,
  deleteMemberSchema,
  createMemberSchema,
  createTrialMemberSchema,
  convertToTrialSchema,
  updateMemberSchema,
  resetMemberPasswordSchema,
  checkDniSchema,
  checkDuplicatesSchema,
  exportMembersSchema,
  exportSepaMembersSchema,
  uploadPhotoUrlSchema,
  listNotesSchema,
  createNoteSchema,
  assignReferrerSchema,
  updateNoteSchema,
  deleteNoteSchema,
  getMemberSessionLevelsSchema,
} from "./schemas";
import { Workbook } from "exceljs";

import {
  ADMIN_ROLES,
  MEMBER_ROLES,
  FINANCE_READ_ROLES,
  MEMBER_LIFECYCLE_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import {
  requireBranchAccess,
  BRANCH_OUT_OF_SCOPE,
} from "../shared/branch-access";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../finance";
import { EnrollmentService } from "../programs/enrollment-service";
import {
  financialHistorySchema,
  outstandingConceptsSchema,
} from "../finance/schemas";
import { handleServiceError } from "../shared/error-handler";
import { isDuplicateKeyError } from "../shared/sql-errors";

export const memberRoutes: FastifyPluginAsync = async (fastify) => {
  const memberService = new MemberService(fastify.db, fastify.log);
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const cashRegisterService = new CashRegisterService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
    cashRegisterService,
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

  // GET /admin/members/branches — list active branches, filtered by request.scope.
  //
  // Phase 110 D-07/D-08/D-09:
  //   - owner: with ?country=AR|ES filters; without ?country= sees all (real + virtual).
  //   - admin/gestion: only sedes whose country matches scope.country (+ virtual).
  //   - coach/recepcion: only sedes in scope.branchIds (+ virtual).
  // Virtual sedes (e.g. Templo Online) are always included so members assigned to
  // them stay reachable. Response shape { branches: [{ id, name, country,
  // isVirtual, timezone }] } — frontend selectors auto-receive the filtered list
  // (REQ-12). `timezone` backs the per-row "today" of the Vencimiento pill in the
  // all-branches Alumnos list.
  fastify.get("/branches", async (request) => {
    // 173-20 (T-173-20-01): `tenantWhere` inline. Esta query alimenta el
    // selector de sedes de TODA la UI de socios — sin filtro, el staff de un
    // gimnasio ve (y puede elegir) sedes del otro, la puerta de entrada
    // directa a la divergencia de anclas que ADO-07 protege.
    const ctx = assertTenant(request.scope, "members.branches");
    const allRows = await fastify.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        country: schema.branches.country,
        isVirtual: schema.branches.isVirtual,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.isActive, true),
        ),
      )
      .orderBy(schema.branches.name);

    const { isOwner, country, branchIds, role } = request.scope;
    let filtered = allRows;

    if (isOwner) {
      // D-08: owner with ?country= filters; without ?country= sees all (real + virtual).
      // attachCountryScope already reflects ?country=AR|ES into scope.country for
      // owners, but to support "no toggle = see all" we check the raw query param.
      const q = (request.query as Record<string, unknown> | undefined)?.country;
      if (q === "AR" || q === "ES") {
        filtered = allRows.filter((b) => b.isVirtual || b.country === country);
      }
      // else: owner without ?country= → keep allRows
    } else if (role === "admin" || role === "gestion") {
      // When scope.country is null (data-corruption fail-closed), this filter
      // degenerates to virtual-only — consistent with canAccessBranch Rule 3
      // which evaluates `country !== null && branch.country === country`.
      filtered = allRows.filter((b) => b.isVirtual || b.country === country);
    } else if (role === "coach" || role === "recepcion") {
      const allowed = new Set(branchIds);
      filtered = allRows.filter((b) => b.isVirtual || allowed.has(b.id));
    }
    // member: leave allRows. Module guard restricts to MEMBER_ROLES (which here
    // includes coach/admin/owner/gestion/recepcion), so this branch is unreachable
    // in practice — kept as defensive default.

    return {
      // country expuesto para que el admin gatee la UI de domiciliación
      // bancaria (sección SEPA + export) por sucursal de España.
      // timezone: el admin resuelve "hoy" por fila con la TZ de la sede en la
      // pill de Vencimiento. Es el ÚNICO lugar que lo expone — omitirlo acá no
      // rompe tipos (BranchOption lo tiene opcional) ni falla en runtime: el
      // mapa de TZ del admin queda vacío y toda fila cae al default argentino,
      // en silencio. Solo lo agarra el test de branch-access.
      branches: filtered.map(({ id, name, isVirtual, country, timezone }) => ({
        id,
        name,
        isVirtual: !!isVirtual,
        country,
        timezone,
      })),
    };
  });

  // =========================================================================
  // DNI Check (must be defined BEFORE :userId param routes)
  // =========================================================================

  // GET /admin/members/check-dni?dni=X&excludeUserId=Y
  fastify.get<{
    Querystring: { dni: string; excludeUserId?: number };
  }>("/check-dni", { schema: checkDniSchema }, async (request) => {
    const ctx = assertTenant(request.scope, "members.checkDni");
    const { dni, excludeUserId } = request.query;
    return memberService.checkDniUniqueness(ctx, dni, excludeUserId);
  });

  // GET /admin/members/check-duplicates?dni=X&phone=Y
  //
  // Phase 111 Plan 04 (REQ-4). Returns the union of users matching the
  // exact DNI OR a phone-normalized last-10 expression, excluding
  // soft-deleted rows. Both querystring fields are optional at the schema
  // level; the handler enforces "at least one" with a structured 400
  // (Phase 110 D-05 error shape) so the admin frontend can match by code.
  // Auth: inherits the module-level MEMBER_ROLES guard at line 110.
  fastify.get<{
    Querystring: { dni?: string; phone?: string };
  }>(
    "/check-duplicates",
    { schema: checkDuplicatesSchema },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.checkDuplicates");
      const { dni, phone } = request.query;
      if (!dni && !phone) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "Al menos uno de dni o phone es requerido",
          code: "MISSING_QUERY",
        });
      }
      return memberService.checkDuplicates(ctx, { dni, phone });
    },
  );

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
      // Phase 154 (ALUM-05): gate the "Nivel" column. Absent = true (default
      // includes the column, preserving the current behavior for any caller).
      includeGreekLevel?: boolean;
    };
  }>(
    "/export",
    {
      schema: exportMembersSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.export");
      // Country scope (Phase 98): always pass request.scope.country into the
      // service so /export mirrors the list endpoint. Non-owners cannot
      // override this (preHandler ignores their ?country=); owners get the
      // country they selected via the admin dropdown.
      const rows = await memberService.exportMembers(ctx, {
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

      // Phase 154 (ALUM-05): gate the greek-level column. undefined = true
      // (default includes it, backwards-compatible for any caller not passing
      // the param). exceljs ignores the row `nivel` key when no column declares
      // it, so the addRow loop below needs no change.
      const includeGreekLevel = request.query.includeGreekLevel !== false;

      sheet.columns = [
        { header: "Nombre", key: "nombre", width: 30 },
        { header: "Email", key: "email", width: 30 },
        { header: "DNI", key: "dni", width: 15 },
        { header: "Telefono", key: "telefono", width: 18 },
        { header: "Sucursal", key: "sucursal", width: 20 },
        ...(includeGreekLevel
          ? [{ header: "Nivel", key: "nivel", width: 12 }]
          : []),
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
    },
  );

  // GET /admin/members/export-sepa — Export mensual de domiciliación bancaria
  // (España) como .xlsx: socios de sedes ES con sus datos SEPA (deudor,
  // NIF/CIF, IBAN, dirección), para el archivo que se le pasa al banco.
  //
  // - Siempre acotado a branches.country='ES' (server-side, no bypasseable).
  // - Default status='activo' computado en vivo con activeMemberExists —
  //   nunca users.status (drift de fantasmas): al banco solo van cuotas vigentes.
  // - MEMBER_LIFECYCLE_ROLES (owner/admin/gestion): el IBAN es dato bancario
  //   sensible — coach/recepción no exportan. Además, admin/gestion deben
  //   tener scope de país España (un admin AR no ve cuentas bancarias ES).
  fastify.get<{
    Querystring: {
      branchId?: number;
      status?: "activo" | "todos";
    };
  }>(
    "/export-sepa",
    {
      schema: exportSepaMembersSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.exportSepa");
      if (
        !(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Solo owner, admin o gestión puede exportar domiciliación",
        });
      }
      if (!request.scope.isOwner && request.scope.country !== "ES") {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "La domiciliación bancaria es solo del ámbito España",
        });
      }

      const rows = await memberService.exportSepaMembers(ctx, {
        branchId: request.query.branchId,
        status: request.query.status,
      });

      const workbook = new Workbook();
      workbook.creator = "El Templo";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Domiciliación");

      sheet.columns = [
        { header: "Socio", key: "socio", width: 30 },
        { header: "Email", key: "email", width: 30 },
        { header: "Plan", key: "plan", width: 25 },
        { header: "Sucursal", key: "sucursal", width: 20 },
        { header: "Nombre del deudor", key: "deudor", width: 30 },
        { header: "NIF / CIF", key: "nif", width: 15 },
        { header: "IBAN", key: "iban", width: 30 },
        { header: "Direccion", key: "direccion", width: 35 },
        { header: "Codigo Postal", key: "codigoPostal", width: 14 },
        { header: "Poblacion", key: "poblacion", width: 20 },
        { header: "Pais", key: "pais", width: 8 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      for (const row of rows) {
        const added = sheet.addRow(row);
        // Marca visual: sin IBAN o sin deudor el banco rechaza la fila —
        // resaltarla evita que un socio activo quede sin debitar en el mes.
        if (!row.iban || !row.deudor) {
          added.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFE0E0" },
          };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const today = new Date().toISOString().split("T")[0];
      const filename = `domiciliacion-espana-${today}.xlsx`;

      return reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(Buffer.from(buffer as ArrayBuffer));
    },
  );

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
  }>(
    "/",
    {
      schema: listMembersSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request) => {
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
        // "Deuda total" aggregate is owner/admin-only financial data.
        includeTotalDebt: (ADMIN_ROLES as readonly string[]).includes(
          request.user.role,
        ),
        status,
        page,
        limit,
      };

      const result = await memberService.listMembers(
        assertTenant(request.scope, "members.list"),
        params,
      );
      return { ...result, page, limit };
    },
  );

  // GET /admin/members/search — Lightweight typeahead for scheduling dialogs.
  // Must be defined BEFORE the :userId param route so "/search" isn't captured
  // as a userId. Returns only id/name/dni (no listMembers enrichment) to keep
  // the autocomplete fast even on common substrings.
  fastify.get<{
    Querystring: {
      search: string;
      limit?: number;
    };
  }>("/search", { schema: searchMembersSchema }, async (request) => {
    const ctx = assertTenant(request.scope, "members.search");
    const { search, limit = 10 } = request.query;
    const members = await memberService.searchMembers(ctx, {
      search,
      country: request.scope.country ?? undefined,
      limit,
    });
    return { members };
  });

  // GET /admin/members/:userId — Get member profile
  fastify.get<{ Params: { userId: number } }>(
    "/:userId",
    { schema: getMemberSchema },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.get");
      const member = await memberService.getMemberById(
        ctx,
        request.params.userId,
      );
      if (!member) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      // Country-scope guard — non-owner staff cannot read other-country
      // members. Virtual branches (e.g. ONLINE) are exempt so self-registered
      // members stay reachable by staff of either country until a coach
      // reassigns them to their physical branch.
      //
      // Phase 110 Warning 2: this inline guard cannot be replaced by a
      // requireBranchAccess preHandler because the branchId is derived from
      // a DB row inside the handler (not from the request payload). The 403
      // body is harmonized to `{ error, message, code: BRANCH_OUT_OF_SCOPE }`
      // so the frontend can match by `code` consistently across preHandler-
      // gated and handler-gated routes. Note: sibling routes (DELETE /:userId,
      // financial-history, outstanding-concepts) intentionally return 404 for
      // info-leak prevention; here the plan explicitly requested 403 + code
      // to align with the new preHandler contract.
      // Owner bypass mirrors canAccessBranch Rule 2 — owners operate cross-country.
      if (!request.scope.isOwner && request.scope.country && member.branchId) {
        const [memberBranch] = await fastify.db
          .select({
            country: schema.branches.country,
            isVirtual: schema.branches.isVirtual,
          })
          .from(schema.branches)
          .where(
            and(
              tenantWhere(schema.branches, ctx),
              eq(schema.branches.id, member.branchId),
            ),
          )
          .limit(1);
        if (
          memberBranch &&
          !memberBranch.isVirtual &&
          memberBranch.country !== request.scope.country
        ) {
          request.log.warn(
            {
              userId: request.user?.userId,
              role: request.user?.role,
              branchId: member.branchId,
              scope: request.scope,
            },
            BRANCH_OUT_OF_SCOPE,
          );
          return reply.code(403).send({
            error: "Forbidden",
            message: "No tenés acceso a esta sede",
            code: BRANCH_OUT_OF_SCOPE,
          });
        }
      }

      // Fetch segment + onboarding + avatar data from member_profiles
      // (member_profiles es tabla strict del módulo — tenantWhere inline).
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
        .where(
          and(
            tenantWhere(memberProfiles, ctx),
            eq(memberProfiles.userId, request.params.userId),
          ),
        )
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
    {
      schema: createMemberSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.create");
      try {
        // Phase 157-03 (REF-03, D-08): validate the assisted-channel referrer
        // server-side — never trust the raw body id (Security V4/T-157-08). A
        // missing/invalid referrer is dropped gracefully (undefined) so the
        // alta still proceeds without attribution (UI-SPEC hard rule). The
        // brand-new member's id doesn't exist yet, so auto-referral (D-13) is
        // structurally impossible here; createMember guards it defensively.
        let referredBy: number | undefined = request.body.referredBy;
        if (referredBy !== undefined) {
          const [ref] = await fastify.db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
              and(
                tenantWhere(schema.users, ctx),
                eq(schema.users.id, referredBy),
                isNull(schema.users.deletedAt),
              ),
            )
            .limit(1);
          if (!ref) {
            request.log.warn(
              { referredBy },
              "referral: referrer inexistente en alta asistida, atribución omitida",
            );
            referredBy = undefined;
          }
        }

        const { member, tempPassword } = await memberService.createMember(ctx, {
          ...request.body,
          // createdBy from the JWT admin; referredBy is the validated value.
          createdBy: request.user.userId,
          referredBy,
        });

        // Auto-create subscription at base regular price when a plan was
        // selected. Plan is optional at creation: admin can assign it later
        // via "Gestionar Plan" which supports custom pricing (zero, credit
        // card, override + reason).
        if (request.body.planId !== undefined) {
          try {
            const auraService = new AuraService(fastify.db);
            const enrollmentService = new EnrollmentService(
              fastify.db,
              fastify.log,
            );
            const subscriptionService = new SubscriptionService(
              fastify.db,
              fastify.log,
              auraService,
              undefined,
              enrollmentService,
            );

            const today = new Date().toISOString().split("T")[0];
            await subscriptionService.assignPlan(
              ctx,
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
          (await memberService.getMemberById(ctx, member.id)) ?? member;
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

  // POST /admin/members/trial — Soft register a "sesión de prueba" lead
  // with only 4 fields (firstName, lastName, phone, branchId). Status set
  // to 'prueba'; email/DNI/etc. remain NULL until the lead converts via
  // the standard edit + assignPlan flow.
  fastify.post<{ Body: CreateTrialMemberInput }>(
    "/trial",
    {
      schema: createTrialMemberSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.createTrial");
      try {
        // Phase 114 D-31: createdBy comes from the JWT, never the request body.
        const { member } = await memberService.createTrialMember(ctx, {
          ...request.body,
          createdBy: request.user.userId,
        });
        return reply.code(201).send(member);
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          return reply.code(409).send({
            error: "Conflicto",
            message: err.message,
          });
        }
        request.log.error({ err }, "Error creating trial member");
        return reply.code(500).send({
          error: "Error del servidor",
          message: "Error al crear sesión de prueba",
        });
      }
    },
  );

  // POST /admin/members/:userId/convert-to-trial — Promote a self-registered
  // freemium member into a "sesión de prueba" lead (status='prueba'). This is
  // the freemium→prueba counterpart of the prueba→activo conversion that
  // assignPlan performs. branchId must be a PHYSICAL sede (validated in the
  // service) because the trial session that follows is presencial.
  //
  // requireBranchAccess gates the target branch against the admin's scope;
  // createdBy comes from the JWT (Phase 114 D-31 spoof-guard pattern), never
  // the request body.
  fastify.post<{
    Params: { userId: number };
    Body: ConvertFreemiumToTrialInput;
  }>(
    "/:userId/convert-to-trial",
    {
      schema: convertToTrialSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.convertToTrial");
      try {
        const member = await memberService.convertFreemiumToTrial(
          ctx,
          request.params.userId,
          {
            branchId: request.body.branchId,
            createdBy: request.user.userId,
            phone: request.body.phone,
          },
        );
        return reply.code(200).send(member);
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({
            error: "No encontrado",
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.code(409).send({
            error: "Conflicto",
            message: err.message,
          });
        }
        request.log.error({ err }, "Error converting freemium to trial");
        return reply.code(500).send({
          error: "Error del servidor",
          message: "Error al convertir a sesión de prueba",
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
  //
  // Online → presencial conversion: when branchId moves from a virtual branch
  // (e.g. ONLINE) to a physical one, the handler validates the presencial
  // required fields, cancels any active/paused subscription, and forces
  // status='inactivo' so the admin can immediately enroll the member in a
  // presencial plan (which will recompute status back to 'activo').
  //
  // SP → legajo conversion: when an alumno in status='prueba' (sesión de
  // prueba lead) gets its presencial-required fields filled in, the handler
  // promotes status to 'inactivo'. Otherwise the Suscripción tab in the
  // admin detail page stays hidden (it gates on status !== 'prueba'), the
  // "Gestionar Plan" button never appears, and the admin perceives the save
  // as silently lost.
  fastify.put<{
    Params: { userId: number };
    Body: UpdateMemberInput;
  }>(
    "/:userId",
    {
      schema: updateMemberSchema,
      preHandler: [
        requireBranchAccess({ from: "body.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.update");
      try {
        // Read current state up front. Needed by both the virtual→presencial
        // conversion detection AND the SP→legajo auto-promotion, so we hoist
        // the SELECT out of the branchId-only branch where it used to live.
        const [current] = await fastify.db
          .select({
            userId: schema.users.id,
            status: schema.users.status,
            dni: schema.users.dni,
            documentType: schema.users.documentType,
            dateOfBirth: schema.users.dateOfBirth,
            currentBranchId: schema.users.branchId,
            currentBranchIsVirtual: schema.branches.isVirtual,
          })
          .from(schema.users)
          .innerJoin(
            schema.branches,
            // El filtro de la tabla joineada va en el ON, también en el INNER.
            and(
              tenantWhere(schema.branches, ctx),
              eq(schema.branches.id, schema.users.branchId),
            ),
          )
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, request.params.userId),
            ),
          )
          .limit(1);

        if (!current) {
          return reply.code(404).send({
            error: "No encontrado",
            message: "Miembro no encontrado",
          });
        }

        // Detect online → presencial conversion before applying the update.
        let isConversion = false;

        if (
          request.body.branchId !== undefined &&
          current.currentBranchIsVirtual &&
          request.body.branchId !== current.currentBranchId
        ) {
          const [target] = await fastify.db
            .select({ isVirtual: schema.branches.isVirtual })
            .from(schema.branches)
            .where(
              and(
                tenantWhere(schema.branches, ctx),
                eq(schema.branches.id, request.body.branchId),
              ),
            )
            .limit(1);

          if (target && !target.isVirtual) {
            isConversion = true;

            // Validate the presencial required-field set against the
            // merged view of (incoming patch ⊕ current row). A field is
            // satisfied if the body sets it to a non-empty value OR the
            // user already has a non-empty value on the row.
            type Field = {
              key: "dni" | "documentType" | "dateOfBirth";
              label: string;
            };
            const required: Field[] = [
              { key: "dni", label: "DNI" },
              { key: "documentType", label: "Tipo de documento" },
              { key: "dateOfBirth", label: "Fecha de nacimiento" },
            ];

            const missing: string[] = [];
            for (const f of required) {
              const incoming = request.body[f.key];
              const existing = current[f.key];
              const value =
                incoming !== undefined ? incoming : (existing ?? null);
              if (value === null || value === "") missing.push(f.label);
            }

            if (missing.length > 0) {
              return reply.code(400).send({
                error: "Solicitud invalida",
                message: `Para convertir a presencial faltan datos: ${missing.join(", ")}`,
              });
            }
          }
        }

        const member = await memberService.updateMember(
          ctx,
          request.params.userId,
          request.body,
        );
        if (!member) {
          return reply
            .code(404)
            .send({ error: "No encontrado", message: "Miembro no encontrado" });
        }

        if (isConversion) {
          // Cancel any active/paused/scheduled subscription tied to the
          // virtual branch. SubscriptionService.cancelSubscription handles
          // recomputeUserStatus internally; if the user has no cancellable
          // sub (typical freemium), we force status='inactivo' ourselves —
          // recomputeUserStatus is a no-op when transitioning out of
          // freemium, so the manual write is required.
          const auraService = new AuraService(fastify.db);
          const enrollmentService = new EnrollmentService(
            fastify.db,
            request.log,
          );
          const subscriptionService = new SubscriptionService(
            fastify.db,
            request.log,
            auraService,
            undefined,
            enrollmentService,
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

          let cancelledExistingSub = false;
          try {
            // Phase 111: cancelSubscription now requires actorId — pass the
            // authenticated admin's userId so the audit_log row records the
            // real principal who triggered the conversion.
            await subscriptionService.cancelSubscription(
              ctx,
              request.params.userId,
              request.user.userId,
              "Conversión a presencial",
            );
            cancelledExistingSub = true;
          } catch (err) {
            if (!(err instanceof NotFoundError)) throw err;
          }

          if (!cancelledExistingSub) {
            // Phase 118-01 (D-02): admin-driven flip to 'inactivo' — record the
            // transition with source='admin'. UPDATE + history insert run in one
            // tx (read-before / write-after) so they roll back together. Dedupe
            // on from==to: only write a row when the status actually changed.
            const statusBefore = current.status;
            await fastify.db.transaction(async (tx) => {
              await tx
                .update(schema.users)
                .set({ status: "inactivo" })
                .where(
                  and(
                    tenantWhere(schema.users, ctx),
                    eq(schema.users.id, request.params.userId),
                  ),
                );

              if (statusBefore !== "inactivo") {
                await tx.insert(schema.userStatusHistory).values(
                  tenantValues(ctx, {
                    userId: request.params.userId,
                    fromStatus: statusBefore,
                    toStatus: "inactivo",
                    source: "admin",
                  }),
                );
                request.log.info(
                  {
                    userId: request.params.userId,
                    fromStatus: statusBefore,
                    toStatus: "inactivo",
                  },
                  "user status transition recorded",
                );
              }
            });
          }

          request.log.info(
            {
              userId: request.params.userId,
              convertedBy: request.user.userId,
              cancelledExistingSub,
            },
            "Member converted from online to presencial",
          );

          // Re-read so the response reflects status='inactivo' and any
          // side-effects from cancelSubscription.
          const refreshed = await memberService.getMemberById(
            ctx,
            request.params.userId,
          );
          if (refreshed) return refreshed;
        } else if (current.status === "prueba") {
          // SP → legajo auto-promotion. Compute the merged view (incoming
          // patch ⊕ existing row) for the presencial-required fields. If
          // they're all filled in, flip status to 'inactivo' so the
          // Suscripción tab unlocks and the admin can assign a plan.
          // recomputeUserStatus will then move 'inactivo' → 'activo' when
          // the plan is actually assigned.
          const mergedDni =
            request.body.dni !== undefined ? request.body.dni : current.dni;
          const mergedDocType =
            request.body.documentType !== undefined
              ? request.body.documentType
              : current.documentType;
          const mergedDob =
            request.body.dateOfBirth !== undefined
              ? request.body.dateOfBirth
              : current.dateOfBirth;

          const hasAll =
            mergedDni !== null &&
            mergedDni !== "" &&
            mergedDocType !== null &&
            mergedDocType !== "" &&
            mergedDob !== null &&
            mergedDob !== "";

          if (hasAll) {
            // Phase 118-01 (D-02): SP (prueba) → legajo (inactivo) is an
            // admin-driven flip. This branch only runs when current.status is
            // 'prueba', so the transition always changes the status — no dedupe
            // branch is needed (TS proves 'prueba' !== 'inactivo'). UPDATE +
            // history insert in one tx (read-before / write-after).
            const statusBefore = current.status;
            await fastify.db.transaction(async (tx) => {
              await tx
                .update(schema.users)
                .set({ status: "inactivo" })
                .where(
                  and(
                    tenantWhere(schema.users, ctx),
                    eq(schema.users.id, request.params.userId),
                  ),
                );

              await tx.insert(schema.userStatusHistory).values(
                tenantValues(ctx, {
                  userId: request.params.userId,
                  fromStatus: statusBefore,
                  toStatus: "inactivo",
                  source: "admin",
                }),
              );
              request.log.info(
                {
                  userId: request.params.userId,
                  fromStatus: statusBefore,
                  toStatus: "inactivo",
                },
                "user status transition recorded",
              );
            });

            request.log.info(
              {
                userId: request.params.userId,
                promotedBy: request.user.userId,
              },
              "SP lead promoted to legajo (status='inactivo')",
            );

            const refreshed = await memberService.getMemberById(
              ctx,
              request.params.userId,
            );
            if (refreshed) return refreshed;
          }
        }

        return member;
      } catch (err: unknown) {
        if (err instanceof ConflictError) {
          return reply
            .code(409)
            .send({ error: "Conflicto", message: err.message });
        }

        // IBAN inválido (domiciliación SEPA) — el service valida mod-97 antes
        // de tocar users, por eso llega como BadRequestError limpio.
        if (err instanceof BadRequestError) {
          return reply
            .code(400)
            .send({ error: "Solicitud invalida", message: err.message });
        }

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
    },
  );

  // DELETE /admin/members/:userId — Soft-delete a member.
  //
  // Scrubs email + DNI so the person can be re-onboarded with their real
  // identifiers, and sets deletedAt so the row drops out of admin lists and
  // single-member reads. Financial history (financial_transactions,
  // subscriptions) stays intact. MEMBER_LIFECYCLE_ROLES only — coaches and
  // recepción cannot delete. Refuses to delete non-members (coach/admin/owner
  // rows) as a safety net.
  fastify.delete<{ Params: { userId: number } }>(
    "/:userId",
    { schema: deleteMemberSchema },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.delete");
      if (
        !(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Solo owner, admin o gestión puede eliminar alumnos",
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
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, schema.users.branchId),
          ),
        )
        .where(
          and(
            tenantWhere(schema.users, ctx),
            eq(schema.users.id, request.params.userId),
          ),
        )
        .limit(1);

      if (!target || target.deletedAt) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      if (
        !request.scope.isOwner &&
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
      const enrollmentService = new EnrollmentService(fastify.db, request.log);
      const subscriptionService = new SubscriptionService(
        fastify.db,
        request.log,
        auraService,
        undefined,
        enrollmentService,
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
        // Phase 111: cancelSubscription now requires actorId — pass the
        // authenticated principal so the audit_log row records who triggered
        // the soft-delete cascade (T-111-15 mitigation).
        await subscriptionService.cancelSubscription(
          ctx,
          request.params.userId,
          request.user.userId,
          "Cancelado por eliminación del alumno",
        );
      } catch (err: unknown) {
        // Members with no active/paused subscription hit NotFoundError —
        // that is expected, keep going.
        if (err instanceof NotFoundError) {
          // proceed
        } else if (err instanceof Error) {
          // Phase 111 REQ-3: cancelSubscription refuses when there are
          // non-voided charge transactions linked to the sub. The structured
          // error body is JSON-encoded inside BadRequestError.message — unwrap
          // it and surface code='SUB_HAS_ACTIVE_TRANSACTIONS' so the admin
          // frontend can render an actionable message ("anular en Detalle
          // Financiero y reintentar"). Any other error is unexpected.
          try {
            const parsed = JSON.parse(err.message) as {
              code?: string;
              message?: string;
              details?: unknown;
            };
            if (parsed && parsed.code === "SUB_HAS_ACTIVE_TRANSACTIONS") {
              request.log.warn(
                {
                  userId: request.params.userId,
                  actorId: request.user.userId,
                  details: parsed.details,
                },
                "SUB_HAS_ACTIVE_TRANSACTIONS",
              );
              return reply.code(400).send({
                error: "Bad Request",
                message: parsed.message,
                code: parsed.code,
                details: parsed.details,
              });
            }
          } catch {
            // Not a JSON-encoded structured error — fall through to rethrow.
          }
          throw err;
        } else {
          throw err;
        }
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
            tenantWhere(schema.bookings, ctx),
            eq(schema.bookings.memberId, request.params.userId),
            sql`${schema.bookings.bookingDate} >= ${today}`,
            inArray(schema.bookings.status, ["reservado", "lista_espera"]),
          ),
        );

      const result = await memberService.softDeleteMember(
        ctx,
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

  // PUT /admin/members/:userId/password — Reset a member's password to the
  // shared temp password ("eltemplo2026"). Operational use case: members
  // forget their password and Mica/Fer need to unblock them without going
  // through the self-serve forgot-password flow. MEMBER_LIFECYCLE_ROLES only.
  fastify.put<{ Params: { userId: number } }>(
    "/:userId/password",
    { schema: resetMemberPasswordSchema },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.password");
      if (
        !(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(
          request.user.role,
        )
      ) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Solo owner, admin o gestión puede resetear contraseñas",
        });
      }

      // Cross-country guard mirrors DELETE: read the row + branch country
      // and 404 anything outside the actor's scope so nothing leaks.
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
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, schema.users.branchId),
          ),
        )
        .where(
          and(
            tenantWhere(schema.users, ctx),
            eq(schema.users.id, request.params.userId),
          ),
        )
        .limit(1);

      if (!target || target.deletedAt) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      if (
        !request.scope.isOwner &&
        request.scope.country &&
        !target.branchIsVirtual &&
        target.branchCountry !== request.scope.country
      ) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      const result = await memberService.resetMemberPassword(
        ctx,
        request.params.userId,
      );

      if (!result.ok) {
        if (result.reason === "not_member") {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: "Solo se puede resetear la contraseña de alumnos",
          });
        }
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
      }

      request.log.info(
        { userId: request.params.userId, resetBy: request.user.userId },
        "Member password reset to temp password",
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
      const ctx = assertTenant(request.scope, "members.photo");
      if (!fastify.r2) {
        return reply.code(503).send({
          error: "Servicio no disponible",
          message: "Almacenamiento de imagenes no configurado",
        });
      }

      // Fase 173-27 (T-173-27-06, D-06): sin este chequeo, la ruta generaba
      // una URL prefirmada de R2 para CUALQUIER userId, incluido uno de otro
      // gimnasio — `updatePhoto` ya filtraba el UPDATE con `tenantWhere`
      // (no-op para un socio ajeno), pero la URL en sí se generaba igual.
      // Mismo contrato que el resto de la ficha: socio ajeno = inexistente.
      const [target] = await fastify.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx),
            eq(schema.users.id, request.params.userId),
            isNull(schema.users.deletedAt),
          ),
        )
        .limit(1);
      if (!target) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Miembro no encontrado" });
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
      await memberService.updatePhoto(ctx, request.params.userId, publicUrl);

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
      const ctx = assertTenant(request.scope, "members.sessionLevels");
      const { userId } = request.params;
      // Defense-in-depth clamp (schema already validates [1, 365] with default 30)
      const days = Math.max(1, Math.min(365, request.query.days ?? 30));
      const counts = await memberService.getSessionLevelCounts(
        ctx,
        userId,
        days,
      );
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
      // Hoisteado (antes vivía inline recién al llamar al service): esta
      // misma query directa de abajo (target) también necesita ctx.
      const ctx = assertTenant(request.scope, "members.financial-history");
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
            and(
              tenantWhere(schema.branches, ctx),
              eq(schema.branches.id, schema.users.branchId),
            ),
          )
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, request.params.userId),
            ),
          )
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
          ctx,
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
      // Hoisteado por la misma razón que financial-history: el target de
      // abajo también necesita ctx.
      const ctx = assertTenant(request.scope, "members.outstanding-concepts");
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
            and(
              tenantWhere(schema.branches, ctx),
              eq(schema.branches.id, schema.users.branchId),
            ),
          )
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, request.params.userId),
            ),
          )
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
          ctx,
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
      const ctx = assertTenant(request.scope, "members.notes");
      const notes = await memberService.getNotes(ctx, request.params.userId);
      return { notes };
    },
  );

  /**
   * Guard compartido de las dos rutas de referidos de la ficha (GET y POST).
   *
   * Existe para no tener la misma verificación escrita dos veces: rol
   * (MEMBER_LIFECYCLE_ROLES — coach y recepción no ven referidos ajenos, T-158-02
   * WR-05), id parseable, socio existente y —para no-owners— país del scope.
   * Lanza en vez de responder, así el `handleServiceError` de cada ruta arma el
   * shape; los códigos son idénticos a los que devolvía el GET inline.
   *
   * El cross-country responde 404 y no 403 a propósito (mirror del patrón de
   * DELETE /:userId): un 403 confirmaría que el id existe en otro país.
   *
   * 173-20 (trampa (c)): esta closure vive en el cuerpo del plugin y no tiene
   * `request.scope` resuelto a `TenantContext` por sí sola — recibe `ctx`
   * como PRIMER parámetro, y cada call site le pasa el que su handler ya
   * resolvió con `assertTenant`.
   */
  async function assertReferralTargetInScope(
    ctx: TenantContext,
    request: FastifyRequest<{ Params: { userId: number } }>,
  ): Promise<number> {
    const { role } = request.user;
    if (!(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(role)) {
      throw new ForbiddenError("No tienes permiso para ver los referidos");
    }
    const targetId = Number(request.params.userId);
    if (!Number.isInteger(targetId)) {
      throw new ValidationError("id inválido");
    }

    // T-106-02 — verify target member exists and (for non-owners) lives in a
    // branch that matches the request's country scope.
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
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.users.branchId),
        ),
      )
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, targetId)))
      .limit(1);

    if (!target || target.deletedAt) {
      throw new NotFoundError("Miembro no encontrado");
    }
    if (
      !request.scope.isOwner &&
      !target.branchIsVirtual &&
      target.branchCountry !== request.scope.country
    ) {
      throw new NotFoundError("Miembro no encontrado");
    }
    return targetId;
  }

  // GET /admin/members/:userId/referrals — Referral overview de la ficha del
  // alumno (fase 158, D-34). Gestión consulta quién lo trajo y a quiénes trajo
  // con el MISMO estado derivado (deriveCoveredUntil) que la app.
  fastify.get<{ Params: { userId: number } }>(
    "/:userId/referrals",
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.referrals");
      try {
        const targetId = await assertReferralTargetInScope(ctx, request);
        const referralService = new ReferralService(fastify.db, fastify.log);
        return await referralService.getReferralOverview(ctx, targetId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get member referrals");
      }
    },
  );

  // POST /admin/members/:userId/referrals — Atribución RETROACTIVA de referidor
  // sobre un socio ya creado (fase 173).
  //
  // El canal asistido de la 157 solo atribuye dentro del alta, y en la operación
  // real el dato llega después: entre el deploy de la 157 (2026-07-14) y el
  // 2026-08-04 hubo 352 altas y CERO vínculos `assisted`. Esta ruta es la única
  // forma de cargar el vínculo sin tocar la base a mano.
  //
  // Mismo guard que el GET (incluido MEMBER_LIFECYCLE_ROLES: recepción carga el
  // alta pero no atribuye referidos — la decisión de a quién se le acredita un
  // descuento es de gestión). El `referrerId` se valida SIEMPRE server-side, y a
  // diferencia del alta no degrada en silencio: acá la atribución es la
  // operación, un referidor inválido tiene que fallar visible.
  fastify.post<{ Params: { userId: number }; Body: { referrerId: number } }>(
    "/:userId/referrals",
    { schema: assignReferrerSchema },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.referrals");
      try {
        const targetId = await assertReferralTargetInScope(ctx, request);
        const referralService = new ReferralService(fastify.db, fastify.log);
        const result = await referralService.assignReferrerToMember({
          referredId: targetId,
          referrerId: request.body.referrerId,
          createdBy: request.user.userId,
          // El gimnasio SIEMPRE sale del scope del request, nunca del body
          // (mass-assignment, T-169-02). Un scope no resoluble es DENY.
          tenantId: ctx.tenantId,
        });
        return reply.code(201).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "assign member referrer");
      }
    },
  );

  // POST /admin/members/:userId/notes — Create note
  fastify.post<{ Params: { userId: number }; Body: { content: string } }>(
    "/:userId/notes",
    { schema: createNoteSchema },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "members.notes");
      const note = await memberService.createNote(ctx, request.user.userId, {
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
      const ctx = assertTenant(request.scope, "members.notes");
      const { noteId } = request.params;

      // Fetch note to check authorization
      const notes = await memberService.getNotes(ctx, request.params.userId);
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

      const updated = await memberService.updateNote(ctx, noteId, {
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
      const ctx = assertTenant(request.scope, "members.notes");
      const { noteId } = request.params;

      // Fetch note to check authorization
      const notes = await memberService.getNotes(ctx, request.params.userId);
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

      await memberService.deleteNote(ctx, noteId);
      return { success: true };
    },
  );
};
