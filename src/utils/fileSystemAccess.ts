// Thin wrappers around the File System Access API, plus download/upload
// fallbacks for browsers without it.
//
// The API is Chromium-only (Chrome, Edge, Opera). Where it's available the
// app gets true "save back to the same file" semantics via handles. In other
// browsers (Firefox, Safari) callers fall back to `downloadTextFile` /
// `pickUploadFile` — same JSON payload, but each save downloads a fresh copy
// and no handle is retained.
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

/** The file's current on-disk lastModified timestamp (ms). Reading through
 *  the handle also forces cloud-placeholder files (OneDrive) to hydrate. */
export async function getFileLastModified(handle: FileSystemFileHandle): Promise<number> {
  const file = await handle.getFile();
  return file.lastModified;
}

// ── Fallbacks for browsers without the File System Access API ──────────────

/** Save `text` as a browser download named `fileName`. */
export function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/** Prompt for a .json file via a hidden file input. Resolves to the file's
 *  name + contents, or null if the user cancels. */
export function pickUploadFile(): Promise<{ name: string; text: string } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve({ name: file.name, text: await file.text() });
    };
    // `cancel` fires on modern browsers when the picker is dismissed.
    input.oncancel = () => resolve(null);
    input.click();
  });
}
