import fs from "node:fs";
import type { Folder, Plate, Print, PrintFile } from "@prisma/client";
import { plateThumbExists, plateThumbPath } from "./services/printService";
import { preparedFilename } from "./services/preparedPrint";

export type PreparedPrintOut = {
  printer?: string | null;
  material?: string | null;
  nozzle_mm?: number | null;
  layer_height_mm?: number | null;
  estimated_seconds?: number | null;
  format?: string | null;
  removable: boolean;
};

export type PlateOut = {
  id: string;
  print_id: string;
  position: number;
  filename: string;
  mime: string;
  size: number;
  url: string;
  thumb_url: string | null;
};

export type PrintFileOut = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
};

export type PrintOut = {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  creator: string | null;
  collection: string | null;
  tags: string[];
  folder_id: string | null;
  storage_path: string | null;
  plates: PlateOut[];
  thumb_url: string | null;
  supporting_file_count: number;
  prepared_print: PreparedPrintOut | null;
  slicer_url: string | null;
  slicer_filename: string | null;
};

export type FolderOut = {
  id: string;
  name: string;
  tags: string[];
  parent_id: string | null;
};

function plateThumbUrl(plateId: string): string | null {
  if (!plateThumbExists(plateId)) return null;
  const mtime = fs.statSync(plateThumbPath(plateId)).mtimeMs;
  return `/plate/${plateId}/thumb.jpg?v=${mtime}`;
}

export function toPlateOut(printId: string, plate: Plate): PlateOut {
  return {
    id: plate.id,
    print_id: printId,
    position: plate.position,
    filename: plate.filename,
    mime: plate.mime,
    size: plate.size,
    url: `/print/${printId}/plate/${plate.id}/file/${encodeURIComponent(plate.filename)}`,
    thumb_url: plateThumbUrl(plate.id),
  };
}

export function toPrintFileOut(printFile: PrintFile): PrintFileOut {
  return {
    id: printFile.id,
    filename: printFile.filename,
    mime: printFile.mime,
    size: printFile.size,
    url: `/print/${printFile.printId}/files/${printFile.id}`,
  };
}

function storageParentDir(plates: Plate[]): string | null {
  if (!plates.length) return null;
  const parts = plates[0].storagePath.split("/");
  parts.pop();
  return parts.join("/") || null;
}

/**
 * Builds the full Print DTO. `plates` must already be sorted by position ascending.
 * `files` is every PrintFile (supporting + prepared) belonging to this print.
 * `preparedFile` is the print's explicit prepared PrintFile row, if any (preparedFileId).
 */
export function toPrintOut(
  print: Print,
  plates: Plate[],
  files: PrintFile[],
  preparedFile: PrintFile | null,
): PrintOut {
  const sortedPlates = plates.toSorted((a, b) => a.position - b.position);
  const plateOuts = sortedPlates.map((p) => toPlateOut(print.id, p));
  const supportingCount = files.filter((f) => f.role === "SUPPORTING").length;

  let prepared: PreparedPrintOut | null = null;
  let slicerUrl: string | null = null;
  let slicerFilename: string | null = null;

  if (preparedFile) {
    const meta = (preparedFile.metadata as Record<string, unknown> | null) || {};
    prepared = {
      printer: (meta.printer as string | null) ?? null,
      material: (meta.material as string | null) ?? null,
      nozzle_mm: (meta.nozzle_mm as number | null) ?? null,
      layer_height_mm: (meta.layer_height_mm as number | null) ?? null,
      estimated_seconds: (meta.estimated_seconds as number | null) ?? null,
      format: (meta.format as string | null) ?? null,
      removable: true,
    };
    slicerUrl = `/print/${print.id}/prepared-print`;
    slicerFilename = preparedFile.filename;
  } else if (print.preparedMetadata) {
    const meta = print.preparedMetadata as Record<string, unknown>;
    prepared = {
      printer: (meta.printer as string | null) ?? null,
      material: (meta.material as string | null) ?? null,
      nozzle_mm: (meta.nozzle_mm as number | null) ?? null,
      layer_height_mm: (meta.layer_height_mm as number | null) ?? null,
      estimated_seconds: (meta.estimated_seconds as number | null) ?? null,
      format: (meta.format as string | null) ?? null,
      removable: false,
    };
    slicerUrl = plateOuts[0]?.url ?? null;
    slicerFilename = preparedFilename(print.name, { format: meta.format as string });
  } else {
    slicerUrl = plateOuts[0]?.url ?? null;
    slicerFilename = sortedPlates[0]?.filename ?? null;
  }

  return {
    id: print.id,
    name: print.name,
    title: print.title,
    notes: print.notes,
    creator: print.creator,
    collection: print.collection,
    tags: print.tags,
    folder_id: print.folderId,
    storage_path: storageParentDir(sortedPlates),
    plates: plateOuts,
    thumb_url: plateOuts[0]?.thumb_url ?? null,
    supporting_file_count: supportingCount,
    prepared_print: prepared,
    slicer_url: slicerUrl,
    slicer_filename: slicerFilename,
  };
}

export function toFolderOut(folder: Folder): FolderOut {
  return {
    id: folder.id,
    name: folder.name,
    tags: folder.tags,
    parent_id: folder.parentId,
  };
}
