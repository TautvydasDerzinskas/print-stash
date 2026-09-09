// Builds the URL for a slicer's own registered protocol handler (e.g. bambustudio://), which is
// how "Open in {Slicer}" hands a remote model file to the desktop app. Only meaningful for the
// SLICER_OPTIONS ids that register one -- never call this for "other".
export function slicerLaunchUrl(slicerId: string, fileUrl: string): string {
  return `${slicerId}://open?file=${encodeURIComponent(fileUrl)}`;
}
