/**
 * Anniversaries API composable — cartelera de aniversarios de permanencia.
 */
import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { AnniversaryEntry } from 'src/types/anniversary';

export function useAnniversariesApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getBranchAnniversaries(
    branchId: number,
    opts: { date?: string; includeTomorrow?: boolean } = {}
  ): Promise<AnniversaryEntry[]> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = { branchId };
      if (opts.date) params.date = opts.date;
      if (opts.includeTomorrow) params.includeTomorrow = true;
      const { data } = await api.get<{ anniversaries: AnniversaryEntry[] }>(
        '/admin/anniversaries',
        { params }
      );
      return data.anniversaries;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando aniversarios');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getBranchAnniversaries, cleanup };
}
