/**
 * Settings API composable.
 * Placeholder for future system settings management.
 * Grace period methods removed in Phase 61.
 */

import { ref } from 'vue';

export function useSettingsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    cleanup,
  };
}
