import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: number; email: string | null; role: string };
    user: { userId: number; email: string | null; role: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    // Phase 116: short-lived access-token expiry (e.g. "30m"). Routes sign the
    // new accessToken with fastify.jwt.sign(payload, { expiresIn: this }).
    // The legacy `token` keeps the global 7d default (Req 8 no-change).
    accessTokenExpiresIn: string;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  // Phase 116: the new access token is short-lived (30m). @fastify/jwt accepts
  // a per-call override on fastify.jwt.sign(payload, { expiresIn }), so the
  // global default below stays 7d for the legacy `token` (Req 8 no-change).
  const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || "30m";

  await fastify.register(jwt, {
    secret,
    sign: {
      expiresIn,
    },
  });

  // Expose the access expiry to route handlers (Plan 02 signs accessToken with
  // fastify.jwt.sign(payload, { expiresIn: fastify.accessTokenExpiresIn })).
  fastify.decorate("accessTokenExpiresIn", accessExpiresIn);

  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch (err: unknown) {
        reply.code(401).send({
          error: "No autorizado",
          message: "Token invalido o ausente",
        });
        // Re-throw so handlers that call this inline (instead of via
        // onRequest hook) abort instead of running with request.user === null.
        throw err;
      }
    },
  );

  fastify.log.info("Auth plugin registered");
};

export default fp(authPlugin, { name: "auth" });
