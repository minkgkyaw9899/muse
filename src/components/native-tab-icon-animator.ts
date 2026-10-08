import type { NativeTabBounceResult } from '../../modules/native-tab-bounce';

/** Focus events establish the initial tab, then animate only a changed selection. */
export function createNativeTabIconAnimator(
  bounce: (index: number) => Promise<NativeTabBounceResult>,
) {
  let selectedIndex: number | undefined;

  return {
    async select(index: number): Promise<NativeTabBounceResult | 'initial' | 'unchanged'> {
      if (selectedIndex === index) return 'unchanged';
      const initial = selectedIndex === undefined;
      selectedIndex = index;
      if (initial) return 'initial';
      try {
        return await bounce(index);
      } catch {
        // A cosmetic effect must never interrupt navigation or reject unhandled.
        return 'unavailable';
      }
    },
  };
}
