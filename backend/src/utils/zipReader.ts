import yauzl from "yauzl";

export type ZipEntryInfo = { name: string; size: number; isDirectory: boolean };

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error("Failed to open zip"));
      resolve(zipfile);
    });
  });
}

/** Lists every entry in a zip archive (files and directories) without extracting contents. */
export async function listZipEntries(filePath: string): Promise<ZipEntryInfo[]> {
  const zipfile = await openZip(filePath);
  return new Promise((resolve, reject) => {
    const entries: ZipEntryInfo[] = [];
    zipfile.on("entry", (entry) => {
      const isDirectory = entry.fileName.endsWith('/');
      entries.push({ name: entry.fileName, size: entry.uncompressedSize, isDirectory });
      zipfile.readEntry();
    });
    zipfile.on("end", () => {
      zipfile.close();
      resolve(entries);
    });
    zipfile.on("error", (err) => {
      zipfile.close();
      reject(err);
    });
    zipfile.readEntry();
  });
}

/**
 * Reads a single named entry into memory, capped at maxBytes (returns null if the
 * entry doesn't exist, is a directory, or exceeds the cap). Used for small metadata
 * files (thumbnails, slicer metadata) inside .3mf/.zip archives, never whole models.
 */
export async function readZipEntry(filePath: string, entryName: string, maxBytes: number): Promise<Buffer | null> {
  const zipfile = await openZip(filePath);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: Buffer | null, err?: Error) => {
      if (settled) return;
      settled = true;
      zipfile.close();
      if (err) reject(err);
      else resolve(value);
    };
    zipfile.on("entry", (entry) => {
      if (entry.fileName !== entryName || entry.fileName.endsWith('/')) {
        zipfile.readEntry();
        return;
      }
      if (entry.uncompressedSize > maxBytes) {
        finish(null);
        return;
      }
      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          finish(null, err ?? undefined);
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            stream.destroy();
            finish(null);
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => finish(Buffer.concat(chunks)));
        stream.on("error", (streamErr) => finish(null, streamErr));
      });
    });
    zipfile.on("end", () => finish(null));
    zipfile.on("error", (err) => finish(null, err));
    zipfile.readEntry();
  });
}

/**
 * Streams every requested entry to an `onEntry` callback in one pass over the archive
 * (used to extract many selected entries, or every entry, without reopening the zip
 * per file). `onEntry` receives the entry metadata and a readable stream; it must
 * consume or destroy the stream before returning so the walk can continue.
 */
export async function walkZipEntries(
  filePath: string,
  shouldExtract: (entry: ZipEntryInfo) => boolean,
  onEntry: (entry: ZipEntryInfo, stream: NodeJS.ReadableStream) => Promise<void>,
): Promise<void> {
  const zipfile = await openZip(filePath);
  await new Promise<void>((resolve, reject) => {
    zipfile.on("entry", (entry) => {
      const isDirectory = entry.fileName.endsWith('/');
      const info: ZipEntryInfo = { name: entry.fileName, size: entry.uncompressedSize, isDirectory };
      if (isDirectory || !shouldExtract(info)) {
        zipfile.readEntry();
        return;
      }
      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          zipfile.readEntry();
          return;
        }
        onEntry(info, stream)
          .catch(() => undefined)
          .finally(() => zipfile.readEntry());
      });
    });
    zipfile.on("end", () => {
      zipfile.close();
      resolve();
    });
    zipfile.on("error", (err) => {
      zipfile.close();
      reject(err);
    });
    zipfile.readEntry();
  });
}
