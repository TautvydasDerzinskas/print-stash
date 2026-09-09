//go:build darwin

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	bundleName    = "PrintStash Bridge.app"
	bundleID      = "com.printstash.bridge"
	bundleExeName = "print-stash-bridge"
	lsregisterBin = "/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"
)

// macOS has no per-invocation registry entry like Windows/Linux -- a custom URL scheme is only
// honored for an actual .app bundle, discovered by LaunchServices from its Info.plist. So install
// here means: copy this binary into a real app bundle under ~/Applications, write the
// CFBundleURLTypes declaring the print-stash scheme, and re-register that bundle.
func installSelf() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve executable: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return "", fmt.Errorf("resolve executable: %w", err)
	}

	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}

	appDir := filepath.Join(home, "Applications", bundleName)
	contentsDir := filepath.Join(appDir, "Contents")
	macosDir := filepath.Join(contentsDir, "MacOS")
	targetExe := filepath.Join(macosDir, bundleExeName)

	if !samePath(exePath, targetExe) {
		if err := copyFile(exePath, targetExe, 0755); err != nil {
			return "", fmt.Errorf("copy binary: %w", err)
		}
	} else if err := os.Chmod(targetExe, 0755); err != nil {
		return "", fmt.Errorf("set permissions: %w", err)
	}

	if err := os.WriteFile(filepath.Join(contentsDir, "Info.plist"), []byte(infoPlist()), 0644); err != nil {
		return "", fmt.Errorf("write Info.plist: %w", err)
	}

	// Tell LaunchServices about the (re)written bundle so `print-stash://` resolves to it right
	// away, without waiting for the periodic system rescan. Best-effort: a launch still works
	// later even if this fails (e.g. lsregister moved in a future macOS release).
	if _, err := os.Stat(lsregisterBin); err == nil {
		_ = exec.Command(lsregisterBin, "-f", appDir).Run()
	}

	return targetExe, nil
}

func infoPlist() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>PrintStash Bridge</string>
	<key>CFBundleDisplayName</key>
	<string>PrintStash Bridge</string>
	<key>CFBundleIdentifier</key>
	<string>` + bundleID + `</string>
	<key>CFBundleVersion</key>
	<string>1.0</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleExecutable</key>
	<string>` + bundleExeName + `</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>10.13</string>
	<key>LSUIElement</key>
	<true/>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>PrintStash Bridge Protocol</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>print-stash</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`
}

// runDefaultLaunch always means "LaunchServices opened the installed app bundle from a
// print-stash:// click" on macOS -- the URL itself arrives later as an Apple Event, never as
// argv, so there's nothing here to distinguish from any other bare launch. This blocks forever
// servicing those events. Installing (or reinstalling, e.g. after an update) is instead always
// explicit here: `print-stash-bridge --install` from Terminal.
func runDefaultLaunch() {
	cfg, cfgDir := loadConfig()
	setupLogging(cfg, cfgDir)
	listenForAppleEventURLs(func(raw string) {
		if err := handleProtocol(raw, cfg); err != nil {
			log.Printf("error: %v", err)
		}
	})
}
