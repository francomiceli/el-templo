import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';

const log = createLogger('useBlogApi');

export interface BlogTag {
  id: number;
  name: string;
  slug: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  body: string | null;
  status: 'draft' | 'published';
  readingTime?: number;
  ctaType?: 'trial' | 'franchise' | 'app';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tags?: BlogTag[];
}

export interface BlogPostListResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateBlogPostData {
  title: string;
  excerpt?: string;
  body?: string;
  coverImage?: string;
  slug?: string;
  ctaType?: string;
}

export type UpdateBlogPostData = Partial<CreateBlogPostData> & {
  status?: 'draft' | 'published';
};

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useBlogApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listPosts(params?: {
    page?: number;
    limit?: number;
    status?: 'all' | 'draft' | 'published';
  }): Promise<BlogPostListResponse> {
    loading.value = true;
    error.value = null;
    try {
      const queryParams: Record<string, unknown> = {};
      if (params?.page != null) queryParams.page = params.page;
      if (params?.limit != null) queryParams.limit = params.limit;
      if (params?.status && params.status !== 'all') queryParams.status = params.status;

      const { data } = await api.get<BlogPostListResponse>('/blog/admin/posts', {
        params: queryParams,
      });
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando posts');
      error.value = message;
      log.error('Failed to fetch posts', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getPost(id: number): Promise<BlogPost> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<BlogPost>(`/blog/admin/posts/${id}`);
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando post');
      error.value = message;
      log.error('Failed to fetch post', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createPost(data: CreateBlogPostData): Promise<BlogPost> {
    loading.value = true;
    error.value = null;
    try {
      const { data: post } = await api.post<BlogPost>('/blog/admin/posts', data);
      return post;
    } catch (err: unknown) {
      const message = extractError(err, 'Error creando post');
      error.value = message;
      log.error('Failed to create post', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updatePost(id: number, data: UpdateBlogPostData): Promise<BlogPost> {
    loading.value = true;
    error.value = null;
    try {
      const { data: post } = await api.put<BlogPost>(`/blog/admin/posts/${id}`, data);
      return post;
    } catch (err: unknown) {
      const message = extractError(err, 'Error actualizando post');
      error.value = message;
      log.error('Failed to update post', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deletePost(id: number): Promise<void> {
    try {
      await api.delete(`/blog/admin/posts/${id}`);
    } catch (err: unknown) {
      const message = extractError(err, 'Error eliminando post');
      log.error('Failed to delete post', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function publishPost(id: number): Promise<BlogPost> {
    return updatePost(id, { status: 'published' });
  }

  async function unpublishPost(id: number): Promise<BlogPost> {
    return updatePost(id, { status: 'draft' });
  }

  // =========================================================================
  // Tag management
  // =========================================================================

  async function listAdminTags(): Promise<{ tags: BlogTag[] }> {
    try {
      const { data } = await api.get<{ tags: BlogTag[] }>('/blog/admin/tags');
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando tags');
      log.error('Failed to fetch tags', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function createTag(data: { name: string; slug?: string }): Promise<BlogTag> {
    try {
      const { data: tag } = await api.post<BlogTag>('/blog/admin/tags', data);
      return tag;
    } catch (err: unknown) {
      const message = extractError(err, 'Error creando tag');
      log.error('Failed to create tag', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function updateTag(id: number, data: { name?: string; slug?: string }): Promise<BlogTag> {
    try {
      const { data: tag } = await api.put<BlogTag>(`/blog/admin/tags/${id}`, data);
      return tag;
    } catch (err: unknown) {
      const message = extractError(err, 'Error actualizando tag');
      log.error('Failed to update tag', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function deleteTag(id: number): Promise<void> {
    try {
      await api.delete(`/blog/admin/tags/${id}`);
    } catch (err: unknown) {
      const message = extractError(err, 'Error eliminando tag');
      log.error('Failed to delete tag', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function assignPostTags(postId: number, tagIds: number[]): Promise<{ tags: BlogTag[] }> {
    try {
      const { data } = await api.put<{ tags: BlogTag[] }>(`/blog/admin/posts/${postId}/tags`, {
        tagIds,
      });
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error asignando tags');
      log.error('Failed to assign tags', { postId, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  return {
    loading,
    error,
    listPosts,
    getPost,
    createPost,
    updatePost,
    deletePost,
    publishPost,
    unpublishPost,
    listAdminTags,
    createTag,
    updateTag,
    deleteTag,
    assignPostTags,
  };
}
