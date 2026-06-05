import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TreeCategory, TreeProgressResponse } from '../types'

/**
 * Pinia store for the member skill-tree progress view ("Mi Árbol", Phase 127).
 *
 * Holds the server response of GET /api/tree-progress/me plus loading/error
 * state. The store is render-only: it stores the categories verbatim and never
 * computes percentages (D-05). Uses the Composition API pattern for consistency
 * with the existing progression store.
 */
export const useTreeProgressStore = defineStore('treeProgress', () => {
  /** Categories (Tracción → Empuje → Piernas → Core → Movilidad) from the server. */
  const categories = ref<TreeCategory[]>([])

  /** Loading state for the tree fetch. */
  const loading = ref(false)

  /** Last error message from the tree fetch, or null. */
  const error = ref<string | null>(null)

  /**
   * Replace the tree data from an API response.
   *
   * @param response - Full GET /api/tree-progress/me payload
   */
  function setTree(response: TreeProgressResponse) {
    categories.value = response.categories
    error.value = null
  }

  /**
   * Set loading state.
   *
   * @param state - Loading state value
   */
  function setLoading(state: boolean) {
    loading.value = state
  }

  /**
   * Set error state.
   *
   * @param message - Error message or null to clear
   */
  function setError(message: string | null) {
    error.value = message
  }

  /** Reset all state to initial values. */
  function reset() {
    categories.value = []
    loading.value = false
    error.value = null
  }

  return {
    // State
    categories,
    loading,
    error,
    // Actions
    setTree,
    setLoading,
    setError,
    reset,
  }
})
