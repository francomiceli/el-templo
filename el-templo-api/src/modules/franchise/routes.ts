import { FastifyPluginAsync } from "fastify";
import { FranchiseService } from "./service";
import { FranchiseAiAgentService, type AgentType } from "./ai-agent-service";

// ---------- TypeScript interfaces ----------

interface ApplyBody {
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  modelo: string;
  experiencia: string;
  capital: string;
  origen: string;
  mensaje?: string;
}

interface ListApplicationsQuery {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

interface ApplicationIdParams {
  id: number;
}

interface UpdateApplicationBody {
  status?: string;
  notes?: string;
}

interface GenerateAiBody {
  agentType: string;
}

// ---------- Role guard ----------

const SUPERADMIN_ROLES = ["superadmin"];

// ---------- JSON Schemas ----------

const applySchema = {
  body: {
    type: "object",
    required: [
      "nombre",
      "email",
      "telefono",
      "ciudadPais",
      "modelo",
      "experiencia",
      "capital",
      "origen",
    ],
    properties: {
      nombre: { type: "string", minLength: 1, maxLength: 255 },
      email: { type: "string", format: "email", maxLength: 255 },
      telefono: { type: "string", minLength: 1, maxLength: 50 },
      ciudadPais: { type: "string", minLength: 1, maxLength: 255 },
      modelo: { type: "string", enum: ["activa", "pasiva", "ambas"] },
      experiencia: {
        type: "string",
        enum: ["fitness", "negocios", "ambas", "sin_experiencia"],
      },
      capital: {
        type: "string",
        enum: ["menos_50k", "entre_50k_100k", "mas_100k"],
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

const listApplicationsSchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      status: {
        type: "string",
        enum: ["all", "new", "contacted", "negotiating", "closed"],
      },
      search: { type: "string", maxLength: 255 },
      sortBy: {
        type: "string",
        enum: ["createdAt", "nombre", "ciudadPais", "capital", "status"],
        default: "createdAt",
      },
      sortDir: { type: "string", enum: ["asc", "desc"], default: "desc" },
    },
  },
};

const applicationIdSchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
  },
};

const updateApplicationSchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
  },
  body: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["new", "contacted", "negotiating", "closed"],
      },
      notes: { type: "string", maxLength: 5000 },
    },
    additionalProperties: false,
  },
};

const generateAiSchema = {
  params: {
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
  },
  body: {
    type: "object",
    required: ["agentType"],
    properties: {
      agentType: {
        type: "string",
        enum: ["strategy", "outreach", "followup", "negotiation"],
      },
    },
    additionalProperties: false,
  },
};

// ---------- Routes ----------

export const franchiseRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new FranchiseService(fastify.db, fastify.log);

  // ===========================================================================
  // Public routes (no auth)
  // ===========================================================================

  fastify.post<{ Body: ApplyBody }>(
    "/apply",
    { schema: applySchema },
    async (request, reply) => {
      const result = await service.submitApplication(request.body);

      return reply.code(201).send({
        message: "Solicitud recibida. Nos pondremos en contacto pronto.",
        whatsappUrl: result.whatsappUrl,
      });
    },
  );

  // ===========================================================================
  // Admin routes (superadmin only)
  // ===========================================================================

  // GET /admin/applications — List all applications with filters
  fastify.get<{ Querystring: ListApplicationsQuery }>(
    "/admin/applications",
    { preHandler: [fastify.authenticate], schema: listApplicationsSchema },
    async (request, reply) => {
      if (!SUPERADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de superadmin requerido" });
      }
      return service.listApplications({
        page: request.query.page,
        limit: request.query.limit,
        status: request.query.status,
        search: request.query.search,
        sortBy: request.query.sortBy,
        sortDir: request.query.sortDir,
      });
    },
  );

  // GET /admin/applications/:id — Single application detail
  fastify.get<{ Params: ApplicationIdParams }>(
    "/admin/applications/:id",
    { preHandler: [fastify.authenticate], schema: applicationIdSchema },
    async (request, reply) => {
      if (!SUPERADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de superadmin requerido" });
      }
      const application = await service.getApplication(request.params.id);
      if (!application) {
        return reply.status(404).send({ error: "Aplicacion no encontrada" });
      }
      return application;
    },
  );

  // PATCH /admin/applications/:id — Update status and/or notes
  fastify.patch<{ Params: ApplicationIdParams; Body: UpdateApplicationBody }>(
    "/admin/applications/:id",
    { preHandler: [fastify.authenticate], schema: updateApplicationSchema },
    async (request, reply) => {
      if (!SUPERADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de superadmin requerido" });
      }
      const updated = await service.updateApplication(
        request.params.id,
        request.body,
      );
      if (!updated) {
        return reply.status(404).send({ error: "Aplicacion no encontrada" });
      }
      return updated;
    },
  );

  // POST /admin/applications/:id/generate — Generate AI agent output
  fastify.post<{ Params: ApplicationIdParams; Body: GenerateAiBody }>(
    "/admin/applications/:id/generate",
    { preHandler: [fastify.authenticate], schema: generateAiSchema },
    async (request, reply) => {
      if (!SUPERADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de superadmin requerido" });
      }

      // Check ANTHROPIC_API_KEY is configured
      if (!process.env.ANTHROPIC_API_KEY) {
        return reply
          .status(503)
          .send({
            error: "AI service not configured (ANTHROPIC_API_KEY missing)",
          });
      }

      const application = await service.getApplication(request.params.id);
      if (!application) {
        return reply.status(404).send({ error: "Aplicacion no encontrada" });
      }

      const aiService = new FranchiseAiAgentService(request.log);
      const agentType = request.body.agentType as AgentType;

      try {
        const content = await aiService.generate(agentType, {
          nombre: application.nombre,
          email: application.email,
          telefono: application.telefono,
          ciudadPais: application.ciudadPais,
          modelo: application.modelo,
          experiencia: application.experiencia,
          capital: application.capital,
          origen: application.origen,
          mensaje: application.mensaje,
        });

        // Save generated content to the corresponding column
        await service.saveAiOutput(request.params.id, agentType, content);

        return { agentType, content };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.error(
          { err: message, agentType, applicationId: request.params.id },
          "AI generation failed",
        );
        return reply
          .status(500)
          .send({ error: "Error generando contenido AI" });
      }
    },
  );
};
