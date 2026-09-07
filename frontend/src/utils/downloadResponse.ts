/** Extracts a filename from a fetch Response's Content-Disposition header, if present. */
export function filenameFromDisposition(res: Response, fallback: string): string {
  const dispo = res.headers.get("content-disposition") || "";
  const match = dispo.match(/filename="?([^";]+)"?/i);
  return (match && match[1]) || fallback;
}

/** Triggers a browser "Save As" for a fetch Response's body via a synthetic anchor click. */
export async function saveResponseToDisk(res: Response, fallback: string): Promise<void> {
  const filename = filenameFromDisposition(res, fallback);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
