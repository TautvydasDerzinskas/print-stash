/** Whether a drag event is carrying file(s) (as opposed to text, a link, etc.). */
export function isFileDrag(e: { dataTransfer?: DataTransfer | null }): boolean {
  const types = Array.from(e.dataTransfer?.types || []);
  return types.includes("Files");
}
