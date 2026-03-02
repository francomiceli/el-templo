import { FastifyPluginAsync } from "fastify";
import { BlogService } from "./service";
import { BlogImageService } from "./image-service";

interface PostBody {
  title: string;
  slug?: string;
  excerpt: string;
  coverImage?: string | null;
  body: string;
}

interface PostUpdateBody {
  title?: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string | null;
  body?: string;
  status?: string;
}

interface PostIdParams {
  id: number;
}

interface SlugParams {
  slug: string;
}

interface ListQuery {
  page?: number;
  limit?: number;
}

interface AdminListQuery {
  page?: number;
  limit?: number;
  status?: string;
}

interface UploadImageBody {
  filename: string;
}

const ADMIN_ROLES = ["admin", "superadmin"];

const listPostsSchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 1000, default: 10 },
    },
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

const adminListPostsSchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      status: { type: "string", enum: ["draft", "published", "all"] },
    },
  },
};

const createPostSchema = {
  body: {
    type: "object",
    required: ["title", "excerpt", "body"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 255 },
      slug: { type: "string", maxLength: 255 },
      excerpt: { type: "string", minLength: 1 },
      coverImage: { type: ["string", "null"], maxLength: 500 },
      body: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const updatePostSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 255 },
      slug: { type: "string", maxLength: 255 },
      excerpt: { type: "string", minLength: 1 },
      coverImage: { type: ["string", "null"], maxLength: 500 },
      body: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["draft", "published"] },
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

const postIdSchema = {
  params: {
    type: "object",
    properties: {
      id: { type: "integer" },
    },
    required: ["id"],
  },
};

const uploadImageSchema = {
  body: {
    type: "object",
    required: ["filename"],
    properties: {
      filename: { type: "string", minLength: 1, maxLength: 255 },
    },
    additionalProperties: false,
  },
};

export const blogRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new BlogService(fastify.db, fastify.log);

  // ===========================================================================
  // Public routes (no auth)
  // ===========================================================================

  // GET /posts — paginated published posts
  fastify.get<{ Querystring: ListQuery }>(
    "/posts",
    { schema: listPostsSchema },
    async (request) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 10;
      return service.listPublishedPosts(page, limit);
    },
  );

  // GET /posts/:slug — single published post by slug
  fastify.get<{ Params: SlugParams }>(
    "/posts/:slug",
    { schema: slugParamSchema },
    async (request, reply) => {
      const post = await service.getPublishedPostBySlug(request.params.slug);
      if (!post) {
        return reply.status(404).send({ error: "Post no encontrado" });
      }
      return post;
    },
  );

  // ===========================================================================
  // Admin routes (admin/superadmin only)
  // ===========================================================================

  // GET /admin/posts — all posts with status filter
  fastify.get<{ Querystring: AdminListQuery }>(
    "/admin/posts",
    { preHandler: [fastify.authenticate], schema: adminListPostsSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 10;
      const status = request.query.status;
      return service.listAllPosts(page, limit, status);
    },
  );

  // POST /admin/posts — create post
  fastify.post<{ Body: PostBody }>(
    "/admin/posts",
    { preHandler: [fastify.authenticate], schema: createPostSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const post = await service.createPost(request.body);
      return reply.code(201).send(post);
    },
  );

  // PUT /admin/posts/:id — update post
  fastify.put<{ Params: PostIdParams; Body: PostUpdateBody }>(
    "/admin/posts/:id",
    { preHandler: [fastify.authenticate], schema: updatePostSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const post = await service.updatePost(request.params.id, request.body);
      if (!post) {
        return reply.status(404).send({ error: "Post no encontrado" });
      }
      return post;
    },
  );

  // DELETE /admin/posts/:id — delete post
  fastify.delete<{ Params: PostIdParams }>(
    "/admin/posts/:id",
    { preHandler: [fastify.authenticate], schema: postIdSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      await service.deletePost(request.params.id);
      return { success: true };
    },
  );

  // POST /admin/upload-image — generate presigned R2 URL for blog image
  fastify.post<{ Body: UploadImageBody }>(
    "/admin/upload-image",
    { preHandler: [fastify.authenticate], schema: uploadImageSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      if (!fastify.r2) {
        return reply
          .status(503)
          .send({ error: "Image storage not configured" });
      }
      const imageService = new BlogImageService(
        fastify.r2,
        fastify.r2Bucket,
        request.log,
      );
      return imageService.generateUploadUrl(request.body.filename);
    },
  );
};
