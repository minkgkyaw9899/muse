import { requireOptionalNativeModule } from 'expo';

type Failure = {
  status: 'error';
  category: 'cancelled' | 'permissionDenied' | 'resourceLimit' | 'storage';
};

export type NativePublicationImport = {
  pick(
    multiple: boolean,
  ): Promise<
    | { status: 'selected'; sources: { id: string; name: string }[] }
    | { status: 'cancelled' }
    | Failure
  >;
  copy(
    sourceId: string,
    operationId: string,
  ): Promise<{ status: 'copied'; uri: string; relativePath: string; byteSize: number } | Failure>;
  cancel(sourceId: string): void;
  release(sourceId: string): void;
};

export function loadNativePublicationImport(): NativePublicationImport | null {
  return requireOptionalNativeModule<NativePublicationImport>('PublicationImport');
}
