import { FastifyPluginAsync } from "fastify";
import { GladiusService } from "./service";

interface InquireBody {
  nombre: string;
  email: string;
  productoInteres: string;
  mensaje?: string;
}

interface ProductBody {
  name: string;
  slug?: string;
  description: string;
  photo?: string | null;
  status?: string;
  sortOrder?: number;
}

interface ProductParams {
  id: number;
}

interface SlugParams {
  slug: string;
}

const ADMIN_ROLES = ["admin", "superadmin"];

const inquireSchema = {
  body: {
    type: "object",
    required: ["nombre", "email", "productoInteres"],
    properties: {
      nombre: { type: "string", minLength: 1, maxLength: 255 },
      email: { type: "string", format: "email", maxLength: 255 },
      productoInteres: { type: "string", minLength: 1, maxLength: 255 },
      mensaje: { type: "string", maxLength: 1000 },
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

const createProductSchema = {
  body: {
    type: "object",
    required: ["name", "description"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      slug: { type: "string", maxLength: 255 },
      description: { type: "string", minLength: 1 },
      photo: { type: ["string", "null"], maxLength: 500 },
      status: { type: "string", enum: ["published", "unpublished"] },
      sortOrder: { type: "integer", minimum: 0 },
    },
    additionalProperties: false,
  },
};

const updateProductSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      slug: { type: "string", maxLength: 255 },
      description: { type: "string", minLength: 1 },
      photo: { type: ["string", "null"], maxLength: 500 },
      status: { type: "string", enum: ["published", "unpublished"] },
      sortOrder: { type: "integer", minimum: 0 },
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

const productIdSchema = {
  params: {
    type: "object",
    properties: {
      id: { type: "integer" },
    },
    required: ["id"],
  },
};

const slugParamSchema = {
  params: {
    type: "object",
    properties: {
      slug: { type: "string" },
    },
    required: ["slug"],
  },
};

export const gladiusRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new GladiusService(fastify.db, fastify.log);

  // ===========================================================================
  // Public routes (no auth)
  // ===========================================================================

  // GET /products — list published products
  fastify.get("/products", async () => {
    const products = await service.listPublishedProducts();
    return products;
  });

  // GET /products/:slug — get product by slug
  fastify.get<{ Params: SlugParams }>(
    "/products/:slug",
    { schema: slugParamSchema },
    async (request, reply) => {
      const product = await service.getProductBySlug(request.params.slug);
      if (!product) {
        return reply.status(404).send({ error: "Producto no encontrado" });
      }
      return product;
    },
  );

  // POST /inquire — submit inquiry
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

  // GET /admin/products — list all products (including unpublished)
  fastify.get(
    "/admin/products",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      return service.listAllProducts();
    },
  );

  // POST /admin/products — create product
  fastify.post<{ Body: ProductBody }>(
    "/admin/products",
    { preHandler: [fastify.authenticate], schema: createProductSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const product = await service.createProduct(request.body);
      return reply.code(201).send(product);
    },
  );

  // PUT /admin/products/:id — update product
  fastify.put<{ Params: ProductParams; Body: Partial<ProductBody> }>(
    "/admin/products/:id",
    { preHandler: [fastify.authenticate], schema: updateProductSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const product = await service.updateProduct(
        request.params.id,
        request.body,
      );
      if (!product) {
        return reply.status(404).send({ error: "Producto no encontrado" });
      }
      return product;
    },
  );

  // DELETE /admin/products/:id — delete product
  fastify.delete<{ Params: ProductParams }>(
    "/admin/products/:id",
    { preHandler: [fastify.authenticate], schema: productIdSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      await service.deleteProduct(request.params.id);
      return { success: true };
    },
  );
};
