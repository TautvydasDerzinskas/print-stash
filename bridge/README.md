# PrintStash Bridge

This helper registers the custom protocol `print-stash://`, downloads the requested file, and
launches it in the slicer PrintStash asked for. It exists because Bambu Studio's own
`bambustudio://` handler only accepts links from a small allowlist of domains it trusts (Bambu
Lab's own storefronts, mainly) -- a self-hosted PrintStash instance is never on that list, so
"Open in Bambu Studio" silently does nothing without this bridge in between. OrcaSlicer and
PrusaSlicer's protocol handlers accept any HTTP(S) URL directly, so they're launched straight
from the browser and never need it.

Protocol format:
`print-stash://open?url=<download-url>&slicer=<id>&filename=<name>`

The `url` parameter should be a direct HTTP(s) download link. PrintStash already includes the
auth token in that URL.

## Quick install (no shell commands)

Download the latest Bridge binary for your OS from the
[PrintStash releases](https://github.com/TautvydasDerzinskas/print-stash/releases/latest) page
(also linked from the in-app Download page) and run it once. It registers the `print-stash://`
protocol handler and copies itself into a stable location:

- Windows: `%LOCALAPPDATA%\PrintStash\Bridge\print-stash-bridge.exe`
- Linux: `~/.local/bin/print-stash-bridge`
- macOS: `~/Applications/PrintStash Bridge.app`

### Windows / Linux

Double-click the downloaded file (or run it with no arguments from a terminal). If your Linux
file manager blocks execution, mark the file as executable first (`chmod +x`) and run it once.

### macOS

macOS only recognizes a real `.app` bundle as a protocol handler, so install here is an explicit
step rather than a plain double-click:

```bash
chmod +x ~/Downloads/print-stash-bridge-macos
xattr -d com.apple.quarantine ~/Downloads/print-stash-bridge-macos   # downloaded files are quarantined by Gatekeeper
~/Downloads/print-stash-bridge-macos --install
```

This copies itself into `~/Applications/PrintStash Bridge.app` (a background, Dock-less agent)
and registers the `print-stash://` scheme with Launch Services. If macOS still refuses to run it,
open System Settings -> Privacy & Security and allow it there instead of using `xattr`.

If the terminal instead prints `Killed: 9` (or `[1] ... killed`) the moment you run it, that's a
stale, invalidly-signed binary rather than a Gatekeeper block -- re-sign it yourself and retry:
```bash
codesign --force -s - ~/Downloads/print-stash-bridge-macos
```

## Build

You need Go installed (1.21+ recommended). macOS builds also need Xcode's command line tools
(`xcode-select --install`) since the URL-open handling uses Cocoa via cgo, and can only be built
on macOS itself.

Windows (PowerShell):
```powershell
cd bridge
go build -o dist\print-stash-bridge.exe .\cmd\print-stash-bridge
```

Linux (bash):
```bash
cd bridge
go build -o dist/print-stash-bridge ./cmd/print-stash-bridge
```

macOS (bash), universal binary:
```bash
cd bridge
GOARCH=arm64 go build -o dist/print-stash-bridge-arm64 ./cmd/print-stash-bridge
GOARCH=amd64 go build -o dist/print-stash-bridge-amd64 ./cmd/print-stash-bridge
lipo -create -output dist/print-stash-bridge-macos dist/print-stash-bridge-arm64 dist/print-stash-bridge-amd64
codesign --force -s - dist/print-stash-bridge-macos   # lipo invalidates each slice's signature;
                                                        # without this, arm64 Macs SIGKILL it on launch
```

## Install (manual)

Windows (PowerShell):
```powershell
cd bridge\scripts
.\install-windows.ps1 -BridgePath "..\dist\print-stash-bridge.exe"
```

Linux (bash):
```bash
cd bridge/scripts
./install-linux.sh ../dist/print-stash-bridge
```

You can also run the binary directly: `print-stash-bridge --install` (this is required, not just
convenient, on macOS -- see above).

If your shell blocks scripts, set the execution policy for the current user:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Auto-start at login (optional)

Not needed on any OS for correctness -- see "Quick install" above: Windows and Linux launch the
Bridge fresh, URL already attached, from the registered protocol handler on every click, and
macOS launches its app bundle on demand the same way, even after a reboot. There is nothing
sitting idle waiting to be started.

The only thing adding it as a login item buys you is skipping the ~1 second app-launch delay on
the very first click after starting up your Mac (Windows/Linux have no such delay to skip, since
each click is already a fresh, near-instant process start -- there's no persistent process to
pre-warm).

If you still want it, on macOS:

**Easiest** -- System Settings -> General -> Login Items & Extensions -> click **+** and add
`PrintStash Bridge` from `~/Applications`.

**Or, a LaunchAgent** -- save as `~/Library/LaunchAgents/com.printstash.bridge.plist` (replace
`YOUR_USERNAME`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.printstash.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/Applications/PrintStash Bridge.app/Contents/MacOS/print-stash-bridge</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```
then:
```bash
mkdir -p ~/Library/LaunchAgents
# save the file above as ~/Library/LaunchAgents/com.printstash.bridge.plist
launchctl load ~/Library/LaunchAgents/com.printstash.bridge.plist
```

## Config

Create a config file if you want custom slicer paths or arguments:

- Windows: `%APPDATA%\printstash-bridge\config.json`
- Linux: `~/.config/printstash-bridge/config.json`
- macOS: `~/Library/Application Support/printstash-bridge/config.json`

Use `config.example.json` as a template.

Environment override (per slicer): `PRINTSTASH_SLICER_BAMBUSTUDIO=/path/to/BambuStudio`

## Slicer IDs

- bambustudio
- orcaslicer
- prusaslicer
- other (opens with the OS default app)

## Testing

After install, paste this into your browser's address bar (replace the URL):
`print-stash://open?url=https://example.com/model.3mf&slicer=bambustudio&filename=model.3mf`

## Logs

- Windows: `%APPDATA%\printstash-bridge\bridge.log`
- Linux: `~/.config/printstash-bridge/bridge.log`
- macOS: `~/Library/Application Support/printstash-bridge/bridge.log`

## Notes

- The bridge downloads files into the user cache directory unless configured otherwise.
- If a slicer isn't found, the file opens with the OS default app instead.
- On macOS, the installed app keeps running in the background (no Dock icon) so repeat opens
  don't pay the app-launch cost every time -- this mirrors how macOS delivers custom URL schemes
  to already-registered apps via Apple Events rather than a fresh process per open, unlike
  Windows/Linux.
