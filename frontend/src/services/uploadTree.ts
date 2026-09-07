import { UnauthorizedError, createFolder, uploadPrints } from "./api";

export type UploadEntry = {
  file: File;
  relativePath: string;
};

type FileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void;
  createReader?: () => FileSystemDirectoryReader;
};

type FileSystemDirectoryReader = {
  readEntries: (success: (entries: FileSystemEntry[]) => void, error?: (err: unknown) => void) => void;
};

// File System Access API handles (window.showDirectoryPicker()) -- a distinct browser API from
// the drag-and-drop DataTransferItem.webkitGetAsEntry() one modeled above by FileSystemEntry.
export type FileSystemAccessHandle = { kind: "file" | "directory"; name: string };
export type FileSystemAccessFileHandle = FileSystemAccessHandle & { getFile: () => Promise<File> };
export type FileSystemAccessDirectoryHandle = FileSystemAccessHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemAccessHandle]>;
};
export type DirectoryPicker = () => Promise<FileSystemAccessDirectoryHandle>;

function normalizeRelativePath(path: string) {
  const trimmed = (path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return trimmed || "";
}

export function entriesFromFileList(files: FileList | File[]): UploadEntry[] {
  return Array.from(files || []).map(file => {
    const anyFile = file as File & { webkitRelativePath?: string };
    const relativePath = normalizeRelativePath(anyFile.webkitRelativePath || file.name);
    return { file, relativePath: relativePath || file.name };
  });
}

async function readAllEntries(reader: FileSystemDirectoryReader) {
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    entries.push(...batch);
  }
  return entries;
}

async function traverseEntry(entry: FileSystemEntry, parentPath: string, output: UploadEntry[]) {
  const entryPath = normalizeRelativePath(parentPath ? `${parentPath}/${entry.name}` : entry.name);
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    output.push({ file, relativePath: entryPath || file.name });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const entries = await readAllEntries(reader);
    await Promise.all(entries.map(child => traverseEntry(child, entryPath, output)));
  }
}

export async function entriesFromDataTransfer(dataTransfer: DataTransfer): Promise<UploadEntry[]> {
  const output: UploadEntry[] = [];
  const items = Array.from(dataTransfer.items || []);
  const entryItems = items
    .map(item => (item as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.())
    .filter(Boolean) as FileSystemEntry[];

  if (entryItems.length) {
    await Promise.all(entryItems.map(entry => traverseEntry(entry, "", output)));
    return output;
  }

  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (!file) continue;
    const anyFile = file as File & { webkitRelativePath?: string };
    const relativePath = normalizeRelativePath(anyFile.webkitRelativePath || file.name);
    output.push({ file, relativePath: relativePath || file.name });
  }

  if (!output.length) {
    return entriesFromFileList(dataTransfer.files || []);
  }
  return output;
}

/** Recursively walks a File System Access API directory handle (from window.showDirectoryPicker())
 *  into a flat UploadEntry[], with relativePath rooted at the picked directory's own name. */
export async function entriesFromDirectoryHandle(root: FileSystemAccessDirectoryHandle): Promise<UploadEntry[]> {
  const output: UploadEntry[] = [];
  const walk = async (dir: FileSystemAccessDirectoryHandle, basePath: string) => {
    for await (const [, handle] of dir.entries()) {
      if (handle.kind === "file") {
        const file = await (handle as FileSystemAccessFileHandle).getFile();
        const relativePath = basePath ? `${basePath}/${handle.name}` : handle.name;
        output.push({ file, relativePath });
      } else if (handle.kind === "directory") {
        const nextPath = basePath ? `${basePath}/${handle.name}` : handle.name;
        await walk(handle as FileSystemAccessDirectoryHandle, nextPath);
      }
    }
  };
  const rootPath = root.name || "";
  await walk(root, rootPath);
  return output;
}

export async function uploadEntriesToFolder(
  entries: UploadEntry[],
  parentFolderId: string | null,
  onUnauthorized?: () => void
) {
  const failed: string[] = [];
  let uploaded = 0;
  let aborted = false;
  const uploadedEntries: UploadEntry[] = [];
  const folderCache = new Map<string, string>();
  const baseKey = parentFolderId || "root";

  const getOrCreateFolder = async (parentId: string | null, parentKey: string, name: string) => {
    const key = `${parentKey}/${name}`;
    const existing = folderCache.get(key);
    if (existing) return existing;
    const created = await createFolder(name, [], parentId || undefined);
    const folderId = (created as { id: string }).id;
    folderCache.set(key, folderId);
    return folderId;
  };

  for (const entry of entries) {
    const normalized = normalizeRelativePath(entry.relativePath || entry.file.name);
    const segments = normalized.split("/").filter(Boolean);
    if (!segments.length) continue;
    segments.pop();
    let targetFolderId = parentFolderId;
    let parentKey = baseKey;
    for (const segment of segments) {
      try {
        targetFolderId = await getOrCreateFolder(targetFolderId, parentKey, segment);
        parentKey = `${parentKey}/${segment}`;
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
          aborted = true;
          break;
        }
        console.error("Folder creation failed for", segment, err);
        failed.push(entry.file.name);
        targetFolderId = null;
        break;
      }
    }
    if (aborted) break;
    if (targetFolderId === null && segments.length) continue;
    try {
      // Every leaf of a folder tree (dropped folder or webkitdirectory picker)
      // is always its own single-plate print, so this is always a one-file
      // upload -- the separate/multiplate mode never applies here.
      await uploadPrints([entry.file], { folder_id: targetFolderId || undefined });
      uploaded += 1;
      uploadedEntries.push(entry);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
        aborted = true;
        break;
      }
      console.error("Upload failed for", entry.file.name, err);
      const message = err instanceof Error ? err.message.trim() : "";
      failed.push(message && message !== "Upload failed" ? `${entry.file.name} (${message})` : entry.file.name);
    }
  }
  return { uploaded, failed, uploadedEntries };
}
