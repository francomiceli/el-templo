/**
 * Settings API composable.
 * Provides methods for segment threshold configuration.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { SegmentThresholds } from 'src/types/member';

export function useSettingsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getSegmentThresholds(): Promise<SegmentThresholds> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SegmentThresholds>('/admin/settings/segments');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando configuracion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateSegmentThresholds(thresholds: Partial<SegmentThresholds>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put('/admin/settings/segments', thresholds);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando configuracion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getSegmentThresholds, updateSegmentThresholds, cleanup };
}
