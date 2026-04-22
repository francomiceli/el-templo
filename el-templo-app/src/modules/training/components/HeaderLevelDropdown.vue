<template>
  <div
    class="header-greeting__badge header-level-dropdown cursor-pointer"
    role="button"
    tabindex="0"
  >
    <span class="header-greeting__symbol">{{ greek }}</span>
    <span class="header-greeting__level-row">
      <span class="header-greeting__level">{{ displayName }}</span>
      <q-icon name="keyboard_arrow_down" size="xs" class="header-level-dropdown__chevron" />
    </span>
    <q-menu fit anchor="bottom right" self="top right">
      <q-list style="min-width: 180px">
        <q-item
          v-for="lvl in TRAINING_LEVELS"
          :key="lvl"
          v-close-popup
          clickable
          :class="{ 'q-item--selected-level': lvl === activeLevel }"
          @click="onSelect(lvl)"
        >
          <q-item-section>
            {{ LEVEL_DISPLAY_MAP[lvl]
            }}<span v-if="lvl === ownLevel" class="text-caption text-grey-7 q-ml-xs">
              (Tu Nivel)</span
            >
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from 'src/stores/useUserStore'
import {
  TRAINING_LEVELS,
  LEVEL_GREEK_MAP,
  LEVEL_DISPLAY_MAP,
  type Level,
} from 'src/modules/training/level-display'

const userStore = useUserStore()

const activeLevel = computed<Level | null>(() => userStore.activeLevel)
const ownLevel = computed<Level | null>(() => {
  const lvl = userStore.profile?.level
  return lvl ? (lvl as Level) : null
})
const greek = computed(() => (activeLevel.value ? LEVEL_GREEK_MAP[activeLevel.value] : ''))
const displayName = computed(() => (activeLevel.value ? LEVEL_DISPLAY_MAP[activeLevel.value] : ''))

async function onSelect(lvl: Level): Promise<void> {
  await userStore.setLevel(lvl)
}
</script>

<style lang="scss" scoped>
@import 'src/css/_brand.scss';

.header-level-dropdown {
  cursor: pointer;
  user-select: none;

  &__chevron {
    color: #fff;
    opacity: 0.85;
    margin-left: 2px;
    vertical-align: middle;
  }
}

.header-greeting__level-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

:deep(.q-item--selected-level) {
  background: rgba($brand-aged-gold, 0.15);
}
</style>
