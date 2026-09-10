//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

void RunURLListener(void);
*/
import "C"

import "log"

// onOpenURLCallback is set once before RunURLListener blocks the main thread inside Cocoa's run
// loop -- handleGetURLEvent (urlhandler_darwin.m) calls back into it for every thingport://
// link the OS delivers via Apple Events, which is how macOS hands a custom URL scheme to an
// already-registered app bundle (there is no argv equivalent, unlike Windows/Linux).
var onOpenURLCallback func(raw string)

//export goHandleOpenURL
func goHandleOpenURL(cURL *C.char) {
	raw := C.GoString(cURL)
	if onOpenURLCallback != nil {
		onOpenURLCallback(raw)
	} else {
		log.Printf("received url before listener ready: %s", redactURL(raw))
	}
}

// listenForAppleEventURLs blocks forever, running as a Dock-less (LSUIElement) background agent
// that hands every thingport:// open to handle. macOS reuses this running instance for
// subsequent link clicks instead of relaunching, so it just keeps servicing callback until the
// process is terminated.
func listenForAppleEventURLs(handle func(raw string)) {
	onOpenURLCallback = handle
	C.RunURLListener()
}
