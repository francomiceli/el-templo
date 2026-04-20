import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { createLogger } from 'src/utils/logger';

const log = createLogger('videoTranscoder');

/** Self-hosted ffmpeg core — copied from node_modules at install time (see scripts/copy-ffmpeg.mjs) */
const FFMPEG_CORE_BASE = '/ffmpeg';
/** Bump when the ffmpeg core files change — forces browsers past the 1-year immutable cache. */
const FFMPEG_CORE_CACHE_BUST = 'esm-1';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.js?v=${FFMPEG_CORE_CACHE_BUST}`,
      wasmURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm?v=${FFMPEG_CORE_CACHE_BUST}`,
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function isAlreadyMp4(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'video/mp4' || name.endsWith('.mp4');
}

export async function transcodeToMp4(
  file: File,
  onProgress?: (percent: number) => void
): Promise<File> {
  if (isAlreadyMp4(file)) return file;

  const ffmpeg = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))));
  };
  ffmpeg.on('progress', progressHandler);

  const inputName = `input-${Date.now()}`;
  const outputName = `output-${Date.now()}.mp4`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const exitCode = await ffmpeg.exec([
      '-i',
      inputName,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }

    const data = await ffmpeg.readFile(outputName);
    if (typeof data === 'string') {
      throw new Error('Unexpected string output from ffmpeg readFile');
    }

    const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
    const newName = file.name.replace(/\.[^.]+$/, '') + '.mp4';
    return new File([blob], newName, { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (err) {
      log.warn('Failed to cleanup input file', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // output may not exist if exec failed
    }
  }
}
