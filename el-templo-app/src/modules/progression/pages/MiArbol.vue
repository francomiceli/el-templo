<template>
  <q-page class="mi-arbol">
    <header class="mi-arbol__intro">
      <h1 class="mi-arbol__title">Mi Árbol</h1>
      <p class="mi-arbol__subtitle">Tu avance por cada familia de ejercicios</p>
      <p class="mi-arbol__disclaimer">
        El anillo mide lo que tenés <strong>a tu alcance</strong> por tu nivel. El verde
        <q-icon name="check_circle" size="13px" class="mi-arbol__disclaimer-icon" />
        <strong>Dominado</strong> marca lo que ya conquistaste con evidencia: son cosas distintas.
      </p>
    </header>

    <!-- Loading State -->
    <div v-if="treeProgressStore.loading" class="mi-arbol__loading">
      <TemploLoader size="lg" />
      <p class="mi-arbol__loading-text">Cargando tu árbol...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="treeProgressStore.error" class="mi-arbol__error">
      <q-icon name="error_outline" class="mi-arbol__error-icon" />
      <p class="mi-arbol__error-text">{{ treeProgressStore.error }}</p>
      <q-btn color="primary" unelevated no-caps @click="fetchTree"> Reintentar </q-btn>
    </div>

    <!-- Empty State -->
    <div v-else-if="treeProgressStore.categories.length === 0" class="mi-arbol__empty">
      <q-icon name="park" class="mi-arbol__empty-icon" />
      <p class="mi-arbol__empty-text">Todavía no hay datos de tu árbol.</p>
    </div>

    <!-- Content State: categories in backend order -->
    <div v-else class="mi-arbol__content">
      <TreeCategorySection
        v-for="category in treeProgressStore.categories"
        :key="category.key"
        :category="category"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * MiArbol page (Phase 127, TREE-06).
 *
 * The member-facing "Mi Árbol" view. On mount it fetches GET
 * /api/tree-progress/me and renders the 5 thematic categories — in the exact
 * order returned by the backend — each as a TreeCategorySection with its
 * subfamily rows. Every percentage and reached state is server-computed; this
 * view only renders (D-05).
 */
import { onMounted, onUnmounted } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import { useTreeProgressApi } from '../composables/useTreeProgressApi'
import { useTreeProgressStore } from '../stores/treeProgressStore'
import TreeCategorySection from '../components/TreeCategorySection.vue'

const treeProgressStore = useTreeProgressStore()
const { fetchTree, cleanup } = useTreeProgressApi()

onMounted(() => {
  fetchTree()
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-arbol {
  padding: 16px;
  background-color: $cream;

  &__intro {
    margin-bottom: 16px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: $primary;
    margin: 0 0 4px;
  }

  &__subtitle {
    font-size: 14px;
    color: rgba($accent, 0.7);
    margin: 0;
  }

  &__disclaimer {
    font-size: 12px;
    line-height: 1.45;
    color: rgba($accent, 0.65);
    margin: 8px 0 0;

    strong {
      color: $accent;
      font-weight: 700;
    }
  }

  &__disclaimer-icon {
    color: $positive;
    vertical-align: text-bottom;
  }

  &__loading,
  &__error,
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 48px 16px;
    gap: 12px;
  }

  &__loading-text,
  &__error-text,
  &__empty-text {
    font-size: 14px;
    color: rgba($accent, 0.7);
    margin: 0;
  }

  &__error-icon,
  &__empty-icon {
    font-size: 40px;
    color: rgba($secondary, 0.6);
  }
}
</style>
