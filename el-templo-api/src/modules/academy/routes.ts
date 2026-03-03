import { FastifyPluginAsync } from "fastify";
import { AcademyService } from "./service";

interface InquireBody {
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  nivelInteres: string;
  modalidad: string;
  experiencia: string;
  alumnoElTemplo: string;
  origen: string;
  mensaje?: string;
}

const ADMIN_ROLES = ["admin", "superadmin"];

const inquireSchema = {
  body: {
    type: "object",
    required: [
      "nombre",
      "email",
      "telefono",
      "ciudadPais",
      "nivelInteres",
      "modalidad",
      "experiencia",
      "alumnoElTemplo",
      "origen",
    ],
    properties: {
      nombre: { type: "string", minLength: 1, maxLength: 255 },
      email: { type: "string", format: "email", maxLength: 255 },
      telefono: { type: "string", minLength: 1, maxLength: 100 },
      ciudadPais: { type: "string", minLength: 1, maxLength: 255 },
      nivelInteres: {
        type: "string",
        enum: [
          "nivel-1-trainer",
          "nivel-2-olympic-trainer",
          "nivel-3-spartan-trainer",
        ],
      },
      modalidad: {
        type: "string",
        enum: ["presencial", "online", "ambas"],
      },
      experiencia: {
        type: "string",
        enum: [
          "calistenia",
          "otro-entrenamiento",
          "sin-experiencia",
          "entrenador",
        ],
      },
      alumnoElTemplo: {
        type: "string",
        enum: ["si", "no", "fui-alumno"],
      },
      origen: {
        type: "string",
        enum: ["instagram", "web", "recomendacion", "google", "otro"],
      },
      mensaje: { type: "string", maxLength: 500 },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: "object",
      properties: {
        message: { type: "string" },
        whatsappUrl: { type: "string" },
      },
    },
  },
};

export const academyRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AcademyService(fastify.db, fastify.log);

  // ===========================================================================
  // Public routes (no auth)
  // ===========================================================================

  // POST /inquire — submit academy inquiry
  fastify.post<{ Body: InquireBody }>(
    "/inquire",
    { schema: inquireSchema },
    async (request, reply) => {
      const result = await service.submitInquiry(request.body);

      return reply.code(201).send({
        message: "Consulta recibida. Nos pondremos en contacto pronto.",
        whatsappUrl: result.whatsappUrl,
      });
    },
  );

  // ===========================================================================
  // Admin routes (admin/superadmin only)
  // ===========================================================================

  // GET /admin/inquiries — list all academy inquiries
  fastify.get(
    "/admin/inquiries",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      return service.listInquiries();
    },
  );
};
