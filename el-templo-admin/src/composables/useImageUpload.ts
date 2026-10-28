import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';

const log = createLogger('useImageUpload');

interface UploadResponse {
  uploadUrl: string;
  publicUrl: string;
}

/**
 * Subida de imagen a R2 con URL prefirmada, genérica: el `endpoint` (relativo a
 * la API) es el único dato que cambia entre blog, patrocinadores, etc. Debe
 * responder `{ uploadUrl, publicUrl }` a un POST `{ filename }`.
 */
export function useImageUpload() {
  const uploading = ref(false);

  async function uploadImage(file: File, endpoint: string): Promise<string> {
    uploading.value = true;
    try {
      // Paso 1: pedir la URL prefirmada a la API
      const { data } = await api.post<UploadResponse>(endpoint, {
        filename: file.name,
      });

      // Paso 2: subir el archivo directo a R2 con el PUT prefirmado
      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });

      // Paso 3: devolver la URL pública
      return data.publicUrl;
    } catch (err: unknown) {
      log.error('Image upload failed', {
        endpoint,
        filename: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      uploading.value = false;
    }
  }

  return {
    uploading,
    uploadImage,
  };
}
