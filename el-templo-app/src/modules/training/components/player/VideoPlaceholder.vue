<template>
  <div class="video-container">
    <!-- Placeholder when no media URL or media failed to load -->
    <div v-if="!videoUrl || mediaFailed" class="video-placeholder">
      <q-icon name="videocam" size="48px" color="grey-6" />
      <span class="video-placeholder__text">Video proximamente</span>
    </div>

    <!-- Static image for ISO exercises (jpg/png URLs) -->
    <img
      v-else-if="isImageUrl"
      class="video-player"
      :src="videoUrl"
      alt="Ejercicio"
      @error="handleMediaError"
    />

    <!-- HTML5 video with iOS compatibility attributes -->
    <video
      v-else
      ref="videoRef"
      class="video-player"
      autoplay
      loop
      muted
      playsinline
      :poster="posterUrl"
      :src="videoUrl"
      @error="handleMediaError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { createLogger } from 'src/utils/logger'

const log = createLogger('VideoPlaceholder')

interface Props {
  /** URL for video or image (null shows placeholder) */
  videoUrl?: string | null
  /** Poster image during loading */
  posterUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  videoUrl: null,
  posterUrl: undefined,
})

const videoRef = ref<HTMLVideoElement | null>(null)
const mediaFailed = ref(false)

/** Detect image URLs by extension (ISO exercises store .jpg) */
const isImageUrl = computed(() => {
  if (!props.videoUrl) return false
  return /\.(jpe?g|png)(\?|$)/i.test(props.videoUrl)
})

/**
 * Handle media load error by silently falling back to placeholder
 */
function handleMediaError(): void {
  mediaFailed.value = true
  log.debug('Media load failed, showing placeholder')
}

/**
 * Attempt autoplay with fallback for browsers that block it
 */
async function attemptAutoplay(): Promise<void> {
  if (!videoRef.value || !props.videoUrl || isImageUrl.value) return

  try {
    await videoRef.value.play()
  } catch {
    // Autoplay was blocked - video will show first frame
    // User interaction will be required to play
    log.debug('Autoplay blocked, user interaction required')
  }
}

// Watch for videoUrl changes - reset error state, reload and attempt autoplay
watch(
  () => props.videoUrl,
  (newUrl) => {
    mediaFailed.value = false
    if (newUrl && videoRef.value) {
      videoRef.value.load()
      attemptAutoplay()
    }
  },
)

// Attempt autoplay on mount
onMounted(() => {
  attemptAutoplay()
})
</script>

<style scoped lang="scss">
.video-container {
  width: 100%;
  max-width: 640px;
  aspect-ratio: 16 / 9;
  margin: 0 auto;
  position: relative;
  background-color: #1a2a3e;
}

.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f1c2e 0%, #1a2a3e 50%, #243548 100%);
  gap: 12px;
}

.video-placeholder__text {
  color: #9e9e9e;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
