import { ref } from 'vue';
import axios from 'axios';
import { Notify } from 'quasar';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';

const log = createLogger('useVideoUpload');

/** Uploads are only enabled in production (not in dev or staging) */
export const uploadsEnabled = !import.meta.env.VITE_APP_ENVIRONMENT && import.meta.env.PROD;

/** Max file size: 20 MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Max video duration in seconds */
const MAX_DURATION_SECONDS = 20;

/** Check if exercise effort type uses image instead of video */
export function isImageExercise(effort: string): boolean {
  return effort === 'ISO';
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

/** Accepted file extensions for each media type */
export function acceptedFileTypes(effort: string): string {
  return isImageExercise(effort) ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.mp4,video/mp4';
}

export function useVideoUpload() {
  const uploading = ref<Map<number, number>>(new Map());

  async function uploadVideo(
    exerciseId: number,
    file: File,
    onComplete?: () => void,
    effort = 'CON'
  ): Promise<void> {
    const isImage = isImageExercise(effort);

    // Client-side validation: file size
    if (file.size > MAX_FILE_SIZE) {
      Notify.create({
        type: 'negative',
        message: 'Archivo demasiado grande (max 20MB)',
      });
      return;
    }

    // Client-side validation: file type
    if (isImage) {
      const validImage =
        file.type.includes('jpeg') ||
        file.type.includes('jpg') ||
        file.type.includes('png') ||
        file.name.match(/\.(jpe?g|png)$/i);
      if (!validImage) {
        Notify.create({
          type: 'negative',
          message: 'Solo se aceptan imagenes JPG o PNG',
        });
        return;
      }
    } else {
      if (!file.type.includes('mp4') && !file.name.endsWith('.mp4')) {
        Notify.create({
          type: 'negative',
          message: 'Solo se aceptan archivos MP4',
        });
        return;
      }

      // Client-side validation: video duration (only for videos)
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
    }

    uploading.value.set(exerciseId, 0);
    try {
      // Step 1: Get presigned URL from API (API determines media type from effort)
      const { data } = await api.post<{ uploadUrl: string; key: string; mediaType: string }>(
        `/admin/exercises/${exerciseId}/upload-url`
      );

      // Step 2: Upload directly to R2 (content type MUST match what the presigned URL was signed with)
      const contentType = data.mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': contentType },
        onUploadProgress: (e) => {
          if (e.total) {
            uploading.value.set(exerciseId, Math.round((e.loaded / e.total) * 100));
          }
        },
      });

      // Step 3: Confirm upload
      await api.post(`/admin/exercises/${exerciseId}/upload-complete`, {
        key: data.key,
      });

      Notify.create({
        type: 'positive',
        message: isImage ? 'Foto subida correctamente' : 'Video subido correctamente',
      });
      onComplete?.();
    } catch (err: unknown) {
      log.error('Upload failed', {
        exerciseId,
        error: err instanceof Error ? err.message : String(err),
      });
      Notify.create({
        type: 'negative',
        message: isImage ? 'Error al subir la foto' : 'Error al subir el video',
      });
    } finally {
      uploading.value.delete(exerciseId);
    }
  }

  function isUploading(exerciseId: number): boolean {
    return uploading.value.has(exerciseId);
  }

  function getProgress(exerciseId: number): number {
    return uploading.value.get(exerciseId) ?? 0;
  }

  return { uploadVideo, isUploading, getProgress, uploading };
}
