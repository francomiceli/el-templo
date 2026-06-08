<template>
  <q-card class="tree-category" flat bordered>
    <q-card-section class="tree-category__header">
      <div class="tree-category__title">{{ category.label }}</div>
      <div class="tree-category__ring-wrap">
        <q-circular-progress
          :value="category.percent"
          :max="100"
          size="48px"
          :thickness="0.18"
          color="primary"
          show-value
          class="tree-category__ring"
        >
          <span class="tree-category__ring-value">{{ category.percent }}%</span>
        </q-circular-progress>
        <span class="tree-category__ring-caption">a tu alcance</span>
      </div>
    </q-card-section>

    <q-card-section class="tree-category__body">
      <template v-if="category.subfamilies.length > 0">
        <SubfamilyProgressRow
          v-for="subfamily in category.subfamilies"
          :key="subfamily.id"
          :subfamily="subfamily"
        />
      </template>
      <div v-else class="tree-category__empty">Sin familias todavía</div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
/**
 * TreeCategorySection component (Phase 127).
 *
 * Renders one of the 5 thematic categories: a header showing the category label
 * and its server-provided percentage (as a circular progress ring), followed by
 * its subfamilies as SubfamilyProgressRow rows. A category with no subfamilies
 * still renders its header (percent 0). Computes NOTHING — `category.percent`
 * comes straight from the server (D-05).
 */
import type { TreeCategory } from '../types'
import SubfamilyProgressRow from './SubfamilyProgressRow.vue'

interface Props {
  /** Category data from GET /api/tree-progress/me */
  category: TreeCategory
}

defineProps<Props>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.tree-category {
  background-color: $cream !important;
  border-color: rgba($secondary, 0.3) !important;
  border-radius: 12px;
  margin-bottom: 16px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid rgba($secondary, 0.15);
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: $primary;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  &__ring-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  &__ring-value {
    font-size: 12px;
    font-weight: 700;
    color: $secondary;
  }

  &__ring-caption {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba($accent, 0.5);
  }

  &__body {
    padding: 4px 16px 12px;
  }

  &__empty {
    padding: 12px 0;
    font-size: 13px;
    font-style: italic;
    color: rgba($accent, 0.5);
  }
}
</style>
