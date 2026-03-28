import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: number; email: string; role: string };
    user: { userId: number; email: string; role: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  await fastify.register(jwt, {
    secret,
    sign: {
      expiresIn,
    },
  });

  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch (err: unknown) {
        reply
          .code(401)
          .send({
            error: "No autorizado",
            message: "Token invalido o ausente",
          });
      }
    },
  );

  fastify.log.info("Auth plugin registered");
};

export default fp(authPlugin, { name: "auth" });
