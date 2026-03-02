import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken } from "../helpers";
import { blogPosts } from "../../src/db/schema/blog-posts";

describe("Blog Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;

  const validPost = {
    title: "Calistenia para principiantes",
    excerpt: "Una guia completa para empezar con la calistenia.",
    body: "Este es el cuerpo del articulo con suficientes palabras para calcular un tiempo de lectura razonable. La calistenia es una disciplina que utiliza el peso corporal como resistencia principal.",
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterEach(async () => {
    // Clean up all blog posts (including seed data from migrations)
    await app.db.delete(blogPosts);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /api/blog/posts — Public (paginated published posts)
  // ---------------------------------------------------------------
  describe("GET /api/blog/posts", () => {
    it("returns empty array with pagination metadata when no posts exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.posts).toEqual([]);
      expect(body).toHaveProperty("total", 0);
      expect(body).toHaveProperty("page", 1);
      expect(body).toHaveProperty("totalPages", 0);
    });

    it("does not expose draft posts in public listing", async () => {
      // Create a draft post via admin
      await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...validPost, title: "Draft Post" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts",
      });

      const body = JSON.parse(res.body);
      const titles = body.posts.map((p: { title: string }) => p.title);
      expect(titles).not.toContain("Draft Post");
    });

    it("returns published posts with readingTime computed", async () => {
      // Create and publish a post
      const createRes = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...validPost, title: "Published Post" },
      });
      const created = JSON.parse(createRes.body);

      await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "published" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts",
      });

      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(1);
      expect(body.posts[0].title).toBe("Published Post");
      expect(body.posts[0]).toHaveProperty("readingTime");
      expect(body.posts[0].readingTime).toBeGreaterThanOrEqual(1);
      // Body should NOT be in the list response
      expect(body.posts[0]).not.toHaveProperty("body");
    });

    it("respects pagination parameters", async () => {
      // Create 2 published posts
      for (const title of ["Page 1 Post", "Page 2 Post"]) {
        const createRes = await app.inject({
          method: "POST",
          url: "/api/blog/admin/posts",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { ...validPost, title },
        });
        const created = JSON.parse(createRes.body);

        await app.inject({
          method: "PUT",
          url: `/api/blog/admin/posts/${created.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { status: "published" },
        });
      }

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts?page=1&limit=1",
      });

      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(1);
      expect(body.total).toBe(2);
      expect(body.totalPages).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/blog/posts/:slug — Public
  // ---------------------------------------------------------------
  describe("GET /api/blog/posts/:slug", () => {
    it("returns 404 for non-existent slug", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts/non-existent-post",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for draft post (public can't see drafts)", async () => {
      // Create a draft post
      await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts/calistenia-para-principiantes",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns full published post with body and readingTime", async () => {
      // Create and publish
      const createRes = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });
      const created = JSON.parse(createRes.body);

      await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "published" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts/calistenia-para-principiantes",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.title).toBe("Calistenia para principiantes");
      expect(body.body).toContain("calistenia");
      expect(body).toHaveProperty("readingTime");
      expect(body.readingTime).toBeGreaterThanOrEqual(1);
      expect(body).toHaveProperty("publishedAt");
      expect(body.publishedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Admin routes — CRUD (admin/superadmin only)
  // ---------------------------------------------------------------
  describe("Admin CRUD routes", () => {
    it("POST /api/blog/admin/posts creates a draft post and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.title).toBe("Calistenia para principiantes");
      expect(body.slug).toBe("calistenia-para-principiantes");
      expect(body.status).toBe("draft");
      expect(body).toHaveProperty("readingTime");
    });

    it("PUT /api/blog/admin/posts/:id updates post fields", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });
      const created = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: "Updated Title" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.title).toBe("Updated Title");
    });

    it("PUT with status=published sets publishedAt if not already set", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });
      const created = JSON.parse(createRes.body);
      expect(created.publishedAt).toBeNull();

      const res = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "published" },
      });

      const body = JSON.parse(res.body);
      expect(body.status).toBe("published");
      expect(body.publishedAt).not.toBeNull();
    });

    it("re-publishing keeps original publishedAt", async () => {
      // Create and publish
      const createRes = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });
      const created = JSON.parse(createRes.body);

      const pubRes = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "published" },
      });
      const firstPublish = JSON.parse(pubRes.body);

      // Revert to draft
      await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "draft" },
      });

      // Re-publish
      const rePublishRes = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "published" },
      });
      const rePublished = JSON.parse(rePublishRes.body);

      // publishedAt should be preserved from first publish
      expect(rePublished.publishedAt).toBe(firstPublish.publishedAt);
    });

    it("DELETE /api/blog/admin/posts/:id deletes post", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });
      const created = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/blog/admin/posts/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("GET /api/blog/admin/posts returns all posts with status filter", async () => {
      // Create a draft post
      await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validPost,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/admin/posts?status=draft",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.posts.length).toBeGreaterThanOrEqual(1);
      expect(
        body.posts.every((p: { status: string }) => p.status === "draft"),
      ).toBe(true);
    });

    it("returns 401 for unauthenticated requests on admin routes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/admin/posts",
      });

      expect(res.statusCode).toBe(401);
    });

    it("POST /api/blog/admin/upload-image returns upload URL or 503", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/blog/admin/upload-image",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { filename: "test-image.jpg" },
      });

      if (res.statusCode === 503) {
        // R2 not configured in test environment
        const body = JSON.parse(res.body);
        expect(body.error).toBe("Image storage not configured");
      } else {
        // R2 is configured — should return upload URL
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body).toHaveProperty("uploadUrl");
        expect(body).toHaveProperty("publicUrl");
        expect(body.publicUrl).toContain("blog/images/");
      }
    });
  });
});
