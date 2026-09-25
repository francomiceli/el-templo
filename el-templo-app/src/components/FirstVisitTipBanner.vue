<template>
  <transition name="tip-banner-fade">
    <div v-if="visible" class="tip-banner" role="status">
      <q-icon name="lightbulb" size="20px" class="tip-banner__icon" />
      <p class="tip-banner__text">{{ message }}</p>
      <q-btn
        flat
        round
        dense
        size="sm"
        icon="close"
        color="primary"
        class="tip-banner__close"
        aria-label="Cerrar"
        @click="dismiss"
      />
    </div>
  </transition>
</template>

<script setup lang="ts">
/**
 * FirstVisitTipBanner
 *
 * SPEC "Empezá acá" C — banner chico de "tip de primera semana", dismisseable
 * y visto una sola vez por socio (useTipsSeenStorage). Reutilizado por
 * TrainingIndex.vue (bloques) y ReservasPage.vue (anticipación) para no
 * duplicar la misma lógica de mostrar/ocultar/persistir en cada página.
 */
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from 'src/stores/useUserStore'
import { useTipsSeenStorage } from 'src/composables/useTipsSeenStorage'
import { TIPS_CONTENT, type TipId } from 'src/config/tips-content'

const props = defineProps<{ tipId: TipId }>()

const userStore = useUserStore()
const tipsStorage = useTipsSeenStorage()

const message = computed(() => TIPS_CONTENT[props.tipId].message)
const visible = ref(false)

onMounted(async () => {
  const userId = userStore.profile?.id
  if (!userId) return
  const seen = await tipsStorage.hasSeen(userId, props.tipId)
  if (!seen) visible.value = true
})

async function dismiss() {
  visible.value = false
  const userId = userStore.profile?.id
  if (userId) await tipsStorage.markSeen(userId, props.tipId)
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.tip-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: rgba($primary, 0.08);
  border: 1px solid rgba($primary, 0.2);
}

.tip-banner__icon {
  color: $primary;
  flex-shrink: 0;
  margin-top: 1px;
}

.tip-banner__text {
  flex: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: $primary;
}

.tip-banner__close {
  flex-shrink: 0;
  margin: -6px -6px 0 0;
}

.tip-banner-fade-enter-active,
.tip-banner-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tip-banner-fade-enter-from,
.tip-banner-fade-leave-to {
  opacity: 0;
}
</style>
