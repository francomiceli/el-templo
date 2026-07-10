import { FastifyPluginAsync } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import argon2 from "argon2";
import { users } from "../../db/schema/users";
import { branches } from "../../db/schema/branches";
import { memberProfiles } from "../../db/schema/member-profiles";
import { promoPlans } from "../../db/schema/promo-plans";
import { referrals } from "../../db/schema/referrals";
import { ReferralService } from "../referrals/service";
import { registerSchema, loginSchema } from "./schemas";
import { SegmentationService } from "../segmentation/service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../finance";
import { EnrollmentService } from "../programs/enrollment-service";
import { normalizePhone } from "../shared";
import {
  RefreshTokenService,
  RefreshTokenError,
} from "./refresh-token-service";

interface RegisterBody {
  email: string;
  password: string;
  branchId?: number;
  firstName: string;
  lastName: string;
  dni?: string;
  phone?: string;
  gender: "male" | "female" | "other" | "unspecified";
  promoCode?: string;
  // Phase 157-03 (REF-02, D-08): self-service referral code from ?ref=CODE.
  ref?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /register
  fastify.post<{ Body: RegisterBody }>(
    "/register",
    { schema: registerSchema },
    async (request, reply) => {
      const {
        email,
        password,
        branchId: requestedBranchId,
        firstName,
        lastName,
        dni,
        phone,
        gender,
        promoCode,
        ref,
      } = request.body;

      // Reject if email already exists
      const [existingByEmail] = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingByEmail) {
        return reply.code(409).send({
          error: "Email en uso",
          message:
            "Ya existe una cuenta con este email. Intentá iniciar sesión.",
        });
      }

      // Reject if DNI already exists
      if (dni) {
        const [existingByDni] = await fastify.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.dni, dni))
          .limit(1);

        if (existingByDni) {
          return reply.code(409).send({
            error: "DNI en uso",
            message:
              "Ya existe una cuenta con este DNI. Intentá iniciar sesión.",
          });
        }
      }

      // Phase 111 Plan 04 (REQ-5, D-08): block autorregistro when the
      // submitted phone matches any non-deleted user (virtual or
      // presencial). Phone is normalized via the shared helper before the
      // SQL expression strips formatting from the stored value (last-10
      // digits — AR mobile convention). Structured 4xx body per Phase 110
      // D-05; logged at warn level (Phase 110 D-06) with normalized last-10
      // (NOT raw phone — PII minimization, T-111-22 mitigation).
      if (phone) {
        const normalized = normalizePhone(phone);
        if (normalized.length > 0) {
          const [existingByPhone] = await fastify.db
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                sql`RIGHT(REGEXP_REPLACE(${users.phone}, '[^0-9]', ''), 10) = ${normalized}`,
                isNull(users.deletedAt),
              ),
            )
            .limit(1);
          if (existingByPhone) {
            request.log.warn(
              {
                phoneNormalized: normalized,
                existingUserId: existingByPhone.id,
              },
              "PHONE_ALREADY_REGISTERED",
            );
            return reply.code(409).send({
              error: "Conflict",
              message:
                "Esta persona ya tiene cuenta. Iniciá sesión o contactanos.",
              code: "PHONE_ALREADY_REGISTERED",
            });
          }
        }
      }

      // Resolve branch: use provided branchId or default to ONLINE
      let branchId: number;
      if (requestedBranchId) {
        const branch = await fastify.db
          .select({ id: branches.id })
          .from(branches)
          .where(eq(branches.id, requestedBranchId))
          .limit(1);

        if (branch.length === 0) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: "Sucursal invalida",
          });
        }
        branchId = requestedBranchId;
      } else {
        const defaultBranch = await fastify.db
          .select({ id: branches.id })
          .from(branches)
          .where(eq(branches.code, "ONLINE"))
          .limit(1);

        if (defaultBranch.length === 0) {
          return reply.code(500).send({
            error: "Error del servidor",
            message: "Sucursal predeterminada no configurada",
          });
        }
        branchId = defaultBranch[0].id;
      }

      // Hash password and create user
      const passwordHash = await argon2.hash(password);

      // Phase 111 Plan 04 (REQ-9, D-26): trim firstName/lastName at the
      // service entry point before persistence. Mirrors the createMember /
      // updateMember trim from Plan 01 — closes the Soledad Mailland
      // trailing-space bug class for the autorregistro path.
      const firstNameTrimmed = firstName.trim();
      const lastNameTrimmed = lastName.trim();

      const result = await fastify.db.insert(users).values({
        email,
        passwordHash,
        branchId,
        firstName: firstNameTrimmed,
        lastName: lastNameTrimmed,
        dni,
        phone,
        gender,
        role: "member",
        // Phase 130 (KAIROS-04, D-01): new self-registered members are born
        // kairos. Server-assigned — never read from the request body, so a
        // member cannot self-promote (T-130-01).
        level: "kairos",
        // Phase 103-03 (R7, D-12, D-13): online self-register starts as freemium.
        // If a valid promoCode follows, assignPlan → recomputeUserStatus flips
        // it to 'activo' inside the same transaction (Plan 02 wiring).
        status: "freemium" as const,
      });

      const userId = Number(result[0].insertId);

      // Promo code auto-assignment (per D-09, D-10)
      let promoApplied = false;
      if (promoCode) {
        try {
          // Look up promo plan
          const [promo] = await fastify.db
            .select()
            .from(promoPlans)
            .where(eq(promoPlans.promoCode, promoCode))
            .limit(1);

          if (promo && promo.isActive) {
            const now = new Date();
            // Check validity window
            if (now >= promo.startDate && now <= promo.expiryDate) {
              // Auto-assign the subscription plan linked to this promo
              // NOTE: Cross-module service instantiation is consistent with existing
              // pattern in this file (SegmentationService is already instantiated
              // the same way in /me). All three services export their classes.
              const auraService = new AuraService(fastify.db);
              const balanceService = new BalanceService(
                fastify.db,
                fastify.log,
              );
              const cashRegisterService = new CashRegisterService(
                fastify.db,
                fastify.log,
              );
              const transactionService = new TransactionService(
                fastify.db,
                fastify.log,
                balanceService,
                cashRegisterService,
              );
              const enrollmentService = new EnrollmentService(
                fastify.db,
                fastify.log,
              );
              const subscriptionService = new SubscriptionService(
                fastify.db,
                request.log,
                auraService,
                transactionService,
                enrollmentService,
              );

              const today = new Date().toISOString().split("T")[0];
              await subscriptionService.assignPlan(
                userId,
                {
                  planId: promo.subscriptionPlanId,
                  branchId,
                  startDate: today,
                  priceTypeApplied: "zero",
                  paymentMethod: "cash", // neutral value; pricePaid=0 skips payment recording
                },
                userId, // self-assignment
              );

              // Increment redemption count
              await fastify.db
                .update(promoPlans)
                .set({
                  redemptionCount: sql`${promoPlans.redemptionCount} + 1`,
                })
                .where(eq(promoPlans.id, promo.id));

              promoApplied = true;
            }
          }
        } catch (err: unknown) {
          // Graceful degradation: registration succeeds even if promo fails
          request.log.error(
            {
              err: err instanceof Error ? err.message : String(err),
              promoCode,
            },
            "Promo code assignment failed (graceful degradation)",
          );
        }
      }

      // Phase 157-03 (milestone v5.5): referral attribution + eager code.
      // Two independent best-effort blocks — neither can block the signup
      // (graceful degradation, T-157-11 / UI-SPEC hard rule).
      const referralService = new ReferralService(fastify.db, request.log);

      // (1) Self-service attribution (REF-02, D-08). The referrer is resolved
      // server-side from the code — never taken raw from the body (Security
      // V4/T-157-08). Auto-referral (referrerId===userId, D-13) and a second
      // claim on an already-referred user (UNIQUE referred_id, D-14) are both
      // silently skipped/swallowed: the registration still succeeds.
      if (ref) {
        try {
          const referrerId = await referralService.resolveReferralCode(ref);
          if (referrerId !== null && referrerId !== userId) {
            await fastify.db
              .update(users)
              .set({ referredBy: referrerId })
              .where(eq(users.id, userId));
            await fastify.db.insert(referrals).values({
              referrerId,
              referredId: userId,
              status: "pending",
              attributionChannel: "self_service",
            });
          }
        } catch (err: unknown) {
          request.log.warn(
            {
              err: err instanceof Error ? err.message : String(err),
              ref,
              userId,
            },
            "Referral attribution failed (graceful degradation)",
          );
        }
      }

      // (2) Eager generation of the new member's OWN referral code (REF-01,
      // D-25) so they can share from minute zero — independent of ?ref. An
      // irrecoverable UNIQUE collision after retries leaves referral_code NULL
      // (the backfill covers it) and NEVER blocks the signup.
      try {
        await referralService.generateReferralCode(userId);
      } catch (err: unknown) {
        request.log.warn(
          { err: err instanceof Error ? err.message : String(err), userId },
          "Eager referral code generation failed (graceful degradation)",
        );
      }

      // Get branch info for response
      const [branchRow] = await fastify.db
        .select({
          name: branches.name,
          isVirtual: branches.isVirtual,
          country: branches.country,
        })
        .from(branches)
        .where(eq(branches.id, branchId))
        .limit(1);

      // Sign JWT (legacy 7d token kept for backwards-compat — Req 7)
      const payload = { userId, email, role: "member" };
      const token = fastify.jwt.sign(payload);
      // New short-lived access (30m) + opaque refresh (30d sliding)
      const accessToken = fastify.jwt.sign(payload, {
        expiresIn: fastify.accessTokenExpiresIn,
      });
      const refreshTokenService = new RefreshTokenService(
        fastify.db,
        request.log,
      );
      const refreshToken = await refreshTokenService.issue(userId);

      return {
        token,
        accessToken,
        refreshToken,
        user: {
          id: userId,
          email,
          firstName: firstNameTrimmed,
          lastName: lastNameTrimmed,
          role: "member",
          // Phase 130 (KAIROS-04, D-01): echo must match the row written above.
          level: "kairos",
          branchId,
          branchName: branchRow?.name ?? "",
          branchIsVirtual: branchRow?.isVirtual ?? false,
          branchCountry: branchRow?.country ?? "AR",
        },
        promoApplied,
      };
    },
  );

  // POST /login
  fastify.post<{ Body: LoginBody }>(
    "/login",
    { schema: loginSchema },
    async (request, reply) => {
      const { email, password } = request.body;

      // Find user by email
      const userResults = await fastify.db
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          level: users.level,
          branchId: users.branchId,
          gender: users.gender,
          dateOfBirth: users.dateOfBirth,
          deletedAt: users.deletedAt,
          // Phase 103 R12: needed for the staff_disabled login gate below.
          // Intentionally NOT projected by /me (no consumer there) to avoid
          // dead surface area in the auth response payload.
          staffDisabled: users.staffDisabled,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (userResults.length === 0) {
        return reply
          .code(401)
          .send({ error: "No autorizado", message: "Credenciales invalidas" });
      }

      const user = userResults[0];

      if (user.deletedAt) {
        return reply.code(401).send({
          error: "No autorizado",
          message: "Esta cuenta fue eliminada",
        });
      }

      // Verify password
      const validPassword = await argon2.verify(user.passwordHash, password);
      if (!validPassword) {
        return reply
          .code(401)
          .send({ error: "No autorizado", message: "Credenciales invalidas" });
      }

      // NEW gate (Phase 103 R12): closes pre-existing loophole where staff with
      // the legacy is_active=false could still log in (the column existed but
      // login never enforced it). After the staff_disabled split, only
      // non-member roles are subject to this disable check; members use
      // status/deleted_at instead.
      if (user.role !== "member" && user.staffDisabled === true) {
        return reply.code(401).send({
          error: "No autorizado",
          message: "Cuenta desactivada",
        });
      }

      // Get branch name and virtual status
      const branchResults = await fastify.db
        .select({
          name: branches.name,
          isVirtual: branches.isVirtual,
          country: branches.country,
        })
        .from(branches)
        .where(eq(branches.id, user.branchId))
        .limit(1);

      const branchName = branchResults[0]?.name || null;
      const branchIsVirtual = branchResults[0]?.isVirtual ?? false;
      const branchCountry = branchResults[0]?.country ?? "AR";

      // Check onboarding status
      const profileRows = await fastify.db
        .select({
          completedAt: memberProfiles.onboardingCompletedAt,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, user.id))
        .limit(1);
      const onboardingCompleted =
        profileRows.length > 0 && profileRows[0].completedAt !== null;

      // Sign JWT (legacy 7d token kept for backwards-compat — Req 7)
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
      const token = fastify.jwt.sign(payload);
      // New short-lived access (30m) + opaque refresh (30d sliding)
      const accessToken = fastify.jwt.sign(payload, {
        expiresIn: fastify.accessTokenExpiresIn,
      });
      const refreshTokenService = new RefreshTokenService(
        fastify.db,
        request.log,
      );
      const refreshToken = await refreshTokenService.issue(user.id);

      return {
        token,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          level: user.level,
          branchId: user.branchId,
          branchName,
          branchIsVirtual,
          branchCountry,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          onboardingCompleted,
        },
      };
    },
  );

  // POST /refresh (public, body-based — D-04)
  // Canjea un refresh token valido por un par nuevo (access JWT 30m +
  // refresh rotado). rotate() revoca el viejo y, en caso de reuse, revoca la
  // familia completa del user devolviendo 401 (delegado al servicio).
  fastify.post<{ Body: { refreshToken: string } }>(
    "/refresh",
    {
      schema: {
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      const refreshTokenService = new RefreshTokenService(
        fastify.db,
        request.log,
      );

      let rotated: { newToken: string; userId: number };
      try {
        rotated = await refreshTokenService.rotate(refreshToken);
      } catch (err: unknown) {
        if (err instanceof RefreshTokenError) {
          request.log.warn(
            { code: err.code },
            "Refresh fallido: token invalido/revocado/reusado",
          );
          return reply
            .code(401)
            .send({ error: "No autorizado", message: "Refresh invalido" });
        }
        throw err;
      }

      // rotate() solo devuelve userId. Consultamos users para armar el payload
      // del access JWT (mismo patron que GET /me).
      const [u] = await fastify.db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, rotated.userId))
        .limit(1);

      // Caso defensivo: refresh huerfano (user inexistente). No deberia
      // ocurrir por el FK CASCADE, pero si pasa respondemos 401 + warn.
      if (!u) {
        request.log.warn(
          { userId: rotated.userId },
          "Refresh con userId sin user asociado (huerfano)",
        );
        return reply
          .code(401)
          .send({ error: "No autorizado", message: "Refresh invalido" });
      }

      const accessToken = fastify.jwt.sign(
        { userId: u.id, email: u.email, role: u.role },
        { expiresIn: fastify.accessTokenExpiresIn },
      );

      return { accessToken, refreshToken: rotated.newToken };
    },
  );

  // POST /logout (public, body-based, idempotente — D-04)
  // Revoca el refresh del body. Siempre 200 aunque el token ya este
  // revocado/inexistente (no leak de si existia o no).
  fastify.post<{ Body: { refreshToken: string } }>(
    "/logout",
    {
      schema: {
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { refreshToken } = request.body;
      const refreshTokenService = new RefreshTokenService(
        fastify.db,
        request.log,
      );
      await refreshTokenService.revoke(refreshToken);
      return { message: "Sesion cerrada" };
    },
  );

  // GET /me
  fastify.get(
    "/me",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const segmentationService = new SegmentationService(
        fastify.db,
        request.log,
      );

      // Get user from database
      const userResults = await fastify.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          level: users.level,
          branchId: users.branchId,
          gender: users.gender,
          dateOfBirth: users.dateOfBirth,
          // Phase 115 (R1, D-15): bar challenge attempt fields. Always
          // returned (null if user did not participate), independent of the
          // event window. Frontend reads userStore.profile to decide
          // BarChallengeCard state.
          barChallengeCompleted: users.barChallengeCompleted,
          barChallengeSeconds: users.barChallengeSeconds,
          barChallengeAttemptedAt: users.barChallengeAttemptedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResults.length === 0) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Usuario no encontrado" });
      }

      const user = userResults[0];

      // Get branch name and virtual status
      const branchResults = await fastify.db
        .select({
          name: branches.name,
          isVirtual: branches.isVirtual,
          country: branches.country,
        })
        .from(branches)
        .where(eq(branches.id, user.branchId))
        .limit(1);

      const branchName = branchResults[0]?.name || null;
      const branchIsVirtual = branchResults[0]?.isVirtual ?? false;
      const branchCountry = branchResults[0]?.country ?? "AR";

      // Segment calculation + login tracking for members only (per D-05)
      let segment: string | null = null;
      if (user.role === "member") {
        // Fire-and-forget: record login + recalculate segment (graceful degradation)
        try {
          await Promise.all([
            segmentationService.recordLogin(userId),
            segmentationService.calculateAndUpdate(userId),
          ]);
        } catch (err: unknown) {
          request.log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "Segment calculation/login tracking failed (graceful degradation)",
          );
        }

        // Fetch current segment and onboarding status from member_profiles
        const [profile] = await fastify.db
          .select({
            segment: memberProfiles.segment,
            onboardingCompletedAt: memberProfiles.onboardingCompletedAt,
          })
          .from(memberProfiles)
          .where(eq(memberProfiles.userId, userId))
          .limit(1);

        segment = profile?.segment ?? null;
      }

      // Check onboarding status
      const profileRows = await fastify.db
        .select({
          completedAt: memberProfiles.onboardingCompletedAt,
        })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);
      const onboardingCompleted =
        profileRows.length > 0 && profileRows[0].completedAt !== null;

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        level: user.level,
        branchId: user.branchId,
        branchName,
        branchIsVirtual,
        branchCountry,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        segment,
        onboardingCompleted,
        // Phase 115 (R1, D-15): bar challenge attempt fields. Always present
        // in the response — null for users who haven't participated.
        barChallengeCompleted: user.barChallengeCompleted,
        barChallengeSeconds: user.barChallengeSeconds,
        barChallengeAttemptedAt: user.barChallengeAttemptedAt,
      };
    },
  );

  // POST /me/change-password
  fastify.post<{ Body: { currentPassword: string; newPassword: string } }>(
    "/me/change-password",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string" },
            newPassword: { type: "string", minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user;

      const userResults = await fastify.db
        .select({
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResults.length === 0) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Usuario no encontrado" });
      }

      const valid = await argon2.verify(
        userResults[0].passwordHash,
        request.body.currentPassword,
      );
      if (!valid) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "Contraseña actual incorrecta",
        });
      }

      const newHash = await argon2.hash(request.body.newPassword);
      await fastify.db
        .update(users)
        .set({ passwordHash: newHash })
        .where(eq(users.id, userId));

      // D-01: revocar TODOS los refresh del user (desloguea otros devices) y
      // emitir un par nuevo (access 30m + refresh) para el device actual, que
      // lo recibe en el response y queda logueado.
      const refreshTokenService = new RefreshTokenService(
        fastify.db,
        request.log,
      );
      await refreshTokenService.revokeAllForUser(userId);
      const accessToken = fastify.jwt.sign(
        {
          userId,
          email: userResults[0].email,
          role: userResults[0].role,
        },
        { expiresIn: fastify.accessTokenExpiresIn },
      );
      const refreshToken = await refreshTokenService.issue(userId);

      return { message: "Contraseña actualizada", accessToken, refreshToken };
    },
  );

  // POST /me/delete-account
  fastify.post<{ Body: { password: string } }>(
    "/me/delete-account",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user;

      // Fetch current user
      const [user] = await fastify.db
        .select({
          passwordHash: users.passwordHash,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Usuario no encontrado" });
      }

      if (user.deletedAt) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "Cuenta ya eliminada",
        });
      }

      // Verify password
      const valid = await argon2.verify(
        user.passwordHash,
        request.body.password,
      );
      if (!valid) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "Contraseña incorrecta",
        });
      }

      // Anonymize PII and mark as deleted
      const now = new Date();
      const anonymizedId = `deleted_${userId}_${now.getTime()}`;
      await fastify.db
        .update(users)
        .set({
          email: `${anonymizedId}@deleted.local`,
          firstName: "Eliminado",
          lastName: "Eliminado",
          dni: null,
          phone: null,
          address: null,
          dateOfBirth: null,
          gender: "unspecified",
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactRelationship: null,
          photoUrl: null,
          passwordHash: "DELETED",
          deletedAt: now,
        })
        .where(eq(users.id, userId));

      // D-05: delete-account es soft-delete/anonimizacion, NO borra la fila,
      // asi que el FK ON DELETE CASCADE no se dispara. Revocacion explicita de
      // todos los refresh tokens del user para cerrar todas las sesiones.
      const refreshTokenService = new RefreshTokenService(
        fastify.db,
        request.log,
      );
      await refreshTokenService.revokeAllForUser(userId);

      request.log.info({ userId }, "Account deleted and anonymized");

      return { message: "Cuenta eliminada exitosamente" };
    },
  );
};
