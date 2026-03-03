import { FastifyPluginAsync } from "fastify";
import { BlogService } from "./service";
import { BlogImageService } from "./image-service";

interface PostBody {
  title: string;
  slug?: string;
  excerpt: string;
  coverImage?: string | null;
  body: string;
  ctaType?: string;
}

interface PostUpdateBody {
  title?: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string | null;
  body?: string;
  status?: string;
  ctaType?: string;
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

interface TagIdParams {
  id: number;
}

interface TagBody {
  name: string;
  slug?: string;
}

interface TagUpdateBody {
  name?: string;
  slug?: string;
}

interface AssignTagsBody {
  tagIds: number[];
}

interface RelatedQuery {
  limit?: number;
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
      ctaType: {
        type: "string",
        enum: ["trial", "franchise", "app"],
        default: "trial",
      },
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
      ctaType: { type: "string", enum: ["trial", "franchise", "app"] },
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

// Tag-related schemas
const tagIdSchema = {
  params: {
    type: "object",
    properties: {
      id: { type: "integer" },
    },
    required: ["id"],
  },
};

const createTagSchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      slug: { type: "string", maxLength: 100 },
    },
    additionalProperties: false,
  },
};

const updateTagSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      slug: { type: "string", maxLength: 100 },
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

const assignTagsSchema = {
  body: {
    type: "object",
    required: ["tagIds"],
    properties: {
      tagIds: {
        type: "array",
        items: { type: "integer" },
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

const relatedPostsSchema = {
  params: {
    type: "object",
    properties: {
      slug: { type: "string" },
    },
    required: ["slug"],
  },
  querystring: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 6, default: 3 },
    },
  },
};

const tagSlugPostsSchema = {
  params: {
    type: "object",
    properties: {
      slug: { type: "string" },
    },
    required: ["slug"],
  },
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    },
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

  // GET /posts/:slug/related — related posts for a given post
  fastify.get<{ Params: SlugParams; Querystring: RelatedQuery }>(
    "/posts/:slug/related",
    { schema: relatedPostsSchema },
    async (request) => {
      const limit = request.query.limit ?? 3;
      const posts = await service.getRelatedPosts(request.params.slug, limit);
      return { posts };
    },
  );

  // GET /tags — all tags with post counts (for tag bar)
  fastify.get("/tags", async () => {
    const tags = await service.listTagsWithPosts();
    return { tags };
  });

  // GET /tags/:slug/posts — paginated published posts for a tag
  fastify.get<{ Params: SlugParams; Querystring: ListQuery }>(
    "/tags/:slug/posts",
    { schema: tagSlugPostsSchema },
    async (request, reply) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 10;
      const result = await service.listPostsByTag(
        request.params.slug,
        page,
        limit,
      );
      if (!result) {
        return reply.status(404).send({ error: "Tag no encontrado" });
      }
      return result;
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

  // --- Tag management (admin) ---

  // GET /admin/tags — all tags ordered by name (for tag selector)
  fastify.get(
    "/admin/tags",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const tags = await service.listTags();
      return { tags };
    },
  );

  // POST /admin/tags — create tag
  fastify.post<{ Body: TagBody }>(
    "/admin/tags",
    { preHandler: [fastify.authenticate], schema: createTagSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      try {
        const tag = await service.createTag(request.body);
        return reply.code(201).send(tag);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("already exists")) {
          return reply.status(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // PUT /admin/tags/:id — update tag
  fastify.put<{ Params: TagIdParams; Body: TagUpdateBody }>(
    "/admin/tags/:id",
    { preHandler: [fastify.authenticate], schema: updateTagSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      try {
        const tag = await service.updateTag(request.params.id, request.body);
        if (!tag) {
          return reply.status(404).send({ error: "Tag no encontrado" });
        }
        return tag;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("already exists")) {
          return reply.status(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // DELETE /admin/tags/:id — delete tag
  fastify.delete<{ Params: TagIdParams }>(
    "/admin/tags/:id",
    { preHandler: [fastify.authenticate], schema: tagIdSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      await service.deleteTag(request.params.id);
      return { success: true };
    },
  );

  // PUT /admin/posts/:id/tags — assign tags to post
  fastify.put<{ Params: PostIdParams; Body: AssignTagsBody }>(
    "/admin/posts/:id/tags",
    { preHandler: [fastify.authenticate], schema: assignTagsSchema },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }
      const tags = await service.assignTagsToPost(
        request.params.id,
        request.body.tagIds,
      );
      return { tags };
    },
  );
};
