import Storage from 'expo-sqlite/kv-store';

import type { PreferenceStore } from './theme-preference';

const KEY = 'muse.theme-preference';

export const kvPreferenceStore: PreferenceStore = {
  read: () => Storage.getItemAsync(KEY),
  write: (value) => Storage.setItemAsync(KEY, value),
};
