// Thin wrappers around the File System Access API.
//
// The API is Chromium-only (Chrome, Edge, Opera). Callers should guard
// UI with `isFileSystemAccessSupported()` and disable/hide file actions
// in unsupported browsers — we intentionally do NOT fall back to
// download/upload, because the whole point of this module is to give
// true "save back to the same file" semantics.
//
// User cancels surface as `null` returns (not thrown errors), so callers
// can write `if (!handle) return;` without a try/catch.
//
// TypeScript note: `showSaveFilePicker` / `showOpenFilePicker` aren't in
// the default `lib.dom.d.ts` at our TS version, so we declare the
// minimum shape we use. `FileSystemFileHandle` itself IS in lib.dom.

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: ReadonlyArray<{
    description?: string;
    accept: Record<string, readonly string[]>;
  }>;
}

interface OpenFilePickerOptions extends SaveFilePickerOptions {
  multiple?: boolean;
}

declare global {
  interface Window {
    showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (opts?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
  }
}

const FILE_PICKER_OPTIONS = {
  types: [
    {
      description: 'Roadmap JSON',
      accept: { 'application/json': ['.json'] },
    },
  ],
} as const;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.showSaveFilePicker === 'function'
    && typeof window.showOpenFilePicker === 'function';
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function pickSaveFile(suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) throw new Error('File System Access API not supported');
  try {
    return await window.showSaveFilePicker({
      suggestedName,
      ...FILE_PICKER_OPTIONS,
    });
  } catch (err) {
    if (isAbort(err)) return null;
    throw err;
  }
}

export async function pickOpenFile(): Promise<FileSystemFileHandle | null> {
  if (!window.showOpenFilePicker) throw new Error('File System Access API not supported');
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      ...FILE_PICKER_OPTIONS,
    });
    return handle ?? null;
  } catch (err) {
    if (isAbort(err)) return null;
    throw err;
  }
}

export async function readFileAsText(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

export async function writeFileText(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}
