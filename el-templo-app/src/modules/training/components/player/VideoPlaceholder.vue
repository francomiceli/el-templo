<template>
  <div class="video-container">
    <!-- Placeholder when no video URL or video failed to load -->
    <div v-if="!videoUrl || videoFailed" class="video-placeholder">
      <q-icon name="videocam" size="48px" color="grey-6" />
      <span class="video-placeholder__text">Video proximamente</span>
    </div>

    <template v-else>
      <!-- HTML5 video with iOS compatibility attributes -->
      <video
        ref="videoRef"
        class="video-player"
        autoplay
        loop
        muted
        playsinline
        preload="auto"
        :poster="posterUrl"
        :src="videoUrl"
        @canplay="onVideoReady"
        @error="handleVideoError"
      />

      <!-- Loading spinner over dark background while video loads -->
      <div v-if="videoLoading" class="video-loading">
        <div class="video-loading__spinner"></div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { createLogger } from 'src/utils/logger'

const log = createLogger('VideoPlaceholder')

interface Props {
  /** URL for video (null shows placeholder) */
  videoUrl?: string | null
  /** Poster image during loading */
  posterUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  videoUrl: null,
  posterUrl: undefined,
})

const videoRef = ref<HTMLVideoElement | null>(null)
const videoFailed = ref(false)
const videoLoading = ref(true)

/**
 * Handle video load error by silently falling back to placeholder
 */
function handleVideoError(): void {
  videoFailed.value = true
  videoLoading.value = false
  log.debug('Video load failed, showing placeholder')
}

function onVideoReady(): void {
  videoLoading.value = false
}

/**
 * Attempt autoplay with fallback for browsers that block it
 */
async function attemptAutoplay(): Promise<void> {
  if (!videoRef.value || !props.videoUrl) return

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
    videoFailed.value = false
    videoLoading.value = true
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
  height: 100%;
  position: relative;
  background-color: #2e2a26;
}

.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e1b18 0%, #2e2a26 50%, #3d3732 100%);
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
  object-fit: cover;
}

.video-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2e2a26;
  z-index: 1;
}

.video-loading__spinner {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.15);
  border-top-color: rgba(255, 255, 255, 0.7);
  animation: video-spin 0.9s linear infinite;
}

@keyframes video-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
