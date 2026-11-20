<template>
  <!-- Fase 214 (plan 21): foto o iniciales de una persona, en los tamaños del UI-SPEC. No es un
       botón: quien lo usa lo envuelve. La imagen lleva `alt=""` porque el nombre ya está en el
       texto de al lado. -->
  <span
    class="member-avatar"
    :class="[ringClass, { 'member-avatar--initials': !showImage }]"
    :style="{ '--ma-size': `${size}px` }"
  >
    <img
      v-if="showImage"
      class="member-avatar__img"
      :src="url ?? undefined"
      alt=""
      referrerpolicy="no-referrer"
      @error="onImageError"
    />
    <span v-else class="member-avatar__initials" :class="initialsClass" aria-hidden="true">{{
      initials
    }}</span>

    <span
      v-if="showBadge && badge === 'review'"
      class="member-avatar__badge member-avatar__badge--review"
      aria-hidden="true"
    >
      <q-icon name="schedule" size="14px" />
    </span>
    <span
      v-else-if="showBadge && badge === 'camera'"
      class="member-avatar__badge member-avatar__badge--camera"
      aria-hidden="true"
    >
      <q-icon name="photo_camera" size="16px" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type AvatarSize = 32 | 40 | 52 | 56 | 64 | 120 | 160

const props = withDefaults(
  defineProps<{
    size: AvatarSize
    url: string | null
    firstName: string | null
    lastInitial?: string | null
    /** Aro: dorado (solo cuando se ve la ficha de Aura) o blanco. */
    ring?: 'gold' | 'white' | null
    /**
     * Insignia: `review` (foto en revisión) o `camera` (invita a subir una foto). En los tamaños
     * 32 y 40 (bandeja y card de regalo, fase 215) no se dibuja: no entra sin tapar la cara.
     */
    badge?: 'review' | 'camera' | null
  }>(),
  { lastInitial: null, ring: null, badge: null },
)

const emit = defineEmits<{
  /** Primera vez que la imagen falla (URL vencida): el encabezado vuelve a pedir `/me`. */
  'image-error': []
}>()

const failed = ref(false)

// Una URL nueva (otra foto, o la firma renovada) vuelve a intentar con la imagen.
watch(
  () => props.url,
  () => {
    failed.value = false
  },
)

const showImage = computed(() => !!props.url && !failed.value)

const initials = computed(() => {
  const first = props.firstName?.trim().charAt(0) ?? ''
  const last = props.lastInitial?.trim().charAt(0) ?? ''
  return `${first}${last}`.toUpperCase()
})

const ringClass = computed(() => (props.ring ? `member-avatar--ring-${props.ring}` : ''))

const showBadge = computed(() => props.size !== 32 && props.size !== 40)

// Label numérico 13 para 32 y 40 (fase 215), Heading 18 para la cara de 56 y Display 22 para el
// resto (UI-SPEC, Tipografía).
const initialsClass = computed(() => {
  if (props.size === 32 || props.size === 40) return 'member-avatar__initials--label'
  return props.size === 56 ? 'member-avatar__initials--heading' : 'member-avatar__initials--display'
})

function onImageError(): void {
  if (failed.value) return
  failed.value = true
  emit('image-error')
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.member-avatar {
  position: relative;
  display: inline-block;
  flex: none;
  width: var(--ma-size);
  height: var(--ma-size);
  border-radius: 50%;
  vertical-align: middle;

  &--ring-gold {
    box-shadow:
      0 0 0 2px $pd-gold-tint,
      0 0 0 4px $pd-gold;
  }

  &--ring-white {
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.55),
      0 0 0 4px #fff;
  }

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  // Iniciales blancas sobre terracota: blanco / #a35f3c 4.9:1.
  &--initials {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b);
  }

  &__initials {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    line-height: 1.2;
    color: #fff;
    user-select: none;

    &--label {
      font-size: 13px;
    }

    &--heading {
      font-size: 18px;
    }

    &--display {
      font-size: 22px;
    }
  }

  &__badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    display: grid;
    place-items: center;
    border-radius: 50%;

    &--review {
      width: 20px;
      height: 20px;
      background: $pd-light-surface;
      color: $pd-terra-ink;
    }

    &--camera {
      width: 24px;
      height: 24px;
      background: $pd-terra-ink;
      color: #fff;
    }
  }
}
</style>
