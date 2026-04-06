import { FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import argon2 from "argon2";
import { users } from "../../db/schema/users";
import { branches } from "../../db/schema/branches";
import { memberProfiles } from "../../db/schema/member-profiles";
import { promoPlans } from "../../db/schema/promo-plans";
import { registerSchema, loginSchema } from "./schemas";
import { SegmentationService } from "../segmentation/service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { PaymentService } from "../payments/service";

interface RegisterBody {
  email: string;
  password: string;
  branchId?: number;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  gender: "male" | "female" | "other" | "unspecified";
  promoCode?: string;
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
      } = request.body;

      // Check if email or DNI already exists — auto-login instead of rejecting
      const [existingByEmail] = await fastify.db
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          level: users.level,
          branchId: users.branchId,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const existingUser =
        existingByEmail ??
        (
          await fastify.db
            .select({
              id: users.id,
              email: users.email,
              passwordHash: users.passwordHash,
              firstName: users.firstName,
              lastName: users.lastName,
              role: users.role,
              level: users.level,
              branchId: users.branchId,
              isActive: users.isActive,
            })
            .from(users)
            .where(eq(users.dni, dni))
            .limit(1)
        )[0] ??
        null;

      if (existingUser) {
        // Update password to the one they just submitted
        const validPassword = await argon2.verify(
          existingUser.passwordHash,
          password,
        );
        if (!validPassword) {
          const newHash = await argon2.hash(password);
          await fastify.db
            .update(users)
            .set({ passwordHash: newHash })
            .where(eq(users.id, existingUser.id));
        }

        // Apply promo to existing account if applicable
        let promoApplied = false;
        if (promoCode) {
          try {
            const [promo] = await fastify.db
              .select()
              .from(promoPlans)
              .where(eq(promoPlans.promoCode, promoCode))
              .limit(1);

            if (promo && promo.isActive) {
              const now = new Date();
              if (now >= promo.startDate && now <= promo.expiryDate) {
                const auraService = new AuraService(fastify.db);
                const paymentService = new PaymentService(
                  fastify.db,
                  fastify.log,
                );
                const subscriptionService = new SubscriptionService(
                  fastify.db,
                  request.log,
                  auraService,
                  paymentService,
                );

                const today = new Date().toISOString().split("T")[0];
                await subscriptionService.assignPlan(
                  existingUser.id,
                  {
                    planId: promo.subscriptionPlanId,
                    branchId: existingUser.branchId,
                    startDate: today,
                    priceTypeApplied: "zero",
                    paymentMethod: "cash",
                  },
                  existingUser.id,
                );

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
            request.log.error(
              {
                err: err instanceof Error ? err.message : String(err),
                promoCode,
                userId: existingUser.id,
              },
              "Promo code assignment to existing user failed (graceful degradation)",
            );
          }
        }

        // Get branch info
        const [branchRow] = await fastify.db
          .select({ name: branches.name, isVirtual: branches.isVirtual })
          .from(branches)
          .where(eq(branches.id, existingUser.branchId))
          .limit(1);

        // Check onboarding status
        const [profile] = await fastify.db
          .select({
            completedAt: memberProfiles.onboardingCompletedAt,
          })
          .from(memberProfiles)
          .where(eq(memberProfiles.userId, existingUser.id))
          .limit(1);
        const onboardingCompleted = !!profile?.completedAt;

        // Sign JWT and return login response
        const token = fastify.jwt.sign({
          userId: existingUser.id,
          email: existingUser.email,
          role: existingUser.role,
        });

        request.log.info(
          { userId: existingUser.id, promoCode, promoApplied },
          "Existing user auto-logged in via register endpoint",
        );

        return {
          token,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            role: existingUser.role,
            level: existingUser.level,
            branchId: existingUser.branchId,
            branchName: branchRow?.name ?? "",
            branchIsVirtual: branchRow?.isVirtual ?? false,
            isActive: existingUser.isActive,
            onboardingCompleted,
          },
          promoApplied,
          existingAccount: true,
        };
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

      const result = await fastify.db.insert(users).values({
        email,
        passwordHash,
        branchId,
        firstName,
        lastName,
        dni,
        phone,
        gender,
        role: "member",
        level: "alfa",
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
              const paymentService = new PaymentService(
                fastify.db,
                fastify.log,
              );
              const subscriptionService = new SubscriptionService(
                fastify.db,
                request.log,
                auraService,
                paymentService,
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

      // Get branch info for response
      const [branchRow] = await fastify.db
        .select({ name: branches.name, isVirtual: branches.isVirtual })
        .from(branches)
        .where(eq(branches.id, branchId))
        .limit(1);

      // Sign JWT
      const token = fastify.jwt.sign({ userId, email, role: "member" });

      return {
        token,
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          role: "member",
          level: "alfa",
          branchId,
          branchName: branchRow?.name ?? "",
          branchIsVirtual: branchRow?.isVirtual ?? false,
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
          isActive: users.isActive,
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

      // Verify password
      const validPassword = await argon2.verify(user.passwordHash, password);
      if (!validPassword) {
        return reply
          .code(401)
          .send({ error: "No autorizado", message: "Credenciales invalidas" });
      }

      // Get branch name and virtual status
      const branchResults = await fastify.db
        .select({ name: branches.name, isVirtual: branches.isVirtual })
        .from(branches)
        .where(eq(branches.id, user.branchId))
        .limit(1);

      const branchName = branchResults[0]?.name || null;
      const branchIsVirtual = branchResults[0]?.isVirtual ?? false;

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

      // Sign JWT
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return {
        token,
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
          isActive: user.isActive,
          onboardingCompleted,
        },
      };
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
          isActive: users.isActive,
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
        .select({ name: branches.name, isVirtual: branches.isVirtual })
        .from(branches)
        .where(eq(branches.id, user.branchId))
        .limit(1);

      const branchName = branchResults[0]?.name || null;
      const branchIsVirtual = branchResults[0]?.isVirtual ?? false;

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
        isActive: user.isActive,
        gender: user.gender,
        segment,
        onboardingCompleted,
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
        .select({ passwordHash: users.passwordHash })
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

      return { message: "Contraseña actualizada" };
    },
  );
};
