<template>
  <div class="video-container">
    <!-- Placeholder when no video URL -->
    <div v-if="!videoUrl" class="video-placeholder">
      <q-icon name="videocam" size="48px" color="grey-6" />
      <span class="video-placeholder__text">Video proximamente</span>
    </div>

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
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { createLogger } from 'src/utils/logger';

const log = createLogger('VideoPlaceholder');

interface Props {
  /** URL for video (null shows placeholder) */
  videoUrl?: string | null;
  /** Poster image during loading */
  posterUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  videoUrl: null,
  posterUrl: undefined,
});

const videoRef = ref<HTMLVideoElement | null>(null);

/**
 * Attempt autoplay with fallback for browsers that block it
 */
async function attemptAutoplay(): Promise<void> {
  if (!videoRef.value || !props.videoUrl) return;

  try {
    await videoRef.value.play();
  } catch {
    // Autoplay was blocked - video will show first frame
    // User interaction will be required to play
    log.debug('Autoplay blocked, user interaction required');
  }
}

// Watch for videoUrl changes - reload and attempt autoplay
watch(
  () => props.videoUrl,
  (newUrl) => {
    if (newUrl && videoRef.value) {
      videoRef.value.load();
      attemptAutoplay();
    }
  }
);

// Attempt autoplay on mount
onMounted(() => {
  attemptAutoplay();
});
</script>

<style scoped lang="scss">
.video-container {
  width: 100%;
  height: 40vh;
  position: relative;
  background-color: #000;
}

.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
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
