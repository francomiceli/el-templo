import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { Notify } from 'quasar'
import { useTreeProgressStore } from '../stores/treeProgressStore'
import { extractError } from 'src/utils/extract-error'
import type { TreeProgressResponse } from '../types'

/**
 * Composable for the member skill-tree progress API ("Mi Árbol", Phase 127).
 *
 * Fetches GET /api/tree-progress/me and writes the response into the tree
 * progress store. The client renders only — it never computes percentages
 * (D-05). Per project convention this composable exposes a `cleanup()` method
 * and registers no Vue lifecycle hooks internally (the consuming component owns
 * the lifecycle).
 */
export function useTreeProgressApi() {
  const treeProgressStore = useTreeProgressStore()
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch the member's tree advancement.
   *
   * Retrieves the 5 thematic categories with their subfamilies and nodes, each
   * carrying a server-computed percentage. Updates the tree progress store with
   * the response data. Shows a Notify toast on failure.
   */
  async function fetchTree(): Promise<void> {
    loading.value = true
    error.value = null
    treeProgressStore.setLoading(true)
    treeProgressStore.setError(null)

    try {
      const response = await api.get<TreeProgressResponse>('/tree-progress/me')
      treeProgressStore.setTree(response.data)
    } catch (err: unknown) {
      const errorMessage = extractError(err, 'Error cargando tu árbol')
      error.value = errorMessage
      treeProgressStore.setError(errorMessage)

      Notify.create({
        type: 'negative',
        message: errorMessage,
        position: 'top',
      })
    } finally {
      loading.value = false
      treeProgressStore.setLoading(false)
    }
  }

  /**
   * Reset composable-local refs.
   *
   * Exposed per project convention so the consuming component can clear state
   * on unmount without this composable registering its own lifecycle hook.
   */
  function cleanup(): void {
    loading.value = false
    error.value = null
  }

  return {
    fetchTree,
    cleanup,
    loading,
    error,
  }
}
