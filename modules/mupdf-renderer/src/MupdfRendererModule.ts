import { NativeModule, requireNativeModule } from 'expo';

/** Replies are plain values, never thrown. See `src/features/reader/native-document-renderer.ts`. */
declare class MupdfRendererModule extends NativeModule<Record<string, never>> {
  inspectAsync(uri: string, operationId: string, maxBytes: number | null): Promise<unknown>;
  cancel(operationId: string): void;
}

export default requireNativeModule<MupdfRendererModule>('MupdfRenderer');
