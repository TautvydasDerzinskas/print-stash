#!/usr/bin/env sh
set -e

BIN_SOURCE="${1:-}"
if [ -z "$BIN_SOURCE" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  BIN_SOURCE="$SCRIPT_DIR/../dist/thingport-bridge"
fi

if [ ! -f "$BIN_SOURCE" ]; then
  echo "Binary not found: $BIN_SOURCE"
  exit 1
fi

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"
BIN_TARGET="$INSTALL_DIR/thingport-bridge"
install -m 755 "$BIN_SOURCE" "$BIN_TARGET"

DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
DESKTOP_FILE="$DESKTOP_DIR/thingport-bridge.desktop"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Thingport Bridge
Exec=$BIN_TARGET %u
Type=Application
Terminal=false
MimeType=x-scheme-handler/thingport;
EOF

xdg-mime default thingport-bridge.desktop x-scheme-handler/thingport >/dev/null 2>&1 || true

echo "Installed protocol handler at $BIN_TARGET"
