import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { blogPosts } from "../../src/db/schema/blog-posts";
import { blogTags, blogPostTags } from "../../src/db/schema/blog-tags";

describe("Blog Tags", () => {
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

  beforeEach(async () => {
    // Clean up in correct order (junction first, then posts and tags)
    await app.db.delete(blogPostTags);
    await app.db.delete(blogPosts);
    await app.db.delete(blogTags);
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to create and optionally publish a post
  async function createPost(
    overrides: Record<string, unknown> = {},
    publish = false,
  ) {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/blog/admin/posts",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...validPost, ...overrides },
    });
    const post = JSON.parse(createRes.body);

    if (publish) {
      const pubRes = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${post.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "published" },
      });
      return JSON.parse(pubRes.body);
    }

    return post;
  }

  // Helper to create a tag via admin API
  async function createTag(name: string, slug?: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/blog/admin/tags",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, ...(slug ? { slug } : {}) },
    });
    return JSON.parse(res.body);
  }

  // Helper to assign tags to a post
  async function assignTags(postId: number, tagIds: number[]) {
    const res = await app.inject({
      method: "PUT",
      url: `/api/blog/admin/posts/${postId}/tags`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tagIds },
    });
    return JSON.parse(res.body);
  }

  // ---------------------------------------------------------------
  // Admin Tag CRUD
  // ---------------------------------------------------------------
  describe("Admin Tag CRUD", () => {
    it("GET /admin/tags returns empty list when no tags", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/admin/tags",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.tags).toEqual([]);
    });

    it("POST /admin/tags creates a tag and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/blog/admin/tags",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Calistenia" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Calistenia");
      expect(body.slug).toBe("calistenia");
      expect(body).toHaveProperty("id");
    });

    it("POST /admin/tags auto-generates slug from name", async () => {
      const tag = await createTag("Entrenamiento Funcional");
      expect(tag.slug).toBe("entrenamiento-funcional");
    });

    it("POST /admin/tags uses provided slug when given", async () => {
      const tag = await createTag("Skills", "habilidades");
      expect(tag.slug).toBe("habilidades");
    });

    it("POST /admin/tags returns 409 for duplicate slug", async () => {
      await createTag("Calistenia");
      const res = await app.inject({
        method: "POST",
        url: "/api/blog/admin/tags",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Calistenia" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("GET /admin/tags returns tags ordered by name", async () => {
      await createTag("Fuerza");
      await createTag("Avanzado");
      await createTag("Calistenia");

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/admin/tags",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const body = JSON.parse(res.body);
      const names = body.tags.map((t: { name: string }) => t.name);
      expect(names).toEqual(["Avanzado", "Calistenia", "Fuerza"]);
    });

    it("PUT /admin/tags/:id updates a tag", async () => {
      const tag = await createTag("Old Name");
      const res = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/tags/${tag.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "New Name", slug: "new-name" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("New Name");
      expect(body.slug).toBe("new-name");
    });

    it("DELETE /admin/tags/:id deletes a tag", async () => {
      const tag = await createTag("To Delete");
      const res = await app.inject({
        method: "DELETE",
        url: `/api/blog/admin/tags/${tag.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify it's gone
      const listRes = await app.inject({
        method: "GET",
        url: "/api/blog/admin/tags",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.tags).toEqual([]);
    });

    it("DELETE /admin/tags/:id cascades junction records", async () => {
      const tag = await createTag("Cascade Test");
      const post = await createPost({ title: "Tagged Post" });
      await assignTags(post.id, [tag.id]);

      // Delete the tag
      await app.inject({
        method: "DELETE",
        url: `/api/blog/admin/tags/${tag.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Verify junction records are gone (assign empty to check post has no tags)
      const postRes = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${post.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: "Tagged Post" },
      });
      const updatedPost = JSON.parse(postRes.body);
      expect(updatedPost.tags).toEqual([]);
    });

    it("returns 401 for unauthenticated tag requests", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/admin/tags",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // Tag assignment
  // ---------------------------------------------------------------
  describe("Tag Assignment", () => {
    it("PUT /admin/posts/:id/tags assigns tags to a post", async () => {
      const tag1 = await createTag("Tag One");
      const tag2 = await createTag("Tag Two");
      const post = await createPost({ title: "My Post" });

      const result = await assignTags(post.id, [tag1.id, tag2.id]);
      expect(result.tags).toHaveLength(2);
      const tagNames = result.tags.map((t: { name: string }) => t.name);
      expect(tagNames).toContain("Tag One");
      expect(tagNames).toContain("Tag Two");
    });

    it("assignTagsToPost with empty array clears all tags", async () => {
      const tag = await createTag("Temporary");
      const post = await createPost({ title: "Post" });
      await assignTags(post.id, [tag.id]);

      // Clear
      const result = await assignTags(post.id, []);
      expect(result.tags).toEqual([]);
    });

    it("assignTagsToPost replaces existing tags", async () => {
      const tag1 = await createTag("First");
      const tag2 = await createTag("Second");
      const tag3 = await createTag("Third");
      const post = await createPost({ title: "Replace Post" });

      // Assign first two
      await assignTags(post.id, [tag1.id, tag2.id]);

      // Replace with third only
      const result = await assignTags(post.id, [tag3.id]);
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0].name).toBe("Third");
    });
  });

  // ---------------------------------------------------------------
  // Public posts include tags
  // ---------------------------------------------------------------
  describe("Posts include tags", () => {
    it("GET /posts returns tags array on each published post", async () => {
      const tag = await createTag("Calistenia");
      const post = await createPost({ title: "Published Tagged" }, true);
      await assignTags(post.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts",
      });
      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(1);
      expect(body.posts[0].tags).toHaveLength(1);
      expect(body.posts[0].tags[0].name).toBe("Calistenia");
    });

    it("GET /posts/:slug returns tags array on published post", async () => {
      const tag = await createTag("Fuerza");
      const post = await createPost({ title: "Single Tagged Post" }, true);
      await assignTags(post.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${post.slug}`,
      });
      const body = JSON.parse(res.body);
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0].name).toBe("Fuerza");
    });

    it("GET /admin/posts returns tags array on each post", async () => {
      const tag = await createTag("Admin Tag");
      const post = await createPost({ title: "Admin Post" });
      await assignTags(post.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(1);
      expect(body.posts[0].tags).toHaveLength(1);
      expect(body.posts[0].tags[0].name).toBe("Admin Tag");
    });
  });

  // ---------------------------------------------------------------
  // Public tag endpoints
  // ---------------------------------------------------------------
  describe("Public Tags", () => {
    it("GET /tags returns tags with post counts (only published)", async () => {
      const tag1 = await createTag("Popular");
      const tag2 = await createTag("Empty");
      const post1 = await createPost({ title: "Post 1" }, true);
      const post2 = await createPost({ title: "Post 2" }, true);
      await createPost({ title: "Draft" }); // not published

      await assignTags(post1.id, [tag1.id]);
      await assignTags(post2.id, [tag1.id, tag2.id]);

      // tag2 has only 1 published post, tag1 has 2
      // draft post is not counted
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/tags",
      });
      const body = JSON.parse(res.body);
      // tag1 should have postCount=2 (first since ordered by count desc)
      expect(body.tags.length).toBe(2);
      expect(body.tags[0].name).toBe("Popular");
      expect(body.tags[0].postCount).toBe(2);
      expect(body.tags[1].name).toBe("Empty");
      expect(body.tags[1].postCount).toBe(1);
    });

    it("GET /tags excludes tags with no published posts", async () => {
      await createTag("Unused");

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/tags",
      });
      const body = JSON.parse(res.body);
      expect(body.tags).toEqual([]);
    });

    it("GET /tags/:slug/posts returns paginated posts for a tag", async () => {
      const tag = await createTag("Fuerza");
      const post1 = await createPost({ title: "Fuerza 1" }, true);
      const post2 = await createPost({ title: "Fuerza 2" }, true);
      await createPost({ title: "Untagged" }, true);

      await assignTags(post1.id, [tag.id]);
      await assignTags(post2.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/tags/fuerza/posts?page=1&limit=10",
      });
      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(2);
      expect(body.total).toBe(2);
      expect(body.tag.name).toBe("Fuerza");
      expect(body.tag.slug).toBe("fuerza");
    });

    it("GET /tags/:slug/posts returns 404 for nonexistent tag", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/tags/nonexistent/posts",
      });
      expect(res.statusCode).toBe(404);
    });

    it("GET /tags/:slug/posts only returns published posts", async () => {
      const tag = await createTag("Test");
      const published = await createPost({ title: "Pub" }, true);
      const draft = await createPost({ title: "Draft" });

      await assignTags(published.id, [tag.id]);
      await assignTags(draft.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: "/api/blog/tags/test/posts",
      });
      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(1);
      expect(body.posts[0].title).toBe("Pub");
    });
  });

  // ---------------------------------------------------------------
  // Related posts
  // ---------------------------------------------------------------
  describe("Related Posts", () => {
    it("GET /posts/:slug/related returns posts ranked by shared tags", async () => {
      const tag1 = await createTag("Calistenia");
      const tag2 = await createTag("Fuerza");
      const tag3 = await createTag("Skills");

      const mainPost = await createPost({ title: "Main Post" }, true);
      const highMatch = await createPost({ title: "High Match" }, true);
      const lowMatch = await createPost({ title: "Low Match" }, true);
      const noMatch = await createPost({ title: "No Match" }, true);

      // Main post has tag1, tag2, tag3
      await assignTags(mainPost.id, [tag1.id, tag2.id, tag3.id]);
      // highMatch shares tag1, tag2 (2 shared)
      await assignTags(highMatch.id, [tag1.id, tag2.id]);
      // lowMatch shares only tag1 (1 shared)
      await assignTags(lowMatch.id, [tag1.id]);
      // noMatch has no shared tags
      // (noMatch is untagged)

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${mainPost.slug}/related?limit=3`,
      });
      const body = JSON.parse(res.body);

      // highMatch should be first (2 shared), lowMatch second (1 shared)
      expect(body.posts.length).toBe(3);
      expect(body.posts[0].title).toBe("High Match");
      expect(body.posts[1].title).toBe("Low Match");
      // Third slot filled by fallback (noMatch, most recent unmatched)
      expect(body.posts[2].title).toBe("No Match");
    });

    it("related posts excludes current post", async () => {
      const tag = await createTag("Tag");
      const post = await createPost({ title: "Self" }, true);
      await assignTags(post.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${post.slug}/related?limit=3`,
      });
      const body = JSON.parse(res.body);
      const slugs = body.posts.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain(post.slug);
    });

    it("related posts falls back to recent when no shared tags", async () => {
      const post1 = await createPost({ title: "No Tags Post" }, true);
      const post2 = await createPost({ title: "Another Post" }, true);

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${post1.slug}/related?limit=3`,
      });
      const body = JSON.parse(res.body);
      // Should return post2 as fallback (recent post)
      expect(body.posts.length).toBe(1);
      expect(body.posts[0].title).toBe("Another Post");
    });

    it("related posts for nonexistent slug returns empty", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/blog/posts/nonexistent/related",
      });
      const body = JSON.parse(res.body);
      expect(body.posts).toEqual([]);
    });

    it("related posts includes tags on each related post", async () => {
      const tag = await createTag("Shared");
      const main = await createPost({ title: "Main" }, true);
      const related = await createPost({ title: "Related" }, true);

      await assignTags(main.id, [tag.id]);
      await assignTags(related.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${main.slug}/related`,
      });
      const body = JSON.parse(res.body);
      expect(body.posts[0].tags).toHaveLength(1);
      expect(body.posts[0].tags[0].name).toBe("Shared");
    });

    it("related posts respects limit parameter", async () => {
      const tag = await createTag("Common");
      const main = await createPost({ title: "Main" }, true);

      // Create 5 related posts
      for (let i = 0; i < 5; i++) {
        const p = await createPost({ title: `Related ${i}` }, true);
        await assignTags(p.id, [tag.id]);
      }
      await assignTags(main.id, [tag.id]);

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${main.slug}/related?limit=2`,
      });
      const body = JSON.parse(res.body);
      expect(body.posts.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // CTA type
  // ---------------------------------------------------------------
  describe("CTA Type", () => {
    it("POST /admin/posts creates post with default ctaType=trial", async () => {
      const post = await createPost({ title: "No CTA" });
      expect(post.ctaType).toBe("trial");
    });

    it("POST /admin/posts accepts ctaType", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/blog/admin/posts",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...validPost, ctaType: "franchise" },
      });
      const body = JSON.parse(res.body);
      expect(body.ctaType).toBe("franchise");
    });

    it("PUT /admin/posts/:id updates ctaType", async () => {
      const post = await createPost({ title: "CTA Post" });
      const res = await app.inject({
        method: "PUT",
        url: `/api/blog/admin/posts/${post.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ctaType: "app" },
      });
      const body = JSON.parse(res.body);
      expect(body.ctaType).toBe("app");
    });

    it("GET /posts/:slug returns ctaType on published post", async () => {
      const post = await createPost(
        { title: "CTA Test", ctaType: "franchise" },
        true,
      );

      const res = await app.inject({
        method: "GET",
        url: `/api/blog/posts/${post.slug}`,
      });
      const body = JSON.parse(res.body);
      expect(body.ctaType).toBe("franchise");
    });
  });
});
