import { requireOptionalNativeModule } from 'expo';

import type { NativeTabBounceResult } from './NativeTabBounce.types';

interface NativeTabBounceModule {
  bounce(index: number): Promise<NativeTabBounceResult>;
}

const nativeModule = requireOptionalNativeModule<NativeTabBounceModule>('NativeTabBounce');

export async function bounceNativeTabIcon(index: number): Promise<NativeTabBounceResult> {
  return nativeModule ? nativeModule.bounce(index) : 'unavailable';
}
