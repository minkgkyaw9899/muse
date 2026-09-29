/** Pure seam to the native renderer. No React Native, Expo, or MuPDF types may appear here. */

export type InspectionRequest = {
  /** App-owned file URI, never a document-picker URL. */
  uri: string;
  operationId: string;
  limits?: { maxBytes?: number };
};

export type Inspection = {
  pageCount: number;
  /** SHA-256 of the file's bytes, lowercase hex. */
  fingerprint: string;
};

export type RendererErrorCategory =
  | 'unsupported'
  | 'corrupt'
  | 'passwordRequired'
  | 'resourceLimit'
  | 'cancelled'
  | 'internal';

export type RendererError = {
  category: RendererErrorCategory;
  /** Native diagnostic code. Safe to log: never contains paths or document content. */
  code: string;
  /** Actionable, user-facing sentence. Never contains paths or document content. */
  message: string;
};

export type InspectionResult =
  | { ok: true; inspection: Inspection }
  | { ok: false; error: RendererError };

export interface DocumentRenderer {
  inspect(request: InspectionRequest): Promise<InspectionResult>;
  /**
   * Cancels a running inspection, which then resolves with the `cancelled` category.
   * Cancelling an unknown or finished operation does nothing. Cancellation is cooperative:
   * it takes effect at the next checkpoint, not instantly.
   */
  cancel(operationId: string): void;
}
