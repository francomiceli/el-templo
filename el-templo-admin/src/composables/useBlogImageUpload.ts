import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';

const log = createLogger('useBlogImageUpload');

interface UploadResponse {
  uploadUrl: string;
  publicUrl: string;
}

export function useBlogImageUpload() {
  const uploading = ref(false);

  async function uploadImage(file: File): Promise<string> {
    uploading.value = true;
    try {
      // Step 1: Get presigned URL from API
      const { data } = await api.post<UploadResponse>('/admin/blog/upload-image', {
        filename: file.name,
      });

      // Step 2: Upload file directly to R2 via presigned PUT URL
      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });

      // Step 3: Return the public URL
      return data.publicUrl;
    } catch (err: unknown) {
      log.error('Image upload failed', {
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
