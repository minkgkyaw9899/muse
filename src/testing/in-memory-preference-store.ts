import type { PreferenceStore } from '@/theme/theme-preference';

export function createInMemoryPreferenceStore(
  initial: string | null = null,
  failures: { read?: boolean; write?: boolean } = {},
): PreferenceStore & { value: string | null } {
  const store = {
    value: initial,
    async read() {
      if (failures.read) throw new Error('read failed');
      return store.value;
    },
    async write(next: string) {
      if (failures.write) throw new Error('write failed');
      store.value = next;
    },
  };
  return store;
}
