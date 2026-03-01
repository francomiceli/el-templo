import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, desc, sql, and } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { blogPosts } from "../../db/schema/blog-posts";

interface PostData {
  title: string;
  slug?: string;
  excerpt: string;
  coverImage?: string | null;
  body: string;
}

interface PostUpdateData {
  title?: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string | null;
  body?: string;
  status?: string;
}

interface PaginatedPosts {
  posts: Array<{
    id: number;
    title: string;
    slug: string;
    excerpt: string;
    coverImage: string | null;
    publishedAt: Date | null;
    readingTime: number;
  }>;
  total: number;
  page: number;
  totalPages: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "") // strip special chars
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

function computeReadingTime(body: string): number {
  const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export class BlogService {
  private db: MySql2Database<typeof schema>;
  private log: FastifyBaseLogger;

  constructor(db: MySql2Database<typeof schema>, log: FastifyBaseLogger) {
    this.db = db;
    this.log = log;
  }

  async listPublishedPosts(
    page: number,
    limit: number,
  ): Promise<PaginatedPosts> {
    const offset = (page - 1) * limit;

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"));

    const total = countResult.count;

    const rows = await this.db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        coverImage: blogPosts.coverImage,
        body: blogPosts.body,
        publishedAt: blogPosts.publishedAt,
      })
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset(offset);

    const posts = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      coverImage: row.coverImage,
      publishedAt: row.publishedAt,
      readingTime: computeReadingTime(row.body),
    }));

    return {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublishedPostBySlug(slug: string) {
    const [post] = await this.db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")));

    if (!post) return null;

    return {
      ...post,
      readingTime: computeReadingTime(post.body),
    };
  }

  async listAllPosts(page: number, limit: number, statusFilter?: string) {
    const offset = (page - 1) * limit;

    const conditions =
      statusFilter && statusFilter !== "all"
        ? eq(blogPosts.status, statusFilter)
        : undefined;

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(blogPosts)
      .where(conditions);

    const total = countResult.count;

    const rows = await this.db
      .select()
      .from(blogPosts)
      .where(conditions)
      .orderBy(desc(blogPosts.updatedAt))
      .limit(limit)
      .offset(offset);

    const posts = rows.map((row) => ({
      ...row,
      readingTime: computeReadingTime(row.body),
    }));

    return {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createPost(data: PostData) {
    const slug = data.slug || slugify(data.title);

    await this.db.insert(blogPosts).values({
      title: data.title,
      slug,
      excerpt: data.excerpt,
      coverImage: data.coverImage ?? null,
      body: data.body,
      status: "draft",
    });

    const [created] = await this.db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug));

    this.log.info({ slug }, "Blog post created");
    return {
      ...created,
      readingTime: computeReadingTime(created.body),
    };
  }

  async updatePost(id: number, data: PostUpdateData) {
    // If status is changing to published and published_at is not set, set it
    if (data.status === "published") {
      const [existing] = await this.db
        .select({ publishedAt: blogPosts.publishedAt })
        .from(blogPosts)
        .where(eq(blogPosts.id, id));

      if (existing && !existing.publishedAt) {
        data = { ...data };
        // We'll set published_at in the update
      }
    }

    const updateValues: Record<string, unknown> = {};
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.slug !== undefined) updateValues.slug = data.slug;
    if (data.excerpt !== undefined) updateValues.excerpt = data.excerpt;
    if (data.coverImage !== undefined)
      updateValues.coverImage = data.coverImage;
    if (data.body !== undefined) updateValues.body = data.body;
    if (data.status !== undefined) updateValues.status = data.status;

    // Handle published_at: set when publishing for the first time
    if (data.status === "published") {
      const [existing] = await this.db
        .select({ publishedAt: blogPosts.publishedAt })
        .from(blogPosts)
        .where(eq(blogPosts.id, id));

      if (existing && !existing.publishedAt) {
        updateValues.publishedAt = new Date();
      }
    }

    await this.db
      .update(blogPosts)
      .set(updateValues)
      .where(eq(blogPosts.id, id));

    const [updated] = await this.db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id));

    this.log.info({ id }, "Blog post updated");
    if (!updated) return null;

    return {
      ...updated,
      readingTime: computeReadingTime(updated.body),
    };
  }

  async deletePost(id: number) {
    await this.db.delete(blogPosts).where(eq(blogPosts.id, id));
    this.log.info({ id }, "Blog post deleted");
  }
}
