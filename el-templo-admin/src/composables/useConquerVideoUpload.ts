import { ref } from 'vue';
import axios from 'axios';
import { createLogger } from 'src/utils/logger';
import { transcodeToMp4, isAlreadyMp4 } from 'src/utils/videoTranscoder';
import { getVideoDuration } from 'src/utils/videoDuration';

const log = createLogger('useConquerVideoUpload');

/**
 * Fase 202 (D-25, D-26, DA-39, DA-52): preparar un video para Conquer (MP4 dentro del tope de
 * peso y, opcional, de duración) y subirlo a una URL firmada. Lo usan los tutoriales (sin tope de
 * duración) y la respuesta del coach (202-10, con `maxSeconds`). No notifica: devuelve el mensaje
 * en español y la vista decide cómo mostrarlo. Nunca loguea la URL firmada ni la clave.
 */

export type ConquerUploadPhase = 'idle' | 'converting' | 'uploading';

export type PreparedVideo =
  | { ok: true; file: File; seconds: number | null }
  | { ok: false; message: string };

export interface PrepareOptions {
  /** Tope de peso (se mide sobre el archivo original y de nuevo sobre el MP4 convertido). */
  maxBytes: number;
  /** Tope de duración en segundos; sin valor no se lee la duración (tutoriales). */
  maxSeconds?: number;
}

/** Tolerancia de la duración medida por el navegador (DA-40). */
const DURATION_TOLERANCE_SECONDS = 0.5;

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov'];

function isAcceptedVideo(file: File): boolean {
  if (file.type === 'video/mp4' || file.type === 'video/quicktime') return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function tooHeavyMessage(maxBytes: number): string {
  return `El archivo pesa más de ${Math.round(maxBytes / (1024 * 1024))} MB`;
}

export function useConquerVideoUpload() {
  const phase = ref<ConquerUploadPhase>('idle');
  const percent = ref(0);

  function reset(): void {
    phase.value = 'idle';
    percent.value = 0;
  }

  /** Duración en segundos enteros (1..maxSeconds), o un mensaje si no se puede leer o se pasa. */
  async function checkDuration(
    file: File,
    maxSeconds: number
  ): Promise<{ seconds: number } | { message: string }> {
    let duration: number;
    try {
      duration = await getVideoDuration(file);
    } catch (err: unknown) {
      log.warn('No se pudo leer la duración del video', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { message: 'No pudimos leer la duración del video' };
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return { message: 'No pudimos leer la duración del video' };
    }
    if (duration > maxSeconds + DURATION_TOLERANCE_SECONDS) {
      return { message: `El video dura ${Math.round(duration)} s: el máximo es ${maxSeconds} s` };
    }
    return { seconds: Math.min(maxSeconds, Math.max(1, Math.round(duration))) };
  }

  async function convertToMp4(file: File): Promise<File | null> {
    phase.value = 'converting';
    percent.value = 0;
    try {
      return await transcodeToMp4(file, (pct) => {
        percent.value = pct;
      });
    } catch (err: unknown) {
      log.error('Falló la conversión a MP4', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      reset();
    }
  }

  async function prepareMp4(file: File, opts: PrepareOptions): Promise<PreparedVideo> {
    if (file.size > opts.maxBytes) return { ok: false, message: tooHeavyMessage(opts.maxBytes) };
    if (!isAcceptedVideo(file)) return { ok: false, message: 'Solo se aceptan videos MP4 o MOV' };

    // La duración se lee ANTES de convertir: un video largo se rechaza sin gastar minutos de ffmpeg.
    let seconds: number | null = null;
    if (opts.maxSeconds !== undefined) {
      const checked = await checkDuration(file, opts.maxSeconds);
      if ('message' in checked) return { ok: false, message: checked.message };
      seconds = checked.seconds;
    }

    let mp4 = file;
    if (!isAlreadyMp4(file)) {
      const converted = await convertToMp4(file);
      if (converted === null) return { ok: false, message: 'No pudimos convertir el video a MP4' };
      mp4 = converted;
    }
    if (mp4.size > opts.maxBytes) return { ok: false, message: tooHeavyMessage(opts.maxBytes) };

    return { ok: true, file: mp4, seconds };
  }

  /** PUT pelado (sin header de auth) a la URL firmada. Tira un Error con copy en español. */
  async function putToBucket(uploadUrl: string, file: File): Promise<void> {
    phase.value = 'uploading';
    percent.value = 0;
    try {
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': 'video/mp4' },
        onUploadProgress: (e) => {
          if (e.total) percent.value = Math.round((e.loaded / e.total) * 100);
        },
      });
    } catch (err: unknown) {
      // Solo el status: el mensaje de axios y la config traen la URL firmada.
      const status = axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
      const logFn = status !== null && status >= 400 && status < 500 ? log.warn : log.error;
      logFn('Falló la subida del video al bucket', { status });
      throw new Error('No pudimos subir el video. Probá de nuevo');
    } finally {
      reset();
    }
  }

  /** Por convención de los composables; no hay timers ni listeners que soltar. */
  function cleanup(): void {
    reset();
  }

  return { phase, percent, checkDuration, prepareMp4, putToBucket, reset, cleanup };
}
