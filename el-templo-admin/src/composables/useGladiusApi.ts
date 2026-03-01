import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';

const log = createLogger('useGladiusApi');

export interface GladiusProduct {
  id: number;
  name: string;
  slug: string;
  description: string;
  photo: string | null;
  status: 'published' | 'unpublished';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGladiusProductData {
  name: string;
  description: string;
  photo?: string;
  slug?: string;
  sortOrder?: number;
}

export type UpdateGladiusProductData = Partial<CreateGladiusProductData> & {
  status?: 'published' | 'unpublished';
};

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useGladiusApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listProducts(): Promise<GladiusProduct[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<GladiusProduct[]>('/gladius/admin/products');
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando productos');
      error.value = message;
      log.error('Failed to fetch products', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createProduct(data: CreateGladiusProductData): Promise<GladiusProduct> {
    loading.value = true;
    error.value = null;
    try {
      const { data: product } = await api.post<GladiusProduct>('/gladius/admin/products', data);
      return product;
    } catch (err: unknown) {
      const message = extractError(err, 'Error creando producto');
      error.value = message;
      log.error('Failed to create product', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateProduct(
    id: number,
    data: UpdateGladiusProductData
  ): Promise<GladiusProduct> {
    loading.value = true;
    error.value = null;
    try {
      const { data: product } = await api.put<GladiusProduct>(
        `/gladius/admin/products/${id}`,
        data
      );
      return product;
    } catch (err: unknown) {
      const message = extractError(err, 'Error actualizando producto');
      error.value = message;
      log.error('Failed to update product', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteProduct(id: number): Promise<void> {
    try {
      await api.delete(`/gladius/admin/products/${id}`);
    } catch (err: unknown) {
      const message = extractError(err, 'Error eliminando producto');
      log.error('Failed to delete product', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  return {
    loading,
    error,
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}
