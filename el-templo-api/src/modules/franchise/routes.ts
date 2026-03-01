import { FastifyPluginAsync } from "fastify";
import { FranchiseService } from "./service";

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

export const franchiseRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new FranchiseService(fastify.db, fastify.log);

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
};
