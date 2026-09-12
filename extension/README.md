# Thingport Grab

A Chrome extension that imports MakerWorld, Thingiverse, and Printables models into your
self-hosted Thingport instance without leaving the provider's site. Visiting a model, collection,
or Thingiverse Likes page shows a floating Thingport icon; clicking it opens a small panel to pick
what to import (and, for a single model, an optional destination collection), then imports it the
same way Thingport's own "+ Add > Import" does.

It talks directly to your Thingport instance's API from the extension's background service worker
-- no separate server, no data sent anywhere else.

## Install (no Chrome Web Store listing)

This isn't published to the Chrome Web Store, so it installs the same way the
[Thingport releases](https://github.com/TautvydasDerzinskas/Thingport/releases) page's other
downloads do -- as a developer-mode "unpacked" extension:

1. Download `thingport-grab.zip` from the in-app Download page (or the
   [`extension-latest` release](https://github.com/TautvydasDerzinskas/Thingport/releases/tag/extension-latest))
   and unzip it somewhere permanent (don't delete the folder afterwards -- Chrome loads the
   extension from it every time it starts).
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.
4. Click the new Thingport icon in your toolbar, enter your instance's URL and your Thingport
   login, and save.

## Setup

The popup asks for your instance URL (e.g. `https://thingport.example.com`) and your Thingport
email/password once. Saving it requests permission to reach that one origin and validates the
login before storing anything. After that, the toolbar icon turns from the dark/inactive icon to
the color/active one, and the floating icon starts appearing on importable pages. Reopen the popup
any time to **Change URL** or check **Disable extension** (unchecked by default) to pause it
without losing the saved setup.

The extension re-authenticates automatically as its session token nears expiry -- there's nothing
to keep re-entering day to day. If your password changes or a session gets revoked server-side, the
next import attempt will silently re-login with the stored credentials, or surface a clear error if
those no longer work.

## What counts as "importable"

- A single model page (MakerWorld, a Thingiverse Thing, a Printables Model) -- hidden automatically
  once you've already imported that exact page.
- A MakerWorld collection, a Thingiverse Collection, or a Thingiverse Likes page -- lets you pick
  which of the listed designs to import in one batch.

Picking a destination collection is only offered for a single-model import; a batch import instead
lands in Thingport's own auto-named collection for that batch (e.g. "Thingiverse Likes"), matching
how the web app's own batch imports already work.

A batch import keeps running on the server even if you close the panel or the tab -- closing it
just stops showing progress, it doesn't cancel anything.

## Build / package

There's no build step -- `extension/` is loaded directly by Chrome. To produce the distributable
zip by hand (CI does this on every push to `main` that touches this folder -- see
`.github/workflows/extension-release.yml`):

```bash
cd extension
zip -r ../thingport-grab.zip . -x '*.DS_Store'
```

## Regenerating the icons

The toolbar icon PNGs (`icons/thingport-icon-{color,dark}-{16,32,48,128}.png`) are rendered once
from `frontend/src/assets/logos/thingport-icon-{color,dark}.svg` and checked in rather than built
on the fly. Regenerate them (e.g. after the source SVGs change) from the repo root:

```bash
node -e "
const sharp = require('./backend/node_modules/sharp');
const fs = require('fs');
const sizes = [16, 32, 48, 128];
const jobs = [
  ['frontend/src/assets/logos/thingport-icon-color.svg', 'extension/icons/thingport-icon-color'],
  ['frontend/src/assets/logos/thingport-icon-dark.svg', 'extension/icons/thingport-icon-dark'],
];
(async () => {
  for (const [src, outBase] of jobs) {
    const svg = fs.readFileSync(src);
    for (const size of sizes) {
      await sharp(svg, { density: 384 }).resize(size, size).png().toFile(\`\${outBase}-\${size}.png\`);
    }
  }
})();
"
```
