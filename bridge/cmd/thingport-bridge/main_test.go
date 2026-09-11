package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSanitizeFilename(t *testing.T) {
	tests := map[string]string{
		" model.3mf ":               "model.3mf",
		"../unsafe:model?.stl":      "unsafemodel.stl",
		"\x00\x01":                  "model",
		"folder\\another/file.step": "file.step",
	}

	for input, expected := range tests {
		if actual := sanitizeFilename(input); actual != expected {
			t.Fatalf("sanitizeFilename(%q) = %q, expected %q", input, actual, expected)
		}
	}
}

func TestRedactURLHidesTokenQueryValue(t *testing.T) {
	redacted := redactURL("https://thingport.example/file?id=asset-1&token=secret-value")
	if strings.Contains(redacted, "secret-value") {
		t.Fatalf("redacted URL still contains the token: %s", redacted)
	}
	if !strings.Contains(redacted, "token=REDACTED") {
		t.Fatalf("redacted URL does not contain the marker: %s", redacted)
	}
}

func TestFindWindowsCommandResolvesVersionedCuraInstall(t *testing.T) {
	base := t.TempDir()
	t.Setenv("LOCALAPPDATA", base)
	t.Setenv("ProgramFiles", "")
	t.Setenv("ProgramFiles(x86)", "")

	// Cura's install dir embeds its version, so only a glob (see findWindowsCommand) resolves it.
	// The older version's dir has no exe in it, to confirm an empty match is skipped rather than
	// returned as a false positive.
	older := filepath.Join(base, "UltiMaker Cura 5.7")
	newer := filepath.Join(base, "UltiMaker Cura 5.8")
	if err := os.MkdirAll(older, 0755); err != nil {
		t.Fatalf("mkdir older: %v", err)
	}
	if err := os.MkdirAll(newer, 0755); err != nil {
		t.Fatalf("mkdir newer: %v", err)
	}
	exePath := filepath.Join(newer, "UltiMaker-Cura.exe")
	if err := os.WriteFile(exePath, nil, 0644); err != nil {
		t.Fatalf("write exe: %v", err)
	}

	if got := findWindowsCommand("cura", windowsCandidates()); got != exePath {
		t.Fatalf("findWindowsCommand(\"cura\", ...) = %q, expected %q", got, exePath)
	}
}

func TestHandleProtocolRejectsUntrustedShapesBeforeDownload(t *testing.T) {
	tests := []string{
		"https://thingport.example/file",
		"thingport://delete?url=https://thingport.example/file",
		"thingport://open",
		"thingport://open?url=file:///tmp/model.stl",
	}

	for _, raw := range tests {
		if err := handleProtocol(raw, Config{}); err == nil {
			t.Fatalf("handleProtocol(%q) unexpectedly succeeded", raw)
		}
	}
}
