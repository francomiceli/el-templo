import { FastifyPluginAsync } from "fastify";
import { AppLandingService } from "./service";

interface WaitlistBody {
  nombre: string;
  email: string;
  moduloInteres: string;
  ciudadPais?: string;
}

interface LabsInquiryBody {
  nombre: string;
  email: string;
  telefono: string;
  nombreGimnasio: string;
  ciudadPais: string;
  cantidadSocios: string;
  sistemaActual: string;
  mensaje?: string;
}

interface StatusBody {
  status: string;
}

interface IdParams {
  id: number;
}

const ADMIN_ROLES = ["admin", "superadmin"];

const waitlistSchema = {
  body: {
    type: "object",
    required: ["nombre", "email", "moduloInteres"],
    properties: {
      nombre: { type: "string", minLength: 1, maxLength: 255 },
      email: { type: "string", format: "email", maxLength: 255 },
      moduloInteres: { type: "string", minLength: 1, maxLength: 255 },
      ciudadPais: { type: "string", maxLength: 255 },
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

const labsInquirySchema = {
  body: {
    type: "object",
    required: [
      "nombre",
      "email",
      "telefono",
      "nombreGimnasio",
      "ciudadPais",
      "cantidadSocios",
      "sistemaActual",
    ],
    properties: {
      nombre: { type: "string", minLength: 1, maxLength: 255 },
      email: { type: "string", format: "email", maxLength: 255 },
      telefono: { type: "string", minLength: 1, maxLength: 100 },
      nombreGimnasio: { type: "string", minLength: 1, maxLength: 255 },
      ciudadPais: { type: "string", minLength: 1, maxLength: 255 },
      cantidadSocios: {
        type: "string",
        enum: ["menos-de-50", "50-200", "200-500", "mas-de-500"],
      },
      sistemaActual: {
        type: "string",
        enum: ["ninguno", "excel", "fitco", "crosshero", "otro"],
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

const statusUpdateSchema = {
  body: {
    type: "object",
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["new", "contacted", "closed"],
      },
    },
    additionalProperties: false,
  },
  params: {
    type: "object",
    properties: {
      id: { type: "integer" },
    },
    required: ["id"],
  },
};

export const appLandingRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AppLandingService(fastify.db, fastify.log);

  // ===========================================================================
  // Public routes (no auth)
  // ===========================================================================

  // POST /waitlist — submit waitlist entry
  fastify.post<{ Body: WaitlistBody }>(
    "/waitlist",
    { schema: waitlistSchema },
    async (request, reply) => {
      const result = await service.submitWaitlist(request.body);

      return reply.code(201).send({
        message: "Registro exitoso",
        whatsappUrl: result.whatsappUrl,
      });
    },
  );

  // POST /labs-inquiry — submit Labs inquiry
  fastify.post<{ Body: LabsInquiryBody }>(
    "/labs-inquiry",
    { schema: labsInquirySchema },
    async (request, reply) => {
      const result = await service.submitLabsInquiry(request.body);

      return reply.code(201).send({
        message: "Consulta enviada",
        whatsappUrl: result.whatsappUrl,
      });
    },
  );

  // ===========================================================================
  // Admin routes (admin/superadmin only)
  // ===========================================================================

  // GET /admin/waitlist — list all waitlist entries
  fastify.get(
    "/admin/waitlist",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      return service.listWaitlist();
    },
  );

  // GET /admin/labs-inquiries — list all Labs inquiries
  fastify.get(
    "/admin/labs-inquiries",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      return service.listLabsInquiries();
    },
  );

  // PATCH /admin/labs-inquiries/:id/status — update Labs inquiry status
  fastify.patch<{ Params: IdParams; Body: StatusBody }>(
    "/admin/labs-inquiries/:id/status",
    {
      preHandler: [fastify.authenticate],
      schema: statusUpdateSchema,
    },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const updated = await service.updateLabsInquiryStatus(
        request.params.id,
        request.body.status,
      );

      if (!updated) {
        return reply.status(400).send({ error: "Estado no v\u00E1lido" });
      }

      return { success: true };
    },
  );
};
