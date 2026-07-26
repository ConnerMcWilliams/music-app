/**
 * Mock of expo-file-system for tests. The real module's native `File.upload`
 * needs a device, so tests capture the upload call and script its result.
 *
 * `File` records the last-constructed instance and the options passed to
 * `upload()`; `__setUploadResults()` queues the `{ status, body }` values the
 * next uploads should resolve to (one per call, so a 401-then-retry can be
 * scripted). `__reset()` clears everything between tests.
 *
 * `Directory`/`Paths` back a tiny in-memory filesystem, enough for the live-take
 * cache prune in `lib/analysis/micBackend.ts`: `__setDirectory()` seeds a
 * directory's entries and `deletedUris` records what was removed.
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

/** Seeded directory contents, keyed by directory URI. */
const directories = new Map<string, { name: string; lastModified: number }[]>();
/** Every URI `File.delete()` was called on. */
export const deletedUris: string[] = [];

type PathSegment = string | File | Directory;

const joinUris = (segments: PathSegment[]): string =>
  segments.map((s) => (typeof s === 'string' ? s : s.uri)).join('/');

export class File {
  uri: string;
  lastModified: number | null = null;

  constructor(...segments: PathSegment[]) {
    this.uri = joinUris(segments);
    lastFileUri = this.uri;
  }

  delete(): void {
    deletedUris.push(this.uri);
  }

  async upload(url: string, options: Record<string, unknown>): Promise<UploadResult> {
    uploadCalls.push({ url, options });
    const next = uploadResults.shift();
    if (!next) throw new Error('No mock upload result queued');
    return next;
  }
}

export class Directory {
  uri: string;

  constructor(...segments: PathSegment[]) {
    this.uri = joinUris(segments);
  }

  get exists(): boolean {
    return directories.has(this.uri);
  }

  list(): (File | Directory)[] {
    return (directories.get(this.uri) ?? []).map((entry) => {
      const file = new File(`${this.uri}/${entry.name}`);
      file.lastModified = entry.lastModified;
      return file;
    });
  }
}

export const Paths = {
  get cache(): Directory {
    return new Directory('file:///cache');
  },
};

/** Seed a directory's contents. Files are `{ name, lastModified }`. */
export function __setDirectory(
  uri: string,
  entries: { name: string; lastModified: number }[],
): void {
  directories.set(uri, entries);
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
  directories.clear();
  deletedUris.length = 0;
}
