/**
 * Get the duration of a video file using HTML5 video element.
 * Shared by the exercise video upload and the Conquer tutorial/correction uploads.
 */
export function getVideoDuration(file: File): Promise<number> {
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
