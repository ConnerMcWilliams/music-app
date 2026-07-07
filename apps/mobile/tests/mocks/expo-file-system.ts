/**
 * Mock of expo-file-system for tests. The real module's native `File.upload`
 * needs a device, so tests capture the upload call and script its result.
 *
 * `File` records the last-constructed instance and the options passed to
 * `upload()`; `__setUploadResults()` queues the `{ status, body }` values the
 * next uploads should resolve to (one per call, so a 401-then-retry can be
 * scripted). `__reset()` clears everything between tests.
 */
export enum UploadType {
  BINARY_CONTENT = 0,
  MULTIPART = 1,
}

export interface UploadResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

interface UploadCall {
  url: string;
  options: Record<string, unknown>;
}

const uploadResults: UploadResult[] = [];
export const uploadCalls: UploadCall[] = [];
export let lastFileUri: string | null = null;

export class File {
  uri: string;

  constructor(...segments: string[]) {
    this.uri = segments.join('/');
    lastFileUri = this.uri;
  }

  async upload(url: string, options: Record<string, unknown>): Promise<UploadResult> {
    uploadCalls.push({ url, options });
    const next = uploadResults.shift();
    if (!next) throw new Error('No mock upload result queued');
    return next;
  }
}

/** Queue the results the next `upload()` calls resolve to, in order. */
export function __setUploadResults(...results: UploadResult[]): void {
  uploadResults.length = 0;
  uploadResults.push(...results);
}

export function __reset(): void {
  uploadResults.length = 0;
  uploadCalls.length = 0;
  lastFileUri = null;
}
