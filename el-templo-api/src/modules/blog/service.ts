import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, desc, sql, and, inArray, ne } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { blogPosts } from "../../db/schema/blog-posts";
import { blogTags, blogPostTags } from "../../db/schema/blog-tags";

export type CtaType = "trial" | "franchise" | "app";

interface PostData {
  title: string;
  slug?: string;
  excerpt: string;
  coverImage?: string | null;
  body: string;
  ctaType?: CtaType;
}

interface PostUpdateData {
  title?: string;
  slug?: string;
  excerpt?: string;
  coverImage?: string | null;
  body?: string;
  status?: string;
  ctaType?: CtaType;
}

interface TagData {
  id: number;
  name: string;
  slug: string;
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
    tags: TagData[];
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

  // ---------------------------------------------------------------------------
  // Tag helpers (batch fetch tags for a list of post IDs)
  // ---------------------------------------------------------------------------

  private async getTagsForPostIds(
    postIds: number[],
  ): Promise<Map<number, TagData[]>> {
    const result = new Map<number, TagData[]>();
    if (postIds.length === 0) return result;

    const rows = await this.db
      .select({
        postId: blogPostTags.postId,
        tagId: blogTags.id,
        tagName: blogTags.name,
        tagSlug: blogTags.slug,
      })
      .from(blogPostTags)
      .innerJoin(blogTags, eq(blogPostTags.tagId, blogTags.id))
      .where(inArray(blogPostTags.postId, postIds));

    for (const row of rows) {
      const existing = result.get(row.postId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName, slug: row.tagSlug });
      result.set(row.postId, existing);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Public post queries
  // ---------------------------------------------------------------------------

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

    const postIds = rows.map((r) => r.id);
    const tagsMap = await this.getTagsForPostIds(postIds);

    const posts = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      coverImage: row.coverImage,
      publishedAt: row.publishedAt,
      readingTime: computeReadingTime(row.body),
      tags: tagsMap.get(row.id) ?? [],
    }));

    return {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPostById(id: number) {
    const [post] = await this.db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);
    if (!post) return null;
    const tagsMap = await this.getTagsForPostIds([post.id]);
    return {
      ...post,
      readingTime: computeReadingTime(post.body),
      tags: tagsMap.get(post.id) ?? [],
    };
  }

  async getPublishedPostBySlug(slug: string) {
    const [post] = await this.db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")));

    if (!post) return null;

    const tagsMap = await this.getTagsForPostIds([post.id]);

    return {
      ...post,
      readingTime: computeReadingTime(post.body),
      tags: tagsMap.get(post.id) ?? [],
    };
  }

  // ---------------------------------------------------------------------------
  // Admin post queries
  // ---------------------------------------------------------------------------

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

    const postIds = rows.map((r) => r.id);
    const tagsMap = await this.getTagsForPostIds(postIds);

    const posts = rows.map((row) => ({
      ...row,
      readingTime: computeReadingTime(row.body),
      tags: tagsMap.get(row.id) ?? [],
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
      ctaType: data.ctaType ?? "trial",
    });

    const [created] = await this.db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug));

    this.log.info({ slug }, "Blog post created");
    return {
      ...created,
      readingTime: computeReadingTime(created.body),
      tags: [] as TagData[],
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

    const updateValues: Partial<typeof blogPosts.$inferInsert> = {};
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.slug !== undefined) updateValues.slug = data.slug;
    if (data.excerpt !== undefined) updateValues.excerpt = data.excerpt;
    if (data.coverImage !== undefined)
      updateValues.coverImage = data.coverImage;
    if (data.body !== undefined) updateValues.body = data.body;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.ctaType !== undefined) updateValues.ctaType = data.ctaType;

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

    const tagsMap = await this.getTagsForPostIds([updated.id]);

    return {
      ...updated,
      readingTime: computeReadingTime(updated.body),
      tags: tagsMap.get(updated.id) ?? [],
    };
  }

  async deletePost(id: number) {
    // Delete tag associations first
    await this.db.delete(blogPostTags).where(eq(blogPostTags.postId, id));
    await this.db.delete(blogPosts).where(eq(blogPosts.id, id));
    this.log.info({ id }, "Blog post deleted");
  }

  // ---------------------------------------------------------------------------
  // Tag CRUD
  // ---------------------------------------------------------------------------

  async listTags(): Promise<TagData[]> {
    const rows = await this.db
      .select({
        id: blogTags.id,
        name: blogTags.name,
        slug: blogTags.slug,
      })
      .from(blogTags)
      .orderBy(blogTags.name);

    return rows;
  }

  async listTagsWithPosts(): Promise<
    Array<{ id: number; name: string; slug: string; postCount: number }>
  > {
    const rows = await this.db
      .select({
        id: blogTags.id,
        name: blogTags.name,
        slug: blogTags.slug,
        postCount: sql<number>`count(DISTINCT ${blogPostTags.postId})`,
      })
      .from(blogTags)
      .innerJoin(blogPostTags, eq(blogTags.id, blogPostTags.tagId))
      .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
      .where(eq(blogPosts.status, "published"))
      .groupBy(blogTags.id, blogTags.name, blogTags.slug)
      .orderBy(desc(sql`count(DISTINCT ${blogPostTags.postId})`));

    return rows;
  }

  async createTag(data: { name: string; slug?: string }): Promise<TagData> {
    const tagSlug = data.slug || slugify(data.name);

    // Check for duplicate slug
    const [existing] = await this.db
      .select({ id: blogTags.id })
      .from(blogTags)
      .where(eq(blogTags.slug, tagSlug));

    if (existing) {
      throw new Error(`Tag with slug "${tagSlug}" already exists`);
    }

    await this.db.insert(blogTags).values({
      name: data.name,
      slug: tagSlug,
    });

    const [created] = await this.db
      .select({
        id: blogTags.id,
        name: blogTags.name,
        slug: blogTags.slug,
      })
      .from(blogTags)
      .where(eq(blogTags.slug, tagSlug));

    this.log.info({ slug: tagSlug }, "Blog tag created");
    return created;
  }

  async updateTag(
    id: number,
    data: { name?: string; slug?: string },
  ): Promise<TagData | null> {
    const updateValues: Partial<typeof blogTags.$inferInsert> = {};
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.slug !== undefined) updateValues.slug = data.slug;

    if (Object.keys(updateValues).length === 0) {
      const [tag] = await this.db
        .select({ id: blogTags.id, name: blogTags.name, slug: blogTags.slug })
        .from(blogTags)
        .where(eq(blogTags.id, id));
      return tag ?? null;
    }

    // Check for duplicate slug if slug is being updated
    if (data.slug) {
      const [existing] = await this.db
        .select({ id: blogTags.id })
        .from(blogTags)
        .where(and(eq(blogTags.slug, data.slug), ne(blogTags.id, id)));

      if (existing) {
        throw new Error(`Tag with slug "${data.slug}" already exists`);
      }
    }

    await this.db.update(blogTags).set(updateValues).where(eq(blogTags.id, id));

    const [updated] = await this.db
      .select({ id: blogTags.id, name: blogTags.name, slug: blogTags.slug })
      .from(blogTags)
      .where(eq(blogTags.id, id));

    if (!updated) return null;

    this.log.info({ id }, "Blog tag updated");
    return updated;
  }

  async deleteTag(id: number): Promise<void> {
    // Delete junction records first
    await this.db.delete(blogPostTags).where(eq(blogPostTags.tagId, id));

    await this.db.delete(blogTags).where(eq(blogTags.id, id));
    this.log.info({ id }, "Blog tag deleted");
  }

  // ---------------------------------------------------------------------------
  // Tag assignment
  // ---------------------------------------------------------------------------

  async assignTagsToPost(postId: number, tagIds: number[]): Promise<TagData[]> {
    // Delete all existing tags for this post
    await this.db.delete(blogPostTags).where(eq(blogPostTags.postId, postId));

    // Insert new tag associations
    if (tagIds.length > 0) {
      await this.db
        .insert(blogPostTags)
        .values(tagIds.map((tagId) => ({ postId, tagId })));
    }

    // Return the updated tags
    const tagsMap = await this.getTagsForPostIds([postId]);
    return tagsMap.get(postId) ?? [];
  }

  async getPostTags(postId: number): Promise<TagData[]> {
    const tagsMap = await this.getTagsForPostIds([postId]);
    return tagsMap.get(postId) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Related posts
  // ---------------------------------------------------------------------------

  async getRelatedPosts(slug: string, limit: number = 3) {
    // Find the current post
    const [currentPost] = await this.db
      .select({
        id: blogPosts.id,
        slug: blogPosts.slug,
      })
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug));

    if (!currentPost) return [];

    // Get current post's tag IDs
    const currentTags = await this.db
      .select({ tagId: blogPostTags.tagId })
      .from(blogPostTags)
      .where(eq(blogPostTags.postId, currentPost.id));

    const currentTagIds = currentTags.map((t) => t.tagId);

    let relatedPosts: Array<{
      id: number;
      title: string;
      slug: string;
      excerpt: string;
      coverImage: string | null;
      publishedAt: Date | null;
      body: string;
    }> = [];

    if (currentTagIds.length > 0) {
      // Find posts that share tags, ranked by shared tag count
      const tagMatchRows = await this.db
        .select({
          postId: blogPostTags.postId,
          sharedCount: sql<number>`count(*)`,
        })
        .from(blogPostTags)
        .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
        .where(
          and(
            inArray(blogPostTags.tagId, currentTagIds),
            ne(blogPostTags.postId, currentPost.id),
            eq(blogPosts.status, "published"),
          ),
        )
        .groupBy(blogPostTags.postId)
        .orderBy(desc(sql`count(*)`), desc(blogPosts.publishedAt))
        .limit(limit);

      if (tagMatchRows.length > 0) {
        const matchedPostIds = tagMatchRows.map((r) => r.postId);
        const posts = await this.db
          .select({
            id: blogPosts.id,
            title: blogPosts.title,
            slug: blogPosts.slug,
            excerpt: blogPosts.excerpt,
            coverImage: blogPosts.coverImage,
            publishedAt: blogPosts.publishedAt,
            body: blogPosts.body,
          })
          .from(blogPosts)
          .where(inArray(blogPosts.id, matchedPostIds));

        // Preserve the order from tagMatchRows
        const postMap = new Map(posts.map((p) => [p.id, p]));
        for (const row of tagMatchRows) {
          const post = postMap.get(row.postId);
          if (post) relatedPosts.push(post);
        }
      }
    }

    // Fallback: fill remaining slots with recent published posts
    if (relatedPosts.length < limit) {
      const excludeIds = [currentPost.id, ...relatedPosts.map((p) => p.id)];
      const remaining = limit - relatedPosts.length;

      const fallbackPosts = await this.db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          excerpt: blogPosts.excerpt,
          coverImage: blogPosts.coverImage,
          publishedAt: blogPosts.publishedAt,
          body: blogPosts.body,
        })
        .from(blogPosts)
        .where(
          and(
            eq(blogPosts.status, "published"),
            sql`${blogPosts.id} NOT IN (${sql.join(
              excludeIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .orderBy(desc(blogPosts.publishedAt))
        .limit(remaining);

      relatedPosts = [...relatedPosts, ...fallbackPosts];
    }

    // Fetch tags for all related posts
    const relatedIds = relatedPosts.map((p) => p.id);
    const tagsMap = await this.getTagsForPostIds(relatedIds);

    return relatedPosts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      coverImage: post.coverImage,
      publishedAt: post.publishedAt,
      readingTime: computeReadingTime(post.body),
      tags: tagsMap.get(post.id) ?? [],
    }));
  }

  // ---------------------------------------------------------------------------
  // Posts by tag
  // ---------------------------------------------------------------------------

  async listPostsByTag(tagSlug: string, page: number, limit: number) {
    // Find the tag
    const [tag] = await this.db
      .select({
        id: blogTags.id,
        name: blogTags.name,
        slug: blogTags.slug,
      })
      .from(blogTags)
      .where(eq(blogTags.slug, tagSlug));

    if (!tag) return null;

    const offset = (page - 1) * limit;

    // Count published posts with this tag
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(blogPostTags)
      .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
      .where(
        and(eq(blogPostTags.tagId, tag.id), eq(blogPosts.status, "published")),
      );

    const total = countResult.count;

    // Fetch paginated posts
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
      .from(blogPostTags)
      .innerJoin(blogPosts, eq(blogPostTags.postId, blogPosts.id))
      .where(
        and(eq(blogPostTags.tagId, tag.id), eq(blogPosts.status, "published")),
      )
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset(offset);

    const postIds = rows.map((r) => r.id);
    const tagsMap = await this.getTagsForPostIds(postIds);

    const posts = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      coverImage: row.coverImage,
      publishedAt: row.publishedAt,
      readingTime: computeReadingTime(row.body),
      tags: tagsMap.get(row.id) ?? [],
    }));

    return {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      tag,
    };
  }
}
