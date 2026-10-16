import { useImageUpload } from 'src/composables/useImageUpload';

const BLOG_UPLOAD_ENDPOINT = '/blog/admin/upload-image';

/** Subida de imágenes del blog: delega en el composable genérico. */
export function useBlogImageUpload() {
  const { uploading, uploadImage } = useImageUpload();

  return {
    uploading,
    uploadImage: (file: File): Promise<string> => uploadImage(file, BLOG_UPLOAD_ENDPOINT),
  };
}
