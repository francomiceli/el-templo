<template>
  <div
    class="header-greeting__badge header-level-dropdown cursor-pointer"
    role="button"
    tabindex="0"
  >
    <q-icon name="keyboard_arrow_down" class="header-level-dropdown__chevron" />
    <div class="header-greeting__badge-stack">
      <span class="header-greeting__symbol">{{ greek }}</span>
      <span class="header-greeting__level">{{ displayName }}</span>
    </div>
    <q-menu fit anchor="bottom right" self="top right" class="level-menu" :offset="[0, 8]">
      <q-list class="level-menu__list">
        <!-- SPEC "Empezá acá" A3: aclarar la diferencia entre el nivel que
             se está VIENDO y el nivel real del socio, sin cambiar la
             lógica de selección de abajo. -->
        <div class="level-menu__banner">
          <div class="level-menu__banner-row">
            <span class="level-menu__banner-label">Tu nivel:</span>
            <span class="level-menu__banner-value">{{ ownDisplayName }}</span>
          </div>
          <div v-if="isViewingOther" class="level-menu__banner-row level-menu__banner-row--viewing">
            <span class="level-menu__banner-label">Estás viendo:</span>
            <span class="level-menu__banner-value">{{ displayName }}</span>
          </div>
        </div>
        <q-separator class="level-menu__banner-separator" />

        <q-item
          v-for="lvl in TRAINING_LEVELS"
          :key="lvl"
          v-close-popup
          clickable
          class="level-menu__item"
          :class="{ 'level-menu__item--selected': lvl === activeLevel }"
          @click="onSelect(lvl)"
        >
          <q-item-section avatar class="level-menu__greek">
            {{ LEVEL_GREEK_MAP[lvl] }}
          </q-item-section>
          <q-item-section>
            <span class="level-menu__label">{{ LEVEL_DISPLAY_MAP[lvl] }}</span>
            <span v-if="lvl === ownLevel" class="level-menu__own">Tu Nivel</span>
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuasar } from 'quasar'
import { useUserStore } from 'src/stores/useUserStore'
import {
  TRAINING_LEVELS,
  LEVEL_GREEK_MAP,
  LEVEL_DISPLAY_MAP,
  type Level,
} from 'src/modules/training/level-display'

const $q = useQuasar()
const userStore = useUserStore()

const activeLevel = computed<Level | null>(() => userStore.activeLevel)
const ownLevel = computed<Level | null>(() => {
  const lvl = userStore.profile?.level
  return lvl ? (lvl as Level) : null
})
const greek = computed(() => (activeLevel.value ? LEVEL_GREEK_MAP[activeLevel.value] : ''))
const displayName = computed(() => (activeLevel.value ? LEVEL_DISPLAY_MAP[activeLevel.value] : ''))

// SPEC "Empezá acá" A3: el badge del header YA muestra `activeLevel` (lo que
// se está viendo); el menú aclara además cuál es el nivel REAL del socio y,
// si difiere, que está viendo otro. Pura presentación — no toca setLevel.
const ownDisplayName = computed(() => (ownLevel.value ? LEVEL_DISPLAY_MAP[ownLevel.value] : ''))
const isViewingOther = computed(
  () => !!activeLevel.value && !!ownLevel.value && activeLevel.value !== ownLevel.value,
)

async function onSelect(lvl: Level): Promise<void> {
  if (lvl === activeLevel.value) return
  await userStore.setLevel(lvl)
  $q.notify({
    type: 'positive',
    message: `Nivel cambiado a ${LEVEL_DISPLAY_MAP[lvl]}`,
    position: 'top',
    timeout: 2000,
  })
}
</script>

<style lang="scss" scoped>
@import 'src/css/_brand.scss';

.header-level-dropdown.header-greeting__badge {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  opacity: 0.6;
  padding-bottom: 2px;
  margin-right: 6px;
}

.header-greeting__badge-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header-greeting__symbol {
  font-size: 32px;
  color: #fff;
  line-height: 1;
}

.header-greeting__level {
  font-size: 8px;
  color: #fff;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.header-level-dropdown {
  cursor: pointer;
  user-select: none;

  &__chevron {
    color: #fff;
    opacity: 0.85;
    vertical-align: middle;
    font-size: 24px;
    padding-right: 6px;
  }
}

:deep(.level-menu) {
  background: transparent;
  box-shadow: 0 8px 24px rgba($brand-aged-gold, 0.2);
  overflow: hidden;
}

.level-menu__list {
  min-width: 200px;
  padding: 6px 0;
  background: $brand-cream;
  border: 1px solid rgba($brand-aged-gold, 0.25);
}

.level-menu__banner {
  padding: 8px 14px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.level-menu__banner-row {
  display: flex;
  align-items: baseline;
  gap: 6px;

  &--viewing {
    color: $brand-terracotta;
  }
}

.level-menu__banner-label {
  font-size: 11px;
  color: rgba(#96593a, 0.7);
  font-family: 'Montserrat', sans-serif;
}

.level-menu__banner-value {
  font-size: 13px;
  font-weight: 700;
  color: #96593a;
  font-family: 'Montserrat', sans-serif;
}

.level-menu__banner-separator {
  margin: 4px 0;
}

.level-menu__item {
  min-height: 44px;
  padding: 6px 14px;
  color: #96593a;
  font-family: 'Montserrat', sans-serif;
  border-left: 3px solid transparent;
  transition:
    background 120ms ease,
    border-color 120ms ease;

  &:hover {
    background: rgba($brand-aged-gold, 0.1);
    color: #96593a;
  }

  &--selected {
    background: rgba($brand-aged-gold, 0.18);
    border-left-color: $brand-aged-gold;
    color: #96593a;
    font-weight: 600;
  }
}

.level-menu__greek {
  min-width: 40px !important;
  padding-right: 20px !important;
  font-size: 22px;
  color: $brand-terracotta;
  line-height: 1;
  justify-content: center;
}

.level-menu__label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.level-menu__own {
  font-size: 10px;
  font-weight: 700;
  color: rgba($brand-aged-gold, 0.7);
  font-style: italic;
  margin-top: 2px;
}
</style>
