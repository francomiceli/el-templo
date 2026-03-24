import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { users } from "../../db/schema/users";
import { branches } from "../../db/schema/branches";
import { memberProfiles } from "../../db/schema/member-profiles";
import { registerSchema, loginSchema } from "./schemas";

interface RegisterBody {
  email: string;
  password: string;
  branchId?: number;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
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
      } = request.body;

      // Check if email already exists
      const existingUser = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        return reply
          .code(409)
          .send({ error: "Conflict", message: "Email already registered" });
      }

      // Check if DNI already exists
      const existingDni = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.dni, dni))
        .limit(1);

      if (existingDni.length > 0) {
        return reply
          .code(409)
          .send({ error: "Conflict", message: "DNI already registered" });
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
          return reply
            .code(400)
            .send({ error: "Bad Request", message: "Invalid branch ID" });
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
            error: "Server Error",
            message: "Default branch not configured",
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
        role: "member",
        level: "alfa",
      });

      const userId = Number(result[0].insertId);

      // Sign JWT
      const token = fastify.jwt.sign({ userId, email, role: "member" });

      return {
        token,
        user: {
          id: userId,
          email,
          role: "member",
          level: "alfa",
          branchId,
        },
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
          .send({ error: "Unauthorized", message: "Invalid credentials" });
      }

      const user = userResults[0];

      // Block deactivated users from logging in
      if (!user.isActive) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Cuenta desactivada. Contacta a tu coach.",
        });
      }

      // Verify password
      const validPassword = await argon2.verify(user.passwordHash, password);
      if (!validPassword) {
        return reply
          .code(401)
          .send({ error: "Unauthorized", message: "Invalid credentials" });
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
        .select({ completedAt: memberProfiles.onboardingCompletedAt })
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
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResults.length === 0) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "User not found" });
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

      // Check onboarding status
      const profileRows = await fastify.db
        .select({ completedAt: memberProfiles.onboardingCompletedAt })
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
          .send({ error: "Not Found", message: "Usuario no encontrado" });
      }

      const valid = await argon2.verify(
        userResults[0].passwordHash,
        request.body.currentPassword,
      );
      if (!valid) {
        return reply
          .code(400)
          .send({
            error: "Bad Request",
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
