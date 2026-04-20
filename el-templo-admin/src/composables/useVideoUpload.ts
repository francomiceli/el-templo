import { ref } from 'vue';
import axios from 'axios';
import { Notify } from 'quasar';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { transcodeToMp4, isAlreadyMp4 } from 'src/utils/videoTranscoder';

const log = createLogger('useVideoUpload');

/** Uploads are only enabled in production (not in dev or staging) */
export const uploadsEnabled = !import.meta.env.VITE_APP_ENVIRONMENT && import.meta.env.PROD;

/** Max size for the user-selected input file (before transcoding) */
const MAX_INPUT_SIZE = 200 * 1024 * 1024;

/** Max video duration in seconds */
const MAX_DURATION_SECONDS = 20;

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov'];

export type UploadPhase = 'transcoding' | 'uploading';

function hasAcceptedExtension(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isAcceptedType(file: File): boolean {
  if (file.type === 'video/mp4' || file.type === 'video/quicktime') return true;
  return hasAcceptedExtension(file);
}

/**
 * Get the duration of a video file using HTML5 video element.
 */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer el archivo de video'));
    };

    video.src = url;
  });
}

export function useVideoUpload() {
  const progress = ref<Map<number, number>>(new Map());
  const phase = ref<Map<number, UploadPhase>>(new Map());

  async function uploadVideo(
    exerciseId: number,
    file: File,
    onComplete?: () => void
  ): Promise<void> {
    // Input file size (pre-transcode)
    if (file.size > MAX_INPUT_SIZE) {
      Notify.create({
        type: 'negative',
        message: 'Archivo demasiado grande (max 200MB antes de procesar)',
      });
      return;
    }

    // File type
    if (!isAcceptedType(file)) {
      Notify.create({
        type: 'negative',
        message: 'Solo se aceptan archivos MP4 o MOV',
      });
      return;
    }

    // Duration check (reject long videos before wasting time transcoding)
    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_DURATION_SECONDS) {
        Notify.create({
          type: 'negative',
          message: `Video demasiado largo (${Math.round(duration)}s, max ${MAX_DURATION_SECONDS}s)`,
        });
        return;
      }
    } catch (err: unknown) {
      log.warn('Could not read video duration, proceeding anyway', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      // Step 0: Transcode to MP4 if needed (skipped when already mp4)
      let uploadFile = file;
      if (!isAlreadyMp4(file)) {
        phase.value.set(exerciseId, 'transcoding');
        progress.value.set(exerciseId, 0);
        uploadFile = await transcodeToMp4(file, (pct) => {
          progress.value.set(exerciseId, pct);
        });
      }

      phase.value.set(exerciseId, 'uploading');
      progress.value.set(exerciseId, 0);

      // Step 1: Get presigned URL from API
      const { data } = await api.post<{ uploadUrl: string; key: string }>(
        `/admin/exercises/${exerciseId}/upload-url`
      );

      // Step 2: Upload directly to R2
      await axios.put(data.uploadUrl, uploadFile, {
        headers: { 'Content-Type': 'video/mp4' },
        onUploadProgress: (e) => {
          if (e.total) {
            progress.value.set(exerciseId, Math.round((e.loaded / e.total) * 100));
          }
        },
      });

      // Step 3: Confirm upload
      await api.post(`/admin/exercises/${exerciseId}/upload-complete`, {
        key: data.key,
      });

      Notify.create({
        type: 'positive',
        message: 'Video subido correctamente',
      });
      onComplete?.();
    } catch (err: unknown) {
      log.error('Upload failed', {
        exerciseId,
        phase: phase.value.get(exerciseId),
        error: err instanceof Error ? err.message : String(err),
      });
      Notify.create({
        type: 'negative',
        message:
          phase.value.get(exerciseId) === 'transcoding'
            ? 'Error al procesar el video'
            : 'Error al subir el video',
      });
    } finally {
      progress.value.delete(exerciseId);
      phase.value.delete(exerciseId);
    }
  }

  function isUploading(exerciseId: number): boolean {
    return phase.value.has(exerciseId);
  }

  function getProgress(exerciseId: number): number {
    return progress.value.get(exerciseId) ?? 0;
  }

  function getPhase(exerciseId: number): UploadPhase | undefined {
    return phase.value.get(exerciseId);
  }

  return { uploadVideo, isUploading, getProgress, getPhase, progress, phase };
}
