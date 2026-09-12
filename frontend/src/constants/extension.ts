// Thingport Grab is a Chrome extension (source in /extension, built by
// .github/workflows/extension-release.yml) that imports MakerWorld/Thingiverse/Printables models
// straight from their own pages -- see extension/README.md. Unlike Bridge's own release (which
// GitHub's "latest release" points at), this one publishes to a fixed tag, "extension-latest",
// rather than claiming that same repo-wide "latest" slot -- see the release workflow's own
// comment for why. That makes this a tag-scoped download path, not the /releases/latest/ alias
// bridge.ts uses, but it's equally stable: the workflow moves this tag to point at its newest
// build on every release rather than ever making a new one.
const EXTENSION_RELEASE_BASE = "https://github.com/TautvydasDerzinskas/Thingport/releases/download/extension-latest";

export const EXTENSION_DOWNLOAD_URL = `${EXTENSION_RELEASE_BASE}/thingport-grab.zip`;
